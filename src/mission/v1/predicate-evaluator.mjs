const PREDICATE_OPERATORS = new Set([
    'all',
    'any',
    'not',
    'factKnown',
    'worldFact',
    'eventOccurred',
    'outcomeIs',
    'objectiveState',
    'objectiveDisposition',
    'clockState',
    'missionStatus',
]);
const OBJECTIVE_STATES = new Set(['inactive', 'available', 'inProgress', 'terminal']);
const OBJECTIVE_DISPOSITIONS = new Set([
    'completed',
    'completedWithCost',
    'handedOff',
    'knowinglyDeclined',
    'waived',
    'failedAfterInformedAction',
    'expiredAfterKnownDeadline',
]);
const CLOCK_STATES = new Set(['notStarted', 'running', 'paused', 'expired', 'resolved']);
const MISSION_STATUSES = new Set(['inactive', 'active', 'terminal', 'invalidated']);

function createRefs() {
    return {
        facts: new Set(),
        events: new Set(),
        outcomes: new Set(),
        objectives: new Set(),
        clocks: new Set(),
    };
}

function validateMatch(value, allowedValues, path, errors) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || value.id.length === 0) {
        errors.push(`${path} requires an id`);
        return [];
    }
    const keys = Object.keys(value);
    if (keys.some((key) => !new Set(['id', 'equals', 'in']).has(key))) {
        errors.push(`${path} contains an unknown match field`);
    }
    const hasEquals = Object.hasOwn(value, 'equals');
    const hasIn = Object.hasOwn(value, 'in');
    if (hasEquals === hasIn || (hasIn && (!Array.isArray(value.in) || value.in.length === 0))) {
        errors.push(`${path} requires exactly one of equals or in`);
        return [];
    }
    const candidates = hasEquals ? [value.equals] : value.in;
    for (const candidate of candidates) {
        if (!allowedValues.has(candidate)) errors.push(`${path} contains unknown value: ${candidate}`);
    }
    return candidates;
}

function validateNode(predicate, index, path, errors, refs) {
    if (typeof predicate === 'boolean') return;
    if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) {
        errors.push(`${path} must be a boolean or predicate object`);
        return;
    }
    const keys = Object.keys(predicate);
    if (keys.length !== 1) {
        errors.push(`${path} must contain exactly one predicate operator`);
        return;
    }
    const operator = keys[0];
    if (!PREDICATE_OPERATORS.has(operator)) {
        errors.push(`${path} has an unknown predicate operator: ${operator}`);
        return;
    }
    const value = predicate[operator];
    if (operator === 'all' || operator === 'any') {
        if (!Array.isArray(value) || value.length === 0) {
            errors.push(`${path}.${operator} must be a non-empty array`);
            return;
        }
        value.forEach((child, childIndex) => validateNode(child, index, `${path}.${operator}[${childIndex}]`, errors, refs));
        return;
    }
    if (operator === 'not') {
        validateNode(value, index, `${path}.not`, errors, refs);
        return;
    }
    if (operator === 'factKnown' || operator === 'worldFact') {
        refs.facts.add(value);
        if (!index?.facts?.has(value)) errors.push(`${path} references unknown fact: ${value}`);
        return;
    }
    if (operator === 'eventOccurred') {
        refs.events.add(value);
        if (!index?.events?.has(value)) errors.push(`${path} references unknown event: ${value}`);
        return;
    }
    if (operator === 'outcomeIs') {
        refs.outcomes.add(value?.id);
        const outcome = index?.outcomes?.get(value?.id);
        if (!outcome) errors.push(`${path} references unknown outcome: ${value?.id}`);
        validateMatch(value, new Set(outcome?.allowedValues || []), path, errors);
        return;
    }
    if (operator === 'objectiveState' || operator === 'objectiveDisposition') {
        refs.objectives.add(value?.id);
        const objective = index?.objectives?.get(value?.id);
        if (!objective) errors.push(`${path} references unknown objective: ${value?.id}`);
        const allowed = operator === 'objectiveState' ? OBJECTIVE_STATES : OBJECTIVE_DISPOSITIONS;
        const candidates = validateMatch(value, allowed, path, errors);
        if (operator === 'objectiveDisposition' && objective) {
            for (const candidate of candidates) {
                if (!objective.supportedDispositions?.includes(candidate)) {
                    errors.push(`${path} objective disposition is not supported: ${candidate}`);
                }
            }
        }
        return;
    }
    if (operator === 'clockState') {
        refs.clocks.add(value?.id);
        if (!index?.clocks?.has(value?.id)) errors.push(`${path} references unknown clock: ${value?.id}`);
        validateMatch(value, CLOCK_STATES, path, errors);
        return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path} missionStatus must be an object`);
        return;
    }
    if (Object.keys(value).some((key) => !new Set(['equals', 'in']).has(key))) {
        errors.push(`${path} contains an unknown match field`);
    }
    const missionMatch = { id: 'mission', ...value };
    validateMatch(missionMatch, MISSION_STATUSES, path, errors);
}

function collectRefsNode(predicate, refs) {
    if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) return;
    if (Array.isArray(predicate.all)) predicate.all.forEach((child) => collectRefsNode(child, refs));
    if (Array.isArray(predicate.any)) predicate.any.forEach((child) => collectRefsNode(child, refs));
    if (Object.hasOwn(predicate, 'not')) collectRefsNode(predicate.not, refs);
    if (Object.hasOwn(predicate, 'factKnown')) refs.facts.add(predicate.factKnown);
    if (Object.hasOwn(predicate, 'worldFact')) refs.facts.add(predicate.worldFact);
    if (Object.hasOwn(predicate, 'eventOccurred')) refs.events.add(predicate.eventOccurred);
    if (Object.hasOwn(predicate, 'outcomeIs')) refs.outcomes.add(predicate.outcomeIs?.id);
    if (Object.hasOwn(predicate, 'objectiveState')) refs.objectives.add(predicate.objectiveState?.id);
    if (Object.hasOwn(predicate, 'objectiveDisposition')) refs.objectives.add(predicate.objectiveDisposition?.id);
    if (Object.hasOwn(predicate, 'clockState')) refs.clocks.add(predicate.clockState?.id);
}

export function collectMissionPredicateRefs(predicate) {
    const refs = createRefs();
    collectRefsNode(predicate, refs);
    return refs;
}

export function validateMissionPredicate(predicate, index = {}) {
    const errors = [];
    const refs = createRefs();
    validateNode(predicate, index, 'predicate', errors, refs);
    return { ok: errors.length === 0, errors, refs };
}

function recordReason(reasons, operator, reference, value) {
    reasons.push(`${operator}:${reference}=${value}`);
    return value;
}

function hasValue(collection, id) {
    if (collection instanceof Set || collection instanceof Map) return collection.has(id);
    if (Array.isArray(collection)) return collection.includes(id);
    return Boolean(collection?.[id]);
}

function getValue(collection, id) {
    if (collection instanceof Map) return collection.get(id);
    return collection?.[id];
}

function evaluateNode(predicate, context, reasons) {
    if (typeof predicate === 'boolean') return predicate;
    if (Object.hasOwn(predicate, 'all')) {
        return predicate.all.every((child) => evaluateNode(child, context, reasons));
    }
    if (Object.hasOwn(predicate, 'any')) {
        return predicate.any.some((child) => evaluateNode(child, context, reasons));
    }
    if (Object.hasOwn(predicate, 'not')) return !evaluateNode(predicate.not, context, reasons);
    if (Object.hasOwn(predicate, 'factKnown')) {
        return recordReason(reasons, 'factKnown', predicate.factKnown, hasValue(context.knownFacts, predicate.factKnown));
    }
    if (Object.hasOwn(predicate, 'worldFact')) {
        return recordReason(reasons, 'worldFact', predicate.worldFact, hasValue(context.worldFacts, predicate.worldFact));
    }
    if (Object.hasOwn(predicate, 'eventOccurred')) {
        return recordReason(reasons, 'eventOccurred', predicate.eventOccurred, hasValue(context.events, predicate.eventOccurred));
    }
    if (Object.hasOwn(predicate, 'outcomeIs')) {
        return recordReason(
            reasons,
            'outcomeIs',
            predicate.outcomeIs.id,
            matches(getValue(context.outcomes, predicate.outcomeIs.id), predicate.outcomeIs),
        );
    }
    if (Object.hasOwn(predicate, 'objectiveState')) {
        return recordReason(
            reasons,
            'objectiveState',
            predicate.objectiveState.id,
            matches(getValue(context.objectives, predicate.objectiveState.id)?.state, predicate.objectiveState),
        );
    }
    if (Object.hasOwn(predicate, 'objectiveDisposition')) {
        return recordReason(
            reasons,
            'objectiveDisposition',
            predicate.objectiveDisposition.id,
            matches(
                getValue(context.objectives, predicate.objectiveDisposition.id)?.disposition,
                predicate.objectiveDisposition,
            ),
        );
    }
    if (Object.hasOwn(predicate, 'clockState')) {
        return recordReason(
            reasons,
            'clockState',
            predicate.clockState.id,
            matches(getValue(context.clocks, predicate.clockState.id)?.state, predicate.clockState),
        );
    }
    if (Object.hasOwn(predicate, 'missionStatus')) {
        return recordReason(reasons, 'missionStatus', 'mission', matches(context.missionStatus, predicate.missionStatus));
    }
    return false;
}

function matches(actual, expected) {
    if (Object.hasOwn(expected, 'equals')) return actual === expected.equals;
    return expected.in.includes(actual);
}

export function evaluateMissionPredicate(predicate, context = {}) {
    const validation = validateMissionPredicate(predicate, context.index);
    if (!validation.ok) {
        return {
            ok: false,
            value: false,
            reasons: [],
            errors: validation.errors,
        };
    }
    const reasons = [];
    return {
        ok: true,
        value: evaluateNode(predicate, context, reasons),
        reasons,
        errors: [],
    };
}
