// SPDX-License-Identifier: GPL-3.0-or-later
// Everyday-life comparisons for the AI footprint card (aiFootprint.ts/aiFootprintRetro.ts) —
// pure unit conversion against real, sourced reference values, same discipline as the rest of
// this app's AI-footprint methodology (never an invented "typical" figure). Applied to the
// GRAND total (live-tracked + retroactive estimate combined) so the comparison reflects the
// app's whole known AI footprint, not just one half of it.
//
// Sources, each an official/institutional reference:
// - EMAIL_GCO2E: ADEME Base Empreinte, via impactco2.fr (email sans pièce jointe) —
//   https://impactco2.fr/outils/usagenumerique/email
// - HUMAN_DAILY_WATER_ML: EFSA Scientific Opinion on Dietary Reference Values for water (2010) —
//   Adequate Intake 2.0 L/day (women) to 2.5 L/day (men), moderate climate/activity; midpoint
//   used for the ratio below. https://www.efsa.europa.eu/en/efsajournal/pub/1459
// - COW_DAILY_WATER_ML: INRAE Productions Animales — besoins en eau d'abreuvement des bovins
//   laitiers, 50 à 100 L/jour hors forte chaleur; midpoint used for the ratio below.
//   https://productions-animales.org/article/view/3153
export const EMAIL_GCO2E = 0.11;
export const HUMAN_DAILY_WATER_ML = 2250;
export const COW_DAILY_WATER_ML = 75_000;

export interface AiFootprintEquivalences {
  emailsEquivalent: number;
  humanDaysWater: number;
  cowDailyWaterPercent: number;
}

export function computeAiFootprintEquivalences(totalGCO2e: number, totalMlWater: number): AiFootprintEquivalences {
  return {
    emailsEquivalent: totalGCO2e / EMAIL_GCO2E,
    humanDaysWater: totalMlWater / HUMAN_DAILY_WATER_ML,
    cowDailyWaterPercent: (totalMlWater / COW_DAILY_WATER_ML) * 100,
  };
}
