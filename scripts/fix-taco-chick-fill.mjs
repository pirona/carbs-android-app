#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
//
// One-off fixup: the "taco chick" mascot delivery (.mascot-preview/taco-chick/raw/, see its
// README.md) left the body/beak unfilled — pure white placeholder instead of the README's own
// #FFD9A0/#F2954D palette. This flood-fills the white regions with the correct pastel colors,
// using the black ink outline as the boundary. Not part of the runtime or CI.
//
// Usage:
//   npm install --no-save sharp   (dev-only, never in package.json — same pattern as
//     scripts/build-ciqual.mjs / scripts/gen-mascot.mjs)
//   node scripts/fix-taco-chick-fill.mjs

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawDir = join(__dirname, '..', '.mascot-preview', 'taco-chick', 'raw');
const outDir = join(__dirname, '..', '.mascot-preview', 'taco-chick', 'filled');
mkdirSync(outDir, { recursive: true });

const BODY = [0xff, 0xd9, 0xa0];
const BEAK = [0xf2, 0x95, 0x4d];

function isNearWhite(r, g, b) {
  return r > 235 && g > 235 && b > 235;
}

// 4-connected flood fill over near-white pixels, iterative (stack-based) to handle large images.
function floodFill(data, w, h, startX, startY, color) {
  const idx = (x, y) => (y * w + x) * 4;
  const visited = new Uint8Array(w * h);
  const stack = [[startX, startY]];
  let filled = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const vi = y * w + x;
    if (visited[vi]) continue;
    visited[vi] = 1;
    const i = idx(x, y);
    if (!isNearWhite(data[i], data[i + 1], data[i + 2]) || data[i + 3] < 200) continue;
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    filled++;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return filled;
}

async function process(inPath, outPath, seeds) {
  const { data, info } = await sharp(inPath).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  for (const [x, y, color, label] of seeds) {
    const n = floodFill(data, width, height, x, y, color);
    console.log(`${outPath}: filled ${label} from (${x},${y}) — ${n} px`);
  }
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
}

// Seed coordinates picked at 1024x1024 scale for the square-crop icon/master files (body:
// mid-chest, head-hood: upper-left of the speckled hood, beak split in an upper/lower wedge).
const seeds1024 = [
  [500, 600, BODY, 'body'],
  [420, 150, BODY, 'head-hood'],
  [700, 460, BEAK, 'beak-upper'],
  [720, 500, BEAK, 'beak-lower'],
];

// poussin-taco-master.png is a differently-framed portrait canvas (3508x4700, not a square
// crop like the 1024 icons) — seeds picked directly against a proportionally-resized preview
// of that file, not reused/rescaled from the square-crop seeds above.
const masterScale = 3508 / 1024;
const seedsMasterPreview1024 = [
  [400, 750, BODY, 'body'],
  [400, 150, BODY, 'head-hood'],
  [770, 580, BEAK, 'beak-upper'],
  [800, 650, BEAK, 'beak-lower'],
];
const seedsMaster = seedsMasterPreview1024.map(([x, y, c, l]) => [Math.round(x * masterScale), Math.round(y * masterScale), c, l]);

await process(join(rawDir, 'taco-chick-master-1024.png'), join(outDir, 'taco-chick-master-1024.png'), seeds1024);
await process(join(rawDir, 'icon-cream-1024.png'), join(outDir, 'icon-cream-1024.png'), seeds1024);
await process(join(rawDir, 'icon-apricot-1024.png'), join(outDir, 'icon-apricot-1024.png'), seeds1024);
await process(join(rawDir, 'poussin-taco-master.png'), join(outDir, 'poussin-taco-master.png'), seedsMaster);

console.log('done');
