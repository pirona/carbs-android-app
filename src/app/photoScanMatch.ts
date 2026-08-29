// SPDX-License-Identifier: GPL-3.0-or-later
// Pure matching logic for the photo-scan feature (plan §Phase 6/7.3, 7.5) — separated
// from PhotoScanScreen's DOM/event code so the cascade and fast-path recognition can be
// unit-tested without mocking a UI.
import type { Habit, Per100 } from '../core/types';
import type { PlateComponent } from '../integrations/aiFoodVision';
import type { ReceiptItem } from '../integrations/aiReceiptScan';
import { searchOFF, type OffProduct } from '../integrations/openFoodFacts';
import type { CiqualEntry } from '../ciqual/matcher';

export type RowSource = 'habit' | 'ciqual' | 'off' | 'ai' | 'manual';

export interface ScanRow {
  key: string;
  label: string;
  portion_g: number;
  per100: Per100;
  source: RowSource;
  confidence: PlateComponent['confidence'] | null;
  ciqualCandidates: CiqualEntry[];
  offResults: OffProduct[];
  offSearching: boolean;
  offError: string | null;
}

let counter = 0;
function uid(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

const RAW_WORD = /\bcrue?s?\b/i;

// A photographed plate is virtually always cooked/prepared food, but CIQUAL's fuzzy
// match often ranks a raw ("cru") entry first — e.g. "Riz blanc, cru" (352 kcal/100g)
// over "Riz blanc, cuit" (145 kcal/100g), a ~2.4x overestimate. Deprioritize raw
// entries unless the detected label itself says raw. Found via the Phase 6 real-photo
// reliability check (rice matched to the raw entry) — a real matching bug, not a
// vision-model limitation, so worth fixing here rather than leaving for manual correction.
function pickBestCiqualCandidate(candidates: CiqualEntry[], queryLabel: string): CiqualEntry[] {
  if (candidates.length < 2 || RAW_WORD.test(queryLabel)) return candidates;
  const bestNonRawIndex = candidates.findIndex((c) => !RAW_WORD.test(c.label));
  if (bestNonRawIndex <= 0) return candidates;
  const reordered = [...candidates];
  const [preferred] = reordered.splice(bestNonRawIndex, 1);
  reordered.unshift(preferred);
  return reordered;
}

// CIQUAL auto-match (offline, instant) is tried first; falls back to Mistral's own
// rough per-component estimate when nothing scores well enough. OFF is deliberately
// NOT auto-searched here — it's a per-row, user-triggered action in the UI (avoids
// firing N parallel network calls for every detected component).
//
// Dynamically imports the CIQUAL matcher (ciqual.json is ~300KB) so it's only pulled
// into a separate chunk when a photo is actually scanned, not on every app cold start.
export async function componentToRow(c: PlateComponent): Promise<ScanRow> {
  const { matchCiqual } = await import('../ciqual/matcher');
  const candidates = pickBestCiqualCandidate(matchCiqual(c.label, 5), c.label);
  const best = candidates[0];
  if (best) {
    return {
      key: uid(),
      label: best.label,
      portion_g: Math.max(1, Math.round(c.estimated_grams)),
      per100: best.per100,
      source: 'ciqual',
      confidence: c.confidence,
      ciqualCandidates: candidates,
      offResults: [],
      offSearching: false,
      offError: null,
    };
  }
  return {
    key: uid(),
    label: c.label,
    portion_g: Math.max(1, Math.round(c.estimated_grams)),
    per100: { kcal: c.kcal_100g || 0, protein_g: c.protein_100g || 0, fat_g: c.fat_100g || 0, carb_g: c.carb_100g || 0 },
    source: 'ai',
    confidence: c.confidence,
    ciqualCandidates: candidates,
    offResults: [],
    offSearching: false,
    offError: null,
  };
}

// Receipt items get the OPPOSITE cascade order from componentToRow, deliberately — do not
// "fix" one to match the other. Receipt lines are brand/shorthand-first ("YOP FRAISE 4X85G",
// "PATES BARILLA"), a much better fit for OpenFoodFacts (a branded/packaged product database)
// than for CIQUAL (a generic-food composition table tuned for natural descriptions like "riz
// basmati"). OFF is tried FIRST here (auto-fired per item, unlike the plate flow's manual-only
// OFF search — for receipts OFF is the primary expected match source, not a rare fallback).
// CIQUAL is a plain, UNBIASED fallback: pickBestCiqualCandidate's raw/cooked reordering is
// plate-specific reasoning ("a photographed plate is virtually always cooked food") that's
// actively wrong for groceries — raw rice, raw chicken are legitimately what's bought. If
// neither source hits, the row is left at zero macros for manual entry — Mistral is never
// asked to guess nutrition for a receipt line (see aiReceiptScan.ts), so there's no AI
// guess to fall back to the way componentToRow falls back to Mistral's own estimate.
export async function receiptItemToRow(item: ReceiptItem): Promise<ScanRow> {
  let offResults: OffProduct[] = [];
  try {
    offResults = await searchOFF(item.label);
  } catch {
    offResults = [];
  }
  const offBest = offResults[0];
  if (offBest) {
    return {
      key: uid(),
      label: offBest.name,
      portion_g: offBest.servingGrams ?? 100,
      per100: offBest.per100,
      source: 'off',
      confidence: item.confidence,
      ciqualCandidates: [],
      offResults,
      offSearching: false,
      offError: null,
    };
  }

  const { matchCiqual } = await import('../ciqual/matcher');
  const ciqualCandidates = matchCiqual(item.label, 5);
  const ciqualBest = ciqualCandidates[0];
  if (ciqualBest) {
    return {
      key: uid(),
      label: ciqualBest.label,
      portion_g: 100,
      per100: ciqualBest.per100,
      source: 'ciqual',
      confidence: item.confidence,
      ciqualCandidates,
      offResults: [],
      offSearching: false,
      offError: null,
    };
  }

  return {
    key: uid(),
    label: item.label,
    portion_g: 100,
    per100: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
    source: 'manual',
    confidence: item.confidence,
    ciqualCandidates: [],
    offResults: [],
    offSearching: false,
    offError: null,
  };
}

// Fast-path (plan §7.5): if a majority of the detected labels loosely match components
// belonging to the SAME previously-saved composite habit, treat the plate as recognized.
export function tryRecognizeHabit(components: PlateComponent[], habits: Habit[]): Habit | null {
  const composite = habits.filter((h) => h.components && h.components.length > 0);
  if (composite.length === 0 || components.length === 0) return null;

  const scores = new Map<string, number>();
  for (const c of components) {
    for (const h of composite) {
      const hit = h.components!.some((hc) => {
        const a = hc.label.toLowerCase();
        const b = c.label.toLowerCase();
        return a.includes(b) || b.includes(a);
      });
      if (hit) scores.set(h.id, (scores.get(h.id) ?? 0) + 1);
    }
  }
  if (scores.size === 0) return null;
  const [bestId, bestCount] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bestCount < Math.ceil(components.length / 2)) return null;
  return composite.find((h) => h.id === bestId) ?? null;
}

export function habitToRows(h: Habit): ScanRow[] {
  return (h.components ?? []).map((c) => ({
    key: uid(),
    label: c.label,
    portion_g: c.grams,
    per100: c.per100,
    source: 'habit',
    confidence: null,
    ciqualCandidates: [],
    offResults: [],
    offSearching: false,
    offError: null,
  }));
}
