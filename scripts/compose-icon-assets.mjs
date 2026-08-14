#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
//
// One-off: compose resources/{icon-foreground,icon-background,icon-only,splash}.png from the
// corrected taco-chick mascot (.mascot-preview/taco-chick/filled/poussin-taco-master.png), for
// @capacitor/assets to expand into every Android density (adaptive icon layers, legacy icon,
// splash). Not part of the runtime or CI.
//
// Usage:
//   npm install --no-save @capacitor/assets sharp   (dev-only, never in package.json)
//   node scripts/compose-icon-assets.mjs
//   npx capacitor-assets generate --android

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mascotPath = join(root, '.mascot-preview', 'taco-chick', 'filled', 'poussin-taco-master.png');
const resDir = join(root, 'resources');

const CREAM = { r: 0xff, g: 0xfd, b: 0xf9, alpha: 1 };

async function mascotBuffer(boxSize) {
  // Fit the (portrait) mascot inside a boxSize×boxSize box, preserving aspect ratio — matches
  // the ~62% safe-zone scale the previous techno icon-foreground.png used (adaptive icons only
  // guarantee the inner ~66% survives circle/squircle masking; the raw asset's own 5% margin
  // claim was not trustworthy, see the taco-chick fill bug found in the same delivery).
  return sharp(mascotPath).resize({ width: boxSize, height: boxSize, fit: 'inside' }).toBuffer();
}

async function centeredOnCanvas(buf, canvasSize, background) {
  const meta = await sharp(buf).metadata();
  const left = Math.round((canvasSize - meta.width) / 2);
  const top = Math.round((canvasSize - meta.height) / 2);
  return sharp({ create: { width: canvasSize, height: canvasSize, channels: 4, background } })
    .composite([{ input: buf, left, top }])
    .png()
    .toBuffer();
}

const ICON_SIZE = 1024;
const SPLASH_SIZE = 2732;

const iconMascot = await mascotBuffer(Math.round(ICON_SIZE * 0.62));
const splashMascot = await mascotBuffer(Math.round(SPLASH_SIZE * 0.55));

const iconForeground = await centeredOnCanvas(iconMascot, ICON_SIZE, { r: 0, g: 0, b: 0, alpha: 0 });
await sharp(iconForeground).toFile(join(resDir, 'icon-foreground.png'));

await sharp({ create: { width: ICON_SIZE, height: ICON_SIZE, channels: 4, background: CREAM } })
  .png()
  .toFile(join(resDir, 'icon-background.png'));

const iconOnly = await centeredOnCanvas(iconMascot, ICON_SIZE, CREAM);
await sharp(iconOnly).toFile(join(resDir, 'icon-only.png'));

const splash = await centeredOnCanvas(splashMascot, SPLASH_SIZE, CREAM);
await sharp(splash).toFile(join(resDir, 'splash.png'));

console.log('wrote resources/icon-foreground.png, icon-background.png, icon-only.png, splash.png');
