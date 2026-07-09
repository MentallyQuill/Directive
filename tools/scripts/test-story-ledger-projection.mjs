import assert from 'node:assert/strict';
import {
  appendReviewedStoryEvents,
  createEmptyActiveStoryProjection,
  materializeActiveStoryProjection
} from '../../src/story/story-ledger.mjs';

const empty = createEmptyActiveStoryProjection({ branchId: 'main' });
assert.equal(empty.branchId, 'main');
assert.deepEqual(empty.activeNodeIds, []);

const events = [{
  id: 'storyEvent.1',
  branchId: 'main',
  outcomeId: 'outcome.1',
  nodeTransitions: [
    { nodeId: 'hesperus.command', to: 'completed' },
    { nodeId: 'hesperus.evidenceCustody', to: 'active' },
    { nodeId: 'hesperus.ownerInquiry', to: 'available' }
  ],
  factTransitions: [
    { factId: 'fact.hesperus.inspectionFalsified', to: 'known' },
    { factId: 'fact.hesperus.ownerConvicted', to: 'notYetTrue' }
  ],
  threadTransitions: [
    { threadId: 'thread.hesperus.evidenceCustody', to: 'active' }
  ]
}];

const projection = materializeActiveStoryProjection({ events, branchId: 'main' });
assert.deepEqual(projection.activeNodeIds, ['hesperus.evidenceCustody']);
assert.deepEqual(projection.availableNodeIds, ['hesperus.ownerInquiry']);
assert.deepEqual(projection.completedNodeIds, ['hesperus.command']);
assert.deepEqual(projection.knownFactIds, ['fact.hesperus.inspectionFalsified']);
assert.deepEqual(projection.notYetTrueFactIds, ['fact.hesperus.ownerConvicted']);
assert.deepEqual(projection.rerunOnlyNodeIds, ['hesperus.command']);

const campaignState = { storyEventLedger: { events: [] }, campaign: { id: 'campaign.1' } };
const next = appendReviewedStoryEvents(campaignState, [{
  eventType: 'missionOutcomeCommitted',
  nodeTransitions: [{ nodeId: 'hesperus.command', to: 'completed' }],
  factTransitions: [],
  threadTransitions: [],
  commandLogRefs: []
}], {
  outcomeId: 'outcome.2',
  turnId: 'turn.2',
  sourceFrameRef: { id: 'sourceFrame.2', textHash: 'hash.2' },
  branchId: 'main',
  now: () => '2026-07-09T12:00:00.000Z'
});

assert.equal(next.storyEventLedger.events.length, 1);
assert.equal(next.activeStoryProjection.completedNodeIds[0], 'hesperus.command');
assert.equal(next.storyEventLedger.events[0].sourceFrameRef.textHash, 'hash.2');

console.log('story ledger projection passed');
