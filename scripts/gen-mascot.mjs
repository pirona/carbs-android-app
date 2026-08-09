#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
//
// One-off asset generation: original kawaii mascot (chubby chick/bird, "loaf" silhouette,
// hand-drawn wobbly-ink technique) for icon/splash. Not part of the runtime or CI.
// Inspired by ofbirdsandworms' hand-drawn ink style (technique only — no traced artwork).
//
// Usage:
//   npm install --no-save roughjs sharp   (dev-only rasterizer, never in package.json —
//     same one-off pattern as scripts/build-ciqual.mjs)
//   node scripts/gen-mascot.mjs

import rough from 'roughjs';
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', '.mascot-preview');

const PALETTE = {
  bg: '#FFF6EA', // warm cream
  body: '#FFD9A0', // pastel apricot
  beak: '#F2954D', // soft orange
  ink: '#33291F', // warm near-black
};

const gen = rough.generator();
const ROUGH = { roughness: 2.4, bowing: 1.4, strokeWidth: 4.5, stroke: PALETTE.ink, disableMultiStroke: true };
const BODY_D = `M 42,168
     C 20,168 16,118 34,84
     C 50,53 72,30 100,29
     C 128,30 150,53 166,84
     C 184,118 180,168 158,168
     C 159,179 148,183 100,183
     C 52,183 41,179 42,168 Z`;

// A few px larger than BODY_D on every edge, same shape. The jittery outline stroke below
// wobbles a few px either side of the true path — without this safety margin the fill
// (rendered with zero jitter, so it sits exactly on the true path) peeks out through the
// background wherever the stroke jitters inward.
const BODY_FILL_D = `M 41,169
     C 18,169 14,118 32,83
     C 49,52 71,28 100,27
     C 129,28 151,52 168,83
     C 186,118 182,169 159,170
     C 160,181 149,185 100,185
     C 51,185 40,181 41,169 Z`;

// Fill and outline are generated separately: a flat, oversized fill so the pastel color
// always sits under the ink line, with all the hand-drawn wobble in the outline stroke.
function bodyFill() {
  return gen.path(BODY_FILL_D, { roughness: 0, bowing: 0, fill: PALETTE.body, fillStyle: 'solid', stroke: 'none' });
}

function bodyOutline(seed) {
  return gen.path(BODY_D, { ...ROUGH, fill: 'none', seed });
}

function eye(cx, cy, seed) {
  return gen.circle(cx, cy, 11, {
    roughness: 1.1,
    bowing: 1,
    strokeWidth: 3,
    stroke: PALETTE.ink,
    fill: PALETTE.ink,
    fillStyle: 'solid',
    seed,
  });
}

function beak(seed) {
  const fillD = 'M 87,104 L 113,104 L 100,123 Z'; // slightly oversized vs. the outline below
  const outlineD = 'M 90,106 L 110,106 L 100,120 Z';
  return [
    gen.path(fillD, { roughness: 0, bowing: 0, fill: PALETTE.beak, fillStyle: 'solid', stroke: 'none' }),
    gen.path(outlineD, { ...ROUGH, strokeWidth: 3.5, fill: 'none', seed: seed + 100 }),
  ];
}

// A simple open wing crease (two short nested arcs) rather than a closed blob — a closed
// tuft shape at this size kept reading as a stray letter instead of a wing.
function wingTuft(seed) {
  return [
    gen.path('M 146,92 C 160,98 165,112 152,124', { roughness: 1.6, bowing: 1.2, strokeWidth: 3.5, stroke: PALETTE.ink, fill: 'none', seed }),
    gen.path('M 148,100 C 156,104 158,112 151,119', { roughness: 1.6, bowing: 1.2, strokeWidth: 3, stroke: PALETTE.ink, fill: 'none', seed: seed + 1 }),
  ];
}

function feet(seed) {
  return gen.path(
    `M 76,182 L 72,194 M 76,182 L 78,195 M 76,182 L 82,193
     M 124,182 L 120,193 M 124,182 L 126,195 M 124,182 L 130,194`,
    { roughness: 1.8, bowing: 1.2, strokeWidth: 3.5, stroke: PALETTE.ink, seed },
  );
}

function toSvg(drawables, { withBg } = { withBg: true }) {
  let body = '';
  for (const d of drawables.flat()) {
    for (const p of gen.toPaths(d)) {
      body += `<path d="${p.d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'none'}" stroke-width="${p.strokeWidth ?? 0}" fill-rule="${p.fillRule ?? 'nonzero'}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
  const bg = withBg ? `<rect width="200" height="200" fill="${PALETTE.bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${bg}${body}</svg>`;
}

async function render(name, drawables, opts) {
  const svg = toSvg(drawables, opts);
  const svgPath = join(outDir, `${name}.svg`);
  writeFileSync(svgPath, svg);
  await sharp(Buffer.from(svg)).resize(800, 800).png().toFile(join(outDir, `${name}.png`));
  console.log(`wrote ${name}.svg / ${name}.png`);
}

import { mkdirSync } from 'node:fs';
mkdirSync(outDir, { recursive: true });

function mascot(seed) {
  return [
    bodyFill(),
    bodyOutline(seed),
    wingTuft(seed + 1),
    beak(seed + 2),
    eye(80, 95, seed + 3),
    eye(120, 95, seed + 4),
    feet(seed + 5),
  ];
}

// Two seed variants for comparison — same construction, different roughjs jitter.
for (const [name, seed] of [
  ['mascot-a', 1],
  ['mascot-b', 7],
]) {
  await render(name, mascot(seed));
}

// Transparent variant of the chosen construction, for icon/splash pipeline use later.
await render('mascot-a-transparent', mascot(1), { withBg: false });

console.log(`\nPreview PNGs in ${outDir}`);
