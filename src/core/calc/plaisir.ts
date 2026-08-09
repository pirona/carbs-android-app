// SPDX-License-Identifier: GPL-3.0-or-later
import type { PlaisirOverrides } from '../types';
import { PLAISIR_LEVELS } from '../types';

// Verbatim port of carb-cycling.html:427-430. Sums whatever is in `overrides.levels` —
// the caller is responsible for scoping `overrides` to the current ISO week.
export function calcPlaisirPenaltyKcal(overrides: PlaisirOverrides): number {
  return Object.values(overrides.levels || {}).reduce(
    (sum, lvl) => sum + (PLAISIR_LEVELS[lvl]?.kcal || 0),
    0,
  );
}
