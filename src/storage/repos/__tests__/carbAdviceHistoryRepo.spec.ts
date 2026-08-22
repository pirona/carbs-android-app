// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { CarbAdviceHistoryRepo, type CarbAdviceHistoryEntry } from '../carbAdviceHistoryRepo';
import { InMemoryStorageAdapter } from '../../InMemoryStorageAdapter';

function makeEntry(date: string, advice = 'Conseil test'): CarbAdviceHistoryEntry {
  return {
    date,
    day_type: 'medium',
    generated_at: Date.now(),
    completeness: { meals_logged: 3, meals_total: 4, has_activity: true, complete: true },
    advice,
    sources: ['ANSES'],
  };
}

describe('CarbAdviceHistoryRepo', () => {
  it('returns an empty array when nothing is stored', async () => {
    const repo = new CarbAdviceHistoryRepo(new InMemoryStorageAdapter());
    expect(await repo.load()).toEqual([]);
  });

  it('saves and prepends (newest-first)', async () => {
    const repo = new CarbAdviceHistoryRepo(new InMemoryStorageAdapter());
    await repo.save(makeEntry('2026-08-10'));
    await repo.save(makeEntry('2026-08-11'));
    const history = await repo.load();
    expect(history.map((e) => e.date)).toEqual(['2026-08-11', '2026-08-10']);
  });

  it('finds a stored entry by date', async () => {
    const repo = new CarbAdviceHistoryRepo(new InMemoryStorageAdapter());
    await repo.save(makeEntry('2026-08-10', 'Premier conseil'));
    const found = await repo.findByDate('2026-08-10');
    expect(found?.advice).toBe('Premier conseil');
  });

  it('returns null when no entry exists for the date', async () => {
    const repo = new CarbAdviceHistoryRepo(new InMemoryStorageAdapter());
    await repo.save(makeEntry('2026-08-10'));
    expect(await repo.findByDate('2026-08-11')).toBeNull();
  });

  it('replaces an existing entry for the same date instead of duplicating it (regenerate)', async () => {
    const repo = new CarbAdviceHistoryRepo(new InMemoryStorageAdapter());
    await repo.save(makeEntry('2026-08-10', 'Premier conseil'));
    await repo.save(makeEntry('2026-08-10', 'Conseil régénéré'));
    const history = await repo.load();
    expect(history).toHaveLength(1);
    expect(history[0].advice).toBe('Conseil régénéré');
  });

  it('caps at 60 entries, dropping the oldest', async () => {
    const repo = new CarbAdviceHistoryRepo(new InMemoryStorageAdapter());
    for (let i = 0; i < 61; i++) {
      await repo.save(makeEntry(`2026-01-${String((i % 28) + 1).padStart(2, '0')}-${i}`));
    }
    const history = await repo.load();
    expect(history).toHaveLength(60);
  });
});
