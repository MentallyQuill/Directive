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
      campaignState: fixture.input.campaignState
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
    requireSameSet(actualTurn.directorResponse.commandMomentCandidates, expectedTurn.directorResponse.commandMomentCandidates, `${prefix} $.directorResponse.commandMomentCandidates`);
    requireSameSet(actualTurn.directorResponse.usedPressureIds, fixture.expected.usedPressureIds, `${prefix} $.directorResponse.usedPressureIds`);
    requireEqual(actualTurn.directorResponse.primaryPressureIds, fixture.expected.primaryPressureIds, `${prefix} $.directorResponse.primaryPressureIds`);
    requireEqual(actualTurn.directorResponse.secondaryPressureIds, fixture.expected.secondaryPressureIds, `${prefix} $.directorResponse.secondaryPressureIds`);
    requireEqual(actualTurn.directorResponse.responseSummary, expectedTurn.directorResponse.responseSummary, `${prefix} $.directorResponse.responseSummary`);
    requireEqual(actualTurn.outcomePacket, expectedTurn.outcomePacket, `${prefix} $.outcomePacket`);
    requireEqual(actualTurn.stateDelta, expectedTurn.stateDelta, `${prefix} $.stateDelta`);
    requireEqual(actualTurn.narratorPacket, expectedTurn.narratorPacket, `${prefix} $.narratorPacket`);
    requireEqual(actualTurn.commandLogPacket, expectedTurn.commandLogPacket, `${prefix} $.commandLogPacket`);
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
