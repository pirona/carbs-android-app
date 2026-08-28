// SPDX-License-Identifier: GPL-3.0-or-later
import type { DayType, PlaisirLevel, PlaisirOverrides, Profile, Thresholds } from '../types';
import { formatDateKey } from './date';
import { stepsToActiveKcal } from './macros';

export interface DayTypeSignals {
  steps: number | null;
  sportKcal: number | null;
  // Health Connect active-calories record — optional secondary signal only,
  // never load-bearing (see plan §Moteur de calcul / known Samsung Health freeze).
  activeCaloriesKcal: number | null;
  exerciseMin: number | null;
}

// Structured instead of a pre-built French sentence — this is core/ logic, no i18n dependency
// here; the UI layer (DayScreen.ts) turns this into text via t(), so the same signals render in
// whichever language is active. Never persisted (see DaySnapshot/DayEntry — only `.type` is
// written to storage), so this shape is free to change without a data migration.
export type DayTypeSource =
  | { kind: 'plaisirOverride'; level: PlaisirLevel }
  | { kind: 'stepsAndSport'; steps: number | null; stepKcal: number; sportKcal: number | null; total: number }
  | { kind: 'activeCalories'; steps: number | null; stepKcal: number; activeKcal: number; total: number }
  | { kind: 'exerciseMin'; min: number; low: boolean }
  | { kind: 'weekSchedule'; dow: number };

export interface DayTypeResult {
  type: DayType;
  source: DayTypeSource;
}

// Port of carb-cycling.html:554-624, with branch 1 (HA `total_calories` sensor delta,
// carb-cycling.html:566-584) removed — no HA dependency in this app. Everything else
// (including the branch numbering/order) is preserved verbatim. See plan §Moteur de
// calcul for the rationale.
export function detectDayType(
  signals: DayTypeSignals,
  weightKg: number,
  profile: Pick<Profile, 'weight_default_kg'>,
  thresholds: Thresholds,
  schedule: Record<number, DayType>,
  overrides: PlaisirOverrides,
  today: Date,
): DayTypeResult {
  const t = thresholds;
  const wkg = weightKg || profile.weight_default_kg;

  // 0 — Override plaisir manuel (semainier)
  const todayLevel = overrides.levels[formatDateKey(today)];
  if (todayLevel) {
    return { type: 'plaisir', source: { kind: 'plaisirOverride', level: todayLevel } };
  }

  // 1 — Combiné : kcal pas estimées + kcal sport saisies (branche primaire)
  if (signals.steps !== null || signals.sportKcal !== null) {
    const stepKcal = signals.steps !== null ? stepsToActiveKcal(signals.steps, wkg, profile) : 0;
    const sportKcal = signals.sportKcal !== null ? signals.sportKcal : 0;
    const total = stepKcal + sportKcal;
    const src: DayTypeSource = { kind: 'stepsAndSport', steps: signals.steps, stepKcal, sportKcal: signals.sportKcal, total };
    if (total > t.high_active_kcal) return { type: 'high', source: src };
    if (total > t.medium_active_kcal) return { type: 'medium', source: src };
    return { type: 'low', source: src };
  }

  // 2 — Calories actives directes (Health Connect, signal secondaire)
  if (signals.activeCaloriesKcal !== null) {
    const stepKcal = signals.steps !== null ? stepsToActiveKcal(signals.steps, wkg, profile) : 0;
    const total = signals.activeCaloriesKcal + stepKcal;
    const src: DayTypeSource = { kind: 'activeCalories', steps: signals.steps, stepKcal, activeKcal: signals.activeCaloriesKcal, total };
    if (total > t.high_active_kcal) return { type: 'high', source: src };
    if (total > t.medium_active_kcal) return { type: 'medium', source: src };
    return { type: 'low', source: src };
  }

  // 3 — Minutes exercice
  if (signals.exerciseMin !== null) {
    const min = Math.round(signals.exerciseMin);
    if (signals.exerciseMin > t.high_exercise_min) return { type: 'high', source: { kind: 'exerciseMin', min, low: false } };
    if (signals.exerciseMin > t.medium_exercise_min) return { type: 'medium', source: { kind: 'exerciseMin', min, low: false } };
    return { type: 'low', source: { kind: 'exerciseMin', min, low: true } };
  }

  // 4 — Fallback planning semaine
  const dow = today.getDay();
  return { type: schedule[dow] ?? 'medium', source: { kind: 'weekSchedule', dow } };
}
