// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { PeriodCompleteness, PeriodStats } from '../../core/calc/periodBilan';

const CARB_PERIOD_BILAN_HISTORY_KEY = 'carb_period_bilan_history';
const MAX_ENTRIES = 40; // text + a small stats snapshot per entry, periods are generated far less often than daily conseils

export interface CarbPeriodBilanHistoryEntry {
  start_date: string;
  end_date: string;
  generated_at: number;
  completeness: PeriodCompleteness;
  stats: PeriodStats;
  bilan: string;
  sources: string[];
}

// Same principle as CarbAdviceHistoryRepo (persist-per-key, replace-on-collision, cap, browsable
// history) but keyed by (start_date, end_date) instead of a single date — a week/month/custom
// bilan is identified by its exact range, not a day.
export class CarbPeriodBilanHistoryRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<CarbPeriodBilanHistoryEntry[]> {
    const raw = await this.storage.get(CARB_PERIOD_BILAN_HISTORY_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as CarbPeriodBilanHistoryEntry[];
    } catch {
      return [];
    }
  }

  async findByRange(startDate: string, endDate: string): Promise<CarbPeriodBilanHistoryEntry | null> {
    const all = await this.load();
    return all.find((e) => e.start_date === startDate && e.end_date === endDate) ?? null;
  }

  async save(entry: CarbPeriodBilanHistoryEntry): Promise<void> {
    const existing = await this.load();
    const withoutRange = existing.filter((e) => !(e.start_date === entry.start_date && e.end_date === entry.end_date));
    const capped = [entry, ...withoutRange].slice(0, MAX_ENTRIES);
    await this.storage.set(CARB_PERIOD_BILAN_HISTORY_KEY, JSON.stringify(capped));
  }
}
