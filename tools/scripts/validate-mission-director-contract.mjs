import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SCHEMA = 'schemas/mission/mission-director-turn.schema.json';
const DEFAULT_FIXTURE_DIR = 'tests/fixtures/mission';
const DEFAULT_CREW_DATASET = 'packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json';

const root = process.cwd();
const schemaPath = path.resolve(root, process.argv[2] || DEFAULT_SCHEMA);
const fixturePaths = process.argv.length > 3
  ? process.argv.slice(3).map((fixture) => path.resolve(root, fixture))
  : fs.readdirSync(path.resolve(root, DEFAULT_FIXTURE_DIR))
    .filter((fileName) => fileName.endsWith('.turn.fixture.json'))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => path.resolve(root, DEFAULT_FIXTURE_DIR, fileName));
const crewDatasetPath = path.resolve(root, DEFAULT_CREW_DATASET);

const errors = [];
const resultBands = new Set([
  'Great Success',
  'Success',
  'Partial Success',
  'Partial Failure',
  'Failure',
  'Great Failure'
]);

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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function idSet(items) {
  return new Set((items || []).map((item) => item && item.id).filter(Boolean));
}

function byId(items) {
  return new Map((items || []).filter((item) => item && item.id).map((item) => [item.id, item]));
}

function requireIncludes(actual, expected, location, label) {
  const actualSet = new Set(actual || []);
  for (const value of expected || []) {
    if (!actualSet.has(value)) {
      at(location, `missing ${label} "${value}"`);
    }
  }
}

const schema = readJson(schemaPath);
const crewDataset = readJson(crewDatasetPath);
const crewCardById = byId(crewDataset.cards);

if (schema.title !== 'Directive Mission Director Turn Contract') {
  at('schema.title', 'must be Directive Mission Director Turn Contract');
}

if (fixturePaths.length === 0) {
  at('fixtures', 'must contain at least one .turn.fixture.json file');
}

for (const fixturePath of fixturePaths) {
  const fixture = readJson(fixturePath);
  const location = rel(fixturePath);
  const graph = readJson(path.resolve(root, fixture.graphPath));
  const projection = readJson(path.resolve(root, fixture.projectionPath));

  if (fixture.contractVersion !== 1) {
    at(`${location} $.contractVersion`, 'must be 1');
  }
  if (fixture.sceneSnapshot?.campaignId !== graph.manifest?.campaignId) {
    at(`${location} $.sceneSnapshot.campaignId`, 'must match graph campaignId');
  }
  if (fixture.sceneSnapshot?.missionId !== graph.manifest?.missionId) {
    at(`${location} $.sceneSnapshot.missionId`, 'must match graph missionId');
  }
  if (fixture.sceneSnapshot?.activeMissionGraphId !== graph.manifest?.id) {
    at(`${location} $.sceneSnapshot.activeMissionGraphId`, 'must match graph id');
  }
  if (projection.initialState?.mission?.activeMissionGraphId !== graph.manifest?.id) {
    at(`${location} $.projectionPath`, 'projection must initialize the same graph id');
  }

  const phaseById = byId(graph.phases);
  const decisionPointById = byId(graph.decisionPoints);
  const factIds = idSet(graph.facts);
  const clockById = byId(graph.clocks);
  const outcomeFlagById = byId(graph.outcomeFlags);
  const commandDecisionById = byId(graph.commandDecisions);

  const phase = phaseById.get(fixture.sceneSnapshot?.activePhaseId);
  if (!phase) {
    at(`${location} $.sceneSnapshot.activePhaseId`, `unknown phase "${fixture.sceneSnapshot?.activePhaseId}"`);
  } else {
    requireIncludes(phase.decisionPointIds, fixture.sceneSnapshot?.activeDecisionPointIds, `${location} $.sceneSnapshot.activeDecisionPointIds`, 'active phase decision point');
  }

  for (const factId of fixture.sceneSnapshot?.knownFactIds || []) {
    if (!factIds.has(factId)) {
      at(`${location} $.sceneSnapshot.knownFactIds`, `unknown fact "${factId}"`);
    }
  }

  const validClassifications = new Set([
    'validWithinMissionBounds',
    'missionRelevantLateralMove',
    'missionAbandoningMove',
    'impossibleOrUnsupportedMove'
  ]);
  if (!validClassifications.has(fixture.actionClassification?.category)) {
    at(`${location} $.actionClassification.category`, `unknown category "${fixture.actionClassification?.category}"`);
  }

  for (const decisionPointId of fixture.directorResponse?.usedDecisionPointIds || []) {
    if (!decisionPointById.has(decisionPointId)) {
      at(`${location} $.directorResponse.usedDecisionPointIds`, `unknown decision point "${decisionPointId}"`);
    }
  }
  for (const factId of fixture.directorResponse?.usedFactIds || []) {
    if (!factIds.has(factId)) {
      at(`${location} $.directorResponse.usedFactIds`, `unknown fact "${factId}"`);
    }
  }
  for (const clockId of fixture.directorResponse?.usedClockIds || []) {
    if (!clockById.has(clockId)) {
      at(`${location} $.directorResponse.usedClockIds`, `unknown clock "${clockId}"`);
    }
  }
  for (const decisionId of fixture.directorResponse?.commandDecisionCandidates || []) {
    if (!commandDecisionById.has(decisionId)) {
      at(`${location} $.directorResponse.commandDecisionCandidates`, `unknown command decision "${decisionId}"`);
    }
  }

  if (fixture.stateDelta?.outcomeId !== fixture.outcomePacket?.id) {
    at(`${location} $.stateDelta.outcomeId`, 'must match outcomePacket.id');
  }
  if (!resultBands.has(fixture.outcomePacket?.resultBand)) {
    at(`${location} $.outcomePacket.resultBand`, `must be one of: ${[...resultBands].join(', ')}`);
  }
  if (fixture.narratorPacket?.sourceOutcomeId !== fixture.outcomePacket?.id) {
    at(`${location} $.narratorPacket.sourceOutcomeId`, 'must match outcomePacket.id');
  }
  if (fixture.commandLogPacket?.sourceOutcomeId !== fixture.outcomePacket?.id) {
    at(`${location} $.commandLogPacket.sourceOutcomeId`, 'must match outcomePacket.id');
  }

  for (const award of fixture.outcomePacket?.commandDecisionAwards || []) {
    const commandDecision = commandDecisionById.get(award.id);
    if (!commandDecision) {
      at(`${location} $.outcomePacket.commandDecisionAwards`, `unknown command decision "${award.id}"`);
      continue;
    }
    if (commandDecision.repeatable !== false) {
      at(`${location} $.outcomePacket.commandDecisionAwards.${award.id}`, 'awarded command decisions must be non-repeatable in this fixture');
    }
    if (commandDecision.track !== 'Either' && commandDecision.track !== award.track) {
      at(`${location} $.outcomePacket.commandDecisionAwards.${award.id}.track`, `must match command decision track ${commandDecision.track}`);
    }
  }

  for (const flag of fixture.stateDelta?.mission?.outcomeFlagsSet || []) {
    const graphFlag = outcomeFlagById.get(flag.id);
    if (!graphFlag) {
      at(`${location} $.stateDelta.mission.outcomeFlagsSet`, `unknown outcome flag "${flag.id}"`);
      continue;
    }
    if (!graphFlag.allowedValues?.includes(flag.value)) {
      at(`${location} $.stateDelta.mission.outcomeFlagsSet.${flag.id}`, `invalid value "${flag.value}"`);
    }
  }

  const phaseAdvance = fixture.stateDelta?.mission?.phaseAdvance;
  if (phaseAdvance) {
    if (!phaseById.has(phaseAdvance.from)) {
      at(`${location} $.stateDelta.mission.phaseAdvance.from`, `unknown phase "${phaseAdvance.from}"`);
    }
    if (!phaseById.has(phaseAdvance.to)) {
      at(`${location} $.stateDelta.mission.phaseAdvance.to`, `unknown phase "${phaseAdvance.to}"`);
    }
    if (fixture.stateDelta?.mission?.activePhaseIdSet !== phaseAdvance.to) {
      at(`${location} $.stateDelta.mission.activePhaseIdSet`, 'must match phaseAdvance.to');
    }
    for (const decisionPointId of phaseAdvance.availableDecisionPointIds || []) {
      if (!decisionPointById.has(decisionPointId)) {
        at(`${location} $.stateDelta.mission.phaseAdvance.availableDecisionPointIds`, `unknown decision point "${decisionPointId}"`);
      }
    }
  }

  for (const clockDelta of fixture.stateDelta?.clocks || []) {
    const graphClock = clockById.get(clockDelta.id);
    if (!graphClock) {
      at(`${location} $.stateDelta.clocks`, `unknown clock "${clockDelta.id}"`);
      continue;
    }
    if (clockDelta.to < graphClock.min || clockDelta.to > graphClock.max) {
      at(`${location} $.stateDelta.clocks.${clockDelta.id}.to`, `must be between ${graphClock.min} and ${graphClock.max}`);
    }
  }

  for (const cardId of fixture.narratorPacket?.allowedCardIds || []) {
    const card = crewCardById.get(cardId);
    if (!card) {
      at(`${location} $.narratorPacket.allowedCardIds`, `unknown crew card "${cardId}"`);
      continue;
    }
    if (!card.audiences?.includes('narrator')) {
      at(`${location} $.narratorPacket.allowedCardIds`, `card "${cardId}" is not narrator audience safe`);
    }
    if (card.payload?.narratorSafe !== true) {
      at(`${location} $.narratorPacket.allowedCardIds`, `card "${cardId}" must have payload.narratorSafe=true`);
    }
  }
  if (fixture.narratorPacket?.rawHiddenValuesExposed !== false) {
    at(`${location} $.narratorPacket.rawHiddenValuesExposed`, 'must be false');
  }
  if (fixture.narratorPacket?.directorOnlyDataIncluded !== false) {
    at(`${location} $.narratorPacket.directorOnlyDataIncluded`, 'must be false');
  }

  if (fixture.stateDelta?.turnLedger?.swipeRerollForbidden !== true) {
    at(`${location} $.stateDelta.turnLedger.swipeRerollForbidden`, 'must be true');
  }
  if (fixture.commandLogPacket?.hiddenStateRefs) {
    at(`${location} $.commandLogPacket.hiddenStateRefs`, 'must not be included in player-facing Command Log packets');
  }
  for (const record of fixture.stateDelta?.commandStyle?.earnedRecordsAdd || []) {
    if (typeof record.summary !== 'string' || record.summary.trim() === '') {
      at(`${location} $.stateDelta.commandStyle.earnedRecordsAdd`, 'each earned command-style record needs a prose summary');
    }
    if (!['Inspiration', 'Resolve'].includes(record.track)) {
      at(`${location} $.stateDelta.commandStyle.earnedRecordsAdd`, `unknown track "${record.track}"`);
    }
  }
}

if (errors.length > 0) {
  console.error('Mission Director contract validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Mission Director contract fixtures passed: ${fixturePaths.map((fixturePath) => rel(fixturePath)).join(', ')}`);
