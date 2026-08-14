// SPDX-License-Identifier: GPL-3.0-or-later
import './ui/style.css';
import { PreferencesStorageAdapter } from './storage/PreferencesStorageAdapter';
import { DayHistoryRepo } from './storage/repos/dayHistoryRepo';
import { CarbHistoryRepo } from './storage/repos/carbHistoryRepo';
import { PlaisirRepo } from './storage/repos/plaisirRepo';
import { SportRepo } from './storage/repos/sportRepo';
import { HabitsRepo } from './storage/repos/habitsRepo';
import { FoodLogRepo } from './storage/repos/foodLogRepo';
import { ProfileRepo } from './storage/repos/profileRepo';
import { renderDayScreen, type DayScreenRepos } from './ui/screens/DayScreen';
import { renderWeekScreen, type WeekScreenRepos } from './ui/screens/WeekScreen';
import { renderHabitsScreen } from './ui/screens/HabitsScreen';
import { renderSettingsScreen, type SettingsScreenRepos } from './ui/screens/SettingsScreen';
import { renderPhotoScanScreen, type PhotoScanScreenRepos } from './ui/screens/PhotoScanScreen';
import { CapgoHealthConnectAdapter } from './integrations/healthConnect/CapgoHealthConnectAdapter';
import { ThemeRepo } from './storage/repos/themeRepo';
import { NextcloudRepo } from './storage/repos/nextcloudRepo';
import { backupToNextcloud, getNextcloudPassword } from './integrations/nextcloudWebdav';
import { buildExportBlob } from './migration/exportDump';
import { applyTheme } from './ui/theme';

const storage = new PreferencesStorageAdapter();
const healthConnect = new CapgoHealthConnectAdapter();
const dayHistory = new DayHistoryRepo(storage);
const carbHistory = new CarbHistoryRepo(storage);
const plaisir = new PlaisirRepo(storage);
const sport = new SportRepo(storage);
const habits = new HabitsRepo(storage);
const foodLog = new FoodLogRepo(storage);
const profile = new ProfileRepo(storage);
const theme = new ThemeRepo(storage);
const nextcloud = new NextcloudRepo(storage);

// Applied as early as possible — a brief flash of the default theme before the stored
// preference loads is an acceptable tradeoff for Preferences' async-only read API.
theme.load().then(applyTheme);

// Silent, fire-and-forget: a failed auto-backup must never block or interrupt app
// startup. Errors just leave lastBackupOk=false, surfaced next time Settings is opened.
nextcloud.load().then(async (settings) => {
  if (settings.autoBackupMode !== 'launch') return;
  const password = await getNextcloudPassword();
  if (!password || !settings.url || !settings.username) return;
  try {
    const blob = await buildExportBlob(storage);
    await backupToNextcloud({ url: settings.url, username: settings.username }, password, blob);
    await nextcloud.save({ ...settings, lastBackupAt: new Date().toISOString(), lastBackupOk: true });
  } catch {
    await nextcloud.save({ ...settings, lastBackupAt: new Date().toISOString(), lastBackupOk: false });
  }
});

const dayRepos: DayScreenRepos = { dayHistory, sport, foodLog, plaisir, habits, profile };
const weekRepos: WeekScreenRepos = { dayHistory, carbHistory, plaisir, sport, profile };
const settingsRepos: SettingsScreenRepos = { dayHistory, carbHistory, plaisir, sport, habits, foodLog, profile, theme, nextcloud };
const photoScanRepos: PhotoScanScreenRepos = { habits, foodLog };

// "Scan" sits right after "Jour" — photo entry is the primary adoption driver for this
// app (see project memory), not a secondary feature bolted on after the core screens.
type TabId = 'day' | 'scan' | 'week' | 'habits' | 'settings';
const TABS: { id: TabId; label: string; render: (el: HTMLElement) => void }[] = [
  { id: 'day', label: 'Jour', render: (el) => renderDayScreen(el, dayRepos, healthConnect) },
  { id: 'scan', label: '📷 Scan', render: (el) => renderPhotoScanScreen(el, photoScanRepos) },
  { id: 'week', label: 'Semaine', render: (el) => renderWeekScreen(el, weekRepos) },
  { id: 'habits', label: 'Habitudes', render: (el) => renderHabitsScreen(el, { habits }) },
  { id: 'settings', label: 'Réglages', render: (el) => renderSettingsScreen(el, settingsRepos, storage) },
];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="tabs">${TABS.map((t) => `<button data-tab="${t.id}">${t.label}</button>`).join('')}</div>
  <div id="screen"></div>
`;

let screen = app.querySelector<HTMLDivElement>('#screen')!;
const tabButtons = app.querySelectorAll<HTMLButtonElement>('[data-tab]');

function showTab(id: TabId) {
  const tab = TABS.find((t) => t.id === id)!;
  tabButtons.forEach((btn) => btn.classList.toggle('inactive', btn.dataset.tab !== id));
  // Each screen module attaches its own click/change listeners directly on the container
  // it's given (see DayScreen etc.) — reusing the same node across renders would stack a
  // new listener on top of every previous one, firing actions multiple times per tap.
  // Swapping in a bare clone before every render guarantees a listener-free container.
  const fresh = screen.cloneNode(false) as HTMLDivElement;
  screen.replaceWith(fresh);
  screen = fresh;
  tab.render(screen);
}

tabButtons.forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab as TabId)));

showTab('day');
