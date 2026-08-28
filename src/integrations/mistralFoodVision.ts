// SPDX-License-Identifier: GPL-3.0-or-later
import { callMistralChat, extractToolCallArguments, requireMistralApiKey, recordMistralUsage } from './mistralClient';

// Direct client call to api.mistral.ai — replaces the retired n8n webhook relay. Tool
// schema/prompt below is a verbatim port of n8n_food_vision_workflow.json's "Mistral —
// extract_plate" node (kept in the repo as historical reference, workflow disabled).
export interface PlateComponent {
  label: string;
  estimated_grams: number;
  // Mistral's own rough estimate, from general food knowledge — used only as the last
  // resort in the OFF -> CIQUAL -> raw-AI cascade (see PhotoScanScreen).
  kcal_100g: number;
  protein_100g: number;
  fat_100g: number;
  carb_100g: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface FoodVisionResult {
  components: PlateComponent[];
  overall_note: string;
}

const TIMEOUT_MS = 30_000;

// The photo is sent once and never written to any repo — see PhotoScanScreen, which
// discards the base64 string from memory as soon as this call resolves or fails.
export async function analyzePlatePhoto(imageBase64: string, mimeType: string): Promise<FoodVisionResult> {
  const apiKey = await requireMistralApiKey();
  const data = await callMistralChat(
    {
      model: 'mistral-small-latest',
      tool_choice: 'any',
      tools: [
        {
          type: 'function',
          function: {
            name: 'extract_plate',
            description:
              "Identifie les composants alimentaires visibles sur une photo d'assiette, en français, avec une estimation grossière de la portion de chacun en grammes et de leurs valeurs nutritionnelles pour 100g (à partir de la connaissance générale de l'aliment, pas d'une mesure précise). Si la photo est ambiguë, floue, ou ne montre pas de nourriture identifiable, le préciser dans overall_note.",
            parameters: {
              type: 'object',
              properties: {
                components: {
                  type: 'array',
                  description: 'Liste des composants alimentaires identifiés sur la photo',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', description: 'Nom court et clair du composant (ex: riz basmati, poulet grillé)' },
                      estimated_grams: { type: 'number', description: 'Portion estimée en grammes' },
                      kcal_100g: { type: 'number', description: 'Estimation kcal pour 100g de ce composant' },
                      protein_100g: { type: 'number' },
                      fat_100g: { type: 'number' },
                      carb_100g: { type: 'number' },
                      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                    },
                    required: ['label', 'estimated_grams', 'kcal_100g', 'protein_100g', 'fat_100g', 'carb_100g', 'confidence'],
                  },
                },
                overall_note: {
                  type: 'string',
                  description: "Remarque générale courte si l'image est ambiguë, incomplète, ou si l'estimation est incertaine, sinon chaîne vide",
                },
              },
              required: ['components', 'overall_note'],
            },
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: "Identifie les aliments visibles sur cette photo d'assiette et estime leur portion en grammes." },
            { type: 'image_url', image_url: `data:${mimeType};base64,${imageBase64}` },
          ],
        },
      ],
    },
    apiKey,
    TIMEOUT_MS,
  );
  void recordMistralUsage('food_vision', data);
  const result = extractToolCallArguments(data);
  return {
    components: Array.isArray(result.components) ? result.components : [],
    overall_note: result.overall_note || '',
  };
}
