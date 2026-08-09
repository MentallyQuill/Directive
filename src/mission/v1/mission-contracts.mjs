import { validateMissionPredicate } from './predicate-evaluator.mjs';

export const MISSION_DEFINITION_KIND = 'directive.missionDefinition.v1';
export const MISSION_EVIDENCE_CLAIM_TYPES = Object.freeze(new Set([
    'intentExpressed',
    'decisionRecorded',
    'worldFactEstablished',
    'factDisclosed',
    'eventOccurred',
    'outcomeObserved',
    'timeAdvanced',
]));
export const MISSION_EVIDENCE_POLICY_SOURCE_ROLES = Object.freeze(new Set([
    'user',
    'assistant',
    'runtime',
    'adjudicator',
]));
export const MISSION_EVIDENCE_TARGET_COLLECTION_BY_CLAIM_TYPE = Object.freeze({
    intentExpressed: 'objectives',
    decisionRecorded: 'outcomes',
    worldFactEstablished: 'facts',
    factDisclosed: 'facts',
    eventOccurred: 'events',
    outcomeObserved: 'outcomes',
    timeAdvanced: 'clocks',
});
export const MISSION_DUTY_REPORT_URGENCIES = Object.freeze(new Set(['routine', 'material', 'urgent']));
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

function byId(items) {
    return new Map((Array.isArray(items) ? items : []).filter((item) => item?.id).map((item) => [item.id, item]));
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isStableId(value) {
    return isNonEmptyString(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function targetExistsAnywhere(index, targetId) {
    return ['objectives', 'facts', 'events', 'outcomes', 'clocks']
        .some((key) => index[key].has(targetId));
}

function predicateRequiresWorldFact(predicate, targetId) {
    if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) return false;
    if (predicate.worldFact === targetId) return true;
    if (Array.isArray(predicate.all)) {
        return predicate.all.some((child) => predicateRequiresWorldFact(child, targetId));
    }
    if (Array.isArray(predicate.any)) {
        return predicate.any.length > 0
            && predicate.any.every((child) => predicateRequiresWorldFact(child, targetId));
    }
    return false;
}

function validateEvidencePolicies(definition, index, errors) {
    for (const policy of Array.isArray(definition?.evidencePolicies) ? definition.evidencePolicies : []) {
        const policyId = policy?.id || '<unknown evidence policy>';
        const claimType = policy?.claimType;
        if (!MISSION_EVIDENCE_CLAIM_TYPES.has(claimType)) {
            errors.push(`${policyId} claimType is unknown`);
        }
        if (!isStableId(policy?.targetId)) {
            errors.push(`${policyId} targetId must be a stable id`);
        } else if (!targetExistsAnywhere(index, policy.targetId)) {
            errors.push(`${policyId} references unknown target: ${policy.targetId}`);
        } else {
            const targetCollection = MISSION_EVIDENCE_TARGET_COLLECTION_BY_CLAIM_TYPE[claimType];
            if (targetCollection && !index[targetCollection].has(policy.targetId)) {
                errors.push(`${policyId} target does not match claimType ${claimType}`);
            }
        }
        if (!Array.isArray(policy?.sourceRoles) || policy.sourceRoles.length === 0) {
            errors.push(`${policyId} sourceRoles must contain at least one role`);
        } else {
            const uniqueRoles = new Set(policy.sourceRoles);
            if (uniqueRoles.size !== policy.sourceRoles.length) {
                errors.push(`${policyId} sourceRoles must not contain duplicates`);
            }
            for (const role of uniqueRoles) {
                if (!MISSION_EVIDENCE_POLICY_SOURCE_ROLES.has(role)) {
                    errors.push(`${policyId} sourceRoles contains unknown role: ${role}`);
                }
                if (role === 'user' && !new Set(['intentExpressed', 'decisionRecorded']).has(claimType)) {
                    errors.push(`${policyId} user sourceRole may only prove intentExpressed or decisionRecorded`);
                }
            }
            if (new Set(['worldFactEstablished', 'timeAdvanced']).has(claimType)) {
                const unauthorized = [...uniqueRoles].filter((role) => !new Set(['runtime', 'adjudicator']).has(role));
                if (unauthorized.length > 0) {
                    errors.push(`${policyId} ${claimType} sourceRoles must be runtime or adjudicator`);
                }
            }
        }
        const predicateResult = validateMissionPredicate(policy?.when, index);
        errors.push(...predicateResult.errors.map((error) => error.replace(/^predicate/, `${policyId}.when`)));
        if (claimType === 'factDisclosed' && !predicateRequiresWorldFact(policy?.when, policy?.targetId)) {
            errors.push(`${policyId} factDisclosed when must require its target worldFact`);
        }
    }
}

function validateStableIdArray(value, { path, requireNonEmpty = false } = {}, errors) {
    if (!Array.isArray(value) || (requireNonEmpty && value.length === 0)) {
        errors.push(`${path} must contain${requireNonEmpty ? ' at least one' : ''} stable id`);
        return;
    }
    if (new Set(value).size !== value.length) errors.push(`${path} must not contain duplicates`);
    for (const id of value) {
        if (!isStableId(id)) errors.push(`${path} contains invalid id: ${id}`);
    }
}

function validateReportRoutes(definition, index, errors) {
    for (const route of Array.isArray(definition?.reportRoutes) ? definition.reportRoutes : []) {
        const routeId = route?.id || '<unknown report route>';
        if (!index.facts.has(route?.factId)) {
            errors.push(`${routeId} references unknown fact: ${route?.factId}`);
        }
        const policy = index.evidencePolicies.get(route?.evidencePolicyId);
        if (!policy) {
            errors.push(`${routeId} references unknown evidence policy: ${route?.evidencePolicyId}`);
        } else {
            if (policy.claimType !== 'factDisclosed' || policy.targetId !== route?.factId) {
                errors.push(`${routeId} evidence policy must disclose its fact`);
            }
            if (!Array.isArray(policy.sourceRoles) || !policy.sourceRoles.includes('assistant')) {
                errors.push(`${routeId} evidence policy must authorize assistant`);
            }
        }
        validateStableIdArray(route?.capabilityRoles, {
            path: `${routeId} capabilityRoles`,
            requireNonEmpty: true,
        }, errors);
        validateStableIdArray(route?.preferredActorIds, {
            path: `${routeId} preferredActorIds`,
        }, errors);
        validateStableIdArray(route?.fallbackActorIds, {
            path: `${routeId} fallbackActorIds`,
            requireNonEmpty: true,
        }, errors);
        if (!MISSION_DUTY_REPORT_URGENCIES.has(route?.urgency)) {
            errors.push(`${routeId} urgency is unknown`);
        }
        const predicateResult = validateMissionPredicate(route?.when, index);
        errors.push(...predicateResult.errors.map((error) => error.replace(/^predicate/, `${routeId}.when`)));
        if (!isNonEmptyString(route?.playerText?.summary)) {
            errors.push(`${routeId} playerText summary is required`);
        }
    }
}

function validateDefinitionPredicates(definition, index, errors) {
    const objectiveDependencies = new Map();
    const closeObjectiveRefs = new Set();

    function validateAt(predicate, path) {
        const result = validateMissionPredicate(predicate, index);
        errors.push(...result.errors.map((error) => error.replace(/^predicate/, path)));
        return result.refs.objectives;
    }

    for (const objective of Array.isArray(definition?.objectives) ? definition.objectives : []) {
        const refs = new Set();
        for (const key of ['activationWhen', 'availableWhen', 'visibleWhen', 'progressWhen']) {
            for (const ref of validateAt(objective?.[key], `${objective?.id}.${key}`)) refs.add(ref);
        }
        for (const [terminalIndex, terminal] of (objective?.terminalWhen || []).entries()) {
            for (const ref of validateAt(terminal?.when, `${objective?.id}.terminalWhen[${terminalIndex}]`)) refs.add(ref);
        }
        objectiveDependencies.set(objective?.id, refs);
    }
    for (const dimension of Array.isArray(definition?.outcomeDimensions) ? definition.outcomeDimensions : []) {
        for (const [deriveIndex, derivation] of (dimension?.derive || []).entries()) {
            validateAt(derivation?.when, `${dimension?.id}.derive[${deriveIndex}]`);
        }
    }
    for (const clock of Array.isArray(definition?.clocks) ? definition.clocks : []) {
        for (const key of ['startWhen', 'expireWhen', 'visibleWhen']) {
            validateAt(clock?.[key], `${clock?.id}.${key}`);
        }
        for (const key of ['pauseWhen', 'resumeWhen', 'resolveWhen']) {
            if (Object.hasOwn(clock || {}, key)) validateAt(clock[key], `${clock?.id}.${key}`);
        }
    }
    for (const ref of validateAt(definition?.closeWhen, 'closeWhen')) closeObjectiveRefs.add(ref);
    for (const disposition of Array.isArray(definition?.terminalDispositions) ? definition.terminalDispositions : []) {
        validateAt(disposition?.when, `${disposition?.id}.when`);
    }
    for (const transition of Array.isArray(definition?.transitions) ? definition.transitions : []) {
        validateAt(transition?.when, `${transition?.id}.when`);
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
        evidencePolicies: byId(definition.evidencePolicies),
        reportRoutes: byId(definition.reportRoutes),
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
    if (!isStableId(definition?.packageBinding?.packageId)) {
        errors.push('packageBinding packageId must be a stable id');
    }
    if (!isNonEmptyString(definition?.packageBinding?.packageVersion)) {
        errors.push('packageBinding packageVersion must be a non-empty string');
    }
    if (!isStableId(definition?.packageBinding?.sourceId)) {
        errors.push('packageBinding sourceId must be a stable id');
    }
    if (!isNonEmptyString(definition?.playerText?.title) || !isNonEmptyString(definition?.playerText?.summary)) {
        errors.push('playerText requires a non-empty title and summary');
    }
    for (const key of [
        'objectives',
        'facts',
        'evidencePolicies',
        'reportRoutes',
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
        'evidencePolicies',
        'reportRoutes',
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
    const definitionIndex = indexMissionDefinition(definition);
    validateEvidencePolicies(definition, definitionIndex, errors);
    validateReportRoutes(definition, definitionIndex, errors);
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
        if (typeof fact?.initiallyTrue !== 'boolean') {
            errors.push(`${factId} initiallyTrue must be a boolean`);
        }
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
