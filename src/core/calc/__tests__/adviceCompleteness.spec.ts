// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { assessCompleteness } from '../adviceCompleteness';
import type { DayEntry, LogEntry, MealSlot } from '../../types';

const DAY: DayEntry = {
  date: '2026-08-20',
  dayType: 'medium',
  weight_kg: 78,
  steps: 8000,
  step_kcal: 300,
  sport_kcal: 0,
  active_cal: null,
  total_cal: null,
  burned_today: 300,
  food_kcal: 1800,
  food_protein_g: 100,
  food_fat_g: 60,
  food_carb_g: 180,
};

function entry(slot: MealSlot): LogEntry {
  return {
    entry_id: `e-${slot}-${Math.random()}`,
    habit_id: null,
    label: 'Test',
    portion_g: 100,
    per100: { kcal: 100, protein_g: 5, fat_g: 5, carb_g: 10 },
    kcal: 100,
    protein_g: 5,
    fat_g: 5,
    carb_g: 10,
    source: 'manual',
    updated_at: Date.now(),
    meal_slot: slot,
  };
}

describe('assessCompleteness', () => {
  it('is complete with 3+ distinct meals logged and known activity', () => {
    const entries = [entry('petit_dej'), entry('dejeuner'), entry('diner')];
    const result = assessCompleteness(DAY, entries);
    expect(result).toEqual({ meals_logged: 3, meals_total: 4, has_activity: true, complete: true });
  });

  it('is incomplete when only 1-2 meals are logged, even with several entries', () => {
    const entries = [entry('collation'), entry('collation'), entry('petit_dej')];
    const result = assessCompleteness(DAY, entries);
    expect(result.meals_logged).toBe(2);
    expect(result.complete).toBe(false);
  });

  it('is incomplete when activity (steps) is unknown, even with all 4 meals logged', () => {
    const day: DayEntry = { ...DAY, steps: null };
    const entries = MEAL_SLOTS.map((s) => entry(s));
    const result = assessCompleteness(day, entries);
    expect(result.has_activity).toBe(false);
    expect(result.complete).toBe(false);
  });

  it('is complete at exactly the 3-meal threshold', () => {
    const entries = [entry('petit_dej'), entry('diner'), entry('collation')];
    expect(assessCompleteness(DAY, entries).complete).toBe(true);
  });
});

const MEAL_SLOTS: MealSlot[] = ['petit_dej', 'dejeuner', 'diner', 'collation'];
