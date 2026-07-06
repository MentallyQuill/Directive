import assert from 'node:assert/strict';

import { createRepairRuntime, __repairRuntimeTestHooks } from '../../src/runtime/repair-runtime.mjs';
import { createRepairCommandBoundary } from '../../src/runtime/repair-command-boundary.mjs';
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
assert.equal(playerEdit.decision.repairProjection.kind, 'directive.repairProjection.v2');
assert.equal(playerEdit.decision.repairProjection.sourceProjectionStatus, 'recoveryRequired');
assert.equal(playerEdit.decision.repairProjection.recoveryJournalStatus, 'reviewRequired');
assert.equal(playerEdit.decision.repairProjection.returnedAction, 'reviewRequired');

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
assert.equal(playerRecovery.repairDecision.repairProjection.sourceProjectionStatus, 'recoveryRequired');
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
assert.equal(responseEdit.decision.repairProjection.responseProjectionStatus, 'recoveryRequired');
assert.equal(responseEdit.decision.repairProjection.recoveryJournalStatus, 'reviewRequired');
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
const rollbackCoreCheckpointRef = {
  kind: 'directive.coreMechanicsCheckpointRef.v1',
  checkpointId: 'checkpoint-rollback-1',
  sourceKind: 'coreStoreV2.checkpoint',
  sourceRevision: 19,
  layout: 'core'
};
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
  preOutcomeRevision: 19,
  coreCheckpointRef: rollbackCoreCheckpointRef
});
assert.equal(rollbackDecision.decision.action, 'rollbackPending');
assert.equal(rollbackDecision.decision.repairProjection.sourceProjectionStatus, 'recoveryRequired');
assert.equal(rollbackDecision.decision.repairProjection.recoveryJournalStatus, 'rollbackPending');
assert.equal(rollbackDecision.decision.repairProjection.returnedAction, 'rolledBack');
assert.equal(rollbackDecision.decision.repairProjection.shouldRestoreRevision, true);
assert.equal(rollbackDecision.decision.repairProjection.restoreRevision, 19);
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
assert.equal(rollbackActuation.coreCheckpointRef.checkpointId, 'checkpoint-rollback-1');
const rollbackRecovery = coreStore.readProjections().recoveryJournal.find((entry) => entry.transactionId === 'txn-rollback-1');
assert.deepEqual(rollbackRecovery.allowedActions, ['rollbackToPreOutcomeRevision', 'reviewSourceMutation']);
const revisionOnlyRollbackActuation = __repairRuntimeTestHooks.buildRollbackActuationDecision({
  decision: {
    sourceKind: 'playerIngress',
    action: 'rollbackPending',
    transactionId: 'txn-revision-only-rollback',
    sourceMutation: {
      sourceKind: 'playerIngress',
      ingressId: 'ingress-revision-only-rollback',
      preOutcomeRevision: 19
    },
    repairProjection: {
      shouldRestoreRevision: true,
      restoreRevision: 19
    }
  },
  eventTime: '2026-06-22T01:00:19.500Z'
});
assert.equal(revisionOnlyRollbackActuation.authorized, false, 'REPAIR rollback must not authorize from restoreRevision without CORE checkpoint ref.');
assert.equal(revisionOnlyRollbackActuation.deniedReason, 'repair-rollback-core-checkpoint-ref-missing');
assert.equal(revisionOnlyRollbackActuation.coreCheckpointRef, null);

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
assert.equal(noRevisionRollback.decision.repairProjection.recoveryJournalStatus, 'reviewRequired');
assert.equal(noRevisionRollback.decision.repairProjection.returnedAction, 'reviewRequired');
assert.equal(noRevisionRollback.decision.repairProjection.shouldRestoreRevision, false);
assert.equal(noRevisionRollback.decision.repairProjection.restoreRevision, null);
const noRevisionRollbackActuation = repairRuntime.evaluateRollbackActuation({
  coreRecovery: noRevisionRollback,
  eventTime: '2026-06-22T01:00:20.000Z'
});
assert.equal(noRevisionRollbackActuation.authorized, false);
assert.equal(noRevisionRollbackActuation.action, 'blockRollbackActuation');
assert.equal(noRevisionRollbackActuation.restoreRevision, null);
const noRevisionRecovery = coreStore.readProjections().recoveryJournal.find((entry) => entry.transactionId === 'txn-no-revision-rollback');
assert.deepEqual(noRevisionRecovery.allowedActions, ['reviewSourceMutation', 'rerunFromSource', 'branchFromPriorRevision']);

let rollbackRecordCalls = 0;
const rollbackBoundary = createRepairCommandBoundary({
  repairRuntime: {
    recordRollbackActuation(input = {}) {
      rollbackRecordCalls += 1;
      return {
        status: 'recorded',
        transactionId: input.rollbackActuation?.transactionId || null,
        rollback: cloneJson(input.rollbackActuation || {})
      };
    }
  }
});
const checkpointRollback = await rollbackBoundary.executeRollbackActuation({
  campaignState: {
    campaign: { id: 'campaign-legacy-rollback-current' },
    runtimeTracking: {
      revision: 44,
      historyLimit: 8,
      ingressLedger: [{ id: 'legacy-ingress-rollback-restore', hostMessageId: 'legacy-player' }],
      responseLedger: [{ id: 'legacy-response-rollback-restore', hostMessageId: 'legacy-assistant' }],
      recoveryJournal: [{ id: 'legacy-recovery-rollback-restore', status: 'reviewRequired' }]
    }
  },
  restoreSnapshot: {
    campaign: { id: 'campaign-legacy-rollback-restored' },
    runtimeTracking: {
      revision: 7,
      ingressLedger: [{ id: 'checkpoint-old-ingress-should-not-survive' }],
      responseLedger: [{ id: 'checkpoint-old-response-should-not-survive' }],
      recoveryJournal: [{ id: 'checkpoint-old-recovery-should-not-survive' }]
    }
  },
  rollbackActuation: {
    authorized: true,
    transactionId: 'txn-legacy-rollback-restore',
    restoreRevision: 7,
    eventType: 'playerMessageDeleted',
    coreCheckpointRef: {
      kind: 'directive.coreMechanicsCheckpointRef.v1',
      checkpointId: 'checkpoint-boundary-rollback',
      sourceKind: 'coreStoreV2.checkpoint',
      sourceRevision: 7
    }
  },
  reason: 'test rollback restore must not revive old runtime ledgers'
});
assert.equal(checkpointRollback.status, 'applied');
assert.deepEqual(checkpointRollback.campaignState.runtimeTracking.ingressLedger, [], 'Checkpoint rollback restore must not revive current old ingress ledger rows.');
assert.deepEqual(checkpointRollback.campaignState.runtimeTracking.responseLedger, [], 'Checkpoint rollback restore must not revive current old response ledger rows.');
assert.deepEqual(checkpointRollback.campaignState.runtimeTracking.recoveryJournal, [], 'Checkpoint rollback restore must not revive current old recovery rows.');
assert.equal(checkpointRollback.campaignState.runtimeTracking.revision, 7);
assert.equal(rollbackRecordCalls, 1);
const rollbackRecordCallsBeforeNoRef = rollbackRecordCalls;
const noRefCheckpointRollback = await rollbackBoundary.executeRollbackActuation({
  campaignState: {
    campaign: { id: 'campaign-no-ref-rollback-current' },
    runtimeTracking: { revision: 11, history: [] }
  },
  restoreSnapshot: {
    campaign: { id: 'campaign-no-ref-rollback-restored' },
    runtimeTracking: { revision: 7 }
  },
  rollbackActuation: {
    authorized: true,
    transactionId: 'txn-no-ref-rollback-restore',
    restoreRevision: 7,
    eventType: 'playerMessageDeleted'
  }
});
assert.equal(noRefCheckpointRollback.status, 'blocked');
assert.equal(noRefCheckpointRollback.reason, 'rollback-core-checkpoint-ref-required');
assert.equal(noRefCheckpointRollback.errorCode, 'DIRECTIVE_REPAIR_ROLLBACK_CORE_CHECKPOINT_REF_REQUIRED');
assert.equal(rollbackRecordCalls, rollbackRecordCallsBeforeNoRef, 'CORE rollback actuation must not record when compact checkpoint ref is missing.');

const deleteRollbackFromLegacySnapshot = __repairRuntimeTestHooks.buildCommittedOutcomeDeleteRollbackActuationDecision({
  decision: {
    transactionId: 'txn-delete-legacy-snapshot',
    outcomeId: 'outcome-delete-legacy-snapshot'
  },
  ledgerEntry: {
    coreTransactionId: 'txn-delete-legacy-snapshot',
    outcomeId: 'outcome-delete-legacy-snapshot',
    snapshotBeforeRetained: true,
    snapshotBefore: {
      runtimeTracking: {
        revision: 42
      }
    }
  },
  eventTime: '2026-06-22T01:00:21.000Z'
});
assert.equal(deleteRollbackFromLegacySnapshot.authorized, false, 'Committed outcome delete rollback must not use old snapshotBefore.runtimeTracking revision as authority.');
assert.equal(deleteRollbackFromLegacySnapshot.restoreRevision, null);

const deleteRollbackFromRepairProjectionNoRef = __repairRuntimeTestHooks.buildCommittedOutcomeDeleteRollbackActuationDecision({
  decision: {
    transactionId: 'txn-delete-core-projection',
    outcomeId: 'outcome-delete-core-projection'
  },
  ledgerEntry: {
    coreTransactionId: 'txn-delete-core-projection',
    outcomeId: 'outcome-delete-core-projection',
    snapshotBeforeRetained: true,
    snapshotBefore: {
      runtimeTracking: {
        revision: 99
      }
    }
  },
  repairProjection: {
    shouldRestoreRevision: true,
    restoreRevision: 7
  },
  sourceMutation: {
    preOutcomeRevision: 7
  },
  eventTime: '2026-06-22T01:00:22.000Z'
});
assert.equal(deleteRollbackFromRepairProjectionNoRef.authorized, false, 'Committed outcome delete rollback must not authorize from repairProjection.restoreRevision alone.');
assert.equal(deleteRollbackFromRepairProjectionNoRef.deniedReason, 'repair-rollback-core-checkpoint-ref-missing');
assert.equal(deleteRollbackFromRepairProjectionNoRef.restoreRevision, 7);

const deleteRollbackFromRepairProjection = __repairRuntimeTestHooks.buildCommittedOutcomeDeleteRollbackActuationDecision({
  decision: {
    transactionId: 'txn-delete-core-projection',
    outcomeId: 'outcome-delete-core-projection'
  },
  ledgerEntry: {
    coreTransactionId: 'txn-delete-core-projection',
    outcomeId: 'outcome-delete-core-projection',
    snapshotBeforeRetained: true,
    snapshotSourceKind: 'coreStoreV2.checkpoint',
    coreCheckpointRef: {
      kind: 'directive.coreMechanicsCheckpointRef.v1',
      checkpointId: 'checkpoint-delete-core-projection',
      sourceKind: 'coreStoreV2.checkpoint',
      sourceRevision: 7,
      layout: 'core'
    },
    snapshotBefore: {
      runtimeTracking: {
        revision: 99
      }
    }
  },
  repairProjection: {
    shouldRestoreRevision: true,
    restoreRevision: 7
  },
  sourceMutation: {
    preOutcomeRevision: 7
  },
  eventTime: '2026-06-22T01:00:22.500Z'
});
assert.equal(deleteRollbackFromRepairProjection.authorized, true, 'Committed outcome delete rollback should use REPAIR/CORE restore revision evidence.');
assert.equal(deleteRollbackFromRepairProjection.restoreRevision, 7);
assert.equal(deleteRollbackFromRepairProjection.coreCheckpointRef.checkpointId, 'checkpoint-delete-core-projection');

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
  id: 'frame-host-contradiction-core-revision',
  hostMessageId: 'player-host-contradiction-core-revision',
  chatId: 'ashes-chat',
  textHash: hashStableJson({ text: 'Host contradiction with CORE revision authority.' })
}, {
  transactionId: 'txn-host-contradiction-core-revision',
  ingressId: 'ingress-host-contradiction-core-revision',
  idempotencyKey: 'begin:txn-host-contradiction-core-revision'
});
const hostContradictionCoreRevision = await repairRuntime.recordResponseRecovery({
  eventType: 'hostNativeContinuityContradiction',
  observationStatus: 'completed',
  ingress: {
    id: 'ingress-host-contradiction-core-revision',
    coreTransactionId: 'txn-host-contradiction-core-revision',
    outcomeId: 'outcome-host-contradiction-core-revision',
    sourceFrameId: 'frame-host-contradiction-core-revision'
  },
  responseId: 'response-host-contradiction-core-revision',
  turnId: 'turn-host-contradiction-core-revision',
  campaignState: {
    runtimeTracking: { revision: 99 },
    directiveRuntimeEvidence: {
      coreStoreReadProjections: {
        kind: 'directive.coreStoreReadProjections.v1',
        runtimeAuthority: 'coreStoreV2',
        revisions: { runtime: 7 }
      }
    }
  },
  continuityReview: {
    kind: 'directive.sreHostNativeContinuityReview.v1',
    ok: false,
    checkedFactCount: 1,
    findings: [{
      factId: 'crew.hadrik-bronn.species',
      kind: 'protected-fact-contradiction',
      severity: 'blocker'
    }],
    sreReview: {
      source: {
        responseId: 'response-host-contradiction-core-revision',
        ingressId: 'ingress-host-contradiction-core-revision',
        hostMessageId: 'assistant-host-contradiction-core-revision',
        textHash: 'host-contradiction-core-revision-text-hash'
      }
    }
  }
});
assert.equal(hostContradictionCoreRevision.status, 'recorded');
assert.equal(hostContradictionCoreRevision.compatibilityProjection.projectionHints[0].createdRevision, 7);
assert.equal(hostContradictionCoreRevision.compatibilityProjection.projectionHints[0].expiresRevision, 11);
assert.equal(
  hostContradictionCoreRevision.compatibilityProjection.factUseStats['crew.hadrik-bronn.species'].lastViolationRevision,
  7,
  'REPAIR host-native continuity projections must use CORE/v2 runtime revision instead of stale runtimeTracking.revision.'
);
const hostContradictionCoreProjection = coreStore.readProjections().continuityRecoveryProjection;
assert.equal(hostContradictionCoreProjection.factUseStats['crew.hadrik-bronn.species'].lastViolationRevision, 7);

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
const directiveRetryActuation = repairRuntime.evaluateResponseRetryActuation({
  recovery: {
    id: 'recovery:response-post-failure-test',
    outcomeId: 'outcome-response-post-failure',
    details: {
      repairDecision: directivePostRecovery.decision,
      turnId: 'turn-response-post-failure',
      sourceFrameId: 'frame-response-post-failure'
    }
  },
  transaction: coreStore.state.transactions['txn-response-post-failure'],
  responseId: 'response-post-failure-retry',
  eventTime: '2026-06-28T18:00:00.000Z'
});
assert.equal(directiveRetryActuation.kind, 'directive.repairResponseRetryActuationDecision.v1');
assert.equal(directiveRetryActuation.authorized, true);
assert.equal(directiveRetryActuation.recoveryResolved, true);
assert.equal(directiveRetryActuation.action, 'recordVisibleResponse');
assert.equal(directiveRetryActuation.reason, 'directive-response-retry-posted');
assert.equal(directiveRetryActuation.transactionId, 'txn-response-post-failure');
assert.equal(directiveRetryActuation.recoveryCaseId, 'recovery:response-post-failure-test');
assert.deepEqual(directiveRetryActuation.allowedActions, ['retryResponse']);
const deniedRetryActuation = repairRuntime.evaluateResponseRetryActuation({
  recovery: {
    id: 'recovery:continuity-response-test',
    details: {
      repairDecision: hostContradictionDecision
    }
  },
  transaction: {
    id: 'txn-continuity-response-test',
    phase: 'recoveryRequired',
    recoveryCaseId: 'recovery:continuity-response-test'
  }
});
assert.equal(deniedRetryActuation.authorized, false);
assert.equal(deniedRetryActuation.deniedReason, 'response-retry-event-type-not-eligible');

const outcomeRerunActuation = repairRuntime.evaluateOutcomeRerunActuation({
  outcomeId: 'outcome-rerun-authorized',
  requestedType: 'rerunOutcome',
  ledgerEntry: {
    turnId: 'turn-rerun-authorized',
    outcomeId: 'outcome-rerun-authorized',
    replacedTransactionId: 'txn-rerun-authorized',
    resultBand: 'Partial Success',
    snapshotBeforeRetained: true,
    snapshotPresent: true,
    snapshotSourceKind: 'coreStoreV2.checkpoint',
    coreCheckpointRef: {
      kind: 'directive.coreMechanicsCheckpointRef.v1',
      campaignId: 'campaign-rerun-authorized',
      saveId: 'save-rerun-authorized',
      checkpointId: 'checkpoint-rerun-authorized',
      layout: 'core',
      sourceKind: 'coreStoreV2.checkpoint'
    },
    narrationStatus: 'complete',
    responseStatus: 'complete'
  },
  eventTime: '2026-06-22T01:00:40.000Z'
});
assert.equal(outcomeRerunActuation.kind, 'directive.repairOutcomeRerunActuationDecision.v1');
assert.equal(outcomeRerunActuation.authorized, true);
assert.equal(outcomeRerunActuation.action, 'createRerunBranchCandidate');
assert.equal(outcomeRerunActuation.normalTurnAllowed, false);
assert.equal(outcomeRerunActuation.branchCandidateRequired, true);
assert.equal(outcomeRerunActuation.mechanicsRerunAuthorized, true);
assert.equal(outcomeRerunActuation.outcomeId, 'outcome-rerun-authorized');
assert.equal(outcomeRerunActuation.transactionId, null);
assert.equal(outcomeRerunActuation.replacedTransactionId, 'txn-rerun-authorized');
assert.equal(outcomeRerunActuation.replacementTransactionRequired, true);
assert.equal(outcomeRerunActuation.turnId, 'turn-rerun-authorized');
assert.equal(outcomeRerunActuation.replacementType, 'rerunOutcome');
assert.equal(outcomeRerunActuation.snapshotSourceKind, 'coreStoreV2.checkpoint');
assert.equal(outcomeRerunActuation.coreCheckpointRef.checkpointId, 'checkpoint-rerun-authorized');
assert.deepEqual(outcomeRerunActuation.allowedActions, ['previewRerunBranchCandidate', 'commitRerunBranchCandidate']);

const noCoreRerunActuation = repairRuntime.evaluateOutcomeRerunActuation({
  outcomeId: 'outcome-rerun-no-core',
  requestedType: 'rerunOutcome',
  ledgerEntry: {
    turnId: 'turn-rerun-no-core',
    outcomeId: 'outcome-rerun-no-core',
    resultBand: 'Partial Success',
    snapshotBeforeRetained: true,
    snapshotPresent: true,
    snapshotSourceKind: 'coreStoreV2.checkpoint',
    coreCheckpointRef: {
      checkpointId: 'checkpoint-rerun-no-core',
      sourceKind: 'coreStoreV2.checkpoint'
    },
    narrationStatus: 'complete'
  },
  eventTime: '2026-06-22T01:00:41.000Z'
});
assert.equal(noCoreRerunActuation.authorized, false);
assert.equal(noCoreRerunActuation.action, 'blockOutcomeRerun');
assert.equal(noCoreRerunActuation.reason, 'outcome-rerun-core-transaction-missing');
assert.equal(noCoreRerunActuation.replacedTransactionId, null);
assert.equal(noCoreRerunActuation.replacementTransactionRequired, false);
assert.equal(noCoreRerunActuation.coreTransactionRequired, true);
assert.equal(Object.prototype.hasOwnProperty.call(noCoreRerunActuation, 'legacyNoCoreRerunAllowed'), false);

const missingSnapshotRerunActuation = repairRuntime.evaluateOutcomeRerunActuation({
  outcomeId: 'outcome-rerun-missing-snapshot',
  requestedType: 'rerunOutcome',
  ledgerEntry: {
    turnId: 'turn-rerun-missing-snapshot',
    outcomeId: 'outcome-rerun-missing-snapshot',
    snapshotBeforeRetained: false
  }
});
assert.equal(missingSnapshotRerunActuation.authorized, false);
assert.equal(missingSnapshotRerunActuation.action, 'blockOutcomeRerun');
assert.equal(missingSnapshotRerunActuation.reason, 'outcome-rerun-snapshot-missing');
assert.equal(missingSnapshotRerunActuation.mechanicsRerunAuthorized, false);

const missingSnapshotEvidenceRerunActuation = repairRuntime.evaluateOutcomeRerunActuation({
  outcomeId: 'outcome-rerun-missing-snapshot-evidence',
  requestedType: 'rerunOutcome',
  ledgerEntry: {
    turnId: 'turn-rerun-missing-snapshot-evidence',
    outcomeId: 'outcome-rerun-missing-snapshot-evidence',
    snapshotBeforeRetained: true,
    snapshotPresent: false
  }
});
assert.equal(missingSnapshotEvidenceRerunActuation.authorized, false);
assert.equal(missingSnapshotEvidenceRerunActuation.action, 'blockOutcomeRerun');
assert.equal(missingSnapshotEvidenceRerunActuation.reason, 'outcome-rerun-snapshot-evidence-missing');
assert.equal(missingSnapshotEvidenceRerunActuation.mechanicsRerunAuthorized, false);

const missingCoreCheckpointRefRerunActuation = repairRuntime.evaluateOutcomeRerunActuation({
  outcomeId: 'outcome-rerun-missing-core-checkpoint-ref',
  requestedType: 'rerunOutcome',
  ledgerEntry: {
    turnId: 'turn-rerun-missing-core-checkpoint-ref',
    outcomeId: 'outcome-rerun-missing-core-checkpoint-ref',
    replacedTransactionId: 'txn-rerun-missing-core-checkpoint-ref',
    snapshotBeforeRetained: true,
    snapshotPresent: true,
    snapshotSourceKind: 'turnLedger.snapshotBefore'
  }
});
assert.equal(missingCoreCheckpointRefRerunActuation.authorized, false);
assert.equal(missingCoreCheckpointRefRerunActuation.action, 'blockOutcomeRerun');
assert.equal(missingCoreCheckpointRefRerunActuation.reason, 'outcome-rerun-core-checkpoint-ref-missing');
assert.equal(missingCoreCheckpointRefRerunActuation.coreCheckpointRef, null);
assert.equal(missingCoreCheckpointRefRerunActuation.mechanicsRerunAuthorized, false);

const rawSnapshotOnlyRerunActuation = repairRuntime.evaluateOutcomeRerunActuation({
  outcomeId: 'outcome-rerun-raw-snapshot-only',
  requestedType: 'rerunOutcome',
  ledgerEntry: {
    turnId: 'turn-rerun-raw-snapshot-only',
    outcomeId: 'outcome-rerun-raw-snapshot-only',
    snapshotBefore: {
      rawCanary: 'RAW_RERUN_SNAPSHOT_MUST_NOT_AUTHORIZE'
    }
  }
});
assert.equal(rawSnapshotOnlyRerunActuation.authorized, false);
assert.equal(rawSnapshotOnlyRerunActuation.reason, 'outcome-rerun-snapshot-missing');
assert.equal(JSON.stringify(rawSnapshotOnlyRerunActuation).includes('RAW_RERUN_SNAPSHOT_MUST_NOT_AUTHORIZE'), false);

const terminalReplayActuation = repairRuntime.evaluateTerminalCheckpointReplayActuation({
  decisionId: 'terminal-decision-authorized',
  interactionId: 'terminal-decision-authorized',
  conditionId: 'terminal.condition.authorized',
  turnId: 'turn-terminal-authorized',
  outcomeId: 'outcome-terminal-authorized',
  action: 'restoreTerminalCheckpointSnapshot',
  snapshotSourceKind: 'coreStoreV2.checkpoint',
  snapshotPresent: true,
  snapshotHash: 'hash-terminal-snapshot-authorized',
  coreCheckpointRef: {
    kind: 'directive.coreTerminalReplayCheckpointRef.v1',
    campaignId: 'campaign-terminal-authorized',
    saveId: 'save-terminal-authorized',
    checkpointId: 'checkpoint-terminal-authorized',
    layout: 'core',
    sourceKind: 'coreStoreV2.checkpoint'
  },
  runtimeRevision: 21,
  ledgerRevision: 20,
  snapshot: {
    rawCanary: 'RAW_TERMINAL_SNAPSHOT_MUST_NOT_AUTHORIZE'
  },
  eventTime: '2026-06-22T01:00:50.000Z'
});
assert.equal(terminalReplayActuation.kind, 'directive.repairTerminalCheckpointReplayActuationDecision.v1');
assert.equal(terminalReplayActuation.authorized, true);
assert.equal(terminalReplayActuation.action, 'restoreTerminalCheckpointSnapshot');
assert.equal(terminalReplayActuation.reason, 'terminal-checkpoint-replay-authorized');
assert.equal(terminalReplayActuation.decisionId, 'terminal-decision-authorized');
assert.equal(terminalReplayActuation.interactionId, 'terminal-decision-authorized');
assert.equal(terminalReplayActuation.conditionId, 'terminal.condition.authorized');
assert.equal(terminalReplayActuation.turnId, 'turn-terminal-authorized');
assert.equal(terminalReplayActuation.outcomeId, 'outcome-terminal-authorized');
assert.equal(terminalReplayActuation.snapshotSourceKind, 'coreStoreV2.checkpoint');
assert.equal(terminalReplayActuation.snapshotPresent, true);
assert.equal(terminalReplayActuation.snapshotHash, 'hash-terminal-snapshot-authorized');
assert.equal(terminalReplayActuation.coreCheckpointRef.checkpointId, 'checkpoint-terminal-authorized');
assert.equal(terminalReplayActuation.runtimeRevision, 21);
assert.equal(terminalReplayActuation.ledgerRevision, 20);
assert.deepEqual(terminalReplayActuation.allowedActions, ['restoreTerminalCheckpointSnapshot']);
assert.equal(terminalReplayActuation.normalTurnAllowed, false);
assert.equal(Object.hasOwn(terminalReplayActuation, 'snapshot'), false);
assert.equal(JSON.stringify(terminalReplayActuation).includes('RAW_TERMINAL_SNAPSHOT_MUST_NOT_AUTHORIZE'), false);

const missingCoreCheckpointRefTerminalReplayActuation = repairRuntime.evaluateTerminalCheckpointReplayActuation({
  decisionId: 'terminal-decision-missing-core-checkpoint-ref',
  interactionId: 'terminal-decision-missing-core-checkpoint-ref',
  conditionId: 'terminal.condition.missing-core-checkpoint-ref',
  turnId: 'turn-terminal-missing-core-checkpoint-ref',
  outcomeId: 'outcome-terminal-missing-core-checkpoint-ref',
  action: 'restoreTerminalCheckpointSnapshot',
  snapshotSourceKind: 'turnLedger.snapshotBefore',
  snapshotPresent: true,
  snapshotHash: 'hash-terminal-snapshot-without-core-checkpoint-ref'
});
assert.equal(missingCoreCheckpointRefTerminalReplayActuation.authorized, false);
assert.equal(missingCoreCheckpointRefTerminalReplayActuation.action, 'blockTerminalCheckpointReplay');
assert.equal(missingCoreCheckpointRefTerminalReplayActuation.reason, 'terminal-checkpoint-replay-core-checkpoint-ref-missing');
assert.equal(missingCoreCheckpointRefTerminalReplayActuation.deniedReason, 'terminal-checkpoint-replay-core-checkpoint-ref-missing');
assert.equal(missingCoreCheckpointRefTerminalReplayActuation.coreCheckpointRef, null);
assert.deepEqual(missingCoreCheckpointRefTerminalReplayActuation.allowedActions, ['reviewTerminalCheckpointReplayRequest']);

const missingSnapshotTerminalReplayActuation = repairRuntime.evaluateTerminalCheckpointReplayActuation({
  decisionId: 'terminal-decision-missing-snapshot',
  interactionId: 'terminal-decision-missing-snapshot',
  conditionId: 'terminal.condition.missing',
  turnId: 'turn-terminal-missing',
  outcomeId: 'outcome-terminal-missing',
  action: 'restoreTerminalCheckpointSnapshot',
  snapshotSourceKind: 'turnLedger.snapshotBefore',
  snapshotPresent: false
});
assert.equal(missingSnapshotTerminalReplayActuation.kind, 'directive.repairTerminalCheckpointReplayActuationDecision.v1');
assert.equal(missingSnapshotTerminalReplayActuation.authorized, false);
assert.equal(missingSnapshotTerminalReplayActuation.action, 'blockTerminalCheckpointReplay');
assert.equal(missingSnapshotTerminalReplayActuation.reason, 'terminal-checkpoint-replay-snapshot-evidence-missing');
assert.equal(missingSnapshotTerminalReplayActuation.deniedReason, 'terminal-checkpoint-replay-snapshot-evidence-missing');
assert.equal(missingSnapshotTerminalReplayActuation.snapshotPresent, false);
assert.equal(missingSnapshotTerminalReplayActuation.snapshotHash, null);
assert.deepEqual(missingSnapshotTerminalReplayActuation.allowedActions, ['reviewTerminalCheckpointReplayRequest']);
assert.equal(missingSnapshotTerminalReplayActuation.normalTurnAllowed, false);

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

const untrackedDependentProjection = await repairRuntime.recordSourceMutationRecovery({
  eventType: 'sceneHandshakeSourceEdited',
  hostMessageId: 'assistant-untracked-dependent',
  replacementText: 'RAW_REPAIR_PROJECTION_SHOULD_NOT_PERSIST',
  campaignState: {
    sceneHandshake: {
      settled: [{
        id: 'settlement-untracked-a',
        status: 'settled',
        previousAssistantHostMessageId: 'assistant-untracked-dependent',
        currentPlayerHostMessageId: 'player-after-untracked-a'
      }, {
        id: 'settlement-untracked-b',
        status: 'settled',
        sourceMessageIds: ['assistant-untracked-dependent']
      }, {
        id: 'settlement-unrelated',
        status: 'settled',
        previousAssistantHostMessageId: 'assistant-unrelated'
      }],
      lastResult: {
        id: 'settlement-untracked-a',
        status: 'settled',
        previousAssistantHostMessageId: 'assistant-untracked-dependent'
      }
    },
    knowledgeLedger: {
      components: {
        records: [{
          id: 'component-untracked-a',
          source: {
            hostMessageId: 'assistant-untracked-dependent',
            sourceStatus: 'active'
          }
        }, {
          id: 'component-untracked-b',
          source: {
            hostMessageId: 'assistant-untracked-dependent',
            sourceStatus: 'active'
          }
        }, {
          id: 'component-unrelated',
          source: {
            hostMessageId: 'assistant-unrelated',
            sourceStatus: 'active'
          }
        }]
      }
    }
  }
});
assert.equal(untrackedDependentProjection.status, 'notRecorded');
assert.equal(untrackedDependentProjection.reason, 'no-core-transaction');
assert.equal(untrackedDependentProjection.sourceMutation.sourceKind, 'untrackedHostMessage');
assert.equal(untrackedDependentProjection.sourceMutation.replacementTextHash.length, 64);
assert.equal(untrackedDependentProjection.sourceMutation.replacementTextPresent, true);
assert.deepEqual(
  untrackedDependentProjection.decision.dependentInvalidation.sceneHandshake.settlementIds,
  ['settlement-untracked-a', 'settlement-untracked-b']
);
assert.deepEqual(
  untrackedDependentProjection.decision.dependentInvalidation.missionComponents.componentIds,
  ['component-untracked-a', 'component-untracked-b']
);
assert.equal(untrackedDependentProjection.decision.dependentInvalidation.missionComponents.sourceStatus, 'stale');
assert.deepEqual(untrackedDependentProjection.decision.dependentInvalidation.promptDirtyDomains, ['sceneHandshake', 'missionComponents']);
assert.equal(JSON.stringify(untrackedDependentProjection).includes('RAW_REPAIR_PROJECTION_SHOULD_NOT_PERSIST'), false);

const untrackedDeletedProjection = await repairRuntime.recordSourceMutationRecovery({
  eventType: 'sceneHandshakeSourceDeleted',
  hostMessageId: 'assistant-untracked-dependent',
  campaignState: {
    knowledgeLedger: {
      components: {
        records: [{
          id: 'component-delete-projection',
          source: {
            hostMessageId: 'assistant-untracked-dependent',
            sourceStatus: 'active'
          }
        }]
      }
    }
  }
});
assert.equal(untrackedDeletedProjection.decision.dependentInvalidation.missionComponents.sourceStatus, 'deleted');

const staleAfterDeletedProjection = await repairRuntime.recordSourceMutationRecovery({
  eventType: 'sceneHandshakeSourceEdited',
  hostMessageId: 'assistant-untracked-dependent',
  campaignState: {
    knowledgeLedger: {
      components: {
        records: [{
          id: 'component-stays-deleted',
          source: {
            hostMessageId: 'assistant-untracked-dependent',
            sourceStatus: 'deleted'
          }
        }, {
          id: 'component-can-be-stale',
          source: {
            hostMessageId: 'assistant-untracked-dependent',
            sourceStatus: 'active'
          }
        }]
      }
    }
  }
});
assert.deepEqual(
  staleAfterDeletedProjection.decision.dependentInvalidation.missionComponents.componentIds,
  ['component-can-be-stale']
);
assert.equal(staleAfterDeletedProjection.decision.dependentInvalidation.missionComponents.sourceStatus, 'stale');

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
assert.equal(noCore.decision.repairProjection.sourceProjectionStatus, 'invalidated');
assert.equal(noCore.decision.repairProjection.returnedAction, 'invalidated');

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

console.log('REPAIR runtime tests passed: source-mutation boundary, source reobserve policy, response recovery policy, REPAIR projections, CORE-first recovery, idempotency, visibility-only diagnostics, response edits, and redaction');
