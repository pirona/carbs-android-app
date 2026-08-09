// SPDX-License-Identifier: GPL-3.0-or-later

// Swappable key-value storage — see plan §Stockage decision (Preferences chosen over
// SQLite: no relational queries anywhere in the ported logic, low data volumes).
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  // needed for Export (dump everything) — see plan §Migration
  keys(): Promise<string[]>;
}
