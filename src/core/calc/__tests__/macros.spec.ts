// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { calcMacros, stepsToActiveKcal } from '../macros';
import { TEST_PROFILE } from './testProfile';

describe('stepsToActiveKcal', () => {
  it('round(steps * weight_kg * 0.000413)', () => {
    expect(stepsToActiveKcal(10000, 90, TEST_PROFILE)).toBe(372);
  });

  it('falls back to profile.weight_default_kg when weightKg is falsy', () => {
    // round(10000 * 121 * 0.000413) = round(499.73) = 500
    expect(stepsToActiveKcal(10000, 0, TEST_PROFILE)).toBe(500);
  });
});

// Hand-computed from carb-cycling.html:448-490, weight=90, TEST_PROFILE (male/185/44):
// bmr = 1841.25 -> rounded 1841
// tdee   = { high: 3241, medium: 2591, low: 2041 }
// targets = { high: 2591, medium: 1941, low: 1391 }
describe('calcMacros', () => {
  it('high: fat fixed, carbs by subtraction (no floor)', () => {
    const m = calcMacros('high', 90, TEST_PROFILE);
    expect(m.bmr).toBe(1841);
    expect(m.tdee).toEqual({ high: 3241, medium: 2591, low: 2041 });
    expect(m.targets).toEqual({ high: 2591, medium: 1941, low: 1391 });
    expect(m.kcal).toBe(2591);
    expect(m.protein_g).toBe(144);
    expect(m.protein_kcal).toBe(576);
    expect(m.fat_g).toBe(75);
    expect(m.fat_kcal).toBe(675);
    expect(m.carb_g).toBe(335);
    expect(m.carb_kcal).toBe(1340);
  });

  it('medium: fat fixed, carbs by subtraction (no floor)', () => {
    const m = calcMacros('medium', 90, TEST_PROFILE);
    expect(m.kcal).toBe(1941);
    expect(m.fat_g).toBe(80);
    expect(m.fat_kcal).toBe(720);
    expect(m.carb_g).toBe(161);
    expect(m.carb_kcal).toBe(644);
  });

  it('low: carb floor (130g) kicks in, fat reduced to compensate', () => {
    const m = calcMacros('low', 90, TEST_PROFILE);
    expect(m.kcal).toBe(1391);
    // unfloored carb_g would be round((1391-576-405)/4) = 103 < MIN_CARB(130)
    expect(m.carb_g).toBe(130);
    expect(m.carb_kcal).toBe(520);
    expect(m.fat_kcal).toBe(295);
    expect(m.fat_g).toBe(33);
  });

  it('plaisir: nulls out macro tracking but still returns bmr/protein/tdee/targets', () => {
    const m = calcMacros('plaisir', 90, TEST_PROFILE);
    expect(m.kcal).toBeNull();
    expect(m.fat_g).toBeNull();
    expect(m.fat_kcal).toBeNull();
    expect(m.carb_g).toBeNull();
    expect(m.carb_kcal).toBeNull();
    expect(m.protein_g).toBe(144);
    expect(m.protein_kcal).toBe(576);
    expect(m.bmr).toBe(1841);
    expect(m.tdee).toEqual({ high: 3241, medium: 2591, low: 2041 });
  });
});
