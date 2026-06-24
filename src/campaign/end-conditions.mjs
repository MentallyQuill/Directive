const RESULT_BANDS = Object.freeze([
  'Great Success',
  'Success',
  'Partial Success',
  'Partial Failure',
  'Failure',
  'Great Failure'
]);

const ACTION_LABELS = Object.freeze({
  replayFromCheckpoint: 'Replay from checkpoint',
  pushOn: 'Push On',
  keepEnding: 'Keep this ending',
  saveTerminalBranch: 'Save as branch'
});

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function pathValue(root, path) {
  if (!path || typeof path !== 'string') return undefined;
  let cursor = root;
  for (const part of path.split('.').filter(Boolean)) {
    if (cursor === null || cursor === undefined) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function valuesEqual(actual, expected) {
  if (expected === undefined) return actual !== undefined;
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function compareValue(actual, operator, expected) {
  switch (operator || 'eq') {
    case 'eq':
      return valuesEqual(actual, expected);
    case 'neq':
      return !valuesEqual(actual, expected);
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    case 'includes':
      return Array.isArray(actual) ? actual.includes(expected) : String(actual || '').includes(String(expected));
    case 'exists':
      return actual !== undefined && actual !== null;
    default:
      return false;
  }
}

function flagValue(campaignState, id) {
  if (!id) return undefined;
  const rootFlags = campaignState?.flags;
  if (isObject(rootFlags) && Object.prototype.hasOwnProperty.call(rootFlags, id)) return rootFlags[id];
  if (Array.isArray(rootFlags)) {
    const record = rootFlags.find((item) => item?.id === id);
    if (record) return firstValue(record.value, record.status, true);
  }
  const attentionFlags = campaignState?.attentionState?.flags;
  if (isObject(attentionFlags) && Object.prototype.hasOwnProperty.call(attentionFlags, id)) return attentionFlags[id];
  if (Array.isArray(attentionFlags)) {
    const record = attentionFlags.find((item) => item?.id === id);
    if (record) return firstValue(record.value, record.status, true);
  }
  return undefined;
}

function questStatus(campaignState, questId) {
  const instances = array(campaignState?.questLedger?.instances);
  const record = instances.find((item) => item?.id === questId || item?.templateId === questId);
  return record?.status || null;
}

function trackValue(campaignState, trackId) {
  const records = array(campaignState?.campaignTracks?.records);
  const record = records.find((item) => item?.id === trackId);
  return firstValue(record?.value, record?.current, record?.initial);
}

function pressureStatus(campaignState, pressureId) {
  const records = array(campaignState?.pressureLedger?.records);
  const record = records.find((item) => item?.id === pressureId);
  return firstValue(record?.status, record?.state);
}

function actorStatus(campaignState, actorId) {
  const actors = campaignState?.worldState?.actors;
  if (Array.isArray(actors)) return actors.find((item) => item?.id === actorId)?.status || null;
  if (isObject(actors)) return actors[actorId]?.status || null;
  return null;
}

function crewStatus(campaignState, crewId) {
  const senior = array(campaignState?.crew?.senior);
  const record = senior.find((item) => item?.id === crewId);
  return record?.status || null;
}

function latestTurnEntry(campaignState) {
  const entries = array(campaignState?.turnLedger?.entries);
  const lastId = campaignState?.turnLedger?.lastCommittedOutcomeId;
  if (lastId) {
    const byId = entries.find((entry) => entry?.outcomeId === lastId);
    if (byId) return byId;
  }
  return entries.at(-1) || null;
}

function eventObserved(campaignState, eventId) {
  const committed = array(campaignState?.eventLedger?.committedEvents);
  return committed.some((event) => event?.id === eventId || event?.type === eventId);
}

function statusMatches(actual, node) {
  if (Array.isArray(node.statuses)) return node.statuses.includes(actual);
  if (node.status !== undefined) return actual === node.status;
  if (node.equals !== undefined) return valuesEqual(actual, node.equals);
  return actual !== null && actual !== undefined;
}

function evaluateTypedPredicate(node, campaignState, context) {
  switch (node.type) {
    case 'questStatus':
      return statusMatches(questStatus(campaignState, node.questId || node.id), node);
    case 'attentionFlag':
    case 'campaignFlag':
    case 'customPackageSignal':
      return compareValue(flagValue(campaignState, node.id), node.operator, firstValue(node.equals, node.value, true));
    case 'worldTrack':
      return compareValue(trackValue(campaignState, node.trackId || node.id), node.operator, firstValue(node.equals, node.value));
    case 'pressureRecord':
      return statusMatches(pressureStatus(campaignState, node.pressureId || node.id), node);
    case 'shipState':
    case 'playerStatus':
    case 'campaignStatus':
      return compareValue(pathValue(campaignState, node.path || `${node.type.replace('State', '')}.status`), node.operator, firstValue(node.equals, node.value, node.status));
    case 'actorStatus':
      return statusMatches(actorStatus(campaignState, node.actorId || node.id), node);
    case 'crewStatus':
      return statusMatches(crewStatus(campaignState, node.crewId || node.id), node);
    case 'turnResultBand': {
      const band = latestTurnEntry(campaignState)?.resultBand || null;
      if (Array.isArray(node.bands)) return node.bands.includes(band);
      return band === node.band || band === node.equals;
    }
    case 'lastOutcomeTag': {
      const tags = array(latestTurnEntry(campaignState)?.tags);
      return tags.includes(node.id || node.value);
    }
    case 'eventObserved':
      return eventObserved(campaignState, node.eventId || node.id);
    case 'mode':
      return (context.simulationMode || campaignState?.settings?.simulationMode || 'Command') === node.mode;
    default:
      return false;
  }
}

export function evaluateEndConditionPredicate(predicate, campaignState, context = {}) {
  if (predicate === null || predicate === undefined) return true;
  if (typeof predicate === 'boolean') return predicate;
  if (!isObject(predicate)) return false;
  if (Array.isArray(predicate.all)) return predicate.all.every((child) => evaluateEndConditionPredicate(child, campaignState, context));
  if (Array.isArray(predicate.any)) return predicate.any.some((child) => evaluateEndConditionPredicate(child, campaignState, context));
  if (Array.isArray(predicate.none)) return !predicate.none.some((child) => evaluateEndConditionPredicate(child, campaignState, context));
  if (predicate.not !== undefined) return !evaluateEndConditionPredicate(predicate.not, campaignState, context);
  return evaluateTypedPredicate(predicate, campaignState, context);
}

function normalizeEndConditions(packageContext = {}) {
  const endConditions = packageContext.endConditions || packageContext;
  return {
    ...cloneJson(endConditions || {}),
    continuationFrames: array(endConditions?.continuationFrames).map(cloneJson),
    conditions: array(endConditions?.conditions).map(cloneJson)
  };
}

function isTerminalBlockedByMode(condition, simulationMode) {
  return simulationMode === 'Exploration' && condition.family === 'playerDeath';
}

function checkpointSource(campaignState, outcomeId, condition, packageEndConditions) {
  const policy = condition.checkpointPolicy || packageEndConditions.defaultCheckpointPolicy || {};
  const preferred = policy.preferred || 'preOutcomeSnapshot';
  const entry = array(campaignState?.turnLedger?.entries).find((item) => item?.outcomeId === outcomeId)
    || latestTurnEntry(campaignState);
  if (preferred === 'preOutcomeSnapshot' && entry?.snapshotBefore) {
    return { source: 'preOutcomeSnapshot', outcomeId: entry.outcomeId || outcomeId || null, retained: true };
  }
  if (entry?.snapshotBefore) return { source: 'preOutcomeSnapshot', outcomeId: entry.outcomeId || outcomeId || null, retained: true };
  return { source: array(policy.fallbacks)[0] || 'lastStableAutosave', outcomeId: entry?.outcomeId || outcomeId || null, retained: false };
}

function chooseFinalBand(condition, campaignState, context) {
  for (const rule of array(condition.finalCampaignBandRules)) {
    if (evaluateEndConditionPredicate(rule.when, campaignState, context)) {
      return {
        band: RESULT_BANDS.includes(rule.band) ? rule.band : condition.defaultTerminalOutcomeBand,
        summary: compact(rule.summary)
      };
    }
  }
  return {
    band: condition.defaultTerminalOutcomeBand,
    summary: compact(condition.playerFacingSummary)
  };
}

function actionOptions(actions = []) {
  return actions.map((action) => ({
    action,
    id: action,
    label: ACTION_LABELS[action] || action
  }));
}

export function createTerminalDecisionInteraction(detection) {
  const condition = detection.condition;
  const actions = array(condition.resolutionPolicy?.actions);
  return {
    id: detection.decisionId,
    kind: 'terminalOutcomeDecision',
    status: 'pending',
    ingressId: detection.ingressId || null,
    turnId: detection.turnId || null,
    outcomeId: detection.outcomeId || null,
    prompt: 'Directive Checkpoint',
    options: actionOptions(actions),
    metadata: {
      terminalOutcomeId: condition.id,
      terminalOutcomeTitle: condition.title,
      terminalOutcomeBand: detection.terminalOutcomeBand,
      finalCampaignBandCandidate: detection.finalCampaignBand,
      reason: condition.playerFacingSummary,
      checkpoint: cloneJson(detection.checkpoint),
      pushOnPolicy: cloneJson(condition.pushOnPolicy || null),
      continuationFrameIds: cloneJson(condition.continuationFrameIds || [])
    }
  };
}

export function detectCampaignEndCondition({
  campaignState,
  packageContext,
  outcomeId = null,
  turnId = null,
  ingressId = null,
  now = null
} = {}) {
  const packageEndConditions = normalizeEndConditions(packageContext);
  const simulationMode = campaignState?.settings?.simulationMode || 'Command';
  const context = { simulationMode };
  const matches = packageEndConditions.conditions
    .filter((condition) => evaluateEndConditionPredicate(condition.trigger, campaignState, context))
    .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0));
  const softened = matches.find((condition) => isTerminalBlockedByMode(condition, simulationMode));
  const condition = matches.find((item) => !isTerminalBlockedByMode(item, simulationMode));
  if (!condition) {
    return softened ? {
      matched: false,
      softened: true,
      softenedConditionId: softened.id,
      reason: 'modePolicy',
      simulationMode
    } : null;
  }
  const final = chooseFinalBand(condition, campaignState, context);
  const resolvedOutcomeId = outcomeId || latestTurnEntry(campaignState)?.outcomeId || null;
  const decisionId = `terminal-decision:${condition.id}:${resolvedOutcomeId || Date.now()}`;
  const detection = {
    matched: true,
    id: `terminal-detection:${condition.id}:${resolvedOutcomeId || Date.now()}`,
    decisionId,
    condition: cloneJson(condition),
    conditionId: condition.id,
    family: condition.family,
    severity: condition.severity,
    simulationMode,
    detectedAt: timestamp(now),
    ingressId,
    turnId,
    outcomeId: resolvedOutcomeId,
    terminalOutcomeBand: condition.defaultTerminalOutcomeBand,
    finalCampaignBand: final.band,
    finalCampaignBandSummary: final.summary,
    checkpoint: checkpointSource(campaignState, resolvedOutcomeId, condition, packageEndConditions)
  };
  return {
    ...detection,
    pendingInteraction: createTerminalDecisionInteraction(detection)
  };
}

function findContinuationFrame(packageContext, frameId) {
  return array(normalizeEndConditions(packageContext).continuationFrames).find((frame) => frame.id === frameId) || null;
}

function ensureFlags(state) {
  if (!isObject(state.flags)) state.flags = {};
  return state.flags;
}

function applyFrameEffect(state, effect = {}) {
  switch (effect.type) {
    case 'setCampaignFlag':
      ensureFlags(state)[effect.id] = effect.value;
      break;
    case 'setPlayerAuthority':
      state.player = { ...(state.player || {}), authority: effect.value, commandAuthority: effect.value };
      break;
    case 'setShipStatus':
      state.ship = { ...(state.ship || {}), status: effect.value };
      break;
    case 'setOperationalBase':
      state.campaign = { ...(state.campaign || {}), operationalBase: effect.value };
      break;
    case 'setCampaignPremise':
      state.campaign = { ...(state.campaign || {}), premise: effect.value };
      break;
    case 'setPlayerStatus':
      state.player = { ...(state.player || {}), status: effect.value };
      break;
    default:
      break;
  }
}

export function applyPushOnContinuationFrame({
  campaignState,
  packageContext,
  frameId,
  decisionId = null,
  conditionId = null,
  now = null
} = {}) {
  const frame = findContinuationFrame(packageContext, frameId);
  if (!frame) {
    const error = new Error(`Unknown continuation frame "${frameId}".`);
    error.code = 'DIRECTIVE_CONTINUATION_FRAME_NOT_FOUND';
    throw error;
  }
  const next = cloneJson(campaignState);
  for (const effect of array(frame.stateEffects)) applyFrameEffect(next, effect);
  const tracking = next.runtimeTracking || {};
  const ledger = {
    schemaVersion: 1,
    activeDecisionId: tracking.endConditionLedger?.activeDecisionId || null,
    detections: array(tracking.endConditionLedger?.detections),
    decisions: array(tracking.endConditionLedger?.decisions),
    branchRecords: array(tracking.endConditionLedger?.branchRecords),
    continuationFrames: array(tracking.endConditionLedger?.continuationFrames)
  };
  ledger.continuationFrames.push({
    id: `continuation:${frame.id}:${ledger.continuationFrames.length + 1}`,
    frameId: frame.id,
    conditionId,
    decisionId,
    acceptedAt: timestamp(now),
    title: frame.title,
    playerFacingSummary: frame.playerFacingStartCopy
  });
  next.runtimeTracking = {
    ...tracking,
    endConditionLedger: ledger
  };
  return {
    campaignState: next,
    frame: cloneJson(frame)
  };
}

export function createConclusionMetadataFromDetection(detection, resolution = {}) {
  return {
    terminalOutcomeId: detection.conditionId,
    terminalOutcomeBand: detection.terminalOutcomeBand,
    finalCampaignBand: detection.finalCampaignBand,
    finalCampaignBandSummary: detection.finalCampaignBandSummary,
    endingAxisEffects: cloneJson(detection.condition?.endingAxisEffects || []),
    acceptedResolution: resolution.action || 'keepEnding',
    sourceOutcomeId: detection.outcomeId || null
  };
}

export const __endConditionTestHooks = Object.freeze({
  pathValue,
  flagValue,
  questStatus,
  trackValue,
  latestTurnEntry,
  compareValue
});
