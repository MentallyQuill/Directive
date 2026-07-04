function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function isTerminalDecisionProjectionRow(entry = {}, rowKind = null) {
  return (
    isObject(entry)
    && compact(entry.authority) === 'terminalDecisionProjection'
    && isObject(entry.coreProjection)
    && compact(entry.coreProjection.kind) === 'directive.terminalEndConditionLedgerProjectionRef.v1'
    && (!rowKind || compact(entry.coreProjection.rowKind) === rowKind)
  );
}

export function terminalDecisionLedgerView(campaignState = {}) {
  const input = isObject(campaignState?.runtimeTracking?.endConditionLedger)
    ? campaignState.runtimeTracking.endConditionLedger
    : {};
  const detections = Array.isArray(input.detections)
    ? cloneJson(input.detections.filter((entry) => isTerminalDecisionProjectionRow(entry, 'detection')))
    : [];
  const decisions = Array.isArray(input.decisions)
    ? cloneJson(input.decisions.filter((entry) => isTerminalDecisionProjectionRow(entry, 'decision')))
    : [];
  const branchRecords = Array.isArray(input.branchRecords)
    ? cloneJson(input.branchRecords.filter((entry) => isTerminalDecisionProjectionRow(entry, 'branchRecord')))
    : [];
  const continuationFrames = Array.isArray(input.continuationFrames)
    ? cloneJson(input.continuationFrames.filter((entry) => isTerminalDecisionProjectionRow(entry, 'continuationFrame')))
    : [];
  const activeDecisionId = compact(input.activeDecisionId);
  return {
    schemaVersion: 1,
    activeDecisionId: activeDecisionId && decisions.some((decision) => compact(decision.id) === activeDecisionId && decision.status === 'pending')
      ? activeDecisionId
      : null,
    detections,
    decisions,
    branchRecords,
    continuationFrames
  };
}

export function withTerminalDecisionLedgerProjection(campaignState = {}, ledger = {}) {
  const normalized = terminalDecisionLedgerView({
    runtimeTracking: {
      endConditionLedger: ledger
    }
  });
  return {
    ...cloneJson(campaignState),
    runtimeTracking: {
      ...(campaignState.runtimeTracking || {}),
      endConditionLedger: normalized
    }
  };
}
