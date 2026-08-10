import { indexMissionDefinition, MISSION_OBJECTIVE_STATES } from './mission-contracts.mjs';
import { evaluateMissionPredicate } from './predicate-evaluator.mjs';
import {
    cloneMissionEntryContext,
    emptyMissionEntryContext,
    validateMissionEntryContext,
} from './mission-entry-capabilities.mjs';

export const MISSION_STATE_KIND = 'directive.missionState.v1';

const MISSION_STATUSES = new Set(['active', 'terminal']);
const OBJECTIVE_VISIBILITIES = new Set(['hidden', 'visible', 'resolved']);
const CLOCK_STATES = new Set(['notStarted', 'running', 'paused', 'expired', 'resolved']);
const CLOCK_VISIBILITIES = new Set(['hidden', 'visible']);

function isStableId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function validateUniqueDefinitionIds(values, index, label, errors) {
    if (!Array.isArray(values)) {
        errors.push(`${label} must be an array`);
        return;
    }
    if (new Set(values).size !== values.length) errors.push(`${label} must be unique`);
    for (const value of values) {
        if (!index.has(value)) errors.push(`${label} contains unknown id: ${value}`);
    }
}

function validateExactRecordKeys(record, expectedIds, label, errors) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        errors.push(`${label} must be an object`);
        return false;
    }
    const actualIds = Object.keys(record);
    for (const id of expectedIds) {
        if (!Object.hasOwn(record, id)) errors.push(`${label} is missing ${id}`);
    }
    for (const id of actualIds) {
        if (!expectedIds.has(id)) errors.push(`${label} contains unknown id: ${id}`);
    }
    return true;
}

export function validateMissionState({ definition = {}, state = {} } = {}) {
    const errors = [];
    const index = indexMissionDefinition(definition);
    if (state?.kind !== MISSION_STATE_KIND) errors.push(`kind must be ${MISSION_STATE_KIND}`);
    if (state?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!isStableId(state?.branchId)) errors.push('branchId must be a stable id');
    if (!Number.isInteger(state?.revision) || state.revision < 0) {
        errors.push('revision must be a non-negative integer');
    }
    if (!MISSION_STATUSES.has(state?.status)) errors.push('status is unknown');

    const entryContext = validateMissionEntryContext({
        definition,
        entryContext: state?.entryContext,
    });
    errors.push(...entryContext.errors);

    const objectiveIds = new Set(index.objectives.keys());
    if (validateExactRecordKeys(state?.objectives, objectiveIds, 'objectives', errors)) {
        for (const [objectiveId, objective] of index.objectives.entries()) {
            const record = state.objectives[objectiveId];
            if (!record || typeof record !== 'object' || Array.isArray(record)) {
                errors.push(`objectives.${objectiveId} must be an object`);
                continue;
            }
            if (!MISSION_OBJECTIVE_STATES.has(record.state)) {
                errors.push(`objectives.${objectiveId} state is unknown`);
            }
            if (!OBJECTIVE_VISIBILITIES.has(record.visibility)) {
                errors.push(`objectives.${objectiveId} visibility is unknown`);
            }
            const dispositions = new Set((objective.terminalWhen || []).map((item) => item.disposition));
            if (record.state === 'terminal') {
                if (!dispositions.has(record.disposition)) {
                    errors.push(`objectives.${objectiveId} terminal disposition is invalid`);
                }
                if (record.visibility === 'visible') {
                    errors.push(`objectives.${objectiveId} terminal visibility cannot remain visible`);
                }
            } else if (record.disposition !== null) {
                errors.push(`objectives.${objectiveId} non-terminal disposition must be null`);
            } else if (record.visibility === 'resolved') {
                errors.push(`objectives.${objectiveId} resolved visibility requires terminal state`);
            }
        }
    }

    validateUniqueDefinitionIds(state?.knownFacts, index.facts, 'knownFacts', errors);
    validateUniqueDefinitionIds(state?.worldFacts, index.facts, 'worldFacts', errors);
    validateUniqueDefinitionIds(state?.events, index.events, 'events', errors);

    const outcomeIds = new Set(index.outcomes.keys());
    if (validateExactRecordKeys(state?.outcomes, outcomeIds, 'outcomes', errors)) {
        for (const [outcomeId, outcome] of index.outcomes.entries()) {
            if (!(outcome.allowedValues || []).includes(state.outcomes[outcomeId])) {
                errors.push(`outcomes.${outcomeId} value is not authored`);
            }
        }
    }

    const clockIds = new Set(index.clocks.keys());
    if (validateExactRecordKeys(state?.clocks, clockIds, 'clocks', errors)) {
        for (const clockId of clockIds) {
            const clock = state.clocks[clockId];
            if (!clock || typeof clock !== 'object' || Array.isArray(clock)) {
                errors.push(`clocks.${clockId} must be an object`);
                continue;
            }
            if (!CLOCK_STATES.has(clock.state)) errors.push(`clocks.${clockId} state is unknown`);
            if (!CLOCK_VISIBILITIES.has(clock.visibility)) errors.push(`clocks.${clockId} visibility is unknown`);
            if (!Number.isFinite(clock.value)) errors.push(`clocks.${clockId} value must be finite`);
            if (clock.lastAdvancementEvidenceKey !== null
                && typeof clock.lastAdvancementEvidenceKey !== 'string') {
                errors.push(`clocks.${clockId} lastAdvancementEvidenceKey must be null or a string`);
            }
            if (typeof clock.expiryApplied !== 'boolean') {
                errors.push(`clocks.${clockId} expiryApplied must be boolean`);
            }
        }
    }

    if (!state?.outcomeDimensions || typeof state.outcomeDimensions !== 'object'
        || Array.isArray(state.outcomeDimensions)) {
        errors.push('outcomeDimensions must be an object');
    } else {
        for (const [dimensionId, value] of Object.entries(state.outcomeDimensions)) {
            const dimension = index.outcomeDimensions.get(dimensionId);
            if (!dimension) {
                errors.push(`outcomeDimensions contains unknown id: ${dimensionId}`);
            } else if (!new Set((dimension.derive || []).map((item) => item.value)).has(value)) {
                errors.push(`outcomeDimensions.${dimensionId} value is not authored`);
            }
        }
    }

    for (const field of ['acceptedEvidenceKeys', 'evidenceLog', 'invalidatedSourceContributionIds']) {
        if (!Array.isArray(state?.[field])) errors.push(`${field} must be an array`);
    }
    if (Array.isArray(state?.acceptedEvidenceKeys)
        && new Set(state.acceptedEvidenceKeys).size !== state.acceptedEvidenceKeys.length) {
        errors.push('acceptedEvidenceKeys must be unique');
    }
    if (Array.isArray(state?.invalidatedSourceContributionIds)
        && new Set(state.invalidatedSourceContributionIds).size !== state.invalidatedSourceContributionIds.length) {
        errors.push('invalidatedSourceContributionIds must be unique');
    }

    if (state?.status === 'active') {
        if (state.terminalDisposition !== null) errors.push('active mission terminalDisposition must be null');
        if (state.transitionReceipt !== null) errors.push('active mission transitionReceipt must be null');
    } else if (state?.status === 'terminal') {
        if (!index.terminalDispositions.has(state.terminalDisposition)) {
            errors.push('terminalDisposition is not authored');
        }
        const receipt = state.transitionReceipt;
        const transition = index.transitions.get(receipt?.transitionId);
        if (!receipt || typeof receipt !== 'object' || !transition) {
            errors.push('terminal mission requires an authored transitionReceipt');
        } else {
            if (receipt.kind !== 'directive.missionTransitionReceipt.v1') {
                errors.push('transitionReceipt kind is invalid');
            }
            if (!Number.isInteger(receipt.committedAtRevision)
                || receipt.committedAtRevision < 0
                || receipt.committedAtRevision > state.revision) {
                errors.push('transitionReceipt committedAtRevision is invalid');
            }
            if (JSON.stringify(receipt.target) !== JSON.stringify(transition.target)) {
                errors.push('transitionReceipt target does not match authored transition');
            }
            if (receipt.packet?.sourceMissionId !== definition.id
                || receipt.packet?.sourceDisposition !== state.terminalDisposition
                || JSON.stringify(receipt.packet?.next) !== JSON.stringify(transition.target)) {
                errors.push('transitionReceipt packet does not match current mission authority');
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

export function missionStateContext(definition, state) {
    return {
        index: indexMissionDefinition(definition),
        entryCapabilities: new Set((state.entryContext?.capabilities || []).map((capability) => capability.id)),
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

export function createMissionState({ definition = {}, branchId = 'main', entryContext } = {}) {
    const state = {
        kind: MISSION_STATE_KIND,
        schemaVersion: 1,
        definitionId: definition.id,
        definitionVersion: definition.version,
        packageBinding: structuredClone(definition.packageBinding),
        branchId,
        revision: 0,
        status: 'active',
        objectives: {},
        knownFacts: (definition.facts || [])
            .filter((fact) => fact.initiallyTrue === true && fact.visibility === 'known')
            .map((fact) => fact.id),
        worldFacts: (definition.facts || [])
            .filter((fact) => fact.initiallyTrue === true)
            .map((fact) => fact.id),
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

    if (Array.isArray(definition.entryCapabilities) && definition.entryCapabilities.length > 0) {
        const normalizedEntryContext = entryContext === undefined
            ? emptyMissionEntryContext()
            : cloneMissionEntryContext(entryContext);
        const validation = validateMissionEntryContext({
            definition,
            entryContext: normalizedEntryContext,
        });
        if (!validation.ok) throw new TypeError(validation.errors.join('\n'));
        state.entryContext = normalizedEntryContext;
    } else if (entryContext !== undefined) {
        throw new TypeError('entryContext is not authored for this mission');
    }

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
