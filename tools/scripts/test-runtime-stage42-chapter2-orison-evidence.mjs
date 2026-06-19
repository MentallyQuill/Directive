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
    activeMissionGraphId: 'breckinridge.ashes-of-peace.chapter-2-false-colors',
    activeMissionGraphPath: 'packages/bundled/breckinridge/chapter-2-false-colors.mission-graph.json',
    activePhaseId: 'false-colors-arrival-briefing',
    phase: 'false-colors-arrival-briefing',
    knownFacts: [
      'chapter-2.aegis-two-attack-report',
      'chapter-2.false-breckinridge-signature',
      'chapter-2.breckinridge-convoy-alibi',
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
    graphPath: 'packages/bundled/breckinridge/chapter-2-false-colors.mission-graph.json',
    projectionPath: 'packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json',
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

const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const chapter2Graph = readJson('packages/bundled/breckinridge/chapter-2-false-colors.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');

const transparencyTerms = commitInput({
  campaignState: chapter2State(projection),
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage42.false-colors-transparency',
  playerInput: 'In the Asterion briefing, offer immediate Miriam medical help to Aegis Two as care first and not leverage, invite Kessler and Compact observers into a joint audit with Priya and Rowan, prove the Breckinridge alibi through independent verification, Orison sensor baselines, and a cryptographic challenge, use a classified annex for tactical architecture, and refuse unrestricted command-auth access while offering a controlled alternative.'
}).commit;

assert.equal(transparencyTerms.campaignState.mission.activePhaseId, 'transparency-terms-set');
assert.deepEqual(transparencyTerms.campaignState.mission.availableDecisionPointIds, ['decision.orison-evidence-baseline']);

const evidenceBaseline = commitInput({
  campaignState: transparencyTerms.campaignState,
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage42.orison-evidence',
  playerInput: 'Have Priya and Rowan lock the Orison civilian sensor baselines and traffic records under the joint audit chain with Compact observers present, publish selected nonclassified timing logs, have Imani demonstrate from post-refit calibration that the recorded warp-field artifact is physically inconsistent with the real Breckinridge, reconstruct the attacker route without exposing command authentication or tactical architecture, and preserve Directorate access logs quietly without public accusation.'
});

const committed = evidenceBaseline.commit.campaignState;
const sourceOutcomeId = evidenceBaseline.commit.turnPacket.outcomePacket.id;

assert.equal(evidenceBaseline.preview.turnPacket.intentParse.primaryIntent, 'establish-orison-evidence-baseline');
assert.equal(evidenceBaseline.preview.turnPacket.actionClassification.category, 'validWithinMissionBounds');
assert.equal(evidenceBaseline.preview.turnPacket.authorityCapabilityCheck.result, 'authorizedAndFeasibleWithOperationalRisk');
assert.equal(evidenceBaseline.commit.turnPacket.outcomePacket.resultBand, 'Success');
assert.equal(committed.mission.activeMissionId, 'chapter-2-false-colors');
assert.equal(committed.mission.activePhaseId, 'orison-evidence-baseline');
assert.deepEqual(committed.mission.availableDecisionPointIds, ['decision.aegis-medical-trust']);

for (const factId of [
  'chapter-2.orison-sensor-baseline-preserved',
  'chapter-2.breckinridge-calibration-mismatch',
  'chapter-2.attack-track-reconstruction-opened'
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

assert.equal(flagValue(committed, 'chapter-2.audit-chain-status'), 'independent-baseline-preserved');
assert.equal(flagValue(committed, 'chapter-2.orison-sensor-status'), 'baseline-secured');
assert.equal(flagValue(committed, 'chapter-2.calibration-evidence-status'), 'breckinridge-mismatch-demonstrated');
assert.equal(flagValue(committed, 'chapter-2.attack-reconstruction-status'), 'route-reconstruction-opened');
assert.equal(flagValue(committed, 'chapter-2.disclosure-boundary-status'), 'selected-logs-released');
assert.equal(flagValue(committed, 'chapter-2.breckinridge-alibi-status'), 'independent-verification-framed');

assert.equal(clockValue(committed, 'chapter-2.public-anger'), 0);
assert.equal(clockValue(committed, 'chapter-2.audit-fragility'), 0);
assert.equal(clockValue(committed, 'chapter-2.security-access-risk'), 0);

assert.equal(frontById(committed, 'front.chapter-2.evidence-audit')?.status, 'orison-baseline-preserved');
assert.equal(frontById(committed, 'front.chapter-2.security-access')?.status, 'selected-disclosure-contained');
assert.equal(frontById(committed, 'front.chapter-2.political-legitimacy')?.status, 'legitimacy-evidence-improved');
assert.equal(actorPosture(committed, 'uss-breckinridge')?.posture, 'alibi-supported-by-calibration');
assert.equal(actorPosture(committed, 'director-nia-kessler')?.posture, 'audit-chain-defensible');
assert.equal(actorPosture(committed, 'marshal-holt')?.posture, 'access-records-preserved');

for (const frontId of ['front.chapter-2.evidence-audit', 'front.chapter-2.security-access', 'front.chapter-2.political-legitimacy']) {
  const front = frontById(committed, frontId);
  assert.equal(front.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(front.visibility, 'hidden');
}
for (const actorId of ['uss-breckinridge', 'director-nia-kessler', 'marshal-holt']) {
  const posture = actorPosture(committed, actorId);
  assert.equal(posture.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(posture.visibility, 'hidden');
}

const loaded = cloneJson(committed);
assert.deepEqual(frontStatuses(loaded), frontStatuses(committed), 'front status survives JSON save/load clone');
assert.deepEqual(actorPostures(loaded), actorPostures(committed), 'actor posture survives JSON save/load clone');

const restored = deleteCommittedOutcome(committed, sourceOutcomeId);
assert.deepEqual(restored.fronts || [], transparencyTerms.campaignState.fronts || [], 'delete restores pre-evidence fronts');
assert.deepEqual(restored.actors?.postures || [], transparencyTerms.campaignState.actors?.postures || [], 'delete restores pre-evidence actor postures');
assert.equal(restored.mission.activePhaseId, 'transparency-terms-set');
assert.deepEqual(restored.mission.availableDecisionPointIds, ['decision.orison-evidence-baseline']);

assertHiddenTermsAbsent(evidenceBaseline.preview.turnPacket.outcomePacket);
assertHiddenTermsAbsent(evidenceBaseline.preview.turnPacket.narratorPacket);
assertHiddenTermsAbsent(evidenceBaseline.preview.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(evidenceBaseline.commit.turnPacket.outcomePacket);
assertHiddenTermsAbsent(evidenceBaseline.commit.turnPacket.narratorPacket);
assertHiddenTermsAbsent(evidenceBaseline.commit.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(committed.fronts.map((front) => front.playerSummary));
assertHiddenTermsAbsent(committed.actors.postures.map((posture) => posture.playerSummary));

console.log('Stage 42 Chapter 2 Orison evidence tests passed: baseline preservation, calibration proof, route reconstruction, fronts, actors, save/load, rollback, and hidden-source safety');
