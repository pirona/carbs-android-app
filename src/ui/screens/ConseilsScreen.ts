// SPDX-License-Identifier: GPL-3.0-or-later
// Caloric-deficit advice grounded in the most recent fully-logged past day (weight, sport/steps
// and food all present — same "tracked day" bar as calcWeekRealDeficit) — today is deliberately
// excluded since it's still in progress. Food is grouped by meal + hors-repas per the day's
// LogEntry.meal_slot, mirroring how the user actually eats rather than one flat list, and each
// entry can be dragged into another section to fix a mislogged meal before asking for advice
// (see mealSlotDrag.ts) — corrections write straight through to FoodLogHistoryRepo since this
// is an archived day, not today's log. The advice text itself comes from Mistral via
// mistralCarbAdvice.ts, with a system prompt pinned to recognized public-health bodies
// (ANSES/EFSA/OMS etc.) — this screen only ever sends structured numbers, never asks the model
// to invent nutrition facts.
//
// findAdviceDay() only guarantees weight/activity-kcal/food-kcal are non-null and at least one
// food entry exists — a day with a single logged coffee passes that bar. assessCompleteness()
// adds a stricter "is this actually a normal day" check on top; when it fails, the screen shows
// a visible warning and requires an explicit confirmation before generating a conseil rather
// than silently treating a partial log as the full day (both to the user and to Mistral, via
// the data_completeness field in the request payload).
//
// Generated advice is persisted per date (CarbAdviceHistoryRepo) so re-opening this screen
// never re-calls Mistral for a day already analyzed — "🔄 Régénérer" is the only way to
// overwrite it — and past conseils stay browsable in the collapsible history section below.
import type { DayEntry, DayType, LogEntry, MealSlot, Profile } from '../../core/types';
import { MEAL_SLOT_ORDER, MEAL_SLOT_LABEL } from '../../core/types';
import { groupByMeal, foodTotals } from '../../core/calc/mealGroup';
import { assessCompleteness, type AdviceCompleteness } from '../../core/calc/adviceCompleteness';
import { computeFoodMacros } from '../../core/calc/food';
import {
  calcPeriodStats,
  assessPeriodCompleteness,
  thisWeekRange,
  lastWeekRange,
  thisMonthRange,
  lastMonthRange,
  type PeriodStats,
  type PeriodCompleteness,
} from '../../core/calc/periodBilan';
import type { DayHistoryRepo } from '../../storage/repos/dayHistoryRepo';
import type { FoodLogHistoryRepo } from '../../storage/repos/foodLogHistoryRepo';
import type { CarbAdviceHistoryRepo, CarbAdviceHistoryEntry } from '../../storage/repos/carbAdviceHistoryRepo';
import type { CarbPeriodBilanHistoryRepo, CarbPeriodBilanHistoryEntry } from '../../storage/repos/carbPeriodBilanHistoryRepo';
import type { ProfileRepo } from '../../storage/repos/profileRepo';
import { calcMacros } from '../../core/calc/macros';
import { fetchCarbAdvice, type CarbAdviceMacros, type CarbAdviceRequest, type CarbAdviceResult } from '../../integrations/mistralCarbAdvice';
import { fetchPeriodBilan, type PeriodBilanRequest, type PeriodBilanResult } from '../../integrations/mistralPeriodBilan';
import { MissingMistralKeyError } from '../../integrations/mistralClient';
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
import { attachMealSlotDrag } from '../mealSlotDrag';
import { iconDragHandle, iconAdd } from '../icons';
import { escapeHtml, fmt1 } from '../util';

export interface ConseilsScreenRepos {
  dayHistory: DayHistoryRepo;
  foodLogHistory: FoodLogHistoryRepo;
  carbAdviceHistory: CarbAdviceHistoryRepo;
  carbPeriodBilanHistory: CarbPeriodBilanHistoryRepo;
  profile: ProfileRepo;
}

const DAYTYPE_LABEL: Record<DayType, string> = { high: 'HIGH CARB', medium: 'MEDIUM CARB', low: 'LOW CARB', plaisir: 'JOUR PLAISIR' };

interface AdviceDay {
  day: DayEntry;
  entries: LogEntry[];
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

// day_history and food_log_history are both kept newest-first (prepended on archive) — walk
// forward and take the first day that has both a complete DayEntry AND at least one logged
// food entry for that same date.
async function findAdviceDay(repos: ConseilsScreenRepos): Promise<AdviceDay | null> {
  const [history, logHistory] = await Promise.all([repos.dayHistory.loadHistory(), repos.foodLogHistory.load()]);
  const entriesByDate = new Map(logHistory.map((e) => [e.date, e.entries]));
  for (const day of history) {
    if (day.weight_kg == null || day.burned_today == null || day.food_kcal == null) continue;
    const entries = entriesByDate.get(day.date);
    if (!entries || entries.length === 0) continue;
    return { day, entries };
  }
  return null;
}

function formatDateLong(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function completenessGaps(c: AdviceCompleteness): string[] {
  const gaps: string[] = [`${c.meals_logged}/${c.meals_total} repas loggés`];
  if (!c.has_activity) gaps.push('activité (pas/sport) non renseignée');
  return gaps;
}

export function renderConseilsScreen(container: HTMLElement, repos: ConseilsScreenRepos): void {
  let profile: Profile;
  let adviceDay: AdviceDay | null = null;
  let completeness: AdviceCompleteness | null = null;
  let adviceLoading = false;
  let adviceError: string | null = null;
  let advice: CarbAdviceResult | null = null;
  let pendingConfirm = false;
  let history: CarbAdviceHistoryEntry[] = [];
  let historyExpanded = false;

  // "Add a forgotten meal" on the flagged past day — mirrors DayScreen's log form (same shared
  // foodEntryForm.ts helpers) but writes into FoodLogHistoryRepo for an archived date instead
  // of today's FoodLogRepo. Always available on the day card, not just while incomplete —
  // adding one item can flip the day to "complete" (see assessCompleteness), and the user may
  // still have more than one forgotten item to log. Sport/activity for a past day is already
  // correctable from the Semainier (WeekScreen); this closes the same gap for food.
  interface MissedEntryFormState {
    step: 'search' | 'confirm';
    query: string;
    results: OffProduct[];
    loading: boolean;
    scanning: boolean;
    error: string | null;
    aiQuery: string;
    aiLoading: boolean;
    aiError: string | null;
    prefill?: FoodEntryPrefill;
  }
  let missedForm: MissedEntryFormState | null = null;
  const missedKcalTouched = { value: false };

  // Bilan période — same "persist per key, don't auto-regenerate, browsable history" principle
  // as the day-level conseil above, but keyed by an arbitrary (start,end) range instead of a
  // single date. dayHistoryCache/currentDayCache are loaded once at mount and reused for every
  // recompute (picking a new range or preset shouldn't re-hit storage on every keystroke).
  let dayHistoryCache: DayEntry[] = [];
  let currentDayCache: DayEntry | null = null;
  let periodStart = '';
  let periodEnd = '';
  let periodStats: PeriodStats | null = null;
  let periodCompleteness: PeriodCompleteness | null = null;
  let periodBilan: PeriodBilanResult | null = null;
  let periodBilanLoading = false;
  let periodBilanError: string | null = null;
  let periodPendingConfirm = false;
  let periodHistory: CarbPeriodBilanHistoryEntry[] = [];
  let periodHistoryExpanded = false;

  const now = () => new Date();

  // Always renders the section shell, even with zero entries — an empty meal must still exist
  // as a valid drop target (e.g. dragging the last entry out of "diner" into "collation").
  function mealSectionHtml(slot: MealSlot, entries: LogEntry[]): string {
    const totals = foodTotals(entries);
    return `
      <div class="form-block" data-meal-section="${slot}">
        <div class="list-header"><span style="font-size:13px;font-weight:600">${MEAL_SLOT_LABEL[slot]}</span><span class="empty-hint" style="padding:0">${fmt(totals.kcal)} kcal</span></div>
        ${
          entries.length === 0
            ? '<div class="empty-hint">Rien ici.</div>'
            : entries
                .map(
                  (e) => `
          <div class="log-entry-row" data-entry-id="${e.entry_id}">
            <span class="drag-handle">${iconDragHandle()}</span>
            <div class="log-entry-info">
              <div class="log-entry-label">${escapeHtml(e.label)}</div>
              <div class="log-entry-sub">${e.portion_g} g · ${e.kcal} kcal</div>
            </div>
          </div>`,
                )
                .join('')
        }
      </div>`;
  }

  function completenessBannerHtml(c: AdviceCompleteness): string {
    return `<div class="completeness-banner">⚠️ Journée partiellement remplie — ${completenessGaps(c).join(' · ')}. Les totaux ci-dessus peuvent être sous-estimés, et tout conseil basé dessus en tient compte.</div>`;
  }

  // First empty meal slot on the flagged day — a reasonable default for "which meal did you
  // forget", not a guess based on the current time (this is a past day, guessMealSlot's
  // now()-based heuristic doesn't apply).
  function firstEmptyMealSlot(groups: Record<MealSlot, LogEntry[]>): MealSlot {
    return MEAL_SLOT_ORDER.find((slot) => groups[slot].length === 0) ?? 'collation';
  }

  function missedEntryFormHtml(defaultSlot: MealSlot): string {
    const f = missedForm!;
    if (f.step === 'search') {
      return `
        <div class="form-block">
          <label class="field-label">Rechercher sur OpenFoodFacts</label>
          <input type="text" id="missed-off-query" placeholder="ex: yaourt nature" value="${escapeHtml(f.query)}">
          <div class="form-actions" style="margin-top:0">
            <button class="btn btn-add" style="margin-top:0" data-action="add-missed-search">Rechercher</button>
            <button class="btn btn-add" style="margin-top:0;background:var(--low)" data-action="add-missed-scan-barcode" ${f.scanning ? 'disabled' : ''}>📷 Code-barres</button>
          </div>
          ${f.loading ? '<div class="empty-hint">Recherche en cours…</div>' : ''}
          ${f.scanning ? '<div class="empty-hint">Scan en cours…</div>' : ''}
          ${f.error ? `<div class="empty-hint error-text">${escapeHtml(f.error)}</div>` : ''}
          ${f.results
            .map(
              (p, i) => `
            <div class="search-result" data-action="add-missed-select" data-index="${i}">
              <div class="search-result-name">${escapeHtml(p.name)}</div>
              <div class="search-result-sub">${p.brand ? escapeHtml(p.brand) + ' · ' : ''}${Math.round(p.per100.kcal)} kcal/100g</div>
            </div>`,
            )
            .join('')}
          ${f.results.length === 0 && !f.loading && f.query ? '<div class="empty-hint">Aucun résultat.</div>' : ''}

          <div class="form-block">
            <label class="field-label">🤖 Décrire en langage naturel (si absent d'OpenFoodFacts)</label>
            <input type="text" id="missed-ai-query" placeholder="ex: 2 mugs de café, 350g café moulu au total" value="${escapeHtml(f.aiQuery)}">
            <button class="btn btn-add" style="background:var(--low)" data-action="add-missed-ai-interpret">Interpréter avec l'IA</button>
            ${f.aiLoading ? '<div class="empty-hint">Interprétation en cours…</div>' : ''}
            ${f.aiError ? `<div class="empty-hint error-text">${escapeHtml(f.aiError)}</div>` : ''}
          </div>

          <div class="form-actions">
            <button class="btn btn-cancel" data-action="add-missed-close">Annuler</button>
            <button class="btn" data-action="add-missed-manual">Saisir à la main →</button>
          </div>
        </div>`;
    }
    return renderFoodConfirmStepHtml(f.prefill!, {
      idPrefix: 'missed-f',
      actions: { cancel: 'add-missed-close', save: 'add-missed-save' },
      portionExtraHtml: `
        <div class="form-actions" style="margin:6px 0 8px">
          <button type="button" class="btn" data-action="add-missed-portion-multiply" data-factor="2">×2</button>
          <button type="button" class="btn" data-action="add-missed-portion-multiply" data-factor="3">×3</button>
        </div>`,
      afterFieldsHtml: renderMealSlotSelectHtml('missed-f-mealslot', defaultSlot),
    });
  }

  function addMissedEntrySectionHtml(groups: Record<MealSlot, LogEntry[]>): string {
    if (missedForm) return missedEntryFormHtml(firstEmptyMealSlot(groups));
    return `<button class="btn-secondary" style="display:flex;align-items:center;justify-content:center;gap:6px" data-action="add-missed-open">${iconAdd()} Ajouter un aliment oublié</button>`;
  }

  function adviceResultHtml(): string {
    if (adviceLoading) return '<div class="form-block empty-hint">🤖 Analyse en cours…</div>';
    if (adviceError) return `<div class="form-block empty-hint error-text">${escapeHtml(adviceError)}</div>`;
    if (!advice) return '';
    return `
      <div class="ai-banner">
        <div class="ai-banner-title">🤖 Conseil</div>
        <div style="white-space:pre-wrap">${escapeHtml(advice.advice)}</div>
        ${
          advice.sources.length > 0
            ? `<div class="empty-hint" style="padding-top:6px">Sources : ${advice.sources.map((s) => escapeHtml(s)).join(' · ')}</div>`
            : ''
        }
      </div>`;
  }

  function adviceActionHtml(): string {
    if (adviceLoading) return `<button class="btn-cta" style="margin-top:10px" disabled>🤖 Analyse en cours…</button>`;
    if (advice) return `<button class="btn-secondary" data-action="regenerate-advice">🔄 Régénérer le conseil</button>`;
    if (pendingConfirm) {
      return `
        <div class="form-actions" style="margin-top:10px">
          <button class="btn btn-cancel" data-action="cancel-advice">Annuler</button>
          <button class="btn btn-save" data-action="confirm-advice">Générer quand même</button>
        </div>`;
    }
    return `<button class="btn-cta" style="margin-top:10px" data-action="get-advice">🤖 Obtenir un conseil</button>`;
  }

  function historyEntryHtml(entry: CarbAdviceHistoryEntry): string {
    return `
      <div class="form-block">
        <div class="list-header">
          <span style="font-size:14px;font-weight:600">${formatDateLong(entry.date)}</span>
          <span class="empty-hint" style="padding:0">${entry.completeness.complete ? '✓ complet' : `⚠ ${entry.completeness.meals_logged}/${entry.completeness.meals_total} repas`}</span>
        </div>
        <div style="white-space:pre-wrap;font-size:14px">${escapeHtml(entry.advice)}</div>
        ${
          entry.sources.length > 0
            ? `<div class="empty-hint" style="padding-top:4px">Sources : ${entry.sources.map((s) => escapeHtml(s)).join(' · ')}</div>`
            : ''
        }
      </div>`;
  }

  function historySectionHtml(): string {
    if (history.length === 0) return '';
    return `
      <div class="card" style="margin-top:10px">
        <button class="list-header" style="width:100%;background:none;border:none;padding:0" data-action="toggle-history">
          <span style="font-size:15px;font-weight:600">📜 Historique des conseils (${history.length})</span>
          <span class="row-chevron${historyExpanded ? ' expanded' : ''}">▸</span>
        </button>
        ${historyExpanded ? [...history].sort((a, b) => b.date.localeCompare(a.date)).map(historyEntryHtml).join('') : ''}
      </div>`;
  }

  function formatDateShort(dateKey: string): string {
    const [y, m, d] = dateKey.split('-');
    return `${d}/${m}/${y}`;
  }

  const PERIOD_DAYTYPE_BADGE: Record<DayType, string> = { high: 'HIGH', medium: 'MED', low: 'LOW', plaisir: '🍺' };

  function periodCompletenessBannerHtml(c: PeriodCompleteness): string {
    return `<div class="completeness-banner">⚠️ Période partiellement suivie — ${c.tracked_days}/${c.total_days} jours avec données complètes. Le déficit cumulé et les moyennes peuvent être sous-représentatifs, et tout bilan basé dessus en tient compte.</div>`;
  }

  function periodBilanActionHtml(): string {
    if (periodBilanLoading) return `<button class="btn-cta" style="margin-top:10px" disabled>🤖 Analyse en cours…</button>`;
    if (periodBilan) return `<button class="btn-secondary" data-action="regenerate-period-bilan">🔄 Régénérer le bilan</button>`;
    if (periodPendingConfirm) {
      return `
        <div class="form-actions" style="margin-top:10px">
          <button class="btn btn-cancel" data-action="cancel-period-bilan">Annuler</button>
          <button class="btn btn-save" data-action="confirm-period-bilan">Générer quand même</button>
        </div>`;
    }
    return `<button class="btn-cta" style="margin-top:10px" data-action="get-period-bilan">🤖 Obtenir un bilan</button>`;
  }

  function periodBilanResultHtml(): string {
    if (periodBilanError) return `<div class="form-block empty-hint error-text">${escapeHtml(periodBilanError)}</div>`;
    if (!periodBilan) return '';
    return `
      <div class="ai-banner">
        <div class="ai-banner-title">🤖 Bilan</div>
        <div style="white-space:pre-wrap">${escapeHtml(periodBilan.bilan)}</div>
        ${
          periodBilan.sources.length > 0
            ? `<div class="empty-hint" style="padding-top:6px">Sources : ${periodBilan.sources.map((s) => escapeHtml(s)).join(' · ')}</div>`
            : ''
        }
      </div>`;
  }

  function periodBodyHtml(): string {
    if (!periodStats || !periodCompleteness) return '';
    const s = periodStats;
    if (s.trackedDays === 0) {
      return `<div class="empty-hint" style="margin-top:8px;padding-bottom:0">Aucun jour suivi sur cette période — rien à analyser.</div>`;
    }
    const breakdown = (['high', 'medium', 'low', 'plaisir'] as DayType[]).map((dt) => `${PERIOD_DAYTYPE_BADGE[dt]}×${s.dayTypeCounts[dt]}`).join(' · ');
    return `
      <div class="today-totals" style="margin-top:10px">
        <div>
          <div class="today-totals-kcal">${s.realDeficitKcal >= 0 ? '+' : ''}${fmt(s.realDeficitKcal)} <span class="empty-hint" style="padding:0">kcal net</span></div>
          <div class="empty-hint" style="padding:0">${s.trackedDays}/${s.totalDays} jours suivis</div>
        </div>
        ${
          s.weightDeltaKg !== null
            ? `<div style="text-align:right">
                <div class="empty-hint" style="padding:0">poids</div>
                <div style="font-weight:700;color:${s.weightDeltaKg <= 0 ? 'var(--high)' : 'var(--plaisir)'}">${s.weightDeltaKg > 0 ? '+' : ''}${s.weightDeltaKg} kg</div>
              </div>`
            : ''
        }
      </div>
      ${s.avgFoodKcal !== null ? `<div class="empty-hint" style="padding:0;margin-top:4px">Moyenne : ${fmt(s.avgFoodKcal)} kcal/j · P${fmt1(s.avgProteinG!)} L${fmt1(s.avgFatG!)} G${fmt1(s.avgCarbG!)}</div>` : ''}
      <div class="empty-hint" style="padding:0">${breakdown}</div>
      ${!periodCompleteness.complete ? periodCompletenessBannerHtml(periodCompleteness) : ''}
      ${periodBilanActionHtml()}
      ${periodBilanResultHtml()}
    `;
  }

  function periodBilanCardHtml(): string {
    const invalid = periodStart > periodEnd;
    return `
      <div class="card" style="margin-top:10px">
        <h2>📊 Bilan période</h2>
        <div class="form-actions" style="margin-top:0">
          <button class="btn" data-action="period-preset" data-preset="this-week">Cette semaine</button>
          <button class="btn" data-action="period-preset" data-preset="last-week">Semaine dernière</button>
        </div>
        <div class="form-actions" style="margin-top:0">
          <button class="btn" data-action="period-preset" data-preset="this-month">Ce mois-ci</button>
          <button class="btn" data-action="period-preset" data-preset="last-month">Mois dernier</button>
        </div>
        <div class="field-row" style="margin-top:6px">
          <div><label class="field-label">Du</label><input type="date" id="period-start" value="${periodStart}"></div>
          <div><label class="field-label">Au</label><input type="date" id="period-end" value="${periodEnd}"></div>
        </div>
        ${invalid ? '<div class="empty-hint error-text">Date de fin avant la date de début.</div>' : periodBodyHtml()}
      </div>`;
  }

  function periodHistoryEntryHtml(entry: CarbPeriodBilanHistoryEntry): string {
    return `
      <div class="form-block">
        <div class="list-header">
          <span style="font-size:14px;font-weight:600">${formatDateShort(entry.start_date)} → ${formatDateShort(entry.end_date)}</span>
          <span class="empty-hint" style="padding:0">${entry.completeness.complete ? '✓ complet' : `⚠ ${entry.completeness.tracked_days}/${entry.completeness.total_days}j`}</span>
        </div>
        <div style="white-space:pre-wrap;font-size:14px">${escapeHtml(entry.bilan)}</div>
        ${
          entry.sources.length > 0
            ? `<div class="empty-hint" style="padding-top:4px">Sources : ${entry.sources.map((s) => escapeHtml(s)).join(' · ')}</div>`
            : ''
        }
      </div>`;
  }

  function periodHistorySectionHtml(): string {
    if (periodHistory.length === 0) return '';
    return `
      <div class="card" style="margin-top:10px">
        <button class="list-header" style="width:100%;background:none;border:none;padding:0" data-action="toggle-period-history">
          <span style="font-size:15px;font-weight:600">📜 Historique des bilans (${periodHistory.length})</span>
          <span class="row-chevron${periodHistoryExpanded ? ' expanded' : ''}">▸</span>
        </button>
        ${periodHistoryExpanded ? [...periodHistory].sort((a, b) => b.start_date.localeCompare(a.start_date)).map(periodHistoryEntryHtml).join('') : ''}
      </div>`;
  }

  function render() {
    const periodSectionHtml = `${periodBilanCardHtml()}${periodHistorySectionHtml()}`;

    if (!adviceDay) {
      container.innerHTML = `
        <p class="hint">Conseils personnalisés basés sur une journée passée entièrement remplie (poids, activité et repas).</p>
        <div class="card"><div class="empty-hint">Pas encore de journée complète à analyser — remplis poids, sport/pas et tous tes repas une journée entière, elle apparaîtra ici le lendemain.</div></div>
        ${historySectionHtml()}
        ${periodSectionHtml}`;
      return;
    }
    const { day, entries } = adviceDay;
    const macros = calcMacros(day.dayType === 'plaisir' ? 'medium' : day.dayType, day.weight_kg!, profile);
    const totals = foodTotals(entries);
    const target = day.dayType === 'plaisir' ? null : macros.kcal;
    const diff = target !== null ? Math.round(totals.kcal - target) : null;
    const groups = groupByMeal(entries);

    container.innerHTML = `
      <p class="hint">Basé sur ta dernière journée entièrement remplie.</p>
      <div class="card">
        <div class="list-header">
          <h2>${formatDateLong(day.date)}</h2>
          <span class="day-badge" style="background:var(--accent)">${DAYTYPE_LABEL[day.dayType]}</span>
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
        ${MEAL_SLOT_ORDER.map((slot) => mealSectionHtml(slot, groups[slot])).join('')}
        ${addMissedEntrySectionHtml(groups)}
        ${completeness && !completeness.complete ? completenessBannerHtml(completeness) : ''}
        ${adviceActionHtml()}
        ${adviceResultHtml()}
      </div>
      ${historySectionHtml()}
      ${periodSectionHtml}`;
  }

  function recomputePeriod() {
    if (periodStart > periodEnd) {
      periodStats = null;
      periodCompleteness = null;
      return;
    }
    periodStats = calcPeriodStats(dayHistoryCache, currentDayCache, periodStart, periodEnd, profile);
    periodCompleteness = assessPeriodCompleteness(periodStats);
    periodPendingConfirm = false;
  }

  async function refreshPeriodBilanFromHistory() {
    const stored = await repos.carbPeriodBilanHistory.findByRange(periodStart, periodEnd);
    periodBilan = stored ? { bilan: stored.bilan, sources: stored.sources } : null;
    periodBilanError = null;
  }

  async function generatePeriodBilan() {
    if (!periodStats || !periodCompleteness) return;
    const payload: PeriodBilanRequest = {
      start_date: periodStart,
      end_date: periodEnd,
      profile: { sex: profile.sex, age: profile.age, height_cm: profile.height_cm, weight_goal_kg: profile.weight_goal_kg },
      stats: {
        total_days: periodStats.totalDays,
        tracked_days: periodStats.trackedDays,
        real_deficit_kcal: periodStats.realDeficitKcal,
        avg_food_kcal: periodStats.avgFoodKcal,
        avg_protein_g: periodStats.avgProteinG,
        avg_fat_g: periodStats.avgFatG,
        avg_carb_g: periodStats.avgCarbG,
        weight_start_kg: periodStats.weightStartKg,
        weight_end_kg: periodStats.weightEndKg,
        weight_delta_kg: periodStats.weightDeltaKg,
        day_type_counts: periodStats.dayTypeCounts,
      },
      data_completeness: periodCompleteness,
    };

    periodPendingConfirm = false;
    periodBilanLoading = true;
    periodBilanError = null;
    periodBilan = null;
    render();
    try {
      const result = await fetchPeriodBilan(payload);
      periodBilan = result;
      await repos.carbPeriodBilanHistory.save({
        start_date: periodStart,
        end_date: periodEnd,
        generated_at: Date.now(),
        completeness: periodCompleteness,
        stats: periodStats,
        bilan: result.bilan,
        sources: result.sources,
      });
      periodHistory = await repos.carbPeriodBilanHistory.load();
    } catch (err) {
      periodBilanError = err instanceof MissingMistralKeyError ? err.message : `Bilan impossible (${(err as Error).message}) — réessaie plus tard.`;
    }
    periodBilanLoading = false;
    render();
  }

  async function generateAdvice() {
    if (!adviceDay || !completeness) return;
    const { day, entries } = adviceDay;
    const macros = calcMacros(day.dayType === 'plaisir' ? 'medium' : day.dayType, day.weight_kg!, profile);
    const groups = groupByMeal(entries);
    const totals = foodTotals(entries);
    const toMacroItems = (list: LogEntry[]) =>
      list.map((e) => ({ label: e.label, portion_g: e.portion_g, kcal: e.kcal, protein_g: e.protein_g, fat_g: e.fat_g, carb_g: e.carb_g }));

    const targetMacros: CarbAdviceMacros =
      day.dayType === 'plaisir'
        ? { kcal: null, protein_g: macros.protein_g, fat_g: null, carb_g: null }
        : { kcal: macros.kcal, protein_g: macros.protein_g, fat_g: macros.fat_g, carb_g: macros.carb_g };

    const payload: CarbAdviceRequest = {
      date: day.date,
      day_type: day.dayType,
      profile: { sex: profile.sex, age: profile.age, height_cm: profile.height_cm, weight_kg: day.weight_kg!, weight_goal_kg: profile.weight_goal_kg },
      bmr_kcal: macros.bmr,
      burned_kcal: day.burned_today,
      steps: day.steps,
      target: targetMacros,
      actual: { kcal: totals.kcal, protein_g: totals.protein_g, fat_g: totals.fat_g, carb_g: totals.carb_g },
      meals: {
        petit_dej: toMacroItems(groups.petit_dej),
        dejeuner: toMacroItems(groups.dejeuner),
        diner: toMacroItems(groups.diner),
        collation: toMacroItems(groups.collation),
      },
      data_completeness: completeness,
    };

    pendingConfirm = false;
    adviceLoading = true;
    adviceError = null;
    advice = null;
    render();
    try {
      const result = await fetchCarbAdvice(payload);
      advice = result;
      await repos.carbAdviceHistory.save({
        date: day.date,
        day_type: day.dayType,
        generated_at: Date.now(),
        completeness,
        advice: result.advice,
        sources: result.sources,
      });
      history = await repos.carbAdviceHistory.load();
    } catch (err) {
      adviceError = err instanceof MissingMistralKeyError ? err.message : `Conseil impossible (${(err as Error).message}) — réessaie plus tard.`;
    }
    adviceLoading = false;
    render();
  }

  // Keeps DayHistoryRepo's own per-day aggregate (used by ProgressScreen/calcWeekRealDeficit
  // elsewhere) in sync after a missed entry is added straight to FoodLogHistoryRepo — same
  // "mutate the archived DayEntry in place" pattern WeekScreen already uses for sport_kcal
  // corrections.
  async function syncDayAggregate(date: string, entries: LogEntry[]): Promise<void> {
    const totals = foodTotals(entries);
    const dayHist = await repos.dayHistory.loadHistory();
    const entry = dayHist.find((e) => e.date === date);
    if (!entry) return;
    entry.food_kcal = totals.kcal;
    entry.food_protein_g = totals.protein_g;
    entry.food_fat_g = totals.fat_g;
    entry.food_carb_g = totals.carb_g;
    await repos.dayHistory.saveHistory(dayHist);
  }

  function uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  container.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;

    if (target.dataset.action === 'toggle-history') {
      historyExpanded = !historyExpanded;
      render();
      return;
    }
    if (target.dataset.action === 'toggle-period-history') {
      periodHistoryExpanded = !periodHistoryExpanded;
      render();
      return;
    }
    if (target.dataset.action === 'period-preset') {
      const preset = target.dataset.preset;
      const range =
        preset === 'this-week'
          ? thisWeekRange(now())
          : preset === 'last-week'
            ? lastWeekRange(now())
            : preset === 'this-month'
              ? thisMonthRange(now())
              : lastMonthRange(now());
      periodStart = range.start;
      periodEnd = range.end;
      recomputePeriod();
      await refreshPeriodBilanFromHistory();
      render();
      return;
    }
    if (target.dataset.action === 'get-period-bilan' || target.dataset.action === 'regenerate-period-bilan') {
      if (!periodCompleteness) return;
      if (periodCompleteness.complete) {
        await generatePeriodBilan();
      } else {
        periodPendingConfirm = true;
        render();
      }
      return;
    }
    if (target.dataset.action === 'confirm-period-bilan') {
      await generatePeriodBilan();
      return;
    }
    if (target.dataset.action === 'cancel-period-bilan') {
      periodPendingConfirm = false;
      render();
      return;
    }

    if (!adviceDay || !completeness) return;

    switch (target.dataset.action) {
      case 'get-advice':
      case 'regenerate-advice':
        if (completeness.complete) {
          await generateAdvice();
        } else {
          pendingConfirm = true;
          render();
        }
        break;
      case 'confirm-advice':
        await generateAdvice();
        break;
      case 'cancel-advice':
        pendingConfirm = false;
        render();
        break;
      case 'add-missed-open':
        missedForm = { step: 'search', query: '', results: [], loading: false, scanning: false, error: null, aiQuery: '', aiLoading: false, aiError: null };
        render();
        container.querySelector<HTMLInputElement>('#missed-off-query')?.focus();
        break;
      case 'add-missed-close':
        missedForm = null;
        render();
        break;
      case 'add-missed-search': {
        const q = container.querySelector<HTMLInputElement>('#missed-off-query')?.value.trim() ?? '';
        if (!q || !missedForm) break;
        missedForm.query = q;
        missedForm.loading = true;
        missedForm.error = null;
        render();
        const result = await searchOffProducts(q);
        if (!missedForm) break; // form was closed while the search was in flight
        if (result.ok) {
          missedForm.results = result.results;
        } else {
          missedForm.error = result.error;
          missedForm.results = [];
        }
        missedForm.loading = false;
        render();
        break;
      }
      case 'add-missed-scan-barcode': {
        if (!missedForm) break;
        missedForm.scanning = true;
        missedForm.error = null;
        render();
        const result = await scanBarcodeAndLookup();
        if (!missedForm) break; // form was closed while the scanner/lookup was in flight
        missedForm.scanning = false;
        if (result.status === 'cancelled') {
          render();
          break;
        }
        if (result.status === 'error') {
          missedForm.error = result.message;
        } else if (result.status === 'not-found') {
          missedForm.error = 'Produit introuvable pour ce code-barres — réessaie ou saisis à la main.';
        } else {
          missedForm.step = 'confirm';
          missedKcalTouched.value = false;
          missedForm.prefill = {
            label: result.product.name,
            off_code: result.product.code,
            source: 'off',
            portion_g: result.product.servingGrams ?? 100,
            per100: result.product.per100,
          };
        }
        render();
        break;
      }
      case 'add-missed-portion-multiply': {
        const factor = Number(target.dataset.factor);
        const input = container.querySelector<HTMLInputElement>('#missed-f-portion');
        if (input && factor) {
          const current = parseFloat(input.value) || 0;
          input.value = String(Math.round(current * factor));
          updateFoodEntryTotalPreview(container, 'missed-f');
        }
        break;
      }
      case 'add-missed-select': {
        if (!missedForm) break;
        const p = missedForm.results[Number(target.dataset.index)];
        missedForm.step = 'confirm';
        missedKcalTouched.value = false;
        missedForm.prefill = { label: p.name, off_code: p.code, source: 'off', portion_g: p.servingGrams ?? 100, per100: p.per100 };
        render();
        break;
      }
      case 'add-missed-ai-interpret': {
        const text = container.querySelector<HTMLInputElement>('#missed-ai-query')?.value.trim() ?? '';
        if (!text || !missedForm) break;
        missedForm.aiQuery = text;
        missedForm.aiLoading = true;
        missedForm.aiError = null;
        render();
        const result = await interpretFoodTextWithAI(text);
        if (!missedForm) break; // form was closed while the AI call was in flight
        if (result.ok) {
          missedForm.step = 'confirm';
          missedKcalTouched.value = false;
          missedForm.prefill = result.prefill;
        } else {
          missedForm.aiError = result.error;
        }
        missedForm.aiLoading = false;
        render();
        break;
      }
      case 'add-missed-manual':
        if (!missedForm) break;
        missedForm.step = 'confirm';
        missedKcalTouched.value = false;
        missedForm.prefill = { label: missedForm.query || '', off_code: null, source: 'manual', portion_g: 100, per100: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 } };
        render();
        break;
      case 'add-missed-save': {
        if (!missedForm?.prefill) break;
        const label = (container.querySelector<HTMLInputElement>('#missed-f-label')?.value ?? '').trim();
        if (!label) break;
        const portion_g = Math.max(1, parseFloat(container.querySelector<HTMLInputElement>('#missed-f-portion')!.value) || 100);
        const per100 = {
          kcal: parseFloat(container.querySelector<HTMLInputElement>('#missed-f-kcal')!.value) || 0,
          protein_g: parseFloat(container.querySelector<HTMLInputElement>('#missed-f-prot')!.value) || 0,
          fat_g: parseFloat(container.querySelector<HTMLInputElement>('#missed-f-fat')!.value) || 0,
          carb_g: parseFloat(container.querySelector<HTMLInputElement>('#missed-f-carb')!.value) || 0,
        };
        const mealSlot = (container.querySelector<HTMLSelectElement>('#missed-f-mealslot')?.value || 'collation') as MealSlot;
        const source = missedForm.prefill.source;
        const m = computeFoodMacros(per100, portion_g);
        const newEntry: LogEntry = {
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
        };
        adviceDay!.entries.push(newEntry);
        await repos.foodLogHistory.addEntry(adviceDay!.day.date, newEntry);
        await syncDayAggregate(adviceDay!.day.date, adviceDay!.entries);
        completeness = assessCompleteness(adviceDay!.day, adviceDay!.entries);
        // Keep the period bilan's stats in sync too — the edited date may fall inside the
        // currently selected range (dayHistoryCache is a separate in-memory copy from
        // adviceDay, loaded once at mount for that section's own recomputes).
        dayHistoryCache = await repos.dayHistory.loadHistory();
        recomputePeriod();
        missedForm = null;
        render();
        break;
      }
    }
  });

  // 'input' fires on every keystroke (unlike 'change', which only fires on blur) — needed for
  // the kcal-from-macros recompute to feel live while typing (same as DayScreen's log form).
  container.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (missedForm?.step !== 'confirm') return;
    handleFoodEntryKcalGuardInput(container, 'missed-f', target.id, missedKcalTouched);
  });

  // Native date inputs fire 'change' (on confirm/blur), not 'input' — no live-typing guard
  // needed here like the food form's kcal recompute.
  container.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    if (target.id !== 'period-start' && target.id !== 'period-end') return;
    if (!target.value) return;
    if (target.id === 'period-start') periodStart = target.value;
    else periodEnd = target.value;
    recomputePeriod();
    await refreshPeriodBilanFromHistory();
    render();
  });

  attachMealSlotDrag(container, {
    handleSelector: '.drag-handle',
    rowSelector: '[data-entry-id]',
    sectionSelector: '[data-meal-section]',
    onDrop: async (entryId, _fromSlot, toSlot) => {
      if (!adviceDay) return;
      const entry = adviceDay.entries.find((e) => e.entry_id === entryId);
      if (!entry) return;
      entry.meal_slot = toSlot;
      await repos.foodLogHistory.updateEntryMealSlot(adviceDay.day.date, entryId, toSlot);
      render();
    },
  });

  (async () => {
    profile = await repos.profile.load();
    adviceDay = await findAdviceDay(repos);
    history = await repos.carbAdviceHistory.load();
    if (adviceDay) {
      completeness = assessCompleteness(adviceDay.day, adviceDay.entries);
      const stored = await repos.carbAdviceHistory.findByDate(adviceDay.day.date);
      if (stored) advice = { advice: stored.advice, sources: stored.sources };
    }

    dayHistoryCache = await repos.dayHistory.loadHistory();
    currentDayCache = await repos.dayHistory.loadCurrentDay();
    periodHistory = await repos.carbPeriodBilanHistory.load();
    const defaultRange = thisWeekRange(now());
    periodStart = defaultRange.start;
    periodEnd = defaultRange.end;
    recomputePeriod();
    await refreshPeriodBilanFromHistory();

    render();
  })();
}
