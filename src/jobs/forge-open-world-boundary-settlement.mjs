import {
  compactOpenWorldReducerBundleRef
} from '../directors/open-world-event-reducers.mjs';
import {
  hashStableJson,
  redactExternalDiagnostic,
  stableJsonByteLength
} from '../runtime/architecture-redesign-contracts.mjs';

export const OPEN_WORLD_BOUNDARY_SETTLEMENT_KIND = 'directive.openWorldBoundarySettlement.v1';
export const OPEN_WORLD_BOUNDARY_SETTLEMENT_REF_KIND = 'directive.openWorldBoundarySettlementRef.v1';
export const OPEN_WORLD_BOUNDARY_SETTLEMENT_WORKER_ID = 'openWorldBoundarySettlement';

const RAW_KEY_PATTERN = /(?:raw|body|prompt|provider|transcript|summaryception|memoryBook|vectorPayload|embedding|secret|api[_-]?key|password|token|qdrant|operations|operationValues?|operationPayload|valuePayload|upsert|remove)/i;

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const text = asString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function safeRef(value = null) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (RAW_KEY_PATTERN.test(key)) continue;
    if (item === undefined) continue;
    if (Array.isArray(item)) out[key] = uniqueStrings(item);
    else if (item && typeof item === 'object') out[key] = safeRef(item) || undefined;
    else out[key] = item;
  }
  return compactObject(out);
}

function safeDiagnosticRef(value = null) {
  if (!value || typeof value !== 'object') return null;
  const redactions = [];
  const safe = safeRef(value) || {};
  return compactObject({
    ...redactExternalDiagnostic(safe, redactions),
    redactions: redactions.length ? redactions : undefined
  });
}

function lensDomainsForOpenWorldRoots(roots = []) {
  const domains = [];
  for (const root of uniqueStrings(roots)) {
    if (root === 'timeLedger') domains.push('sceneTime');
    else if (['questLedger', 'dynamicQuestCatalog', 'threadLedger', 'mission', 'attentionState'].includes(root)) domains.push('missionQuestThread');
    else if (['worldState', 'eventLedger', 'knowledgeLedger', 'storyArcLedger', 'campaign'].includes(root)) domains.push('continuity');
    else if (root === 'runtimeTracking') domains.push('sourceBinding');
    else domains.push(root);
  }
  return uniqueStrings(domains);
}

function normalizeReducerRef(input = {}) {
  if (input.reducerRef && typeof input.reducerRef === 'object') {
    return safeRef(input.reducerRef) || {};
  }
  if (!input.reducerBundle) {
    throw new Error('Open-world boundary settlement requires a reducerRef or reducerBundle.');
  }
  return compactOpenWorldReducerBundleRef(input.reducerBundle, {
    outcomeId: input.outcomeId
  });
}

function promptDirtyDomainsForSettlement(settlement = {}, extra = []) {
  return uniqueStrings([
    ...lensDomainsForOpenWorldRoots(settlement.changedRoots),
    'sourceBinding',
    ...extra
  ]);
}

export function normalizeOpenWorldBoundarySettlement(input = {}) {
  const sourceFrameRef = safeRef(input.sourceFrameRef || input.sourceFrame);
  const reducerRef = normalizeReducerRef(input);
  const changedRoots = uniqueStrings(reducerRef.changedRoots || reducerRef.diagnostics?.changedRoots);
  const operationCount = Number.isFinite(Number(reducerRef.operationCount))
    ? Number(reducerRef.operationCount)
    : 0;
  const boundaryType = asString(
    input.boundaryType
    || reducerRef.diagnostics?.boundaryType
    || input.reducerBundle?.diagnostics?.boundaryType,
    'openWorld'
  );
  const id = asString(input.id) || `open-world-boundary:${hashStableJson({
    sourceFrameRef,
    transactionId: input.transactionId,
    outcomeId: input.outcomeId,
    reducerRef,
    boundaryType
  }).slice(0, 24)}`;
  const settlement = compactObject({
    kind: OPEN_WORLD_BOUNDARY_SETTLEMENT_KIND,
    schemaVersion: 1,
    id,
    campaignId: asString(input.campaignId || sourceFrameRef?.campaignId),
    saveId: asString(input.saveId || sourceFrameRef?.saveId),
    branchId: asString(input.branchId, 'main'),
    transactionId: asString(input.transactionId),
    outcomeId: asString(input.outcomeId || reducerRef.sourceOutcomeId),
    sourceFrameRef,
    turnId: asString(input.turnId),
    sceneId: asString(input.sceneId),
    phaseId: asString(input.phaseId),
    locationId: asString(input.locationId),
    boundaryType,
    changedRoots,
    operationCount,
    sourceEventIds: uniqueStrings(reducerRef.sourceEventIds),
    sourceAnchorRangeHash: asString(reducerRef.sourceAnchorRangeHash),
    reducerRef: safeRef(reducerRef),
    diagnostics: safeDiagnosticRef({
      operationCount,
      changedRootCount: changedRoots.length,
      sourceEventCount: Array.isArray(reducerRef.sourceEventIds) ? reducerRef.sourceEventIds.length : 0,
      boundaryType,
      checkpointRequired: reducerRef.diagnostics?.checkpointRequired === true,
      sourceKind: reducerRef.sourceKind || null,
      reducerSourceHash: reducerRef.sourceHash || null,
      reducerFactHash: reducerRef.factHash || null
    }),
    tags: uniqueStrings(input.tags),
    keywords: uniqueStrings(input.keywords).map((value) => value.toLowerCase()),
    createdAt: asString(input.createdAt)
  });
  settlement.settlementHash = hashStableJson({
    ...settlement,
    settlementHash: undefined,
    byteLength: undefined
  });
  settlement.byteLength = stableJsonByteLength(settlement);
  return settlement;
}

export function createOpenWorldBoundarySettlementRef(settlement = {}) {
  const normalized = settlement?.kind === OPEN_WORLD_BOUNDARY_SETTLEMENT_KIND
    ? settlement
    : normalizeOpenWorldBoundarySettlement(settlement);
  return compactObject({
    kind: OPEN_WORLD_BOUNDARY_SETTLEMENT_REF_KIND,
    id: normalized.id,
    openWorldBoundarySettlementId: normalized.id,
    status: 'accepted',
    hash: normalized.settlementHash,
    transactionId: normalized.transactionId || null,
    outcomeId: normalized.outcomeId || null,
    sourceFrameId: normalized.sourceFrameRef?.id || null,
    reducerBundleHash: normalized.reducerRef?.sourceHash || null,
    reducerFactHash: normalized.reducerRef?.factHash || null,
    operationCount: normalized.operationCount,
    changedRoots: normalized.changedRoots,
    boundaryType: normalized.boundaryType || null,
    sceneId: normalized.sceneId || null,
    phaseId: normalized.phaseId || null,
    locationId: normalized.locationId || null,
    tags: normalized.tags,
    keywords: normalized.keywords
  });
}

export function createOpenWorldBoundarySettlementWorkerResult(input = {}) {
  const settlement = normalizeOpenWorldBoundarySettlement(input.settlement || input);
  const settlementRef = createOpenWorldBoundarySettlementRef(settlement);
  return {
    kind: 'directive.forgeWorkerResult.v1',
    schemaVersion: 1,
    workerId: OPEN_WORLD_BOUNDARY_SETTLEMENT_WORKER_ID,
    roleId: 'openWorldBoundarySettlementWorker',
    lane: 'background',
    status: 'accepted',
    operations: [],
    rejectedOperations: [],
    effectRefs: [settlementRef],
    promptDirtyDomains: promptDirtyDomainsForSettlement(settlement, input.promptDirtyDomains),
    inputHash: input.inputHash || hashStableJson({
      sourceFrameRef: settlement.sourceFrameRef,
      transactionId: settlement.transactionId,
      outcomeId: settlement.outcomeId,
      reducerRef: settlement.reducerRef
    }),
    outputHash: hashStableJson({ settlementRef }),
    diagnostics: compactObject({
      settlementId: settlement.id,
      settlementHash: settlement.settlementHash,
      operationCount: settlement.operationCount,
      changedRoots: settlement.changedRoots,
      boundaryType: settlement.boundaryType,
      sourceEventCount: settlement.sourceEventIds?.length || 0
    }),
    settlement
  };
}
