// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { detectDayType, type DayTypeSignals } from '../dayType';
import { DEFAULT_DAY_SCHEDULE, DEFAULT_THRESHOLDS, type PlaisirOverrides } from '../../types';
import { TEST_PROFILE } from './testProfile';

const NO_SIGNALS: DayTypeSignals = {
  steps: null,
  sportKcal: null,
  activeCaloriesKcal: null,
  exerciseMin: null,
};
const NO_OVERRIDES: PlaisirOverrides = { week: 1, year: 2026, levels: {} };

describe('detectDayType', () => {
  it('branch 0: manual plaisir override wins over everything else', () => {
    const today = new Date(2026, 7, 12);
    const overrides: PlaisirOverrides = {
      week: 33,
      year: 2026,
      levels: { '2026-08-12': 'moyen' },
    };
    const signals: DayTypeSignals = { ...NO_SIGNALS, steps: 20000 }; // would otherwise be "high"
    const result = detectDayType(
      signals,
      90,
      TEST_PROFILE,
      DEFAULT_THRESHOLDS,
      DEFAULT_DAY_SCHEDULE,
      overrides,
      today,
    );
    expect(result.type).toBe('plaisir');
  });

  it('branch 1 (primary): steps + sport_kcal vs thresholds', () => {
    // stepKcal = stepsToActiveKcal(10000, 90) = 372; +200 sport = 572 -> medium (>300, <=600)
    const signals: DayTypeSignals = { ...NO_SIGNALS, steps: 10000, sportKcal: 200 };
    const result = detectDayType(
      signals,
      90,
      TEST_PROFILE,
      DEFAULT_THRESHOLDS,
      DEFAULT_DAY_SCHEDULE,
      NO_OVERRIDES,
      new Date(2026, 7, 12),
    );
    expect(result.type).toBe('medium');
  });

  it('branch 1 fires on high total (steps+sport > 600)', () => {
    const signals: DayTypeSignals = { ...NO_SIGNALS, steps: 20000, sportKcal: 300 };
    const result = detectDayType(
      signals,
      90,
      TEST_PROFILE,
      DEFAULT_THRESHOLDS,
      DEFAULT_DAY_SCHEDULE,
      NO_OVERRIDES,
      new Date(2026, 7, 12),
    );
    expect(result.type).toBe('high');
  });

  it('branch 2 (secondary/Health Connect): active calories only, since steps/sport are both null', () => {
    const signals: DayTypeSignals = { ...NO_SIGNALS, activeCaloriesKcal: 700 };
    const result = detectDayType(
      signals,
      90,
      TEST_PROFILE,
      DEFAULT_THRESHOLDS,
      DEFAULT_DAY_SCHEDULE,
      NO_OVERRIDES,
      new Date(2026, 7, 12),
    );
    expect(result.type).toBe('high');
  });

  it('branch 3: exercise minutes only', () => {
    const signals: DayTypeSignals = { ...NO_SIGNALS, exerciseMin: 50 };
    const result = detectDayType(
      signals,
      90,
      TEST_PROFILE,
      DEFAULT_THRESHOLDS,
      DEFAULT_DAY_SCHEDULE,
      NO_OVERRIDES,
      new Date(2026, 7, 12),
    );
    expect(result.type).toBe('medium');
  });

  it('branch 4: falls back to the weekly schedule when no signal is available', () => {
    const today = new Date(2026, 7, 12);
    const result = detectDayType(
      NO_SIGNALS,
      90,
      TEST_PROFILE,
      DEFAULT_THRESHOLDS,
      DEFAULT_DAY_SCHEDULE,
      NO_OVERRIDES,
      today,
    );
    expect(result.type).toBe(DEFAULT_DAY_SCHEDULE[today.getDay()]);
  });
});
