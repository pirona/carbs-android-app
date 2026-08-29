// SPDX-License-Identifier: GPL-3.0-or-later
// Shared "add/edit food entry" template fragments. The confirm-step numeric fields (name,
// portion, kcal/protein/fat/carb per 100g, live total preview) were byte-for-byte duplicated
// across DayScreen, HabitsScreen and PhotoScanScreen — this module is the one shared home,
// addressable both by id (Day/Habits, one form at a time) and by class+index (PhotoScan,
// N rows at once).
//
// The search-step markup (OFF search / barcode / AI-interpret entry points) stays local to
// each screen — it diverges enough in practice (Day tracks an extra "scanning" sub-state and
// disables its barcode button mid-scan, Habits doesn't) that forcing it through one shared
// template would need more parameters than it would save, and risks silently losing a
// screen-specific behavior. Same reasoning for the OFF-search-result -> prefill construction
// (Day honors OFF's serving_size for the default portion, Habits doesn't) — left untouched
// in each screen so this extraction doesn't quietly change either one's behavior.
import type { Habit, MealSlot, Per100 } from '../../core/types';
import { MEAL_SLOT_ICON, MEAL_SLOT_ORDER } from '../../core/types';
import { computeFoodMacros, kcalFromMacros } from '../../core/calc/food';
import { escapeHtml, fmt1 } from '../util';
import { t } from '../i18n/strings';
import { searchOFF, type OffProduct } from '../../integrations/openFoodFacts';
import { scanBarcode, lookupOFF } from '../../integrations/barcodeScan';
import { parseFoodText } from '../../integrations/aiFoodParse';
import { MissingAiKeyError, MissingAiBaseUrlError, loadAiModels } from '../../integrations/aiClient';

export interface FoodEntryPrefill {
  label: string;
  off_code: string | null;
  source: Habit['source'];
  portion_g: number;
  per100: Per100;
  ai_source_text?: string;
  ai_confidence?: string | null;
  ai_note?: string | null;
}

type Per100FieldKey = 'label' | 'portion' | 'kcal' | 'prot' | 'fat' | 'carb' | 'total-preview';

export interface Per100FieldsAddressing {
  prefix: string;
  mode: 'id' | 'class';
  // Required when mode === 'class' (PhotoScanScreen's per-row fields).
  index?: number;
}

function fieldAttr(addr: Per100FieldsAddressing, field: Per100FieldKey): string {
  return addr.mode === 'id' ? `id="${addr.prefix}-${field}"` : `class="${addr.prefix}-${field}" data-index="${addr.index}"`;
}

// The total-preview line already has a literal class="empty-hint" in the template below —
// fieldAttr() alone would emit a second, colliding `class=` attribute in class-addressing
// mode (HTML keeps only the first `class=` it parses, so the row-total-preview class would
// silently never apply and updateScanTotals()'s querySelector would never match anything).
function totalPreviewAttrs(addr: Per100FieldsAddressing): string {
  return addr.mode === 'id' ? `class="empty-hint" id="${addr.prefix}-total-preview"` : `class="empty-hint ${addr.prefix}-total-preview" data-index="${addr.index}"`;
}

// `previewWithPortion: false` matches PhotoScanScreen's compact per-row readout (portion is
// already its own visible field right above); the default "Pour X g : ..." phrasing matches
// Day/Habits' single-form confirm step.
export function renderPer100FieldsHtml(
  prefill: { label: string; portion_g: number; per100: Per100 },
  addr: Per100FieldsAddressing,
  opts: { portionExtraHtml?: string; previewWithPortion?: boolean } = {},
): string {
  const m = computeFoodMacros(prefill.per100, prefill.portion_g);
  const previewVars = { portion: prefill.portion_g, kcal: m.kcal, prot: fmt1(m.protein_g), fat: fmt1(m.fat_g), carb: fmt1(m.carb_g) };
  const previewText =
    opts.previewWithPortion === false
      ? t('foodEntry.previewCompact', previewVars)
      : t('foodEntry.previewWithPortion', previewVars);
  return `
    <label class="field-label">${t('foodEntry.name')}</label>
    <input type="text" ${fieldAttr(addr, 'label')} value="${escapeHtml(prefill.label)}">
    <div class="field-row">
      <div>
        <label class="field-label">${t('foodEntry.portion')}</label>
        <input type="number" ${fieldAttr(addr, 'portion')} value="${prefill.portion_g}" min="1">
        ${opts.portionExtraHtml ?? ''}
      </div>
      <div><label class="field-label">${t('foodEntry.kcalPer100')}</label><input type="number" ${fieldAttr(addr, 'kcal')} value="${prefill.per100.kcal}" step="0.1"></div>
    </div>
    <div class="field-row">
      <div><label class="field-label">${t('foodEntry.proteinPer100')}</label><input type="number" ${fieldAttr(addr, 'prot')} value="${prefill.per100.protein_g}" step="0.1"></div>
      <div><label class="field-label">${t('foodEntry.fatPer100')}</label><input type="number" ${fieldAttr(addr, 'fat')} value="${prefill.per100.fat_g}" step="0.1"></div>
    </div>
    <label class="field-label">${t('foodEntry.carbPer100')}</label>
    <input type="number" ${fieldAttr(addr, 'carb')} value="${prefill.per100.carb_g}" step="0.1">
    <div ${totalPreviewAttrs(addr)} style="padding:4px 0 0">${previewText}</div>`;
}

// Shared "which meal" <select> — required (Day's actual log entries, PhotoScan's scanned
// group) or optional with a "Non classé" first option (Habits' default tag on the habit
// itself, not on an eaten instance). Read the chosen value straight from the DOM at save
// time via `id`, same pattern as the per100 fields above — no extra state needed.
export function renderMealSlotSelectHtml(id: string, selected: MealSlot | null, opts: { allowUnset?: boolean } = {}): string {
  const unsetOption = opts.allowUnset ? `<option value="" ${!selected ? 'selected' : ''}>${t('foodEntry.mealSlotUnset')}</option>` : '';
  const options = MEAL_SLOT_ORDER.map((slot) => `<option value="${slot}" ${selected === slot ? 'selected' : ''}>${MEAL_SLOT_ICON[slot]} ${t(`mealSlot.${slot}`)}</option>`).join('');
  return `<label class="field-label">${t('mealSlot.label')}</label><select id="${id}">${unsetOption}${options}</select>`;
}

export interface FoodEntryConfirmActions {
  cancel: string;
  save: string;
}

// Wraps renderPer100FieldsHtml with the AI banner + form-actions — the id-addressed,
// single-form case (Day/Habits). PhotoScanScreen calls renderPer100FieldsHtml directly since
// its rows have no search step / AI banner / save-cancel pair of their own.
export function renderFoodConfirmStepHtml(
  prefill: FoodEntryPrefill,
  opts: {
    idPrefix: string;
    actions: FoodEntryConfirmActions;
    portionExtraHtml?: string;
    afterFieldsHtml?: string;
  },
): string {
  return `
    <div class="form-block">
      ${
        prefill.source === 'ai'
          ? `
        <div class="ai-banner">
          <div class="ai-banner-title">${t('foodEntry.aiBannerTitle')}</div>
          <div>${t('foodEntry.aiEntry', { text: escapeHtml(prefill.ai_source_text) })}</div>
          ${prefill.ai_confidence ? `<div>${t('foodEntry.aiConfidence', { confidence: escapeHtml(prefill.ai_confidence) })}</div>` : ''}
          ${prefill.ai_note ? `<div>${t('foodEntry.aiNote', { note: escapeHtml(prefill.ai_note) })}</div>` : ''}
        </div>`
          : ''
      }
      ${renderPer100FieldsHtml(prefill, { prefix: opts.idPrefix, mode: 'id' }, { portionExtraHtml: opts.portionExtraHtml })}
      ${opts.afterFieldsHtml ?? ''}
      <div class="form-actions">
        <button class="btn btn-cancel" data-action="${opts.actions.cancel}">${t('common.cancel')}</button>
        <button class="btn btn-save" data-action="${opts.actions.save}">${t('common.save')}</button>
      </div>
    </div>`;
}

// Recomputes the "Pour X g : ..." readout from the confirm form's current field values — call
// on every keystroke so the actual portion total stays truthful without a full render() wiping
// focus mid-typing. Id-addressed forms only (Day/Habits) — PhotoScanScreen has its own
// multi-row equivalent (updateScanTotals) since it also needs to update a grand total.
export function updateFoodEntryTotalPreview(container: HTMLElement, idPrefix: string): void {
  const portionInput = container.querySelector<HTMLInputElement>(`#${idPrefix}-portion`);
  const kcalInput = container.querySelector<HTMLInputElement>(`#${idPrefix}-kcal`);
  const protInput = container.querySelector<HTMLInputElement>(`#${idPrefix}-prot`);
  const fatInput = container.querySelector<HTMLInputElement>(`#${idPrefix}-fat`);
  const carbInput = container.querySelector<HTMLInputElement>(`#${idPrefix}-carb`);
  const preview = container.querySelector<HTMLElement>(`#${idPrefix}-total-preview`);
  if (!portionInput || !kcalInput || !protInput || !fatInput || !carbInput || !preview) return;
  const portion = parseFloat(portionInput.value) || 0;
  const per100: Per100 = {
    kcal: parseFloat(kcalInput.value) || 0,
    protein_g: parseFloat(protInput.value) || 0,
    fat_g: parseFloat(fatInput.value) || 0,
    carb_g: parseFloat(carbInput.value) || 0,
  };
  const m = computeFoodMacros(per100, portion);
  preview.textContent = t('foodEntry.previewWithPortion', { portion, kcal: m.kcal, prot: fmt1(m.protein_g), fat: fmt1(m.fat_g), carb: fmt1(m.carb_g) });
}

// Shared "input" handler logic for id-addressed confirm-step forms (Day/Habits) — the
// touched-kcal guard (once the user edits kcal directly, macro edits stop overwriting it)
// plus the live kcal-from-macros fill and preview recompute. Call from each screen's own
// 'input' listener, already gated by that screen's own step/open-form check.
export function handleFoodEntryKcalGuardInput(container: HTMLElement, idPrefix: string, targetId: string, kcalTouchedRef: { value: boolean }): void {
  if (targetId === `${idPrefix}-kcal`) {
    kcalTouchedRef.value = true;
  } else if (!kcalTouchedRef.value && [`${idPrefix}-prot`, `${idPrefix}-fat`, `${idPrefix}-carb`].includes(targetId)) {
    const prot = parseFloat(container.querySelector<HTMLInputElement>(`#${idPrefix}-prot`)!.value) || 0;
    const fat = parseFloat(container.querySelector<HTMLInputElement>(`#${idPrefix}-fat`)!.value) || 0;
    const carb = parseFloat(container.querySelector<HTMLInputElement>(`#${idPrefix}-carb`)!.value) || 0;
    const kcalInput = container.querySelector<HTMLInputElement>(`#${idPrefix}-kcal`);
    if (kcalInput) kcalInput.value = String(kcalFromMacros(prot, fat, carb));
  }
  if ([`${idPrefix}-portion`, `${idPrefix}-kcal`, `${idPrefix}-prot`, `${idPrefix}-fat`, `${idPrefix}-carb`].includes(targetId)) {
    updateFoodEntryTotalPreview(container, idPrefix);
  }
}

// ── Thin async wrappers — dedupe the repeated try/catch/error-string patterns in
// DayScreen/HabitsScreen's search/scan/AI handlers. Return raw data, not a constructed
// FoodEntryPrefill, wherever the two screens build the prefill differently (see file header —
// Day honors OFF's serving size for barcode scans, Habits doesn't) so this extraction can't
// silently change either screen's behavior. ──────────────────────────────────────────────
export type SearchOffResult = { ok: true; results: OffProduct[] } | { ok: false; error: string };

export async function searchOffProducts(query: string): Promise<SearchOffResult> {
  try {
    return { ok: true, results: await searchOFF(query) };
  } catch {
    return { ok: false, error: t('foodEntry.searchError') };
  }
}

export type BarcodeLookupResult = { status: 'cancelled' } | { status: 'error'; message: string } | { status: 'not-found' } | { status: 'ok'; product: OffProduct };

export async function scanBarcodeAndLookup(): Promise<BarcodeLookupResult> {
  const scan = await scanBarcode();
  if (scan.status === 'cancelled') return { status: 'cancelled' };
  if (scan.status === 'error') return { status: 'error', message: t('foodEntry.scanError', { message: scan.message }) };
  const result = await lookupOFF(scan.code);
  if (result.status === 'not-found') return { status: 'not-found' };
  if (result.status === 'error') return { status: 'error', message: result.message };
  return { status: 'ok', product: result.product };
}

export type AiInterpretResult = { ok: true; prefill: FoodEntryPrefill } | { ok: false; error: string };

// The AI-interpret path IS identical between Day and Habits (unlike OFF search/barcode) —
// safe to return a fully-built FoodEntryPrefill here.
export async function interpretFoodTextWithAI(text: string): Promise<AiInterpretResult> {
  try {
    const models = await loadAiModels();
    const result = await parseFoodText(text, models.textModel);
    return {
      ok: true,
      prefill: {
        label: result.label,
        off_code: null,
        source: 'ai',
        portion_g: result.portion_g,
        per100: result.per100,
        ai_source_text: text,
        ai_confidence: result.confidence,
        ai_note: result.note,
      },
    };
  } catch (e) {
    if (e instanceof MissingAiKeyError || e instanceof MissingAiBaseUrlError) return { ok: false, error: e.message };
    return { ok: false, error: t('foodEntry.aiInterpretError', { message: (e as Error).message }) };
  }
}
