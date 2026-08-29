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

import {
  MissingAiKeyError,
  MissingAiBaseUrlError,
  callAiChat,
  extractJsonModeContent,
  extractToolCallArguments,
  getAiApiKey,
  requireAiCallContext,
  setAiApiKey,
  loadAiProvider,
  saveAiProvider,
  testAiConnection,
} from '../aiClient';

describe('aiClient — key storage', () => {
  beforeEach(() => {
    secureStore.clear();
    prefsStore.clear();
  });

  it('getAiApiKey returns null when nothing is stored', async () => {
    expect(await getAiApiKey()).toBeNull();
  });

  it('setAiApiKey then getAiApiKey round-trips the value', async () => {
    await setAiApiKey('sk-abc');
    expect(await getAiApiKey()).toBe('sk-abc');
  });

  it('setAiApiKey with an empty string removes the key', async () => {
    await setAiApiKey('sk-abc');
    await setAiApiKey('');
    expect(await getAiApiKey()).toBeNull();
  });
});

describe('aiClient — requireAiCallContext', () => {
  beforeEach(() => {
    secureStore.clear();
    prefsStore.clear();
  });

  it('defaults to the mistral provider and throws MissingAiKeyError when no key is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(requireAiCallContext()).rejects.toBeInstanceOf(MissingAiKeyError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('resolves a mistral context once a key is set, with no baseUrl required', async () => {
    await setAiApiKey('sk-abc');
    const ctx = await requireAiCallContext();
    expect(ctx).toEqual({ provider: 'mistral', baseUrl: '', apiKey: 'sk-abc' });
  });

  it('throws MissingAiBaseUrlError for ollama when no base URL is configured, even without a key', async () => {
    await saveAiProvider({ provider: 'ollama', baseUrl: '' });
    await expect(requireAiCallContext()).rejects.toBeInstanceOf(MissingAiBaseUrlError);
  });

  it('resolves an ollama context with no key at all — a local server needs none by default', async () => {
    await saveAiProvider({ provider: 'ollama', baseUrl: 'http://192.168.1.2:11434/v1' });
    const ctx = await requireAiCallContext();
    expect(ctx).toEqual({ provider: 'ollama', baseUrl: 'http://192.168.1.2:11434/v1', apiKey: null });
  });

  it('resolves an openai_compatible context with both a base URL and an optional key', async () => {
    await saveAiProvider({ provider: 'openai_compatible', baseUrl: 'https://openrouter.ai/api/v1' });
    await setAiApiKey('sk-router');
    const ctx = await requireAiCallContext();
    expect(ctx).toEqual({ provider: 'openai_compatible', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-router' });
  });

  it('loadAiProvider/saveAiProvider round-trip', async () => {
    await saveAiProvider({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1' });
    expect(await loadAiProvider()).toEqual({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1' });
  });
});

describe('aiClient — extraction helpers', () => {
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

describe('aiClient — callAiChat / testAiConnection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hits the fixed Mistral URL for the mistral provider, with an Authorization header', async () => {
    let seenUrl = '';
    let seenAuth: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        seenUrl = url;
        seenAuth = (init.headers as Record<string, string>).Authorization;
        return new Response(JSON.stringify({ choices: [] }), { status: 200 });
      }),
    );
    await callAiChat({}, { provider: 'mistral', baseUrl: '', apiKey: 'sk-abc' }, 1000);
    expect(seenUrl).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(seenAuth).toBe('Bearer sk-abc');
  });

  it('appends /chat/completions to the configured base URL for ollama/openai_compatible, omitting auth when there is no key', async () => {
    let seenUrl = '';
    let seenHeaders: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        seenUrl = url;
        seenHeaders = init.headers as Record<string, string>;
        return new Response(JSON.stringify({ choices: [] }), { status: 200 });
      }),
    );
    await callAiChat({}, { provider: 'ollama', baseUrl: 'http://192.168.1.2:11434/v1/', apiKey: null }, 1000);
    expect(seenUrl).toBe('http://192.168.1.2:11434/v1/chat/completions');
    expect(seenHeaders.Authorization).toBeUndefined();
  });

  it('throws HTTP <status> on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 401 })),
    );
    await expect(callAiChat({}, { provider: 'mistral', baseUrl: '', apiKey: 'sk-abc' }, 1000)).rejects.toThrow('HTTP 401');
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
    await expect(callAiChat({}, { provider: 'mistral', baseUrl: '', apiKey: 'sk-abc' }, 1000)).rejects.toThrow('délai dépassé');
  });

  it('testAiConnection returns ok:true on a 2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })),
    );
    const result = await testAiConnection({ provider: 'mistral', baseUrl: '', apiKey: 'sk-abc' }, 'mistral-small-latest');
    expect(result).toEqual({ ok: true });
  });

  it('testAiConnection surfaces the raw error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 401 })),
    );
    const result = await testAiConnection({ provider: 'mistral', baseUrl: '', apiKey: 'sk-bad' }, 'mistral-small-latest');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('HTTP 401');
  });
});
