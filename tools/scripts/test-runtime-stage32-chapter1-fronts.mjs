import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { deleteCommittedOutcome } from '../../src/campaign/transaction-state.mjs';
import {
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntime
} from '../../src/runtime/director-turn-runtime.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function chapter1State(projection) {
  const state = cloneJson(projection.initialState);
  state.player.name = 'Talia Serrin';
  state.player.creationStatus = 'ready';
  state.campaign.currentStardate = 53076.6;
  state.mission = {
    ...state.mission,
    activeMissionId: 'chapter-1-the-empty-convoy',
    activeMissionGraphId: 'breckinridge.ashes-of-peace.chapter-1-the-empty-convoy',
    activeMissionGraphPath: 'packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json',
    activePhaseId: 'initial-reception',
    phase: 'initial-reception',
    knownFacts: ['chapter-1.relief-convoy-distress-packet'],
    availableDecisionPointIds: ['decision.initial-convoy-posture']
  };
  state.pressureLedger = {
    records: [],
    candidateReviews: [],
    rawValuesHidden: true
  };
  state.fronts = [];
  state.actors = {
    ...state.actors,
    postures: [],
    rawValuesHidden: true
  };
  return state;
}

function previewChapter1({ campaignState, graph, projection, crewDataset, turnId, playerInput }) {
  return createProvisionalDirectorTurnRuntime({
    campaignState,
    graph,
    projection,
    crewDataset,
    graphPath: 'packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json',
    projectionPath: 'packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json',
    turnId,
    playerInput
  });
}

function commitInput({ campaignState, graph, projection, crewDataset, turnId, playerInput, confirmWarnings = false }) {
  const preview = previewChapter1({ campaignState, graph, projection, crewDataset, turnId, playerInput });
  return {
    preview,
    commit: commitProvisionalDirectorTurnRuntime({
      campaignState,
      turnPacket: preview.turnPacket,
      confirmWarnings,
      confirmedWarningIds: preview.warningConfirmation.warningIds || []
    })
  };
}

function frontById(state, id) {
  return (state.fronts || []).find((front) => front.id === id);
}

function actorPosture(state, actorId) {
  return (state.actors?.postures || []).find((posture) => posture.actorId === actorId);
}

function frontStatuses(state) {
  return Object.fromEntries((state.fronts || []).map((front) => [front.id, front.status]));
}

function actorPostures(state) {
  return Object.fromEntries((state.actors?.postures || []).map((posture) => [posture.actorId, posture.posture]));
}

function assertHiddenTermsAbsent(value) {
  const text = JSON.stringify(value).toLowerCase();
  for (const term of [
    'lantern',
    'compact recovery team',
    'no pathogen',
    'false quarantine order',
    'transponder modules'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }
}

const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const chapter1Graph = readJson('packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');

const opening = commitInput({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage32.initial-response',
  playerInput: 'Hold range, preserve convoy computer logs and signal records, and run remote scans before anyone boards.'
}).commit;

const threshold = commitInput({
  campaignState: opening.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage32.boarding-threshold',
  playerInput: 'Take us in for first contact, but no boarding until remote scans verify the threshold, quarantine isolation is ready, security overwatch is staged, rescue teams are prepared, and Imani owns evidence custody for the convoy logs.'
});

const committed = threshold.commit.campaignState;
const sourceOutcomeId = threshold.commit.turnPacket.outcomePacket.id;

assert.equal(committed.mission.activePhaseId, 'first-committed-response');
assert.equal(frontById(committed, 'front.chapter-1.rescue')?.status, 'stabilized');
assert.equal(frontById(committed, 'front.chapter-1.medical-quarantine')?.status, 'controlled');
assert.equal(frontById(committed, 'front.chapter-1.security-exposure')?.status, 'contained');
assert.equal(frontById(committed, 'front.chapter-1.evidence-custody')?.status, 'preserved');
assert.equal(frontById(committed, 'front.chapter-1.regional-diplomacy')?.status, 'coordinating');
assert.equal(actorPosture(committed, 'relief-convoy-twelve')?.posture, 'contact-window-stabilized');
assert.equal(actorPosture(committed, 'uss-breckinridge')?.posture, 'controlled-contact');
assert.equal(actorPosture(committed, 'compact-recovery-team')?.posture, 'concealed-options-narrowing');
assert.equal(actorPosture(committed, 'compact-recovery-team')?.playerSummary, null);
assert.equal(committed.actors.rawValuesHidden, true);

for (const front of committed.fronts) {
  assert.equal(front.sourceOutcomeId, sourceOutcomeId);
  assert.equal(front.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(front.visibility, 'hidden');
}
for (const posture of committed.actors.postures) {
  assert.equal(posture.sourceOutcomeId, sourceOutcomeId);
  assert.equal(posture.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(posture.visibility, 'hidden');
}

const loaded = cloneJson(committed);
assert.deepEqual(frontStatuses(loaded), frontStatuses(committed), 'front status survives JSON save/load clone');
assert.deepEqual(actorPostures(loaded), actorPostures(committed), 'actor posture survives JSON save/load clone');

const restored = deleteCommittedOutcome(committed, sourceOutcomeId);
assert.deepEqual(restored.fronts || [], opening.campaignState.fronts || [], 'delete restores pre-threshold fronts');
assert.deepEqual(restored.actors?.postures || [], opening.campaignState.actors?.postures || [], 'delete restores pre-threshold actor postures');

const hazard = commitInput({
  campaignState: opening.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage32.quarantine-exception',
  playerInput: 'Beam any survivors directly to unrestricted sickbay and waive isolation if it saves time.',
  confirmWarnings: true
}).commit;

assert.equal(hazard.campaignState.mission.activePhaseId, 'convoy-approach');
assert.equal(frontById(hazard.campaignState, 'front.chapter-1.medical-quarantine')?.status, 'exception-logged');
assert.equal(frontById(hazard.campaignState, 'front.chapter-1.security-exposure')?.status, 'exposed');
assert.equal(actorPosture(hazard.campaignState, 'compact-recovery-team')?.posture, 'concealed-leverage-improving');

assertHiddenTermsAbsent(threshold.preview.turnPacket);
assertHiddenTermsAbsent(threshold.commit.turnPacket);
assertHiddenTermsAbsent(committed.fronts.map((front) => front.playerSummary));
assertHiddenTermsAbsent(committed.actors.postures.map((posture) => posture.playerSummary));

console.log('Stage 32 Chapter 1 fronts tests passed: actor posture, fronts, save/load, delete rollback, and hidden-truth safety');
