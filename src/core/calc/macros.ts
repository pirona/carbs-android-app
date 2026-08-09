// SPDX-License-Identifier: GPL-3.0-or-later
import type { DayType, MacroResult, Profile } from '../types';
import { DEFICIT, FAT_G, MIN_CARB, TDEE_BONUS } from '../types';
import { calcBMR } from './bmr';

// Verbatim port of carb-cycling.html:442-445.
export function stepsToActiveKcal(steps: number, weightKg: number, profile: Pick<Profile, 'weight_default_kg'>): number {
  const wkg = weightKg || profile.weight_default_kg;
  return Math.round(steps * wkg * 0.000413);
}

// Verbatim port of carb-cycling.html:448-490 — fat fixed by day type, carbs by
// subtraction floored at MIN_CARB (ANSES), reducing fat instead if the floor kicks in.
export function calcMacros(
  dayType: DayType,
  weightKg: number,
  profile: Pick<Profile, 'height_cm' | 'age' | 'sex'>,
): MacroResult {
  const bmr = calcBMR(weightKg, profile);

  const tdee = {
    high: Math.round(bmr + TDEE_BONUS.high),
    medium: Math.round(bmr + TDEE_BONUS.medium),
    low: Math.round(bmr + TDEE_BONUS.low),
  };
  const targets = {
    high: Math.round(tdee.high - DEFICIT),
    medium: Math.round(tdee.medium - DEFICIT),
    low: Math.round(tdee.low - DEFICIT),
  };

  const protein_g = Math.round(1.6 * weightKg);
  const protein_kcal = protein_g * 4;

  if (dayType === 'plaisir') {
    return {
      dayType: 'plaisir',
      kcal: null,
      protein_g,
      protein_kcal,
      fat_g: null,
      fat_kcal: null,
      carb_g: null,
      carb_kcal: null,
      bmr: Math.round(bmr),
      weight_kg: weightKg,
      tdee,
      targets,
    };
  }

  const kcal = targets[dayType];
  let fat_g: number = FAT_G[dayType];
  let fat_kcal = fat_g * 9;
  let carb_g = Math.max(0, Math.round((kcal - protein_kcal - fat_kcal) / 4));

  if (carb_g < MIN_CARB) {
    carb_g = MIN_CARB;
    fat_kcal = Math.max(0, kcal - protein_kcal - carb_g * 4);
    fat_g = Math.round(fat_kcal / 9);
  }
  const carb_kcal = carb_g * 4;

  return {
    dayType,
    kcal,
    protein_g,
    protein_kcal,
    fat_g,
    fat_kcal,
    carb_g,
    carb_kcal,
    bmr: Math.round(bmr),
    weight_kg: weightKg,
    tdee,
    targets,
  };
}
