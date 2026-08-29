// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = new Map<string, string>();
const prefsStore = new Map<string, string>();

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    async get(key: string) {
      return secureStore.has(key) ? secureStore.get(key)! : null;
    },
    async set(key: string, value: string) {
      secureStore.set(key, value);
    },
    async remove(key: string) {
      secureStore.delete(key);
    },
  },
}));

// aiClient.ts's requireAiCallContext() now also reads the configured provider (Preferences,
// not SecureStorage) before every call — an empty store here resolves to DEFAULT_AI_PROVIDER
// (provider: 'mistral'), matching this file's existing mistral-only expectations.
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    async get({ key }: { key: string }) {
      return { value: prefsStore.has(key) ? prefsStore.get(key)! : null };
    },
    async set({ key, value }: { key: string; value: string }) {
      prefsStore.set(key, value);
    },
    async remove({ key }: { key: string }) {
      prefsStore.delete(key);
    },
    async keys() {
      return { keys: [...prefsStore.keys()] };
    },
  },
}));

import { MissingAiKeyError } from '../aiClient';
import { parseFoodText } from '../aiFoodParse';

describe('parseFoodText', () => {
  beforeEach(() => {
    secureStore.clear();
    prefsStore.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('throws MissingAiKeyError without any network call when no key is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(parseFoodText('2 tartines')).rejects.toBeInstanceOf(MissingAiKeyError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('sends the tool-calling request and maps the tool_call arguments to FoodParseResult', async () => {
    secureStore.set('mistral_api_key', 'sk-abc');
    let sentBody: any;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      function: {
                        arguments: JSON.stringify({
                          label: 'Pomme',
                          portion_g: 150,
                          kcal_100g: 52,
                          protein_100g: 0.3,
                          fat_100g: 0.2,
                          carb_100g: 14,
                          confidence: 'high',
                          note: '',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );

    const result = await parseFoodText('une pomme');

    expect(sentBody.model).toBe('mistral-small-latest');
    expect(sentBody.tools[0].function.name).toBe('extract_nutrition');
    expect(sentBody.messages[0].content).toBe('une pomme');
    expect(result).toEqual({
      label: 'Pomme',
      portion_g: 150,
      per100: { kcal: 52, protein_g: 0.3, fat_g: 0.2, carb_g: 14 },
      confidence: 'high',
      note: null,
    });
  });
});
