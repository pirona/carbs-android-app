// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { FoodLogHistoryRepo } from '../foodLogHistoryRepo';
import { InMemoryStorageAdapter } from '../../InMemoryStorageAdapter';
import type { LogEntry } from '../../../core/types';

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
  meal_slot: 'collation',
};

describe('FoodLogHistoryRepo', () => {
  it('returns an empty array when nothing is stored', async () => {
    const repo = new FoodLogHistoryRepo(new InMemoryStorageAdapter());
    expect(await repo.load()).toEqual([]);
  });

  it('archives a day and prepends it (newest-first)', async () => {
    const repo = new FoodLogHistoryRepo(new InMemoryStorageAdapter());
    await repo.archiveDay('2026-08-10', [ENTRY]);
    await repo.archiveDay('2026-08-11', [ENTRY]);
    const history = await repo.load();
    expect(history.map((e) => e.date)).toEqual(['2026-08-11', '2026-08-10']);
  });

  it('does nothing when archiving a day with no entries', async () => {
    const repo = new FoodLogHistoryRepo(new InMemoryStorageAdapter());
    await repo.archiveDay('2026-08-10', []);
    expect(await repo.load()).toEqual([]);
  });

  it('replaces an already-archived day instead of duplicating it', async () => {
    const repo = new FoodLogHistoryRepo(new InMemoryStorageAdapter());
    await repo.archiveDay('2026-08-10', [ENTRY]);
    const second: LogEntry = { ...ENTRY, entry_id: 'e2', label: 'Riz' };
    await repo.archiveDay('2026-08-10', [second]);
    const history = await repo.load();
    expect(history).toHaveLength(1);
    expect(history[0].entries).toEqual([second]);
  });

  it('caps at 30 days, dropping the oldest', async () => {
    const repo = new FoodLogHistoryRepo(new InMemoryStorageAdapter());
    for (let i = 0; i < 31; i++) {
      await repo.archiveDay(`2026-01-${String(i + 1).padStart(2, '0')}`, [ENTRY]);
    }
    const history = await repo.load();
    expect(history).toHaveLength(30);
    expect(history[0].date).toBe('2026-01-31');
    expect(history.find((e) => e.date === '2026-01-01')).toBeUndefined();
  });
});
