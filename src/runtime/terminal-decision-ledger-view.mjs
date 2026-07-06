import { readRuntimeCoreProjections } from './runtime-ledger-view.mjs';

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

export function normalizeTerminalDecisionLedger(input = {}) {
  const source = isObject(input) ? input : {};
  const detections = Array.isArray(source.detections)
    ? cloneJson(source.detections.filter((entry) => isTerminalDecisionProjectionRow(entry, 'detection')))
    : [];
  const decisions = Array.isArray(source.decisions)
    ? cloneJson(source.decisions.filter((entry) => isTerminalDecisionProjectionRow(entry, 'decision')))
    : [];
  const branchRecords = Array.isArray(source.branchRecords)
    ? cloneJson(source.branchRecords.filter((entry) => isTerminalDecisionProjectionRow(entry, 'branchRecord')))
    : [];
  const continuationFrames = Array.isArray(source.continuationFrames)
    ? cloneJson(source.continuationFrames.filter((entry) => isTerminalDecisionProjectionRow(entry, 'continuationFrame')))
    : [];
  const activeDecisionId = compact(source.activeDecisionId);
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

export function emptyTerminalDecisionLedger() {
  return {
    schemaVersion: 1,
    activeDecisionId: null,
    detections: [],
    decisions: [],
    branchRecords: [],
    continuationFrames: []
  };
}

export function terminalDecisionLedgerView(campaignState = {}, options = {}) {
  const projections = readRuntimeCoreProjections(campaignState, options);
  return normalizeTerminalDecisionLedger(projections?.terminalDecisionLedger);
}

export function withTerminalDecisionLedgerProjection(campaignState = {}, ledger = {}) {
  const normalized = normalizeTerminalDecisionLedger(ledger);
  const next = cloneJson(campaignState);
  next.directiveRuntimeEvidence = {
    ...(isObject(next.directiveRuntimeEvidence) ? cloneJson(next.directiveRuntimeEvidence) : {}),
    coreStoreReadProjections: {
      kind: 'directive.coreStoreReadProjections.v1',
      ...(isObject(next.directiveRuntimeEvidence?.coreStoreReadProjections)
        ? cloneJson(next.directiveRuntimeEvidence.coreStoreReadProjections)
        : {}),
      runtimeAuthority: 'coreStoreV2',
      terminalDecisionLedger: normalized
    }
  };
  if (isObject(next.runtimeTracking)) {
    next.runtimeTracking = {
      ...next.runtimeTracking,
      endConditionLedger: emptyTerminalDecisionLedger()
    };
    delete next.runtimeTracking.directiveRuntimeEvidence;
  }
  return {
    ...next
  };
}
