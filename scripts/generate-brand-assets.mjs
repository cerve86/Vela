#!/usr/bin/env node
/**
 * Rasterises the Vela mark into the PNGs Expo and the App Store need.
 *
 * The mark is defined once, as path data in packages/shared/src/brand.ts. Everything here
 * is derived from it, so nudging a curve updates the icon, the splash and the favicon
 * together instead of leaving three hand-exported files to drift.
 *
 *   npm run brand:assets
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Read the geometry straight out of the TypeScript source rather than importing it: this
// script runs on plain node, and the module is deliberately free of anything but strings.
const brandSource = await import('node:fs/promises').then((fs) =>
  fs.readFile(resolve(root, 'packages/shared/src/brand.ts'), 'utf8'),
);
const grab = (name) => {
  const m = new RegExp(`export const ${name} =\\s*\\n?\\s*'([^']+)'`).exec(brandSource);
  if (!m) throw new Error(`could not find ${name} in brand.ts`);
  return m[1];
};

const SAIL_JIB = grab('SAIL_JIB');
const SAIL_MAIN = grab('SAIL_MAIN');
const VIEWBOX = 96;

/**
 * Colours come out of the same file as the geometry.
 *
 * They used to be copied here as literals, which is how every generated asset stayed coral
 * through a repaint: `brand.ts` moved to blue, `npm run brand:assets` cheerfully rebuilt
 * the icon from its own private copy, and the only symptom was a red app icon nobody had
 * asked for. Two sources of truth for one colour will always drift; the fix is to have one.
 */
const grabFill = (mode, sail) => {
  const block = new RegExp(`${mode}:\\s*\\{([^}]*)\\}`).exec(brandSource);
  if (!block) throw new Error(`could not find BRAND_FILLS.${mode} in brand.ts`);
  const m = new RegExp(`${sail}:\\s*'([^']+)'`).exec(block[1]);
  if (!m) throw new Error(`could not find ${mode}.${sail} in brand.ts`);
  return m[1];
};

const GROUND = grab('BRAND_GROUND');
const ON_BRAND = { jib: grabFill('onBrand', 'jib'), main: grabFill('onBrand', 'main') };
const ON_LIGHT = { jib: grabFill('onLight', 'jib'), main: grabFill('onLight', 'main') };

function svg({ size, fills, ground, inset = 0 }) {
  const scale = 1 - inset * 2;
  const offset = VIEWBOX * inset;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">` +
      (ground ? `<rect width="${VIEWBOX}" height="${VIEWBOX}" fill="${ground}"/>` : '') +
      `<g transform="translate(${offset} ${offset}) scale(${scale})">` +
      `<path d="${SAIL_JIB}" fill="${fills.jib}"/>` +
      `<path d="${SAIL_MAIN}" fill="${fills.main}"/>` +
      `</g></svg>`,
  );
}

const OUT = resolve(root, 'apps/mobile/assets/images');
await mkdir(OUT, { recursive: true });

const jobs = [
  // The App Store icon must be opaque and square with no transparency and no rounding —
  // iOS applies the squircle mask itself, and a pre-rounded icon shows dark corners.
  {
    file: 'icon.png',
    size: 1024,
    fills: ON_BRAND,
    ground: GROUND,
    inset: 0.17,
    note: 'App Store / home screen',
  },
  // The splash mark is drawn on the same coral, so the launch is one flat colour with the
  // sails on it rather than a card floating on a different ground.
  {
    file: 'splash-icon.png',
    size: 512,
    fills: ON_BRAND,
    ground: null,
    inset: 0.06,
    note: 'splash (background comes from app.json)',
  },
  {
    file: 'adaptive-icon.png',
    size: 1024,
    fills: ON_BRAND,
    ground: GROUND,
    inset: 0.24,
    note: 'Android adaptive foreground — extra inset for the mask',
  },
  {
    file: 'favicon.png',
    size: 96,
    fills: ON_BRAND,
    ground: GROUND,
    inset: 0.18,
    note: 'web favicon',
  },
];

for (const job of jobs) {
  const buf = await sharp(svg(job)).png().toBuffer();
  await writeFile(resolve(OUT, job.file), buf);
  console.log(`  ${job.file.padEnd(20)} ${job.size}px  ${job.note}`);
}

// The portal gets the light mark as an SVG — it is served as a file, so there is no reason
// to ship a raster of something that is already vector.
const webPublic = resolve(root, 'apps/web/public');
await mkdir(webPublic, { recursive: true });
await writeFile(
  resolve(webPublic, 'vela-mark.svg'),
  svg({ size: 96, fills: ON_LIGHT, ground: null }).toString(),
);
await writeFile(
  resolve(webPublic, 'icon.svg'),
  svg({ size: 96, fills: ON_BRAND, ground: GROUND, inset: 0.18 }).toString(),
);
console.log('  vela-mark.svg        vector    portal');
console.log('  icon.svg             vector    portal favicon');
