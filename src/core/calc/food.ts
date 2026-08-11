// SPDX-License-Identifier: GPL-3.0-or-later
import type { Per100 } from '../types';

// Atwater energy factors (kcal/g) — protein 4, fat 9, carb 4. Used to suggest kcal/100g
// from the 3 macro fields on manual food entry; the field stays user-editable since a
// printed label's own kcal figure (fiber/rounding) can differ slightly from this estimate.
export function kcalFromMacros(protein_g: number, fat_g: number, carb_g: number): number {
  return Math.round((protein_g || 0) * 4 + (fat_g || 0) * 9 + (carb_g || 0) * 4);
}

// Verbatim port of carb-cycling.html:1065-1073.
export function computeFoodMacros(
  per100: Per100,
  portionG: number,
): { kcal: number; protein_g: number; fat_g: number; carb_g: number } {
  const f = (v: number | undefined) => Math.round(((v || 0) * portionG) / 100 * 10) / 10;
  return {
    kcal: Math.round(((per100.kcal || 0) * portionG) / 100),
    protein_g: f(per100.protein_g),
    fat_g: f(per100.fat_g),
    carb_g: f(per100.carb_g),
  };
}
