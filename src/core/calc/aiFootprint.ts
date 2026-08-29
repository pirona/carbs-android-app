// SPDX-License-Identifier: GPL-3.0-or-later
// Converts stored token totals (AiFootprintData) into estimated environmental impact,
// recomputed fresh every time this is called — never cached — so the figures shown in
// Settings always reflect the best-known conversion factor applied to today's cumulative
// totals, not a frozen historical estimate.
//
// Source: Mistral AI, ADEME, Carbone 4 — étude d'impact environnemental de Mistral Large 2,
// juillet 2025 (relue par des experts tiers). Chiffre publié : une réponse de 400 tokens
// ≈ 1,14 gCO2e et 45 mL d'eau. Facteurs par token dérivés ci-dessous (1.14/400, 45/400).
// Aucune donnée officielle par taille de modèle n'existe — l'étude indique seulement que
// l'impact est "globalement proportionnel à la taille du modèle" — donc ce même facteur est
// appliqué uniformément à tout appel IA de l'app quel que soit le modèle/prestataire
// réellement configuré (voir aiClient.ts/aiProviderRepo.ts) ; voir le disclaimer affiché à
// l'écran (SettingsScreen.ts).
export const GCO2E_PER_TOKEN = 0.00285;
export const ML_WATER_PER_TOKEN = 0.1125;

import type { AiFeatureId, AiFootprintData } from '../types';

export interface AiFootprintFeatureResult {
  feature: AiFeatureId;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
  gCO2e: number;
  mlWater: number;
}

export interface AiFootprintResult {
  since: string | null;
  perFeature: AiFootprintFeatureResult[];
  totalTokens: number;
  totalCallCount: number;
  totalGCO2e: number;
  totalMlWater: number;
}

const FEATURE_ORDER: AiFeatureId[] = ['food_parse', 'food_vision', 'carb_advice', 'period_bilan', 'receipt_scan'];

export function calcAiFootprint(data: AiFootprintData): AiFootprintResult {
  const perFeature = FEATURE_ORDER.map((feature) => {
    const usage = data.perFeature[feature] || { promptTokens: 0, completionTokens: 0, callCount: 0 };
    const totalTokens = usage.promptTokens + usage.completionTokens;
    return {
      feature,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens,
      callCount: usage.callCount,
      gCO2e: totalTokens * GCO2E_PER_TOKEN,
      mlWater: totalTokens * ML_WATER_PER_TOKEN,
    };
  });

  const totalTokens = perFeature.reduce((s, f) => s + f.totalTokens, 0);
  const totalCallCount = perFeature.reduce((s, f) => s + f.callCount, 0);

  return {
    since: data.since || null,
    perFeature,
    totalTokens,
    totalCallCount,
    totalGCO2e: totalTokens * GCO2E_PER_TOKEN,
    totalMlWater: totalTokens * ML_WATER_PER_TOKEN,
  };
}
