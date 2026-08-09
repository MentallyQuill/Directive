import { createMissionState } from './mission-state.mjs';
import { createMissionPlayerProjection } from './player-projection.mjs';
import { validateMissionDefinition } from './mission-contracts.mjs';

export const DEFAULT_MISSION_SPOILER_TERMS = Object.freeze([
    'fraud',
    'falsif',
    'corrupt',
    'inspection',
    'hidden objective',
    'unknown objective',
]);

function asSet(value) {
    if (value instanceof Set) return new Set(value);
    return new Set(Array.isArray(value) ? value : []);
}

function effectiveObjectiveClass(objective) {
    return objective.class === 'conditional' ? objective.activatedAs : objective.class;
}

function predicateRequiresFactKnown(predicate) {
    if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) return false;
    if (typeof predicate.factKnown === 'string') return true;
    if (Array.isArray(predicate.all)) {
        return predicate.all.some((child) => predicateRequiresFactKnown(child));
    }
    if (Array.isArray(predicate.any)) {
        return predicate.any.length > 0
            && predicate.any.every((child) => predicateRequiresFactKnown(child));
    }
    return false;
}

function hasUsablePolicy(definition, targetId, claimTypes) {
    const acceptedTypes = new Set(claimTypes);
    return (definition.evidencePolicies || []).some((policy) => (
        policy.targetId === targetId
        && acceptedTypes.has(policy.claimType)
        && Array.isArray(policy.sourceRoles)
        && policy.sourceRoles.length > 0
        && Object.hasOwn(policy, 'when')
    ));
}

function lintScenarioReachability(definition, scenarioExpectations, errors) {
    for (const objective of definition.objectives || []) {
        if (effectiveObjectiveClass(objective) !== 'required') continue;
        const reachable = (scenarioExpectations || []).some((expected) => {
            const disposition = expected?.objectiveDispositions?.[objective.id];
            return disposition && objective.supportedDispositions?.includes(disposition);
        });
        if (!reachable) errors.push(`${objective.id} has no reachable terminal scenario fixture`);
    }
}

function lintEvidenceCoverage(definition, errors) {
    for (const fact of definition.facts || []) {
        if (fact.initiallyTrue !== true && !hasUsablePolicy(definition, fact.id, ['worldFactEstablished'])) {
            errors.push(`${fact.id} can never become true because it has no worldFactEstablished policy`);
        }
        if (fact.visibility !== 'hidden' && !hasUsablePolicy(definition, fact.id, ['factDisclosed'])) {
            errors.push(`${fact.id} has no usable disclosure evidence policy`);
        }
    }
    const derivedEventIds = new Set(
        (definition.clocks || []).map((clock) => clock?.consequence?.targetId).filter(Boolean),
    );
    for (const event of definition.events || []) {
        if (derivedEventIds.has(event.id)) continue;
        if (!hasUsablePolicy(definition, event.id, ['eventOccurred'])) {
            errors.push(`${event.id} has no usable event evidence policy`);
        }
    }
    for (const outcome of definition.outcomes || []) {
        if (!hasUsablePolicy(definition, outcome.id, ['outcomeObserved', 'decisionRecorded'])) {
            errors.push(`${outcome.id} has no usable outcome evidence policy`);
        }
    }
    for (const clock of definition.clocks || []) {
        if (!hasUsablePolicy(definition, clock.id, ['timeAdvanced'])) {
            errors.push(`${clock.id} has no usable authoritative-time evidence policy`);
        }
    }
}

function lintReportReachability(definition, errors) {
    for (const route of definition.reportRoutes || []) {
        const fact = (definition.facts || []).find((candidate) => candidate.id === route.factId);
        const canBecomeTrue = fact?.initiallyTrue === true
            || hasUsablePolicy(definition, route.factId, ['worldFactEstablished']);
        if (!canBecomeTrue) errors.push(`${route.id} fact can never become true: ${route.factId}`);
    }
}

export function lintMissionPackage({
    definition = {},
    knownTransitionTargetIds = [],
    scenarioExpectations = [],
    spoilerTerms = DEFAULT_MISSION_SPOILER_TERMS,
} = {}) {
    const errors = [];
    const warnings = [];
    const definitionValidation = validateMissionDefinition(definition);
    errors.push(...definitionValidation.errors.map((error) => `definition: ${error}`));
    if (!definitionValidation.ok) {
        return { ok: false, errors: [...new Set(errors)].sort(), warnings };
    }

    const initialState = createMissionState({ definition, branchId: 'lint.initial' });
    const initialProjection = createMissionPlayerProjection({ definition, state: initialState });
    const serializedProjection = JSON.stringify(initialProjection).toLowerCase();
    for (const term of spoilerTerms || []) {
        const normalized = String(term || '').toLowerCase();
        if (normalized && serializedProjection.includes(normalized)) {
            errors.push(`initial player projection contains spoiler term: ${normalized}`);
        }
    }

    lintScenarioReachability(definition, scenarioExpectations, errors);
    const knownTargets = asSet(knownTransitionTargetIds);
    for (const transition of definition.transitions || []) {
        if (!knownTargets.has(transition.target?.id)) {
            errors.push(`${transition.id} targets unknown package mission: ${transition.target?.id}`);
        }
    }
    for (const clock of definition.clocks || []) {
        if (clock.visibleWhen !== false && !predicateRequiresFactKnown(clock.visibleWhen)) {
            errors.push(`${clock.id} lacks a player-known visibility basis`);
        }
    }
    lintEvidenceCoverage(definition, errors);
    lintReportReachability(definition, errors);

    const uniqueErrors = [...new Set(errors)].sort();
    return {
        ok: uniqueErrors.length === 0,
        errors: uniqueErrors,
        warnings: [...new Set(warnings)].sort(),
    };
}
