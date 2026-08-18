// SPDX-License-Identifier: GPL-3.0-or-later
import type { DayType, MealSlot } from '../core/types';

// New webhook, not yet live on the n8n instance — see n8n_carb_advice_workflow.json
// (ready to import) and its accompanying note for the exact system prompt shipped with it.
// No n8n API access from Claude Code on this project (same constraint as food-vision).
const N8N_CARB_ADVICE_URL = 'https://n8n.gyozamancave.fr/webhook/carb-advice';

export interface CarbAdviceMealItem {
  label: string;
  portion_g: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
}

export interface CarbAdviceMacros {
  kcal: number | null;
  protein_g: number;
  fat_g: number | null;
  carb_g: number | null;
}

export interface CarbAdviceRequest {
  date: string;
  day_type: DayType;
  profile: {
    sex: 'male' | 'female';
    age: number;
    height_cm: number;
    weight_kg: number;
    weight_goal_kg: number;
  };
  bmr_kcal: number;
  burned_kcal: number | null;
  steps: number | null;
  target: CarbAdviceMacros;
  actual: CarbAdviceMacros;
  meals: Record<MealSlot, CarbAdviceMealItem[]>;
}

export interface CarbAdviceResult {
  advice: string;
  sources: string[];
}

const TIMEOUT_MS = 30_000;

export async function fetchCarbAdvice(payload: CarbAdviceRequest): Promise<CarbAdviceResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(N8N_CARB_ADVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('délai dépassé, le serveur ne répond pas');
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return {
    advice: data.advice || '',
    sources: Array.isArray(data.sources) ? data.sources : [],
  };
}
