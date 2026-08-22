// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { calcPeriodStats, assessPeriodCompleteness, thisWeekRange, lastWeekRange, thisMonthRange, lastMonthRange } from '../periodBilan';
import type { DayEntry } from '../../types';
import { TEST_PROFILE } from './testProfile';

function day(date: string, overrides: Partial<DayEntry> = {}): DayEntry {
  return {
    date,
    dayType: 'medium',
    weight_kg: 80,
    steps: 8000,
    step_kcal: 300,
    sport_kcal: 0,
    active_cal: null,
    total_cal: null,
    burned_today: 300,
    food_kcal: 1800,
    food_protein_g: 100,
    food_fat_g: 60,
    food_carb_g: 180,
    ...overrides,
  };
}

describe('calcPeriodStats', () => {
  it('sums real deficit and averages macros only over tracked days in range', () => {
    const history = [day('2026-08-03', { weight_kg: 79 }), day('2026-08-02'), day('2026-08-01', { weight_kg: 81 }), day('2026-07-31')];
    const stats = calcPeriodStats(history, null, '2026-08-01', '2026-08-03', TEST_PROFILE);
    expect(stats.totalDays).toBe(3);
    expect(stats.trackedDays).toBe(3);
    expect(stats.avgFoodKcal).toBe(1800);
    expect(stats.weightStartKg).toBe(81);
    expect(stats.weightEndKg).toBe(79);
    expect(stats.weightDeltaKg).toBe(-2);
  });

  it('excludes days missing weight/burned/food from tracked count and averages', () => {
    const history = [day('2026-08-01'), day('2026-08-02', { food_kcal: null }), day('2026-08-03')];
    const stats = calcPeriodStats(history, null, '2026-08-01', '2026-08-03', TEST_PROFILE);
    expect(stats.totalDays).toBe(3);
    expect(stats.trackedDays).toBe(2);
  });

  it('counts day types only among tracked days', () => {
    const history = [day('2026-08-01', { dayType: 'high' }), day('2026-08-02', { dayType: 'low' }), day('2026-08-03', { dayType: 'high' })];
    const stats = calcPeriodStats(history, null, '2026-08-01', '2026-08-03', TEST_PROFILE);
    expect(stats.dayTypeCounts).toEqual({ high: 2, medium: 0, low: 1, plaisir: 0 });
  });

  it('includes currentDay when its date falls in range and is not already in history', () => {
    const history = [day('2026-08-01')];
    const current = day('2026-08-02', { weight_kg: 78 });
    const stats = calcPeriodStats(history, current, '2026-08-01', '2026-08-02', TEST_PROFILE);
    expect(stats.trackedDays).toBe(2);
    expect(stats.weightEndKg).toBe(78);
  });

  it('returns null averages and weights when nothing is tracked in range', () => {
    const stats = calcPeriodStats([], null, '2026-08-01', '2026-08-03', TEST_PROFILE);
    expect(stats.trackedDays).toBe(0);
    expect(stats.avgFoodKcal).toBeNull();
    expect(stats.weightStartKg).toBeNull();
    expect(stats.weightDeltaKg).toBeNull();
  });
});

describe('assessPeriodCompleteness', () => {
  it('is complete at or above the 70% tracked-days ratio', () => {
    expect(assessPeriodCompleteness({ trackedDays: 5, totalDays: 7 }).complete).toBe(true);
    expect(assessPeriodCompleteness({ trackedDays: 7, totalDays: 7 }).complete).toBe(true);
  });

  it('is incomplete below the 70% ratio', () => {
    expect(assessPeriodCompleteness({ trackedDays: 4, totalDays: 7 }).complete).toBe(false);
  });

  it('is incomplete for a zero-length range', () => {
    expect(assessPeriodCompleteness({ trackedDays: 0, totalDays: 0 }).complete).toBe(false);
  });
});

describe('date range presets', () => {
  // Wednesday 2026-08-12
  const wed = new Date(2026, 7, 12);

  it('thisWeekRange spans Monday of this week through today', () => {
    expect(thisWeekRange(wed)).toEqual({ start: '2026-08-10', end: '2026-08-12' });
  });

  it('lastWeekRange spans the full previous Monday-Sunday', () => {
    expect(lastWeekRange(wed)).toEqual({ start: '2026-08-03', end: '2026-08-09' });
  });

  it('thisMonthRange spans the 1st of this month through today', () => {
    expect(thisMonthRange(wed)).toEqual({ start: '2026-08-01', end: '2026-08-12' });
  });

  it('lastMonthRange spans the full previous calendar month', () => {
    expect(lastMonthRange(wed)).toEqual({ start: '2026-07-01', end: '2026-07-31' });
  });

  it('lastMonthRange handles a January "now" (crosses year boundary)', () => {
    const jan = new Date(2026, 0, 15);
    expect(lastMonthRange(jan)).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });
});
