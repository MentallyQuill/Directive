import {
  hashStableJson,
  stableJsonByteLength
} from '../runtime/architecture-redesign-contracts.mjs';

export const RECALL_INDEX_ENTRY_KIND = 'directive.recallIndexEntry.v1';
export const RECALL_QUERY_KIND = 'directive.recallQuery.v1';
export const RECALL_RESULT_KIND = 'directive.recallResult.v1';

const AUTHORITIES = new Set([
  'committed',
  'reviewedImport',
  'package',
  'diagnosticCandidate'
]);

const AUTHORITY_SCORE = Object.freeze({
  committed: 100,
  reviewedImport: 90,
  package: 70,
  diagnosticCandidate: 10
});

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

function boundedPreview(value = '', maxLength = 180) {
  const text = asString(value, '');
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function safeTimeRange(value = null) {
  if (!value || typeof value !== 'object') return null;
  return compactObject({
    start: asString(value.start),
    end: asString(value.end),
    label: asString(value.label)
  });
}

function stableEntryRef(entry = {}, score = 0, scoreReasons = []) {
  return compactObject({
    id: entry.id,
    authority: entry.authority,
    directiveAuthority: entry.authority !== 'diagnosticCandidate',
    sourceFrameRef: entry.sourceFrameRef ? safeRef(entry.sourceFrameRef) : null,
    sceneSealRef: entry.sceneSealRef ? safeRef(entry.sceneSealRef) : null,
    textHash: entry.textHash || null,
    metadataHash: entry.metadataHash || null,
    score,
    scoreReasons: uniqueStrings(scoreReasons),
    semanticCandidate: entry.authority === 'diagnosticCandidate' || Boolean(entry.embeddingRef)
  });
}

export function normalizeRecallIndexEntry(input = {}) {
  const authority = AUTHORITIES.has(input.authority) ? input.authority : 'committed';
  const entry = compactObject({
    kind: RECALL_INDEX_ENTRY_KIND,
    schemaVersion: 1,
    id: asString(input.id, hashStableJson({
      sourceFrameRef: safeRef(input.sourceFrameRef),
      textHash: input.textHash,
      authority
    }).slice(0, 24)),
    campaignId: asString(input.campaignId),
    saveId: asString(input.saveId),
    branchId: asString(input.branchId, 'main'),
    sourceFrameRef: safeRef(input.sourceFrameRef),
    coreEventRefs: (Array.isArray(input.coreEventRefs) ? input.coreEventRefs : []).map(safeRef).filter(Boolean),
    sceneSealRef: safeRef(input.sceneSealRef),
    chapterId: asString(input.chapterId),
    phaseId: asString(input.phaseId),
    sceneId: asString(input.sceneId),
    locationId: asString(input.locationId),
    actorIds: uniqueStrings(input.actorIds),
    subjectIds: uniqueStrings(input.subjectIds),
    threadIds: uniqueStrings(input.threadIds),
    missionIds: uniqueStrings(input.missionIds),
    tags: uniqueStrings(input.tags),
    keywords: uniqueStrings(input.keywords).map((value) => value.toLowerCase()),
    timeRange: safeTimeRange(input.timeRange),
    authority,
    textHash: asString(input.textHash),
    preview: boundedPreview(input.preview),
    metadataHash: asString(input.metadataHash),
    embeddingRef: safeRef(input.embeddingRef),
    stale: input.stale === true,
    staleReason: asString(input.staleReason)
  });
  entry.hash = hashStableJson({
    ...entry,
    hash: undefined,
    byteLength: undefined
  });
  entry.byteLength = stableJsonByteLength(entry);
  return entry;
}

export function createRecallQuery(input = {}) {
  const query = compactObject({
    kind: RECALL_QUERY_KIND,
    schemaVersion: 1,
    campaignId: asString(input.campaignId),
    saveId: asString(input.saveId),
    branchId: asString(input.branchId, 'main'),
    sourceFrameId: asString(input.sourceFrameId),
    actorIds: uniqueStrings(input.actorIds),
    subjectIds: uniqueStrings(input.subjectIds),
    locationIds: uniqueStrings(input.locationIds || input.locationId),
    missionIds: uniqueStrings(input.missionIds || input.missionId),
    threadIds: uniqueStrings(input.threadIds),
    phaseIds: uniqueStrings(input.phaseIds || input.phaseId),
    sceneIds: uniqueStrings(input.sceneIds || input.sceneId),
    tags: uniqueStrings(input.tags),
    keywords: uniqueStrings(input.keywords).map((value) => value.toLowerCase()),
    includeSemanticCandidates: input.includeSemanticCandidates === true,
    limit: Math.max(1, Math.trunc(Number(input.limit) || 8)),
    invalidatedSourceFrameIds: uniqueStrings(input.invalidatedSourceFrameIds)
  });
  query.hash = hashStableJson(query);
  return query;
}

function countMatches(values = [], targets = []) {
  const targetSet = new Set(targets);
  return values.filter((value) => targetSet.has(value)).length;
}

function scoreEntry(entry, query) {
  const reasons = [];
  let score = AUTHORITY_SCORE[entry.authority] || 0;
  const actorMatches = countMatches(entry.actorIds, query.actorIds);
  if (actorMatches) {
    score += actorMatches * 25;
    reasons.push('actor');
  }
  const subjectMatches = countMatches(entry.subjectIds, query.subjectIds);
  if (subjectMatches) {
    score += subjectMatches * 25;
    reasons.push('subject');
  }
  const locationMatches = entry.locationId && query.locationIds?.includes(entry.locationId) ? 1 : 0;
  if (locationMatches) {
    score += 30;
    reasons.push('location');
  }
  const missionMatches = countMatches(entry.missionIds, query.missionIds);
  if (missionMatches) {
    score += missionMatches * 20;
    reasons.push('mission');
  }
  const threadMatches = countMatches(entry.threadIds, query.threadIds);
  if (threadMatches) {
    score += threadMatches * 15;
    reasons.push('thread');
  }
  const phaseMatches = entry.phaseId && query.phaseIds?.includes(entry.phaseId) ? 1 : 0;
  if (phaseMatches) {
    score += 15;
    reasons.push('phase');
  }
  const tagMatches = countMatches(entry.tags, query.tags);
  if (tagMatches) {
    score += tagMatches * 10;
    reasons.push('tag');
  }
  const keywordMatches = countMatches(entry.keywords, query.keywords);
  if (keywordMatches) {
    score += keywordMatches * 12;
    reasons.push('keyword');
  }
  if (entry.sceneSealRef) {
    score += 4;
    reasons.push('sceneSeal');
  }
  if (entry.authority === 'diagnosticCandidate') {
    reasons.push('semanticCandidateNonAuthoritative');
  }
  return { score, reasons };
}

function authorityRank(authority) {
  if (authority === 'committed') return 0;
  if (authority === 'reviewedImport') return 1;
  if (authority === 'package') return 2;
  return 3;
}

export function queryRecallIndex({ entries = [], query = {}, limit = null } = {}) {
  const normalizedQuery = query?.kind === RECALL_QUERY_KIND ? query : createRecallQuery(query);
  const normalizedEntries = (Array.isArray(entries) ? entries : []).map((entry) => (
    entry?.kind === RECALL_INDEX_ENTRY_KIND ? entry : normalizeRecallIndexEntry(entry)
  ));
  const invalidated = new Set(normalizedQuery.invalidatedSourceFrameIds || []);
  const candidates = [];
  const omittedRefs = [];
  for (const entry of normalizedEntries) {
    const sourceFrameId = entry.sourceFrameRef?.id || entry.sourceFrameRef?.sourceFrameId || null;
    if (entry.stale || (sourceFrameId && invalidated.has(sourceFrameId))) {
      omittedRefs.push({
        ...stableEntryRef(entry),
        omissionReason: entry.staleReason || 'stale-source'
      });
      continue;
    }
    if (entry.authority === 'diagnosticCandidate' && !normalizedQuery.includeSemanticCandidates) {
      omittedRefs.push({
        ...stableEntryRef(entry),
        omissionReason: 'semantic-candidates-disabled'
      });
      continue;
    }
    const scored = scoreEntry(entry, normalizedQuery);
    candidates.push({ entry, ...scored });
  }
  candidates.sort((left, right) => {
    const leftIsDiagnostic = left.entry.authority === 'diagnosticCandidate';
    const rightIsDiagnostic = right.entry.authority === 'diagnosticCandidate';
    if (leftIsDiagnostic !== rightIsDiagnostic) return leftIsDiagnostic ? 1 : -1;
    if (right.score !== left.score) return right.score - left.score;
    const rankDelta = authorityRank(left.entry.authority) - authorityRank(right.entry.authority);
    if (rankDelta) return rankDelta;
    return left.entry.id.localeCompare(right.entry.id);
  });
  const max = Math.max(1, Math.trunc(Number(limit || normalizedQuery.limit) || 8));
  const included = candidates.slice(0, max);
  for (const item of candidates.slice(max)) {
    omittedRefs.push({
      ...stableEntryRef(item.entry, item.score, item.reasons),
      omissionReason: 'limit-exceeded'
    });
  }
  const result = {
    kind: RECALL_RESULT_KIND,
    schemaVersion: 1,
    recallIndexRevision: hashStableJson(normalizedEntries.map((entry) => entry.hash)),
    queryHash: normalizedQuery.hash,
    includedRefs: included.map((item) => stableEntryRef(item.entry, item.score, item.reasons)),
    omittedRefs,
    trace: {
      deterministicFirst: true,
      semanticCandidatesAuthoritative: false,
      entryCount: normalizedEntries.length,
      includedCount: included.length,
      omittedCount: omittedRefs.length
    }
  };
  result.hash = hashStableJson(result);
  result.byteLength = stableJsonByteLength(result);
  return result;
}
