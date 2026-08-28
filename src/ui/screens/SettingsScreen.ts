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
import { t, getLang, type Lang, type StringKey } from '../i18n/strings';

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

const MODE_LABEL_KEY: Record<ThemeMode, StringKey> = { auto: 'settings.theme.mode.auto', light: 'settings.theme.mode.light', dark: 'settings.theme.mode.dark' };
const NC_MODE_LABEL_KEY: Record<NextcloudAutoBackupMode, StringKey> = { off: 'settings.nextcloud.mode.off', launch: 'settings.nextcloud.mode.launch' };
const AI_FEATURE_LABEL_KEY: Record<AiFeatureId, StringKey> = {
  food_parse: 'aiFeature.food_parse',
  food_vision: 'aiFeature.food_vision',
  carb_advice: 'aiFeature.carb_advice',
  period_bilan: 'aiFeature.period_bilan',
  receipt_scan: 'aiFeature.receipt_scan',
};
const RETRO_BUCKET_LABEL_KEY: Record<RetroBucketId, StringKey> = {
  food_parse: 'aiFeature.food_parse',
  scan: 'aiFeature.scan',
  carb_advice: 'aiFeature.carb_advice',
  period_bilan: 'aiFeature.period_bilan',
};

// Fixed swatches instead of a free hue slider. --accent-h drives every color in style.css —
// background, surfaces, text, borders, day-type/macro colors — so picking one of these reskins
// the whole GUI, not just the accent; the swatch itself previews the accent (hsl(hue, 70%, 66%),
// same formula style.css uses) as the hue's clearest single-color representative.
const ACCENT_PRESETS: { nameKey: StringKey; hue: number }[] = [
  { nameKey: 'settings.accent.apricot', hue: 28 },
  { nameKey: 'settings.accent.lemon', hue: 50 },
  { nameKey: 'settings.accent.mint', hue: 155 },
  { nameKey: 'settings.accent.sky', hue: 205 },
  { nameKey: 'settings.accent.plum', hue: 285 },
  { nameKey: 'settings.accent.coral', hue: 355 },
];

// Called by main.ts's applyLanguage() (which refreshes the persistent chrome + re-renders the
// active screen) — this screen can't import that function directly, it's closure-bound to
// main.ts's own topbar/tab-bar DOM references.
export function renderSettingsScreen(container: HTMLElement, repos: SettingsScreenRepos, storage: StorageAdapter, applyLanguage: (lang: Lang) => void): void {
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
        <h2>${t('settings.theme.title')}</h2>
        <label class="field-label">${t('settings.theme.appearance')}</label>
        <div class="sort-toggle" style="margin-bottom:10px">
          ${(['auto', 'light', 'dark'] as ThemeMode[])
            .map((m) => `<button class="sort-btn ${theme.mode === m ? 'active' : ''}" data-action="theme-mode" data-mode="${m}">${t(MODE_LABEL_KEY[m])}</button>`)
            .join('')}
        </div>
        <label class="field-label">${t('settings.theme.palette')}</label>
        <div class="accent-preset-row">
          ${ACCENT_PRESETS.map(
            (p) => `
            <button
              class="accent-preset ${theme.accentHue === p.hue ? 'active' : ''}"
              data-action="theme-accent"
              data-hue="${p.hue}"
              style="background:hsl(${p.hue} 70% 66%)"
              aria-label="${t(p.nameKey)}"
              title="${t(p.nameKey)}"
            ></button>`,
          ).join('')}
        </div>
      </div>

      <div class="card">
        <h2>${t('settings.language.title')}</h2>
        <div class="sort-toggle">
          <button class="sort-btn ${theme.lang === 'fr' ? 'active' : ''}" data-action="lang" data-lang="fr">🇫🇷 Français</button>
          <button class="sort-btn ${theme.lang === 'en' ? 'active' : ''}" data-action="lang" data-lang="en">🇬🇧 English</button>
        </div>
      </div>

      <div class="card">
        <h2>${t('settings.profile.title')}</h2>
        <label class="field-label">${t('settings.profile.height')}</label>
        <input type="number" id="s-height" value="${profile.height_cm}">
        <label class="field-label">${t('settings.profile.age')}</label>
        <input type="number" id="s-age" value="${profile.age}">
        <label class="field-label">${t('settings.profile.sex')}</label>
        <select id="s-sex">
          <option value="male" ${profile.sex === 'male' ? 'selected' : ''}>${t('settings.profile.male')}</option>
          <option value="female" ${profile.sex === 'female' ? 'selected' : ''}>${t('settings.profile.female')}</option>
        </select>
        <label class="field-label">${t('settings.profile.weightDefault')}</label>
        <input type="number" id="s-weight-default" value="${profile.weight_default_kg}" step="0.1">
        <label class="field-label">${t('settings.profile.weightStart')}</label>
        <input type="number" id="s-weight-start" value="${profile.weight_start_kg}" step="0.1">
        <label class="field-label">${t('settings.profile.weightGoal')}</label>
        <input type="number" id="s-weight-goal" value="${profile.weight_goal_kg}" step="0.1">
        <button class="btn-cta" data-action="save-profile">${t('common.save')}</button>
        <div class="msg" id="settings-msg"></div>
      </div>

      <div class="card">
        <h2>${t('settings.backup.title')}</h2>
        <div id="settings-export"></div>
      </div>

      <div class="card">
        <h2>${t('settings.nextcloud.title')}</h2>
        <label class="field-label">${t('settings.nextcloud.serverUrl')}</label>
        <input type="url" id="nc-url" placeholder="https://nextcloud.exemple.fr" value="${nextcloud.url}">
        <label class="field-label">${t('settings.nextcloud.username')}</label>
        <input type="text" id="nc-username" value="${nextcloud.username}">
        <label class="field-label">${t('settings.nextcloud.appPassword')} ${ncHasPassword ? t('settings.nextcloud.appPasswordSaved') : ''}</label>
        <input type="password" id="nc-password" placeholder="${ncHasPassword ? '••••••••' : t('settings.nextcloud.appPasswordPlaceholder')}" autocomplete="off">
        <p class="empty-hint" style="padding:0">${t('settings.nextcloud.storedEncrypted')}</p>
        <label class="field-label">${t('settings.nextcloud.autoBackup')}</label>
        <div class="sort-toggle" style="margin-bottom:10px">
          ${(['off', 'launch'] as NextcloudAutoBackupMode[])
            .map((m) => `<button class="sort-btn ${nextcloud.autoBackupMode === m ? 'active' : ''}" data-action="nc-mode" data-mode="${m}">${t(NC_MODE_LABEL_KEY[m])}</button>`)
            .join('')}
        </div>
        <p class="empty-hint" style="padding:0">
          ${nextcloud.lastBackupAt
            ? t('settings.nextcloud.lastBackup', { date: new Date(nextcloud.lastBackupAt).toLocaleString(getLang() === 'en' ? 'en-US' : 'fr-FR'), status: t(nextcloud.lastBackupOk ? 'settings.nextcloud.statusOk' : 'settings.nextcloud.statusFailed') })
            : t('settings.nextcloud.noBackupYet')}
        </p>
        <button class="btn-cta" data-action="nc-save">${t('settings.nextcloud.saveConfig')}</button>
        <button class="btn-secondary" data-action="nc-backup-now">${t('settings.nextcloud.backupNow')}</button>
        <button class="btn-secondary" data-action="nc-restore">${t('settings.nextcloud.restore')}</button>
        <div class="card" id="nc-restore-preview" style="display:none">
          <div class="counts" id="nc-restore-counts"></div>
          <button class="btn-cta" data-action="nc-restore-confirm">${t('settings.nextcloud.confirmRestore')}</button>
        </div>
        <div class="msg" id="nc-msg"></div>
      </div>

      <div class="card">
        <h2>${t('settings.ai.title')}</h2>
        <label class="field-label">${t('settings.ai.apiKey')} ${mistralHasKey ? t('settings.ai.apiKeySaved') : ''}</label>
        <input type="password" id="mistral-key" placeholder="${mistralHasKey ? '••••••••' : t('settings.ai.apiKeyPlaceholder')}" autocomplete="off">
        <p class="empty-hint" style="padding:0">${t('settings.ai.keyStoredEncrypted')}</p>
        <button class="btn-cta" data-action="mistral-save">${t('settings.ai.saveKey')}</button>
        <button class="btn-secondary" data-action="mistral-test">${t('settings.ai.testConnection')}</button>
        <div class="msg" id="mistral-msg"></div>
      </div>

      <div class="card">
        <h2>${t('settings.footprint.title')}</h2>
        ${footprint.totalCallCount === 0
          ? `<p class="empty-hint" style="padding:0">${t('settings.footprint.noCalls')}</p>`
          : `
            <p class="empty-hint" style="padding:0">${t('settings.footprint.since', { date: footprint.since ? new Date(footprint.since).toLocaleDateString(getLang() === 'en' ? 'en-US' : 'fr-FR') : '—' })}</p>
            <div class="counts">
              ${footprint.perFeature
                .filter((f) => f.callCount > 0)
                .map(
                  (f) =>
                    `<div><span>${t(AI_FEATURE_LABEL_KEY[f.feature])} (${f.callCount})</span><span>${fmt(f.gCO2e)} gCO2e · ${fmt(f.mlWater)} mL</span></div>`,
                )
                .join('')}
            </div>
            <div class="counts" style="font-weight:600;margin-top:8px">
              <div><span>${t('settings.footprint.total')}</span><span>${fmt(footprint.totalGCO2e)} gCO2e · ${fmt(footprint.totalMlWater)} mL eau</span></div>
            </div>
            <p class="empty-hint" style="padding:0;margin-top:8px">
              ${t('settings.footprint.methodology')}
            </p>
          `}
        ${retro.totalCallCount > 0
          ? `
            <hr style="border:none;border-top:1px solid var(--outline-variant);margin:14px 0">
            <p class="empty-hint" style="padding:0">${t('settings.footprint.retroTitle')}</p>
            <div class="counts">
              ${retro.buckets
                .filter((b) => b.callCount > 0)
                .map(
                  (b) =>
                    `<div><span>${t(RETRO_BUCKET_LABEL_KEY[b.bucket])} (${b.callCount})</span><span>${b.estimateSource === 'fallback' ? '≈ ' : ''}${fmt(b.gCO2e)} gCO2e · ${fmt(b.mlWater)} mL</span></div>`,
                )
                .join('')}
            </div>
            <p class="empty-hint" style="padding:0;margin-top:8px">
              ${t('settings.footprint.retroMethodology')}
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
            <p class="empty-hint" style="padding:0">${t('settings.footprint.equivalencesTitle')}</p>
            <div class="counts">
              <div><span>${t('settings.footprint.co2Equivalent')}</span><span>${t('settings.footprint.co2EquivalentValue', { n: fmt(eq.emailsEquivalent) })}</span></div>
              <div><span>${t('settings.footprint.humanWater')}</span><span>${t('settings.footprint.humanWaterValue', { n: fmt1(eq.humanDaysWater) })}</span></div>
              <div><span>${t('settings.footprint.cowWater')}</span><span>${t('settings.footprint.cowWaterValue', { n: fmt1(eq.cowDailyWaterPercent) })}</span></div>
            </div>
            <p class="empty-hint" style="padding:0;margin-top:8px">
              ${t('settings.footprint.equivalencesSources')}
            </p>
          `;
        })()}
      </div>

      <div class="card">
        <h2>${t('settings.migration.title')}</h2>
        <div id="settings-import"></div>
      </div>

      <div class="card">
        <h2>${t('settings.about.title')}</h2>
        <p class="empty-hint" style="padding:0">
          ${t('settings.about.ciqual')}
        </p>
        <p class="empty-hint" style="padding:0">
          ${t('settings.about.aiDisclaimer')}
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

    const langBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-action="lang"]');
    if (langBtn) {
      theme = { ...theme, lang: langBtn.dataset.lang as Lang };
      await repos.theme.save(theme);
      applyLanguage(theme.lang); // re-renders the whole app shell + active screen (this one)
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
      msgEl.textContent = t('settings.nextcloud.configSaved');
      render();
      return;
    }

    if ((e.target as HTMLElement).closest('[data-action="nc-backup-now"]')) {
      const msgEl = ncMsgEl();
      msgEl.className = 'msg';
      msgEl.textContent = t('settings.nextcloud.backingUp');
      const password = await getNextcloudPassword();
      if (!password || !nextcloud.url || !nextcloud.username) {
        msgEl.className = 'msg error';
        msgEl.textContent = t('settings.nextcloud.missingConfigBackup');
        return;
      }
      try {
        const blob = await buildExportBlob(storage);
        await backupToNextcloud({ url: nextcloud.url, username: nextcloud.username }, password, blob);
        nextcloud = { ...nextcloud, lastBackupAt: new Date().toISOString(), lastBackupOk: true };
        await repos.nextcloud.save(nextcloud);
        render();
        ncMsgEl().className = 'msg ok';
        ncMsgEl().textContent = t('settings.nextcloud.backedUp');
      } catch (err) {
        nextcloud = { ...nextcloud, lastBackupAt: new Date().toISOString(), lastBackupOk: false };
        await repos.nextcloud.save(nextcloud);
        render();
        ncMsgEl().className = 'msg error';
        ncMsgEl().textContent = t('settings.nextcloud.failed', { message: (err as Error).message });
      }
      return;
    }

    if ((e.target as HTMLElement).closest('[data-action="nc-restore"]')) {
      const msgEl = ncMsgEl();
      msgEl.className = 'msg';
      msgEl.textContent = t('settings.nextcloud.restoring');
      const password = await getNextcloudPassword();
      if (!password || !nextcloud.url || !nextcloud.username) {
        msgEl.className = 'msg error';
        msgEl.textContent = t('settings.nextcloud.missingConfigRestore');
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
        msgEl.textContent = t('settings.nextcloud.failed', { message: (err as Error).message });
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
      ncMsgEl().textContent = t('settings.nextcloud.restoreDone');
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
        msgEl.textContent = t('settings.ai.keySaved');
        render();
      } else {
        msgEl.className = 'msg ok';
        msgEl.textContent = mistralHasKey ? t('settings.ai.keyKeptEmpty') : '';
      }
      return;
    }

    if ((e.target as HTMLElement).closest('[data-action="mistral-test"]')) {
      const msgEl = mistralMsgEl();
      const typed = container.querySelector<HTMLInputElement>('#mistral-key')!.value.trim();
      const key = typed || (await getMistralApiKey());
      if (!key) {
        msgEl.className = 'msg error';
        msgEl.textContent = t('settings.ai.noKeyToTest');
        return;
      }
      msgEl.className = 'msg';
      msgEl.textContent = t('settings.ai.testing');
      const result = await testMistralConnection(key);
      msgEl.className = result.ok ? 'msg ok' : 'msg error';
      if (result.ok) {
        msgEl.textContent = t('settings.ai.keyValid');
      } else if (result.message === 'HTTP 401') {
        msgEl.textContent = t('settings.ai.keyInvalid401');
      } else {
        msgEl.textContent = t('settings.ai.testError', { message: result.message ?? '' });
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
      msgEl.textContent = t('settings.profile.invalidValues');
      return;
    }

    profile = { height_cm, age, sex, weight_default_kg, weight_start_kg, weight_goal_kg };
    await repos.profile.save(profile);
    msgEl.className = 'msg ok';
    msgEl.textContent = t('settings.profile.saved');
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
