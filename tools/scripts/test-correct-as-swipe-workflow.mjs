import assert from 'node:assert/strict';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import { hashStableJson } from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  CORRECT_AS_SWIPE_ACTION_ID,
  CORRECT_AS_SWIPE_SETTLE_ACTION_ID,
  acceptCorrectAsSwipeSelection,
  proposeCorrectAsSwipe,
  settleCorrectAsSwipeCaseLifecycle
} from '../../src/runtime/correct-as-swipe.mjs';
import { createSourceReviewWorker } from '../../src/runtime/source-review-worker.mjs';
import {
  initializeCampaignRuntimeTracking,
  updateDirectiveResponse
} from '../../src/runtime/state-delta-gateway.mjs';
import { findOutcomeIntegrityResponse } from '../../src/runtime/outcome-integrity.mjs';

const host = createFakeDirectiveHost({
  chatNative: true,
  chatOptions: {
    chatId: 'correct-as-swipe-chat',
    entityName: 'Captain Whitaker'
  }
});

const posted = await host.chat.postAssistantMessage({
  text: 'The bridge holds position while Operations checks the freighter registry.',
  campaignId: 'campaign-correct-as-swipe',
  responseKind: 'committedOutcome',
  idempotencyKey: 'response-correct-as-swipe'
});

let state = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-correct-as-swipe', title: 'Ashes of Peace' },
  campaignChatBinding: {
    saveId: 'save-correct-as-swipe',
    chatId: 'correct-as-swipe-chat'
  },
  continuity: {
    rejectedClaims: [],
    projectionHints: [],
    factUseStats: {
      'ship.freighter.registry': {
        factId: 'ship.freighter.registry',
        selectedCount: 1
      }
    }
  },
  runtimeTracking: {
    responseLedger: [{
      id: 'response-correct-as-swipe',
      hostMessageId: posted.hostMessageId,
      outcomeId: 'outcome-correct-as-swipe',
      turnId: 'turn-correct-as-swipe',
      responseKind: 'committedOutcome',
      status: 'posted',
      coreTransactionId: 'txn-correct-as-swipe'
    }],
    ingressLedger: [],
    recoveryJournal: []
  }
});

const coreOnlyHostGenerationResponse = findOutcomeIntegrityResponse({
  runtimeTracking: {
    responseLedger: []
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      runtimeAuthority: 'coreStoreV2',
      responseLedger: [{
        id: 'directive-response:core-host-generation:host',
        hostMessageId: 'core-host-generation',
        responseKind: 'hostContinue',
        kind: 'hostContinue',
        strategy: 'injectAndContinue',
        status: 'posted'
      }]
    }
  }
}, 'core-host-generation');
assert.equal(coreOnlyHostGenerationResponse?.id, 'directive-response:core-host-generation:host');
assert.equal(coreOnlyHostGenerationResponse?.responseKind, 'hostContinue');

const diagnostics = [];
const persisted = [];
const rawSelectedText = 'RAW_SELECTED_TEXT_SHOULD_NOT_PERSIST';
const rawCandidateText = 'RAW_CANDIDATE_TEXT_SHOULD_NOT_PERSIST';
const rawLifecycleReason = 'RAW_LIFECYCLE_REASON_SHOULD_NOT_PERSIST';
function appendOrReplaceCorrectionCase(latest, responseUpdateId, correctionCase) {
  const response = latest.runtimeTracking.responseLedger.find((entry) => entry.hostMessageId === responseUpdateId);
  const currentCorrectAsSwipe = response?.correctAsSwipe || {};
  return updateDirectiveResponse(latest, responseUpdateId, {
    correctAsSwipe: {
      ...currentCorrectAsSwipe,
      cases: [
        ...(currentCorrectAsSwipe.cases || []).filter((entry) => entry?.id !== correctionCase.id),
        correctionCase
      ],
      lastCaseId: correctionCase.id,
      lastCandidateSwipe: correctionCase.candidateSwipe || currentCorrectAsSwipe.lastCandidateSwipe || null,
      lastLifecycleDecision: correctionCase.repairDecision || currentCorrectAsSwipe.lastLifecycleDecision || null
    }
  });
}
const sourceReview = createSourceReviewWorker({
  sourceReconciliationEngine: {
    async reviewCorrectAsSwipeEvidence(payload) {
      assert.equal(payload.text, rawSelectedText);
      assert.equal(payload.responseId, 'response-correct-as-swipe');
      assert.equal(payload.hostMessageId, posted.hostMessageId);
      assert.equal(payload.selectedTextHash, hashStableJson({ text: rawSelectedText }));
      return {
        kind: 'directive.sreCorrectAsSwipeEvidenceVerdict.v1',
        verdict: 'contradicted',
        checkedFactCount: 2,
        findings: [{
          kind: 'protected-fact-contradiction',
          factId: 'fact.freighter.registry',
          severity: 'blocker',
          summary: rawSelectedText
        }],
        evidenceRefIds: ['fact.freighter.registry', 'frame.turn.001'],
        reviewedAt: '2026-07-02T12:02:00.000Z',
        source: {
          responseId: 'response-correct-as-swipe',
          outcomeId: 'outcome-correct-as-swipe',
          turnId: 'turn-correct-as-swipe',
          hostMessageId: posted.hostMessageId,
          textHash: hashStableJson({ text: rawSelectedText })
        },
        providerOutputHash: 'provider-output-hash-only'
      };
    }
  },
  now: () => '2026-07-02T12:02:00.000Z'
});
const derivedEvidenceVerdict = await sourceReview.reviewCorrectAsSwipeEvidence({
  text: rawSelectedText,
  responseId: 'response-correct-as-swipe',
  outcomeId: 'outcome-correct-as-swipe',
  turnId: 'turn-correct-as-swipe',
  hostMessageId: posted.hostMessageId
});
assert.equal(derivedEvidenceVerdict.verdict, 'contradicted');
assert.deepEqual(derivedEvidenceVerdict.evidenceRefIds, ['fact.freighter.registry', 'frame.turn.001']);
assert.equal(derivedEvidenceVerdict.findings[0].summaryLength, rawSelectedText.length);
assert.equal(derivedEvidenceVerdict.findings[0].summaryHash, hashStableJson({ summary: rawSelectedText }));
assert.equal(JSON.stringify(derivedEvidenceVerdict).includes(rawSelectedText), false);

const defaultSourceReview = createSourceReviewWorker({ now: () => '2026-07-02T12:03:00.000Z' });
const fallbackVerdict = await defaultSourceReview.reviewCorrectAsSwipeEvidence({
  text: 'A selected sentence cannot be reviewed without campaign state.',
  responseId: 'response-correct-as-swipe'
});
assert.equal(fallbackVerdict.verdict, 'ambiguous');
assert.equal(fallbackVerdict.error.code, 'DIRECTIVE_SRE_CORRECT_AS_SWIPE_REVIEW_FAILED');
const unsupportedVerdict = await defaultSourceReview.reviewCorrectAsSwipeEvidence({
  text: 'A selected sentence with no matching Directive evidence.',
  responseId: 'response-correct-as-swipe',
  campaignState: { continuity: {} }
});
assert.equal(unsupportedVerdict.verdict, 'unsupported');
assert.equal(JSON.stringify(unsupportedVerdict).includes('A selected sentence with no matching Directive evidence.'), false);
const externalOnlyVerdict = await defaultSourceReview.reviewCorrectAsSwipeEvidence({
  text: rawSelectedText,
  responseId: 'response-correct-as-swipe',
  externalContextOnly: true
});
assert.equal(externalOnlyVerdict.verdict, 'external-only');
assert.equal(JSON.stringify(externalOnlyVerdict).includes(rawSelectedText), false);

const result = await proposeCorrectAsSwipe({
  campaignState: state,
  host,
  coreTurnStore: {
    async appendDiagnostics(transactionId, diagnostic) {
      diagnostics.push({ transactionId, diagnostic: JSON.parse(JSON.stringify(diagnostic)) });
      return {
        id: 'core-diagnostic-correct-as-swipe',
        status: 'recorded',
        payload: diagnostic
      };
    }
  },
  response: state.runtimeTracking.responseLedger[0],
  selection: {
    hostMessageId: posted.hostMessageId,
    selectedText: rawSelectedText,
    selectedSwipeIndex: 0
  },
  proposedText: `The bridge stays put while Operations checks the registry. ${rawCandidateText}`,
  evidenceVerdict: derivedEvidenceVerdict,
  idFactory: (prefix) => `${prefix}-fixture-1`,
  now: () => '2026-07-02T12:00:00.000Z',
  updateResponse: appendOrReplaceCorrectionCase,
  async persist(next, summary) {
    persisted.push({ summary, state: JSON.parse(JSON.stringify(next)) });
    state = next;
  }
});

assert.equal(CORRECT_AS_SWIPE_ACTION_ID, 'correctAsSwipe.propose');
assert.equal(CORRECT_AS_SWIPE_SETTLE_ACTION_ID, 'correctAsSwipe.settleCase');
assert.equal(result.ok, true);
assert.equal(result.accepted, false);
assert.equal(result.reason, 'candidate-swipe-appended');
assert.equal(result.correctionCase.status, 'candidateAppended');
assert.equal(result.correctionCase.acceptanceBoundary, 'selectedSwipeChanged');
assert.equal(result.correctionCase.continuityMutation, 'none-until-selected');
assert.equal(result.correctionCase.evidenceVerdict.verdict, 'contradicted');
assert.deepEqual(result.correctionCase.evidenceVerdict.evidenceRefIds, ['fact.freighter.registry', 'frame.turn.001']);
assert.equal(result.candidateSwipe.selected, false);
assert.equal(result.candidateSwipe.swipeIndex, 1);
assert.equal(result.candidateSwipe.swipeCount, 2);
assert.equal(result.candidateSwipe.textHash, result.correctionCase.candidate.textHash);
assert.equal(diagnostics.length, 1);
assert.equal(diagnostics[0].transactionId, 'txn-correct-as-swipe');
assert.equal(diagnostics[0].diagnostic.type, 'correctAsSwipeCandidatePrepared');
assert.equal(diagnostics[0].diagnostic.correctionCase.id, result.correctionCase.id);
assert.equal(persisted.length, 1);
assert.equal(persisted[0].summary, 'Correct-as-Swipe candidate appended.');

const message = host.chat.getMessage(posted.hostMessageId);
assert.equal(message.swipes.length, 2);
assert.equal(message.swipe_id, 0, 'Candidate correction swipe must not become selected automatically.');
assert.equal(
  message.text,
  'The bridge holds position while Operations checks the freighter registry.',
  'Visible assistant text must stay on the accepted swipe until user selection.'
);
assert.equal(message.metadata.correctAsSwipeCaseId, undefined);
assert.equal(message.metadata.swipeCount, 2);

const response = state.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-correct-as-swipe');
assert.equal(response.correctAsSwipe.lastCaseId, result.correctionCase.id);
assert.equal(response.correctAsSwipe.cases[0].candidateSwipe.selected, false);
assert.equal(response.correctAsSwipe.cases[0].candidateSwipe.swipeIndex, 1);
assert.equal(state.continuity.factUseStats['ship.freighter.registry'].selectedCount, 1);
assert.equal(state.continuity.rejectedClaims.length, 0);
assert.equal(state.continuity.projectionHints.length, 0);

const serializedCase = JSON.stringify(result.correctionCase);
const serializedState = JSON.stringify(state);
const serializedDiagnostic = JSON.stringify(diagnostics);
assert.equal(serializedCase.includes(rawSelectedText), false);
assert.equal(serializedCase.includes(rawCandidateText), false);
assert.equal(serializedState.includes(rawSelectedText), false);
assert.equal(serializedState.includes(rawCandidateText), false);
assert.equal(serializedDiagnostic.includes(rawSelectedText), false);
assert.equal(serializedDiagnostic.includes(rawCandidateText), false);

const duplicate = await proposeCorrectAsSwipe({
  campaignState: state,
  host,
  response: state.runtimeTracking.responseLedger[0],
  selection: {
    hostMessageId: posted.hostMessageId,
    selectedText: rawSelectedText
  },
  proposedText: `The bridge stays put while Operations checks the registry. ${rawCandidateText}`,
  evidenceVerdict: {
    verdict: 'contradicted',
    evidenceRefIds: ['fact.freighter.registry']
  },
  idFactory: (prefix) => `${prefix}-fixture-duplicate`,
  now: () => '2026-07-02T12:01:00.000Z'
});
assert.equal(duplicate.ok, true);
assert.equal(duplicate.candidateSwipe.duplicate, true);
assert.equal(host.chat.getMessage(posted.hostMessageId).swipes.length, 2);
assert.equal(host.chat.getMessage(posted.hostMessageId).swipe_id, 0);

const lifecycle = await settleCorrectAsSwipeCaseLifecycle({
  campaignState: state,
  coreTurnStore: {
    async appendDiagnostics(transactionId, diagnostic) {
      diagnostics.push({ transactionId, diagnostic: JSON.parse(JSON.stringify(diagnostic)) });
      return {
        id: 'core-diagnostic-correct-as-swipe-lifecycle',
        status: 'recorded',
        payload: diagnostic
      };
    }
  },
  response: state.runtimeTracking.responseLedger[0],
  caseId: result.correctionCase.id,
  action: 'rejectCorrectionCase',
  reason: rawLifecycleReason,
  now: () => '2026-07-02T12:04:00.000Z',
  updateResponse: appendOrReplaceCorrectionCase,
  async persist(next, summary) {
    persisted.push({ summary, state: JSON.parse(JSON.stringify(next)) });
    state = next;
  }
});
assert.equal(lifecycle.ok, true);
assert.equal(lifecycle.accepted, false);
assert.equal(lifecycle.correctionCase.status, 'rejected');
assert.deepEqual(lifecycle.correctionCase.allowedActions, []);
assert.equal(lifecycle.repairDecision.kind, 'directive.repairCorrectAsSwipeLifecycleDecision.v1');
assert.equal(lifecycle.repairDecision.status, 'approved');
assert.equal(lifecycle.repairDecision.statusAfter, 'rejected');
assert.equal(lifecycle.repairDecision.reasonLength, rawLifecycleReason.length);
assert.equal(lifecycle.repairDecision.reasonHash, hashStableJson({ reason: rawLifecycleReason }));
assert.equal(lifecycle.correctionCase.lifecycle[0].reasonHash, hashStableJson({ reason: rawLifecycleReason }));
assert.equal(diagnostics.at(-1).diagnostic.type, 'correctAsSwipeCaseLifecycle');
assert.equal(diagnostics.at(-1).diagnostic.repairDecision.reasonHash, hashStableJson({ reason: rawLifecycleReason }));
assert.equal(persisted.at(-1).summary, 'Correct-as-Swipe case rejected.');
assert.equal(host.chat.getMessage(posted.hostMessageId).swipe_id, 0);
assert.equal(state.continuity.factUseStats['ship.freighter.registry'].selectedCount, 1);
assert.equal(state.continuity.rejectedClaims.length, 0);
assert.equal(state.continuity.projectionHints.length, 0);
const serializedLifecycle = JSON.stringify(lifecycle);
const serializedPostLifecycleState = JSON.stringify(state);
const serializedPostLifecycleDiagnostic = JSON.stringify(diagnostics.at(-1));
assert.equal(serializedLifecycle.includes(rawSelectedText), false);
assert.equal(serializedLifecycle.includes(rawCandidateText), false);
assert.equal(serializedLifecycle.includes(rawLifecycleReason), false);
assert.equal(serializedPostLifecycleState.includes(rawLifecycleReason), false);
assert.equal(serializedPostLifecycleDiagnostic.includes(rawLifecycleReason), false);

let acceptedState = result.campaignState;
const acceptance = await acceptCorrectAsSwipeSelection({
  campaignState: acceptedState,
  response: acceptedState.runtimeTracking.responseLedger[0],
  selectedSwipe: {
    selectedSwipeIndex: 1,
    swipeCount: 2,
    selectedAssistantVariantHash: result.correctionCase.candidate.textHash
  },
  message: {
    id: posted.hostMessageId,
    raw: {
      swipe_id: 1,
      swipes: [
        'The bridge holds position while Operations checks the freighter registry.',
        `The bridge stays put while Operations checks the registry. ${rawCandidateText}`
      ]
    }
  },
  now: () => '2026-07-02T12:05:00.000Z',
  updateResponse: appendOrReplaceCorrectionCase,
  async persist(next) {
    acceptedState = next;
  }
});
assert.equal(acceptance.matched, true);
assert.equal(acceptance.action, 'correctAsSwipeCandidateAccepted');
assert.equal(acceptance.correctionCase.status, 'accepted');
assert.equal(acceptance.correctionCase.candidateSwipe.selected, true);
assert.equal(acceptance.correctionCase.acceptedSelection.selectedSwipeIndex, 1);
assert.equal(acceptance.correctionCase.acceptedSelection.selectedTextHash, result.correctionCase.candidate.textHash);
assert.equal(JSON.stringify(acceptance).includes(rawCandidateText), false);
assert.equal(JSON.stringify(acceptedState).includes(rawCandidateText), false);

console.log('Correct-as-Swipe workflow tests passed.');
