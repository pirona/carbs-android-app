// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { WeekEntry } from '../../core/types';

const CARB_HISTORY_KEY = 'carb_history';
const MAX_ENTRIES = 52; // carb-cycling.html:673

// Port of loadHistory/saveHistory (carb-cycling.html:665-674).
export class CarbHistoryRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<WeekEntry[]> {
    const raw = await this.storage.get(CARB_HISTORY_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as WeekEntry[];
    } catch {
      return [];
    }
  }

  async save(entries: WeekEntry[]): Promise<void> {
    await this.storage.set(CARB_HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  }
}
