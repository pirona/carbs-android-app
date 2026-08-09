// SPDX-License-Identifier: GPL-3.0-or-later
import type { Per100 } from '../core/types';

// Public webhook, no client-side secret — the Mistral API key lives server-side in n8n's
// httpHeaderAuth credential. Same endpoint used by food-habits.html/carb-cycling.html
// (doAIInterpret/doLogAIInterpret), verified live/healthy before wiring this in (Phase 5).
const N8N_FOOD_PARSE_URL = 'https://n8n.gyozamancave.fr/webhook/food-parse';

export interface FoodParseResult {
  label: string;
  portion_g: number;
  per100: Per100;
  confidence: 'high' | 'medium' | 'low' | null;
  note: string | null;
}

export async function parseFoodText(text: string): Promise<FoodParseResult> {
  const res = await fetch(N8N_FOOD_PARSE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return {
    label: data.label || text,
    portion_g: data.portion_g || 100,
    per100: {
      kcal: data.kcal_100g || 0,
      protein_g: data.protein_100g || 0,
      fat_g: data.fat_100g || 0,
      carb_g: data.carb_100g || 0,
    },
    confidence: data.confidence || null,
    note: data.note || null,
  };
}
