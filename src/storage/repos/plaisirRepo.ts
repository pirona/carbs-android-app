// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { PlaisirLevel, PlaisirOverrides } from '../../core/types';
import { getISOWeek } from '../../core/calc/date';
import { calcPlaisirPenaltyKcal } from '../../core/calc/plaisir';

const PLAISIR_WEEK_KEY = 'plaisir_week';
const PLAISIR_OVERRIDES_KEY = 'plaisir_overrides';

export interface PlaisirWeekData {
  week: number;
  year: number;
  count: number;
  plaisir_kcal?: number;
}

// Port of loadPlaisirData/savePlaisirCount (carb-cycling.html:637-658) and
// loadPlaisirOverrides/savePlaisirOverrides (carb-cycling.html:2500-2528).
//
// NOTE: `archiveWeekIfNeeded` (carb-cycling.html:677-709) — which moves the previous
// week's plaisir_week into carb_history using `calcWeeklyDeficit(macros)` and resets the
// counter — needs a computed `macros` object from outside this repo. It's an
// orchestration function, ported alongside DayScreen/WeekScreen in Phase 3, not here.
export class PlaisirRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async loadWeekData(now: Date = new Date()): Promise<PlaisirWeekData> {
    const currentWeek = getISOWeek(now);
    const currentYear = now.getFullYear();
    const raw = await this.storage.get(PLAISIR_WEEK_KEY);
    if (raw) {
      try {
        const d = JSON.parse(raw) as PlaisirWeekData;
        if (d.week === currentWeek && (d.year === currentYear || !d.year)) return d;
      } catch {
        // fall through to default
      }
    }
    return { week: currentWeek, year: currentYear, count: 0 };
  }

  async saveWeekData(data: PlaisirWeekData): Promise<void> {
    await this.storage.set(PLAISIR_WEEK_KEY, JSON.stringify(data));
  }

  async savePlaisirCount(count: number, now: Date = new Date()): Promise<PlaisirWeekData> {
    const data: PlaisirWeekData = {
      week: getISOWeek(now),
      year: now.getFullYear(),
      count: Math.max(0, count),
    };
    await this.saveWeekData(data);
    return data;
  }

  async loadOverrides(now: Date = new Date()): Promise<PlaisirOverrides> {
    const w = getISOWeek(now);
    const y = now.getFullYear();
    const raw = await this.storage.get(PLAISIR_OVERRIDES_KEY);
    if (raw) {
      try {
        const d = JSON.parse(raw) as PlaisirOverrides & { dates?: string[] };
        if (d.week === w && d.year === y) {
          // Migration: legacy dates[] -> levels{}
          if (d.dates && !d.levels) {
            const levels: Record<string, PlaisirLevel> = {};
            (d.dates || []).forEach((dt: string) => {
              levels[dt] = 'moyen';
            });
            d.levels = levels;
            delete d.dates;
          }
          return { week: d.week, year: d.year, levels: d.levels };
        }
      } catch {
        // fall through to default
      }
    }
    return { week: w, year: y, levels: {} };
  }

  async saveOverrides(overrides: PlaisirOverrides, now: Date = new Date()): Promise<void> {
    await this.storage.set(PLAISIR_OVERRIDES_KEY, JSON.stringify(overrides));
    // keep plaisir_week's count/plaisir_kcal in sync, as the original does
    const weekData = await this.loadWeekData(now);
    weekData.count = Object.keys(overrides.levels).length;
    weekData.plaisir_kcal = calcPlaisirPenaltyKcal(overrides);
    await this.saveWeekData(weekData);
  }
}
