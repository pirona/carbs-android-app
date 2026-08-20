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

import {
  MissingMistralKeyError,
  callMistralChat,
  extractJsonModeContent,
  extractToolCallArguments,
  getMistralApiKey,
  requireMistralApiKey,
  setMistralApiKey,
  testMistralConnection,
} from '../mistralClient';

describe('mistralClient — key storage', () => {
  beforeEach(() => secureStore.clear());

  it('getMistralApiKey returns null when nothing is stored', async () => {
    expect(await getMistralApiKey()).toBeNull();
  });

  it('setMistralApiKey then getMistralApiKey round-trips the value', async () => {
    await setMistralApiKey('sk-abc');
    expect(await getMistralApiKey()).toBe('sk-abc');
  });

  it('setMistralApiKey with an empty string removes the key', async () => {
    await setMistralApiKey('sk-abc');
    await setMistralApiKey('');
    expect(await getMistralApiKey()).toBeNull();
  });

  it('requireMistralApiKey throws MissingMistralKeyError without any network call when no key is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(requireMistralApiKey()).rejects.toBeInstanceOf(MissingMistralKeyError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('requireMistralApiKey resolves the stored key', async () => {
    await setMistralApiKey('sk-abc');
    expect(await requireMistralApiKey()).toBe('sk-abc');
  });
});

describe('mistralClient — extraction helpers', () => {
  it('extractToolCallArguments parses a valid tool_call', () => {
    const data = { choices: [{ message: { tool_calls: [{ function: { arguments: '{"a":1}' } }] } }] };
    expect(extractToolCallArguments(data)).toEqual({ a: 1 });
  });

  it('extractToolCallArguments throws when there is no tool_call', () => {
    expect(() => extractToolCallArguments({ choices: [{ message: {} }] })).toThrow();
  });

  it('extractJsonModeContent parses valid JSON content', () => {
    const data = { choices: [{ message: { content: '{"advice":"x","sources":[]}' } }] };
    expect(extractJsonModeContent(data)).toEqual({ advice: 'x', sources: [] });
  });

  it('extractJsonModeContent throws on unparsable content', () => {
    const data = { choices: [{ message: { content: 'not json' } }] };
    expect(() => extractJsonModeContent(data)).toThrow();
  });
});

describe('mistralClient — callMistralChat / testMistralConnection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws HTTP <status> on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 401 })),
    );
    await expect(callMistralChat({}, 'sk-abc', 1000)).rejects.toThrow('HTTP 401');
  });

  it('turns an AbortError into the French timeout message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }),
    );
    await expect(callMistralChat({}, 'sk-abc', 1000)).rejects.toThrow('délai dépassé');
  });

  it('testMistralConnection returns ok:true on a 2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })),
    );
    const result = await testMistralConnection('sk-abc');
    expect(result).toEqual({ ok: true });
  });

  it('testMistralConnection surfaces the raw error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 401 })),
    );
    const result = await testMistralConnection('sk-bad');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('HTTP 401');
  });
});
