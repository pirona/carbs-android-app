// SPDX-License-Identifier: GPL-3.0-or-later
import type { StorageAdapter } from './StorageAdapter';

// Test double — avoids depending on the Capacitor Preferences native bridge in unit tests.
export class InMemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(): Promise<string[]> {
    return [...this.store.keys()];
  }
}
