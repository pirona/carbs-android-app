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
import { renderProgressScreen, type ProgressScreenRepos } from './ui/screens/ProgressScreen';
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
import { iconHome, iconTrendingUp, iconPhotoCamera, iconCalendarMonth, iconRestaurantMenu, iconSettings } from './ui/icons';

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
const progressRepos: ProgressScreenRepos = { dayHistory, carbHistory, plaisir, sport, profile };
const weekRepos: WeekScreenRepos = { dayHistory, plaisir, sport, profile };
const settingsRepos: SettingsScreenRepos = { dayHistory, carbHistory, plaisir, sport, habits, foodLog, profile, theme, nextcloud };
const photoScanRepos: PhotoScanScreenRepos = { habits, foodLog };

type TabId = 'day' | 'progress' | 'scan' | 'week' | 'habits' | 'settings';
interface TabDef {
  id: TabId;
  label: string;
  render: (el: HTMLElement) => void;
}

// The 5 destinations that fit an M3 bottom navigation bar (max recommended is 5) — "Scan"
// sits right after "Jour" since photo entry is the primary adoption driver for this app (see
// project memory), not a secondary feature bolted on after the core screens. Réglages doesn't
// belong here: it's not a frequent daily destination, so it lives as a top-app-bar icon instead
// (see #topbar-settings below), present on every screen regardless of which tab is active.
const PRIMARY_TABS: (TabDef & { icon: () => string })[] = [
  { id: 'day', icon: iconHome, label: 'Jour', render: (el) => renderDayScreen(el, dayRepos, healthConnect) },
  { id: 'progress', icon: iconTrendingUp, label: 'Progrès', render: (el) => renderProgressScreen(el, progressRepos) },
  { id: 'scan', icon: iconPhotoCamera, label: 'Scan', render: (el) => renderPhotoScanScreen(el, photoScanRepos) },
  { id: 'week', icon: iconCalendarMonth, label: 'Semaine', render: (el) => renderWeekScreen(el, weekRepos) },
  { id: 'habits', icon: iconRestaurantMenu, label: 'Habitudes', render: (el) => renderHabitsScreen(el, { habits }) },
];

const SETTINGS_TAB: TabDef = { id: 'settings', label: 'Réglages', render: (el) => renderSettingsScreen(el, settingsRepos, storage) };

const ALL_TABS: TabDef[] = [...PRIMARY_TABS, SETTINGS_TAB];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header id="topbar">
    <div id="topbar-inner">
      <img id="topbar-logo" src="/logo-taco-chick.png" alt="">
      <h1 id="topbar-title"></h1>
      <button id="topbar-settings" data-tab="settings" aria-label="Réglages">${iconSettings()}</button>
    </div>
  </header>
  <div id="screen"></div>
  <nav id="tabs">
    ${PRIMARY_TABS.map(
      (t) => `
      <button class="nav-item" data-tab="${t.id}">
        <span class="nav-icon">${t.icon()}</span>
        <span class="nav-label">${t.label}</span>
      </button>`,
    ).join('')}
  </nav>
`;

let screen = app.querySelector<HTMLDivElement>('#screen')!;
const topbarTitle = app.querySelector<HTMLHeadingElement>('#topbar-title')!;
const topbarSettings = app.querySelector<HTMLButtonElement>('#topbar-settings')!;
const navItems = app.querySelectorAll<HTMLButtonElement>('#tabs [data-tab]');

function showTab(id: TabId) {
  const tab = ALL_TABS.find((t) => t.id === id)!;
  navItems.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === id));
  topbarSettings.classList.toggle('active', id === 'settings');
  topbarTitle.textContent = tab.label;
  // Each screen module attaches its own click/change listeners directly on the container
  // it's given (see DayScreen etc.) — reusing the same node across renders would stack a
  // new listener on top of every previous one, firing actions multiple times per tap.
  // Swapping in a bare clone before every render guarantees a listener-free container.
  const fresh = screen.cloneNode(false) as HTMLDivElement;
  screen.replaceWith(fresh);
  screen = fresh;
  tab.render(screen);
}

navItems.forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab as TabId)));
topbarSettings.addEventListener('click', () => showTab('settings'));

showTab('day');
