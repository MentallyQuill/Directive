import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(absolutePath));
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(absolutePath);
  }
  return files;
}

for (const absolutePath of await sourceFiles(path.join(repoRoot, 'src'))) {
  const relativePath = path.relative(repoRoot, absolutePath);
  const source = await readFile(absolutePath, 'utf8');
  for (const obsolete of [
    'saveGameAs',
    'saveTerminalBranch',
    'Save as branch',
    'Save Game As',
    'saveterminalbranch',
    'hideCampaignSession',
    'showCampaignSession'
  ]) {
    assert.equal(
      source.includes(obsolete),
      false,
      `${relativePath} must not retain obsolete mutable-branch contract: ${obsolete}`
    );
  }
}

console.log('Forward-only save contract tests passed: production exposes checkpoints, not mutable save branches.');
