import assert from 'node:assert/strict';
import {
  STORY_DELTA_PLAN_KIND,
  STORY_DELTA_REVIEW_KIND,
  STORY_POSITION_REVIEW_KIND,
  STORY_POSITION_SELECTION_KIND,
  normalizeStoryDeltaPlan,
  normalizeStoryDeltaReview,
  normalizeStoryPositionReview,
  normalizeStoryPositionSelection
} from '../../src/story/story-position-contracts.mjs';

const sourceHash = 'frame.hash.1';
const selectionHash = 'selection.hash.1';
const outcomePlanHash = 'outcome.hash.1';
const deltaPlanHash = 'delta.hash.1';
const candidateIds = [
  'candidate.hesperus.evidenceCustody.active',
  'candidate.hesperus.ownerInquiry.available'
];

const selection = normalizeStoryPositionSelection({
  kind: STORY_POSITION_SELECTION_KIND,
  schemaVersion: 1,
  sourceHash,
  primaryCandidateId: 'candidate.hesperus.evidenceCustody.active',
  secondaryCandidateIds: ['candidate.hesperus.ownerInquiry.available'],
  route: 'outcome',
  confidence: 0.86,
  evidenceRefs: ['message:18', 'storyEvent.outcome.stage18.hesperus.001'],
  ignoredStaleSetup: ['Original command decision is completed.'],
  continuityGuards: {
    mustPreserve: ['Evidence was preserved.'],
    mustNotReestablish: ['Original Hesperus command decision as pending.']
  },
  unresolved: []
}, { sourceHash, candidateIds });

assert.equal(selection.ok, true);
assert.equal(selection.value.primaryCandidateId, 'candidate.hesperus.evidenceCustody.active');

const unknownCandidate = normalizeStoryPositionSelection({
  kind: STORY_POSITION_SELECTION_KIND,
  schemaVersion: 1,
  sourceHash,
  primaryCandidateId: 'candidate.unknown',
  route: 'outcome',
  confidence: 0.8,
  evidenceRefs: ['message:18']
}, { sourceHash, candidateIds });
assert.equal(unknownCandidate.ok, false);
assert.equal(unknownCandidate.error.code, 'unknown_candidate_id');

const review = normalizeStoryPositionReview({
  kind: STORY_POSITION_REVIEW_KIND,
  schemaVersion: 1,
  sourceHash,
  selectionHash,
  approved: true,
  requiredAction: 'approve',
  risk: 'low',
  reasons: [],
  rejectedCandidateIds: [],
  staleHistoryRisk: false,
  forbiddenAssertionRisk: false
}, { sourceHash, selectionHash });
assert.equal(review.ok, true);

const delta = normalizeStoryDeltaPlan({
  kind: STORY_DELTA_PLAN_KIND,
  schemaVersion: 1,
  sourceHash,
  selectionHash,
  outcomePlanHash,
  eventDrafts: [{
    eventType: 'missionOutcomeCommitted',
    nodeTransitions: [
      { nodeId: 'hesperus.ownerInquiry', to: 'active', reason: 'Player ordered formal inquiry.' }
    ],
    factTransitions: [
      { factId: 'fact.hesperus.inspectionFalsified', to: 'known' }
    ],
    threadTransitions: [
      { threadId: 'thread.hesperus.ownerInquiry', to: 'active' }
    ],
    commandLogRefs: []
  }],
  rejectedAssertions: ['Owner convicted is not yet true.'],
  diagnostics: { reasonerUsed: true, uncertainties: [] }
}, {
  sourceHash,
  selectionHash,
  outcomePlanHash,
  knownNodeIds: ['hesperus.ownerInquiry'],
  knownFactIds: ['fact.hesperus.inspectionFalsified'],
  knownThreadIds: ['thread.hesperus.ownerInquiry']
});
assert.equal(delta.ok, true);

const badFact = normalizeStoryDeltaPlan({
  kind: STORY_DELTA_PLAN_KIND,
  schemaVersion: 1,
  sourceHash,
  selectionHash,
  outcomePlanHash,
  eventDrafts: [{
    eventType: 'missionOutcomeCommitted',
    nodeTransitions: [],
    factTransitions: [{ factId: 'fact.future.conviction', to: 'known' }],
    threadTransitions: [],
    commandLogRefs: []
  }]
}, {
  sourceHash,
  selectionHash,
  outcomePlanHash,
  knownNodeIds: [],
  knownFactIds: ['fact.hesperus.inspectionFalsified'],
  knownThreadIds: []
});
assert.equal(badFact.ok, false);
assert.equal(badFact.error.code, 'unknown_fact_id');

const deltaReview = normalizeStoryDeltaReview({
  kind: STORY_DELTA_REVIEW_KIND,
  schemaVersion: 1,
  sourceHash,
  deltaPlanHash,
  approved: true,
  requiredAction: 'approve',
  risk: 'low',
  reasons: [],
  forbiddenPastAssignment: false,
  futureFactLeak: false,
  missingBranchAuthority: false
}, { sourceHash, deltaPlanHash });
assert.equal(deltaReview.ok, true);

console.log('story position contracts passed');
