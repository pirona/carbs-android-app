// SPDX-License-Identifier: GPL-3.0-or-later
// Pure merge functions for the migration Import screen — no storage I/O here, see
// src/migration/importExport.ts for the orchestrator that wires these to the repos.
//
// Merge policy (plan §Migration — "idempotent, ré-importable sans dupliquer"):
//  - Arrays keyed by a stable, meaningful identity (date, week+year) with NO updated_at
//    field (day_history, carb_history): union by key, existing entry wins on conflict —
//    these are historical facts already tracked live in the app and must never regress
//    from re-importing an older export.
//  - Arrays with an updated_at field (food_habits, food_log_today entries): most-recent
//    updated_at wins on conflict — mirrors the old n8n sync's merge rule.
//  - sport_plan (date -> kcal object): union, existing value wins on conflict.
//  - Singleton "current state" snapshots (current_day, sport_kcal, plaisir_overrides,
//    plaisir_week, food_habits_sort_mode): only adopted from the import when nothing is
//    currently stored — never clobber live state with a stale export.

export interface MergeResult<T> {
  merged: T;
  added: number;
  skipped: number;
}

export function mergeByKey<T>(
  existing: T[],
  incoming: T[],
  keyOf: (item: T) => string,
): MergeResult<T[]> {
  const byKey = new Map<string, T>();
  existing.forEach((item) => byKey.set(keyOf(item), item));
  let added = 0;
  let skipped = 0;
  incoming.forEach((item) => {
    const k = keyOf(item);
    if (byKey.has(k)) {
      skipped++;
    } else {
      byKey.set(k, item);
      added++;
    }
  });
  return { merged: [...byKey.values()], added, skipped };
}

export function mergeByUpdatedAt<T extends { updated_at: number }>(
  existing: T[],
  incoming: T[],
  keyOf: (item: T) => string,
): MergeResult<T[]> {
  const byKey = new Map<string, T>();
  existing.forEach((item) => byKey.set(keyOf(item), item));
  let added = 0;
  let skipped = 0;
  incoming.forEach((item) => {
    const k = keyOf(item);
    const current = byKey.get(k);
    if (!current) {
      byKey.set(k, item);
      added++;
    } else if (item.updated_at > current.updated_at) {
      byKey.set(k, item);
      added++;
    } else {
      skipped++;
    }
  });
  return { merged: [...byKey.values()], added, skipped };
}

export function mergeRecord(
  existing: Record<string, number>,
  incoming: Record<string, number>,
): MergeResult<Record<string, number>> {
  const merged = { ...existing };
  let added = 0;
  let skipped = 0;
  Object.entries(incoming).forEach(([k, v]) => {
    if (k in merged) {
      skipped++;
    } else {
      merged[k] = v;
      added++;
    }
  });
  return { merged, added, skipped };
}
