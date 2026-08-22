// SPDX-License-Identifier: GPL-3.0-or-later
// Stats + completeness for an arbitrary date range (week/month presets or a fully custom
// range — see ConseilsScreen) — a generalization of calcWeekRealDeficit/calcProgramFidelity,
// which are both hardcoded to "the trailing 7 days ending today". Real deficit uses the same
// BMR + burned_today - food_kcal formula per tracked day; day-type counts and macro averages
// come straight from the already-persisted DayEntry aggregates (kept in sync by DayScreen's
// rollover archival and, for a past day, ConseilsScreen's "add missed food" flow).
import type { DayEntry, DayType, Profile } from '../types';
import { calcBMR } from './bmr';
import { formatDateKey } from './date';

export interface PeriodStats {
  totalDays: number;
  trackedDays: number;
  realDeficitKcal: number;
  avgFoodKcal: number | null;
  avgProteinG: number | null;
  avgFatG: number | null;
  avgCarbG: number | null;
  weightStartKg: number | null;
  weightEndKg: number | null;
  weightDeltaKg: number | null;
  dayTypeCounts: Record<DayType, number>;
}

export interface PeriodCompleteness {
  tracked_days: number;
  total_days: number;
  complete: boolean;
}

const MIN_TRACKED_RATIO = 0.7;

function daysBetweenInclusive(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function calcPeriodStats(
  dayHistory: DayEntry[],
  currentDay: DayEntry | null,
  startDate: string,
  endDate: string,
  profile: Pick<Profile, 'height_cm' | 'age' | 'sex'>,
): PeriodStats {
  const byDate = new Map<string, DayEntry>();
  dayHistory.forEach((e) => {
    if (!byDate.has(e.date)) byDate.set(e.date, e);
  });
  if (currentDay?.date) byDate.set(currentDay.date, currentDay);

  const inRange = [...byDate.values()].filter((e) => e.date >= startDate && e.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));

  let trackedDays = 0;
  let realDeficitKcal = 0;
  let sumFoodKcal = 0;
  let sumProtein = 0;
  let sumFat = 0;
  let sumCarb = 0;
  const dayTypeCounts: Record<DayType, number> = { high: 0, medium: 0, low: 0, plaisir: 0 };
  let weightStartKg: number | null = null;
  let weightEndKg: number | null = null;

  for (const e of inRange) {
    if (e.weight_kg != null) {
      if (weightStartKg === null) weightStartKg = e.weight_kg;
      weightEndKg = e.weight_kg;
    }
    if (e.food_kcal == null || e.burned_today == null || e.weight_kg == null) continue;
    trackedDays++;
    realDeficitKcal += calcBMR(e.weight_kg, profile) + e.burned_today - e.food_kcal;
    sumFoodKcal += e.food_kcal;
    sumProtein += e.food_protein_g ?? 0;
    sumFat += e.food_fat_g ?? 0;
    sumCarb += e.food_carb_g ?? 0;
    dayTypeCounts[e.dayType]++;
  }

  return {
    totalDays: Math.max(0, daysBetweenInclusive(startDate, endDate)),
    trackedDays,
    realDeficitKcal: Math.round(realDeficitKcal),
    avgFoodKcal: trackedDays > 0 ? Math.round(sumFoodKcal / trackedDays) : null,
    avgProteinG: trackedDays > 0 ? Math.round((sumProtein / trackedDays) * 10) / 10 : null,
    avgFatG: trackedDays > 0 ? Math.round((sumFat / trackedDays) * 10) / 10 : null,
    avgCarbG: trackedDays > 0 ? Math.round((sumCarb / trackedDays) * 10) / 10 : null,
    weightStartKg,
    weightEndKg,
    weightDeltaKg: weightStartKg != null && weightEndKg != null ? Math.round((weightEndKg - weightStartKg) * 100) / 100 : null,
    dayTypeCounts,
  };
}

export function assessPeriodCompleteness(stats: Pick<PeriodStats, 'trackedDays' | 'totalDays'>): PeriodCompleteness {
  return {
    tracked_days: stats.trackedDays,
    total_days: stats.totalDays,
    complete: stats.totalDays > 0 && stats.trackedDays / stats.totalDays >= MIN_TRACKED_RATIO,
  };
}

export interface DateRange {
  start: string;
  end: string;
}

function mondayOf(d: Date): Date {
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return monday;
}

// Quick-fill presets for the period picker — always land on real calendar boundaries, the
// free-text date inputs stay editable for anything else ("plage personnalisée").
export function thisWeekRange(now: Date): DateRange {
  return { start: formatDateKey(mondayOf(now)), end: formatDateKey(now) };
}

export function lastWeekRange(now: Date): DateRange {
  const thisMonday = mondayOf(now);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  return { start: formatDateKey(lastMonday), end: formatDateKey(lastSunday) };
}

export function thisMonthRange(now: Date): DateRange {
  return { start: formatDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), end: formatDateKey(now) };
}

export function lastMonthRange(now: Date): DateRange {
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfLastMonth = new Date(firstOfThisMonth.getTime() - 86_400_000);
  const firstOfLastMonth = new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), 1);
  return { start: formatDateKey(firstOfLastMonth), end: formatDateKey(lastOfLastMonth) };
}
