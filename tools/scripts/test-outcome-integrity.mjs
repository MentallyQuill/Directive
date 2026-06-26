import assert from 'node:assert/strict';

import {
  OUTCOME_INTEGRITY_REVIEW_TIMEOUT_MS,
  buildOutcomeIntegrityEditContext,
  composeOutcomeIntegrityReviewRequest,
  normalizeOutcomeIntegritySettings,
  outcomeIntegrityFailureSummary,
  outcomeIntegrityStatusForMessage,
  outcomeIntegrityTextHash,
  reviewOutcomeIntegrityEdit,
  validateOutcomeIntegrityProposedEdit
} from '../../src/runtime/outcome-integrity.mjs';

const campaignState = {
  campaign: { id: 'campaign.test' },
  settings: {},
  commandLog: {
    entries: [{
      sourceOutcomeId: 'outcome.1',
      summaryInputs: ['The captain ordered a risky docking approach.'],
      visibleConsequences: ['The ship took hull stress.']
    }]
  },
  turnLedger: {
    entries: [{
      turnId: 'turn.1',
      outcomeId: 'outcome.1',
      resultBand: 'mixed',
      stateDelta: {
        commandBearing: {
          earnedRecordsAdd: [{ id: 'mark.1' }]
        },
        relationships: {
          descriptiveChanges: [{ crewId: 'xo', summary: 'Trust improved.' }]
        }
      }
    }]
  },
  runtimeTracking: {
    responseLedger: [{
      id: 'response.1',
      hostMessageId: '42',
      outcomeId: 'outcome.1',
      turnId: 'turn.1',
      responseKind: 'committedOutcome',
      status: 'posted'
    }]
  }
};

const message = {
  hostMessageId: '42',
  text: 'The ship shudders through the risky docking approach, but the crew keeps her steady.',
  isUser: false,
  isDirectiveOwned: true,
  metadata: {
    responseKind: 'committedOutcome'
  }
};

assert.deepEqual(normalizeOutcomeIntegritySettings({}), {
  mode: 'strict',
  reviewProviderKind: 'utility'
});

const status = outcomeIntegrityStatusForMessage({ campaignState, message });
assert.equal(status.protected, true);
assert.equal(status.nativeEdit, 'intercept');
assert.equal(status.reviewProviderKind, 'utility');

const playerStatus = outcomeIntegrityStatusForMessage({
  campaignState,
  message: { ...message, isUser: true }
});
assert.equal(playerStatus.protected, false);
assert.equal(playerStatus.reason, 'player-message');

const context = buildOutcomeIntegrityEditContext({ campaignState, message });
assert.equal(context.ok, true);
assert.equal(context.baseTextHash, outcomeIntegrityTextHash(message.text));
assert.equal(context.lockedContext.commandBearing.changed, true);
assert.equal(context.lockedContext.relationshipChangeCount, 1);

const stale = validateOutcomeIntegrityProposedEdit({
  context,
  proposedText: 'Shorter prose.',
  currentText: 'Someone already changed this selected message.',
  baseTextHash: context.baseTextHash
});
assert.equal(stale.ok, false);
assert.equal(stale.reason, 'stale-base');

const longEdit = validateOutcomeIntegrityProposedEdit({
  context,
  proposedText: 'x'.repeat(10001)
});
assert.equal(longEdit.ok, false);
assert.equal(longEdit.reason, 'edit-too-long');

const calls = [];
const accepted = await reviewOutcomeIntegrityEdit({
  context: {
    ...context,
    reviewProviderKind: 'reasoning'
  },
  proposedText: 'The docking scene is shorter, but still risky and damaging.',
  providerKind: 'reasoning',
  generationRouter: {
    async generate(roleId, request, options) {
      calls.push({ roleId, request, options });
      return {
        ok: true,
        response: {
          text: JSON.stringify({
            schema: 'directive.outcomeIntegrityReview.v1',
            verdict: 'accept',
            categories: [],
            reason: 'The edit keeps the same committed docking result.',
            safeSummary: 'Prose only.'
          })
        },
        role: { providerKind: options.providerKind }
      };
    }
  }
});
assert.equal(accepted.accepted, true);
assert.equal(calls[0].roleId, 'outcomeIntegrityReview');
assert.equal(calls[0].options.providerKind, 'reasoning');
assert.equal(calls[0].options.timeoutMs, OUTCOME_INTEGRITY_REVIEW_TIMEOUT_MS.reasoning);
assert.ok(calls[0].options.timeoutMs > OUTCOME_INTEGRITY_REVIEW_TIMEOUT_MS.utility);

const headerFreeReviewRequest = composeOutcomeIntegrityReviewRequest({
  context: {
    ...context,
    currentText: `*Stardate 53049.2 | 0830 hours*\n\n${context.currentText}`
  },
  proposedText: '*Stardate 53049.2 | 0840 hours*\n\nThe docking scene is shorter, but still risky and damaging.'
});
assert.equal(headerFreeReviewRequest.prompt.includes('*Stardate'), false);
assert.match(headerFreeReviewRequest.prompt, /The docking scene is shorter/);

const rejectedSummary = outcomeIntegrityFailureSummary({
  categories: ['command_bearing_change'],
  reason: 'The edit claims Command Bearing was not earned.'
});
assert.match(rejectedSummary, /Command Bearing/);

console.log('Outcome Integrity tests passed: defaults, scope, deterministic guards, review routing, and feedback summaries');
