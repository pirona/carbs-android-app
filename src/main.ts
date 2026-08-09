// SPDX-License-Identifier: GPL-3.0-or-later
import './ui/style.css';
import { PreferencesStorageAdapter } from './storage/PreferencesStorageAdapter';
import { DayHistoryRepo } from './storage/repos/dayHistoryRepo';
import { CarbHistoryRepo } from './storage/repos/carbHistoryRepo';
import { PlaisirRepo } from './storage/repos/plaisirRepo';
import { SportRepo } from './storage/repos/sportRepo';
import { HabitsRepo } from './storage/repos/habitsRepo';
import { FoodLogRepo } from './storage/repos/foodLogRepo';
import type { ImportRepos } from './migration/importExport';
import { renderExportScreen } from './ui/screens/ExportScreen';
import { renderImportScreen } from './ui/screens/ImportScreen';

// Minimal shell hosting only Export/Import for now (Phase 2). The Day/Week/Habits/
// Settings screens land in Phase 3 and will replace this with real navigation.
const storage = new PreferencesStorageAdapter();
const repos: ImportRepos = {
  dayHistory: new DayHistoryRepo(storage),
  carbHistory: new CarbHistoryRepo(storage),
  plaisir: new PlaisirRepo(storage),
  sport: new SportRepo(storage),
  habits: new HabitsRepo(storage),
  foodLog: new FoodLogRepo(storage),
};

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="tabs">
    <button id="tab-export">Export</button>
    <button id="tab-import" class="inactive">Import</button>
  </div>
  <div id="screen"></div>
`;

const tabExport = app.querySelector<HTMLButtonElement>('#tab-export')!;
const tabImport = app.querySelector<HTMLButtonElement>('#tab-import')!;
const screen = app.querySelector<HTMLDivElement>('#screen')!;

function showExport() {
  tabExport.classList.remove('inactive');
  tabImport.classList.add('inactive');
  renderExportScreen(screen, storage);
}

function showImport() {
  tabImport.classList.remove('inactive');
  tabExport.classList.add('inactive');
  renderImportScreen(screen, repos);
}

tabExport.addEventListener('click', showExport);
tabImport.addEventListener('click', showImport);

showExport();
