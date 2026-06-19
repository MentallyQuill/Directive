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

const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const chapter1Graph = readJson('packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');

const opening = commitInput({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage40.initial-response',
  playerInput: 'Hold range, preserve convoy computer logs and signal records, and run remote scans before anyone boards.'
}).commit;

const threshold = commitInput({
  campaignState: opening.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage40.boarding-threshold',
  playerInput: 'Take us in for first contact, but no boarding until remote scans verify the threshold, quarantine isolation is ready, security overwatch is staged, rescue teams are prepared, and Imani owns evidence custody for the convoy logs.'
}).commit;

const execution = commitInput({
  campaignState: threshold.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage40.first-contact-execution',
  playerInput: 'Execute the threshold: launch remote access against the Faraday Bell logs, send a quarantine-capable boarding team with Bronn security overwatch, put Imani on evidence custody, and start Parnell plasma-leak rescue under Miriam isolation rules.'
}).commit;

const discovery = commitInput({
  campaignState: execution.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage40.offsite-custody-cargo',
  playerInput: 'Use the Faraday Bell logs and shuttle telemetry to locate the evacuees at Ilyon, have Priya open a lawful channel to Lieutenant Pell over Ivers and the custody claim, keep Bronn on security overwatch, keep Miriam on quarantine triage, and have Imani preserve the secured hold inventory for the missing cargo module.'
}).commit;

const pellTerms = commitInput({
  campaignState: discovery.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage40.pell-contact-terms',
  playerInput: 'Open a channel to Pell, acknowledge Compact emergency concerns, offer a joint medical and cargo inspection, share the Faraday logs and manifest, request Ivers and the detained officers be released for supervised questioning, and set a legal undertaking to recover the missing emergency transponder hardware while Imani preserves evidence.'
}).commit;

const jointInspection = commitInput({
  campaignState: pellTerms.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage40.joint-inspection-release',
  playerInput: 'Execute the joint inspection team now: Priya opens a shared inspection record and gives Pell a lawful exit through a Compact official, Bronn secures Ivers and the detained officers for supervised release and questioning, Imani seals the cargo evidence chain around the emergency hardware, and Rowan verifies the manifest without public claims.'
}).commit;

const cargoPulse = commitInput({
  campaignState: jointInspection.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage40.cargo-diagnostic-pulse',
  playerInput: 'Trace the diagnostic pulse with Rowan and Imani, keep the emergency hardware under joint seal and shared custody, have Priya preserve Pell\'s lawful exit, and have Bronn hold a non-hostile intercept posture with defensive shields, no targeting solution, and the cargo evidence chain intact.'
}).commit;

const hardwareRecovery = commitInput({
  campaignState: cargoPulse.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage40.hardware-recovery',
  playerInput: 'Recover the emergency hardware with Imani and Rowan, preserve the diagnostic trace and recovery telemetry for comparison against the warning, keep the hardware under a joint evidence seal pending final custody review, preserve Pell\'s lawful exit, and have Bronn maintain defensive non-hostile security.'
}).commit;

const resolution = commitInput({
  campaignState: hardwareRecovery.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage40.resolution-terms',
  playerInput: 'Create a joint incident record for Starfleet and Compact access, have Ivers remain a witness because she trusts the record, record Pell as a lawful witness with cooperation terms, preserve joint custody terms for the recovered emergency hardware, publicly acknowledge the Starfleet authentication failure, and document Parnell technical debt for engineering follow-up.'
}).commit;

assert.equal(resolution.campaignState.mission.activePhaseId, 'chapter-1-resolution-terms');
assert.deepEqual(resolution.campaignState.mission.availableDecisionPointIds, ['decision.asterion-arrival-false-colors']);

const transition = commitInput({
  campaignState: resolution.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage40.false-colors-transition',
  playerInput: 'Bring the joint incident record into the Asterion Station formal briefing, notify Asterion, Starfleet, and Compact authorities, receive the Compact patrol report about an attack by a vessel identifying itself as the U.S.S. Breckinridge, have Rowan begin verification, and have Bronn hold a defensive non-hostile posture.'
});

const committed = transition.commit.campaignState;
const sourceOutcomeId = transition.commit.turnPacket.outcomePacket.id;

assert.equal(transition.preview.turnPacket.intentParse.primaryIntent, 'transition-chapter1-to-false-colors');
assert.equal(transition.preview.turnPacket.actionClassification.category, 'validWithinMissionBounds');
assert.equal(transition.preview.turnPacket.authorityCapabilityCheck.result, 'authorizedAndFeasibleWithOperationalRisk');
assert.equal(transition.commit.turnPacket.outcomePacket.resultBand, 'Success');
assert.equal(committed.mission.activePhaseId, 'asterion-arrival-false-colors');
assert.deepEqual(committed.mission.availableDecisionPointIds, []);
assert.equal(committed.mission.knownFacts.includes('chapter-1.asterion-arrival'), true);
assert.equal(committed.mission.knownFacts.includes('chapter-1.compact-patrol-false-colors-report'), true);
assert.equal(committed.mission.knownFacts.includes('chapter-1.truth.compact-recovery-team'), false);
assert.equal(committed.mission.knownFacts.includes('chapter-1.truth.no-pathogen'), false);
assert.equal(committed.mission.knownFacts.includes('chapter-1.truth.forged-starfleet-signals'), false);

assert.equal(flagValue(committed, 'chapter-1.transition-status'), 'false-colors-report-received');
assert.equal(flagValue(committed, 'chapter-1.next-mission-hook'), 'chapter-2-false-colors-open');
assert.equal(flagValue(committed, 'chapter-1.compact-posture'), 'joint-record-access');
assert.equal(flagValue(committed, 'chapter-1.incident-record-status'), 'joint-record-created');
assert.equal(committed.mission.endState, 'chapter-1-transition-to-false-colors');
assert.equal(committed.mission.completedMissionId, 'chapter-1-the-empty-convoy');
assert.equal(committed.mission.nextMissionId, 'chapter-2-false-colors');
assert.equal(committed.mission.transitionStatus, 'chapter-2-pending');
assert.equal(committed.mainCampaign.completedChapters.includes('chapter-1-the-empty-convoy'), true);
assert.equal(committed.mainCampaign.availableChapters.includes('chapter-2-false-colors'), true);
assert.equal((committed.mainCampaign.lockedChapters || []).includes('chapter-2-false-colors'), false);
assert.equal(committed.mainCampaign.chapterCursor, 'chapter-2-false-colors');

assert.equal(frontById(committed, 'front.chapter-1.security-exposure')?.status, 'false-colors-alarm-contained');
assert.equal(frontById(committed, 'front.chapter-1.evidence-custody')?.status, 'joint-record-carried-forward');
assert.equal(frontById(committed, 'front.chapter-1.regional-diplomacy')?.status, 'false-colors-crisis-open');
assert.equal(actorPosture(committed, 'uss-breckinridge')?.posture, 'false-colors-accusation-received');
assert.equal(actorPosture(committed, 'compact-recovery-team')?.posture, 'watching-false-colors-report');
assert.equal(actorPosture(committed, 'compact-recovery-team')?.playerSummary, null);

for (const frontId of ['front.chapter-1.security-exposure', 'front.chapter-1.evidence-custody', 'front.chapter-1.regional-diplomacy']) {
  const front = frontById(committed, frontId);
  assert.equal(front.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(front.visibility, 'hidden');
}
for (const actorId of ['uss-breckinridge', 'compact-recovery-team']) {
  const posture = actorPosture(committed, actorId);
  assert.equal(posture.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(posture.visibility, 'hidden');
}

const loaded = cloneJson(committed);
assert.deepEqual(frontStatuses(loaded), frontStatuses(committed), 'front status survives JSON save/load clone');
assert.deepEqual(actorPostures(loaded), actorPostures(committed), 'actor posture survives JSON save/load clone');

const restored = deleteCommittedOutcome(committed, sourceOutcomeId);
assert.deepEqual(restored.fronts || [], resolution.campaignState.fronts || [], 'delete restores pre-transition fronts');
assert.deepEqual(restored.actors?.postures || [], resolution.campaignState.actors?.postures || [], 'delete restores pre-transition actor postures');
assert.deepEqual(restored.mainCampaign, resolution.campaignState.mainCampaign, 'delete restores pre-transition main campaign state');
assert.equal(restored.mission.activePhaseId, 'chapter-1-resolution-terms');
assert.deepEqual(restored.mission.availableDecisionPointIds, ['decision.asterion-arrival-false-colors']);

assertHiddenTermsAbsent(transition.preview.turnPacket.outcomePacket);
assertHiddenTermsAbsent(transition.preview.turnPacket.narratorPacket);
assertHiddenTermsAbsent(transition.preview.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(transition.commit.turnPacket.outcomePacket);
assertHiddenTermsAbsent(transition.commit.turnPacket.narratorPacket);
assertHiddenTermsAbsent(transition.commit.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(committed.fronts.map((front) => front.playerSummary));
assertHiddenTermsAbsent(committed.actors.postures.map((posture) => posture.playerSummary));

console.log('Stage 40 Chapter 1 transition tests passed: Asterion arrival, False Colors report, Chapter 2 unlock, fronts, actors, save/load, rollback, and hidden-truth safety');
