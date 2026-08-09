// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { calcPlaisirPenaltyKcal } from '../plaisir';

describe('calcPlaisirPenaltyKcal', () => {
  it('sums the kcal of every level present in overrides.levels', () => {
    const overrides = {
      week: 32,
      year: 2026,
      levels: { '2026-08-01': 'leger' as const, '2026-08-02': 'moyen' as const },
    };
    expect(calcPlaisirPenaltyKcal(overrides)).toBe(350 + 650);
  });

  it('returns 0 when there are no overrides', () => {
    expect(calcPlaisirPenaltyKcal({ week: 32, year: 2026, levels: {} })).toBe(0);
  });
});
