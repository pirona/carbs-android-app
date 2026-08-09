// SPDX-License-Identifier: GPL-3.0-or-later
// Semainier grid, weight-goal bar, nominal/real weekly deficit, program fidelity, and
// a weight chart from carb_history. Port of the week-focused parts of carb-cycling.html's
// render() (renderSemainier, renderWeekSummary, renderWeekProgress, renderProgramFidelity,
// renderWeightChart) — day-focused parts live in DayScreen.
import type { DayEntry, DayType, PlaisirLevel, Profile } from '../../core/types';
import { DEFAULT_DAY_SCHEDULE, PLAISIR_CYCLE, PLAISIR_LEVELS } from '../../core/types';
import type { DayHistoryRepo } from '../../storage/repos/dayHistoryRepo';
import type { CarbHistoryRepo } from '../../storage/repos/carbHistoryRepo';
import type { PlaisirRepo } from '../../storage/repos/plaisirRepo';
import type { SportRepo } from '../../storage/repos/sportRepo';
import type { ProfileRepo } from '../../storage/repos/profileRepo';
import { detectDayType } from '../../core/calc/dayType';
import { calcMacros } from '../../core/calc/macros';
import { calcWeeklyDeficit, calcWeekRealDeficit } from '../../core/calc/deficit';
import { calcProgramFidelity } from '../../core/calc/fidelity';
import { formatDateKey } from '../../core/calc/date';
import { calcWeightGoalProgress } from '../../core/calc/weightGoal';
import { DEFAULT_THRESHOLDS } from '../../core/types';

export interface WeekScreenRepos {
  dayHistory: DayHistoryRepo;
  // Not read yet — populating carb_history needs `archiveWeekIfNeeded`
  // (carb-cycling.html:677-709, weekly-scoped orchestration, not ported). The weight
  // chart below reads day_history instead so it has data from week one. Kept in the
  // repo bag for when weekly archival lands.
  carbHistory: CarbHistoryRepo;
  plaisir: PlaisirRepo;
  sport: SportRepo;
  profile: ProfileRepo;
}

const DOW = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const BADGE: Record<DayType, string> = { high: 'HIGH', medium: 'MED', low: 'LOW', plaisir: '🍺' };
const COLOR: Record<DayType, string> = { high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)', plaisir: 'var(--plaisir)' };

function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

function mondayOf(now: Date): Date {
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  return monday;
}

export function renderWeekScreen(container: HTMLElement, repos: WeekScreenRepos): void {
  let profile: Profile;
  let weightKg = 0;
  let todayDayType: DayType = 'medium';

  const now = () => new Date();

  async function computeTodayDayType(): Promise<DayType> {
    const sportKcal = await repos.sport.loadSportKcal(now());
    const overrides = await repos.plaisir.loadOverrides(now());
    const current = await repos.dayHistory.loadCurrentDay();
    weightKg = current?.weight_kg ?? profile.weight_default_kg;
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

  function weightGoalHtml(): string {
    const p = calcWeightGoalProgress(profile, weightKg);
    if (!p) return '';
    return `
      <div class="card">
        <div class="list-header"><h2>🎯 Objectif poids</h2><span style="color:var(--high);font-weight:700">${p.pct}%</span></div>
        <div class="goal-labels"><span>${profile.weight_start_kg} kg</span><span style="color:var(--text)">${weightKg} kg</span><span>${profile.weight_goal_kg} kg</span></div>
        <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${p.pct}%"></div></div>
        <div class="goal-labels"><span style="color:${p.lost > 0 ? 'var(--high)' : 'var(--text-muted)'}">−${Math.max(0, p.lost)} kg perdus</span><span>${p.remain} kg restants</span></div>
      </div>`;
  }

  async function weekSummaryHtml(): Promise<string> {
    const macros = calcMacros(todayDayType === 'plaisir' ? 'medium' : todayDayType, weightKg, profile);
    const weekDef = calcWeeklyDeficit(macros);
    const weekKg = (weekDef / 7700).toFixed(2);

    const history = await repos.dayHistory.loadHistory();
    const current = await repos.dayHistory.loadCurrentDay();
    const { realDeficit, trackedDays, isoToday } = calcWeekRealDeficit(history, current, now(), profile);
    const pct = weekDef > 0 ? Math.min(100, Math.max(0, Math.round((realDeficit / weekDef) * 100))) : 0;
    const daysLeft = 7 - isoToday;
    const DAY_NAMES = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    const fidelity = calcProgramFidelity(history, current, now(), profile);
    const fidColor =
      fidelity.fidelityPct === null ? 'var(--text-muted)' : fidelity.fidelityPct >= 70 ? 'var(--high)' : fidelity.fidelityPct >= 40 ? 'var(--medium)' : 'var(--plaisir)';

    return `
      <div class="card">
        <h2>📅 Semaine en cours</h2>
        <div class="week-totals-row"><span>Déficit semaine nominal (planning)</span><strong>~${fmt(weekDef)} kcal</strong></div>
        <div class="week-totals-row"><span>Perte hebdomadaire estimée</span><strong>~${weekKg} kg</strong></div>

        <div class="form-block">
          ${
            trackedDays === 0
              ? '<div class="empty-hint">Pas encore de données réelles cette semaine — logge tes repas pour voir ta progression réelle.</div>'
              : `
            <div class="list-header"><span style="font-size:12px;font-weight:600">Progression réelle</span><span class="empty-hint" style="padding:0">${DAY_NAMES[isoToday]} — J${isoToday}/7</span></div>
            <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
            <div class="week-totals-row"><span style="color:var(--medium)">~${fmt(realDeficit)} kcal nets réels</span><span>${pct}% de l'objectif</span></div>
            <div class="empty-hint" style="padding:0">${trackedDays}/${isoToday} jour${isoToday > 1 ? 's' : ''} avec données complètes ${daysLeft > 0 ? `· ${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}` : '· fin de semaine ✓'}</div>
          `
          }
        </div>

        <div class="form-block">
          ${
            fidelity.tracked === 0
              ? '<div class="empty-hint">🎯 Fidélité au programme — pas encore de jour trackable.</div>'
              : `
            <div class="list-header"><span style="font-size:12px;font-weight:600">🎯 Fidélité au programme (7 derniers jours)</span><span style="font-weight:700;color:${fidColor}">${fidelity.fidelityPct}%</span></div>
            <div class="empty-hint" style="padding:0">${fidelity.onTarget}/${fidelity.tracked} jour${fidelity.tracked > 1 ? 's' : ''} dans la cible (±15%) · écart moyen ${fidelity.avgDevPct}%</div>
          `
          }
        </div>
      </div>`;
  }

  function weightChartSvg(entries: DayEntry[]): string {
    // Weekly weight points from carb_history isn't populated yet in early usage — fall
    // back to the last ~14 day_history entries so the chart has something to show sooner.
    const points = entries.filter((e) => e.weight_kg != null).slice(0, 14).reverse();
    if (points.length < 2) return '';
    const W = 300;
    const H = 90;
    const P = { t: 8, b: 20, l: 32, r: 12 };
    const gw = W - P.l - P.r;
    const gh = H - P.t - P.b;
    const weights = points.map((e) => e.weight_kg!);
    const wMin = Math.min(...weights);
    const wMax = Math.max(...weights);
    const wRange = wMax - wMin || 2;
    const px = (i: number) => P.l + (i / Math.max(1, points.length - 1)) * gw;
    const py = (w: number) => P.t + ((wMax - w) / wRange) * gh;
    const pts = points.map((e, i) => `${px(i).toFixed(1)},${py(e.weight_kg!).toFixed(1)}`).join(' ');
    const goal = profile.weight_goal_kg;
    const goalInRange = goal && goal >= wMin - 2 && goal <= wMax + 2;
    const goalLine = goalInRange
      ? `<line x1="${P.l}" y1="${py(goal).toFixed(1)}" x2="${W - P.r}" y2="${py(goal).toFixed(1)}" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="4,3" opacity="0.6"/>`
      : '';
    return `
      <div class="form-block">
        <div class="empty-hint" style="padding-bottom:6px">Courbe de poids (derniers jours trackés)</div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible">
          ${goalLine}
          <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${points.map((e, i) => `<circle cx="${px(i).toFixed(1)}" cy="${py(e.weight_kg!).toFixed(1)}" r="2.5" fill="var(--accent)"/>`).join('')}
        </svg>
      </div>`;
  }

  async function render() {
    container.innerHTML = `
      <h1 style="margin-bottom:10px">Semaine</h1>
      ${await semainierHtml()}
      ${weightGoalHtml()}
      ${await weekSummaryHtml()}
      <div class="card">${weightChartSvg(await repos.dayHistory.loadHistory())}</div>
    `;
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
