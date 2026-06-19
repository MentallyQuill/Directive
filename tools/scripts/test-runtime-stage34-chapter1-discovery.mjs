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

function flagValue(state, id) {
  return (state.mission?.outcomeFlags || []).find((flag) => flag.id === id)?.value;
}

function clockValue(state, id) {
  return (state.clocks || []).find((clock) => clock.id === id)?.value;
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
    'no pathogen',
    'bioweapon',
    'transponder modules',
    'recovery team',
    'nightfall'
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
  turnId: 'turn.stage34.initial-response',
  playerInput: 'Hold range, preserve convoy computer logs and signal records, and run remote scans before anyone boards.'
}).commit;

const threshold = commitInput({
  campaignState: opening.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage34.boarding-threshold',
  playerInput: 'Take us in for first contact, but no boarding until remote scans verify the threshold, quarantine isolation is ready, security overwatch is staged, rescue teams are prepared, and Imani owns evidence custody for the convoy logs.'
}).commit;

const execution = commitInput({
  campaignState: threshold.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage34.first-contact-execution',
  playerInput: 'Execute the threshold: launch remote access against the Faraday Bell logs, send a quarantine-capable boarding team with Bronn security overwatch, put Imani on evidence custody, and start Parnell plasma-leak rescue under Miriam isolation rules.'
}).commit;

assert.equal(execution.campaignState.mission.activePhaseId, 'convoy-contact-execution');
assert.deepEqual(execution.campaignState.mission.availableDecisionPointIds, ['decision.offsite-custody-cargo-discovery']);

const discovery = commitInput({
  campaignState: execution.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage34.offsite-custody-cargo',
  playerInput: 'Use the Faraday Bell logs and shuttle telemetry to locate the evacuees at Ilyon, have Priya open a lawful channel to Lieutenant Pell over Ivers and the custody claim, keep Bronn on security overwatch, keep Miriam on quarantine triage, and have Imani preserve the secured hold inventory for the missing cargo module.'
});

const committed = discovery.commit.campaignState;
const sourceOutcomeId = discovery.commit.turnPacket.outcomePacket.id;

assert.equal(discovery.preview.turnPacket.intentParse.primaryIntent, 'frame-offsite-custody-cargo-leads');
assert.equal(discovery.preview.turnPacket.actionClassification.category, 'validWithinMissionBounds');
assert.equal(discovery.preview.turnPacket.authorityCapabilityCheck.result, 'authorizedAndFeasibleWithOperationalRisk');
assert.equal(discovery.commit.turnPacket.outcomePacket.resultBand, 'Success');
assert.equal(committed.mission.activePhaseId, 'offsite-custody-cargo-leads');
assert.deepEqual(committed.mission.availableDecisionPointIds, ['decision.pell-contact-terms']);
assert.equal(committed.mission.knownFacts.includes('chapter-1.ilyon-shelter-evacuees'), true);
assert.equal(committed.mission.knownFacts.includes('chapter-1.pell-custody-claim'), true);
assert.equal(committed.mission.knownFacts.includes('chapter-1.secured-recycling-module-missing'), true);
assert.equal(committed.mission.knownFacts.includes('chapter-1.truth.compact-recovery-team'), false);
assert.equal(committed.mission.knownFacts.includes('chapter-1.truth.no-pathogen'), false);
assert.equal(committed.mission.knownFacts.includes('chapter-1.truth.forged-starfleet-signals'), false);

assert.equal(flagValue(committed, 'chapter-1.evacuee-location'), 'shelter-located');
assert.equal(flagValue(committed, 'chapter-1.custody-dispute'), 'framed-for-negotiation');
assert.equal(flagValue(committed, 'chapter-1.missing-cargo-lead'), 'secured-hold-confirmed');
assert.equal(flagValue(committed, 'chapter-1.compact-posture'), 'coordinating');
assert.equal(flagValue(committed, 'chapter-1.rescue-urgency'), 'stabilized-initially');
assert.equal(flagValue(committed, 'chapter-1.evidence-custody'), 'preserved-initially');
assert.equal(flagValue(committed, 'chapter-1.missing-module-lead'), 'lead-preserved');
assert.equal(clockValue(committed, 'chapter-1.rescue-window'), 0);
assert.equal(clockValue(committed, 'chapter-1.security-exposure'), 0);
assert.equal(clockValue(committed, 'chapter-1.evidence-volatility'), 0);

assert.equal(frontById(committed, 'front.chapter-1.rescue')?.status, 'evacuees-located');
assert.equal(frontById(committed, 'front.chapter-1.medical-quarantine')?.status, 'shelter-triage-framed');
assert.equal(frontById(committed, 'front.chapter-1.security-exposure')?.status, 'contained');
assert.equal(frontById(committed, 'front.chapter-1.evidence-custody')?.status, 'missing-cargo-lead-preserved');
assert.equal(frontById(committed, 'front.chapter-1.regional-diplomacy')?.status, 'custody-framed');
assert.equal(actorPosture(committed, 'relief-convoy-twelve')?.posture, 'evacuees-located');
assert.equal(actorPosture(committed, 'uss-breckinridge')?.posture, 'custody-cargo-followup-framed');
assert.equal(actorPosture(committed, 'compact-recovery-team')?.posture, 'jurisdiction-pressure-visible');
assert.equal(actorPosture(committed, 'compact-recovery-team')?.playerSummary, null);
assert.equal(committed.actors.rawValuesHidden, true);

for (const front of committed.fronts) {
  assert.equal(front.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(front.visibility, 'hidden');
}
for (const posture of committed.actors.postures) {
  assert.equal(posture.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(posture.visibility, 'hidden');
}

const loaded = cloneJson(committed);
assert.deepEqual(frontStatuses(loaded), frontStatuses(committed), 'front status survives JSON save/load clone');
assert.deepEqual(actorPostures(loaded), actorPostures(committed), 'actor posture survives JSON save/load clone');

const restored = deleteCommittedOutcome(committed, sourceOutcomeId);
assert.deepEqual(restored.fronts || [], execution.campaignState.fronts || [], 'delete restores pre-discovery fronts');
assert.deepEqual(restored.actors?.postures || [], execution.campaignState.actors?.postures || [], 'delete restores pre-discovery actor postures');
assert.equal(restored.mission.activePhaseId, 'convoy-contact-execution');
assert.deepEqual(restored.mission.availableDecisionPointIds, ['decision.offsite-custody-cargo-discovery']);

assertHiddenTermsAbsent(discovery.preview.turnPacket.outcomePacket);
assertHiddenTermsAbsent(discovery.preview.turnPacket.narratorPacket);
assertHiddenTermsAbsent(discovery.preview.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(discovery.commit.turnPacket.outcomePacket);
assertHiddenTermsAbsent(discovery.commit.turnPacket.narratorPacket);
assertHiddenTermsAbsent(discovery.commit.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(committed.fronts.map((front) => front.playerSummary));
assertHiddenTermsAbsent(committed.actors.postures.map((posture) => posture.playerSummary));

console.log('Stage 34 Chapter 1 discovery tests passed: shelter, custody, cargo leads, fronts, actors, save/load, rollback, and hidden-truth safety');
