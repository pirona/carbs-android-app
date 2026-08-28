// SPDX-License-Identifier: GPL-3.0-or-later
// Profile fields (was the hardcoded CONFIG.profile constant, now user-editable — plan
// §Modèle de données) plus the Export/Import backup sections.
import type { Profile } from '../../core/types';
import type { ProfileRepo } from '../../storage/repos/profileRepo';
import type { StorageAdapter } from '../../storage/StorageAdapter';
import type { ImportRepos } from '../../migration/importExport';
import { DEFAULT_THEME, type ThemeMode, type ThemeRepo, type ThemeSettings } from '../../storage/repos/themeRepo';
import { DEFAULT_NEXTCLOUD, type NextcloudAutoBackupMode, type NextcloudSettings } from '../../storage/repos/nextcloudRepo';
import { backupToNextcloud, restoreFromNextcloud, getNextcloudPassword, setNextcloudPassword } from '../../integrations/nextcloudWebdav';
import { getMistralApiKey, setMistralApiKey, testMistralConnection } from '../../integrations/mistralClient';
import { buildExportBlob } from '../../migration/exportDump';
import { runImport } from '../../migration/importExport';
import { applyTheme } from '../theme';
import { renderExportScreen } from './ExportScreen';
import { renderImportScreen } from './ImportScreen';
import type { AiFootprintRepo } from '../../storage/repos/aiFootprintRepo';
import { DEFAULT_AI_FOOTPRINT } from '../../storage/repos/aiFootprintRepo';
import { calcAiFootprint, type AiFootprintResult } from '../../core/calc/aiFootprint';
import type { CarbAdviceHistoryRepo } from '../../storage/repos/carbAdviceHistoryRepo';
import type { CarbPeriodBilanHistoryRepo } from '../../storage/repos/carbPeriodBilanHistoryRepo';
import { reconstructRetroactiveAiUsage, type RetroactiveUsageResult, type RetroBucketId } from '../../core/calc/aiFootprintRetro';
import { computeAiFootprintEquivalences } from '../../core/calc/aiFootprintEquivalences';
import type { AiFeatureId } from '../../core/types';
import { fmt } from '../format';
import { fmt1 } from '../util';

export interface SettingsScreenRepos extends ImportRepos {
  profile: ProfileRepo;
  theme: ThemeRepo;
  aiFootprint: AiFootprintRepo;
  // Read-only here, purely to reconstruct a best-effort retroactive call count (see
  // core/calc/aiFootprintRetro.ts) — not part of ImportRepos, these two aren't covered by
  // export/import at all (pre-existing gap, unrelated to this feature).
  carbAdviceHistory: CarbAdviceHistoryRepo;
  carbPeriodBilanHistory: CarbPeriodBilanHistoryRepo;
}

const MODE_LABEL: Record<ThemeMode, string> = { auto: 'Auto', light: 'Clair', dark: 'Sombre' };
const NC_MODE_LABEL: Record<NextcloudAutoBackupMode, string> = { off: 'Désactivé', launch: 'Au lancement' };
const AI_FEATURE_LABEL: Record<AiFeatureId, string> = {
  food_parse: 'Saisie texte',
  food_vision: 'Scan assiette',
  carb_advice: 'Conseil du jour',
  period_bilan: 'Bilan de période',
  receipt_scan: 'Scan ticket',
};
const RETRO_BUCKET_LABEL: Record<RetroBucketId, string> = {
  food_parse: 'Saisie texte',
  scan: 'Scan photo (assiette/ticket)',
  carb_advice: 'Conseil du jour',
  period_bilan: 'Bilan de période',
};

// Fixed swatches instead of a free hue slider. --accent-h drives every color in style.css —
// background, surfaces, text, borders, day-type/macro colors — so picking one of these reskins
// the whole GUI, not just the accent; the swatch itself previews the accent (hsl(hue, 70%, 66%),
// same formula style.css uses) as the hue's clearest single-color representative.
const ACCENT_PRESETS: { name: string; hue: number }[] = [
  { name: 'Abricot', hue: 28 },
  { name: 'Citron', hue: 50 },
  { name: 'Menthe', hue: 155 },
  { name: 'Ciel', hue: 205 },
  { name: 'Prune', hue: 285 },
  { name: 'Corail', hue: 355 },
];

export function renderSettingsScreen(container: HTMLElement, repos: SettingsScreenRepos, storage: StorageAdapter): void {
  let profile: Profile;
  let theme: ThemeSettings = DEFAULT_THEME;
  let nextcloud: NextcloudSettings = DEFAULT_NEXTCLOUD;
  let ncHasPassword = false;
  let ncRestorePreviewRaw: string | null = null;
  // Deliberately not reloaded in the post-restore reload block below (see nc-restore-confirm) —
  // the Mistral key is guaranteed unaffected by any import, since it's never in the blob.
  let mistralHasKey = false;
  // Recomputed from stored token totals on every load — never cached across screen visits, so
  // the gCO2e/mL figures always reflect today's best-known conversion factor (see
  // core/calc/aiFootprint.ts for the source/methodology comment).
  let footprint: AiFootprintResult = calcAiFootprint(DEFAULT_AI_FOOTPRINT);
  // Best-effort reconstruction of calls made before live tracking existed — see
  // core/calc/aiFootprintRetro.ts for the methodology and its disclosed undercounts. Also
  // recomputed on every load, never cached, same as `footprint` above.
  let retro: RetroactiveUsageResult = { totalCallCount: 0, buckets: [] };

  async function loadAiFootprintAndRetro() {
    footprint = calcAiFootprint(await repos.aiFootprint.load());
    retro = reconstructRetroactiveAiUsage({
      carbAdviceHistory: await repos.carbAdviceHistory.load(),
      carbPeriodBilanHistory: await repos.carbPeriodBilanHistory.load(),
      foodLogHistory: await repos.foodLogHistory.load(),
      foodLogToday: (await repos.foodLog.loadToday()).entries,
      habits: await repos.habits.load(),
      footprint,
    });
  }

  function render() {
    container.innerHTML = `
      <div class="card">
        <h2>🎨 Thème</h2>
        <label class="field-label">Apparence</label>
        <div class="sort-toggle" style="margin-bottom:10px">
          ${(['auto', 'light', 'dark'] as ThemeMode[])
            .map((m) => `<button class="sort-btn ${theme.mode === m ? 'active' : ''}" data-action="theme-mode" data-mode="${m}">${MODE_LABEL[m]}</button>`)
            .join('')}
        </div>
        <label class="field-label">Palette de couleurs</label>
        <div class="accent-preset-row">
          ${ACCENT_PRESETS.map(
            (p) => `
            <button
              class="accent-preset ${theme.accentHue === p.hue ? 'active' : ''}"
              data-action="theme-accent"
              data-hue="${p.hue}"
              style="background:hsl(${p.hue} 70% 66%)"
              aria-label="${p.name}"
              title="${p.name}"
            ></button>`,
          ).join('')}
        </div>
      </div>

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
        <h2>☁️ Nextcloud</h2>
        <label class="field-label">URL du serveur</label>
        <input type="url" id="nc-url" placeholder="https://nextcloud.exemple.fr" value="${nextcloud.url}">
        <label class="field-label">Utilisateur</label>
        <input type="text" id="nc-username" value="${nextcloud.username}">
        <label class="field-label">App password ${ncHasPassword ? '(déjà enregistré — laisser vide pour le garder)' : ''}</label>
        <input type="password" id="nc-password" placeholder="${ncHasPassword ? '••••••••' : 'app password dédié, pas ton mot de passe principal'}" autocomplete="off">
        <p class="empty-hint" style="padding:0">Stocké chiffré (Android Keystore), jamais en clair sur disque.</p>
        <label class="field-label">Sauvegarde automatique</label>
        <div class="sort-toggle" style="margin-bottom:10px">
          ${(['off', 'launch'] as NextcloudAutoBackupMode[])
            .map((m) => `<button class="sort-btn ${nextcloud.autoBackupMode === m ? 'active' : ''}" data-action="nc-mode" data-mode="${m}">${NC_MODE_LABEL[m]}</button>`)
            .join('')}
        </div>
        <p class="empty-hint" style="padding:0">
          ${nextcloud.lastBackupAt
            ? `Dernière sauvegarde : ${new Date(nextcloud.lastBackupAt).toLocaleString('fr-FR')} — ${nextcloud.lastBackupOk ? '✓ ok' : '✗ échec'}`
            : 'Aucune sauvegarde effectuée pour le moment.'}
        </p>
        <button class="btn-cta" data-action="nc-save">💾 Enregistrer la config</button>
        <button class="btn-secondary" data-action="nc-backup-now">☁️ Sauvegarder maintenant</button>
        <button class="btn-secondary" data-action="nc-restore">⬇️ Restaurer depuis Nextcloud</button>
        <div class="card" id="nc-restore-preview" style="display:none">
          <div class="counts" id="nc-restore-counts"></div>
          <button class="btn-cta" data-action="nc-restore-confirm">✅ Confirmer la restauration</button>
        </div>
        <div class="msg" id="nc-msg"></div>
      </div>

      <div class="card">
        <h2>🤖 IA (Mistral)</h2>
        <label class="field-label">Clé API ${mistralHasKey ? '(déjà enregistrée — laisser vide pour la garder)' : ''}</label>
        <input type="password" id="mistral-key" placeholder="${mistralHasKey ? '••••••••' : 'clé API Mistral (console.mistral.ai)'}" autocomplete="off">
        <p class="empty-hint" style="padding:0">Stockée chiffrée (Android Keystore), jamais en clair sur disque, jamais incluse dans les sauvegardes.</p>
        <button class="btn-cta" data-action="mistral-save">💾 Enregistrer la clé</button>
        <button class="btn-secondary" data-action="mistral-test">🔌 Tester la connexion</button>
        <div class="msg" id="mistral-msg"></div>
      </div>

      <div class="card">
        <h2>🌍 Impact environnemental de l'IA</h2>
        ${footprint.totalCallCount === 0
          ? `<p class="empty-hint" style="padding:0">Aucun appel IA effectué pour le moment.</p>`
          : `
            <p class="empty-hint" style="padding:0">Depuis le ${footprint.since ? new Date(footprint.since).toLocaleDateString('fr-FR') : '—'} :</p>
            <div class="counts">
              ${footprint.perFeature
                .filter((f) => f.callCount > 0)
                .map(
                  (f) =>
                    `<div><span>${AI_FEATURE_LABEL[f.feature]} (${f.callCount})</span><span>${fmt(f.gCO2e)} gCO2e · ${fmt(f.mlWater)} mL</span></div>`,
                )
                .join('')}
            </div>
            <div class="counts" style="font-weight:600;margin-top:8px">
              <div><span>Total</span><span>${fmt(footprint.totalGCO2e)} gCO2e · ${fmt(footprint.totalMlWater)} mL eau</span></div>
            </div>
            <p class="empty-hint" style="padding:0;margin-top:8px">
              Estimation approximative basée sur l'étude d'impact environnemental de Mistral Large 2
              (Mistral AI, ADEME, Carbone 4, juillet 2025 : ~1,14 gCO2e et 45 mL d'eau pour une
              réponse de 400 tokens). Ce facteur par token est appliqué uniformément à tous les
              modèles utilisés par l'app (mistral-small-latest et mistral-large-latest) faute de
              détail officiel par taille de modèle — l'étude indique seulement que l'impact est
              globalement proportionnel à la taille du modèle, donc l'empreinte réelle des appels
              "small" est probablement surestimée ici.
            </p>
          `}
        ${retro.totalCallCount > 0
          ? `
            <hr style="border:none;border-top:1px solid var(--outline-variant);margin:14px 0">
            <p class="empty-hint" style="padding:0">Avant le suivi (estimation rétrospective) :</p>
            <div class="counts">
              ${retro.buckets
                .filter((b) => b.callCount > 0)
                .map(
                  (b) =>
                    `<div><span>${RETRO_BUCKET_LABEL[b.bucket]} (${b.callCount})</span><span>${b.estimateSource === 'fallback' ? '≈ ' : ''}${fmt(b.gCO2e)} gCO2e · ${fmt(b.mlWater)} mL</span></div>`,
                )
                .join('')}
            </div>
            <p class="empty-hint" style="padding:0;margin-top:8px">
              Comptage reconstitué à partir de traces indirectes (historique des conseils/bilans,
              photos scannées confirmées, habitudes créées via IA) — sous-estimé par construction :
              une tentative jamais sauvegardée, un conseil régénéré plusieurs fois le même jour,
              ou un ticket enregistré directement en habitudes n'y laissent aucune trace. Le coût
              en gCO2e/mL de chaque catégorie utilise la moyenne réelle mesurée par cette app pour
              cette fonctionnalité dès qu'elle existe ; tant qu'aucun appel réel n'a encore été
              suivi, la marque « ≈ » indique un repli sur la taille de réponse de référence de
              l'étude Mistral/ADEME/Carbone 4 (400 tokens) plutôt qu'une vraie mesure locale.
            </p>
          `
          : ''}
        ${(() => {
          const grandGCO2e = footprint.totalGCO2e + retro.buckets.reduce((s, b) => s + b.gCO2e, 0);
          const grandMlWater = footprint.totalMlWater + retro.buckets.reduce((s, b) => s + b.mlWater, 0);
          if (grandGCO2e <= 0 && grandMlWater <= 0) return '';
          const eq = computeAiFootprintEquivalences(grandGCO2e, grandMlWater);
          return `
            <hr style="border:none;border-top:1px solid var(--outline-variant);margin:14px 0">
            <p class="empty-hint" style="padding:0">Pour se rendre compte (total ci-dessus, sources ADEME/EFSA/INRAE) :</p>
            <div class="counts">
              <div><span>📧 Équivalent carbone</span><span>≈ ${fmt(eq.emailsEquivalent)} email(s) sans pièce jointe</span></div>
              <div><span>💧 Eau, échelle humaine</span><span>≈ ${fmt1(eq.humanDaysWater)} jour(s) de besoin en eau d'un adulte</span></div>
              <div><span>🐄 Eau, échelle animale</span><span>≈ ${fmt1(eq.cowDailyWaterPercent)} % du besoin quotidien d'une vache laitière</span></div>
            </div>
            <p class="empty-hint" style="padding:0;margin-top:8px">
              Comparaisons sourcées : 1 email sans pièce jointe = 0,11 gCO2e (ADEME, Base
              Empreinte) ; besoin en eau d'un adulte = 2 à 2,5 L/jour (EFSA) ; besoin en eau d'une
              vache laitière = 50 à 100 L/jour hors forte chaleur (INRAE) — milieu de fourchette
              utilisé pour ces deux derniers ratios.
            </p>
          `;
        })()}
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
        <p class="empty-hint" style="padding:0">
          IA : uniquement Mistral (aucun autre fournisseur). Le scan photo d'assiette peut se
          tromper sur ce qu'il identifie — vérifie toujours l'estimation avant de valider.
        </p>
      </div>
    `;

    renderExportScreen(container.querySelector<HTMLDivElement>('#settings-export')!, storage);
    renderImportScreen(container.querySelector<HTMLDivElement>('#settings-import')!, repos);
  }

  container.addEventListener('click', async (e) => {
    const modeBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-action="theme-mode"]');
    if (modeBtn) {
      theme = { ...theme, mode: modeBtn.dataset.mode as ThemeMode };
      applyTheme(theme);
      await repos.theme.save(theme);
      render();
      return;
    }

    const accentBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-action="theme-accent"]');
    if (accentBtn) {
      theme = { ...theme, accentHue: Number(accentBtn.dataset.hue) };
      applyTheme(theme);
      await repos.theme.save(theme);
      render();
      return;
    }

    const ncModeBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-action="nc-mode"]');
    if (ncModeBtn) {
      nextcloud = { ...nextcloud, autoBackupMode: ncModeBtn.dataset.mode as NextcloudAutoBackupMode };
      await repos.nextcloud.save(nextcloud);
      render();
      return;
    }

    const ncMsgEl = () => container.querySelector<HTMLDivElement>('#nc-msg')!;

    if ((e.target as HTMLElement).closest('[data-action="nc-save"]')) {
      const url = container.querySelector<HTMLInputElement>('#nc-url')!.value.trim();
      const username = container.querySelector<HTMLInputElement>('#nc-username')!.value.trim();
      const password = container.querySelector<HTMLInputElement>('#nc-password')!.value;
      nextcloud = { ...nextcloud, url, username };
      await repos.nextcloud.save(nextcloud);
      if (password) {
        await setNextcloudPassword(password);
        ncHasPassword = true;
      }
      const msgEl = ncMsgEl();
      msgEl.className = 'msg ok';
      msgEl.textContent = '✓ Config enregistrée';
      render();
      return;
    }

    if ((e.target as HTMLElement).closest('[data-action="nc-backup-now"]')) {
      const msgEl = ncMsgEl();
      msgEl.className = 'msg';
      msgEl.textContent = 'Sauvegarde en cours…';
      const password = await getNextcloudPassword();
      if (!password || !nextcloud.url || !nextcloud.username) {
        msgEl.className = 'msg error';
        msgEl.textContent = 'Enregistre la config (URL, utilisateur, app password) avant de sauvegarder.';
        return;
      }
      try {
        const blob = await buildExportBlob(storage);
        await backupToNextcloud({ url: nextcloud.url, username: nextcloud.username }, password, blob);
        nextcloud = { ...nextcloud, lastBackupAt: new Date().toISOString(), lastBackupOk: true };
        await repos.nextcloud.save(nextcloud);
        render();
        ncMsgEl().className = 'msg ok';
        ncMsgEl().textContent = '✓ Sauvegardé sur Nextcloud';
      } catch (err) {
        nextcloud = { ...nextcloud, lastBackupAt: new Date().toISOString(), lastBackupOk: false };
        await repos.nextcloud.save(nextcloud);
        render();
        ncMsgEl().className = 'msg error';
        ncMsgEl().textContent = `Échec : ${(err as Error).message}`;
      }
      return;
    }

    if ((e.target as HTMLElement).closest('[data-action="nc-restore"]')) {
      const msgEl = ncMsgEl();
      msgEl.className = 'msg';
      msgEl.textContent = 'Récupération depuis Nextcloud…';
      const password = await getNextcloudPassword();
      if (!password || !nextcloud.url || !nextcloud.username) {
        msgEl.className = 'msg error';
        msgEl.textContent = 'Enregistre la config (URL, utilisateur, app password) avant de restaurer.';
        return;
      }
      try {
        const blob = await restoreFromNextcloud({ url: nextcloud.url, username: nextcloud.username }, password);
        const preview = await runImport(repos, blob, false);
        if (!preview.ok) {
          msgEl.className = 'msg error';
          msgEl.textContent = preview.error;
          return;
        }
        ncRestorePreviewRaw = blob;
        const previewCard = container.querySelector<HTMLDivElement>('#nc-restore-preview')!;
        previewCard.style.display = 'block';
        container.querySelector<HTMLDivElement>('#nc-restore-counts')!.innerHTML = preview.perKey
          .map((k) => `<div><span>${k.key}</span><span>${k.note}</span></div>`)
          .join('');
        msgEl.className = '';
        msgEl.textContent = '';
      } catch (err) {
        msgEl.className = 'msg error';
        msgEl.textContent = `Échec : ${(err as Error).message}`;
      }
      return;
    }

    if ((e.target as HTMLElement).closest('[data-action="nc-restore-confirm"]')) {
      const msgEl = ncMsgEl();
      if (!ncRestorePreviewRaw) return;
      const result = await runImport(repos, ncRestorePreviewRaw, true);
      ncRestorePreviewRaw = null;
      if (!result.ok) {
        msgEl.className = 'msg error';
        msgEl.textContent = result.error;
        return;
      }
      // The import may have touched profile/theme/nextcloud — reload everything this
      // screen holds in closure state before re-rendering, or the UI would show stale data.
      profile = await repos.profile.load();
      theme = await repos.theme.load();
      applyTheme(theme);
      nextcloud = await repos.nextcloud.load();
      ncHasPassword = !!(await getNextcloudPassword());
      await loadAiFootprintAndRetro();
      render();
      ncMsgEl().className = 'msg ok';
      ncMsgEl().textContent = '✓ Restauration terminée';
      return;
    }

    const mistralMsgEl = () => container.querySelector<HTMLDivElement>('#mistral-msg')!;

    if ((e.target as HTMLElement).closest('[data-action="mistral-save"]')) {
      const key = container.querySelector<HTMLInputElement>('#mistral-key')!.value.trim();
      const msgEl = mistralMsgEl();
      if (key) {
        await setMistralApiKey(key);
        mistralHasKey = true;
        msgEl.className = 'msg ok';
        msgEl.textContent = '✓ Clé enregistrée';
        render();
      } else {
        msgEl.className = 'msg ok';
        msgEl.textContent = mistralHasKey ? '✓ Clé conservée (champ vide)' : '';
      }
      return;
    }

    if ((e.target as HTMLElement).closest('[data-action="mistral-test"]')) {
      const msgEl = mistralMsgEl();
      const typed = container.querySelector<HTMLInputElement>('#mistral-key')!.value.trim();
      const key = typed || (await getMistralApiKey());
      if (!key) {
        msgEl.className = 'msg error';
        msgEl.textContent = 'Aucune clé à tester — saisis-en une d’abord.';
        return;
      }
      msgEl.className = 'msg';
      msgEl.textContent = 'Test en cours…';
      const result = await testMistralConnection(key);
      msgEl.className = result.ok ? 'msg ok' : 'msg error';
      if (result.ok) {
        msgEl.textContent = '✓ clé valide';
      } else if (result.message === 'HTTP 401') {
        msgEl.textContent = '✗ 401 — clé invalide';
      } else {
        msgEl.textContent = `✗ ${result.message}`;
      }
      return;
    }

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
    theme = await repos.theme.load();
    nextcloud = await repos.nextcloud.load();
    ncHasPassword = !!(await getNextcloudPassword());
    mistralHasKey = !!(await getMistralApiKey());
    await loadAiFootprintAndRetro();
    render();
  })();
}
