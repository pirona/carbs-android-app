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
import { analyzeReceiptPhoto } from '../aiReceiptScan';

describe('analyzeReceiptPhoto', () => {
  beforeEach(() => {
    secureStore.clear();
    prefsStore.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('throws MissingAiKeyError without any network call when no key is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(analyzeReceiptPhoto('base64data', 'image/jpeg')).rejects.toBeInstanceOf(MissingAiKeyError);
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
                          items: [
                            { label: 'Yaourt fraise', raw_text: 'YOP FRAISE 4X85G', quantity: 1, confidence: 'high' },
                            { label: 'Pâtes', raw_text: 'PATES BARILLA', quantity: 2, confidence: 'medium' },
                          ],
                          merchant_note: '',
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

    const result = await analyzeReceiptPhoto('base64data', 'image/jpeg');

    expect(sentBody.tools[0].function.name).toBe('extract_receipt_items');
    const imagePart = sentBody.messages[0].content[1];
    expect(imagePart.image_url).toBe('data:image/jpeg;base64,base64data');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].label).toBe('Yaourt fraise');
    expect(result.merchant_note).toBe('');
  });

  it('never asks the model for nutrition macros — regression guard on the tool schema', async () => {
    secureStore.set('mistral_api_key', 'sk-abc');
    let sentBody: any;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { arguments: '{"items":[],"merchant_note":""}' } }] } }] }), { status: 200 });
      }),
    );

    await analyzeReceiptPhoto('base64data', 'image/jpeg');

    const itemProps = sentBody.tools[0].function.parameters.properties.items.items.properties;
    const macroKeys = ['kcal_100g', 'protein_100g', 'fat_100g', 'carb_100g'];
    for (const key of macroKeys) {
      expect(itemProps).not.toHaveProperty(key);
    }
  });

  it('defaults items/merchant_note when the tool_call arguments are malformed', async () => {
    secureStore.set('mistral_api_key', 'sk-abc');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { arguments: '{}' } }] } }] }), { status: 200 })),
    );

    const result = await analyzeReceiptPhoto('base64data', 'image/jpeg');

    expect(result.items).toEqual([]);
    expect(result.merchant_note).toBe('');
  });
});
