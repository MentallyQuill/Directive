import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readText(filePath) {
  return fs.readFileSync(path.resolve(root, filePath), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function exists(filePath) {
  return fs.existsSync(path.resolve(root, filePath));
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

const packageRoots = [
  'manifest',
  'ship',
  'crew',
  'characterCreation',
  'world',
  'storyArcs',
  'questTemplates',
  'threadTemplates',
  'reactionRules',
  'directorCards',
  'contextPolicy',
  'guardrails',
  'assets'
];
for (const rootKey of packageRoots) {
  assert.ok(packageData[rootKey], `package root ${rootKey} should exist`);
}
assert.equal(packageData.manifest.schemaVersion, 2);
assert.equal(packageData.mainCampaign, undefined);
assert.equal(packageData.sideMissionRules, undefined);
assert.equal(packageData.missionTemplates, undefined);

const projectionRoots = [
  'worldState',
  'storyArcLedger',
  'questLedger',
  'dynamicQuestCatalog',
  'knowledgeLedger',
  'threadLedger',
  'eventLedger',
  'attentionState',
  'runtimeTracking'
];
for (const rootKey of projectionRoots) {
  assert.ok(projection.initialState[rootKey], `projection root ${rootKey} should exist`);
}
assert.equal(projection.initialState.mainCampaign, undefined);
assert.equal(projection.initialState.sideMissions, undefined);

for (const legacyPath of [
  'src/side-missions',
  'src/pressures/open-orders-review.mjs',
  'src/pressures/open-orders-scene.mjs',
  'src/pressures/open-orders-resolution.mjs',
  'src/pressures/side-mission-candidates.mjs',
  'schemas/campaign/main-campaign.schema.json',
  'schemas/packages/side-mission-rules.schema.json'
]) {
  assert.equal(exists(legacyPath), false, `${legacyPath} should not exist after schema-v2 conversion`);
}

const gateSource = readText('tools/scripts/run-alpha-gate.mjs');
const gateChecks = [...gateSource.matchAll(/'([^']+\.mjs)'/g)].map((match) => match[1]);
assert.ok(gateChecks.length >= 94, 'alpha gate should keep broad coverage after conversion');
for (const required of [
  'test-open-world-model-contracts.mjs',
  'test-open-world-thread-engine.mjs',
  'test-open-world-dynamic-quest-e2e.mjs',
  'test-open-world-delegation-lifecycle.mjs',
  'test-open-world-context-budget.mjs',
  'test-scene-reconciliation-open-world.mjs'
]) {
  assert.ok(gateChecks.includes(required), `alpha gate should include ${required}`);
}

console.log('Schema-v2 conversion preflight passed: roots, legacy removals, and gate coverage');
