import fs from 'node:fs';
import path from 'node:path';
import { runMissionDirectorTurn } from '../../src/mission/director.mjs';

const DEFAULT_FIXTURE_DIR = 'tests/fixtures/mission';

const root = process.cwd();
const fixturePaths = process.argv.length > 2
  ? process.argv.slice(2).map((fixture) => path.resolve(root, fixture))
  : fs.readdirSync(path.resolve(root, DEFAULT_FIXTURE_DIR))
    .filter((fileName) => fileName.endsWith('-director-loop.fixture.json'))
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

function stable(value) {
  return JSON.stringify(value);
}

function sameSet(actual, expected) {
  const actualSet = [...new Set(actual || [])].sort((left, right) => String(left).localeCompare(String(right)));
  const expectedSet = [...new Set(expected || [])].sort((left, right) => String(left).localeCompare(String(right)));
  return actualSet.length === expectedSet.length && actualSet.every((value, index) => value === expectedSet[index]);
}

function requireEqual(actual, expected, location) {
  if (stable(actual) !== stable(expected)) {
    at(location, `got ${stable(actual)}, expected ${stable(expected)}`);
  }
}

function requireSameSet(actual, expected, location) {
  if (!sameSet(actual, expected)) {
    at(location, `got ${stable(actual || [])}, expected set ${stable(expected || [])}`);
  }
}

function approvingArbiterPlanForFixture(fixture) {
  const scene = fixture.input?.sceneSnapshot || {};
  return {
    kind: 'directive.turnArbiterPlan.v1',
    schemaVersion: 1,
    route: 'directiveOutcome',
    confidence: 1,
    ambiguity: 'low',
    playerIntent: {
      speechAct: 'fixture-approved-command',
      action: scene.playerInput || fixture.input?.playerInput || 'fixture mission command',
      target: scene.activePhaseId || 'active mission',
      directObject: '',
      domainSignals: ['mission'],
      riskSignals: []
    },
    sceneContinuity: {
      currentLocation: scene.locationId || '',
      currentConversation: `Fixture phase ${scene.activePhaseId || 'unknown'} is already active.`,
      mustPreserve: ['Use the fixture scene as already established.'],
      mustNotReestablish: ['The campaign intro']
    },
    responsePlan: {
      owner: 'directive',
      strategy: 'directivePosted',
      guidance: 'Resolve the fixture as an approved durable mission outcome.'
    },
    statePlan: {
      commitOutcome: true,
      allowedDomains: ['mission'],
      proposedOperations: [],
      promptDirtyDomains: ['missionQuestThread']
    },
    risk: { requiresPause: false, pauseReason: '', reasons: [] },
    diagnostics: { sourceUse: 'fixture', deterministicFallbackUsed: false }
  };
}

if (fixturePaths.length === 0) {
  at('fixtures', 'must contain at least one *-director-loop.fixture.json file');
}

for (const fixturePath of fixturePaths) {
  const fixture = readJson(fixturePath);
  const graphPath = path.resolve(root, fixture.graphPath);
  const projectionPath = path.resolve(root, fixture.projectionPath);
  const crewDatasetPath = path.resolve(root, fixture.crewDatasetPath);
  const expectedTurnPath = path.resolve(root, fixture.expectedTurnPath);

  const graph = readJson(graphPath);
  const projection = readJson(projectionPath);
  const crewDataset = readJson(crewDatasetPath);
  const expectedTurn = readJson(expectedTurnPath);

  const mutationSnapshot = stable({ graph, projection, crewDataset, input: fixture.input });

  let actualTurn;
  try {
    actualTurn = runMissionDirectorTurn({
      turnId: fixture.input.turnId,
      graphPath: fixture.graphPath,
      projectionPath: fixture.projectionPath,
      graph,
      projection,
      crewDataset,
      sceneSnapshot: fixture.input.sceneSnapshot,
      campaignState: fixture.input.campaignState,
      arbiterPlan: approvingArbiterPlanForFixture(fixture)
    });
  } catch (error) {
    at(rel(fixturePath), error.message);
  }

  if (actualTurn) {
    const prefix = rel(fixturePath);
    requireEqual(actualTurn.contractVersion, expectedTurn.contractVersion, `${prefix} $.contractVersion`);
    requireEqual(actualTurn.turnId, expectedTurn.turnId, `${prefix} $.turnId`);
    requireEqual(actualTurn.graphPath, expectedTurn.graphPath, `${prefix} $.graphPath`);
    requireEqual(actualTurn.projectionPath, expectedTurn.projectionPath, `${prefix} $.projectionPath`);
    requireEqual(actualTurn.sceneSnapshot, expectedTurn.sceneSnapshot, `${prefix} $.sceneSnapshot`);
    requireEqual(actualTurn.intentParse.summary, expectedTurn.intentParse.summary, `${prefix} $.intentParse.summary`);
    requireEqual(actualTurn.intentParse.primaryIntent, expectedTurn.intentParse.primaryIntent, `${prefix} $.intentParse.primaryIntent`);
    requireEqual(actualTurn.intentParse.targetIds, expectedTurn.intentParse.targetIds, `${prefix} $.intentParse.targetIds`);
    requireEqual(actualTurn.intentParse.declaredMethod, expectedTurn.intentParse.declaredMethod, `${prefix} $.intentParse.declaredMethod`);
    requireEqual(actualTurn.intentParse.assumptions, expectedTurn.intentParse.assumptions, `${prefix} $.intentParse.assumptions`);
    requireEqual(actualTurn.actionClassification, expectedTurn.actionClassification, `${prefix} $.actionClassification`);
    requireEqual(actualTurn.authorityCapabilityCheck, expectedTurn.authorityCapabilityCheck, `${prefix} $.authorityCapabilityCheck`);
    requireSameSet(actualTurn.directorResponse.usedDecisionPointIds, expectedTurn.directorResponse.usedDecisionPointIds, `${prefix} $.directorResponse.usedDecisionPointIds`);
    requireSameSet(actualTurn.directorResponse.usedFactIds, expectedTurn.directorResponse.usedFactIds, `${prefix} $.directorResponse.usedFactIds`);
    requireSameSet(actualTurn.directorResponse.usedClockIds, expectedTurn.directorResponse.usedClockIds, `${prefix} $.directorResponse.usedClockIds`);
    requireSameSet(actualTurn.directorResponse.commandDecisionCandidates, expectedTurn.directorResponse.commandDecisionCandidates, `${prefix} $.directorResponse.commandDecisionCandidates`);
    requireSameSet(actualTurn.directorResponse.usedPressureIds, fixture.expected.usedPressureIds, `${prefix} $.directorResponse.usedPressureIds`);
    requireEqual(actualTurn.directorResponse.primaryPressureIds, fixture.expected.primaryPressureIds, `${prefix} $.directorResponse.primaryPressureIds`);
    requireEqual(actualTurn.directorResponse.secondaryPressureIds, fixture.expected.secondaryPressureIds, `${prefix} $.directorResponse.secondaryPressureIds`);
    requireEqual(actualTurn.directorResponse.responseSummary, expectedTurn.directorResponse.responseSummary, `${prefix} $.directorResponse.responseSummary`);
    requireEqual(actualTurn.outcomePacket, expectedTurn.outcomePacket, `${prefix} $.outcomePacket`);
    requireEqual(actualTurn.stateDelta, expectedTurn.stateDelta, `${prefix} $.stateDelta`);
    requireEqual(actualTurn.narratorPacket, expectedTurn.narratorPacket, `${prefix} $.narratorPacket`);
    requireEqual(actualTurn.commandLogPacket, expectedTurn.commandLogPacket, `${prefix} $.commandLogPacket`);

    if (fixture.expected.noCommandDecisionAwards === true && (actualTurn.outcomePacket.commandDecisionAwards || []).length !== 0) {
      at(`${prefix} $.outcomePacket.commandDecisionAwards`, 'expected no repeated Command Decision awards');
    }
    if (fixture.expected.commandDecisionFlagValue) {
      const flag = actualTurn.stateDelta.mission?.outcomeFlagsSet?.find((item) => item.id === 'prelude.command-decision-hesperus-fraud');
      if (flag?.value !== fixture.expected.commandDecisionFlagValue) {
        at(`${prefix} $.stateDelta.mission.outcomeFlagsSet.prelude.command-decision-hesperus-fraud`, `got ${stable(flag?.value)}, expected ${stable(fixture.expected.commandDecisionFlagValue)}`);
      }
    }
    if (Number.isInteger(fixture.expected.earnedRecordsAddCount) && (actualTurn.stateDelta.commandBearing?.earnedRecordsAdd || []).length !== fixture.expected.earnedRecordsAddCount) {
      at(`${prefix} $.stateDelta.commandBearing.earnedRecordsAdd`, `got ${(actualTurn.stateDelta.commandBearing?.earnedRecordsAdd || []).length}, expected ${fixture.expected.earnedRecordsAddCount}`);
    }
    if (Number.isInteger(fixture.expected.awardedDecisionIdsAddCount) && (actualTurn.stateDelta.commandBearing?.awardedDecisionIdsAdd || []).length !== fixture.expected.awardedDecisionIdsAddCount) {
      at(`${prefix} $.stateDelta.commandBearing.awardedDecisionIdsAdd`, `got ${(actualTurn.stateDelta.commandBearing?.awardedDecisionIdsAdd || []).length}, expected ${fixture.expected.awardedDecisionIdsAddCount}`);
    }
  }

  const afterSnapshot = stable({ graph, projection, crewDataset, input: fixture.input });
  if (afterSnapshot !== mutationSnapshot) {
    at(`${rel(fixturePath)} immutability`, 'Director loop mutated input graph, projection, crew dataset, or fixture input');
  }
}

if (errors.length > 0) {
  console.error('Mission Director loop test failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Mission Director loop fixtures passed: ${fixturePaths.map((fixturePath) => rel(fixturePath)).join(', ')}`);
