import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..', '..');
export const HERO_CRUISE_OUTPUT_ROOT = path.join(
  repositoryRoot,
  'assets',
  'packages',
  'breckenridge',
  'images',
  'ship'
);
const TILE_WIDTH = 960;
const TILE_HEIGHT = 600;
const STAR_COLORS = Object.freeze(['#fff7e8', '#e9f2ff', '#bfd7ff']);

const profiles = Object.freeze({
  far: Object.freeze({ seed: 0x7456f001, count: 230, radius: [0.22, 0.72], opacity: [0.28, 0.68] }),
  near: Object.freeze({ seed: 0x7456a002, count: 92, radius: [0.55, 1.65], opacity: [0.45, 0.88] })
});

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random, [minimum, maximum]) {
  return minimum + ((maximum - minimum) * random());
}

function format(value) {
  return Number(value.toFixed(3));
}

function wrappedOffsets(position, radius, extent) {
  const offsets = [0];
  if (position - radius < 0) offsets.push(extent);
  if (position + radius > extent) offsets.push(-extent);
  return offsets;
}

function createStarTile(profile) {
  const random = mulberry32(profile.seed);
  const circles = [];
  for (let index = 0; index < profile.count; index += 1) {
    const x = random() * TILE_WIDTH;
    const y = random() * TILE_HEIGHT;
    const radius = between(random, profile.radius);
    const opacity = between(random, profile.opacity);
    const color = STAR_COLORS[Math.floor(random() * STAR_COLORS.length)];
    for (const offsetX of wrappedOffsets(x, radius, TILE_WIDTH)) {
      for (const offsetY of wrappedOffsets(y, radius, TILE_HEIGHT)) {
        circles.push(`    <circle cx="${format(x + offsetX)}" cy="${format(y + offsetY)}" r="${format(radius)}" fill="${color}" opacity="${format(opacity)}"/>`);
      }
    }
  }
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">',
    '  <g aria-hidden="true">',
    ...circles,
    '  </g>',
    '</svg>',
    ''
  ].join('\n');
}

function createSunlightPass() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1672" height="941" viewBox="0 0 1672 941">',
    '  <defs>',
    '    <radialGradient id="sunHalo" gradientUnits="userSpaceOnUse" cx="1540" cy="175" r="900">',
    '      <stop offset="0" stop-color="#fff4d8" stop-opacity="0.78"/>',
    '      <stop offset="0.12" stop-color="#ffd7a3" stop-opacity="0.36"/>',
    '      <stop offset="0.42" stop-color="#f4a979" stop-opacity="0.12"/>',
    '      <stop offset="1" stop-color="#f4a979" stop-opacity="0"/>',
    '    </radialGradient>',
    '    <linearGradient id="sunWash" gradientUnits="userSpaceOnUse" x1="1672" y1="0" x2="260" y2="941">',
    '      <stop offset="0" stop-color="#fff0cf" stop-opacity="0.34"/>',
    '      <stop offset="0.38" stop-color="#ffc995" stop-opacity="0.10"/>',
    '      <stop offset="0.78" stop-color="#f1a16f" stop-opacity="0.025"/>',
    '      <stop offset="1" stop-color="#f1a16f" stop-opacity="0"/>',
    '    </linearGradient>',
    '  </defs>',
    '  <rect width="1672" height="941" fill="url(#sunHalo)"/>',
    '  <rect width="1672" height="941" fill="url(#sunWash)"/>',
    '</svg>',
    ''
  ].join('\n');
}

export function createHeroCruiseAssets() {
  return Object.freeze({
    'uss-breckenridge.hero-stars-far.svg': createStarTile(profiles.far),
    'uss-breckenridge.hero-stars-near.svg': createStarTile(profiles.near),
    'uss-breckenridge.hero-sunlight.svg': createSunlightPass()
  });
}

export function writeHeroCruiseAssets(outputRoot = HERO_CRUISE_OUTPUT_ROOT) {
  const assets = createHeroCruiseAssets();
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const [filename, contents] of Object.entries(assets)) {
    fs.writeFileSync(path.join(outputRoot, filename), contents);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  writeHeroCruiseAssets();
  console.log('Generated deterministic Breckenridge hero cruise assets.');
}
