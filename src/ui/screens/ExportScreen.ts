// SPDX-License-Identifier: GPL-3.0-or-later
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import type { StorageAdapter } from '../../storage/StorageAdapter';
import { dumpAllStorage, buildExportBlob } from '../../migration/exportDump';
import { getNextcloudPassword } from '../../integrations/nextcloudWebdav';
import { t } from '../i18n/strings';

// Manual backup/export screen (plan §Migration) — dumps every Preferences key to JSON,
// shared via the OS share sheet or copied to the clipboard. No automatic cloud backup.
export function renderExportScreen(container: HTMLElement, storage: StorageAdapter): void {
  container.innerHTML = `
    <p class="hint">
      ${t('export.hint')}
    </p>
    <p class="hint" id="export-secret-warning" style="display:none">
      ${t('export.secretWarning')}
    </p>
    <div class="card">
      <div class="counts" id="export-counts">${t('export.reading')}</div>
    </div>
    <button class="btn-cta" id="export-share">${t('export.share')}</button>
    <button class="btn-secondary" id="export-copy">${t('export.copy')}</button>
    <div class="msg" id="export-msg"></div>
  `;

  const countsEl = container.querySelector<HTMLDivElement>('#export-counts')!;
  const msgEl = container.querySelector<HTMLDivElement>('#export-msg')!;
  const warningEl = container.querySelector<HTMLParagraphElement>('#export-secret-warning')!;
  const shareBtn = container.querySelector<HTMLButtonElement>('#export-share')!;
  const copyBtn = container.querySelector<HTMLButtonElement>('#export-copy')!;

  let blob = '';

  async function load() {
    const entries = await dumpAllStorage(storage);
    const nextcloudPassword = await getNextcloudPassword();
    warningEl.style.display = nextcloudPassword ? 'block' : 'none';
    blob = await buildExportBlob(storage);

    if (entries.length === 0) {
      countsEl.textContent = t('export.nothingToExport');
      return;
    }
    countsEl.innerHTML = entries
      .map((e) => `<div><span>${e.key}</span><span>${e.description}</span></div>`)
      .join('');
  }

  shareBtn.addEventListener('click', async () => {
    msgEl.className = 'msg';
    msgEl.textContent = '';
    try {
      await Share.share({ title: t('export.shareTitle'), text: blob });
    } catch {
      // user cancelled the share sheet, or share isn't available — not an error to surface
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await Clipboard.write({ string: blob });
      msgEl.className = 'msg ok';
      msgEl.textContent = t('export.copied');
      setTimeout(() => {
        msgEl.textContent = '';
      }, 2000);
    } catch {
      msgEl.className = 'msg error';
      msgEl.textContent = t('export.copyFailed');
    }
  });

  load();
}
