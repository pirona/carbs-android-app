// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from carb-cycling.html — see plan phase 1 for source line references.

export type DayType = 'high' | 'medium' | 'low' | 'plaisir';
export type PlaisirLevel = 'leger' | 'moyen' | 'lourd';

export interface Profile {
  height_cm: number;
  age: number;
  sex: 'male' | 'female';
  weight_default_kg: number;
  weight_start_kg: number;
  weight_goal_kg: number;
}

export interface Thresholds {
  high_active_kcal: number;
  medium_active_kcal: number;
  high_exercise_min: number;
  medium_exercise_min: number;
  medium_steps: number;
}

// carb-cycling.html:393-400
export const DEFAULT_THRESHOLDS: Thresholds = {
  high_active_kcal: 600,
  medium_active_kcal: 300,
  high_exercise_min: 70,
  medium_exercise_min: 35,
  medium_steps: 8000,
};

// carb-cycling.html:406-414 (0=Dim...6=Sam)
export const DEFAULT_DAY_SCHEDULE: Record<number, DayType> = {
  0: 'high',
  1: 'medium',
  2: 'medium',
  3: 'high',
  4: 'medium',
  5: 'medium',
  6: 'high',
};

// Non-text data only — label/desc text lives in src/ui/i18n/strings.ts under
// `plaisir.<level>.label`/`.desc` (screens call t() for the text, this stays icon/kcal only so
// this file has no i18n dependency).
export interface PlaisirLevelInfo {
  kcal: number;
  icon: string;
}

// carb-cycling.html:420-424
export const PLAISIR_LEVELS: Record<PlaisirLevel, PlaisirLevelInfo> = {
  leger: { kcal: 350, icon: '🍺' },
  moyen: { kcal: 650, icon: '🍺🍺' },
  lourd: { kcal: 1000, icon: '🍺🍺🍺' },
};

// carb-cycling.html:425
export const PLAISIR_CYCLE: (PlaisirLevel | null)[] = [null, 'leger', 'moyen', 'lourd'];

// A logged food entry's meal — 'collation' also covers anything eaten outside the three main
// meals (the "hors-repas" bucket the Conseils screen groups those under).
export type MealSlot = 'petit_dej' | 'dejeuner' | 'diner' | 'collation';
export const MEAL_SLOT_ORDER: MealSlot[] = ['petit_dej', 'dejeuner', 'diner', 'collation'];
// Icon only — label text lives in src/ui/i18n/strings.ts under `mealSlot.<slot>` (same split
// rationale as PLAISIR_LEVELS above).
export const MEAL_SLOT_ICON: Record<MealSlot, string> = {
  petit_dej: '☀️',
  dejeuner: '🍽️',
  diner: '🌙',
  collation: '🍎',
};

// carb-cycling.html:450-453
export const TDEE_BONUS = { high: 1400, medium: 750, low: 200 } as const;
export const FAT_G = { high: 75, medium: 80, low: 45 } as const;
export const DEFICIT = 650;
export const MIN_CARB = 130;

export interface PlaisirOverrides {
  week: number;
  year: number;
  // key = "YYYY-MM-DD"
  levels: Record<string, PlaisirLevel>;
}

// day_history / current_day shape, carb-cycling.html:713, 863-878
export interface DayEntry {
  date: string;
  dayType: DayType;
  weight_kg: number | null;
  steps: number | null;
  step_kcal: number | null;
  sport_kcal: number | null;
  active_cal: number | null;
  total_cal: number | null;
  burned_today: number | null;
  food_kcal: number | null;
  food_protein_g: number | null;
  food_fat_g: number | null;
  food_carb_g: number | null;
}

// carb_history, carb-cycling.html:662
export interface WeekEntry {
  week: number;
  year: number;
  plaisir: number;
  plaisir_kcal: number;
  weight_kg: number;
  nominal_deficit: number;
}

export interface Per100 {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
}

// food_habits, food-habits.html shape + Phase 6 (components) addition
export interface Habit {
  id: string;
  label: string;
  off_code: string | null;
  source: 'off' | 'ai' | 'manual' | 'ciqual' | null;
  portion_g: number;
  per100: Per100;
  day_type_tag: DayType | null;
  meal_slot: MealSlot | null;
  updated_at: number;
  // Phase 6 — plats composés issus du scan photo, voir plan §Phase 6/7.5
  components?: { label: string; per100: Per100; grams: number }[];
}

// food_log_today entries, carb-cycling.html:1129-1141, 1319-1323
export interface LogEntry {
  entry_id: string;
  habit_id: string | null;
  label: string;
  portion_g: number;
  per100: Per100;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  source: Habit['source'];
  updated_at: number;
  // Which meal this was eaten at — required going forward (see MealSlot) so a past day's
  // entries can be grouped by meal + hors-repas on the Conseils screen.
  meal_slot: MealSlot;
  // Phase 6 — regroupe les entrées issues d'une même photo
  photo_group_id?: string | null;
}

// AI usage/footprint tracking — cumulative counters only (no per-call log), one set per
// Mistral feature, recomputed into gCO2e/mL live at display time (see core/calc/aiFootprint.ts).
export type AiFeatureId = 'food_parse' | 'food_vision' | 'carb_advice' | 'period_bilan' | 'receipt_scan';

export interface AiFeatureUsage {
  promptTokens: number;
  completionTokens: number;
  callCount: number;
}

export interface AiFootprintData {
  since: string; // ISO date-time, set once on the first-ever recorded call, never overwritten after
  perFeature: Record<AiFeatureId, AiFeatureUsage>;
}

export interface MacroResult {
  dayType: DayType;
  kcal: number | null;
  protein_g: number;
  protein_kcal: number;
  fat_g: number | null;
  fat_kcal: number | null;
  carb_g: number | null;
  carb_kcal: number | null;
  bmr: number;
  weight_kg: number;
  tdee: { high: number; medium: number; low: number };
  targets: { high: number; medium: number; low: number };
}
