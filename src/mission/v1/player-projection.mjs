import { indexMissionDefinition } from './mission-contracts.mjs';
import { objectiveResolutionRefs } from './objective-progress-policy.mjs';

export const MISSION_PLAYER_PROJECTION_KIND = 'directive.missionPlayerProjection.v1';

function effectiveObjectiveClass(objective) {
    return objective.class === 'conditional' ? objective.activatedAs : objective.class;
}

function terminalObjectiveText(objective, disposition) {
    return objective?.playerText?.terminal
        ?.find((item) => item.disposition === disposition)?.text || null;
}

function projectObjective(objective, objectiveState, state, definition) {
    const disposition = objectiveState.disposition || null;
    const decision = state.objectiveDecisions?.[objective.id];
    const labels = {completed:'Completed',completedWithCost:'Completed with cost',failedAfterInformedAction:'Failed after informed action',handedOff:'Handed off',knowinglyDeclined:'Declined',waived:'Waived'};
    const refs = objectiveResolutionRefs(definition,objective);
    const rejected = new Set(Object.values(state.objectiveDecisions || {}).flatMap(control=>[...(control.rejectedEvidenceKeys || []),...(control.proposal?.evidenceKeys || [])]));
    const evidence = [...state.evidenceLog].reverse().find(entry=> !rejected.has(entry.evidenceKey) && entry.evidenceQuote && (refs.events.has(entry.targetId) || refs.outcomes.has(entry.targetId) || (refs.facts.has(entry.targetId) && state.knownFacts.includes(entry.targetId))));
    return {
        id: objective.id,
        class: effectiveObjectiveClass(objective),
        status: objectiveState.state,
        disposition,
        title: objective.playerText.title,
        summary: objective.playerText.summary,
        terminalText: disposition ? terminalObjectiveText(objective, disposition) : null,
        progressControl: {
            mode: decision?.mode || 'automatic',
            origin: decision?.mode === 'player_set' ? 'player' : 'automatic',
            allowedResolutions: [...new Set((objective.terminalWhen || []).map(item=>item.disposition))].map(value=>({disposition:value,label:labels[value] || value})),
            proposal: decision?.proposal ? {id:decision.proposal.id,disposition:decision.proposal.disposition,label:labels[decision.proposal.disposition] || decision.proposal.disposition} : null,
            explanation: decision?.mode === 'player_set' ? 'Set by you.' : decision?.mode === 'confirmation_required' ? 'Completion needs your confirmation. Earlier rejected evidence will not resolve this objective again.' : objectiveState.state === 'terminal' ? (evidence ? `Accepted story evidence: “${evidence.evidenceQuote}”` : 'Resolved from accepted story evidence.') : '',
            expectedRevision: state.revision,
        },
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

function projectOutcomeDimensions(definition, state) {
    return (definition.outcomeDimensions || [])
        .filter((dimension) => Object.hasOwn(state.outcomeDimensions || {}, dimension.id))
        .map((dimension) => ({
            id: dimension.id,
            label: dimension.playerText.label,
            value: state.outcomeDimensions[dimension.id],
        }));
}

function projectCapabilities(definition, state, index) {
    const available = new Set((state.entryContext?.capabilities || []).map((capability) => capability.id));
    return (definition.entryCapabilities || [])
        .filter((capability) => available.has(capability.id) && index.entryCapabilities.has(capability.id))
        .map((capability) => ({
            id: capability.id,
            label: capability.playerText.label,
            summary: capability.playerText.summary,
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
        .map((objective) => projectObjective(objective, state.objectives[objective.id], state, definition));
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
        capabilities: projectCapabilities(definition, state, index),
        facts: projectFacts(definition, state),
        outcomeDimensions: projectOutcomeDimensions(definition, state),
        terminal: projectTerminal(definition, state, index),
    };
}
