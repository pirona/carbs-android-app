// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = new Map<string, string>();

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

import { MissingMistralKeyError } from '../mistralClient';
import { fetchCarbAdvice, type CarbAdviceRequest } from '../mistralCarbAdvice';

const PAYLOAD: CarbAdviceRequest = {
  date: '2026-08-20',
  day_type: 'medium',
  profile: { sex: 'male', age: 30, height_cm: 180, weight_kg: 90, weight_goal_kg: 80 },
  bmr_kcal: 2000,
  burned_kcal: 300,
  steps: 8000,
  target: { kcal: 1800, protein_g: 150, fat_g: 60, carb_g: 150 },
  actual: { kcal: 1700, protein_g: 140, fat_g: 55, carb_g: 130 },
  meals: { petit_dej: [], dejeuner: [], diner: [], collation: [] },
};

describe('fetchCarbAdvice', () => {
  beforeEach(() => secureStore.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('throws MissingMistralKeyError without any network call when no key is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(fetchCarbAdvice(PAYLOAD)).rejects.toBeInstanceOf(MissingMistralKeyError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('sends the json_object request with the system prompt and maps the parsed content', async () => {
    secureStore.set('mistral_api_key', 'sk-abc');
    let sentBody: any;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ advice: 'Mange moins de pain.', sources: ['ANSES'] }) } }] }),
          { status: 200 },
        );
      }),
    );

    const result = await fetchCarbAdvice(PAYLOAD);

    expect(sentBody.model).toBe('mistral-large-latest');
    expect(sentBody.response_format).toEqual({ type: 'json_object' });
    expect(sentBody.messages[0].role).toBe('system');
    expect(sentBody.messages[0].content).toContain('ANSES');
    expect(sentBody.messages[1].content).toContain('"date": "2026-08-20"');
    expect(result).toEqual({ advice: 'Mange moins de pain.', sources: ['ANSES'] });
  });

  it('throws when the model returns an empty advice string', async () => {
    secureStore.set('mistral_api_key', 'sk-abc');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ advice: '', sources: [] }) } }] }), { status: 200 })),
    );
    await expect(fetchCarbAdvice(PAYLOAD)).rejects.toThrow('Réponse IA vide');
  });
});
