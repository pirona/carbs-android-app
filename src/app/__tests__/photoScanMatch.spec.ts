// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { componentToRow, habitToRows, tryRecognizeHabit } from '../photoScanMatch';
import type { Habit } from '../../core/types';
import type { PlateComponent } from '../../integrations/n8nFoodVision';

function component(overrides: Partial<PlateComponent> & { label: string }): PlateComponent {
  return {
    estimated_grams: 100,
    kcal_100g: 150,
    protein_100g: 5,
    fat_100g: 5,
    carb_100g: 20,
    confidence: 'medium',
    ...overrides,
  };
}

function compositeHabit(id: string, label: string, componentLabels: string[]): Habit {
  return {
    id,
    label,
    off_code: null,
    source: 'ai',
    portion_g: 300,
    per100: { kcal: 150, protein_g: 5, fat_g: 5, carb_g: 20 },
    day_type_tag: null,
    meal_slot: null,
    updated_at: Date.now(),
    components: componentLabels.map((l) => ({ label: l, per100: { kcal: 150, protein_g: 5, fat_g: 5, carb_g: 20 }, grams: 100 })),
  };
}

describe('componentToRow', () => {
  it('auto-matches CIQUAL when a plausible entry exists, using the CIQUAL label/macros', async () => {
    const row = await componentToRow(component({ label: 'riz', estimated_grams: 150 }));
    expect(row.source).toBe('ciqual');
    expect(row.portion_g).toBe(150);
    expect(row.per100.kcal).toBeGreaterThan(0);
  });

  it('falls back to the raw AI estimate when no CIQUAL match is found', async () => {
    const row = await componentToRow(
      component({ label: 'xyzzy nonexistent gibberish 12345', kcal_100g: 222, protein_100g: 3, fat_100g: 4, carb_100g: 5 }),
    );
    expect(row.source).toBe('ai');
    expect(row.per100).toEqual({ kcal: 222, protein_g: 3, fat_g: 4, carb_g: 5 });
  });
});

describe('tryRecognizeHabit', () => {
  it('recognizes a saved composite habit when a majority of labels match', () => {
    const habits = [compositeHabit('h1', 'Poke bowl maison', ['riz', 'saumon', 'avocat'])];
    const detected = [component({ label: 'riz' }), component({ label: 'saumon' }), component({ label: 'edamame' })];
    const result = tryRecognizeHabit(detected, habits);
    expect(result?.id).toBe('h1');
  });

  it('returns null when fewer than half the labels match', () => {
    const habits = [compositeHabit('h1', 'Poke bowl maison', ['riz', 'saumon', 'avocat'])];
    const detected = [component({ label: 'pizza' }), component({ label: 'frites' }), component({ label: 'salade' })];
    expect(tryRecognizeHabit(detected, habits)).toBeNull();
  });

  it('returns null when there are no saved composite habits', () => {
    expect(tryRecognizeHabit([component({ label: 'riz' })], [])).toBeNull();
  });

  it('picks the habit with the most matches when several are plausible', () => {
    const habits = [
      compositeHabit('h1', 'Plat A', ['riz', 'poulet']),
      compositeHabit('h2', 'Plat B', ['riz', 'poulet', 'brocoli']),
    ];
    const detected = [component({ label: 'riz' }), component({ label: 'poulet' }), component({ label: 'brocoli' })];
    const result = tryRecognizeHabit(detected, habits);
    expect(result?.id).toBe('h2');
  });
});

describe('habitToRows', () => {
  it('converts a habit\'s saved components into rows tagged as "habit"', () => {
    const habit = compositeHabit('h1', 'Poke bowl maison', ['riz', 'saumon']);
    const rows = habitToRows(habit);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === 'habit')).toBe(true);
    expect(rows[0].portion_g).toBe(100);
  });

  it('returns an empty array for a habit with no components', () => {
    const habit: Habit = {
      id: 'h2',
      label: 'Simple',
      off_code: null,
      source: 'manual',
      portion_g: 100,
      per100: { kcal: 100, protein_g: 1, fat_g: 1, carb_g: 1 },
      day_type_tag: null,
      meal_slot: null,
      updated_at: Date.now(),
    };
    expect(habitToRows(habit)).toEqual([]);
  });
});
