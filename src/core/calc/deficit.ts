// SPDX-License-Identifier: GPL-3.0-or-later
import type { DayEntry, MacroResult, Profile } from '../types';
import { calcBMR } from './bmr';
import { formatDateKey } from './date';

// Nominal weekly deficit assuming 3 HIGH + 4 MEDIUM days (base planning).
// Verbatim port of carb-cycling.html:1494-1497.
export function calcWeeklyDeficit(macros: Pick<MacroResult, 'tdee' | 'targets'>): number {
  const { tdee, targets } = macros;
  return (tdee.high - targets.high) * 3 + (tdee.medium - targets.medium) * 4;
}

export interface WeekRealDeficit {
  realDeficit: number;
  trackedDays: number;
  isoToday: number;
}

// Real trailing-week deficit = sum over tracked days since Monday of
// (BMR + burned_today) - food_kcal. Only counts days where food_kcal, burned_today
// and weight_kg are all present. Verbatim port of carb-cycling.html:2003-2028.
export function calcWeekRealDeficit(
  dayHistory: DayEntry[],
  currentDay: DayEntry | null,
  now: Date,
  profile: Pick<Profile, 'height_cm' | 'age' | 'sex'>,
): WeekRealDeficit {
  const dow = now.getDay();
  const isoToday = dow === 0 ? 7 : dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));

  const byDate: Record<string, DayEntry> = {};
  dayHistory.forEach((e) => {
    byDate[e.date] = e;
  });
  if (currentDay && currentDay.date) byDate[currentDay.date] = currentDay;

  let realDeficit = 0;
  let trackedDays = 0;
  for (let i = 0; i < isoToday; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = formatDateKey(d);
    const e = byDate[ds];
    if (!e || e.food_kcal == null || e.burned_today == null || !e.weight_kg) continue;
    realDeficit += calcBMR(e.weight_kg, profile) + e.burned_today - e.food_kcal;
    trackedDays++;
  }
  return { realDeficit, trackedDays, isoToday };
}
