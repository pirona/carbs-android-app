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
import { CapgoHealthConnectAdapter } from './integrations/healthConnect/CapgoHealthConnectAdapter';

const storage = new PreferencesStorageAdapter();
const healthConnect = new CapgoHealthConnectAdapter();
const dayHistory = new DayHistoryRepo(storage);
const carbHistory = new CarbHistoryRepo(storage);
const plaisir = new PlaisirRepo(storage);
const sport = new SportRepo(storage);
const habits = new HabitsRepo(storage);
const foodLog = new FoodLogRepo(storage);
const profile = new ProfileRepo(storage);

const dayRepos: DayScreenRepos = { dayHistory, sport, foodLog, plaisir, habits, profile };
const weekRepos: WeekScreenRepos = { dayHistory, carbHistory, plaisir, sport, profile };
const settingsRepos: SettingsScreenRepos = { dayHistory, carbHistory, plaisir, sport, habits, foodLog, profile };

type TabId = 'day' | 'week' | 'habits' | 'settings';
const TABS: { id: TabId; label: string; render: (el: HTMLElement) => void }[] = [
  { id: 'day', label: 'Jour', render: (el) => renderDayScreen(el, dayRepos, healthConnect) },
  { id: 'week', label: 'Semaine', render: (el) => renderWeekScreen(el, weekRepos) },
  { id: 'habits', label: 'Habitudes', render: (el) => renderHabitsScreen(el, { habits }) },
  { id: 'settings', label: 'Réglages', render: (el) => renderSettingsScreen(el, settingsRepos, storage) },
];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="tabs">${TABS.map((t) => `<button data-tab="${t.id}">${t.label}</button>`).join('')}</div>
  <div id="screen"></div>
`;

const screen = app.querySelector<HTMLDivElement>('#screen')!;
const tabButtons = app.querySelectorAll<HTMLButtonElement>('[data-tab]');

function showTab(id: TabId) {
  const tab = TABS.find((t) => t.id === id)!;
  tabButtons.forEach((btn) => btn.classList.toggle('inactive', btn.dataset.tab !== id));
  tab.render(screen);
}

tabButtons.forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab as TabId)));

showTab('day');
