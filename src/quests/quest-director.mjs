import {
  clearForegroundQuest,
  playerSafeQuestSummaries,
  questInstanceById,
  questTemplateById,
  reconcileQuestAvailability,
  resolveQuest,
  setForegroundQuest,
  transitionQuest,
  updateQuestObjectives
} from './quest-ledger.mjs';
import { evaluatePredicate } from '../world/predicate-evaluator.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function compact(value) { return String(value ?? '').trim().toLowerCase(); }
function unique(values) { return [...new Set(asArray(values).filter(Boolean))]; }
function at(now) { return typeof now === 'function' ? now() : (now || new Date().toISOString()); }
function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function stardateHours(delta) { return Math.max(0, Number(delta || 0) * 24 / 2.74); }
function hoursStardate(hours) { return Number(hours || 0) * 2.74 / 24; }
function templateFor(state, packageData, instanceOrId) {
  const instance = typeof instanceOrId === 'object' ? instanceOrId : questInstanceById(state?.questLedger, instanceOrId);
  return questTemplateById(packageData, instance?.templateId || instance?.id || instanceOrId, state);
}

function focusStack(state) {
  return unique(state?.attentionState?.questFocusStack);
}

function withFocusStack(state, stack) {
  state.attentionState = {
    ...(state.attentionState || {}),
    questFocusStack: unique(stack)
  };
  return state;
}

function questEventStem(questId) {
  const id = String(questId || '').trim();
  return id.startsWith('quest.') ? id : `quest.${id}`;
}

function selectPriorFocus(state, excludedQuestId = null) {
  const stack = focusStack(state);
  while (stack.length) {
    const candidateId = stack.pop();
    if (!candidateId || candidateId === excludedQuestId) continue;
    const candidate = questInstanceById(state?.questLedger, candidateId);
    if (!candidate || candidate.metadata?.stale === true) continue;
    if (!['accepted', 'active', 'available', 'offered'].includes(candidate.status)) continue;
    return { questId: candidate.id, stack };
  }
  return { questId: null, stack };
}

function resumePriorFocus(state, packageData, completedQuestId, { now = null, reason = 'prior-focus-resumed' } = {}) {
  let next = cloneJson(state);
  const prior = selectPriorFocus(next, completedQuestId);
  next = withFocusStack(next, prior.stack);
  if (prior.questId) {
    return activateQuest(next, packageData, prior.questId, {
      now,
      reason,
      pushCurrent: false
    });
  }
  next.questLedger = clearForegroundQuest(next.questLedger, { now, reason: `${reason}-none` });
  next.attentionState = {
    ...(next.attentionState || {}),
    mode: 'open-operations',
    foregroundQuestId: null,
    scene: null,
    questFocusStack: focusStack(next)
  };
  next.mission = createOpenOperationsMissionState(next);
  return next;
}

const KIND_WEIGHT = Object.freeze({ onboarding: 100, finale: 92, main: 78, epilogue: 72, side: 48, personal: 46, emergent: 42 });

function intentTokens(playerIntent) {
  return new Set(compact(typeof playerIntent === 'string' ? playerIntent : playerIntent?.text || playerIntent?.summary)
    .split(/[^a-z0-9-]+/).filter((token) => token.length > 2));
}

function questRelevanceScore(instance, template, state, playerIntent = null) {
  let score = KIND_WEIGHT[template?.kind || instance.kind] || 30;
  const currentLocation = state?.worldState?.currentLocationId;
  const anchors = asArray(template?.anchors?.locationIds);
  if (anchors.includes(currentLocation)) score += 32;
  else if (anchors.length) score -= 8;
  if (instance.status === 'active') score += 28;
  if (instance.status === 'accepted') score += 18;
  if (instance.status === 'offered') score += 10;
  if (instance.status === 'delegated') score += 8;
  if (template?.offerPolicy?.urgent === true) score += 20;
  const deadline = Number(template?.offerPolicy?.deadlineStardate || 0);
  const current = Number(state?.worldState?.currentStardate || 0);
  if (deadline && deadline >= current) score += Math.max(0, 20 - Math.floor((deadline - current) * 2));
  const tokens = intentTokens(playerIntent);
  const searchable = [template?.title, template?.summary, template?.dramaticQuestion, ...asArray(template?.tags)].join(' ').toLowerCase();
  for (const item of tokens) if (searchable.includes(item)) score += 4;
  if (['side', 'personal', 'emergent'].includes(template?.kind) && state?.attentionState?.mode === 'open-operations') score += 10;
  if (template?.contextHints?.calm === true && state?.attentionState?.primaryPressureId) score -= 14;
  if (instance.metadata?.stale === true) score -= 1000;
  return score;
}

export function refreshQuestAvailability(state, packageData, { now = null } = {}) {
  const next = cloneJson(state);
  const result = reconcileQuestAvailability(next.questLedger, packageData, next, { now });
  next.questLedger = result.ledger;
  return { state: next, changes: result.changes };
}

export function rankQuestOpportunities({ state, packageData, playerIntent = null, statuses = ['available', 'offered', 'accepted', 'active', 'delegated'], limit = 8 } = {}) {
  const allowed = new Set(statuses);
  return asArray(state?.questLedger?.instances)
    .filter((instance) => allowed.has(instance.status) && instance.metadata?.stale !== true)
    .map((instance) => {
      const template = templateFor(state, packageData, instance);
      return {
        id: instance.id,
        templateId: instance.templateId,
        status: instance.status,
        score: questRelevanceScore(instance, template, state, playerIntent),
        title: template?.title || instance.title,
        kind: template?.kind || instance.kind,
        locationIds: cloneJson(template?.anchors?.locationIds || []),
        assignedActorIds: cloneJson(instance.assignedActorIds || []),
        dynamic: template?.dynamic === true,
        reason: template?.anchors?.locationIds?.includes(state?.worldState?.currentLocationId)
          ? 'current-location' : instance.status
      };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export function offerQuest(state, packageData, questId, { now = null, reason = 'quest-offered' } = {}) {
  const next = cloneJson(state);
  const instance = questInstanceById(next.questLedger, questId);
  const template = templateFor(next, packageData, instance || questId);
  if (!instance || !template) throw new Error(`Unknown quest "${questId}".`);
  if (!evaluatePredicate(template.availability, next).pass) throw new Error(`Quest "${questId}" is not currently available.`);
  if (instance.status !== 'offered') next.questLedger = transitionQuest(next.questLedger, instance.id, 'offered', { now, reason });
  return next;
}

export function acceptQuest(state, packageData, questId, { now = null, makeForeground = false, reason = 'quest-accepted' } = {}) {
  let next = cloneJson(state);
  const instance = questInstanceById(next.questLedger, questId);
  if (!instance || !templateFor(next, packageData, instance)) throw new Error(`Unknown quest "${questId}".`);
  if (!['accepted', 'active'].includes(instance.status)) {
    next.questLedger = transitionQuest(next.questLedger, instance.id, 'accepted', { now, reason });
  }
  if (makeForeground) next = activateQuest(next, packageData, instance.id, { now, reason: 'accepted-and-selected' });
  return next;
}

export function activateQuest(state, packageData, questId, {
  now = null,
  reason = 'quest-selected',
  pushCurrent = true
} = {}) {
  const next = cloneJson(state);
  const instance = questInstanceById(next.questLedger, questId);
  const template = templateFor(next, packageData, instance || questId);
  if (!instance || !template) throw new Error(`Unknown quest "${questId}".`);
  if (instance.metadata?.stale === true) throw new Error(`Quest "${questId}" is stale because its source passage changed.`);
  const priorForegroundId = next.questLedger?.foregroundQuestId || next.attentionState?.foregroundQuestId || null;
  let stack = focusStack(next).filter((id) => id !== instance.id);
  if (pushCurrent && priorForegroundId && priorForegroundId !== instance.id) {
    const prior = questInstanceById(next.questLedger, priorForegroundId);
    if (prior && !['resolved', 'failed', 'abandoned', 'expired', 'transformed'].includes(prior.status) && prior.metadata?.stale !== true) {
      stack = [...stack.filter((id) => id !== prior.id), prior.id];
    }
  }
  next.questLedger = setForegroundQuest(next.questLedger, instance.id, { now, reason, autoActivate: true });
  const firstPhase = asArray(template.missionGraph?.phases)[0];
  const phaseId = template.missionGraph?.startPhaseId || template.missionGraph?.entryPhaseId || firstPhase?.id || 'opening';
  next.attentionState = {
    ...(next.attentionState || {}),
    mode: template.kind === 'onboarding' ? 'guided-onboarding' : 'quest',
    foregroundQuestId: instance.id,
    questFocusStack: stack,
    scene: {
      id: `scene.${instance.id}.${phaseId}`,
      questId: instance.id,
      phaseId,
      phaseLabel: firstPhase?.label || 'Opening',
      locationId: next.worldState?.currentLocationId || asArray(template.anchors?.locationIds)[0] || null,
      sourceAnchorRange: cloneJson(instance.sourceAnchorRange || null)
    }
  };
  next.mission = createForegroundMissionState(next, packageData, instance.id);
  return next;
}

export function pauseForegroundQuest(state, { now = null, reason = 'quest-paused' } = {}) {
  const next = cloneJson(state);
  const foregroundId = next.questLedger?.foregroundQuestId;
  const foreground = foregroundId ? questInstanceById(next.questLedger, foregroundId) : null;
  if (foreground?.status === 'active') next.questLedger = transitionQuest(next.questLedger, foreground.id, 'accepted', { now, reason });
  next.questLedger = clearForegroundQuest(next.questLedger, { now, reason });
  next.attentionState = { ...(next.attentionState || {}), mode: 'open-operations', foregroundQuestId: null, scene: null, questFocusStack: focusStack(next) };
  next.mission = createOpenOperationsMissionState(next);
  return next;
}

function assetAvailable(state, assetId) {
  const records = Array.isArray(state?.campaignAssets) ? state.campaignAssets : asArray(state?.campaignAssets?.records);
  return records.some((record) => (typeof record === 'string' ? record : record?.id) === assetId
    && (typeof record === 'string' || ['earned', 'available', 'active', 'secured'].includes(record?.status || record?.state || 'earned')));
}

function knownActorIds(packageData, state) {
  return new Set([
    ...asArray(packageData?.world?.actors).map((actor) => actor.id),
    ...asArray(packageData?.crew?.senior || packageData?.crew?.members || packageData?.crew).map((actor) => actor.id),
    ...asArray(state?.worldState?.actors).map((actor) => actor.id),
    state?.player?.id
  ].filter(Boolean));
}

export function delegateQuest(state, packageData, questId, actorIds, { now = null, reason = 'quest-delegated' } = {}) {
  const next = cloneJson(state);
  const instance = questInstanceById(next.questLedger, questId);
  const template = templateFor(next, packageData, instance || questId);
  if (!instance || !template) throw new Error(`Unknown quest "${questId}".`);
  if (template.delegation?.allowed !== true) throw new Error(`Quest "${questId}" cannot be delegated.`);
  const assignees = unique(actorIds);
  if (!assignees.length) throw new Error('Delegation requires at least one actor id.');
  const actors = knownActorIds(packageData, next);
  const unknown = assignees.filter((id) => !actors.has(id));
  if (unknown.length) throw new Error(`Delegation references unknown actor(s): ${unknown.join(', ')}.`);
  const missingAssets = asArray(template.delegation?.requiresAssetIds).filter((id) => !assetAvailable(next, id));
  if (missingAssets.length) throw new Error(`Delegation requires unavailable asset(s): ${missingAssets.join(', ')}.`);
  const currentStardate = Number(next.worldState?.currentStardate || 0);
  const checkEveryHours = Math.max(1, Number(template.delegation?.checkEveryHours || template.delegation?.minimumHours || 8));
  const delegation = {
    status: 'underway',
    assignedActorIds: assignees,
    startedAt: at(now),
    startedStardate: currentStardate,
    lastCheckStardate: currentStardate,
    nextCheckStardate: Number((currentStardate + hoursStardate(checkEveryHours)).toFixed(3)),
    checkEveryHours,
    checksCompleted: 0,
    progressPerCheck: Math.max(5, Math.min(70, Number(template.delegation?.progressPerCheck || 30))),
    risk: template.delegation?.risk || 'Delegation may introduce time, uncertainty, or incomplete context.',
    failureForward: template.delegation?.failureForward !== false,
    sourceAnchorRange: cloneJson(instance.sourceAnchorRange || null)
  };
  const wasForeground = next.questLedger?.foregroundQuestId === instance.id || next.attentionState?.foregroundQuestId === instance.id;
  next.questLedger = transitionQuest(next.questLedger, instance.id, 'delegated', { now, reason, assignedActorIds: assignees, delegation });
  if (wasForeground) {
    return resumePriorFocus(next, packageData, instance.id, { now, reason: 'delegated-prior-focus-resumed' });
  }
  return next;
}

function selectedOutcome(template, outcomeKey) {
  const outcomes = asArray(template?.outcomes);
  return outcomes.find((outcome) => outcome.id === outcomeKey) || outcomes[0] || null;
}

export function completeQuest(state, packageData, questId, { outcomeId = null, outcomeKey = null, now = null, reason = 'quest-resolved' } = {}) {
  const next = cloneJson(state);
  const instance = questInstanceById(next.questLedger, questId);
  const template = templateFor(next, packageData, instance || questId);
  if (!instance || !template) throw new Error(`Unknown quest "${questId}".`);
  const outcome = selectedOutcome(template, outcomeKey);
  const resolvedKey = outcomeKey || outcome?.id || 'resolved';
  next.questLedger = resolveQuest(next.questLedger, instance.id, { outcomeId, outcomeKey: resolvedKey, now, reason });
  const wasForeground = state?.questLedger?.foregroundQuestId === instance.id || state?.attentionState?.foregroundQuestId === instance.id;
  const focusedState = wasForeground
    ? resumePriorFocus(next, packageData, instance.id, { now, reason: 'resolved-prior-focus-resumed' })
    : next;
  const eventStem = questEventStem(instance.id);
  const canonical = {
    id: `event.${eventStem}.resolved.${outcomeId || 'system'}`,
    type: `${eventStem}.resolved`,
    sourceQuestId: instance.id,
    sourceOutcomeId: outcomeId,
    sourceThreadId: instance.sourceThreadId || template.sourceThreadId || null,
    sourceAnchorRange: cloneJson(instance.sourceAnchorRange || template.provenance?.anchorRange || null),
    payload: {
      outcomeKey: resolvedKey,
      outcomeSummary: outcome?.summary || null,
      worldEffects: cloneJson(outcome?.effects || [])
    },
    playerFacingSummary: outcome?.summary || `${template.title} was resolved.`
  };
  const authored = asArray(template.emittedEvents).map((event, index) => ({
    ...cloneJson(event),
    id: event.id ? `${event.id}.${outcomeId || index}` : `event.quest.${instance.id}.authored.${index}.${outcomeId || 'system'}`,
    type: event.type || 'quest.resolved',
    sourceQuestId: instance.id,
    sourceOutcomeId: outcomeId,
    sourceThreadId: instance.sourceThreadId || template.sourceThreadId || null,
    sourceAnchorRange: cloneJson(instance.sourceAnchorRange || template.provenance?.anchorRange || null),
    payload: { ...cloneJson(event.payload || {}), outcomeKey: resolvedKey }
  }));
  return { state: focusedState, events: [canonical, ...authored], outcome: cloneJson(outcome) };
}

export function failQuest(state, packageData, questId, { outcomeId = null, now = null, reason = 'quest-failed-forward' } = {}) {
  const next = cloneJson(state);
  const instance = questInstanceById(next.questLedger, questId);
  const template = templateFor(next, packageData, instance || questId);
  if (!instance || !template) throw new Error(`Unknown quest "${questId}".`);
  next.questLedger = transitionQuest(next.questLedger, instance.id, 'failed', { now, reason, metadata: { outcomeId } });
  const wasForeground = state?.questLedger?.foregroundQuestId === instance.id || state?.attentionState?.foregroundQuestId === instance.id;
  const focusedState = wasForeground
    ? resumePriorFocus(next, packageData, instance.id, { now, reason: 'failed-prior-focus-resumed' })
    : next;
  const eventStem = questEventStem(instance.id);
  return {
    state: focusedState,
    events: [{
      id: `event.${eventStem}.failed.${outcomeId || 'system'}`,
      type: `${eventStem}.failed`,
      sourceQuestId: instance.id,
      sourceOutcomeId: outcomeId,
      sourceAnchorRange: cloneJson(instance.sourceAnchorRange || null),
      playerFacingSummary: `${template.title} failed, but its consequences continue in the world.`
    }]
  };
}

export function abandonQuest(state, packageData, questId, { now = null, reason = 'player-abandoned-quest' } = {}) {
  const next = cloneJson(state);
  const instance = questInstanceById(next.questLedger, questId);
  const template = templateFor(next, packageData, instance || questId);
  if (!instance || !template) throw new Error(`Unknown quest "${questId}".`);
  next.questLedger = transitionQuest(next.questLedger, instance.id, 'abandoned', { now, reason });
  const wasForeground = state?.questLedger?.foregroundQuestId === instance.id || state?.attentionState?.foregroundQuestId === instance.id;
  const focusedState = wasForeground
    ? resumePriorFocus(next, packageData, instance.id, { now, reason: 'abandoned-prior-focus-resumed' })
    : next;
  const eventStem = questEventStem(instance.id);
  return {
    state: focusedState,
    events: [{ id: `event.${eventStem}.abandoned`, type: `${eventStem}.abandoned`, sourceQuestId: instance.id, sourceAnchorRange: cloneJson(instance.sourceAnchorRange || null), playerFacingSummary: `${template.title} was abandoned; relevant actors may respond.` }]
  };
}

function delegationCapability(state, instance) {
  let score = 50 + Math.min(18, asArray(instance.assignedActorIds).length * 6);
  for (const id of asArray(instance.assignedActorIds)) {
    const actor = asArray(state?.worldState?.actors).find((item) => item.id === id);
    if (actor?.status === 'unavailable' || actor?.status === 'injured') score -= 12;
    if (['cooperative', 'ready', 'available'].includes(actor?.status) || actor?.posture === 'cooperative') score += 4;
  }
  return score;
}

/** Advances delegated quests only at world/scene boundaries. No offscreen work is
 * simulated per chat line, which keeps the system bounded and causally legible. */
export function processDelegatedQuests(state, packageData, { boundaryType = 'time-advance', now = null } = {}) {
  let next = cloneJson(state);
  const events = [];
  const changes = [];
  const currentStardate = Number(next.worldState?.currentStardate || 0);
  for (const original of asArray(next.questLedger?.instances).filter((item) => item.status === 'delegated')) {
    const instance = questInstanceById(next.questLedger, original.id);
    const template = templateFor(next, packageData, instance);
    if (!template) continue;
    const delegation = cloneJson(instance.delegation || {});
    if (currentStardate + 1e-6 < Number(delegation.nextCheckStardate || currentStardate)) continue;
    const capability = delegationCapability(next, instance);
    const pressure = asArray(template.pressures).reduce((sum, item) => sum + Number(item.severity || 2) * 3, 20);
    const roll = stableHash(`${instance.id}|${currentStardate}|${delegation.checksCompleted || 0}`) % 21 - 10;
    const margin = capability - pressure + roll;
    const base = Number(delegation.progressPerCheck || 30);
    const progress = Math.max(8, Math.min(70, base + (margin >= 15 ? 15 : margin < -10 ? -15 : 0)));
    const pending = instance.objectiveStates.filter((objective) => !['complete', 'failed', 'waived'].includes(objective.status));
    const updates = pending.slice(0, Math.max(1, Math.min(2, asArray(instance.assignedActorIds).length))).map((objective) => ({
      id: objective.id,
      progress: Math.min(100, Number(objective.progress || 0) + progress),
      status: Number(objective.progress || 0) + progress >= 100 ? 'complete' : 'in-progress',
      evidenceIds: [`delegation.${instance.id}.${Number(delegation.checksCompleted || 0) + 1}`]
    }));
    next.questLedger = updateQuestObjectives(next.questLedger, instance.id, updates, { now, reason: `delegation-${boundaryType}` });
    const updated = questInstanceById(next.questLedger, instance.id);
    updated.delegation = {
      ...delegation,
      checksCompleted: Number(delegation.checksCompleted || 0) + 1,
      lastCheckStardate: currentStardate,
      nextCheckStardate: Number((currentStardate + hoursStardate(delegation.checkEveryHours || 8)).toFixed(3)),
      lastResult: margin >= 15 ? 'strong-progress' : margin >= -10 ? 'progress' : 'progress-at-cost',
      elapsedHours: stardateHours(currentStardate - Number(delegation.startedStardate || currentStardate))
    };
    const required = updated.objectiveStates.filter((objective) => objective.optional !== true);
    const completed = required.length > 0 && required.every((objective) => objective.status === 'complete' || Number(objective.progress) >= 100);
    events.push({
      id: `event.quest.${instance.id}.delegation.${updated.delegation.checksCompleted}`,
      type: 'quest.delegation.progress',
      sourceQuestId: instance.id,
      sourceAnchorRange: cloneJson(instance.sourceAnchorRange || null),
      actorIds: cloneJson(instance.assignedActorIds),
      payload: { objectiveUpdates: updates, result: updated.delegation.lastResult, boundaryType },
      playerFacingSummary: `${template.title} advanced under delegated supervision${margin < -10 ? ', with a complication requiring later attention' : ''}.`
    });
    changes.push({ questId: instance.id, objectiveUpdates: updates, completed });
    if (completed) {
      const completion = completeQuest(next, packageData, instance.id, { outcomeKey: asArray(template.outcomes)[0]?.id || 'delegated-resolution', now, reason: 'delegated-objectives-complete' });
      next = completion.state;
      events.push(...completion.events);
    }
  }
  return { state: next, events, changes };
}

/** Applies expiry and authored transformation rules after state-changing boundaries. */
export function processQuestLifecycle(state, packageData, { now = null } = {}) {
  let next = cloneJson(state);
  const availability = reconcileQuestAvailability(next.questLedger, packageData, next, { now });
  next.questLedger = availability.ledger;
  const events = [];
  const transformations = [];
  for (const change of availability.changes.filter((item) => item.to === 'expired')) {
    const instance = questInstanceById(next.questLedger, change.questId);
    const template = templateFor(next, packageData, instance);
    events.push({ id: `event.quest.${instance.id}.expired`, type: `quest.${instance.id}.expired`, sourceQuestId: instance.id, sourceAnchorRange: cloneJson(instance.sourceAnchorRange || null), payload: { reasons: change.reasons }, playerFacingSummary: `${template?.title || instance.title} is no longer available in its previous form.` });
    for (const transformId of asArray(template?.transformsTo)) {
      const target = questInstanceById(next.questLedger, transformId);
      if (!target || !['latent', 'available'].includes(target.status)) continue;
      if (target.status === 'latent') next.questLedger = transitionQuest(next.questLedger, target.id, 'available', { now, reason: `transformed-from:${instance.id}` });
      transformations.push({ fromQuestId: instance.id, toQuestId: target.id });
      events.push({ id: `event.quest.${instance.id}.transformed.${target.id}`, type: 'quest.transformed', sourceQuestId: instance.id, payload: { fromQuestId: instance.id, toQuestId: target.id }, playerFacingSummary: `${template?.title || instance.title} changed into a new opportunity.` });
    }
  }
  return { state: next, changes: availability.changes, events, transformations };
}

export function createForegroundMissionState(state, packageData, questId) {
  const instance = questInstanceById(state?.questLedger, questId);
  const template = templateFor(state, packageData, instance || questId);
  if (!instance || !template) return createOpenOperationsMissionState(state);
  const graph = template.missionGraph || {};
  const phaseId = state?.attentionState?.scene?.phaseId || graph.startPhaseId || graph.entryPhaseId || asArray(graph.phases)[0]?.id || 'opening';
  const phase = asArray(graph.phases).find((entry) => entry.id === phaseId) || asArray(graph.phases)[0] || {};
  return {
    activeMissionId: instance.id,
    activeMissionGraphId: graph.id || `graph.${template.id}`,
    activeMissionGraphPath: graph.path || null,
    activeMissionType: template.kind,
    phase: phase.label || 'Opening',
    activePhaseId: phaseId,
    availableDecisionPointIds: asArray(phase.decisionPointIds || graph.entryDecisionPointIds),
    formalObjectives: asArray(template.objectives).map((objective) => ({
      id: objective.id,
      text: objective.playerText || objective.label || objective.summary || objective.id,
      optional: objective.optional === true
    })),
    objectiveStates: cloneJson(instance.objectiveStates || []),
    knownFacts: [],
    hiddenFacts: [],
    outcomeFlags: [],
    questTemplateId: template.id,
    openWorldManaged: true,
    dynamic: template.dynamic === true,
    sourceAnchorRange: cloneJson(instance.sourceAnchorRange || null)
  };
}

export function createOpenOperationsMissionState(state) {
  return {
    activeMissionId: null,
    activeMissionGraphId: null,
    activeMissionGraphPath: null,
    activeMissionType: 'open-operations',
    phase: 'Open Operations',
    activePhaseId: 'open-operations',
    availableDecisionPointIds: [],
    formalObjectives: [],
    objectiveStates: [],
    knownFacts: [],
    hiddenFacts: [],
    outcomeFlags: [],
    questTemplateId: null,
    openWorldManaged: true,
    locationId: state?.worldState?.currentLocationId || null
  };
}

export function openWorldQuestView(state, packageData, { limit = 12 } = {}) {
  return {
    foregroundQuestId: state?.questLedger?.foregroundQuestId || null,
    opportunities: rankQuestOpportunities({ state, packageData, limit }),
    quests: playerSafeQuestSummaries(state?.questLedger, packageData, { campaignState: state }).slice(0, limit)
  };
}

export const __questDirectorTestHooks = Object.freeze({ questRelevanceScore, KIND_WEIGHT, intentTokens, delegationCapability, stardateHours, hoursStardate });
