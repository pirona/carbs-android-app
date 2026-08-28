// SPDX-License-Identifier: GPL-3.0-or-later
import { runImport, type ImportRepos } from '../../migration/importExport';
import { t } from '../i18n/strings';

// Migration import screen (plan §Migration) — paste the blob from the old HA pages'
// export.html, preview what would change, then explicitly confirm before anything is
// written. Preview and commit share the exact same merge logic (runImport), so the
// preview can never promise something the commit doesn't actually do.
export function renderImportScreen(container: HTMLElement, repos: ImportRepos): void {
  container.innerHTML = `
    <p class="hint">
      ${t('import.hint')}
    </p>
    <div class="card">
      <textarea id="import-input" placeholder='{"day_history": [...], ...}'></textarea>
    </div>
    <button class="btn-cta" id="import-preview">${t('import.preview')}</button>
    <div class="card" id="import-preview-card" style="display:none">
      <div class="counts" id="import-counts"></div>
    </div>
    <button class="btn-cta" id="import-confirm" style="display:none">${t('import.confirm')}</button>
    <div class="msg" id="import-msg"></div>
  `;

  const input = container.querySelector<HTMLTextAreaElement>('#import-input')!;
  const previewBtn = container.querySelector<HTMLButtonElement>('#import-preview')!;
  const previewCard = container.querySelector<HTMLDivElement>('#import-preview-card')!;
  const countsEl = container.querySelector<HTMLDivElement>('#import-counts')!;
  const confirmBtn = container.querySelector<HTMLButtonElement>('#import-confirm')!;
  const msgEl = container.querySelector<HTMLDivElement>('#import-msg')!;

  let previewedRaw: string | null = null;

  function resetConfirm() {
    confirmBtn.style.display = 'none';
    previewCard.style.display = 'none';
    previewedRaw = null;
  }

  input.addEventListener('input', resetConfirm);

  previewBtn.addEventListener('click', async () => {
    msgEl.className = 'msg';
    msgEl.textContent = '';
    const result = await runImport(repos, input.value, false);
    if (!result.ok) {
      previewCard.style.display = 'none';
      confirmBtn.style.display = 'none';
      msgEl.className = 'msg error';
      msgEl.textContent = result.error;
      return;
    }
    previewedRaw = input.value;
    previewCard.style.display = 'block';
    countsEl.innerHTML = result.perKey
      .map((k) => `<div><span>${k.key}</span><span>${k.note}</span></div>`)
      .join('');
    confirmBtn.style.display = 'block';
  });

  confirmBtn.addEventListener('click', async () => {
    if (previewedRaw === null || previewedRaw !== input.value) {
      msgEl.className = 'msg error';
      msgEl.textContent = t('import.staleWarning');
      return;
    }
    const result = await runImport(repos, input.value, true);
    if (!result.ok) {
      msgEl.className = 'msg error';
      msgEl.textContent = result.error;
      return;
    }
    msgEl.className = 'msg ok';
    msgEl.textContent = t('import.done');
    resetConfirm();
  });
}
