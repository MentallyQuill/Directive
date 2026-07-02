/**
 * Authoritative campaign mutation gateway.
 *
 * The bounded snapshot journal and redo truncation model are adapted from the
 * Multihog DnD Framework's chat-linked memo history, generalized here for
 * structured Directive campaign domains and durable per-turn recovery.
 */

import { validateCommandBearingEvidenceProposal } from '../command/command-bearing.mjs';
import { normalizeContinuityState } from '../continuity/state.mjs';

export const DIRECTIVE_MUTABLE_STATE_DOMAINS = Object.freeze([
  'campaign',
  'player',
  'crew',
  'ship',
  'mission',
  'worldState',
  'timeLedger',
  'storyArcLedger',
  'questLedger',
  'dynamicQuestCatalog',
  'knowledgeLedger',
  'threadLedger',
  'eventLedger',
  'endConditionLedger',
  'attentionState',
  'pressureLedger',
  'relationships',
  'commandCulture',
  'commandBearing',
  'commandCompetence',
  'values',
  'directives',
  'campaignTracks',
  'campaignAssets',
  'turnLedger',
  'commandLog',
  'captainState',
  'campaignChatBinding',
  'activationJournal',
  'conclusion',
  'continuity',
  'runtimeTracking'
]);

const DEFAULT_HISTORY_LIMIT = 8;
const DEFAULT_INGRESS_LIMIT = 200;
const DEFAULT_RESPONSE_LIMIT = 200;
const FORBIDDEN_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function deepMerge(base, patch) {
  if (!isObject(patch)) return cloneJson(patch);
  const next = isObject(base) ? cloneJson(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (FORBIDDEN_PATH_KEYS.has(key)) {
      const error = new Error(`State patch contains forbidden key "${key}".`);
      error.code = 'DIRECTIVE_STATE_PATH_FORBIDDEN';
      throw error;
    }
    if (value === undefined) continue;
    if (isObject(value) && isObject(next[key])) {
      next[key] = deepMerge(next[key], value);
    } else {
      next[key] = cloneJson(value);
    }
  }
  return next;
}

function bounded(values, limit) {
  const source = Array.isArray(values) ? values : [];
  return source.slice(Math.max(0, source.length - Math.max(1, limit)));
}

function compactTurnLedgerEntrySnapshot(entry) {
  if (!isObject(entry)) return entry;
  return {
    turnId: compact(entry.turnId) || null,
    outcomeId: compact(entry.outcomeId) || null,
    resultBand: compact(entry.resultBand) || null,
    narratorSourceOutcomeId: compact(entry.narratorSourceOutcomeId) || null,
    commandLogSourceOutcomeId: compact(entry.commandLogSourceOutcomeId) || null,
    narrationStatus: compact(entry.narrationStatus) || null,
    responseStatus: compact(entry.responseStatus) || null,
    snapshotBefore: null,
    narration: entry.narration ? {
      sourceOutcomeId: compact(entry.narration.sourceOutcomeId) || null,
      providerId: compact(entry.narration.providerId) || null,
      generatedAt: compact(entry.narration.generatedAt) || null
    } : null,
    narrationFailureCount: Array.isArray(entry.narrationFailures) ? entry.narrationFailures.length : 0,
    narrationRevisionCount: Array.isArray(entry.narrationRevisions) ? entry.narrationRevisions.length : 0
  };
}

function compactTurnLedgerSnapshot(value) {
  if (!isObject(value)) return value;
  return {
    ...cloneJson(value),
    entries: Array.isArray(value.entries)
      ? value.entries.map(compactTurnLedgerEntrySnapshot)
      : []
  };
}

function runtimeTrackingDefaults({ historyLimit = DEFAULT_HISTORY_LIMIT } = {}) {
  return {
    schemaVersion: 2,
    revision: 0,
    mechanicsRevision: 0,
    historyLimit: Math.max(2, Number(historyLimit) || DEFAULT_HISTORY_LIMIT),
    historyIndex: -1,
    history: [],
    lastDelta: null,
    ingressLedger: [],
    responseLedger: [],
    responseLedgerRevision: 0,
    recoveryJournal: [],
    lifecycleJournal: [],
    sidecarJournal: [],
    modelCallJournal: [],
    sceneReconciliation: {
      schemaVersion: 2,
      markers: { start: null, end: null },
      runs: [],
      pending: [],
      applied: [],
      rejected: [],
      recalculationPreviews: [],
      chunkCache: [],
      invalidations: [],
      lastRunId: null,
      lastResult: null
    },
    sceneHandshake: {
      schemaVersion: 1,
      settled: [],
      pendingInternalReview: [],
      deferred: [],
      operatorRecovery: [],
      rejected: [],
      lastResult: null
    },
    pendingInteractions: [],
    endConditionLedger: {
      schemaVersion: 1,
      activeDecisionId: null,
      detections: [],
      decisions: [],
      branchRecords: [],
      continuationFrames: []
    },
    activeIngressId: null,
    lastStableRevision: 0
  };
}

function normalizedTracking(value, options = {}) {
  const defaults = runtimeTrackingDefaults(options);
  const input = isObject(value) ? value : {};
  return {
    ...defaults,
    ...cloneJson(input),
    schemaVersion: 2,
    revision: Math.max(0, Number(input.revision) || 0),
    mechanicsRevision: Math.max(0, Number(input.mechanicsRevision) || 0),
    historyLimit: Math.max(2, Number(input.historyLimit || options.historyLimit) || defaults.historyLimit),
    historyIndex: Number.isInteger(input.historyIndex) ? input.historyIndex : -1,
    history: Array.isArray(input.history) ? cloneJson(input.history) : [],
    ingressLedger: Array.isArray(input.ingressLedger) ? cloneJson(input.ingressLedger) : [],
    responseLedger: Array.isArray(input.responseLedger) ? cloneJson(input.responseLedger) : [],
    responseLedgerRevision: Math.max(0, Number(input.responseLedgerRevision) || 0),
    recoveryJournal: Array.isArray(input.recoveryJournal) ? cloneJson(input.recoveryJournal) : [],
    lifecycleJournal: Array.isArray(input.lifecycleJournal) ? cloneJson(input.lifecycleJournal) : [],
    sidecarJournal: Array.isArray(input.sidecarJournal) ? cloneJson(input.sidecarJournal) : [],
    modelCallJournal: Array.isArray(input.modelCallJournal) ? cloneJson(input.modelCallJournal) : [],
    sceneReconciliation: {
      ...cloneJson(defaults.sceneReconciliation),
      ...(isObject(input.sceneReconciliation) ? cloneJson(input.sceneReconciliation) : {}),
      schemaVersion: 2,
      markers: {
        ...defaults.sceneReconciliation.markers,
        ...(isObject(input.sceneReconciliation?.markers) ? cloneJson(input.sceneReconciliation.markers) : {})
      },
      runs: Array.isArray(input.sceneReconciliation?.runs) ? cloneJson(input.sceneReconciliation.runs) : [],
      pending: Array.isArray(input.sceneReconciliation?.pending) ? cloneJson(input.sceneReconciliation.pending) : [],
      applied: Array.isArray(input.sceneReconciliation?.applied) ? cloneJson(input.sceneReconciliation.applied) : [],
      rejected: Array.isArray(input.sceneReconciliation?.rejected) ? cloneJson(input.sceneReconciliation.rejected) : [],
      recalculationPreviews: Array.isArray(input.sceneReconciliation?.recalculationPreviews) ? cloneJson(input.sceneReconciliation.recalculationPreviews) : [],
      chunkCache: Array.isArray(input.sceneReconciliation?.chunkCache) ? cloneJson(input.sceneReconciliation.chunkCache) : [],
      invalidations: Array.isArray(input.sceneReconciliation?.invalidations) ? cloneJson(input.sceneReconciliation.invalidations) : []
    },
    sceneHandshake: {
      ...cloneJson(defaults.sceneHandshake),
      ...(isObject(input.sceneHandshake) ? cloneJson(input.sceneHandshake) : {}),
      schemaVersion: 1,
      settled: Array.isArray(input.sceneHandshake?.settled) ? cloneJson(input.sceneHandshake.settled) : [],
      pendingInternalReview: Array.isArray(input.sceneHandshake?.pendingInternalReview) ? cloneJson(input.sceneHandshake.pendingInternalReview) : [],
      deferred: Array.isArray(input.sceneHandshake?.deferred) ? cloneJson(input.sceneHandshake.deferred) : [],
      operatorRecovery: Array.isArray(input.sceneHandshake?.operatorRecovery) ? cloneJson(input.sceneHandshake.operatorRecovery) : [],
      rejected: Array.isArray(input.sceneHandshake?.rejected) ? cloneJson(input.sceneHandshake.rejected) : []
    },
    pendingInteractions: Array.isArray(input.pendingInteractions) ? cloneJson(input.pendingInteractions) : [],
    endConditionLedger: {
      ...cloneJson(defaults.endConditionLedger),
      ...(isObject(input.endConditionLedger) ? cloneJson(input.endConditionLedger) : {}),
      schemaVersion: 1,
      detections: Array.isArray(input.endConditionLedger?.detections) ? cloneJson(input.endConditionLedger.detections) : [],
      decisions: Array.isArray(input.endConditionLedger?.decisions) ? cloneJson(input.endConditionLedger.decisions) : [],
      branchRecords: Array.isArray(input.endConditionLedger?.branchRecords) ? cloneJson(input.endConditionLedger.branchRecords) : [],
      continuationFrames: Array.isArray(input.endConditionLedger?.continuationFrames) ? cloneJson(input.endConditionLedger.continuationFrames) : []
    }
  };
}

export function initializeCampaignRuntimeTracking(campaignState, options = {}) {
  if (!isObject(campaignState)) throw new Error('campaignState must be an object');
  return {
    ...cloneJson(campaignState),
    continuity: normalizeContinuityState(campaignState.continuity),
    runtimeTracking: normalizedTracking(campaignState.runtimeTracking, options)
  };
}

export function createCampaignStateSnapshot(campaignState) {
  const snapshot = cloneJson(campaignState);
  if (snapshot?.turnLedger) {
    snapshot.turnLedger = compactTurnLedgerSnapshot(snapshot.turnLedger);
  }
  if (snapshot?.runtimeTracking) {
    snapshot.runtimeTracking = {
      ...snapshot.runtimeTracking,
      history: [],
      historyIndex: -1,
      ingressLedger: [],
      responseLedger: [],
      recoveryJournal: [],
      sidecarJournal: [],
      modelCallJournal: [],
      pendingInteractions: [],
      endConditionLedger: {
        schemaVersion: 1,
        activeDecisionId: null,
        detections: [],
        decisions: [],
        branchRecords: [],
        continuationFrames: []
      },
      activeIngressId: null
    };
  }
  return snapshot;
}

function normalizeDelta(delta = {}) {
  const input = isObject(delta) ? delta : {};
  return {
    id: compact(input.id) || null,
    source: compact(input.source) || 'runtime',
    reason: compact(input.reason) || 'Campaign state updated.',
    domains: [...new Set((Array.isArray(input.domains) ? input.domains : []).map(compact).filter(Boolean))],
    summary: compact(input.summary || input.reason) || 'Campaign state updated.',
    ingressId: compact(input.ingressId) || null,
    turnId: compact(input.turnId) || null,
    outcomeId: compact(input.outcomeId) || null,
    reconciliationRunId: compact(input.reconciliationRunId || input.metadata?.reconciliationRunId) || null,
    sourceAnchorRange: cloneJson(input.sourceAnchorRange || input.metadata?.sourceAnchorRange || null),
    stable: input.stable !== false,
    metadata: cloneJson(input.metadata || {})
  };
}

function ensureAllowedDomains(domains, allowedDomains = DIRECTIVE_MUTABLE_STATE_DOMAINS) {
  const allowed = new Set(allowedDomains);
  for (const domain of domains) {
    if (!allowed.has(domain)) {
      const error = new Error(`State delta is not authorized to mutate domain "${domain}".`);
      error.code = 'DIRECTIVE_STATE_DOMAIN_FORBIDDEN';
      error.details = { domain, allowedDomains: [...allowed] };
      throw error;
    }
  }
}

export function commitTrackedCampaignState({
  campaignState,
  nextCampaignState,
  delta,
  now = null,
  historyLimit = DEFAULT_HISTORY_LIMIT,
  allowedDomains = DIRECTIVE_MUTABLE_STATE_DOMAINS
} = {}) {
  if (!isObject(campaignState)) throw new Error('campaignState must be an object');
  if (!isObject(nextCampaignState)) throw new Error('nextCampaignState must be an object');
  const base = initializeCampaignRuntimeTracking(campaignState, { historyLimit });
  const next = initializeCampaignRuntimeTracking(nextCampaignState, { historyLimit });
  const descriptor = normalizeDelta(delta);
  ensureAllowedDomains(descriptor.domains, allowedDomains);

  const tracking = normalizedTracking(base.runtimeTracking, { historyLimit });
  let history = cloneJson(tracking.history);
  let historyIndex = Number.isInteger(tracking.historyIndex)
    ? tracking.historyIndex
    : history.length - 1;
  if (historyIndex >= 0 && historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }

  const nextRevision = tracking.revision + 1;
  const materialChange = descriptor.domains.some((domain) => domain !== 'runtimeTracking');
  const nextMechanicsRevision = tracking.mechanicsRevision + (materialChange ? 1 : 0);
  const committedAt = timestamp(now);
  history.push({
    revision: tracking.revision,
    committedAt,
    reason: descriptor.reason,
    source: descriptor.source,
    ingressId: descriptor.ingressId,
    turnId: descriptor.turnId,
    outcomeId: descriptor.outcomeId,
    delta: cloneJson(descriptor),
    snapshot: createCampaignStateSnapshot(base)
  });
  history = bounded(history, tracking.historyLimit);
  historyIndex = history.length - 1;

  next.runtimeTracking = {
    ...normalizedTracking(next.runtimeTracking, { historyLimit }),
    revision: nextRevision,
    mechanicsRevision: nextMechanicsRevision,
    historyLimit: tracking.historyLimit,
    history,
    historyIndex,
    lastDelta: {
      ...descriptor,
      revision: nextRevision,
      committedAt
    },
    ingressLedger: cloneJson(tracking.ingressLedger),
    responseLedger: cloneJson(tracking.responseLedger),
    recoveryJournal: cloneJson(tracking.recoveryJournal),
    sidecarJournal: cloneJson(tracking.sidecarJournal),
    modelCallJournal: cloneJson(tracking.modelCallJournal),
    pendingInteractions: cloneJson(tracking.pendingInteractions),
    endConditionLedger: cloneJson(tracking.endConditionLedger),
    activeIngressId: descriptor.ingressId || tracking.activeIngressId || null,
    lastStableRevision: descriptor.stable ? nextRevision : tracking.lastStableRevision
  };
  return next;
}

export function applyTrackedStatePatch({
  campaignState,
  patch,
  domains = null,
  baseRevision = null,
  source = 'sidecar',
  reason = 'Validated state delta applied.',
  metadata = {},
  now = null,
  allowedDomains = DIRECTIVE_MUTABLE_STATE_DOMAINS
} = {}) {
  const base = initializeCampaignRuntimeTracking(campaignState);
  const currentRevision = base.runtimeTracking.revision;
  if (baseRevision !== null && Number(baseRevision) !== currentRevision) {
    const error = new Error(`State delta revision conflict: expected ${baseRevision}, current revision is ${currentRevision}.`);
    error.code = 'DIRECTIVE_STATE_REVISION_CONFLICT';
    error.details = { expectedRevision: Number(baseRevision), currentRevision };
    throw error;
  }
  if (!isObject(patch)) throw new Error('patch must be an object');
  const patchDomains = domains || Object.keys(patch);
  ensureAllowedDomains(patchDomains, allowedDomains);
  for (const key of Object.keys(patch)) {
    if (!patchDomains.includes(key)) {
      const error = new Error(`State patch includes undeclared domain "${key}".`);
      error.code = 'DIRECTIVE_STATE_DOMAIN_UNDECLARED';
      throw error;
    }
  }
  const next = cloneJson(base);
  for (const domain of patchDomains) {
    if (!(domain in patch)) continue;
    next[domain] = deepMerge(next[domain], patch[domain]);
  }
  return commitTrackedCampaignState({
    campaignState: base,
    nextCampaignState: next,
    delta: {
      source,
      reason,
      summary: reason,
      domains: patchDomains,
      metadata
    },
    now,
    allowedDomains
  });
}


function normalizePath(path) {
  const segments = Array.isArray(path)
    ? path.map(String)
    : String(path || '').split('.').map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) throw new Error('State operation path must not be empty.');
  for (const segment of segments) {
    if (FORBIDDEN_PATH_KEYS.has(segment)) {
      const error = new Error(`State operation path contains forbidden segment "${segment}".`);
      error.code = 'DIRECTIVE_STATE_PATH_FORBIDDEN';
      throw error;
    }
  }
  return segments;
}

function parentAtPath(root, segments, { create = true } = {}) {
  let cursor = root;
  for (const segment of segments.slice(0, -1)) {
    if (!isObject(cursor[segment]) && !Array.isArray(cursor[segment])) {
      if (!create) return null;
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  return { parent: cursor, key: segments[segments.length - 1] };
}

function isArrayIndexObject(value) {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => /^(0|[1-9]\d*)$/.test(key));
}

function applyOperation(root, operation) {
  if (!isObject(operation)) throw new Error('State delta operations must be objects.');
  const op = compact(operation.op).toLowerCase();
  const segments = normalizePath(operation.path);
  const target = parentAtPath(root, segments, { create: op !== 'remove' });
  if (!target) return root;
  const { parent, key } = target;
  if (op === 'set') {
    parent[key] = cloneJson(operation.value);
  } else if (op === 'merge') {
    if (Array.isArray(parent[key]) || isArrayIndexObject(operation.value)) {
      const error = new Error(`State merge cannot target array-like path "${segments.join('.')}".`);
      error.code = 'DIRECTIVE_STATE_ARRAY_MERGE_FORBIDDEN';
      error.details = { path: segments.join('.') };
      throw error;
    }
    parent[key] = deepMerge(parent[key], operation.value || {});
  } else if (op === 'append') {
    const values = Array.isArray(operation.value) ? operation.value : [operation.value];
    parent[key] = [...(Array.isArray(parent[key]) ? parent[key] : []), ...cloneJson(values)];
  } else if (op === 'remove') {
    if (Array.isArray(parent)) {
      const index = Number(key);
      if (Number.isInteger(index) && index >= 0 && index < parent.length) parent.splice(index, 1);
    } else {
      delete parent[key];
    }
  } else if (op === 'increment') {
    const amount = Number(operation.value ?? operation.amount ?? 1);
    if (!Number.isFinite(amount)) throw new Error('State increment value must be finite.');
    parent[key] = Number(parent[key] || 0) + amount;
  } else if (op === 'upsert') {
    const values = Array.isArray(parent[key]) ? parent[key] : [];
    const value = cloneJson(operation.value);
    const identityKey = compact(operation.identityKey || 'id');
    const identity = value?.[identityKey];
    if (identity === undefined || identity === null) throw new Error(`State upsert requires value.${identityKey}.`);
    const index = values.findIndex((item) => item?.[identityKey] === identity);
    if (index >= 0) values[index] = operation.merge === false ? value : deepMerge(values[index], value);
    else values.push(value);
    parent[key] = values;
  } else if (op === 'supersede') {
    const values = Array.isArray(parent[key]) ? parent[key] : [];
    const identityKey = compact(operation.identityKey || 'id');
    const targetId = operation.targetId ?? operation.value?.supersedesId;
    const index = values.findIndex((item) => item?.[identityKey] === targetId);
    if (index >= 0) values[index] = { ...values[index], status: 'superseded', supersededAt: operation.supersededAt || new Date().toISOString(), supersededBy: operation.value?.[identityKey] || null };
    if (operation.value) values.push(cloneJson(operation.value));
    parent[key] = values;
  } else if (op === 'noop') {
    // Explicit no-op records are accepted for auditable reconciliation proposals.
  } else {
    const error = new Error(`Unsupported state delta operation "${operation.op}".`);
    error.code = 'DIRECTIVE_STATE_OPERATION_UNSUPPORTED';
    throw error;
  }
  return root;
}

function idsFromRecords(records = []) {
  return [...new Set((Array.isArray(records) ? records : []).map((record) => record?.id).filter(Boolean))];
}

function validateCommandBearingOperations(base, proposal, operations) {
  const acceptedEvidenceRecords = [];
  for (const operation of operations) {
    const segments = normalizePath(operation.path);
    if (segments[0] !== 'commandBearing') continue;
    const path = segments.join('.');
    const op = compact(operation.op).toLowerCase();
    if (!['append', 'upsert'].includes(op) || path !== 'commandBearing.evidenceLedger.records') {
      const error = new Error(`Command Bearing sidecars cannot mutate "${path}".`);
      error.code = 'DIRECTIVE_COMMAND_BEARING_OPERATION_FORBIDDEN';
      error.details = {
        path,
        allowedPath: 'commandBearing.evidenceLedger.records',
        allowedOperations: ['append', 'upsert']
      };
      throw error;
    }
    const evidence = Array.isArray(operation.value) ? operation.value : [operation.value];
    const validation = validateCommandBearingEvidenceProposal({
      evidence
    }, {
      sourceOutcomeId: proposal.outcomeId || null,
      sourceTurnId: proposal.turnId || null,
      suppliedQuestIds: idsFromRecords(base.questLedger?.instances || base.questLedger?.activeQuests || base.questLedger?.records || []),
      suppliedThreadIds: idsFromRecords(base.threadLedger?.records || []),
      suppliedArcIds: idsFromRecords(base.storyArcLedger?.arcs || base.storyArcLedger?.records || [])
    });
    if (!validation.accepted) {
      const error = new Error('Command Bearing sidecar evidence failed deterministic validation.');
      error.code = 'DIRECTIVE_COMMAND_BEARING_EVIDENCE_INVALID';
      error.details = validation.rejections;
      throw error;
    }
    acceptedEvidenceRecords.push(...validation.records);
    operation.value = Array.isArray(operation.value) ? validation.records : validation.records[0];
  }
  return acceptedEvidenceRecords;
}

export function applyStateDeltaOperations({
  campaignState,
  proposal,
  now = null,
  allowedDomains = DIRECTIVE_MUTABLE_STATE_DOMAINS
} = {}) {
  const base = initializeCampaignRuntimeTracking(campaignState);
  if (!isObject(proposal)) throw new Error('proposal must be an object');
  const currentRevision = base.runtimeTracking.revision;
  if (proposal.baseRevision !== null && proposal.baseRevision !== undefined && Number(proposal.baseRevision) !== currentRevision) {
    const error = new Error(`State delta revision conflict: expected ${proposal.baseRevision}, current revision is ${currentRevision}.`);
    error.code = 'DIRECTIVE_STATE_REVISION_CONFLICT';
    error.details = { expectedRevision: Number(proposal.baseRevision), currentRevision };
    throw error;
  }
  const operations = Array.isArray(proposal.operations) ? cloneJson(proposal.operations) : [];
  if (!operations.length) {
    return { campaignState: base, revision: currentRevision, appliedOperationCount: 0, noChange: true };
  }
  const declared = [...new Set((proposal.domains || (proposal.domain ? [proposal.domain] : [])).map(compact).filter(Boolean))];
  const roots = [...new Set(operations.map((operation) => normalizePath(operation.path)[0]))];
  const domains = declared.length ? declared : roots;
  ensureAllowedDomains(domains, allowedDomains);
  for (const root of roots) {
    if (!domains.includes(root)) {
      const error = new Error(`State operation root "${root}" was not declared by the proposal.`);
      error.code = 'DIRECTIVE_STATE_DOMAIN_UNDECLARED';
      throw error;
    }
  }
  validateCommandBearingOperations(base, proposal, operations);
  const next = cloneJson(base);
  for (const operation of operations) applyOperation(next, operation);
  const tracked = commitTrackedCampaignState({
    campaignState: base,
    nextCampaignState: next,
    delta: {
      source: proposal.source || proposal.workerId || 'sidecar',
      reason: proposal.summary || proposal.reason || 'Validated sidecar state delta applied.',
      summary: proposal.summary || proposal.reason || 'Validated sidecar state delta applied.',
      domains,
      ingressId: proposal.ingressId || null,
      turnId: proposal.turnId || null,
      outcomeId: proposal.outcomeId || null,
      metadata: proposal.metadata || {},
      stable: true
    },
    now,
    allowedDomains
  });
  return {
    campaignState: tracked,
    revision: tracked.runtimeTracking.revision,
    mechanicsRevision: tracked.runtimeTracking.mechanicsRevision,
    appliedOperationCount: operations.length,
    noChange: false
  };
}

function updateTracking(campaignState, mutator) {
  const next = initializeCampaignRuntimeTracking(campaignState);
  const tracking = normalizedTracking(next.runtimeTracking);
  next.runtimeTracking = mutator(tracking) || tracking;
  return next;
}

export function recordTurnIngress(campaignState, ingress, {
  limit = DEFAULT_INGRESS_LIMIT
} = {}) {
  if (!isObject(ingress)) throw new Error('ingress must be an object');
  const id = compact(ingress.id || ingress.ingressId);
  if (!id) throw new Error('ingress.id must be a non-empty string');
  return updateTracking(campaignState, (tracking) => {
    const existingIndex = tracking.ingressLedger.findIndex((entry) => entry.id === id);
    const record = {
      id,
      hostMessageId: compact(ingress.hostMessageId) || null,
      chatId: compact(ingress.chatId) || null,
      campaignId: compact(ingress.campaignId) || null,
      textHash: compact(ingress.textHash) || null,
      textPreview: compact(ingress.textPreview).slice(0, 500),
      playerSubmittedAt: ingress.playerSubmittedAt || null,
      receivedAt: ingress.receivedAt || new Date().toISOString(),
      stateRevision: Number(ingress.stateRevision) || tracking.revision,
      sourceFrameId: compact(ingress.sourceFrameId) || ingress.sourceFrame?.id || null,
      sourceFrame: cloneJson(ingress.sourceFrame || null),
      coreTransactionId: compact(ingress.coreTransactionId) || null,
      repairDecision: cloneJson(ingress.repairDecision || null),
      sourceRestart: cloneJson(ingress.sourceRestart || null),
      status: ingress.status || 'received',
      classification: cloneJson(ingress.classification || null),
      workerPlan: cloneJson(ingress.workerPlan || null),
      responseStrategy: ingress.responseStrategy || null,
      turnId: ingress.turnId || null,
      outcomeId: ingress.outcomeId || null,
      responseMessageId: ingress.responseMessageId || null,
      invalidatedAt: ingress.invalidatedAt || null,
      invalidationType: ingress.invalidationType || null,
      replacementText: ingress.replacementText || null,
      error: cloneJson(ingress.error || null)
    };
    const ledger = cloneJson(tracking.ingressLedger);
    if (existingIndex >= 0) {
      const existing = ledger[existingIndex] || {};
      const merged = { ...existing, ...record };
      for (const key of [
        'hostMessageId',
        'chatId',
        'campaignId',
        'textHash',
        'textPreview',
        'playerSubmittedAt',
        'receivedAt',
        'sourceFrameId',
        'sourceFrame',
        'coreTransactionId',
        'repairDecision',
        'sourceRestart'
      ]) {
        if ((record[key] === null || record[key] === undefined || record[key] === '') && existing[key] !== undefined) {
          merged[key] = existing[key];
        }
      }
      ledger[existingIndex] = merged;
    } else ledger.push(record);
    return {
      ...tracking,
      ingressLedger: bounded(ledger, limit),
      activeIngressId: id
    };
  });
}

export function updateTurnIngress(campaignState, ingressId, patch = {}) {
  const id = compact(ingressId);
  return updateTracking(campaignState, (tracking) => ({
    ...tracking,
    ingressLedger: tracking.ingressLedger.map((entry) => entry.id === id
      ? { ...entry, ...cloneJson(patch) }
      : entry)
  }));
}

export function recordDirectiveResponse(campaignState, response, {
  limit = DEFAULT_RESPONSE_LIMIT
} = {}) {
  if (!isObject(response)) throw new Error('response must be an object');
  return updateTracking(campaignState, (tracking) => ({
    ...tracking,
    responseLedger: bounded([
      ...tracking.responseLedger,
      {
        id: compact(response.id || response.idempotencyKey) || `response-${tracking.responseLedger.length + 1}`,
        ingressId: compact(response.ingressId) || null,
        turnId: compact(response.turnId) || null,
        outcomeId: compact(response.outcomeId) || null,
        hostMessageId: compact(response.hostMessageId) || null,
        strategy: response.strategy || 'directivePosted',
        responseKind: response.responseKind || 'narration',
        postedAt: response.postedAt || new Date().toISOString(),
        status: response.status || 'posted',
        recoveryId: response.recoveryId || null,
        sourceFrameId: compact(response.sourceFrameId) || null,
        hostGenerationReleasedAt: response.hostGenerationReleasedAt || null,
        directiveGenerationStartedAt: response.directiveGenerationStartedAt || null,
        generationStartedAt: response.generationStartedAt || null,
        hostGenerationReleaseMode: response.hostGenerationReleaseMode || null,
        turnLatency: cloneJson(response.turnLatency || null),
        coreTransactionId: compact(response.coreTransactionId) || null,
        coreRelease: cloneJson(response.coreRelease || null),
        coreReleaseError: cloneJson(response.coreReleaseError || null),
        coreRecovery: cloneJson(response.coreRecovery || null),
        coreRecoveryError: cloneJson(response.coreRecoveryError || null),
        invalidatedAt: response.invalidatedAt || null,
        invalidationType: response.invalidationType || null,
        replacementText: response.replacementText || null,
        editedAt: response.editedAt || null,
        deletedAt: response.deletedAt || null,
        outcomeIntegrity: cloneJson(response.outcomeIntegrity || null),
        hostContinuation: cloneJson(response.hostContinuation || null),
        hostObservation: cloneJson(response.hostObservation || null),
        continuityReview: cloneJson(response.continuityReview || null),
        error: cloneJson(response.error || null)
      }
    ], limit)
  }));
}

export function updateDirectiveResponse(campaignState, responseId, patch = {}) {
  const id = compact(responseId);
  if (!id) return campaignState;
  return updateTracking(campaignState, (tracking) => ({
    ...tracking,
    ...(() => {
      let updated = false;
      const responseLedger = tracking.responseLedger.map((entry) => {
        if (compact(entry.id) !== id && compact(entry.hostMessageId) !== id) return entry;
        updated = true;
        return { ...entry, ...cloneJson(patch) };
      });
      return {
        responseLedger,
        responseLedgerRevision: updated
          ? Math.max(0, Number(tracking.responseLedgerRevision) || 0) + 1
          : Math.max(0, Number(tracking.responseLedgerRevision) || 0)
      };
    })()
  }));
}

export function recordRecoveryEvent(campaignState, event, {
  limit = 100
} = {}) {
  if (!isObject(event)) throw new Error('event must be an object');
  return updateTracking(campaignState, (tracking) => {
    const id = compact(event.id) || `recovery-${tracking.recoveryJournal.length + 1}`;
    const entries = tracking.recoveryJournal.filter((entry) => entry.id !== id);
    entries.push({
      id,
      type: event.type || 'recovery',
      status: event.status || 'recorded',
      hostMessageId: compact(event.hostMessageId) || null,
      ingressId: compact(event.ingressId) || null,
      outcomeId: compact(event.outcomeId) || null,
      recordedAt: event.recordedAt || new Date().toISOString(),
      details: cloneJson(event.details || {})
    });
    return {
      ...tracking,
      recoveryJournal: bounded(entries, limit)
    };
  });
}

export function resolveRecoveryEvent(campaignState, recoveryId, resolution = {}) {
  const id = compact(recoveryId);
  return updateTracking(campaignState, (tracking) => ({
    ...tracking,
    recoveryJournal: tracking.recoveryJournal.map((entry) => entry.id === id
      ? {
          ...entry,
          status: resolution.status || 'resolved',
          resolvedAt: resolution.resolvedAt || new Date().toISOString(),
          resolution: cloneJson(resolution)
        }
      : entry)
  }));
}

export function restoreTrackedCampaignRevision(campaignState, revision, {
  now = null,
  reason = 'Recovered prior campaign revision.'
} = {}) {
  const current = initializeCampaignRuntimeTracking(campaignState);
  const targetRevision = Number(revision);
  const entry = current.runtimeTracking.history.find((item) => Number(item.revision) === targetRevision);
  if (!entry?.snapshot) {
    const error = new Error(`No tracked snapshot exists for revision ${targetRevision}.`);
    error.code = 'DIRECTIVE_STATE_SNAPSHOT_NOT_FOUND';
    throw error;
  }
  const restored = initializeCampaignRuntimeTracking(entry.snapshot, {
    historyLimit: current.runtimeTracking.historyLimit
  });
  const history = cloneJson(current.runtimeTracking.history);
  const historyIndex = history.findIndex((item) => Number(item.revision) === targetRevision);
  restored.runtimeTracking = {
    ...restored.runtimeTracking,
    revision: targetRevision,
    history,
    historyIndex,
    ingressLedger: cloneJson(current.runtimeTracking.ingressLedger),
    responseLedger: cloneJson(current.runtimeTracking.responseLedger),
    responseLedgerRevision: Math.max(0, Number(current.runtimeTracking.responseLedgerRevision) || 0),
    sidecarJournal: cloneJson(current.runtimeTracking.sidecarJournal),
    modelCallJournal: cloneJson(current.runtimeTracking.modelCallJournal),
    lifecycleJournal: bounded([
      ...cloneJson(current.runtimeTracking.lifecycleJournal),
      {
        id: `lifecycle-restore-${targetRevision}-${current.runtimeTracking.revision}`,
        type: 'stateRevisionRestored',
        status: 'applied',
        recordedAt: timestamp(now),
        details: {
          fromRevision: current.runtimeTracking.revision,
          toRevision: targetRevision,
          reason
        }
      }
    ], 100),
    pendingInteractions: cloneJson(current.runtimeTracking.pendingInteractions),
    endConditionLedger: cloneJson(current.runtimeTracking.endConditionLedger),
    activeIngressId: current.runtimeTracking.activeIngressId || null,
    recoveryJournal: cloneJson(current.runtimeTracking.recoveryJournal),
    lastDelta: {
      source: 'recovery',
      reason,
      summary: reason,
      domains: DIRECTIVE_MUTABLE_STATE_DOMAINS.filter((domain) => domain !== 'runtimeTracking'),
      revision: targetRevision,
      committedAt: timestamp(now),
      stable: true
    },
    lastStableRevision: targetRevision
  };
  return restored;
}



export function recordSidecarEvent(campaignState, event = {}, { limit = 200 } = {}) {
  return updateTracking(campaignState, (tracking) => ({
    ...tracking,
    sidecarJournal: bounded([
      ...tracking.sidecarJournal,
      {
        id: compact(event.id) || `sidecar-${tracking.sidecarJournal.length + 1}`,
        workerId: compact(event.workerId) || null,
        roleId: compact(event.roleId) || null,
        status: event.status || 'recorded',
        baseRevision: Number.isFinite(Number(event.baseRevision)) ? Number(event.baseRevision) : tracking.revision,
        appliedRevision: Number.isFinite(Number(event.appliedRevision)) ? Number(event.appliedRevision) : null,
        summary: compact(event.summary) || null,
        ingressId: compact(event.ingressId) || null,
        turnId: compact(event.turnId) || null,
        outcomeId: compact(event.outcomeId) || null,
        reconciliationRunId: compact(event.reconciliationRunId) || null,
        sourceAnchorRange: cloneJson(event.sourceAnchorRange || null),
        anchorRangeHash: compact(event.anchorRangeHash || event.sourceAnchorRange?.rangeHash) || null,
        recordedAt: event.recordedAt || new Date().toISOString(),
        error: cloneJson(event.error || null),
        diagnostics: cloneJson(event.diagnostics || null)
      }
    ], limit)
  }));
}

export function recordLifecycleEvent(campaignState, event = {}, { limit = 100 } = {}) {
  return updateTracking(campaignState, (tracking) => ({
    ...tracking,
    lifecycleJournal: bounded([
      ...tracking.lifecycleJournal,
      {
        id: compact(event.id) || `lifecycle-${tracking.lifecycleJournal.length + 1}`,
        type: compact(event.type) || 'lifecycle',
        status: compact(event.status) || 'recorded',
        recordedAt: event.recordedAt || new Date().toISOString(),
        details: cloneJson(event.details || {})
      }
    ], limit)
  }));
}

export function recordModelCallEvent(campaignState, event = {}, { limit = 200 } = {}) {
  return updateTracking(campaignState, (tracking) => ({
    ...tracking,
    modelCallJournal: bounded([
      ...tracking.modelCallJournal,
      {
        id: compact(event.id) || `model-call-${tracking.modelCallJournal.length + 1}`,
        roleId: compact(event.roleId) || null,
        providerKind: compact(event.providerKind) || null,
        status: compact(event.status) || (event.ok === true ? 'ok' : 'recorded'),
        providerId: compact(event.providerId) || null,
        model: compact(event.model) || null,
        trigger: compact(event.trigger) || null,
        campaignRevision: Number.isFinite(Number(event.campaignRevision)) ? Number(event.campaignRevision) : tracking.revision,
        requestHash: compact(event.requestHash) || null,
        parseStatus: compact(event.parseStatus) || null,
        validationStatus: compact(event.validationStatus) || null,
        appliedStatus: compact(event.appliedStatus) || null,
        sanitizedReason: compact(event.sanitizedReason) || null,
        latencyMs: Number.isFinite(Number(event.latencyMs)) ? Math.max(0, Number(event.latencyMs)) : null,
        retryable: event.retryable === true,
        recordedAt: event.recordedAt || new Date().toISOString(),
        errorCode: compact(event.errorCode) || null,
        metadata: cloneJson(event.metadata || null)
      }
    ], limit)
  }));
}

export function recordPendingInteraction(campaignState, interaction = {}, { limit = 50 } = {}) {
  const id = compact(interaction.id) || `interaction-${Date.now()}`;
  return updateTracking(campaignState, (tracking) => {
    const list = tracking.pendingInteractions.filter((entry) => entry.id !== id);
    list.push({
      id,
      kind: interaction.kind || 'decision',
      status: interaction.status || 'pending',
      ingressId: compact(interaction.ingressId) || null,
      turnId: compact(interaction.turnId) || null,
      outcomeId: compact(interaction.outcomeId) || null,
      prompt: compact(interaction.prompt) || null,
      options: cloneJson(interaction.options || []),
      metadata: cloneJson(interaction.metadata || null),
      details: cloneJson(interaction.details || null),
      createdAt: interaction.createdAt || new Date().toISOString(),
      resolvedAt: interaction.resolvedAt || null,
      resolution: cloneJson(interaction.resolution || null)
    });
    return { ...tracking, pendingInteractions: bounded(list, limit) };
  });
}

export function resolvePendingInteraction(campaignState, interactionId, resolution = {}) {
  const id = compact(interactionId);
  return updateTracking(campaignState, (tracking) => ({
    ...tracking,
    pendingInteractions: tracking.pendingInteractions.map((entry) => entry.id === id
      ? {
          ...entry,
          status: resolution.status || 'resolved',
          resolvedAt: resolution.resolvedAt || new Date().toISOString(),
          resolution: cloneJson(resolution)
        }
      : entry)
  }));
}

export function createStateDeltaGateway({
  getState,
  setState,
  persist = null,
  now = null,
  allowedDomains = DIRECTIVE_MUTABLE_STATE_DOMAINS
} = {}) {
  if (typeof getState !== 'function') throw new Error('getState must be a function');
  if (typeof setState !== 'function') throw new Error('setState must be a function');

  async function commit(nextCampaignState, delta, options = {}) {
    const current = getState();
    const tracked = commitTrackedCampaignState({
      campaignState: current,
      nextCampaignState,
      delta,
      now,
      allowedDomains
    });
    const shouldPersist = options.persist !== false && delta?.persist !== false;
    setState(tracked);
    if (shouldPersist && typeof persist === 'function') await persist(tracked, delta);
    return cloneJson(tracked);
  }

  async function applyProposal(proposal = {}) {
    const result = Array.isArray(proposal.operations)
      ? applyStateDeltaOperations({ campaignState: getState(), proposal, now, allowedDomains })
      : {
          campaignState: applyTrackedStatePatch({
            campaignState: getState(),
            patch: proposal.patch,
            domains: proposal.domains,
            baseRevision: proposal.baseRevision,
            source: proposal.source || 'sidecar',
            reason: proposal.reason || 'Validated sidecar proposal applied.',
            metadata: proposal.metadata,
            now,
            allowedDomains
          })
        };
    const tracked = result.campaignState;
    setState(tracked);
    if (typeof persist === 'function') await persist(tracked, proposal);
    return { ...cloneJson(result), campaignState: cloneJson(tracked) };
  }

  async function restore(revision, options = {}) {
    const restored = restoreTrackedCampaignRevision(getState(), revision, {
      ...options,
      now
    });
    setState(restored);
    if (typeof persist === 'function') await persist(restored, {
      source: 'recovery',
      reason: options.reason || `Restore revision ${revision}`
    });
    return cloneJson(restored);
  }

  function validateOperationsCore(proposal = {}, policy = {}) {
    const allowedRoots = [...new Set((policy.allowedRoots || proposal.allowedRoots || []).map(compact).filter(Boolean))];
    const operations = Array.isArray(proposal.operations) ? proposal.operations : [];
    if (operations.length > 25) {
      const error = new Error('State delta proposal exceeds the 25-operation safety limit.');
      error.code = 'DIRECTIVE_STATE_OPERATION_LIMIT';
      throw error;
    }
    const operationRoots = [...new Set(operations.map((operation) => normalizePath(operation.path)[0]))];
    for (const root of operationRoots) {
      if (!allowedRoots.includes(root)) {
        const error = new Error(`State delta operation is not authorized to mutate root "${root}".`);
        error.code = 'DIRECTIVE_STATE_ROOT_FORBIDDEN';
        error.details = { root, allowedRoots };
        throw error;
      }
    }
    const normalizedProposal = {
      ...cloneJson(proposal),
      operations,
      domains: allowedRoots,
      metadata: {
        ...cloneJson(proposal.metadata || {}),
        proposalId: proposal.id || null,
        workerId: proposal.workerId || null,
        reconciliationRunId: proposal.runId || proposal.reconciliationRunId || null,
        sourceAnchorRange: cloneJson(proposal.sourceAnchorRange || proposal.anchorRange || null),
        evidenceMessageIds: cloneJson(proposal.evidenceMessageIds || [])
      }
    };
    const result = applyStateDeltaOperations({
      campaignState: getState(),
      proposal: normalizedProposal,
      now,
      allowedDomains
    });
    return cloneJson({
      ...result,
      applied: result.noChange !== true,
      domains: operationRoots,
      persisted: false,
      mutated: false
    });
  }

  async function validateOperations(proposal = {}, policy = {}) {
    return validateOperationsCore(proposal, policy);
  }

  async function applyOperations(proposal = {}, policy = {}) {
    const result = validateOperationsCore(proposal, policy);
    const shouldPersist = policy.persist !== false;
    setState(result.campaignState);
    if (!result.noChange && shouldPersist && typeof persist === 'function') await persist(result.campaignState, {
      ...cloneJson(proposal),
      domains: result.domains,
      metadata: {
        ...cloneJson(proposal.metadata || {}),
        proposalId: proposal.id || null,
        workerId: proposal.workerId || null,
        reconciliationRunId: proposal.runId || proposal.reconciliationRunId || null,
        sourceAnchorRange: cloneJson(proposal.sourceAnchorRange || proposal.anchorRange || null),
        evidenceMessageIds: cloneJson(proposal.evidenceMessageIds || [])
      }
    });
    return cloneJson({
      ...result,
      persisted: result.noChange !== true && shouldPersist && typeof persist === 'function',
      mutated: true
    });
  }

  return {
    commit,
    applyProposal,
    validateOperations,
    applyOperations,
    restore,
    revision: () => initializeCampaignRuntimeTracking(getState()).runtimeTracking.revision,
    mechanicsRevision: () => initializeCampaignRuntimeTracking(getState()).runtimeTracking.mechanicsRevision
  };
}

export const __stateDeltaGatewayTestHooks = Object.freeze({
  deepMerge,
  normalizePath,
  applyOperation,
  normalizedTracking,
  normalizeDelta,
  bounded
});
