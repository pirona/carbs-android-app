// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import { formatDateKey } from '../../core/calc/date';

const SPORT_KCAL_KEY = 'sport_kcal';
const SPORT_PLAN_KEY = 'sport_plan';
const PLAN_RETENTION_DAYS = 90; // carb-cycling.html:2540

// Port of loadSportKcal/saveSportKcal (carb-cycling.html:2551-2560, daily reset) and
// loadSportPlan/saveSportPlan (carb-cycling.html:2534-2545, 90-day trim, no daily reset).
export class SportRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async loadSportKcal(now: Date = new Date()): Promise<number | null> {
    const raw = await this.storage.get(SPORT_KCAL_KEY);
    if (!raw) return null;
    try {
      const d = JSON.parse(raw) as { date: string; value: number };
      return d.date === formatDateKey(now) ? d.value : null;
    } catch {
      return null;
    }
  }

  async saveSportKcal(value: number, now: Date = new Date()): Promise<void> {
    await this.storage.set(SPORT_KCAL_KEY, JSON.stringify({ date: formatDateKey(now), value }));
  }

  // Port of deleteSportKcal (carb-cycling.html:2597-2608) — removes the key entirely so
  // loadSportKcal reports null again, distinct from saving a 0 value.
  async clearSportKcal(): Promise<void> {
    await this.storage.remove(SPORT_KCAL_KEY);
  }

  async loadSportPlan(): Promise<Record<string, number>> {
    const raw = await this.storage.get(SPORT_PLAN_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, number>;
    } catch {
      return {};
    }
  }

  async saveSportPlan(plan: Record<string, number>, now: Date = new Date()): Promise<void> {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - PLAN_RETENTION_DAYS);
    const cutoffKey = formatDateKey(cutoff);
    const trimmed: Record<string, number> = {};
    Object.entries(plan).forEach(([k, v]) => {
      if (k >= cutoffKey) trimmed[k] = v;
    });
    await this.storage.set(SPORT_PLAN_KEY, JSON.stringify(trimmed));
  }
}
