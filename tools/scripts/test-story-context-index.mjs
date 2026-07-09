import assert from 'node:assert/strict';
import {
  buildStoryContextIndex,
  deriveStoryPositionCandidates
} from '../../src/story/story-context-index.mjs';

const missionGraph = {
  id: 'prelude-a-ship-underway',
  phases: [
    { id: 'shuttle-rendezvous', label: 'Shuttle Rendezvous', summary: 'Hesperus decision pressure.' },
    { id: 'hesperus-aftermath', label: 'Hesperus Aftermath', summary: 'Aftermath and inquiry.' }
  ],
  decisionPoints: [
    { id: 'decision.hesperus.command', phaseId: 'shuttle-rendezvous', label: 'Hesperus command' }
  ],
  outcomes: [
    { id: 'outcome.hesperus.evidence', phaseId: 'shuttle-rendezvous', label: 'Evidence preserved' }
  ]
};

const campaignState = {
  campaign: { id: 'campaign.1' },
  mission: {
    activeMissionId: 'prelude-a-ship-underway',
    activeMissionGraphId: 'prelude-a-ship-underway',
    activePhaseId: 'shuttle-rendezvous'
  },
  storyEventLedger: {
    events: [{
      id: 'storyEvent.outcome.1',
      branchId: 'main',
      outcomeId: 'outcome.1',
      nodeTransitions: [
        { nodeId: 'phase.shuttle-rendezvous', to: 'completed' },
        { nodeId: 'thread.hesperus.evidenceCustody', to: 'active' }
      ],
      factTransitions: [{ factId: 'fact.hesperus.inspectionFalsified', to: 'known' }],
      threadTransitions: [{ threadId: 'thread.hesperus.evidenceCustody', to: 'active' }]
    }]
  },
  knowledgeLedger: {
    facts: [{ id: 'fact.hesperus.inspectionFalsified', known: true }]
  }
};

const index = buildStoryContextIndex({
  campaignState,
  packageData: { manifest: { id: 'ashes-of-peace' } },
  missionGraph,
  sourceFrameRef: { id: 'source.1', textHash: 'hash.1' }
});

assert.equal(index.current.activePhaseId, 'shuttle-rendezvous');
assert.equal(index.graph.nodes.some((node) => node.id === 'phase.shuttle-rendezvous'), true);
assert.equal(index.projection.activeThreadIds[0], 'thread.hesperus.evidenceCustody');

const candidates = deriveStoryPositionCandidates({ storyContextIndex: index });
assert.equal(candidates.some((candidate) => candidate.nodeId === 'thread.hesperus.evidenceCustody'), true);
assert.equal(candidates.some((candidate) => candidate.nodeId === 'phase.shuttle-rendezvous' && candidate.status === 'completed'), true);
assert.equal(candidates.find((candidate) => candidate.nodeId === 'phase.shuttle-rendezvous').staleSetupGuards.length > 0, true);

console.log('story context index passed');
