import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_ROOT = path.join(REPO_ROOT, 'src');
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.tsx']);

const LEGACY_SILLYTAVERN_FILES = new Set([
  'src/extension/bootstrap.js',
  'src/generation/narration.mjs',
  'src/providers/sillytavern-narration-provider.mjs',
  'src/runtime/runtime-app.mjs',
  'src/storage/directive-file-api.mjs',
  'src/storage/directive-storage-filenames.mjs',
  'src/storage/directive-storage-repository.mjs',
  'src/storage/logical-storage-paths.mjs'
]);

function toRepoPath(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

async function listSourceFiles(dir = SOURCE_ROOT) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isUnder(repoPath, dir) {
  return repoPath === dir || repoPath.startsWith(`${dir}/`);
}

function findLineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function collectMatches({ repoPath, source, pattern, allowed }) {
  const matches = [];
  for (const match of source.matchAll(pattern)) {
    if (!allowed(repoPath, match)) {
      matches.push({
        file: repoPath,
        line: findLineNumber(source, match.index),
        text: match[0]
      });
    }
  }
  return matches;
}

const checks = [
  {
    label: 'SillyTavern references must stay in the current legacy adapter baseline or future SillyTavern host adapter',
    pattern: /\bSillyTavern\b|globalThis\.SillyTavern|sillytavern-narration-provider/g,
    allowed: (repoPath) => (
      isUnder(repoPath, 'src/hosts/sillytavern')
      || LEGACY_SILLYTAVERN_FILES.has(repoPath)
    )
  },
  {
    label: 'Lumiverse spindle references must stay inside the future Lumiverse host adapter',
    pattern: /\bspindle\b/g,
    allowed: (repoPath) => isUnder(repoPath, 'src/hosts/lumiverse')
  },
  {
    label: 'SillyTavern files API routes must stay in the file API baseline or future SillyTavern host adapter',
    pattern: /\/api\/files\/(?:upload|verify|delete)/g,
    allowed: (repoPath) => (
      repoPath === 'src/storage/directive-file-api.mjs'
      || isUnder(repoPath, 'src/hosts/sillytavern')
    )
  },
  {
    label: 'SillyTavern /user/files paths must stay in storage mapping code or future SillyTavern host adapter',
    pattern: /\/user\/files\//g,
    allowed: (repoPath) => (
      repoPath === 'src/storage/directive-storage-filenames.mjs'
      || repoPath === 'src/storage/directive-storage-repository.mjs'
      || repoPath === 'src/storage/logical-storage-paths.mjs'
      || isUnder(repoPath, 'src/hosts/sillytavern')
    )
  }
];

const files = await listSourceFiles();
const violations = [];

for (const file of files) {
  const repoPath = toRepoPath(file);
  const source = await readFile(file, 'utf8');
  for (const check of checks) {
    violations.push(...collectMatches({
      repoPath,
      source,
      pattern: check.pattern,
      allowed: check.allowed
    }).map((violation) => ({
      ...violation,
      check: check.label
    })));
  }
}

assert.deepEqual(
  violations,
  [],
  violations.map((violation) => (
    `${violation.file}:${violation.line} ${violation.check}: ${violation.text}`
  )).join('\n')
);

console.log('Host import boundary tests passed.');
