// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { FoodLogRepo } from '../foodLogRepo';
import { InMemoryStorageAdapter } from '../../InMemoryStorageAdapter';
import type { LogEntry } from '../../../core/types';

const TODAY = new Date(2026, 7, 12);
const YESTERDAY = new Date(2026, 7, 11);

const ENTRY: LogEntry = {
  entry_id: 'e1',
  habit_id: null,
  label: 'Pomme',
  portion_g: 150,
  per100: { kcal: 52, protein_g: 0.3, fat_g: 0.2, carb_g: 14 },
  kcal: 78,
  protein_g: 0.5,
  fat_g: 0.3,
  carb_g: 21,
  source: 'manual',
  updated_at: Date.now(),
};

describe('FoodLogRepo', () => {
  it('returns an empty log for today when nothing is stored', async () => {
    const repo = new FoodLogRepo(new InMemoryStorageAdapter());
    expect(await repo.loadToday(TODAY)).toEqual({ date: '2026-08-12', entries: [] });
  });

  it('returns the stored log when its date matches today', async () => {
    const repo = new FoodLogRepo(new InMemoryStorageAdapter());
    await repo.saveToday({ date: '2026-08-12', entries: [ENTRY] });
    expect(await repo.loadToday(TODAY)).toEqual({ date: '2026-08-12', entries: [ENTRY] });
  });

  it('resets to an empty log when the stored one is from a previous day', async () => {
    const repo = new FoodLogRepo(new InMemoryStorageAdapter());
    await repo.saveToday({ date: '2026-08-11', entries: [ENTRY] });
    expect(await repo.loadToday(TODAY)).toEqual({ date: '2026-08-12', entries: [] });
    // sanity: the same stale log, read as "today" on the day it was written, round-trips
    expect(await repo.loadToday(YESTERDAY)).toEqual({ date: '2026-08-11', entries: [ENTRY] });
  });
});
