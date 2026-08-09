// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { computeFoodMacros } from '../food';

describe('computeFoodMacros', () => {
  it('scales per-100g values to the given portion, kcal rounded, macros to 1 decimal', () => {
    const result = computeFoodMacros({ kcal: 250, protein_g: 20, fat_g: 10, carb_g: 30 }, 150);
    expect(result).toEqual({ kcal: 375, protein_g: 30, fat_g: 15, carb_g: 45 });
  });

  it('rounds macro grams to 1 decimal place', () => {
    // protein_g: 13 * 33/100 = 4.29 -> 4.3
    const result = computeFoodMacros({ kcal: 100, protein_g: 13, fat_g: 0, carb_g: 0 }, 33);
    expect(result.protein_g).toBe(4.3);
  });
});
