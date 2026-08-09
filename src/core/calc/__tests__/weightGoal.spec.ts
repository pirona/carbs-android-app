// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { calcWeightGoalProgress } from '../weightGoal';
import { TEST_PROFILE } from './testProfile';

describe('calcWeightGoalProgress', () => {
  it('computes lost/total/pct/remain (start 121, goal 90, current 100)', () => {
    const p = calcWeightGoalProgress(TEST_PROFILE, 100);
    expect(p).toEqual({ lost: 21, total: 31, pct: 67.7, remain: 10 });
  });

  it('clamps pct to 0 when the user is above their start weight', () => {
    const p = calcWeightGoalProgress(TEST_PROFILE, 130);
    expect(p?.pct).toBe(0);
    expect(p?.remain).toBe(40);
  });

  it('clamps pct to 100 and remain to 0 once past the goal', () => {
    const p = calcWeightGoalProgress(TEST_PROFILE, 80);
    expect(p?.pct).toBe(100);
    expect(p?.remain).toBe(0);
  });

  it('returns null when start or goal is unset', () => {
    expect(calcWeightGoalProgress({ weight_start_kg: 0, weight_goal_kg: 90 }, 100)).toBeNull();
  });
});
