import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { applyPressureLedgerDelta } from '../../src/pressures/pressure-ledger.mjs';
import { buildPressureLedgerDeltaForTurn } from '../../src/pressures/pressure-seeding.mjs';
import {
  applyOpenOrdersCandidateReview,
  buildOpenOrdersCandidateReview
} from '../../src/pressures/open-orders-review.mjs';
import { applyOpenOrdersAssignmentResolution } from '../../src/pressures/open-orders-resolution.mjs';

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

function completedAssignmentById(state, assignmentId) {
  return (state.sideMissions?.completedAssignments || []).find((assignment) => assignment.id === assignmentId);
}

function assetById(state, assetId) {
  return (state.campaignAssets || []).find((asset) => asset.id === assetId);
}

function openOrdersIntervalById(state, intervalId) {
  return (state.sideMissions?.openOrdersIntervals || []).find((interval) => interval.id === intervalId);
}

function assertHiddenTermsAbsent(value) {
  const text = JSON.stringify(value).toLowerCase();
  for (const term of [
    'pale lantern',
    'lantern escalation',
    'hecate',
    'compact recovery team',
    'transponder modules',
    'stolen transponder',
    'cargo tug',
    'hull projection',
    'local patrol schedules'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }
}

function openOrdersReadyPressureState(projection) {
  const state = cloneJson(projection.initialState);
  state.player.name = 'Talia Serrin';
  state.player.creationStatus = 'ready';
  state.mission.activePhaseId = 'final-command-review';
  state.mission.phase = 'final-command-review';
  setFlag(state, 'prelude.ship-state', 'complete-with-accepted-limitation');
  setFlag(state, 'prelude.bronn', 'debate-not-closed');
  setFlag(state, 'prelude.priya', 'approval-bottlenecked');
  setFlag(state, 'prelude.hesperus-resolution', 'passengers-transferred');

  const delta = buildPressureLedgerDeltaForTurn({
    campaignState: state,
    outcomePacket: {
      id: 'outcome.open-orders.final-review',
      resultBand: 'Success',
      summary: 'Final review completed.',
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

  state.mainCampaign.completedChapters = [
    'prelude-a-ship-underway',
    'chapter-1-the-empty-convoy',
    'chapter-2-false-colors'
  ];
  state.mainCampaign.availableChapters = ['open-orders-1-work-worth-doing'];
  state.mainCampaign.lockedChapters = (state.mainCampaign.lockedChapters || [])
    .filter((chapterId) => chapterId !== 'open-orders-1-work-worth-doing');
  state.mainCampaign.chapterCursor = 'open-orders-1-work-worth-doing';
  state.mission.completedMissionId = 'chapter-2-false-colors';
  state.mission.nextMissionId = 'open-orders-1-work-worth-doing';
  state.mission.transitionStatus = 'open-orders-1-pending';
  state.sideMissions = {
    openOrdersIntervals: [],
    availableAssignments: [],
    completedAssignments: [],
    generationPausedUntil: 'open-orders-1-work-worth-doing'
  };
  return state;
}

const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.starship-package.json');

const openOrdersState = openOrdersReadyPressureState(projection);
const review = buildOpenOrdersCandidateReview({
  campaignState: openOrdersState,
  packageData,
  maxCandidates: 3
});
const repairCandidate = review.candidates.find((candidate) => candidate.sideAssignmentId === 'side-the-long-repair');
assert(repairCandidate, 'The Long Repair should be selectable before resolution.');

const selected = applyOpenOrdersCandidateReview({
  campaignState: openOrdersState,
  packageData,
  candidateId: repairCandidate.id,
  decision: 'start',
  reviewId: 'open-orders-review.test.resolve-repair',
  reviewedAt: '2026-06-19T13:00:00.000Z',
  maxCandidates: 3
});
assert.equal(selected.campaignState.sideMissions.activeAssignmentId, 'side-the-long-repair');

function startAssignment(campaignState, sideAssignmentId, reviewId) {
  const reviewState = applyOpenOrdersCandidateReview({
    campaignState,
    packageData,
    sideAssignmentId,
    decision: 'start',
    reviewId,
    reviewedAt: '2026-06-19T13:20:00.000Z',
    maxCandidates: 3
  }).campaignState;
  assert.equal(reviewState.sideMissions.activeAssignmentId, sideAssignmentId);
  return reviewState;
}

const resolved = applyOpenOrdersAssignmentResolution({
  campaignState: selected.campaignState,
  packageData,
  assignmentId: 'side-the-long-repair',
  resolutionId: 'open-orders-resolution.test.long-repair',
  resolvedAt: '2026-06-19T13:15:00.000Z',
  outcomeBand: 'Success',
  reason: 'Player completed the first Open Orders assignment resolution smoke.'
});
const resolvedState = resolved.campaignState;
const completed = completedAssignmentById(resolvedState, 'side-the-long-repair');
assert.equal(resolved.kind, 'directive.committedOpenOrdersAssignmentResolution');
assert.equal(resolved.resolutionRecord.status, 'completed');
assert.equal(completed.status, 'completed');
assert.equal(completed.rewardAssetId, 'helix-yard-support');
assert.equal(resolvedState.sideMissions.availableAssignments.some((assignment) => assignment.id === 'side-the-long-repair'), false);
assert.equal(resolvedState.sideMissions.activeAssignmentId, null);
assert.equal(resolvedState.sideMissions.lastCompletedAssignmentId, 'side-the-long-repair');
assert.equal(
  resolvedState.sideMissions.openOrdersIntervals[0].completedAssignmentIds.includes('side-the-long-repair'),
  true
);
assert.equal(openOrdersIntervalById(resolvedState, 'open-orders-1-work-worth-doing').status, 'partial');
assert.equal(openOrdersIntervalById(resolvedState, 'open-orders-1-work-worth-doing').requiredCompletionCount, 2);

const pressure = pressureById(resolvedState, 'pressure.ship.imani-technical-debt');
assert.equal(pressure.status, 'resolved');
assert.equal(pressure.lastUpdatedByOutcomeId, 'open-orders-resolution.test.long-repair');
assert.equal(
  pressure.history.some((entry) => entry.type === 'resolved-by-open-orders-assignment'),
  true
);

const asset = assetById(resolvedState, 'helix-yard-support');
assert.equal(asset.state, 'earned');
assert.equal(asset.earnedByResolutionId, 'open-orders-resolution.test.long-repair');
assert.equal(asset.sourceSideAssignmentId, 'side-the-long-repair');
assert.equal(resolved.awardedAsset.id, 'helix-yard-support');

const commandLogEntry = resolvedState.commandLog.entries.at(-1);
assert.equal(commandLogEntry.type, 'openOrdersAssignment');
assert.match(JSON.stringify(commandLogEntry), /Helix Yard Support/);
assertHiddenTermsAbsent(resolved.resolutionRecord);
assertHiddenTermsAbsent(resolvedState.sideMissions);
assertHiddenTermsAbsent(commandLogEntry);

const saveLoaded = cloneJson(resolvedState);
assert.deepEqual(saveLoaded.sideMissions.completedAssignments, resolvedState.sideMissions.completedAssignments);
assert.deepEqual(saveLoaded.campaignAssets, resolvedState.campaignAssets);
assert.deepEqual(saveLoaded.pressureLedger.records, resolvedState.pressureLedger.records);

const borrowedSelectedState = startAssignment(
  resolvedState,
  'side-borrowed-wings',
  'open-orders-review.test.resolve-borrowed-wings'
);
const borrowedResolvedState = applyOpenOrdersAssignmentResolution({
  campaignState: borrowedSelectedState,
  packageData,
  assignmentId: 'side-borrowed-wings',
  resolutionId: 'open-orders-resolution.test.borrowed-wings',
  resolvedAt: '2026-06-19T13:30:00.000Z',
  outcomeBand: 'Success',
  reason: 'Player completed a second Open Orders assignment resolution smoke.'
}).campaignState;
const afterTwoInterval = openOrdersIntervalById(borrowedResolvedState, 'open-orders-1-work-worth-doing');
assert.equal(afterTwoInterval.status, 'satisfied');
assert.equal(afterTwoInterval.completedAssignmentIds.length, 2);
assert.equal(afterTwoInterval.directCompletionCount, 2);
assert.equal(afterTwoInterval.delegatedCompletionCount, 0);
assert.equal(afterTwoInterval.overextended, false);
assert.equal(completedAssignmentById(borrowedResolvedState, 'side-borrowed-wings').rewardAssetId, 'civilian-rescue-wing');
assert.equal(assetById(borrowedResolvedState, 'civilian-rescue-wing').state, 'earned');
assert.equal(pressureById(borrowedResolvedState, 'pressure.crew.bronn-fallback-command').status, 'resolved');

const quietSelectedForDirectState = startAssignment(
  borrowedResolvedState,
  'side-quiet-channels',
  'open-orders-review.test.resolve-quiet-direct'
);
const quietDirectResolvedState = applyOpenOrdersAssignmentResolution({
  campaignState: quietSelectedForDirectState,
  packageData,
  assignmentId: 'side-quiet-channels',
  resolutionId: 'open-orders-resolution.test.quiet-direct',
  resolvedAt: '2026-06-19T13:45:00.000Z',
  outcomeBand: 'Success',
  reason: 'Player completed every Open Orders I assignment directly.'
}).campaignState;
const directInterval = openOrdersIntervalById(quietDirectResolvedState, 'open-orders-1-work-worth-doing');
assert.equal(directInterval.status, 'overextended');
assert.equal(directInterval.completedAssignmentIds.length, 3);
assert.equal(directInterval.directCompletionCount, 3);
assert.equal(directInterval.delegatedCompletionCount, 0);
assert.equal(directInterval.allAssignmentsCompleted, true);
assert.equal(directInterval.overextended, true);
assert.match(directInterval.playerSummary, /crew command load/);
assert.equal(completedAssignmentById(quietDirectResolvedState, 'side-quiet-channels').rewardAssetId, 'quiet-channels-network');
assert.equal(assetById(quietDirectResolvedState, 'quiet-channels-network').state, 'earned');
assert.equal(pressureById(quietDirectResolvedState, 'pressure.crew.priya-coordination-network').status, 'resolved');
assertHiddenTermsAbsent(quietDirectResolvedState.sideMissions);
assertHiddenTermsAbsent(quietDirectResolvedState.commandLog.entries.at(-1));

const quietSelectedForDelegationState = startAssignment(
  borrowedResolvedState,
  'side-quiet-channels',
  'open-orders-review.test.resolve-quiet-delegated'
);
const quietDelegatedResolvedState = applyOpenOrdersAssignmentResolution({
  campaignState: quietSelectedForDelegationState,
  packageData,
  assignmentId: 'side-quiet-channels',
  resolutionId: 'open-orders-resolution.test.quiet-delegated',
  resolvedAt: '2026-06-19T14:00:00.000Z',
  outcomeBand: 'Success',
  assignmentMode: 'delegated',
  delegatedTo: 'Priya Nayar and accountable civilian coordinators',
  reason: 'Player delegated the third Open Orders I assignment through accountable local support.'
}).campaignState;
const delegatedInterval = openOrdersIntervalById(quietDelegatedResolvedState, 'open-orders-1-work-worth-doing');
assert.equal(delegatedInterval.status, 'satisfied');
assert.equal(delegatedInterval.completedAssignmentIds.length, 3);
assert.equal(delegatedInterval.directCompletionCount, 2);
assert.equal(delegatedInterval.delegatedCompletionCount, 1);
assert.equal(delegatedInterval.allAssignmentsCompleted, true);
assert.equal(delegatedInterval.overextended, false);
assert.equal(completedAssignmentById(quietDelegatedResolvedState, 'side-quiet-channels').assignmentMode, 'delegated');
assert.equal(completedAssignmentById(quietDelegatedResolvedState, 'side-quiet-channels').directCommandLoad, false);
assertHiddenTermsAbsent(quietDelegatedResolvedState.sideMissions);

assert.throws(
  () => applyOpenOrdersAssignmentResolution({
    campaignState: resolvedState,
    packageData,
    assignmentId: 'side-the-long-repair',
    resolutionId: 'open-orders-resolution.test.duplicate'
  }),
  /No selected Open Orders assignment/
);

console.log('Open Orders resolution tests passed: selected assignment completion, interval progress, overextension/delegation state, pressure resolution, reward assets, command log, clone safety, and hidden-source safety');
