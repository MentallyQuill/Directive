import {
  hashStableJson,
  redactExternalDiagnostic,
  stableJsonByteLength
} from '../runtime/architecture-redesign-contracts.mjs';
import {
  normalizeRecallIndexEntry
} from '../retrieval/recall-index.mjs';

export const PRESSURE_ARC_DIGEST_KIND = 'directive.pressureArcDigest.v1';
export const PRESSURE_ARC_DIGEST_REF_KIND = 'directive.pressureArcDigestRef.v1';
export const PRESSURE_ARC_DIGEST_WORKER_ID = 'pressureArcDigest';

const RAW_KEY_PATTERN = /(?:raw|body|prompt|provider|transcript|summaryception|memoryBook|vectorPayload|embedding|secret|api[_-]?key|password|token|qdrant)/i;

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

function lowerKeywords(values = []) {
  return uniqueStrings(values).map((value) => value.toLowerCase());
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

function textDigest(value = null) {
  const text = asString(value);
  if (!text) return null;
  return {
    hash: hashStableJson({ text }),
    length: text.length
  };
}

export function normalizePressureArcDigest(input = {}) {
  const sourceFrameRef = safeRef(input.sourceFrameRef || input.sourceFrame);
  const summaryDigest = input.summaryDigest || textDigest(input.summary);
  const pressureIds = uniqueStrings(input.pressureIds || input.pressureId);
  const arcIds = uniqueStrings(input.arcIds || input.arcId);
  const threadIds = uniqueStrings(input.threadIds || input.threadId);
  const missionIds = uniqueStrings(input.missionIds || input.missionId);
  const id = asString(input.id) || `pressure-arc-digest:${hashStableJson({
    sourceFrameRef,
    transactionId: input.transactionId,
    outcomeId: input.outcomeId,
    pressureIds,
    arcIds,
    threadIds,
    missionIds,
    summaryDigest
  }).slice(0, 24)}`;
  const digest = compactObject({
    kind: PRESSURE_ARC_DIGEST_KIND,
    schemaVersion: 1,
    id,
    campaignId: asString(input.campaignId || sourceFrameRef?.campaignId),
    saveId: asString(input.saveId || sourceFrameRef?.saveId),
    branchId: asString(input.branchId, 'main'),
    transactionId: asString(input.transactionId),
    outcomeId: asString(input.outcomeId),
    sourceFrameRef,
    chapterId: asString(input.chapterId),
    phaseId: asString(input.phaseId || input.phase),
    sceneId: asString(input.sceneId || input.scene),
    locationId: asString(input.locationId),
    pressureIds,
    arcIds,
    threadIds,
    missionIds,
    actorIds: uniqueStrings(input.actorIds),
    subjectIds: uniqueStrings(input.subjectIds),
    tags: uniqueStrings(input.tags),
    keywords: lowerKeywords(input.keywords),
    timeRange: safeRef(input.timeRange),
    summaryDigest: summaryDigest ? safeRef(summaryDigest) : null,
    pressureRefs: (Array.isArray(input.pressureRefs) ? input.pressureRefs : []).map(safeDiagnosticRef).filter(Boolean),
    arcRefs: (Array.isArray(input.arcRefs) ? input.arcRefs : []).map(safeDiagnosticRef).filter(Boolean),
    openThreadRefs: (Array.isArray(input.openThreadRefs) ? input.openThreadRefs : []).map(safeDiagnosticRef).filter(Boolean),
    callbackRefs: (Array.isArray(input.callbackRefs) ? input.callbackRefs : []).map(safeDiagnosticRef).filter(Boolean),
    createdAt: asString(input.createdAt)
  });
  digest.digestHash = hashStableJson({
    ...digest,
    digestHash: undefined,
    byteLength: undefined
  });
  digest.byteLength = stableJsonByteLength(digest);
  return digest;
}

export function createPressureArcDigestRef(digest = {}) {
  const normalized = digest?.kind === PRESSURE_ARC_DIGEST_KIND ? digest : normalizePressureArcDigest(digest);
  return compactObject({
    kind: PRESSURE_ARC_DIGEST_REF_KIND,
    id: normalized.id,
    pressureArcDigestId: normalized.id,
    status: 'accepted',
    hash: normalized.digestHash,
    transactionId: normalized.transactionId || null,
    outcomeId: normalized.outcomeId || null,
    sourceFrameId: normalized.sourceFrameRef?.id || null,
    phaseId: normalized.phaseId || null,
    sceneId: normalized.sceneId || null,
    locationId: normalized.locationId || null,
    pressureIds: normalized.pressureIds,
    arcIds: normalized.arcIds,
    threadIds: normalized.threadIds,
    missionIds: normalized.missionIds,
    actorIds: normalized.actorIds,
    subjectIds: normalized.subjectIds,
    tags: normalized.tags,
    keywords: normalized.keywords
  });
}

export function createRecallEntryFromPressureArcDigest(digest = {}, input = {}) {
  const normalized = digest?.kind === PRESSURE_ARC_DIGEST_KIND ? digest : normalizePressureArcDigest(digest);
  return normalizeRecallIndexEntry({
    id: asString(input.id) || `recall:${normalized.id}`,
    campaignId: normalized.campaignId,
    saveId: normalized.saveId,
    branchId: normalized.branchId,
    sourceFrameRef: normalized.sourceFrameRef,
    coreEventRefs: input.coreEventRefs || [],
    chapterId: normalized.chapterId,
    phaseId: normalized.phaseId,
    sceneId: normalized.sceneId,
    locationId: normalized.locationId,
    actorIds: normalized.actorIds,
    subjectIds: normalized.subjectIds,
    threadIds: normalized.threadIds,
    missionIds: normalized.missionIds,
    tags: uniqueStrings(['pressure-arc-digest', ...normalized.tags]),
    keywords: normalized.keywords,
    timeRange: normalized.timeRange,
    authority: input.authority || 'committed',
    textHash: input.textHash || normalized.summaryDigest?.hash || normalized.digestHash,
    metadataHash: input.metadataHash || normalized.digestHash,
    preview: input.preview,
    stale: input.stale === true,
    staleReason: input.staleReason
  });
}

function recallEntryRef(entry = {}, digest = {}) {
  return compactObject({
    kind: 'directive.recallIndexEntryRef.v1',
    id: entry.id || null,
    status: entry.stale ? 'stale' : 'accepted',
    hash: entry.hash || entry.metadataHash || entry.textHash || null,
    authority: entry.authority || null,
    sourceFrameId: entry.sourceFrameRef?.id || null,
    pressureArcDigestId: digest.id || null,
    phaseId: entry.phaseId || null,
    sceneId: entry.sceneId || null,
    locationId: entry.locationId || null
  });
}

function promptDirtyDomainsForDigest(digest = {}, extra = []) {
  return uniqueStrings([
    'missionQuestThread',
    'command',
    'sourceBinding',
    ...(digest.actorIds?.length || digest.subjectIds?.length ? ['crewShipRelationship'] : []),
    ...extra
  ]);
}

export function createPressureArcDigestWorkerResult(input = {}) {
  const digest = normalizePressureArcDigest(input.digest || input);
  const recallEntries = [
    createRecallEntryFromPressureArcDigest(digest, input.recallEntry || {}),
    ...(Array.isArray(input.recallEntries) ? input.recallEntries.map((entry) => normalizeRecallIndexEntry(entry)) : [])
  ];
  const pressureArcDigestRef = createPressureArcDigestRef(digest);
  const recallEntryRefs = recallEntries.map((entry) => recallEntryRef(entry, digest));
  const effectRefs = [
    pressureArcDigestRef,
    ...recallEntryRefs
  ];
  return {
    kind: 'directive.forgeWorkerResult.v1',
    schemaVersion: 1,
    workerId: PRESSURE_ARC_DIGEST_WORKER_ID,
    roleId: 'pressureArcDigestWorker',
    lane: 'background',
    status: 'accepted',
    operations: [],
    rejectedOperations: [],
    effectRefs,
    promptDirtyDomains: promptDirtyDomainsForDigest(digest, input.promptDirtyDomains),
    inputHash: input.inputHash || hashStableJson({
      sourceFrameRef: digest.sourceFrameRef,
      transactionId: digest.transactionId,
      outcomeId: digest.outcomeId
    }),
    outputHash: hashStableJson({
      pressureArcDigestRef,
      recallEntryRefs
    }),
    diagnostics: compactObject({
      digestId: digest.id,
      digestHash: digest.digestHash,
      pressureRefCount: digest.pressureRefs?.length || 0,
      arcRefCount: digest.arcRefs?.length || 0,
      openThreadRefCount: digest.openThreadRefs?.length || 0,
      callbackRefCount: digest.callbackRefs?.length || 0,
      recallEntryCount: recallEntries.length
    }),
    digest,
    recallEntries
  };
}
