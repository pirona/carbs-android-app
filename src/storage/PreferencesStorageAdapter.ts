// SPDX-License-Identifier: GPL-3.0-or-later
import { Preferences } from '@capacitor/preferences';
import type { StorageAdapter } from './StorageAdapter';

export class PreferencesStorageAdapter implements StorageAdapter {
  async get(key: string): Promise<string | null> {
    return (await Preferences.get({ key })).value;
  }

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }

  async keys(): Promise<string[]> {
    return (await Preferences.keys()).keys;
  }
}
