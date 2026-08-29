// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';

// Which AI backend the app's 5 direct chat-completions calls (see aiClient.ts) hit. Added
// 2026-08-29 after a real incident where the user's Mistral account couldn't call any
// "large" model (403 tier_not_allowed) — the fix highlighted that hardcoding one cloud
// vendor meant any tier/availability change needed a code change. 'ollama' and
// 'openai_compatible' both speak the same OpenAI-shaped chat/completions endpoint Ollama and
// Mistral already use, so no protocol-specific code is needed per provider — only the base
// URL and whether an API key is required differ (see aiClient.ts's resolveChatUrl).
export type AiProviderKind = 'mistral' | 'ollama' | 'openai_compatible';

export interface AiProviderSettings {
  provider: AiProviderKind;
  // Ignored for 'mistral' (fixed https://api.mistral.ai). For 'ollama'/'openai_compatible',
  // must include the API version path the server expects (e.g. Ollama's OpenAI-compat
  // endpoint is http://<host>:11434/v1, not just http://<host>:11434) — the app always
  // appends "/chat/completions" to this value verbatim, never guesses a path segment.
  baseUrl: string;
}

export const DEFAULT_AI_PROVIDER: AiProviderSettings = { provider: 'mistral', baseUrl: '' };

const AI_PROVIDER_KEY = 'ai_provider';

export class AiProviderRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<AiProviderSettings> {
    const raw = await this.storage.get(AI_PROVIDER_KEY);
    if (!raw) return DEFAULT_AI_PROVIDER;
    try {
      return { ...DEFAULT_AI_PROVIDER, ...(JSON.parse(raw) as Partial<AiProviderSettings>) };
    } catch {
      return DEFAULT_AI_PROVIDER;
    }
  }

  async save(settings: AiProviderSettings): Promise<void> {
    await this.storage.set(AI_PROVIDER_KEY, JSON.stringify(settings));
  }
}
