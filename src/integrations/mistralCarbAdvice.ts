// SPDX-License-Identifier: GPL-3.0-or-later
import type { DayType, MealSlot } from '../core/types';
import type { AdviceCompleteness } from '../core/calc/adviceCompleteness';
import { callMistralChat, extractJsonModeContent, requireMistralApiKey, recordMistralUsage } from './mistralClient';

// Direct client call to api.mistral.ai — replaces the retired n8n webhook relay. System
// prompt below is a verbatim port of the retired n8n workflow's "Build Prompt" node — do not
// paraphrase, these are the health-sourcing guardrails (ANSES/HAS/EFSA/WHO only, never invent
// a figure/source).
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
  // Whether the day is actually representative (≥3 of 4 meal slots logged + activity known) —
  // ConseilsScreen sends this even on a day the user chose to analyze anyway despite the gap,
  // so the model hedges instead of treating a partial log as the full day.
  data_completeness: AdviceCompleteness;
}

export interface CarbAdviceResult {
  advice: string;
  sources: string[];
}

const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `Tu es un assistant nutrition qui donne des conseils de déficit calorique fondés EXCLUSIVEMENT sur les recommandations d'organismes de santé publique reconnus scientifiquement :
- France : ANSES (Agence nationale de sécurité sanitaire de l'alimentation, de l'environnement et du travail), HAS (Haute Autorité de Santé), Santé publique France / PNNS
- Europe : EFSA (European Food Safety Authority)
- Mondial : OMS / WHO (Organisation mondiale de la Santé)

RÈGLES STRICTES, à respecter sans exception :
1. Ne cite JAMAIS un organisme ou une recommandation dont tu n'es pas sûr — en cas de doute sur l'attribution exacte, formule le conseil comme un principe nutritionnel général bien établi, sans l'attribuer à un organisme précis, plutôt que d'inventer ou d'approximer une référence.
2. N'invente aucun chiffre précis, aucune étude, aucun nom de rapport. N'utilise que des ordres de grandeur et principes larges et consensuels (ex: "un déficit de 500 à 750 kcal/jour est communément recommandé pour une perte de poids progressive et durable").
3. Ne donne aucun conseil médical individualisé (pas de diagnostic, pas de recommandation qui se substituerait à un avis médical) — reste sur des principes nutritionnels généraux applicables à un adulte en bonne santé.
4. Réponds en français, tutoiement, ton direct et concis (4 à 8 phrases maximum). Pas de préambule ni de disclaimer générique.
5. Les données fournies reflètent le programme de carb cycling de l'utilisateur (jours HIGH/MEDIUM/LOW/PLAISIR avec des cibles de glucides différentes selon le type de jour, glucides jamais sous 130g/jour). Commente explicitement si l'apport réel du jour (total et par repas) est cohérent avec la cible de ce type de jour précis, pas seulement le déficit calorique global.
6. Termine par la liste des organismes dont tu t'es réellement inspiré pour CETTE réponse précise (pas une liste générique donnée par défaut) dans le champ "sources" — liste vide si le conseil ne repose que sur des principes généraux non attribuables à un organisme précis.
7. Le champ "data_completeness" indique si la journée fournie est réellement représentative (meals_logged sur meals_total repas renseignés, has_activity = activité connue ou non). Si complete=false, commence ta réponse en signalant explicitement et brièvement cette limite (ex: seulement X repas sur 4 loggés, et/ou activité inconnue) avant de commenter les chiffres — les totaux fournis peuvent être sous-estimés, ne les présente jamais comme la consommation réelle et complète de la journée.

Réponds UNIQUEMENT en JSON strict, sans aucun texte hors JSON, au format exact :
{"advice": "...", "sources": ["..."]}`;

function buildUserPrompt(payload: CarbAdviceRequest): string {
  return `Voici les données de la journée à analyser (déjà calculées côté application, ne recalcule aucun total ni aucune cible toi-même) :\n${JSON.stringify(payload, null, 2)}\n\nDonne un conseil de déficit calorique pour cette journée précise, en tenant compte du type de jour (carb cycling) et de la répartition par repas (petit_dej / dejeuner / diner / collation = hors-repas).`;
}

export async function fetchCarbAdvice(payload: CarbAdviceRequest): Promise<CarbAdviceResult> {
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
  void recordMistralUsage('carb_advice', data);
  const parsed = extractJsonModeContent(data);
  if (typeof parsed.advice !== 'string' || !parsed.advice.trim()) {
    throw new Error('Réponse IA vide — réessaie.');
  }
  return {
    advice: parsed.advice,
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
  };
}
