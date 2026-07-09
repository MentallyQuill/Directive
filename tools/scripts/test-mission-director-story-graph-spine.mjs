import assert from 'node:assert/strict';
import { runMissionDirectorStoryGraphSpine } from '../../src/directors/mission-director-story-graph-spine.mjs';
import {
  STORY_DELTA_PLAN_KIND,
  STORY_DELTA_REVIEW_KIND,
  STORY_POSITION_REVIEW_KIND,
  STORY_POSITION_SELECTION_KIND
} from '../../src/story/story-position-contracts.mjs';

const calls = [];
const router = {
  async generate(roleId, request = {}) {
    calls.push({ roleId, request });
    const sourceHash = request.context?.sourceHash;
    if (roleId === 'missionDirectorStoryPositioner') {
      const candidateId = request.context.storyCandidates.find((candidate) => candidate.status === 'active')?.id;
      return { ok: true, response: { content: {
        kind: STORY_POSITION_SELECTION_KIND,
        schemaVersion: 1,
        sourceHash,
        primaryCandidateId: candidateId,
        secondaryCandidateIds: [],
        route: 'outcome',
        confidence: 0.9,
        evidenceRefs: ['message:18'],
        ignoredStaleSetup: [],
        continuityGuards: { mustPreserve: ['Known evidence remains true.'], mustNotReestablish: ['Completed decision as pending.'] },
        unresolved: []
      } } };
    }
    if (roleId === 'missionDirectorStoryPositionReviewer') {
      return { ok: true, response: { content: {
        kind: STORY_POSITION_REVIEW_KIND,
        schemaVersion: 1,
        sourceHash,
        selectionHash: request.context.selectionHash,
        approved: true,
        requiredAction: 'approve',
        risk: 'low',
        reasons: [],
        rejectedCandidateIds: [],
        staleHistoryRisk: false,
        forbiddenAssertionRisk: false
      } } };
    }
    if (roleId === 'missionDirectorStoryDeltaPlanner') {
      return { ok: true, response: { content: {
        kind: STORY_DELTA_PLAN_KIND,
        schemaVersion: 1,
        sourceHash,
        selectionHash: request.context.selectionHash,
        outcomePlanHash: request.context.outcomePlanHash,
        eventDrafts: [{
          eventType: 'missionOutcomeCommitted',
          nodeTransitions: [{ nodeId: 'phase.shuttle-rendezvous', to: 'active', reason: 'Source keeps shuttle rendezvous active.' }],
          factTransitions: [{ factId: 'fact.hesperus.inspectionFalsified', to: 'known' }],
          threadTransitions: [],
          commandLogRefs: []
        }],
        rejectedAssertions: [],
        diagnostics: { reasonerUsed: true, uncertainties: [] }
      } } };
    }
    if (roleId === 'missionDirectorStoryDeltaReviewer') {
      return { ok: true, response: { content: {
        kind: STORY_DELTA_REVIEW_KIND,
        schemaVersion: 1,
        sourceHash,
        deltaPlanHash: request.context.deltaPlanHash,
        approved: true,
        requiredAction: 'approve',
        risk: 'low',
        reasons: [],
        forbiddenPastAssignment: false,
        futureFactLeak: false,
        missingBranchAuthority: false
      } } };
    }
    return { ok: false, error: { code: 'unexpected_role' } };
  }
};

const result = await runMissionDirectorStoryGraphSpine({
  generationRouter: router,
  sourceHash: 'frame.hash.1',
  campaignState: {
    campaign: { id: 'campaign.1' },
    mission: { activeMissionId: 'prelude-a-ship-underway', activeMissionGraphId: 'prelude-a-ship-underway', activePhaseId: 'shuttle-rendezvous' },
    storyEventLedger: { events: [] },
    knowledgeLedger: { facts: [{ id: 'fact.hesperus.inspectionFalsified', known: true }] }
  },
  packageData: { manifest: { id: 'ashes-of-peace' } },
  missionGraph: {
    id: 'prelude-a-ship-underway',
    phases: [{ id: 'shuttle-rendezvous', label: 'Shuttle Rendezvous' }],
    decisionPoints: [],
    outcomes: []
  },
  sourceFrameRef: { id: 'source.1', textHash: 'hash.1' },
  outcomePlanHash: 'outcome.hash.1'
});

assert.equal(result.ok, true);
assert.equal(result.selection.primaryCandidateId.includes('candidate.'), true);
assert.equal(result.deltaPlan.eventDrafts.length, 1);
assert.deepEqual(calls.map((call) => call.roleId), [
  'missionDirectorStoryPositioner',
  'missionDirectorStoryPositionReviewer',
  'missionDirectorStoryDeltaPlanner',
  'missionDirectorStoryDeltaReviewer'
]);

const completedSelectionRouter = {
  async generate(roleId, request = {}) {
    const sourceHash = request.context?.sourceHash;
    if (roleId === 'missionDirectorStoryPositioner') {
      const candidateId = request.context.storyCandidates.find((candidate) => candidate.status === 'completed')?.id;
      return { ok: true, response: { content: {
        kind: STORY_POSITION_SELECTION_KIND,
        schemaVersion: 1,
        sourceHash,
        primaryCandidateId: candidateId,
        secondaryCandidateIds: [],
        route: 'outcome',
        confidence: 0.92,
        evidenceRefs: ['message:completed-replay'],
        ignoredStaleSetup: [],
        continuityGuards: { mustPreserve: [], mustNotReestablish: ['Shuttle Rendezvous as pending.'] },
        unresolved: []
      } } };
    }
    if (roleId === 'missionDirectorStoryPositionReviewer') {
      return { ok: true, response: { content: {
        kind: STORY_POSITION_REVIEW_KIND,
        schemaVersion: 1,
        sourceHash,
        selectionHash: request.context.selectionHash,
        approved: false,
        requiredAction: 'retryStoryPosition',
        risk: 'high',
        reasons: ['Completed story node selected without rerun branch authority.'],
        rejectedCandidateIds: [request.context.selection.primaryCandidateId],
        staleHistoryRisk: true,
        forbiddenAssertionRisk: true
      } } };
    }
    return { ok: false, error: { code: 'unexpected_role' } };
  }
};

const completedRejected = await runMissionDirectorStoryGraphSpine({
  generationRouter: completedSelectionRouter,
  sourceHash: 'frame.hash.completed',
  campaignState: {
    campaign: { id: 'campaign.1' },
    mission: { activeMissionId: 'prelude-a-ship-underway', activeMissionGraphId: 'prelude-a-ship-underway', activePhaseId: 'shuttle-rendezvous' },
    storyEventLedger: {
      events: [{
        id: 'storyEvent.completed.1',
        branchId: 'main',
        outcomeId: 'outcome.completed.1',
        nodeTransitions: [{ nodeId: 'phase.shuttle-rendezvous', to: 'completed' }],
        factTransitions: [],
        threadTransitions: []
      }]
    },
    knowledgeLedger: { facts: [{ id: 'fact.hesperus.inspectionFalsified', known: true }] }
  },
  packageData: { manifest: { id: 'ashes-of-peace' } },
  missionGraph: {
    id: 'prelude-a-ship-underway',
    phases: [{ id: 'shuttle-rendezvous', label: 'Shuttle Rendezvous' }],
    decisionPoints: [],
    outcomes: []
  },
  sourceFrameRef: { id: 'source.completed', textHash: 'hash.completed' },
  outcomePlanHash: 'outcome.hash.completed'
});
assert.equal(completedRejected.ok, false);
assert.equal(completedRejected.diagnostics.stage, 'storyPositionReviewValidation');

const futureFactRouter = {
  async generate(roleId, request = {}) {
    const sourceHash = request.context?.sourceHash;
    if (roleId === 'missionDirectorStoryPositioner') {
      const candidateId = request.context.storyCandidates.find((candidate) => candidate.status === 'active')?.id;
      return { ok: true, response: { content: {
        kind: STORY_POSITION_SELECTION_KIND,
        schemaVersion: 1,
        sourceHash,
        primaryCandidateId: candidateId,
        secondaryCandidateIds: [],
        route: 'outcome',
        confidence: 0.9,
        evidenceRefs: ['message:future-fact'],
        ignoredStaleSetup: [],
        continuityGuards: { mustPreserve: ['Known evidence remains true.'], mustNotReestablish: [] },
        unresolved: []
      } } };
    }
    if (roleId === 'missionDirectorStoryPositionReviewer') {
      return { ok: true, response: { content: {
        kind: STORY_POSITION_REVIEW_KIND,
        schemaVersion: 1,
        sourceHash,
        selectionHash: request.context.selectionHash,
        approved: true,
        requiredAction: 'approve',
        risk: 'low',
        reasons: [],
        rejectedCandidateIds: [],
        staleHistoryRisk: false,
        forbiddenAssertionRisk: false
      } } };
    }
    if (roleId === 'missionDirectorStoryDeltaPlanner') {
      return { ok: true, response: { content: {
        kind: STORY_DELTA_PLAN_KIND,
        schemaVersion: 1,
        sourceHash,
        selectionHash: request.context.selectionHash,
        outcomePlanHash: request.context.outcomePlanHash,
        eventDrafts: [{
          eventType: 'missionOutcomeCommitted',
          nodeTransitions: [],
          factTransitions: [{ factId: 'fact.hesperus.ownerConvicted', to: 'known' }],
          threadTransitions: [],
          commandLogRefs: []
        }],
        rejectedAssertions: [],
        diagnostics: { reasonerUsed: true, uncertainties: [] }
      } } };
    }
    return { ok: false, error: { code: 'unexpected_role' } };
  }
};

const futureFactRejected = await runMissionDirectorStoryGraphSpine({
  generationRouter: futureFactRouter,
  sourceHash: 'frame.hash.future',
  campaignState: {
    campaign: { id: 'campaign.1' },
    mission: { activeMissionId: 'prelude-a-ship-underway', activeMissionGraphId: 'prelude-a-ship-underway', activePhaseId: 'shuttle-rendezvous' },
    storyEventLedger: { events: [] },
    knowledgeLedger: { facts: [{ id: 'fact.hesperus.inspectionFalsified', known: true }] }
  },
  packageData: { manifest: { id: 'ashes-of-peace' } },
  missionGraph: {
    id: 'prelude-a-ship-underway',
    phases: [{ id: 'shuttle-rendezvous', label: 'Shuttle Rendezvous' }],
    decisionPoints: [],
    outcomes: []
  },
  sourceFrameRef: { id: 'source.future', textHash: 'hash.future' },
  outcomePlanHash: 'outcome.hash.future'
});
assert.equal(futureFactRejected.ok, false);
assert.equal(futureFactRejected.diagnostics.stage, 'storyDeltaPlanValidation');
assert.equal(futureFactRejected.diagnostics.error.code, 'unknown_fact_id');

console.log('mission director story graph spine passed');
