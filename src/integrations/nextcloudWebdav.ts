// SPDX-License-Identifier: GPL-3.0-or-later
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

// Fixed filename at the WebDAV root — avoids needing a MKCOL call to create a folder
// before the first PUT. `fetch` here is routed through CapacitorHttp (see
// capacitor.config.ts), so it bypasses WebView CORS the same way OFF/n8n calls do.
const BACKUP_FILENAME = 'carbs-backup.json';
const PASSWORD_KEY = 'nextcloud_app_password';
const TIMEOUT_MS = 20_000;

export interface NextcloudConnection {
  url: string;
  username: string;
}

function davUrl(conn: NextcloudConnection): string {
  const base = conn.url.replace(/\/+$/, '');
  return `${base}/remote.php/dav/files/${encodeURIComponent(conn.username)}/${BACKUP_FILENAME}`;
}

function authHeader(conn: NextcloudConnection, password: string): string {
  return `Basic ${btoa(`${conn.username}:${password}`)}`;
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('délai dépassé, le serveur ne répond pas');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function getNextcloudPassword(): Promise<string | null> {
  try {
    const v = await SecureStorage.get(PASSWORD_KEY);
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

export async function setNextcloudPassword(password: string): Promise<void> {
  if (!password) {
    await SecureStorage.remove(PASSWORD_KEY);
    return;
  }
  await SecureStorage.set(PASSWORD_KEY, password);
}

export async function backupToNextcloud(conn: NextcloudConnection, password: string, blob: string): Promise<void> {
  if (!conn.url || !conn.username || !password) throw new Error('Configuration Nextcloud incomplète');
  await withTimeout(async (signal) => {
    const res = await fetch(davUrl(conn), {
      method: 'PUT',
      headers: {
        Authorization: authHeader(conn, password),
        'Content-Type': 'application/json',
      },
      body: blob,
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

export async function restoreFromNextcloud(conn: NextcloudConnection, password: string): Promise<string> {
  if (!conn.url || !conn.username || !password) throw new Error('Configuration Nextcloud incomplète');
  return withTimeout(async (signal) => {
    const res = await fetch(davUrl(conn), {
      method: 'GET',
      headers: { Authorization: authHeader(conn, password) },
      signal,
    });
    if (res.status === 404) throw new Error('Aucune sauvegarde trouvée sur Nextcloud');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  });
}
