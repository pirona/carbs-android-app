// SPDX-License-Identifier: GPL-3.0-or-later
import type { Profile } from '../types';

// Mifflin-St Jeor. Verbatim port of carb-cycling.html:435-439.
export function calcBMR(weightKg: number, profile: Pick<Profile, 'height_cm' | 'age' | 'sex'>): number {
  const { height_cm, age, sex } = profile;
  const base = 10 * weightKg + 6.25 * height_cm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}
