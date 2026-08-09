// SPDX-License-Identifier: GPL-3.0-or-later
import type { DayType, PlaisirOverrides, Profile, Thresholds } from '../types';
import { PLAISIR_LEVELS } from '../types';
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

export interface DayTypeResult {
  type: DayType;
  source: string;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
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
  const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

  // 0 — Override plaisir manuel (semainier)
  const todayLevel = overrides.levels[formatDateKey(today)];
  if (todayLevel) {
    const lvl = PLAISIR_LEVELS[todayLevel];
    return { type: 'plaisir', source: `semainier — ${lvl?.label ?? ''} (${lvl?.kcal ?? 0} kcal)` };
  }

  // 1 — Combiné : kcal pas estimées + kcal sport saisies (branche primaire)
  if (signals.steps !== null || signals.sportKcal !== null) {
    const stepKcal = signals.steps !== null ? stepsToActiveKcal(signals.steps, wkg, profile) : 0;
    const sportKcal = signals.sportKcal !== null ? signals.sportKcal : 0;
    const total = stepKcal + sportKcal;
    const parts: string[] = [];
    if (signals.steps !== null) parts.push(`${fmt(signals.steps)} pas (~${fmt(stepKcal)} kcal)`);
    if (signals.sportKcal !== null) parts.push(`${fmt(sportKcal)} kcal sport`);
    const src = `${parts.join(' + ')} = ~${fmt(total)} kcal actives`;
    if (total > t.high_active_kcal) return { type: 'high', source: src };
    if (total > t.medium_active_kcal) return { type: 'medium', source: src };
    return { type: 'low', source: src };
  }

  // 2 — Calories actives directes (Health Connect, signal secondaire)
  if (signals.activeCaloriesKcal !== null) {
    const stepKcal = signals.steps !== null ? stepsToActiveKcal(signals.steps, wkg, profile) : 0;
    const total = signals.activeCaloriesKcal + stepKcal;
    const src =
      signals.steps !== null
        ? `actives ${fmt(signals.activeCaloriesKcal)} + pas ~${fmt(stepKcal)} = ~${fmt(total)} kcal`
        : `actives ${fmt(signals.activeCaloriesKcal)} kcal`;
    if (total > t.high_active_kcal) return { type: 'high', source: src };
    if (total > t.medium_active_kcal) return { type: 'medium', source: src };
    return { type: 'low', source: src };
  }

  // 3 — Minutes exercice
  if (signals.exerciseMin !== null) {
    if (signals.exerciseMin > t.high_exercise_min)
      return { type: 'high', source: `${Math.round(signals.exerciseMin)} min exercice` };
    if (signals.exerciseMin > t.medium_exercise_min)
      return { type: 'medium', source: `${Math.round(signals.exerciseMin)} min exercice` };
    return { type: 'low', source: `${Math.round(signals.exerciseMin)} min exercice (faible)` };
  }

  // 4 — Fallback planning semaine
  const dow = today.getDay();
  return { type: schedule[dow] ?? 'medium', source: `planning semaine (${DAYS[dow]})` };
}
