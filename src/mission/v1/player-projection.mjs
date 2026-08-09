import { indexMissionDefinition } from './mission-contracts.mjs';

export const MISSION_PLAYER_PROJECTION_KIND = 'directive.missionPlayerProjection.v1';

function effectiveObjectiveClass(objective) {
    return objective.class === 'conditional' ? objective.activatedAs : objective.class;
}

function terminalObjectiveText(objective, disposition) {
    return objective?.playerText?.terminal
        ?.find((item) => item.disposition === disposition)?.text || null;
}

function projectObjective(objective, objectiveState) {
    const disposition = objectiveState.disposition || null;
    return {
        id: objective.id,
        class: effectiveObjectiveClass(objective),
        status: objectiveState.state,
        disposition,
        title: objective.playerText.title,
        summary: objective.playerText.summary,
        terminalText: disposition ? terminalObjectiveText(objective, disposition) : null,
    };
}

function progressFor(objectives) {
    const required = objectives.filter((objective) => objective.class === 'required');
    const optional = objectives.filter((objective) => objective.class === 'optional');
    return {
        requiredCompleted: required.filter((objective) => objective.status === 'terminal').length,
        requiredTotal: required.length,
        optionalCompleted: optional.filter((objective) => objective.status === 'terminal').length,
        optionalTotal: optional.length,
    };
}

function projectFacts(definition, state) {
    const knownFacts = new Set(state.knownFacts || []);
    return (definition.facts || [])
        .filter((fact) => fact.visibility !== 'hidden' && knownFacts.has(fact.id))
        .map((fact) => ({
            id: fact.id,
            summary: fact.playerText.summary,
        }));
}

function projectClocks(definition, state) {
    return (definition.clocks || [])
        .filter((clock) => state.clocks?.[clock.id]?.visibility === 'visible')
        .map((clock) => {
            const clockState = state.clocks[clock.id];
            return {
                id: clock.id,
                label: clock.playerText.label,
                unit: clock.unit,
                value: clockState.value,
                status: clockState.state,
                deadline: clock.playerText.deadline.replaceAll('{value}', String(clockState.value)),
                consequence: clock.playerText.consequence,
            };
        });
}

function projectOutcomeDimensions(definition, state) {
    return (definition.outcomeDimensions || [])
        .filter((dimension) => Object.hasOwn(state.outcomeDimensions || {}, dimension.id))
        .map((dimension) => ({
            id: dimension.id,
            label: dimension.playerText.label,
            value: state.outcomeDimensions[dimension.id],
        }));
}

function projectTerminal(definition, state, index) {
    if (state.status !== 'terminal' || !state.terminalDisposition) return null;
    const terminal = index.terminalDispositions.get(state.terminalDisposition);
    if (!terminal) return null;
    const target = state.transitionReceipt?.target || null;
    return {
        disposition: terminal.id,
        title: terminal.playerText.title,
        summary: terminal.playerText.summary,
        next: target ? {
            kind: target.kind,
            id: target.id,
            summary: target.playerSafeSetup,
        } : null,
    };
}

export function createMissionPlayerProjection({ definition = {}, state = {} } = {}) {
    const index = indexMissionDefinition(definition);
    const objectives = (definition.objectives || [])
        .filter((objective) => new Set(['visible', 'resolved']).has(state.objectives?.[objective.id]?.visibility))
        .map((objective) => projectObjective(objective, state.objectives[objective.id]));
    return {
        kind: MISSION_PLAYER_PROJECTION_KIND,
        missionId: definition.id,
        definitionVersion: definition.version,
        revision: state.revision,
        status: state.status,
        title: definition.playerText?.title || '',
        summary: definition.playerText?.summary || '',
        objectives,
        progress: progressFor(objectives),
        facts: projectFacts(definition, state),
        clocks: projectClocks(definition, state),
        outcomeDimensions: projectOutcomeDimensions(definition, state),
        terminal: projectTerminal(definition, state, index),
    };
}
