// SPDX-License-Identifier: GPL-3.0-or-later
// Whether a past day carries enough data for the Conseils screen to treat it as representative
// before asking Mistral for a deficit conseil — findAdviceDay() only guarantees weight/activity-
// kcal/food-kcal are non-null and at least one food entry exists, which lets a day with a single
// logged coffee through. This adds the "did the user actually log a normal day" check on top.
import type { DayEntry, LogEntry } from '../types';
import { MEAL_SLOT_ORDER } from '../types';
import { groupByMeal } from './mealGroup';

export interface AdviceCompleteness {
  meals_logged: number;
  meals_total: number;
  has_activity: boolean;
  complete: boolean;
}

const MIN_MEALS_LOGGED = 3;

export function assessCompleteness(day: DayEntry, entries: LogEntry[]): AdviceCompleteness {
  const groups = groupByMeal(entries);
  const meals_logged = MEAL_SLOT_ORDER.filter((slot) => groups[slot].length > 0).length;
  const has_activity = day.steps != null;
  return {
    meals_logged,
    meals_total: MEAL_SLOT_ORDER.length,
    has_activity,
    complete: meals_logged >= MIN_MEALS_LOGGED && has_activity,
  };
}
