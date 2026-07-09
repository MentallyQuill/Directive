import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  adjudicateTimeAdvance,
  findTimeBoundaryForSourceAnchorRange,
  TIME_ADVANCE_ADJUDICATOR_ROLE_ID,
  __timeAdvanceAdjudicatorTestHooks
} from '../../src/time/time-advance-adjudicator.mjs';

const projection = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json'), 'utf8'));
const campaignState = JSON.parse(JSON.stringify(projection.initialState));

const quietConversation = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  previousAssistantText: '*Stardate 53049.2 | 0830 hours*\n\n"That is a fair question," Whitaker said.',
  currentPlayerText: 'Sam nods. "I understand."'
});
assert.equal(quietConversation.elapsedMinutes, 0);
assert.equal(quietConversation.reason, 'no-time-advance');

let skippedGateModelCalls = 0;
const dialogueOnlyTimeReference = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  previousAssistantText: 'Whitaker waits for Sam to answer.',
  currentPlayerText: 'Sam says, "We spend the week repairing it if Command allows it."',
  timePlan: {
    action: 'skip',
    semanticKind: 'referenceOnly',
    authority: 'playerDialogue',
    confidence: 0.9,
    evidence: 'Dialogue describes a hypothetical future plan, not elapsed time.',
    rationale: 'No accepted scene movement.'
  },
  generationRouter: {
    async generate() {
      skippedGateModelCalls += 1;
      throw new Error('skip timePlan must not call model');
    }
  }
});
assert.equal(skippedGateModelCalls, 0);
assert.equal(dialogueOnlyTimeReference.elapsedMinutes, 0);
assert.equal(dialogueOnlyTimeReference.reason, 'time-plan-skip');

let operatorCutModelCalls = 0;
const operatorCutAdjudicated = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  currentPlayerText: 'Cut ahead ten minutes.',
  timePlan: {
    action: 'adjudicate',
    semanticKind: 'sceneCut',
    authority: 'operatorControl',
    confidence: 0.94,
    evidence: 'Cut ahead ten minutes.',
    rationale: 'Conservative operator scene-control command.'
  },
  generationRouter: {
    async generate(roleId, request) {
      operatorCutModelCalls += 1;
      assert.equal(roleId, TIME_ADVANCE_ADJUDICATOR_ROLE_ID);
      assert.equal(request.context.timePlan.action, 'adjudicate');
      return {
        ok: true,
        response: {
          text: JSON.stringify({
            kind: 'directive.timeAdvanceProposal.v1',
            elapsedMinutes: 10,
            reason: 'scene-cut',
            confidence: 0.86,
            rationale: 'Operator command explicitly advances the scene ten minutes.'
          })
        }
      };
    }
  }
});
assert.equal(operatorCutModelCalls, 1);
assert.equal(operatorCutAdjudicated.elapsedMinutes, 10);
assert.equal(operatorCutAdjudicated.source, 'utility-model');

const dinnerCut = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  currentPlayerText: 'Cut to dinner time scene.'
});
assert.equal(dinnerCut.elapsedMinutes, 570);
assert.equal(dinnerCut.reason, 'scene-cut');

const tomorrowCut = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  currentPlayerText: 'Cut to tomorrow morning on the bridge.'
});
assert.equal(tomorrowCut.elapsedMinutes, 1410);
assert.equal(tomorrowCut.reason, 'scene-cut');

const deadlineReference = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  previousAssistantText: '*Stardate 53049.3 | 0900 hours*\n\nThe officers wait for Sam\'s orders.',
  currentPlayerText: 'Sam says, "I expect draft reports by tomorrow morning, and completed reports as soon as reasonably possible. Understood?"'
});
assert.equal(deadlineReference.elapsedMinutes, 0);
assert.equal(deadlineReference.reason, 'deadline-reference');

const dayScaleCompression = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  previousAssistantText: 'Cross says the repair work will take time if Sam authorizes a full review.',
  currentPlayerText: 'The week took on its own rhythm. Day One, Engineering traced the EPS misalignments. Day Two, Operations rebuilt the meal-replication schedules. Day Three, the reports were ready for Sam.'
});
assert.equal(dayScaleCompression.elapsedMinutes, 3 * 24 * 60);
assert.equal(dayScaleCompression.reason, 'explicit-duration');

const durationCapabilityReference = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  previousAssistantText: 'The old escape pods could keep occupants alive for weeks if their batteries held.',
  currentPlayerText: 'Sam asks Nayar to check for residual escape-pod trails.'
});
assert.equal(durationCapabilityReference.elapsedMinutes, 0);
assert.equal(durationCapabilityReference.reason, 'no-time-advance');

const futureTravelReference = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  previousAssistantText: 'Bronn says the ship remains two weeks from the assigned station if nothing interrupts the shakedown.',
  currentPlayerText: 'Sam asks what else needs attention before arrival.'
});
assert.equal(futureTravelReference.elapsedMinutes, 0);
assert.equal(futureTravelReference.reason, 'no-time-advance');

const pastBackstoryThenCurrentCompression = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  previousAssistantText: 'Cross says she has been chasing the command-relay fault for two weeks, but the issue remains open.',
  currentPlayerText: 'The week took on its own rhythm. Day One, Engineering traced the fault. Day Two, Operations rebuilt the schedules. Day Three and Four, the replicator database corruption proved stubborn.'
});
assert.equal(pastBackstoryThenCurrentCompression.elapsedMinutes, 4 * 24 * 60);
assert.equal(pastBackstoryThenCurrentCompression.reason, 'explicit-duration');

let targetReferenceModelCalls = 0;
const targetReference = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  previousAssistantText: 'Whitaker says, "See you at dinner time."',
  currentPlayerText: 'Sam nods. "Understood."',
  generationRouter: {
    async generate(roleId, request) {
      targetReferenceModelCalls += 1;
      assert.equal(roleId, TIME_ADVANCE_ADJUDICATOR_ROLE_ID);
      assert.match(request.systemPrompt, /deadlines/);
      return {
        ok: true,
        response: {
          text: JSON.stringify({
            kind: 'directive.timeAdvanceProposal.v1',
            elapsedMinutes: 0,
            reason: 'appointment-reference',
            confidence: 0.8,
            rationale: 'The text schedules a future meeting but does not cut to it.'
          })
        }
      };
    }
  }
});
assert.equal(targetReferenceModelCalls, 1);
assert.equal(targetReference.elapsedMinutes, 0);
assert.equal(targetReference.source, 'utility-model');

const movement = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  previousAssistantText: 'Sam leaves the shuttlebay and follows Whitaker through the corridor to the ready room.',
  currentPlayerText: 'Sam steps inside and waits for the captain to begin.'
});
assert.equal(movement.elapsedMinutes, 5);
assert.equal(movement.reason, 'intra-ship-transition');

const review = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  currentPlayerText: 'Sam opens the briefing packet and reviews the department reports.'
});
assert.equal(review.elapsedMinutes, 10);
assert.equal(review.reason, 'shipboard-review');

let modelCalls = 0;
const ambiguous = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  previousAssistantText: 'After a while, the meeting begins to settle into a working rhythm.',
  currentPlayerText: 'Sam lets the staff work through the problem.',
  generationRouter: {
    async generate(roleId, request) {
      modelCalls += 1;
      assert.equal(roleId, TIME_ADVANCE_ADJUDICATOR_ROLE_ID);
      assert.match(request.prompt, /accepted source pair/);
      return {
        ok: true,
        response: {
          text: JSON.stringify({
            kind: 'directive.timeAdvanceProposal.v1',
            elapsedMinutes: 25,
            reason: 'meeting-time',
            confidence: 0.8,
            rationale: 'The scene explicitly says time passed while the staff worked.'
          })
        }
      };
    }
  }
});
assert.equal(modelCalls, 1);
assert.equal(ambiguous.elapsedMinutes, 25);
assert.equal(ambiguous.source, 'utility-model');
assert.equal(ambiguous.confidence, 0.8);

const clamped = __timeAdvanceAdjudicatorTestHooks.validatedProposal({
  campaignState,
  currentPlayerText: 'Sam talks for a while.'
}, {
  kind: 'directive.timeAdvanceProposal.v1',
  elapsedMinutes: 999,
  reason: 'routine-conversation',
  confidence: 0.95
});
assert.equal(clamped.elapsedMinutes, 20);
assert.equal(clamped.clamped, true);
assert.equal(clamped.confidence, 0.9);

const overlappingAcceptedPairBoundary = findTimeBoundaryForSourceAnchorRange({
  timeLedger: {
    entries: [{
      id: 'time-boundary-1',
      elapsedMinutes: 10080,
      sourceAnchorRange: {
        kind: 'sceneHandshakePair',
        previousAssistantHostMessageId: 'assistant-42',
        currentPlayerHostMessageId: 'player-42',
        rangeHash: 'range-a'
      }
    }]
  }
}, {
  kind: 'sceneHandshakePair',
  previousAssistantHostMessageId: 'assistant-42',
  currentPlayerHostMessageId: 'player-43',
  rangeHash: 'range-b'
});
assert.equal(overlappingAcceptedPairBoundary?.id, 'time-boundary-1');

console.log('Time advance adjudicator tests passed: zero-dialogue, cuts, transitions, review work, model fallback, and clamping');
