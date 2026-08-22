// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { CarbPeriodBilanHistoryRepo, type CarbPeriodBilanHistoryEntry } from '../carbPeriodBilanHistoryRepo';
import { InMemoryStorageAdapter } from '../../InMemoryStorageAdapter';

function makeEntry(start: string, end: string, bilan = 'Bilan test'): CarbPeriodBilanHistoryEntry {
  return {
    start_date: start,
    end_date: end,
    generated_at: Date.now(),
    completeness: { tracked_days: 6, total_days: 7, complete: true },
    stats: {
      totalDays: 7,
      trackedDays: 6,
      realDeficitKcal: 2000,
      avgFoodKcal: 1800,
      avgProteinG: 120,
      avgFatG: 60,
      avgCarbG: 180,
      weightStartKg: 80,
      weightEndKg: 79,
      weightDeltaKg: -1,
      dayTypeCounts: { high: 2, medium: 3, low: 1, plaisir: 0 },
    },
    bilan,
    sources: ['ANSES'],
  };
}

describe('CarbPeriodBilanHistoryRepo', () => {
  it('returns an empty array when nothing is stored', async () => {
    const repo = new CarbPeriodBilanHistoryRepo(new InMemoryStorageAdapter());
    expect(await repo.load()).toEqual([]);
  });

  it('saves and prepends (newest-first)', async () => {
    const repo = new CarbPeriodBilanHistoryRepo(new InMemoryStorageAdapter());
    await repo.save(makeEntry('2026-08-03', '2026-08-09'));
    await repo.save(makeEntry('2026-08-10', '2026-08-16'));
    const history = await repo.load();
    expect(history.map((e) => e.start_date)).toEqual(['2026-08-10', '2026-08-03']);
  });

  it('finds a stored entry by exact (start,end) range', async () => {
    const repo = new CarbPeriodBilanHistoryRepo(new InMemoryStorageAdapter());
    await repo.save(makeEntry('2026-08-03', '2026-08-09', 'Premier bilan'));
    const found = await repo.findByRange('2026-08-03', '2026-08-09');
    expect(found?.bilan).toBe('Premier bilan');
  });

  it('does not match a different range even with the same start date', async () => {
    const repo = new CarbPeriodBilanHistoryRepo(new InMemoryStorageAdapter());
    await repo.save(makeEntry('2026-08-01', '2026-08-07'));
    expect(await repo.findByRange('2026-08-01', '2026-08-31')).toBeNull();
  });

  it('replaces an existing entry for the same range instead of duplicating it', async () => {
    const repo = new CarbPeriodBilanHistoryRepo(new InMemoryStorageAdapter());
    await repo.save(makeEntry('2026-08-03', '2026-08-09', 'Premier'));
    await repo.save(makeEntry('2026-08-03', '2026-08-09', 'Régénéré'));
    const history = await repo.load();
    expect(history).toHaveLength(1);
    expect(history[0].bilan).toBe('Régénéré');
  });

  it('caps at 40 entries, dropping the oldest', async () => {
    const repo = new CarbPeriodBilanHistoryRepo(new InMemoryStorageAdapter());
    for (let i = 0; i < 41; i++) {
      await repo.save(makeEntry(`2026-01-${String((i % 28) + 1).padStart(2, '0')}-${i}`, `2026-01-${String((i % 28) + 1).padStart(2, '0')}-${i}-end`));
    }
    const history = await repo.load();
    expect(history).toHaveLength(40);
  });
});
