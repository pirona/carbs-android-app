// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { calcProgramFidelity } from '../fidelity';
import type { DayEntry } from '../../types';
import { TEST_PROFILE } from './testProfile';

function entry(partial: Partial<DayEntry> & { date: string }): DayEntry {
  return {
    dayType: 'medium',
    weight_kg: null,
    steps: null,
    step_kcal: null,
    sport_kcal: null,
    active_cal: null,
    total_cal: null,
    burned_today: null,
    food_kcal: null,
    food_protein_g: null,
    food_fat_g: null,
    food_carb_g: null,
    ...partial,
  };
}

// weight=90 targets (from macros.spec.ts): high=2591, medium=1941, low=1391
const NOW = new Date(2026, 7, 12); // Wed 2026-08-12, cutoff = 2026-08-06

describe('calcProgramFidelity', () => {
  it('computes fidelity/deviation over the trailing 7 days, excluding plaisir days', () => {
    const dayHistory: DayEntry[] = [
      // before cutoff (2026-08-06) -> excluded
      entry({ date: '2026-08-05', dayType: 'high', weight_kg: 90, food_kcal: 2591 }),
      // plaisir -> excluded regardless of food_kcal
      entry({ date: '2026-08-09', dayType: 'plaisir', weight_kg: 90, food_kcal: 5000 }),
      // on target (dev 9/2591 = 0.35%)
      entry({ date: '2026-08-10', dayType: 'high', weight_kg: 90, food_kcal: 2600 }),
      // off target (dev 441/1941 = 22.7% > 15%)
      entry({ date: '2026-08-11', dayType: 'medium', weight_kg: 90, food_kcal: 1500 }),
    ];
    // exactly on target
    const currentDay = entry({ date: '2026-08-12', dayType: 'low', weight_kg: 90, food_kcal: 1391 });

    const result = calcProgramFidelity(dayHistory, currentDay, NOW, TEST_PROFILE);

    expect(result.tracked).toBe(3);
    expect(result.onTarget).toBe(2);
    expect(result.fidelityPct).toBe(67);
    expect(result.avgDevPct).toBe(8);
  });

  it('returns nulls when nothing is tracked', () => {
    const result = calcProgramFidelity([], null, NOW, TEST_PROFILE);
    expect(result.tracked).toBe(0);
    expect(result.fidelityPct).toBeNull();
    expect(result.avgDevPct).toBeNull();
  });
});
