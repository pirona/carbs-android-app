// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { AiFootprintRepo, DEFAULT_AI_FOOTPRINT } from '../aiFootprintRepo';
import { InMemoryStorageAdapter } from '../../InMemoryStorageAdapter';

describe('AiFootprintRepo', () => {
  it('returns the default (all-zero) footprint when unset', async () => {
    const repo = new AiFootprintRepo(new InMemoryStorageAdapter());
    expect(await repo.load()).toEqual(DEFAULT_AI_FOOTPRINT);
  });

  it('records usage for a feature and sets `since` on the first call', async () => {
    const repo = new AiFootprintRepo(new InMemoryStorageAdapter());
    await repo.recordUsage('food_parse', 300, 100);
    const data = await repo.load();
    expect(data.perFeature.food_parse).toEqual({ promptTokens: 300, completionTokens: 100, callCount: 1 });
    expect(data.since).not.toBe('');
  });

  it('accumulates successive calls for the same feature rather than overwriting', async () => {
    const repo = new AiFootprintRepo(new InMemoryStorageAdapter());
    await repo.recordUsage('food_parse', 300, 100);
    await repo.recordUsage('food_parse', 50, 20);
    const data = await repo.load();
    expect(data.perFeature.food_parse).toEqual({ promptTokens: 350, completionTokens: 120, callCount: 2 });
  });

  it('does not cross-contaminate counters between different features', async () => {
    const repo = new AiFootprintRepo(new InMemoryStorageAdapter());
    await repo.recordUsage('food_parse', 300, 100);
    await repo.recordUsage('carb_advice', 1000, 500);
    const data = await repo.load();
    expect(data.perFeature.food_parse).toEqual({ promptTokens: 300, completionTokens: 100, callCount: 1 });
    expect(data.perFeature.carb_advice).toEqual({ promptTokens: 1000, completionTokens: 500, callCount: 1 });
    expect(data.perFeature.food_vision).toEqual({ promptTokens: 0, completionTokens: 0, callCount: 0 });
  });

  it('never overwrites `since` on a second call', async () => {
    const repo = new AiFootprintRepo(new InMemoryStorageAdapter());
    await repo.recordUsage('food_parse', 300, 100);
    const first = await repo.load();
    await repo.recordUsage('food_parse', 50, 20);
    const second = await repo.load();
    expect(second.since).toBe(first.since);
  });

  it('falls back to the default footprint on corrupted JSON in storage', async () => {
    const storage = new InMemoryStorageAdapter();
    await storage.set('ai_footprint', '{not json');
    const repo = new AiFootprintRepo(storage);
    expect(await repo.load()).toEqual(DEFAULT_AI_FOOTPRINT);
  });

  it('round-trips an arbitrary saved footprint', async () => {
    const repo = new AiFootprintRepo(new InMemoryStorageAdapter());
    const data = {
      since: '2026-01-01T00:00:00.000Z',
      perFeature: {
        ...DEFAULT_AI_FOOTPRINT.perFeature,
        receipt_scan: { promptTokens: 42, completionTokens: 7, callCount: 3 },
      },
    };
    await repo.save(data);
    expect(await repo.load()).toEqual(data);
  });
});
