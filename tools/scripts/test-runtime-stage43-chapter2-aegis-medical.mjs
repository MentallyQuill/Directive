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

function chapter2State(projection) {
  const state = cloneJson(projection.initialState);
  state.player.name = 'Talia Serrin';
  state.player.creationStatus = 'ready';
  state.campaign.currentStardate = 53094;
  state.mission = {
    ...state.mission,
    activeMissionId: 'chapter-2-false-colors',
    activeMissionGraphId: 'breckenridge.ashes-of-peace.chapter-2-false-colors',
    activeMissionGraphPath: 'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json',
    activePhaseId: 'false-colors-arrival-briefing',
    phase: 'false-colors-arrival-briefing',
    knownFacts: [
      'chapter-2.aegis-two-attack-report',
      'chapter-2.false-breckenridge-signature',
      'chapter-2.breckenridge-convoy-alibi',
      'chapter-2.aegis-two-casualties'
    ],
    availableDecisionPointIds: ['decision.false-colors-transparency-terms'],
    outcomeFlags: []
  };
  state.mainCampaign = {
    ...state.mainCampaign,
    completedChapters: ['prelude-a-ship-underway', 'chapter-1-the-empty-convoy'],
    availableChapters: ['chapter-2-false-colors'],
    lockedChapters: (state.mainCampaign?.lockedChapters || []).filter((id) => id !== 'chapter-2-false-colors'),
    chapterCursor: 'chapter-2-false-colors'
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

function previewChapter2({ campaignState, graph, projection, crewDataset, turnId, playerInput }) {
  return createProvisionalDirectorTurnRuntime({
    campaignState,
    graph,
    projection,
    crewDataset,
    graphPath: 'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json',
    projectionPath: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
    turnId,
    playerInput
  });
}

function commitInput({ campaignState, graph, projection, crewDataset, turnId, playerInput, confirmWarnings = false }) {
  const preview = previewChapter2({ campaignState, graph, projection, crewDataset, turnId, playerInput });
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
    'cargo tug',
    'hull projection',
    'pale lantern',
    'lantern escalation',
    'modified phaser',
    'remote-controlled',
    'hecate',
    'local patrol schedules',
    'stolen transponder'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }
}

const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const chapter2Graph = readJson('packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');

const transparencyTerms = commitInput({
  campaignState: chapter2State(projection),
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage43.false-colors-transparency',
  playerInput: 'In the Asterion briefing, offer immediate Miriam medical help to Aegis Two as care first and not leverage, invite Kessler and Compact observers into a joint audit with Priya and Rowan, prove the Breckenridge alibi through independent verification, Orison sensor baselines, and a cryptographic challenge, use a classified annex for tactical architecture, and refuse unrestricted command-auth access while offering a controlled alternative.'
}).commit;

assert.equal(transparencyTerms.campaignState.mission.activePhaseId, 'transparency-terms-set');
assert.deepEqual(transparencyTerms.campaignState.mission.availableDecisionPointIds, ['decision.orison-evidence-baseline']);

const evidenceBaseline = commitInput({
  campaignState: transparencyTerms.campaignState,
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage43.orison-evidence',
  playerInput: 'Have Priya and Rowan lock the Orison civilian sensor baselines and traffic records under the joint audit chain with Compact observers present, publish selected nonclassified timing logs, have Imani demonstrate from post-refit calibration that the recorded warp-field artifact is physically inconsistent with the real Breckenridge, reconstruct the attacker route without exposing command authentication or tactical architecture, and preserve Directorate access logs quietly without public accusation.'
}).commit;

assert.equal(evidenceBaseline.campaignState.mission.activePhaseId, 'orison-evidence-baseline');
assert.deepEqual(evidenceBaseline.campaignState.mission.availableDecisionPointIds, ['decision.aegis-medical-trust']);

const medicalTrust = commitInput({
  campaignState: evidenceBaseline.campaignState,
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage43.aegis-medical-trust',
  playerInput: 'Have Miriam stabilize the critical Aegis Two officer through a joint medical channel with Compact medical observers present. Keep treatment care first and not leverage, record medical neutrality as no admission of culpability, protect patient consent and privacy, and preserve a voluntary patrol officer statement only after medical clearance.'
});

const committed = medicalTrust.commit.campaignState;
const sourceOutcomeId = medicalTrust.commit.turnPacket.outcomePacket.id;

assert.equal(medicalTrust.preview.turnPacket.intentParse.primaryIntent, 'stabilize-aegis-medical-trust');
assert.equal(medicalTrust.preview.turnPacket.actionClassification.category, 'validWithinMissionBounds');
assert.equal(medicalTrust.preview.turnPacket.authorityCapabilityCheck.result, 'authorizedAndFeasibleWithOperationalRisk');
assert.equal(medicalTrust.commit.turnPacket.outcomePacket.resultBand, 'Success');
assert.equal(committed.mission.activeMissionId, 'chapter-2-false-colors');
assert.equal(committed.mission.activePhaseId, 'aegis-medical-trust');
assert.deepEqual(committed.mission.availableDecisionPointIds, ['decision.security-access-demonstration']);

for (const factId of [
  'chapter-2.aegis-two-medical-channel-opened',
  'chapter-2.critical-officer-stabilized',
  'chapter-2.patrol-officer-testimony-preserved'
]) {
  assert.equal(committed.mission.knownFacts.includes(factId), true, `known facts include ${factId}`);
}
for (const hiddenFactId of [
  'chapter-2.truth.disguised-cargo-tug',
  'chapter-2.truth.holt-cell-staged-attack',
  'chapter-2.truth.lantern-escalated-attack',
  'chapter-2.truth.hecate-control-trace',
  'chapter-2.truth.local-patrol-schedules-supplied'
]) {
  assert.equal(committed.mission.knownFacts.includes(hiddenFactId), false, `known facts exclude ${hiddenFactId}`);
}

assert.equal(flagValue(committed, 'chapter-2.aegis-care-status'), 'critical-officer-stabilized');
assert.equal(flagValue(committed, 'chapter-2.medical-neutrality-status'), 'care-separated-from-politics');
assert.equal(flagValue(committed, 'chapter-2.compact-medical-trust'), 'improved');
assert.equal(flagValue(committed, 'chapter-2.patrol-testimony-status'), 'voluntary-testimony-preserved');
assert.equal(flagValue(committed, 'chapter-2.public-medical-record-status'), 'medical-neutrality-recorded');
assert.equal(flagValue(committed, 'chapter-2.aegis-medical-posture'), 'medical-help-separated-from-politics');

assert.equal(clockValue(committed, 'chapter-2.medical-risk'), 0);
assert.equal(clockValue(committed, 'chapter-2.public-anger'), 0);
assert.equal(clockValue(committed, 'chapter-2.audit-fragility'), 0);

assert.equal(frontById(committed, 'front.chapter-2.aegis-medical')?.status, 'critical-care-stabilized');
assert.equal(frontById(committed, 'front.chapter-2.evidence-audit')?.status, 'voluntary-testimony-preserved');
assert.equal(frontById(committed, 'front.chapter-2.political-legitimacy')?.status, 'medical-neutrality-supports-legitimacy');
assert.equal(actorPosture(committed, 'aegis-two')?.posture, 'critical-care-stabilized');
assert.equal(actorPosture(committed, 'director-nia-kessler')?.posture, 'medical-neutrality-defensible');
assert.equal(actorPosture(committed, 'uss-breckenridge')?.posture, 'testimony-preserved-through-care');

for (const frontId of ['front.chapter-2.aegis-medical', 'front.chapter-2.evidence-audit', 'front.chapter-2.political-legitimacy']) {
  const front = frontById(committed, frontId);
  assert.equal(front.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(front.visibility, 'hidden');
}
for (const actorId of ['aegis-two', 'director-nia-kessler', 'uss-breckenridge']) {
  const posture = actorPosture(committed, actorId);
  assert.equal(posture.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(posture.visibility, 'hidden');
}

const loaded = cloneJson(committed);
assert.deepEqual(frontStatuses(loaded), frontStatuses(committed), 'front status survives JSON save/load clone');
assert.deepEqual(actorPostures(loaded), actorPostures(committed), 'actor posture survives JSON save/load clone');

const restored = deleteCommittedOutcome(committed, sourceOutcomeId);
assert.deepEqual(restored.fronts || [], evidenceBaseline.campaignState.fronts || [], 'delete restores pre-medical fronts');
assert.deepEqual(restored.actors?.postures || [], evidenceBaseline.campaignState.actors?.postures || [], 'delete restores pre-medical actor postures');
assert.equal(restored.mission.activePhaseId, 'orison-evidence-baseline');
assert.deepEqual(restored.mission.availableDecisionPointIds, ['decision.aegis-medical-trust']);

assertHiddenTermsAbsent(medicalTrust.preview.turnPacket.outcomePacket);
assertHiddenTermsAbsent(medicalTrust.preview.turnPacket.narratorPacket);
assertHiddenTermsAbsent(medicalTrust.preview.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(medicalTrust.commit.turnPacket.outcomePacket);
assertHiddenTermsAbsent(medicalTrust.commit.turnPacket.narratorPacket);
assertHiddenTermsAbsent(medicalTrust.commit.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(committed.fronts.map((front) => front.playerSummary));
assertHiddenTermsAbsent(committed.actors.postures.map((posture) => posture.playerSummary));

console.log('Stage 43 Chapter 2 Aegis medical tests passed: medical trust, voluntary testimony, clocks, fronts, actors, save/load, rollback, and hidden-source safety');
