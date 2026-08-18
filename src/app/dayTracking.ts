// SPDX-License-Identifier: GPL-3.0-or-later
// Orchestrates the "today" snapshot: archives yesterday into day_history on a date
// rollover, computes step_kcal/burned_today from live signals, pulls food totals from
// the log, detects the day type, and persists current_day. Port of
// carb-cycling.html:802-879 (archiveDayIfNeeded) minus the HA total_calories branch —
// see plan §Phase 3/dayTracking.
import type { DayEntry, MacroResult, PlaisirOverrides, Profile } from '../core/types';
import { DEFAULT_DAY_SCHEDULE, DEFAULT_THRESHOLDS } from '../core/types';
import { detectDayType, type DayTypeSignals, type DayTypeResult } from '../core/calc/dayType';
import { stepsToActiveKcal, calcMacros } from '../core/calc/macros';
import { formatDateKey } from '../core/calc/date';
import type { DayHistoryRepo } from '../storage/repos/dayHistoryRepo';
import type { SportRepo } from '../storage/repos/sportRepo';
import type { FoodLogRepo } from '../storage/repos/foodLogRepo';
import type { FoodLogHistoryRepo } from '../storage/repos/foodLogHistoryRepo';
import type { PlaisirRepo } from '../storage/repos/plaisirRepo';

export interface DayTrackingRepos {
  dayHistory: DayHistoryRepo;
  sport: SportRepo;
  foodLog: FoodLogRepo;
  foodLogHistory: FoodLogHistoryRepo;
  plaisir: PlaisirRepo;
}

export interface DaySnapshot {
  dayType: DayTypeResult;
  macros: MacroResult;
  current: DayEntry;
}

// Fallback burn estimate — combined steps+sport, else Health Connect active-calories +
// steps, else null. Same branches as the original minus the dropped HA total_calories delta.
function computeBurnedToday(stepKcal: number | null, sportKcal: number | null, activeCaloriesKcal: number | null): number | null {
  const combined = (stepKcal || 0) + (sportKcal || 0);
  if (combined > 0) return combined;
  if (activeCaloriesKcal !== null) return activeCaloriesKcal + (stepKcal || 0);
  return null;
}

async function archiveIfDateRolledOver(repos: DayTrackingRepos, todayKey: string): Promise<void> {
  const last = await repos.dayHistory.loadCurrentDay();
  if (!last || last.date === todayKey) return;

  const history = await repos.dayHistory.loadHistory();
  if (history.some((e) => e.date === last.date)) return;

  // pull a pre-planned sport_kcal from sport_plan if the snapshot didn't have one
  if (last.sport_kcal === null || last.sport_kcal === undefined) {
    const plan = await repos.sport.loadSportPlan();
    if (plan[last.date] !== undefined) {
      last.sport_kcal = plan[last.date];
      last.burned_today = (last.step_kcal || 0) + last.sport_kcal;
    }
  }
  await repos.dayHistory.saveHistory([last, ...history]);

  // food_log_today only ever tracked the day's aggregate totals in day_history above — the
  // actual line items were about to be silently discarded (loadToday() would just start
  // returning a fresh in-memory log for the new date without this). Archive them into
  // food_log_history before that happens, then reset the live key: previously it kept
  // yesterday's raw entries on disk in a stale, ambient state until the next save overwrote
  // them, whenever that happened to occur.
  const rawLog = await repos.foodLog.loadRaw();
  if (rawLog && rawLog.date === last.date) {
    await repos.foodLogHistory.archiveDay(last.date, rawLog.entries);
  }
  await repos.foodLog.saveToday({ date: todayKey, entries: [] });
}

export async function refreshDaySnapshot(
  repos: DayTrackingRepos,
  profile: Profile,
  signals: DayTypeSignals,
  weightKg: number,
  now: Date = new Date(),
): Promise<DaySnapshot> {
  const todayKey = formatDateKey(now);
  await archiveIfDateRolledOver(repos, todayKey);

  const overrides: PlaisirOverrides = await repos.plaisir.loadOverrides(now);
  const dayType = detectDayType(signals, weightKg, profile, DEFAULT_THRESHOLDS, DEFAULT_DAY_SCHEDULE, overrides, now);

  const stepKcal = signals.steps !== null ? stepsToActiveKcal(signals.steps, weightKg, profile) : null;
  const burnedToday = computeBurnedToday(stepKcal, signals.sportKcal, signals.activeCaloriesKcal);

  const foodLog = await repos.foodLog.loadToday(now);
  const foodTotals = foodLog.entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein_g: acc.protein_g + e.protein_g,
      fat_g: acc.fat_g + e.fat_g,
      carb_g: acc.carb_g + e.carb_g,
    }),
    { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
  );

  const current: DayEntry = {
    date: todayKey,
    dayType: dayType.type,
    weight_kg: weightKg,
    steps: signals.steps,
    step_kcal: stepKcal,
    sport_kcal: signals.sportKcal,
    active_cal: signals.activeCaloriesKcal,
    total_cal: null,
    burned_today: burnedToday,
    food_kcal: foodTotals.kcal,
    food_protein_g: foodTotals.protein_g,
    food_fat_g: foodTotals.fat_g,
    food_carb_g: foodTotals.carb_g,
  };
  await repos.dayHistory.saveCurrentDay(current);

  const macros = calcMacros(dayType.type, weightKg, profile);
  return { dayType, macros, current };
}
