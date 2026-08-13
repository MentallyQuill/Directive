import { indexMissionDefinition } from './mission-contracts.mjs';
import { missionStateContext } from './mission-state.mjs';
import { evaluateMissionPredicate } from './predicate-evaluator.mjs';

export const MISSION_INTERPRETATION_CANDIDATE_PACKET_KIND = 'directive.missionInterpretationCandidates.v1';

const SOURCE_SLOT_BY_ROLE = Object.freeze({
    assistant: 'previousAssistant',
    user: 'currentPlayer',
});

function oneWayClaimAlreadyApplied(policy, state) {
    if (policy.claimType === 'factDisclosed') return state.knownFacts?.includes(policy.targetId) === true;
    if (policy.claimType === 'eventOccurred') return state.events?.includes(policy.targetId) === true;
    return false;
}

function currentValueFor(policy, state) {
    if (!new Set(['decisionRecorded', 'outcomeObserved']).has(policy.claimType)) return undefined;
    return state.outcomes?.[policy.targetId];
}

function candidateFor(policy, state, context) {
    const eligibility = evaluateMissionPredicate(policy.when, context);
    if (!eligibility.ok || eligibility.value !== true) return null;
    const sourceSlots = [...new Set(
        (policy.sourceRoles || []).map((role) => SOURCE_SLOT_BY_ROLE[role]).filter(Boolean),
    )].sort();
    if (sourceSlots.length === 0 || !policy.interpretation || oneWayClaimAlreadyApplied(policy, state)) return null;
    const currentValue = currentValueFor(policy, state);
    const values = Array.isArray(policy.interpretation.values)
        ? policy.interpretation.values
            .filter((entry) => entry.value !== currentValue)
            .map((entry) => ({ value: entry.value, guidance: entry.guidance }))
        : null;
    if (Array.isArray(values) && values.length === 0) return null;
    return {
        id: policy.id,
        claimType: policy.claimType,
        targetId: policy.targetId,
        sourceSlots,
        evidenceStandard: policy.interpretation.evidenceStandard,
        guidance: policy.interpretation.guidance,
        ...(Array.isArray(values) ? { values } : {}),
        ...(currentValue !== undefined ? { currentValue } : {}),
        exclusions: [...policy.interpretation.exclusions],
    };
}

export function createMissionInterpretationCandidatePacket({ definition = {}, state = {} } = {}) {
    const index = indexMissionDefinition(definition);
    const context = missionStateContext(definition, state);
    const candidates = [...index.evidencePolicies.values()]
        .map((policy) => candidateFor(policy, state, context))
        .filter(Boolean)
        .sort((left, right) => left.id.localeCompare(right.id));
    return {
        kind: MISSION_INTERPRETATION_CANDIDATE_PACKET_KIND,
        missionId: definition.id,
        definitionVersion: definition.version,
        branchId: state.branchId,
        baseRevision: state.revision,
        candidates,
    };
}
