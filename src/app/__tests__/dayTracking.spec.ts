// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { refreshDaySnapshot, type DayTrackingRepos } from '../dayTracking';
import { InMemoryStorageAdapter } from '../../storage/InMemoryStorageAdapter';
import { DayHistoryRepo } from '../../storage/repos/dayHistoryRepo';
import { SportRepo } from '../../storage/repos/sportRepo';
import { FoodLogRepo } from '../../storage/repos/foodLogRepo';
import { PlaisirRepo } from '../../storage/repos/plaisirRepo';
import { DEFAULT_PROFILE } from '../../storage/repos/profileRepo';
import type { DayEntry, LogEntry } from '../../core/types';

function makeRepos(): DayTrackingRepos {
  const storage = new InMemoryStorageAdapter();
  return {
    dayHistory: new DayHistoryRepo(storage),
    sport: new SportRepo(storage),
    foodLog: new FoodLogRepo(storage),
    plaisir: new PlaisirRepo(storage),
  };
}

const NOW = new Date(2026, 7, 12);
const NO_SIGNALS = { steps: null, sportKcal: null, activeCaloriesKcal: null, exerciseMin: null };

describe('refreshDaySnapshot', () => {
  it('computes step_kcal/burned_today and detects day type from combined steps+sport', async () => {
    const repos = makeRepos();
    const snap = await refreshDaySnapshot(repos, DEFAULT_PROFILE, { ...NO_SIGNALS, steps: 10000, sportKcal: 200 }, 90, NOW);

    expect(snap.current.step_kcal).toBe(372); // stepsToActiveKcal(10000, 90)
    expect(snap.current.burned_today).toBe(572); // 372 + 200
    expect(snap.dayType.type).toBe('medium'); // 572 is >300, <=600
    expect(snap.current.date).toBe('2026-08-12');
    expect(snap.macros.kcal).toBe(snap.macros.targets.medium);
  });

  it('sums today food_kcal/macros from the food log', async () => {
    const repos = makeRepos();
    const entry: LogEntry = {
      entry_id: 'e1',
      habit_id: null,
      label: 'Riz',
      portion_g: 150,
      per100: { kcal: 130, protein_g: 2.7, fat_g: 0.3, carb_g: 28 },
      kcal: 195,
      protein_g: 4,
      fat_g: 0.5,
      carb_g: 42,
      source: 'manual',
      updated_at: Date.now(),
    };
    await repos.foodLog.saveToday({ date: '2026-08-12', entries: [entry] });

    const snap = await refreshDaySnapshot(repos, DEFAULT_PROFILE, NO_SIGNALS, 90, NOW);
    expect(snap.current.food_kcal).toBe(195);
    expect(snap.current.food_protein_g).toBe(4);
  });

  it('falls back to Health Connect active-calories + steps when no sport_kcal/steps combo fires', async () => {
    const repos = makeRepos();
    const snap = await refreshDaySnapshot(
      repos,
      DEFAULT_PROFILE,
      { steps: null, sportKcal: null, activeCaloriesKcal: 700, exerciseMin: null },
      90,
      NOW,
    );
    expect(snap.current.burned_today).toBe(700);
  });

  it('archives the previous current_day into day_history on a date rollover', async () => {
    const repos = makeRepos();
    const yesterday: DayEntry = {
      date: '2026-08-11',
      dayType: 'medium',
      weight_kg: 91,
      steps: 8000,
      step_kcal: 300,
      sport_kcal: null,
      active_cal: null,
      total_cal: null,
      burned_today: 300,
      food_kcal: 1900,
      food_protein_g: 140,
      food_fat_g: 70,
      food_carb_g: 160,
    };
    await repos.dayHistory.saveCurrentDay(yesterday);

    await refreshDaySnapshot(repos, DEFAULT_PROFILE, NO_SIGNALS, 90, NOW);

    const history = await repos.dayHistory.loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].date).toBe('2026-08-11');
  });

  it('does not double-archive a day already present in day_history', async () => {
    const repos = makeRepos();
    const yesterday: DayEntry = {
      date: '2026-08-11',
      dayType: 'medium',
      weight_kg: 91,
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
    await repos.dayHistory.saveHistory([yesterday]);
    await repos.dayHistory.saveCurrentDay(yesterday);

    await refreshDaySnapshot(repos, DEFAULT_PROFILE, NO_SIGNALS, 90, NOW);

    const history = await repos.dayHistory.loadHistory();
    expect(history).toHaveLength(1);
  });

  it('pulls a pre-planned sport_kcal from sport_plan when archiving a day that had none', async () => {
    const repos = makeRepos();
    await repos.sport.saveSportPlan({ '2026-08-11': 400 }, NOW);
    const yesterday: DayEntry = {
      date: '2026-08-11',
      dayType: 'medium',
      weight_kg: 91,
      steps: 8000,
      step_kcal: 300,
      sport_kcal: null,
      active_cal: null,
      total_cal: null,
      burned_today: 300,
      food_kcal: null,
      food_protein_g: null,
      food_fat_g: null,
      food_carb_g: null,
    };
    await repos.dayHistory.saveCurrentDay(yesterday);

    await refreshDaySnapshot(repos, DEFAULT_PROFILE, NO_SIGNALS, 90, NOW);

    const history = await repos.dayHistory.loadHistory();
    expect(history[0].sport_kcal).toBe(400);
    expect(history[0].burned_today).toBe(700); // 300 step_kcal + 400 sport_kcal
  });

  it('respects a manual plaisir override for today', async () => {
    const repos = makeRepos();
    await repos.plaisir.saveOverrides({ week: 0, year: 0, levels: { '2026-08-12': 'moyen' } }, NOW);
    // reload with correct week/year so the override actually matches "now"
    const real = await repos.plaisir.loadOverrides(NOW);
    await repos.plaisir.saveOverrides({ ...real, levels: { '2026-08-12': 'moyen' } }, NOW);

    const snap = await refreshDaySnapshot(repos, DEFAULT_PROFILE, { ...NO_SIGNALS, steps: 20000 }, 90, NOW);
    expect(snap.dayType.type).toBe('plaisir');
  });
});
