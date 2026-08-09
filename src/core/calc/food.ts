// SPDX-License-Identifier: GPL-3.0-or-later
import type { Per100 } from '../types';

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
