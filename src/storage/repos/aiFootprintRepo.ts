// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { AiFeatureId, AiFeatureUsage, AiFootprintData } from '../../core/types';

const AI_FOOTPRINT_KEY = 'ai_footprint';

const EMPTY_USAGE: AiFeatureUsage = { promptTokens: 0, completionTokens: 0, callCount: 0 };

export const DEFAULT_AI_FOOTPRINT: AiFootprintData = {
  since: '',
  perFeature: {
    food_parse: { ...EMPTY_USAGE },
    food_vision: { ...EMPTY_USAGE },
    carb_advice: { ...EMPTY_USAGE },
    period_bilan: { ...EMPTY_USAGE },
    receipt_scan: { ...EMPTY_USAGE },
  },
};

export class AiFootprintRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<AiFootprintData> {
    const raw = await this.storage.get(AI_FOOTPRINT_KEY);
    if (!raw) return DEFAULT_AI_FOOTPRINT;
    try {
      const parsed = JSON.parse(raw) as Partial<AiFootprintData>;
      return {
        since: parsed.since || DEFAULT_AI_FOOTPRINT.since,
        perFeature: { ...DEFAULT_AI_FOOTPRINT.perFeature, ...(parsed.perFeature || {}) },
      };
    } catch {
      return DEFAULT_AI_FOOTPRINT;
    }
  }

  async save(data: AiFootprintData): Promise<void> {
    await this.storage.set(AI_FOOTPRINT_KEY, JSON.stringify(data));
  }

  // Read-modify-write increment for one feature — called by recordMistralUsage
  // (mistralClient.ts) right after each real AI call. Not atomic across concurrent calls
  // (Preferences has no transaction), acceptable: worst case under overlapping AI calls is
  // an undercount of a handful of tokens, never a crash.
  async recordUsage(feature: AiFeatureId, promptTokens: number, completionTokens: number): Promise<void> {
    const data = await this.load();
    const current = data.perFeature[feature] || { ...EMPTY_USAGE };
    const updated: AiFootprintData = {
      since: data.since || new Date().toISOString(),
      perFeature: {
        ...data.perFeature,
        [feature]: {
          promptTokens: current.promptTokens + promptTokens,
          completionTokens: current.completionTokens + completionTokens,
          callCount: current.callCount + 1,
        },
      },
    };
    await this.save(updated);
  }
}
