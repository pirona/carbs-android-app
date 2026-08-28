// SPDX-License-Identifier: GPL-3.0-or-later
import type { Per100 } from '../core/types';
import { callMistralChat, extractToolCallArguments, requireMistralApiKey, recordMistralUsage } from './mistralClient';

// Direct client call to api.mistral.ai — replaces the retired n8n webhook relay. Tool
// schema/prompt below is a verbatim port of the retired n8n workflow's "Mistral —
// extract_nutrition" node.
export interface FoodParseResult {
  label: string;
  portion_g: number;
  per100: Per100;
  confidence: 'high' | 'medium' | 'low' | null;
  note: string | null;
}

const TIMEOUT_MS = 20_000;

export async function parseFoodText(text: string): Promise<FoodParseResult> {
  const apiKey = await requireMistralApiKey();
  const data = await callMistralChat(
    {
      model: 'mistral-small-latest',
      tool_choice: 'any',
      tools: [
        {
          type: 'function',
          function: {
            name: 'extract_nutrition',
            description:
              "Extrait les informations nutritionnelles structurées d'une description de repas en langage naturel, en français. Si l'entrée est ambiguë, peu plausible ou incomplète, l'indiquer dans note et mettre confidence à low ou medium.",
            parameters: {
              type: 'object',
              properties: {
                label: { type: 'string', description: "Nom court et clair de l'aliment ou du repas" },
                portion_g: { type: 'number', description: 'Quantité totale estimée en grammes' },
                kcal_100g: { type: 'number' },
                protein_100g: { type: 'number' },
                fat_100g: { type: 'number' },
                carb_100g: { type: 'number' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                note: { type: 'string', description: 'Remarque courte si estimation incertaine ou entrée ambiguë, sinon chaîne vide' },
              },
              required: ['label', 'portion_g', 'kcal_100g', 'protein_100g', 'fat_100g', 'carb_100g', 'confidence'],
            },
          },
        },
      ],
      messages: [{ role: 'user', content: text }],
    },
    apiKey,
    TIMEOUT_MS,
  );
  void recordMistralUsage('food_parse', data);
  const result = extractToolCallArguments(data);
  return {
    label: result.label || text,
    portion_g: result.portion_g || 100,
    per100: {
      kcal: result.kcal_100g || 0,
      protein_g: result.protein_100g || 0,
      fat_g: result.fat_100g || 0,
      carb_g: result.carb_100g || 0,
    },
    confidence: result.confidence || null,
    note: result.note || null,
  };
}
