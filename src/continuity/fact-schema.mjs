export const CONTINUITY_SCHEMA_VERSION = 1;

export const CONTINUITY_VISIBILITY = Object.freeze({
  narratorSafe: 'narratorSafe',
  playerFacing: 'playerFacing',
  directorOnly: 'directorOnly',
  hidden: 'hidden'
});

export const CONTINUITY_DISCLOSURE_STATE = Object.freeze({
  public: 'public',
  shared: 'shared',
  private: 'private',
  inferred: 'inferred',
  secret: 'secret',
  falseBelief: 'falseBelief'
});

export const CONTINUITY_AUTHORITY_RANKS = Object.freeze({
  operatorOverride: 100,
  campaignState: 90,
  committedOutcome: 85,
  package: 80,
  projection: 70,
  sourceDocument: 65,
  directorProposal: 45,
  generatedClaim: 20
});

export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function compact(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function uniqueCompact(values) {
  const seen = new Set();
  const result = [];
  for (const value of asArray(values).map(compact).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function normalizeActorId(value) {
  return compact(value).toLowerCase();
}

export function normalizeActorIds(values) {
  return uniqueCompact(values).map(normalizeActorId).filter(Boolean);
}

export function normalizeDisclosureState(value) {
  const text = compact(value).toLowerCase().replace(/[\s_-]+/g, '');
  if (!text) return CONTINUITY_DISCLOSURE_STATE.public;
  if (text === 'shared' || text === 'common' || text === 'disclosed') return CONTINUITY_DISCLOSURE_STATE.shared;
  if (text === 'private') return CONTINUITY_DISCLOSURE_STATE.private;
  if (text === 'inferred' || text === 'inference') return CONTINUITY_DISCLOSURE_STATE.inferred;
  if (text === 'secret' || text === 'undisclosed' || text === 'hidden') return CONTINUITY_DISCLOSURE_STATE.secret;
  if (text === 'falsebelief' || text === 'false') return CONTINUITY_DISCLOSURE_STATE.falseBelief;
  return CONTINUITY_DISCLOSURE_STATE.public;
}

export function disclosureStateFromVisibility(visibility) {
  const text = compact(visibility).toLowerCase();
  if (!text) return null;
  if (text === CONTINUITY_VISIBILITY.hidden.toLowerCase() || text === CONTINUITY_VISIBILITY.directorOnly.toLowerCase()) {
    return CONTINUITY_DISCLOSURE_STATE.secret;
  }
  if (text === CONTINUITY_VISIBILITY.playerFacing.toLowerCase() || text === CONTINUITY_VISIBILITY.narratorSafe.toLowerCase()) {
    return CONTINUITY_DISCLOSURE_STATE.public;
  }
  return null;
}

export function isProvisionalDisclosureState(value) {
  return normalizeDisclosureState(value) === CONTINUITY_DISCLOSURE_STATE.inferred;
}

export function isFalseBeliefDisclosureState(value) {
  return normalizeDisclosureState(value) === CONTINUITY_DISCLOSURE_STATE.falseBelief;
}

export function disclosureConfidenceCap(value) {
  const state = normalizeDisclosureState(value);
  if (state === CONTINUITY_DISCLOSURE_STATE.falseBelief) return 0.5;
  if (state === CONTINUITY_DISCLOSURE_STATE.inferred) return 0.7;
  return 1;
}

function firstNonEmptyArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
}

function firstPresentValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && compact(value)) return value;
  }
  return null;
}

function actorGroupsFromSourceFrame(sourceFrame = null) {
  const out = new Map();
  const sources = [
    sourceFrame?.actorGroups,
    sourceFrame?.actorGroupMap,
    sourceFrame?.groupActorIds,
    sourceFrame?.scene?.actorGroups,
    sourceFrame?.scene?.actorGroupMap,
    sourceFrame?.scene?.groupActorIds
  ];
  for (const source of sources) {
    if (!isObject(source)) continue;
    for (const [groupId, actors] of Object.entries(source)) {
      const group = normalizeActorId(groupId);
      if (!group) continue;
      const existing = out.get(group) || new Set();
      for (const actorId of normalizeActorIds(asArray(actors))) existing.add(actorId);
      out.set(group, existing);
    }
  }
  return out;
}

function relevantKnowledgeIdsForSourceFrame(sourceFrame = null) {
  const actorIds = normalizeActorIds([
    ...asArray(sourceFrame?.relevantActorIds),
    ...asArray(sourceFrame?.presentActorIds),
    ...asArray(sourceFrame?.referencedActorIds)
  ]);
  const groupIds = normalizeActorIds([
    ...asArray(sourceFrame?.relevantGroupIds),
    ...asArray(sourceFrame?.presentGroupIds),
    ...asArray(sourceFrame?.referencedGroupIds),
    ...asArray(sourceFrame?.scene?.relevantGroupIds),
    ...asArray(sourceFrame?.scene?.presentGroupIds),
    ...asArray(sourceFrame?.scene?.referencedGroupIds)
  ]);
  const groups = actorGroupsFromSourceFrame(sourceFrame);
  for (const [groupId, members] of groups) {
    if (actorIds.some((actorId) => members.has(actorId))) groupIds.push(groupId);
  }
  return {
    actorIds: [...new Set(actorIds)],
    groupIds: [...new Set(groupIds)],
    allIds: [...new Set([...actorIds, ...groupIds])]
  };
}

const SAFE_EVIDENCE_REF_KEYS = new Set([
  'kind',
  'id',
  'refId',
  'sourceFrameId',
  'hostMessageId',
  'turnId',
  'transactionId',
  'outcomeId',
  'responseId',
  'caseId',
  'sourceId',
  'sourceKind',
  'role',
  'authority',
  'status',
  'revision',
  'hash',
  'textHash',
  'metadataHash',
  'sourceHash',
  'selectionHash',
  'rangeHash',
  'observedAt',
  'createdAt',
  'updatedAt',
  'disclosureSourceFrameId',
  'refs'
]);

function sanitizeEvidenceRef(value = null) {
  if (!isObject(value)) return null;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_EVIDENCE_REF_KEYS.has(key)) continue;
    if (item === undefined) continue;
    if (Array.isArray(item)) {
      out[key] = item
        .map((entry) => (isObject(entry) ? sanitizeEvidenceRef(entry) : compact(entry)))
        .filter((entry) => entry && (!isObject(entry) || Object.keys(entry).length));
    } else if (isObject(item)) {
      const nested = sanitizeEvidenceRef(item);
      if (nested && Object.keys(nested).length) out[key] = nested;
    } else {
      out[key] = item;
    }
  }
  return out;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!isObject(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function hashContinuityText(value) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  let hash = 0x811c9dc5;
  for (const char of String(text || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function authorityRank(authority) {
  return Number(CONTINUITY_AUTHORITY_RANKS[authority]) || 0;
}

export function deriveConflictKey({ subject, predicate, semantics = {} } = {}) {
  const base = [
    compact(subject || semantics.subjectId || semantics.entityId || 'unknown'),
    compact(predicate || semantics.field || semantics.kind || 'fact')
  ].filter(Boolean).join('.');
  return base || `fact.${hashContinuityText(semantics)}`;
}

export function isFactVisibleToAudience(fact, audience = CONTINUITY_VISIBILITY.narratorSafe) {
  const visibility = compact(fact?.visibility || CONTINUITY_VISIBILITY.narratorSafe);
  if (visibility === CONTINUITY_VISIBILITY.hidden) return false;
  if (visibility === CONTINUITY_VISIBILITY.directorOnly) {
    return audience === CONTINUITY_VISIBILITY.directorOnly;
  }
  if (audience === CONTINUITY_VISIBILITY.playerFacing) {
    return visibility === CONTINUITY_VISIBILITY.playerFacing || visibility === CONTINUITY_VISIBILITY.narratorSafe;
  }
  return true;
}

export function factKnowledgeScope(fact = {}) {
  const disclosureState = normalizeDisclosureState(firstPresentValue(
    fact.disclosureState,
    fact.knowledgeScope?.disclosureState,
    fact.semantics?.disclosureState,
    fact.semantics?.knowledgeScope?.disclosureState,
    disclosureStateFromVisibility(fact.visibility)
  ));
  const knownBy = normalizeActorIds(firstNonEmptyArray(
    fact.knownBy,
    fact.knowledgeScope?.knownBy,
    fact.semantics?.knownBy,
    fact.semantics?.knowledgeScope?.knownBy
  ));
  const witnessedBy = normalizeActorIds(firstNonEmptyArray(
    fact.witnessedBy,
    fact.knowledgeScope?.witnessedBy,
    fact.semantics?.witnessedBy,
    fact.semantics?.knowledgeScope?.witnessedBy
  ));
  const subjectIds = normalizeActorIds(firstNonEmptyArray(
    fact.subjectIds,
    fact.knowledgeScope?.subjectIds,
    fact.semantics?.subjectIds,
    fact.semantics?.knowledgeScope?.subjectIds
  ));
  return {
    knownBy,
    witnessedBy,
    subjectIds,
    disclosureState,
    disclosureSourceFrameId: compact(firstPresentValue(
      fact.disclosureSourceFrameId,
      fact.knowledgeScope?.disclosureSourceFrameId,
      fact.semantics?.disclosureSourceFrameId,
      fact.semantics?.knowledgeScope?.disclosureSourceFrameId
    )) || null
  };
}

export function isFactActorScoped(fact = {}) {
  const scope = factKnowledgeScope(fact);
  return scope.knownBy.length > 0
    || scope.witnessedBy.length > 0
    || scope.subjectIds.length > 0
    || ![CONTINUITY_DISCLOSURE_STATE.public, CONTINUITY_DISCLOSURE_STATE.shared].includes(scope.disclosureState);
}

export function isFactKnownToActor(fact = {}, actorId = null) {
  const actor = normalizeActorId(actorId);
  if (!actor) return false;
  const scope = factKnowledgeScope(fact);
  const knowledgeSet = new Set([...scope.knownBy, ...scope.witnessedBy]);
  if (knowledgeSet.has(actor)) return true;
  if ([CONTINUITY_DISCLOSURE_STATE.public, CONTINUITY_DISCLOSURE_STATE.shared].includes(scope.disclosureState)) return true;
  return false;
}

export function isFactAllowedForSourceFrame(fact = {}, sourceFrame = null) {
  if (!isFactActorScoped(fact)) return true;
  const scope = factKnowledgeScope(fact);
  if ([CONTINUITY_DISCLOSURE_STATE.public, CONTINUITY_DISCLOSURE_STATE.shared].includes(scope.disclosureState)) return true;
  const relevant = relevantKnowledgeIdsForSourceFrame(sourceFrame);
  if (!relevant.allIds.length) return false;
  return relevant.allIds.some((actorId) => isFactKnownToActor(fact, actorId));
}

export function createContinuityFact({
  id,
  kind = 'fact',
  subject = null,
  predicate = null,
  value = null,
  summary = null,
  render = {},
  source = {},
  anchors = [],
  authority = 'package',
  visibility = CONTINUITY_VISIBILITY.narratorSafe,
  confidence = null,
  criticality = 'medium',
  stability = 'stable',
  tags = [],
  semantics = {},
  knownBy,
  witnessedBy,
  subjectIds,
  disclosureState,
  disclosureSourceFrameId,
  evidenceRefs,
  createdAt = null,
  updatedAt = null,
  observedAt = null,
  expiresAt = null,
  revision = null,
  turnId = null
} = {}) {
  const subjectValue = compact(subject || semantics.subjectId || semantics.entityId);
  const predicateValue = compact(predicate || semantics.field || semantics.kind);
  const summaryValue = compact(summary || render?.narrator || render?.player || render?.director);
  const conflictKey = deriveConflictKey({ subject: subjectValue, predicate: predicateValue, semantics });
  const normalizedKnownBy = normalizeActorIds(firstNonEmptyArray(knownBy, semantics.knownBy, semantics.knowledgeScope?.knownBy));
  const normalizedWitnessedBy = normalizeActorIds(firstNonEmptyArray(witnessedBy, semantics.witnessedBy, semantics.knowledgeScope?.witnessedBy));
  const normalizedSubjectIds = normalizeActorIds(firstNonEmptyArray(subjectIds, semantics.subjectIds, semantics.knowledgeScope?.subjectIds, [subjectValue].filter(Boolean)));
  const normalizedDisclosureState = normalizeDisclosureState(firstPresentValue(
    disclosureState,
    semantics.disclosureState,
    semantics.knowledgeScope?.disclosureState,
    disclosureStateFromVisibility(visibility),
    CONTINUITY_DISCLOSURE_STATE.public
  ));
  const baseConfidence = confidence === undefined || confidence === null || confidence === ''
    ? 1
    : Number(confidence);
  const normalizedConfidence = Math.max(0, Math.min(
    disclosureConfidenceCap(normalizedDisclosureState),
    Number.isFinite(baseConfidence) ? baseConfidence : 0
  ));
  const sanitizedSemantics = cloneJson(semantics || {});
  if (Array.isArray(sanitizedSemantics.evidenceRefs)) {
    sanitizedSemantics.evidenceRefs = sanitizedSemantics.evidenceRefs
      .map(sanitizeEvidenceRef)
      .filter((entry) => entry && Object.keys(entry).length);
  }
  if (Array.isArray(sanitizedSemantics.knowledgeScope?.evidenceRefs)) {
    sanitizedSemantics.knowledgeScope.evidenceRefs = sanitizedSemantics.knowledgeScope.evidenceRefs
      .map(sanitizeEvidenceRef)
      .filter((entry) => entry && Object.keys(entry).length);
  }
  const fact = {
    schemaVersion: CONTINUITY_SCHEMA_VERSION,
    id: compact(id) || `fact.${hashContinuityText({ subject: subjectValue, predicate: predicateValue, value, summary: summaryValue })}`,
    kind: compact(kind) || 'fact',
    subject: subjectValue || null,
    predicate: predicateValue || null,
    value: cloneJson(value),
    summary: summaryValue,
    render: {
      narrator: compact(render?.narrator || summaryValue),
      player: compact(render?.player || render?.narrator || summaryValue),
      director: compact(render?.director || render?.narrator || summaryValue),
      inspector: compact(render?.inspector || render?.director || render?.narrator || summaryValue)
    },
    source: cloneJson(source || {}),
    anchors: asArray(anchors).map(cloneJson),
    authority: compact(authority) || 'package',
    authorityRank: authorityRank(authority),
    visibility,
    confidence: normalizedConfidence,
    criticality: compact(criticality) || 'medium',
    stability: compact(stability) || 'stable',
    conflictKey,
    tags: uniqueCompact(tags),
    semantics: sanitizedSemantics,
    knownBy: normalizedKnownBy,
    witnessedBy: normalizedWitnessedBy,
    subjectIds: normalizedSubjectIds,
    disclosureState: normalizedDisclosureState,
    disclosureSourceFrameId: compact(firstPresentValue(
      disclosureSourceFrameId,
      semantics.disclosureSourceFrameId,
      semantics.knowledgeScope?.disclosureSourceFrameId
    )) || null,
    evidenceRefs: firstNonEmptyArray(evidenceRefs, semantics.evidenceRefs, semantics.knowledgeScope?.evidenceRefs)
      .map(sanitizeEvidenceRef)
      .filter((entry) => entry && Object.keys(entry).length),
    createdAt: createdAt || null,
    updatedAt: updatedAt || null,
    observedAt: observedAt || null,
    expiresAt: expiresAt || null,
    revision: Number.isFinite(Number(revision)) ? Number(revision) : null,
    turnId: compact(turnId) || null
  };
  fact.hash = hashContinuityText({
    id: fact.id,
    value: fact.value,
    summary: fact.summary,
    source: fact.source,
    authority: fact.authority,
    visibility: fact.visibility,
    knownBy: fact.knownBy,
    witnessedBy: fact.witnessedBy,
    subjectIds: fact.subjectIds,
    disclosureState: fact.disclosureState,
    disclosureSourceFrameId: fact.disclosureSourceFrameId,
    evidenceRefs: fact.evidenceRefs
  });
  return fact;
}
