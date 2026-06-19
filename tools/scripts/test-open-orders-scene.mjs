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
      id: 'outcome.open-orders.scene-review',
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

const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const longRepairTemplate = packageData.missionTemplates.side.find((template) => template.id === 'side-the-long-repair');
const borrowedWingsTemplate = packageData.missionTemplates.side.find((template) => template.id === 'side-borrowed-wings');
const openOrders1TemplateIds = packageData.sideMissionRules.openOrders
  .find((interval) => interval.id === 'open-orders-1-work-worth-doing')
  .sideAssignments;
const openOrders1CompleteTemplates = packageData.missionTemplates.side
  .filter((template) => openOrders1TemplateIds.includes(template.id) && template.mvpStatus === 'mvp-complete');
assert.equal(longRepairTemplate.status, 'playable');
assert.equal(longRepairTemplate.mvpStatus, 'mvp-complete');
assert.equal(borrowedWingsTemplate.status, 'playable');
assert.equal(borrowedWingsTemplate.mvpStatus, 'mvp-complete');
assert.deepEqual(
  openOrders1CompleteTemplates.map((template) => template.id).sort(),
  ['side-borrowed-wings', 'side-the-long-repair']
);

const openOrdersState = openOrdersReadyPressureState(projection);
const review = buildOpenOrdersCandidateReview({
  campaignState: openOrdersState,
  packageData,
  maxCandidates: 3
});
const repairCandidate = review.candidates.find((candidate) => candidate.sideAssignmentId === 'side-the-long-repair');
assert(repairCandidate, 'The Long Repair should be selectable before scene start.');

const selected = applyOpenOrdersCandidateReview({
  campaignState: openOrdersState,
  packageData,
  candidateId: repairCandidate.id,
  decision: 'start',
  reviewId: 'open-orders-review.test.scene-start',
  reviewedAt: '2026-06-19T15:00:00.000Z',
  maxCandidates: 3
}).campaignState;
assert.equal(availableAssignmentById(selected, 'side-the-long-repair').status, 'selected');

const sceneStarted = applyOpenOrdersAssignmentSceneStart({
  campaignState: selected,
  packageData,
  assignmentId: 'side-the-long-repair',
  sceneId: 'open-orders-scene.test.long-repair',
  sceneStartedAt: '2026-06-19T15:05:00.000Z',
  reason: 'Player opened the assignment scene from the Mission panel.'
});
const sceneState = sceneStarted.campaignState;
const activeAssignment = availableAssignmentById(sceneState, 'side-the-long-repair');
assert.equal(sceneStarted.kind, 'directive.committedOpenOrdersAssignmentSceneStart');
assert.equal(activeAssignment.status, 'active');
assert.equal(activeAssignment.sceneStatus, 'briefing');
assert.equal(activeAssignment.sceneStartedById, 'open-orders-scene.test.long-repair');
assert.match(activeAssignment.sceneBrief.sceneQuestion, /Breckinridge/);
assert.equal(activeAssignment.sceneBrief.rawValuesHidden, true);
assert.equal(activeAssignment.sceneBrief.mvpStatus, 'mvp-complete');
assert.match(activeAssignment.sceneBrief.playerSummary, /real shipboard engineering work/);
assert.match(activeAssignment.sceneBrief.expectedOutputs.join(' '), /deferred refit/);
assert.equal(sceneState.sideMissions.activeAssignmentId, 'side-the-long-repair');
assert.equal(sceneState.sideMissions.activeAssignmentSceneId, 'open-orders-scene.test.long-repair');
assert.equal(sceneState.sideMissions.openOrdersIntervals[0].activeAssignmentId, 'side-the-long-repair');

const pressure = pressureById(sceneState, 'pressure.ship.imani-technical-debt');
assert.equal(pressure.status, 'cooling');
assert.equal(pressure.lastUpdatedByOutcomeId, 'open-orders-scene.test.long-repair');
assert.equal(
  pressure.history.some((entry) => entry.type === 'opened-as-open-orders-scene'),
  true
);

const commandLogEntry = sceneState.commandLog.entries.at(-1);
assert.equal(commandLogEntry.type, 'openOrdersAssignmentScene');
assert.match(JSON.stringify(commandLogEntry), /The Long Repair/);
assertHiddenTermsAbsent(activeAssignment);
assertHiddenTermsAbsent(sceneState.sideMissions);
assertHiddenTermsAbsent(commandLogEntry);

const sceneBeatCommitted = applyOpenOrdersAssignmentSceneBeat({
  campaignState: sceneState,
  packageData,
  assignmentId: 'side-the-long-repair',
  beatId: 'open-orders-scene-beat.test.long-repair-1',
  beatAt: '2026-06-19T15:12:00.000Z',
  playerIntent: 'Put Imani in charge of triage with Engineering and Helix Yard agreeing on what can be repaired now and what must be deferred.',
  approach: 'technical',
  reason: 'Player advanced the active Open Orders assignment scene.'
});
const beatState = sceneBeatCommitted.campaignState;
const beatAssignment = availableAssignmentById(beatState, 'side-the-long-repair');
assert.equal(sceneBeatCommitted.kind, 'directive.committedOpenOrdersAssignmentSceneBeat');
assert.equal(beatAssignment.status, 'active');
assert.equal(beatAssignment.sceneStatus, 'in-progress');
assert.equal(beatAssignment.sceneBrief.sceneStatus, 'in-progress');
assert.equal(beatAssignment.sceneBeats.length, 1);
assert.equal(beatAssignment.lastSceneBeatId, 'open-orders-scene-beat.test.long-repair-1');
assert.equal(beatAssignment.sceneBeats[0].authoredBeatId, 'long-repair-triage');
assert.equal(beatAssignment.sceneBeats[0].title, 'Repair Triage');
assert.match(beatAssignment.sceneBeats[0].expectedFollowUp, /triage list honest/);
assert.match(beatAssignment.sceneBeats[0].playerSummary, /Imani in charge of triage/);
assert.equal(beatState.sideMissions.lastSceneBeatId, 'open-orders-scene-beat.test.long-repair-1');
assert.equal(beatState.sideMissions.openOrdersIntervals[0].lastSceneBeatId, 'open-orders-scene-beat.test.long-repair-1');

const beatPressure = pressureById(beatState, 'pressure.ship.imani-technical-debt');
assert.equal(beatPressure.lastUpdatedByOutcomeId, 'open-orders-scene-beat.test.long-repair-1');
assert.equal(
  beatPressure.history.some((entry) => entry.type === 'advanced-open-orders-scene'),
  true
);
const beatLogEntry = beatState.commandLog.entries.at(-1);
assert.equal(beatLogEntry.type, 'openOrdersAssignmentSceneBeat');
assert.match(JSON.stringify(beatLogEntry), /Imani in charge of triage/);
assertHiddenTermsAbsent(beatAssignment);
assertHiddenTermsAbsent(beatState.sideMissions);
assertHiddenTermsAbsent(beatLogEntry);

assert.throws(
  () => applyOpenOrdersAssignmentSceneBeat({
    campaignState: selected,
    packageData,
    assignmentId: 'side-the-long-repair',
    beatId: 'open-orders-scene-beat.test.not-active'
  }),
  /not active/
);

const saveLoaded = cloneJson(beatState);
assert.deepEqual(saveLoaded.sideMissions.availableAssignments, beatState.sideMissions.availableAssignments);
assert.deepEqual(saveLoaded.pressureLedger.records, beatState.pressureLedger.records);

const resolved = applyOpenOrdersAssignmentResolution({
  campaignState: beatState,
  packageData,
  assignmentId: 'side-the-long-repair',
  resolutionId: 'open-orders-resolution.test.scene-long-repair',
  resolvedAt: '2026-06-19T15:20:00.000Z',
  outcomeBand: 'Success',
  reason: 'Player resolved an active Open Orders assignment scene.'
}).campaignState;
assert.equal(completedAssignmentById(resolved, 'side-the-long-repair').status, 'completed');
assert.equal(completedAssignmentById(resolved, 'side-the-long-repair').sceneStartedById, 'open-orders-scene.test.long-repair');
assert.equal(completedAssignmentById(resolved, 'side-the-long-repair').lastSceneBeatId, 'open-orders-scene-beat.test.long-repair-1');
assert.equal(completedAssignmentById(resolved, 'side-the-long-repair').sceneBeats.length, 1);
assert.equal(completedAssignmentById(resolved, 'side-the-long-repair').rewardAssetId, 'helix-yard-support');
assert.equal(assetById(resolved, 'helix-yard-support').state, 'earned');
assert.equal(availableAssignmentById(resolved, 'side-the-long-repair'), undefined);

const borrowedSelected = applyOpenOrdersCandidateReview({
  campaignState: resolved,
  packageData,
  sideAssignmentId: 'side-borrowed-wings',
  decision: 'start',
  reviewId: 'open-orders-review.test.scene-borrowed-wings',
  reviewedAt: '2026-06-19T15:30:00.000Z',
  maxCandidates: 3
}).campaignState;
assert.equal(availableAssignmentById(borrowedSelected, 'side-borrowed-wings').status, 'selected');

const borrowedStarted = applyOpenOrdersAssignmentSceneStart({
  campaignState: borrowedSelected,
  packageData,
  assignmentId: 'side-borrowed-wings',
  sceneId: 'open-orders-scene.test.borrowed-wings',
  sceneStartedAt: '2026-06-19T15:35:00.000Z',
  reason: 'Player opened Borrowed Wings from the promoted MVP Open Orders assignment list.'
}).campaignState;
const borrowedActive = availableAssignmentById(borrowedStarted, 'side-borrowed-wings');
assert.equal(borrowedActive.status, 'active');
assert.equal(borrowedActive.sceneBrief.mvpStatus, 'mvp-complete');
assert.match(borrowedActive.sceneBrief.sceneQuestion, /civilian rescue pilots/);
assert.match(borrowedActive.sceneBrief.expectedOutputs.join(' '), /civilian-pilot role/);
assertHiddenTermsAbsent(borrowedActive);
assertHiddenTermsAbsent(borrowedStarted.commandLog.entries.at(-1));

const borrowedBeatState = applyOpenOrdersAssignmentSceneBeat({
  campaignState: borrowedStarted,
  packageData,
  assignmentId: 'side-borrowed-wings',
  beatId: 'open-orders-scene-beat.test.borrowed-wings-1',
  beatAt: '2026-06-19T15:42:00.000Z',
  playerIntent: 'Have Bronn test civilian rescue pilots against escort-only, courier, and abort-authority limits before any field work.',
  approach: 'security',
  reason: 'Player advanced Borrowed Wings through the qualification beat.'
}).campaignState;
const borrowedBeatAssignment = availableAssignmentById(borrowedBeatState, 'side-borrowed-wings');
assert.equal(borrowedBeatAssignment.sceneBeats.length, 1);
assert.equal(borrowedBeatAssignment.sceneBeats[0].authoredBeatId, 'borrowed-wings-qualification');
assert.equal(borrowedBeatAssignment.sceneBeats[0].title, 'Qualification Line');
assert.match(borrowedBeatAssignment.sceneBeats[0].expectedFollowUp, /abort authority/);
assert.equal(pressureById(borrowedBeatState, 'pressure.crew.bronn-fallback-command').lastUpdatedByOutcomeId, 'open-orders-scene-beat.test.borrowed-wings-1');
assertHiddenTermsAbsent(borrowedBeatAssignment);
assertHiddenTermsAbsent(borrowedBeatState.commandLog.entries.at(-1));

const borrowedSaveLoaded = cloneJson(borrowedBeatState);
assert.deepEqual(borrowedSaveLoaded.sideMissions.availableAssignments, borrowedBeatState.sideMissions.availableAssignments);
assert.deepEqual(borrowedSaveLoaded.pressureLedger.records, borrowedBeatState.pressureLedger.records);

const borrowedResolved = applyOpenOrdersAssignmentResolution({
  campaignState: borrowedBeatState,
  packageData,
  assignmentId: 'side-borrowed-wings',
  resolutionId: 'open-orders-resolution.test.scene-borrowed-wings',
  resolvedAt: '2026-06-19T15:50:00.000Z',
  outcomeBand: 'Success',
  assignmentMode: 'delegated',
  delegatedTo: 'Bronn with accountable civilian pilot leads',
  reason: 'Player resolved Borrowed Wings through delegated support.'
}).campaignState;
assert.equal(completedAssignmentById(borrowedResolved, 'side-borrowed-wings').status, 'completed');
assert.equal(completedAssignmentById(borrowedResolved, 'side-borrowed-wings').assignmentMode, 'delegated');
assert.equal(completedAssignmentById(borrowedResolved, 'side-borrowed-wings').rewardAssetId, 'civilian-rescue-wing');
assert.equal(assetById(borrowedResolved, 'civilian-rescue-wing').state, 'earned');
assert.equal(pressureById(borrowedResolved, 'pressure.crew.bronn-fallback-command').status, 'resolved');
assert.match(JSON.stringify(borrowedResolved.commandLog.entries.at(-1)), /Civilian Rescue Wing/);
assertHiddenTermsAbsent(completedAssignmentById(borrowedResolved, 'side-borrowed-wings'));
assertHiddenTermsAbsent(borrowedResolved.sideMissions);
assertHiddenTermsAbsent(borrowedResolved.commandLog.entries.at(-1));

assert.throws(
  () => applyOpenOrdersAssignmentSceneStart({
    campaignState: sceneState,
    packageData,
    assignmentId: 'side-the-long-repair',
    sceneId: 'open-orders-scene.test.duplicate'
  }),
  /already active/
);

console.log('Open Orders scene tests passed: selected assignment scene start, active brief, scene beat progress, pressure history, command log, clone safety, resolution from active state, and hidden-source safety');
