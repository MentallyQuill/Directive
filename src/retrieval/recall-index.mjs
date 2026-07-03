import {
  hashStableJson,
  stableJsonByteLength
} from '../runtime/architecture-redesign-contracts.mjs';

export const RECALL_INDEX_ENTRY_KIND = 'directive.recallIndexEntry.v1';
export const RECALL_QUERY_KIND = 'directive.recallQuery.v1';
export const RECALL_RESULT_KIND = 'directive.recallResult.v1';
export const RECALL_SOURCE_MUTATION_KIND = 'directive.recallSourceMutation.v1';

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

const RETRIEVAL_MODES = new Set([
  'deterministic',
  'package',
  'reviewedImport',
  'sceneSeal',
  'semanticCandidate'
]);

const SOURCE_AUTHORITIES = new Set([
  'frame',
  'core',
  'package',
  'reviewedImport',
  'sceneSeal',
  'diagnosticCandidate'
]);

const MUTATION_ACTIONS = new Set([
  'source-edit',
  'source-delete',
  'assistant-edit',
  'assistant-delete',
  'selected-swipe',
  'branch',
  'save-as',
  'rollback'
]);

const RAW_KEY_PATTERN = /(?:raw|body|prompt|provider|transcript|summaryception|memoryBook|vectorPayload|embedding|selectedText|sourceText|quote|excerpt|secret|api[_-]?key|password|token|qdrant)/i;

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

function sourceFrameIdOf(value = {}) {
  return asString(value?.sourceFrameRef?.id)
    || asString(value?.sourceFrameRef?.sourceFrameId)
    || asString(value?.sourceFrameId)
    || null;
}

function sourceFrameHostMessageIdOf(value = {}) {
  return asString(value?.sourceFrameRef?.hostMessageId)
    || asString(value?.hostMessageId)
    || null;
}

function recallScopeMatches(entry = {}, query = {}) {
  if (query.campaignId && entry.campaignId !== query.campaignId) return false;
  if (query.saveId && entry.saveId !== query.saveId) return false;
  if (query.branchId && entry.branchId !== query.branchId) return false;
  return true;
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

function numericClamp(value, fallback = 0, min = 0, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function defaultRetrievalModeFor(input = {}, authority = 'committed') {
  if (authority === 'diagnosticCandidate' || input.embeddingRef) return 'semanticCandidate';
  if (authority === 'reviewedImport') return 'reviewedImport';
  if (authority === 'package') return 'package';
  if (input.sceneSealRef) return 'sceneSeal';
  return 'deterministic';
}

function normalizeRetrievalMetadata(input = {}, authority = 'committed') {
  const source = input?.retrieval && typeof input.retrieval === 'object'
    ? input.retrieval
    : {};
  const mode = asString(source.mode || input.retrievalMode, defaultRetrievalModeFor(input, authority));
  const sourceAuthority = asString(source.sourceAuthority || input.sourceAuthority, authority === 'committed' ? 'core' : authority);
  const priorityFallback = AUTHORITY_SCORE[authority] || 0;
  return compactObject({
    mode: RETRIEVAL_MODES.has(mode) ? mode : defaultRetrievalModeFor(input, authority),
    priority: numericClamp(source.priority ?? input.retrievalPriority, priorityFallback),
    audience: uniqueStrings(source.audience || source.audiences || input.audience || input.audiences),
    knownBy: uniqueStrings(source.knownBy || input.knownBy),
    sourceAuthority: SOURCE_AUTHORITIES.has(sourceAuthority) ? sourceAuthority : (authority === 'committed' ? 'core' : authority),
    ragHints: safeRef(source.ragHints || source.rag || input.ragHints || input.rag)
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
    retrieval: entry.retrieval ? safeRef(entry.retrieval) : null,
    invalidatedByRef: entry.invalidatedByRef ? safeRef(entry.invalidatedByRef) : null,
    forkedFromRef: entry.forkedFromRef ? safeRef(entry.forkedFromRef) : null,
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
    retrieval: normalizeRetrievalMetadata(input, authority),
    embeddingRef: safeRef(input.embeddingRef),
    stale: input.stale === true,
    staleReason: asString(input.staleReason),
    invalidatedByRef: safeRef(input.invalidatedByRef),
    forkedFromRef: safeRef(input.forkedFromRef)
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
    retrievalModes: uniqueStrings(input.retrievalModes || input.retrievalMode),
    audiences: uniqueStrings(input.audiences || input.audience),
    knownBy: uniqueStrings(input.knownBy),
    sourceAuthorities: uniqueStrings(input.sourceAuthorities || input.sourceAuthority),
    includeSemanticCandidates: input.includeSemanticCandidates === true,
    limit: Math.max(1, Math.trunc(Number(input.limit) || 8)),
    invalidatedSourceFrameIds: uniqueStrings(input.invalidatedSourceFrameIds)
  });
  query.hash = hashStableJson(query);
  return query;
}

function mutationReason(action) {
  if (action === 'source-edit' || action === 'assistant-edit') return 'source-edit-invalidated';
  if (action === 'source-delete' || action === 'assistant-delete') return 'source-delete-invalidated';
  if (action === 'selected-swipe') return 'selected-swipe-invalidated';
  if (action === 'rollback') return 'rollback-invalidated';
  return 'source-mutated';
}

function normalizeMutationAction(value) {
  const text = asString(value, 'source-edit').replace(/_/g, '-');
  if (text === 'edited') return 'source-edit';
  if (text === 'deleted') return 'source-delete';
  if (text === 'selectedSwipeChanged') return 'selected-swipe';
  if (text === 'saveAs') return 'save-as';
  if (text === 'branched') return 'branch';
  return MUTATION_ACTIONS.has(text) ? text : 'source-edit';
}

export function createRecallSourceMutation(input = {}) {
  const sourceFrameIds = uniqueStrings(input.sourceFrameIds || input.sourceFrameId);
  const hostMessageIds = uniqueStrings(input.hostMessageIds || input.hostMessageId);
  const action = normalizeMutationAction(input.action);
  const mutation = compactObject({
    kind: RECALL_SOURCE_MUTATION_KIND,
    schemaVersion: 1,
    action,
    campaignId: asString(input.campaignId),
    saveId: asString(input.saveId),
    branchId: asString(input.branchId, 'main'),
    targetSaveId: asString(input.targetSaveId || input.forkSaveId),
    targetBranchId: asString(input.targetBranchId || input.forkBranchId),
    sourceFrameIds,
    hostMessageIds,
    replacementSourceFrameRefs: (Array.isArray(input.replacementSourceFrameRefs) ? input.replacementSourceFrameRefs : [])
      .map(safeRef)
      .filter(Boolean),
    reason: asString(input.reason, mutationReason(action)),
    occurredAt: asString(input.occurredAt)
  });
  mutation.hash = hashStableJson(mutation);
  return mutation;
}

function entryMatchesMutation(entry = {}, mutation = {}) {
  if (mutation.campaignId && entry.campaignId !== mutation.campaignId) return false;
  if (mutation.saveId && entry.saveId !== mutation.saveId) return false;
  if (mutation.branchId && entry.branchId !== mutation.branchId) return false;
  const frameId = sourceFrameIdOf(entry);
  const hostMessageId = sourceFrameHostMessageIdOf(entry);
  if (mutation.sourceFrameIds?.length && frameId && mutation.sourceFrameIds.includes(frameId)) return true;
  if (mutation.hostMessageIds?.length && hostMessageId && mutation.hostMessageIds.includes(hostMessageId)) return true;
  return !mutation.sourceFrameIds?.length && !mutation.hostMessageIds?.length;
}

function mutationRefForEntry(entry = {}, mutation = {}) {
  return safeRef({
    kind: RECALL_SOURCE_MUTATION_KIND,
    action: mutation.action,
    campaignId: mutation.campaignId,
    saveId: mutation.saveId,
    branchId: mutation.branchId,
    sourceFrameId: sourceFrameIdOf(entry),
    hostMessageId: sourceFrameHostMessageIdOf(entry),
    hash: mutation.hash,
    reason: mutation.reason,
    occurredAt: mutation.occurredAt
  });
}

function forkedEntry(entry = {}, mutation = {}) {
  const targetSaveId = asString(mutation.targetSaveId, entry.saveId);
  const targetBranchId = asString(mutation.targetBranchId, entry.branchId);
  return normalizeRecallIndexEntry({
    ...cloneJson(entry),
    id: `${entry.id}.fork.${hashStableJson({
      id: entry.id,
      saveId: targetSaveId,
      branchId: targetBranchId,
      mutationHash: mutation.hash
    }).slice(0, 10)}`,
    saveId: targetSaveId,
    branchId: targetBranchId,
    stale: false,
    staleReason: null,
    invalidatedByRef: null,
    forkedFromRef: safeRef({
      id: entry.id,
      saveId: entry.saveId,
      branchId: entry.branchId,
      hash: entry.hash,
      mutationHash: mutation.hash
    })
  });
}

export function applyRecallSourceMutation({ entries = [], mutation = {} } = {}) {
  const normalizedMutation = mutation?.kind === RECALL_SOURCE_MUTATION_KIND
    ? mutation
    : createRecallSourceMutation(mutation);
  const normalizedEntries = (Array.isArray(entries) ? entries : []).map((entry) => (
    entry?.kind === RECALL_INDEX_ENTRY_KIND ? normalizeRecallIndexEntry(entry) : normalizeRecallIndexEntry(entry)
  ));
  const action = normalizedMutation.action;
  const out = [];
  const invalidatedSourceFrameIds = [];
  const forkedEntryRefs = [];
  const invalidatedEntryRefs = [];
  for (const entry of normalizedEntries) {
    const matches = entryMatchesMutation(entry, normalizedMutation);
    if (!matches) {
      out.push(entry);
      continue;
    }
    if (action === 'branch' || action === 'save-as') {
      if (entry.stale) {
        out.push(entry);
        continue;
      }
      const fork = forkedEntry(entry, normalizedMutation);
      out.push(entry, fork);
      forkedEntryRefs.push(stableEntryRef(fork));
      continue;
    }
    const staleEntry = normalizeRecallIndexEntry({
      ...cloneJson(entry),
      stale: true,
      staleReason: normalizedMutation.reason || mutationReason(action),
      invalidatedByRef: mutationRefForEntry(entry, normalizedMutation)
    });
    out.push(staleEntry);
    invalidatedEntryRefs.push(stableEntryRef(staleEntry));
    const sourceFrameId = sourceFrameIdOf(staleEntry);
    if (sourceFrameId) invalidatedSourceFrameIds.push(sourceFrameId);
  }
  return {
    kind: 'directive.recallSourceMutationResult.v1',
    schemaVersion: 1,
    mutation: normalizedMutation,
    entries: out,
    invalidatedSourceFrameIds: uniqueStrings(invalidatedSourceFrameIds),
    invalidatedEntryRefs,
    forkedEntryRefs,
    trace: {
      inputCount: normalizedEntries.length,
      outputCount: out.length,
      invalidatedCount: invalidatedEntryRefs.length,
      forkedCount: forkedEntryRefs.length
    },
    hash: hashStableJson({
      mutationHash: normalizedMutation.hash,
      entries: out.map((entry) => entry.hash)
    })
  };
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
  const retrieval = entry.retrieval || {};
  if (retrieval.mode && query.retrievalModes?.includes(retrieval.mode)) {
    score += 14;
    reasons.push('retrievalMode');
  }
  const audienceMatches = countMatches(retrieval.audience, query.audiences);
  if (audienceMatches) {
    score += audienceMatches * 8;
    reasons.push('audience');
  }
  const knownByMatches = countMatches(retrieval.knownBy, query.knownBy);
  if (knownByMatches) {
    score += knownByMatches * 18;
    reasons.push('knownBy');
  }
  if (retrieval.sourceAuthority && query.sourceAuthorities?.includes(retrieval.sourceAuthority)) {
    score += 8;
    reasons.push('sourceAuthority');
  }
  if (Number.isFinite(Number(retrieval.priority))) {
    score += Math.min(30, Math.max(0, Math.trunc(Number(retrieval.priority) / 4)));
    reasons.push('retrievalPriority');
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

function retrievalFacetMismatch(entry = {}, query = {}) {
  const retrieval = entry.retrieval || {};
  if (query.retrievalModes?.length && !query.retrievalModes.includes(retrieval.mode)) {
    return 'retrieval-mode-mismatch';
  }
  if (query.audiences?.length && countMatches(retrieval.audience, query.audiences) === 0) {
    return 'audience-mismatch';
  }
  if (query.knownBy?.length && countMatches(retrieval.knownBy, query.knownBy) === 0) {
    return 'known-by-mismatch';
  }
  if (query.sourceAuthorities?.length && !query.sourceAuthorities.includes(retrieval.sourceAuthority)) {
    return 'source-authority-mismatch';
  }
  return null;
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
  const scopedEntries = normalizedEntries.filter((entry) => recallScopeMatches(entry, normalizedQuery));
  const invalidated = new Set(normalizedQuery.invalidatedSourceFrameIds || []);
  const candidates = [];
  const omittedRefs = [];
  for (const entry of normalizedEntries) {
    if (!recallScopeMatches(entry, normalizedQuery)) {
      omittedRefs.push({
        ...stableEntryRef(entry),
        omissionReason: 'scope-mismatch'
      });
      continue;
    }
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
    const retrievalMismatch = retrievalFacetMismatch(entry, normalizedQuery);
    if (retrievalMismatch) {
      omittedRefs.push({
        ...stableEntryRef(entry),
        omissionReason: retrievalMismatch
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
    recallIndexRevision: hashStableJson(scopedEntries.map((entry) => entry.hash)),
    queryHash: normalizedQuery.hash,
    includedRefs: included.map((item) => stableEntryRef(item.entry, item.score, item.reasons)),
    omittedRefs,
    trace: {
      deterministicFirst: true,
      semanticCandidatesAuthoritative: false,
      entryCount: normalizedEntries.length,
      scopedEntryCount: scopedEntries.length,
      includedCount: included.length,
      omittedCount: omittedRefs.length
    }
  };
  result.hash = hashStableJson(result);
  result.byteLength = stableJsonByteLength(result);
  return result;
}
