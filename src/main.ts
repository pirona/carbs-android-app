// SPDX-License-Identifier: GPL-3.0-or-later
import './ui/style.css';
import { PreferencesStorageAdapter } from './storage/PreferencesStorageAdapter';
import { DayHistoryRepo } from './storage/repos/dayHistoryRepo';
import { CarbHistoryRepo } from './storage/repos/carbHistoryRepo';
import { PlaisirRepo } from './storage/repos/plaisirRepo';
import { SportRepo } from './storage/repos/sportRepo';
import { HabitsRepo } from './storage/repos/habitsRepo';
import { FoodLogRepo } from './storage/repos/foodLogRepo';
import { FoodLogHistoryRepo } from './storage/repos/foodLogHistoryRepo';
import { CarbAdviceHistoryRepo } from './storage/repos/carbAdviceHistoryRepo';
import { CarbPeriodBilanHistoryRepo } from './storage/repos/carbPeriodBilanHistoryRepo';
import { ProfileRepo } from './storage/repos/profileRepo';
import { AiFootprintRepo } from './storage/repos/aiFootprintRepo';
import { renderDayScreen, type DayScreenRepos } from './ui/screens/DayScreen';
import { renderProgressScreen, type ProgressScreenRepos } from './ui/screens/ProgressScreen';
import { renderWeekScreen, type WeekScreenRepos } from './ui/screens/WeekScreen';
import { renderHabitsScreen } from './ui/screens/HabitsScreen';
import { renderSettingsScreen, type SettingsScreenRepos } from './ui/screens/SettingsScreen';
import { renderPhotoScanScreen, type PhotoScanScreenRepos } from './ui/screens/PhotoScanScreen';
import { renderConseilsScreen, type ConseilsScreenRepos } from './ui/screens/ConseilsScreen';
import { CapgoHealthConnectAdapter } from './integrations/healthConnect/CapgoHealthConnectAdapter';
import { ThemeRepo } from './storage/repos/themeRepo';
import { NextcloudRepo } from './storage/repos/nextcloudRepo';
import { backupToNextcloud, getNextcloudPassword } from './integrations/nextcloudWebdav';
import { buildExportBlob } from './migration/exportDump';
import { applyTheme } from './ui/theme';
import { attachSwipeNav } from './ui/swipeNav';
import { iconHome, iconTrendingUp, iconPhotoCamera, iconCalendarMonth, iconRestaurantMenu, iconSettings, iconLightbulb } from './ui/icons';
import { setLang, t, type Lang, type StringKey } from './ui/i18n/strings';

const storage = new PreferencesStorageAdapter();
const healthConnect = new CapgoHealthConnectAdapter();
const dayHistory = new DayHistoryRepo(storage);
const carbHistory = new CarbHistoryRepo(storage);
const plaisir = new PlaisirRepo(storage);
const sport = new SportRepo(storage);
const habits = new HabitsRepo(storage);
const foodLog = new FoodLogRepo(storage);
const foodLogHistory = new FoodLogHistoryRepo(storage);
const carbAdviceHistory = new CarbAdviceHistoryRepo(storage);
const carbPeriodBilanHistory = new CarbPeriodBilanHistoryRepo(storage);
const profile = new ProfileRepo(storage);
const aiFootprint = new AiFootprintRepo(storage);
const theme = new ThemeRepo(storage);
const nextcloud = new NextcloudRepo(storage);

// Applied as early as possible — a brief flash of the default theme/language before the stored
// preference loads is an acceptable tradeoff for Preferences' async-only read API.
theme.load().then((settings) => {
  applyTheme(settings);
  applyLanguage(settings.lang);
});

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

const dayRepos: DayScreenRepos = { dayHistory, sport, foodLog, foodLogHistory, plaisir, habits, profile };
const progressRepos: ProgressScreenRepos = { dayHistory, carbHistory, plaisir, sport, profile };
const weekRepos: WeekScreenRepos = { dayHistory, plaisir, sport, profile };
const settingsRepos: SettingsScreenRepos = {
  dayHistory,
  carbHistory,
  plaisir,
  sport,
  habits,
  foodLog,
  foodLogHistory,
  profile,
  theme,
  nextcloud,
  aiFootprint,
  carbAdviceHistory,
  carbPeriodBilanHistory,
};
const photoScanRepos: PhotoScanScreenRepos = { habits, foodLog };
const conseilsRepos: ConseilsScreenRepos = { dayHistory, foodLogHistory, carbAdviceHistory, carbPeriodBilanHistory, profile };

type TabId = 'day' | 'progress' | 'scan' | 'week' | 'habits' | 'settings' | 'conseils';
interface TabDef {
  id: TabId;
  labelKey: StringKey;
  render: (el: HTMLElement) => void;
}

// The 5 destinations that fit an M3 bottom navigation bar (max recommended is 5) — "Scan"
// sits right after "Jour" since photo entry is the primary adoption driver for this app (see
// project memory), not a secondary feature bolted on after the core screens. Réglages doesn't
// belong here: it's not a frequent daily destination, so it lives as a top-app-bar icon instead
// (see #topbar-settings below), present on every screen regardless of which tab is active.
const PRIMARY_TABS: (TabDef & { icon: () => string })[] = [
  { id: 'day', icon: iconHome, labelKey: 'nav.day', render: (el) => renderDayScreen(el, dayRepos, healthConnect) },
  { id: 'progress', icon: iconTrendingUp, labelKey: 'nav.progress', render: (el) => renderProgressScreen(el, progressRepos) },
  { id: 'scan', icon: iconPhotoCamera, labelKey: 'nav.scan', render: (el) => renderPhotoScanScreen(el, photoScanRepos) },
  { id: 'week', icon: iconCalendarMonth, labelKey: 'nav.week', render: (el) => renderWeekScreen(el, weekRepos) },
  { id: 'habits', icon: iconRestaurantMenu, labelKey: 'nav.habits', render: (el) => renderHabitsScreen(el, { habits }) },
];

// Conseils shares the same "not a several-times-a-day destination" reasoning as Réglages (see
// PRIMARY_TABS comment above) — a once-in-a-while check-in after a fully-logged day, not a
// recurring tab worth the 6th bottom-nav slot M3 doesn't recommend.
const CONSEILS_TAB: TabDef = { id: 'conseils', labelKey: 'nav.conseils', render: (el) => renderConseilsScreen(el, conseilsRepos) };
const SETTINGS_TAB: TabDef = { id: 'settings', labelKey: 'nav.settings', render: (el) => renderSettingsScreen(el, settingsRepos, storage, applyLanguage) };

const ALL_TABS: TabDef[] = [...PRIMARY_TABS, CONSEILS_TAB, SETTINGS_TAB];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header id="topbar">
    <div id="topbar-inner">
      <img id="topbar-logo" src="/logo-taco-chick.png" alt="">
      <h1 id="topbar-title"></h1>
      <button class="topbar-icon" id="topbar-conseils" data-tab="conseils" aria-label="">${iconLightbulb()}</button>
      <button class="topbar-icon" id="topbar-settings" data-tab="settings" aria-label="">${iconSettings()}</button>
    </div>
  </header>
  <div id="screen-viewport">
    <div id="screen"></div>
  </div>
  <nav id="tabs">
    <div id="tabs-inner">
      ${PRIMARY_TABS.map(
        (tab) => `
        <button class="nav-item" data-tab="${tab.id}">
          <span class="nav-icon">${tab.icon()}</span>
          <span class="nav-label"></span>
        </button>`,
      ).join('')}
    </div>
  </nav>
`;

let screen = app.querySelector<HTMLDivElement>('#screen')!;
let currentTab: TabId = 'day';
const topbarTitle = app.querySelector<HTMLHeadingElement>('#topbar-title')!;
const topbarConseils = app.querySelector<HTMLButtonElement>('#topbar-conseils')!;
const topbarSettings = app.querySelector<HTMLButtonElement>('#topbar-settings')!;
const navItems = app.querySelectorAll<HTMLButtonElement>('#tabs [data-tab]');

function showTab(id: TabId) {
  currentTab = id;
  const tab = ALL_TABS.find((t) => t.id === id)!;
  navItems.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === id));
  topbarConseils.classList.toggle('active', id === 'conseils');
  topbarSettings.classList.toggle('active', id === 'settings');
  topbarTitle.textContent = t(tab.labelKey);
  // Each screen module attaches its own click/change listeners directly on the container
  // it's given (see DayScreen etc.) — reusing the same node across renders would stack a
  // new listener on top of every previous one, firing actions multiple times per tap.
  // Swapping in a bare clone before every render guarantees a listener-free container.
  // cloneNode(false) copies the *current* style attribute too — any leftover drag transform
  // from a swipe (see attachSwipeNav wiring below) must be cleared on `screen` before cloning,
  // or the fresh container would inherit it and render already shifted off-screen.
  screen.style.transform = '';
  screen.style.transition = '';
  const fresh = screen.cloneNode(false) as HTMLDivElement;
  fresh.classList.add('screen-enter');
  screen.replaceWith(fresh);
  screen = fresh;
  tab.render(screen);
}

// Language changes touch text baked outside the showTab() re-render cycle (topbar title, the
// always-visible tab-bar labels, the 2 icon buttons' aria-labels) — unlike theme (a CSS var,
// propagates for free), so this explicitly refreshes the persistent chrome AND re-runs the
// active screen's render() with the new language. Called once at boot and again from the
// language toggle in Réglages (passed into renderSettingsScreen as a callback, since that
// screen can't import this closure-bound function the way it imports the standalone applyTheme).
function applyLanguage(lang: Lang) {
  setLang(lang);
  navItems.forEach((btn, i) => {
    btn.querySelector<HTMLSpanElement>('.nav-label')!.textContent = t(PRIMARY_TABS[i].labelKey);
  });
  topbarConseils.setAttribute('aria-label', t('nav.conseils'));
  topbarSettings.setAttribute('aria-label', t('nav.settings'));
  showTab(currentTab);
}

navItems.forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab as TabId)));
topbarConseils.addEventListener('click', () => showTab('conseils'));
topbarSettings.addEventListener('click', () => showTab('settings'));

// Scoped to the 5 bottom-nav destinations, same "not a several-times-a-day destination"
// reasoning as PRIMARY_TABS above — swiping never lands on Conseils/Réglages. Clamped, not
// looped, at either end. #screen visually follows the finger (transform only — never touches
// layout/flow, so it can't disturb page scroll or the fixed topbar/tabs) and either finishes
// sliding off before the tab switches, or springs back if the drag didn't cross the commit
// threshold. A damped nudge (not a dead stop) at either end signals "no more screens this way".
const SWIPE_COMMIT_FRACTION = 0.3;
const EDGE_RESISTANCE = 0.35;

function activeTabIndex(): number {
  const activeId = app.querySelector<HTMLButtonElement>('#tabs .nav-item.active')?.dataset.tab as TabId | undefined;
  return PRIMARY_TABS.findIndex((t) => t.id === activeId);
}

attachSwipeNav(app, {
  onStart: () => {
    screen.style.transition = 'none';
  },
  onMove: (dx) => {
    const idx = activeTabIndex();
    const dir = dx < 0 ? 1 : -1;
    const hasTarget = idx !== -1 && idx + dir >= 0 && idx + dir <= PRIMARY_TABS.length - 1;
    screen.style.transform = `translateX(${hasTarget ? dx : dx * EDGE_RESISTANCE}px)`;
  },
  onEnd: (dx) => {
    const idx = activeTabIndex();
    const dir = dx < 0 ? 1 : -1;
    const hasTarget = idx !== -1 && idx + dir >= 0 && idx + dir <= PRIMARY_TABS.length - 1;
    const width = app.clientWidth || window.innerWidth;
    const commit = hasTarget && Math.abs(dx) > width * SWIPE_COMMIT_FRACTION;

    screen.style.transition = 'transform 180ms ease-out';
    if (commit) {
      const target = PRIMARY_TABS[idx + dir].id;
      screen.style.transform = `translateX(${dx < 0 ? -width : width}px)`;
      screen.addEventListener('transitionend', () => showTab(target), { once: true });
    } else {
      screen.style.transform = 'translateX(0)';
    }
  },
});

showTab('day');
