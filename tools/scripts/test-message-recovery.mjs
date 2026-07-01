import assert from 'node:assert/strict';

import { createMessageReconciler } from '../../src/runtime/message-reconciler.mjs';
import {
  commitTrackedCampaignState,
  initializeCampaignRuntimeTracking,
  recordDirectiveResponse,
  recordTurnIngress,
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
  textHash: 'hash-uncommitted'
});
campaignState = recordTurnIngress(campaignState, {
  id: 'ingress-uncommitted-delete',
  hostMessageId: 'player-uncommitted-delete',
  status: 'classified',
  textHash: 'hash-uncommitted-delete'
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

const persisted = [];
const promptSyncs = [];
const coreRecoveries = [];
const coreDiagnostics = [];
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
  }
};
const reconciler = createMessageReconciler({
  getCampaignState: () => campaignState,
  setCampaignState: (next) => { campaignState = cloneJson(next); },
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
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'playerMessageEdited' && entry.status === 'invalidated' && entry.outcomeId === null), true);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 2);

const uncommittedDelete = await reconciler.reconcileDeleted({
  hostMessageId: 'player-uncommitted-delete'
});
assert.equal(uncommittedDelete.matched, true);
assert.equal(uncommittedDelete.action, 'invalidated');
assert.equal(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted-delete').status, 'invalidated');
assert.match(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted-delete').deletedAt, /^2026-06-22T03:00:/);
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'playerMessageDeleted' && entry.status === 'invalidated' && entry.outcomeId === null), true);
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
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'playerMessageEdited' && entry.status === 'reviewRequired'), true);
assert.equal(coreRecoveries.at(-1).transactionId, 'txn-committed');
assert.equal(coreRecoveries.at(-1).bundle.reason, 'playerMessageEdited');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.action, 'reviewRequired');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.normalTurnAllowed, false);
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.sourceKind, 'playerIngress');
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.replacementTextHash.length, 64);
assert.equal(JSON.stringify(coreRecoveries.at(-1).bundle).includes('A materially changed committed order.'), false);
const committedEditRecovery = campaignState.runtimeTracking.recoveryJournal.find((entry) => entry.type === 'playerMessageEdited' && entry.status === 'reviewRequired');
assert.equal(committedEditRecovery.details.coreRecovery.status, 'recorded');
assert.equal(committedEditRecovery.details.coreRecovery.decision.action, 'reviewRequired');
assert.equal(committedEditRecovery.details.coreRecovery.decision.normalTurnAllowed, false);
assert.equal(committedEditRecovery.details.coreRecovery.sourceMutation.sourceKind, 'playerIngress');
assert.equal(committedEditRecovery.details.coreRecovery.sourceMutation.ingressId, 'ingress-committed');
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
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'directiveResponseEdited' && entry.status === 'reviewRequired'), true);
assert.equal(coreRecoveries.at(-1).transactionId, 'txn-committed');
assert.equal(coreRecoveries.at(-1).bundle.reason, 'directiveResponseEdited');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(coreRecoveries.at(-1).bundle.repairDecision.sourceKind, 'directiveResponse');
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.sourceKind, 'directiveResponse');
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.responseId, 'response-committed');
assert.equal(JSON.stringify(coreRecoveries.at(-1).bundle).includes('A materially changed Directive response.'), false);
const committedResponseEditRecovery = campaignState.runtimeTracking.recoveryJournal.find((entry) => entry.type === 'directiveResponseEdited' && entry.status === 'reviewRequired');
assert.equal(committedResponseEditRecovery.details.coreRecovery.decision.action, 'reviewRequired');
assert.equal(committedResponseEditRecovery.details.coreRecovery.decision.sourceKind, 'directiveResponse');
assert.equal(committedResponseEditRecovery.details.coreRecovery.sourceMutation.sourceKind, 'directiveResponse');
assert.equal(committedResponseEditRecovery.details.coreRecovery.sourceMutation.responseId, 'response-committed');
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
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'directiveResponseDeleted' && entry.status === 'reviewRequired'), true);
assert.equal(coreRecoveries.at(-1).bundle.reason, 'directiveResponseDeleted');
assert.equal(coreRecoveries.at(-1).bundle.sourceMutation.replacementTextHash, null);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 6);

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
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'directiveResponseSelectedSwipeChanged' && entry.status === 'reviewRequired'), true);
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

const rolledBack = await reconciler.reconcileDeleted({
  hostMessageId: 'player-committed',
  autoRollback: true
});
assert.equal(rolledBack.matched, true);
assert.equal(rolledBack.action, 'rolledBack');
assert.equal(rolledBack.preOutcomeRevision, beforeOutcomeRevision);
assert.equal(campaignState.runtimeTracking.revision, beforeOutcomeRevision);
assert.equal(campaignState.mission.activePhaseId, 'phase-before');
assert.equal(campaignState.mission.knownFacts.some((entry) => entry.id === 'fact-after'), false);
assert.equal(campaignState.commandLog.entries.some((entry) => entry.id === 'log-after'), false);
assert.equal(campaignState.runtimeTracking.ingressLedger.some((entry) => entry.id === 'ingress-committed'), true, 'Ingress ledger must survive snapshot restore.');
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'restoreRevision'), true);
const rollbackRecoveryEntry = campaignState.runtimeTracking.recoveryJournal.find((entry) => (
  entry.type === 'playerMessageDeleted'
  && entry.hostMessageId === 'player-committed'
));
assert.equal(rollbackRecoveryEntry.details.rollbackActuation.kind, 'directive.repairRollbackActuationDecision.v1');
assert.equal(rollbackRecoveryEntry.details.rollbackActuation.authorized, true);
assert.equal(rollbackRecoveryEntry.details.rollbackActuation.action, 'restorePreOutcomeRevision');
assert.equal(rollbackRecoveryEntry.details.rollbackActuation.restoreRevision, beforeOutcomeRevision);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 2, 'Restored binding revision must be incremented once after prompt rebuild.');
assert.equal(coreRecoveries.at(-1).bundle.reason, 'playerMessageDeleted');
assert.deepEqual(coreRecoveries.at(-1).bundle.allowedActions, ['rollbackToPreOutcomeRevision', 'reviewSourceMutation']);
assert.equal(JSON.stringify(coreRecoveries).includes('A materially changed'), false, 'CORE recovery bundles must not store raw replacement text.');
assert.equal(coreRecoveries.length, 5);
assert.equal(promptSyncs.length, 7);
assert.equal(persisted.length, 14, 'Each recovery and its prompt revision must be persisted.');

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
  decisionState.runtimeTracking.recoveryJournal.find((entry) => entry.type === 'playerMessageEdited').status,
  'invalidated',
  'Old ingress recovery status must come from REPAIR legacyProjection.'
);
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
  decisionState.runtimeTracking.recoveryJournal.find((entry) => entry.type === 'directiveResponseEdited').status,
  'invalidated',
  'Old response recovery status must come from REPAIR legacyProjection.'
);
assert.equal(decisionRepairCalls.length, 2);

const missing = await reconciler.reconcileDeleted({ hostMessageId: 'missing-message' });
assert.equal(missing.matched, false);
assert.equal(missing.action, 'ignored');

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
assert.equal(handshakeState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'sceneHandshakeSourceInvalidated'), true);
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
  textHash: 'accepts-orders-2'
});
const playerHandshakeReconciler = createMessageReconciler({
  getCampaignState: () => playerHandshakeState,
  setCampaignState: (next) => { playerHandshakeState = cloneJson(next); },
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
assert.equal(componentState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'missionComponentSourceEdited'), true);
assert.equal(componentState.campaignChatBinding.promptContextRevision, 2);

const componentSourceDelete = await componentReconciler.reconcileDeleted({
  hostMessageId: 'assistant-component-source'
});
assert.equal(componentSourceDelete.matched, true);
assert.equal(componentSourceDelete.action, 'missionComponentSourceInvalidated');
assert.equal(componentSourceDelete.missionComponents.markedCount, 1);
assert.equal(componentState.knowledgeLedger.components.records[0].source.sourceStatus, 'deleted');
assert.equal(componentState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'missionComponentSourceDeleted'), true);
assert.equal(componentState.campaignChatBinding.promptContextRevision, 3);
assert.equal(componentPersisted.length, 4);

console.log('Message recovery tests passed: invalidation, selected-swipe source mutation, tracked rollback, Scene Handshake and Mission Component source invalidation, ledger preservation, and prompt revision persistence');
