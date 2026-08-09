// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { SportRepo } from '../sportRepo';
import { InMemoryStorageAdapter } from '../../InMemoryStorageAdapter';

const TODAY = new Date(2026, 7, 12);
const YESTERDAY = new Date(2026, 7, 11);

describe('SportRepo — sport_kcal (daily reset)', () => {
  it('returns the stored value when it was saved today', async () => {
    const repo = new SportRepo(new InMemoryStorageAdapter());
    await repo.saveSportKcal(300, TODAY);
    expect(await repo.loadSportKcal(TODAY)).toBe(300);
  });

  it('returns null when the stored value is from a previous day', async () => {
    const repo = new SportRepo(new InMemoryStorageAdapter());
    await repo.saveSportKcal(300, YESTERDAY);
    expect(await repo.loadSportKcal(TODAY)).toBeNull();
  });

  it('returns null when nothing is stored', async () => {
    const repo = new SportRepo(new InMemoryStorageAdapter());
    expect(await repo.loadSportKcal(TODAY)).toBeNull();
  });
});

describe('SportRepo — sport_plan (90-day trim, no daily reset)', () => {
  it('drops entries older than 90 days on save', async () => {
    const repo = new SportRepo(new InMemoryStorageAdapter());
    await repo.saveSportPlan({ '2020-01-01': 100, '2026-08-01': 200 }, TODAY);
    const plan = await repo.loadSportPlan();
    expect(plan).toEqual({ '2026-08-01': 200 });
  });

  it('keeps entries within the retention window', async () => {
    const repo = new SportRepo(new InMemoryStorageAdapter());
    await repo.saveSportPlan({ '2026-08-01': 200, '2026-08-12': 300 }, TODAY);
    const plan = await repo.loadSportPlan();
    expect(plan).toEqual({ '2026-08-01': 200, '2026-08-12': 300 });
  });
});
