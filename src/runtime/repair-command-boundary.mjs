import { createRepairRuntime } from './repair-runtime.mjs';

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

  function authorizeRetry(input = {}) {
    return repairRuntime.evaluateResponseRetryActuation(input);
  }

  function authorizeRollback(input = {}) {
    return repairRuntime.evaluateRollbackActuation(input);
  }

  function evaluateSourceReobserve(input = {}) {
    return repairRuntime.evaluateSourceReobserve(input);
  }

  function authorizeRerunBranch(input = {}) {
    return evaluateSourceReobserve({
      ...input,
      requestedAction: input.requestedAction || 'rerunFromSource'
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
    authorizeRetry,
    authorizeRollback,
    authorizeRerunBranch,
    authorizeReobserveClosure,
    evaluateSourceReobserve,

    // Compatibility aliases while old recovery call sites become projections.
    recordSourceMutationRecovery: handleSourceMutation,
    recordVisibilityMutation: handleVisibilityMutation,
    evaluateResponseRecovery: planResponseFailure,
    recordResponseRecovery: handleResponseFailure,
    evaluateResponseRetryActuation: authorizeRetry,
    evaluateRollbackActuation: authorizeRollback,
    evaluateResponseReobserveClosure: authorizeReobserveClosure
  };
}
