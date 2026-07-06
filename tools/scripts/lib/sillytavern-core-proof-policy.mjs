import {
  generationTimingEntryStatus,
  generationTimingProofStatus,
  timingProofEntryIsNonGenerated,
  timingProofEntryRequiresGenerationStart
} from './generation-timing-proof-policy.mjs';

export function uniqueStringList(values = []) {
  return [...new Set((values || [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))];
}

export function hostNativeCompletionTargetOutcome(proof = {}, {
  targetTransactionIds = [],
  targetPlayerHostMessageIds = []
} = {}) {
  const transactionIds = new Set(uniqueStringList([
    ...(targetTransactionIds || []),
    ...(proof?.targetTransactionIds || [])
  ]));
  const playerHostMessageIds = new Set(uniqueStringList([
    ...(targetPlayerHostMessageIds || []),
    ...(proof?.targetPlayerHostMessageIds || [])
  ]));
  const hasExplicitTargets = transactionIds.size > 0 || playerHostMessageIds.size > 0;
  const entries = Array.isArray(proof?.entries) ? proof.entries : [];
  const targetEntries = hasExplicitTargets
    ? entries.filter((entry) => {
      const transactionId = String(entry?.transactionId || entry?.coreTransactionId || '').trim();
      const playerHostMessageId = String(entry?.playerHostMessageId || '').trim();
      const transactionMatches = transactionIds.size === 0 || transactionIds.has(transactionId);
      const playerHostMatches = playerHostMessageIds.size === 0 || playerHostMessageIds.has(playerHostMessageId);
      return transactionMatches && playerHostMatches;
    })
    : entries;
  const completed = targetEntries.filter((entry) => entry?.completionStatus === 'pass');
  const failed = targetEntries.filter((entry) => entry?.completionStatus && entry.completionStatus !== 'pass');
  return {
    status: failed.length > 0 ? 'fail' : (completed.length > 0 ? 'pass' : 'pending'),
    hasExplicitTargets,
    targetTransactionIds: [...transactionIds],
    targetPlayerHostMessageIds: [...playerHostMessageIds],
    targetEntryCount: targetEntries.length,
    targetCompletedHostContinueCount: completed.length,
    targetFailedHostContinueCount: failed.length,
    targetEntries,
    targetFailures: failed
  };
}

function sanitizeTimingMetric(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    kind: value.kind || null,
    playerSubmittedAt: Number.isFinite(Number(value.playerSubmittedAt)) ? Number(value.playerSubmittedAt) : null,
    turnObservedAt: Number.isFinite(Number(value.turnObservedAt)) ? Number(value.turnObservedAt) : null,
    routeDecidedAt: Number.isFinite(Number(value.routeDecidedAt)) ? Number(value.routeDecidedAt) : null,
    hostGenerationReleasedAt: Number.isFinite(Number(value.hostGenerationReleasedAt)) ? Number(value.hostGenerationReleasedAt) : null,
    directiveGenerationStartedAt: Number.isFinite(Number(value.directiveGenerationStartedAt)) ? Number(value.directiveGenerationStartedAt) : null,
    visibleResponsePostedAt: Number.isFinite(Number(value.visibleResponsePostedAt)) ? Number(value.visibleResponsePostedAt) : null,
    generationStartedAt: Number.isFinite(Number(value.generationStartedAt)) ? Number(value.generationStartedAt) : null,
    generationStartLatencyMs: Number.isFinite(Number(value.generationStartLatencyMs)) ? Number(value.generationStartLatencyMs) : null,
    providerCompletionLatencyMs: Number.isFinite(Number(value.providerCompletionLatencyMs)) ? Number(value.providerCompletionLatencyMs) : null,
    architectureWithin60s: typeof value.architectureWithin60s === 'boolean' ? value.architectureWithin60s : null
  };
}

function sanitizeCoreTimingProjection(projection = {}) {
  const turnLatency = sanitizeTimingMetric(projection.turnTiming);
  return {
    transactionId: projection.transactionId || null,
    coreTransactionId: projection.transactionId || null,
    sourceFrameId: projection.sourceFrameId || null,
    route: projection.route || null,
    responseKind: projection.responseKind || null,
    status: projection.status || null,
    hostMessageId: projection.responseHostMessageId || null,
    playerHostMessageId: projection.hostMessageId || projection.playerHostMessageId || null,
    hostGenerationReleasedAt: turnLatency?.hostGenerationReleasedAt ?? null,
    directiveGenerationStartedAt: turnLatency?.directiveGenerationStartedAt ?? null,
    generationStartedAt: turnLatency?.generationStartedAt
      ?? turnLatency?.directiveGenerationStartedAt
      ?? turnLatency?.hostGenerationReleasedAt
      ?? null,
    timingSource: 'coreProjection',
    eventIds: Array.isArray(projection.eventIds) ? projection.eventIds.filter(Boolean) : [],
    turnLatency
  };
}

function coreRowsForTransactionTarget(projections = {}) {
  return [
    ...(Array.isArray(projections.hostMapRows) ? projections.hostMapRows : []),
    ...(Array.isArray(projections.hostMap?.rows) ? projections.hostMap.rows : []),
    ...(Array.isArray(projections.ingressLedger) ? projections.ingressLedger : []),
    ...(Array.isArray(projections.turnTiming) ? projections.turnTiming : [])
  ];
}

export function transactionIdsForCoreTarget({
  projections = {},
  targetTransactionIds = [],
  targetPlayerHostMessageIds = [],
  beforeSnapshot = null,
  afterSnapshot = null
} = {}) {
  const explicitTransactionIds = uniqueStringList(targetTransactionIds);
  if (explicitTransactionIds.length > 0) return new Set(explicitTransactionIds);

  const hostIds = new Set(uniqueStringList(targetPlayerHostMessageIds));
  if (hostIds.size > 0) {
    const projectedIds = coreRowsForTransactionTarget(projections)
      .filter((entry) => {
        if (!entry?.transactionId) return false;
        if (entry.role && entry.role !== 'player') return false;
        return hostIds.has(String(entry.hostMessageId || entry.playerHostMessageId || '').trim());
      })
      .map((entry) => entry.transactionId);
    return new Set(uniqueStringList(projectedIds));
  }

  const beforeTransactionIds = new Set([
    ...((beforeSnapshot?.recentResponseLedger || []).map((response) => response.coreTransactionId || response.transactionId).filter(Boolean)),
    ...((beforeSnapshot?.recentIngressLedger || []).map((ingress) => ingress.coreTransactionId || ingress.transactionId).filter(Boolean))
  ]);
  const afterTransactionIds = new Set([
    ...((afterSnapshot?.recentResponseLedger || []).map((response) => response.coreTransactionId || response.transactionId).filter(Boolean)),
    ...((afterSnapshot?.recentIngressLedger || []).map((ingress) => ingress.coreTransactionId || ingress.transactionId).filter(Boolean))
  ]);
  return new Set(
    [...afterTransactionIds].filter((id) => !beforeTransactionIds.has(id))
  );
}

export function corePlayerIngressProof({
  projections = {},
  targetPlayerHostMessageIds = []
} = {}) {
  const expectedHostMessageIds = uniqueStringList(targetPlayerHostMessageIds);
  const ingressRows = Array.isArray(projections.ingressLedger) ? projections.ingressLedger : [];
  const timingRows = Array.isArray(projections.turnTiming) ? projections.turnTiming : [];
  const hostMapRows = [
    ...(Array.isArray(projections.hostMapRows) ? projections.hostMapRows : []),
    ...(Array.isArray(projections.hostMap?.rows) ? projections.hostMap.rows : [])
  ];
  const rowsByHostMessageId = new Map();
  for (const row of hostMapRows) {
    if (row?.role && row.role !== 'player') continue;
    const hostMessageId = String(row?.hostMessageId || '').trim();
    if (!hostMessageId) continue;
    rowsByHostMessageId.set(hostMessageId, {
      source: 'coreHostMap',
      transactionId: row.transactionId || null,
      sourceFrameId: row.sourceFrameId || null,
      hostMessageId,
      status: row.status || null,
      route: row.route || null,
      textHash: row.textHash || null
    });
  }
  for (const row of ingressRows) {
    const hostMessageId = String(row?.hostMessageId || '').trim();
    if (!hostMessageId || rowsByHostMessageId.has(hostMessageId)) continue;
    rowsByHostMessageId.set(hostMessageId, {
      source: 'coreIngressLedger',
      transactionId: row.transactionId || null,
      sourceFrameId: row.sourceFrameId || null,
      hostMessageId,
      status: row.status || null,
      route: row.route || null,
      textHash: row.textHash || null
    });
  }
  for (const row of timingRows) {
    const hostMessageId = String(row?.hostMessageId || row?.playerHostMessageId || '').trim();
    if (!hostMessageId || rowsByHostMessageId.has(hostMessageId)) continue;
    rowsByHostMessageId.set(hostMessageId, {
      source: 'coreTurnTiming',
      transactionId: row.transactionId || null,
      sourceFrameId: row.sourceFrameId || null,
      hostMessageId,
      status: row.status || null,
      route: row.route || null,
      textHash: row.textHash || null
    });
  }
  const matchedRows = expectedHostMessageIds
    .map((hostMessageId) => rowsByHostMessageId.get(hostMessageId))
    .filter(Boolean);
  const missingHostMessageIds = expectedHostMessageIds.filter((hostMessageId) => !rowsByHostMessageId.has(hostMessageId));
  return {
    status: expectedHostMessageIds.length === 0
      ? 'warning'
      : (missingHostMessageIds.length === 0 ? 'pass' : 'warning'),
    source: 'coreStoreIngressLedger',
    targetSource: 'playerHostMessageId',
    expectedPlayerHostMessageIds: expectedHostMessageIds,
    matchedPlayerHostMessageIds: matchedRows.map((row) => row.hostMessageId),
    missingPlayerHostMessageIds: missingHostMessageIds,
    expectedPlayerMessageCount: expectedHostMessageIds.length,
    matchedPlayerMessageCount: matchedRows.length,
    coreHostMapCount: hostMapRows.length,
    coreIngressCount: ingressRows.length,
    coreTurnTimingCount: timingRows.length,
    rows: matchedRows,
    unavailableReason: expectedHostMessageIds.length === 0 ? 'no-target-player-host-message-ids' : null
  };
}

function hostNativeCompletionStatus(entry = {}) {
  if (entry.route !== 'hostContinue') return 'not-hostContinue';
  if (!entry.hostGenerationReleasedAt) return 'missing-host-generation-release';
  if (!entry.visibleResponsePostedAt) return 'missing-visible-response-posted';
  if (!entry.hostMessageId) return 'missing-assistant-host-message';
  return 'pass';
}

function sanitizeHostNativeCompletionProjection(response = {}, timingByTransaction = new Map()) {
  const timing = timingByTransaction.get(response.transactionId) || {};
  const turnTiming = sanitizeTimingMetric(timing.turnTiming);
  const hostGenerationReleasedAt = turnTiming?.hostGenerationReleasedAt ?? null;
  const visibleResponsePostedAt = turnTiming?.visibleResponsePostedAt ?? null;
  const entry = {
    responseId: response.id || null,
    transactionId: response.transactionId || null,
    coreTransactionId: response.transactionId || null,
    route: timing.route || null,
    responseKind: response.responseKind || null,
    status: response.status || null,
    hostMessageId: response.hostMessageId || null,
    textHash: response.textHash || null,
    textHashStatus: response.textHash ? 'present' : 'missing',
    outcomeId: response.outcomeId || null,
    sourceFrameId: timing.sourceFrameId || null,
    playerHostMessageId: timing.hostMessageId || timing.playerHostMessageId || null,
    hostGenerationReleasedAt,
    visibleResponsePostedAt,
    completionLatencyMs: Number.isFinite(hostGenerationReleasedAt) && Number.isFinite(visibleResponsePostedAt)
      ? Math.max(0, visibleResponsePostedAt - hostGenerationReleasedAt)
      : null,
    eventIds: Array.isArray(timing.eventIds) ? timing.eventIds.filter(Boolean) : []
  };
  return {
    ...entry,
    completionStatus: hostNativeCompletionStatus(entry)
  };
}

export function hostNativeCompletionProofFromCoreProjections({
  source = 'coreStoreResponseLedger',
  projections = {},
  beforeSnapshot = null,
  afterSnapshot = null,
  targetTransactionIds = [],
  targetPlayerHostMessageIds = [],
  saveId = null,
  campaignId = null,
  payloadPath = null,
  coreManifestPath = null
} = {}) {
  const targetIds = transactionIdsForCoreTarget({
    projections,
    targetTransactionIds,
    targetPlayerHostMessageIds,
    beforeSnapshot,
    afterSnapshot
  });
  const timingByTransaction = new Map((projections.turnTiming || [])
    .filter((entry) => entry?.transactionId)
    .map((entry) => [entry.transactionId, entry]));
  const responseRows = Array.isArray(projections.responses)
    ? projections.responses
    : (Array.isArray(projections.responseLedger) ? projections.responseLedger : []);
  const candidates = responseRows.filter((entry) => (
    entry?.transactionId
    && entry.responseKind === 'hostContinue'
    && (targetIds.size === 0 || targetIds.has(entry.transactionId))
  ));
  const entries = candidates.map((entry) => sanitizeHostNativeCompletionProjection(entry, timingByTransaction));
  const completed = entries.filter((entry) => entry.completionStatus === 'pass');
  const failed = entries.filter((entry) => entry.completionStatus !== 'pass');
  const maxCompletionLatencyMs = completed.reduce((max, entry) => {
    const value = Number(entry.completionLatencyMs);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  return {
    status: failed.length > 0 ? 'fail' : (completed.length > 0 ? 'pass' : 'warning'),
    source,
    completionSource: 'coreProjection',
    storageFormat: 'v2-core',
    saveId,
    campaignId,
    payloadPath,
    coreManifestPath,
    targetTransactionCount: targetIds.size,
    targetTransactionIds: [...targetIds],
    targetPlayerHostMessageIds: uniqueStringList(targetPlayerHostMessageIds),
    candidateResponseCount: candidates.length,
    completedHostContinueCount: completed.length,
    failedHostContinueCount: failed.length,
    maxCompletionLatencyMs: completed.length > 0 ? maxCompletionLatencyMs : null,
    entries,
    unavailableReason: candidates.length === 0 ? 'no-hostContinue-completion-candidates' : null
  };
}

export function generationTimingProofFromCoreProjections({
  source = 'coreStoreTurnTiming',
  projections = {},
  beforeSnapshot = null,
  afterSnapshot = null,
  targetTransactionIds = [],
  targetPlayerHostMessageIds = [],
  saveId = null,
  campaignId = null,
  payloadPath = null,
  coreManifestPath = null
} = {}) {
  const targetIds = transactionIdsForCoreTarget({
    projections,
    targetTransactionIds,
    targetPlayerHostMessageIds,
    beforeSnapshot,
    afterSnapshot
  });
  const timingEntries = Array.isArray(projections.turnTiming) ? projections.turnTiming : [];
  const candidates = targetIds.size > 0
    ? timingEntries.filter((entry) => entry?.transactionId && targetIds.has(entry.transactionId))
    : (afterSnapshot ? [] : timingEntries.slice(-1));
  const entries = candidates.map((entry) => sanitizeCoreTimingProjection(entry));
  const checked = entries.filter((entry) => timingProofEntryRequiresGenerationStart(entry));
  const statuses = checked.map((entry) => generationTimingEntryStatus(entry));
  const skippedEntries = entries.filter((entry) => timingProofEntryIsNonGenerated(entry));
  const maxGenerationStartLatencyMs = checked.reduce((max, entry) => {
    const value = Number(entry.turnLatency?.generationStartLatencyMs);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  const status = generationTimingProofStatus({ checked, statuses, entries });
  return {
    status,
    source,
    timingSource: 'coreProjection',
    storageFormat: 'v2-core',
    saveId,
    campaignId,
    payloadPath,
    coreManifestPath,
    checkedResponseCount: checked.length,
    candidateResponseCount: candidates.length,
    skippedResponseCount: skippedEntries.length,
    skippedTurnCount: skippedEntries.length,
    checkedTurnCount: checked.length,
    candidateTurnCount: candidates.length,
    targetTransactionCount: targetIds.size,
    targetTransactionIds: [...targetIds],
    targetPlayerHostMessageIds: uniqueStringList(targetPlayerHostMessageIds),
    maxGenerationStartLatencyMs: checked.length > 0 ? maxGenerationStartLatencyMs : null,
    entries: checked.map((entry, index) => ({
      ...entry,
      timingStatus: statuses[index] || 'unknown'
    })),
    skippedEntries: skippedEntries.map((entry) => ({
      ...entry,
      timingStatus: 'skipped-non-generation'
    }))
  };
}
