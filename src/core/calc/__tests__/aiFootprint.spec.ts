// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { calcAiFootprint, GCO2E_PER_TOKEN, ML_WATER_PER_TOKEN } from '../aiFootprint';
import { DEFAULT_AI_FOOTPRINT } from '../../../storage/repos/aiFootprintRepo';
import type { AiFootprintData } from '../../types';

describe('calcAiFootprint', () => {
  it('matches the published reference figure (400 tokens ≈ 1.14 gCO2e / 45 mL water)', () => {
    const data: AiFootprintData = {
      since: '2026-01-01T00:00:00.000Z',
      perFeature: {
        ...DEFAULT_AI_FOOTPRINT.perFeature,
        food_parse: { promptTokens: 300, completionTokens: 100, callCount: 2 },
      },
    };
    const result = calcAiFootprint(data);
    const foodParse = result.perFeature.find((f) => f.feature === 'food_parse')!;
    expect(foodParse.totalTokens).toBe(400);
    expect(foodParse.gCO2e).toBeCloseTo(1.14, 5);
    expect(foodParse.mlWater).toBeCloseTo(45, 5);
    expect(GCO2E_PER_TOKEN * 400).toBeCloseTo(1.14, 5);
    expect(ML_WATER_PER_TOKEN * 400).toBeCloseTo(45, 5);
  });

  it('aggregates totals across multiple non-zero features', () => {
    const data: AiFootprintData = {
      since: '2026-01-01T00:00:00.000Z',
      perFeature: {
        ...DEFAULT_AI_FOOTPRINT.perFeature,
        food_parse: { promptTokens: 200, completionTokens: 0, callCount: 1 },
        carb_advice: { promptTokens: 500, completionTokens: 300, callCount: 2 },
      },
    };
    const result = calcAiFootprint(data);
    expect(result.totalTokens).toBe(1000);
    expect(result.totalCallCount).toBe(3);
    expect(result.totalGCO2e).toBeCloseTo(1000 * GCO2E_PER_TOKEN, 5);
    expect(result.totalMlWater).toBeCloseTo(1000 * ML_WATER_PER_TOKEN, 5);
  });

  it('returns all-zero results and since:null for the default (empty) data', () => {
    const result = calcAiFootprint(DEFAULT_AI_FOOTPRINT);
    expect(result.since).toBeNull();
    expect(result.totalTokens).toBe(0);
    expect(result.totalCallCount).toBe(0);
    expect(result.totalGCO2e).toBe(0);
    expect(result.totalMlWater).toBe(0);
    expect(result.perFeature.every((f) => f.totalTokens === 0 && f.callCount === 0)).toBe(true);
  });

  it('always returns features in a stable order regardless of the input object key order', () => {
    const data: AiFootprintData = {
      since: '',
      perFeature: {
        receipt_scan: { promptTokens: 1, completionTokens: 0, callCount: 1 },
        period_bilan: { promptTokens: 1, completionTokens: 0, callCount: 1 },
        carb_advice: { promptTokens: 1, completionTokens: 0, callCount: 1 },
        food_vision: { promptTokens: 1, completionTokens: 0, callCount: 1 },
        food_parse: { promptTokens: 1, completionTokens: 0, callCount: 1 },
      },
    };
    const result = calcAiFootprint(data);
    expect(result.perFeature.map((f) => f.feature)).toEqual(['food_parse', 'food_vision', 'carb_advice', 'period_bilan', 'receipt_scan']);
  });
});
