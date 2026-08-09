import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildAshesV1MigrationInventory } from './inventory-ashes-v1-migration.mjs';

const packageData = JSON.parse(fs.readFileSync(
  'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
  'utf8',
));
const projection = JSON.parse(fs.readFileSync(
  'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
  'utf8',
));
const missionGraph = JSON.parse(fs.readFileSync(
  'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
  'utf8',
));
const migrationMap = JSON.parse(fs.readFileSync(
  'packages/bundled/breckenridge/v1/prelude-hesperus-migration-map.json',
  'utf8',
));
const sourceRecords = [
  'src/runtime/source-settlement-latest-pair-validation.mjs',
  'src/runtime/turn-commit-coordinator.mjs',
  'src/mission/phase-advancement.mjs',
  'src/quests/quest-ledger.mjs',
  'src/generation/player-safe-prompt-context-builder.mjs',
  'src/runtime/source-settlement-latest-pair-scene-adapter.mjs',
  'src/ui/mission-panel.js',
  'src/ui/crew-panel.js',
].map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));

const inventory = buildAshesV1MigrationInventory({
  packageData,
  projection,
  missionGraph,
  migrationMap,
  sourceRecords,
});

assert.equal(inventory.kind, 'directive.ashesV1MigrationInventory.v1');
assert.equal(inventory.schemaVersion, 1);
assert.equal(inventory.legacyIds.phases.length, 10);
assert.equal(inventory.legacyIds.facts.length, 13);
assert.equal(inventory.legacyIds.decisionPoints.length, 8);
assert.equal(inventory.legacyIds.outcomeFlags.length, 12);
assert.equal(inventory.legacyIds.pressures.length, 2);
assert.equal(inventory.legacyIds.questObjectives.length, 5);
assert.deepEqual(inventory.unmappedIds, []);

const spoilerPaths = inventory.spoilerFindings.map((item) => item.path);
assert.equal(spoilerPaths.includes('package.questTemplates.prelude.objectives[2].summary'), true);
assert.equal(spoilerPaths.includes('projection.initialState.questLedger.prelude.objectives[2].summary'), true);
assert.equal(inventory.spoilerFindings.every((item) => /fraud|falsif|inspection/i.test(item.text)), true);

const writerPaths = new Set(inventory.writerFindings.map((item) => item.path));
assert.equal(writerPaths.has('ship.technicalDebt'), true);
assert.equal(writerPaths.has('threadLedger.records'), true);
assert.equal(writerPaths.has('relationships'), true);
assert.equal(writerPaths.has('mission.activePhaseId'), true);
assert.equal(writerPaths.has('questLedger.instances'), true);
assert.equal(inventory.writerFindings.every((item) => item.disposition), true);
assert.equal(inventory.writerFindings.some((item) => item.file.startsWith('src/ui/')), false);
assert.equal(inventory.writerFindings.some((item) => item.file.startsWith('src/generation/')), false);
assert.equal(
  inventory.writerFindings.filter((item) => item.path === 'questLedger.instances').map((item) => item.file).join(','),
  'src/quests/quest-ledger.mjs',
);

assert.equal(Array.isArray(inventory.consumerFindings), true);
const consumerPaths = new Set(inventory.consumerFindings.map((item) => item.path));
assert.equal(consumerPaths.has('mission.formalObjectives'), true);
assert.equal(consumerPaths.has('questLedger.instances'), true);
assert.equal(consumerPaths.has('ship.technicalDebt'), true);
assert.equal(consumerPaths.has('threadLedger.records'), true);
assert.equal(consumerPaths.has('relationships'), true);
assert.equal(inventory.consumerFindings.every((item) => item.disposition), true);
assert.deepEqual(inventory.unmappedWriters, []);
assert.deepEqual(inventory.unmappedConsumers, []);

const invalidMap = structuredClone(migrationMap);
invalidMap.entries[0].disposition = 'copyLegacyShape';
const invalidInventory = buildAshesV1MigrationInventory({
  packageData,
  projection,
  missionGraph,
  migrationMap: invalidMap,
  sourceRecords,
});
assert.deepEqual(invalidInventory.invalidDispositions, [{
  sourceCollection: 'phases',
  sourceId: 'shuttle-rendezvous',
  disposition: 'copyLegacyShape',
}]);

console.log('Ashes V1 migration inventory tests passed.');
