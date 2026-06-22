import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { applyPressureLedgerDelta } from '../../src/pressures/pressure-ledger.mjs';
import { buildPressureLedgerDeltaForTurn } from '../../src/pressures/pressure-seeding.mjs';
import {
  applyOpenOrdersCandidateReview,
  buildOpenOrdersCandidateReview
} from '../../src/pressures/open-orders-review.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function flagValue(state, flagId) {
  return (state.mission?.outcomeFlags || []).find((flag) => flag.id === flagId)?.value;
}

function setFlag(state, flagId, value) {
  const flag = (state.mission?.outcomeFlags || []).find((item) => item.id === flagId);
  if (!flag) throw new Error(`Missing flag "${flagId}"`);
  flag.value = value;
}

function pressureById(state, pressureId) {
  return (state.pressureLedger?.records || []).find((record) => record.id === pressureId);
}

function reviewById(state, reviewId) {
  return (state.pressureLedger?.candidateReviews || []).find((review) => review.id === reviewId);
}

function assignmentById(state, assignmentId) {
  return (state.sideMissions?.availableAssignments || []).find((assignment) => assignment.id === assignmentId);
}

function assertHiddenTermsAbsent(value) {
  const text = JSON.stringify(value).toLowerCase();
  for (const term of [
    'pale lantern',
    'lantern escalation',
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
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');

const openOrdersState = openOrdersReadyPressureState(projection);
assert.equal(flagValue(openOrdersState, 'prelude.ship-state'), 'complete-with-accepted-limitation');

const review = buildOpenOrdersCandidateReview({
  campaignState: openOrdersState,
  packageData
});
assert.equal(review.kind, 'directive.openOrdersCandidateReview');
assert.equal(review.generatedFrom, 'package-authored-open-orders');
assert.equal(review.intervalId, 'open-orders-1-work-worth-doing');
assert.equal(review.candidates.length > 0, true);
assert.equal(review.candidates.length <= 2, true);
assert.equal(review.candidates.every((candidate) => candidate.intervalId === 'open-orders-1-work-worth-doing'), true);
assert.equal(review.rawValuesHidden, true);
assertHiddenTermsAbsent(review);

const fullReview = buildOpenOrdersCandidateReview({
  campaignState: openOrdersState,
  packageData,
  maxCandidates: 3
});
const repairCandidate = fullReview.candidates.find((candidate) => candidate.sideAssignmentId === 'side-the-long-repair');
assert(repairCandidate, 'The Long Repair should be available from Imani technical debt');

const selected = applyOpenOrdersCandidateReview({
  campaignState: openOrdersState,
  packageData,
  candidateId: repairCandidate.id,
  decision: 'start',
  reviewId: 'open-orders-review.test.select-repair',
  reviewedAt: '2026-06-19T12:00:00.000Z',
  maxCandidates: 3
});
const selectedState = selected.campaignState;
assert.equal(selected.reviewRecord.status, 'selected');
assert.equal(selected.reviewRecord.selectedSideAssignmentId, 'side-the-long-repair');
assert.equal(reviewById(selectedState, 'open-orders-review.test.select-repair')?.selectedSideAssignmentId, 'side-the-long-repair');
assert.equal(pressureById(selectedState, 'pressure.ship.imani-technical-debt')?.status, 'cooling');
assert.equal(
  pressureById(selectedState, 'pressure.ship.imani-technical-debt')?.cooldown.eligibleAfterChapterId,
  'open-orders-1-work-worth-doing'
);
assert.equal(selectedState.sideMissions.openOrdersIntervals[0].id, 'open-orders-1-work-worth-doing');
assert.equal(selectedState.sideMissions.openOrdersIntervals[0].status, 'active');
assert.equal(assignmentById(selectedState, 'side-the-long-repair')?.status, 'selected');
assert.equal(selectedState.sideMissions.activeAssignmentId, 'side-the-long-repair');
assert.equal(selectedState.sideMissions.generationPausedUntil, null);
assert.equal(
  selectedState.commandLog.entries.some((entry) => entry.type === 'openOrdersReview' && /The Long Repair/.test(JSON.stringify(entry))),
  true
);
assertHiddenTermsAbsent(selected.reviewRecord);
assertHiddenTermsAbsent(selectedState.sideMissions);
assertHiddenTermsAbsent(selectedState.commandLog.entries.at(-1));

const saveLoaded = cloneJson(selectedState);
assert.deepEqual(saveLoaded.sideMissions.availableAssignments, selectedState.sideMissions.availableAssignments, 'available assignments survive JSON save/load clone');
assert.deepEqual(saveLoaded.pressureLedger.candidateReviews, selectedState.pressureLedger.candidateReviews, 'candidate reviews survive JSON save/load clone');

const deferredState = openOrdersReadyPressureState(projection);
const deferReview = buildOpenOrdersCandidateReview({
  campaignState: deferredState,
  packageData
});
const quietCandidate = deferReview.candidates.find((candidate) => candidate.sideAssignmentId === 'side-quiet-channels')
  || deferReview.candidates[0];
const deferred = applyOpenOrdersCandidateReview({
  campaignState: deferredState,
  packageData,
  candidateId: quietCandidate.id,
  decision: 'defer',
  reviewId: 'open-orders-review.test.defer',
  reviewedAt: '2026-06-19T12:05:00.000Z',
  reason: 'Player chose to keep this pressure recorded but not start it now.'
});
assert.equal(deferred.reviewRecord.status, 'deferred');
assert.equal(reviewById(deferred.campaignState, 'open-orders-review.test.defer')?.decision, 'defer');
assert.equal(pressureById(deferred.campaignState, quietCandidate.pressureId)?.status, 'suppressed');
assert.equal(deferred.campaignState.sideMissions.availableAssignments.length, 0);
assert.equal(deferred.campaignState.sideMissions.generationPausedUntil, 'open-orders-1-work-worth-doing');
assertHiddenTermsAbsent(deferred.reviewRecord);

console.log('Open Orders review tests passed: candidate review, selection, deferral, side-mission availability, save/load clone, and hidden-source safety');
