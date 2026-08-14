// SPDX-License-Identifier: GPL-3.0-or-later
// Semainier grid — editable day-type/sport-kcal/plaisir planning table, the one genuinely
// high-frequency part of the old combined Week screen. Weight-goal bar, weekly deficit,
// program fidelity and the weight chart moved to ProgressScreen (read-only/low-frequency
// content, see plan §redesign) — day-focused parts live in DayScreen.
import type { DayType, PlaisirLevel, Profile } from '../../core/types';
import { DEFAULT_DAY_SCHEDULE, PLAISIR_CYCLE, PLAISIR_LEVELS } from '../../core/types';
import type { DayHistoryRepo } from '../../storage/repos/dayHistoryRepo';
import type { PlaisirRepo } from '../../storage/repos/plaisirRepo';
import type { SportRepo } from '../../storage/repos/sportRepo';
import type { ProfileRepo } from '../../storage/repos/profileRepo';
import { detectDayType } from '../../core/calc/dayType';
import { formatDateKey } from '../../core/calc/date';
import { DEFAULT_THRESHOLDS } from '../../core/types';

export interface WeekScreenRepos {
  dayHistory: DayHistoryRepo;
  plaisir: PlaisirRepo;
  sport: SportRepo;
  profile: ProfileRepo;
}

const DOW = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const BADGE: Record<DayType, string> = { high: 'HIGH', medium: 'MED', low: 'LOW', plaisir: '🍺' };
const COLOR: Record<DayType, string> = { high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)', plaisir: 'var(--plaisir)' };

function mondayOf(now: Date): Date {
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  return monday;
}

export function renderWeekScreen(container: HTMLElement, repos: WeekScreenRepos): void {
  let profile: Profile;
  let todayDayType: DayType = 'medium';

  const now = () => new Date();

  async function computeTodayDayType(): Promise<DayType> {
    const sportKcal = await repos.sport.loadSportKcal(now());
    const overrides = await repos.plaisir.loadOverrides(now());
    const current = await repos.dayHistory.loadCurrentDay();
    const weightKg = current?.weight_kg ?? profile.weight_default_kg;
    const det = detectDayType(
      { steps: null, sportKcal, activeCaloriesKcal: null, exerciseMin: null },
      weightKg,
      profile,
      DEFAULT_THRESHOLDS,
      DEFAULT_DAY_SCHEDULE,
      overrides,
      now(),
    );
    return det.type;
  }

  async function semainierHtml(): Promise<string> {
    const today = formatDateKey(now());
    const overrides = await repos.plaisir.loadOverrides(now());
    const plan = await repos.sport.loadSportPlan();
    const history = await repos.dayHistory.loadHistory();
    const histMap = new Map(history.map((e) => [e.date, e]));

    const monday = mondayOf(now());
    const rows: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ds = formatDateKey(d);
      const isToday = ds === today;
      const isPast = ds < today;

      const plaisirLevel = overrides.levels[ds] ?? null;
      let type: DayType;
      if (plaisirLevel) type = 'plaisir';
      else if (isToday) type = todayDayType;
      else if (isPast && histMap.has(ds)) type = histMap.get(ds)!.dayType;
      else type = DEFAULT_DAY_SCHEDULE[d.getDay()] ?? 'medium';

      let sportVal: number | '' = '';
      if (isToday) sportVal = (await repos.sport.loadSportKcal(now())) ?? '';
      else if (isPast && histMap.get(ds)?.sport_kcal) sportVal = histMap.get(ds)!.sport_kcal!;
      else if (plan[ds] !== undefined) sportVal = plan[ds];

      rows.push(`
        <tr class="${isToday ? 'today-row' : ''}">
          <td style="white-space:nowrap;${isToday ? 'color:var(--text);font-weight:700' : 'color:var(--text-muted)'}">
            ${DOW[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}
            ${isToday ? '<span style="color:var(--medium);font-size:9px"> auj.</span>' : ''}
          </td>
          <td><span style="color:${COLOR[type]};font-weight:700;font-size:10px">${BADGE[type]}</span></td>
          <td style="text-align:center">
            <button class="icon-btn" style="opacity:${plaisirLevel ? '1' : '0.3'}" data-action="cycle-plaisir" data-date="${ds}">
              ${plaisirLevel ? PLAISIR_LEVELS[plaisirLevel].icon : '🍺'}
            </button>
          </td>
          <td style="text-align:right">
            <input type="number" min="0" max="9999" placeholder="—" value="${sportVal}" data-action="set-sport-date" data-date="${ds}">
          </td>
        </tr>`);
    }

    return `
      <div class="card">
        <h2>🗓️ Semainier</h2>
        <table class="week-table">
          <thead><tr><th>Jour</th><th>Type</th><th style="text-align:center">🍺</th><th style="text-align:right">kcal sport</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
        <p class="empty-hint" style="margin-top:8px;padding-bottom:0">🍺 = jour plaisir (tap pour cycler)</p>
      </div>`;
  }

  async function render() {
    container.innerHTML = await semainierHtml();
  }

  container.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'cycle-plaisir') {
      const ds = target.dataset.date!;
      await cyclePlaisirDay(ds);
      todayDayType = await computeTodayDayType();
      render();
    }
  });

  container.addEventListener('change', async (e) => {
    const target = e.target as HTMLElement;
    if (target.dataset.action === 'set-sport-date') {
      const ds = target.dataset.date!;
      const raw = (target as HTMLInputElement).value;
      const kcal = parseFloat(raw);
      await setSportKcalForDate(ds, isNaN(kcal) ? 0 : kcal);
      todayDayType = await computeTodayDayType();
      render();
    }
  });

  async function cyclePlaisirDay(dateStr: string): Promise<void> {
    const overrides = await repos.plaisir.loadOverrides(now());
    const current = overrides.levels[dateStr] ?? null;
    const idx = PLAISIR_CYCLE.indexOf(current);
    const next = PLAISIR_CYCLE[(idx + 1) % PLAISIR_CYCLE.length];
    if (next === null) delete overrides.levels[dateStr];
    else overrides.levels[dateStr] = next as PlaisirLevel;
    await repos.plaisir.saveOverrides(overrides, now());

    const today = formatDateKey(now());
    if (dateStr < today) {
      const history = await repos.dayHistory.loadHistory();
      const entry = history.find((e) => e.date === dateStr);
      if (entry) {
        entry.dayType = next ? 'plaisir' : DEFAULT_DAY_SCHEDULE[new Date(dateStr + 'T12:00:00').getDay()] ?? 'medium';
        await repos.dayHistory.saveHistory(history);
      }
    }
  }

  async function setSportKcalForDate(dateStr: string, kcal: number): Promise<void> {
    if (isNaN(kcal) || kcal < 0) return;
    const today = formatDateKey(now());
    const plan = await repos.sport.loadSportPlan();
    if (kcal > 0) plan[dateStr] = kcal;
    else delete plan[dateStr];
    await repos.sport.saveSportPlan(plan, now());

    if (dateStr === today) {
      if (kcal > 0) await repos.sport.saveSportKcal(kcal, now());
      else await repos.sport.clearSportKcal();
    } else if (dateStr < today) {
      const history = await repos.dayHistory.loadHistory();
      const entry = history.find((e) => e.date === dateStr);
      if (entry) {
        entry.sport_kcal = kcal > 0 ? kcal : null;
        entry.burned_today = (entry.step_kcal || 0) + (kcal > 0 ? kcal : 0);
        await repos.dayHistory.saveHistory(history);
      }
    }
  }

  (async () => {
    profile = await repos.profile.load();
    todayDayType = await computeTodayDayType();
    render();
  })();
}
