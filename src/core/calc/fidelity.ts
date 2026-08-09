// SPDX-License-Identifier: GPL-3.0-or-later
import type { DayEntry, Profile } from '../types';
import { calcMacros } from './macros';
import { formatDateKey } from './date';

export interface ProgramFidelity {
  tracked: number;
  onTarget: number;
  fidelityPct: number | null;
  avgDevPct: number | null;
}

const TOLERANCE = 0.15;

// Trailing 7 days (today inclusive), excludes "plaisir" days and days without a
// weight_kg/food_kcal, compares actual food_kcal to the macro target recomputed
// retroactively for that day's dayType+weight_kg. Verbatim port of
// carb-cycling.html:2078-2110.
export function calcProgramFidelity(
  dayHistory: DayEntry[],
  currentDay: DayEntry | null,
  now: Date,
  profile: Pick<Profile, 'height_cm' | 'age' | 'sex'>,
): ProgramFidelity {
  const todayStr = formatDateKey(now);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 6);
  const cutoffStr = formatDateKey(cutoff);

  const byDate: Record<string, DayEntry> = {};
  dayHistory.forEach((e) => {
    if (!byDate[e.date]) byDate[e.date] = e;
  });
  if (currentDay && currentDay.date) byDate[currentDay.date] = currentDay;

  let tracked = 0;
  let onTarget = 0;
  let sumDevPct = 0;
  Object.values(byDate).forEach((e) => {
    if (!e.date || e.date < cutoffStr || e.date > todayStr) return;
    if (e.dayType === 'plaisir' || !e.dayType || !e.weight_kg) return;
    if (e.food_kcal === undefined || e.food_kcal === null) return;
    const m = calcMacros(e.dayType, e.weight_kg, profile);
    if (!m.kcal) return;
    tracked++;
    const devPct = Math.abs(e.food_kcal - m.kcal) / m.kcal;
    sumDevPct += devPct;
    if (devPct <= TOLERANCE) onTarget++;
  });

  return {
    tracked,
    onTarget,
    fidelityPct: tracked > 0 ? Math.round((onTarget / tracked) * 100) : null,
    avgDevPct: tracked > 0 ? Math.round((sumDevPct / tracked) * 100) : null,
  };
}
