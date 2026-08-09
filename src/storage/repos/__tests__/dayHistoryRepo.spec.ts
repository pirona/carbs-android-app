// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DayHistoryRepo } from '../dayHistoryRepo';
import { InMemoryStorageAdapter } from '../../InMemoryStorageAdapter';
import type { DayEntry } from '../../../core/types';

function entry(date: string): DayEntry {
  return {
    date,
    dayType: 'medium',
    weight_kg: 90,
    steps: null,
    step_kcal: null,
    sport_kcal: null,
    active_cal: null,
    total_cal: null,
    burned_today: null,
    food_kcal: null,
    food_protein_g: null,
    food_fat_g: null,
    food_carb_g: null,
  };
}

describe('DayHistoryRepo', () => {
  it('round-trips history and caps at 90 entries on save', async () => {
    const repo = new DayHistoryRepo(new InMemoryStorageAdapter());
    const entries = Array.from({ length: 95 }, (_, i) => entry(`2026-01-${String(i + 1).padStart(2, '0')}`));
    await repo.saveHistory(entries);
    const loaded = await repo.loadHistory();
    expect(loaded).toHaveLength(90);
    expect(loaded[0].date).toBe('2026-01-01');
  });

  it('returns an empty array when nothing is stored', async () => {
    const repo = new DayHistoryRepo(new InMemoryStorageAdapter());
    expect(await repo.loadHistory()).toEqual([]);
  });

  it('round-trips current_day', async () => {
    const repo = new DayHistoryRepo(new InMemoryStorageAdapter());
    expect(await repo.loadCurrentDay()).toBeNull();
    await repo.saveCurrentDay(entry('2026-08-12'));
    expect((await repo.loadCurrentDay())?.date).toBe('2026-08-12');
  });
});
