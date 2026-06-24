import { evaluatePredicate } from './predicate-evaluator.mjs';
import { applyQuestLedgerDelta, questInstanceById, transitionQuest } from '../quests/quest-ledger.mjs';
import { applyStoryArcDelta } from '../story/story-arc-director.mjs';
import { applyThreadLedgerDelta } from '../threads/thread-ledger.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function at(now) { return typeof now === 'function' ? now() : (now || new Date().toISOString()); }
function clamp(value, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  return Math.max(Number(min), Math.min(Number(max), Number(value)));
}
function findById(records, id) { return asArray(records).find((entry) => entry?.id === id); }
function upsert(records, record) {
  const next = asArray(records).map(cloneJson);
  const index = next.findIndex((entry) => entry?.id === record.id);
  if (index < 0) next.push(cloneJson(record)); else next[index] = { ...next[index], ...cloneJson(record) };
  return next;
}
function unique(values) { return [...new Set(asArray(values).filter(Boolean))]; }
function token(value) { return String(value ?? '').replaceAll(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96); }

/**
 * Normalizes both the pre-open-world journal and the schema-v2 journal. This is
 * intentionally idempotent so every event entry point can protect itself even
 * when a caller supplies an uninitialized projection.
 */
export function normalizeEventLedger(ledger = {}) {
  const committedEvents = asArray(ledger.committedEvents).length
    ? ledger.committedEvents
    : asArray(ledger.events);
  const reactionHistory = asArray(ledger.reactionHistory);
  const nextSequence = Math.max(
    Number(ledger.nextSequence || 1),
    committedEvents.reduce((max, event) => Math.max(max, Number(event?.sequence || 0) + 1), 1)
  );
  return {
    schemaVersion: 2,
    nextSequence,
    committedEvents: committedEvents.map(cloneJson),
    pendingReactions: asArray(ledger.pendingReactions).map(cloneJson),
    reactionHistory: reactionHistory.map(cloneJson),
    invalidatedEventIds: unique(ledger.invalidatedEventIds),
    lastCommittedEventId: ledger.lastCommittedEventId || committedEvents.at(-1)?.id || null
  };
}

export function ensureOpenWorldLedgers(state = {}) {
  const next = state;
  next.eventLedger = normalizeEventLedger(next.eventLedger);
  next.knowledgeLedger = {
    schemaVersion: 2,
    facts: asArray(next.knowledgeLedger?.facts).map(cloneJson),
    rumors: asArray(next.knowledgeLedger?.rumors).map(cloneJson),
    contradictions: asArray(next.knowledgeLedger?.contradictions).map(cloneJson)
  };
  next.attentionState = {
    schemaVersion: 2,
    mode: next.attentionState?.mode || 'open-operations',
    foregroundQuestId: next.attentionState?.foregroundQuestId || null,
    foregroundThreadId: next.attentionState?.foregroundThreadId || null,
    primaryPressureId: next.attentionState?.primaryPressureId || null,
    scene: cloneJson(next.attentionState?.scene || null),
    flags: asArray(next.attentionState?.flags).map(cloneJson),
    ...cloneJson(next.attentionState || {})
  };
  if (!next.campaignAssets || Array.isArray(next.campaignAssets)) {
    next.campaignAssets = { records: asArray(next.campaignAssets).map(cloneJson) };
  } else {
    next.campaignAssets = { ...cloneJson(next.campaignAssets), records: asArray(next.campaignAssets.records || next.campaignAssets.assets).map(cloneJson) };
  }
  if (!next.campaignTracks || Array.isArray(next.campaignTracks)) {
    next.campaignTracks = { records: asArray(next.campaignTracks).map(cloneJson) };
  } else {
    next.campaignTracks = { ...cloneJson(next.campaignTracks), records: asArray(next.campaignTracks.records || next.campaignTracks.tracks).map(cloneJson) };
  }
  if (!next.pressureLedger) next.pressureLedger = { records: [], candidateReviews: [], rawValuesHidden: true };
  if (!next.runtimeTracking) next.runtimeTracking = { schemaVersion: 2, revision: 0 };
  return next;
}

function normalizeEvent(event, state, boundaryType = null, now = null) {
  if (!event?.type) throw new Error('World event requires type.');
  const ledger = normalizeEventLedger(state?.eventLedger);
  const sequence = Number(event.sequence || ledger.nextSequence || 1);
  const stardate = event.stardate ?? state?.worldState?.currentStardate ?? state?.campaign?.currentStardate ?? null;
  const eventId = event.id || `event.${token(event.type)}.${sequence}`;
  const anchorRange = cloneJson(event.sourceAnchorRange || event.anchorRange || event.provenance?.anchorRange || null);
  return {
    id: eventId,
    sequence,
    type: event.type,
    status: event.status || 'committed',
    invalidated: event.invalidated === true,
    invalidatedAt: event.invalidatedAt || null,
    invalidationReason: event.invalidationReason || null,
    boundaryType: event.boundaryType || event.boundary || boundaryType || 'manual',
    stardate,
    committedAt: event.committedAt || at(now),
    committedRevision: Number(event.committedRevision ?? state?.runtimeTracking?.revision ?? 0),
    sourceQuestId: event.sourceQuestId || null,
    sourceOutcomeId: event.sourceOutcomeId || null,
    sourceThreadId: event.sourceThreadId || null,
    sourceRunId: event.sourceRunId || event.reconciliationRunId || null,
    sourceAnchorRange: anchorRange,
    sourceMessageIds: unique(event.sourceMessageIds || event.provenance?.messageIds),
    causalParentIds: unique(event.causalParentIds || event.parentEventIds || [event.causalParentId].filter(Boolean)),
    actorIds: unique(event.actorIds),
    factionIds: unique(event.factionIds),
    locationIds: unique(event.locationIds),
    tags: unique(event.tags),
    payload: cloneJson(event.payload || {}),
    playerFacingSummary: String(event.playerFacingSummary || '').trim(),
    directorSummary: String(event.directorSummary || '').trim(),
    provenance: cloneJson(event.provenance || {})
  };
}

function activeEvent(state, id) {
  const event = asArray(state?.eventLedger?.committedEvents).find((entry) => entry?.id === id);
  return event && !event.invalidated && !asArray(state?.eventLedger?.invalidatedEventIds).includes(id) ? event : null;
}

function nextEventSequence(state) {
  const value = Number(state.eventLedger.nextSequence || 1);
  state.eventLedger.nextSequence = value + 1;
  return value;
}

function effectEventId(ruleId, event, index) {
  return `event.reaction.${token(ruleId)}.${token(event.id)}.${index}`;
}

function setQuestStatus(state, effect, context) {
  const instance = questInstanceById(state.questLedger, effect.questId);
  if (!instance) throw new Error(`Reaction references unknown quest "${effect.questId}".`);
  if (instance.status === effect.status) return;
  state.questLedger = transitionQuest(state.questLedger, instance.id, effect.status, {
    now: context.now,
    reason: effect.reason || `reaction:${context.rule.id}`,
    assignedActorIds: effect.assignedActorIds,
    metadata: { sourceEventId: context.event.id, reactionRuleId: context.rule.id }
  });
}

const PAYLOAD_EFFECT_ALLOWLIST = new Set([
  'adjustClock', 'setClock', 'adjustTrack', 'setTrack', 'advanceFront', 'setFrontStage',
  'setFactionPosture', 'setActorState', 'setLocationState', 'setCurrentLocation', 'revealLocation',
  'addFact', 'addRumor', 'grantAsset', 'addPressure', 'setQuestStatus', 'questDelta',
  'addQuestFlag', 'storyArcDelta', 'revealLead', 'updateEndingAxis', 'threadDelta',
  'seedThread', 'setAttention', 'addAttentionFlag'
]);

function applyPayloadEffects(state, effect, context, emittedEvents, depth) {
  if (depth >= 3) throw new Error('Nested world-effect payload exceeded the maximum depth.');
  const effects = asArray(context.event?.payload?.worldEffects || context.event?.payload?.effects);
  for (const payloadEffect of effects.slice(0, 24)) {
    if (!PAYLOAD_EFFECT_ALLOWLIST.has(payloadEffect?.type)) {
      throw new Error(`Event payload contains unauthorized world effect "${payloadEffect?.type}".`);
    }
    applyEffect(state, payloadEffect, context, emittedEvents, depth + 1);
  }
}

function applyEffect(state, effect, context, emittedEvents, depth = 0) {
  if (!effect?.type) throw new Error('Reaction effect requires type.');
  const stardate = state.worldState?.currentStardate ?? state.campaign?.currentStardate ?? null;
  switch (effect.type) {
    case 'adjustClock': {
      const clock = findById(state.worldState?.clocks, effect.clockId);
      if (!clock) throw new Error(`Reaction references unknown clock "${effect.clockId}".`);
      clock.value = clamp(Number(clock.value || 0) + Number(effect.amount || 0), clock.min ?? 0, clock.max ?? Number.POSITIVE_INFINITY);
      clock.lastReason = effect.reason || context.event.type;
      clock.lastUpdatedAt = stardate;
      break;
    }
    case 'setClock': {
      const clock = findById(state.worldState?.clocks, effect.clockId);
      if (!clock) throw new Error(`Reaction references unknown clock "${effect.clockId}".`);
      clock.value = clamp(Number(effect.value), clock.min ?? 0, clock.max ?? Number.POSITIVE_INFINITY);
      clock.lastReason = effect.reason || context.event.type;
      clock.lastUpdatedAt = stardate;
      break;
    }
    case 'adjustTrack': {
      const track = findById(state.worldState?.tracks || state.campaignTracks?.records, effect.trackId);
      if (!track) throw new Error(`Reaction references unknown track "${effect.trackId}".`);
      track.value = clamp(Number(track.value || 0) + Number(effect.amount || 0), track.min ?? Number.NEGATIVE_INFINITY, track.max ?? Number.POSITIVE_INFINITY);
      track.lastReason = effect.reason || context.event.type;
      track.lastUpdatedAt = stardate;
      break;
    }
    case 'setTrack': {
      const track = findById(state.worldState?.tracks || state.campaignTracks?.records, effect.trackId);
      if (!track) throw new Error(`Reaction references unknown track "${effect.trackId}".`);
      track.value = clamp(Number(effect.value), track.min ?? Number.NEGATIVE_INFINITY, track.max ?? Number.POSITIVE_INFINITY);
      track.lastReason = effect.reason || context.event.type;
      track.lastUpdatedAt = stardate;
      break;
    }
    case 'advanceFront':
    case 'setFrontStage': {
      const front = findById(state.worldState?.fronts, effect.frontId);
      if (!front) throw new Error(`Reaction references unknown front "${effect.frontId}".`);
      if (effect.stageId || effect.stage) front.stage = effect.stageId || effect.stage;
      if (effect.amount !== undefined) front.value = Number(front.value || 0) + Number(effect.amount);
      if (effect.status) front.status = effect.status;
      front.lastAdvancedAt = stardate;
      front.lastReason = effect.reason || context.event.type;
      front.history = [...asArray(front.history), { stardate, eventId: context.event.id, stage: front.stage, value: front.value }];
      break;
    }
    case 'setFactionPosture': {
      const faction = findById(state.worldState?.factions, effect.factionId);
      if (!faction) throw new Error(`Reaction references unknown faction "${effect.factionId}".`);
      faction.posture = effect.posture;
      if (effect.status) faction.status = effect.status;
      faction.history = [...asArray(faction.history), { stardate, eventId: context.event.id, posture: effect.posture }];
      break;
    }
    case 'setActorState': {
      const actor = findById(state.worldState?.actors, effect.actorId);
      if (!actor) throw new Error(`Reaction references unknown actor "${effect.actorId}".`);
      Object.assign(actor, cloneJson(effect.patch || {}));
      actor.history = [...asArray(actor.history), { stardate, eventId: context.event.id, patch: cloneJson(effect.patch || {}) }];
      break;
    }
    case 'setLocationState': {
      const location = findById(state.worldState?.locations, effect.locationId);
      if (!location) throw new Error(`Reaction references unknown location "${effect.locationId}".`);
      Object.assign(location, cloneJson(effect.patch || {}));
      location.history = [...asArray(location.history), { stardate, eventId: context.event.id, patch: cloneJson(effect.patch || {}) }];
      break;
    }
    case 'setCurrentLocation': {
      const location = findById(state.worldState?.locations, effect.locationId);
      if (!location) throw new Error(`Reaction references unknown location "${effect.locationId}".`);
      state.worldState.currentLocationId = effect.locationId;
      state.worldState.visitedLocationIds = unique([...asArray(state.worldState.visitedLocationIds), effect.locationId]);
      location.discovered = true;
      location.lastVisitedStardate = stardate;
      location.history = [...asArray(location.history), { type: 'reaction-relocation', stardate, eventId: context.event.id }];
      break;
    }
    case 'revealLocation': {
      const location = findById(state.worldState?.locations, effect.locationId);
      if (!location) throw new Error(`Reaction references unknown location "${effect.locationId}".`);
      location.discovered = true;
      break;
    }
    case 'addFact': {
      const fact = { ...cloneJson(effect.fact || {}), id: effect.fact?.id || effect.factId };
      if (!fact.id) throw new Error('addFact reaction requires fact.id.');
      const previous = findById(state.knowledgeLedger.facts, fact.id);
      state.knowledgeLedger.facts = upsert(state.knowledgeLedger.facts, {
        ...previous,
        ...fact,
        known: fact.known !== false,
        discoveredAt: fact.discoveredAt ?? stardate,
        sourceEventIds: unique([...asArray(previous?.sourceEventIds), context.event.id]),
        sourceAnchorRanges: [...asArray(previous?.sourceAnchorRanges), ...(context.event.sourceAnchorRange ? [cloneJson(context.event.sourceAnchorRange)] : [])]
      });
      break;
    }
    case 'addRumor': {
      const rumor = { ...cloneJson(effect.rumor || {}), id: effect.rumor?.id || effect.rumorId };
      if (!rumor.id) throw new Error('addRumor reaction requires rumor.id.');
      const previous = findById(state.knowledgeLedger.rumors, rumor.id);
      state.knowledgeLedger.rumors = upsert(state.knowledgeLedger.rumors, {
        ...previous,
        ...rumor,
        heardAt: rumor.heardAt ?? stardate,
        sourceEventIds: unique([...asArray(previous?.sourceEventIds), context.event.id])
      });
      break;
    }
    case 'grantAsset': {
      const assetId = effect.assetId || effect.asset?.id;
      if (!assetId) throw new Error('grantAsset reaction requires assetId.');
      const previous = findById(state.campaignAssets.records, assetId);
      state.campaignAssets.records = upsert(state.campaignAssets.records, {
        ...previous,
        ...cloneJson(effect.asset || {}),
        id: assetId,
        status: effect.status || effect.asset?.status || 'earned',
        earnedAt: effect.earnedAt ?? stardate,
        sourceEventIds: unique([...asArray(previous?.sourceEventIds), context.event.id])
      });
      break;
    }
    case 'addPressure': {
      const pressure = { ...cloneJson(effect.pressure || {}), id: effect.pressure?.id || effect.pressureId };
      if (!pressure.id) throw new Error('addPressure reaction requires pressure.id.');
      const previous = findById(state.pressureLedger.records, pressure.id);
      state.pressureLedger.records = upsert(state.pressureLedger.records, {
        ...previous,
        ...pressure,
        status: pressure.status || 'active',
        sourceEventIds: unique([...asArray(previous?.sourceEventIds), context.event.id])
      });
      break;
    }
    case 'setQuestStatus':
      setQuestStatus(state, effect, context);
      break;
    case 'questDelta':
      state.questLedger = applyQuestLedgerDelta(state.questLedger, effect.delta || {}, { now: context.now });
      break;
    case 'addQuestFlag':
      state.questLedger = applyQuestLedgerDelta(state.questLedger, { flagsAdd: [effect.flag || { id: effect.flagId, value: effect.value ?? true }] }, { now: context.now });
      break;
    case 'storyArcDelta':
      state.storyArcLedger = applyStoryArcDelta(state.storyArcLedger, effect.delta || {});
      break;
    case 'revealLead':
      state.storyArcLedger = applyStoryArcDelta(state.storyArcLedger, { revealedLeadIdsAdd: [effect.leadId] });
      break;
    case 'updateEndingAxis':
      state.storyArcLedger = applyStoryArcDelta(state.storyArcLedger, { endingAxisUpdates: [{ id: effect.axisId, state: effect.state, evidence: [context.event.id] }] });
      break;
    case 'threadDelta':
      state.threadLedger = applyThreadLedgerDelta(state.threadLedger, effect.delta || {});
      break;
    case 'seedThread':
      state.threadLedger = applyThreadLedgerDelta(state.threadLedger, { upsertRecords: [effect.thread] });
      break;
    case 'setAttention':
      Object.assign(state.attentionState, cloneJson(effect.patch || {}));
      break;
    case 'addAttentionFlag': {
      const flag = effect.flag || { id: effect.flagId, value: effect.value ?? true };
      state.attentionState.flags = upsert(state.attentionState.flags, flag);
      break;
    }
    case 'applyEventPayloadEffects':
      applyPayloadEffects(state, effect, context, emittedEvents, depth);
      break;
    case 'emitEvent': {
      const emitted = normalizeEvent({
        ...cloneJson(effect.event || {}),
        id: effect.event?.id || effectEventId(context.rule.id, context.event, emittedEvents.length),
        type: effect.event?.type || effect.eventType,
        sourceQuestId: effect.event?.sourceQuestId || context.event.sourceQuestId,
        sourceOutcomeId: effect.event?.sourceOutcomeId || context.event.sourceOutcomeId,
        sourceThreadId: effect.event?.sourceThreadId || context.event.sourceThreadId,
        sourceAnchorRange: effect.event?.sourceAnchorRange || context.event.sourceAnchorRange,
        causalParentIds: unique([context.event.id, ...asArray(effect.event?.causalParentIds)])
      }, state, context.boundaryType, context.now);
      emitted.sequence = nextEventSequence(state);
      emittedEvents.push(emitted);
      break;
    }
    default:
      throw new Error(`Unsupported reaction effect type "${effect.type}".`);
  }
}

function cooldownAllows(state, rule, event) {
  const history = asArray(state?.eventLedger?.reactionHistory).filter((entry) => entry.ruleId === rule.id && entry.invalidated !== true);
  if (!history.length) return true;
  if (rule.cooldown?.once === true) return false;
  if (rule.cooldown?.perEvent === true && history.some((entry) => entry.sourceEventId === event.id)) return false;
  const current = Number(event.stardate ?? state?.worldState?.currentStardate ?? 0);
  const last = Number(history.at(-1)?.stardate ?? 0);
  if (Number(rule.cooldown?.stardate || 0) > 0 && current - last < Number(rule.cooldown.stardate)) return false;
  const eventCount = Number(rule.cooldown?.events || 0);
  if (eventCount > 0 && asArray(state.eventLedger.committedEvents).length - Number(history.at(-1)?.eventIndex || 0) < eventCount) return false;
  return true;
}

function ruleListens(rule, event, boundaryType) {
  if (event.invalidated === true) return false;
  const types = asArray(rule.listensFor);
  const boundaries = asArray(rule.boundaryTypes);
  return (types.length === 0 || types.includes('*') || types.includes(event.type) || types.includes(event.id))
    && (boundaries.length === 0 || boundaries.includes(boundaryType));
}

function rulesFrom(packageData) {
  if (Array.isArray(packageData?.reactionRules)) return packageData.reactionRules;
  return asArray(packageData?.reactionRules?.rules).slice().sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
}

export function commitWorldEvent(state, event, { boundaryType = null, now = null } = {}) {
  const next = ensureOpenWorldLedgers(cloneJson(state));
  const existing = event?.id ? activeEvent(next, event.id) : null;
  if (existing) return { state: next, event: cloneJson(existing), duplicate: true };
  const normalized = normalizeEvent(event, next, boundaryType, now);
  normalized.sequence = nextEventSequence(next);
  next.eventLedger.committedEvents.push(normalized);
  next.eventLedger.lastCommittedEventId = normalized.id;
  return { state: next, event: normalized, duplicate: false };
}

export function applyReactionRules(state, {
  packageData,
  event,
  boundaryType = null,
  now = null,
  maxCascade = 24
} = {}) {
  let next = ensureOpenWorldLedgers(cloneJson(state));
  let initial = event?.id ? activeEvent(next, event.id) : null;
  if (!initial) {
    initial = normalizeEvent(event, next, boundaryType, now);
    initial.sequence = nextEventSequence(next);
    next.eventLedger.committedEvents.push(initial);
    next.eventLedger.lastCommittedEventId = initial.id;
  }
  const queue = [initial];
  const fired = [];
  const emitted = [];
  const errors = [];
  let processed = 0;

  while (queue.length && processed < maxCascade) {
    const currentEvent = queue.shift();
    const currentBoundary = currentEvent.boundaryType || boundaryType || 'manual';
    if (currentEvent.invalidated === true || asArray(next.eventLedger.invalidatedEventIds).includes(currentEvent.id)) {
      processed += 1;
      continue;
    }
    for (const rule of rulesFrom(packageData)) {
      if (!ruleListens(rule, currentEvent, currentBoundary)) continue;
      if (!cooldownAllows(next, rule, currentEvent)) continue;
      if (!evaluatePredicate(rule.conditions ?? rule.when, next).pass) continue;
      const generated = [];
      try {
        for (const effect of asArray(rule.effects)) {
          applyEffect(next, effect, { event: currentEvent, rule, boundaryType: currentBoundary, now }, generated);
        }
        const historyEntry = {
          id: `reaction.${token(rule.id)}.${token(currentEvent.id)}`,
          ruleId: rule.id,
          sourceEventId: currentEvent.id,
          boundaryType: currentBoundary,
          stardate: currentEvent.stardate,
          firedAt: at(now),
          eventIndex: next.eventLedger.committedEvents.length,
          playerFacingSummary: rule.playerFacingSummary || '',
          sourceAnchorRange: cloneJson(currentEvent.sourceAnchorRange || null),
          invalidated: false
        };
        next.eventLedger.reactionHistory.push(historyEntry);
        fired.push(historyEntry);
        for (const emittedEvent of generated) {
          if (!activeEvent(next, emittedEvent.id)) {
            next.eventLedger.committedEvents.push(emittedEvent);
            next.eventLedger.lastCommittedEventId = emittedEvent.id;
          }
        }
        emitted.push(...generated);
        queue.push(...generated);
      } catch (error) {
        const pending = {
          id: `pending-reaction.${token(rule.id)}.${token(currentEvent.id)}`,
          ruleId: rule.id,
          sourceEventId: currentEvent.id,
          status: 'error',
          reason: 'effect-validation-failed',
          error: String(error?.message || error),
          createdAt: at(now),
          sourceAnchorRange: cloneJson(currentEvent.sourceAnchorRange || null)
        };
        next.eventLedger.pendingReactions = upsert(next.eventLedger.pendingReactions, pending);
        errors.push(pending);
      }
    }
    processed += 1;
  }

  if (queue.length) {
    for (const pendingEvent of queue) {
      next.eventLedger.pendingReactions.push({
        id: `pending-reaction.cascade.${token(pendingEvent.id)}`,
        event: cloneJson(pendingEvent),
        status: 'pending',
        reason: 'cascade-limit',
        createdAt: at(now)
      });
    }
  }
  return {
    state: next,
    fired,
    emittedEvents: emitted,
    errors,
    diagnostics: { processedEvents: processed, cascadeLimitReached: queue.length > 0, errorCount: errors.length }
  };
}

/**
 * Marks causal products of an edited/reconciled passage stale without deleting
 * audit history. Callers can then replay from a pre-outcome snapshot or apply a
 * reviewed reconciliation proposal.
 */
export function invalidateEventsByAnchorRange(state, anchorRange, {
  reason = 'source-passage-changed',
  now = null,
  outcomeIds = [],
  eventIds = []
} = {}) {
  const next = ensureOpenWorldLedgers(cloneJson(state));
  const rangeHash = anchorRange?.rangeHash || null;
  const outcomes = new Set(asArray(outcomeIds));
  const explicit = new Set(asArray(eventIds));
  const invalidated = [];
  for (const event of next.eventLedger.committedEvents) {
    const matchesRange = rangeHash && event.sourceAnchorRange?.rangeHash === rangeHash;
    const matchesOutcome = event.sourceOutcomeId && outcomes.has(event.sourceOutcomeId);
    const matchesEvent = explicit.has(event.id);
    if (!matchesRange && !matchesOutcome && !matchesEvent) continue;
    event.invalidated = true;
    event.status = 'invalidated';
    event.invalidatedAt = at(now);
    event.invalidationReason = reason;
    invalidated.push(event.id);
  }
  next.eventLedger.invalidatedEventIds = unique([...next.eventLedger.invalidatedEventIds, ...invalidated]);
  for (const entry of next.eventLedger.reactionHistory) {
    if (invalidated.includes(entry.sourceEventId)) {
      entry.invalidated = true;
      entry.invalidatedAt = at(now);
      entry.invalidationReason = reason;
    }
  }
  if (invalidated.length) {
    next.runtimeTracking.sceneReconciliation = next.runtimeTracking.sceneReconciliation || {};
    next.runtimeTracking.sceneReconciliation.invalidations = [
      ...asArray(next.runtimeTracking.sceneReconciliation.invalidations),
      { id: `event-invalidation.${token(at(now))}`, rangeHash, eventIds: invalidated, reason, at: at(now) }
    ];
  }
  return { state: next, invalidatedEventIds: invalidated };
}

export const __reactionEngineTestHooks = Object.freeze({
  normalizeEvent,
  ruleListens,
  cooldownAllows,
  applyEffect,
  rulesFrom,
  activeEvent
});
