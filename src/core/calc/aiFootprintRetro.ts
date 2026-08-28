// SPDX-License-Identifier: GPL-3.0-or-later
// Best-effort reconstruction of AI call counts made BEFORE live usage tracking existed
// (see aiFootprint.ts/aiFootprintRepo.ts, added 2026-08-28) — no historical token data exists
// anywhere (never stored on-device, not retrievable from Mistral's API for a given key), so this
// can only ever produce a call-count estimate from indirect traces already kept for other
// reasons, converted to gCO2e/mL using THIS APP'S OWN real measured average tokens/call for that
// feature once at least one real call has been live-tracked. Until then, falls back to
// FALLBACK_TOKENS_PER_CALL — the exact 400-token reference size from the same Mistral/ADEME/
// Carbone 4 study that GCO2E_PER_TOKEN/ML_WATER_PER_TOKEN already come from (aiFootprint.ts), not
// a separate invented figure — so a number is always shown, and it self-corrects to the app's own
// real average the moment one exists (each bucket independently, as soon as that feature is used).
//
// Known sources of undercount (disclosed to the user, not silently hidden):
// - carb_advice/period_bilan history is replace-on-date-collision (one entry per day/range) —
//   a day where advice was regenerated more than once only leaves the last generated_at, losing
//   the earlier call(s).
// - "scan" only counts photo scans that were actually confirmed and logged (LogEntry.photo_group_id)
//   — an analyzed-but-abandoned photo, or a receipt saved directly as independent habits (no
//   photo_group_id on Habit), leaves no trace at all.
// - food_parse folds in Habit.source==='ai' entries (e.g. HabitsScreen's own "ajouter via IA")
//   as well as text-logged LogEntry.source==='ai' ones — a small number of these could actually
//   be photo-scan-originated habit-only saves (same limitation as above), misattributed here to
//   food_parse instead of scan. Left as-is: unresolvable without data that was never recorded.
import type { CarbAdviceHistoryEntry } from '../../storage/repos/carbAdviceHistoryRepo';
import type { CarbPeriodBilanHistoryEntry } from '../../storage/repos/carbPeriodBilanHistoryRepo';
import type { FoodLogHistoryEntry } from '../../storage/repos/foodLogHistoryRepo';
import type { Habit, LogEntry } from '../types';
import type { AiFootprintResult } from './aiFootprint';
import { GCO2E_PER_TOKEN, ML_WATER_PER_TOKEN } from './aiFootprint';

export type RetroBucketId = 'food_parse' | 'scan' | 'carb_advice' | 'period_bilan';

// Same reference call size the study itself uses ("une réponse de 400 tokens ≈ 1.14 gCO2e") —
// applied here only as the DEFAULT average tokens/call for a bucket with no live sample yet.
export const FALLBACK_TOKENS_PER_CALL = 400;

export interface RetroBucketResult {
  bucket: RetroBucketId;
  callCount: number;
  gCO2e: number;
  mlWater: number;
  // Whether gCO2e/mlWater used this app's own real measured average for this bucket, or the
  // FALLBACK_TOKENS_PER_CALL default — surfaced so the UI can mark a fallback-based figure.
  estimateSource: 'measured' | 'fallback';
}

export interface RetroactiveUsageResult {
  totalCallCount: number;
  buckets: RetroBucketResult[];
}

export interface RetroactiveUsageInput {
  carbAdviceHistory: CarbAdviceHistoryEntry[];
  carbPeriodBilanHistory: CarbPeriodBilanHistoryEntry[];
  foodLogHistory: FoodLogHistoryEntry[];
  foodLogToday: LogEntry[];
  habits: Habit[];
  // Live-tracked usage (see aiFootprint.ts) — both the boundary (its `since`, everything at or
  // after that timestamp is live-tracked already and must NOT also be reconstructed here) and
  // the source of the real per-feature averages applied to the reconstructed counts.
  footprint: AiFootprintResult;
}

const BUCKET_ORDER: RetroBucketId[] = ['food_parse', 'scan', 'carb_advice', 'period_bilan'];

function avgTokensPerCall(totalTokens: number, callCount: number): number | null {
  return callCount > 0 ? totalTokens / callCount : null;
}

function estimate(callCount: number, measuredAvgTokens: number | null): { gCO2e: number; mlWater: number; estimateSource: 'measured' | 'fallback' } {
  const estimateSource = measuredAvgTokens !== null ? 'measured' : 'fallback';
  const avgTokens = measuredAvgTokens ?? FALLBACK_TOKENS_PER_CALL;
  const estimatedTokens = callCount * avgTokens;
  return { gCO2e: estimatedTokens * GCO2E_PER_TOKEN, mlWater: estimatedTokens * ML_WATER_PER_TOKEN, estimateSource };
}

export function reconstructRetroactiveAiUsage(input: RetroactiveUsageInput): RetroactiveUsageResult {
  const sinceMs = input.footprint.since ? new Date(input.footprint.since).getTime() : Infinity;

  const carbAdviceCount = input.carbAdviceHistory.filter((e) => e.generated_at < sinceMs).length;
  const periodBilanCount = input.carbPeriodBilanHistory.filter((e) => e.generated_at < sinceMs).length;

  const allLogEntries: LogEntry[] = [...input.foodLogHistory.flatMap((d) => d.entries), ...input.foodLogToday].filter(
    (e) => e.updated_at < sinceMs,
  );
  const scanGroupIds = new Set(allLogEntries.filter((e) => e.photo_group_id).map((e) => e.photo_group_id));
  const scanCount = scanGroupIds.size;
  const textAiLogCount = allLogEntries.filter((e) => e.source === 'ai' && !e.photo_group_id).length;
  const aiHabitCount = input.habits.filter((h) => h.source === 'ai' && h.updated_at < sinceMs).length;
  const foodParseCount = textAiLogCount + aiHabitCount;

  const byFeature = (id: string) => input.footprint.perFeature.find((f) => f.feature === id);
  const foodParseLive = byFeature('food_parse');
  const foodVisionLive = byFeature('food_vision');
  const receiptScanLive = byFeature('receipt_scan');
  const carbAdviceLive = byFeature('carb_advice');
  const periodBilanLive = byFeature('period_bilan');

  const scanLiveTokens = (foodVisionLive?.totalTokens ?? 0) + (receiptScanLive?.totalTokens ?? 0);
  const scanLiveCalls = (foodVisionLive?.callCount ?? 0) + (receiptScanLive?.callCount ?? 0);

  const counts: Record<RetroBucketId, number> = {
    food_parse: foodParseCount,
    scan: scanCount,
    carb_advice: carbAdviceCount,
    period_bilan: periodBilanCount,
  };
  const avgTokens: Record<RetroBucketId, number | null> = {
    food_parse: avgTokensPerCall(foodParseLive?.totalTokens ?? 0, foodParseLive?.callCount ?? 0),
    scan: avgTokensPerCall(scanLiveTokens, scanLiveCalls),
    carb_advice: avgTokensPerCall(carbAdviceLive?.totalTokens ?? 0, carbAdviceLive?.callCount ?? 0),
    period_bilan: avgTokensPerCall(periodBilanLive?.totalTokens ?? 0, periodBilanLive?.callCount ?? 0),
  };

  const buckets = BUCKET_ORDER.map((bucket) => ({
    bucket,
    callCount: counts[bucket],
    ...estimate(counts[bucket], avgTokens[bucket]),
  }));

  return {
    totalCallCount: buckets.reduce((s, b) => s + b.callCount, 0),
    buckets,
  };
}
