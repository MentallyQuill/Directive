import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { stableSha256Hex, stableHash24 } from '../../src/runtime/v1-stable-hash.mjs';

const sourceRoot = path.resolve('src');
const productionModules = [];

function collectModules(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectModules(absolutePath);
    if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) productionModules.push(absolutePath);
  }
}

collectModules(sourceRoot);

for (const modulePath of productionModules) {
  const source = fs.readFileSync(modulePath, 'utf8');
  assert.doesNotMatch(source, /(?:from\s+|import\s*\()["']node:/,
    `${path.relative(process.cwd(), modulePath)} must not import a Node-only builtin`);
}

assert.equal(
  stableSha256Hex(''),
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'browser-safe SHA-256 must match the empty-string standard vector',
);
assert.equal(
  stableSha256Hex('abc'),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'browser-safe SHA-256 must match the abc standard vector',
);
assert.equal(stableHash24('abc'), 'ba7816bf8f01cfea414140de');

console.log(`Browser runtime safety passed for ${productionModules.length} production modules.`);
