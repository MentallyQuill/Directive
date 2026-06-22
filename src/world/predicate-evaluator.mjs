function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compact(value) {
  return String(value ?? '').trim();
}

function compare(actual, operator = '==', expected) {
  const normalizedOperator = ({ eq: '==', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', oneOf: 'in', notOneOf: 'notIn' })[operator] || operator;
  switch (normalizedOperator) {
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    case '>': return Number(actual) > Number(expected);
    case '>=': return Number(actual) >= Number(expected);
    case '<': return Number(actual) < Number(expected);
    case '<=': return Number(actual) <= Number(expected);
    case 'in': return asArray(expected).includes(actual);
    case 'notIn': return !asArray(expected).includes(actual);
    case 'includes': return asArray(actual).includes(expected);
    case 'contains': return typeof actual === 'string' && actual.includes(String(expected));
    default: return false;
  }
}

function byId(values = []) {
  return new Map(asArray(values).filter((item) => item?.id).map((item) => [item.id, item]));
}

function factKnown(state, factId) {
  const records = state?.knowledgeLedger?.facts || state?.mission?.knownFacts || [];
  const record = asArray(records).find((item) => (typeof item === 'string' ? item : item?.id) === factId);
  if (!record) return false;
  if (typeof record === 'string') return true;
  return record.known !== false && !['hidden', 'unknown', 'retracted', 'disproved'].includes(record.status);
}

function eventOccurred(state, typeOrId) {
  const invalidated = new Set(asArray(state?.eventLedger?.invalidatedEventIds));
  return asArray(state?.eventLedger?.committedEvents).some((event) => (
    event?.invalidated !== true
    && !invalidated.has(event?.id)
    && (event?.id === typeOrId || event?.type === typeOrId)
  ));
}

function assetRecords(state) {
  if (Array.isArray(state?.campaignAssets)) return state.campaignAssets;
  return state?.campaignAssets?.records || state?.campaignAssets?.assets || [];
}

function assetEarned(state, assetId) {
  const record = asArray(assetRecords(state)).find((item) => (typeof item === 'string' ? item : item?.id) === assetId);
  if (!record) return false;
  if (typeof record === 'string') return true;
  return ['earned', 'available', 'active', 'secured'].includes(record.state || record.status || 'earned');
}

function questStatus(state, condition) {
  const id = typeof condition === 'string' ? condition : condition?.id;
  const instance = asArray(state?.questLedger?.instances).find((item) => (
    item?.id === id || item?.templateId === id
  ));
  if (!instance) return false;
  if (typeof condition === 'string') return !['latent', 'expired'].includes(instance.status);
  const expected = condition?.in || condition?.status || condition?.value;
  return Array.isArray(expected) ? expected.includes(instance.status) : instance.status === expected;
}

function indexedValue(values, id, key = 'value') {
  const record = byId(values).get(id);
  return record?.[key];
}

function actorStatus(state, condition) {
  const record = byId(state?.worldState?.actors).get(condition?.id)
    || byId(state?.actors?.records || state?.actors?.known || state?.actors?.postures).get(condition?.id);
  if (!record) return false;
  return compare(record.status || record.state || record.posture, condition?.op || 'in', condition?.in || condition?.value);
}

function factionPosture(state, condition) {
  const record = byId(state?.worldState?.factions).get(condition?.id);
  if (!record) return false;
  return compare(record.posture || record.status, condition?.op || 'in', condition?.in || condition?.value);
}

function threadStatus(state, condition) {
  const record = byId(state?.threadLedger?.records).get(condition?.id);
  if (!record) return false;
  const expected = condition?.in || condition?.status || condition?.value;
  return Array.isArray(expected) ? expected.includes(record.status) : record.status === expected;
}

function flagValue(state, condition) {
  const records = [
    ...asArray(state?.attentionState?.flags),
    ...asArray(state?.mission?.outcomeFlags),
    ...asArray(state?.questLedger?.flags)
  ];
  const record = records.find((item) => (typeof item === 'string' ? item : item?.id) === condition?.id);
  if (!record) return false;
  if (typeof record === 'string') return condition?.value === undefined || condition?.value === true;
  return compare(record.value ?? record.state ?? true, condition?.op || '==', condition?.value ?? true);
}

function countMatch(state, condition) {
  let records = [];
  const source = condition?.source;
  if (source === 'knownFacts') records = asArray(state?.knowledgeLedger?.facts).filter((item) => typeof item === 'string' || item?.known !== false);
  if (source === 'resolvedQuests') records = asArray(state?.questLedger?.instances).filter((item) => item?.status === 'resolved');
  if (source === 'availableQuests') records = asArray(state?.questLedger?.instances).filter((item) => ['available', 'offered', 'accepted', 'active'].includes(item?.status));
  if (source === 'evidenceTag') records = asArray(state?.knowledgeLedger?.facts).filter((item) => asArray(item?.tags).includes(condition?.tag));
  if (source === 'assets') records = asArray(assetRecords(state)).filter((item) => typeof item === 'string' || ['earned', 'available', 'active', 'secured'].includes(item?.state || item?.status));
  if (source === 'completedMilestones') records = asArray(state?.storyArcLedger?.milestones).filter((item) => item?.status === 'complete');
  if (source === 'activeThreads') records = asArray(state?.threadLedger?.records).filter((item) => ['engaged', 'active'].includes(item?.status));
  if (condition?.where && isObject(condition.where)) {
    records = records.filter((record) => Object.entries(condition.where).every(([key, expected]) => {
      const actual = record?.[key];
      return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
    }));
  }
  return compare(records.length, condition?.op || '>=', condition?.value ?? condition?.atLeast ?? 1);
}

function typedPredicate(predicate, state) {
  switch (predicate?.type) {
    case 'questResolved':
      return questStatus(state, { id: predicate.questId, status: 'resolved' });
    case 'eventOccurred':
      return eventOccurred(state, predicate.eventType || predicate.eventId);
    case 'factKnown':
      return factKnown(state, predicate.factId);
    case 'factCount': {
      const requiredTags = asArray(predicate.tags);
      const records = asArray(state?.knowledgeLedger?.facts).filter((fact) => {
        if (typeof fact === 'string') return requiredTags.length === 0;
        if (fact?.known === false || ['hidden', 'unknown', 'retracted', 'disproved'].includes(fact?.status)) return false;
        return requiredTags.every((tag) => asArray(fact?.tags).includes(tag));
      });
      return compare(records.length, predicate.operator || predicate.op || '>=', predicate.value ?? 1);
    }
    case 'questCount': {
      const statuses = asArray(predicate.statuses);
      const kinds = asArray(predicate.kinds);
      const records = asArray(state?.questLedger?.instances).filter((quest) => (
        (statuses.length === 0 || statuses.includes(quest?.status))
        && (kinds.length === 0 || kinds.includes(quest?.kind))
      ));
      return compare(records.length, predicate.operator || predicate.op || '>=', predicate.value ?? 1);
    }
    case 'track': {
      const actual = indexedValue(state?.worldState?.tracks || state?.campaignTracks?.records || state?.campaignTracks, predicate.trackId);
      return compare(actual, predicate.operator || predicate.op || '>=', predicate.value);
    }
    case 'frontStage': {
      const front = byId(state?.worldState?.fronts || state?.fronts).get(predicate.frontId);
      if (!front) return false;
      const actual = Number.isFinite(Number(front.value)) ? Number(front.value) : front.stage;
      return compare(actual, predicate.operator || predicate.op || '>=', predicate.value ?? predicate.stage);
    }
    case 'threadStatus': {
      if (predicate.threadId === 'thread.dynamic-any') {
        return asArray(state?.threadLedger?.records).some((record) => asArray(predicate.statuses).includes(record?.status));
      }
      return threadStatus(state, { id: predicate.threadId, in: predicate.statuses || [predicate.status] });
    }
    default:
      return null;
  }
}

function evaluateLeaf(predicate, state) {
  if (predicate.type) {
    const typed = typedPredicate(predicate, state);
    if (typed !== null) return typed;
  }
  if ('factKnown' in predicate) return factKnown(state, predicate.factKnown);
  if ('eventOccurred' in predicate) return eventOccurred(state, predicate.eventOccurred);
  if ('locationVisited' in predicate) return asArray(state?.worldState?.visitedLocationIds).includes(predicate.locationVisited);
  if ('currentLocation' in predicate) return state?.worldState?.currentLocationId === predicate.currentLocation;
  if ('assetEarned' in predicate) return assetEarned(state, predicate.assetEarned);
  if ('questStatus' in predicate) return questStatus(state, predicate.questStatus);
  if ('clock' in predicate) {
    const actual = indexedValue(state?.worldState?.clocks || state?.clocks, predicate.clock?.id);
    return compare(actual, predicate.clock?.op || '>=', predicate.clock?.value);
  }
  if ('track' in predicate) {
    const actual = indexedValue(state?.worldState?.tracks || state?.campaignTracks?.records || state?.campaignTracks, predicate.track?.id);
    return compare(actual, predicate.track?.op || '>=', predicate.track?.value);
  }
  if ('front' in predicate) {
    const record = byId(state?.worldState?.fronts || state?.fronts).get(predicate.front?.id);
    if (!record) return false;
    return compare(record.stage ?? record.value ?? record.status, predicate.front?.op || '==', predicate.front?.value ?? predicate.front?.stage);
  }
  if ('actorStatus' in predicate) return actorStatus(state, predicate.actorStatus);
  if ('factionPosture' in predicate) return factionPosture(state, predicate.factionPosture);
  if ('threadStatus' in predicate) return threadStatus(state, predicate.threadStatus);
  if ('milestoneStatus' in predicate) {
    const record = byId(state?.storyArcLedger?.milestones).get(predicate.milestoneStatus?.id);
    if (!record) return false;
    const expected = predicate.milestoneStatus?.in || predicate.milestoneStatus?.status || predicate.milestoneStatus?.value;
    return Array.isArray(expected) ? expected.includes(record.status) : record.status === expected;
  }
  if ('flag' in predicate) return flagValue(state, predicate.flag);
  if ('time' in predicate) {
    const actual = Number(state?.worldState?.currentStardate ?? state?.campaign?.currentStardate ?? 0);
    return compare(actual, predicate.time?.op || '>=', predicate.time?.stardate ?? predicate.time?.value);
  }
  if ('count' in predicate) return countMatch(state, predicate.count);
  return false;
}

export function evaluatePredicate(predicate, state = {}) {
  if (predicate === undefined || predicate === null || predicate === true) {
    return { pass: true, reasons: [], matched: [] };
  }
  if (predicate === false) return { pass: false, reasons: ['predicate=false'], matched: [] };
  if (!isObject(predicate)) return { pass: false, reasons: ['predicate-invalid'], matched: [] };
  // Empty authored conditions mean "unconditional". Treating {} as a leaf
  // predicate silently disabled reaction rules and availability checks.
  if (Object.keys(predicate).length === 0) return { pass: true, reasons: [], matched: [] };

  if (Array.isArray(predicate.all)) {
    const results = predicate.all.map((item) => evaluatePredicate(item, state));
    return {
      pass: results.every((result) => result.pass),
      reasons: results.flatMap((result) => result.reasons),
      matched: results.flatMap((result) => result.matched)
    };
  }
  if (Array.isArray(predicate.any)) {
    const results = predicate.any.map((item) => evaluatePredicate(item, state));
    const passed = results.filter((result) => result.pass);
    return {
      pass: passed.length > 0,
      reasons: passed.length ? [] : results.flatMap((result) => result.reasons),
      matched: passed.flatMap((result) => result.matched)
    };
  }
  if (Array.isArray(predicate.none)) {
    const results = predicate.none.map((item) => evaluatePredicate(item, state));
    const blocked = results.filter((result) => result.pass);
    return { pass: blocked.length === 0, reasons: blocked.length ? ['none-clause-matched'] : [], matched: [] };
  }
  if (predicate.not !== undefined) {
    const result = evaluatePredicate(predicate.not, state);
    return { pass: !result.pass, reasons: result.pass ? ['not-clause-matched'] : [], matched: [] };
  }

  const pass = evaluateLeaf(predicate, state);
  const key = Object.keys(predicate)[0] || 'unknown';
  return { pass, reasons: pass ? [] : [`${compact(key)}-not-satisfied`], matched: pass ? [key] : [] };
}

export function predicatePasses(predicate, state = {}) {
  return evaluatePredicate(predicate, state).pass;
}

/**
 * Compatibility-free condition-set facade used by directors. It accepts the
 * same predicate AST as evaluatePredicate and returns a decision-shaped result.
 */
export function evaluateConditionSet(conditionSet, context = {}) {
  const state = context?.state || context;
  const result = evaluatePredicate(conditionSet, state);
  return {
    eligible: result.pass,
    pass: result.pass,
    reasons: result.reasons,
    matched: result.matched
  };
}

export const __predicateEvaluatorTestHooks = Object.freeze({
  compare,
  factKnown,
  eventOccurred,
  assetEarned,
  questStatus,
  countMatch
});
