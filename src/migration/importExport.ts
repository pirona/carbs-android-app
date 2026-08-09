// SPDX-License-Identifier: GPL-3.0-or-later
// Orchestrates the Import screen: parses an export.html blob, merges it against the
// app's current storage (see importMerge.ts for the merge policy), and either previews
// the result (apply:false) or commits it (apply:true) — same code path for both so the
// preview can never lie about what a commit would actually do.
import type { DayEntry, Habit, LogEntry, WeekEntry } from '../core/types';
import { DayHistoryRepo } from '../storage/repos/dayHistoryRepo';
import { CarbHistoryRepo } from '../storage/repos/carbHistoryRepo';
import { PlaisirRepo } from '../storage/repos/plaisirRepo';
import { SportRepo } from '../storage/repos/sportRepo';
import { HabitsRepo, type HabitSortMode } from '../storage/repos/habitsRepo';
import { FoodLogRepo, type FoodLog } from '../storage/repos/foodLogRepo';
import { formatDateKey } from '../core/calc/date';
import { mergeByKey, mergeByUpdatedAt, mergeRecord } from './importMerge';
import type { PlaisirOverrides } from '../core/types';

export interface ImportRepos {
  dayHistory: DayHistoryRepo;
  carbHistory: CarbHistoryRepo;
  plaisir: PlaisirRepo;
  sport: SportRepo;
  habits: HabitsRepo;
  foodLog: FoodLogRepo;
}

export interface ImportKeyResult {
  key: string;
  recognized: boolean;
  note: string;
}

export interface ImportOutcome {
  ok: true;
  perKey: ImportKeyResult[];
}

export interface ImportError {
  ok: false;
  error: string;
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

type Raw = Record<string, unknown>;

export async function runImport(
  repos: ImportRepos,
  raw: string,
  apply: boolean,
  now: Date = new Date(),
): Promise<ImportOutcome | ImportError> {
  let parsed: Raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "JSON invalide — vérifie que le blob a été copié en entier." };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Format inattendu : ce n\'est pas un objet JSON.' };
  }

  const perKey: ImportKeyResult[] = [];

  // day_history — union by date, existing wins, kept sorted newest-first for the cap.
  if (isArray(parsed.day_history)) {
    const existing = await repos.dayHistory.loadHistory();
    const incoming = parsed.day_history as DayEntry[];
    const { merged, added, skipped } = mergeByKey(existing, incoming, (e) => e.date);
    merged.sort((a, b) => (a.date < b.date ? 1 : -1));
    if (apply) await repos.dayHistory.saveHistory(merged);
    perKey.push({ key: 'day_history', recognized: true, note: `${added} nouvelle(s), ${skipped} déjà connue(s)` });
  } else {
    perKey.push({ key: 'day_history', recognized: false, note: 'absent ou format inattendu' });
  }

  // current_day — only adopted if nothing is currently live.
  if (parsed.current_day && typeof parsed.current_day === 'object') {
    const existing = await repos.dayHistory.loadCurrentDay();
    if (!existing) {
      if (apply) await repos.dayHistory.saveCurrentDay(parsed.current_day as DayEntry);
      perKey.push({ key: 'current_day', recognized: true, note: 'adopté (aucune journée en cours)' });
    } else {
      perKey.push({ key: 'current_day', recognized: true, note: 'ignoré — une journée en cours existe déjà' });
    }
  } else {
    perKey.push({ key: 'current_day', recognized: false, note: 'absent' });
  }

  // carb_history — union by (year, week), existing wins, sorted newest-first.
  if (isArray(parsed.carb_history)) {
    const existing = await repos.carbHistory.load();
    const incoming = parsed.carb_history as WeekEntry[];
    const { merged, added, skipped } = mergeByKey(existing, incoming, (e) => `${e.year}-${e.week}`);
    merged.sort((a, b) => (a.year !== b.year ? b.year - a.year : b.week - a.week));
    if (apply) await repos.carbHistory.save(merged);
    perKey.push({ key: 'carb_history', recognized: true, note: `${added} nouvelle(s), ${skipped} déjà connue(s)` });
  } else {
    perKey.push({ key: 'carb_history', recognized: false, note: 'absent ou format inattendu' });
  }

  // sport_kcal — ephemeral daily value, deliberately not migrated.
  perKey.push({ key: 'sport_kcal', recognized: 'sport_kcal' in parsed, note: 'non importé — valeur journalière éphémère' });

  // sport_plan — union of {date: kcal}, existing wins.
  if (parsed.sport_plan && typeof parsed.sport_plan === 'object' && !isArray(parsed.sport_plan)) {
    const existing = await repos.sport.loadSportPlan();
    const { merged, added, skipped } = mergeRecord(existing, parsed.sport_plan as Record<string, number>);
    if (apply) await repos.sport.saveSportPlan(merged, now);
    perKey.push({ key: 'sport_plan', recognized: true, note: `${added} jour(s) ajouté(s), ${skipped} déjà connu(s)` });
  } else {
    perKey.push({ key: 'sport_plan', recognized: false, note: 'absent ou format inattendu' });
  }

  // plaisir_overrides — only adopted if it's for the current ISO week and nothing is set yet.
  if (parsed.plaisir_overrides && typeof parsed.plaisir_overrides === 'object') {
    const incoming = parsed.plaisir_overrides as PlaisirOverrides;
    const existing = await repos.plaisir.loadOverrides(now);
    const isCurrentWeek = incoming.week === existing.week && incoming.year === existing.year;
    const isEmpty = Object.keys(existing.levels || {}).length === 0;
    if (isCurrentWeek && isEmpty && Object.keys(incoming.levels || {}).length > 0) {
      if (apply) await repos.plaisir.saveOverrides(incoming, now);
      perKey.push({ key: 'plaisir_overrides', recognized: true, note: 'adopté (semaine en cours, rien de saisi encore)' });
    } else {
      perKey.push({ key: 'plaisir_overrides', recognized: true, note: "ignoré — semaine différente ou déjà saisi" });
    }
  } else {
    perKey.push({ key: 'plaisir_overrides', recognized: false, note: 'absent ou format inattendu' });
  }

  // plaisir_week — derived automatically from plaisir_overrides (PlaisirRepo.saveOverrides
  // keeps it in sync), never written directly here to avoid two sources of truth.
  perKey.push({ key: 'plaisir_week', recognized: 'plaisir_week' in parsed, note: 'dérivé automatiquement de plaisir_overrides, pas importé séparément' });

  // food_habits — most-recent updated_at wins, same rule as the old n8n sync.
  if (isArray(parsed.food_habits)) {
    const existing = await repos.habits.load();
    const incoming = parsed.food_habits as Habit[];
    const { merged, added, skipped } = mergeByUpdatedAt(existing, incoming, (h) => h.id);
    if (apply) await repos.habits.save(merged);
    perKey.push({ key: 'food_habits', recognized: true, note: `${added} ajoutée(s)/mise(s) à jour, ${skipped} déjà à jour` });
  } else {
    perKey.push({ key: 'food_habits', recognized: false, note: 'absent ou format inattendu' });
  }

  // food_log_today — only meaningful if the imported log is actually for today.
  if (parsed.food_log_today && typeof parsed.food_log_today === 'object') {
    const incoming = parsed.food_log_today as FoodLog;
    const todayKey = formatDateKey(now);
    if (incoming.date === todayKey && isArray(incoming.entries)) {
      const existing = await repos.foodLog.loadToday(now);
      const { merged, added, skipped } = mergeByUpdatedAt(existing.entries, incoming.entries as LogEntry[], (e) => e.entry_id);
      if (apply) await repos.foodLog.saveToday({ date: todayKey, entries: merged });
      perKey.push({ key: 'food_log_today', recognized: true, note: `${added} ajoutée(s), ${skipped} déjà connue(s)` });
    } else {
      perKey.push({ key: 'food_log_today', recognized: true, note: "ignoré — journal d'un autre jour" });
    }
  } else {
    perKey.push({ key: 'food_log_today', recognized: false, note: 'absent ou format inattendu' });
  }

  // food_habits_sort_mode — a UI preference, low-stakes, always adopted when present.
  if (parsed.food_habits_sort_mode === 'alpha' || parsed.food_habits_sort_mode === 'recent') {
    if (apply) await repos.habits.saveSortMode(parsed.food_habits_sort_mode as HabitSortMode);
    perKey.push({ key: 'food_habits_sort_mode', recognized: true, note: 'adopté' });
  } else {
    perKey.push({ key: 'food_habits_sort_mode', recognized: false, note: 'absent' });
  }

  return { ok: true, perKey };
}
