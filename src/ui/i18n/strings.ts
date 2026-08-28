// SPDX-License-Identifier: GPL-3.0-or-later
// Central FR/EN dictionary — see plan §Mécanisme. No i18n library: the only real need is a
// `{var}` placeholder replace, not plural rules, consistent with this repo's zero-dependency,
// hand-rolled style. `as const satisfies Record<string, StringEntry>` gives StringKey as a
// literal union for free — a typo'd key or a missing fr/en fails to compile.
export type Lang = 'fr' | 'en';

export interface StringEntry {
  fr: string;
  en: string;
}

export const STRINGS = {
  // --- App chrome (main.ts: topbar title, bottom nav labels, icon aria-labels) ---
  'nav.day': { fr: 'Jour', en: 'Day' },
  'nav.progress': { fr: 'Progrès', en: 'Progress' },
  'nav.scan': { fr: 'Scan', en: 'Scan' },
  'nav.week': { fr: 'Semaine', en: 'Week' },
  'nav.habits': { fr: 'Habitudes', en: 'Habits' },
  'nav.conseils': { fr: 'Conseils', en: 'Advice' },
  'nav.settings': { fr: 'Réglages', en: 'Settings' },

  // --- Shared domain labels (core/types.ts: PLAISIR_LEVELS/MEAL_SLOT_ICON keep icon/kcal only,
  // the text lives here so core/ has no i18n dependency) ---
  'plaisir.leger.label': { fr: 'Léger', en: 'Light' },
  'plaisir.leger.desc': { fr: 'Dessert, 1-2 bières, glace', en: 'Dessert, 1-2 beers, ice cream' },
  'plaisir.moyen.label': { fr: 'Moyen', en: 'Medium' },
  'plaisir.moyen.desc': { fr: 'Pizza, fajitas, restau', en: 'Pizza, fajitas, restaurant' },
  'plaisir.lourd.label': { fr: 'Lourd', en: 'Heavy' },
  'plaisir.lourd.desc': { fr: 'Soirée alcool + bouffe', en: 'Drinking + eating out' },
  'mealSlot.petit_dej': { fr: 'Petit-déjeuner', en: 'Breakfast' },
  'mealSlot.dejeuner': { fr: 'Déjeuner', en: 'Lunch' },
  'mealSlot.diner': { fr: 'Dîner', en: 'Dinner' },
  'mealSlot.collation': { fr: 'Hors-repas', en: 'Off-meal' },
  'mealSlot.label': { fr: 'Repas', en: 'Meal' },

  // --- Day-type source explanation (core/calc/dayType.ts's DayTypeSource, formatted by
  // DayScreen.ts — see formatDayTypeSource()) ---
  'dayType.plaisirOverride': { fr: 'semainier — {label} ({kcal} kcal)', en: 'weekly plan — {label} ({kcal} kcal)' },
  'dayType.stepsAndSport.stepsPart': { fr: '{steps} pas (~{stepKcal} kcal)', en: '{steps} steps (~{stepKcal} kcal)' },
  'dayType.stepsAndSport.sportPart': { fr: '{sportKcal} kcal sport', en: '{sportKcal} kcal exercise' },
  'dayType.stepsAndSport.total': { fr: '{parts} = ~{total} kcal actives', en: '{parts} = ~{total} active kcal' },
  'dayType.activeCalories.withSteps': { fr: 'actives {activeKcal} + pas ~{stepKcal} = ~{total} kcal', en: 'active {activeKcal} + steps ~{stepKcal} = ~{total} kcal' },
  'dayType.activeCalories.withoutSteps': { fr: 'actives {activeKcal} kcal', en: 'active {activeKcal} kcal' },
  'dayType.exerciseMin': { fr: '{min} min exercice', en: '{min} min exercise' },
  'dayType.exerciseMinLow': { fr: '{min} min exercice (faible)', en: '{min} min exercise (low)' },
  'dayType.weekSchedule': { fr: 'planning semaine ({day})', en: 'weekly plan ({day})' },
  'dayType.day.0': { fr: 'Dimanche', en: 'Sunday' },
  'dayType.day.1': { fr: 'Lundi', en: 'Monday' },
  'dayType.day.2': { fr: 'Mardi', en: 'Tuesday' },
  'dayType.day.3': { fr: 'Mercredi', en: 'Wednesday' },
  'dayType.day.4': { fr: 'Jeudi', en: 'Thursday' },
  'dayType.day.5': { fr: 'Vendredi', en: 'Friday' },
  'dayType.day.6': { fr: 'Samedi', en: 'Saturday' },

  // --- Shared food-entry form fragments (src/ui/forms/foodEntryForm.ts) ---
  'foodEntry.name': { fr: 'Nom', en: 'Name' },
  'foodEntry.portion': { fr: 'Portion (g)', en: 'Portion (g)' },
  'foodEntry.kcalPer100': { fr: 'kcal / 100g', en: 'kcal / 100g' },
  'foodEntry.proteinPer100': { fr: 'Protéines / 100g', en: 'Protein / 100g' },
  'foodEntry.fatPer100': { fr: 'Lipides / 100g', en: 'Fat / 100g' },
  'foodEntry.carbPer100': { fr: 'Glucides / 100g', en: 'Carbs / 100g' },
  'foodEntry.previewWithPortion': { fr: 'Pour {portion} g : {kcal} kcal · P{prot} L{fat} G{carb}', en: 'For {portion} g: {kcal} kcal · P{prot} F{fat} C{carb}' },
  'foodEntry.previewCompact': { fr: '{kcal} kcal · P{prot} L{fat} G{carb}', en: '{kcal} kcal · P{prot} F{fat} C{carb}' },
  'foodEntry.mealSlotUnset': { fr: 'Non classé', en: 'Unclassified' },
  'foodEntry.aiBannerTitle': { fr: '🤖 Estimation IA — à vérifier', en: '🤖 AI estimate — to verify' },
  'foodEntry.aiEntry': { fr: 'Entrée : « {text} »', en: 'Input: "{text}"' },
  'foodEntry.aiConfidence': { fr: 'Confiance : {confidence}', en: 'Confidence: {confidence}' },
  'foodEntry.aiNote': { fr: 'Remarque : {note}', en: 'Note: {note}' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel' },
  'common.save': { fr: 'Enregistrer', en: 'Save' },
  'foodEntry.searchError': { fr: 'Recherche impossible — vérifier la connexion.', en: 'Search failed — check your connection.' },
  'foodEntry.scanError': { fr: 'Scan impossible ({message})', en: 'Scan failed ({message})' },
  'foodEntry.aiInterpretError': { fr: 'Interprétation impossible ({message}) — réessaie ou saisis à la main.', en: 'Interpretation failed ({message}) — try again or enter it manually.' },

  // --- src/ui/screens/DayScreen.ts ---
  'day.dayType.high': { fr: 'HIGH CARB', en: 'HIGH CARB' },
  'day.dayType.medium': { fr: 'MEDIUM CARB', en: 'MEDIUM CARB' },
  'day.dayType.low': { fr: 'LOW CARB', en: 'LOW CARB' },
  'day.dayType.plaisir': { fr: 'JOUR PLAISIR', en: 'TREAT DAY' },
  'day.macro.protein': { fr: 'Protéines', en: 'Protein' },
  'day.macro.fat': { fr: 'Lipides', en: 'Fat' },
  'day.macro.carb': { fr: 'Glucides', en: 'Carbs' },
  'day.hc.connect': { fr: '📱 Connecter Health Connect (pas quotidiens)', en: '📱 Connect Health Connect (daily steps)' },
  'day.hc.steps': { fr: '{steps} pas', en: '{steps} steps' },
  'day.hc.stepsUnavailable': { fr: 'pas indisponibles aujourd\'hui', en: 'steps unavailable today' },
  'day.hc.status': { fr: '📱 Health Connect : {stepsLabel}', en: '📱 Health Connect: {stepsLabel}' },
  'day.habits.header': { fr: 'Habitudes — rechercher pour logger', en: 'Habits — search to log' },
  'day.habits.sortAlpha': { fr: 'A→Z', en: 'A→Z' },
  'day.habits.sortRecent': { fr: 'Récent', en: 'Recent' },
  'day.habits.searchPlaceholder': { fr: 'Rechercher une habitude…', en: 'Search a habit…' },
  'day.habits.noMatch': { fr: 'Aucune habitude ne correspond à « {query} ».', en: 'No habit matches "{query}".' },
  'day.log.offSearchLabel': { fr: 'Rechercher sur OpenFoodFacts', en: 'Search OpenFoodFacts' },
  'day.log.offSearchPlaceholder': { fr: 'ex: yaourt nature', en: 'e.g. plain yogurt' },
  'day.log.search': { fr: 'Rechercher', en: 'Search' },
  'day.log.scanBarcode': { fr: '📷 Code-barres', en: '📷 Barcode' },
  'day.log.searching': { fr: 'Recherche en cours…', en: 'Searching…' },
  'day.log.scanning': { fr: 'Scan en cours…', en: 'Scanning…' },
  'day.log.noResults': { fr: 'Aucun résultat.', en: 'No results.' },
  'day.log.aiDescribeLabel': { fr: '🤖 Décrire en langage naturel (si absent d\'OpenFoodFacts)', en: '🤖 Describe in plain language (if not on OpenFoodFacts)' },
  'day.log.aiDescribePlaceholder': { fr: 'ex: 2 mugs de café, 350g café moulu au total', en: 'e.g. 2 mugs of coffee, 350g ground coffee total' },
  'day.log.aiInterpret': { fr: 'Interpréter avec l\'IA', en: 'Interpret with AI' },
  'day.log.aiInterpreting': { fr: 'Interprétation en cours…', en: 'Interpreting…' },
  'day.log.manualEntry': { fr: 'Saisir à la main →', en: 'Enter manually →' },
  'day.log.saveAsHabit': { fr: '💾 Sauver aussi en habitude', en: '💾 Also save as a habit' },
  'day.log.emptyMeal': { fr: 'Rien ici.', en: 'Nothing here.' },
  'day.log.title': { fr: 'Aujourd\'hui', en: 'Today' },
  'day.log.addFood': { fr: 'Logger un aliment', en: 'Log a food' },
  'day.log.journal': { fr: 'Journal du jour', en: 'Today\'s journal' },
  'day.log.vsTarget': { fr: 'vs cible {target} kcal', en: 'vs {target} kcal target' },
  'day.weightToday': { fr: 'Poids aujourd\'hui', en: 'Weight today' },
  'day.sportKcal': { fr: 'Kcal sport (séance du jour)', en: 'Exercise kcal (today\'s session)' },
  'day.clearSport': { fr: 'effacer', en: 'clear' },
  'day.bmr': { fr: 'BMR {bmr} kcal · {weight} kg', en: 'BMR {bmr} kcal · {weight} kg' },
  'day.detectedVia': { fr: 'Détecté via : {source}', en: 'Detected via: {source}' },
  'day.plaisirDeclared': { fr: 'Jour plaisir déclaré', en: 'Treat day declared' },
  'day.confirmDeleteHabit': { fr: 'Supprimer l\'habitude "{label}" ?', en: 'Delete habit "{label}"?' },
  'day.barcodeNotFound': { fr: 'Produit introuvable pour ce code-barres — réessaie ou saisis à la main.', en: 'No product found for this barcode — try again or enter it manually.' },

  // --- src/ui/screens/ProgressScreen.ts ---
  'progress.weightGoal.title': { fr: '🎯 Objectif poids', en: '🎯 Weight goal' },
  'progress.weightGoal.lost': { fr: '−{kg} kg perdus', en: '−{kg} kg lost' },
  'progress.weightGoal.remain': { fr: '{kg} kg restants', en: '{kg} kg to go' },
  'progress.plaisir.prompt': { fr: 'Déclarer un jour plaisir aujourd\'hui :', en: 'Declare a treat day today:' },
  'progress.plaisir.clear': { fr: 'Effacer le jour plaisir', en: 'Clear the treat day' },
  'progress.week.title': { fr: '📅 Semaine en cours', en: '📅 This week' },
  'progress.week.nominalDeficit': { fr: 'Déficit semaine nominal (planning)', en: 'Planned weekly deficit' },
  'progress.week.estimatedLoss': { fr: 'Perte hebdomadaire estimée', en: 'Estimated weekly loss' },
  'progress.week.noData': { fr: 'Pas encore de données réelles cette semaine — logge tes repas pour voir ta progression réelle.', en: 'No real data yet this week — log your meals to see your actual progress.' },
  'progress.week.realProgress': { fr: 'Progression réelle', en: 'Actual progress' },
  'progress.week.dayProgress': { fr: '{day} — J{iso}/7', en: '{day} — D{iso}/7' },
  'progress.week.netDeficit': { fr: '~{deficit} kcal nets réels', en: '~{deficit} net kcal actual' },
  'progress.week.pctOfGoal': { fr: '{pct}% de l\'objectif', en: '{pct}% of target' },
  'progress.week.day.mon': { fr: 'Lun', en: 'Mon' },
  'progress.week.day.tue': { fr: 'Mar', en: 'Tue' },
  'progress.week.day.wed': { fr: 'Mer', en: 'Wed' },
  'progress.week.day.thu': { fr: 'Jeu', en: 'Thu' },
  'progress.week.day.fri': { fr: 'Ven', en: 'Fri' },
  'progress.week.day.sat': { fr: 'Sam', en: 'Sat' },
  'progress.week.day.sun': { fr: 'Dim', en: 'Sun' },
  'progress.week.trackedDaysComplete.one': { fr: '{tracked}/{iso} jour avec données complètes', en: '{tracked}/{iso} day with complete data' },
  'progress.week.trackedDaysComplete.many': { fr: '{tracked}/{iso} jours avec données complètes', en: '{tracked}/{iso} days with complete data' },
  'progress.week.daysLeft.one': { fr: '· {n} jour restant', en: '· {n} day remaining' },
  'progress.week.daysLeft.many': { fr: '· {n} jours restants', en: '· {n} days remaining' },
  'progress.week.weekEnd': { fr: '· fin de semaine ✓', en: '· end of week ✓' },
  'progress.fidelity.noData': { fr: '🎯 Fidélité au programme — pas encore de jour trackable.', en: '🎯 Program adherence — no trackable day yet.' },
  'progress.fidelity.title': { fr: '🎯 Fidélité au programme (7 derniers jours)', en: '🎯 Program adherence (last 7 days)' },
  'progress.fidelity.one': { fr: '{onTarget}/{tracked} jour dans la cible (±15%) · écart moyen {avgDev}%', en: '{onTarget}/{tracked} day within target (±15%) · avg deviation {avgDev}%' },
  'progress.fidelity.many': { fr: '{onTarget}/{tracked} jours dans la cible (±15%) · écart moyen {avgDev}%', en: '{onTarget}/{tracked} days within target (±15%) · avg deviation {avgDev}%' },
  'progress.weightChart.title': { fr: 'Courbe de poids (derniers jours trackés)', en: 'Weight trend (last tracked days)' },

  // --- src/ui/screens/HabitsScreen.ts ---
  'habits.hint': { fr: 'Bibliothèque personnelle — données réelles via OpenFoodFacts ou saisie manuelle.', en: 'Personal library — real data via OpenFoodFacts or manual entry.' },
  'habits.title': { fr: '🍽️ Bibliothèque', en: '🍽️ Library' },
  'habits.scanBarcode': { fr: '🔖 Code-barres', en: '🔖 Barcode' },
  'habits.dayTypeLabel': { fr: 'Type de jour (optionnel)', en: 'Day type (optional)' },
  'habits.dayTypeAuto': { fr: 'Auto (selon glucides)', en: 'Auto (based on carbs)' },
  'habits.none': { fr: 'Aucune habitude enregistrée.', en: 'No habits saved yet.' },
  'habits.noResultsFor': { fr: 'Aucun résultat pour « {query} ».', en: 'No results for "{query}".' },
  'habits.footer.filtered.one': { fr: '{visible} / {total} habitude', en: '{visible} / {total} habit' },
  'habits.footer.filtered.many': { fr: '{visible} / {total} habitudes', en: '{visible} / {total} habits' },
  'habits.footer.total.one': { fr: '{total} habitude au total', en: '{total} habit total' },
  'habits.footer.total.many': { fr: '{total} habitudes au total', en: '{total} habits total' },
  'habits.add': { fr: '+ Ajouter une habitude', en: '+ Add a habit' },
  'habits.confirmDelete': { fr: 'Supprimer cette habitude ?', en: 'Delete this habit?' },

  // --- src/ui/screens/SettingsScreen.ts: language card only (rest of the screen stays French
  // for now, see plan §MVP — deliberately not fully migrated this pass) ---
  'settings.language.title': { fr: '🌐 Langue', en: '🌐 Language' },

  // --- src/ui/screens/ExportScreen.ts ---
  'export.hint': { fr: "Sauvegarde manuelle de toutes les données de l'app en JSON — à partager/enregistrer où tu veux (fichier, email...). Pas de sauvegarde automatique.", en: 'Manual backup of all app data as JSON — share/save it wherever you want (file, email...). No automatic backup.' },
  'export.secretWarning': { fr: "⚠️ Ce blob contient ton app password Nextcloud <strong>en clair</strong> (pour permettre une restauration complète en un coup) — évite de le coller dans un canal non sécurisé.", en: '⚠️ This blob contains your Nextcloud app password <strong>in plain text</strong> (to allow a one-shot full restore) — avoid pasting it into an unsecured channel.' },
  'export.reading': { fr: 'Lecture…', en: 'Reading…' },
  'export.share': { fr: '📤 Partager', en: '📤 Share' },
  'export.copy': { fr: '📋 Copier', en: '📋 Copy' },
  'export.nothingToExport': { fr: "Rien à exporter pour le moment.", en: 'Nothing to export yet.' },
  'export.shareTitle': { fr: 'Export Carbs', en: 'Carbs export' },
  'export.copied': { fr: '✓ Copié', en: '✓ Copied' },
  'export.copyFailed': { fr: 'Échec de la copie', en: 'Copy failed' },

  // --- src/ui/screens/ImportScreen.ts ---
  'import.hint': { fr: "Colle ici le JSON copié depuis <code>export.html</code> (les anciennes pages HA). Rien n'est écrit avant que tu confirmes l'aperçu.", en: 'Paste the JSON copied from <code>export.html</code> (the old HA pages) here. Nothing is written until you confirm the preview.' },
  'import.preview': { fr: '👁️ Prévisualiser', en: '👁️ Preview' },
  'import.confirm': { fr: '✅ Confirmer l\'import', en: '✅ Confirm import' },
  'import.staleWarning': { fr: "L'aperçu ne correspond plus au texte collé — relance la prévisualisation.", en: 'The preview no longer matches the pasted text — run the preview again.' },
  'import.done': { fr: '✓ Import terminé', en: '✓ Import complete' },

  // --- src/ui/screens/WeekScreen.ts ---
  'week.today': { fr: 'auj.', en: 'today' },
  'week.title': { fr: '🗓️ Semainier', en: '🗓️ Weekly planner' },
  'week.col.day': { fr: 'Jour', en: 'Day' },
  'week.col.type': { fr: 'Type', en: 'Type' },
  'week.col.sportKcal': { fr: 'kcal sport', en: 'exercise kcal' },
  'week.plaisirHint': { fr: '🍺 = jour plaisir (tap pour cycler)', en: '🍺 = treat day (tap to cycle)' },

  // --- src/migration/importExport.ts (runImport's per-key notes/errors, displayed verbatim
  // by ImportScreen.ts and SettingsScreen.ts's Nextcloud restore preview) ---
  'import.err.invalidJson': { fr: 'JSON invalide — vérifie que le blob a été copié en entier.', en: 'Invalid JSON — check that the blob was copied in full.' },
  'import.err.unexpectedFormat': { fr: "Format inattendu : ce n'est pas un objet JSON.", en: "Unexpected format: this isn't a JSON object." },
  'import.note.addedKnown': { fr: '{added} nouvelle(s), {skipped} déjà connue(s)', en: '{added} new, {skipped} already known' },
  'import.note.absentOrBadFormat': { fr: 'absent ou format inattendu', en: 'absent or unexpected format' },
  'import.note.absent': { fr: 'absent', en: 'absent' },
  'import.note.adopted': { fr: 'adopté', en: 'adopted' },
  'import.note.currentDayAdopted': { fr: 'adopté (aucune journée en cours)', en: 'adopted (no day currently in progress)' },
  'import.note.currentDaySkipped': { fr: 'ignoré — une journée en cours existe déjà', en: 'ignored — a day is already in progress' },
  'import.note.sportKcalNotImported': { fr: 'non importé — valeur journalière éphémère', en: 'not imported — a transient daily value' },
  'import.note.daysAdded': { fr: '{added} jour(s) ajouté(s), {skipped} déjà connu(s)', en: '{added} day(s) added, {skipped} already known' },
  'import.note.plaisirAdopted': { fr: 'adopté (semaine en cours, rien de saisi encore)', en: 'adopted (current week, nothing entered yet)' },
  'import.note.plaisirSkipped': { fr: 'ignoré — semaine différente ou déjà saisi', en: 'ignored — different week or already entered' },
  'import.note.plaisirWeekDerived': { fr: 'dérivé automatiquement de plaisir_overrides, pas importé séparément', en: 'auto-derived from plaisir_overrides, not imported separately' },
  'import.note.habitsUpdated': { fr: '{added} ajoutée(s)/mise(s) à jour, {skipped} déjà à jour', en: '{added} added/updated, {skipped} already up to date' },
  'import.note.entriesAdded': { fr: '{added} ajoutée(s), {skipped} déjà connue(s)', en: '{added} added, {skipped} already known' },
  'import.note.foodLogTodaySkipped': { fr: "ignoré — journal d'un autre jour", en: "ignored — another day's journal" },
  'import.note.aiFootprintMerged': { fr: 'cumulé avec les données existantes', en: 'merged with existing data' },

  // --- src/migration/exportDump.ts (per-key descriptions in the Export screen's counts list) ---
  'export.describe.entries': { fr: '{n} entrée(s)', en: '{n} entries' },
  'export.describe.entriesToday': { fr: "{n} entrée(s) (aujourd'hui)", en: '{n} entries (today)' },
  'export.describe.daysThisWeek': { fr: '{n} jour(s) (semaine en cours)', en: '{n} day(s) (current week)' },
  'export.describe.daysPlanned': { fr: '{n} jour(s) planifiés', en: '{n} day(s) planned' },
  'export.describe.present': { fr: 'présent', en: 'present' },

  // --- src/integrations/nextcloudWebdav.ts ---
  'nextcloud.err.timeout': { fr: 'délai dépassé, le serveur ne répond pas', en: 'timed out, the server isn\'t responding' },
  'nextcloud.err.incompleteConfig': { fr: 'Configuration Nextcloud incomplète', en: 'Incomplete Nextcloud configuration' },
  'nextcloud.err.noBackupFound': { fr: 'Aucune sauvegarde trouvée sur Nextcloud', en: 'No backup found on Nextcloud' },

  // --- src/integrations/barcodeScan.ts ---
  'barcode.err.moduleInstall': { fr: 'Installation du module de scan impossible.', en: 'Could not install the scan module.' },
  'barcode.err.scanFailed': { fr: 'Scan impossible.', en: 'Scan failed.' },
  'barcode.err.lookupFailed': { fr: 'Recherche impossible — vérifier la connexion.', en: 'Search failed — check your connection.' },
} as const satisfies Record<string, StringEntry>;

export type StringKey = keyof typeof STRINGS;

let currentLang: Lang = 'fr';

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const template = STRINGS[key][currentLang];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
