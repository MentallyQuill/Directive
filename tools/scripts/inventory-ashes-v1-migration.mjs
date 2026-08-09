import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ASHES_V1_MIGRATION_INVENTORY_KIND = 'directive.ashesV1MigrationInventory.v1';
export const ASHES_V1_MIGRATION_DISPOSITIONS = Object.freeze(new Set([
  'migrateDefinition',
  'migrateEffect',
  'deriveProjection',
  'mergeAggregate',
  'retainSource',
  'retire',
  'deferV1',
]));

const CANONICAL_PATHS = Object.freeze({
  packageData: 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
  projection: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
  missionGraph: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
  migrationMap: 'packages/bundled/breckenridge/v1/prelude-hesperus-migration-map.json',
});
const CANONICAL_SOURCE_FILES = Object.freeze([
  'src/runtime/source-settlement-latest-pair-validation.mjs',
  'src/runtime/scene-handshake-settler.mjs',
  'src/runtime/turn-commit-coordinator.mjs',
  'src/mission/phase-advancement.mjs',
  'src/quests/quest-ledger.mjs',
  'src/generation/player-safe-prompt-context-builder.mjs',
  'src/runtime/source-settlement-latest-pair-scene-adapter.mjs',
  'src/ui/mission-panel.js',
  'src/ui/crew-panel.js',
]);

function sortedIds(records = []) {
  return records
    .map((record) => String(record?.id || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function preludeTemplate(packageData) {
  return (packageData?.questTemplates?.templates || [])
    .find((template) => template?.id === 'prelude-a-ship-underway') || null;
}

function inventoryIdentityRecords(legacyIds) {
  return Object.entries(legacyIds).flatMap(([collection, ids]) => (
    ids.map((id) => ({ collection, id, key: `${collection}:${id}` }))
  ));
}

const PLAYER_COPY_SPOILER_PATTERN = /\b(?:fraud|falsif(?:y|ied|ication)?|inspection)\b/i;
const WRITER_PATTERNS = Object.freeze([
  {
    path: 'ship.technicalDebt',
    filePattern: /(?:scene-handshake-settler|source-settlement-latest-pair-validation)\.mjs$/,
    pattern: /path:\s*'ship\.technicalDebt'/,
  },
  {
    path: 'threadLedger.records',
    filePattern: /(?:scene-handshake-settler|source-settlement-latest-pair-validation)\.mjs$/,
    pattern: /path:\s*'threadLedger\.records'/,
  },
  {
    path: 'relationships',
    filePattern: /turn-commit-coordinator\.mjs$/,
    pattern: /relationshipMemoryFromTurn|explicitRelationshipOperations/,
  },
  {
    path: 'mission.activePhaseId',
    filePattern: /phase-advancement\.mjs$/,
    pattern: /activePhaseId\s*===/,
  },
  {
    path: 'questLedger.instances',
    filePattern: /quests\/quest-ledger\.mjs$/,
    pattern: /instances/,
  },
]);
const CONSUMER_PATTERNS = Object.freeze([
  { path: 'mission.formalObjectives', pattern: /formalObjectives/ },
  { path: 'questLedger.instances', pattern: /questLedger[^\n]{0,80}instances/ },
  { path: 'ship.technicalDebt', pattern: /ship[^\n]{0,80}technicalDebt/ },
  { path: 'threadLedger.records', pattern: /threadLedger[^\n]{0,80}records/ },
  { path: 'relationships', pattern: /relationships[^\n]{0,80}(?:seniorCrew|memoryLedger|perceptionLedger)/ },
]);

function playerCopySpoilerFindings(packageData, projection) {
  const findings = [];
  const prelude = preludeTemplate(packageData);
  const packageCandidates = [
    { path: 'package.questTemplates.prelude.playerSummary', text: prelude?.playerSummary },
    ...(prelude?.objectives || []).flatMap((objective, index) => [
      { path: `package.questTemplates.prelude.objectives[${index}].summary`, text: objective?.summary },
      { path: `package.questTemplates.prelude.objectives[${index}].label`, text: objective?.label },
      { path: `package.questTemplates.prelude.objectives[${index}].playerText`, text: objective?.playerText },
    ]),
  ];
  const projectedPrelude = (projection?.initialState?.questLedger?.instances || [])
    .find((quest) => quest?.id === 'prelude-a-ship-underway');
  const projectionCandidates = [
    { path: 'projection.initialState.questLedger.prelude.playerSummary', text: projectedPrelude?.playerSummary },
    ...(projectedPrelude?.objectiveStates || []).map((objective, index) => ({
      path: `projection.initialState.questLedger.prelude.objectives[${index}].summary`,
      text: objective?.summary,
    })),
  ];
  for (const candidate of [...packageCandidates, ...projectionCandidates]) {
    if (typeof candidate.text === 'string' && PLAYER_COPY_SPOILER_PATTERN.test(candidate.text)) {
      findings.push(candidate);
    }
  }
  return findings.sort((left, right) => left.path.localeCompare(right.path));
}

function writerFindings(sourceRecords, migrationMap) {
  const dispositions = new Map(
    (migrationMap?.writerDispositions || []).map((item) => [item.path, item.disposition]),
  );
  const findings = [];
  for (const source of Array.isArray(sourceRecords) ? sourceRecords : []) {
    for (const rule of WRITER_PATTERNS) {
      if (!rule.filePattern.test(String(source?.file || '').replaceAll('\\', '/'))) continue;
      if (!rule.pattern.test(String(source?.text || ''))) continue;
      findings.push({
        file: String(source?.file || ''),
        path: rule.path,
        disposition: dispositions.get(rule.path) || null,
      });
    }
  }
  return findings.sort((left, right) => (
    left.path.localeCompare(right.path) || left.file.localeCompare(right.file)
  ));
}

function consumerFindings(sourceRecords, migrationMap) {
  const dispositions = new Map(
    (migrationMap?.consumerDispositions || []).map((item) => [item.path, item.disposition]),
  );
  const findings = [];
  for (const source of Array.isArray(sourceRecords) ? sourceRecords : []) {
    for (const rule of CONSUMER_PATTERNS) {
      if (!rule.pattern.test(String(source?.text || ''))) continue;
      findings.push({
        file: String(source?.file || ''),
        path: rule.path,
        disposition: dispositions.get(rule.path) || null,
      });
    }
  }
  return findings.sort((left, right) => (
    left.path.localeCompare(right.path) || left.file.localeCompare(right.file)
  ));
}

export function buildAshesV1MigrationInventory({
  packageData = {},
  projection = {},
  missionGraph = {},
  sourceRecords = [],
  migrationMap = {},
} = {}) {
  const prelude = preludeTemplate(packageData);
  const legacyIds = {
    phases: sortedIds(missionGraph.phases),
    facts: sortedIds(missionGraph.facts),
    decisionPoints: sortedIds(missionGraph.decisionPoints),
    commandDecisions: sortedIds(missionGraph.commandDecisions),
    outcomeFlags: sortedIds(missionGraph.outcomeFlags),
    pressures: sortedIds(missionGraph.pressures),
    endStates: sortedIds(missionGraph.endStates),
    questObjectives: sortedIds(prelude?.objectives),
  };
  const mapEntries = Array.isArray(migrationMap?.entries) ? migrationMap.entries : [];
  const mappedKeys = new Set(mapEntries.map((entry) => `${entry.sourceCollection}:${entry.sourceId}`));
  const unmappedIds = inventoryIdentityRecords(legacyIds)
    .filter((record) => !mappedKeys.has(record.key))
    .map(({ collection, id }) => ({ collection, id }));
  const writers = writerFindings(sourceRecords, migrationMap);
  const consumers = consumerFindings(sourceRecords, migrationMap);
  const invalidDispositions = mapEntries
    .filter((entry) => !ASHES_V1_MIGRATION_DISPOSITIONS.has(entry?.disposition))
    .map((entry) => ({
      sourceCollection: entry?.sourceCollection || null,
      sourceId: entry?.sourceId || null,
      disposition: entry?.disposition || null,
    }));

  return {
    kind: ASHES_V1_MIGRATION_INVENTORY_KIND,
    schemaVersion: 1,
    sourcePackageId: packageData?.manifest?.id || null,
    sourceProjectionId: projection?.manifest?.id || null,
    sourceMissionGraphId: missionGraph?.id || null,
    legacyIds,
    migrationEntries: structuredClone(mapEntries),
    spoilerFindings: playerCopySpoilerFindings(packageData, projection),
    writerFindings: writers,
    consumerFindings: consumers,
    sourceRecordCount: Array.isArray(sourceRecords) ? sourceRecords.length : 0,
    unmappedIds,
    unmappedWriters: writers.filter((item) => !item.disposition).map(({ file, path: writerPath }) => ({
      file,
      path: writerPath,
    })),
    unmappedConsumers: consumers.filter((item) => !item.disposition).map(({ file, path: consumerPath }) => ({
      file,
      path: consumerPath,
    })),
    invalidDispositions,
  };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8'));
}

function runCli() {
  const inventory = buildAshesV1MigrationInventory({
    packageData: readJson(CANONICAL_PATHS.packageData),
    projection: readJson(CANONICAL_PATHS.projection),
    missionGraph: readJson(CANONICAL_PATHS.missionGraph),
    migrationMap: readJson(CANONICAL_PATHS.migrationMap),
    sourceRecords: CANONICAL_SOURCE_FILES.map((file) => ({
      file,
      text: fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'),
    })),
  });
  if (process.argv.includes('--check')) {
    const unmappedCount = inventory.unmappedIds.length
      + inventory.unmappedWriters.length
      + inventory.unmappedConsumers.length
      + inventory.invalidDispositions.length;
    if (unmappedCount > 0) {
      console.error(`Ashes V1 migration inventory has ${unmappedCount} unmapped records.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Ashes V1 migration inventory passed: ${inventory.migrationEntries.length} reviewed mappings.`);
    return;
  }
  console.log(JSON.stringify(inventory, null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) runCli();
