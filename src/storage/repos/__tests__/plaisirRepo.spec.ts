// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { PlaisirRepo } from '../plaisirRepo';
import { InMemoryStorageAdapter } from '../../InMemoryStorageAdapter';
import { getISOWeek } from '../../../core/calc/date';

const NOW = new Date(2026, 7, 12);
const WEEK = getISOWeek(NOW);
const YEAR = NOW.getFullYear();

describe('PlaisirRepo — week data', () => {
  it('defaults to {week,year,count:0} when nothing is stored', async () => {
    const repo = new PlaisirRepo(new InMemoryStorageAdapter());
    expect(await repo.loadWeekData(NOW)).toEqual({ week: WEEK, year: YEAR, count: 0 });
  });

  it('returns stored data when it matches the current week/year', async () => {
    const repo = new PlaisirRepo(new InMemoryStorageAdapter());
    await repo.saveWeekData({ week: WEEK, year: YEAR, count: 2, plaisir_kcal: 1000 });
    expect(await repo.loadWeekData(NOW)).toEqual({ week: WEEK, year: YEAR, count: 2, plaisir_kcal: 1000 });
  });

  it('resets to default when the stored week is stale', async () => {
    const repo = new PlaisirRepo(new InMemoryStorageAdapter());
    await repo.saveWeekData({ week: WEEK - 1, year: YEAR, count: 3 });
    expect(await repo.loadWeekData(NOW)).toEqual({ week: WEEK, year: YEAR, count: 0 });
  });

  it('savePlaisirCount clamps negative counts to 0', async () => {
    const repo = new PlaisirRepo(new InMemoryStorageAdapter());
    const saved = await repo.savePlaisirCount(-5, NOW);
    expect(saved.count).toBe(0);
  });
});

describe('PlaisirRepo — overrides', () => {
  it('defaults to empty levels when nothing is stored', async () => {
    const repo = new PlaisirRepo(new InMemoryStorageAdapter());
    expect(await repo.loadOverrides(NOW)).toEqual({ week: WEEK, year: YEAR, levels: {} });
  });

  it('migrates the legacy dates[] format to levels{} (defaulting to "moyen")', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.set(
      'plaisir_overrides',
      JSON.stringify({ week: WEEK, year: YEAR, dates: ['2026-08-10', '2026-08-11'] }),
    );
    const repo = new PlaisirRepo(storage);
    expect(await repo.loadOverrides(NOW)).toEqual({
      week: WEEK,
      year: YEAR,
      levels: { '2026-08-10': 'moyen', '2026-08-11': 'moyen' },
    });
  });

  it('saveOverrides persists overrides and syncs plaisir_week count/plaisir_kcal', async () => {
    const repo = new PlaisirRepo(new InMemoryStorageAdapter());
    await repo.saveOverrides(
      { week: WEEK, year: YEAR, levels: { '2026-08-10': 'leger', '2026-08-11': 'moyen' } },
      NOW,
    );
    const weekData = await repo.loadWeekData(NOW);
    expect(weekData.count).toBe(2);
    expect(weekData.plaisir_kcal).toBe(350 + 650);
  });
});
