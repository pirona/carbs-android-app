// SPDX-License-Identifier: GPL-3.0-or-later
// Caloric-deficit advice grounded in the most recent fully-logged past day (weight, sport/steps
// and food all present — same "tracked day" bar as calcWeekRealDeficit) — today is deliberately
// excluded since it's still in progress. Food is grouped by meal + hors-repas per the day's
// LogEntry.meal_slot, mirroring how the user actually eats rather than one flat list. The advice
// text itself comes from Mistral via a new n8n webhook (see n8n_carb_advice_workflow.json) with
// a system prompt pinned to recognized public-health bodies (ANSES/EFSA/OMS etc.) — this screen
// only ever sends structured numbers, never asks the model to invent nutrition facts.
import type { DayEntry, DayType, LogEntry, MealSlot, Profile } from '../../core/types';
import { MEAL_SLOT_ORDER, MEAL_SLOT_LABEL } from '../../core/types';
import type { DayHistoryRepo } from '../../storage/repos/dayHistoryRepo';
import type { FoodLogHistoryRepo } from '../../storage/repos/foodLogHistoryRepo';
import type { ProfileRepo } from '../../storage/repos/profileRepo';
import { calcMacros } from '../../core/calc/macros';
import { fetchCarbAdvice, type CarbAdviceMacros, type CarbAdviceRequest, type CarbAdviceResult } from '../../integrations/n8nCarbAdvice';
import { escapeHtml, fmt1 } from '../util';

export interface ConseilsScreenRepos {
  dayHistory: DayHistoryRepo;
  foodLogHistory: FoodLogHistoryRepo;
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

function foodTotals(entries: LogEntry[]) {
  return entries.reduce(
    (acc, e) => ({ kcal: acc.kcal + e.kcal, protein_g: acc.protein_g + e.protein_g, fat_g: acc.fat_g + e.fat_g, carb_g: acc.carb_g + e.carb_g }),
    { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
  );
}

function groupByMeal(entries: LogEntry[]): Record<MealSlot, LogEntry[]> {
  const groups: Record<MealSlot, LogEntry[]> = { petit_dej: [], dejeuner: [], diner: [], collation: [] };
  entries.forEach((e) => groups[e.meal_slot]?.push(e));
  return groups;
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

export function renderConseilsScreen(container: HTMLElement, repos: ConseilsScreenRepos): void {
  let profile: Profile;
  let adviceDay: AdviceDay | null = null;
  let adviceLoading = false;
  let adviceError: string | null = null;
  let advice: CarbAdviceResult | null = null;

  function mealSectionHtml(slot: MealSlot, entries: LogEntry[]): string {
    if (entries.length === 0) return '';
    const totals = foodTotals(entries);
    return `
      <div class="form-block">
        <div class="list-header"><span style="font-size:12px;font-weight:600">${MEAL_SLOT_LABEL[slot]}</span><span class="empty-hint" style="padding:0">${fmt(totals.kcal)} kcal</span></div>
        ${entries
          .map(
            (e) => `
          <div class="log-entry-row">
            <div class="log-entry-info">
              <div class="log-entry-label">${escapeHtml(e.label)}</div>
              <div class="log-entry-sub">${e.portion_g} g · ${e.kcal} kcal</div>
            </div>
          </div>`,
          )
          .join('')}
      </div>`;
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

  function render() {
    if (!adviceDay) {
      container.innerHTML = `
        <p class="hint">Conseils personnalisés basés sur une journée passée entièrement remplie (poids, activité et repas).</p>
        <div class="card"><div class="empty-hint">Pas encore de journée complète à analyser — remplis poids, sport/pas et tous tes repas une journée entière, elle apparaîtra ici le lendemain.</div></div>`;
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
        <button class="btn-cta" style="margin-top:10px" data-action="get-advice" ${adviceLoading ? 'disabled' : ''}>🤖 Obtenir un conseil</button>
        ${adviceResultHtml()}
      </div>`;
  }

  container.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || target.dataset.action !== 'get-advice' || !adviceDay) return;

    const { day, entries } = adviceDay;
    const macros = calcMacros(day.dayType === 'plaisir' ? 'medium' : day.dayType, day.weight_kg!, profile);
    const totals = foodTotals(entries);
    const groups = groupByMeal(entries);
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
    };

    adviceLoading = true;
    adviceError = null;
    advice = null;
    render();
    try {
      advice = await fetchCarbAdvice(payload);
    } catch (err) {
      adviceError = `Conseil impossible (${(err as Error).message}) — réessaie plus tard.`;
    }
    adviceLoading = false;
    render();
  });

  (async () => {
    profile = await repos.profile.load();
    adviceDay = await findAdviceDay(repos);
    render();
  })();
}
