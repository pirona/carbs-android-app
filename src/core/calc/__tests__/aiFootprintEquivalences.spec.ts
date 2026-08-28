// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { computeAiFootprintEquivalences, EMAIL_GCO2E, HUMAN_DAILY_WATER_ML, COW_DAILY_WATER_ML } from '../aiFootprintEquivalences';

describe('computeAiFootprintEquivalences', () => {
  it('returns zero for zero input', () => {
    const eq = computeAiFootprintEquivalences(0, 0);
    expect(eq.emailsEquivalent).toBe(0);
    expect(eq.humanDaysWater).toBe(0);
    expect(eq.cowDailyWaterPercent).toBe(0);
  });

  it('converts gCO2e to an email-count equivalent using the sourced factor', () => {
    const eq = computeAiFootprintEquivalences(EMAIL_GCO2E * 10, 0);
    expect(eq.emailsEquivalent).toBeCloseTo(10, 5);
  });

  it('converts mL water to a fraction of a human adult daily need', () => {
    const eq = computeAiFootprintEquivalences(0, HUMAN_DAILY_WATER_ML * 2);
    expect(eq.humanDaysWater).toBeCloseTo(2, 5);
  });

  it('converts mL water to a percentage of a dairy cow daily need', () => {
    const eq = computeAiFootprintEquivalences(0, COW_DAILY_WATER_ML / 4);
    expect(eq.cowDailyWaterPercent).toBeCloseTo(25, 5);
  });
});
