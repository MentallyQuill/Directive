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
    'patrol schedules'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }
}

const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const chapter2Graph = readJson('packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const startingState = chapter2State(projection);

const transparencyTerms = commitInput({
  campaignState: startingState,
  graph: chapter2Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage41.false-colors-transparency',
  playerInput: 'In the Asterion briefing, offer immediate Miriam medical help to Aegis Two as care first and not leverage, invite Kessler and Compact observers into a joint audit with Priya and Rowan, prove the Breckenridge alibi through independent verification, Orison sensor baselines, and a cryptographic challenge, use a classified annex for tactical architecture, and refuse unrestricted command-auth access while offering a controlled alternative.'
});

const committed = transparencyTerms.commit.campaignState;
const sourceOutcomeId = transparencyTerms.commit.turnPacket.outcomePacket.id;

assert.equal(transparencyTerms.preview.turnPacket.intentParse.primaryIntent, 'set-false-colors-transparency-terms');
assert.equal(transparencyTerms.preview.turnPacket.actionClassification.category, 'validWithinMissionBounds');
assert.equal(transparencyTerms.preview.turnPacket.authorityCapabilityCheck.result, 'authorizedAndFeasibleWithOperationalRisk');
assert.equal(transparencyTerms.commit.turnPacket.outcomePacket.resultBand, 'Success');
assert.equal(committed.mission.activeMissionId, 'chapter-2-false-colors');
assert.equal(committed.mission.activePhaseId, 'transparency-terms-set');
assert.deepEqual(committed.mission.availableDecisionPointIds, ['decision.orison-evidence-baseline']);

for (const factId of [
  'chapter-2.aegis-two-attack-report',
  'chapter-2.false-breckenridge-signature',
  'chapter-2.breckenridge-convoy-alibi',
  'chapter-2.aegis-two-casualties',
  'chapter-2.transparency-terms-framed'
]) {
  assert.equal(committed.mission.knownFacts.includes(factId), true, `known facts include ${factId}`);
}
for (const hiddenFactId of [
  'chapter-2.truth.disguised-cargo-tug',
  'chapter-2.truth.holt-cell-staged-attack',
  'chapter-2.truth.lantern-escalated-attack'
]) {
  assert.equal(committed.mission.knownFacts.includes(hiddenFactId), false, `known facts exclude ${hiddenFactId}`);
}

assert.equal(flagValue(committed, 'chapter-2.transparency-posture'), 'joint-audit-framed');
assert.equal(flagValue(committed, 'chapter-2.compact-access-scope'), 'classified-annex');
assert.equal(flagValue(committed, 'chapter-2.aegis-medical-posture'), 'medical-help-separated-from-politics');
assert.equal(flagValue(committed, 'chapter-2.breckenridge-alibi-status'), 'independent-verification-framed');
assert.equal(flagValue(committed, 'chapter-2.tactical-secrecy-posture'), 'controlled-annex');

assert.equal(clockValue(committed, 'chapter-2.public-anger'), 1);
assert.equal(clockValue(committed, 'chapter-2.audit-fragility'), 1);
assert.equal(clockValue(committed, 'chapter-2.medical-risk'), 1);
assert.equal(clockValue(committed, 'chapter-2.security-access-risk'), 1);

assert.equal(frontById(committed, 'front.chapter-2.evidence-audit')?.status, 'independent-verification-framed');
assert.equal(frontById(committed, 'front.chapter-2.aegis-medical')?.status, 'care-offered-without-leverage');
assert.equal(frontById(committed, 'front.chapter-2.security-access')?.status, 'controlled-disclosure');
assert.equal(frontById(committed, 'front.chapter-2.political-legitimacy')?.status, 'trust-through-verification');
assert.equal(actorPosture(committed, 'uss-breckenridge')?.posture, 'independent-verification-offered');
assert.equal(actorPosture(committed, 'aegis-two')?.posture, 'medical-help-offered');
assert.equal(actorPosture(committed, 'director-nia-kessler')?.posture, 'verification-route-available');
assert.equal(actorPosture(committed, 'marshal-holt')?.posture, 'access-demand-contained');

for (const frontId of ['front.chapter-2.evidence-audit', 'front.chapter-2.aegis-medical', 'front.chapter-2.security-access', 'front.chapter-2.political-legitimacy']) {
  const front = frontById(committed, frontId);
  assert.equal(front.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(front.visibility, 'hidden');
}
for (const actorId of ['uss-breckenridge', 'aegis-two', 'director-nia-kessler', 'marshal-holt']) {
  const posture = actorPosture(committed, actorId);
  assert.equal(posture.lastUpdatedByOutcomeId, sourceOutcomeId);
  assert.equal(posture.visibility, 'hidden');
}

const loaded = cloneJson(committed);
assert.deepEqual(frontStatuses(loaded), frontStatuses(committed), 'front status survives JSON save/load clone');
assert.deepEqual(actorPostures(loaded), actorPostures(committed), 'actor posture survives JSON save/load clone');

const restored = deleteCommittedOutcome(committed, sourceOutcomeId);
assert.deepEqual(restored.fronts || [], startingState.fronts || [], 'delete restores pre-transparency fronts');
assert.deepEqual(restored.actors?.postures || [], startingState.actors?.postures || [], 'delete restores pre-transparency actor postures');
assert.equal(restored.mission.activePhaseId, 'false-colors-arrival-briefing');
assert.deepEqual(restored.mission.availableDecisionPointIds, ['decision.false-colors-transparency-terms']);

assertHiddenTermsAbsent(transparencyTerms.preview.turnPacket.outcomePacket);
assertHiddenTermsAbsent(transparencyTerms.preview.turnPacket.narratorPacket);
assertHiddenTermsAbsent(transparencyTerms.preview.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(transparencyTerms.commit.turnPacket.outcomePacket);
assertHiddenTermsAbsent(transparencyTerms.commit.turnPacket.narratorPacket);
assertHiddenTermsAbsent(transparencyTerms.commit.turnPacket.commandLogPacket);
assertHiddenTermsAbsent(committed.fronts.map((front) => front.playerSummary));
assertHiddenTermsAbsent(committed.actors.postures.map((posture) => posture.playerSummary));

console.log('Stage 41 Chapter 2 transparency tests passed: first False Colors decision, player-safe facts, clocks, fronts, actors, save/load, rollback, and hidden-source safety');
