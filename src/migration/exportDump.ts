// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../storage/StorageAdapter';

export interface ExportEntry {
  key: string;
  value: unknown;
  description: string;
}

function describe(key: string, value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return `${value.length} entrée(s)`;
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (key === 'food_log_today' && Array.isArray(v.entries)) return `${v.entries.length} entrée(s) (aujourd'hui)`;
    if (key === 'plaisir_overrides' && v.levels && typeof v.levels === 'object') {
      return `${Object.keys(v.levels as object).length} jour(s) (semaine en cours)`;
    }
    if (key === 'sport_plan') return `${Object.keys(v).length} jour(s) planifiés`;
    return 'présent';
  }
  return String(value);
}

// Raw dump of every key currently in storage — mirrors export.html's read-only dump,
// but reads from Preferences instead of localStorage. Used by both the Export screen's
// backup blob and its on-screen counts summary.
export async function dumpAllStorage(storage: StorageAdapter): Promise<ExportEntry[]> {
  const keys = await storage.keys();
  const entries: ExportEntry[] = [];
  for (const key of keys.sort()) {
    const raw = await storage.get(key);
    let value: unknown = null;
    if (raw !== null) {
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
    }
    entries.push({ key, value, description: describe(key, value) });
  }
  return entries;
}
