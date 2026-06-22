import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { commitDirectorTurn } from '../../src/campaign/transaction-state.mjs';
import {
  appendRelationshipMemory,
  applyRelationshipMemoryFromTurn,
  createCrewBPlotHooks,
  createCrewCoalitionRules
} from '../../src/simulation/crew-bplots.mjs';
import { runMissionDirectorTurn } from '../../src/mission/director.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function stateForFixture(projection, fixture) {
  const state = cloneJson(projection.initialState);
  state.mission.activePhaseId = fixture.input.sceneSnapshot.activePhaseId;
  state.mission.phase = fixture.input.sceneSnapshot.activePhaseId;
  state.mission.availableDecisionPointIds = [...fixture.input.sceneSnapshot.activeDecisionPointIds];
  state.mission.knownFacts = [...fixture.input.sceneSnapshot.knownFactIds];
  const clockOwner = state.worldState && typeof state.worldState === 'object' ? state.worldState : state;
  clockOwner.clocks = Array.isArray(clockOwner.clocks) ? clockOwner.clocks : [];
  for (const fixtureClock of fixture.input.campaignState.clocks || []) {
    const clock = clockOwner.clocks.find((item) => item.id === fixtureClock.id);
    if (clock) clock.value = fixtureClock.value;
  }
  state.commandStyle = cloneJson(fixture.input.campaignState.commandStyle);
  return state;
}

const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const fixture = readJson('tests/fixtures/mission/prelude-hesperus-fraud-director-loop.fixture.json');

const hooks = createCrewBPlotHooks({ crewDataset, missionGraph });
assert.equal(hooks.length, 7);
const bronn = hooks.find((hook) => hook.crewId === 'hadrik-bronn');
assert.equal(bronn.relationshipCardId, 'crew.bronn.relationship.clean-handoff');
assert.equal(bronn.developmentCardId, 'crew.bronn.development.advisory-trust');
assert.equal(bronn.commandReactionCardId, 'command.bronn.style-reaction.credible-resolve');
assert.equal(bronn.linkedPhases.some((link) => link.phaseId === 'ready-room-handover'), true);
assert.equal(bronn.linkedPhases.some((link) => link.phaseId === 'hesperus-diversion'), true);

const imani = hooks.find((hook) => hook.crewId === 'imani-cross');
assert.equal(imani.linkedPhases.some((link) => link.phaseId === 'combined-load-test'), true);
assert.equal(imani.linkedPhases.some((link) => link.phaseId === 'hesperus-diversion'), true);

const coalition = createCrewCoalitionRules({
  crewDataset,
  missionGraph,
  phaseId: 'hesperus-diversion'
});
assert.deepEqual(
  coalition.rules.map((rule) => rule.crewId).sort(),
  ['hadrik-bronn', 'imani-cross', 'miriam-sato', 'priya-nayar'].sort()
);
assert.equal(coalition.rules.every((rule) => rule.rule && rule.possibleEffects.length > 0), true);

let memoryState = appendRelationshipMemory(projection.initialState, {
  crewId: 'imani-cross',
  event: 'The player recorded technical debt instead of normalizing it.',
  interpretation: 'Imani may trust future command reviews sooner.',
  weight: 'moderate-positive',
  sourceOutcomeId: 'outcome.test'
});
assert.equal(memoryState.relationships.rawValuesHidden, true);
assert.equal(memoryState.relationships.memoryLedger.at(-1).visibility, 'hidden');
assert.equal(projection.initialState.relationships.memoryLedger.length < memoryState.relationships.memoryLedger.length, true);

const turn = runMissionDirectorTurn({
  turnId: fixture.input.turnId,
  graphPath: fixture.graphPath,
  projectionPath: fixture.projectionPath,
  graph: missionGraph,
  projection,
  crewDataset,
  sceneSnapshot: fixture.input.sceneSnapshot,
  campaignState: fixture.input.campaignState
});
memoryState = applyRelationshipMemoryFromTurn(stateForFixture(projection, fixture), turn);
for (const crewId of ['priya-nayar', 'hadrik-bronn', 'miriam-sato', 'imani-cross']) {
  assert.equal(memoryState.relationships.memoryLedger.some((entry) => entry.crewId === crewId && entry.sourceOutcomeId === turn.outcomePacket.id), true);
}

const committed = commitDirectorTurn(stateForFixture(projection, fixture), turn);
assert.equal(committed.relationships.rawValuesHidden, true);
assert.equal(committed.relationships.memoryLedger.some((entry) => entry.crewId === 'imani-cross' && entry.sourceOutcomeId === turn.outcomePacket.id), true);

console.log('Crew B-plot tests passed: hooks, coalition rules, relationship memory updates, mission graph links');
