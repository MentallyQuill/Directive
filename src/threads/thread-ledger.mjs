export const THREAD_STATUSES = Object.freeze([
  'observed',
  'latent',
  'watchlisted',
  'available',
  'engaged',
  'active',
  'resolved',
  'transformed',
  'dormant',
  'expired',
  'echo'
]);

export const THREAD_SHAPES = Object.freeze([
  'vignette',
  'recurring_detail',
  'character_thread',
  'side_assignment'
]);

export const THREAD_TYPES = Object.freeze([
  'crew_growth',
  'interpersonal_relationship',
  'mentorship',
  'professional_dilemma',
  'humanitarian_assistance',
  'cultural_exchange',
  'scientific_curiosity',
  'shipboard_maintenance',
  'recovery_and_aftermath',
  'hobby_ritual_or_domestic_life',
  'light_comedy',
  'local_civilian_problem',
  'promise_debt_or_favor',
  'identity_and_belonging'
]);

export const THREAD_EPISODE_FUNCTIONS = Object.freeze([
  'mirror',
  'counterpoint',
  'relief',
  'aftermath',
  'setup'
]);

const TERMINAL_STATUSES = new Set(['resolved', 'transformed', 'dormant', 'expired']);
const ALWAYS_HIDDEN_STATUSES = new Set(['observed', 'latent', 'watchlisted']);

const VALID_TRANSITIONS = Object.freeze({
  observed: ['latent', 'watchlisted', 'expired'],
  latent: ['watchlisted', 'available', 'dormant', 'expired', 'transformed'],
  watchlisted: ['available', 'dormant', 'expired', 'transformed'],
  available: ['engaged', 'dormant', 'expired'],
  engaged: ['active', 'resolved', 'transformed', 'dormant', 'expired'],
  active: ['resolved', 'transformed', 'dormant', 'expired'],
  resolved: ['echo'],
  transformed: ['echo'],
  dormant: ['available', 'expired', 'echo'],
  expired: ['echo'],
  echo: []
});

export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null) : [];
}

function uniqueStrings(value) {
  return [...new Set(asArray(value).map((item) => String(item).trim()).filter(Boolean))];
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
}

function normalizeEnum(value, allowed, label) {
  const text = requireText(value, label);
  if (!allowed.includes(text)) {
    throw new Error(`Unknown ${label} "${value}".`);
  }
  return text;
}

function normalizeOptionalEnum(value, allowed, label) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return normalizeEnum(value, allowed, label);
}

function normalizeSource(source, label = 'Thread record source') {
  if (typeof source === 'string') {
    return { id: requireText(source, label), type: 'source' };
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`${label} is required.`);
  }
  const id = String(source.id || source.sceneId || source.sourceSceneId || source.outcomeId || source.turnId || '').trim();
  if (!id) {
    throw new Error(`${label} id is required.`);
  }
  return compactObject({
    ...cloneJson(source),
    id,
    type: String(source.type || source.kind || 'source').trim()
  });
}

function evidenceKeys(evidence) {
  return [
    evidence.id ? `id:${evidence.id}` : null,
    evidence.source?.id ? `source:${evidence.source.type || 'source'}:${evidence.source.id}` : null
  ].filter(Boolean);
}

function normalizeEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('Thread evidence must be an object.');
  }
  const source = normalizeSource(
    evidence.source || evidence.sourceSceneId || evidence.sourceOutcomeId || evidence.sourceTurnId,
    'Thread evidence source'
  );
  const summary = requireText(evidence.summary, 'Thread evidence summary');
  return compactObject({
    ...cloneJson(evidence),
    id: String(evidence.id || '').trim() || undefined,
    source,
    summary,
    visibility: evidence.visibility === 'player_safe' ? 'player_safe' : 'hidden',
    tags: uniqueStrings(evidence.tags),
    hiddenFactIds: uniqueStrings(evidence.hiddenFactIds),
    rawValuesHidden: true
  });
}

function mergeEvidencePair(previous, incoming) {
  return compactObject({
    ...previous,
    ...incoming,
    id: previous.id || incoming.id,
    source: previous.source || incoming.source,
    summary: incoming.summary || previous.summary,
    visibility: previous.visibility === 'player_safe' || incoming.visibility === 'player_safe' ? 'player_safe' : 'hidden',
    tags: uniqueStrings([...(previous.tags || []), ...(incoming.tags || [])]),
    hiddenFactIds: uniqueStrings([...(previous.hiddenFactIds || []), ...(incoming.hiddenFactIds || [])]),
    rawValuesHidden: true
  });
}

function mergeEvidenceList(previousEvidence = [], incomingEvidence = []) {
  const merged = [];
  const byKey = new Map();
  for (const item of [...asArray(previousEvidence), ...asArray(incomingEvidence)]) {
    const normalized = normalizeEvidence(item);
    const keys = evidenceKeys(normalized);
    if (keys.length === 0) {
      merged.push(normalized);
      continue;
    }
    const existingIndex = keys.map((key) => byKey.get(key)).find((index) => index !== undefined);
    if (existingIndex === undefined) {
      for (const key of keys) byKey.set(key, merged.length);
      merged.push(normalized);
    } else {
      merged[existingIndex] = mergeEvidencePair(merged[existingIndex], normalized);
      for (const key of evidenceKeys(merged[existingIndex])) byKey.set(key, existingIndex);
    }
  }
  return merged;
}

function normalizeBearingPotential(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { eligible: false };
  }
  return {
    ...cloneJson(value),
    eligible: Boolean(value.eligible),
    rawValuesHidden: true
  };
}

function normalizeClosureReview(review) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    throw new Error('Thread closure review must be an object.');
  }
  const threadId = requireText(review.threadId || review.id, 'Thread closure review threadId');
  const status = normalizeEnum(review.status || review.outcomeStatus, [...TERMINAL_STATUSES, 'echo'], 'thread closure status');
  return compactObject({
    ...cloneJson(review),
    id: String(review.id || `closure.${threadId}.${review.sourceOutcomeId || review.sourceId || status}`).trim(),
    threadId,
    status,
    summary: String(review.summary || '').trim(),
    sourceOutcomeId: review.sourceOutcomeId || null,
    relationshipHints: cloneJson(asArray(review.relationshipHints)),
    developmentHints: cloneJson(asArray(review.developmentHints)),
    commandBearingEvaluationInput: review.commandBearingEvaluationInput
      ? { ...cloneJson(review.commandBearingEvaluationInput), rawValuesHidden: true }
      : null,
    rawValuesHidden: true
  });
}

function assertTransition(fromStatus, toStatus, threadId) {
  if (fromStatus === toStatus) return;
  const allowed = VALID_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new Error(`Invalid thread lifecycle transition for "${threadId}": ${fromStatus} -> ${toStatus}.`);
  }
}

export function normalizeThreadRecord(record = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Thread record must be an object.');
  }
  const id = requireText(record.id, 'Thread record id');
  const status = normalizeEnum(record.status, THREAD_STATUSES, 'thread status');
  const shape = normalizeEnum(record.shape, THREAD_SHAPES, 'thread shape');
  const type = normalizeEnum(record.type, THREAD_TYPES, 'thread type');
  const source = normalizeSource(record.source, `Thread record "${id}" source`);
  const storyQuestion = requireText(record.storyQuestion || record.story_question, `Thread record "${id}" storyQuestion`);

  return compactObject({
    id,
    status,
    shape,
    type,
    episodeFunction: normalizeOptionalEnum(
      record.episodeFunction || record.episode_function,
      THREAD_EPISODE_FUNCTIONS,
      'thread episode function'
    ),
    source,
    originSceneId: record.originSceneId || record.origin_scene_id || source.id,
    participants: uniqueStrings(record.participants),
    title: String(record.title || '').trim(),
    playerSummary: String(record.playerSummary || record.player_summary || '').trim(),
    observableSeed: String(record.observableSeed || record.observable_seed || '').trim(),
    storyQuestion,
    naturalTrigger: String(record.naturalTrigger || record.natural_trigger || '').trim(),
    linkedPressureIds: uniqueStrings(record.linkedPressureIds),
    linkedCrewIds: uniqueStrings(record.linkedCrewIds || record.participants),
    linkedFactIds: uniqueStrings(record.linkedFactIds),
    tags: uniqueStrings(record.tags),
    supportingEvidence: mergeEvidenceList([], record.supportingEvidence || record.supporting_evidence),
    closureReviews: asArray(record.closureReviews || record.closure_reviews).map(normalizeClosureReview),
    bearingPotential: normalizeBearingPotential(record.bearingPotential || record.bearing_potential),
    hiddenFacts: cloneJson(asArray(record.hiddenFacts || record.hidden_facts)),
    rawScores: cloneJson(record.rawScores || record.scores || null),
    relationshipRawValues: cloneJson(record.relationshipRawValues || null),
    developmentRawValues: cloneJson(record.developmentRawValues || null),
    lastUpdatedByOutcomeId: record.lastUpdatedByOutcomeId || record.sourceOutcomeId || null,
    rawValuesHidden: true
  });
}

export function mergeThreadEvidence(record, evidence = []) {
  const normalized = normalizeThreadRecord(record);
  return normalizeThreadRecord({
    ...normalized,
    supportingEvidence: mergeEvidenceList(normalized.supportingEvidence, evidence)
  });
}

export function createThreadLedger({ records = [], activationReviews = [], closureReviews = [] } = {}) {
  return {
    records: records.map(normalizeThreadRecord),
    activationReviews: cloneJson(asArray(activationReviews)),
    closureReviews: asArray(closureReviews).map(normalizeClosureReview),
    rawValuesHidden: true
  };
}

function mergeThreadRecord(previous, incoming) {
  if (!previous) return normalizeThreadRecord(incoming);
  const previousRecord = normalizeThreadRecord(previous);
  const incomingRecord = normalizeThreadRecord(incoming);
  assertTransition(previousRecord.status, incomingRecord.status, previousRecord.id);
  return normalizeThreadRecord({
    ...previousRecord,
    ...incomingRecord,
    source: previousRecord.source || incomingRecord.source,
    originSceneId: previousRecord.originSceneId || incomingRecord.originSceneId,
    participants: uniqueStrings([...previousRecord.participants, ...incomingRecord.participants]),
    linkedPressureIds: uniqueStrings([...previousRecord.linkedPressureIds, ...incomingRecord.linkedPressureIds]),
    linkedCrewIds: uniqueStrings([...previousRecord.linkedCrewIds, ...incomingRecord.linkedCrewIds]),
    linkedFactIds: uniqueStrings([...previousRecord.linkedFactIds, ...incomingRecord.linkedFactIds]),
    tags: uniqueStrings([...previousRecord.tags, ...incomingRecord.tags]),
    supportingEvidence: mergeEvidenceList(previousRecord.supportingEvidence, incomingRecord.supportingEvidence),
    closureReviews: [...previousRecord.closureReviews, ...incomingRecord.closureReviews]
  });
}

function applyTransition(record, transition) {
  const toStatus = normalizeEnum(transition.status || transition.toStatus, THREAD_STATUSES, 'thread status');
  assertTransition(record.status, toStatus, record.id);
  return normalizeThreadRecord({
    ...record,
    status: toStatus,
    lastUpdatedByOutcomeId: transition.sourceOutcomeId || record.lastUpdatedByOutcomeId,
    closureReviews: record.closureReviews
  });
}

export function applyThreadLedgerDelta(ledger = {}, delta = {}) {
  if (!delta || typeof delta !== 'object' || Array.isArray(delta)) {
    return createThreadLedger(ledger);
  }
  const next = createThreadLedger(ledger);
  const byId = new Map(next.records.map((record) => [record.id, record]));

  for (const record of asArray(delta.upsertRecords || delta.records)) {
    const normalized = normalizeThreadRecord(record);
    byId.set(normalized.id, mergeThreadRecord(byId.get(normalized.id), normalized));
  }

  for (const evidenceDelta of asArray(delta.evidence || delta.mergeEvidence)) {
    const threadId = requireText(evidenceDelta.threadId || evidenceDelta.id, 'Thread evidence delta threadId');
    const existing = byId.get(threadId);
    if (!existing) {
      throw new Error(`Cannot merge evidence for unknown thread "${threadId}".`);
    }
    byId.set(threadId, mergeThreadEvidence(existing, evidenceDelta.items || evidenceDelta.evidence || []));
  }

  for (const transition of asArray(delta.transitions || delta.statusTransitions)) {
    const threadId = requireText(transition.threadId || transition.id, 'Thread transition threadId');
    const existing = byId.get(threadId);
    if (!existing) {
      throw new Error(`Cannot transition unknown thread "${threadId}".`);
    }
    byId.set(threadId, applyTransition(existing, transition));
  }

  const closureReviews = [
    ...next.closureReviews,
    ...asArray(delta.closureReviewsAdd || delta.closureReviews).map(normalizeClosureReview)
  ];
  for (const review of closureReviews.slice(next.closureReviews.length)) {
    const existing = byId.get(review.threadId);
    if (!existing) {
      throw new Error(`Cannot append closure review for unknown thread "${review.threadId}".`);
    }
    assertTransition(existing.status, review.status, existing.id);
    byId.set(review.threadId, normalizeThreadRecord({
      ...existing,
      status: review.status,
      lastUpdatedByOutcomeId: review.sourceOutcomeId || existing.lastUpdatedByOutcomeId,
      closureReviews: [...existing.closureReviews, review]
    }));
  }

  return {
    records: [...byId.values()].map(normalizeThreadRecord),
    activationReviews: [
      ...next.activationReviews,
      ...cloneJson(asArray(delta.activationReviewsAdd || delta.activationReviews))
    ],
    closureReviews,
    rawValuesHidden: true
  };
}

export function threadPlayerSummaries(threadLedger, {
  statuses = ['engaged', 'active'],
  limit = 6
} = {}) {
  const allowedStatuses = new Set(asArray(statuses));
  return (threadLedger?.records || [])
    .map(normalizeThreadRecord)
    .filter((record) => allowedStatuses.has(record.status))
    .filter((record) => !ALWAYS_HIDDEN_STATUSES.has(record.status))
    .slice(0, limit)
    .map((record) => ({
      id: record.id,
      status: record.status,
      title: record.title || record.playerSummary || 'Ongoing concern',
      summary: record.playerSummary || record.observableSeed || '',
      participants: cloneJson(record.participants),
      sourceId: record.source.id
    }));
}
