import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_FIXTURE_DIR = 'tests/fixtures/mission';

const root = process.cwd();
const fixturePaths = process.argv.length > 2
  ? process.argv.slice(2).map((fixture) => path.resolve(root, fixture))
  : fs.readdirSync(path.resolve(root, DEFAULT_FIXTURE_DIR))
    .filter((fileName) => fileName.endsWith('.fixture.json') && !fileName.endsWith('.turn.fixture.json') && !fileName.endsWith('-director-loop.fixture.json'))
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

function sameArray(actual, expected) {
  const a = [...(actual || [])].sort((left, right) => String(left).localeCompare(String(right)));
  const e = [...(expected || [])].sort((left, right) => String(left).localeCompare(String(right)));
  return a.length === e.length && a.every((value, index) => value === e[index]);
}

function requireIncludes(actual, expected, location, label) {
  const actualSet = new Set(actual || []);
  for (const value of expected || []) {
    if (!actualSet.has(value)) {
      at(location, `missing ${label} "${value}"`);
    }
  }
}

for (const fixturePath of fixturePaths) {
  const fixture = readJson(fixturePath);
  const graph = readJson(path.resolve(root, fixture.graphPath));
  const location = rel(fixturePath);

  const phase = graph.phases?.find((item) => item.id === fixture.sceneSnapshot?.phaseId);
  if (!phase) {
    at(location, `unknown phase "${fixture.sceneSnapshot?.phaseId}"`);
    continue;
  }

  if (phase.id !== fixture.expected?.phaseId) {
    at(`${location} $.expected.phaseId`, `got ${phase.id}`);
  }
  if (!sameArray(phase.decisionPointIds, fixture.expected?.decisionPointIds)) {
    at(`${location} $.expected.decisionPointIds`, `got ${JSON.stringify(phase.decisionPointIds || [])}`);
  }

  const factsById = new Map((graph.facts || []).map((fact) => [fact.id, fact]));
  for (const factId of fixture.expected?.requiredFacts || []) {
    if (!factsById.has(factId)) {
      at(`${location} $.expected.requiredFacts`, `unknown fact "${factId}"`);
    }
  }

  const decisionPoints = (graph.decisionPoints || []).filter((decisionPoint) => phase.decisionPointIds?.includes(decisionPoint.id));
  const reachableOutcomeFlags = new Set(decisionPoints.flatMap((decisionPoint) => decisionPoint.outcomeFlagIds || []));
  requireIncludes(reachableOutcomeFlags, fixture.expected?.outcomeFlagIds, `${location} $.expected.outcomeFlagIds`, 'outcome flag');

  const expectedMoment = fixture.expected?.commandMoment;
  if (expectedMoment) {
    const commandMoment = graph.commandMoments?.find((moment) => moment.id === expectedMoment.id);
    if (!commandMoment) {
      at(`${location} $.expected.commandMoment.id`, `unknown command moment "${expectedMoment.id}"`);
    } else {
      for (const key of ['phaseId', 'track', 'repeatable']) {
        if (commandMoment[key] !== expectedMoment[key]) {
          at(`${location} $.expected.commandMoment.${key}`, `got ${commandMoment[key]}, expected ${expectedMoment[key]}`);
        }
      }
      const linked = decisionPoints.some((decisionPoint) => decisionPoint.commandMomentIds?.includes(commandMoment.id));
      if (!linked) {
        at(`${location} $.expected.commandMoment.id`, `command moment "${commandMoment.id}" is not linked by a phase decision point`);
      }
    }
  }

  requireIncludes(
    graph.missionFrame?.failurePolicy?.forbiddenOutcomes,
    fixture.expected?.forbiddenOutcomes,
    `${location} $.expected.forbiddenOutcomes`,
    'forbidden outcome'
  );

  if (!graph.endStates?.some((endState) => endState.transitionToMissionId === fixture.expected?.transitionToMissionId)) {
    at(`${location} $.expected.transitionToMissionId`, `no end state transitions to "${fixture.expected?.transitionToMissionId}"`);
  }
}

if (errors.length > 0) {
  console.error('Mission graph fixture validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Mission graph fixtures passed: ${fixturePaths.map((fixturePath) => rel(fixturePath)).join(', ')}`);
