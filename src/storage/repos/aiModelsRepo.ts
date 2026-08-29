// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';
import type { AiProviderKind } from './aiProviderRepo';

// User-editable model ids for the 5 direct chat-completions calls (aiClient.ts's 4 feature
// files + the shared advice/bilan model) — added after a real incident (2026-08-29) where
// Mistral returned 403 tier_not_allowed for this account's tier. Free-text on purpose —
// every provider (Mistral, Ollama, a 3rd-party OpenAI-compatible host) adds/renames model ids
// on its own schedule, an enum here would need a code change just as often as the previous
// hardcoded string did.
export interface AiModelSettings {
  // food_parse (text interpretation)
  textModel: string;
  // food_vision (plate photo scan) — needs a vision-capable model; not every local Ollama
  // model handles images, see PROVIDER_DEFAULT_MODELS' comment below.
  visionModel: string;
  // receipt_scan (receipt photo scan) — same vision requirement as visionModel.
  receiptModel: string;
  // carb_advice + period_bilan share one field: same reasoning-quality need, no reason to
  // expose two identical fields.
  adviceModel: string;
}

export const DEFAULT_AI_MODELS: AiModelSettings = {
  textModel: 'mistral-small-latest',
  visionModel: 'mistral-small-latest',
  receiptModel: 'mistral-small-latest',
  adviceModel: 'mistral-small-latest',
};

// Suggested defaults per provider, offered by the Settings "reset to defaults" button once the
// user switches provider — never applied automatically on switch, so a customized model name
// survives a round-trip through another provider and back. Ollama's vision defaults point at
// llava rather than the text-only llama3.1 default — the user must have pulled a vision-capable
// model locally for photo/receipt scan to work at all; if they haven't, the call fails with a
// clear HTTP/model-not-found error the same way a missing Mistral tier does today, never silently.
export const PROVIDER_DEFAULT_MODELS: Record<AiProviderKind, AiModelSettings> = {
  mistral: { textModel: 'mistral-small-latest', visionModel: 'mistral-small-latest', receiptModel: 'mistral-small-latest', adviceModel: 'mistral-small-latest' },
  ollama: { textModel: 'llama3.1', visionModel: 'llava', receiptModel: 'llava', adviceModel: 'llama3.1' },
  openai_compatible: { textModel: '', visionModel: '', receiptModel: '', adviceModel: '' },
};

const AI_MODELS_KEY = 'mistral_models';

export class AiModelsRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<AiModelSettings> {
    const raw = await this.storage.get(AI_MODELS_KEY);
    if (!raw) return DEFAULT_AI_MODELS;
    try {
      return { ...DEFAULT_AI_MODELS, ...(JSON.parse(raw) as Partial<AiModelSettings>) };
    } catch {
      return DEFAULT_AI_MODELS;
    }
  }

  async save(settings: AiModelSettings): Promise<void> {
    await this.storage.set(AI_MODELS_KEY, JSON.stringify(settings));
  }
}
