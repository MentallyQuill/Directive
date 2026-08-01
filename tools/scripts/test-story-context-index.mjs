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
  sourceFrameRef: { id: 'source.1', textHash: 'hash.1' },
  playerInput: 'I inspect the transfer records before reporting aboard.',
  recentTranscript: ['Whitaker asks for an executive handoff.', 'The shuttle is on final approach.']
});

assert.equal(index.current.activePhaseId, 'shuttle-rendezvous');
assert.equal(index.graph.nodes.some((node) => node.id === 'phase.shuttle-rendezvous'), true);
assert.equal(index.projection.activeThreadIds[0], 'thread.hesperus.evidenceCustody');
assert.equal(index.turn.playerInput, 'I inspect the transfer records before reporting aboard.');
assert.deepEqual(index.turn.recentTranscript, ['Whitaker asks for an executive handoff.', 'The shuttle is on final approach.']);
assert.equal(index.turn.claimAuthority.disposition, 'verification-required');
assert.equal(index.turn.claimAuthority.policy.playerInputIsIntentNotFact, true);

const candidates = deriveStoryPositionCandidates({ storyContextIndex: index });
assert.equal(candidates.some((candidate) => candidate.nodeId === 'thread.hesperus.evidenceCustody'), true);
assert.equal(candidates.some((candidate) => candidate.nodeId === 'phase.shuttle-rendezvous' && candidate.status === 'completed'), true);
assert.equal(candidates.find((candidate) => candidate.nodeId === 'phase.shuttle-rendezvous').staleSetupGuards.length > 0, true);

const gatedIndex = buildStoryContextIndex({
  campaignState: {
    campaign: { id: 'campaign.gated' },
    mission: { activeMissionId: 'mission.gated', activePhaseId: 'opening' },
    storyEventLedger: { events: [] },
    knowledgeLedger: { facts: [] }
  },
  packageData: { manifest: { id: 'gated-package' } },
  missionGraph: {
    id: 'mission.gated',
    phases: [
      { id: 'opening', label: 'Opening', type: 'arrival' },
      { id: 'future', label: 'Future', type: 'mandatory' }
    ],
    edges: [{ from: 'phase.opening', to: 'phase.future', prerequisites: ['fact.required'] }]
  },
  playerInput: 'I follow a side signal instead.',
  recentTranscript: ['The opening briefing is unresolved.']
});
const gatedCandidates = deriveStoryPositionCandidates({ storyContextIndex: gatedIndex });
const futureCandidate = gatedCandidates.find((candidate) => candidate.nodeId === 'phase.future');
assert(futureCandidate, 'future node should remain visible for diagnostics');
assert.equal(futureCandidate.eligibility.ok, false);
assert.equal(futureCandidate.eligibility.reasons.includes('missing-prerequisite'), true);
const openingCandidate = gatedCandidates.find((candidate) => candidate.nodeId === 'phase.opening');
assert.equal(openingCandidate.eligibility.ok, true);

console.log('story context index passed');
