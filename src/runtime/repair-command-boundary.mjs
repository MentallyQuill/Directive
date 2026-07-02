import { createRepairRuntime } from './repair-runtime.mjs';
import { restoreTrackedCampaignRevision } from './state-delta-gateway.mjs';

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
    let restored;
    try {
      restored = restoreTrackedCampaignRevision(campaignState, restoreRevision, {
        now: options.now,
        reason: input.reason || `${input.eventType || rollbackActuation.eventType || 'sourceMutation'} rolled the campaign back before a dependent outcome.`
      });
    } catch (error) {
      if (error?.code !== 'DIRECTIVE_STATE_SNAPSHOT_NOT_FOUND') throw error;
      return {
        status: 'blocked',
        reason: 'rollback-restore-unavailable',
        errorCode: error.code
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
