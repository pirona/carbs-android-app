// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { HabitsRepo } from '../habitsRepo';
import { InMemoryStorageAdapter } from '../../InMemoryStorageAdapter';
import type { Habit } from '../../../core/types';

const HABIT: Habit = {
  id: 'h1',
  label: 'Riz basmati',
  off_code: null,
  source: 'manual',
  portion_g: 150,
  per100: { kcal: 130, protein_g: 2.7, fat_g: 0.3, carb_g: 28 },
  day_type_tag: null,
  meal_slot: null,
  updated_at: Date.now(),
};

describe('HabitsRepo', () => {
  it('round-trips the habit list', async () => {
    const repo = new HabitsRepo(new InMemoryStorageAdapter());
    expect(await repo.load()).toEqual([]);
    await repo.save([HABIT]);
    expect(await repo.load()).toEqual([HABIT]);
  });

  it('defaults sort mode to "alpha"', async () => {
    const repo = new HabitsRepo(new InMemoryStorageAdapter());
    expect(await repo.loadSortMode()).toBe('alpha');
    await repo.saveSortMode('recent');
    expect(await repo.loadSortMode()).toBe('recent');
  });
});
