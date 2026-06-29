import {
  createTurnLatencyMetrics,
  hashStableJson,
  redactExternalDiagnostic,
  stableJsonByteLength
} from '../runtime/architecture-redesign-contracts.mjs';
import {
  commitV2DiagnosticsSegments,
  commitV2SaveLayout,
  loadV2MaterializedHead,
  loadV2SaveManifest,
  readV2ArtifactRef
} from './transaction-store-v2.mjs';

const PHASES = new Set([
  'observed',
  'routePending',
  'hostContinueReleased',
  'mechanicsPending',
  'narrationStarted',
  'visibleResponsePosted',
  'backgroundSettling',
  'responseRetryRequired',
  'recoveryRequired',
  'settled',
  'canceled'
]);

const PHASE_TRANSITIONS = Object.freeze({
  observed: new Set(['routePending', 'recoveryRequired', 'canceled']),
  routePending: new Set(['hostContinueReleased', 'mechanicsPending', 'narrationStarted', 'visibleResponsePosted', 'backgroundSettling', 'responseRetryRequired', 'recoveryRequired', 'canceled', 'settled']),
  hostContinueReleased: new Set(['visibleResponsePosted', 'backgroundSettling', 'responseRetryRequired', 'recoveryRequired', 'canceled', 'settled']),
  mechanicsPending: new Set(['narrationStarted', 'visibleResponsePosted', 'backgroundSettling', 'responseRetryRequired', 'recoveryRequired', 'canceled', 'settled']),
  narrationStarted: new Set(['visibleResponsePosted', 'responseRetryRequired', 'recoveryRequired', 'canceled']),
  visibleResponsePosted: new Set(['backgroundSettling', 'responseRetryRequired', 'recoveryRequired', 'canceled', 'settled']),
  backgroundSettling: new Set(['settled', 'recoveryRequired', 'canceled']),
  responseRetryRequired: new Set(['visibleResponsePosted', 'recoveryRequired', 'canceled', 'settled']),
  recoveryRequired: new Set(['canceled', 'settled']),
  settled: new Set(['recoveryRequired']),
  canceled: new Set([])
});

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function isoNow() {
  return new Date().toISOString();
}

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function assertPhase(phase) {
  const value = requireNonEmptyString(phase, 'phase');
  if (!PHASES.has(value)) throw new Error(`Unknown CORE transaction phase "${value}"`);
  return value;
}

function assertPhaseTransition(fromPhase, toPhase) {
  const from = assertPhase(fromPhase);
  const to = assertPhase(toPhase);
  if (from === to) return to;
  const allowed = PHASE_TRANSITIONS[from] || new Set();
  if (!allowed.has(to)) {
    const error = new Error(`Invalid CORE transaction phase transition ${from} -> ${to}`);
    error.code = 'DIRECTIVE_CORE_INVALID_PHASE_TRANSITION';
    error.details = { fromPhase: from, toPhase: to };
    throw error;
  }
  return to;
}

function createRevisions(base = {}) {
  return {
    mechanics: Math.max(0, Number(base.mechanics || 0)),
    runtime: Math.max(0, Number(base.runtime || 0)),
    diagnostic: Math.max(0, Number(base.diagnostic || 0)),
    prompt: Math.max(0, Number(base.prompt || 0))
  };
}

function nextRevisions(base, patch = {}) {
  const next = createRevisions(base);
  for (const key of ['mechanics', 'runtime', 'diagnostic', 'prompt']) {
    next[key] += Math.max(0, Number(patch[key] || 0));
  }
  return next;
}

function maxRevisions(...values) {
  const next = createRevisions();
  for (const value of values) {
    const revisions = createRevisions(value || {});
    for (const key of ['mechanics', 'runtime', 'diagnostic', 'prompt']) {
      next[key] = Math.max(next[key], revisions[key]);
    }
  }
  return next;
}

function sanitizeDiagnostic(value = {}) {
  return redactExternalDiagnostic(cloneJson(value));
}

function sourceFrameRef(sourceFrame = {}) {
  return compact({
    id: sourceFrame.id,
    hostMessageId: sourceFrame.hostMessageId || null,
    chatId: sourceFrame.chatId || null,
    textHash: sourceFrame.textHash || null,
    selectedAssistantVariantHash: sourceFrame.selectedAssistantVariantHash || null,
    externalPromptEnvironmentRef: sourceFrame.externalPromptEnvironmentRef ? cloneJson(sourceFrame.externalPromptEnvironmentRef) : undefined,
    sourceRevision: sourceFrame.sourceRevision || null,
    dedupeKey: sourceFrame.dedupeKey || sourceFrame.id || sourceFrame.hostMessageId || null,
    visibility: sourceFrame.visibility ? cloneJson(sourceFrame.visibility) : undefined
  });
}

function compactOperation(operation = {}) {
  return sanitizeDiagnostic(compact({
    domain: operation.domain || null,
    op: operation.op || operation.operation || null,
    summary: operation.summary || null,
    path: operation.path || null,
    targetId: operation.targetId || operation.id || null,
    sourceKind: operation.sourceKind || null,
    sourceHash: operation.sourceHash || null,
    sourceOutcomeId: operation.sourceOutcomeId || null,
    sourceEventIds: Array.isArray(operation.sourceEventIds) ? operation.sourceEventIds.map((id) => String(id || '').trim()).filter(Boolean) : undefined,
    sourceAnchorRangeHash: operation.sourceAnchorRangeHash || null,
    operationCount: Number.isFinite(Number(operation.operationCount)) ? Number(operation.operationCount) : undefined,
    changedRoots: Array.isArray(operation.changedRoots) ? operation.changedRoots.map((root) => String(root || '').trim()).filter(Boolean) : undefined,
    factHash: operation.factHash || null,
    valueHash: operation.value === undefined ? operation.valueHash || null : hashStableJson(operation.value)
  }));
}

function operationBundleRef(bundle = {}) {
  const operations = Array.isArray(bundle.operations) ? bundle.operations.map(compactOperation) : [];
  return compact({
    batchId: bundle.batchId || null,
    outcomeId: bundle.outcomeId || null,
    sourceToken: bundle.sourceToken || null,
    sourceFrameRef: bundle.sourceFrameRef ? sanitizeDiagnostic(bundle.sourceFrameRef) : undefined,
    baseMechanicsRevision: Number.isFinite(Number(bundle.baseMechanicsRevision)) ? Number(bundle.baseMechanicsRevision) : undefined,
    operationCount: operations.length,
    operations,
    operationBundleHash: hashStableJson(bundle),
    dirtyDomains: Array.isArray(bundle.promptDirtyDomains) ? [...bundle.promptDirtyDomains] : [],
    backgroundEffectRefs: Array.isArray(bundle.backgroundEffectRefs) ? bundle.backgroundEffectRefs.map(sanitizeDiagnostic) : undefined,
    rejectedRefs: Array.isArray(bundle.rejectedRefs) ? bundle.rejectedRefs.map(sanitizeDiagnostic) : undefined,
    staleResultRefs: Array.isArray(bundle.staleResultRefs) ? bundle.staleResultRefs.map(sanitizeDiagnostic) : undefined,
    workers: Array.isArray(bundle.workers) ? bundle.workers.map(sanitizeDiagnostic) : undefined,
    phaseAfter: bundle.phaseAfter || undefined
  });
}

function compactResponseRef(value = {}) {
  const turnLatency = compactTurnTiming(value.turnLatency || value.timing || {});
  return compact({
    kind: value.kind || value.responseKind || null,
    responseId: value.responseId || null,
    hostMessageId: value.hostMessageId || null,
    outcomeId: value.outcomeId || null,
    idempotencyKey: value.idempotencyKey || null,
    directiveGenerationStartedAt: value.directiveGenerationStartedAt || null,
    hostGenerationReleasedAt: value.hostGenerationReleasedAt || null,
    generationStartedAt: value.generationStartedAt || null,
    postedAt: value.postedAt || null,
    turnLatency: turnLatency ? sanitizeDiagnostic(turnLatency) : undefined,
    textHash: value.textHash || null
  });
}

function numericOrNull(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compactTurnTiming(value = {}) {
  if (!isObject(value)) return null;
  const normalizedInput = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
  const computed = createTurnLatencyMetrics(normalizedInput);
  const generationStartLatencyMs = computed.generationStartLatencyMs ?? numericOrNull(value.generationStartLatencyMs);
  const providerCompletionLatencyMs = computed.providerCompletionLatencyMs ?? numericOrNull(value.providerCompletionLatencyMs);
  const architectureWithin60s = computed.architectureWithin60s ?? (
    typeof value.architectureWithin60s === 'boolean' ? value.architectureWithin60s : null
  );
  const timing = compact({
    kind: computed.kind,
    playerSubmittedAt: computed.playerSubmittedAt,
    turnObservedAt: computed.turnObservedAt,
    routeDecidedAt: computed.routeDecidedAt,
    hostGenerationReleasedAt: computed.hostGenerationReleasedAt,
    directiveGenerationStartedAt: computed.directiveGenerationStartedAt,
    visibleResponsePostedAt: computed.visibleResponsePostedAt,
    backgroundSettledAt: computed.backgroundSettledAt,
    generationStartedAt: computed.generationStartedAt,
    generationStartLatencyMs,
    providerCompletionLatencyMs,
    architectureWithin60s,
    externalPromptMayIncludeHostMaterial: typeof value.externalPromptMayIncludeHostMaterial === 'boolean'
      ? value.externalPromptMayIncludeHostMaterial
      : undefined
  });
  const hasProofField = [
    'playerSubmittedAt',
    'turnObservedAt',
    'routeDecidedAt',
    'hostGenerationReleasedAt',
    'directiveGenerationStartedAt',
    'visibleResponsePostedAt',
    'generationStartedAt',
    'generationStartLatencyMs',
    'architectureWithin60s'
  ].some((key) => timing[key] !== null && timing[key] !== undefined);
  return hasProofField ? timing : null;
}

function mergeTiming(base = {}, patch = {}) {
  const next = { ...(isObject(base) ? base : {}) };
  for (const [key, value] of Object.entries(isObject(patch) ? patch : {})) {
    if (value !== undefined && value !== null) next[key] = value;
  }
  return next;
}

function eventRecord({
  id,
  type,
  txnId,
  campaignId,
  saveId,
  chatId,
  sourceFrameId,
  sequence,
  occurredAt,
  idempotencyKey = null,
  payload = null,
  revisionsBefore = null,
  revisionsAfter = null
} = {}) {
  return compact({
    kind: 'directive.coreEvent.v1',
    schemaVersion: 1,
    id,
    txnId,
    campaignId,
    saveId,
    chatId,
    sourceFrameId,
    sequence,
    type,
    occurredAt,
    idempotencyKey,
    revisionsBefore: revisionsBefore ? cloneJson(revisionsBefore) : undefined,
    revisionsAfter: revisionsAfter ? cloneJson(revisionsAfter) : undefined,
    payload: payload ? sanitizeDiagnostic(payload) : undefined
  });
}

function diagnosticRecord({
  id,
  type,
  transaction,
  campaignId,
  saveId,
  chatId,
  observedAt,
  payload,
  revisions
} = {}) {
  const redactedPayload = sanitizeDiagnostic(payload || {});
  return compact({
    kind: 'directive.coreDiagnostic.v1',
    schemaVersion: 1,
    id,
    txnId: transaction.id,
    sourceFrameId: transaction.sourceFrameId,
    diagnosticRevision: revisions?.diagnostic || 0,
    type,
    status: redactedPayload.status || null,
    severity: redactedPayload.severity || null,
    campaignId,
    saveId,
    chatId,
    observedAt,
    redactedPayload,
    sourceHash: hashStableJson(redactedPayload),
    revisions: cloneJson(revisions)
  });
}

function legacyTransactionId(event = {}) {
  return event.txnId || event.transactionId || null;
}

function eventRevisions(event = {}) {
  return event.revisionsAfter || event.revisions || null;
}

function eventPayload(event = {}) {
  return event.payload || {};
}

function diagnosticPayload(entry = {}) {
  return cloneJson(entry.redactedPayload || entry.payload || {});
}

function turnRecord({
  id,
  transaction,
  operationBundle,
  createdAt,
  revisions
} = {}) {
  const bundle = cloneJson(operationBundle || {});
  return compact({
    kind: 'directive.coreStoreTurnRecord.v1',
    schemaVersion: 1,
    id,
    transactionId: transaction.id,
    turnId: bundle.turnId || transaction.turnId || transaction.id,
    outcomeId: bundle.outcomeId || null,
    campaignId: transaction.campaignId,
    saveId: transaction.saveId,
    chatId: transaction.chatId,
    createdAt,
    operationSummary: bundle.summary || null,
    operationCount: Array.isArray(bundle.operations) ? bundle.operations.length : 0,
    operationHash: hashStableJson(bundle),
    committedRoots: Array.isArray(bundle.committedRoots) ? [...bundle.committedRoots] : [],
    promptDirtyDomains: Array.isArray(bundle.promptDirtyDomains) ? [...bundle.promptDirtyDomains] : [],
    revisions: cloneJson(revisions)
  });
}

function createInitialState({ campaignId, saveId, branchId, now }) {
  return {
    kind: 'directive.coreStore.v2',
    schemaVersion: 1,
    campaignId,
    saveId,
    branchId,
    createdAt: now,
    updatedAt: now,
    revisions: createRevisions(),
    transactions: {},
    events: [],
    turns: [],
    diagnostics: [],
    hostMapRows: [],
    promptDirtyDomains: [],
    counters: {
      transactions: 0,
      events: 0,
      turns: 0,
      diagnostics: 0,
      backgrounds: 0,
      recoveries: 0
    }
  };
}

function transactionHeadEntry(transaction) {
  return {
    id: transaction.id,
    phase: transaction.phase,
    route: transaction.route || null,
    sourceFrameId: transaction.sourceFrameId,
    chatId: transaction.chatId,
    updatedAt: transaction.updatedAt || transaction.createdAt,
    revisions: cloneJson(transaction.revisions)
  };
}

function buildHead(state) {
  return {
    coreStore: {
      kind: 'directive.coreStoreHead.v2',
      schemaVersion: 1,
      campaignId: state.campaignId,
      saveId: state.saveId,
      branchId: state.branchId,
      updatedAt: state.updatedAt,
      revisions: cloneJson(state.revisions),
      counters: cloneJson(state.counters),
      activeTransactionIds: Object.values(state.transactions)
        .filter((transaction) => !['settled', 'canceled'].includes(transaction.phase))
        .map((transaction) => transaction.id),
      transactions: Object.fromEntries(Object.values(state.transactions).map((transaction) => [
        transaction.id,
        transactionHeadEntry(transaction)
      ])),
      promptDirtyDomains: [...new Set(state.promptDirtyDomains)]
    }
  };
}

function buildHostMap(state) {
  return {
    excludesRawChatText: true,
    rows: state.hostMapRows.map(cloneJson)
  };
}

function buildPromptCache(state) {
  return {
    directiveOwnedRevision: state.revisions.prompt,
    dirtyDomains: [...new Set(state.promptDirtyDomains)],
    blocks: []
  };
}

function buildPersistPayload(state) {
  return {
    campaignId: state.campaignId,
    saveId: state.saveId,
    branchId: state.branchId,
    head: buildHead(state),
    hostMap: buildHostMap(state),
    promptCache: buildPromptCache(state),
    eventSegments: [state.events],
    turnSegments: [state.turns],
    diagnosticsSegments: [state.diagnostics],
    checkpoints: [],
    now: state.updatedAt,
    metadata: {
      source: 'core-store-v2',
      eventCount: state.events.length,
      turnCount: state.turns.length,
      diagnosticCount: state.diagnostics.length
    }
  };
}

function projectionStatusForPhase(phase) {
  if (phase === 'responseRetryRequired') return 'responseRetryRequired';
  if (phase === 'recoveryRequired') return 'recoveryRequired';
  if (phase === 'canceled') return 'canceled';
  if (phase === 'settled') return 'settled';
  if (phase === 'backgroundSettling') return 'complete';
  if (phase === 'visibleResponsePosted') return 'complete';
  if (phase === 'hostContinueReleased') return 'hostContinueReleased';
  return 'pending';
}

function buildTurnTimingProjections(events = [], transactionMap = {}) {
  const timingByTransaction = new Map();
  const eventIdsByTransaction = new Map();
  const responseRefByTransaction = new Map();

  for (const event of events || []) {
    const txnId = legacyTransactionId(event);
    if (!txnId) continue;
    const payload = eventPayload(event);
    const prior = timingByTransaction.get(txnId) || {};
    if (event.type === 'phaseAdvanced') {
      timingByTransaction.set(txnId, mergeTiming(prior, {
        ...(payload.timing || {}),
        directivePromptRevisionUsed: payload.directivePromptRevisionUsed ?? prior.directivePromptRevisionUsed ?? null
      }));
      eventIdsByTransaction.set(txnId, [
        ...(eventIdsByTransaction.get(txnId) || []),
        event.id
      ]);
    }
    if (event.type === 'visibleResponseRecorded') {
      const responseRef = payload.responseRef || {};
      responseRefByTransaction.set(txnId, responseRef);
      const responseTiming = mergeTiming(responseRef.turnLatency || {}, {
        hostGenerationReleasedAt: responseRef.hostGenerationReleasedAt,
        directiveGenerationStartedAt: responseRef.directiveGenerationStartedAt,
        visibleResponsePostedAt: responseRef.postedAt || event.occurredAt,
        generationStartedAt: responseRef.generationStartedAt
      });
      timingByTransaction.set(txnId, mergeTiming(prior, responseTiming));
      eventIdsByTransaction.set(txnId, [
        ...(eventIdsByTransaction.get(txnId) || []),
        event.id
      ]);
    }
  }

  return [...timingByTransaction.entries()]
    .map(([transactionId, rawTiming]) => {
      const turnTiming = compactTurnTiming(rawTiming);
      if (!turnTiming) return null;
      const transaction = transactionMap?.[transactionId] || {};
      const responseRef = responseRefByTransaction.get(transactionId) || {};
      return compact({
        id: `turn-timing:${transactionId}`,
        transactionId,
        sourceFrameId: transaction.sourceFrameId || null,
        hostMessageId: transaction.sourceFrame?.hostMessageId || null,
        responseHostMessageId: responseRef.hostMessageId || null,
        chatId: transaction.chatId || null,
        route: transaction.route || null,
        status: projectionStatusForPhase(transaction.phase),
        responseKind: responseRef.kind || responseRef.responseKind || null,
        directivePromptRevisionUsed: rawTiming.directivePromptRevisionUsed ?? null,
        eventIds: eventIdsByTransaction.get(transactionId) || [],
        turnTiming
      });
    })
    .filter(Boolean);
}

function reconstructTransactionsFromEvents(events = []) {
  const transactions = {};
  for (const event of events || []) {
    const txnId = legacyTransactionId(event);
    if (!txnId) continue;
    const payload = eventPayload(event);
    const transaction = transactions[txnId] || {
      id: txnId,
      sourceFrameId: event.sourceFrameId || null,
      chatId: event.chatId || null,
      campaignId: event.campaignId || null,
      saveId: event.saveId || null,
      createdAt: event.occurredAt || null,
      updatedAt: event.occurredAt || null,
      phase: 'observed',
      route: null,
      outcomeId: null,
      visibleResponseRef: null,
      recoveryCaseId: null,
      revisions: eventRevisions(event),
      sourceFrame: null,
      ingressId: `ingress:${txnId}`,
      phaseAdvanceIdempotencyKeys: []
    };
    if (event.type === 'turnObserved') {
      transaction.phase = 'observed';
      transaction.sourceFrame = cloneJson(payload.sourceFrameRef || payload.sourceFrame || {});
      transaction.sourceFrameId = event.sourceFrameId || transaction.sourceFrame?.id || transaction.sourceFrameId;
      transaction.chatId = event.chatId || transaction.sourceFrame?.chatId || transaction.chatId;
      transaction.ingressId = payload.ingressId || transaction.ingressId;
      transaction.beginIdempotencyKey = event.idempotencyKey || transaction.beginIdempotencyKey || null;
    }
    if (event.type === 'phaseAdvanced') {
      transaction.phase = payload.toPhase || payload.phasePatch?.phase || transaction.phase;
      transaction.route = payload.route === undefined ? transaction.route : payload.route;
      if (event.idempotencyKey) {
        transaction.phaseAdvanceIdempotencyKeys = [
          ...new Set([...(transaction.phaseAdvanceIdempotencyKeys || []), event.idempotencyKey])
        ];
      }
    }
    if (event.type === 'mechanicsCommitted') {
      transaction.turnId = payload.turnRef?.turnId || transaction.turnId || null;
      transaction.outcomeId = payload.turnRef?.outcomeId || payload.outcomeId || transaction.outcomeId || null;
      transaction.phase = payload.phaseAfter || transaction.phase;
      transaction.mechanicsIdempotencyKey = event.idempotencyKey || transaction.mechanicsIdempotencyKey || null;
    }
    if (event.type === 'visibleResponseRecorded') {
      transaction.phase = 'visibleResponsePosted';
      transaction.visibleResponseRef = cloneJson(payload.responseRef || {});
      transaction.outcomeId = transaction.visibleResponseRef?.outcomeId || transaction.outcomeId || null;
      transaction.visibleResponseIdempotencyKey = event.idempotencyKey || transaction.visibleResponseIdempotencyKey || null;
    }
    if (event.type === 'backgroundBatchCommitted') {
      const bundle = payload.operationBundle || {};
      const batchId = bundle.batchId || `background:${transaction.id}`;
      const backgroundRef = compact({
        batchId,
        idempotencyKey: event.idempotencyKey || null,
        outcomeId: bundle.outcomeId || null,
        operationCount: bundle.operationCount || 0,
        workerCount: Array.isArray(bundle.workers) ? bundle.workers.length : 0,
        occurredAt: event.occurredAt || null
      });
      transaction.phase = payload.phaseAfter || bundle.phaseAfter || 'backgroundSettling';
      transaction.backgroundBatchId = transaction.backgroundBatchId || batchId;
      transaction.backgroundBatchIds = uniqueStrings([
        ...(transaction.backgroundBatchIds || []),
        batchId
      ]);
      transaction.backgroundBatches = [
        ...(transaction.backgroundBatches || []),
        backgroundRef
      ];
      transaction.backgroundIdempotencyKey = event.idempotencyKey || transaction.backgroundIdempotencyKey || null;
      transaction.backgroundIdempotencyKeys = uniqueStrings([
        ...(transaction.backgroundIdempotencyKeys || []),
        event.idempotencyKey
      ]);
    }
    if (event.type === 'recoveryRequired') {
      transaction.phase = payload.phaseAfter || payload.recoveryCase?.phase || 'recoveryRequired';
      transaction.recoveryCaseId = payload.recoveryCase?.id || null;
      transaction.recoveryReason = payload.recoveryCase?.reason || null;
      transaction.recoveryIdempotencyKey = event.idempotencyKey || transaction.recoveryIdempotencyKey || null;
    }
    transaction.revisions = eventRevisions(event) || transaction.revisions;
    transaction.updatedAt = event.occurredAt || transaction.updatedAt || transaction.createdAt;
    transactions[txnId] = transaction;
  }
  return transactions;
}

export function buildCoreStoreReadProjections(state = {}) {
  const transactionMap = Object.keys(state.transactions || {}).length > 0
    ? state.transactions
    : reconstructTransactionsFromEvents(state.events || []);
  const transactions = Object.values(transactionMap || {});
  const responseEvents = (state.events || []).filter((event) => event.type === 'visibleResponseRecorded');
  const recoveryEvents = (state.events || []).filter((event) => event.type === 'recoveryRequired');
  const backgroundEvents = (state.events || []).filter((event) => event.type === 'backgroundBatchCommitted');
  const diagnostics = state.diagnostics || [];
  const turnTiming = buildTurnTimingProjections(state.events || [], transactionMap);
  return {
    kind: 'directive.coreStoreReadProjections.v1',
    schemaVersion: 1,
    ingressLedger: transactions.map((transaction) => compact({
      id: transaction.ingressId || `ingress:${transaction.id}`,
      transactionId: transaction.id,
      sourceFrameId: transaction.sourceFrameId,
      hostMessageId: transaction.sourceFrame?.hostMessageId || null,
      chatId: transaction.chatId,
      textHash: transaction.sourceFrame?.textHash || null,
      status: projectionStatusForPhase(transaction.phase),
      route: transaction.route || null,
      outcomeId: transaction.outcomeId || null
    })),
    responseLedger: responseEvents.map((event) => compact({
      id: eventPayload(event).responseRef?.responseId || `response:${legacyTransactionId(event)}`,
      transactionId: legacyTransactionId(event),
      hostMessageId: eventPayload(event).responseRef?.hostMessageId || null,
      outcomeId: eventPayload(event).responseRef?.outcomeId || null,
      responseKind: eventPayload(event).responseRef?.kind || eventPayload(event).responseRef?.responseKind || null,
      generationStartedAt: eventPayload(event).responseRef?.generationStartedAt || null,
      turnTiming: eventPayload(event).responseRef?.turnLatency ? cloneJson(eventPayload(event).responseRef.turnLatency) : undefined,
      status: 'posted'
    })),
    turnTiming,
    turnLedger: {
      entries: (state.turns || []).map((turn) => compact({
        id: turn.id,
        transactionId: turn.transactionId,
        turnId: turn.turnId,
        outcomeId: turn.outcomeId,
        status: 'committed',
        operationHash: turn.operationHash,
        operationSummary: turn.operationSummary,
        committedRoots: turn.committedRoots,
        revisions: cloneJson(turn.revisions)
      })),
      lastCommittedOutcomeId: [...(state.turns || [])].reverse().find((turn) => turn.outcomeId)?.outcomeId || null
    },
    recoveryJournal: recoveryEvents.map((event) => compact({
      id: eventPayload(event).recoveryCase?.id || `recovery:${legacyTransactionId(event)}`,
      transactionId: legacyTransactionId(event),
      status: eventPayload(event).recoveryCase?.status || 'required',
      phase: eventPayload(event).phaseAfter || eventPayload(event).recoveryCase?.phase || null,
      reason: eventPayload(event).recoveryCase?.reason || null,
      sourceFrameId: transactionMap?.[legacyTransactionId(event)]?.sourceFrameId || event.sourceFrameId || null
    })),
    modelCallDiagnostics: diagnostics
      .filter((entry) => entry.type === 'modelCall')
      .map(diagnosticPayload),
    sidecarDiagnostics: [
      ...diagnostics
        .filter((entry) => entry.type === 'sidecar')
        .map(diagnosticPayload),
      ...backgroundEvents.flatMap((event) => Array.isArray(eventPayload(event).operationBundle?.workers)
        ? eventPayload(event).operationBundle.workers.map((worker) => cloneJson(worker))
        : [])
    ],
    backgroundBatches: backgroundEvents.map((event) => compact({
      id: event.id,
      transactionId: legacyTransactionId(event),
      sourceFrameId: event.sourceFrameId || null,
      batchId: eventPayload(event).operationBundle?.batchId || null,
      outcomeId: eventPayload(event).operationBundle?.outcomeId || null,
      operationCount: eventPayload(event).operationBundle?.operationCount || 0,
      dirtyDomains: cloneJson(eventPayload(event).operationBundle?.dirtyDomains || []),
      workerCount: Array.isArray(eventPayload(event).operationBundle?.workers)
        ? eventPayload(event).operationBundle.workers.length
        : 0,
      occurredAt: event.occurredAt || null
    }))
  };
}

async function readSegmentEntries(adapter, refs = []) {
  const entries = [];
  for (const ref of refs || []) {
    const segment = await readV2ArtifactRef(adapter, ref);
    if (Array.isArray(segment.entries)) entries.push(...segment.entries.map(cloneJson));
  }
  return entries;
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function coreStoreCounters({ transactions = {}, events = [], turns = [], diagnostics = [] } = {}) {
  return {
    transactions: Object.keys(transactions || {}).length,
    events: Array.isArray(events) ? events.length : 0,
    turns: Array.isArray(turns) ? turns.length : 0,
    diagnostics: Array.isArray(diagnostics) ? diagnostics.length : 0,
    backgrounds: (events || []).filter((event) => event?.type === 'backgroundBatchCommitted').length,
    recoveries: (events || []).filter((event) => event?.type === 'recoveryRequired').length
  };
}

function normalizeHydratedTransaction(transaction = {}, { campaignId, saveId, updatedAt } = {}) {
  return {
    ...cloneJson(transaction),
    campaignId: transaction.campaignId || campaignId,
    saveId: transaction.saveId || saveId,
    createdAt: transaction.createdAt || transaction.updatedAt || updatedAt,
    updatedAt: transaction.updatedAt || transaction.createdAt || updatedAt,
    revisions: createRevisions(transaction.revisions || {}),
    phaseAdvanceIdempotencyKeys: Array.isArray(transaction.phaseAdvanceIdempotencyKeys)
      ? [...transaction.phaseAdvanceIdempotencyKeys]
      : []
  };
}

export async function loadCoreStoreStateV2(adapter, {
  campaignId,
  saveId,
  branchId = 'main',
  now = null,
  missingOk = false
} = {}) {
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const save = requireNonEmptyString(saveId, 'saveId');
  let manifest;
  try {
    manifest = await loadV2SaveManifest(adapter, {
      campaignId: id,
      saveId: save,
      layout: 'core'
    });
  } catch (error) {
    if (missingOk === true && (error?.code === 'ENOENT' || /not found/i.test(error?.message || ''))) return null;
    throw error;
  }

  const [head, hostMap, promptCache, events, turns, diagnostics] = await Promise.all([
    manifest.head ? readV2ArtifactRef(adapter, manifest.head) : null,
    manifest.hostMap ? readV2ArtifactRef(adapter, manifest.hostMap) : null,
    manifest.promptCache ? readV2ArtifactRef(adapter, manifest.promptCache) : null,
    readSegmentEntries(adapter, manifest.eventSegments || []),
    readSegmentEntries(adapter, manifest.turnSegments || []),
    readSegmentEntries(adapter, manifest.diagnosticsSegments || [])
  ]);
  const coreHead = head?.coreStore || {};
  const timestamp = coreHead.updatedAt || manifest.updatedAt || (typeof now === 'function' ? now() : now) || isoNow();
  const transactions = Object.fromEntries(Object.entries(reconstructTransactionsFromEvents(events)).map(([key, transaction]) => [
    key,
    normalizeHydratedTransaction(transaction, {
      campaignId: id,
      saveId: save,
      updatedAt: timestamp
    })
  ]));
  const revisions = maxRevisions(
    coreHead.revisions || {},
    ...events.map((event) => event.revisionsAfter || event.revisions || {}),
    ...turns.map((turn) => turn.revisions || {}),
    ...diagnostics.map((diagnostic) => diagnostic.revisions || {})
  );
  return {
    kind: 'directive.coreStore.v2',
    schemaVersion: 1,
    campaignId: id,
    saveId: save,
    branchId: manifest.branchId || branchId,
    createdAt: manifest.createdAt || timestamp,
    updatedAt: timestamp,
    revisions,
    transactions,
    events: events.map(cloneJson),
    turns: turns.map(cloneJson),
    diagnostics: diagnostics.map(cloneJson),
    hostMapRows: Array.isArray(hostMap?.rows) ? hostMap.rows.map(cloneJson) : [],
    promptDirtyDomains: uniqueStrings([
      ...(Array.isArray(coreHead.promptDirtyDomains) ? coreHead.promptDirtyDomains : []),
      ...(Array.isArray(promptCache?.dirtyDomains) ? promptCache.dirtyDomains : []),
      ...turns.flatMap((turn) => Array.isArray(turn?.promptDirtyDomains) ? turn.promptDirtyDomains : [])
    ]),
    counters: coreStoreCounters({ transactions, events, turns, diagnostics })
  };
}

export async function readCoreStoreProjectionsV2(adapter, {
  campaignId,
  saveId,
  layout = 'core'
} = {}) {
  const manifest = await loadV2SaveManifest(adapter, {
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    saveId: requireNonEmptyString(saveId, 'saveId'),
    layout
  });
  const [events, turns, diagnostics] = await Promise.all([
    readSegmentEntries(adapter, manifest.eventSegments || []),
    readSegmentEntries(adapter, manifest.turnSegments || []),
    readSegmentEntries(adapter, manifest.diagnosticsSegments || [])
  ]);
  return buildCoreStoreReadProjections({
    events,
    turns,
    diagnostics,
    transactions: reconstructTransactionsFromEvents(events)
  });
}

export function createCoreStoreV2({
  adapter,
  campaignId,
  saveId,
  branchId = 'main',
  now = null,
  initialState = null
} = {}) {
  requireObject(adapter, 'storage adapter');
  const id = requireNonEmptyString(campaignId, 'campaignId');
  const save = requireNonEmptyString(saveId, 'saveId');
  const clock = typeof now === 'function' ? now : () => now || isoNow();
  const state = initialState
    ? {
        ...cloneJson(initialState),
        campaignId: id,
        saveId: save,
        branchId: initialState.branchId || requireNonEmptyString(branchId, 'branchId'),
        revisions: createRevisions(initialState.revisions || {}),
        transactions: cloneJson(initialState.transactions || {}),
        events: Array.isArray(initialState.events) ? initialState.events.map(cloneJson) : [],
        turns: Array.isArray(initialState.turns) ? initialState.turns.map(cloneJson) : [],
        diagnostics: Array.isArray(initialState.diagnostics) ? initialState.diagnostics.map(cloneJson) : [],
        hostMapRows: Array.isArray(initialState.hostMapRows) ? initialState.hostMapRows.map(cloneJson) : [],
        promptDirtyDomains: uniqueStrings(initialState.promptDirtyDomains || []),
        counters: coreStoreCounters({
          transactions: initialState.transactions || {},
          events: initialState.events || [],
          turns: initialState.turns || [],
          diagnostics: initialState.diagnostics || []
        })
      }
    : createInitialState({
        campaignId: id,
        saveId: save,
      branchId: requireNonEmptyString(branchId, 'branchId'),
      now: clock()
    });
  let lastCommit = null;
  let writeQueue = Promise.resolve();

  function timestamp() {
    return clock();
  }

  function eventId(type) {
    return `core-event-${String(state.events.length + 1).padStart(6, '0')}:${type}`;
  }

  function diagnosticId(type) {
    return `core-diagnostic-${String(state.diagnostics.length + 1).padStart(6, '0')}:${type}`;
  }

  function turnId() {
    return `core-turn-${String(state.turns.length + 1).padStart(6, '0')}`;
  }

  function requireTransaction(transactionId) {
    const transaction = state.transactions[requireNonEmptyString(transactionId, 'transactionId')];
    if (!transaction) throw new Error(`Unknown CORE transaction "${transactionId}"`);
    return transaction;
  }

  function enqueueWrite(task) {
    const run = writeQueue.then(task, task);
    writeQueue = run.then(() => null, () => null);
    return run;
  }

  async function persist() {
    state.updatedAt = timestamp();
    const snapshot = cloneJson(state);
    return enqueueWrite(async () => {
      lastCommit = await commitV2SaveLayout(adapter, {
        ...buildPersistPayload(snapshot),
        layout: 'core'
      });
      return lastCommit;
    });
  }

  function appendEvent(type, transaction, {
    payload = {},
    revisionsBefore = null,
    revisionsAfter = null,
    idempotencyKey = null,
    occurredAt = state.updatedAt
  } = {}) {
    const sequence = state.events.length + 1;
    const event = eventRecord({
      id: eventId(type),
      type,
      txnId: transaction.id,
      campaignId: state.campaignId,
      saveId: state.saveId,
      chatId: transaction.chatId,
      sourceFrameId: transaction.sourceFrameId,
      sequence,
      occurredAt,
      idempotencyKey,
      payload,
      revisionsBefore,
      revisionsAfter
    });
    state.events.push(event);
    state.counters.events = state.events.length;
    return event;
  }

  function touchTransaction(transaction, patch = {}) {
    Object.assign(transaction, patch, {
      updatedAt: state.updatedAt,
      revisions: cloneJson(state.revisions)
    });
    return transaction;
  }

  return {
    get state() {
      return cloneJson(state);
    },
    get lastCommit() {
      return cloneJson(lastCommit);
    },
    readProjections() {
      return buildCoreStoreReadProjections(state);
    },
    getTransaction(transactionId) {
      return cloneJson(requireTransaction(transactionId));
    },
    getRevisions() {
      return cloneJson(state.revisions);
    },
    async loadHead() {
      return loadV2MaterializedHead(adapter, { campaignId: state.campaignId, saveId: state.saveId, layout: 'core' });
    },
    async beginTurn(sourceFrame, options = {}) {
      requireObject(sourceFrame, 'sourceFrame');
      const createdAt = timestamp();
      const transactionId = options.transactionId || `txn:${sourceFrame.id || sourceFrame.hostMessageId || state.counters.transactions + 1}`;
      const existing = state.transactions[transactionId];
      if (existing) {
        if (options.idempotencyKey && existing.beginIdempotencyKey === options.idempotencyKey) return cloneJson(existing);
        const error = new Error(`CORE transaction "${transactionId}" already exists`);
        error.code = 'DIRECTIVE_CORE_DUPLICATE_TRANSACTION';
        throw error;
      }
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = createdAt;
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      const sourceRef = sourceFrameRef(sourceFrame);
      const transaction = {
        kind: 'directive.turnTransaction.v1',
        schemaVersion: 1,
        id: requireNonEmptyString(transactionId, 'transactionId'),
        phase: 'observed',
        sourceFrameId: requireNonEmptyString(sourceFrame.id, 'sourceFrame.id'),
        campaignId: state.campaignId,
        saveId: state.saveId,
        chatId: requireNonEmptyString(sourceFrame.chatId || options.chatId, 'chatId'),
        createdAt,
        updatedAt: createdAt,
        route: null,
        visibleResponseRef: null,
        recoveryCaseId: null,
        revisions: cloneJson(state.revisions),
        sourceFrame: sourceRef,
        ingressId: options.ingressId || `ingress:${transactionId}`,
        beginIdempotencyKey: options.idempotencyKey || null
      };
      state.transactions[transaction.id] = transaction;
      state.counters.transactions = Object.keys(state.transactions).length;
      state.hostMapRows.push(compact({
        hostMessageId: sourceFrame.hostMessageId || null,
        role: 'player',
        transactionId: transaction.id,
        sourceFrameId: transaction.sourceFrameId,
        chatId: transaction.chatId,
        textHash: sourceFrame.textHash || null,
        visibility: sourceFrame.visibility || null
      }));
      appendEvent('turnObserved', transaction, {
        payload: { sourceFrameRef: sourceRef, ingressId: transaction.ingressId },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: options.idempotencyKey || null,
        occurredAt: createdAt
      });
      await persist();
      return cloneJson(transaction);
    },
    async advanceTurn(transactionId, phasePatch = {}) {
      const transaction = requireTransaction(transactionId);
      if (
        phasePatch.idempotencyKey
        && Array.isArray(transaction.phaseAdvanceIdempotencyKeys)
        && transaction.phaseAdvanceIdempotencyKeys.includes(phasePatch.idempotencyKey)
      ) {
        return cloneJson(transaction);
      }
      const fromPhase = transaction.phase;
      const phase = phasePatch.phase ? assertPhaseTransition(fromPhase, phasePatch.phase) : transaction.phase;
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      touchTransaction(transaction, {
        phase,
        route: phasePatch.route === undefined ? transaction.route : phasePatch.route,
        routeReason: phasePatch.reason || transaction.routeReason || null,
        phaseAdvanceIdempotencyKeys: phasePatch.idempotencyKey
          ? [...new Set([...(transaction.phaseAdvanceIdempotencyKeys || []), phasePatch.idempotencyKey])]
          : transaction.phaseAdvanceIdempotencyKeys || []
      });
      appendEvent('phaseAdvanced', transaction, {
        payload: {
          fromPhase,
          toPhase: phase,
          route: phasePatch.route === undefined ? transaction.route : phasePatch.route,
          timing: sanitizeDiagnostic(phasePatch.timing || {}),
          directivePromptRevisionUsed: phasePatch.directivePromptRevisionUsed ?? null
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: phasePatch.idempotencyKey || null
      });
      await persist();
      return cloneJson(transaction);
    },
    async commitMechanics(transactionId, operationBundle = {}) {
      const transaction = requireTransaction(transactionId);
      const bundle = cloneJson(operationBundle);
      if (transaction.turnId) {
        if (bundle.idempotencyKey && transaction.mechanicsIdempotencyKey === bundle.idempotencyKey) {
          return cloneJson(state.turns.find((turn) => turn.transactionId === transaction.id));
        }
        const error = new Error(`CORE transaction "${transaction.id}" already has committed mechanics`);
        error.code = 'DIRECTIVE_CORE_MECHANICS_ALREADY_COMMITTED';
        throw error;
      }
      if (Number.isFinite(Number(bundle.baseMechanicsRevision)) && Number(bundle.baseMechanicsRevision) !== state.revisions.mechanics) {
        const error = new Error(`Stale CORE mechanics base revision for "${transaction.id}"`);
        error.code = 'DIRECTIVE_CORE_STALE_MECHANICS_REVISION';
        error.details = { expected: state.revisions.mechanics, actual: Number(bundle.baseMechanicsRevision) };
        throw error;
      }
      const phaseAfter = bundle.phaseAfter ? assertPhaseTransition(transaction.phase, bundle.phaseAfter) : transaction.phase;
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { mechanics: 1, runtime: 1 });
      const turn = turnRecord({
        id: turnId(),
        transaction,
        operationBundle: bundle,
        createdAt: state.updatedAt,
        revisions: state.revisions
      });
      state.turns.push(turn);
      state.counters.turns = state.turns.length;
      if (Array.isArray(bundle.promptDirtyDomains)) {
        state.promptDirtyDomains.push(...bundle.promptDirtyDomains);
      }
      touchTransaction(transaction, {
        phase: phaseAfter,
        turnId: turn.turnId,
        outcomeId: turn.outcomeId,
        mechanicsIdempotencyKey: bundle.idempotencyKey || null
      });
      appendEvent('mechanicsCommitted', transaction, {
        payload: {
          operationBundle: operationBundleRef(bundle),
          turnRef: { id: turn.id, turnId: turn.turnId, outcomeId: turn.outcomeId },
          phaseAfter
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: bundle.idempotencyKey || null
      });
      await persist();
      return cloneJson(turn);
    },
    async recordVisibleResponse(transactionId, responseRef = {}) {
      const transaction = requireTransaction(transactionId);
      const ref = compactResponseRef(responseRef);
      if (transaction.visibleResponseRef) {
        if (ref.idempotencyKey && transaction.visibleResponseIdempotencyKey === ref.idempotencyKey) return cloneJson(transaction);
        const error = new Error(`CORE transaction "${transaction.id}" already has a visible response`);
        error.code = 'DIRECTIVE_CORE_VISIBLE_RESPONSE_ALREADY_RECORDED';
        throw error;
      }
      assertPhaseTransition(transaction.phase, 'visibleResponsePosted');
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      touchTransaction(transaction, {
        phase: 'visibleResponsePosted',
        visibleResponseRef: ref,
        outcomeId: ref.outcomeId || transaction.outcomeId || null,
        visibleResponseIdempotencyKey: ref.idempotencyKey || null
      });
      state.hostMapRows.push(compact({
        hostMessageId: ref.hostMessageId || null,
        role: 'assistant',
        transactionId: transaction.id,
        outcomeId: ref.outcomeId || transaction.outcomeId || null,
        chatId: transaction.chatId,
        responseKind: ref.kind || null
      }));
      appendEvent('visibleResponseRecorded', transaction, {
        payload: { responseRef: ref },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: ref.idempotencyKey || null
      });
      await persist();
      return cloneJson(transaction);
    },
    async markRecoveryRequired(transactionId, recoveryBundle = {}) {
      const transaction = requireTransaction(transactionId);
      if (transaction.recoveryCaseId) {
        if (recoveryBundle.idempotencyKey && transaction.recoveryIdempotencyKey === recoveryBundle.idempotencyKey) {
          return cloneJson({ id: transaction.recoveryCaseId, status: 'required', reason: transaction.recoveryReason || null });
        }
        const error = new Error(`CORE transaction "${transaction.id}" already has a recovery case`);
        error.code = 'DIRECTIVE_CORE_RECOVERY_ALREADY_REQUIRED';
        throw error;
      }
      const phaseAfter = recoveryBundle.phaseAfter
        || recoveryBundle.phase
        || (recoveryBundle.responseRetry === true || recoveryBundle.retryableResponse === true
          ? 'responseRetryRequired'
          : 'recoveryRequired');
      assertPhaseTransition(transaction.phase, phaseAfter);
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, { runtime: 1 });
      const recoveryCase = {
        id: recoveryBundle.id || `recovery:${transaction.id}`,
        status: recoveryBundle.status || 'required',
        phase: phaseAfter,
        reason: recoveryBundle.reason || null,
        detailsHash: hashStableJson(recoveryBundle)
      };
      state.counters.recoveries += 1;
      touchTransaction(transaction, {
        phase: phaseAfter,
        recoveryCaseId: recoveryCase.id,
        recoveryReason: recoveryCase.reason || null,
        recoveryIdempotencyKey: recoveryBundle.idempotencyKey || null
      });
      appendEvent('recoveryRequired', transaction, {
        payload: {
          recoveryCase,
          phaseAfter,
          sourceMutation: sanitizeDiagnostic(recoveryBundle.sourceMutation || {}),
          dependentOutcomeId: recoveryBundle.dependentOutcomeId || null,
          dependentResponseId: recoveryBundle.dependentResponseId || null,
          allowedActions: Array.isArray(recoveryBundle.allowedActions) ? [...recoveryBundle.allowedActions] : []
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey: recoveryBundle.idempotencyKey || null
      });
      await persist();
      return cloneJson(recoveryCase);
    },
    async commitBackgroundBatch(transactionId, operationBundle = {}) {
      const transaction = requireTransaction(transactionId);
      const batchId = operationBundle.batchId || `background:${transaction.id}`;
      const idempotencyKey = operationBundle.idempotencyKey || null;
      const existingBackgroundEvent = (state.events || []).find((event) => {
        if (event?.type !== 'backgroundBatchCommitted') return false;
        if (legacyTransactionId(event) !== transaction.id) return false;
        const bundle = eventPayload(event).operationBundle || {};
        if (idempotencyKey && event.idempotencyKey === idempotencyKey) return true;
        return batchId && bundle.batchId === batchId;
      });
      if (existingBackgroundEvent) {
        if (idempotencyKey && existingBackgroundEvent.idempotencyKey === idempotencyKey) return cloneJson(transaction);
        const error = new Error(`CORE transaction "${transaction.id}" already has background batch "${batchId}"`);
        error.code = 'DIRECTIVE_CORE_BACKGROUND_BATCH_DUPLICATE';
        throw error;
      }
      if (Number.isFinite(Number(operationBundle.baseMechanicsRevision)) && Number(operationBundle.baseMechanicsRevision) !== state.revisions.mechanics) {
        const error = new Error(`Stale CORE background base revision for "${transaction.id}"`);
        error.code = 'DIRECTIVE_CORE_STALE_MECHANICS_REVISION';
        error.details = { expected: state.revisions.mechanics, actual: Number(operationBundle.baseMechanicsRevision) };
        throw error;
      }
      const hasOperations = Array.isArray(operationBundle.operations) && operationBundle.operations.length > 0;
      const hasPromptDirty = Array.isArray(operationBundle.promptDirtyDomains) && operationBundle.promptDirtyDomains.length > 0;
      const phaseAfter = operationBundle.phaseAfter
        ? assertPhaseTransition(transaction.phase, operationBundle.phaseAfter)
        : assertPhaseTransition(transaction.phase, 'backgroundSettling');
      const revisionsBefore = cloneJson(state.revisions);
      state.updatedAt = timestamp();
      state.revisions = nextRevisions(state.revisions, {
        mechanics: hasOperations ? 1 : 0,
        runtime: 1
      });
      if (hasPromptDirty) state.promptDirtyDomains.push(...operationBundle.promptDirtyDomains);
      state.counters.backgrounds += 1;
      const backgroundRef = compact({
        batchId,
        idempotencyKey,
        outcomeId: operationBundle.outcomeId || null,
        operationCount: hasOperations ? operationBundle.operations.length : 0,
        workerCount: Array.isArray(operationBundle.workers) ? operationBundle.workers.length : 0,
        occurredAt: state.updatedAt
      });
      touchTransaction(transaction, {
        phase: phaseAfter,
        backgroundBatchId: transaction.backgroundBatchId || batchId,
        backgroundBatchIds: uniqueStrings([
          ...(transaction.backgroundBatchIds || []),
          batchId
        ]),
        backgroundBatches: [
          ...(transaction.backgroundBatches || []),
          backgroundRef
        ],
        backgroundIdempotencyKey: idempotencyKey || transaction.backgroundIdempotencyKey || null,
        backgroundIdempotencyKeys: uniqueStrings([
          ...(transaction.backgroundIdempotencyKeys || []),
          idempotencyKey
        ])
      });
      appendEvent('backgroundBatchCommitted', transaction, {
        payload: {
          operationBundle: operationBundleRef({
            ...operationBundle,
            batchId
          }),
          phaseAfter
        },
        revisionsBefore,
        revisionsAfter: state.revisions,
        idempotencyKey
      });
      await persist();
      return cloneJson(transaction);
    },
    async appendDiagnostics(transactionId, diagnosticsEvent = {}) {
      return enqueueWrite(async () => {
        const transaction = requireTransaction(transactionId);
        state.updatedAt = timestamp();
        state.revisions = nextRevisions(state.revisions, { diagnostic: 1 });
        const type = diagnosticsEvent.type || diagnosticsEvent.category || 'diagnostic';
        const diagnostic = diagnosticRecord({
          id: diagnosticsEvent.id || diagnosticId(type),
          type,
          transaction,
          campaignId: state.campaignId,
          saveId: state.saveId,
          chatId: transaction.chatId,
          observedAt: state.updatedAt,
          payload: diagnosticsEvent,
          revisions: state.revisions
        });
        state.diagnostics.push(diagnostic);
        state.counters.diagnostics = state.diagnostics.length;
        lastCommit = await commitV2DiagnosticsSegments(adapter, {
          campaignId: state.campaignId,
          saveId: state.saveId,
          diagnosticsSegments: [diagnostic],
          metadata: {
            source: 'core-store-v2-diagnostics',
            diagnosticCount: state.diagnostics.length
          },
          now: state.updatedAt,
          layout: 'core'
        });
        return cloneJson(diagnostic);
      });
    },
    estimateSize() {
      return stableJsonByteLength(buildHead(state));
    }
  };
}
