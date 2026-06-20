import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { applyPressureLedgerDelta } from '../../src/pressures/pressure-ledger.mjs';
import { buildPressureLedgerDeltaForTurn } from '../../src/pressures/pressure-seeding.mjs';
import {
  applyOpenOrdersCandidateReview,
  buildOpenOrdersCandidateReview
} from '../../src/pressures/open-orders-review.mjs';
import {
  applyOpenOrdersAssignmentSceneBeat,
  applyOpenOrdersAssignmentSceneStart
} from '../../src/pressures/open-orders-scene.mjs';
import { applyOpenOrdersAssignmentResolution } from '../../src/pressures/open-orders-resolution.mjs';
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

function setFlag(state, flagId, value) {
  const flag = (state.mission?.outcomeFlags || []).find((item) => item.id === flagId);
  if (!flag) throw new Error(`Missing flag "${flagId}"`);
  flag.value = value;
}

function pressureById(state, pressureId) {
  return (state.pressureLedger?.records || []).find((record) => record.id === pressureId);
}

function availableAssignmentById(state, assignmentId) {
  return (state.sideMissions?.availableAssignments || []).find((assignment) => assignment.id === assignmentId);
}

function completedAssignmentById(state, assignmentId) {
  return (state.sideMissions?.completedAssignments || []).find((assignment) => assignment.id === assignmentId);
}

function assetById(state, assetId) {
  return (state.campaignAssets || []).find((asset) => asset.id === assetId);
}

function openOrdersIntervalById(state, intervalId) {
  return (state.sideMissions?.openOrdersIntervals || []).find((interval) => interval.id === intervalId);
}

function assertHiddenTermsAbsent(value, { allowWeakHecate = false } = {}) {
  const text = JSON.stringify(value).toLowerCase();
  for (const term of [
    'cargo tug',
    'hull projection',
    'pale lantern',
    'lantern escalation',
    'remote control',
    'remote-controlled',
    'stolen transponder',
    'local patrol schedules',
    'staged attack',
    'staged-attack',
    'valid solution',
    'valid-solution'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }

  if (!allowWeakHecate) {
    assert.equal(text.includes('hecate'), false, 'must not mention Hecate before the allowed weak-trace handoff');
    return;
  }

  if (text.includes('hecate')) {
    assert.match(text, /weak hecate trace/, 'Hecate may appear only as the weak trace');
    assert.match(text, /correlation/, 'weak Hecate handling must stay framed as correlation');
    assert.match(text, /not (a )?pursuit target|not an actionable target|without authorizing pursuit/, 'weak Hecate handling must not become pursuit');
  }
}

function seedPreludeOpenOrdersPressures(state) {
  setFlag(state, 'prelude.ship-state', 'complete-with-accepted-limitation');
  setFlag(state, 'prelude.bronn', 'debate-not-closed');
  setFlag(state, 'prelude.priya', 'delegation-boundaries-clear');
  setFlag(state, 'prelude.hesperus-resolution', 'passengers-transferred');
  const delta = buildPressureLedgerDeltaForTurn({
    campaignState: state,
    outcomePacket: {
      id: 'outcome.stage46.seed-prelude-open-orders',
      resultBand: 'Success',
      summary: 'Prelude pressure seed for Open Orders interval accounting.',
      costs: [],
      revealedFactIds: [],
      commandDecisionAwards: []
    },
    intentParse: {
      primaryIntent: 'complete-final-command-review',
      signals: {}
    }
  });
  applyPressureLedgerDelta(state, delta);
}

function chapter2State(projection) {
  const state = cloneJson(projection.initialState);
  state.player.name = 'Talia Serrin';
  state.player.creationStatus = 'ready';
  state.campaign.currentStardate = 53094;
  state.pressureLedger = {
    records: [],
    candidateReviews: [],
    rawValuesHidden: true
  };
  seedPreludeOpenOrdersPressures(state);
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

function playThroughJointCharter({ projection, graph, crewDataset }) {
  const transparencyTerms = commitInput({
    campaignState: chapter2State(projection),
    graph,
    projection,
    crewDataset,
    turnId: 'turn.stage46.false-colors-transparency',
    playerInput: 'In the Asterion briefing, offer immediate Miriam medical help to Aegis Two as care first and not leverage, invite Kessler and Compact observers into a joint audit with Priya and Rowan, prove the Breckinridge alibi through independent verification, Orison sensor baselines, and a cryptographic challenge, use a classified annex for tactical architecture, and refuse unrestricted command-auth access while offering a controlled alternative.'
  }).commit;

  const evidenceBaseline = commitInput({
    campaignState: transparencyTerms.campaignState,
    graph,
    projection,
    crewDataset,
    turnId: 'turn.stage46.orison-evidence',
    playerInput: 'Have Priya and Rowan lock the Orison civilian sensor baselines and traffic records under the joint audit chain with Compact observers present, publish selected nonclassified timing logs, have Imani demonstrate from post-refit calibration that the recorded warp-field artifact is physically inconsistent with the real Breckinridge, reconstruct the attacker route without exposing command authentication or tactical architecture, and preserve Directorate access logs quietly without public accusation.'
  }).commit;

  const medicalTrust = commitInput({
    campaignState: evidenceBaseline.campaignState,
    graph,
    projection,
    crewDataset,
    turnId: 'turn.stage46.aegis-medical-trust',
    playerInput: 'Have Miriam stabilize the critical Aegis Two officer through a joint medical channel with Compact medical observers present. Keep treatment care first and not leverage, record medical neutrality as no admission of culpability, protect patient consent and privacy, and preserve a voluntary patrol officer statement only after medical clearance.'
  }).commit;

  const securityAccess = commitInput({
    campaignState: medicalTrust.campaignState,
    graph,
    projection,
    crewDataset,
    turnId: 'turn.stage46.security-access-demonstration',
    playerInput: "Have Bronn and Priya run a command-authentication demonstration inside a controlled command-authentication annex: a challenge-response and transponder integrity demonstration with selected observer-facing proof for Kessler. Refuse unrestricted command-system access, honor Tolland's disclosure limit, keep classified architecture sealed, and record that Bronn is a professional security witness, not a scapegoat."
  }).commit;

  const jointCharter = commitInput({
    campaignState: securityAccess.campaignState,
    graph,
    projection,
    crewDataset,
    turnId: 'turn.stage46.joint-investigation-charter',
    playerInput: 'Frame a joint investigation charter with Kessler as a face-saving public partner: acknowledge the Breckinridge innocence route without weakening her position at home, preserve Directorate access logs under an audit firewall with no unilateral changes from Holt, preserve the weak Hecate relay trace for later correlation because it is too weak to pursue immediately, and have Whitaker accept Open Orders so the Breckinridge remains available in the Reach while forensic specialists travel.'
  });

  return {
    preview: jointCharter.preview,
    commit: jointCharter.commit
  };
}

function selectAssignment(campaignState, packageData, sideAssignmentId, reviewId) {
  return applyOpenOrdersCandidateReview({
    campaignState,
    packageData,
    sideAssignmentId,
    decision: 'start',
    reviewId,
    reviewedAt: '2026-06-19T17:00:00.000Z',
    maxCandidates: 3
  }).campaignState;
}

function resolveAssignment(campaignState, packageData, sideAssignmentId, resolutionId, assignmentMode = 'direct') {
  return applyOpenOrdersAssignmentResolution({
    campaignState,
    packageData,
    assignmentId: sideAssignmentId,
    resolutionId,
    resolvedAt: '2026-06-19T17:15:00.000Z',
    outcomeBand: 'Success',
    assignmentMode,
    delegatedTo: assignmentMode === 'delegated'
      ? 'Priya Nayar with Kessler observer contacts, Asterion station operators, civilian courier leads, and Breckinridge Ops'
      : null,
    reason: `Stage 46 interval accounting check for ${sideAssignmentId}.`
  }).campaignState;
}

const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const chapter2Graph = readJson('packages/bundled/breckinridge/chapter-2-false-colors.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');

const quietTemplate = packageData.missionTemplates.side.find((template) => template.id === 'side-quiet-channels');
assert.equal(quietTemplate.status, 'playable');
assert.equal(quietTemplate.mvpStatus, 'stage46-continuation');
assert.equal(quietTemplate.openOrdersMvp.resolution.assetId, 'quiet-channels-network');
assert.match(quietTemplate.openOrdersMvp.scene.sceneQuestion, /station operators, Compact observers, civilian couriers, and Breckinridge Ops/);
assert.match(quietTemplate.openOrdersMvp.scene.sceneQuestion, /without turning the network into a covert pursuit channel/);
assertHiddenTermsAbsent(quietTemplate.openOrdersMvp, { allowWeakHecate: true });

const jointCharter = playThroughJointCharter({ projection, graph: chapter2Graph, crewDataset });
const committed = jointCharter.commit.campaignState;
const sourceOutcomeId = jointCharter.commit.turnPacket.outcomePacket.id;
assert.equal(jointCharter.preview.turnPacket.intentParse.primaryIntent, 'frame-joint-investigation-charter');
assert.equal(jointCharter.commit.turnPacket.outcomePacket.resultBand, 'Success');
assert.equal(committed.mission.nextMissionId, 'open-orders-1-work-worth-doing');
assert.equal(committed.mainCampaign.chapterCursor, 'open-orders-1-work-worth-doing');

const charterPressure = pressureById(committed, 'pressure.regional.false-colors-quiet-channels');
assert(charterPressure, 'joint charter should seed a False Colors Quiet Channels pressure');
assert.equal(charterPressure.sourceOutcomeId, sourceOutcomeId);
assert.equal(charterPressure.sourceMissionId, 'chapter-2-false-colors');
assert.equal(charterPressure.linkedTemplateIds.includes('side-quiet-channels'), true);
assert.equal(charterPressure.linkedCrewIds.includes('priya-nayar'), true);
assert.equal(charterPressure.tags.includes('false-colors'), true);
assert.equal(charterPressure.tags.includes('coordination'), true);
assertHiddenTermsAbsent(charterPressure, { allowWeakHecate: true });

const review = buildOpenOrdersCandidateReview({
  campaignState: committed,
  packageData,
  maxCandidates: 3
});
const quietCandidate = review.candidates.find((candidate) => (
  candidate.sideAssignmentId === 'side-quiet-channels'
  && candidate.pressureId === 'pressure.regional.false-colors-quiet-channels'
));
assert(quietCandidate, 'Quiet Channels should be reviewable from the False Colors charter pressure');
assert.equal(quietCandidate.intervalId, 'open-orders-1-work-worth-doing');
assert.match(quietCandidate.reason, /False Colors charter/);
assertHiddenTermsAbsent(review, { allowWeakHecate: true });

const selected = applyOpenOrdersCandidateReview({
  campaignState: committed,
  packageData,
  candidateId: quietCandidate.id,
  decision: 'start',
  reviewId: 'open-orders-review.stage46.quiet-channels',
  reviewedAt: '2026-06-19T17:05:00.000Z',
  maxCandidates: 3
}).campaignState;
assert.equal(selected.sideMissions.activeAssignmentId, 'side-quiet-channels');
assert.equal(availableAssignmentById(selected, 'side-quiet-channels').status, 'selected');
assert.equal(pressureById(selected, 'pressure.regional.false-colors-quiet-channels').status, 'cooling');
assertHiddenTermsAbsent(selected.pressureLedger.candidateReviews.at(-1), { allowWeakHecate: true });

const sceneStarted = applyOpenOrdersAssignmentSceneStart({
  campaignState: selected,
  packageData,
  assignmentId: 'side-quiet-channels',
  sceneId: 'open-orders-scene.stage46.quiet-channels',
  sceneStartedAt: '2026-06-19T17:08:00.000Z',
  reason: 'The player opens Quiet Channels after the False Colors joint charter.'
}).campaignState;
const activeQuiet = availableAssignmentById(sceneStarted, 'side-quiet-channels');
assert.equal(activeQuiet.status, 'active');
assert.equal(activeQuiet.sceneBrief.mvpStatus, 'stage46-continuation');
assert.match(activeQuiet.sceneBrief.playerSummary, /not a hidden intelligence hunt/);
assert.match(activeQuiet.sceneBrief.sceneQuestion, /Who may coordinate/);
assert.match(activeQuiet.sceneBrief.supportingContext.join(' '), /Kessler has a defensible public legitimacy path/);
assert.match(activeQuiet.sceneBrief.supportingContext.join(' '), /weak Hecate trace stays in a correlation queue/);
assert.match(activeQuiet.sceneBrief.expectedOutputs.join(' '), /station operators, Compact observers, civilian couriers, and Breckinridge Ops/);
assertHiddenTermsAbsent(activeQuiet, { allowWeakHecate: true });
assertHiddenTermsAbsent(sceneStarted.commandLog.entries.at(-1), { allowWeakHecate: true });

const firstBeat = applyOpenOrdersAssignmentSceneBeat({
  campaignState: sceneStarted,
  packageData,
  assignmentId: 'side-quiet-channels',
  beatId: 'open-orders-scene-beat.stage46.quiet-channels-authority',
  beatAt: '2026-06-19T17:12:00.000Z',
  playerIntent: 'Put Priya in the visible routing chair while Kessler names Compact observer contacts, Asterion station operators own the local request queue, civilian couriers receive sealed packet numbers, and Breckinridge Ops logs every handoff.',
  approach: 'coordination',
  reason: 'The player defines who may coordinate the network.'
}).campaignState;
const firstBeatAssignment = availableAssignmentById(firstBeat, 'side-quiet-channels');
assert.equal(firstBeatAssignment.sceneBeats.length, 1);
assert.equal(firstBeatAssignment.sceneBeats[0].authoredBeatId, 'quiet-channels-coordination-authority');
assert.match(firstBeatAssignment.sceneBeats[0].playableDecision, /run directly by Priya, delegated to accountable station and Compact leads/);
assertHiddenTermsAbsent(firstBeatAssignment, { allowWeakHecate: true });

const secondBeat = applyOpenOrdersAssignmentSceneBeat({
  campaignState: firstBeat,
  packageData,
  assignmentId: 'side-quiet-channels',
  beatId: 'open-orders-scene-beat.stage46.quiet-channels-correlation',
  beatAt: '2026-06-19T17:18:00.000Z',
  playerIntent: 'Keep the weak Hecate trace in Priya and Rowan\'s correlation queue only, accepting station reports and courier sightings for later forensic comparison without authorizing pursuit or surveillance tasking.',
  approach: 'delegated',
  reason: 'The player preserves the weak trace as correlation rather than a target.'
}).campaignState;
const secondBeatAssignment = availableAssignmentById(secondBeat, 'side-quiet-channels');
assert.equal(secondBeatAssignment.sceneBeats.length, 2);
assert.equal(secondBeatAssignment.sceneBeats[1].authoredBeatId, 'quiet-channels-correlation-queue');
assert.match(secondBeatAssignment.sceneBeats[1].expectedFollowUp, /without implying a solved source/);
assertHiddenTermsAbsent(secondBeatAssignment, { allowWeakHecate: true });
assertHiddenTermsAbsent(secondBeat.commandLog.entries.at(-1), { allowWeakHecate: true });

const saveLoaded = cloneJson(secondBeat);
assert.deepEqual(saveLoaded.sideMissions.availableAssignments, secondBeat.sideMissions.availableAssignments);
assert.deepEqual(saveLoaded.pressureLedger.records, secondBeat.pressureLedger.records);

const quietResolved = applyOpenOrdersAssignmentResolution({
  campaignState: secondBeat,
  packageData,
  assignmentId: 'side-quiet-channels',
  resolutionId: 'open-orders-resolution.stage46.quiet-channels',
  resolvedAt: '2026-06-19T17:24:00.000Z',
  outcomeBand: 'Success',
  assignmentMode: 'delegated',
  delegatedTo: 'Priya Nayar with Kessler observer contacts, Asterion station operators, civilian courier leads, and Breckinridge Ops',
  reason: 'The player completes Quiet Channels as accountable delegated coordination.'
}).campaignState;
const completedQuiet = completedAssignmentById(quietResolved, 'side-quiet-channels');
assert.equal(completedQuiet.status, 'completed');
assert.equal(completedQuiet.assignmentMode, 'delegated');
assert.equal(completedQuiet.directCommandLoad, false);
assert.equal(completedQuiet.sceneBeats.length, 2);
assert.equal(completedQuiet.rewardAssetId, 'quiet-channels-network');
assert.equal(assetById(quietResolved, 'quiet-channels-network').state, 'earned');
assert.equal(assetById(quietResolved, 'quiet-channels-network').sourceSideAssignmentId, 'side-quiet-channels');
assert.equal(pressureById(quietResolved, 'pressure.regional.false-colors-quiet-channels').status, 'resolved');
assert.match(JSON.stringify(quietResolved.commandLog.entries.at(-1)), /Quiet Channels Network/);
assertHiddenTermsAbsent(completedQuiet, { allowWeakHecate: true });
assertHiddenTermsAbsent(quietResolved.sideMissions, { allowWeakHecate: true });
assertHiddenTermsAbsent(quietResolved.commandLog.entries.at(-1), { allowWeakHecate: true });

const afterLongRepair = resolveAssignment(
  selectAssignment(committed, packageData, 'side-the-long-repair', 'open-orders-review.stage46.long-repair'),
  packageData,
  'side-the-long-repair',
  'open-orders-resolution.stage46.long-repair'
);
const afterBorrowedWings = resolveAssignment(
  selectAssignment(afterLongRepair, packageData, 'side-borrowed-wings', 'open-orders-review.stage46.borrowed-wings'),
  packageData,
  'side-borrowed-wings',
  'open-orders-resolution.stage46.borrowed-wings'
);
assert.equal(openOrdersIntervalById(afterBorrowedWings, 'open-orders-1-work-worth-doing').status, 'satisfied');
assert.equal(openOrdersIntervalById(afterBorrowedWings, 'open-orders-1-work-worth-doing').directCompletionCount, 2);

const quietDirect = resolveAssignment(
  selectAssignment(afterBorrowedWings, packageData, 'side-quiet-channels', 'open-orders-review.stage46.quiet-direct'),
  packageData,
  'side-quiet-channels',
  'open-orders-resolution.stage46.quiet-direct'
);
const directInterval = openOrdersIntervalById(quietDirect, 'open-orders-1-work-worth-doing');
assert.equal(directInterval.status, 'overextended');
assert.equal(directInterval.directCompletionCount, 3);
assert.equal(directInterval.delegatedCompletionCount, 0);
assert.equal(directInterval.overextended, true);
assert.equal(pressureById(quietDirect, 'pressure.regional.false-colors-quiet-channels').status, 'resolved');
assertHiddenTermsAbsent(quietDirect.sideMissions, { allowWeakHecate: true });

const quietDelegated = resolveAssignment(
  selectAssignment(afterBorrowedWings, packageData, 'side-quiet-channels', 'open-orders-review.stage46.quiet-delegated'),
  packageData,
  'side-quiet-channels',
  'open-orders-resolution.stage46.quiet-delegated',
  'delegated'
);
const delegatedInterval = openOrdersIntervalById(quietDelegated, 'open-orders-1-work-worth-doing');
assert.equal(delegatedInterval.status, 'satisfied');
assert.equal(delegatedInterval.directCompletionCount, 2);
assert.equal(delegatedInterval.delegatedCompletionCount, 1);
assert.equal(delegatedInterval.overextended, false);
assert.equal(completedAssignmentById(quietDelegated, 'side-quiet-channels').assignmentMode, 'delegated');
assert.equal(completedAssignmentById(quietDelegated, 'side-quiet-channels').directCommandLoad, false);
assertHiddenTermsAbsent(quietDelegated.sideMissions, { allowWeakHecate: true });
assertHiddenTermsAbsent(quietDelegated.commandLog.entries.at(-1), { allowWeakHecate: true });

console.log('Stage 46 Chapter 2 Quiet Channels continuity tests passed: False Colors pressure seeding, Open Orders review, scene play, weak Hecate correlation safety, reward resolution, save/load clone, and direct/delegated interval behavior');
