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
import { fetchPeriodBilan, type PeriodBilanRequest } from '../aiPeriodBilan';

const PAYLOAD: PeriodBilanRequest = {
  start_date: '2026-08-03',
  end_date: '2026-08-09',
  profile: { sex: 'male', age: 30, height_cm: 180, weight_goal_kg: 80 },
  stats: {
    total_days: 7,
    tracked_days: 6,
    real_deficit_kcal: 2000,
    avg_food_kcal: 1800,
    avg_protein_g: 120,
    avg_fat_g: 60,
    avg_carb_g: 180,
    weight_start_kg: 90,
    weight_end_kg: 89,
    weight_delta_kg: -1,
    day_type_counts: { high: 2, medium: 3, low: 1, plaisir: 0 },
  },
  data_completeness: { tracked_days: 6, total_days: 7, complete: true },
};

describe('fetchPeriodBilan', () => {
  beforeEach(() => {
    secureStore.clear();
    prefsStore.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('throws MissingAiKeyError without any network call when no key is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(fetchPeriodBilan(PAYLOAD)).rejects.toBeInstanceOf(MissingAiKeyError);
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
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ bilan: 'Déficit cohérent avec la perte de poids.', sources: ['ANSES'] }) } }] }),
          { status: 200 },
        );
      }),
    );

    const result = await fetchPeriodBilan(PAYLOAD);

    expect(sentBody.model).toBe('mistral-small-latest');
    expect(sentBody.response_format).toEqual({ type: 'json_object' });
    expect(sentBody.messages[0].role).toBe('system');
    expect(sentBody.messages[0].content).toContain('ANSES');
    expect(sentBody.messages[1].content).toContain('"start_date": "2026-08-03"');
    expect(result).toEqual({ bilan: 'Déficit cohérent avec la perte de poids.', sources: ['ANSES'] });
  });

  it('throws when the model returns an empty bilan string', async () => {
    secureStore.set('mistral_api_key', 'sk-abc');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ bilan: '', sources: [] }) } }] }), { status: 200 })),
    );
    await expect(fetchPeriodBilan(PAYLOAD)).rejects.toThrow('Réponse IA vide');
  });
});
