import {
  hashStableJson,
  redactExternalDiagnostic,
  stableJsonByteLength
} from '../runtime/architecture-redesign-contracts.mjs';
import {
  normalizeRecallIndexEntry
} from '../retrieval/recall-index.mjs';

export const SCENE_PHASE_SEAL_KIND = 'directive.scenePhaseSeal.v1';
export const SCENE_PHASE_SEAL_REF_KIND = 'directive.scenePhaseSealRef.v1';
export const SCENE_PHASE_SEAL_WORKER_ID = 'scenePhaseSeal';

const RAW_KEY_PATTERN = /(?:raw|body|prompt|provider|transcript|summaryception|memoryBook|vectorPayload|embedding|secret|api[_-]?key|password|token|qdrant)/i;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function asInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
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

function lowerKeywords(values = []) {
  return uniqueStrings(values).map((value) => value.toLowerCase());
}

function textDigest(value = null) {
  const text = asString(value);
  if (!text) return null;
  return {
    hash: hashStableJson({ text }),
    length: text.length
  };
}

export function normalizeScenePhaseSeal(input = {}) {
  const sourceFrameRef = safeRef(input.sourceFrameRef || input.sourceFrame);
  const summaryDigest = input.summaryDigest || textDigest(input.summary);
  const phaseId = asString(input.phaseId || input.phase);
  const sceneId = asString(input.sceneId || input.scene);
  const id = asString(input.id) || `scene-seal:${hashStableJson({
    sourceFrameRef,
    transactionId: input.transactionId,
    outcomeId: input.outcomeId,
    sceneId,
    phaseId,
    summaryDigest
  }).slice(0, 24)}`;
  const seal = compactObject({
    kind: SCENE_PHASE_SEAL_KIND,
    schemaVersion: 1,
    id,
    campaignId: asString(input.campaignId || sourceFrameRef?.campaignId),
    saveId: asString(input.saveId || sourceFrameRef?.saveId),
    branchId: asString(input.branchId, 'main'),
    transactionId: asString(input.transactionId),
    outcomeId: asString(input.outcomeId),
    sourceFrameRef,
    chapterId: asString(input.chapterId),
    phaseId,
    sceneId,
    locationId: asString(input.locationId),
    actorIds: uniqueStrings(input.actorIds),
    subjectIds: uniqueStrings(input.subjectIds),
    threadIds: uniqueStrings(input.threadIds),
    missionIds: uniqueStrings(input.missionIds),
    tags: uniqueStrings(input.tags),
    keywords: lowerKeywords(input.keywords),
    timeRange: safeRef(input.timeRange),
    summaryDigest: summaryDigest ? safeRef(summaryDigest) : null,
    eventRefs: (Array.isArray(input.eventRefs) ? input.eventRefs : []).map(safeDiagnosticRef).filter(Boolean),
    witnessFactRefs: (Array.isArray(input.witnessFactRefs) ? input.witnessFactRefs : []).map(safeDiagnosticRef).filter(Boolean),
    correctionCandidateRefs: (Array.isArray(input.correctionCandidateRefs) ? input.correctionCandidateRefs : []).map(safeDiagnosticRef).filter(Boolean),
    createdAt: asString(input.createdAt)
  });
  seal.sealHash = hashStableJson({
    ...seal,
    sealHash: undefined,
    byteLength: undefined
  });
  seal.byteLength = stableJsonByteLength(seal);
  return seal;
}

export function createScenePhaseSealRef(seal = {}) {
  const normalized = seal?.kind === SCENE_PHASE_SEAL_KIND ? seal : normalizeScenePhaseSeal(seal);
  return compactObject({
    kind: SCENE_PHASE_SEAL_REF_KIND,
    id: normalized.id,
    status: 'accepted',
    hash: normalized.sealHash,
    transactionId: normalized.transactionId || null,
    outcomeId: normalized.outcomeId || null,
    sourceFrameId: normalized.sourceFrameRef?.id || null,
    sceneId: normalized.sceneId || null,
    phaseId: normalized.phaseId || null,
    locationId: normalized.locationId || null,
    actorIds: normalized.actorIds,
    subjectIds: normalized.subjectIds,
    threadIds: normalized.threadIds,
    missionIds: normalized.missionIds,
    tags: normalized.tags,
    keywords: normalized.keywords
  });
}

export function createRecallEntryFromScenePhaseSeal(seal = {}, input = {}) {
  const normalized = seal?.kind === SCENE_PHASE_SEAL_KIND ? seal : normalizeScenePhaseSeal(seal);
  return normalizeRecallIndexEntry({
    id: asString(input.id) || `recall:${normalized.id}`,
    campaignId: normalized.campaignId,
    saveId: normalized.saveId,
    branchId: normalized.branchId,
    sourceFrameRef: normalized.sourceFrameRef,
    sceneSealRef: createScenePhaseSealRef(normalized),
    coreEventRefs: input.coreEventRefs || [],
    chapterId: normalized.chapterId,
    phaseId: normalized.phaseId,
    sceneId: normalized.sceneId,
    locationId: normalized.locationId,
    actorIds: normalized.actorIds,
    subjectIds: normalized.subjectIds,
    threadIds: normalized.threadIds,
    missionIds: normalized.missionIds,
    tags: normalized.tags,
    keywords: normalized.keywords,
    timeRange: normalized.timeRange,
    authority: input.authority || 'committed',
    textHash: input.textHash || normalized.summaryDigest?.hash || normalized.sealHash,
    metadataHash: input.metadataHash || normalized.sealHash,
    preview: input.preview,
    stale: input.stale === true,
    staleReason: input.staleReason
  });
}

function recallEntryRef(entry = {}) {
  return compactObject({
    kind: 'directive.recallIndexEntryRef.v1',
    id: entry.id || null,
    status: entry.stale ? 'stale' : 'accepted',
    hash: entry.hash || entry.metadataHash || entry.textHash || null,
    authority: entry.authority || null,
    sourceFrameId: entry.sourceFrameRef?.id || null,
    sceneSealId: entry.sceneSealRef?.id || null,
    sceneId: entry.sceneId || null,
    phaseId: entry.phaseId || null,
    locationId: entry.locationId || null
  });
}

function promptDirtyDomainsForSeal(seal = {}, extra = []) {
  return uniqueStrings([
    'continuity',
    'missionQuestThread',
    'sourceBinding',
    ...(seal.actorIds?.length || seal.subjectIds?.length ? ['crewShipRelationship'] : []),
    ...extra
  ]);
}

export function createScenePhaseSealWorkerResult(input = {}) {
  const seal = normalizeScenePhaseSeal(input.seal || input);
  const recallEntries = [
    createRecallEntryFromScenePhaseSeal(seal, input.recallEntry || {}),
    ...(Array.isArray(input.recallEntries) ? input.recallEntries.map((entry) => normalizeRecallIndexEntry(entry)) : [])
  ];
  const sceneSealRef = createScenePhaseSealRef(seal);
  const recallEntryRefs = recallEntries.map(recallEntryRef);
  const witnessFactRefs = (Array.isArray(seal.witnessFactRefs) ? seal.witnessFactRefs : []).map((ref) => ({
    kind: ref.kind || 'directive.witnessFactRef.v1',
    ...ref,
    status: ref.status || 'accepted',
    hash: ref.hash || hashStableJson(ref)
  }));
  const correctionCandidateRefs = (Array.isArray(seal.correctionCandidateRefs) ? seal.correctionCandidateRefs : []).map((ref) => ({
    kind: ref.kind || 'directive.correctionCandidateRef.v1',
    ...ref,
    status: ref.status || 'candidate',
    hash: ref.hash || hashStableJson(ref)
  }));
  const effectRefs = [
    sceneSealRef,
    ...recallEntryRefs,
    ...witnessFactRefs,
    ...correctionCandidateRefs
  ];
  return {
    kind: 'directive.forgeWorkerResult.v1',
    schemaVersion: 1,
    workerId: SCENE_PHASE_SEAL_WORKER_ID,
    roleId: 'scenePhaseSealWorker',
    lane: 'background',
    status: 'accepted',
    operations: [],
    rejectedOperations: [],
    effectRefs,
    promptDirtyDomains: promptDirtyDomainsForSeal(seal, input.promptDirtyDomains),
    inputHash: input.inputHash || hashStableJson({
      sourceFrameRef: seal.sourceFrameRef,
      transactionId: seal.transactionId,
      outcomeId: seal.outcomeId
    }),
    outputHash: hashStableJson({
      sealRef: sceneSealRef,
      recallEntryRefs,
      witnessFactRefs,
      correctionCandidateRefs
    }),
    diagnostics: compactObject({
      sealId: seal.id,
      sceneSealHash: seal.sealHash,
      recallEntryCount: recallEntries.length,
      witnessFactRefCount: witnessFactRefs.length,
      correctionCandidateRefCount: correctionCandidateRefs.length
    }),
    seal,
    recallEntries
  };
}
