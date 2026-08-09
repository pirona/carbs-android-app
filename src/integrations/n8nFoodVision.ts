// SPDX-License-Identifier: GPL-3.0-or-later

// New, separate webhook from /food-parse (bigger image payloads = different size/abuse
// surface). Needs manual import of n8n_food_vision_workflow.json into the live n8n
// instance (see plan §Phase 6/7.1) — no n8n API access from Claude Code on this project.
const N8N_FOOD_VISION_URL = 'https://n8n.gyozamancave.fr/webhook/food-vision';

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

// The photo is sent once and never written to any repo — see PhotoScanScreen, which
// discards the base64 string from memory as soon as this call resolves or fails.
export async function analyzePlatePhoto(imageBase64: string, mimeType: string): Promise<FoodVisionResult> {
  const res = await fetch(N8N_FOOD_VISION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64, mime_type: mimeType }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return {
    components: Array.isArray(data.components) ? data.components : [],
    overall_note: data.overall_note || '',
  };
}
