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
    commitDirectiveMechanics(transactionId, mechanicsBundle = {}) {
      return coreStore.commitMechanics(transactionId, mechanicsBundle);
    },
    recordVisibleResponse(transactionId, responseRef = {}) {
      return coreStore.recordVisibleResponse(transactionId, responseRef);
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
    readProjections() {
      return typeof coreStore.readProjections === 'function' ? coreStore.readProjections() : null;
    },
    estimateSize() {
      return typeof coreStore.estimateSize === 'function' ? coreStore.estimateSize() : null;
    }
  };
}
