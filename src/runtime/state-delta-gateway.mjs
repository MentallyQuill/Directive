/**
 * Authoritative campaign mutation gateway.
 *
 * The bounded snapshot journal and redo truncation model are adapted from the
 * Multihog DnD Framework's chat-linked memo history, generalized here for
 * structured Directive campaign domains and durable per-turn recovery.
 */

import { validateCommandBearingEvidenceProposal } from '../command/command-bearing.mjs';
import { normalizeContinuityState } from '../continuity/state.mjs';
import { hashStableJson } from './architecture-redesign-contracts.mjs';
import { readRuntimeCoreProjections } from './runtime-ledger-view.mjs';
import { emptyTerminalDecisionLedger } from './terminal-decision-ledger-view.mjs';

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
  'sceneReconciliation',
  'sceneHandshake',
  'runtimeTracking'
]);

const DEFAULT_HISTORY_LIMIT = 8;
const DEFAULT_INGRESS_LIMIT = 200;
const DEFAULT_RESPONSE_LIMIT = 200;
const FORBIDDEN_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const LIFECYCLE_AUTHORITIES = new Set([
  'runtimeLifecycleProjection',
  'repairLifecycleProjection'
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

const RAW_RUNTIME_LEDGER_PAYLOAD_KEYS = new Set([
  'body',
  'generatedText',
  'messages',
  'metadata',
  'observedText',
  'prompt',
  'providerPayload',
  'raw',
  'rawPrompt',
  'rawResponse',
  'rawText',
  'request',
  'response',
  'selectedText',
  'text',
  'transcript'
]);

function sanitizeRuntimeLedgerPayload(value) {
  if (Array.isArray(value)) return value.map((entry) => sanitizeRuntimeLedgerPayload(entry));
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !RAW_RUNTIME_LEDGER_PAYLOAD_KEYS.has(key))
    .map(([key, entry]) => [key, sanitizeRuntimeLedgerPayload(entry)])
    .filter(([, entry]) => entry !== undefined));
}

function replacementTextProjectionFields(source = {}) {
  if (!isObject(source)) return {};
  const hasRawReplacement = Object.prototype.hasOwnProperty.call(source, 'replacementText');
  const hasProjection = Object.prototype.hasOwnProperty.call(source, 'replacementTextPresent')
    || Object.prototype.hasOwnProperty.call(source, 'replacementTextHash')
    || Object.prototype.hasOwnProperty.call(source, 'replacementTextLength');
  if (!hasRawReplacement && !hasProjection) return {};
  const rawReplacementText = hasRawReplacement ? compact(source.replacementText) : '';
  return {
    replacementText: null,
    replacementTextPresent: source.replacementTextPresent ?? (hasRawReplacement ? Boolean(rawReplacementText) : undefined),
    replacementTextHash: source.replacementTextHash ?? (rawReplacementText ? hashStableJson({ text: rawReplacementText }) : (hasRawReplacement ? null : undefined)),
    replacementTextLength: source.replacementTextLength ?? (hasRawReplacement ? rawReplacementText.length : undefined)
  };
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
    pendingInteractions: [],
    endConditionLedger: emptyTerminalDecisionLedger(),
    activeIngressId: null,
    lastStableRevision: 0
  };
}

function sceneReconciliationDefaults() {
  return {
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
  };
}

function sceneHandshakeDefaults() {
  return {
    schemaVersion: 1,
    settled: [],
    pendingInternalReview: [],
    deferred: [],
    operatorRecovery: [],
    rejected: [],
    lastResult: null
  };
}

function normalizedEndConditionLedger(input = {}, defaults = {}) {
  void input;
  return cloneJson(defaults || emptyTerminalDecisionLedger());
}

function isSceneReconciliationProjectionLedger(input = {}) {
  return (
    isObject(input)
    && compact(input.authority) === 'sreSceneReconciliationProjection'
    && compact(input.projectionSource) === 'sceneReconciliation'
    && compact(input.compatibilityMirror?.kind) === 'directive.sceneReconciliationLedgerProjectionRef.v1'
  );
}

function normalizedSceneReconciliationLedger(input = {}, defaults = {}) {
  if (!isSceneReconciliationProjectionLedger(input)) return cloneJson(defaults);
  return {
    ...cloneJson(defaults),
    ...cloneJson(input),
    schemaVersion: 2,
    markers: {
      ...defaults.markers,
      ...(isObject(input.markers) ? cloneJson(input.markers) : {})
    },
    runs: Array.isArray(input.runs) ? cloneJson(input.runs) : [],
    pending: Array.isArray(input.pending) ? cloneJson(input.pending) : [],
    applied: Array.isArray(input.applied) ? cloneJson(input.applied) : [],
    rejected: Array.isArray(input.rejected) ? cloneJson(input.rejected) : [],
    recalculationPreviews: Array.isArray(input.recalculationPreviews) ? cloneJson(input.recalculationPreviews) : [],
    chunkCache: Array.isArray(input.chunkCache) ? cloneJson(input.chunkCache) : [],
    invalidations: Array.isArray(input.invalidations) ? cloneJson(input.invalidations) : []
  };
}

function compactSceneReconciliationSnapshot(input = {}, defaults = {}) {
  const ledger = normalizedSceneReconciliationLedger(input, defaults);
  return {
    ...sanitizeRuntimeLedgerPayload(ledger),
    markers: sanitizeRuntimeLedgerPayload(ledger.markers),
    runs: [],
    pending: [],
    applied: [],
    rejected: [],
    recalculationPreviews: [],
    chunkCache: [],
    invalidations: [],
    lastResult: sanitizeRuntimeLedgerPayload(ledger.lastResult)
  };
}

function isSceneHandshakeProjectionRow(entry = {}) {
  return (
    isObject(entry)
    && compact(entry.authority) === 'sreSceneHandshakeProjection'
    && compact(entry.projectionSource) === 'sourceSettlementLatestPair'
    && compact(entry.compatibilityMirror?.kind) === 'directive.sceneHandshakeLedgerProjectionRef.v1'
  );
}

function isSceneHandshakeLedgerRow(entry = {}) {
  return isSceneHandshakeProjectionRow(entry);
}

function normalizedSceneHandshakeLedger(input = {}, defaults = {}) {
  const source = isObject(input) ? input : {};
  return {
    ...cloneJson(defaults),
    ...cloneJson(source),
    schemaVersion: 1,
    settled: Array.isArray(source.settled) ? cloneJson(source.settled.filter(isSceneHandshakeLedgerRow)) : [],
    pendingInternalReview: Array.isArray(source.pendingInternalReview) ? cloneJson(source.pendingInternalReview.filter(isSceneHandshakeLedgerRow)) : [],
    deferred: Array.isArray(source.deferred) ? cloneJson(source.deferred.filter(isSceneHandshakeLedgerRow)) : [],
    operatorRecovery: Array.isArray(source.operatorRecovery) ? cloneJson(source.operatorRecovery.filter(isSceneHandshakeLedgerRow)) : [],
    rejected: Array.isArray(source.rejected) ? cloneJson(source.rejected.filter(isSceneHandshakeLedgerRow)) : [],
    lastResult: isSceneHandshakeLedgerRow(source.lastResult) ? cloneJson(source.lastResult) : null
  };
}

function normalizeLastCommittedTurnProjection(input = null) {
  if (!isObject(input)) return null;
  const compatibilityKind = compact(input.compatibilityMirror?.kind);
  const coreProjectionKind = compact(input.coreProjection?.kind);
  const authority = compact(input.authority);
  const projectionSource = compact(input.projectionSource);
  const isProjection = (
    compatibilityKind === 'directive.lastCommittedTurnCompatibilityMirror.v1'
    || coreProjectionKind === 'directive.coreLastCommittedTurnProjectionRef.v1'
    || (
      authority === 'compatibilityProjection'
      && ['coreStoreV2', 'turnLedger'].includes(projectionSource)
    )
  );
  if (!isProjection) return null;
  const compacted = sanitizeRuntimeLedgerPayload(cloneJson(input));
  compacted.authority = 'compatibilityProjection';
  compacted.projectionSource = ['coreStoreV2', 'turnLedger'].includes(compact(compacted.projectionSource))
    ? compact(compacted.projectionSource)
    : 'turnLedger';
  compacted.compatibilityMirror = {
    kind: 'directive.lastCommittedTurnCompatibilityMirror.v1',
    status: compact(compacted.compatibilityMirror?.status || compacted.narrationStatus || compacted.responseStatus || 'mirrored') || 'mirrored',
    outcomeId: compact(compacted.outcomeId) || null,
    turnId: compact(compacted.turnId) || null,
    transactionId: compact(compacted.coreTransactionId || compacted.coreProjection?.transactionId || compacted.compatibilityMirror?.transactionId) || null,
    source: 'turnLedgerPresentationMirror'
  };
  compacted.coreProjection = {
    kind: 'directive.coreLastCommittedTurnProjectionRef.v1',
    outcomeId: compact(compacted.outcomeId) || null,
    turnId: compact(compacted.turnId) || null,
    transactionId: compact(compacted.coreTransactionId || compacted.coreProjection?.transactionId || compacted.compatibilityMirror?.transactionId) || null,
    status: compact(compacted.coreProjection?.status || compacted.compatibilityMirror.status) || 'mirrored'
  };
  return compacted;
}

function isOpenWorldBoundaryProjection(input = {}) {
  return (
    isObject(input)
    && compact(input.authority) === 'openWorldBoundaryProjection'
    && compact(input.projectionSource) === 'directorCoordinator'
    && compact(input.compatibilityMirror?.kind) === 'directive.openWorldBoundaryProjectionRef.v1'
  );
}

function isTimeNormalizationProjection(input = {}) {
  return (
    isObject(input)
    && compact(input.authority) === 'timeNormalizationProjection'
    && compact(input.projectionSource) === 'campaignTimeState'
    && compact(input.compatibilityMirror?.kind) === 'directive.timeNormalizationProjectionRef.v1'
  );
}

function oldRuntimeModelCallJournal() {
  return [];
}

function responseLedgerRevisionFromCoreProjections(campaignState = {}) {
  const projections = readRuntimeCoreProjections(campaignState);
  return Math.max(0, Number(projections.responseLedgerRevision) || 0);
}

function hasCoreRuntimeAuthority(projections = {}) {
  return compact(projections?.runtimeAuthority) === 'coreStoreV2';
}

function activeRevisionState(campaignState = {}, tracking = null) {
  const normalized = tracking || normalizedTracking(campaignState?.runtimeTracking || {});
  const projections = readRuntimeCoreProjections(campaignState);
  const revisions = isObject(projections.revisions) ? projections.revisions : {};
  if (hasCoreRuntimeAuthority(projections)) {
    return {
      revision: Math.max(0, Number(revisions.runtime) || 0),
      mechanicsRevision: Math.max(0, Number(revisions.mechanics) || 0),
      authority: 'coreStoreV2'
    };
  }
  return {
    revision: normalized.revision,
    mechanicsRevision: normalized.mechanicsRevision,
    authority: 'runtimeTracking'
  };
}

function runtimeCoreProjectionEnvelope(campaignState = {}) {
  const projections = readRuntimeCoreProjections(campaignState);
  return {
    kind: compact(projections.kind) || 'directive.coreStoreReadProjections.v1',
    ...cloneJson(projections),
    runtimeAuthority: compact(projections.runtimeAuthority) || 'coreStoreV2'
  };
}

function writeRuntimeCoreProjectionEnvelope(campaignState, projectionPatch = {}) {
  const next = cloneJson(campaignState);
  const patch = cloneJson(projectionPatch);
  if (Array.isArray(patch.responseLedger) && !Array.isArray(patch.responses)) {
    patch.responses = patch.responseLedger;
  }
  delete patch.responseLedger;
  const projections = {
    ...runtimeCoreProjectionEnvelope(campaignState),
    ...patch
  };
  delete projections.responseLedger;
  next.directiveRuntimeEvidence = {
    ...(isObject(next.directiveRuntimeEvidence) ? cloneJson(next.directiveRuntimeEvidence) : {}),
    coreStoreReadProjections: projections
  };
  if (isObject(next.runtimeTracking)) {
    delete next.runtimeTracking.directiveRuntimeEvidence;
  }
  return next;
}

function runtimeCoreProjectionRows(campaignState = {}, ledgerName) {
  const projections = readRuntimeCoreProjections(campaignState);
  if (ledgerName === 'responseLedger') {
    const rows = Array.isArray(projections?.responses) ? projections.responses : projections?.responseLedger;
    return Array.isArray(rows) ? cloneJson(rows) : [];
  }
  return Array.isArray(projections?.[ledgerName]) ? cloneJson(projections[ledgerName]) : [];
}

function runtimeLedgerTrackingWithoutOldRows(tracking = {}, overrides = {}) {
  return {
    ...tracking,
    ...overrides,
    ingressLedger: [],
    responseLedger: [],
    recoveryJournal: []
  };
}

function responseRowMatchesId(entry = {}, id, { allowHostMessageIdMatch = false } = {}) {
  const target = compact(id);
  if (!target) return false;
  return (
    compact(entry.id) === target
    || compact(entry.responseId) === target
    || (allowHostMessageIdMatch === true && compact(entry.hostMessageId) === target)
  );
}

export function isPendingInteractionProjectionRow(entry = {}) {
  const authority = compact(entry.authority);
  return (
    isObject(entry)
    && (
      authority === 'corePendingInteractionProjection'
      || authority === 'repairPendingInteractionProjection'
    )
    && compact(entry.compatibilityMirror?.kind) === 'directive.pendingInteractionCompatibilityMirror.v1'
  );
}

function compactRuntimeHistory(rows = []) {
  return [];
}

function normalizedTracking(value, options = {}) {
  const defaults = runtimeTrackingDefaults(options);
  const input = isObject(value) ? value : {};
  const historyLimit = defaults.historyLimit;
  const history = compactRuntimeHistory(input.history);
  const historyIndex = -1;
  const normalized = {
    ...defaults,
    ...cloneJson(input),
    schemaVersion: 2,
    revision: Math.max(0, Number(input.revision) || 0),
    mechanicsRevision: Math.max(0, Number(input.mechanicsRevision) || 0),
    historyLimit,
    historyIndex,
    history,
    ingressLedger: [],
    responseLedger: [],
    responseLedgerRevision: 0,
    recoveryJournal: [],
    lifecycleJournal: [],
    sidecarJournal: [],
    modelCallJournal: [],
    pendingInteractions: [],
    endConditionLedger: emptyTerminalDecisionLedger()
  };
  delete normalized.sceneReconciliation;
  delete normalized.sceneHandshake;
  if (isOpenWorldBoundaryProjection(input.lastWorldBoundary)) {
    normalized.lastWorldBoundary = cloneJson(input.lastWorldBoundary);
  } else {
    delete normalized.lastWorldBoundary;
  }
  if (isTimeNormalizationProjection(input.timeNormalization)) {
    normalized.timeNormalization = cloneJson(input.timeNormalization);
  } else {
    delete normalized.timeNormalization;
  }
  const lastCommittedTurn = normalizeLastCommittedTurnProjection(input.lastCommittedTurn);
  if (lastCommittedTurn) {
    normalized.lastCommittedTurn = lastCommittedTurn;
  } else {
    delete normalized.lastCommittedTurn;
  }
  return normalized;
}

export function initializeCampaignRuntimeTracking(campaignState, options = {}) {
  if (!isObject(campaignState)) throw new Error('campaignState must be an object');
  const normalizedRuntimeTracking = normalizedTracking(campaignState.runtimeTracking, options);
  const sceneReconciliationInput = isObject(campaignState.sceneReconciliation)
    ? campaignState.sceneReconciliation
    : sceneReconciliationDefaults();
  const sceneHandshakeInput = isObject(campaignState.sceneHandshake)
    ? campaignState.sceneHandshake
    : sceneHandshakeDefaults();
  const runtimeTracking = {
    ...normalizedRuntimeTracking
  };
  delete runtimeTracking.sceneReconciliation;
  delete runtimeTracking.sceneHandshake;
  return {
    ...cloneJson(campaignState),
    continuity: normalizeContinuityState(campaignState.continuity),
    sceneReconciliation: normalizedSceneReconciliationLedger(sceneReconciliationInput, sceneReconciliationDefaults()),
    sceneHandshake: normalizedSceneHandshakeLedger(sceneHandshakeInput, sceneHandshakeDefaults()),
    runtimeTracking
  };
}

export function createCampaignStateSnapshot(campaignState) {
  const snapshot = cloneJson(campaignState);
  delete snapshot.directiveRuntimeEvidence;
  delete snapshot.runtimeResume;
  if (snapshot?.turnLedger) {
    snapshot.turnLedger = compactTurnLedgerSnapshot(snapshot.turnLedger);
  }
  const sceneReconciliationInput = isObject(snapshot.sceneReconciliation)
    ? snapshot.sceneReconciliation
    : sceneReconciliationDefaults();
  if (isObject(sceneReconciliationInput)) {
    snapshot.sceneReconciliation = compactSceneReconciliationSnapshot(sceneReconciliationInput, sceneReconciliationDefaults());
  }
  const sceneHandshakeInput = isObject(snapshot.sceneHandshake)
    ? snapshot.sceneHandshake
    : sceneHandshakeDefaults();
  if (isObject(sceneHandshakeInput)) {
    snapshot.sceneHandshake = normalizedSceneHandshakeLedger(sceneHandshakeInput, sceneHandshakeDefaults());
  }
  if (snapshot?.runtimeTracking) {
    snapshot.runtimeTracking = {
      ...snapshot.runtimeTracking,
      history: [],
      historyIndex: -1,
      ingressLedger: [],
      responseLedger: [],
      recoveryJournal: [],
      lifecycleJournal: [],
      sidecarJournal: [],
      modelCallJournal: [],
      pendingInteractions: [],
      endConditionLedger: emptyTerminalDecisionLedger(),
      activeIngressId: null
    };
    delete snapshot.runtimeTracking.sceneReconciliation;
    delete snapshot.runtimeTracking.sceneHandshake;
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
  const activeRevisions = activeRevisionState(base, tracking);
  const runtimeTrackingLedgers = {
    ingressLedger: [],
    responseLedger: [],
    recoveryJournal: []
  };
  const nextRevision = activeRevisions.revision + 1;
  const materialChange = descriptor.domains.some((domain) => !['runtimeTracking', 'sceneReconciliation', 'sceneHandshake'].includes(domain));
  const nextMechanicsRevision = activeRevisions.mechanicsRevision + (materialChange ? 1 : 0);
  const committedAt = timestamp(now);

  next.runtimeTracking = {
    ...normalizedTracking(next.runtimeTracking, { historyLimit }),
    revision: nextRevision,
    mechanicsRevision: nextMechanicsRevision,
    historyLimit: tracking.historyLimit,
    history: [],
    historyIndex: -1,
    lastDelta: {
      ...descriptor,
      revision: nextRevision,
      committedAt
    },
    ingressLedger: runtimeTrackingLedgers.ingressLedger,
    responseLedger: runtimeTrackingLedgers.responseLedger,
    responseLedgerRevision: responseLedgerRevisionFromCoreProjections(base),
    recoveryJournal: runtimeTrackingLedgers.recoveryJournal,
    sidecarJournal: [],
    modelCallJournal: oldRuntimeModelCallJournal(),
    pendingInteractions: cloneJson(tracking.pendingInteractions),
    endConditionLedger: emptyTerminalDecisionLedger(),
    activeIngressId: descriptor.ingressId || tracking.activeIngressId || null,
    lastStableRevision: descriptor.stable ? nextRevision : tracking.lastStableRevision
  };
  if (activeRevisions.authority === 'coreStoreV2') {
    const projections = runtimeCoreProjectionEnvelope(next);
    next.directiveRuntimeEvidence = {
      ...(isObject(next.directiveRuntimeEvidence) ? cloneJson(next.directiveRuntimeEvidence) : {}),
      coreStoreReadProjections: {
        ...projections,
        revisions: {
          ...(isObject(projections.revisions) ? cloneJson(projections.revisions) : {}),
          runtime: nextRevision,
          mechanics: nextMechanicsRevision
        }
      }
    };
  }
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
  const currentRevision = activeRevisionState(base).revision;
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
  const currentRevision = activeRevisionState(base).revision;
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

function coreEvidenceStatus(source = {}) {
  if (!isObject(source)) return 'missingCoreProjection';
  if (source.coreProjection) {
    const projectionKind = compact(source.coreProjection?.kind);
    if (projectionKind.includes('coreResponse') || source.coreProjection?.responseId) return 'coreResponseProjection';
    if (projectionKind.includes('coreIngress') || source.coreProjection?.ingressId) return 'coreIngressProjection';
    return 'coreProjection';
  }
  if (source.compatibilityMirror) return 'compatibilityMirror';
  if (source.coreRecovery || source.coreRecoveryError) return 'coreRecovery';
  if (source.coreRelease || source.coreCompletion || source.coreReleaseDiagnostic || source.coreRecoveryDiagnostic) return 'coreResponseProjection';
  if (source.coreTransactionId) return 'coreTransaction';
  return 'missingCoreProjection';
}

function assertMissingCoreWriteAllowed(kind, source = {}, { missingCoreWriteMode = 'reject' } = {}) {
  const evidence = coreEvidenceStatus(source);
  const explicitAuthority = compact(source.authority);
  if (evidence !== 'missingCoreProjection') return;
  const error = new Error(`${kind} old-ledger write requires CORE projection evidence`);
  error.code = 'DIRECTIVE_CORE_PROJECTION_REQUIRED_FOR_OLD_LEDGER_WRITE';
  error.details = {
    kind,
    evidence,
    authority: explicitAuthority || null
  };
  throw error;
}

function oldLedgerAuthorityFieldsForUpdate(kind, existing = {}, patch = {}, merged = {}, options = {}) {
  const patchEvidence = coreEvidenceStatus(patch);
  const patchAuthority = compact(patch.authority);
  if (!patchAuthority && patchEvidence !== 'missingCoreProjection') {
    return oldLedgerAuthorityFields(kind, {
      ...merged,
      authority: null,
      projectionSource: patch.projectionSource || null,
      compatibilityMirror: patch.compatibilityMirror || null
    }, options);
  }
  return oldLedgerAuthorityFields(kind, merged, options);
}

function compatibilityMirrorRef(kind, source = {}, status = null) {
  const rowKind = kind === 'ingress' ? 'directive.coreIngressCompatibilityMirror.v1' : 'directive.coreResponseCompatibilityMirror.v1';
  return {
    kind: rowKind,
    status: compact(status || coreEvidenceStatus(source)) || null,
    transactionId: compact(
      source.coreTransactionId
      || source.coreProjection?.transactionId
      || source.coreProjection?.coreTransactionId
      || source.coreRecovery?.transactionId
      || source.coreRelease?.transactionId
      || source.coreCompletion?.transactionId
    ) || null,
    ingressId: compact(source.id || source.ingressId) || null,
    responseId: kind === 'response' ? (compact(source.id || source.responseId || source.idempotencyKey) || null) : null,
    projectionSource: compact(source.projectionSource) || null
  };
}

function oldLedgerAuthorityFields(kind, source = {}, options = {}) {
  assertMissingCoreWriteAllowed(kind, source, options);
  const explicitAuthority = compact(source.authority);
  const evidence = coreEvidenceStatus(source);
  const projectionSource = compact(source.projectionSource) || (evidence === 'missingCoreProjection' ? 'runtimeTrackingLegacy' : 'coreStoreV2');
  if (explicitAuthority) {
    return {
      authority: explicitAuthority,
      projectionSource,
      compatibilityMirror: cloneJson(source.compatibilityMirror || compatibilityMirrorRef(kind, source, evidence))
    };
  }
  if (kind === 'ingress' && evidence === 'coreTransaction') {
    return {
      authority: 'coreIngressProjection',
      projectionSource,
      compatibilityMirror: compatibilityMirrorRef(kind, source, 'sourceObserved')
    };
  }
  if (evidence !== 'missingCoreProjection') {
    return {
      authority: evidence === 'coreResponseProjection' ? 'compatibilityProjection' : 'compatibilityProjection',
      projectionSource,
      compatibilityMirror: cloneJson(source.compatibilityMirror || compatibilityMirrorRef(kind, source, evidence))
    };
  }
  return {
    authority: 'compatibilityProjectionUnavailable',
    projectionSource,
    compatibilityMirror: cloneJson(source.compatibilityMirror || compatibilityMirrorRef(kind, source, 'missingCoreProjection'))
  };
}

export function recordTurnIngress(campaignState, ingress, {
  limit = DEFAULT_INGRESS_LIMIT,
  missingCoreWriteMode = 'reject'
} = {}) {
  if (!isObject(ingress)) throw new Error('ingress must be an object');
  const id = compact(ingress.id || ingress.ingressId);
  if (!id) throw new Error('ingress.id must be a non-empty string');
  let projectedState = initializeCampaignRuntimeTracking(campaignState);
  const tracking = normalizedTracking(projectedState.runtimeTracking);
  const ledger = runtimeCoreProjectionRows(projectedState, 'ingressLedger');
  const existingIndex = ledger.findIndex((entry) => compact(entry.id || entry.ingressId) === id);
  const existingForAuthority = existingIndex >= 0 ? ledger[existingIndex] : null;
  const authority = oldLedgerAuthorityFields('ingress', existingForAuthority
    ? { ...cloneJson(existingForAuthority), ...cloneJson(ingress) }
    : ingress, { missingCoreWriteMode });
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
    coreRecovery: cloneJson(ingress.coreRecovery || null),
    coreProjection: cloneJson(ingress.coreProjection || null),
    compatibilityMirror: authority.compatibilityMirror,
    projectionSource: authority.projectionSource,
    authority: authority.authority,
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
    ...replacementTextProjectionFields(ingress),
    error: cloneJson(ingress.error || null)
  };
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
      'coreRecovery',
      'coreProjection',
      'compatibilityMirror',
      'projectionSource',
      'authority',
      'repairDecision',
      'sourceRestart'
    ]) {
      if ((record[key] === null || record[key] === undefined || record[key] === '') && existing[key] !== undefined) {
        merged[key] = existing[key];
      }
    }
    ledger[existingIndex] = merged;
  } else ledger.push(record);
  projectedState = writeRuntimeCoreProjectionEnvelope(projectedState, {
    ingressLedger: bounded(ledger, limit)
  });
  projectedState.runtimeTracking = runtimeLedgerTrackingWithoutOldRows(tracking, {
    activeIngressId: id,
    responseLedgerRevision: responseLedgerRevisionFromCoreProjections(projectedState)
  });
  return projectedState;
}

export function updateTurnIngress(campaignState, ingressId, patch = {}, {
  missingCoreWriteMode = 'reject'
} = {}) {
  const id = compact(ingressId);
  const sanitizedPatch = {
    ...cloneJson(patch),
    ...replacementTextProjectionFields(patch)
  };
  let projectedState = initializeCampaignRuntimeTracking(campaignState);
  const tracking = normalizedTracking(projectedState.runtimeTracking);
  const ledger = runtimeCoreProjectionRows(projectedState, 'ingressLedger');
  const existingIndex = ledger.findIndex((entry) => compact(entry.id || entry.ingressId) === id);
  if (existingIndex < 0) {
    if (coreEvidenceStatus(sanitizedPatch) === 'missingCoreProjection') return campaignState;
    ledger.push({ id });
  }
  const targetIndex = existingIndex >= 0 ? existingIndex : ledger.length - 1;
  const entry = ledger[targetIndex] || {};
  const merged = { ...entry, ...sanitizedPatch };
  const authority = oldLedgerAuthorityFieldsForUpdate('ingress', entry, sanitizedPatch, merged, { missingCoreWriteMode });
  ledger[targetIndex] = {
    ...merged,
    compatibilityMirror: authority.compatibilityMirror,
    projectionSource: authority.projectionSource,
    authority: authority.authority
  };
  projectedState = writeRuntimeCoreProjectionEnvelope(projectedState, {
    ingressLedger: ledger
  });
  projectedState.runtimeTracking = runtimeLedgerTrackingWithoutOldRows(tracking, {
    activeIngressId: tracking.activeIngressId || id,
    responseLedgerRevision: responseLedgerRevisionFromCoreProjections(projectedState)
  });
  return projectedState;
}

export function recordDirectiveResponse(campaignState, response, {
  limit = DEFAULT_RESPONSE_LIMIT,
  missingCoreWriteMode = 'reject'
} = {}) {
  if (!isObject(response)) throw new Error('response must be an object');
  const authority = oldLedgerAuthorityFields('response', response, { missingCoreWriteMode });
  let projectedState = initializeCampaignRuntimeTracking(campaignState);
  const tracking = normalizedTracking(projectedState.runtimeTracking);
  const ledger = runtimeCoreProjectionRows(projectedState, 'responseLedger');
  ledger.push({
    id: compact(response.id || response.idempotencyKey) || `response-${ledger.length + 1}`,
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
    coreReleaseDiagnostic: cloneJson(response.coreReleaseDiagnostic || null),
    coreRecovery: cloneJson(response.coreRecovery || null),
    coreRecoveryError: cloneJson(response.coreRecoveryError || null),
    coreProjection: cloneJson(response.coreProjection || null),
    compatibilityMirror: authority.compatibilityMirror,
    projectionSource: authority.projectionSource,
    authority: authority.authority,
    invalidatedAt: response.invalidatedAt || null,
    invalidationType: response.invalidationType || null,
    ...replacementTextProjectionFields(response),
    editedAt: response.editedAt || null,
    deletedAt: response.deletedAt || null,
    outcomeIntegrity: cloneJson(response.outcomeIntegrity || null),
    correctAsSwipe: cloneJson(response.correctAsSwipe || null),
    hostContinuation: cloneJson(response.hostContinuation || null),
    hostObservation: cloneJson(response.hostObservation || null),
    continuityReview: cloneJson(response.continuityReview || null),
    error: cloneJson(response.error || null)
  });
  projectedState = writeRuntimeCoreProjectionEnvelope(projectedState, {
    responses: bounded(ledger, limit)
  });
  projectedState.runtimeTracking = runtimeLedgerTrackingWithoutOldRows(tracking, {
    responseLedgerRevision: responseLedgerRevisionFromCoreProjections(projectedState)
  });
  return projectedState;
}

export function updateDirectiveResponse(campaignState, responseId, patch = {}, {
  missingCoreWriteMode = 'reject',
  allowHostMessageIdMatch = false
} = {}) {
  const id = compact(responseId);
  if (!id) return campaignState;
  const responseLedgerRevision = responseLedgerRevisionFromCoreProjections(campaignState);
  const sanitizedPatch = {
    ...cloneJson(patch),
    ...replacementTextProjectionFields(patch)
  };
  let projectedState = initializeCampaignRuntimeTracking(campaignState);
  const tracking = normalizedTracking(projectedState.runtimeTracking);
  const ledger = runtimeCoreProjectionRows(projectedState, 'responseLedger');
  let existingIndex = ledger.findIndex((entry) => compact(entry.id) === id || compact(entry.responseId) === id);
  if (existingIndex < 0 && allowHostMessageIdMatch === true) {
    const hostMatches = ledger
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => compact(entry.hostMessageId) === id);
    if (hostMatches.length > 1) return campaignState;
    if (hostMatches.length === 1) existingIndex = hostMatches[0].index;
  }
  if (existingIndex < 0) {
    if (coreEvidenceStatus(sanitizedPatch) === 'missingCoreProjection') return campaignState;
    ledger.push({ id });
  }
  const targetIndex = existingIndex >= 0 ? existingIndex : ledger.length - 1;
  const entry = ledger[targetIndex] || {};
  const merged = { ...entry, ...sanitizedPatch };
  const authority = oldLedgerAuthorityFieldsForUpdate('response', entry, sanitizedPatch, merged, { missingCoreWriteMode });
  ledger[targetIndex] = {
    ...merged,
    compatibilityMirror: authority.compatibilityMirror,
    projectionSource: authority.projectionSource,
    authority: authority.authority
  };
  projectedState = writeRuntimeCoreProjectionEnvelope(projectedState, {
    responses: ledger
  });
  projectedState.runtimeTracking = runtimeLedgerTrackingWithoutOldRows(tracking, {
    responseLedgerRevision
  });
  return projectedState;
}

export function restoreTrackedCampaignRevision(campaignState, revision, {
  now = null,
  reason = 'Recovered prior campaign revision.'
} = {}) {
  const targetRevision = Number(revision);
  const label = Number.isFinite(targetRevision) ? targetRevision : revision;
  const error = new Error(`Generic runtime history restore is retired for revision ${label}; CORE checkpoint restore is required.`);
  error.code = 'DIRECTIVE_CORE_CHECKPOINT_REQUIRED';
  error.details = {
    revision: Number.isFinite(targetRevision) ? targetRevision : null,
    reason,
    retiredAuthority: 'runtimeTracking.history.snapshot',
    requiredAuthority: 'coreStoreV2.checkpoint'
  };
  throw error;
}

function lifecycleEvidenceStatus(source = {}) {
  if (!isObject(source)) return 'missingLifecycleAuthority';
  const explicitAuthority = compact(source.authority);
  if (LIFECYCLE_AUTHORITIES.has(explicitAuthority)) return explicitAuthority;
  if (source.coreProjection || source.coreTransactionId) return 'runtimeLifecycleProjection';
  if (source.repairDecision || source.type === 'stateRevisionRestored') return 'repairLifecycleProjection';
  return 'missingLifecycleAuthority';
}

function lifecycleMirror(source = {}, status = null) {
  return {
    kind: 'directive.lifecycleCompatibilityMirror.v1',
    status: compact(status || lifecycleEvidenceStatus(source)) || null,
    lifecycleId: compact(source.id) || null,
    type: compact(source.type) || null,
    transactionId: compact(source.coreTransactionId || source.coreProjection?.transactionId || source.coreProjection?.coreTransactionId) || null,
    projectionSource: compact(source.projectionSource) || null
  };
}

function lifecycleAuthorityFields(source = {}) {
  const evidence = lifecycleEvidenceStatus(source);
  if (evidence === 'missingLifecycleAuthority') {
    const error = new Error('lifecycle projection write requires runtime or REPAIR authority evidence');
    error.code = 'DIRECTIVE_LIFECYCLE_AUTHORITY_REQUIRED';
    error.details = {
      kind: 'lifecycle',
      evidence,
      authority: compact(source.authority) || null
    };
    throw error;
  }
  return {
    authority: evidence,
    projectionSource: compact(source.projectionSource)
      || (evidence === 'repairLifecycleProjection' ? 'repairRuntime' : 'runtimeApp'),
    compatibilityMirror: cloneJson(source.compatibilityMirror || lifecycleMirror(source, evidence))
  };
}

export function recordLifecycleEvent(campaignState, event = {}, {
  limit = 100
} = {}) {
  const authority = lifecycleAuthorityFields(event);
  const tracked = initializeCampaignRuntimeTracking(campaignState);
  const projections = runtimeCoreProjectionEnvelope(tracked);
  const lifecycleJournal = Array.isArray(projections.lifecycleJournal) ? projections.lifecycleJournal : [];
  const entry = {
    id: compact(event.id) || `lifecycle-${lifecycleJournal.length + 1}`,
    type: compact(event.type) || 'lifecycle',
    status: compact(event.status) || 'recorded',
    authority: authority.authority,
    projectionSource: authority.projectionSource,
    compatibilityMirror: authority.compatibilityMirror,
    coreTransactionId: compact(event.coreTransactionId) || null,
    coreProjection: cloneJson(event.coreProjection || null),
    repairDecision: cloneJson(event.repairDecision || null),
    recordedAt: event.recordedAt || new Date().toISOString(),
    details: cloneJson(event.details || {})
  };
  const next = writeRuntimeCoreProjectionEnvelope(tracked, {
    lifecycleJournal: bounded([
      ...lifecycleJournal,
      entry
    ], limit)
  });
  next.runtimeTracking = {
    ...next.runtimeTracking,
    lifecycleJournal: []
  };
  return next;
}

export function recordModelCallEvent(campaignState, event = {}, {
  limit = 200
} = {}) {
  void campaignState;
  void event;
  void limit;
  const error = new Error('model-call old-ledger writes are disabled; write CORE modelCallDiagnostics instead');
  error.code = 'DIRECTIVE_CORE_PROJECTION_REQUIRED_FOR_OLD_LEDGER_WRITE';
  error.details = {
    kind: 'modelCall',
    evidence: 'coreDiagnosticProjectionRequired',
    authority: 'coreStoreV2'
  };
  throw error;
}

export function recordPendingInteraction(campaignState, interaction = {}, {
  limit = 50
} = {}) {
  void campaignState;
  void interaction;
  void limit;
  const error = new Error('pending interaction old-ledger writes are disabled; write CORE pendingInteraction projections instead');
  error.code = 'DIRECTIVE_CORE_PENDING_INTERACTION_PROJECTION_REQUIRED';
  error.details = {
    kind: 'pendingInteraction',
    evidence: 'corePendingInteractionProjectionRequired',
    authority: 'coreStoreV2'
  };
  throw error;
}

export function resolvePendingInteraction(campaignState, interactionId, resolution = {}) {
  void campaignState;
  void interactionId;
  void resolution;
  const error = new Error('pending interaction old-ledger resolution is disabled; write CORE pendingInteraction resolution projections instead');
  error.code = 'DIRECTIVE_CORE_PENDING_INTERACTION_PROJECTION_REQUIRED';
  error.details = {
    kind: 'pendingInteraction',
    evidence: 'corePendingInteractionResolutionRequired',
    authority: 'coreStoreV2'
  };
  throw error;
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
    revision: () => activeRevisionState(initializeCampaignRuntimeTracking(getState())).revision,
    mechanicsRevision: () => activeRevisionState(initializeCampaignRuntimeTracking(getState())).mechanicsRevision
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
