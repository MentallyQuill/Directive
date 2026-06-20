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

function assertHiddenTermsAbsent(value, { allowHecate = false } = {}) {
  const text = JSON.stringify(value).toLowerCase();
  const terms = [
    'cargo tug',
    'hull projection',
    'pale lantern',
    'lantern escalation',
    'modified phaser',
    'remote-controlled',
    'local patrol schedules',
    'stolen transponder'
  ];
  if (!allowHecate) {
    terms.push('hecate');
  }
  for (const term of terms) {
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
  turnId: 'turn.stage45.false-colors-transparency',
  playerInput: 'In the Asterion briefing, offer immediate Miriam medical help to Aegis Two as care first and not leverage, invite Kessler and Compact observers into a joint audit with Priya and Rowan, prove the Breckenridge alibi through independent verification, Orison sensor baselines, and a cryptographic challenge, use a classified annex for tactical architecture, and refuse unrestricted command-auth access while offering a controlled alternative.'
}).commit;

const evidenceBaseline = commitInput({
  campaignState: transparencyTerms.campaignState,
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage45.orison-evidence',
  playerInput: 'Have Priya and Rowan lock the Orison civilian sensor baselines and traffic records under the joint audit chain with Compact observers present, publish selected nonclassified timing logs, have Imani demonstrate from post-refit calibration that the recorded warp-field artifact is physically inconsistent with the real Breckenridge, reconstruct the attacker route without exposing command authentication or tactical architecture, and preserve Directorate access logs quietly without public accusation.'
}).commit;

const medicalTrust = commitInput({
  campaignState: evidenceBaseline.campaignState,
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage45.aegis-medical-trust',
  playerInput: 'Have Miriam stabilize the critical Aegis Two officer through a joint medical channel with Compact medical observers present. Keep treatment care first and not leverage, record medical neutrality as no admission of culpability, protect patient consent and privacy, and preserve a voluntary patrol officer statement only after medical clearance.'
}).commit;

const securityAccess = commitInput({
  campaignState: medicalTrust.campaignState,
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage45.security-access-demonstration',
  playerInput: "Have Bronn and Priya run a command-authentication demonstration inside a controlled command-authentication annex: a challenge-response and transponder integrity demonstration with selected observer-facing proof for Kessler. Refuse unrestricted command-system access, honor Tolland's disclosure limit, keep classified architecture sealed, and record that Bronn is a professional security witness, not a scapegoat."
}).commit;

assert.equal(securityAccess.campaignState.mission.activePhaseId, 'security-access-demonstration');
assert.deepEqual(securityAccess.campaignState.mission.availableDecisionPointIds, ['decision.joint-investigation-charter']);

const jointCharter = commitInput({
  campaignState: securityAccess.campaignState,
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage45.joint-investigation-charter',
  playerInput: 'Frame a joint investigation charter with Kessler as a face-saving public partner: acknowledge the Breckenridge innocence route without weakening her position at home, preserve Directorate access logs under an audit firewall with no unilateral changes from Holt, preserve the weak Hecate relay trace for later correlation because it is too weak to pursue immediately, and have Whitaker accept Open Orders so the Breckenridge remains available in the Reach while forensic specialists travel.'
});

const committed = jointCharter.commit.campaignState;
const sourceOutcomeId = jointCharter.commit.turnPacket.outcomePacket.id;

assert.equal(jointCharter.preview.turnPacket.intentParse.primaryIntent, 'frame-joint-investigation-charter');
assert.equal(jointCharter.preview.turnPacket.intentParse.signals.preservesWeakHecateTrace, true);
assert.equal(jointCharter.preview.turnPacket.intentParse.signals.overclaimsHecateTrace, false);
assert.equal(jointCharter.preview.turnPacket.actionClassification.category, 'validWithinMissionBounds');
assert.equal(jointCharter.preview.turnPacket.authorityCapabilityCheck.result, 'authorizedAndFeasibleWithOperationalRisk');
assert.equal(jointCharter.commit.turnPacket.outcomePacket.resultBand, 'Success');
assert.equal(committed.mission.activeMissionId, 'chapter-2-false-colors');
assert.equal(committed.mission.activePhaseId, 'joint-investigation-charter');
assert.deepEqual(committed.mission.availableDecisionPointIds, []);

for (const factId of [
  'chapter-2.kessler-joint-legitimacy-statement',
  'chapter-2.holt-interference-restricted',
  'chapter-2.weak-hecate-trace-preserved',
  'chapter-2.open-orders-reach-presence-authorized'
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

assert.equal(flagValue(committed, 'chapter-2.joint-investigation-status'), 'joint-charter-framed');
assert.equal(flagValue(committed, 'chapter-2.kessler-legitimacy-status'), 'face-saving-support');
assert.equal(flagValue(committed, 'chapter-2.holt-containment-status'), 'interference-restricted');
assert.equal(flagValue(committed, 'chapter-2.hecate-lead-status'), 'weak-trace-preserved');
assert.equal(flagValue(committed, 'chapter-2.open-orders-transition-status'), 'open-orders-authorized');

assert.equal(committed.mission.endState, 'chapter-2-joint-investigation-charter');
assert.equal(committed.mission.completedMissionId, 'chapter-2-false-colors');
assert.equal(committed.mission.nextMissionId, 'open-orders-1-work-worth-doing');
assert.equal(committed.mission.transitionStatus, 'open-orders-1-pending');
assert.equal(committed.mainCampaign.completedChapters.includes('chapter-2-false-colors'), true);
assert.equal(committed.mainCampaign.availableChapters.includes('open-orders-1-work-worth-doing'), true);
assert.equal((committed.mainCampaign.lockedChapters || []).includes('open-orders-1-work-worth-doing'), false);
assert.equal(committed.mainCampaign.chapterCursor, 'open-orders-1-work-worth-doing');

assert.equal(clockValue(committed, 'chapter-2.public-anger'), 0);
assert.equal(clockValue(committed, 'chapter-2.audit-fragility'), 0);
assert.equal(clockValue(committed, 'chapter-2.security-access-risk'), 0);

assert.equal(frontById(committed, 'front.chapter-2.political-legitimacy')?.status, 'joint-legitimacy-framed');
assert.equal(frontById(committed, 'front.chapter-2.evidence-audit')?.status, 'weak-hecate-trace-preserved');
assert.equal(frontById(committed, 'front.chapter-2.security-access')?.status, 'interference-restricted');
assert.equal(actorPosture(committed, 'director-nia-kessler')?.posture, 'face-saving-support');
assert.equal(actorPosture(committed, 'marshal-holt')?.posture, 'interference-restricted');
assert.equal(actorPosture(committed, 'uss-breckenridge')?.posture, 'open-orders-authorized');
assert.equal(actorPosture(committed, 'mara-whitaker')?.posture, 'open-orders-command-accepted');

for (const frontId of ['front.chapter-2.political-legitimacy', 'front.chapter-2.evidence-audit', 'front.chapter-2.security-access']) {
  const front = frontById(committed, frontId);
  assert.equal(front.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(front.visibility, 'hidden');
}
for (const actorId of ['director-nia-kessler', 'marshal-holt', 'uss-breckenridge', 'mara-whitaker']) {
  const posture = actorPosture(committed, actorId);
  assert.equal(posture.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(posture.visibility, 'hidden');
}

const loaded = cloneJson(committed);
assert.deepEqual(frontStatuses(loaded), frontStatuses(committed), 'front status survives JSON save/load clone');
assert.deepEqual(actorPostures(loaded), actorPostures(committed), 'actor posture survives JSON save/load clone');

const restored = deleteCommittedOutcome(committed, sourceOutcomeId);
assert.deepEqual(restored.fronts || [], securityAccess.campaignState.fronts || [], 'delete restores pre-charter fronts');
assert.deepEqual(restored.actors?.postures || [], securityAccess.campaignState.actors?.postures || [], 'delete restores pre-charter actor postures');
assert.equal(restored.mission.activePhaseId, 'security-access-demonstration');
assert.deepEqual(restored.mission.availableDecisionPointIds, ['decision.joint-investigation-charter']);
assert.equal(restored.mainCampaign.chapterCursor, 'chapter-2-false-colors');

assertHiddenTermsAbsent(jointCharter.preview.turnPacket.outcomePacket, { allowHecate: true });
assertHiddenTermsAbsent(jointCharter.preview.turnPacket.narratorPacket, { allowHecate: true });
assertHiddenTermsAbsent(jointCharter.preview.turnPacket.commandLogPacket, { allowHecate: true });
assertHiddenTermsAbsent(jointCharter.commit.turnPacket.outcomePacket, { allowHecate: true });
assertHiddenTermsAbsent(jointCharter.commit.turnPacket.narratorPacket, { allowHecate: true });
assertHiddenTermsAbsent(jointCharter.commit.turnPacket.commandLogPacket, { allowHecate: true });
assertHiddenTermsAbsent(committed.fronts.map((front) => front.playerSummary), { allowHecate: true });
assertHiddenTermsAbsent(committed.actors.postures.map((posture) => posture.playerSummary), { allowHecate: true });

console.log('Stage 45 Chapter 2 joint charter tests passed: Kessler legitimacy, Holt containment, weak Hecate lead, Open Orders transition, clocks, fronts, actors, save/load, rollback, and hidden-source safety');
