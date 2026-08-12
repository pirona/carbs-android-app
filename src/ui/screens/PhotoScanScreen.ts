// SPDX-License-Identifier: GPL-3.0-or-later
// Photo-based food logging — the "Foodvisor" entry point (plan §Phase 6/7.4-7.5).
// Flow: capture -> Mistral vision (n8n /food-vision) -> per-component match cascade
// (fast-path against saved composite habits, else CIQUAL auto-match, else OFF on demand,
// else Mistral's own rough estimate) -> editable confirm rows -> explicit "Confirmer &
// logger" tap. The photo (base64) is held only in a local closure var during the capture
// action and is never assigned anywhere else — nothing persists it, on-device or server-side
// (see n8n_food_vision_workflow.json's saveDataSuccessExecution:"none").
import type { LogEntry } from '../../core/types';
import type { HabitsRepo } from '../../storage/repos/habitsRepo';
import type { FoodLogRepo } from '../../storage/repos/foodLogRepo';
import { capturePlatePhoto } from '../../integrations/camera';
import { analyzePlatePhoto } from '../../integrations/n8nFoodVision';
import { lookupOFF, scanBarcode } from '../../integrations/barcodeScan';
import { searchOFF } from '../../integrations/openFoodFacts';
import { componentToRow, habitToRows, tryRecognizeHabit, type RowSource, type ScanRow } from '../../app/photoScanMatch';
import { computeFoodMacros } from '../../core/calc/food';
import { escapeHtml, fmt1 } from '../util';

export interface PhotoScanScreenRepos {
  habits: HabitsRepo;
  foodLog: FoodLogRepo;
}

const SOURCE_LABEL: Record<RowSource, string> = {
  habit: '🔁 Habitude reconnue',
  ciqual: '🇫🇷 CIQUAL',
  off: '📦 OpenFoodFacts',
  ai: '🤖 Estimation IA',
  manual: '✎ Manuel',
};

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

export function renderPhotoScanScreen(container: HTMLElement, repos: PhotoScanScreenRepos): void {
  let state: 'idle' | 'analyzing' | 'reviewing' | 'error' = 'idle';
  let rows: ScanRow[] = [];
  let overallNote = '';
  let recognizedHabitLabel: string | null = null;
  let errorMsg: string | null = null;
  let saveAsHabit = false;
  // Which flow to relaunch when "Réessayer" is tapped from the error state — the two
  // scan modes need different retry actions, so a single hardcoded button can't know.
  let lastMode: 'photo' | 'barcode' | null = null;

  function rowCard(row: ScanRow, index: number): string {
    const m = computeFoodMacros(row.per100, row.portion_g);
    return `
      <div class="card scan-row">
        <div class="list-header">
          <span class="empty-hint" style="padding:0">${SOURCE_LABEL[row.source]}${row.confidence ? ` · confiance ${escapeHtml(row.confidence)}` : ''}</span>
          <button class="icon-btn" data-action="remove-row" data-index="${index}">✕</button>
        </div>
        <label class="field-label">Nom</label>
        <input type="text" class="row-label" data-index="${index}" value="${escapeHtml(row.label)}">
        <div class="field-row">
          <div><label class="field-label">Portion (g)</label><input type="number" class="row-portion" data-index="${index}" value="${row.portion_g}" min="1"></div>
          <div><label class="field-label">kcal / 100g</label><input type="number" class="row-kcal" data-index="${index}" value="${row.per100.kcal}" step="0.1"></div>
        </div>
        <div class="field-row">
          <div><label class="field-label">Protéines / 100g</label><input type="number" class="row-prot" data-index="${index}" value="${row.per100.protein_g}" step="0.1"></div>
          <div><label class="field-label">Lipides / 100g</label><input type="number" class="row-fat" data-index="${index}" value="${row.per100.fat_g}" step="0.1"></div>
        </div>
        <label class="field-label">Glucides / 100g</label>
        <input type="number" class="row-carb" data-index="${index}" value="${row.per100.carb_g}" step="0.1">
        <div class="empty-hint" style="padding:4px 0 0">${m.kcal} kcal · P${fmt1(m.protein_g)} L${fmt1(m.fat_g)} G${fmt1(m.carb_g)}</div>

        ${
          row.ciqualCandidates.length > 1
            ? `
          <div class="empty-hint" style="padding-top:8px">Autres correspondances CIQUAL :</div>
          ${row.ciqualCandidates
            .slice(0, 4)
            .map(
              (c) => `
            <div class="search-result" data-action="pick-ciqual" data-index="${index}" data-ciqual-id="${escapeHtml(c.id)}">
              <div class="search-result-name">${escapeHtml(c.label)}</div>
              <div class="search-result-sub">${Math.round(c.per100.kcal)} kcal/100g</div>
            </div>`,
            )
            .join('')}`
            : ''
        }

        <button class="btn" style="margin-top:8px" data-action="search-off" data-index="${index}">🔍 Chercher sur OpenFoodFacts</button>
        ${row.offSearching ? '<div class="empty-hint">Recherche en cours…</div>' : ''}
        ${row.offError ? `<div class="empty-hint error-text">${escapeHtml(row.offError)}</div>` : ''}
        ${row.offResults
          .map(
            (p, i) => `
          <div class="search-result" data-action="pick-off" data-index="${index}" data-off-index="${i}">
            <div class="search-result-name">${escapeHtml(p.name)}</div>
            <div class="search-result-sub">${p.brand ? escapeHtml(p.brand) + ' · ' : ''}${Math.round(p.per100.kcal)} kcal/100g</div>
          </div>`,
          )
          .join('')}
      </div>`;
  }

  function reviewingHtml(): string {
    const totals = rows.reduce(
      (acc, r) => {
        const m = computeFoodMacros(r.per100, r.portion_g);
        return { kcal: acc.kcal + m.kcal, protein_g: acc.protein_g + m.protein_g, fat_g: acc.fat_g + m.fat_g, carb_g: acc.carb_g + m.carb_g };
      },
      { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
    );
    return `
      <p class="hint">Vérifie et ajuste chaque composant avant de logger — rien n'est enregistré tant que tu n'as pas confirmé.</p>
      ${recognizedHabitLabel ? `<div class="ai-banner"><div class="ai-banner-title">🔁 Plat reconnu</div><div>Pré-rempli depuis l'habitude « ${escapeHtml(recognizedHabitLabel)} » — toujours modifiable.</div></div>` : ''}
      ${overallNote ? `<div class="ai-banner"><div class="ai-banner-title">🤖 Remarque de l'IA</div><div>${escapeHtml(overallNote)}</div></div>` : ''}
      ${rows.map(rowCard).join('')}
      ${
        rows.length === 0
          ? `<div class="card"><div class="error-text" style="font-weight:700;margin-bottom:4px">⚠️ Rien d'identifiable sur cette photo</div><div class="empty-hint" style="padding:0">L'IA n'a reconnu aucun aliment — rien n'a été enregistré. Annule et reprends la photo (assiette bien cadrée, bonne lumière), ou saisis à la main via "Aujourd'hui".</div></div>`
          : ''
      }
      <div class="card today-totals">
        <div>
          <div class="today-totals-kcal">${fmt(totals.kcal)} <span class="empty-hint" style="padding:0">kcal (total)</span></div>
          <div class="empty-hint" style="padding:0">P${fmt1(totals.protein_g)} · L${fmt1(totals.fat_g)} · G${fmt1(totals.carb_g)}</div>
        </div>
      </div>
      <div class="card">
        <label class="checkbox-label">
          <input type="checkbox" id="scan-save-habit" ${saveAsHabit ? 'checked' : ''}>
          💾 Sauver ce plat comme habitude (reconnaissance rapide la prochaine fois)
        </label>
        <div class="form-actions">
          <button class="btn btn-cancel" data-action="scan-cancel">Annuler</button>
          <button class="btn btn-save" data-action="scan-confirm" ${rows.length === 0 ? 'disabled' : ''}>✅ Confirmer &amp; logger</button>
        </div>
      </div>`;
  }

  function render() {
    let body = '';
    if (state === 'idle') {
      body = `
        <p class="hint">Prends une photo de ton assiette — l'IA identifie les composants, tu ajustes et confirmes avant tout enregistrement.</p>
        <button class="btn-cta" data-action="scan-start">📷 Scanner une assiette</button>
        <p class="hint">Ou scanne directement le code-barres d'un produit emballé.</p>
        <button class="btn-cta" data-action="scan-barcode-start">🔖 Scanner un code-barres</button>`;
    } else if (state === 'analyzing') {
      body = `<div class="card empty-hint">Analyse de la photo en cours…</div>`;
    } else if (state === 'error') {
      body = `
        <div class="card"><div class="empty-hint error-text">${escapeHtml(errorMsg ?? 'Erreur inconnue')}</div></div>
        <button class="btn-cta" data-action="scan-reset">Réessayer</button>`;
    } else {
      body = reviewingHtml();
    }
    container.innerHTML = `<h1 style="margin-bottom:10px">📷 Scan photo</h1>${body}`;
  }

  async function startScan() {
    const capture = await capturePlatePhoto();
    if (capture.status === 'cancelled') return; // user backed out — stay idle, no error shown
    lastMode = 'photo';
    if (capture.status === 'permission-denied') {
      errorMsg = 'Permission appareil photo refusée — autorise l’accès dans les paramètres Android (Applis > Carbs > Autorisations) pour scanner une assiette.';
      state = 'error';
      render();
      return;
    }
    if (capture.status === 'error') {
      errorMsg = `Impossible d’ouvrir l’appareil photo (${capture.message}).`;
      state = 'error';
      render();
      return;
    }
    const photo = capture.photo;
    state = 'analyzing';
    render();
    try {
      const habits = await repos.habits.load();
      const result = await analyzePlatePhoto(photo.base64, photo.mimeType);
      overallNote = result.overall_note;
      const recognized = tryRecognizeHabit(result.components, habits);
      if (recognized) {
        recognizedHabitLabel = recognized.label;
        rows = habitToRows(recognized);
      } else {
        recognizedHabitLabel = null;
        rows = await Promise.all(result.components.map(componentToRow));
      }
      state = 'reviewing';
    } catch (e) {
      errorMsg = `Analyse impossible (${(e as Error).message}) — vérifie la connexion et réessaie.`;
      state = 'error';
    }
    // photo.base64 falls out of scope here — never stored anywhere else.
    render();
  }

  async function startBarcodeScan() {
    const scan = await scanBarcode();
    if (scan.status === 'cancelled') return; // user backed out of the scanner — stay idle, no error shown
    lastMode = 'barcode';
    if (scan.status === 'error') {
      errorMsg = `Scan impossible (${scan.message}) — réessaie.`;
      state = 'error';
      render();
      return;
    }
    state = 'analyzing';
    render();
    const result = await lookupOFF(scan.code);
    if (result.status === 'not-found') {
      errorMsg = 'Produit introuvable pour ce code-barres — réessaie, ou utilise le scan photo/la saisie manuelle.';
      state = 'error';
    } else if (result.status === 'error') {
      errorMsg = result.message;
      state = 'error';
    } else {
      overallNote = '';
      recognizedHabitLabel = null;
      rows = [
        {
          key: uid(),
          label: result.product.name,
          portion_g: 100,
          per100: result.product.per100,
          source: 'off',
          confidence: null,
          ciqualCandidates: [],
          offResults: [],
          offSearching: false,
          offError: null,
        },
      ];
      state = 'reviewing';
    }
    render();
  }

  function readRowFieldsFromDom() {
    rows.forEach((row, i) => {
      const label = container.querySelector<HTMLInputElement>(`.row-label[data-index="${i}"]`);
      const portion = container.querySelector<HTMLInputElement>(`.row-portion[data-index="${i}"]`);
      const kcal = container.querySelector<HTMLInputElement>(`.row-kcal[data-index="${i}"]`);
      const prot = container.querySelector<HTMLInputElement>(`.row-prot[data-index="${i}"]`);
      const fat = container.querySelector<HTMLInputElement>(`.row-fat[data-index="${i}"]`);
      const carb = container.querySelector<HTMLInputElement>(`.row-carb[data-index="${i}"]`);
      if (label) row.label = label.value.trim() || row.label;
      if (portion) row.portion_g = Math.max(1, parseFloat(portion.value) || row.portion_g);
      if (kcal) row.per100.kcal = parseFloat(kcal.value) || 0;
      if (prot) row.per100.protein_g = parseFloat(prot.value) || 0;
      if (fat) row.per100.fat_g = parseFloat(fat.value) || 0;
      if (carb) row.per100.carb_g = parseFloat(carb.value) || 0;
    });
  }

  container.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target.id === 'scan-save-habit') {
      saveAsHabit = (target as HTMLInputElement).checked;
    }
  });

  container.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    if (action === 'scan-start') {
      await startScan();
      return;
    }
    if (action === 'scan-barcode-start') {
      await startBarcodeScan();
      return;
    }
    if (action === 'scan-reset') {
      errorMsg = null;
      // Relaunch whichever flow errored — a bare reset to idle would cost the user
      // an extra tap to pick the mode again for what's usually a network hiccup.
      if (lastMode === 'barcode') {
        await startBarcodeScan();
      } else if (lastMode === 'photo') {
        await startScan();
      } else {
        state = 'idle';
        render();
      }
      return;
    }
    if (action === 'scan-cancel') {
      state = 'idle';
      rows = [];
      overallNote = '';
      recognizedHabitLabel = null;
      saveAsHabit = false;
      render();
      return;
    }
    if (action === 'remove-row') {
      readRowFieldsFromDom();
      rows.splice(Number(target.dataset.index), 1);
      render();
      return;
    }
    if (action === 'pick-ciqual') {
      readRowFieldsFromDom();
      const idx = Number(target.dataset.index);
      const row = rows[idx];
      const chosen = row.ciqualCandidates.find((c) => c.id === target.dataset.ciqualId);
      if (chosen) {
        row.label = chosen.label;
        row.per100 = chosen.per100;
        row.source = 'ciqual';
      }
      render();
      return;
    }
    if (action === 'search-off') {
      readRowFieldsFromDom();
      const idx = Number(target.dataset.index);
      const row = rows[idx];
      row.offSearching = true;
      row.offError = null;
      render();
      try {
        row.offResults = await searchOFF(row.label);
      } catch {
        row.offError = 'Recherche impossible — vérifier la connexion.';
        row.offResults = [];
      }
      row.offSearching = false;
      render();
      return;
    }
    if (action === 'pick-off') {
      readRowFieldsFromDom();
      const idx = Number(target.dataset.index);
      const row = rows[idx];
      const p = row.offResults[Number(target.dataset.offIndex)];
      if (p) {
        row.label = p.name;
        row.per100 = p.per100;
        row.source = 'off';
        row.offResults = [];
      }
      render();
      return;
    }
    if (action === 'scan-confirm') {
      readRowFieldsFromDom();
      const photoGroupId = uid();
      const now = new Date();
      const log = await repos.foodLog.loadToday(now);
      const newEntries: LogEntry[] = rows.map((row) => {
        const m = computeFoodMacros(row.per100, row.portion_g);
        return {
          entry_id: uid(),
          habit_id: null,
          label: row.label,
          portion_g: row.portion_g,
          per100: row.per100,
          kcal: m.kcal,
          protein_g: m.protein_g,
          fat_g: m.fat_g,
          carb_g: m.carb_g,
          source: row.source === 'habit' ? 'manual' : (row.source as LogEntry['source']),
          updated_at: Date.now(),
          photo_group_id: photoGroupId,
        };
      });
      log.entries.push(...newEntries);
      await repos.foodLog.saveToday(log);

      if (saveAsHabit && rows.length > 0) {
        const totalGrams = rows.reduce((s, r) => s + r.portion_g, 0);
        const totals = rows.reduce(
          (acc, r) => {
            const m = computeFoodMacros(r.per100, r.portion_g);
            return { kcal: acc.kcal + m.kcal, protein_g: acc.protein_g + m.protein_g, fat_g: acc.fat_g + m.fat_g, carb_g: acc.carb_g + m.carb_g };
          },
          { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
        );
        const scale = totalGrams > 0 ? 100 / totalGrams : 0;
        const habits = await repos.habits.load();
        habits.push({
          id: uid(),
          label: recognizedHabitLabel ?? overallNote.slice(0, 40) ?? 'Plat scanné',
          off_code: null,
          source: 'ai',
          portion_g: totalGrams,
          per100: {
            kcal: totals.kcal * scale,
            protein_g: totals.protein_g * scale,
            fat_g: totals.fat_g * scale,
            carb_g: totals.carb_g * scale,
          },
          day_type_tag: null,
          meal_slot: null,
          updated_at: Date.now(),
          components: rows.map((r) => ({ label: r.label, per100: r.per100, grams: r.portion_g })),
        });
        await repos.habits.save(habits);
      }

      state = 'idle';
      rows = [];
      overallNote = '';
      recognizedHabitLabel = null;
      saveAsHabit = false;
      render();
      return;
    }
  });

  render();
}
