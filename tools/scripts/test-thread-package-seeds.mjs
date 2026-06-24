import fs from 'node:fs';
import path from 'node:path';
import { createSeededThreadLedger } from '../../src/threads/thread-package-seeds.mjs';

const root = process.cwd();
const errors = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function stable(value) {
  return JSON.stringify(value);
}

function at(location, message) {
  errors.push(`${location}: ${message}`);
}

function requireEqual(actual, expected, location) {
  if (stable(actual) !== stable(expected)) {
    at(location, `got ${stable(actual)}, expected ${stable(expected)}`);
  }
}

function requireTruthy(value, location) {
  if (!value) {
    at(location, 'expected truthy value');
  }
}

const bundledPackages = [
  'packages/bundled/aster-vale/unseen-border.campaign-package.json',
  'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
  'packages/bundled/celandine/enemys-garden.campaign-package.json',
  'packages/bundled/eudora-vale/broken-accord.campaign-package.json',
  'packages/bundled/glass-harbor/drowned-constellation.campaign-package.json',
  'packages/bundled/serein/black-current.campaign-package.json'
];

for (const packagePath of bundledPackages) {
  const packageData = readJson(packagePath);
  const templates = packageData.threadTemplates?.templates || [];
  const seedTemplates = templates.filter((template) => template.authoredSeed);
  const ledger = createSeededThreadLedger(packageData);
  requireEqual(ledger.records.length, seedTemplates.length, `${packagePath} seeded record count`);
  if (seedTemplates[0]?.authoredSeed === true) {
    requireEqual(ledger.records[0].id, seedTemplates[0].id, `${packagePath} boolean seed id`);
  }
  for (const record of ledger.records) {
    requireTruthy(record.observableSeed, `${packagePath} ${record.id} observableSeed`);
    requireTruthy(record.storyQuestion, `${packagePath} ${record.id} storyQuestion`);
    requireTruthy(record.naturalTrigger, `${packagePath} ${record.id} naturalTrigger`);
    requireTruthy(record.supportingEvidence[0]?.summary, `${packagePath} ${record.id} evidence summary`);
  }
}

const explicitSeedLedger = createSeededThreadLedger({
  threadTemplates: {
    templates: [{
      id: 'explicit-object-seed',
      title: 'Explicit Seed',
      tags: ['test'],
      authoredSeed: {
        id: 'thread.seed.explicit',
        status: 'available',
        shape: 'vignette',
        type: 'professional_dilemma',
        participants: ['officer-a'],
        observableSeed: 'An officer keeps returning to a disputed maintenance report.',
        storyQuestion: 'Will the report become a command issue?',
        naturalTrigger: 'When maintenance logs are reviewed.'
      }
    }]
  }
});

requireEqual(explicitSeedLedger.records[0].id, 'thread.seed.explicit', 'explicit seed id');
requireEqual(explicitSeedLedger.records[0].status, 'available', 'explicit seed status');
requireEqual(explicitSeedLedger.records[0].participantIds, ['officer-a'], 'explicit seed participants');
requireEqual(
  explicitSeedLedger.records[0].observableSeed,
  'An officer keeps returning to a disputed maintenance report.',
  'explicit seed observableSeed'
);

if (errors.length) {
  console.error(`Thread package seed tests failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  process.exit(1);
}

console.log('Thread package seed tests passed.');
