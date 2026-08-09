// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { calcBMR } from '../bmr';
import { TEST_PROFILE } from './testProfile';

describe('calcBMR', () => {
  it('male: 10*w + 6.25*h - 5*age + 5', () => {
    // 10*90 + 6.25*185 - 5*44 + 5 = 900 + 1156.25 - 220 + 5 = 1841.25
    expect(calcBMR(90, TEST_PROFILE)).toBeCloseTo(1841.25, 5);
  });

  it('female: 10*w + 6.25*h - 5*age - 161', () => {
    const female = { height_cm: 165, age: 30, sex: 'female' as const };
    // 10*70 + 6.25*165 - 5*30 - 161 = 700 + 1031.25 - 150 - 161 = 1420.25
    expect(calcBMR(70, female)).toBeCloseTo(1420.25, 5);
  });
});
