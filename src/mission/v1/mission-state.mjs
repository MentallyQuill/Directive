import { indexMissionDefinition } from './mission-contracts.mjs';
import { evaluateMissionPredicate } from './predicate-evaluator.mjs';

export const MISSION_STATE_KIND = 'directive.missionState.v1';

export function missionStateContext(definition, state) {
    return {
        index: indexMissionDefinition(definition),
        knownFacts: new Set(state.knownFacts || []),
        worldFacts: new Set(state.worldFacts || []),
        events: new Set(state.events || []),
        outcomes: new Map(Object.entries(state.outcomes || {})),
        objectives: new Map(Object.entries(state.objectives || {})),
        clocks: new Map(Object.entries(state.clocks || {})),
        missionStatus: state.status,
    };
}

function predicateValue(predicate, definition, state) {
    const result = evaluateMissionPredicate(predicate, missionStateContext(definition, state));
    if (!result.ok) throw new TypeError(result.errors.join('\n'));
    return result.value;
}

export function createMissionState({ definition = {}, branchId = 'main' } = {}) {
    const state = {
        kind: MISSION_STATE_KIND,
        schemaVersion: 1,
        definitionId: definition.id,
        definitionVersion: definition.version,
        branchId,
        revision: 0,
        status: 'active',
        objectives: {},
        knownFacts: [],
        worldFacts: [],
        events: [],
        outcomes: Object.fromEntries((definition.outcomes || []).map((outcome) => [outcome.id, outcome.initialValue])),
        clocks: Object.fromEntries((definition.clocks || []).map((clock) => [clock.id, {
            state: 'notStarted',
            value: clock.initialValue,
            visibility: 'hidden',
            lastAdvancementEvidenceKey: null,
            expiryApplied: false,
        }])),
        outcomeDimensions: {},
        acceptedEvidenceKeys: [],
        evidenceLog: [],
        invalidatedSourceContributionIds: [],
        terminalDisposition: null,
        transitionReceipt: null,
    };

    for (const objective of definition.objectives || []) {
        state.objectives[objective.id] = {
            state: 'inactive',
            visibility: 'hidden',
            disposition: null,
        };
    }
    for (const objective of definition.objectives || []) {
        const active = predicateValue(objective.activationWhen, definition, state);
        const available = active && predicateValue(objective.availableWhen, definition, state);
        const visible = active && predicateValue(objective.visibleWhen, definition, state);
        state.objectives[objective.id] = {
            state: available ? 'available' : 'inactive',
            visibility: visible ? 'visible' : 'hidden',
            disposition: null,
        };
    }
    for (const clock of definition.clocks || []) {
        const running = predicateValue(clock.startWhen, definition, state);
        const visible = predicateValue(clock.visibleWhen, definition, state);
        state.clocks[clock.id].state = running ? 'running' : 'notStarted';
        state.clocks[clock.id].visibility = visible ? 'visible' : 'hidden';
    }
    return state;
}
