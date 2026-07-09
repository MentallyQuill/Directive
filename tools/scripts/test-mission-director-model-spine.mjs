import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runMissionDirectorModelSpine } from '../../src/directors/mission-director-model-spine.mjs';
import {
  MISSION_DIRECTOR_PLAN_REVIEW_KIND,
  MISSION_OUTCOME_PLAN_KIND
} from '../../src/directors/mission-director-model-contracts.mjs';
import {
  STORY_DELTA_PLAN_KIND,
  STORY_DELTA_REVIEW_KIND,
  STORY_POSITION_REVIEW_KIND,
  STORY_POSITION_SELECTION_KIND
} from '../../src/story/story-position-contracts.mjs';

function routerFor({ storyRoute = 'outcome', reviewerAction = 'approve' } = {}) {
  const calls = [];
  return {
    calls,
    async generate(roleId, request) {
      calls.push({ roleId, request });
      const frameHash = request.context?.sourceHash || request.sourceHash;
      if (roleId === 'missionDirectorStoryPositioner') {
        const candidateId = storyRoute === 'hostContinue'
          ? request.context.storyCandidates[0]?.id
          : request.context.storyCandidates.find((candidate) => candidate.status === 'active')?.id;
        return {
          ok: true,
          response: {
            content: {
              kind: STORY_POSITION_SELECTION_KIND,
              schemaVersion: 1,
              sourceHash: frameHash,
              primaryCandidateId: candidateId,
              secondaryCandidateIds: [],
              route: storyRoute,
              confidence: 0.9,
              evidenceRefs: ['message:18'],
              ignoredStaleSetup: [],
              continuityGuards: {
                mustPreserve: ['Already in ready room.'],
                mustNotReestablish: ['Boarding the ship.']
              },
              unresolved: []
            }
          }
        };
      }
      if (roleId === 'missionDirectorStoryPositionReviewer') {
        return {
          ok: true,
          response: {
            content: {
              kind: STORY_POSITION_REVIEW_KIND,
              schemaVersion: 1,
              sourceHash: frameHash,
              selectionHash: request.context.selectionHash,
              approved: true,
              requiredAction: 'approve',
              risk: 'low',
              reasons: [],
              rejectedCandidateIds: [],
              staleHistoryRisk: false,
              forbiddenAssertionRisk: false
            }
          }
        };
      }
      if (roleId === 'missionDirectorOutcomePlanner') {
        return {
          ok: true,
          response: {
            content: {
              kind: MISSION_OUTCOME_PLAN_KIND,
              schemaVersion: 1,
              sourceHash: frameHash,
              storyPositionHash: request.context.storyPositionHash,
              resultBand: 'Partial Success',
              outcomeSummary: 'The XO gives Whitaker a bounded first-read answer.',
              consequencePlan: {
                costs: ['Whitaker expects follow-up after inspection.'],
                revealedFactIds: ['crew.transfer-cohort-tension'],
                commandDecisionAwards: [],
                openAssignments: [],
                questOutcomeKey: '',
                completionRecommendation: 'continue'
              },
              narrationPlan: {
                allowedFacts: ['Whitaker is in the ready room.'],
                forbiddenFacts: [],
                constraints: ['Do not reintroduce boarding.'],
                mustPreserve: ['Already in ready room.'],
                mustNotReestablish: ['Boarding the ship.']
              },
              stateProposal: { allowedRoots: ['mission'], operations: [] },
              diagnostics: { reasonerUsed: false, uncertainties: [], reviewRequired: false }
            }
          }
        };
      }
      if (roleId === 'missionDirectorStoryDeltaPlanner') {
        return {
          ok: true,
          response: {
            content: {
              kind: STORY_DELTA_PLAN_KIND,
              schemaVersion: 1,
              sourceHash: frameHash,
              selectionHash: request.context.selectionHash,
              outcomePlanHash: request.context.outcomePlanHash,
              eventDrafts: [{
                eventType: 'missionOutcomeCommitted',
                nodeTransitions: [{ nodeId: 'phase.ready-room-handover', to: 'active', reason: 'Ready room handover remains the accepted surface.' }],
                factTransitions: [{ factId: 'crew.transfer-cohort-tension', to: 'known' }],
                threadTransitions: [],
                commandLogRefs: []
              }],
              rejectedAssertions: [],
              diagnostics: { reasonerUsed: false, uncertainties: [] }
            }
          }
        };
      }
      if (roleId === 'missionDirectorStoryDeltaReviewer') {
        return {
          ok: true,
          response: {
            content: {
              kind: STORY_DELTA_REVIEW_KIND,
              schemaVersion: 1,
              sourceHash: frameHash,
              deltaPlanHash: request.context.deltaPlanHash,
              approved: true,
              requiredAction: 'approve',
              risk: 'low',
              reasons: [],
              forbiddenPastAssignment: false,
              futureFactLeak: false,
              missingBranchAuthority: false
            }
          }
        };
      }
      if (roleId === 'missionDirectorPlanReviewer') {
        return {
          ok: true,
          response: {
            content: {
              kind: MISSION_DIRECTOR_PLAN_REVIEW_KIND,
              schemaVersion: 1,
              sourceHash: frameHash,
              storyPositionHash: request.context.storyPositionHash,
              outcomePlanHash: request.context.outcomePlanHash,
              approved: reviewerAction === 'approve',
              risk: reviewerAction === 'approve' ? 'low' : 'high',
              requiredAction: reviewerAction,
              reasons: reviewerAction === 'approve' ? [] : ['fixture rejection'],
              narrationSafety: { hiddenStateLeak: false, staleSetupRisk: false, forbiddenClaims: [] }
            }
          }
        };
      }
      return { ok: false, error: { code: 'unexpected_role' } };
    }
  };
}

const baseOptions = {
  campaignState: {
    campaign: { id: 'campaign-1' },
    mission: { activeMissionId: 'prelude-a-ship-underway', activePhaseId: 'ready-room-handover', availableDecisionPointIds: ['decision.ready-room-handover'] },
    attentionState: { foregroundQuestId: 'prelude-a-ship-underway', scene: { locationId: 'captain-ready-room', presentCharacterIds: ['mara-whitaker'] } },
    worldState: { currentLocationId: 'captain-ready-room', currentStardate: 58912.4 },
    knowledgeLedger: { facts: [{ id: 'crew.transfer-cohort-tension', known: true }] }
  },
  packageData: {
    questTemplates: {
      templates: [{
        id: 'prelude-a-ship-underway',
        missionGraph: {
          id: 'ashes-prelude',
          phases: [{ id: 'ready-room-handover', label: 'Ready Room Handover' }],
          decisionPoints: [{ id: 'decision.ready-room-handover' }]
        }
      }]
    }
  },
  turnId: 'turn.fixture',
  playerInput: 'I tell Whitaker I want a first-hand inspection before judging readiness.',
  message: { text: 'I tell Whitaker I want a first-hand inspection before judging readiness.', hostMessageId: 'msg-18' },
  chatId: 'chat-1',
  ingressId: 'ingress-1',
  arbiterPlan: { route: 'directiveOutcome' },
  sceneSnapshot: { activePhaseId: 'ready-room-handover', playerInput: 'fixture' },
  recentTranscript: [{ role: 'assistant', text: 'Whitaker asks for Sam first read.' }]
};

const router = routerFor();
const result = await runMissionDirectorModelSpine({ ...baseOptions, generationRouter: router });
assert.equal(result.ok, true);
assert.equal(result.route, 'outcome');
assert.equal(result.turnPacket.outcomePacket.resultBand, 'Partial Success');
assert.equal(result.turnPacket.provenance.storyGraph.selectedCandidateIds.length > 0, true);
assert.equal(result.turnPacket.stateDelta.openWorld.modelStoryDeltaPlan.eventDrafts.length, 1);
assert.equal(
  result.turnPacket.narratorPacket.constraints.some((item) => item.includes('Do not reestablish completed story nodes')),
  true
);
assert.deepEqual(router.calls.map((call) => call.roleId), [
  'missionDirectorStoryPositioner',
  'missionDirectorStoryPositionReviewer',
  'missionDirectorOutcomePlanner',
  'missionDirectorStoryDeltaPlanner',
  'missionDirectorStoryDeltaReviewer',
  'missionDirectorPlanReviewer'
]);

const hostRouter = routerFor({ storyRoute: 'hostContinue' });
const hostResult = await runMissionDirectorModelSpine({ ...baseOptions, generationRouter: hostRouter });
assert.equal(hostResult.ok, true);
assert.equal(hostResult.route, 'hostContinue');
assert.equal(hostResult.turnPacket, null);
assert.deepEqual(hostRouter.calls.map((call) => call.roleId), [
  'missionDirectorStoryPositioner',
  'missionDirectorStoryPositionReviewer'
]);

const rejectedRouter = routerFor({ reviewerAction: 'pause' });
const rejected = await runMissionDirectorModelSpine({ ...baseOptions, generationRouter: rejectedRouter });
assert.equal(rejected.ok, false);
assert.equal(rejected.route, 'pause');
assert.equal(rejected.turnPacket, null);

const coordinatorSource = fs.readFileSync(new URL('../../src/directors/open-world-turn-coordinator.mjs', import.meta.url), 'utf8');
assert.equal(coordinatorSource.includes("import { parseIntent }"), false);
assert.equal(coordinatorSource.includes('deterministicQuestActionInterpretation'), false);
assert.equal(coordinatorSource.includes('resolveAction('), false);

console.log('mission director model spine passed');
