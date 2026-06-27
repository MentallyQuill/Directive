import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  adjudicateTimeAdvance,
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

const dinnerCut = await adjudicateTimeAdvance({
  campaignState,
  acceptedPreviousResponse: true,
  currentPlayerText: 'Cut to dinner time scene.'
});
assert.equal(dinnerCut.elapsedMinutes, 570);
assert.equal(dinnerCut.reason, 'scene-cut');

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

console.log('Time advance adjudicator tests passed: zero-dialogue, cuts, transitions, review work, model fallback, and clamping');
