import assert from 'node:assert/strict';

import { createMessageReconciler } from '../../src/runtime/message-reconciler.mjs';
import { hashStableJson } from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  commitTrackedCampaignState,
  initializeCampaignRuntimeTracking,
  recordDirectiveResponse,
  recordTurnIngress,
  updateDirectiveResponse,
  updateTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
let nowIndex = 0;
const now = () => `2026-06-22T03:00:${String(nowIndex++).padStart(2, '0')}.000Z`;
let campaignState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-recovery-test', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  mission: { activePhaseId: 'phase-before', knownFacts: [] },
  commandLog: { entries: [] }
});

campaignState = recordTurnIngress(campaignState, {
  id: 'ingress-uncommitted',
  hostMessageId: 'player-uncommitted',
  status: 'classified',
  textHash: 'hash-uncommitted',
  sourceFrameId: 'frame-uncommitted',
  coreTransactionId: 'txn-uncommitted'
});
campaignState = recordTurnIngress(campaignState, {
  id: 'ingress-uncommitted-delete',
  hostMessageId: 'player-uncommitted-delete',
  status: 'classified',
  textHash: 'hash-uncommitted-delete',
  sourceFrameId: 'frame-uncommitted-delete',
  coreTransactionId: 'txn-uncommitted-delete'
});
campaignState = recordTurnIngress(campaignState, {
  id: 'ingress-committed',
  hostMessageId: 'player-committed',
  status: 'classified',
  textHash: 'hash-committed',
  sourceFrameId: 'frame-committed',
  coreTransactionId: 'txn-committed'
});

const beforeOutcomeRevision = campaignState.runtimeTracking.revision;
const afterOutcomeCandidate = cloneJson(campaignState);
afterOutcomeCandidate.mission.activePhaseId = 'phase-after';
afterOutcomeCandidate.mission.knownFacts.push({ id: 'fact-after', summary: 'A committed fact.' });
afterOutcomeCandidate.commandLog.entries.push({ id: 'log-after', outcomeId: 'outcome-committed' });
campaignState = commitTrackedCampaignState({
  campaignState,
  nextCampaignState: afterOutcomeCandidate,
  delta: {
    source: 'missionDirector',
    reason: 'Committed test outcome.',
    domains: ['mission', 'commandLog'],
    ingressId: 'ingress-committed',
    outcomeId: 'outcome-committed',
    stable: true
  },
  now
});
campaignState = updateTurnIngress(campaignState, 'ingress-committed', {
  status: 'committed',
  outcomeId: 'outcome-committed'
});
campaignState = recordDirectiveResponse(campaignState, {
  id: 'response-committed',
  ingressId: 'ingress-committed',
  turnId: 'turn-committed',
  outcomeId: 'outcome-committed',
  hostMessageId: 'assistant-committed',
  strategy: 'directivePosted',
  responseKind: 'committedOutcome',
  status: 'posted',
  sourceFrameId: 'frame-committed',
  coreTransactionId: 'txn-committed'
});
campaignState = recordDirectiveResponse(campaignState, {
  id: 'response-committed-delete',
  ingressId: 'ingress-committed',
  turnId: 'turn-committed',
  outcomeId: 'outcome-committed',
  hostMessageId: 'assistant-committed-delete',
  strategy: 'directivePosted',
  responseKind: 'committedOutcome',
  status: 'posted',
  sourceFrameId: 'frame-committed',
  coreTransactionId: 'txn-committed'
});
campaignState = recordDirectiveResponse(campaignState, {
  id: 'response-correct-as-swipe-accept',
  ingressId: 'ingress-committed',
  turnId: 'turn-committed',
  outcomeId: 'outcome-committed',
  hostMessageId: 'assistant-correct-as-swipe-accept',
  strategy: 'directivePosted',
  responseKind: 'committedOutcome',
  status: 'posted',
  sourceFrameId: 'frame-committed',
  coreTransactionId: 'txn-committed'
});
const correctAsSwipeCandidateTextHash = hashStableJson({ text: 'RAW_CORRECT_AS_SWIPE_ACCEPTED_TEXT_MUST_NOT_PERSIST' });
campaignState = updateDirectiveResponse(campaignState, 'response-correct-as-swipe-accept', {
  correctAsSwipe: {
    cases: [{
      kind: 'directive.correctAsSwipe.case.v1',
      id: 'correct-as-swipe-case-accept',
      status: 'candidateAppended',
      responseId: 'response-correct-as-swipe-accept',
      source: {
        hostMessageId: 'assistant-correct-as-swipe-accept',
        selectedSwipeIndex: 0,
        selectedTextHash: 'original-swipe-hash'
      },
      evidenceVerdict: {
        verdict: 'contradicted',
        evidenceHash: 'correct-as-swipe-evidence-hash'
      },
      candidate: {
        textHash: correctAsSwipeCandidateTextHash,
        textLength: 'RAW_CORRECT_AS_SWIPE_ACCEPTED_TEXT_MUST_NOT_PERSIST'.length
      },
      candidateSwipe: {
        kind: 'directive.correctAsSwipe.candidateSwipe.v1',
        caseId: 'correct-as-swipe-case-accept',
        hostMessageId: 'assistant-correct-as-swipe-accept',
        swipeIndex: 1,
        swipeCount: 2,
        selected: false,
        textHash: correctAsSwipeCandidateTextHash
      },
      allowedActions: ['rejectCorrectionCase', 'expireCorrectionCase'],
      acceptanceBoundary: 'selectedSwipeChanged',
      continuityMutation: 'none-until-selected',
      createdAt: '2026-06-22T02:59:00.000Z',
      updatedAt: '2026-06-22T02:59:00.000Z'
    }],
    lastCaseId: 'correct-as-swipe-case-accept'
  }
});

const persisted = [];
const promptSyncs = [];
const coreRecoveries = [];
const coreDiagnostics = [];
const coreRollbacks = [];
const recoveryTrace = [];
const coreTurnStore = {
  async markRecoveryRequired(transactionId, recoveryBundle = {}) {
    coreRecoveries.push({ transactionId, bundle: cloneJson(recoveryBundle) });
    return {
      id: recoveryBundle.id || `recovery:${transactionId}`,
      status: recoveryBundle.status || 'required',
      phase: recoveryBundle.phaseAfter || recoveryBundle.phase || 'recoveryRequired',
      reason: recoveryBundle.reason || null
    };
  },
  async appendDiagnostics(transactionId, diagnosticsEvent = {}) {
    coreDiagnostics.push({ transactionId, event: cloneJson(diagnosticsEvent) });
    return {
      id: diagnosticsEvent.id || `diagnostic:${transactionId}:${coreDiagnostics.length}`,
      type: diagnosticsEvent.type || 'diagnostic'
    };
  },
  async recordRollbackActuation(transactionId, rollback = {}) {
    recoveryTrace.push('rollback-recorded');
    coreRollbacks.push({ transactionId, rollback: cloneJson(rollback) });
    return {
      id: rollback.id || `rollback:${transactionId}:${coreRollbacks.length}`,
      status: 'recorded',
      rollback
    };
  }
};
const reconciler = createMessageReconciler({
  getCampaignState: () => campaignState,
  setCampaignState: (next) => {
    if (
      next?.mission?.activePhaseId === 'phase-before'
      && !(next?.mission?.knownFacts || []).some((entry) => entry.id === 'fact-after')
    ) {
      recoveryTrace.push('set-restored-state');
    }
    campaignState = cloneJson(next);
  },
  coreTurnStore,
  persist: async (state, summary) => persisted.push({ summary, state: cloneJson(state) }),
  syncPrompt: async (state) => {
    const next = cloneJson(state);
    next.campaignChatBinding.promptContextRevision += 1;
    promptSyncs.push(next.campaignChatBinding.promptContextRevision);
    return next;
  },
  now
});

const uncommittedEdit = await reconciler.reconcileEdited({
  hostMessageId: 'player-uncommitted',
  replacementText: 'A revised but not yet committed message.'
});
assert.equal(uncommittedEdit.matched, true);
assert.equal(uncommittedEdit.action, 'invalidated');
assert.equal(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted').status, 'invalidated');
assert.equal(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted').replacementText, 'A revised but not yet committed message.');
assert.match(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted').editedAt, /^2026-06-22T03:00:/);
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'playerMessageEdited' && entry.status === 'invalidated' && entry.outcomeId === null), false, 'CORE-backed no-outcome player edits must not write old recoveryJournal rows.');
assert.equal(coreRecoveries.at(-1).transactionId, 'txn-uncommitted');
assert.equal(coreRecoveries.at(-1).bundle.reason, 'playerMessageEdited');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.action, 'invalidateProjection');
assert.equal(JSON.stringify(coreRecoveries.at(-1).bundle).includes('A revised but not yet committed message.'), false);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 2);

const uncommittedDelete = await reconciler.reconcileDeleted({
  hostMessageId: 'player-uncommitted-delete'
});
assert.equal(uncommittedDelete.matched, true);
assert.equal(uncommittedDelete.action, 'invalidated');
assert.equal(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted-delete').status, 'invalidated');
assert.match(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted-delete').deletedAt, /^2026-06-22T03:00:/);
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'playerMessageDeleted' && entry.status === 'invalidated' && entry.outcomeId === null), false, 'CORE-backed no-outcome player deletes must not write old recoveryJournal rows.');
assert.equal(coreRecoveries.at(-1).transactionId, 'txn-uncommitted-delete');
assert.equal(coreRecoveries.at(-1).bundle.reason, 'playerMessageDeleted');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.action, 'invalidateProjection');
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 3);

const committedEdit = await reconciler.reconcileEdited({
  hostMessageId: 'player-committed',
  replacementText: 'A materially changed committed order.',
  autoRollback: false
});
assert.equal(committedEdit.matched, true);
assert.equal(committedEdit.action, 'reviewRequired');
assert.equal(committedEdit.preOutcomeRevision, beforeOutcomeRevision);
assert.equal(campaignState.mission.activePhaseId, 'phase-after');
assert.equal(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-committed').status, 'recoveryRequired');
assert.equal(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-committed').replacementText, 'A materially changed committed order.');
assert.match(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-committed').editedAt, /^2026-06-22T03:00:/);
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'playerMessageEdited' && entry.status === 'reviewRequired'), false, 'CORE-recorded committed player edits must not write old recoveryJournal rows.');
assert.equal(coreRecoveries.at(-1).transactionId, 'txn-committed');
assert.equal(coreRecoveries.at(-1).bundle.reason, 'playerMessageEdited');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.action, 'reviewRequired');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.normalTurnAllowed, false);
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.sourceKind, 'playerIngress');
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.replacementTextHash.length, 64);
assert.equal(JSON.stringify(coreRecoveries.at(-1).bundle).includes('A materially changed committed order.'), false);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 4);

const committedResponseEdit = await reconciler.reconcileEdited({
  hostMessageId: 'assistant-committed',
  replacementText: 'A materially changed Directive response.',
  autoRollback: false
});
assert.equal(committedResponseEdit.matched, true);
assert.equal(committedResponseEdit.action, 'reviewRequired');
assert.equal(committedResponseEdit.preOutcomeRevision, beforeOutcomeRevision);
const responseEntry = campaignState.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-committed');
assert.equal(responseEntry.status, 'recoveryRequired');
assert.equal(responseEntry.replacementText, 'A materially changed Directive response.');
assert.match(responseEntry.editedAt, /^2026-06-22T03:00:/);
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'directiveResponseEdited' && entry.status === 'reviewRequired'), false, 'CORE-recorded committed response edits must not write old recoveryJournal rows.');
assert.equal(coreRecoveries.at(-1).transactionId, 'txn-committed');
assert.equal(coreRecoveries.at(-1).bundle.reason, 'directiveResponseEdited');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.sourceKind, 'directiveResponse');
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.sourceKind, 'directiveResponse');
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.responseId, 'response-committed');
assert.equal(JSON.stringify(coreRecoveries.at(-1).bundle).includes('A materially changed Directive response.'), false);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 5);

const committedResponseDelete = await reconciler.reconcileDeleted({
  hostMessageId: 'assistant-committed-delete',
  autoRollback: false
});
assert.equal(committedResponseDelete.matched, true);
assert.equal(committedResponseDelete.action, 'reviewRequired');
assert.equal(committedResponseDelete.preOutcomeRevision, beforeOutcomeRevision);
const deletedResponseEntry = campaignState.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-committed-delete');
assert.equal(deletedResponseEntry.status, 'recoveryRequired');
assert.match(deletedResponseEntry.deletedAt, /^2026-06-22T03:00:/);
assert.equal(deletedResponseEntry.invalidationType, 'directiveResponseDeleted');
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'directiveResponseDeleted' && entry.status === 'reviewRequired'), false, 'CORE-recorded committed response deletes must not write old recoveryJournal rows.');
assert.equal(coreRecoveries.at(-1).bundle.reason, 'directiveResponseDeleted');
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.replacementTextHash, null);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 6);

const correctAsSwipeRecoveryCountBefore = coreRecoveries.length;
const correctAsSwipePromptRevisionBefore = campaignState.campaignChatBinding.promptContextRevision;
const correctAsSwipeAccept = await reconciler.reconcileSelectedSwipeChanged({
  hostMessageId: 'assistant-correct-as-swipe-accept',
  selectedSwipe: {
    selectedSwipeIndex: 1,
    swipeCount: 2,
    selectedAssistantVariantHash: correctAsSwipeCandidateTextHash
  },
  message: {
    id: 'assistant-correct-as-swipe-accept',
    is_user: false,
    raw: {
      swipe_id: 1,
      swipes: [
        'RAW_ORIGINAL_CORRECT_AS_SWIPE_TEXT_MUST_NOT_PERSIST',
        'RAW_CORRECT_AS_SWIPE_ACCEPTED_TEXT_MUST_NOT_PERSIST'
      ]
    }
  },
  autoRollback: false
});
assert.equal(correctAsSwipeAccept.matched, true);
assert.equal(correctAsSwipeAccept.action, 'correctAsSwipeCandidateAccepted');
assert.equal(coreRecoveries.length, correctAsSwipeRecoveryCountBefore, 'Correct-as-Swipe candidate acceptance must not enter generic REPAIR recovery.');
assert.equal(campaignState.campaignChatBinding.promptContextRevision, correctAsSwipePromptRevisionBefore);
const acceptedCorrectAsSwipeResponse = campaignState.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-correct-as-swipe-accept');
assert.equal(acceptedCorrectAsSwipeResponse.status, 'posted');
assert.equal(acceptedCorrectAsSwipeResponse.invalidationType, null);
assert.equal(acceptedCorrectAsSwipeResponse.correctAsSwipe.selectedCaseId, 'correct-as-swipe-case-accept');
assert.equal(acceptedCorrectAsSwipeResponse.correctAsSwipe.lastAcceptedCaseId, 'correct-as-swipe-case-accept');
assert.equal(acceptedCorrectAsSwipeResponse.correctAsSwipe.cases[0].status, 'accepted');
assert.equal(acceptedCorrectAsSwipeResponse.correctAsSwipe.cases[0].candidateSwipe.selected, true);
assert.equal(acceptedCorrectAsSwipeResponse.correctAsSwipe.cases[0].acceptedSelection.selectedSwipeIndex, 1);
assert.equal(acceptedCorrectAsSwipeResponse.correctAsSwipe.cases[0].acceptedSelection.selectedTextHash, correctAsSwipeCandidateTextHash);
assert.equal(JSON.stringify(acceptedCorrectAsSwipeResponse).includes('RAW_CORRECT_AS_SWIPE_ACCEPTED_TEXT_MUST_NOT_PERSIST'), false);
assert.equal(JSON.stringify(campaignState.runtimeTracking.recoveryJournal).includes('RAW_CORRECT_AS_SWIPE_ACCEPTED_TEXT_MUST_NOT_PERSIST'), false);

const selectedSwipeChange = await reconciler.reconcileSelectedSwipeChanged({
  hostMessageId: 'assistant-committed',
  selectedSwipe: {
    selectedSwipeIndex: 1,
    swipeCount: 3,
    selectedAssistantVariantHash: 'selected-swipe-hash-64'
  },
  message: {
    id: 'assistant-committed',
    is_user: false,
    raw: {
      swipe_id: 1,
      swipes: [
        'RAW_DISCARDED_SWIPE_TEXT_MUST_NOT_PERSIST',
        'RAW_SELECTED_SWIPE_TEXT_MUST_NOT_PERSIST',
        'RAW_OTHER_SWIPE_TEXT_MUST_NOT_PERSIST'
      ]
    }
  },
  autoRollback: false
});
assert.equal(selectedSwipeChange.matched, true);
assert.equal(selectedSwipeChange.action, 'reviewRequired');
const swipedResponseEntry = campaignState.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-committed');
assert.equal(swipedResponseEntry.status, 'recoveryRequired');
assert.equal(swipedResponseEntry.invalidationType, 'directiveResponseSelectedSwipeChanged');
assert.match(swipedResponseEntry.selectedSwipeChangedAt, /^2026-06-22T03:00:/);
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'directiveResponseSelectedSwipeChanged' && entry.status === 'reviewRequired'), false, 'CORE-recorded selected-swipe source mutations must not write old recoveryJournal rows.');
assert.equal(coreRecoveries.at(-1).transactionId, 'txn-committed');
assert.equal(coreRecoveries.at(-1).bundle.reason, 'directiveResponseSelectedSwipeChanged');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.normalTurnAllowed, false);
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.sourceKind, 'directiveResponse');
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.responseId, 'response-committed');
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.replacementTextHash, null);
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.selectedSwipe.selectedSwipeIndex, 1);
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.selectedSwipe.swipeCount, 3);
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.selectedSwipe.selectedTextHash, 'selected-swipe-hash-64');
assert.equal(JSON.stringify(coreRecoveries.at(-1).bundle).includes('RAW_SELECTED_SWIPE_TEXT_MUST_NOT_PERSIST'), false);
assert.equal(JSON.stringify(campaignState.runtimeTracking.recoveryJournal).includes('RAW_SELECTED_SWIPE_TEXT_MUST_NOT_PERSIST'), false);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 7);

const visibilityOnlyIngressBefore = cloneJson(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-committed'));
const persistedBeforeVisibility = persisted.length;
const promptSyncsBeforeVisibility = promptSyncs.length;
const recoveryJournalBeforeVisibility = campaignState.runtimeTracking.recoveryJournal.length;
const coreRecoveriesBeforeVisibility = coreRecoveries.length;
const coreDiagnosticsBeforeVisibility = coreDiagnostics.length;
const visibilityOnly = await reconciler.reconcileVisibilityChanged({
  hostMessageId: 'player-committed',
  message: {
    id: 'player-committed',
    is_user: true,
    extra: {
      sc_ghosted: true,
      vectfox: { promptExcluded: true }
    }
  },
  index: 42,
  chatMetadata: {
    STMemoryBooks: { unhiddenIndices: [42] },
    summaryception: { ghostedIndices: [42] },
    vectFox: { promptExcludedIndices: [42] }
  }
});
assert.equal(visibilityOnly.matched, true);
assert.equal(visibilityOnly.action, 'visibilityOnlySourceRow');
assert.equal(visibilityOnly.coreVisibility.status, 'recorded');
assert.equal(visibilityOnly.coreVisibility.decision.action, 'visibilityOnlySourceRow');
assert.equal(visibilityOnly.coreVisibility.decision.normalTurnAllowed, false);
assert.equal(visibilityOnly.coreVisibility.decision.recoveryRequired, false);
assert.equal(visibilityOnly.visibility.ghostedBySummaryception, true);
assert.equal(visibilityOnly.visibility.promptExcludedByVectFox, true);
assert.equal(visibilityOnly.visibility.unhiddenByMemoryBooks, true);
const visibilityOnlyIngressAfter = campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-committed');
assert.deepEqual(visibilityOnlyIngressAfter, visibilityOnlyIngressBefore, 'Visibility-only observations must not mutate the ingress ledger.');
assert.equal(campaignState.runtimeTracking.recoveryJournal.length, recoveryJournalBeforeVisibility, 'Visibility-only observations must not create legacy recovery journal entries.');
assert.equal(coreRecoveries.length, coreRecoveriesBeforeVisibility, 'Visibility-only observations must not create CORE recovery cases.');
assert.equal(coreDiagnostics.length, coreDiagnosticsBeforeVisibility + 1, 'Visibility-only observations should append one CORE diagnostic.');
assert.equal(coreDiagnostics.at(-1).event.type, 'sourceVisibilityMutation');
assert.equal(coreDiagnostics.at(-1).event.decision.action, 'visibilityOnlySourceRow');
assert.equal(persisted.length, persistedBeforeVisibility, 'Visibility-only observations must not persist the campaign save.');
assert.equal(promptSyncs.length, promptSyncsBeforeVisibility, 'Visibility-only observations must not synchronize prompt context.');

const summarizedOnly = await reconciler.reconcileVisibilityChanged({
  hostMessageId: 'player-committed',
  message: {
    id: 'player-committed',
    is_user: true
  },
  index: 41,
  chatMetadata: {
    summaryception: { summarizedUpTo: 41 }
  }
});
assert.equal(summarizedOnly.matched, false);
assert.equal(summarizedOnly.action, 'sourceRowContinues');
assert.equal(summarizedOnly.visibility.summarizedBySummaryception, true);
assert.equal(coreDiagnostics.length, coreDiagnosticsBeforeVisibility + 1, 'Summarized-only rows should not append visibility diagnostics.');

const historyOnlyRollbackBefore = cloneJson(campaignState);
const coreRollbacksBeforeHistoryOnlyRollback = coreRollbacks.length;
const promptSyncsBeforeHistoryOnlyRollback = promptSyncs.length;
const persistedBeforeHistoryOnlyRollback = persisted.length;
const rolledBack = await reconciler.reconcileDeleted({
  hostMessageId: 'player-committed',
  autoRollback: true
});
assert.equal(rolledBack.matched, true);
assert.equal(rolledBack.action, 'rollbackBlocked');
assert.equal(rolledBack.preOutcomeRevision, beforeOutcomeRevision);
assert.deepEqual(campaignState, historyOnlyRollbackBefore, 'History-only rollback must not mutate old recovery ledgers or restore old snapshots.');
assert.equal(campaignState.runtimeTracking.revision, historyOnlyRollbackBefore.runtimeTracking.revision);
assert.equal(campaignState.mission.activePhaseId, 'phase-after');
assert.equal(campaignState.mission.knownFacts.some((entry) => entry.id === 'fact-after'), true);
assert.equal(campaignState.commandLog.entries.some((entry) => entry.id === 'log-after'), true);
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'restoreRevision'), false);
assert.equal(coreRollbacks.length, coreRollbacksBeforeHistoryOnlyRollback, 'History-only rollback must not record CORE rollback actuation.');
assert.equal(recoveryTrace.includes('rollback-recorded'), false);
assert.equal(recoveryTrace.includes('set-restored-state'), false);
assert.equal(coreRecoveries.at(-1).bundle.reason, 'playerMessageDeleted');
assert.deepEqual(coreRecoveries.at(-1).bundle.allowedActions, ['rollbackToPreOutcomeRevision', 'reviewSourceMutation']);
assert.equal(JSON.stringify(coreRecoveries).includes('A materially changed'), false, 'CORE recovery bundles must not store raw replacement text.');
assert.equal(coreRecoveries.length, 7);
assert.equal(promptSyncs.length, promptSyncsBeforeHistoryOnlyRollback, 'Prompt sync must not run when history-only rollback is blocked.');
assert.equal(persisted.length, persistedBeforeHistoryOnlyRollback, 'Persist must not run when history-only rollback is blocked.');

let checkpointRollbackState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-checkpoint-rollback', status: 'active' },
  campaignChatBinding: { campaignId: 'campaign-checkpoint-rollback', saveId: 'save-checkpoint-rollback', chatId: 'campaign-chat', promptContextRevision: 1 },
  mission: { activePhaseId: 'phase-before-checkpoint', knownFacts: [] },
  commandLog: { entries: [] }
});
checkpointRollbackState = recordTurnIngress(checkpointRollbackState, {
  id: 'ingress-checkpoint-rollback',
  hostMessageId: 'player-checkpoint-rollback',
  status: 'classified',
  textHash: 'hash-checkpoint-rollback',
  sourceFrameId: 'frame-checkpoint-rollback',
  coreTransactionId: 'txn-checkpoint-rollback'
});
const checkpointRollbackRevision = checkpointRollbackState.runtimeTracking.revision;
const checkpointRollbackSnapshot = cloneJson(checkpointRollbackState);
const checkpointRollbackCandidate = cloneJson(checkpointRollbackState);
checkpointRollbackCandidate.mission.activePhaseId = 'phase-after-checkpoint';
checkpointRollbackCandidate.mission.knownFacts.push({ id: 'fact-after-checkpoint', summary: 'A checkpoint-backed fact.' });
checkpointRollbackCandidate.commandLog.entries.push({ id: 'log-after-checkpoint', outcomeId: 'outcome-checkpoint-rollback' });
checkpointRollbackState = commitTrackedCampaignState({
  campaignState: checkpointRollbackState,
  nextCampaignState: checkpointRollbackCandidate,
  delta: {
    source: 'missionDirector',
    reason: 'Committed checkpoint rollback test outcome.',
    domains: ['mission', 'commandLog'],
    ingressId: 'ingress-checkpoint-rollback',
    outcomeId: 'outcome-checkpoint-rollback',
    stable: true
  },
  now
});
checkpointRollbackState = updateTurnIngress(checkpointRollbackState, 'ingress-checkpoint-rollback', {
  status: 'committed',
  outcomeId: 'outcome-checkpoint-rollback'
});
checkpointRollbackState.turnLedger = {
  entries: [{
    ingressId: 'ingress-checkpoint-rollback',
    outcomeId: 'outcome-checkpoint-rollback',
    turnId: 'turn-checkpoint-rollback',
    coreTransactionId: 'txn-checkpoint-rollback',
    snapshotBeforeRetained: true,
    coreCheckpointRef: {
      kind: 'directive.coreMechanicsCheckpointRef.v1',
      campaignId: 'campaign-checkpoint-rollback',
      saveId: 'save-checkpoint-rollback',
      checkpointId: 'checkpoint-checkpoint-rollback',
      layout: 'core'
    }
  }]
};
const checkpointRollbackPersisted = [];
const checkpointRollbackPromptSyncs = [];
const checkpointRollbackRollbacks = [];
const checkpointRollbackTrace = [];
const checkpointRollbackReconciler = createMessageReconciler({
  getCampaignState: () => checkpointRollbackState,
  setCampaignState: (next) => {
    if (next?.mission?.activePhaseId === 'phase-before-checkpoint') checkpointRollbackTrace.push('set-restored-state');
    checkpointRollbackState = cloneJson(next);
  },
  coreTurnStore: {
    async markRecoveryRequired(transactionId, recoveryBundle = {}) {
      return {
        id: recoveryBundle.id || `recovery:${transactionId}`,
        status: 'required',
        phase: 'recoveryRequired',
        reason: recoveryBundle.reason || null
      };
    },
    async recordRollbackActuation(transactionId, rollback = {}) {
      checkpointRollbackTrace.push('rollback-recorded');
      checkpointRollbackRollbacks.push({ transactionId, rollback: cloneJson(rollback) });
      return {
        id: rollback.id || `rollback:${transactionId}:${checkpointRollbackRollbacks.length}`,
        status: 'recorded',
        rollback
      };
    }
  },
  loadCoreCheckpointState: async ({ coreCheckpointRef, ingress, outcomeId }) => {
    checkpointRollbackTrace.push('checkpoint-loaded');
    assert.equal(coreCheckpointRef.checkpointId, 'checkpoint-checkpoint-rollback');
    assert.equal(ingress.id, 'ingress-checkpoint-rollback');
    assert.equal(outcomeId, 'outcome-checkpoint-rollback');
    return cloneJson(checkpointRollbackSnapshot);
  },
  persist: async (state, summary) => checkpointRollbackPersisted.push({ summary, state: cloneJson(state) }),
  syncPrompt: async (state) => {
    const next = cloneJson(state);
    next.campaignChatBinding.promptContextRevision += 1;
    checkpointRollbackPromptSyncs.push(next.campaignChatBinding.promptContextRevision);
    return next;
  },
  now
});
const checkpointRollbackDelete = await checkpointRollbackReconciler.reconcileDeleted({
  hostMessageId: 'player-checkpoint-rollback',
  autoRollback: true
});
assert.equal(checkpointRollbackDelete.matched, true);
assert.equal(checkpointRollbackDelete.action, 'rolledBack');
assert.equal(checkpointRollbackDelete.preOutcomeRevision, checkpointRollbackRevision);
assert.equal(checkpointRollbackState.runtimeTracking.revision, checkpointRollbackRevision);
assert.equal(checkpointRollbackState.mission.activePhaseId, 'phase-before-checkpoint');
assert.equal(checkpointRollbackState.mission.knownFacts.some((entry) => entry.id === 'fact-after-checkpoint'), false);
assert.equal(checkpointRollbackState.commandLog.entries.some((entry) => entry.id === 'log-after-checkpoint'), false);
assert.equal(checkpointRollbackState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-checkpoint-rollback').status, 'recoveryRequired');
assert.equal(checkpointRollbackState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-checkpoint-rollback').deletedAt !== null, true);
assert.equal(checkpointRollbackState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'restoreRevision'), false);
assert.equal(checkpointRollbackRollbacks.length, 1);
assert.equal(checkpointRollbackRollbacks.at(-1).transactionId, 'txn-checkpoint-rollback');
assert.equal(checkpointRollbackRollbacks.at(-1).rollback.rollbackActuation.restoreRevision, checkpointRollbackRevision);
assert.equal(checkpointRollbackTrace.indexOf('checkpoint-loaded') > -1, true);
assert.equal(checkpointRollbackTrace.indexOf('checkpoint-loaded') < checkpointRollbackTrace.indexOf('rollback-recorded'), true);
assert.equal(checkpointRollbackTrace.indexOf('rollback-recorded') < checkpointRollbackTrace.indexOf('set-restored-state'), true);
assert.equal(checkpointRollbackPromptSyncs.length, 1);
assert.equal(checkpointRollbackPersisted.length, 2);

let failureState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-core-failure', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  mission: { activePhaseId: 'phase-before' },
  commandLog: { entries: [] }
});
failureState = recordTurnIngress(failureState, {
  id: 'ingress-core-failure',
  hostMessageId: 'player-core-failure',
  status: 'committed',
  textHash: 'hash-core-failure',
  sourceFrameId: 'frame-core-failure',
  coreTransactionId: 'txn-core-failure'
});
const failureCandidate = cloneJson(failureState);
failureCandidate.mission.activePhaseId = 'phase-after';
failureState = commitTrackedCampaignState({
  campaignState: failureState,
  nextCampaignState: failureCandidate,
  delta: {
    source: 'missionDirector',
    reason: 'Committed failure test outcome.',
    domains: ['mission'],
    ingressId: 'ingress-core-failure',
    outcomeId: 'outcome-core-failure',
    stable: true
  },
  now
});
failureState = updateTurnIngress(failureState, 'ingress-core-failure', {
  status: 'committed',
  outcomeId: 'outcome-core-failure'
});
const failureStateBeforeEdit = cloneJson(failureState);
let failurePromptSyncs = 0;
const failurePersisted = [];
const failingReconciler = createMessageReconciler({
  getCampaignState: () => failureState,
  setCampaignState: (next) => { failureState = cloneJson(next); },
  coreTurnStore: {
    async markRecoveryRequired() {
      const error = new Error('CORE recovery conflict');
      error.code = 'DIRECTIVE_CORE_RECOVERY_ALREADY_REQUIRED';
      throw error;
    }
  },
  persist: async (state, summary) => failurePersisted.push({ summary, state: cloneJson(state) }),
  syncPrompt: async (state) => {
    failurePromptSyncs += 1;
    return state;
  },
  now
});
await assert.rejects(
  () => failingReconciler.reconcileEdited({
    hostMessageId: 'player-core-failure',
    replacementText: 'This old-ledger mutation must not land after CORE rejects recovery.'
  }),
  (error) => error?.code === 'DIRECTIVE_CORE_RECOVERY_ALREADY_REQUIRED'
);
assert.deepEqual(failureState, failureStateBeforeEdit, 'Old recovery ledgers must not mutate after CORE recovery conflict.');
assert.equal(failurePromptSyncs, 0, 'Prompt sync must not run after CORE recovery conflict.');
assert.equal(failurePersisted.length, 0, 'Persist must not run after CORE recovery conflict.');

let rollbackRecordFailureState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-rollback-record-failure', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  mission: { activePhaseId: 'phase-before' },
  commandLog: { entries: [] }
});
rollbackRecordFailureState = recordTurnIngress(rollbackRecordFailureState, {
  id: 'ingress-rollback-record-failure',
  hostMessageId: 'player-rollback-record-failure',
  status: 'committed',
  textHash: 'hash-rollback-record-failure',
  sourceFrameId: 'frame-rollback-record-failure',
  coreTransactionId: 'txn-rollback-record-failure'
});
const rollbackRecordFailureCandidate = cloneJson(rollbackRecordFailureState);
rollbackRecordFailureCandidate.mission.activePhaseId = 'phase-after';
rollbackRecordFailureState = commitTrackedCampaignState({
  campaignState: rollbackRecordFailureState,
  nextCampaignState: rollbackRecordFailureCandidate,
  delta: {
    source: 'missionDirector',
    reason: 'Committed rollback record failure test outcome.',
    domains: ['mission'],
    ingressId: 'ingress-rollback-record-failure',
    outcomeId: 'outcome-rollback-record-failure',
    stable: true
  },
  now
});
rollbackRecordFailureState = updateTurnIngress(rollbackRecordFailureState, 'ingress-rollback-record-failure', {
  status: 'committed',
  outcomeId: 'outcome-rollback-record-failure'
});
const rollbackRecordFailureBefore = cloneJson(rollbackRecordFailureState);
let rollbackRecordFailurePromptSyncs = 0;
const rollbackRecordFailurePersisted = [];
const rollbackRecordFailureReconciler = createMessageReconciler({
  getCampaignState: () => rollbackRecordFailureState,
  setCampaignState: (next) => { rollbackRecordFailureState = cloneJson(next); },
  coreTurnStore: {
    async markRecoveryRequired(transactionId, recoveryBundle = {}) {
      return {
        id: recoveryBundle.id || `recovery:${transactionId}`,
        status: 'required',
        phase: 'recoveryRequired',
        reason: recoveryBundle.reason || null
      };
    },
    async recordRollbackActuation() {
      return { status: 'notRecorded', reason: 'core-rollback-writer-unavailable' };
    }
  },
  persist: async (state, summary) => rollbackRecordFailurePersisted.push({ summary, state: cloneJson(state) }),
  syncPrompt: async (state) => {
    rollbackRecordFailurePromptSyncs += 1;
    return state;
  },
  now
});
const rollbackRecordFailure = await rollbackRecordFailureReconciler.reconcileDeleted({
  hostMessageId: 'player-rollback-record-failure',
  autoRollback: true
});
assert.equal(rollbackRecordFailure.action, 'rollbackBlocked');
assert.deepEqual(rollbackRecordFailureState, rollbackRecordFailureBefore, 'Old recovery ledgers must not mutate when CORE rollback actuation is not recorded.');
assert.equal(rollbackRecordFailurePromptSyncs, 0, 'Prompt sync must not run when rollback actuation is not recorded.');
assert.equal(rollbackRecordFailurePersisted.length, 0, 'Persist must not run when rollback actuation is not recorded.');

let decisionState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-repair-decision-projection', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  mission: { activePhaseId: 'phase-before' },
  commandLog: { entries: [] }
});
decisionState = recordTurnIngress(decisionState, {
  id: 'ingress-decision-player',
  hostMessageId: 'player-decision-projection',
  status: 'committed',
  textHash: 'hash-decision-player',
  outcomeId: 'outcome-decision-player',
  sourceFrameId: 'frame-decision-player',
  coreTransactionId: 'txn-decision-player'
});
decisionState = recordTurnIngress(decisionState, {
  id: 'ingress-decision-response-source',
  hostMessageId: 'player-decision-response-source',
  status: 'committed',
  textHash: 'hash-decision-response-source',
  outcomeId: 'outcome-decision-response',
  sourceFrameId: 'frame-decision-response',
  coreTransactionId: 'txn-decision-response'
});
decisionState = recordDirectiveResponse(decisionState, {
  id: 'response-decision-projection',
  ingressId: 'ingress-decision-response-source',
  turnId: 'turn-decision-response',
  outcomeId: 'outcome-decision-response',
  hostMessageId: 'assistant-decision-projection',
  strategy: 'directivePosted',
  responseKind: 'committedOutcome',
  status: 'posted',
  sourceFrameId: 'frame-decision-response',
  coreTransactionId: 'txn-decision-response'
});
const decisionRepairCalls = [];
const decisionReconciler = createMessageReconciler({
  getCampaignState: () => decisionState,
  setCampaignState: (next) => { decisionState = cloneJson(next); },
  repairRuntime: {
    async recordSourceMutationRecovery(options = {}) {
      decisionRepairCalls.push(cloneJson(options));
      return {
        status: 'recorded',
        transactionId: options.ingress?.coreTransactionId || options.response?.coreTransactionId || null,
        decision: {
          kind: 'directive.repairDecision.v1',
          action: 'invalidateProjection',
          sourceKind: options.response ? 'directiveResponse' : 'playerIngress',
          legacyProjection: {
            kind: 'directive.repairLegacyProjection.v1',
            sourceProjectionStatus: 'invalidated',
            responseProjectionStatus: 'invalidated',
            recoveryJournalStatus: 'invalidated',
            returnedAction: 'invalidated',
            shouldRestoreRevision: false,
            restoreRevision: null
          }
        }
      };
    }
  },
  persist: async () => {},
  syncPrompt: async (state) => state,
  now
});
const decisionPlayerEdit = await decisionReconciler.reconcileEdited({
  hostMessageId: 'player-decision-projection',
  replacementText: 'REPAIR decision should override committed player projection status.'
});
assert.equal(decisionPlayerEdit.action, 'invalidated');
assert.equal(
  decisionState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-decision-player').status,
  'invalidated',
  'Old ingress projection status must come from REPAIR legacyProjection, not committed-outcome inference.'
);
assert.equal(
  decisionState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'playerMessageEdited'),
  false,
  'CORE-recorded player recovery decisions must not write old recoveryJournal rows.'
);
assert.equal(decisionRepairCalls.at(-1).ingress.id, 'ingress-decision-player');
const decisionResponseEdit = await decisionReconciler.reconcileEdited({
  hostMessageId: 'assistant-decision-projection',
  replacementText: 'REPAIR decision should override committed response projection status.'
});
assert.equal(decisionResponseEdit.action, 'invalidated');
assert.equal(
  decisionState.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-decision-projection').status,
  'invalidated',
  'Old response projection status must come from REPAIR legacyProjection, not committed-outcome inference.'
);
assert.equal(
  decisionState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'directiveResponseEdited'),
  false,
  'CORE-recorded response recovery decisions must not write old recoveryJournal rows.'
);
assert.equal(decisionRepairCalls.length, 2);
assert.equal(decisionRepairCalls.at(-1).response.id, 'response-decision-projection');

const missing = await reconciler.reconcileDeleted({ hostMessageId: 'missing-message' });
assert.equal(missing.matched, false);
assert.equal(missing.action, 'ignored');

let untrackedDependentState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-untracked-dependent-projection', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  knowledgeLedger: {
    schemaVersion: 2,
    facts: [],
    rumors: [],
    contradictions: [],
    components: {
      schemaVersion: 1,
      records: [{
        id: 'component-repair-selected',
        title: 'Selected component',
        type: 'lead',
        status: 'active',
        summary: 'Selected component depends on source row.',
        sourceAuthority: 'dialogue',
        links: {},
        source: {
          host: 'sillytavern',
          chatId: 'campaign-chat',
          hostMessageId: 'assistant-untracked-source',
          messageRole: 'assistant',
          textHash: 'component-selected-hash',
          sourceStatus: 'active'
        },
        lifecycle: { createdAt: '2026-06-22T02:30:00.000Z', updatedAt: '2026-06-22T02:30:00.000Z' }
      }, {
        id: 'component-not-returned',
        title: 'Non-returned component',
        type: 'lead',
        status: 'active',
        summary: 'This component has the same source but REPAIR did not select it.',
        sourceAuthority: 'dialogue',
        links: {},
        source: {
          host: 'sillytavern',
          chatId: 'campaign-chat',
          hostMessageId: 'assistant-untracked-source',
          messageRole: 'assistant',
          textHash: 'component-extra-hash',
          sourceStatus: 'active'
        },
        lifecycle: { createdAt: '2026-06-22T02:31:00.000Z', updatedAt: '2026-06-22T02:31:00.000Z' }
      }]
    }
  },
  runtimeTracking: {
    sceneHandshake: {
      settled: [{
        id: 'settlement-repair-selected',
        status: 'settled',
        previousAssistantHostMessageId: 'assistant-untracked-source',
        currentPlayerHostMessageId: 'player-untracked-reply'
      }, {
        id: 'settlement-not-returned',
        status: 'settled',
        previousAssistantHostMessageId: 'assistant-untracked-source',
        currentPlayerHostMessageId: 'player-untracked-other'
      }],
      lastResult: {
        id: 'settlement-not-returned',
        status: 'settled',
        previousAssistantHostMessageId: 'assistant-untracked-source',
        currentPlayerHostMessageId: 'player-untracked-other'
      }
    }
  }
});
const untrackedRepairCalls = [];
const untrackedDependentReconciler = createMessageReconciler({
  getCampaignState: () => untrackedDependentState,
  setCampaignState: (next) => { untrackedDependentState = cloneJson(next); },
  repairRuntime: {
    async handleSourceMutation(options = {}) {
      untrackedRepairCalls.push(cloneJson(options));
      return {
        status: 'notRecorded',
        reason: 'untracked-host-row',
        decision: {
          kind: 'directive.repairDecision.v1',
          eventType: options.eventType,
          sourceKind: 'untrackedHostMessage',
          legacyProjection: {
            kind: 'directive.repairLegacyProjection.v1',
            sourceProjectionStatus: 'invalidated',
            responseProjectionStatus: 'invalidated',
            recoveryJournalStatus: 'reviewRequired',
            returnedAction: 'sceneHandshakeInvalidated',
            shouldRestoreRevision: false,
            restoreRevision: null
          },
          dependentInvalidation: {
            kind: 'directive.repairDependentInvalidation.v1',
            sceneHandshake: {
              settlementIds: ['settlement-repair-selected'],
              invalidatedCount: 1
            },
            missionComponents: {
              componentIds: ['component-repair-selected'],
              markedCount: 1,
              sourceStatus: 'stale'
            },
            promptDirtyDomains: ['sceneHandshake', 'missionComponents']
          }
        }
      };
    }
  },
  persist: async () => {},
  syncPrompt: async (state) => state,
  now
});
const untrackedDependentEdit = await untrackedDependentReconciler.reconcileEdited({
  hostMessageId: 'assistant-untracked-source',
  replacementText: 'RAW_SHOULD_NOT_PERSIST'
});
assert.equal(untrackedRepairCalls.length, 1);
assert.equal(untrackedRepairCalls[0].eventType, 'sceneHandshakeSourceEdited');
assert.ok(untrackedRepairCalls[0].state);
assert.ok(untrackedRepairCalls[0].campaignState);
assert.equal(untrackedDependentEdit.matched, true);
assert.equal(untrackedDependentEdit.sceneHandshake.invalidatedCount, 1);
assert.deepEqual(untrackedDependentEdit.sceneHandshake.settlementIds, ['settlement-repair-selected']);
assert.equal(untrackedDependentEdit.missionComponents.markedCount, 1);
assert.deepEqual(untrackedDependentEdit.missionComponents.componentIds, ['component-repair-selected']);
assert.equal(
  untrackedDependentState.runtimeTracking.sceneHandshake.settled.find((entry) => entry.id === 'settlement-repair-selected').status,
  'invalidated'
);
assert.equal(
  untrackedDependentState.runtimeTracking.sceneHandshake.settled.find((entry) => entry.id === 'settlement-not-returned').status,
  'settled'
);
assert.equal(untrackedDependentState.runtimeTracking.sceneHandshake.lastResult.status, 'settled');
assert.equal(
  untrackedDependentState.knowledgeLedger.components.records.find((entry) => entry.id === 'component-repair-selected').source.sourceStatus,
  'stale'
);
assert.equal(
  untrackedDependentState.knowledgeLedger.components.records.find((entry) => entry.id === 'component-not-returned').source.sourceStatus,
  'active'
);
assert.equal(JSON.stringify(untrackedDependentState).includes('RAW_SHOULD_NOT_PERSIST'), false);
assert.equal(
  untrackedDependentState.runtimeTracking.recoveryJournal.some((entry) => (
    entry.type === 'sceneHandshakeSourceInvalidated'
    || entry.type === 'missionComponentSourceEdited'
    || entry.type === 'missionComponentSourceDeleted'
  )),
  false,
  'REPAIR dependent invalidation projections must not mirror untracked host-row recoveries into old recoveryJournal rows.'
);

let deletedComponentState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-deleted-component-monotonic', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  knowledgeLedger: {
    components: {
      schemaVersion: 1,
      records: [{
        id: 'component-deleted-stays-deleted',
        title: 'Deleted component',
        type: 'lead',
        status: 'active',
        source: {
          hostMessageId: 'assistant-deleted-component-source',
          sourceStatus: 'deleted'
        },
        lifecycle: { updatedAt: '2026-06-22T02:35:00.000Z' }
      }]
    }
  }
});
let deletedComponentRepairCalls = 0;
const deletedComponentReconciler = createMessageReconciler({
  getCampaignState: () => deletedComponentState,
  setCampaignState: (next) => { deletedComponentState = cloneJson(next); },
  repairRuntime: {
    async handleSourceMutation(options = {}) {
      deletedComponentRepairCalls += 1;
      return {
        status: 'notRecorded',
        reason: 'test-stale-projection-over-deleted',
        decision: {
          kind: 'directive.repairDecision.v1',
          eventType: options.eventType,
          sourceKind: 'untrackedHostMessage',
          dependentInvalidation: {
            kind: 'directive.repairDependentInvalidation.v1',
            missionComponents: {
              componentIds: ['component-deleted-stays-deleted'],
              markedCount: 1,
              sourceStatus: 'stale'
            },
            promptDirtyDomains: ['missionComponents']
          }
        }
      };
    }
  },
  persist: async () => {},
  syncPrompt: async (state) => state,
  now
});
const deletedComponentEdit = await deletedComponentReconciler.reconcileEdited({
  hostMessageId: 'assistant-deleted-component-source'
});
assert.equal(deletedComponentRepairCalls, 1);
assert.equal(deletedComponentEdit.action, 'ignored');
assert.equal(
  deletedComponentState.knowledgeLedger.components.records[0].source.sourceStatus,
  'deleted'
);

let noRepairHandlerState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-no-repair-handler', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  knowledgeLedger: {
    components: {
      schemaVersion: 1,
      records: [{
        id: 'component-no-repair-handler',
        source: {
          hostMessageId: 'assistant-no-repair-handler',
          sourceStatus: 'active'
        }
      }]
    }
  }
});
const noRepairHandlerReconciler = createMessageReconciler({
  getCampaignState: () => noRepairHandlerState,
  setCampaignState: (next) => { noRepairHandlerState = cloneJson(next); },
  repairRuntime: {},
  persist: async () => {},
  syncPrompt: async (state) => state,
  now
});
const noRepairHandlerEdit = await noRepairHandlerReconciler.reconcileEdited({
  hostMessageId: 'assistant-no-repair-handler'
});
assert.equal(noRepairHandlerEdit.matched, false);
assert.equal(noRepairHandlerEdit.action, 'ignored');
assert.equal(
  noRepairHandlerState.knowledgeLedger.components.records[0].source.sourceStatus,
  'active'
);

let handshakeState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-handshake-recovery', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  mission: {
    openAssignments: [{
      id: 'assignment-cross',
      title: 'Review Cross handoff',
      status: 'open',
      sourceSettlementId: 'settlement-handshake-1'
    }]
  },
  commandLog: {
    entries: [{
      id: 'log-handshake',
      type: 'sceneHandshake',
      sourceSettlementId: 'settlement-handshake-1',
      summaryInputs: ['Whitaker gave current orders.']
    }]
  },
  ship: {
    technicalDebt: [{
      id: 'debt-handshake',
      label: 'Command-network handoff',
      status: 'under-review',
      sourceSettlementId: 'settlement-handshake-1'
    }]
  },
  threadLedger: {
    records: [{
      id: 'thread-handshake',
      title: 'Cross handoff',
      status: 'active',
      source: { id: 'settlement-handshake-1', type: 'sceneHandshake' }
    }]
  },
  runtimeTracking: {
    sceneHandshake: {
      settled: [{
        id: 'settlement-handshake-1',
        idempotencyKey: 'scene-handshake:test',
        status: 'settled',
        disposition: 'autoCommit',
        previousAssistantHostMessageId: 'assistant-whitaker-orders',
        currentPlayerHostMessageId: 'player-accepts-orders'
      }],
      lastResult: {
        id: 'settlement-handshake-1',
        status: 'settled',
        previousAssistantHostMessageId: 'assistant-whitaker-orders',
        currentPlayerHostMessageId: 'player-accepts-orders'
      }
    }
  }
});
const handshakePersisted = [];
const handshakePromptSyncs = [];
const handshakeReconciler = createMessageReconciler({
  getCampaignState: () => handshakeState,
  setCampaignState: (next) => { handshakeState = cloneJson(next); },
  persist: async (state, summary) => handshakePersisted.push({ summary, state: cloneJson(state) }),
  syncPrompt: async (state) => {
    const next = cloneJson(state);
    next.campaignChatBinding.promptContextRevision += 1;
    handshakePromptSyncs.push(next.campaignChatBinding.promptContextRevision);
    return next;
  },
  now
});

const assistantSourceEdit = await handshakeReconciler.reconcileEdited({
  hostMessageId: 'assistant-whitaker-orders',
  replacementText: 'Whitaker gave a different priority list.'
});
assert.equal(assistantSourceEdit.matched, true);
assert.equal(assistantSourceEdit.action, 'sceneHandshakeInvalidated');
assert.equal(assistantSourceEdit.sceneHandshake.invalidatedCount, 1);
assert.equal(handshakeState.runtimeTracking.sceneHandshake.settled[0].status, 'invalidated');
assert.equal(handshakeState.runtimeTracking.sceneHandshake.lastResult.status, 'invalidated');
assert.equal(handshakeState.mission.openAssignments[0].status, 'source-stale');
assert.equal(handshakeState.commandLog.entries[0].sourceStale, true);
assert.equal(handshakeState.ship.technicalDebt[0].sourceStale, true);
assert.equal(handshakeState.threadLedger.records[0].sourceStale, true);
assert.equal(handshakeState.threadLedger.records[0].metadata.stale, true);
assert.equal(handshakeState.threadLedger.records[0].metadata.staleReason, 'scene-handshake-source-invalidated');
assert.equal(
  handshakeState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'sceneHandshakeSourceInvalidated'),
  false,
  'REPAIR-owned Scene Handshake dependent invalidation must not write old recoveryJournal rows.'
);
assert.equal(handshakeState.campaignChatBinding.promptContextRevision, 2);

let playerHandshakeState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-handshake-player-recovery', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  mission: {
    openAssignments: [{
      id: 'assignment-bronn',
      title: 'Meet Bronn',
      status: 'open',
      sourceSettlementId: 'settlement-handshake-2'
    }]
  },
  commandLog: { entries: [] },
  runtimeTracking: {
    sceneHandshake: {
      settled: [{
        id: 'settlement-handshake-2',
        idempotencyKey: 'scene-handshake:test-2',
        status: 'settled',
        disposition: 'autoCommit',
        previousAssistantHostMessageId: 'assistant-orders-2',
        currentPlayerHostMessageId: 'player-accepts-orders-2'
      }],
      lastResult: {
        id: 'settlement-handshake-2',
        status: 'settled',
        previousAssistantHostMessageId: 'assistant-orders-2',
        currentPlayerHostMessageId: 'player-accepts-orders-2'
      }
    }
  }
});
playerHandshakeState = recordTurnIngress(playerHandshakeState, {
  id: 'ingress-handshake-player',
  hostMessageId: 'player-accepts-orders-2',
  status: 'classified',
  textHash: 'accepts-orders-2',
  sourceFrameId: 'frame-handshake-player',
  coreTransactionId: 'txn-handshake-player'
});
const playerHandshakeReconciler = createMessageReconciler({
  getCampaignState: () => playerHandshakeState,
  setCampaignState: (next) => { playerHandshakeState = cloneJson(next); },
  coreTurnStore,
  persist: async () => {},
  syncPrompt: async (state) => {
    const next = cloneJson(state);
    next.campaignChatBinding.promptContextRevision += 1;
    return next;
  },
  now
});
const acceptingPlayerDelete = await playerHandshakeReconciler.reconcileDeleted({
  hostMessageId: 'player-accepts-orders-2'
});
assert.equal(acceptingPlayerDelete.matched, true);
assert.equal(acceptingPlayerDelete.action, 'invalidated');
assert.equal(acceptingPlayerDelete.sceneHandshake.invalidatedCount, 1);
assert.equal(playerHandshakeState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-handshake-player').status, 'invalidated');
assert.equal(playerHandshakeState.runtimeTracking.sceneHandshake.settled[0].status, 'invalidated');
assert.equal(playerHandshakeState.mission.openAssignments[0].status, 'source-stale');

let componentState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-component-recovery', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  knowledgeLedger: {
    schemaVersion: 2,
    facts: [],
    rumors: [],
    contradictions: [],
    components: {
      schemaVersion: 1,
      records: [{
        id: 'component-coolant',
        title: 'Coolant seal',
        type: 'shipIssue',
        status: 'unresolved',
        summary: 'Coolant seal needs review.',
        verbatim: 'Coolant seal, port nacelle, junction 7-C.',
        sourceAuthority: 'officialPacket',
        tags: ['engineering'],
        links: {},
        source: {
          host: 'sillytavern',
          chatId: 'campaign-chat',
          hostMessageId: 'assistant-component-source',
          messageRole: 'assistant',
          textHash: 'h-source',
          selectionHash: 'h-selection',
          sourceStatus: 'active'
        },
        lifecycle: {
          createdAt: '2026-06-22T02:00:00.000Z',
          updatedAt: '2026-06-22T02:00:00.000Z',
          createdBy: 'player',
          reviewed: true
        }
      }]
    }
  }
});
const componentPersisted = [];
const componentReconciler = createMessageReconciler({
  getCampaignState: () => componentState,
  setCampaignState: (next) => { componentState = cloneJson(next); },
  persist: async (state, summary) => componentPersisted.push({ summary, state: cloneJson(state) }),
  syncPrompt: async (state) => {
    const next = cloneJson(state);
    next.campaignChatBinding.promptContextRevision += 1;
    return next;
  },
  now
});

const componentSourceEdit = await componentReconciler.reconcileEdited({
  hostMessageId: 'assistant-component-source',
  replacementText: 'Coolant seal source changed.'
});
assert.equal(componentSourceEdit.matched, true);
assert.equal(componentSourceEdit.action, 'missionComponentSourceInvalidated');
assert.equal(componentSourceEdit.missionComponents.markedCount, 1);
assert.equal(componentState.knowledgeLedger.components.records[0].source.sourceStatus, 'stale');
assert.equal(
  componentState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'missionComponentSourceEdited'),
  false,
  'REPAIR-owned Mission Component edit invalidation must not write old recoveryJournal rows.'
);
assert.equal(componentState.campaignChatBinding.promptContextRevision, 2);

const componentSourceDelete = await componentReconciler.reconcileDeleted({
  hostMessageId: 'assistant-component-source'
});
assert.equal(componentSourceDelete.matched, true);
assert.equal(componentSourceDelete.action, 'missionComponentSourceInvalidated');
assert.equal(componentSourceDelete.missionComponents.markedCount, 1);
assert.equal(componentState.knowledgeLedger.components.records[0].source.sourceStatus, 'deleted');
assert.equal(
  componentState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'missionComponentSourceDeleted'),
  false,
  'REPAIR-owned Mission Component delete invalidation must not write old recoveryJournal rows.'
);
assert.equal(componentState.campaignChatBinding.promptContextRevision, 3);
assert.equal(componentPersisted.length, 4);

let noCoreFallbackState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-no-core-fallback', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 }
});
noCoreFallbackState = recordTurnIngress(noCoreFallbackState, {
  id: 'ingress-no-core-fallback',
  hostMessageId: 'player-no-core-fallback',
  status: 'committed',
  textHash: 'hash-no-core-fallback',
  outcomeId: 'outcome-no-core-fallback'
});
const noCoreFallbackRawText = 'RAW_NO_CORE_REPLACEMENT_TEXT_MUST_NOT_PERSIST';
const noCoreFallbackBefore = cloneJson(noCoreFallbackState);
const noCoreFallbackPersisted = [];
const noCoreFallbackPromptSyncs = [];
const noCoreFallbackReconciler = createMessageReconciler({
  getCampaignState: () => noCoreFallbackState,
  setCampaignState: (next) => { noCoreFallbackState = cloneJson(next); },
  persist: async (state, summary) => noCoreFallbackPersisted.push({ state: cloneJson(state), summary }),
  syncPrompt: async (state) => {
    noCoreFallbackPromptSyncs.push(cloneJson(state));
    return state;
  },
  now
});
const noCoreFallbackEdit = await noCoreFallbackReconciler.reconcileEdited({
  hostMessageId: 'player-no-core-fallback',
  replacementText: noCoreFallbackRawText
});
assert.equal(noCoreFallbackEdit.matched, true);
assert.equal(noCoreFallbackEdit.ok, false);
assert.equal(noCoreFallbackEdit.action, 'coreRecoveryRequired');
assert.equal(noCoreFallbackEdit.reason, 'source-mutation-core-recovery-required');
assert.deepEqual(noCoreFallbackState, noCoreFallbackBefore, 'No-CORE source mutation must fail closed before old ingress/recovery mutation.');
assert.equal(noCoreFallbackPersisted.length, 0, 'No-CORE source mutation must not persist a fallback recovery row.');
assert.equal(noCoreFallbackPromptSyncs.length, 0, 'No-CORE source mutation must not prompt-sync after blocked recovery.');
assert.equal(
  noCoreFallbackState.runtimeTracking.recoveryJournal.some((entry) => (
    entry.type === 'playerMessageEdited'
    && entry.ingressId === 'ingress-no-core-fallback'
  )),
  false,
  'No-CORE source mutation must not write old recoveryJournal rows.'
);
assert.equal(JSON.stringify(noCoreFallbackState).includes(noCoreFallbackRawText), false);

console.log('Message recovery tests passed: invalidation, selected-swipe source mutation, tracked rollback, Scene Handshake and Mission Component source invalidation, ledger preservation, and prompt revision persistence');
