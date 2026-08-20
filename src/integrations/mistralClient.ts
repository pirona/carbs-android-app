// SPDX-License-Identifier: GPL-3.0-or-later
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

// Same pattern as getNextcloudPassword/setNextcloudPassword (nextcloudWebdav.ts) — Android
// Keystore via SecureStorage, never @capacitor/preferences. Unlike the Nextcloud app password,
// this key must NEVER be included in the export/backup blob (see exportDump.ts/importExport.ts,
// deliberately left untouched by this module — the guarantee is by omission, not a filter).
const API_KEY_STORAGE_KEY = 'mistral_api_key';
const MISTRAL_CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';

export class MissingMistralKeyError extends Error {
  constructor() {
    super('Aucune clé Mistral configurée — ajoute-la dans Réglages pour utiliser l’IA.');
    this.name = 'MissingMistralKeyError';
  }
}

export async function getMistralApiKey(): Promise<string | null> {
  try {
    const v = await SecureStorage.get(API_KEY_STORAGE_KEY);
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

export async function setMistralApiKey(key: string): Promise<void> {
  if (!key) {
    await SecureStorage.remove(API_KEY_STORAGE_KEY);
    return;
  }
  await SecureStorage.set(API_KEY_STORAGE_KEY, key);
}

// Called at the top of each of the 3 AI functions, before any network call — a missing key
// must never reach fetch() at all, and the caller-facing message is this error's own text
// (see foodEntryForm.ts/PhotoScanScreen.ts/ConseilsScreen.ts catch blocks).
export async function requireMistralApiKey(): Promise<string> {
  const key = await getMistralApiKey();
  if (!key) throw new MissingMistralKeyError();
  return key;
}

export async function callMistralChat(body: Record<string, unknown>, apiKey: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(MISTRAL_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('délai dépassé, le serveur ne répond pas');
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Mirrors the "Extract tool_call" Code node shared by the old food-parse/food-vision n8n
// workflows: pull choices[0].message.tool_calls[0].function.arguments and parse it.
export function extractToolCallArguments(data: any): any {
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('réponse IA invalide (pas de tool_call)');
  try {
    return JSON.parse(call.function.arguments);
  } catch {
    throw new Error('réponse IA invalide (JSON illisible)');
  }
}

// Mirrors the old carb-advice workflow's "Parse Response" node: response_format:json_object
// puts the whole answer in choices[0].message.content as a JSON string, not a tool_call.
export function extractJsonModeContent(data: any): any {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('réponse IA invalide (contenu manquant)');
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('réponse IA invalide (JSON illisible)');
  }
}

export interface MistralConnectionTestResult {
  ok: boolean;
  message?: string;
}

// Trivial request (max_tokens:1) just to validate the key round-trips a 2xx — the caller
// (SettingsScreen) turns the raw error message (e.g. "HTTP 401", the timeout string) into the
// user-facing "✗ ..." label, same division of labor as everywhere else in this module.
export async function testMistralConnection(apiKey: string): Promise<MistralConnectionTestResult> {
  try {
    await callMistralChat(
      { model: 'mistral-small-latest', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] },
      apiKey,
      10_000,
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
