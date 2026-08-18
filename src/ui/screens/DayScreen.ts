// SPDX-License-Identifier: GPL-3.0-or-later
// Today's view — day-type badge, macro targets, weight/sport inputs, and the "Aujourd'hui"
// direct food log. Weight-goal bar and plaisir-day declaration live in ProgressScreen now
// (see plan §redesign — kept them off this screen's primary above-the-fold content).
// Health Connect (Phase 4) pre-fills steps/activeCalories when granted — never a hard
// dependency, manual sport_kcal entry always stays the primary/overridable signal.
import type { DayType, Habit, LogEntry, Profile } from '../../core/types';
import type { DayTrackingRepos, DaySnapshot } from '../../app/dayTracking';
import { refreshDaySnapshot } from '../../app/dayTracking';
import type { HabitsRepo, HabitSortMode } from '../../storage/repos/habitsRepo';
import type { ProfileRepo } from '../../storage/repos/profileRepo';
import type { HealthConnectAdapter, HealthConnectSignals } from '../../integrations/healthConnect/HealthConnectAdapter';
import { computeFoodMacros } from '../../core/calc/food';
import { type OffProduct } from '../../integrations/openFoodFacts';
import {
  type FoodEntryPrefill,
  renderFoodConfirmStepHtml,
  renderMealSlotSelectHtml,
  updateFoodEntryTotalPreview,
  handleFoodEntryKcalGuardInput,
  searchOffProducts,
  scanBarcodeAndLookup,
  interpretFoodTextWithAI,
} from '../forms/foodEntryForm';
import { guessMealSlot } from '../../core/calc/date';
import type { MealSlot } from '../../core/types';
import { escapeHtml, fmt1, attachLongPress } from '../util';
import { iconAdd, iconRestaurant } from '../icons';

export interface DayScreenRepos extends DayTrackingRepos {
  habits: HabitsRepo;
  profile: ProfileRepo;
}

interface LogFormState {
  step: 'search' | 'confirm';
  query: string;
  results: OffProduct[];
  loading: boolean;
  scanning: boolean;
  error: string | null;
  saveAsHabit: boolean;
  aiQuery: string;
  aiLoading: boolean;
  aiError: string | null;
  prefill?: FoodEntryPrefill;
}

const DAYTYPE_LABEL: Record<DayType, string> = { high: 'HIGH CARB', medium: 'MEDIUM CARB', low: 'LOW CARB', plaisir: 'JOUR PLAISIR' };
const DAYTYPE_COLOR: Record<DayType, string> = { high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)', plaisir: 'var(--plaisir)' };

function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

export function renderDayScreen(container: HTMLElement, repos: DayScreenRepos, health: HealthConnectAdapter): void {
  let profile: Profile;
  let snapshot: DaySnapshot | null = null;
  let habits: Habit[] = [];
  let habitSortMode: HabitSortMode = 'alpha';
  let logEntries: LogEntry[] = [];
  let logForm: LogFormState | null = null;
  // Same "touched" guard as HabitsScreen.ts's #f-kcal — once the user edits #log-f-kcal
  // directly, macro edits stop overwriting it. Ref object so it can be passed by reference
  // into the shared handleFoodEntryKcalGuardInput helper (see foodEntryForm.ts).
  const logKcalTouched = { value: false };
  let hcAvailable = false;
  let hcGranted = false;
  let hcSignals: HealthConnectSignals = { steps: null, activeCaloriesKcal: null };

  const now = () => new Date();

  async function refreshHealthConnect() {
    hcAvailable = await health.isAvailable();
    hcGranted = hcAvailable && (await health.hasStepsPermission());
    hcSignals = hcGranted ? await health.readToday() : { steps: null, activeCaloriesKcal: null };
  }

  async function refresh() {
    const sportKcal = await repos.sport.loadSportKcal(now());
    const weightKg = snapshot?.current.weight_kg ?? profile.weight_default_kg;
    snapshot = await refreshDaySnapshot(
      repos,
      profile,
      { steps: hcSignals.steps, sportKcal, activeCaloriesKcal: hcSignals.activeCaloriesKcal, exerciseMin: null },
      weightKg,
      now(),
    );
    const log = await repos.foodLog.loadToday(now());
    logEntries = log.entries;
  }

  function macroBars(m: NonNullable<DaySnapshot['macros']>): string {
    const total = m.protein_kcal + (m.fat_kcal ?? 0) + (m.carb_kcal ?? 0);
    if (!total || m.fat_g === null || m.carb_g === null) return '';
    const pProt = Math.round((m.protein_kcal / total) * 100);
    const pFat = Math.round(((m.fat_kcal ?? 0) / total) * 100);
    const pCarb = Math.round(((m.carb_kcal ?? 0) / total) * 100);
    return `
      <div class="macros-grid">
        <div class="macro-item"><div class="macro-value" style="color:var(--protein)">${m.protein_g}g</div><div class="macro-label">Protéines</div>
          <div class="macro-bar-wrap"><div class="macro-bar" style="width:${pProt}%;background:var(--protein)"></div></div></div>
        <div class="macro-item"><div class="macro-value" style="color:var(--fat)">${m.fat_g}g</div><div class="macro-label">Lipides</div>
          <div class="macro-bar-wrap"><div class="macro-bar" style="width:${pFat}%;background:var(--fat)"></div></div></div>
        <div class="macro-item"><div class="macro-value" style="color:var(--carb)">${m.carb_g}g</div><div class="macro-label">Glucides</div>
          <div class="macro-bar-wrap"><div class="macro-bar" style="width:${pCarb}%;background:var(--carb)"></div></div></div>
      </div>`;
  }

  function healthConnectStatusHtml(): string {
    if (!hcAvailable) return '';
    if (!hcGranted) {
      return `
        <div class="form-block">
          <button class="btn btn-cta" data-action="connect-health">📱 Connecter Health Connect (pas quotidiens)</button>
        </div>`;
    }
    const stepsLabel = hcSignals.steps !== null ? `${fmt(hcSignals.steps)} pas` : 'pas indisponibles aujourd\'hui';
    return `
      <div class="form-block empty-hint" style="padding-bottom:0">📱 Health Connect : ${stepsLabel}</div>`;
  }

  function habitChips(): string {
    const sorted = [...habits].sort((a, b) =>
      habitSortMode === 'recent' ? (b.updated_at || 0) - (a.updated_at || 0) : a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }),
    );
    if (sorted.length === 0) return '';
    return `
      <div class="list-header" style="margin-bottom:6px">
        <div class="empty-hint" style="padding:0">Habitudes — tap pour logger</div>
        <div class="sort-toggle">
          <button class="sort-btn ${habitSortMode === 'alpha' ? 'active' : ''}" data-action="habit-sort" data-mode="alpha">A→Z</button>
          <button class="sort-btn ${habitSortMode === 'recent' ? 'active' : ''}" data-action="habit-sort" data-mode="recent">Récent</button>
        </div>
      </div>
      <div class="chip-row">
        ${sorted.map((h) => `<button class="chip" data-action="log-habit" data-id="${h.id}">${escapeHtml(h.label)}</button>`).join('')}
      </div>`;
  }

  function logFormHtml(): string {
    const f = logForm!;
    if (f.step === 'search') {
      return `
        <div class="form-block">
          <label class="field-label">Rechercher sur OpenFoodFacts</label>
          <input type="text" id="log-off-query" placeholder="ex: yaourt nature" value="${escapeHtml(f.query)}">
          <div class="form-actions" style="margin-top:0">
            <button class="btn btn-add" style="margin-top:0" data-action="log-search">Rechercher</button>
            <button class="btn btn-add" style="margin-top:0;background:var(--low)" data-action="log-scan-barcode" ${f.scanning ? 'disabled' : ''}>📷 Code-barres</button>
          </div>
          ${f.loading ? '<div class="empty-hint">Recherche en cours…</div>' : ''}
          ${f.scanning ? '<div class="empty-hint">Scan en cours…</div>' : ''}
          ${f.error ? `<div class="empty-hint error-text">${escapeHtml(f.error)}</div>` : ''}
          ${f.results
            .map(
              (p, i) => `
            <div class="search-result" data-action="log-select" data-index="${i}">
              <div class="search-result-name">${escapeHtml(p.name)}</div>
              <div class="search-result-sub">${p.brand ? escapeHtml(p.brand) + ' · ' : ''}${Math.round(p.per100.kcal)} kcal/100g</div>
            </div>`,
            )
            .join('')}
          ${f.results.length === 0 && !f.loading && f.query ? '<div class="empty-hint">Aucun résultat.</div>' : ''}

          <div class="form-block">
            <label class="field-label">🤖 Décrire en langage naturel (si absent d'OpenFoodFacts)</label>
            <input type="text" id="log-ai-query" placeholder="ex: 2 mugs de café, 350g café moulu au total" value="${escapeHtml(f.aiQuery)}">
            <button class="btn btn-add" style="background:var(--low)" data-action="log-ai-interpret">Interpréter avec l'IA</button>
            ${f.aiLoading ? '<div class="empty-hint">Interprétation en cours…</div>' : ''}
            ${f.aiError ? `<div class="empty-hint error-text">${escapeHtml(f.aiError)}</div>` : ''}
          </div>

          <div class="form-actions">
            <button class="btn btn-cancel" data-action="log-close">Annuler</button>
            <button class="btn" data-action="log-manual">Saisir à la main →</button>
          </div>
        </div>`;
    }
    return renderFoodConfirmStepHtml(f.prefill!, {
      idPrefix: 'log-f',
      actions: { cancel: 'log-close', save: 'log-save' },
      portionExtraHtml: `
        <div class="form-actions" style="margin:6px 0 8px">
          <button type="button" class="btn" data-action="log-portion-multiply" data-factor="2">×2</button>
          <button type="button" class="btn" data-action="log-portion-multiply" data-factor="3">×3</button>
        </div>`,
      afterFieldsHtml: `
        ${renderMealSlotSelectHtml('log-f-mealslot', guessMealSlot(now()))}
        <label class="checkbox-label">
          <input type="checkbox" id="log-f-save-habit" ${f.saveAsHabit ? 'checked' : ''}>
          💾 Sauver aussi en habitude
        </label>`,
    });
  }

  function todayCard(): string {
    const totals = logEntries.reduce(
      (acc, e) => ({ kcal: acc.kcal + e.kcal, protein_g: acc.protein_g + e.protein_g, fat_g: acc.fat_g + e.fat_g, carb_g: acc.carb_g + e.carb_g }),
      { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
    );
    const target = snapshot!.macros.kcal;
    const diff = target !== null ? Math.round(totals.kcal - target) : null;

    const entriesHtml =
      logEntries.length === 0
        ? '<div class="empty-hint">Rien de loggé aujourd\'hui.</div>'
        : logEntries
            .map(
              (e) => `
        <div class="log-entry-row">
          <div class="log-entry-info">
            <div class="log-entry-label">${escapeHtml(e.label)}</div>
            <div class="log-entry-sub">${e.kcal} kcal · P${fmt1(e.protein_g)} L${fmt1(e.fat_g)} G${fmt1(e.carb_g)}</div>
          </div>
          <input type="number" class="log-entry-portion" value="${e.portion_g}" min="1" data-action="log-portion" data-id="${e.entry_id}">
          <span class="empty-hint" style="padding:0">g</span>
          <button class="icon-btn" data-action="log-delete" data-id="${e.entry_id}">✕</button>
        </div>`,
            )
            .join('');

    return `
      <div class="card">
        <h2 style="display:flex;align-items:center;gap:8px"><span style="color:var(--accent-text);display:inline-flex">${iconRestaurant()}</span> Aujourd'hui</h2>
        ${habitChips()}
        ${
          logForm
            ? logFormHtml()
            : `<button class="btn-cta" style="display:flex;align-items:center;justify-content:center;gap:6px" data-action="log-open">${iconAdd()} Logger un aliment</button>`
        }
        <div class="form-block">
          <div class="empty-hint" style="padding-bottom:4px">Journal du jour</div>
          ${entriesHtml}
        </div>
        <div class="today-totals">
          <div>
            <div class="today-totals-kcal">${fmt(totals.kcal)} <span class="empty-hint" style="padding:0">kcal</span></div>
            <div class="empty-hint" style="padding:0">P${fmt1(totals.protein_g)} · L${fmt1(totals.fat_g)} · G${fmt1(totals.carb_g)}</div>
          </div>
          ${
            target !== null
              ? `<div style="text-align:right">
                  <div class="empty-hint" style="padding:0">vs cible ${fmt(target)} kcal</div>
                  <div style="font-weight:700;color:${diff! > 0 ? 'var(--plaisir)' : 'var(--high)'}">${diff! > 0 ? '+' : ''}${fmt(diff!)} kcal</div>
                </div>`
              : ''
          }
        </div>
      </div>`;
  }

  function render() {
    const snap = snapshot!;
    const dt = snap.dayType.type;
    const weight = snap.current.weight_kg ?? profile.weight_default_kg;

    container.innerHTML = `
      <div class="day-header">
        <span class="day-badge" style="background:${DAYTYPE_COLOR[dt]}">${DAYTYPE_LABEL[dt]}</span>
      </div>

      <div class="card">
        <label class="field-label">Poids aujourd'hui</label>
        <div class="inline-input-row">
          <input type="number" id="weight-input" placeholder="kg" value="${weight}" step="0.1">
          <button class="btn" data-action="confirm-weight">✓</button>
        </div>
        <label class="field-label" style="margin-top:8px">Kcal sport (séance du jour)</label>
        <div class="inline-input-row">
          <input type="number" id="sport-input" placeholder="0">
          <button class="btn" data-action="confirm-sport">✓</button>
          ${snap.current.sport_kcal !== null ? '<button class="btn btn-cancel" data-action="clear-sport">effacer</button>' : ''}
        </div>
        ${healthConnectStatusHtml()}
      </div>

      <div class="card" style="position:relative">
        <img src="/logo-taco-chick.png" alt="" style="position:absolute;top:16px;right:16px;width:52px;height:52px;object-fit:contain">
        ${
          dt !== 'plaisir'
            ? `
          <div class="kcal-total glow" style="color:${DAYTYPE_COLOR[dt]}">${snap.macros.kcal !== null ? fmt(snap.macros.kcal) : '—'} <span class="kcal-unit">kcal</span></div>
          <div class="empty-hint" style="padding:0">BMR ${fmt(snap.macros.bmr)} kcal · ${weight} kg</div>
          <div class="empty-hint" style="padding:0;font-style:italic">Détecté via : ${escapeHtml(snap.dayType.source)}</div>
          ${macroBars(snap.macros)}
        `
            : `
          <div style="text-align:center;font-size:36px;margin:8px 0 4px">🍺</div>
          <div style="text-align:center;color:var(--plaisir);font-weight:700">Jour plaisir déclaré</div>
          <div class="empty-hint" style="text-align:center">${escapeHtml(snap.dayType.source)}</div>
        `
        }
      </div>

      ${todayCard()}
    `;
  }

  async function withRefresh(action: () => Promise<void> | void) {
    await action();
    await refresh();
    render();
  }

  // Long-press a habit chip to delete it — the quick-log chip row has no other delete
  // affordance (that's the Habitudes library screen's job), but forcing a trip there just to
  // remove a mislogged/duplicate habit is friction worth cutting.
  attachLongPress(container, '[data-action="log-habit"]', 500, async (target) => {
    const h = habits.find((x) => x.id === target.dataset.id);
    if (!h) return;
    if (!confirm(`Supprimer l'habitude "${h.label}" ?`)) return;
    await withRefresh(async () => {
      const newHabits = (await repos.habits.load()).filter((x) => x.id !== h.id);
      await repos.habits.save(newHabits);
      habits = newHabits;
    });
  });

  container.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    if (action === 'confirm-weight') {
      const v = parseFloat(container.querySelector<HTMLInputElement>('#weight-input')!.value);
      if (!isNaN(v) && v > 0) {
        await withRefresh(async () => {
          snapshot = await refreshDaySnapshot(
            repos,
            profile,
            { steps: hcSignals.steps, sportKcal: await repos.sport.loadSportKcal(now()), activeCaloriesKcal: hcSignals.activeCaloriesKcal, exerciseMin: null },
            v,
            now(),
          );
        });
      }
      return;
    }
    if (action === 'confirm-sport') {
      const v = parseFloat(container.querySelector<HTMLInputElement>('#sport-input')!.value);
      if (!isNaN(v) && v > 0) {
        await withRefresh(() => repos.sport.saveSportKcal(v, now()));
      }
      return;
    }
    if (action === 'clear-sport') {
      await withRefresh(() => repos.sport.clearSportKcal());
      return;
    }
    if (action === 'connect-health') {
      await withRefresh(async () => {
        await health.requestPermissions();
        await refreshHealthConnect();
      });
      return;
    }
    if (action === 'habit-sort') {
      habitSortMode = target.dataset.mode as HabitSortMode;
      await repos.habits.saveSortMode(habitSortMode);
      render();
      return;
    }
    if (action === 'log-habit') {
      const h = habits.find((x) => x.id === target.dataset.id);
      if (!h) return;
      await withRefresh(async () => {
        const m = computeFoodMacros(h.per100, h.portion_g);
        const log = await repos.foodLog.loadToday(now());
        log.entries.push({
          entry_id: uid(),
          habit_id: h.id,
          label: h.label,
          portion_g: h.portion_g,
          per100: h.per100,
          kcal: m.kcal,
          protein_g: m.protein_g,
          fat_g: m.fat_g,
          carb_g: m.carb_g,
          source: h.source,
          updated_at: Date.now(),
          meal_slot: h.meal_slot ?? guessMealSlot(now()),
        });
        await repos.foodLog.saveToday(log);
      });
      return;
    }
    if (action === 'log-delete') {
      await withRefresh(async () => {
        const log = await repos.foodLog.loadToday(now());
        log.entries = log.entries.filter((x) => x.entry_id !== target.dataset.id);
        await repos.foodLog.saveToday(log);
      });
      return;
    }
    if (action === 'log-open') {
      logForm = { step: 'search', query: '', results: [], loading: false, scanning: false, error: null, saveAsHabit: false, aiQuery: '', aiLoading: false, aiError: null };
      render();
      container.querySelector<HTMLInputElement>('#log-off-query')?.focus();
      return;
    }
    if (action === 'log-close') {
      logForm = null;
      render();
      return;
    }
    if (action === 'log-search') {
      const q = container.querySelector<HTMLInputElement>('#log-off-query')?.value.trim() ?? '';
      if (!q || !logForm) return;
      logForm.query = q;
      logForm.loading = true;
      logForm.error = null;
      render();
      const result = await searchOffProducts(q);
      if (!logForm) return; // form was closed while the search was in flight
      if (result.ok) {
        logForm.results = result.results;
      } else {
        logForm.error = result.error;
        logForm.results = [];
      }
      logForm.loading = false;
      render();
      return;
    }
    if (action === 'log-scan-barcode') {
      if (!logForm) return;
      logForm.scanning = true;
      logForm.error = null;
      render();
      const result = await scanBarcodeAndLookup();
      if (!logForm) return; // form was closed (Annuler) while the scanner/lookup was in flight
      logForm.scanning = false;
      if (result.status === 'cancelled') {
        render();
        return;
      }
      if (result.status === 'error') {
        logForm.error = result.message;
      } else if (result.status === 'not-found') {
        logForm.error = 'Produit introuvable pour ce code-barres — réessaie ou saisis à la main.';
      } else {
        logForm.step = 'confirm';
        logKcalTouched.value = false;
        logForm.prefill = {
          label: result.product.name,
          off_code: result.product.code,
          source: 'off',
          portion_g: result.product.servingGrams ?? 100,
          per100: result.product.per100,
        };
      }
      render();
      return;
    }
    if (action === 'log-portion-multiply') {
      const factor = Number(target.dataset.factor);
      const input = container.querySelector<HTMLInputElement>('#log-f-portion');
      if (input && factor) {
        const current = parseFloat(input.value) || 0;
        input.value = String(Math.round(current * factor));
        updateFoodEntryTotalPreview(container, 'log-f');
      }
      return;
    }
    if (action === 'log-select') {
      if (!logForm) return;
      const p = logForm.results[Number(target.dataset.index)];
      logForm.step = 'confirm';
      logKcalTouched.value = false;
      logForm.prefill = { label: p.name, off_code: p.code, source: 'off', portion_g: p.servingGrams ?? 100, per100: p.per100 };
      render();
      return;
    }
    if (action === 'log-ai-interpret') {
      const text = container.querySelector<HTMLInputElement>('#log-ai-query')?.value.trim() ?? '';
      if (!text || !logForm) return;
      logForm.aiQuery = text;
      logForm.aiLoading = true;
      logForm.aiError = null;
      render();
      const result = await interpretFoodTextWithAI(text);
      if (!logForm) return; // form was closed while the AI call was in flight
      if (result.ok) {
        logForm.step = 'confirm';
        logKcalTouched.value = false;
        logForm.prefill = result.prefill;
      } else {
        logForm.aiError = result.error;
      }
      logForm.aiLoading = false;
      render();
      return;
    }
    if (action === 'log-manual') {
      if (!logForm) return;
      logForm.step = 'confirm';
      logKcalTouched.value = false;
      logForm.prefill = {
        label: logForm.query || '',
        off_code: null,
        source: 'manual',
        portion_g: 100,
        per100: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
      };
      render();
      return;
    }
    if (action === 'log-save') {
      if (!logForm?.prefill) return;
      const label = (container.querySelector<HTMLInputElement>('#log-f-label')?.value ?? '').trim();
      if (!label) return;
      const portion_g = Math.max(1, parseFloat(container.querySelector<HTMLInputElement>('#log-f-portion')!.value) || 100);
      const per100 = {
        kcal: parseFloat(container.querySelector<HTMLInputElement>('#log-f-kcal')!.value) || 0,
        protein_g: parseFloat(container.querySelector<HTMLInputElement>('#log-f-prot')!.value) || 0,
        fat_g: parseFloat(container.querySelector<HTMLInputElement>('#log-f-fat')!.value) || 0,
        carb_g: parseFloat(container.querySelector<HTMLInputElement>('#log-f-carb')!.value) || 0,
      };
      const saveAsHabit = container.querySelector<HTMLInputElement>('#log-f-save-habit')?.checked ?? false;
      const mealSlot = (container.querySelector<HTMLSelectElement>('#log-f-mealslot')?.value || guessMealSlot(now())) as MealSlot;
      const source = logForm.prefill.source;
      const offCode = logForm.prefill.off_code;
      await withRefresh(async () => {
        const m = computeFoodMacros(per100, portion_g);
        const log = await repos.foodLog.loadToday(now());
        log.entries.push({
          entry_id: uid(),
          habit_id: null,
          label,
          portion_g,
          per100,
          kcal: m.kcal,
          protein_g: m.protein_g,
          fat_g: m.fat_g,
          carb_g: m.carb_g,
          source,
          updated_at: Date.now(),
          meal_slot: mealSlot,
        });
        await repos.foodLog.saveToday(log);
        if (saveAsHabit) {
          const newHabits = await repos.habits.load();
          newHabits.push({
            id: uid(),
            label,
            off_code: offCode,
            source,
            portion_g,
            per100,
            day_type_tag: null,
            meal_slot: null,
            updated_at: Date.now(),
          });
          await repos.habits.save(newHabits);
          habits = newHabits;
        }
        // Cleared here, inside the callback withRefresh awaits before its own render() —
        // clearing it after withRefresh() returns is one render() too late: that call already
        // painted the confirm form (from the untouched, stale `prefill` object the form
        // started with, since its inputs are uncontrolled) instead of the "+ Logger un
        // aliment" button, and nothing re-renders afterward to correct it. Confirmed on
        // device: the form was left stuck open showing reset/default values post-save.
        logForm = null;
      });
      return;
    }
  });

  // 'input' fires on every keystroke (unlike 'change', which only fires on blur) — needed
  // for the kcal-from-macros recompute to actually feel live while typing.
  container.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (logForm?.step !== 'confirm') return;
    handleFoodEntryKcalGuardInput(container, 'log-f', target.id, logKcalTouched);
  });

  container.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    if (target.dataset.action === 'log-portion') {
      const grams = parseFloat((target as HTMLInputElement).value);
      if (isNaN(grams) || grams <= 0) return;
      await withRefresh(async () => {
        const log = await repos.foodLog.loadToday(now());
        const entry = log.entries.find((x) => x.entry_id === target.dataset.id);
        if (!entry) return;
        entry.portion_g = grams;
        const m = computeFoodMacros(entry.per100, grams);
        entry.kcal = m.kcal;
        entry.protein_g = m.protein_g;
        entry.fat_g = m.fat_g;
        entry.carb_g = m.carb_g;
        entry.updated_at = Date.now();
        await repos.foodLog.saveToday(log);
      });
    }
  });

  function uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  (async () => {
    profile = await repos.profile.load();
    habits = await repos.habits.load();
    habitSortMode = await repos.habits.loadSortMode();
    await refreshHealthConnect();
    await refresh();
    render();
  })();
}
