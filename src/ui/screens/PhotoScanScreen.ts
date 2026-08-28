// SPDX-License-Identifier: GPL-3.0-or-later
// Photo-based food logging — the "Foodvisor" entry point (plan §Phase 6/7.4-7.5), plus a
// receipt-scan mode for adding several items from one ticket de caisse photo at once.
// Plate flow: capture -> Mistral vision -> per-component match cascade (fast-path against
// saved composite habits, else CIQUAL auto-match, else OFF on demand, else Mistral's own
// rough estimate) -> editable confirm rows -> logged to today's journal, optionally also
// saved as one composite habit. Receipt flow: capture -> Mistral vision (no macros asked of
// the model — see mistralReceiptScan.ts) -> per-item match cascade (OFF first, then CIQUAL,
// then manual — see photoScanMatch.ts's receiptItemToRow) -> editable confirm rows -> either
// logged to today's journal (one shared meal) or added as N independent habits, chosen per
// scan. In every flow, the photo (base64) is held only in a local closure var during the
// capture action and is never assigned anywhere else — nothing persists it.
import type { LogEntry, MealSlot } from '../../core/types';
import type { HabitsRepo } from '../../storage/repos/habitsRepo';
import type { FoodLogRepo } from '../../storage/repos/foodLogRepo';
import { captureFoodPhoto } from '../../integrations/camera';
import { analyzePlatePhoto } from '../../integrations/mistralFoodVision';
import { analyzeReceiptPhoto } from '../../integrations/mistralReceiptScan';
import { MissingMistralKeyError } from '../../integrations/mistralClient';
import { lookupOFF, scanBarcode } from '../../integrations/barcodeScan';
import { searchOFF } from '../../integrations/openFoodFacts';
import { componentToRow, habitToRows, receiptItemToRow, tryRecognizeHabit, type RowSource, type ScanRow } from '../../app/photoScanMatch';
import { computeFoodMacros, kcalFromMacros } from '../../core/calc/food';
import { guessMealSlot } from '../../core/calc/date';
import { renderPer100FieldsHtml, renderMealSlotSelectHtml } from '../forms/foodEntryForm';
import { escapeHtml, fmt1 } from '../util';
import { fmt } from '../format';
import { t, type StringKey } from '../i18n/strings';

export interface PhotoScanScreenRepos {
  habits: HabitsRepo;
  foodLog: FoodLogRepo;
}

const SOURCE_LABEL_KEY: Record<RowSource, StringKey> = {
  habit: 'photoScan.source.habit',
  ciqual: 'photoScan.source.ciqual',
  off: 'photoScan.source.off',
  ai: 'photoScan.source.ai',
  manual: 'photoScan.source.manual',
};

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}


export function renderPhotoScanScreen(container: HTMLElement, repos: PhotoScanScreenRepos): void {
  let state: 'idle' | 'analyzing' | 'reviewing' | 'error' = 'idle';
  let rows: ScanRow[] = [];
  let overallNote = '';
  let recognizedHabitLabel: string | null = null;
  let errorMsg: string | null = null;
  let saveAsHabit = false;
  // One meal for the whole scanned group — a single photo is one plate/meal, not a mix.
  // Re-guessed fresh at the start of each scan (see startScan/startBarcodeScan), then held in
  // state (unlike the per100 fields, which are read straight from the DOM) since this screen's
  // render() is called repeatedly while reviewing (toggle/remove row, pick a candidate...) and
  // would otherwise silently reset the user's choice back to the guessed default each time.
  let mealSlot: MealSlot = guessMealSlot(new Date());
  // Which flow to relaunch when "Réessayer" is tapped from the error state, AND which
  // review-UI shape to render (the receipt-only save-target toggle below) — a single value
  // serving both purposes, since it's already set unconditionally right after every
  // successful capture and read reliably throughout 'reviewing'/'error'.
  let lastMode: 'photo' | 'barcode' | 'receipt' | null = null;
  // Per-scan choice, receipt mode only — a shopping receipt's items aren't "eaten now" the
  // way a plate/barcode scan's are, so unlike those two, a receipt scan can target the
  // Habitudes library instead of today's journal. Reset to the default at the start of every
  // startReceiptScan() and on scan-cancel, same lifecycle as mealSlot.
  let receiptSaveTarget: 'journal' | 'habits' = 'journal';
  // Collapsed by default on entering 'reviewing' (a multi-item plate would otherwise bury
  // "Confirmer & logger" under N fully-expanded edit cards) — except when there's exactly
  // one row (barcode scans always produce one), where the extra tap would be pure friction.
  let expandedRows = new Set<number>();
  // Per-row touched-kcal guard, same purpose as Day/Habits' single-form version (see
  // foodEntryForm.ts) — indices, not row identities, so remove-row must reindex both sets.
  let rowKcalTouched = new Set<number>();

  // Collapsed by default (see expandedRows' own comment for the multi-item rationale) —
  // except a 'manual' row (no OFF/CIQUAL match, macros at zero) is left expanded regardless
  // of N, since it needs the user's input right away. Found via a real restaurant-receipt
  // scan where every one of 7 menu items (no OFF/CIQUAL match possible for menu-item names)
  // fell to 'manual' — all 7 collapsed by the old blanket rule meant tapping 7 chevrons open
  // before typing a single value.
  function defaultExpandedRows(list: ScanRow[]): Set<number> {
    if (list.length === 1) return new Set([0]);
    const needsInput = list.reduce<number[]>((acc, r, i) => {
      if (r.source === 'manual') acc.push(i);
      return acc;
    }, []);
    return new Set(needsInput);
  }

  function reindexAfterRemoval(removedIndex: number) {
    const shift = (set: Set<number>) => {
      const next = new Set<number>();
      for (const i of set) {
        if (i < removedIndex) next.add(i);
        else if (i > removedIndex) next.add(i - 1);
      }
      return next;
    };
    expandedRows = shift(expandedRows);
    rowKcalTouched = shift(rowKcalTouched);
  }

  function rowCard(row: ScanRow, index: number): string {
    const m = computeFoodMacros(row.per100, row.portion_g);
    if (!expandedRows.has(index)) {
      return `
        <div class="habit-row" data-action="toggle-row" data-index="${index}">
          <div class="habit-info">
            <div class="habit-label">${escapeHtml(row.label)}</div>
            <div class="habit-sub">${m.kcal} kcal · ${t(SOURCE_LABEL_KEY[row.source])}</div>
          </div>
          <div class="habit-actions">
            <button class="btn btn-icon" data-action="remove-row" data-index="${index}">✕</button>
            <span class="row-chevron">▸</span>
          </div>
        </div>`;
    }
    return `
      <div class="card scan-row">
        <div class="list-header" data-action="toggle-row" data-index="${index}" style="cursor:pointer">
          <span class="empty-hint" style="padding:0">${t(SOURCE_LABEL_KEY[row.source])}${row.confidence ? ` · ${t('photoScan.confidence', { confidence: escapeHtml(row.confidence) })}` : ''}</span>
          <span style="display:flex;align-items:center;gap:6px">
            <button class="icon-btn" data-action="remove-row" data-index="${index}">✕</button>
            <span class="row-chevron expanded">▸</span>
          </span>
        </div>
        ${renderPer100FieldsHtml(row, { prefix: 'row', mode: 'class', index }, { previewWithPortion: false })}

        ${
          row.ciqualCandidates.length > 1
            ? `
          <div class="empty-hint" style="padding-top:8px">${t('photoScan.otherCiqualMatches')}</div>
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

        <button class="btn" style="margin-top:8px" data-action="search-off" data-index="${index}">${t('photoScan.searchOff')}</button>
        ${row.offSearching ? `<div class="empty-hint">${t('day.log.searching')}</div>` : ''}
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
      <p class="hint">${t('photoScan.reviewHint')}</p>
      ${recognizedHabitLabel ? `<div class="ai-banner"><div class="ai-banner-title">${t('photoScan.recognizedTitle')}</div><div>${t('photoScan.recognizedBody', { label: escapeHtml(recognizedHabitLabel) })}</div></div>` : ''}
      ${overallNote ? `<div class="ai-banner"><div class="ai-banner-title">${t('photoScan.aiNoteTitle')}</div><div>${escapeHtml(overallNote)}</div></div>` : ''}
      ${rows.map(rowCard).join('')}
      ${
        rows.length === 0
          ? `<div class="card"><div class="error-text" style="font-weight:700;margin-bottom:4px">${t('photoScan.nothingFoundTitle')}</div><div class="empty-hint" style="padding:0">${t('photoScan.nothingFoundBody')}</div></div>`
          : ''
      }
      <div class="card today-totals">
        <div>
          <div class="today-totals-kcal"><span id="scan-total-kcal">${fmt(totals.kcal)}</span> <span class="empty-hint" style="padding:0">${t('photoScan.totalKcal')}</span></div>
          <div class="empty-hint" id="scan-total-macros" style="padding:0">P${fmt1(totals.protein_g)} · L${fmt1(totals.fat_g)} · G${fmt1(totals.carb_g)}</div>
        </div>
      </div>
      ${
        lastMode === 'receipt'
          ? `
      <div class="card">
        <label class="field-label">${t('photoScan.saveAsLabel')}</label>
        <div class="sort-toggle">
          <button class="sort-btn ${receiptSaveTarget === 'journal' ? 'active' : ''}" data-action="receipt-target" data-mode="journal">${t('photoScan.saveToJournal')}</button>
          <button class="sort-btn ${receiptSaveTarget === 'habits' ? 'active' : ''}" data-action="receipt-target" data-mode="habits">${t('photoScan.saveToHabits')}</button>
        </div>
      </div>`
          : ''
      }
      <div class="card">
        ${lastMode === 'receipt' && receiptSaveTarget === 'habits' ? '' : renderMealSlotSelectHtml('scan-mealslot', mealSlot)}
        ${
          lastMode === 'receipt'
            ? ''
            : `<label class="checkbox-label">
          <input type="checkbox" id="scan-save-habit" ${saveAsHabit ? 'checked' : ''}>
          ${t('photoScan.saveAsHabit')}
        </label>`
        }
        <div class="form-actions">
          <button class="btn btn-cancel" data-action="scan-cancel">${t('common.cancel')}</button>
          <button class="btn btn-save" data-action="scan-confirm" ${rows.length === 0 ? 'disabled' : ''}>${t('photoScan.confirm')}</button>
        </div>
      </div>`;
  }

  function render() {
    let body = '';
    if (state === 'idle') {
      body = `
        <p class="hint">${t('photoScan.idle.plateHint')}</p>
        <button class="btn-cta" data-action="scan-start">${t('photoScan.idle.scanPlate')}</button>
        <p class="hint">${t('photoScan.idle.barcodeHint')}</p>
        <button class="btn-cta" data-action="scan-barcode-start">${t('photoScan.idle.scanBarcode')}</button>
        <p class="hint">${t('photoScan.idle.receiptHint')}</p>
        <button class="btn-cta" data-action="scan-receipt-start">${t('photoScan.idle.scanReceipt')}</button>`;
    } else if (state === 'analyzing') {
      body = `<div class="card empty-hint">${t('photoScan.analyzing')}</div>`;
    } else if (state === 'error') {
      body = `
        <div class="card"><div class="empty-hint error-text">${escapeHtml(errorMsg ?? t('photoScan.unknownError'))}</div></div>
        <button class="btn-cta" data-action="scan-reset">${t('photoScan.retry')}</button>`;
    } else {
      body = reviewingHtml();
    }
    container.innerHTML = body;
  }

  async function startScan() {
    const capture = await captureFoodPhoto();
    if (capture.status === 'cancelled') return; // user backed out — stay idle, no error shown
    lastMode = 'photo';
    if (capture.status === 'permission-denied') {
      errorMsg = t('photoScan.err.cameraPermissionPlate');
      state = 'error';
      render();
      return;
    }
    if (capture.status === 'error') {
      errorMsg = t('photoScan.err.cameraOpenFailed', { message: capture.message });
      state = 'error';
      render();
      return;
    }
    const photo = capture.photo;
    mealSlot = guessMealSlot(new Date());
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
      expandedRows = defaultExpandedRows(rows);
      rowKcalTouched = new Set();
    } catch (e) {
      errorMsg = e instanceof MissingMistralKeyError ? e.message : t('photoScan.err.analysisFailed', { message: (e as Error).message });
      state = 'error';
    }
    // photo.base64 falls out of scope here — never stored anywhere else.
    render();
  }

  async function startReceiptScan() {
    const capture = await captureFoodPhoto();
    if (capture.status === 'cancelled') return; // user backed out — stay idle, no error shown
    lastMode = 'receipt';
    if (capture.status === 'permission-denied') {
      errorMsg = t('photoScan.err.cameraPermissionReceipt');
      state = 'error';
      render();
      return;
    }
    if (capture.status === 'error') {
      errorMsg = t('photoScan.err.cameraOpenFailed', { message: capture.message });
      state = 'error';
      render();
      return;
    }
    const photo = capture.photo;
    mealSlot = guessMealSlot(new Date());
    receiptSaveTarget = 'journal';
    state = 'analyzing';
    render();
    try {
      const result = await analyzeReceiptPhoto(photo.base64, photo.mimeType);
      overallNote = result.merchant_note;
      recognizedHabitLabel = null; // no habit-recognition fast-path for receipts — not a composite dish
      rows = await Promise.all(result.items.map(receiptItemToRow));
      state = 'reviewing';
      expandedRows = defaultExpandedRows(rows);
      rowKcalTouched = new Set();
    } catch (e) {
      errorMsg = e instanceof MissingMistralKeyError ? e.message : t('photoScan.err.analysisFailed', { message: (e as Error).message });
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
      errorMsg = t('photoScan.err.barcodeScanFailed', { message: scan.message });
      state = 'error';
      render();
      return;
    }
    mealSlot = guessMealSlot(new Date());
    state = 'analyzing';
    render();
    const result = await lookupOFF(scan.code);
    if (result.status === 'not-found') {
      errorMsg = t('photoScan.err.barcodeNotFound');
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
      expandedRows = new Set([0]); // barcode scans always produce exactly one row
      rowKcalTouched = new Set();
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
    } else if (target.id === 'scan-mealslot') {
      mealSlot = (target as HTMLSelectElement).value as MealSlot;
    }
  });

  const ROW_FIELD_CLASSES = ['row-portion', 'row-kcal', 'row-prot', 'row-fat', 'row-carb'];

  // Recomputes the per-row "X kcal · P.. L.. G.." readout plus the overall total, live on
  // every keystroke — same live-recompute principle as DayScreen/HabitsScreen's confirm
  // forms, applied here since a scanned plate's rows carry the exact same portion + /100g
  // reference fields.
  function updateScanTotals() {
    rows.forEach((row, i) => {
      const el = container.querySelector<HTMLElement>(`.row-total-preview[data-index="${i}"]`);
      if (!el) return;
      const m = computeFoodMacros(row.per100, row.portion_g);
      el.textContent = `${m.kcal} kcal · P${fmt1(m.protein_g)} L${fmt1(m.fat_g)} G${fmt1(m.carb_g)}`;
    });
    const totals = rows.reduce(
      (acc, r) => {
        const m = computeFoodMacros(r.per100, r.portion_g);
        return { kcal: acc.kcal + m.kcal, protein_g: acc.protein_g + m.protein_g, fat_g: acc.fat_g + m.fat_g, carb_g: acc.carb_g + m.carb_g };
      },
      { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
    );
    const kcalEl = container.querySelector<HTMLElement>('#scan-total-kcal');
    const macroEl = container.querySelector<HTMLElement>('#scan-total-macros');
    if (kcalEl) kcalEl.textContent = fmt(totals.kcal);
    if (macroEl) macroEl.textContent = `P${fmt1(totals.protein_g)} · L${fmt1(totals.fat_g)} · G${fmt1(totals.carb_g)}`;
  }

  // Per-row touched-kcal guard — same purpose as Day/Habits' single-form version (see
  // handleFoodEntryKcalGuardInput in foodEntryForm.ts), just keyed by row index since N rows
  // can be open at once here.
  container.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.index === undefined || !ROW_FIELD_CLASSES.some((c) => target.classList.contains(c))) return;
    const index = Number(target.dataset.index);
    if (target.classList.contains('row-kcal')) {
      rowKcalTouched.add(index);
    } else if (!rowKcalTouched.has(index) && (target.classList.contains('row-prot') || target.classList.contains('row-fat') || target.classList.contains('row-carb'))) {
      const prot = parseFloat(container.querySelector<HTMLInputElement>(`.row-prot[data-index="${index}"]`)!.value) || 0;
      const fat = parseFloat(container.querySelector<HTMLInputElement>(`.row-fat[data-index="${index}"]`)!.value) || 0;
      const carb = parseFloat(container.querySelector<HTMLInputElement>(`.row-carb[data-index="${index}"]`)!.value) || 0;
      const kcalInput = container.querySelector<HTMLInputElement>(`.row-kcal[data-index="${index}"]`);
      if (kcalInput) kcalInput.value = String(kcalFromMacros(prot, fat, carb));
    }
    readRowFieldsFromDom();
    updateScanTotals();
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
    if (action === 'scan-receipt-start') {
      await startReceiptScan();
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
      } else if (lastMode === 'receipt') {
        await startReceiptScan();
      } else {
        state = 'idle';
        render();
      }
      return;
    }
    if (action === 'receipt-target') {
      receiptSaveTarget = target.dataset.mode as 'journal' | 'habits';
      render();
      return;
    }
    if (action === 'scan-cancel') {
      state = 'idle';
      rows = [];
      overallNote = '';
      recognizedHabitLabel = null;
      saveAsHabit = false;
      receiptSaveTarget = 'journal';
      expandedRows = new Set();
      rowKcalTouched = new Set();
      render();
      return;
    }
    if (action === 'toggle-row') {
      const idx = Number(target.dataset.index);
      if (expandedRows.has(idx)) expandedRows.delete(idx);
      else expandedRows.add(idx);
      render();
      return;
    }
    if (action === 'remove-row') {
      readRowFieldsFromDom();
      const idx = Number(target.dataset.index);
      rows.splice(idx, 1);
      reindexAfterRemoval(idx);
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
        rowKcalTouched.delete(idx);
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
        row.offError = t('foodEntry.searchError');
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
        rowKcalTouched.delete(idx);
      }
      render();
      return;
    }
    if (action === 'scan-confirm') {
      readRowFieldsFromDom();

      if (lastMode === 'receipt' && receiptSaveTarget === 'habits') {
        // Each receipt line becomes its own independent, future-loggable habit — not one
        // composite dish like the plate flow's "save as habit" checkbox below. A shopping
        // receipt is a list of unrelated products, not a recipe. meal_slot stays null:
        // "whenever eaten," not a forced default (see the confirmed design decision).
        const habits = await repos.habits.load();
        for (const row of rows) {
          habits.push({
            id: uid(),
            label: row.label,
            off_code: null,
            source: row.source === 'habit' ? 'manual' : (row.source as LogEntry['source']),
            portion_g: row.portion_g,
            per100: row.per100,
            day_type_tag: null,
            meal_slot: null,
            updated_at: Date.now(),
          });
        }
        await repos.habits.save(habits);
      } else {
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
            meal_slot: mealSlot,
            photo_group_id: photoGroupId,
          };
        });
        log.entries.push(...newEntries);
        await repos.foodLog.saveToday(log);

        if (saveAsHabit && rows.length > 0 && lastMode !== 'receipt') {
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
            label: recognizedHabitLabel ?? overallNote.slice(0, 40) ?? t('photoScan.scannedDishFallbackLabel'),
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
      }

      state = 'idle';
      rows = [];
      overallNote = '';
      recognizedHabitLabel = null;
      saveAsHabit = false;
      receiptSaveTarget = 'journal';
      expandedRows = new Set();
      rowKcalTouched = new Set();
      render();
      return;
    }
  });

  render();
}
