// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { Habit } from '../../core/types';

const FOOD_HABITS_KEY = 'food_habits';
const SORT_MODE_KEY = 'food_habits_sort_mode';

export type HabitSortMode = 'alpha' | 'recent';

// Port of loadFoodHabits/saveFoodHabits (carb-cycling.html:1005-1017) and
// loadHabitSortMode (carb-cycling.html:1020-1023). The n8n cross-device sync
// (fetch to CONFIG.n8n_sync_url) is dropped — no cross-device sync in this app.
export class HabitsRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<Habit[]> {
    const raw = await this.storage.get(FOOD_HABITS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as Habit[];
    } catch {
      return [];
    }
  }

  async save(list: Habit[]): Promise<void> {
    await this.storage.set(FOOD_HABITS_KEY, JSON.stringify(list));
  }

  async loadSortMode(): Promise<HabitSortMode> {
    const v = await this.storage.get(SORT_MODE_KEY);
    return v === 'recent' ? 'recent' : 'alpha';
  }

  async saveSortMode(mode: HabitSortMode): Promise<void> {
    await this.storage.set(SORT_MODE_KEY, mode);
  }
}
