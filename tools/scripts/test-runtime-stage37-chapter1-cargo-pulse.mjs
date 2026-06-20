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
    activeMissionGraphId: 'breckenridge.ashes-of-peace.chapter-1-the-empty-convoy',
    activeMissionGraphPath: 'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
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
    graphPath: 'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
    projectionPath: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
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
    'nightfall',
    'bioweapon',
    'kestrel',
    'destroy the transponder',
    'transponder module'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }
}

const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const chapter1Graph = readJson('packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');

const opening = commitInput({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage37.initial-response',
  playerInput: 'Hold range, preserve convoy computer logs and signal records, and run remote scans before anyone boards.'
}).commit;

const threshold = commitInput({
  campaignState: opening.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage37.boarding-threshold',
  playerInput: 'Take us in for first contact, but no boarding until remote scans verify the threshold, quarantine isolation is ready, security overwatch is staged, rescue teams are prepared, and Imani owns evidence custody for the convoy logs.'
}).commit;

const execution = commitInput({
  campaignState: threshold.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage37.first-contact-execution',
  playerInput: 'Execute the threshold: launch remote access against the Faraday Bell logs, send a quarantine-capable boarding team with Bronn security overwatch, put Imani on evidence custody, and start Parnell plasma-leak rescue under Miriam isolation rules.'
}).commit;

const discovery = commitInput({
  campaignState: execution.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage37.offsite-custody-cargo',
  playerInput: 'Use the Faraday Bell logs and shuttle telemetry to locate the evacuees at Ilyon, have Priya open a lawful channel to Lieutenant Pell over Ivers and the custody claim, keep Bronn on security overwatch, keep Miriam on quarantine triage, and have Imani preserve the secured hold inventory for the missing cargo module.'
}).commit;

const pellTerms = commitInput({
  campaignState: discovery.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage37.pell-contact-terms',
  playerInput: 'Open a channel to Pell, acknowledge Compact emergency concerns, offer a joint medical and cargo inspection, share the Faraday logs and manifest, request Ivers and the detained officers be released for supervised questioning, and set a legal undertaking to recover the missing emergency transponder hardware while Imani preserves evidence.'
}).commit;

const jointInspection = commitInput({
  campaignState: pellTerms.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage37.joint-inspection-release',
  playerInput: 'Execute the joint inspection team now: Priya opens a shared inspection record and gives Pell a lawful exit through a Compact official, Bronn secures Ivers and the detained officers for supervised release and questioning, Imani seals the cargo evidence chain around the emergency hardware, and Rowan verifies the manifest without public claims.'
}).commit;

assert.equal(jointInspection.campaignState.mission.activePhaseId, 'joint-inspection-release-cargo');
assert.deepEqual(jointInspection.campaignState.mission.availableDecisionPointIds, ['decision.cargo-diagnostic-pulse']);

const cargoPulse = commitInput({
  campaignState: jointInspection.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage37.cargo-diagnostic-pulse',
  playerInput: 'Trace the diagnostic pulse with Rowan and Imani, keep the emergency hardware under joint seal and shared custody, have Priya preserve Pell\'s lawful exit, and have Bronn hold a non-hostile intercept posture with defensive shields, no targeting solution, and the cargo evidence chain intact.'
});

const committed = cargoPulse.commit.campaignState;
const sourceOutcomeId = cargoPulse.commit.turnPacket.outcomePacket.id;

assert.equal(cargoPulse.preview.turnPacket.intentParse.primaryIntent, 'trace-cargo-diagnostic-pulse');
assert.equal(cargoPulse.preview.turnPacket.actionClassification.category, 'validWithinMissionBounds');
assert.equal(cargoPulse.preview.turnPacket.authorityCapabilityCheck.result, 'authorizedAndFeasibleWithOperationalRisk');
assert.equal(cargoPulse.commit.turnPacket.outcomePacket.resultBand, 'Success');
assert.equal(committed.mission.activePhaseId, 'cargo-diagnostic-pulse');
assert.deepEqual(committed.mission.availableDecisionPointIds, ['decision.hardware-recovery-under-seal']);
assert.equal(committed.mission.knownFacts.includes('chapter-1.missing-hardware-diagnostic-pulse'), true);
assert.equal(committed.mission.knownFacts.includes('chapter-1.cargo-recovery-locus-preserved'), true);
assert.equal(committed.mission.knownFacts.includes('chapter-1.truth.compact-recovery-team'), false);
assert.equal(committed.mission.knownFacts.includes('chapter-1.truth.no-pathogen'), false);
assert.equal(committed.mission.knownFacts.includes('chapter-1.truth.forged-starfleet-signals'), false);

assert.equal(flagValue(committed, 'chapter-1.cargo-location'), 'joint-locus-preserved');
assert.equal(flagValue(committed, 'chapter-1.cargo-recovery-route'), 'joint-seal-preserved');
assert.equal(flagValue(committed, 'chapter-1.joint-inspection-status'), 'shared-record-open');
assert.equal(flagValue(committed, 'chapter-1.pell-contact'), 'joint-inspection-active');
assert.equal(flagValue(committed, 'chapter-1.ivers-status'), 'supervised-release-secured');
assert.equal(flagValue(committed, 'chapter-1.compact-posture'), 'coordinating');
assert.equal(flagValue(committed, 'chapter-1.missing-cargo-lead'), 'secured-hold-confirmed');
assert.equal(flagValue(committed, 'chapter-1.missing-module-lead'), 'location-traced');
assert.equal(clockValue(committed, 'chapter-1.rescue-window'), 0);
assert.equal(clockValue(committed, 'chapter-1.security-exposure'), 0);
assert.equal(clockValue(committed, 'chapter-1.evidence-volatility'), 0);

assert.equal(frontById(committed, 'front.chapter-1.rescue')?.status, 'witness-release-secured');
assert.equal(frontById(committed, 'front.chapter-1.medical-quarantine')?.status, 'shelter-triage-framed');
assert.equal(frontById(committed, 'front.chapter-1.security-exposure')?.status, 'contained');
assert.equal(frontById(committed, 'front.chapter-1.evidence-custody')?.status, 'recovery-locus-preserved');
assert.equal(frontById(committed, 'front.chapter-1.regional-diplomacy')?.status, 'joint-recovery-coordination');
assert.equal(actorPosture(committed, 'relief-convoy-twelve')?.posture, 'ivers-supervised-release-secured');
assert.equal(actorPosture(committed, 'uss-breckenridge')?.posture, 'cargo-recovery-locus-preserved');
assert.equal(actorPosture(committed, 'compact-recovery-team')?.posture, 'joint-cargo-seal-possible');
assert.equal(actorPosture(committed, 'compact-recovery-team')?.playerSummary, null);
assert.equal(committed.actors.rawValuesHidden, true);

for (const frontId of ['front.chapter-1.rescue', 'front.chapter-1.security-exposure', 'front.chapter-1.evidence-custody', 'front.chapter-1.regional-diplomacy']) {
  const front = frontById(committed, frontId);
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
assert.deepEqual(restored.fronts || [], jointInspection.campaignState.fronts || [], 'delete restores pre-cargo-pulse fronts');
assert.deepEqual(restored.actors?.postures || [], jointInspection.campaignState.actors?.postures || [], 'delete restores pre-cargo-pulse actor postures');
assert.equal(restored.mission.activePhaseId, 'joint-inspection-release-cargo');
assert.deepEqual(restored.mission.availableDecisionPointIds, ['decision.cargo-diagnostic-pulse']);

assertHiddenTermsAbsent(cargoPulse.preview.turnPacket.outcomePacket);
assertHiddenTermsAbsent(cargoPulse.preview.turnPacket.narratorPacket);
assertHiddenTermsAbsent(cargoPulse.preview.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(cargoPulse.commit.turnPacket.outcomePacket);
assertHiddenTermsAbsent(cargoPulse.commit.turnPacket.narratorPacket);
assertHiddenTermsAbsent(cargoPulse.commit.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(committed.fronts.map((front) => front.playerSummary));
assertHiddenTermsAbsent(committed.actors.postures.map((posture) => posture.playerSummary));

console.log('Stage 37 Chapter 1 cargo pulse tests passed: diagnostic trace, joint seal, cargo recovery locus, fronts, actors, save/load, rollback, and hidden-truth safety');
