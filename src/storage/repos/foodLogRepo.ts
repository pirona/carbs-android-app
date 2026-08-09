// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { LogEntry } from '../../core/types';
import { formatDateKey } from '../../core/calc/date';

const FOOD_LOG_TODAY_KEY = 'food_log_today';

export interface FoodLog {
  date: string;
  entries: LogEntry[];
}

// Port of loadFoodLogToday/saveFoodLogToday (carb-cycling.html:1077-1088). The n8n
// cross-device sync (pushFoodLogToRemote) is dropped — no cross-device sync in this app.
export class FoodLogRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async loadToday(now: Date = new Date()): Promise<FoodLog> {
    const todayKey = formatDateKey(now);
    const raw = await this.storage.get(FOOD_LOG_TODAY_KEY);
    if (raw) {
      try {
        const d = JSON.parse(raw) as FoodLog;
        if (d && d.date === todayKey) return d;
      } catch {
        // fall through to a fresh log
      }
    }
    return { date: todayKey, entries: [] };
  }

  async saveToday(log: FoodLog): Promise<void> {
    await this.storage.set(FOOD_LOG_TODAY_KEY, JSON.stringify(log));
  }
}
