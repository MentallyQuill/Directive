import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runMissionDirectorModelSpine } from '../../src/directors/mission-director-model-spine.mjs';
import {
  MISSION_DIRECTOR_PLAN_REVIEW_KIND,
  MISSION_OUTCOME_PLAN_KIND,
  MISSION_STORY_POSITION_KIND
} from '../../src/directors/mission-director-model-contracts.mjs';

function routerFor({ storyRoute = 'outcome', reviewerAction = 'approve' } = {}) {
  const calls = [];
  return {
    calls,
    async generate(roleId, request) {
      calls.push({ roleId, request });
      const frameHash = request.context?.sourceHash || request.sourceHash;
      if (roleId === 'missionDirectorStoryPositioner') {
        return {
          ok: true,
          response: {
            content: {
              kind: MISSION_STORY_POSITION_KIND,
              schemaVersion: 1,
              sourceHash: frameHash,
              confidence: 0.9,
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
                currentConversation: 'Whitaker asks for the XO first read.'
              },
              sceneContinuity: {
                mustPreserve: ['Already in ready room.'],
                mustNotReestablish: ['Boarding the ship.']
              },
              outcomeRelevance: {
                route: storyRoute,
                reason: 'fixture',
                activeDecisionIds: ['decision.ready-room-handover'],
                candidateOutcomeIds: ['outcome.ready-room'],
                requiresClarification: false
              },
              sourceUse: { evidenceRefs: ['message:18'], ignoredStaleSetup: [], uncertainties: [] }
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
assert.deepEqual(router.calls.map((call) => call.roleId), [
  'missionDirectorStoryPositioner',
  'missionDirectorOutcomePlanner',
  'missionDirectorPlanReviewer'
]);

const hostRouter = routerFor({ storyRoute: 'hostContinue' });
const hostResult = await runMissionDirectorModelSpine({ ...baseOptions, generationRouter: hostRouter });
assert.equal(hostResult.ok, true);
assert.equal(hostResult.route, 'hostContinue');
assert.equal(hostResult.turnPacket, null);
assert.deepEqual(hostRouter.calls.map((call) => call.roleId), ['missionDirectorStoryPositioner']);

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
