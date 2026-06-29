import assert from 'node:assert/strict';

import { createRepairRuntime } from '../../src/runtime/repair-runtime.mjs';
import { hashStableJson } from '../../src/runtime/architecture-redesign-contracts.mjs';
import { createCoreStoreV2 } from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createLoggingStorage() {
  const files = new Map();
  return {
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

function createHarness() {
  let tick = 0;
  const storage = createLoggingStorage();
  const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
  const coreStore = createCoreStoreV2({
    adapter,
    campaignId: 'campaign-repair-runtime',
    saveId: 'save-repair-runtime',
    now: () => `2026-06-29T10:00:${String(tick++).padStart(2, '0')}.000Z`
  });
  const repairRuntime = createRepairRuntime({
    coreTurnStore: coreStore,
    now: () => `2026-06-29T10:01:${String(tick++).padStart(2, '0')}.000Z`
  });
  return { coreStore, repairRuntime };
}

const { coreStore, repairRuntime } = createHarness();
await coreStore.beginTurn({
  id: 'frame-player-1',
  hostMessageId: 'player-1',
  chatId: 'ashes-chat',
  textHash: hashStableJson({ text: 'Original command.' }),
  visibility: { sourceRowExists: true }
}, {
  transactionId: 'txn-player-1',
  ingressId: 'ingress-player-1',
  idempotencyKey: 'begin:txn-player-1'
});

const playerEdit = await repairRuntime.recordSourceMutationRecovery({
  eventType: 'playerMessageEdited',
  hostMessageId: 'player-1',
  replacementText: 'Edited command that must not persist as raw text.',
  ingress: {
    id: 'ingress-player-1',
    coreTransactionId: 'txn-player-1',
    outcomeId: 'outcome-player-1',
    sourceFrameId: 'frame-player-1',
    status: 'committed'
  },
  preOutcomeRevision: 7,
  message: {
    id: 'player-1',
    is_user: true,
    extra: { sc_ghosted: true }
  },
  index: 12,
  chatMetadata: {
    summaryception: {
      ghostedIndices: [12],
      summarizedUpTo: 15
    }
  }
});
assert.equal(playerEdit.status, 'recorded');
assert.equal(playerEdit.decision.kind, 'directive.repairDecision.v1');
assert.equal(playerEdit.decision.action, 'reviewRequired');
assert.equal(playerEdit.decision.normalTurnAllowed, false);
assert.equal(playerEdit.decision.legacyProjection.kind, 'directive.repairLegacyProjection.v1');
assert.equal(playerEdit.decision.legacyProjection.sourceProjectionStatus, 'recoveryRequired');
assert.equal(playerEdit.decision.legacyProjection.recoveryJournalStatus, 'reviewRequired');
assert.equal(playerEdit.decision.legacyProjection.returnedAction, 'reviewRequired');

const playerProjections = coreStore.readProjections();
const playerRecovery = playerProjections.recoveryJournal.find((entry) => entry.transactionId === 'txn-player-1');
assert.ok(playerRecovery);
assert.equal(playerRecovery.reason, 'playerMessageEdited');
assert.equal(playerRecovery.sourceMutation.sourceKind, 'playerIngress');
assert.equal(playerRecovery.sourceMutation.replacementTextHash.length, 64);
assert.equal(playerRecovery.sourceMutation.replacementTextPresent, true);
assert.equal(playerRecovery.sourceMutation.visibility.ghostedBySummaryception, true);
assert.equal(playerRecovery.sourceMutation.visibility.summarizedBySummaryception, true);
assert.equal(playerRecovery.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(playerRecovery.repairDecision.legacyProjection.sourceProjectionStatus, 'recoveryRequired');
assert.deepEqual(playerRecovery.allowedActions, [
  'reviewSourceMutation',
  'rerunFromSource',
  'branchFromPriorRevision'
]);
assert.equal(JSON.stringify(coreStore.state).includes('Edited command that must not persist as raw text.'), false);

const eventCountBeforeReplay = coreStore.state.events.length;
const replay = await repairRuntime.recordSourceMutationRecovery({
  eventType: 'playerMessageEdited',
  hostMessageId: 'player-1',
  replacementText: 'Edited command that must not persist as raw text.',
  ingress: {
    id: 'ingress-player-1',
    coreTransactionId: 'txn-player-1',
    outcomeId: 'outcome-player-1',
    sourceFrameId: 'frame-player-1',
    status: 'committed'
  },
  preOutcomeRevision: 7
});
assert.equal(replay.status, 'recorded');
assert.equal(coreStore.state.events.length, eventCountBeforeReplay, 'same source-mutation recovery must be idempotent');

await coreStore.beginTurn({
  id: 'frame-response-1',
  hostMessageId: 'player-2',
  chatId: 'ashes-chat',
  textHash: hashStableJson({ text: 'Another command.' })
}, {
  transactionId: 'txn-response-1',
  ingressId: 'ingress-response-1',
  idempotencyKey: 'begin:txn-response-1'
});
const responseEdit = await repairRuntime.recordSourceMutationRecovery({
  eventType: 'directiveResponseEdited',
  hostMessageId: 'assistant-2',
  replacementText: 'Edited response that must also stay out of CORE raw payloads.',
  response: {
    id: 'response-2',
    ingressId: 'ingress-response-1',
    coreTransactionId: 'txn-response-1',
    outcomeId: 'outcome-response-1',
    sourceFrameId: 'frame-response-1',
    status: 'posted'
  },
  preOutcomeRevision: 11
});
assert.equal(responseEdit.status, 'recorded');
assert.equal(responseEdit.decision.legacyProjection.responseProjectionStatus, 'recoveryRequired');
assert.equal(responseEdit.decision.legacyProjection.recoveryJournalStatus, 'reviewRequired');
const responseRecovery = coreStore.readProjections().recoveryJournal.find((entry) => entry.transactionId === 'txn-response-1');
assert.equal(responseRecovery.sourceMutation.sourceKind, 'directiveResponse');
assert.equal(responseRecovery.dependentResponseId, 'response-2');
assert.deepEqual(responseRecovery.allowedActions, ['reviewResponseMutation', 'retryResponse']);
const responseRollbackActuation = repairRuntime.evaluateRollbackActuation({
  coreRecovery: responseEdit,
  eventTime: '2026-06-22T01:00:18.000Z'
});
assert.equal(responseRollbackActuation.authorized, false);
assert.equal(responseRollbackActuation.action, 'blockRollbackActuation');
assert.equal(responseRollbackActuation.sourceKind, 'directiveResponse');
assert.equal(JSON.stringify(coreStore.state).includes('Edited response that must also stay out of CORE raw payloads.'), false);

await coreStore.beginTurn({
  id: 'frame-rollback-1',
  hostMessageId: 'player-rollback',
  chatId: 'ashes-chat',
  textHash: hashStableJson({ text: 'Rollback command.' })
}, {
  transactionId: 'txn-rollback-1',
  ingressId: 'ingress-rollback-1',
  idempotencyKey: 'begin:txn-rollback-1'
});
const rollbackDecision = await repairRuntime.recordSourceMutationRecovery({
  eventType: 'playerMessageDeleted',
  hostMessageId: 'player-rollback',
  ingress: {
    id: 'ingress-rollback-1',
    coreTransactionId: 'txn-rollback-1',
    outcomeId: 'outcome-rollback-1',
    sourceFrameId: 'frame-rollback-1',
    status: 'committed'
  },
  autoRollback: true,
  preOutcomeRevision: 19
});
assert.equal(rollbackDecision.decision.action, 'rollbackPending');
assert.equal(rollbackDecision.decision.legacyProjection.sourceProjectionStatus, 'recoveryRequired');
assert.equal(rollbackDecision.decision.legacyProjection.recoveryJournalStatus, 'rollbackPending');
assert.equal(rollbackDecision.decision.legacyProjection.returnedAction, 'rolledBack');
assert.equal(rollbackDecision.decision.legacyProjection.shouldRestoreRevision, true);
assert.equal(rollbackDecision.decision.legacyProjection.restoreRevision, 19);
const rollbackActuation = repairRuntime.evaluateRollbackActuation({
  coreRecovery: rollbackDecision,
  eventTime: '2026-06-22T01:00:19.000Z'
});
assert.equal(rollbackActuation.kind, 'directive.repairRollbackActuationDecision.v1');
assert.equal(rollbackActuation.authorized, true);
assert.equal(rollbackActuation.action, 'restorePreOutcomeRevision');
assert.equal(rollbackActuation.restoreRevision, 19);
assert.equal(rollbackActuation.ingressId, 'ingress-rollback-1');
assert.equal(rollbackActuation.transactionId, 'txn-rollback-1');
const rollbackRecovery = coreStore.readProjections().recoveryJournal.find((entry) => entry.transactionId === 'txn-rollback-1');
assert.deepEqual(rollbackRecovery.allowedActions, ['rollbackToPreOutcomeRevision', 'reviewSourceMutation']);

await coreStore.beginTurn({
  id: 'frame-no-revision-rollback',
  hostMessageId: 'player-no-revision-rollback',
  chatId: 'ashes-chat',
  textHash: hashStableJson({ text: 'Rollback requested without a tracked revision.' })
}, {
  transactionId: 'txn-no-revision-rollback',
  ingressId: 'ingress-no-revision-rollback',
  idempotencyKey: 'begin:txn-no-revision-rollback'
});
const noRevisionRollback = await repairRuntime.recordSourceMutationRecovery({
  eventType: 'playerMessageDeleted',
  hostMessageId: 'player-no-revision-rollback',
  ingress: {
    id: 'ingress-no-revision-rollback',
    coreTransactionId: 'txn-no-revision-rollback',
    outcomeId: 'outcome-no-revision-rollback',
    sourceFrameId: 'frame-no-revision-rollback',
    status: 'committed'
  },
  autoRollback: true,
  preOutcomeRevision: null
});
assert.equal(noRevisionRollback.decision.action, 'reviewRequired');
assert.equal(noRevisionRollback.decision.legacyProjection.recoveryJournalStatus, 'reviewRequired');
assert.equal(noRevisionRollback.decision.legacyProjection.returnedAction, 'reviewRequired');
assert.equal(noRevisionRollback.decision.legacyProjection.shouldRestoreRevision, false);
assert.equal(noRevisionRollback.decision.legacyProjection.restoreRevision, null);
const noRevisionRollbackActuation = repairRuntime.evaluateRollbackActuation({
  coreRecovery: noRevisionRollback,
  eventTime: '2026-06-22T01:00:20.000Z'
});
assert.equal(noRevisionRollbackActuation.authorized, false);
assert.equal(noRevisionRollbackActuation.action, 'blockRollbackActuation');
assert.equal(noRevisionRollbackActuation.restoreRevision, null);
const noRevisionRecovery = coreStore.readProjections().recoveryJournal.find((entry) => entry.transactionId === 'txn-no-revision-rollback');
assert.deepEqual(noRevisionRecovery.allowedActions, ['reviewSourceMutation', 'rerunFromSource', 'branchFromPriorRevision']);

await coreStore.beginTurn({
  id: 'frame-visibility-1',
  hostMessageId: 'player-visibility',
  chatId: 'ashes-chat',
  textHash: hashStableJson({ text: 'Visibility-only source row.' })
}, {
  transactionId: 'txn-visibility-1',
  ingressId: 'ingress-visibility-1',
  idempotencyKey: 'begin:txn-visibility-1'
});
const recoveryCountBeforeVisibility = coreStore.readProjections().recoveryJournal.length;
const diagnosticCountBeforeVisibility = coreStore.state.diagnostics.length;
const visibilityOnly = await repairRuntime.recordVisibilityMutation({
  eventType: 'hostMessageVisibilityChanged',
  hostMessageId: 'player-visibility',
  ingress: {
    id: 'ingress-visibility-1',
    coreTransactionId: 'txn-visibility-1',
    sourceFrameId: 'frame-visibility-1',
    status: 'committed'
  },
  message: {
    id: 'player-visibility',
    is_user: true,
    extra: {
      sc_ghosted: true,
      vectfox: { promptExcluded: true }
    }
  },
  index: 32,
  chatMetadata: {
    STMemoryBooks: {
      unhiddenIndices: [32]
    },
    summaryception: {
      ghostedIndices: [32]
    },
    vectFox: {
      promptExcludedIndices: [32]
    }
  }
});
assert.equal(visibilityOnly.status, 'recorded');
assert.equal(visibilityOnly.decision.kind, 'directive.repairVisibilityDecision.v1');
assert.equal(visibilityOnly.decision.action, 'visibilityOnlySourceRow');
assert.equal(visibilityOnly.decision.normalTurnAllowed, false);
assert.equal(visibilityOnly.decision.recoveryRequired, false);
assert.equal(visibilityOnly.visibility.sourceRowExists, true);
assert.equal(visibilityOnly.visibility.sourceMutation, false);
assert.equal(visibilityOnly.visibility.ghostedBySummaryception, true);
assert.equal(visibilityOnly.visibility.promptExcludedByVectFox, true);
assert.equal(visibilityOnly.visibility.unhiddenByMemoryBooks, true);
assert.equal(coreStore.readProjections().recoveryJournal.length, recoveryCountBeforeVisibility, 'visibility-only observation must not create CORE recovery.');
assert.equal(coreStore.state.diagnostics.length, diagnosticCountBeforeVisibility + 1, 'visibility-only observation should be diagnostic-only.');
const visibilityDiagnostic = coreStore.state.diagnostics.at(-1);
assert.equal(visibilityDiagnostic.type, 'sourceVisibilityMutation');
assert.equal(visibilityDiagnostic.redactedPayload.decision.action, 'visibilityOnlySourceRow');
assert.equal(visibilityDiagnostic.redactedPayload.visibility.promptExcludedByVectFox, true);
assert.equal(JSON.stringify(visibilityDiagnostic).includes('Visibility-only source row'), false);
const duplicateVisibility = await repairRuntime.recordVisibilityMutation({
  eventType: 'hostMessageVisibilityChanged',
  hostMessageId: 'player-visibility',
  ingress: {
    id: 'ingress-visibility-1',
    coreTransactionId: 'txn-visibility-1',
    sourceFrameId: 'frame-visibility-1',
    status: 'committed'
  },
  message: {
    id: 'player-visibility',
    is_user: true,
    extra: {
      sc_ghosted: true,
      vectfox: { promptExcluded: true }
    }
  },
  index: 32,
  chatMetadata: {
    STMemoryBooks: { unhiddenIndices: [32] },
    summaryception: { ghostedIndices: [32] },
    vectFox: { promptExcludedIndices: [32] }
  }
});
assert.equal(duplicateVisibility.status, 'duplicate');
assert.equal(coreStore.state.diagnostics.length, diagnosticCountBeforeVisibility + 1, 'duplicate visibility observation must not write another diagnostic.');

const summarizedOnly = await repairRuntime.recordVisibilityMutation({
  eventType: 'hostMessageVisibilityChanged',
  hostMessageId: 'player-summary-only',
  ingress: {
    id: 'ingress-summary-only',
    coreTransactionId: 'txn-visibility-1',
    sourceFrameId: 'frame-visibility-1',
    status: 'committed'
  },
  message: {
    id: 'player-summary-only',
    is_user: true
  },
  index: 31,
  chatMetadata: {
    summaryception: {
      summarizedUpTo: 31
    }
  }
});
assert.equal(summarizedOnly.status, 'notRecorded');
assert.equal(summarizedOnly.reason, 'no-visibility-mutation');
assert.equal(summarizedOnly.decision.action, 'sourceRowContinues');
assert.equal(summarizedOnly.visibility.summarizedBySummaryception, true);
assert.equal(summarizedOnly.visibility.visibilityMutationOnly, false);

const deletePrecedence = await repairRuntime.recordVisibilityMutation({
  eventType: 'hostMessageVisibilityChanged',
  hostMessageId: 'player-visibility-delete',
  ingress: {
    id: 'ingress-visibility-delete',
    coreTransactionId: 'txn-visibility-1',
    sourceFrameId: 'frame-visibility-1',
    status: 'committed'
  },
  message: {
    id: 'player-visibility-delete',
    is_user: true,
    deleted: true,
    extra: {
      sc_ghosted: true,
      vectfox_prompt_ghosted: true
    }
  },
  index: 33,
  chatMetadata: {
    STMemoryBooks: { unhiddenIndices: [33] },
    summaryception: { ghostedIndices: [33] },
    vectFox: { promptExcludedIndices: [33] }
  }
});
assert.equal(deletePrecedence.status, 'sourceMutationDetected');
assert.equal(deletePrecedence.decision.action, 'sourceMutationDetected');
assert.equal(deletePrecedence.decision.recoveryRequired, true);
assert.equal(deletePrecedence.visibility.sourceMutation, true);
assert.equal(deletePrecedence.visibility.visibilityMutationOnly, false);
assert.equal(deletePrecedence.visibility.sourceMutationReasons.includes('host-delete'), true);

const hostUnavailableDecision = repairRuntime.evaluateResponseRecovery({
  eventType: 'hostNativeAssistantUnavailable',
  observationStatus: 'unavailable',
  ingress: {
    id: 'ingress-host-unavailable',
    coreTransactionId: 'txn-host-unavailable',
    outcomeId: 'outcome-host-unavailable',
    sourceFrameId: 'frame-host-unavailable'
  },
  responseId: 'response-host-unavailable',
  turnId: 'turn-host-unavailable'
});
assert.equal(hostUnavailableDecision.kind, 'directive.repairResponseRecoveryDecision.v1');
assert.equal(hostUnavailableDecision.eventType, 'hostNativeAssistantUnavailable');
assert.equal(hostUnavailableDecision.responseStatus, 'unavailable');
assert.equal(hostUnavailableDecision.phaseAfter, 'recoveryRequired');
assert.equal(hostUnavailableDecision.responseRetry, false);
assert.deepEqual(hostUnavailableDecision.allowedActions, ['reobserveHostAssistantRows', 'reviewHostNativeAvailability']);
assert.equal(hostUnavailableDecision.reobserveHostAssistantRows, true);
assert.equal(hostUnavailableDecision.retryHostGeneration, false);
assert.equal(hostUnavailableDecision.normalTurnAllowed, false);

const hostContradictionDecision = repairRuntime.evaluateResponseRecovery({
  eventType: 'hostNativeContinuityContradiction',
  observationStatus: 'completed',
  ingress: {
    id: 'ingress-host-contradiction',
    coreTransactionId: 'txn-host-contradiction',
    outcomeId: 'outcome-host-contradiction',
    sourceFrameId: 'frame-host-contradiction'
  },
  responseId: 'response-host-contradiction',
  turnId: 'turn-host-contradiction',
  error: {
    code: 'DIRECTIVE_HOST_NATIVE_CONTINUITY_CONTRADICTION',
    message: 'Raw contradiction details should be hashed only.'
  }
});
assert.equal(hostContradictionDecision.kind, 'directive.repairResponseRecoveryDecision.v1');
assert.equal(hostContradictionDecision.eventType, 'hostNativeContinuityContradiction');
assert.equal(hostContradictionDecision.responseStatus, 'recoveryRequired');
assert.equal(hostContradictionDecision.phaseAfter, 'recoveryRequired');
assert.equal(hostContradictionDecision.responseRetry, false);
assert.equal(hostContradictionDecision.retryHostGeneration, false);
assert.equal(hostContradictionDecision.sreReviewRequired, true);
assert.deepEqual(hostContradictionDecision.allowedActions, ['reviewHostNativeContinuityContradiction', 'fallbackDirectiveResponse', 'branchFromPriorRevision']);

await coreStore.beginTurn({
  id: 'frame-response-recovery-failed',
  hostMessageId: 'player-response-recovery-failed',
  chatId: 'ashes-chat',
  textHash: hashStableJson({ text: 'Host continuation failed.' })
}, {
  transactionId: 'txn-response-recovery-failed',
  ingressId: 'ingress-response-recovery-failed',
  idempotencyKey: 'begin:txn-response-recovery-failed'
});
await coreStore.advanceTurn('txn-response-recovery-failed', {
  phase: 'routePending',
  route: 'hostContinue',
  idempotencyKey: 'route:txn-response-recovery-failed'
});
await coreStore.advanceTurn('txn-response-recovery-failed', {
  phase: 'hostContinueReleased',
  reason: 'host-generation-released-before-failure',
  idempotencyKey: 'release:txn-response-recovery-failed'
});
const hostFailedRecovery = await repairRuntime.recordResponseRecovery({
  eventType: 'hostNativeGenerationFailed',
  observationStatus: 'failed',
  ingress: {
    id: 'ingress-response-recovery-failed',
    coreTransactionId: 'txn-response-recovery-failed',
    outcomeId: 'outcome-response-recovery-failed',
    sourceFrameId: 'frame-response-recovery-failed'
  },
  responseId: 'response-response-recovery-failed',
  turnId: 'turn-response-recovery-failed',
  error: {
    code: 'HOST_GENERATION_FAILED',
    message: 'Raw host provider failure should be hashed only.'
  }
});
assert.equal(hostFailedRecovery.status, 'recorded');
assert.equal(hostFailedRecovery.decision.eventType, 'hostNativeGenerationFailed');
assert.equal(hostFailedRecovery.decision.responseStatus, 'responseRetryRequired');
assert.equal(hostFailedRecovery.decision.phaseAfter, 'responseRetryRequired');
assert.equal(hostFailedRecovery.decision.responseRetry, true);
assert.equal(hostFailedRecovery.decision.retryHostGeneration, true);
assert.equal(hostFailedRecovery.decision.reobserveHostAssistantRows, true);
assert.deepEqual(hostFailedRecovery.decision.allowedActions, ['reobserveHostAssistantRows', 'retryHostGeneration', 'fallbackDirectiveResponse', 'reviewHostGenerationFailure']);
const hostFailedProjection = coreStore.readProjections().recoveryJournal.find((entry) => entry.transactionId === 'txn-response-recovery-failed');
assert.equal(hostFailedProjection.phase, 'responseRetryRequired');
assert.equal(hostFailedProjection.repairDecision.kind, 'directive.repairResponseRecoveryDecision.v1');
assert.equal(hostFailedProjection.repairDecision.eventType, 'hostNativeGenerationFailed');
assert.deepEqual(hostFailedProjection.allowedActions, ['reobserveHostAssistantRows', 'retryHostGeneration', 'fallbackDirectiveResponse', 'reviewHostGenerationFailure']);
assert.equal(JSON.stringify(coreStore.state).includes('Raw host provider failure should be hashed only.'), false);

await coreStore.beginTurn({
  id: 'frame-response-post-failure',
  hostMessageId: 'player-response-post-failure',
  chatId: 'ashes-chat',
  textHash: hashStableJson({ text: 'Directive response post failure.' })
}, {
  transactionId: 'txn-response-post-failure',
  ingressId: 'ingress-response-post-failure',
  idempotencyKey: 'begin:txn-response-post-failure'
});
await coreStore.advanceTurn('txn-response-post-failure', {
  phase: 'routePending',
  route: 'directiveCommit',
  idempotencyKey: 'route:txn-response-post-failure'
});
const directivePostRecovery = await repairRuntime.recordResponseRecovery({
  eventType: 'hostResponsePostFailure',
  reason: 'host-response-post-failure',
  ingress: {
    id: 'ingress-response-post-failure',
    coreTransactionId: 'txn-response-post-failure',
    outcomeId: 'outcome-response-post-failure',
    sourceFrameId: 'frame-response-post-failure'
  },
  turnId: 'turn-response-post-failure',
  recoveryId: 'recovery:response-post-failure-test',
  error: {
    code: 'POST_FAILED',
    message: 'Raw post failure should be hashed only.'
  }
});
assert.equal(directivePostRecovery.status, 'recorded');
assert.equal(directivePostRecovery.decision.eventType, 'hostResponsePostFailure');
assert.equal(directivePostRecovery.decision.responseStatus, 'responseRetryRequired');
assert.equal(directivePostRecovery.decision.retryDirectiveResponse, true);
assert.equal(directivePostRecovery.decision.retryHostGeneration, false);
assert.deepEqual(directivePostRecovery.decision.allowedActions, ['retryResponse']);
const directivePostProjection = coreStore.readProjections().recoveryJournal.find((entry) => entry.transactionId === 'txn-response-post-failure');
assert.equal(directivePostProjection.repairDecision.eventType, 'hostResponsePostFailure');
assert.deepEqual(directivePostProjection.allowedActions, ['retryResponse']);
assert.equal(JSON.stringify(coreStore.state).includes('Raw post failure should be hashed only.'), false);

const dependentReobserve = repairRuntime.evaluateSourceReobserve({
  eventType: 'playerMessageReobserved',
  stage: 'before-reobserve-dependent-source',
  ingress: {
    id: 'ingress-dependent-reobserve',
    hostMessageId: 'player-dependent-reobserve',
    textHash: 'hash-before-edit',
    status: 'recoveryRequired',
    outcomeId: 'outcome-dependent-reobserve',
    sourceFrameId: 'frame-dependent-reobserve',
    coreTransactionId: 'txn-dependent-reobserve',
    invalidatedAt: '2026-06-22T01:00:10.000Z',
    invalidationType: 'playerMessageEdited'
  },
  hasDependentResponse: true,
  observedHostMessageId: 'player-dependent-reobserve',
  observedTextHash: 'hash-after-edit'
});
assert.equal(dependentReobserve.kind, 'directive.repairSourceReobserveDecision.v1');
assert.equal(dependentReobserve.action, 'blockDependentSourceReobserve');
assert.equal(dependentReobserve.normalTurnAllowed, false);
assert.equal(dependentReobserve.recoveryRequired, true);
assert.equal(dependentReobserve.hasDependentResponse, true);
assert.equal(dependentReobserve.reasons.includes('dependent-response'), true);
assert.equal(dependentReobserve.reasons.includes('status:recoveryRequired'), true);
assert.equal(dependentReobserve.reasons.includes('invalidated'), true);
assert.equal(dependentReobserve.reasons.includes('text-hash-changed'), true);
assert.equal(dependentReobserve.transactionId, 'txn-dependent-reobserve');

const latestRestart = repairRuntime.evaluateSourceReobserve({
  eventType: 'playerMessageReobserved',
  stage: 'before-latest-boundary-restart',
  ingress: {
    id: 'ingress-latest-restart',
    hostMessageId: 'player-latest-restart',
    textHash: 'hash-before-latest-edit',
    status: 'invalidated',
    sourceFrameId: 'frame-latest-restart',
    coreTransactionId: 'txn-latest-restart',
    invalidatedAt: '2026-06-22T01:00:20.000Z',
    invalidationType: 'playerMessageEdited'
  },
  isLatestActionablePlayerRow: true,
  hasDependentAssistant: false,
  hasCommittedOutcome: false,
  priorRecovery: {
    id: 'recovery-latest-restart'
  },
  observedHostMessageId: 'player-latest-restart',
  observedTextHash: 'hash-after-latest-edit'
});
assert.equal(latestRestart.action, 'restartLatestSource');
assert.equal(latestRestart.normalTurnAllowed, true);
assert.equal(latestRestart.recoveryRequired, false);
assert.equal(latestRestart.isLatestActionablePlayerRow, true);
assert.equal(latestRestart.hasDependentResponse, false);
assert.equal(latestRestart.recoveryResolution.allowed, true);
assert.equal(latestRestart.recoveryResolution.priorRecoveryId, 'recovery-latest-restart');
assert.equal(latestRestart.reasons.includes('text-hash-changed'), true);

const dependentLatestRestart = repairRuntime.evaluateSourceReobserve({
  eventType: 'playerMessageReobserved',
  stage: 'before-latest-boundary-restart',
  ingress: {
    id: 'ingress-latest-dependent',
    hostMessageId: 'player-latest-dependent',
    textHash: 'hash-before-dependent-edit',
    status: 'invalidated',
    outcomeId: 'outcome-latest-dependent'
  },
  isLatestActionablePlayerRow: true,
  hasDependentAssistant: true,
  hasCommittedOutcome: true,
  observedHostMessageId: 'player-latest-dependent',
  observedTextHash: 'hash-after-dependent-edit'
});
assert.equal(dependentLatestRestart.action, 'blockDependentSourceReobserve');
assert.equal(dependentLatestRestart.normalTurnAllowed, false);
assert.equal(dependentLatestRestart.recoveryRequired, true);
assert.equal(dependentLatestRestart.hasDependentAssistant, true);
assert.equal(dependentLatestRestart.hasCommittedOutcome, true);
assert.equal(dependentLatestRestart.reasons.includes('dependent-response'), true);

const ordinaryReobserve = repairRuntime.evaluateSourceReobserve({
  eventType: 'playerMessageReobserved',
  stage: 'before-classification',
  ingress: {
    id: 'ingress-ordinary-reobserve',
    hostMessageId: 'player-ordinary-reobserve',
    textHash: 'hash-ordinary',
    status: 'classifying'
  },
  hasDependentResponse: false,
  observedHostMessageId: 'player-ordinary-reobserve',
  observedTextHash: 'hash-ordinary'
});
assert.equal(ordinaryReobserve.action, 'allowSourceReobserve');
assert.equal(ordinaryReobserve.normalTurnAllowed, true);
assert.equal(ordinaryReobserve.recoveryRequired, false);
assert.deepEqual(ordinaryReobserve.reasons, []);

const missingReobserve = repairRuntime.evaluateSourceReobserve({
  eventType: 'playerMessageReobserved',
  stage: 'after-classify',
  ingress: null,
  observedHostMessageId: 'player-missing-reobserve',
  observedTextHash: 'hash-missing'
});
assert.equal(missingReobserve.action, 'blockStaleSourceReobserve');
assert.equal(missingReobserve.normalTurnAllowed, false);
assert.equal(missingReobserve.reasons.includes('missing-ingress'), true);

const noCore = await repairRuntime.recordSourceMutationRecovery({
  eventType: 'playerMessageEdited',
  hostMessageId: 'player-no-core',
  ingress: {
    id: 'ingress-no-core',
    status: 'classified'
  }
});
assert.equal(noCore.status, 'notRecorded');
assert.equal(noCore.reason, 'no-core-transaction');
assert.equal(noCore.decision.action, 'invalidateProjection');
assert.equal(noCore.decision.legacyProjection.sourceProjectionStatus, 'invalidated');
assert.equal(noCore.decision.legacyProjection.returnedAction, 'invalidated');

const unavailableRepair = createRepairRuntime({ coreTurnStore: null });
await assert.rejects(
  () => unavailableRepair.recordSourceMutationRecovery({
    eventType: 'playerMessageEdited',
    hostMessageId: 'player-missing-writer',
    ingress: {
      id: 'ingress-missing-writer',
      coreTransactionId: 'txn-missing-writer'
    }
  }),
  (error) => error?.code === 'DIRECTIVE_CORE_RECOVERY_WRITER_UNAVAILABLE'
);

console.log('REPAIR runtime tests passed: source-mutation boundary, source reobserve policy, response recovery policy, legacy projections, CORE-first recovery, idempotency, visibility-only diagnostics, response edits, and redaction');
