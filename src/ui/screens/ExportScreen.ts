// SPDX-License-Identifier: GPL-3.0-or-later
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import type { StorageAdapter } from '../../storage/StorageAdapter';
import { dumpAllStorage, buildExportBlob } from '../../migration/exportDump';
import { getNextcloudPassword } from '../../integrations/nextcloudWebdav';

// Manual backup/export screen (plan §Migration) — dumps every Preferences key to JSON,
// shared via the OS share sheet or copied to the clipboard. No automatic cloud backup.
export function renderExportScreen(container: HTMLElement, storage: StorageAdapter): void {
  container.innerHTML = `
    <p class="hint">
      Sauvegarde manuelle de toutes les données de l'app en JSON — à partager/enregistrer
      où tu veux (fichier, email...). Pas de sauvegarde automatique.
    </p>
    <p class="hint" id="export-secret-warning" style="display:none">
      ⚠️ Ce blob contient ton app password Nextcloud <strong>en clair</strong> (pour permettre
      une restauration complète en un coup) — évite de le coller dans un canal non sécurisé.
    </p>
    <div class="card">
      <div class="counts" id="export-counts">Lecture…</div>
    </div>
    <button class="btn-cta" id="export-share">📤 Partager</button>
    <button class="btn-secondary" id="export-copy">📋 Copier</button>
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
      countsEl.textContent = 'Rien à exporter pour le moment.';
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
      await Share.share({ title: 'Export Carbs', text: blob });
    } catch {
      // user cancelled the share sheet, or share isn't available — not an error to surface
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await Clipboard.write({ string: blob });
      msgEl.className = 'msg ok';
      msgEl.textContent = '✓ Copié';
      setTimeout(() => {
        msgEl.textContent = '';
      }, 2000);
    } catch {
      msgEl.className = 'msg error';
      msgEl.textContent = "Échec de la copie";
    }
  });

  load();
}
