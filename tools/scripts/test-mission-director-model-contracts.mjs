import assert from 'node:assert/strict';
import {
  MISSION_DIRECTOR_PLAN_REVIEW_KIND,
  MISSION_OUTCOME_PLAN_KIND,
  MISSION_STORY_POSITION_KIND,
  normalizeMissionDirectorPlanReview,
  normalizeMissionOutcomePlan,
  normalizeMissionStoryPosition
} from '../../src/directors/mission-director-model-contracts.mjs';

const sourceHash = 'frame.hash.1';
const storyPositionHash = 'story.hash.1';
const outcomePlanHash = 'outcome.hash.1';

const story = normalizeMissionStoryPosition({
  kind: MISSION_STORY_POSITION_KIND,
  schemaVersion: 1,
  sourceHash,
  confidence: 0.84,
  storyPosition: {
    contextType: 'phase_window',
    missionId: 'prelude-a-ship-underway',
    questId: 'prelude-a-ship-underway',
    phaseId: 'ready-room-handover',
    locationId: 'captain-ready-room',
    anchorId: 'ready-room-whitaker-question',
    anchorFrom: 'ready-room-entry-complete',
    anchorTo: 'ready-room-handoff-close',
    arc: 'Prelude',
    phase: 'A Ship Underway',
    currentConversation: 'Whitaker asks for the XO first read before inspection.'
  },
  sceneContinuity: {
    mustPreserve: ['Sam is already in the ready room.'],
    mustNotReestablish: ['Sam boarding the ship.']
  },
  outcomeRelevance: {
    route: 'outcome',
    reason: 'The player gives a durable order.',
    activeDecisionIds: ['decision.ready-room-handover'],
    candidateOutcomeIds: ['outcome.ready-room-handover.accepted'],
    requiresClarification: false
  },
  sourceUse: {
    evidenceRefs: ['message:18'],
    ignoredStaleSetup: [],
    uncertainties: []
  }
}, { expectedSourceHash: sourceHash });

assert.equal(story.ok, true);
assert.equal(story.value.storyPosition.phaseId, 'ready-room-handover');

const rejectedStory = normalizeMissionStoryPosition({
  kind: MISSION_STORY_POSITION_KIND,
  schemaVersion: 1,
  sourceHash: 'wrong',
  confidence: 0.5,
  storyPosition: {},
  outcomeRelevance: { route: 'outcome' },
  sourceUse: { evidenceRefs: ['message:18'] }
}, { expectedSourceHash: sourceHash });
assert.equal(rejectedStory.ok, false);
assert.equal(rejectedStory.error.code, 'source_hash_mismatch');

const plan = normalizeMissionOutcomePlan({
  kind: MISSION_OUTCOME_PLAN_KIND,
  schemaVersion: 1,
  sourceHash,
  storyPositionHash,
  resultBand: 'Partial Success',
  outcomeSummary: 'The XO gives Whitaker a bounded readiness answer.',
  consequencePlan: {
    costs: ['Whitaker expects a first-hand follow-up after inspection.'],
    revealedFactIds: ['crew.transfer-cohort-tension'],
    commandDecisionAwards: [],
    openAssignments: [],
    questOutcomeKey: '',
    completionRecommendation: 'continue'
  },
  narrationPlan: {
    allowedFacts: ['Whitaker is in the ready room.'],
    forbiddenFacts: ['Hidden pressure values.'],
    constraints: ['Do not reintroduce boarding.'],
    mustPreserve: ['Sam is already in the ready room.'],
    mustNotReestablish: ['Sam boarding the ship.']
  },
  stateProposal: {
    allowedRoots: ['mission'],
    operations: [{ op: 'set', path: 'mission.lastOutcomeSummary', value: 'bounded readiness answer' }]
  },
  diagnostics: {
    reasonerUsed: false,
    uncertainties: [],
    reviewRequired: false
  }
}, {
  expectedSourceHash: sourceHash,
  expectedStoryPositionHash: storyPositionHash,
  allowedRoots: ['mission'],
  allowedFactIds: ['crew.transfer-cohort-tension'],
  allowedDecisionIds: []
});
assert.equal(plan.ok, true);
assert.equal(plan.value.resultBand, 'Partial Success');

const rejectedRoot = normalizeMissionOutcomePlan({
  kind: MISSION_OUTCOME_PLAN_KIND,
  schemaVersion: 1,
  sourceHash,
  storyPositionHash,
  resultBand: 'Success',
  outcomeSummary: 'Bad root.',
  consequencePlan: { revealedFactIds: [], commandDecisionAwards: [], completionRecommendation: 'continue' },
  narrationPlan: {},
  stateProposal: { allowedRoots: ['relationships'], operations: [{ path: 'relationships.raw', value: 1 }] },
  diagnostics: {}
}, {
  expectedSourceHash: sourceHash,
  expectedStoryPositionHash: storyPositionHash,
  allowedRoots: ['mission'],
  allowedFactIds: [],
  allowedDecisionIds: []
});
assert.equal(rejectedRoot.ok, false);
assert.equal(rejectedRoot.error.code, 'unsupported_state_root');

const review = normalizeMissionDirectorPlanReview({
  kind: MISSION_DIRECTOR_PLAN_REVIEW_KIND,
  schemaVersion: 1,
  sourceHash,
  storyPositionHash,
  outcomePlanHash,
  approved: true,
  risk: 'low',
  requiredAction: 'approve',
  reasons: [],
  narrationSafety: {
    hiddenStateLeak: false,
    staleSetupRisk: false,
    forbiddenClaims: []
  }
}, { expectedSourceHash: sourceHash, expectedStoryPositionHash: storyPositionHash, expectedOutcomePlanHash: outcomePlanHash });
assert.equal(review.ok, true);

console.log('mission director model contracts passed');
