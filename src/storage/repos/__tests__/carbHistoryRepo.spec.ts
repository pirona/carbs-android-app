// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { CarbHistoryRepo } from '../carbHistoryRepo';
import { InMemoryStorageAdapter } from '../../InMemoryStorageAdapter';
import type { WeekEntry } from '../../../core/types';

function week(n: number): WeekEntry {
  return { week: n, year: 2026, plaisir: 0, plaisir_kcal: 0, weight_kg: 90, nominal_deficit: 4550 };
}

describe('CarbHistoryRepo', () => {
  it('caps at 52 entries on save', async () => {
    const repo = new CarbHistoryRepo(new InMemoryStorageAdapter());
    await repo.save(Array.from({ length: 60 }, (_, i) => week(i + 1)));
    expect(await repo.load()).toHaveLength(52);
  });
});
