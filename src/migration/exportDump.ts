// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../storage/StorageAdapter';
import { getNextcloudPassword } from '../integrations/nextcloudWebdav';
import { t } from '../ui/i18n/strings';

export interface ExportEntry {
  key: string;
  value: unknown;
  description: string;
}

function describe(key: string, value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return t('export.describe.entries', { n: value.length });
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (key === 'food_log_today' && Array.isArray(v.entries)) return t('export.describe.entriesToday', { n: v.entries.length });
    if (key === 'plaisir_overrides' && v.levels && typeof v.levels === 'object') {
      return t('export.describe.daysThisWeek', { n: Object.keys(v.levels as object).length });
    }
    if (key === 'sport_plan') return t('export.describe.daysPlanned', { n: Object.keys(v).length });
    return t('export.describe.present');
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

// Full backup blob — every Preferences key plus the Nextcloud app password (lives in
// secure storage, not Preferences, but travels in the same blob at the user's explicit
// request so a restore can be one-shot). Shared by the Export screen and the Nextcloud
// "backup now" button so both produce byte-identical output.
export async function buildExportBlob(storage: StorageAdapter): Promise<string> {
  const entries = await dumpAllStorage(storage);
  const data: Record<string, unknown> = Object.fromEntries(entries.map((e) => [e.key, e.value]));
  const nextcloudPassword = await getNextcloudPassword();
  if (nextcloudPassword) data.nextcloud_app_password = nextcloudPassword;
  return JSON.stringify(data);
}
