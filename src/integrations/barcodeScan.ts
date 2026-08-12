// SPDX-License-Identifier: GPL-3.0-or-later
// Barcode -> OpenFoodFacts lookup. scan() uses Google Play Services' ready-to-use
// scanner UI (GmsBarcodeScanning) — no camera permission to request on the app side,
// Play Services owns that prompt itself.
import type { PluginListenerHandle } from '@capacitor/core';
import { BarcodeScanner, GoogleBarcodeScannerModuleInstallState } from '@capacitor-mlkit/barcode-scanning';
import { getOFFByBarcode, type OffProduct } from './openFoodFacts';

export type BarcodeScanResult =
  | { status: 'ok'; code: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export type OFFLookupResult = { status: 'ok'; product: OffProduct } | { status: 'not-found' } | { status: 'error'; message: string };

// First run on a device (or after Play Services data is cleared) needs a one-time
// module download before scan() will work — otherwise it rejects outright rather
// than installing on demand.
async function ensureModuleInstalled(): Promise<void> {
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (available) return;

  await new Promise<void>((resolve, reject) => {
    // Only remove this listener on completion, not every listener the plugin instance
    // may have (removeAllListeners() would also drop unrelated ones registered elsewhere).
    let handle: PluginListenerHandle | undefined;
    BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', (event) => {
      if (event.state === GoogleBarcodeScannerModuleInstallState.COMPLETED) {
        handle?.remove();
        resolve();
      } else if (event.state === GoogleBarcodeScannerModuleInstallState.FAILED || event.state === GoogleBarcodeScannerModuleInstallState.CANCELED) {
        handle?.remove();
        reject(new Error('Installation du module de scan impossible.'));
      }
    }).then((h) => {
      handle = h;
    });
    BarcodeScanner.installGoogleBarcodeScannerModule().catch((e) => {
      handle?.remove();
      reject(e);
    });
  });
}

export async function scanBarcode(): Promise<BarcodeScanResult> {
  try {
    await ensureModuleInstalled();
    const { barcodes } = await BarcodeScanner.scan();
    const code = barcodes[0]?.rawValue;
    if (!code) return { status: 'cancelled' };
    return { status: 'ok', code };
  } catch (e) {
    const message = (e as Error).message ?? '';
    if (message.includes('scan canceled')) return { status: 'cancelled' };
    return { status: 'error', message: message || 'Scan impossible.' };
  }
}

// Shared by DayScreen/HabitsScreen/PhotoScanScreen so the not-found/network-error
// mapping (and its user-facing message) lives in one place instead of three.
export async function lookupOFF(code: string): Promise<OFFLookupResult> {
  try {
    const product = await getOFFByBarcode(code);
    if (!product) return { status: 'not-found' };
    return { status: 'ok', product };
  } catch {
    return { status: 'error', message: 'Recherche impossible — vérifier la connexion.' };
  }
}
