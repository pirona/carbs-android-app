#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
//
// One-off conversion of the ANSES-CIQUAL 2020 food composition table into the static
// src/ciqual/ciqual.json asset bundled with the app (see plan §Phase 6/7.2). Not part of
// the runtime or CI — re-run manually if CIQUAL publishes an update.
//
// Source: https://ciqual.anses.fr, "Table Ciqual 2020 en Français au format Excel"
// (https://www.data.gouv.fr/datasets/table-de-composition-nutritionnelle-des-aliments-ciqual-2020/)
// Licence Ouverte / Etalab (fr-lo) — attribution required, see src/ciqual/ATTRIBUTION.md.
//
// Usage:
//   1. Download the .xls from the URL above (not committed — ~3.5MB, one-off input).
//   2. npm install -D xlsx   (only needed to run this script — see README note on why
//      it's not a permanent devDependency: known unpatched prototype-pollution/ReDoS
//      advisories, acceptable here since it only ever parses one trusted, fixed,
//      government-published file, run once, locally, never shipped or run on user input).
//   3. node scripts/build-ciqual.mjs <path-to-xls>

import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = process.argv[2];
if (!srcPath) {
  console.error('Usage: node scripts/build-ciqual.mjs <path-to-ciqual.xls>');
  process.exit(1);
}

// Columns (0-based) in the "compo" sheet — see the header row for the full list.
const COL = {
  GROUP: 3, // alim_grp_nom_fr
  CODE: 6, // alim_code
  LABEL: 7, // alim_nom_fr
  KCAL_UE: 10, // Energie, Règlement UE (kcal/100g)
  KCAL_JONES: 12, // Energie, N x facteur Jones (kcal/100g)
  PROTEIN_625: 15, // Protéines, N x 6.25 (g/100g)
  PROTEIN_JONES: 14, // Protéines, N x facteur de Jones (g/100g)
  CARB: 16, // Glucides (g/100g)
  FAT: 17, // Lipides (g/100g)
};

// Matches the plan's target scope: composite dishes, meat/fish/eggs, fruit/veg/legumes,
// cereals, dairy, fats. Drinks, sweets/candy, baby food, condiments/spices excluded —
// out of scope for matching real-plate photo components.
const INCLUDED_GROUPS = new Set([
  'entrées et plats composés',
  'viandes, œufs, poissons et assimilés',
  'fruits, légumes, légumineuses et oléagineux',
  'produits céréaliers',
  'produits laitiers et assimilés',
  'matières grasses',
]);

function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '-' || s === '') return null;
  const n = parseFloat(s.replace('<', '').replace(',', '.').trim());
  return Number.isNaN(n) ? null : n;
}

const wb = XLSX.readFile(srcPath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

const out = [];
let skippedGroup = 0;
let skippedNoKcal = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const group = row[COL.GROUP];
  if (!INCLUDED_GROUPS.has(group)) {
    skippedGroup++;
    continue;
  }

  const kcal = parseNum(row[COL.KCAL_UE]) ?? parseNum(row[COL.KCAL_JONES]);
  if (kcal == null) {
    skippedNoKcal++;
    continue;
  }
  const protein_g = parseNum(row[COL.PROTEIN_625]) ?? parseNum(row[COL.PROTEIN_JONES]) ?? 0;
  const carb_g = parseNum(row[COL.CARB]) ?? 0;
  const fat_g = parseNum(row[COL.FAT]) ?? 0;

  out.push({
    id: String(row[COL.CODE]),
    label: row[COL.LABEL],
    category: group,
    per100: { kcal, protein_g, fat_g, carb_g },
  });
}

const outPath = join(__dirname, '..', 'src', 'ciqual', 'ciqual.json');
writeFileSync(outPath, JSON.stringify(out));

console.log(`Wrote ${out.length} entries to ${outPath}`);
console.log(`Skipped: ${skippedGroup} (group not in scope), ${skippedNoKcal} (no usable kcal value)`);
