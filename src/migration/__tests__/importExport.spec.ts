// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { runImport, type ImportRepos } from '../importExport';
import { InMemoryStorageAdapter } from '../../storage/InMemoryStorageAdapter';
import { DayHistoryRepo } from '../../storage/repos/dayHistoryRepo';
import { CarbHistoryRepo } from '../../storage/repos/carbHistoryRepo';
import { PlaisirRepo } from '../../storage/repos/plaisirRepo';
import { SportRepo } from '../../storage/repos/sportRepo';
import { HabitsRepo } from '../../storage/repos/habitsRepo';
import { FoodLogRepo } from '../../storage/repos/foodLogRepo';
import { ProfileRepo } from '../../storage/repos/profileRepo';
import { ThemeRepo } from '../../storage/repos/themeRepo';
import { getISOWeek } from '../../core/calc/date';
import type { DayEntry } from '../../core/types';

function makeRepos(): ImportRepos {
  const storage = new InMemoryStorageAdapter();
  return {
    dayHistory: new DayHistoryRepo(storage),
    carbHistory: new CarbHistoryRepo(storage),
    plaisir: new PlaisirRepo(storage),
    sport: new SportRepo(storage),
    habits: new HabitsRepo(storage),
    foodLog: new FoodLogRepo(storage),
    profile: new ProfileRepo(storage),
    theme: new ThemeRepo(storage),
  };
}

const NOW = new Date(2026, 7, 12);

const DAY_ENTRY: DayEntry = {
  date: '2026-08-10',
  dayType: 'medium',
  weight_kg: 90,
  steps: 8000,
  step_kcal: 297,
  sport_kcal: null,
  active_cal: null,
  total_cal: null,
  burned_today: 297,
  food_kcal: 1900,
  food_protein_g: 140,
  food_fat_g: 70,
  food_carb_g: 160,
};

describe('runImport', () => {
  it('rejects invalid JSON without touching anything', async () => {
    const result = await runImport(makeRepos(), '{not json', true, NOW);
    expect(result.ok).toBe(false);
  });

  it('preview (apply=false) never writes to storage', async () => {
    const repos = makeRepos();
    const blob = JSON.stringify({ day_history: [DAY_ENTRY] });
    await runImport(repos, blob, false, NOW);
    expect(await repos.dayHistory.loadHistory()).toEqual([]);
  });

  it('imports day_history, is idempotent on a second import, and reports counts', async () => {
    const repos = makeRepos();
    const blob = JSON.stringify({ day_history: [DAY_ENTRY] });

    const first = await runImport(repos, blob, true, NOW);
    expect(first.ok).toBe(true);
    if (first.ok) {
      const dh = first.perKey.find((k) => k.key === 'day_history');
      expect(dh?.note).toContain('1 nouvelle');
    }
    expect(await repos.dayHistory.loadHistory()).toEqual([DAY_ENTRY]);

    const second = await runImport(repos, blob, true, NOW);
    if (second.ok) {
      const dh = second.perKey.find((k) => k.key === 'day_history');
      expect(dh?.note).toContain('0 nouvelle');
    }
    expect(await repos.dayHistory.loadHistory()).toEqual([DAY_ENTRY]);
  });

  it('never overwrites an existing day_history entry with the imported one', async () => {
    const repos = makeRepos();
    await repos.dayHistory.saveHistory([{ ...DAY_ENTRY, food_kcal: 2100 }]);
    await runImport(repos, JSON.stringify({ day_history: [DAY_ENTRY] }), true, NOW);
    const history = await repos.dayHistory.loadHistory();
    expect(history[0].food_kcal).toBe(2100);
  });

  it('only adopts current_day when nothing is currently live', async () => {
    const repos = makeRepos();
    const blob = JSON.stringify({ current_day: { ...DAY_ENTRY, date: '2026-08-12' } });

    await runImport(repos, blob, true, NOW);
    expect((await repos.dayHistory.loadCurrentDay())?.date).toBe('2026-08-12');

    await repos.dayHistory.saveCurrentDay({ ...DAY_ENTRY, date: '2026-08-12', food_kcal: 999 });
    await runImport(repos, blob, true, NOW);
    expect((await repos.dayHistory.loadCurrentDay())?.food_kcal).toBe(999);
  });

  it('adopts plaisir_overrides only for the current week when nothing is set yet', async () => {
    const repos = makeRepos();
    const week = getISOWeek(NOW);
    const year = NOW.getFullYear();

    const currentWeekBlob = JSON.stringify({
      plaisir_overrides: { week, year, levels: { '2026-08-10': 'leger' } },
    });
    await runImport(repos, currentWeekBlob, true, NOW);
    expect(await repos.plaisir.loadOverrides(NOW)).toEqual({ week, year, levels: { '2026-08-10': 'leger' } });

    // a stale, different-week export must not clobber the current week's overrides
    const staleBlob = JSON.stringify({
      plaisir_overrides: { week: week - 1, year, levels: { '2026-08-01': 'lourd' } },
    });
    await runImport(repos, staleBlob, true, NOW);
    expect(await repos.plaisir.loadOverrides(NOW)).toEqual({ week, year, levels: { '2026-08-10': 'leger' } });
  });

  it('food_habits: most-recent updated_at wins', async () => {
    const repos = makeRepos();
    const habit = {
      id: 'h1',
      label: 'Riz',
      off_code: null,
      source: 'manual' as const,
      portion_g: 150,
      per100: { kcal: 130, protein_g: 2.7, fat_g: 0.3, carb_g: 28 },
      day_type_tag: null,
      meal_slot: null,
      updated_at: 100,
    };
    await repos.habits.save([habit]);

    const staleImport = JSON.stringify({ food_habits: [{ ...habit, label: 'stale', updated_at: 50 }] });
    await runImport(repos, staleImport, true, NOW);
    expect((await repos.habits.load())[0].label).toBe('Riz');

    const newerImport = JSON.stringify({ food_habits: [{ ...habit, label: 'plus récent', updated_at: 200 }] });
    await runImport(repos, newerImport, true, NOW);
    expect((await repos.habits.load())[0].label).toBe('plus récent');
  });

  it('food_log_today: ignores a log from a different day', async () => {
    const repos = makeRepos();
    const entry = {
      entry_id: 'e1',
      habit_id: null,
      label: 'Pomme',
      portion_g: 150,
      per100: { kcal: 52, protein_g: 0.3, fat_g: 0.2, carb_g: 14 },
      kcal: 78,
      protein_g: 0.5,
      fat_g: 0.3,
      carb_g: 21,
      source: 'manual' as const,
      updated_at: Date.now(),
    };
    const blob = JSON.stringify({ food_log_today: { date: '2026-08-11', entries: [entry] } });
    await runImport(repos, blob, true, NOW);
    expect((await repos.foodLog.loadToday(NOW)).entries).toEqual([]);
  });

  it('never writes sport_kcal or plaisir_week directly', async () => {
    const repos = makeRepos();
    const blob = JSON.stringify({
      sport_kcal: { date: '2026-08-12', value: 400 },
      plaisir_week: { week: getISOWeek(NOW), year: 2026, count: 3 },
    });
    const result = await runImport(repos, blob, true, NOW);
    expect(result.ok).toBe(true);
    expect(await repos.sport.loadSportKcal(NOW)).toBeNull();
  });

  it('restores profile and theme_settings from a backup', async () => {
    const repos = makeRepos();
    const blob = JSON.stringify({
      profile: { height_cm: 180, age: 30, sex: 'male', weight_default_kg: 80, weight_start_kg: 85, weight_goal_kg: 75 },
      theme_settings: { mode: 'dark', accentHue: 200 },
    });
    const result = await runImport(repos, blob, true, NOW);
    expect(result.ok).toBe(true);
    expect(await repos.profile.load()).toEqual({ height_cm: 180, age: 30, sex: 'male', weight_default_kg: 80, weight_start_kg: 85, weight_goal_kg: 75 });
    expect(await repos.theme.load()).toEqual({ mode: 'dark', accentHue: 200 });
  });
});
