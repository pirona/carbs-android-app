// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from '../StorageAdapter';

export type NextcloudAutoBackupMode = 'off' | 'launch';

export interface NextcloudSettings {
  url: string;
  username: string;
  autoBackupMode: NextcloudAutoBackupMode;
  lastBackupAt: string | null;
  lastBackupOk: boolean | null;
}

export const DEFAULT_NEXTCLOUD: NextcloudSettings = {
  url: '',
  username: '',
  autoBackupMode: 'off',
  lastBackupAt: null,
  lastBackupOk: null,
};

const NEXTCLOUD_KEY = 'nextcloud_settings';

// App password lives in secure storage (nextcloudWebdav.ts), never here — this repo
// only holds non-secret config, same as every other *Repo in this folder.
export class NextcloudRepo {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async load(): Promise<NextcloudSettings> {
    const raw = await this.storage.get(NEXTCLOUD_KEY);
    if (!raw) return DEFAULT_NEXTCLOUD;
    try {
      return { ...DEFAULT_NEXTCLOUD, ...(JSON.parse(raw) as Partial<NextcloudSettings>) };
    } catch {
      return DEFAULT_NEXTCLOUD;
    }
  }

  async save(settings: NextcloudSettings): Promise<void> {
    await this.storage.set(NEXTCLOUD_KEY, JSON.stringify(settings));
  }
}
