// SPDX-License-Identifier: GPL-3.0-or-later
// Same principle as mistralCarbAdvice.ts (direct api.mistral.ai call, health-sourcing
// guardrails, hedges on incomplete data) but scoped to a trend over a date range instead of a
// single day — ConseilsScreen's period bilan section only ever sends already-computed stats
// (calcPeriodStats), never asks the model to recompute or invent a figure.
import type { DayType } from '../core/types';
import type { PeriodCompleteness } from '../core/calc/periodBilan';
import { callMistralChat, extractJsonModeContent, requireMistralApiKey, recordMistralUsage } from './mistralClient';

export interface PeriodBilanStats {
  total_days: number;
  tracked_days: number;
  real_deficit_kcal: number;
  avg_food_kcal: number | null;
  avg_protein_g: number | null;
  avg_fat_g: number | null;
  avg_carb_g: number | null;
  weight_start_kg: number | null;
  weight_end_kg: number | null;
  weight_delta_kg: number | null;
  day_type_counts: Record<DayType, number>;
}

export interface PeriodBilanRequest {
  start_date: string;
  end_date: string;
  profile: {
    sex: 'male' | 'female';
    age: number;
    height_cm: number;
    weight_goal_kg: number;
  };
  stats: PeriodBilanStats;
  data_completeness: PeriodCompleteness;
}

export interface PeriodBilanResult {
  bilan: string;
  sources: string[];
}

const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `Tu es un assistant nutrition qui fait un bilan de tendance sur une période (semaine, mois ou plage personnalisée), fondé EXCLUSIVEMENT sur les recommandations d'organismes de santé publique reconnus scientifiquement :
- France : ANSES (Agence nationale de sécurité sanitaire de l'alimentation, de l'environnement et du travail), HAS (Haute Autorité de Santé), Santé publique France / PNNS
- Europe : EFSA (European Food Safety Authority)
- Mondial : OMS / WHO (Organisation mondiale de la Santé)

RÈGLES STRICTES, à respecter sans exception :
1. Ne cite JAMAIS un organisme ou une recommandation dont tu n'es pas sûr — en cas de doute sur l'attribution exacte, formule le conseil comme un principe nutritionnel général bien établi, sans l'attribuer à un organisme précis, plutôt que d'inventer ou d'approximer une référence.
2. N'invente aucun chiffre précis, aucune étude, aucun nom de rapport. N'utilise que des ordres de grandeur et principes larges et consensuels.
3. Ne donne aucun conseil médical individualisé (pas de diagnostic, pas de recommandation qui se substituerait à un avis médical) — reste sur des principes nutritionnels généraux applicables à un adulte en bonne santé.
4. Réponds en français, tutoiement, ton direct et concis (4 à 8 phrases maximum). Pas de préambule ni de disclaimer générique.
5. Les données fournies couvrent une période complète (pas un seul jour) : commente la tendance — cohérence entre le déficit calorique réel cumulé et l'évolution de poids observée, régularité (répartition HIGH/MEDIUM/LOW/PLAISIR vs un programme équilibré), et l'équilibre moyen des macros — plutôt qu'un seul jour isolé.
6. Termine par la liste des organismes dont tu t'es réellement inspiré pour CETTE réponse précise (pas une liste générique donnée par défaut) dans le champ "sources" — liste vide si le conseil ne repose que sur des principes généraux non attribuables à un organisme précis.
7. Le champ "data_completeness" indique la proportion de jours réellement suivis sur la période (tracked_days sur total_days). Si complete=false, commence ta réponse en signalant explicitement et brièvement cette limite avant de commenter la tendance — les moyennes et le déficit cumulé peuvent être sous-représentatifs de la période réelle, ne les présente jamais comme couvrant toute la période.

Réponds UNIQUEMENT en JSON strict, sans aucun texte hors JSON, au format exact :
{"bilan": "...", "sources": ["..."]}`;

function buildUserPrompt(payload: PeriodBilanRequest): string {
  return `Voici les statistiques de la période à analyser (déjà calculées côté application, ne recalcule aucun total ni aucune moyenne toi-même) :\n${JSON.stringify(payload, null, 2)}\n\nDonne un bilan de tendance pour cette période précise (du ${payload.start_date} au ${payload.end_date}).`;
}

export async function fetchPeriodBilan(payload: PeriodBilanRequest): Promise<PeriodBilanResult> {
  const apiKey = await requireMistralApiKey();
  const data = await callMistralChat(
    {
      model: 'mistral-large-latest',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(payload) },
      ],
    },
    apiKey,
    TIMEOUT_MS,
  );
  void recordMistralUsage('period_bilan', data);
  const parsed = extractJsonModeContent(data);
  if (typeof parsed.bilan !== 'string' || !parsed.bilan.trim()) {
    throw new Error('Réponse IA vide — réessaie.');
  }
  return {
    bilan: parsed.bilan,
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
  };
}
