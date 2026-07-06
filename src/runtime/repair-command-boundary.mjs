import { createRepairRuntime } from './repair-runtime.mjs';
import { readRuntimeCoreProjectionsAsync } from './runtime-ledger-view.mjs';
import { initializeCampaignRuntimeTracking } from './state-delta-gateway.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasCompactCoreCheckpointRef(ref = null) {
  if (!isObject(ref)) return false;
  return Boolean(String(ref.checkpointId || ref.id || '').trim());
}

function responseProjectionRows(projections = {}) {
  return Array.isArray(projections?.responses)
    ? projections.responses
    : (Array.isArray(projections?.responseLedger) ? projections.responseLedger : []);
}

function coreStoreReadProjectionsForPersistence(projections = {}) {
  if (!isObject(projections)) return {};
  const next = cloneJson(projections);
  const responses = responseProjectionRows(next);
  if (responses.length) next.responses = responses;
  delete next.responseLedger;
  return next;
}

function emptyRuntimeLedgerRowsForRollbackRestore() {
  return {
    ingressLedger: [],
    responseLedger: [],
    recoveryJournal: []
  };
}

function hasCoreProjections(projections = {}) {
  return Boolean(
    Array.isArray(projections.ingressLedger) && projections.ingressLedger.length
    || responseProjectionRows(projections).length
    || Array.isArray(projections.recoveryJournal) && projections.recoveryJournal.length
  );
}

function modelCallJournalForRollbackRestore() {
  return [];
}

function responseLedgerRevisionForRollbackRestore(projections = {}) {
  return Math.max(0, Number(projections.responseLedgerRevision) || 0);
}

function coreCheckpointRestoreState(input = {}) {
  return input.coreCheckpointRestoreState
    || input.coreCheckpointSnapshot
    || input.restoreSnapshot
    || input.restoreCampaignState
    || input.rollbackActuation?.coreCheckpointRestoreState
    || input.rollbackActuation?.restoreSnapshot
    || null;
}

async function restoreFromCheckpointSnapshot(campaignState = null, checkpointState = null, restoreRevision = null, {
  coreTurnStore = null,
  now = null,
  reason = 'Recovered prior campaign revision.'
} = {}) {
  if (!isObject(campaignState) || !isObject(checkpointState)) return null;
  const current = initializeCampaignRuntimeTracking(campaignState);
  const restored = initializeCampaignRuntimeTracking(cloneJson(checkpointState), {
    historyLimit: current.runtimeTracking.historyLimit
  });
  const runtimeProjections = await readRuntimeCoreProjectionsAsync(current, { coreTurnStore });
  if (hasCoreProjections(runtimeProjections)) {
    restored.directiveRuntimeEvidence = {
      ...(isObject(restored.directiveRuntimeEvidence) ? cloneJson(restored.directiveRuntimeEvidence) : {}),
      coreStoreReadProjections: coreStoreReadProjectionsForPersistence(runtimeProjections)
    };
  }
  const runtimeTrackingLedgers = emptyRuntimeLedgerRowsForRollbackRestore();
  restored.runtimeTracking = {
    ...restored.runtimeTracking,
    revision: Number.isFinite(Number(restoreRevision)) ? Number(restoreRevision) : current.runtimeTracking.revision,
    history: [],
    historyIndex: -1,
    ingressLedger: runtimeTrackingLedgers.ingressLedger,
    responseLedger: runtimeTrackingLedgers.responseLedger,
    responseLedgerRevision: responseLedgerRevisionForRollbackRestore(runtimeProjections),
    sidecarJournal: [],
    modelCallJournal: modelCallJournalForRollbackRestore(),
    lifecycleJournal: [],
    pendingInteractions: [],
    endConditionLedger: {
      schemaVersion: 1,
      activeDecisionId: null,
      detections: [],
      decisions: [],
      branchRecords: [],
      continuationFrames: []
    },
    activeIngressId: current.runtimeTracking.activeIngressId || null,
    recoveryJournal: runtimeTrackingLedgers.recoveryJournal,
    lastDelta: {
      source: 'recovery',
      reason,
      summary: reason,
      domains: ['runtimeTracking'],
      revision: Number.isFinite(Number(restoreRevision)) ? Number(restoreRevision) : current.runtimeTracking.revision
    }
  };
  return restored;
}

export function createRepairCommandBoundary(options = {}) {
  const repairRuntime = options.repairRuntime || createRepairRuntime(options);

  function handleSourceMutation(input = {}) {
    return repairRuntime.recordSourceMutationRecovery(input);
  }

  function handleVisibilityMutation(input = {}) {
    return repairRuntime.recordVisibilityMutation(input);
  }

  function planResponseFailure(input = {}) {
    return repairRuntime.evaluateResponseRecovery(input);
  }

  function handleResponseFailure(input = {}) {
    return repairRuntime.recordResponseRecovery(input);
  }

  function handleHostNativeContinuityContradiction(input = {}) {
    return repairRuntime.recordResponseRecovery({
      ...input,
      eventType: 'hostNativeContinuityContradiction',
      observationStatus: 'completed',
      reason: 'hostNativeContinuityContradiction'
    });
  }

  function authorizeRetry(input = {}) {
    return repairRuntime.evaluateResponseRetryActuation(input);
  }

  function authorizeRollback(input = {}) {
    return repairRuntime.evaluateRollbackActuation(input);
  }

  function authorizeCommittedOutcomeDeleteRollback(input = {}) {
    if (typeof repairRuntime.evaluateCommittedOutcomeDeleteRollbackActuation === 'function') {
      return repairRuntime.evaluateCommittedOutcomeDeleteRollbackActuation(input);
    }
    return repairRuntime.evaluateRollbackActuation(input);
  }

  function recordRollbackActuation(input = {}) {
    if (typeof repairRuntime.recordRollbackActuation !== 'function') {
      return {
        status: 'notRecorded',
        reason: 'repair-rollback-record-unavailable',
        transactionId: input.coreRecovery?.transactionId || input.rollbackActuation?.transactionId || null
      };
    }
    return repairRuntime.recordRollbackActuation(input);
  }

  async function executeRollbackActuation(input = {}) {
    const rollbackActuation = input.rollbackActuation || {};
    const restoreRevision = Number(rollbackActuation.restoreRevision);
    if (rollbackActuation.authorized !== true || !Number.isFinite(restoreRevision)) {
      return {
        status: 'blocked',
        reason: 'repair-rollback-not-authorized'
      };
    }
    const campaignState = input.campaignState;
    if (!campaignState || typeof campaignState !== 'object') {
      return {
        status: 'blocked',
        reason: 'campaign-state-unavailable'
      };
    }
    const coreCheckpointRef = rollbackActuation.coreCheckpointRef
      || input.coreCheckpointRef
      || input.coreRecovery?.coreCheckpointRef
      || input.coreRecovery?.sourceMutation?.coreCheckpointRef
      || input.coreRecovery?.decision?.coreCheckpointRef
      || input.coreRecovery?.repairDecision?.coreCheckpointRef
      || input.repairProjection?.coreCheckpointRef
      || null;
    if (!hasCompactCoreCheckpointRef(coreCheckpointRef)) {
      return {
        status: 'blocked',
        reason: 'rollback-core-checkpoint-ref-required',
        errorCode: 'DIRECTIVE_REPAIR_ROLLBACK_CORE_CHECKPOINT_REF_REQUIRED'
      };
    }
    const restoreSnapshot = coreCheckpointRestoreState(input);
    if (!isObject(restoreSnapshot)) {
      return {
        status: 'blocked',
        reason: 'rollback-core-checkpoint-required',
        errorCode: 'DIRECTIVE_REPAIR_ROLLBACK_CORE_CHECKPOINT_REQUIRED'
      };
    }
    const restored = await restoreFromCheckpointSnapshot(campaignState, restoreSnapshot, restoreRevision, {
      coreTurnStore: input.coreTurnStore || options.coreTurnStore || null,
      now: options.now,
      reason: input.reason || `${input.eventType || rollbackActuation.eventType || 'sourceMutation'} rolled the campaign back before a dependent outcome.`
    });
    if (!restored) {
      return {
        status: 'blocked',
        reason: 'rollback-restore-unavailable',
        errorCode: 'DIRECTIVE_STATE_SNAPSHOT_NOT_FOUND'
      };
    }
    const recorded = await recordRollbackActuation(input);
    if (recorded?.status !== 'recorded') return recorded;
    return {
      ...recorded,
      status: 'applied',
      campaignState: restored
    };
  }

  function evaluateSourceReobserve(input = {}) {
    return repairRuntime.evaluateSourceReobserve(input);
  }

  function authorizeRerunBranch(input = {}) {
    if (typeof repairRuntime.evaluateOutcomeRerunActuation !== 'function') {
      const outcomeId = input.outcomeId || input.ledgerEntry?.outcomeId || null;
      return {
        kind: 'directive.repairOutcomeRerunActuationDecision.v1',
        eventType: 'outcomeRerunRequested',
        sourceKind: 'committedOutcome',
        authorized: false,
        action: 'blockOutcomeRerun',
        reason: 'repair-rerun-authority-unavailable',
        deniedReason: 'repair-rerun-authority-unavailable',
        outcomeId,
        replacementType: input.requestedType || input.type || 'rerunOutcome',
        mechanicsRerunAuthorized: false,
        normalTurnAllowed: false
      };
    }
    return repairRuntime.evaluateOutcomeRerunActuation({
      ...input,
      requestedType: input.requestedType || input.type || 'rerunOutcome'
    });
  }

  function authorizeTerminalCheckpointReplay(input = {}) {
    if (typeof repairRuntime.evaluateTerminalCheckpointReplayActuation !== 'function') {
      return {
        kind: 'directive.repairTerminalCheckpointReplayActuationDecision.v1',
        eventType: 'terminalCheckpointReplayRequested',
        sourceKind: 'terminalOutcomeCheckpoint',
        authorized: false,
        action: 'blockTerminalCheckpointReplay',
        requestedAction: input.action || 'restoreTerminalCheckpointSnapshot',
        reason: 'repair-terminal-checkpoint-replay-authority-unavailable',
        deniedReason: 'repair-terminal-checkpoint-replay-authority-unavailable',
        decisionId: input.decisionId || input.interactionId || null,
        interactionId: input.interactionId || input.decisionId || null,
        conditionId: input.conditionId || null,
        turnId: input.turnId || null,
        outcomeId: input.outcomeId || null,
        snapshotSourceKind: input.snapshotSourceKind || null,
        snapshotPresent: input.snapshotPresent === true,
        snapshotHash: input.snapshotHash || null,
        runtimeRevision: input.runtimeRevision ?? null,
        ledgerRevision: input.ledgerRevision ?? null,
        allowedActions: ['reviewTerminalCheckpointReplayRequest'],
        normalTurnAllowed: false
      };
    }
    return repairRuntime.evaluateTerminalCheckpointReplayActuation({
      ...input,
      action: input.action || 'restoreTerminalCheckpointSnapshot'
    });
  }

  function authorizeReobserveClosure(input = {}) {
    return repairRuntime.evaluateResponseReobserveClosure(input);
  }

  return {
    handleSourceMutation,
    handleVisibilityMutation,
    planResponseFailure,
    handleResponseFailure,
    handleHostNativeContinuityContradiction,
    authorizeRetry,
    authorizeRollback,
    authorizeCommittedOutcomeDeleteRollback,
    authorizeRerunBranch,
    authorizeTerminalCheckpointReplay,
    authorizeReobserveClosure,
    evaluateSourceReobserve,
    recordRollbackActuation,
    executeRollbackActuation,

    // Compatibility aliases while old recovery call sites become projections.
    recordSourceMutationRecovery: handleSourceMutation,
    recordVisibilityMutation: handleVisibilityMutation,
    evaluateResponseRecovery: planResponseFailure,
    recordResponseRecovery: handleResponseFailure,
    recordHostNativeContinuityContradiction: handleHostNativeContinuityContradiction,
    evaluateResponseRetryActuation: authorizeRetry,
    evaluateCommittedOutcomeDeleteRollbackActuation: authorizeCommittedOutcomeDeleteRollback,
    evaluateOutcomeRerunActuation: authorizeRerunBranch,
    evaluateTerminalCheckpointReplayActuation: authorizeTerminalCheckpointReplay,
    evaluateRollbackActuation: authorizeRollback,
    recordRollbackExecution: recordRollbackActuation,
    executeRollbackExecution: executeRollbackActuation,
    evaluateResponseReobserveClosure: authorizeReobserveClosure
  };
}
