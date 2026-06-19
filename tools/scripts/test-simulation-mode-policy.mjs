import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { runMissionDirectorTurn } from '../../src/mission/director.mjs';
import {
  applySimulationModePolicyToOutcome,
  simulationModeSettingsRows
} from '../../src/simulation/simulation-mode-policy.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function flagValue(turnPacket, flagId) {
  return (turnPacket.stateDelta.mission.outcomeFlagsSet || []).find((flag) => flag.id === flagId)?.value;
}

function includeText(items, fragment) {
  return (items || []).some((item) => String(item).includes(fragment));
}

const fixture = readJson('tests/fixtures/simulation/combined-load-hazard-modes.fixture.json');
const graph = readJson(fixture.graphPath);
const projection = readJson(fixture.projectionPath);
const crewDataset = readJson(fixture.crewDatasetPath);

for (const testCase of fixture.cases) {
  const sceneSnapshot = {
    ...cloneJson(fixture.baseSceneSnapshot),
    simulationMode: testCase.simulationMode
  };
  const campaignState = {
    ...cloneJson(fixture.baseCampaignState),
    settings: {
      simulationMode: testCase.simulationMode,
      allowedSimulationModes: ['Exploration', 'Command']
    }
  };
  const turn = runMissionDirectorTurn({
    turnId: testCase.turnId,
    graphPath: fixture.graphPath,
    projectionPath: fixture.projectionPath,
    graph,
    projection,
    crewDataset,
    sceneSnapshot,
    campaignState
  });

  assert.equal(turn.outcomePacket.resultBand, testCase.expected.resultBand, `${testCase.id} resultBand`);
  assert.equal(turn.outcomePacket.simulationPolicy.simulationMode, testCase.expected.simulationMode, `${testCase.id} policy mode`);
  assert.equal(
    turn.outcomePacket.simulationPolicy.fatalityAllowedForPlayerOrSeniorStaff,
    testCase.expected.fatalityAllowedForPlayerOrSeniorStaff,
    `${testCase.id} fatality policy`
  );
  assert.equal(turn.outcomePacket.simulationPolicy.severityCeilingApplied, testCase.expected.severityCeilingApplied, `${testCase.id} severity ceiling`);
  if (testCase.expected.originalResultBand) {
    assert.equal(turn.outcomePacket.simulationPolicy.originalResultBand, testCase.expected.originalResultBand, `${testCase.id} original band`);
  }
  assert.equal(includeText(turn.outcomePacket.costs, testCase.expected.costIncludes), true, `${testCase.id} cost text`);
  assert.equal(includeText(turn.narratorPacket.constraints, testCase.expected.narratorConstraintIncludes), true, `${testCase.id} narrator constraint`);
  assert.equal(flagValue(turn, 'prelude.ship-state'), testCase.expected.shipState, `${testCase.id} hidden ship-state truth`);
  assert.equal(turn.stateDelta.mission.activePhaseIdSet, undefined, `${testCase.id} must not force success`);
}

const softened = applySimulationModePolicyToOutcome({
  outcomePacket: {
    id: 'outcome.synthetic.fatal',
    resultBand: 'Great Failure',
    summary: 'Synthetic fatal outcome.',
    costs: [
      'senior officer death',
      'player character is killed'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  },
  campaignState: {
    settings: {
      simulationMode: 'Exploration'
    }
  },
  sceneSnapshot: {},
  intentParse: {
    primaryIntent: 'synthetic-hazard'
  }
});
assert.equal(softened.resultBand, 'Partial Failure');
assert.equal(softened.costs.some((cost) => /senior officer death|killed/i.test(cost)), false);
assert.equal(softened.simulationPolicy.fatalityAllowedForPlayerOrSeniorStaff, false);

for (const mode of ['Exploration', 'Command']) {
  const rows = simulationModeSettingsRows(mode);
  assert.equal(rows.mode, mode);
  assert.equal(/Ensign|Lieutenant|Commander/.test(`${rows.mode} ${rows.fatalityPolicy} ${rows.summary}`), false);
}

console.log('Simulation mode policy tests passed: paired hazardous outcomes, non-fatal Exploration ceiling, hidden-state truth, and settings labels');
