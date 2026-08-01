import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const routeRenderers = [
  'campaign-panel.js',
  'character-creator-panel.js',
  'mission-panel.js',
  'crew-panel.js',
  'ship-panel.js',
  'settings-panel.js'
];

for (const fileName of routeRenderers) {
  const sourcePath = fileURLToPath(new URL(`../../src/ui/${fileName}`, import.meta.url));
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.doesNotMatch(source, /appendSectionTitle/, `${fileName} must not add a nested route page title`);
}

console.log('Route title hierarchy tests passed.');
