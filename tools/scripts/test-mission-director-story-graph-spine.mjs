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

console.log('mission director story graph spine passed');
