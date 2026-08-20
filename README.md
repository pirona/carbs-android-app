# Carbs

Android app (Capacitor) for personal nutrition/carb-cycling tracking — calorie deficit,
macros, day-type detection (HIGH/MEDIUM/LOW), and photo-based food logging.

Replaces a Home Assistant/Lovelace-hosted prototype (`carb-cycling.html`, `food-habits.html`,
`menus.html` in the `carbs-home-assistant` repo). Personal-use project, not commercial software.

## License

GNU General Public License v3.0 or later — see [LICENSE](LICENSE).

Every source file should carry an SPDX header:

```ts
// SPDX-License-Identifier: GPL-3.0-or-later
```

## Development

```bash
npm install
npm run dev          # web dev server
npm run build         # web build -> dist/
npm test              # unit tests (vitest)
npx cap sync android  # sync web build + plugins into the Android project
./build-debug.sh      # web build + cap sync + debug APK (JDK/SDK auto-detected)
```

`build-debug.sh` auto-detects JDK 21 at `~/jdk21` if the system JDK is too recent for Gradle
8.x (same pattern as the SheetHappens/postiz-android build scripts on this machine).

## AI prompts

Three optional AI features call the Mistral API directly from the app — Mistral is the only AI
provider this app talks to, no other model/vendor is involved anywhere — using an API key the
user enters in Settings and stores encrypted on-device (Android Keystore) — never in plain text,
and never included in the export/backup blob (unlike the Nextcloud app password, which is
included there on an earlier explicit choice; the Mistral key must be re-entered after a
wipe/reinstall or a restore from backup). Each call receives only what the task needs — raw
text, one photo, or nutrition numbers already computed by the app — never account data or
history. In every case the AI's output is a suggestion: the user reviews and can edit it, and
nothing is ever saved automatically.

The plate-photo scan in particular is not always reliable — vision models can misidentify what's
on the photo (see `PhotoScanScreen`'s human-confirmation step, never an auto-save). Treat its
output as a rough starting point to correct, not a trustworthy reading.

The exact request sent for each feature is committed to this repo as source code, so the prompt
below is never just a description — the file is the source of truth:

- [`src/integrations/mistralFoodParse.ts`](src/integrations/mistralFoodParse.ts) —
  natural-language food entry
- [`src/integrations/mistralFoodVision.ts`](src/integrations/mistralFoodVision.ts) —
  photo-of-a-plate scan
- [`src/integrations/mistralCarbAdvice.ts`](src/integrations/mistralCarbAdvice.ts) —
  caloric-deficit advice on a fully-logged past day

These three features used to relay through webhooks on a self-hosted n8n instance instead of
calling Mistral directly. The original n8n workflow exports are kept in the repo as historical
reference — [`n8n_food_parse_workflow.json`](n8n_food_parse_workflow.json),
[`n8n_food_vision_workflow.json`](n8n_food_vision_workflow.json),
[`n8n_carb_advice_workflow.json`](n8n_carb_advice_workflow.json) — but are disabled on the n8n
instance and no longer used by the app.

### Food Parse — natural-language food entry

Model `mistral-small-latest`, tool calling (`tool_choice: "any"`), a single tool
`extract_nutrition`. There is no separate system prompt — the tool's JSON schema description
*is* the instruction, and the user's raw text is passed through unchanged as the only message:

```
Tool: extract_nutrition
"Extrait les informations nutritionnelles structurées d'une description de repas en langage
naturel, en français. Si l'entrée est ambiguë, peu plausible ou incomplète, l'indiquer dans note
et mettre confidence à low ou medium."

Parameters: label, portion_g, kcal_100g, protein_100g, fat_100g, carb_100g,
confidence ("high"|"medium"|"low"), note

Message: { role: "user", content: <the text the user typed> }
```

### Food Vision — photo-of-a-plate scan

Same pattern, model `mistral-small-latest`, tool calling, a single tool `extract_plate` whose
schema is the instruction — plus a fixed one-line instruction alongside the photo itself:

```
Tool: extract_plate
"Identifie les composants alimentaires visibles sur une photo d'assiette, en français, avec une
estimation grossière de la portion de chacun en grammes et de leurs valeurs nutritionnelles pour
100g (à partir de la connaissance générale de l'aliment, pas d'une mesure précise). Si la photo
est ambiguë, floue, ou ne montre pas de nourriture identifiable, le préciser dans overall_note."

Parameters: components[] (label, estimated_grams, kcal_100g, protein_100g, fat_100g, carb_100g,
confidence), overall_note

Message: { role: "user", content: [
  { type: "text", text: "Identifie les aliments visibles sur cette photo d'assiette et estime
    leur portion en grammes." },
  { type: "image_url", image_url: "data:<mime>;base64,<the captured photo>" }
] }
```

The photo is sent to Mistral for that one inference call and is never stored anywhere — the
base64 string is a local variable, discarded as soon as the call resolves or fails.

### Carb Advice — caloric-deficit advice

Model `mistral-large-latest`, temperature 0.3, `response_format: json_object`. Unlike the two
tool-calling flows above, this one gets a full system prompt (verbatim, from
`mistralCarbAdvice.ts` — ported unchanged from the retired n8n workflow's "Build Prompt" node):

> Tu es un assistant nutrition qui donne des conseils de déficit calorique fondés EXCLUSIVEMENT
> sur les recommandations d'organismes de santé publique reconnus scientifiquement :
> - France : ANSES (Agence nationale de sécurité sanitaire de l'alimentation, de
>   l'environnement et du travail), HAS (Haute Autorité de Santé), Santé publique France / PNNS
> - Europe : EFSA (European Food Safety Authority)
> - Mondial : OMS / WHO (Organisation mondiale de la Santé)
>
> RÈGLES STRICTES, à respecter sans exception :
> 1. Ne cite JAMAIS un organisme ou une recommandation dont tu n'es pas sûr — en cas de doute
>    sur l'attribution exacte, formule le conseil comme un principe nutritionnel général bien
>    établi, sans l'attribuer à un organisme précis, plutôt que d'inventer ou d'approximer une
>    référence.
> 2. N'invente aucun chiffre précis, aucune étude, aucun nom de rapport. N'utilise que des
>    ordres de grandeur et principes larges et consensuels (ex: "un déficit de 500 à 750
>    kcal/jour est communément recommandé pour une perte de poids progressive et durable").
> 3. Ne donne aucun conseil médical individualisé (pas de diagnostic, pas de recommandation qui
>    se substituerait à un avis médical) — reste sur des principes nutritionnels généraux
>    applicables à un adulte en bonne santé.
> 4. Réponds en français, tutoiement, ton direct et concis (4 à 8 phrases maximum). Pas de
>    préambule ni de disclaimer générique.
> 5. Les données fournies reflètent le programme de carb cycling de l'utilisateur (jours
>    HIGH/MEDIUM/LOW/PLAISIR avec des cibles de glucides différentes selon le type de jour,
>    glucides jamais sous 130g/jour). Commente explicitement si l'apport réel du jour (total et
>    par repas) est cohérent avec la cible de ce type de jour précis, pas seulement le déficit
>    calorique global.
> 6. Termine par la liste des organismes dont tu t'es réellement inspiré pour CETTE réponse
>    précise (pas une liste générique donnée par défaut) dans le champ "sources" — liste vide si
>    le conseil ne repose que sur des principes généraux non attribuables à un organisme précis.
>
> Réponds UNIQUEMENT en JSON strict, sans aucun texte hors JSON, au format exact :
> {"advice": "...", "sources": [...]}

User message (template — `payload` is the day's numbers already computed by the app: targets,
totals, per-meal breakdown; the model never recomputes anything itself):

> Voici les données de la journée à analyser (déjà calculées côté application, ne recalcule
> aucun total ni aucune cible toi-même) :
> `${JSON.stringify(payload, null, 2)}`
>
> Donne un conseil de déficit calorique pour cette journée précise, en tenant compte du type de
> jour (carb cycling) et de la répartition par repas (petit_dej / dejeuner / diner / collation =
> hors-repas).

This is the literal string in `mistralCarbAdvice.ts`, ported unchanged from n8n's former "Build
Prompt" node (verified byte-identical at the time of the port).
