// SPDX-License-Identifier: GPL-3.0-or-later
// Profile fields (was the hardcoded CONFIG.profile constant, now user-editable — plan
// §Modèle de données) plus the Export/Import backup sections.
import type { Profile } from '../../core/types';
import type { ProfileRepo } from '../../storage/repos/profileRepo';
import type { StorageAdapter } from '../../storage/StorageAdapter';
import type { ImportRepos } from '../../migration/importExport';
import { renderExportScreen } from './ExportScreen';
import { renderImportScreen } from './ImportScreen';

export interface SettingsScreenRepos extends ImportRepos {
  profile: ProfileRepo;
}

export function renderSettingsScreen(container: HTMLElement, repos: SettingsScreenRepos, storage: StorageAdapter): void {
  let profile: Profile;

  function render() {
    container.innerHTML = `
      <h1 style="margin-bottom:10px">Réglages</h1>

      <div class="card">
        <h2>👤 Profil</h2>
        <label class="field-label">Taille (cm)</label>
        <input type="number" id="s-height" value="${profile.height_cm}">
        <label class="field-label">Âge</label>
        <input type="number" id="s-age" value="${profile.age}">
        <label class="field-label">Sexe</label>
        <select id="s-sex">
          <option value="male" ${profile.sex === 'male' ? 'selected' : ''}>Homme</option>
          <option value="female" ${profile.sex === 'female' ? 'selected' : ''}>Femme</option>
        </select>
        <label class="field-label">Poids par défaut (kg) — utilisé si aucun poids saisi le jour même</label>
        <input type="number" id="s-weight-default" value="${profile.weight_default_kg}" step="0.1">
        <label class="field-label">Poids de départ (kg) — référence de la barre objectif</label>
        <input type="number" id="s-weight-start" value="${profile.weight_start_kg}" step="0.1">
        <label class="field-label">Poids objectif (kg)</label>
        <input type="number" id="s-weight-goal" value="${profile.weight_goal_kg}" step="0.1">
        <button class="btn-cta" data-action="save-profile">Enregistrer</button>
        <div class="msg" id="settings-msg"></div>
      </div>

      <div class="card">
        <h2>📤 Sauvegarde</h2>
        <div id="settings-export"></div>
      </div>

      <div class="card">
        <h2>📥 Migration / Restauration</h2>
        <div id="settings-import"></div>
      </div>

      <div class="card">
        <h2>ℹ️ À propos</h2>
        <p class="empty-hint" style="padding:0">
          Données de composition nutritionnelle (scan photo) : ANSES-CIQUAL 2020,
          Licence Ouverte / Etalab.
        </p>
      </div>
    `;

    renderExportScreen(container.querySelector<HTMLDivElement>('#settings-export')!, storage);
    renderImportScreen(container.querySelector<HTMLDivElement>('#settings-import')!, repos);
  }

  container.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action="save-profile"]');
    if (!target) return;
    const msgEl = container.querySelector<HTMLDivElement>('#settings-msg')!;
    const height_cm = parseFloat(container.querySelector<HTMLInputElement>('#s-height')!.value);
    const age = parseFloat(container.querySelector<HTMLInputElement>('#s-age')!.value);
    const sex = container.querySelector<HTMLSelectElement>('#s-sex')!.value as Profile['sex'];
    const weight_default_kg = parseFloat(container.querySelector<HTMLInputElement>('#s-weight-default')!.value);
    const weight_start_kg = parseFloat(container.querySelector<HTMLInputElement>('#s-weight-start')!.value);
    const weight_goal_kg = parseFloat(container.querySelector<HTMLInputElement>('#s-weight-goal')!.value);

    if ([height_cm, age, weight_default_kg, weight_start_kg, weight_goal_kg].some((v) => isNaN(v) || v <= 0)) {
      msgEl.className = 'msg error';
      msgEl.textContent = 'Toutes les valeurs doivent être des nombres positifs.';
      return;
    }

    profile = { height_cm, age, sex, weight_default_kg, weight_start_kg, weight_goal_kg };
    await repos.profile.save(profile);
    msgEl.className = 'msg ok';
    msgEl.textContent = '✓ Profil enregistré';
    setTimeout(() => {
      msgEl.textContent = '';
    }, 2000);
  });

  (async () => {
    profile = await repos.profile.load();
    render();
  })();
}
