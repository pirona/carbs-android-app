// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { LogEntry } from '../../core/types';

const FOOD_LOG_HISTORY_KEY = 'food_log_history';
const MAX_DAYS = 30; // full line items are heavier than day_history's aggregates (90d) —
// the Conseils screen only ever needs the most recent fully-logged day.

export interface FoodLogHistoryEntry {
  date: string;
  entries: LogEntry[];
}

// Full per-day food log detail, archived on date rollover (see dayTracking.ts) — day_history
// only ever kept the day's aggregate totals, never the individual entries, so there was no way
// to look back at what was actually eaten and when. Newest-first, capped at MAX_DAYS.
export class FoodLogHistoryRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<FoodLogHistoryEntry[]> {
    const raw = await this.storage.get(FOOD_LOG_HISTORY_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as FoodLogHistoryEntry[];
    } catch {
      return [];
    }
  }

  async save(entries: FoodLogHistoryEntry[]): Promise<void> {
    const capped = entries.slice(0, MAX_DAYS);
    await this.storage.set(FOOD_LOG_HISTORY_KEY, JSON.stringify(capped));
  }

  // No-op on an empty day — nothing worth keeping, and it would otherwise push a real day
  // out of the MAX_DAYS window for no reason.
  async archiveDay(date: string, entries: LogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const existing = await this.load();
    const withoutDate = existing.filter((e) => e.date !== date);
    await this.save([{ date, entries }, ...withoutDate]);
  }
}
