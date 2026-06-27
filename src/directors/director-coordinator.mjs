import { createQuestLedger, normalizeDynamicQuestCatalog, reconcileQuestAvailability } from '../quests/quest-ledger.mjs';
import {
  activateQuest,
  completeQuest,
  createOpenOperationsMissionState,
  processDelegatedQuests,
  processQuestLifecycle,
  rankQuestOpportunities
} from '../quests/quest-director.mjs';
import { createStoryArcLedger, evaluateMilestones } from '../story/story-arc-director.mjs';
import { createThreadLedger, invalidateThreadEvidenceByAnchorRange } from '../threads/thread-ledger.mjs';
import {
  applyReactionRules,
  commitWorldEvent,
  ensureOpenWorldLedgers,
  invalidateEventsByAnchorRange,
  normalizeEventLedger
} from '../world/reaction-engine.mjs';
import { applyTravel, advanceWorldTime, createWorldState } from '../world/world-director.mjs';
import {
  appendCampaignTimeLedgerEntry,
  normalizeCampaignTimeState
} from '../time/campaign-time-state.mjs';
import {
  buildCampaignReplyHeader,
  resolveCampaignMinuteOfDay
} from '../time/campaign-time-header.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function nowValue(now) { return typeof now === 'function' ? now() : (now || new Date().toISOString()); }
function token(value) { return String(value ?? '').replaceAll(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96); }
function unique(values) { return [...new Set(asArray(values).filter(Boolean))]; }

function reconciliationLedger(value = {}) {
  return {
    schemaVersion: 2,
    markers: { start: cloneJson(value.markers?.start || null), end: cloneJson(value.markers?.end || null) },
    runs: asArray(value.runs).map(cloneJson),
    pending: asArray(value.pending).map(cloneJson),
    applied: asArray(value.applied).map(cloneJson),
    rejected: asArray(value.rejected).map(cloneJson),
    recalculationPreviews: asArray(value.recalculationPreviews).map(cloneJson),
    chunkCache: asArray(value.chunkCache).map(cloneJson),
    invalidations: asArray(value.invalidations).map(cloneJson),
    lastRunId: value.lastRunId || null,
    lastResult: cloneJson(value.lastResult || null)
  };
}

export function initializeOpenWorldCampaignState({ packageData, baseState = {}, now = null, reconcileAvailability = true } = {}) {
  if (!packageData?.world || !packageData?.questTemplates || !packageData?.storyArcs) {
    throw new Error('Open-world initialization requires world, questTemplates, and storyArcs.');
  }
  let state = ensureOpenWorldLedgers(cloneJson(baseState));
  state.dynamicQuestCatalog = normalizeDynamicQuestCatalog(state.dynamicQuestCatalog);
  state.worldState = state.worldState || createWorldState(packageData.world, { openingStardate: packageData.storyArcs.campaign.openingStardate });
  state.worldState.schemaVersion = 2;
  state.eventLedger = normalizeEventLedger(state.eventLedger);
  state.threadLedger = state.threadLedger?.records ? createThreadLedger(state.threadLedger) : createThreadLedger();
  state.storyArcLedger = state.storyArcLedger || createStoryArcLedger(packageData);
  state.questLedger = state.questLedger?.instances ? cloneJson(state.questLedger) : createQuestLedger({
    questTemplates: packageData.questTemplates,
    campaignState: state,
    now,
    statusOverrides: { 'prelude-a-ship-underway': 'active' }
  });
  if (reconcileAvailability) {
    const availability = reconcileQuestAvailability(state.questLedger, packageData, state, { now });
    state.questLedger = availability.ledger;
  }
  state.attentionState = state.attentionState || {
    schemaVersion: 2,
    mode: 'guided-onboarding',
    foregroundQuestId: state.questLedger.foregroundQuestId || 'prelude-a-ship-underway',
    questFocusStack: [],
    foregroundThreadId: null,
    primaryPressureId: null,
    scene: { questId: 'prelude-a-ship-underway', phaseId: 'shuttle-rendezvous', phaseLabel: 'Shuttle Rendezvous', locationId: state.worldState.currentLocationId },
    flags: []
  };
  state.attentionState.schemaVersion = 2;
  state.attentionState.questFocusStack = Array.isArray(state.attentionState.questFocusStack)
    ? [...new Set(state.attentionState.questFocusStack.filter(Boolean))]
    : [];
  if (!state.runtimeTracking) state.runtimeTracking = { schemaVersion: 2, revision: 0 };
  state.runtimeTracking.schemaVersion = 2;
  state.runtimeTracking.revision = Number(state.runtimeTracking.revision || 0);
  state.runtimeTracking.sceneReconciliation = reconciliationLedger(state.runtimeTracking.sceneReconciliation);
  if (!state.mission || state.mission.openWorldManaged !== true) state.mission = createOpenOperationsMissionState(state);
  state.campaign = {
    ...(state.campaign || {}),
    templateCampaignId: packageData.storyArcs.campaign.id,
    title: packageData.storyArcs.campaign.title,
    openingStardate: packageData.storyArcs.campaign.openingStardate,
    currentStardate: state.worldState.currentStardate,
    openingYear: packageData.storyArcs.campaign.openingYear,
    theater: packageData.storyArcs.campaign.theater,
    saveSchemaVersion: 2
  };
  const selectedForegroundId = state.questLedger.foregroundQuestId || state.attentionState?.foregroundQuestId || null;
  const prelude = state.questLedger.instances.find((instance) => instance.id === 'prelude-a-ship-underway');
  if (!selectedForegroundId && prelude && prelude.status === 'active') {
    state = activateQuest(state, packageData, prelude.id, { now, reason: 'campaign-initialization' });
  } else if (selectedForegroundId && (
    state.attentionState?.foregroundQuestId !== selectedForegroundId
    || state.mission?.activeMissionId !== selectedForegroundId
  )) {
    // Initialization may repair inconsistent projections, but it must never
    // replace a deliberately selected side quest with the still-active main
    // quest. Active and foreground are distinct concepts in the open world.
    state = activateQuest(state, packageData, selectedForegroundId, { now, reason: 'campaign-foreground-sync' });
  }
  return state;
}

function synchronizeCampaignClock(state) {
  if (state.campaign && state.worldState) state.campaign.currentStardate = state.worldState.currentStardate;
  return state;
}

function synchronizeCampaignTimeState(state, packageData, now = null) {
  return normalizeCampaignTimeState(state, {
    projection: null,
    now,
    reason: 'open-world-boundary'
  }).campaignState || state;
}

function commitAndReact(state, packageData, event, boundaryType, now) {
  const committed = commitWorldEvent(state, { ...event, boundaryType }, { boundaryType, now });
  const reactions = applyReactionRules(committed.state, { packageData, event: committed.event, boundaryType, now });
  return { state: reactions.state, event: committed.event, reactions };
}

/**
 * One bounded open-world transaction boundary. The ordering is intentional:
 * committed event -> reactions -> delegated work -> lifecycle -> milestones ->
 * availability. Every derived event retains the original anchor range so a
 * later Scene Reconciliation can invalidate or replay the causal chain.
 */
export function processWorldBoundary({
  state,
  packageData,
  event,
  boundaryType = 'scene',
  now = null,
  processDelegation = true
} = {}) {
  let current = initializeOpenWorldCampaignState({ packageData, baseState: state, now, reconcileAvailability: false });
  const allEvents = [];
  const allReactions = [];
  const emittedEvents = [];
  const errors = [];

  const primary = commitAndReact(current, packageData, event, boundaryType, now);
  current = primary.state;
  allEvents.push(primary.event);
  allReactions.push(...primary.reactions.fired);
  emittedEvents.push(...primary.reactions.emittedEvents);
  errors.push(...primary.reactions.errors);

  if (processDelegation && ['scene', 'travel', 'time-advance', 'rest', 'quest-resolution', 'reconciliation-accepted'].includes(boundaryType)) {
    const delegation = processDelegatedQuests(current, packageData, { boundaryType, now });
    current = delegation.state;
    for (const delegatedEvent of delegation.events) {
      const result = commitAndReact(current, packageData, {
        ...delegatedEvent,
        causalParentIds: unique([primary.event.id, ...asArray(delegatedEvent.causalParentIds)]),
        sourceAnchorRange: delegatedEvent.sourceAnchorRange || primary.event.sourceAnchorRange
      }, 'delegation', now);
      current = result.state;
      allEvents.push(result.event);
      allReactions.push(...result.reactions.fired);
      emittedEvents.push(...result.reactions.emittedEvents);
      errors.push(...result.reactions.errors);
    }
  }

  const lifecycle = processQuestLifecycle(current, packageData, { now });
  current = lifecycle.state;
  for (const lifecycleEvent of lifecycle.events) {
    const result = commitAndReact(current, packageData, {
      ...lifecycleEvent,
      causalParentIds: unique([primary.event.id, ...asArray(lifecycleEvent.causalParentIds)]),
      sourceAnchorRange: lifecycleEvent.sourceAnchorRange || primary.event.sourceAnchorRange
    }, 'quest-lifecycle', now);
    current = result.state;
    allEvents.push(result.event);
    allReactions.push(...result.reactions.fired);
    emittedEvents.push(...result.reactions.emittedEvents);
    errors.push(...result.reactions.errors);
  }

  const milestoneResult = evaluateMilestones(current.storyArcLedger, {
    packageData,
    state: current,
    sourceEventId: primary.event.id
  });
  current.storyArcLedger = milestoneResult.ledger;
  const availabilityResult = reconcileQuestAvailability(current.questLedger, packageData, current, { now });
  current.questLedger = availabilityResult.ledger;
  current = synchronizeCampaignClock(current);
  current.runtimeTracking.lastWorldBoundary = {
    id: `boundary.${token(primary.event.id)}`,
    type: boundaryType,
    sourceEventId: primary.event.id,
    sourceAnchorRange: cloneJson(primary.event.sourceAnchorRange || null),
    completedAt: nowValue(now),
    eventIds: allEvents.map((item) => item.id),
    reactionIds: allReactions.map((item) => item.id)
  };
  return {
    state: current,
    event: primary.event,
    events: allEvents,
    reactions: allReactions,
    emittedEvents,
    milestoneChanges: { completed: milestoneResult.completed, unlocked: milestoneResult.unlocked },
    questAvailabilityChanges: [...availabilityResult.changes, ...lifecycle.changes],
    questTransformations: lifecycle.transformations,
    errors,
    diagnostics: {
      processedEvents: allEvents.length,
      reactionCount: allReactions.length,
      errorCount: errors.length,
      boundaryType
    }
  };
}

export function resolveQuestBoundary({ state, packageData, questId, outcomeId = null, outcomeKey = null, sourceAnchorRange = null, now = null } = {}) {
  const completion = completeQuest(state, packageData, questId, { outcomeId, outcomeKey, now });
  let current = completion.state;
  const boundaryResults = [];
  const events = completion.events.length ? completion.events : [{
    id: `event.quest.${questId}.resolved.${outcomeId || 'system'}`,
    type: `quest.${questId}.resolved`,
    sourceQuestId: questId,
    sourceOutcomeId: outcomeId,
    sourceAnchorRange,
    payload: { outcomeKey },
    playerFacingSummary: `${questId} was resolved.`
  }];
  for (const rawEvent of events) {
    const result = processWorldBoundary({
      state: current,
      packageData,
      event: { ...rawEvent, sourceAnchorRange: rawEvent.sourceAnchorRange || sourceAnchorRange },
      boundaryType: 'quest-resolution',
      now,
      processDelegation: false
    });
    current = result.state;
    boundaryResults.push(result);
  }
  return { state: current, events, boundaryResults, outcome: completion.outcome };
}

export function travelBoundary({ state, packageData, destinationId, sourceAnchorRange = null, now = null } = {}) {
  const previousStardate = Number(state.worldState?.currentStardate || state.campaign?.currentStardate || 0);
  const previousShipMinute = resolveCampaignMinuteOfDay(state);
  const previousHeader = buildCampaignReplyHeader(state);
  const travel = applyTravel({ world: packageData.world, worldState: state.worldState, destinationId, campaignState: state, now });
  const next = cloneJson(state);
  next.worldState = travel.worldState;
  next.attentionState = { ...(next.attentionState || {}), mode: next.questLedger?.foregroundQuestId ? 'quest' : 'open-operations' };
  const result = processWorldBoundary({ state: next, packageData, event: { ...travel.event, sourceAnchorRange }, boundaryType: 'travel', now });
  result.state = synchronizeCampaignTimeState(result.state, packageData, now);
  result.state = appendCampaignTimeLedgerEntry(result.state, {
    id: `${travel.event.id}:time`,
    type: 'travel',
    reason: 'travel',
    elapsedMinutes: Math.round(Number(travel.event.payload?.travelHours || 0) * 60),
    previousStardate,
    previousShipMinute,
    previousHeader,
    currentHeader: buildCampaignReplyHeader(result.state),
    source: 'worldDirector',
    sourceAnchorRange,
    sourceEventId: travel.event.id
  }, { now });
  return result;
}

export function timeAdvanceBoundary({ state, packageData, hours, minutes = null, reason = 'downtime', sourceAnchorRange = null, now = null, adjudication = null } = {}) {
  const previousStardate = Number(state.worldState?.currentStardate || state.campaign?.currentStardate || 0);
  const previousShipMinute = resolveCampaignMinuteOfDay(state);
  const previousHeader = buildCampaignReplyHeader(state);
  const advanced = advanceWorldTime({ world: packageData.world, worldState: state.worldState, hours, minutes, reason, now });
  const next = cloneJson(state);
  next.worldState = advanced.worldState;
  const result = processWorldBoundary({ state: next, packageData, event: { ...advanced.event, sourceAnchorRange }, boundaryType: reason === 'rest' ? 'rest' : 'time-advance', now });
  result.state = synchronizeCampaignTimeState(result.state, packageData, now);
  result.state = appendCampaignTimeLedgerEntry(result.state, {
    id: `${advanced.event.id}:time`,
    type: reason === 'rest' ? 'rest' : 'time-advance',
    reason,
    elapsedMinutes: advanced.event.payload?.minutes || 0,
    previousStardate,
    previousShipMinute,
    previousHeader,
    currentHeader: buildCampaignReplyHeader(result.state),
    confidence: adjudication?.confidence ?? null,
    source: adjudication?.source || 'worldDirector',
    sourceAnchorRange,
    evidenceMessageIds: adjudication?.evidenceMessageIds || [],
    adjudication,
    sourceEventId: advanced.event.id
  }, { now });
  return result;
}

export function chooseForegroundQuest({ state, packageData, questId, sourceAnchorRange = null, now = null } = {}) {
  const next = activateQuest(state, packageData, questId, { now, reason: 'player-chose-quest' });
  return processWorldBoundary({
    state: next,
    packageData,
    event: {
      id: `event.quest.${questId}.activated.${token(next.worldState?.currentStardate || nowValue(now))}`,
      type: 'quest.activated',
      sourceQuestId: questId,
      sourceAnchorRange,
      locationIds: [next.worldState?.currentLocationId].filter(Boolean),
      playerFacingSummary: `The Breckenridge committed attention to ${questId}.`
    },
    boundaryType: 'scene',
    now
  });
}

/**
 * Marks all state products whose provenance points into a changed passage as
 * stale. It never deletes or silently reverses mechanics; reviewed
 * reconciliation or scratch replay decides the replacement.
 */
export function invalidateOpenWorldCausalityForReconciliation(state, {
  anchorRange,
  outcomeIds = [],
  eventIds = [],
  reason = 'scene-reconciliation-source-changed',
  now = null
} = {}) {
  let current = cloneJson(state);
  const rangeHash = anchorRange?.rangeHash || null;
  const eventResult = invalidateEventsByAnchorRange(current, anchorRange, { reason, now, outcomeIds, eventIds });
  current = eventResult.state;
  const threadResult = rangeHash
    ? invalidateThreadEvidenceByAnchorRange(current.threadLedger, rangeHash, { now })
    : { ledger: current.threadLedger, affectedThreadIds: [] };
  current.threadLedger = threadResult.ledger;
  const staleQuestIds = [];
  for (const instance of asArray(current.questLedger?.instances)) {
    const matchesRange = rangeHash && instance.sourceAnchorRange?.rangeHash === rangeHash;
    const matchesOutcome = asArray(instance.sourceEventIds).some((id) => eventResult.invalidatedEventIds.includes(id));
    if (!matchesRange && !matchesOutcome) continue;
    instance.metadata = { ...(instance.metadata || {}), stale: true, staleReason: reason, staleAt: nowValue(now) };
    staleQuestIds.push(instance.id);
  }
  for (const template of asArray(current.dynamicQuestCatalog?.templates)) {
    if (rangeHash && template.provenance?.anchorRange?.rangeHash === rangeHash) {
      template.stale = true;
      template.staleReason = reason;
      template.staleAt = nowValue(now);
      if (!staleQuestIds.includes(template.id)) staleQuestIds.push(template.id);
    }
  }
  if (staleQuestIds.includes(current.questLedger?.foregroundQuestId)) {
    current.questLedger.foregroundQuestId = null;
    for (const instance of asArray(current.questLedger?.instances)) instance.foreground = false;
    current.attentionState = { ...(current.attentionState || {}), mode: 'open-operations', foregroundQuestId: null, scene: null };
    current.mission = createOpenOperationsMissionState(current);
  }
  const affectedOutcomeIds = unique([
    ...asArray(outcomeIds),
    ...asArray(current.eventLedger?.committedEvents).filter((event) => event.invalidated).map((event) => event.sourceOutcomeId)
  ]);
  for (const collectionName of ['responseLedger', 'sidecarJournal', 'modelCallJournal']) {
    for (const record of asArray(current.runtimeTracking?.[collectionName])) {
      if (affectedOutcomeIds.includes(record.outcomeId || record.sourceOutcomeId)
        || (rangeHash && record.sourceAnchorRange?.rangeHash === rangeHash)) {
        record.stale = true;
        record.staleReason = reason;
        record.staleAt = nowValue(now);
      }
    }
  }
  current.runtimeTracking.sceneReconciliation = reconciliationLedger(current.runtimeTracking.sceneReconciliation);
  current.runtimeTracking.sceneReconciliation.invalidations.push({
    id: `invalidation.${token(nowValue(now))}.${current.runtimeTracking.sceneReconciliation.invalidations.length + 1}`,
    anchorRange: cloneJson(anchorRange || null),
    eventIds: eventResult.invalidatedEventIds,
    threadIds: threadResult.affectedThreadIds,
    questIds: staleQuestIds,
    outcomeIds: affectedOutcomeIds,
    reason,
    at: nowValue(now)
  });
  return {
    state: current,
    invalidatedEventIds: eventResult.invalidatedEventIds,
    affectedThreadIds: threadResult.affectedThreadIds,
    staleQuestIds,
    affectedOutcomeIds
  };
}

export function coordinatorSnapshot(state, packageData) {
  return {
    locationId: state?.worldState?.currentLocationId || null,
    stardate: state?.worldState?.currentStardate || null,
    foregroundQuestId: state?.questLedger?.foregroundQuestId || null,
    foregroundThreadId: state?.attentionState?.foregroundThreadId || null,
    primaryPressureId: state?.attentionState?.primaryPressureId || null,
    openOpportunities: rankQuestOpportunities({ state, packageData, limit: 6 }),
    activeFronts: asArray(state?.worldState?.fronts).filter((front) => front.status !== 'resolved').map((front) => ({ id: front.id, stage: front.stage, value: front.value })),
    unresolvedReactionCount: asArray(state?.eventLedger?.pendingReactions).length,
    pendingReconciliationCount: asArray(state?.runtimeTracking?.sceneReconciliation?.pending).filter((item) => item.status === 'pending').length,
    staleDynamicQuestCount: asArray(state?.dynamicQuestCatalog?.templates).filter((item) => item.stale === true).length
  };
}

export function createBoundaryEvent(type, payload = {}, { state = null, sourceQuestId = null, sourceOutcomeId = null, sourceAnchorRange = null, now = null } = {}) {
  const stardate = state?.worldState?.currentStardate ?? state?.campaign?.currentStardate ?? null;
  return {
    id: `event.${type}.${token(stardate ?? nowValue(now))}`,
    type,
    stardate,
    sourceQuestId,
    sourceOutcomeId,
    sourceAnchorRange,
    payload: cloneJson(payload)
  };
}
