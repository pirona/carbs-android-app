// SPDX-License-Identifier: GPL-3.0-or-later
import type { Profile } from '../types';

export interface WeightGoalProgress {
  lost: number;
  total: number;
  pct: number;
  remain: number;
}

// Verbatim port of the math in carb-cycling.html:1917-1943 (renderWeightGoal),
// extracted from its HTML rendering. Returns null when start/goal aren't set,
// matching the original's `if (!start || !goal) return ""`.
export function calcWeightGoalProgress(
  profile: Pick<Profile, 'weight_start_kg' | 'weight_goal_kg'>,
  weightKg: number,
): WeightGoalProgress | null {
  const { weight_start_kg: start, weight_goal_kg: goal } = profile;
  if (!start || !goal) return null;

  const lost = +(start - weightKg).toFixed(1);
  const total = start - goal;
  const pct = Math.min(100, Math.max(0, +((lost / total) * 100).toFixed(1)));
  const remain = +Math.max(0, weightKg - goal).toFixed(1);

  return { lost, total, pct, remain };
}
