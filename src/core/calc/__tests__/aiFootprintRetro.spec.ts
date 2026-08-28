// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { reconstructRetroactiveAiUsage, FALLBACK_TOKENS_PER_CALL, type RetroactiveUsageInput } from '../aiFootprintRetro';
import { calcAiFootprint, GCO2E_PER_TOKEN, ML_WATER_PER_TOKEN } from '../aiFootprint';
import { DEFAULT_AI_FOOTPRINT } from '../../../storage/repos/aiFootprintRepo';
import type { LogEntry } from '../../types';

function makeLogEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    entry_id: 'e1',
    habit_id: null,
    label: 'Test',
    portion_g: 100,
    per100: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
    kcal: 0,
    protein_g: 0,
    fat_g: 0,
    carb_g: 0,
    source: 'manual',
    updated_at: 1000,
    meal_slot: 'collation',
    ...overrides,
  };
}

const EMPTY_INPUT: RetroactiveUsageInput = {
  carbAdviceHistory: [],
  carbPeriodBilanHistory: [],
  foodLogHistory: [],
  foodLogToday: [],
  habits: [],
  footprint: calcAiFootprint(DEFAULT_AI_FOOTPRINT),
};

describe('reconstructRetroactiveAiUsage', () => {
  it('returns zero when nothing to reconstruct', () => {
    const result = reconstructRetroactiveAiUsage(EMPTY_INPUT);
    expect(result.totalCallCount).toBe(0);
    expect(result.buckets.every((b) => b.callCount === 0 && b.gCO2e === 0)).toBe(true);
  });

  it('counts carb_advice / period_bilan history entries as call counts, falling back to the study reference size (400 tokens/call) when nothing has been live-measured yet', () => {
    const result = reconstructRetroactiveAiUsage({
      ...EMPTY_INPUT,
      carbAdviceHistory: [
        { date: '2026-08-01', day_type: 'medium', generated_at: 100, completeness: { meals_logged: 4, meals_total: 4, has_activity: true, complete: true }, advice: 'a', sources: [] },
        { date: '2026-08-02', day_type: 'medium', generated_at: 200, completeness: { meals_logged: 4, meals_total: 4, has_activity: true, complete: true }, advice: 'b', sources: [] },
      ],
      carbPeriodBilanHistory: [
        {
          start_date: '2026-07-01',
          end_date: '2026-07-31',
          generated_at: 150,
          completeness: { tracked_days: 20, total_days: 31, complete: true },
          stats: { totalDays: 31, trackedDays: 20, realDeficitKcal: 0, avgFoodKcal: null, avgProteinG: null, avgFatG: null, avgCarbG: null, weightStartKg: null, weightEndKg: null, weightDeltaKg: null, dayTypeCounts: { high: 0, medium: 0, low: 0, plaisir: 0 } },
          bilan: 'c',
          sources: [],
        },
      ],
    });
    const advice = result.buckets.find((b) => b.bucket === 'carb_advice')!;
    const bilan = result.buckets.find((b) => b.bucket === 'period_bilan')!;
    expect(advice.callCount).toBe(2);
    expect(advice.estimateSource).toBe('fallback');
    expect(advice.gCO2e).toBeCloseTo(2 * FALLBACK_TOKENS_PER_CALL * GCO2E_PER_TOKEN, 5);
    expect(bilan.callCount).toBe(1);
    expect(bilan.estimateSource).toBe('fallback');
    expect(bilan.gCO2e).toBeCloseTo(1 * FALLBACK_TOKENS_PER_CALL * GCO2E_PER_TOKEN, 5);
    expect(result.totalCallCount).toBe(3);
  });

  it('applies the app\'s own live-measured average tokens/call once one exists for that feature', () => {
    const footprint = calcAiFootprint({
      since: '2026-08-20T00:00:00.000Z',
      perFeature: {
        ...DEFAULT_AI_FOOTPRINT.perFeature,
        carb_advice: { promptTokens: 800, completionTokens: 200, callCount: 2 }, // 500 tokens/call live avg
      },
    });
    const result = reconstructRetroactiveAiUsage({
      ...EMPTY_INPUT,
      footprint,
      carbAdviceHistory: [
        { date: '2026-08-01', day_type: 'medium', generated_at: 100, completeness: { meals_logged: 4, meals_total: 4, has_activity: true, complete: true }, advice: 'a', sources: [] },
      ],
    });
    const advice = result.buckets.find((b) => b.bucket === 'carb_advice')!;
    expect(advice.callCount).toBe(1);
    expect(advice.estimateSource).toBe('measured');
    expect(advice.gCO2e).toBeCloseTo(500 * GCO2E_PER_TOKEN, 5);
    expect(advice.mlWater).toBeCloseTo(500 * ML_WATER_PER_TOKEN, 5);
  });

  it('ignores history/log entries at or after the live tracking `since` boundary (never double-counts)', () => {
    const footprint = calcAiFootprint({ since: '1970-01-01T00:00:00.500Z', perFeature: DEFAULT_AI_FOOTPRINT.perFeature }); // sinceMs = 500
    const result = reconstructRetroactiveAiUsage({
      ...EMPTY_INPUT,
      footprint,
      carbAdviceHistory: [
        { date: '2026-08-01', day_type: 'medium', generated_at: 100, completeness: { meals_logged: 4, meals_total: 4, has_activity: true, complete: true }, advice: 'before', sources: [] },
        { date: '2026-08-02', day_type: 'medium', generated_at: 900, completeness: { meals_logged: 4, meals_total: 4, has_activity: true, complete: true }, advice: 'after (live-tracked already)', sources: [] },
      ],
    });
    expect(result.buckets.find((b) => b.bucket === 'carb_advice')!.callCount).toBe(1);
  });

  it('counts distinct photo_group_id values as the "scan" bucket, merging food_vision + receipt_scan', () => {
    const result = reconstructRetroactiveAiUsage({
      ...EMPTY_INPUT,
      foodLogHistory: [
        {
          date: '2026-08-01',
          entries: [
            makeLogEntry({ entry_id: 'a', source: 'ai', photo_group_id: 'g1' }),
            makeLogEntry({ entry_id: 'b', source: 'off', photo_group_id: 'g1' }),
            makeLogEntry({ entry_id: 'c', source: 'ciqual', photo_group_id: 'g2' }),
          ],
        },
      ],
      foodLogToday: [makeLogEntry({ entry_id: 'd', source: 'ai', photo_group_id: 'g3' })],
    });
    expect(result.buckets.find((b) => b.bucket === 'scan')!.callCount).toBe(3);
  });

  it('counts source:"ai" entries with no photo_group_id, plus AI-sourced habits, as "food_parse"', () => {
    const result = reconstructRetroactiveAiUsage({
      ...EMPTY_INPUT,
      foodLogToday: [
        makeLogEntry({ entry_id: 'a', source: 'ai' }), // text AI, no photo -> counted
        makeLogEntry({ entry_id: 'b', source: 'ai', photo_group_id: 'g1' }), // photo scan -> NOT counted here
        makeLogEntry({ entry_id: 'c', source: 'manual' }), // not AI at all
      ],
      habits: [
        { id: 'h1', label: 'Riz', off_code: null, source: 'ai', portion_g: 100, per100: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 }, day_type_tag: null, meal_slot: null, updated_at: 1 },
        { id: 'h2', label: 'Pâtes', off_code: null, source: 'manual', portion_g: 100, per100: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 }, day_type_tag: null, meal_slot: null, updated_at: 1 },
      ],
    });
    expect(result.buckets.find((b) => b.bucket === 'food_parse')!.callCount).toBe(2); // 1 log entry + 1 habit
  });
});
