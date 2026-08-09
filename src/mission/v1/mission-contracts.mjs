export const MISSION_DEFINITION_KIND = 'directive.missionDefinition.v1';
export const MISSION_OBJECTIVE_CLASSES = Object.freeze(new Set(['required', 'optional', 'conditional']));
export const MISSION_OBJECTIVE_STATES = Object.freeze(new Set(['inactive', 'available', 'inProgress', 'terminal']));
export const MISSION_OBJECTIVE_DISPOSITIONS = Object.freeze(new Set([
    'completed',
    'completedWithCost',
    'handedOff',
    'knowinglyDeclined',
    'waived',
    'failedAfterInformedAction',
    'expiredAfterKnownDeadline',
]));

const MISSION_CLOCK_STATES = new Set(['notStarted', 'running', 'paused', 'expired', 'resolved']);
const MISSION_STATUSES = new Set(['inactive', 'active', 'terminal', 'invalidated']);
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

function byId(items) {
    return new Map((Array.isArray(items) ? items : []).filter((item) => item?.id).map((item) => [item.id, item]));
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isStableId(value) {
    return isNonEmptyString(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function validateEnumMatch(value, allowedValues, path, errors) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !isNonEmptyString(value.id)) {
        errors.push(`${path} requires an id`);
        return [];
    }
    const hasEquals = Object.hasOwn(value, 'equals');
    const hasIn = Object.hasOwn(value, 'in');
    if (hasEquals === hasIn || (hasIn && (!Array.isArray(value.in) || value.in.length === 0))) {
        errors.push(`${path} requires exactly one of equals or a non-empty in array`);
        return [];
    }
    const matches = hasEquals ? [value.equals] : value.in;
    for (const match of matches) {
        if (!allowedValues.has(match)) errors.push(`${path} contains unknown value: ${match}`);
    }
    return matches;
}

function validatePredicate(predicate, index, path, errors, objectiveRefs) {
    if (typeof predicate === 'boolean') return;
    if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) {
        errors.push(`${path} must be a boolean or predicate object`);
        return;
    }
    const keys = Object.keys(predicate);
    if (keys.length !== 1 || !PREDICATE_OPERATORS.has(keys[0])) {
        errors.push(`${path} has an unknown predicate operator`);
        return;
    }
    const operator = keys[0];
    const value = predicate[operator];
    if (operator === 'all' || operator === 'any') {
        if (!Array.isArray(value) || value.length === 0) {
            errors.push(`${path}.${operator} must be a non-empty array`);
            return;
        }
        value.forEach((child, indexValue) => validatePredicate(child, index, `${path}.${operator}[${indexValue}]`, errors, objectiveRefs));
        return;
    }
    if (operator === 'not') {
        validatePredicate(value, index, `${path}.not`, errors, objectiveRefs);
        return;
    }
    if (operator === 'factKnown' || operator === 'worldFact') {
        if (!index.facts.has(value)) errors.push(`${path} references unknown fact: ${value}`);
        return;
    }
    if (operator === 'eventOccurred') {
        if (!index.events.has(value)) errors.push(`${path} references unknown event: ${value}`);
        return;
    }
    if (operator === 'outcomeIs') {
        const outcome = index.outcomes.get(value?.id);
        if (!outcome) {
            errors.push(`${path} references unknown outcome: ${value?.id}`);
            return;
        }
        validateEnumMatch(value, new Set(outcome.allowedValues || []), path, errors);
        return;
    }
    if (operator === 'objectiveState') {
        if (!index.objectives.has(value?.id)) errors.push(`${path} references unknown objective: ${value?.id}`);
        else objectiveRefs.add(value.id);
        validateEnumMatch(value, MISSION_OBJECTIVE_STATES, path, errors);
        return;
    }
    if (operator === 'objectiveDisposition') {
        const objective = index.objectives.get(value?.id);
        if (!objective) errors.push(`${path} references unknown objective: ${value?.id}`);
        else objectiveRefs.add(value.id);
        const matches = validateEnumMatch(value, MISSION_OBJECTIVE_DISPOSITIONS, path, errors);
        for (const match of matches) {
            if (objective && !objective.supportedDispositions?.includes(match)) {
                errors.push(`${path} objective disposition is not supported: ${match}`);
            }
        }
        return;
    }
    if (operator === 'clockState') {
        if (!index.clocks.has(value?.id)) errors.push(`${path} references unknown clock: ${value?.id}`);
        validateEnumMatch(value, MISSION_CLOCK_STATES, path, errors);
        return;
    }
    if (operator === 'missionStatus') {
        validateEnumMatch({ id: 'mission', ...value }, MISSION_STATUSES, path, errors);
    }
}

function validateDefinitionPredicates(definition, index, errors) {
    const objectiveDependencies = new Map();
    const closeObjectiveRefs = new Set();
    for (const objective of Array.isArray(definition?.objectives) ? definition.objectives : []) {
        const refs = new Set();
        for (const key of ['activationWhen', 'availableWhen', 'visibleWhen', 'progressWhen']) {
            validatePredicate(objective?.[key], index, `${objective?.id}.${key}`, errors, refs);
        }
        for (const [terminalIndex, terminal] of (objective?.terminalWhen || []).entries()) {
            validatePredicate(terminal?.when, index, `${objective?.id}.terminalWhen[${terminalIndex}]`, errors, refs);
        }
        objectiveDependencies.set(objective?.id, refs);
    }
    for (const dimension of Array.isArray(definition?.outcomeDimensions) ? definition.outcomeDimensions : []) {
        for (const [deriveIndex, derivation] of (dimension?.derive || []).entries()) {
            validatePredicate(derivation?.when, index, `${dimension?.id}.derive[${deriveIndex}]`, errors, new Set());
        }
    }
    for (const clock of Array.isArray(definition?.clocks) ? definition.clocks : []) {
        for (const key of ['startWhen', 'pauseWhen', 'resumeWhen', 'expireWhen', 'resolveWhen', 'visibleWhen']) {
            validatePredicate(clock?.[key], index, `${clock?.id}.${key}`, errors, new Set());
        }
    }
    validatePredicate(definition?.closeWhen, index, 'closeWhen', errors, closeObjectiveRefs);
    for (const disposition of Array.isArray(definition?.terminalDispositions) ? definition.terminalDispositions : []) {
        validatePredicate(disposition?.when, index, `${disposition?.id}.when`, errors, new Set());
    }
    for (const transition of Array.isArray(definition?.transitions) ? definition.transitions : []) {
        validatePredicate(transition?.when, index, `${transition?.id}.when`, errors, new Set());
    }
    return { objectiveDependencies, closeObjectiveRefs };
}

function findObjectiveDependencyCycle(dependencies) {
    const visited = new Set();
    const visiting = new Set();
    const stack = [];

    function visit(objectiveId) {
        if (visiting.has(objectiveId)) {
            const start = stack.indexOf(objectiveId);
            return [...stack.slice(start), objectiveId];
        }
        if (visited.has(objectiveId)) return null;
        visiting.add(objectiveId);
        stack.push(objectiveId);
        for (const dependencyId of dependencies.get(objectiveId) || []) {
            const cycle = visit(dependencyId);
            if (cycle) return cycle;
        }
        stack.pop();
        visiting.delete(objectiveId);
        visited.add(objectiveId);
        return null;
    }

    for (const objectiveId of dependencies.keys()) {
        const cycle = visit(objectiveId);
        if (cycle) return cycle;
    }
    return null;
}

export function indexMissionDefinition(definition = {}) {
    return {
        objectives: byId(definition.objectives),
        facts: byId(definition.facts),
        events: byId(definition.events),
        outcomes: byId(definition.outcomes),
        clocks: byId(definition.clocks),
        terminalDispositions: byId(definition.terminalDispositions),
        transitions: byId(definition.transitions),
    };
}

export function validateMissionDefinition(definition = {}) {
    const errors = [];
    if (definition?.kind !== MISSION_DEFINITION_KIND) {
        errors.push(`kind must be ${MISSION_DEFINITION_KIND}`);
    }
    if (definition?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!isStableId(definition?.id)) errors.push('mission id must be a stable id');
    if (!isNonEmptyString(definition?.version)) errors.push('version must be a non-empty string');
    if (!isNonEmptyString(definition?.playerText?.title) || !isNonEmptyString(definition?.playerText?.summary)) {
        errors.push('playerText requires a non-empty title and summary');
    }
    for (const key of [
        'objectives',
        'facts',
        'events',
        'outcomes',
        'outcomeDimensions',
        'clocks',
        'terminalDispositions',
        'transitions',
    ]) {
        if (!Array.isArray(definition?.[key])) errors.push(`${key} must be an array`);
    }
    const ids = new Set();
    for (const key of [
        'objectives',
        'facts',
        'events',
        'outcomes',
        'outcomeDimensions',
        'clocks',
        'terminalDispositions',
        'transitions',
    ]) {
        for (const item of Array.isArray(definition?.[key]) ? definition[key] : []) {
            if (!isStableId(item?.id)) errors.push(`${key} item requires a stable id`);
            if (ids.has(item?.id)) errors.push(`duplicate id: ${item.id}`);
            ids.add(item?.id);
        }
    }
    const factsById = byId(definition?.facts);
    const factIds = new Set(factsById.keys());
    for (const objective of Array.isArray(definition?.objectives) ? definition.objectives : []) {
        const objectiveId = objective?.id || '<unknown objective>';
        if (!MISSION_OBJECTIVE_CLASSES.has(objective?.class)) {
            errors.push(`${objectiveId} class is unknown`);
        }
        if (objective?.class === 'conditional') {
            if (!new Set(['required', 'optional']).has(objective?.activatedAs)) {
                errors.push(`${objectiveId} activatedAs must be required or optional`);
            }
        } else if (objective?.activatedAs !== null) {
            errors.push(`${objectiveId} activatedAs must be null unless class is conditional`);
        }
        if (objective?.class === 'conditional' && objective?.activatedAs === 'required') {
            const route = objective.activationRoute;
            if (!route || route.mandatory !== true || route.playerVisible !== true) {
                errors.push(`${objectiveId} conditional-required objective needs a mandatory player-visible activation route`);
            } else if (!factIds.has(route.factId)) {
                errors.push(`${objectiveId} activation route references unknown fact: ${route.factId}`);
            } else if (factsById.get(route.factId)?.visibility === 'hidden') {
                errors.push(`${objectiveId} activation route fact must be player-visible`);
            }
        }
        if (!Array.isArray(objective?.supportedDispositions)) {
            errors.push(`${objectiveId} supportedDispositions must be an array`);
        } else {
            for (const disposition of objective.supportedDispositions) {
                if (!MISSION_OBJECTIVE_DISPOSITIONS.has(disposition)) {
                    errors.push(`${objectiveId} has unknown disposition: ${disposition}`);
                }
            }
        }
        if (!Array.isArray(objective?.terminalWhen)) {
            errors.push(`${objectiveId} terminalWhen must be an array`);
        } else {
            const requiresTerminalRule = objective?.class === 'required'
                || (objective?.class === 'conditional' && objective?.activatedAs === 'required');
            if (requiresTerminalRule && objective.terminalWhen.length === 0) {
                errors.push(`${objectiveId} required objective has no terminal rule`);
            }
            for (const terminal of objective.terminalWhen) {
                if (!objective.supportedDispositions?.includes(terminal?.disposition)) {
                    errors.push(`${objectiveId} terminal disposition ${terminal?.disposition} is not supported`);
                }
            }
        }
        if (!isNonEmptyString(objective?.playerText?.title) || !isNonEmptyString(objective?.playerText?.summary)) {
            errors.push(`${objectiveId} playerText requires a non-empty title and summary`);
        }
    }
    for (const fact of Array.isArray(definition?.facts) ? definition.facts : []) {
        const factId = fact?.id || '<unknown fact>';
        if (!new Set(['known', 'discoverable', 'hidden']).has(fact?.visibility)) {
            errors.push(`${factId} visibility is unknown`);
        }
        if (fact?.visibility !== 'hidden' && !isNonEmptyString(fact?.playerText?.summary)) {
            errors.push(`${factId} playerText summary is required when potentially visible`);
        }
    }
    for (const event of Array.isArray(definition?.events) ? definition.events : []) {
        const eventId = event?.id || '<unknown event>';
        if (!new Set(['visible', 'hidden']).has(event?.playerVisibility)) {
            errors.push(`${eventId} playerVisibility is unknown`);
        }
        if (event?.playerVisibility === 'visible' && !isNonEmptyString(event?.playerText?.summary)) {
            errors.push(`${eventId} playerText summary is required when visible`);
        }
    }
    for (const outcome of Array.isArray(definition?.outcomes) ? definition.outcomes : []) {
        const outcomeId = outcome?.id || '<unknown outcome>';
        if (!Array.isArray(outcome?.allowedValues) || outcome.allowedValues.length === 0) {
            errors.push(`${outcomeId} allowedValues must be a non-empty array`);
        } else if (!outcome.allowedValues.includes(outcome.initialValue)) {
            errors.push(`${outcomeId} initialValue must be in allowedValues`);
        }
        if (!new Set(['visible', 'hidden']).has(outcome?.playerVisibility)) {
            errors.push(`${outcomeId} playerVisibility is unknown`);
        }
    }
    for (const dimension of Array.isArray(definition?.outcomeDimensions) ? definition.outcomeDimensions : []) {
        const dimensionId = dimension?.id || '<unknown outcome dimension>';
        if (!Array.isArray(dimension?.derive) || dimension.derive.length === 0) {
            errors.push(`${dimensionId} derive must be a non-empty array`);
        }
        if (!isNonEmptyString(dimension?.playerText?.label)) {
            errors.push(`${dimensionId} playerText label is required`);
        }
    }
    for (const clock of Array.isArray(definition?.clocks) ? definition.clocks : []) {
        const clockId = clock?.id || '<unknown clock>';
        if (!isNonEmptyString(clock?.unit)) errors.push(`${clockId} unit is required`);
        if (!new Set(['down', 'up']).has(clock?.direction)) errors.push(`${clockId} direction must be down or up`);
        if (!Number.isFinite(clock?.initialValue)) errors.push(`${clockId} initialValue must be finite`);
        if (!Array.isArray(clock?.advanceSources) || clock.advanceSources.length === 0 || clock.advanceSources.some((source) => !isNonEmptyString(source))) {
            errors.push(`${clockId} advanceSources must contain at least one authoritative source`);
        }
        for (const predicateKey of ['startWhen', 'expireWhen', 'visibleWhen']) {
            if (!Object.hasOwn(clock || {}, predicateKey)) errors.push(`${clockId} ${predicateKey} is required`);
        }
        if (!isNonEmptyString(clock?.consequence?.effectType) || !isNonEmptyString(clock?.consequence?.targetId)) {
            errors.push(`${clockId} consequence requires effectType and targetId`);
        }
        if (
            !isNonEmptyString(clock?.playerText?.label)
            || !isNonEmptyString(clock?.playerText?.deadline)
            || !isNonEmptyString(clock?.playerText?.consequence)
        ) {
            errors.push(`${clockId} playerText requires label, deadline, and consequence`);
        }
    }
    const terminalPriorities = new Set();
    if (Array.isArray(definition?.terminalDispositions) && definition.terminalDispositions.length === 0) {
        errors.push('mission requires at least one terminal disposition');
    }
    for (const disposition of Array.isArray(definition?.terminalDispositions) ? definition.terminalDispositions : []) {
        const dispositionId = disposition?.id || '<unknown terminal disposition>';
        if (!Number.isInteger(disposition?.priority)) {
            errors.push(`${dispositionId} priority must be an integer`);
        } else if (terminalPriorities.has(disposition.priority)) {
            errors.push(`ambiguous terminal disposition priority ${disposition.priority}`);
        }
        terminalPriorities.add(disposition?.priority);
        if (!isNonEmptyString(disposition?.playerText?.title) || !isNonEmptyString(disposition?.playerText?.summary)) {
            errors.push(`${dispositionId} playerText requires a non-empty title and summary`);
        }
    }
    const transitionPriorities = new Set();
    for (const transition of Array.isArray(definition?.transitions) ? definition.transitions : []) {
        const transitionId = transition?.id || '<unknown transition>';
        if (!Number.isInteger(transition?.priority)) {
            errors.push(`${transitionId} priority must be an integer`);
        } else if (transitionPriorities.has(transition.priority)) {
            errors.push(`ambiguous transition priority ${transition.priority}`);
        }
        transitionPriorities.add(transition?.priority);
        if (!new Set(['phase', 'mission']).has(transition?.target?.kind)) {
            errors.push(`${transitionId} target kind must be phase or mission`);
        }
        if (!isNonEmptyString(transition?.target?.id)) errors.push(`${transitionId} target id is required`);
        if (!isNonEmptyString(transition?.target?.playerSafeSetup)) {
            errors.push(`${transitionId} target playerSafeSetup is required`);
        }
        if (!Array.isArray(transition?.mustNarrate) || transition.mustNarrate.some((item) => !isNonEmptyString(item))) {
            errors.push(`${transitionId} mustNarrate must be an array of non-empty strings`);
        }
        if (!Array.isArray(transition?.mustNotReveal) || transition.mustNotReveal.some((item) => !isNonEmptyString(item))) {
            errors.push(`${transitionId} mustNotReveal must be an array of non-empty strings`);
        }
    }
    const { objectiveDependencies, closeObjectiveRefs } = validateDefinitionPredicates(
        definition,
        indexMissionDefinition(definition),
        errors,
    );
    const objectivesById = byId(definition?.objectives);
    for (const objectiveId of closeObjectiveRefs) {
        const objective = objectivesById.get(objectiveId);
        const participatesInClosure = objective?.class === 'required'
            || (objective?.class === 'conditional' && objective?.activatedAs === 'required');
        if (!participatesInClosure) {
            errors.push(`${objectiveId} optional objective cannot participate in closeWhen`);
        }
    }
    for (const objective of objectivesById.values()) {
        const mustParticipate = objective?.class === 'required'
            || (objective?.class === 'conditional' && objective?.activatedAs === 'required');
        if (mustParticipate && !closeObjectiveRefs.has(objective.id)) {
            errors.push(`${objective.id} required objective is not represented in closeWhen`);
        }
    }
    const cycle = findObjectiveDependencyCycle(objectiveDependencies);
    if (cycle) errors.push(`objective dependency cycle: ${cycle.join(' -> ')}`);
    return { ok: errors.length === 0, errors };
}
