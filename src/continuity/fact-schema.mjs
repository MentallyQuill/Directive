export const CONTINUITY_SCHEMA_VERSION = 1;

export const CONTINUITY_VISIBILITY = Object.freeze({
  narratorSafe: 'narratorSafe',
  playerFacing: 'playerFacing',
  directorOnly: 'directorOnly',
  hidden: 'hidden'
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
  confidence = 1,
  criticality = 'medium',
  stability = 'stable',
  tags = [],
  semantics = {},
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
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    criticality: compact(criticality) || 'medium',
    stability: compact(stability) || 'stable',
    conflictKey,
    tags: uniqueCompact(tags),
    semantics: cloneJson(semantics || {}),
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
    visibility: fact.visibility
  });
  return fact;
}
