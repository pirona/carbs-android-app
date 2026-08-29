// SPDX-License-Identifier: GPL-3.0-or-later
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { PreferencesStorageAdapter } from '../storage/PreferencesStorageAdapter';
import { AiFootprintRepo } from '../storage/repos/aiFootprintRepo';
import { AiModelsRepo, type AiModelSettings } from '../storage/repos/aiModelsRepo';
import { AiProviderRepo, type AiProviderSettings, type AiProviderKind } from '../storage/repos/aiProviderRepo';
import type { AiFeatureId } from '../core/types';

// Same pattern as getNextcloudPassword/setNextcloudPassword (nextcloudWebdav.ts) — Android
// Keystore via SecureStorage, never @capacitor/preferences. Unlike the Nextcloud app password,
// this key must NEVER be included in the export/backup blob (see exportDump.ts/importExport.ts,
// deliberately left untouched by this module — the guarantee is by omission, not a filter).
// Storage key kept as its historical literal — this app started Mistral-only, existing
// installs already have a key saved under this name. It now holds the credential for
// whichever provider is configured (empty/unset for a keyless local Ollama), not just Mistral.
const API_KEY_STORAGE_KEY = 'mistral_api_key';

export class MissingAiKeyError extends Error {
  constructor() {
    super('Aucune clé API configurée — ajoute-la dans Réglages pour utiliser l’IA.');
    this.name = 'MissingAiKeyError';
  }
}

export class MissingAiBaseUrlError extends Error {
  constructor() {
    super('Aucune URL de serveur IA configurée — ajoute-la dans Réglages pour utiliser l’IA.');
    this.name = 'MissingAiBaseUrlError';
  }
}

export async function getAiApiKey(): Promise<string | null> {
  try {
    const v = await SecureStorage.get(API_KEY_STORAGE_KEY);
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

export async function setAiApiKey(key: string): Promise<void> {
  if (!key) {
    await SecureStorage.remove(API_KEY_STORAGE_KEY);
    return;
  }
  await SecureStorage.set(API_KEY_STORAGE_KEY, key);
}

const providerRepo = new AiProviderRepo(new PreferencesStorageAdapter());

export async function loadAiProvider(): Promise<AiProviderSettings> {
  return providerRepo.load();
}

export async function saveAiProvider(settings: AiProviderSettings): Promise<void> {
  await providerRepo.save(settings);
}

export interface AiCallContext {
  provider: AiProviderKind;
  baseUrl: string;
  apiKey: string | null;
}

// Called at the top of each of the 5 AI functions, before any network call — a missing
// key/URL must never reach fetch() at all, and the caller-facing message is the thrown
// error's own text (see foodEntryForm.ts/PhotoScanScreen.ts/ConseilsScreen.ts catch blocks,
// all of which now catch on `instanceof Error` with these two subclasses treated the same way
// as any other config problem — no per-error-type branching needed there).
export async function requireAiCallContext(): Promise<AiCallContext> {
  const settings = await providerRepo.load();
  const apiKey = await getAiApiKey();
  // Mistral has no meaningful "no key" mode — every account needs one. Ollama/openai_compatible
  // may run keyless (a local Ollama server has no auth by default); a key is sent if present
  // (harmless for a server that ignores it) but never required.
  if (settings.provider === 'mistral' && !apiKey) throw new MissingAiKeyError();
  if (settings.provider !== 'mistral' && !settings.baseUrl) throw new MissingAiBaseUrlError();
  return { provider: settings.provider, baseUrl: settings.baseUrl, apiKey };
}

// Ollama's OpenAI-compatible endpoint and any 3rd-party "OpenAI-compatible" host (OpenRouter,
// LM Studio, vLLM...) both expect the base URL entered in Settings to already include the API
// version path (e.g. http://192.168.1.2:11434/v1) — this only ever appends the fixed suffix,
// never guesses or rewrites what the user typed.
function resolveChatUrl(ctx: Pick<AiCallContext, 'provider' | 'baseUrl'>): string {
  if (ctx.provider === 'mistral') return 'https://api.mistral.ai/v1/chat/completions';
  return `${ctx.baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

export async function callAiChat(body: Record<string, unknown>, ctx: AiCallContext, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ctx.apiKey) headers.Authorization = `Bearer ${ctx.apiKey}`;
    res = await fetch(resolveChatUrl(ctx), {
      method: 'POST',
      headers,
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

// Self-contained, same style as this module's private ownership of the API key storage —
// no repo threaded through the 5 feature functions' signatures for this side-channel.
const footprintRepo = new AiFootprintRepo(new PreferencesStorageAdapter());

// Same self-contained pattern — the 4 UI call sites (foodEntryForm.ts, PhotoScanScreen.ts,
// ConseilsScreen.ts) load this once per call and pass the field they need as the integration
// function's optional `model` argument, rather than threading a repo through DayScreen/
// HabitsScreen/PhotoScanScreen/ConseilsScreen just for this. Settings reads/writes it directly.
const modelsRepo = new AiModelsRepo(new PreferencesStorageAdapter());

export async function loadAiModels(): Promise<AiModelSettings> {
  return modelsRepo.load();
}

export async function saveAiModels(settings: AiModelSettings): Promise<void> {
  await modelsRepo.save(settings);
}

// Best-effort usage tracking, called (not awaited) by each of the 5 feature files right after
// their own callAiChat resolves — never by testAiConnection, whose max_tokens:1 ping isn't
// meaningful app usage. Must never throw or affect the calling feature's success/failure path
// (see core/calc/aiFootprint.ts for what this feeds — the Settings "Impact IA" card). Its
// gCO2e/mL methodology is Mistral-specific (see that file's comment) — usage is still recorded
// for other providers so call counts stay accurate, but the footprint figure under- or
// over-states reality for a non-Mistral provider; not corrected here, out of scope for this
// multi-provider change.
export async function recordAiUsage(feature: AiFeatureId, data: any): Promise<void> {
  try {
    const usage = data?.usage;
    const promptTokens = Number(usage?.prompt_tokens) || 0;
    const completionTokens = Number(usage?.completion_tokens) || 0;
    if (promptTokens === 0 && completionTokens === 0) return;
    await footprintRepo.recordUsage(feature, promptTokens, completionTokens);
  } catch {
    // Silent — see comment above.
  }
}

export interface AiConnectionTestResult {
  ok: boolean;
  message?: string;
}

// Trivial request (max_tokens:1) just to validate the config round-trips a 2xx — the caller
// (SettingsScreen) turns the raw error message (e.g. "HTTP 401", the timeout string) into the
// user-facing "✗ ..." label, same division of labor as everywhere else in this module. Takes
// the model explicitly (no sensible single hardcoded default across 3 providers) — the caller
// passes whatever the "text" model field currently holds.
export async function testAiConnection(ctx: AiCallContext, model: string): Promise<AiConnectionTestResult> {
  try {
    await callAiChat({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }, ctx, 10_000);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
