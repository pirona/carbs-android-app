// SPDX-License-Identifier: GPL-3.0-or-later
// Read-only/low-frequency content pulled off Day and Week: weight-goal progress,
// declaring a plaisir day, weekly deficit/fidelity stats, and the weight trend chart.
// Consolidates what used to be duplicated between DayScreen and WeekScreen into one home.
import type { DayEntry, DayType, PlaisirLevel, Profile } from '../../core/types';
import { DEFAULT_DAY_SCHEDULE, PLAISIR_CYCLE, PLAISIR_LEVELS, DEFAULT_THRESHOLDS } from '../../core/types';
import type { DayHistoryRepo } from '../../storage/repos/dayHistoryRepo';
import type { CarbHistoryRepo } from '../../storage/repos/carbHistoryRepo';
import type { PlaisirRepo } from '../../storage/repos/plaisirRepo';
import type { SportRepo } from '../../storage/repos/sportRepo';
import type { ProfileRepo } from '../../storage/repos/profileRepo';
import { detectDayType } from '../../core/calc/dayType';
import { calcMacros } from '../../core/calc/macros';
import { calcWeeklyDeficit, calcWeekRealDeficit } from '../../core/calc/deficit';
import { calcProgramFidelity } from '../../core/calc/fidelity';
import { calcWeightGoalProgress } from '../../core/calc/weightGoal';
import { formatDateKey } from '../../core/calc/date';

export interface ProgressScreenRepos {
  dayHistory: DayHistoryRepo;
  // Not read yet — same "kept for when weekly archival lands" status as it had in
  // WeekScreenRepos before this screen took over the read-only/analytics content.
  carbHistory: CarbHistoryRepo;
  plaisir: PlaisirRepo;
  sport: SportRepo;
  profile: ProfileRepo;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

export function renderProgressScreen(container: HTMLElement, repos: ProgressScreenRepos): void {
  let profile: Profile;
  let weightKg = 0;
  let todayDayType: DayType = 'medium';
  let currentOverrideLevel: PlaisirLevel | null = null;

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

  function weightGoalCard(): string {
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

  function plaisirCard(): string {
    const btn = (level: PlaisirLevel) => {
      const lv = PLAISIR_LEVELS[level];
      const sel = currentOverrideLevel === level;
      return `<button class="plaisir-btn ${sel ? 'active' : ''}" data-action="plaisir" data-level="${level}">
        <div>${lv.icon}</div><div class="plaisir-btn-label">${lv.label}</div><div class="plaisir-btn-kcal">${lv.kcal} kcal</div>
      </button>`;
    };
    return `
      <div class="card">
        <div class="empty-hint" style="padding-bottom:6px">Déclarer un jour plaisir aujourd'hui :</div>
        <div class="plaisir-row">
          ${PLAISIR_CYCLE.filter((l): l is PlaisirLevel => l !== null).map(btn).join('')}
        </div>
        ${currentOverrideLevel ? '<button class="btn btn-cancel" data-action="clear-plaisir">Effacer le jour plaisir</button>' : ''}
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
      <div class="card card-quiet">
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
      <h1 style="margin-bottom:10px">📈 Progrès</h1>
      ${weightGoalCard()}
      ${plaisirCard()}
      ${await weekSummaryHtml()}
      <div class="card card-quiet">${weightChartSvg(await repos.dayHistory.loadHistory())}</div>
    `;
  }

  container.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    if (action === 'plaisir') {
      const level = target.dataset.level as PlaisirLevel;
      const today = formatDateKey(now());
      const overrides = await repos.plaisir.loadOverrides(now());
      if (overrides.levels[today] === level) {
        delete overrides.levels[today];
        currentOverrideLevel = null;
      } else {
        overrides.levels[today] = level;
        currentOverrideLevel = level;
      }
      await repos.plaisir.saveOverrides(overrides, now());
      todayDayType = await computeTodayDayType();
      render();
      return;
    }
    if (action === 'clear-plaisir') {
      const today = formatDateKey(now());
      const overrides = await repos.plaisir.loadOverrides(now());
      delete overrides.levels[today];
      currentOverrideLevel = null;
      await repos.plaisir.saveOverrides(overrides, now());
      todayDayType = await computeTodayDayType();
      render();
      return;
    }
  });

  (async () => {
    profile = await repos.profile.load();
    const overrides = await repos.plaisir.loadOverrides(now());
    currentOverrideLevel = overrides.levels[formatDateKey(now())] ?? null;
    todayDayType = await computeTodayDayType();
    render();
  })();
}
