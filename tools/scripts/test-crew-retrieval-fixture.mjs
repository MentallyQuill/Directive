import fs from 'node:fs';
import path from 'node:path';
import { buildAudienceGateReport } from '../../src/retrieval/packet-builder.mjs';

const DEFAULT_FIXTURE_DIR = 'tests/fixtures/retrieval';

const root = process.cwd();
const fixturePaths = process.argv.length > 2
  ? process.argv.slice(2).map((fixture) => path.resolve(root, fixture))
  : fs.readdirSync(path.resolve(root, DEFAULT_FIXTURE_DIR))
    .filter((fileName) => fileName.endsWith('.fixture.json'))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => path.resolve(root, DEFAULT_FIXTURE_DIR, fileName));

const errors = [];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${path.relative(root, filePath)} is not valid JSON: ${error.message}`);
  }
}

function rel(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function at(location, message) {
  errors.push(`${location}: ${message}`);
}

function sorted(value) {
  return [...(Array.isArray(value) ? value : [])].sort((a, b) => String(a).localeCompare(String(b)));
}

function sameArray(actual, expected) {
  const a = sorted(actual);
  const e = sorted(expected);
  return a.length === e.length && a.every((value, index) => value === e[index]);
}

function assertSelection(actual, expected, location) {
  for (const [audience, expectedIds] of Object.entries(expected || {})) {
    const actualIds = actual[audience] || [];
    if (!sameArray(actualIds, expectedIds)) {
      at(location, `${audience} selected ${JSON.stringify(sorted(actualIds))}, expected ${JSON.stringify(sorted(expectedIds))}`);
    }
  }
}

function assertBlocked(actual, expected, location) {
  for (const [audience, expectedBlocks] of Object.entries(expected || {})) {
    const actualBlocks = actual[audience] || [];
    for (const expectedBlock of expectedBlocks) {
      const found = actualBlocks.some((block) => block.id === expectedBlock.id && block.reason === expectedBlock.reason);
      if (!found) {
        at(location, `${audience} missing blocked card ${expectedBlock.id} with reason ${expectedBlock.reason}`);
      }
    }
  }
}

function assertForbidden(actual, forbidden, location) {
  for (const [audience, ids] of Object.entries(forbidden || {})) {
    const selected = new Set(actual[audience] || []);
    for (const id of ids) {
      if (selected.has(id)) {
        at(location, `${audience} must not select forbidden card ${id}`);
      }
    }
  }
}

for (const fixturePath of fixturePaths) {
  const fixture = readJson(fixturePath);
  const dataset = readJson(path.resolve(root, fixture.datasetPath));
  const result = buildAudienceGateReport({
    cards: dataset.cards || [],
    sceneSnapshot: fixture.sceneSnapshot || {},
    audiences: fixture.sceneSnapshot?.audiences || []
  });

  assertSelection(result.selectedByAudience, fixture.expected?.selectedByAudience, `${rel(fixturePath)} $.expected.selectedByAudience`);
  assertBlocked(result.blockedByAudience, fixture.expected?.blockedByAudience, `${rel(fixturePath)} $.expected.blockedByAudience`);
  assertForbidden(result.selectedByAudience, fixture.expected?.forbiddenByAudience, `${rel(fixturePath)} $.expected.forbiddenByAudience`);
}

if (errors.length > 0) {
  console.error('Crew retrieval fixture validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Crew retrieval fixtures passed: ${fixturePaths.map((fixturePath) => rel(fixturePath)).join(', ')}`);
