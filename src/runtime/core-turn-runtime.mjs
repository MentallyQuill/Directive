export function createCoreTurnRuntime({ coreStore } = {}) {
  if (!coreStore) {
    throw new Error('createCoreTurnRuntime requires a CORE Store instance');
  }

  return {
    observeSource(sourceFrame, options = {}) {
      return coreStore.beginTurn(sourceFrame, options);
    },
    releaseHostContinue(transactionId, release = {}) {
      return coreStore.advanceTurn(transactionId, {
        ...release,
        phase: 'hostContinueReleased'
      });
    },
    routePending(transactionId, route = {}) {
      return coreStore.advanceTurn(transactionId, {
        ...route,
        phase: 'routePending'
      });
    },
    recordPendingInteraction(transactionId, interaction = {}) {
      if (typeof coreStore.recordPendingInteraction === 'function') {
        return coreStore.recordPendingInteraction(transactionId, interaction);
      }
      void transactionId;
      void interaction;
      const error = new Error('CORE pending interaction projections require a CORE Store recordPendingInteraction writer');
      error.code = 'DIRECTIVE_CORE_PENDING_INTERACTION_PROJECTION_REQUIRED';
      throw error;
    },
    resolvePendingInteraction(transactionId, interactionId, resolution = {}) {
      if (typeof coreStore.resolvePendingInteraction === 'function') {
        return coreStore.resolvePendingInteraction(transactionId, interactionId, resolution);
      }
      void transactionId;
      void interactionId;
      void resolution;
      const error = new Error('CORE pending interaction resolution projections require a CORE Store resolvePendingInteraction writer');
      error.code = 'DIRECTIVE_CORE_PENDING_INTERACTION_PROJECTION_REQUIRED';
      throw error;
    },
    commitDirectiveMechanics(transactionId, mechanicsBundle = {}) {
      return coreStore.commitMechanics(transactionId, mechanicsBundle);
    },
    recordVisibleResponse(transactionId, responseRef = {}) {
      return coreStore.recordVisibleResponse(transactionId, responseRef);
    },
    recordOutcomeReplacement(transactionId, replacementRef = {}) {
      return coreStore.recordOutcomeReplacement(transactionId, replacementRef);
    },
    recordRollbackActuation(transactionId, rollback = {}) {
      return coreStore.recordRollbackActuation(transactionId, rollback);
    },
    repairVisibleResponseRef(transactionId, responseRef = {}) {
      return coreStore.repairVisibleResponseRef(transactionId, responseRef);
    },
    openRecovery(transactionId, recoveryBundle = {}) {
      return coreStore.markRecoveryRequired(transactionId, recoveryBundle);
    },
    settleBackgroundBatch(transactionId, operationBundle = {}) {
      return coreStore.commitBackgroundBatch(transactionId, operationBundle);
    },
    appendDiagnostic(transactionId, diagnostic = {}) {
      return coreStore.appendDiagnostics(transactionId, diagnostic);
    },
    appendDiagnosticsBatch(transactionId, diagnostics = []) {
      if (typeof coreStore.appendDiagnosticsBatch === 'function') {
        return coreStore.appendDiagnosticsBatch(transactionId, diagnostics);
      }
      return Promise.all((Array.isArray(diagnostics) ? diagnostics : [diagnostics])
        .map((diagnostic) => coreStore.appendDiagnostics(transactionId, diagnostic)));
    },
    readProjections() {
      return typeof coreStore.readProjections === 'function' ? coreStore.readProjections() : null;
    },
    estimateSize() {
      return typeof coreStore.estimateSize === 'function' ? coreStore.estimateSize() : null;
    }
  };
}
