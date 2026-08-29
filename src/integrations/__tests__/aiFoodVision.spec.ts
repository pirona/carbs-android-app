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
import { analyzePlatePhoto } from '../aiFoodVision';

describe('analyzePlatePhoto', () => {
  beforeEach(() => {
    secureStore.clear();
    prefsStore.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('throws MissingAiKeyError without any network call when no key is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(analyzePlatePhoto('base64data', 'image/jpeg')).rejects.toBeInstanceOf(MissingAiKeyError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('embeds the image as a data: URL and maps the tool_call arguments', async () => {
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
                          components: [
                            { label: 'Riz', estimated_grams: 150, kcal_100g: 130, protein_100g: 2.7, fat_100g: 0.3, carb_100g: 28, confidence: 'medium' },
                          ],
                          overall_note: '',
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

    const result = await analyzePlatePhoto('base64data', 'image/jpeg');

    expect(sentBody.tools[0].function.name).toBe('extract_plate');
    const imagePart = sentBody.messages[0].content[1];
    expect(imagePart.image_url).toBe('data:image/jpeg;base64,base64data');
    expect(result.components).toHaveLength(1);
    expect(result.components[0].label).toBe('Riz');
    expect(result.overall_note).toBe('');
  });
});
