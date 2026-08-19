// SPDX-License-Identifier: GPL-3.0-or-later

// Separate webhook from /food-parse (bigger image payloads = different size/abuse surface).
// Live on the n8n instance — see n8n_food_vision_workflow.json for the exact tool schema/prompt
// sent to Mistral, also quoted in README.md's "AI prompts" section.
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

const TIMEOUT_MS = 30_000;

// The photo is sent once and never written to any repo — see PhotoScanScreen, which
// discards the base64 string from memory as soon as this call resolves or fails.
export async function analyzePlatePhoto(imageBase64: string, mimeType: string): Promise<FoodVisionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(N8N_FOOD_VISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64, mime_type: mimeType }),
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
    components: Array.isArray(data.components) ? data.components : [],
    overall_note: data.overall_note || '',
  };
}
