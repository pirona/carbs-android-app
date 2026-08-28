# Carbs

An Android app for carb-cycling and nutrition tracking — calorie deficit, macros, day-type
detection (HIGH/MEDIUM/LOW/PLAISIR), and photo-based food logging (plate scan, receipt scan,
barcode scan, or just describe what you ate in plain language).

## ⚠️ Not medical advice

This app is a personal tracking tool, not a substitute for professional care. It does not
replace a registered dietitian, a doctor, or any other healthcare provider — nothing it shows
you is a diagnosis or an individualized medical recommendation. The optional AI-generated advice
is explicitly restricted to general, well-established principles from recognized public-health
bodies (ANSES, HAS, EFSA, WHO — see [AI prompts](#ai-prompts) below), never a specific figure or
study it isn't sure of. Use your own judgment, and talk to an actual professional about your own
health, especially if you have a medical condition, are pregnant, or are otherwise in a
situation where general nutrition principles for a healthy adult don't apply to you.

## 🌍 Aware of its own footprint

Every AI feature in this app runs on Mistral, and the app tracks — and shows you, in
Settings — an estimate of the carbon and water footprint of its own AI usage, converted from
real token counts using Mistral's own published life-cycle assessment (with ADEME and
Carbone 4). The point isn't to guilt-trip anyone over grams of CO2 — it's to make an otherwise
invisible cost visible, so using AI stays a deliberate choice rather than a reflex. See
[`src/core/calc/aiFootprint.ts`](src/core/calc/aiFootprint.ts) for the exact methodology and
sources.

## Data & AI sources

- Nutrition data for photo/barcode scans: [OpenFoodFacts](https://world.openfoodfacts.org/) and
  ANSES-CIQUAL 2020 (Licence Ouverte / Etalab) — both belong to their respective authors, used
  here only as a reference, never as this app's own claim of accuracy.
- AI: [Mistral AI](https://mistral.ai/) — the only AI provider this app talks to, no other
  model/vendor is involved anywhere. See [AI prompts](#ai-prompts) for exactly what's sent and
  why.

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

## AI prompts

Four optional AI features call the Mistral API directly from the app, using an API key you
enter in Settings and that's stored encrypted on-device (Android Keystore) — never in plain
text, and never included in the export/backup blob (unlike the Nextcloud app password, which
is included there by explicit choice; the Mistral key must be re-entered after a wipe/reinstall
or a restore from backup). Each call receives only what the task needs — raw text, one photo, or
nutrition numbers already computed by the app — never account data or history. In every case the
AI's output is a suggestion: you review it and can edit it, and nothing is ever saved
automatically.

The photo-scan features in particular are not always reliable — vision models can misidentify
what's on the photo (see `PhotoScanScreen`'s human-confirmation step, never an auto-save). Treat
their output as a rough starting point to correct, not a trustworthy reading.

The UI itself is bilingual (French/English, switchable in Settings) — a courtesy for anyone who
doesn't read French, not a change of audience. The generated advice/bilan text always comes back
in French regardless of the UI language: its system prompt is deliberately kept untranslated
rather than risk weakening the sourced health guardrails below in a translation.

The exact request sent for each feature is committed to this repo as source code, so the prompt
below is never just a description — the file is the source of truth:

- [`src/integrations/mistralFoodParse.ts`](src/integrations/mistralFoodParse.ts) —
  natural-language food entry
- [`src/integrations/mistralFoodVision.ts`](src/integrations/mistralFoodVision.ts) —
  photo-of-a-plate scan
- [`src/integrations/mistralReceiptScan.ts`](src/integrations/mistralReceiptScan.ts) —
  photo-of-a-receipt scan (multiple items at once)
- [`src/integrations/mistralCarbAdvice.ts`](src/integrations/mistralCarbAdvice.ts) —
  caloric-deficit advice on a fully-logged past day

### Food Parse — natural-language food entry

Model `mistral-small-latest`, tool calling (`tool_choice: "any"`), a single tool
`extract_nutrition`. There is no separate system prompt — the tool's JSON schema description
*is* the instruction, and your raw text is passed through unchanged as the only message:

```
Tool: extract_nutrition
"Extrait les informations nutritionnelles structurées d'une description de repas en langage
naturel, en français. Si l'entrée est ambiguë, peu plausible ou incomplète, l'indiquer dans note
et mettre confidence à low ou medium."

Parameters: label, portion_g, kcal_100g, protein_100g, fat_100g, carb_100g,
confidence ("high"|"medium"|"low"), note

Message: { role: "user", content: <the text you typed> }
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

### Receipt Scan — photo-of-a-receipt scan (multiple items)

Same pattern, model `mistral-small-latest`, tool calling, a single tool `extract_receipt_items`.
Unlike Food Vision, the model is explicitly told **not** to estimate nutrition — a receipt shows
a product name and a price, not nutrition, so macros come from the app's own OpenFoodFacts/CIQUAL
lookup afterward (see `receiptItemToRow` in
[`src/app/photoScanMatch.ts`](src/app/photoScanMatch.ts)), or are left at zero for manual entry —
never fabricated by the model for this feature:

```
Tool: extract_receipt_items
"Extrait les articles alimentaires listés sur une photo de ticket de caisse (supermarché ou
restaurant), en français. Pour chaque article, donne un nom court et clair (pas le libellé brut
de caisse), la quantité si indiquée, et le texte exact tel qu'imprimé. NE PAS estimer de valeurs
nutritionnelles. Ignore les lignes qui ne sont pas de la nourriture (sacs, consigne, réductions,
total, TVA, paiement...). Si le ticket est flou, illisible, ou n'est pas un ticket de caisse, le
préciser dans merchant_note."

Parameters: items[] (label, raw_text, quantity, confidence ("high"|"medium"|"low")), merchant_note

Message: { role: "user", content: [
  { type: "text", text: "Identifie les articles alimentaires listés sur ce ticket de caisse." },
  { type: "image_url", image_url: "data:<mime>;base64,<the captured photo>" }
] }
```

Scanned items can be logged into today's journal (one shared meal, like Food Vision) or added
as independent entries to the Habitudes library for logging later — chosen per scan, since a
shopping receipt typically spans several future meals rather than being eaten all at once.

### Carb Advice — caloric-deficit advice

Model `mistral-large-latest`, temperature 0.3, `response_format: json_object`. Unlike the two
tool-calling flows above, this one gets a full system prompt (verbatim, from
`mistralCarbAdvice.ts`):

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

## On the code

This app was built with [Claude Code](https://claude.com/claude-code). I'm a Linux/Kubernetes
systems engineer, not a mobile developer — what's mine here is the architecture, the specs, the
on-device validation of every feature before it shipped, and the debugging when something didn't
actually work. The tool amplifies, it doesn't invent what you don't already know how to think.

## About

Not commercial software. This is a tool I built for myself — it helps me, and I use it every
day — and I'm sharing it as-is. Love it, or move along.

No pressure at all, but if you'd like to buy me a coffee for this or anything else I build,
gracious donations are always welcome: [ko-fi.com/billisdead](https://ko-fi.com/billisdead)
