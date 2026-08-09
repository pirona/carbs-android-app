// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { DayEntry } from '../../core/types';

const DAY_HISTORY_KEY = 'day_history';
const CURRENT_DAY_KEY = 'current_day';
const MAX_ENTRIES = 90; // carb-cycling.html:721

// Port of loadDayHistory/saveDayHistory (carb-cycling.html:716-724) and
// current_day accessors — HA sync (pushDayHistoryToHA) dropped, no HA dependency here.
export class DayHistoryRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async loadHistory(): Promise<DayEntry[]> {
    const raw = await this.storage.get(DAY_HISTORY_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as DayEntry[];
    } catch {
      return [];
    }
  }

  async saveHistory(entries: DayEntry[]): Promise<void> {
    const capped = entries.slice(0, MAX_ENTRIES);
    await this.storage.set(DAY_HISTORY_KEY, JSON.stringify(capped));
  }

  async loadCurrentDay(): Promise<DayEntry | null> {
    const raw = await this.storage.get(CURRENT_DAY_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DayEntry;
    } catch {
      return null;
    }
  }

  async saveCurrentDay(entry: DayEntry): Promise<void> {
    await this.storage.set(CURRENT_DAY_KEY, JSON.stringify(entry));
  }
}

// NOTE: the original's `archiveDayIfNeeded` (carb-cycling.html:802-879) — which archives
// current_day into day_history on a date rollover, computes step_kcal/burned_today, and
// pulls food totals from food_log_today — is an orchestration function that composes
// several repos + calc functions with live signals (Health Connect, day type). It belongs
// in Phase 3's day-tracking service (DayScreen), not in this storage-only repo.
