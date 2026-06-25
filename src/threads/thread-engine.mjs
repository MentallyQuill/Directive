import {
  createThreadLedger,
  normalizeThreadRecord,
  threadSemanticFingerprint,
  transitionThread
} from './thread-ledger.mjs';
import { extractSceneDelta, sceneDeltaToThreadCandidates } from './scene-delta-extractor.mjs';
import { planCommandBearingClosureReviews } from '../command/command-bearing.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function unique(values) { return [...new Set(asArray(values).filter(Boolean))]; }
function timestamp(now) { return typeof now === 'function' ? now() : (now || new Date().toISOString()); }
function tokens(value) {
  return new Set(String(value || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((item) => item.length > 3 && !['that', 'this', 'with', 'from', 'have', 'will', 'help', 'more'].includes(item)));
}
function jaccard(a, b) {
  const A = tokens(a); const B = tokens(b);
  if (!A.size && !B.size) return 1;
  let intersection = 0;
  for (const item of A) if (B.has(item)) intersection += 1;
  return intersection / (A.size + B.size - intersection || 1);
}
function participantOverlap(a, b) {
  const A = new Set(unique(a));
  const B = unique(b);
  if (!A.size && !B.length) return 1;
  const shared = B.filter((item) => A.has(item)).length;
  return shared / Math.max(1, Math.min(A.size || 1, B.length || 1));
}
function topicKey(item) {
  return item.topicKey || item.metadata?.topicKey || asArray(item.tags).find((tag) => ['relationship', 'work-task', 'recovery', 'obligation', 'identity', 'mentorship', 'civilian', 'science', 'domestic'].includes(tag)) || item.type;
}

/** Semantic deduplication is deliberately conservative across actors, but
 * tolerant of paraphrase for the same actor and concern family. */
export function semanticThreadMatch(candidate, records, { threshold = 0.42 } = {}) {
  let best = null;
  for (const rawRecord of asArray(records)) {
    const record = normalizeThreadRecord(rawRecord);
    if (['resolved', 'transformed', 'expired'].includes(record.status) || record.metadata?.stale === true) continue;
    const overlap = participantOverlap(candidate.participantIds || candidate.participants, record.participantIds || record.participants);
    const candidateHasActors = unique(candidate.participantIds || candidate.participants).length > 0;
    const recordHasActors = record.participantIds.length > 0;
    if (candidateHasActors && recordHasActors && overlap === 0) continue;
    const candidateTopic = topicKey(candidate);
    const recordTopic = topicKey(record);
    const sameTopic = candidateTopic === recordTopic;
    // Shared generic tags such as "promise-or-obligation" must not merge
    // unrelated concerns. A cross-type merge is permitted only inside the
    // same explicit concern family.
    if (candidateTopic && recordTopic && !sameTopic) continue;
    const typeCompatible = record.type === candidate.type || sameTopic;
    if (!typeCompatible) continue;
    const lexical = jaccard(
      `${record.title} ${record.summary} ${record.observableSeed}`,
      `${candidate.title} ${candidate.summary} ${candidate.observableSeed}`
    );
    let score = lexical * 0.55 + overlap * 0.25 + (sameTopic ? 0.25 : 0) + (record.type === candidate.type ? 0.1 : 0);
    if (record.semanticFingerprint === candidate.semanticFingerprint) score = 1;
    if (sameTopic && overlap > 0) score = Math.max(score, 0.72);
    const required = candidateHasActors || recordHasActors ? threshold : Math.max(0.62, threshold);
    if (score >= required && (!best || score > best.score)) best = { record, score, lexical, overlap, sameTopic };
  }
  return best;
}

function recordFromCandidate(candidate, { boundaryIndex = 0, now = null } = {}) {
  return normalizeThreadRecord({
    ...cloneJson(candidate),
    id: candidate.id,
    status: candidate.directCommitment ? 'active' : candidate.playerInterest ? 'engaged' : (candidate.status || 'watchlisted'),
    shape: candidate.shape || 'vignette',
    episodeFunction: 'setup',
    source: candidate.source,
    participantIds: candidate.participantIds || candidate.participants,
    linkedCrewIds: candidate.participantIds || candidate.participants,
    supportingEvidence: candidate.evidence,
    reinforcementCount: 1,
    playerInterest: Number(candidate.playerInterest || 0),
    salience: Number(candidate.confidence || 0.62),
    firstObservedAt: timestamp(now),
    lastReinforcedAt: timestamp(now),
    boundaryLastReinforced: boundaryIndex,
    cooldownUntilBoundary: 0,
    semanticFingerprint: candidate.semanticFingerprint || threadSemanticFingerprint(candidate),
    metadata: {
      privacyRisk: candidate.privacyRisk || 'low',
      sourceAnchorRange: cloneJson(candidate.source?.anchorRange || null),
      topicKey: candidate.topicKey || null,
      semanticKey: candidate.semanticKey || null,
      stale: false
    }
  });
}

function reinforceRecord(record, candidate, { boundaryIndex = 0, now = null } = {}) {
  const normalized = normalizeThreadRecord(record);
  const evidenceById = new Map(asArray(normalized.supportingEvidence).map((item) => [item.id, item]));
  for (const evidence of asArray(candidate.evidence)) evidenceById.set(evidence.id, evidence);
  const added = Math.max(0, evidenceById.size - normalized.supportingEvidence.length);
  const interest = Math.max(Number(normalized.playerInterest || 0), Number(candidate.playerInterest || 0), candidate.directCommitment ? 2 : 0);
  let status = normalized.status;
  const reinforcement = Math.max(Number(normalized.reinforcementCount || 1) + Math.max(1, added), evidenceById.size);
  if (['observed', 'latent', 'dormant'].includes(status)) status = 'watchlisted';
  if (status === 'watchlisted' && (reinforcement >= 2 || interest >= 1)) status = 'available';
  if (status === 'available' && interest >= 1) status = 'engaged';
  if (status === 'engaged' && candidate.directCommitment) status = 'active';
  return normalizeThreadRecord({
    ...normalized,
    status,
    participantIds: unique([...normalized.participantIds, ...asArray(candidate.participantIds)]),
    tags: unique([...normalized.tags, ...asArray(candidate.tags)]),
    supportingEvidence: [...evidenceById.values()],
    reinforcementCount: reinforcement,
    playerInterest: interest,
    salience: Math.min(1, Math.max(Number(normalized.salience || 0.5), Number(candidate.confidence || 0.6)) + 0.08),
    lastReinforcedAt: timestamp(now),
    boundaryLastReinforced: boundaryIndex,
    playerSummary: interest ? candidate.summary.slice(0, 320) : normalized.playerSummary,
    summary: candidate.summary || normalized.summary,
    metadata: { ...normalized.metadata, topicKey: candidate.topicKey || normalized.metadata?.topicKey || null, semanticKey: candidate.semanticKey || normalized.metadata?.semanticKey || null, stale: false, staleReason: null },
    history: [...asArray(normalized.history), { at: timestamp(now), from: normalized.status, to: status, reason: 'observable-evidence-reinforced', evidenceIds: asArray(candidate.evidence).map((item) => item.id) }]
  });
}

export function decayThreadLedger(ledger, { packageData = null, boundaryType = 'scene', now = null } = {}) {
  const next = createThreadLedger(ledger);
  const policy = packageData?.threadTemplates?.generationPolicy || {};
  const boundaryIndex = Number(next.pacing.boundaryIndex || 0) + 1;
  const decayAfter = Number(policy.decayAfterBoundaries || 4);
  const expireAfter = Number(policy.expireAfterBoundaries || 12);
  const changes = [];
  next.records = next.records.map((raw) => {
    const record = normalizeThreadRecord(raw);
    if (['engaged', 'active', 'resolved', 'transformed', 'expired', 'echo'].includes(record.status)) return record;
    const age = boundaryIndex - Number(record.boundaryLastReinforced || 0);
    let status = record.status;
    let salience = record.salience;
    if (age > decayAfter) salience = Math.max(0, salience - 0.06 * Math.max(1, age - decayAfter));
    if (age >= expireAfter && record.playerInterest < 1) {
      status = 'expired'; changes.push({ threadId: record.id, to: 'expired', reason: 'unreinforced-expiry' });
    } else if (age >= decayAfter + 3 && ['available', 'watchlisted'].includes(status) && record.playerInterest < 1) {
      status = 'dormant'; changes.push({ threadId: record.id, to: 'dormant', reason: 'pacing-decay' });
    }
    return normalizeThreadRecord({ ...record, status, salience, history: status !== record.status ? [...record.history, { at: timestamp(now), from: record.status, to: status, reason: 'boundary-decay' }] : record.history });
  });
  next.pacing = { ...next.pacing, boundaryIndex, lastBoundaryType: boundaryType };
  return { ledger: next, changes, boundaryIndex };
}

export function curateThreadSurfacing({ ledger, packageData, state = null, scene = {} } = {}) {
  const policy = packageData?.threadTemplates?.generationPolicy || {};
  const maxActive = Number(policy.maximumActiveThreads || 2);
  const maxAvailable = Number(policy.maximumAvailableThreads || 5);
  const boundaryIndex = Number(ledger?.pacing?.boundaryIndex || 0);
  const activeCount = asArray(ledger?.records).filter((item) => ['engaged', 'active'].includes(item.status)).length;
  const availableCount = asArray(ledger?.records).filter((item) => item.status === 'available').length;
  const slots = Math.max(0, Math.min(maxActive - activeCount, maxAvailable - availableCount));
  const present = new Set(asArray(scene.presentCharacterIds || scene.actorIds));
  const foregroundPressure = Boolean(state?.attentionState?.primaryPressureId);
  const downtime = scene.downtime === true || ['rest', 'time-advance', 'travel'].includes(scene.boundaryType);
  const recentParticipants = new Set(asArray(ledger?.pacing?.recentParticipantIds));
  const ranked = asArray(ledger?.records).map(normalizeThreadRecord)
    .filter((item) => ['watchlisted', 'available', 'engaged'].includes(item.status) && item.metadata?.stale !== true && Number(item.cooldownUntilBoundary || 0) <= boundaryIndex)
    .map((item) => {
      let score = item.salience * 100 + item.reinforcementCount * 8 + item.playerInterest * 18;
      if (item.participantIds.some((id) => present.has(id))) score += 22;
      if (downtime) score += 16;
      if (foregroundPressure && !item.playerInterest) score -= 24;
      if (ledger?.pacing?.lastSurfacedThreadId === item.id) score -= 28;
      if (item.participantIds.some((id) => recentParticipants.has(id))) score -= 8;
      if (item.status === 'engaged') score += 20;
      return { id: item.id, score, record: item };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { selected: ranked.slice(0, slots), deferred: ranked.slice(slots), slots, downtime };
}

export function applyThreadSurfacing(ledger, curation, { packageData = null, now = null } = {}) {
  let next = createThreadLedger(ledger);
  const cooldown = Number(packageData?.threadTemplates?.generationPolicy?.defaultCooldownBoundaries || 2);
  const boundaryIndex = Number(next.pacing.boundaryIndex || 0);
  const surfaced = [];
  for (const item of asArray(curation?.selected)) {
    const index = next.records.findIndex((record) => record.id === item.id);
    if (index < 0) continue;
    const record = next.records[index];
    let status = record.status;
    if (status === 'watchlisted') status = 'available';
    if (status === 'available' && record.playerInterest > 0) status = 'engaged';
    next.records[index] = normalizeThreadRecord({ ...record, status, lastSurfacedAt: timestamp(now), cooldownUntilBoundary: boundaryIndex + cooldown, history: [...record.history, { at: timestamp(now), from: record.status, to: status, reason: 'curator-surfaced' }] });
    surfaced.push(item.id);
  }
  next.pacing = {
    ...next.pacing,
    lastSurfacedThreadId: surfaced[0] || next.pacing.lastSurfacedThreadId,
    recentParticipantIds: unique([...
      asArray(next.pacing.recentParticipantIds),
      ...surfaced.flatMap((id) => next.records.find((record) => record.id === id)?.participantIds || [])
    ]).slice(-8)
  };
  if (surfaced.length) next.activationReviews.push(...surfaced.map((id) => ({ id: `activation.${id}.${boundaryIndex}`, threadId: id, status: 'surfaced', at: timestamp(now), rationale: 'Selected by deterministic pacing and bandwidth curator.' })));
  return { ledger: next, surfacedThreadIds: surfaced };
}

export function processCommittedConversation({ state, packageData, conversation, now = null, allowPrivacyReview = false } = {}) {
  const next = cloneJson(state);
  const decayed = decayThreadLedger(next.threadLedger, { packageData, boundaryType: conversation?.boundaryType || 'scene', now });
  let ledger = decayed.ledger;
  const knownActorIds = unique([
    ...asArray(packageData?.world?.actors).map((item) => item.id),
    ...asArray(packageData?.crew?.senior || packageData?.crew?.members || packageData?.crew).map((item) => item.id),
    next.player?.id
  ]);
  const sceneDelta = conversation?.kind === 'directive.sceneDelta'
    ? conversation
    : extractSceneDelta({ ...conversation, committed: true }, { knownActorIds });
  const prefilter = sceneDeltaToThreadCandidates(sceneDelta, { allowPrivacyReview, maxCandidates: 6 });
  const merged = [];
  const created = [];
  for (const candidate of prefilter.candidates) {
    const match = semanticThreadMatch(candidate, ledger.records);
    if (match) {
      const index = ledger.records.findIndex((item) => item.id === match.record.id);
      ledger.records[index] = reinforceRecord(ledger.records[index], candidate, { boundaryIndex: decayed.boundaryIndex, now });
      merged.push({ candidateId: candidate.id, threadId: match.record.id, similarity: match.score });
    } else {
      const record = recordFromCandidate(candidate, { boundaryIndex: decayed.boundaryIndex, now });
      ledger.records.push(record);
      created.push(record.id);
    }
  }
  const closure = closeThreadsFromSceneDelta(ledger, sceneDelta, {
    now,
    commandBearing: next.commandBearing || next.commandStyle,
    closureSignals: sceneDelta?.closureSignals || conversation?.closureSignals || null
  });
  ledger = closure.ledger;
  const curation = curateThreadSurfacing({ ledger, packageData, state: next, scene: { ...conversation, boundaryType: conversation?.boundaryType || 'scene' } });
  const surfaced = applyThreadSurfacing(ledger, curation, { packageData, now });
  ledger = surfaced.ledger;
  next.threadLedger = ledger;
  return {
    state: next,
    sceneDelta,
    candidates: prefilter.candidates,
    rejected: prefilter.rejected,
    createdThreadIds: created,
    mergedThreads: merged,
    surfacedThreadIds: surfaced.surfacedThreadIds,
    decayChanges: decayed.changes,
    threadClosureReviews: closure.reviews,
    commandBearingReviewPlan: closure.commandBearingReviewPlan,
    promotionEligibleThreadIds: eligibleThreadsForPromotion(ledger, packageData).map((item) => item.id)
  };
}

export function eligibleThreadsForPromotion(ledger, packageData) {
  const policy = packageData?.threadTemplates?.generationPolicy || {};
  const minimum = Number(policy.minimumReinforcementForPromotion || 2);
  return asArray(ledger?.records).map(normalizeThreadRecord).filter((item) =>
    ['engaged', 'active'].includes(item.status)
    && (item.reinforcementCount >= minimum || item.playerInterest >= 2)
    && item.playerInterest >= 1
    && !item.promotedQuestId
    && item.metadata?.stale !== true
    && ['professional_dilemma', 'shipboard_maintenance', 'local_civilian_problem', 'promise_debt_or_favor', 'humanitarian_assistance', 'scientific_curiosity', 'interpersonal_relationship', 'recovery_and_aftermath'].includes(item.type)
  );
}

export function closeThreadsFromSceneDelta(ledger, sceneDelta, {
  now = null,
  commandBearing = null,
  closureSignals = null
} = {}) {
  let next = createThreadLedger(ledger);
  const reviews = [];
  for (const closure of asArray(sceneDelta?.threadClosures)) {
    const record = next.records.find((item) => item.id === closure.threadId);
    if (!record) continue;
    const status = closure.transformed ? 'transformed' : closure.resolved === false ? 'dormant' : 'resolved';
    next = transitionThread(next, record.id, status, { now, reason: 'observable-closure', metadata: { summary: closure.summary } });
    reviews.push({ id: `closure.${record.id}.${reviews.length + 1}`, threadId: record.id, status, summary: closure.summary || 'The thread reached a causally supported stopping point.', at: timestamp(now) });
  }
  next.closureReviews.push(...reviews);
  return {
    ledger: next,
    reviews,
    commandBearingReviewPlan: planCommandBearingClosureReviews({
      commandBearing,
      threadClosureReviews: reviews,
      closureSignals
    })
  };
}

export const __threadEngineTestHooks = Object.freeze({ jaccard, recordFromCandidate, reinforceRecord, topicKey, participantOverlap });
