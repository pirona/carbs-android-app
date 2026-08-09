// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { calcWeekRealDeficit, calcWeeklyDeficit } from '../deficit';
import type { DayEntry } from '../../types';
import { TEST_PROFILE } from './testProfile';

describe('calcWeeklyDeficit', () => {
  it('(tdee.high - targets.high)*3 + (tdee.medium - targets.medium)*4', () => {
    const macros = {
      tdee: { high: 3241, medium: 2591, low: 2041 },
      targets: { high: 2591, medium: 1941, low: 1391 },
    };
    // (3241-2591)*3 + (2591-1941)*4 = 650*3 + 650*4 = 1950 + 2600 = 4550
    expect(calcWeeklyDeficit(macros)).toBe(4550);
  });
});

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

// 2026-08-12 is a Wednesday -> Monday of that week is 2026-08-10, isoToday = 3.
const WEDNESDAY = new Date(2026, 7, 12);

describe('calcWeekRealDeficit', () => {
  it('sums (BMR(weight) + burned_today) - food_kcal over tracked days since Monday', () => {
    const dayHistory: DayEntry[] = [
      entry({ date: '2026-08-10', weight_kg: 95, burned_today: 2500, food_kcal: 2000 }),
      entry({ date: '2026-08-11', weight_kg: 94, burned_today: 2400, food_kcal: 2100 }),
    ];
    const currentDay = entry({ date: '2026-08-12', weight_kg: 94, burned_today: 2300, food_kcal: 1900 });

    const result = calcWeekRealDeficit(dayHistory, currentDay, WEDNESDAY, TEST_PROFILE);

    expect(result.isoToday).toBe(3);
    expect(result.trackedDays).toBe(3);
    // BMR(95)=1891.25, BMR(94)=1881.25 (twice)
    // (1891.25+2500-2000) + (1881.25+2400-2100) + (1881.25+2300-1900)
    // = 2391.25 + 2181.25 + 2281.25 = 6853.75
    expect(result.realDeficit).toBeCloseTo(6853.75, 5);
  });

  it('skips days missing food_kcal, burned_today or weight_kg', () => {
    const dayHistory: DayEntry[] = [
      entry({ date: '2026-08-10', weight_kg: 95, burned_today: 2500, food_kcal: 2000 }),
      entry({ date: '2026-08-11', weight_kg: 94, burned_today: 2400, food_kcal: 2100 }),
    ];
    const currentDay = entry({ date: '2026-08-12', weight_kg: 94, burned_today: 2300, food_kcal: null });

    const result = calcWeekRealDeficit(dayHistory, currentDay, WEDNESDAY, TEST_PROFILE);

    expect(result.trackedDays).toBe(2);
  });
});
