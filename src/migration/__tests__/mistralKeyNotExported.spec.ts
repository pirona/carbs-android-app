// SPDX-License-Identifier: GPL-3.0-or-later
// The one test that guards the non-negotiable requirement from the internalize-Mistral plan:
// the API key must NEVER appear in the export/backup blob, unlike the Nextcloud app password
// (which is deliberately included there, per an earlier explicit user choice — see
// exportDump.ts's buildExportBlob). The guarantee in exportDump.ts/importExport.ts is by
// omission (no splice block for mistral_api_key exists), so this test is the only thing that
// would catch a future regression — e.g. someone later adding a splice for Mistral the same
// way it was added for Nextcloud.
import { describe, expect, it, vi } from 'vitest';
import { InMemoryStorageAdapter } from '../../storage/InMemoryStorageAdapter';
import { buildExportBlob } from '../exportDump';

const secureStore = new Map<string, string>();

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    async get(key: string) {
      return secureStore.has(key) ? secureStore.get(key)! : null;
    },
    async set(key: string, value: string) {
      secureStore.set(key, value);
    },
    async remove(key: string) {
      secureStore.delete(key);
    },
  },
}));

describe('buildExportBlob — Mistral key exclusion', () => {
  it('never includes the Mistral API key, while still including the Nextcloud password', async () => {
    secureStore.set('mistral_api_key', 'sk-super-secret-mistral-key');
    secureStore.set('nextcloud_app_password', 'nc-app-password-xyz');

    const storage = new InMemoryStorageAdapter();
    await storage.set('profile', JSON.stringify({ height_cm: 180 }));

    const blob = await buildExportBlob(storage);

    expect(blob).not.toContain('sk-super-secret-mistral-key');
    expect(blob).not.toContain('mistral_api_key');
    // Sanity check the mock/setup actually works and this isn't a false negative: the
    // Nextcloud password IS expected in the blob (existing, unrelated behavior).
    expect(blob).toContain('nc-app-password-xyz');
  });

  it('never includes the Mistral API key even when no Nextcloud password is set', async () => {
    secureStore.clear();
    secureStore.set('mistral_api_key', 'sk-another-secret');

    const storage = new InMemoryStorageAdapter();
    const blob = await buildExportBlob(storage);

    expect(blob).not.toContain('sk-another-secret');
    expect(blob).not.toContain('mistral_api_key');
  });
});
