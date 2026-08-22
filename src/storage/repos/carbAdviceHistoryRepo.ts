// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { DayType } from '../../core/types';
import type { AdviceCompleteness } from '../../core/calc/adviceCompleteness';

const CARB_ADVICE_HISTORY_KEY = 'carb_advice_history';
const MAX_ENTRIES = 60; // text-only entries, lighter than food_log_history's line items

export interface CarbAdviceHistoryEntry {
  date: string;
  day_type: DayType;
  generated_at: number;
  completeness: AdviceCompleteness;
  advice: string;
  sources: string[];
}

// Persists a generated conseil per day — the Conseils screen checks this before ever calling
// Mistral again for a date it already has an entry for (explicit "Régénérer" bypasses that),
// and its full list backs the screen's history section. Same replace-on-date-collision/cap
// pattern as FoodLogHistoryRepo.
export class CarbAdviceHistoryRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<CarbAdviceHistoryEntry[]> {
    const raw = await this.storage.get(CARB_ADVICE_HISTORY_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as CarbAdviceHistoryEntry[];
    } catch {
      return [];
    }
  }

  async findByDate(date: string): Promise<CarbAdviceHistoryEntry | null> {
    const all = await this.load();
    return all.find((e) => e.date === date) ?? null;
  }

  async save(entry: CarbAdviceHistoryEntry): Promise<void> {
    const existing = await this.load();
    const withoutDate = existing.filter((e) => e.date !== entry.date);
    const capped = [entry, ...withoutDate].slice(0, MAX_ENTRIES);
    await this.storage.set(CARB_ADVICE_HISTORY_KEY, JSON.stringify(capped));
  }
}
