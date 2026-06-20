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
  turnId: 'turn.stage44.false-colors-transparency',
  playerInput: 'In the Asterion briefing, offer immediate Miriam medical help to Aegis Two as care first and not leverage, invite Kessler and Compact observers into a joint audit with Priya and Rowan, prove the Breckenridge alibi through independent verification, Orison sensor baselines, and a cryptographic challenge, use a classified annex for tactical architecture, and refuse unrestricted command-auth access while offering a controlled alternative.'
}).commit;

const evidenceBaseline = commitInput({
  campaignState: transparencyTerms.campaignState,
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage44.orison-evidence',
  playerInput: 'Have Priya and Rowan lock the Orison civilian sensor baselines and traffic records under the joint audit chain with Compact observers present, publish selected nonclassified timing logs, have Imani demonstrate from post-refit calibration that the recorded warp-field artifact is physically inconsistent with the real Breckenridge, reconstruct the attacker route without exposing command authentication or tactical architecture, and preserve Directorate access logs quietly without public accusation.'
}).commit;

const medicalTrust = commitInput({
  campaignState: evidenceBaseline.campaignState,
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage44.aegis-medical-trust',
  playerInput: 'Have Miriam stabilize the critical Aegis Two officer through a joint medical channel with Compact medical observers present. Keep treatment care first and not leverage, record medical neutrality as no admission of culpability, protect patient consent and privacy, and preserve a voluntary patrol officer statement only after medical clearance.'
}).commit;

assert.equal(medicalTrust.campaignState.mission.activePhaseId, 'aegis-medical-trust');
assert.deepEqual(medicalTrust.campaignState.mission.availableDecisionPointIds, ['decision.security-access-demonstration']);

const securityAccess = commitInput({
  campaignState: medicalTrust.campaignState,
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage44.security-access-demonstration',
  playerInput: "Have Bronn and Priya run a command-authentication demonstration inside a controlled command-authentication annex: a challenge-response and transponder integrity demonstration with selected observer-facing proof for Kessler. Refuse unrestricted command-system access, honor Tolland's disclosure limit, keep classified architecture sealed, and record that Bronn is a professional security witness, not a scapegoat."
});

const committed = securityAccess.commit.campaignState;
const sourceOutcomeId = securityAccess.commit.turnPacket.outcomePacket.id;

assert.equal(securityAccess.preview.turnPacket.intentParse.primaryIntent, 'set-security-access-demonstration');
assert.equal(securityAccess.preview.turnPacket.actionClassification.category, 'validWithinMissionBounds');
assert.equal(securityAccess.preview.turnPacket.authorityCapabilityCheck.result, 'authorizedAndFeasibleWithOperationalRisk');
assert.equal(securityAccess.commit.turnPacket.outcomePacket.resultBand, 'Success');
assert.equal(committed.mission.activeMissionId, 'chapter-2-false-colors');
assert.equal(committed.mission.activePhaseId, 'security-access-demonstration');
assert.deepEqual(committed.mission.availableDecisionPointIds, ['decision.joint-investigation-charter']);

for (const factId of [
  'chapter-2.command-auth-annex-defined',
  'chapter-2.bronn-security-demonstration-recorded',
  'chapter-2.kessler-access-alternative-framed'
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

assert.equal(flagValue(committed, 'chapter-2.security-access-status'), 'controlled-demonstration');
assert.equal(flagValue(committed, 'chapter-2.command-auth-exposure-status'), 'protected');
assert.equal(flagValue(committed, 'chapter-2.bronn-audit-status'), 'professional-demonstration');
assert.equal(flagValue(committed, 'chapter-2.kessler-access-position'), 'defensible-alternative');
assert.equal(flagValue(committed, 'chapter-2.tolland-disclosure-status'), 'limits-honored');
assert.equal(flagValue(committed, 'chapter-2.tactical-secrecy-posture'), 'controlled-annex');
assert.equal(flagValue(committed, 'chapter-2.compact-access-scope'), 'observer-limited');

assert.equal(clockValue(committed, 'chapter-2.security-access-risk'), 0);
assert.equal(clockValue(committed, 'chapter-2.audit-fragility'), 0);
assert.equal(clockValue(committed, 'chapter-2.public-anger'), 0);

assert.equal(frontById(committed, 'front.chapter-2.security-access')?.status, 'controlled-command-auth-demo');
assert.equal(frontById(committed, 'front.chapter-2.evidence-audit')?.status, 'identity-proof-demonstrated');
assert.equal(frontById(committed, 'front.chapter-2.political-legitimacy')?.status, 'kessler-face-saving-access-path');
assert.equal(actorPosture(committed, 'uss-breckenridge')?.posture, 'command-auth-boundary-defended');
assert.equal(actorPosture(committed, 'hadrik-bronn')?.posture, 'professional-demonstration');
assert.equal(actorPosture(committed, 'director-nia-kessler')?.posture, 'defensible-alternative');
assert.equal(actorPosture(committed, 'helena-tolland')?.posture, 'limits-honored');

for (const frontId of ['front.chapter-2.security-access', 'front.chapter-2.evidence-audit', 'front.chapter-2.political-legitimacy']) {
  const front = frontById(committed, frontId);
  assert.equal(front.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(front.visibility, 'hidden');
}
for (const actorId of ['uss-breckenridge', 'hadrik-bronn', 'director-nia-kessler', 'helena-tolland']) {
  const posture = actorPosture(committed, actorId);
  assert.equal(posture.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(posture.visibility, 'hidden');
}

const loaded = cloneJson(committed);
assert.deepEqual(frontStatuses(loaded), frontStatuses(committed), 'front status survives JSON save/load clone');
assert.deepEqual(actorPostures(loaded), actorPostures(committed), 'actor posture survives JSON save/load clone');

const restored = deleteCommittedOutcome(committed, sourceOutcomeId);
assert.deepEqual(restored.fronts || [], medicalTrust.campaignState.fronts || [], 'delete restores pre-security fronts');
assert.deepEqual(restored.actors?.postures || [], medicalTrust.campaignState.actors?.postures || [], 'delete restores pre-security actor postures');
assert.equal(restored.mission.activePhaseId, 'aegis-medical-trust');
assert.deepEqual(restored.mission.availableDecisionPointIds, ['decision.security-access-demonstration']);

assertHiddenTermsAbsent(securityAccess.preview.turnPacket.outcomePacket);
assertHiddenTermsAbsent(securityAccess.preview.turnPacket.narratorPacket);
assertHiddenTermsAbsent(securityAccess.preview.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(securityAccess.commit.turnPacket.outcomePacket);
assertHiddenTermsAbsent(securityAccess.commit.turnPacket.narratorPacket);
assertHiddenTermsAbsent(securityAccess.commit.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(committed.fronts.map((front) => front.playerSummary));
assertHiddenTermsAbsent(committed.actors.postures.map((posture) => posture.playerSummary));

console.log('Stage 44 Chapter 2 security access tests passed: controlled command-auth proof, Bronn role, Kessler alternative, clocks, fronts, actors, save/load, rollback, and hidden-source safety');
