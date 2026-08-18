import { indexMissionDefinition } from './mission-contracts.mjs';
import { missionStateContext } from './mission-state.mjs';
import { evaluateMissionPredicate } from './predicate-evaluator.mjs';

const TRANSITION_PACKET_KIND = 'directive.missionTransitionNarration.v1';
const CLAIM_REDUCTION_ORDER = Object.freeze({
    worldFactEstablished: 10,
    eventOccurred: 20,
    outcomeObserved: 30,
    factDisclosed: 40,
    intentExpressed: 50,
    decisionRecorded: 60,
});

function compareClaims(a, b) {
    const rankDifference = (CLAIM_REDUCTION_ORDER[a?.claimType] ?? 999)
        - (CLAIM_REDUCTION_ORDER[b?.claimType] ?? 999);
    if (rankDifference !== 0) return rankDifference;
    return String(a?.claimId || '').localeCompare(String(b?.claimId || ''));
}

function evaluate(predicate, definition, state, predicateContext) {
    const result = evaluateMissionPredicate(predicate, missionStateContext(definition, state, predicateContext));
    if (!result.ok) throw new TypeError(result.errors.join('\n'));
    return result.value;
}

function addUnique(values, value) {
    if (!values.includes(value)) values.push(value);
}

function effectVisibility(index, state, claim) {
    if (claim.claimType === 'worldFactEstablished') return 'hidden';
    if (claim.claimType === 'factDisclosed') return 'visible';
    if (claim.claimType === 'eventOccurred') {
        return index.events.get(claim.targetId)?.playerVisibility || 'hidden';
    }
    if (new Set(['outcomeObserved', 'decisionRecorded']).has(claim.claimType)) {
        return index.outcomes.get(claim.targetId)?.playerVisibility || 'hidden';
    }
    return 'hidden';
}

function applyClaim(definition, state, claim) {
    if (claim.claimType === 'worldFactEstablished') {
        addUnique(state.worldFacts, claim.targetId);
    } else if (claim.claimType === 'factDisclosed') {
        addUnique(state.knownFacts, claim.targetId);
    } else if (claim.claimType === 'eventOccurred') {
        addUnique(state.events, claim.targetId);
    } else if (new Set(['outcomeObserved', 'decisionRecorded']).has(claim.claimType)) {
        state.outcomes[claim.targetId] = claim.value;
    }
}

function reduceObjectives(definition, state, predicateContext) {
    for (let pass = 0; pass <= (definition.objectives || []).length; pass += 1) {
        let changed = false;
        for (const objective of definition.objectives || []) {
            const current = state.objectives[objective.id];
            if (current.state === 'terminal') continue;
            const active = evaluate(objective.activationWhen, definition, state, predicateContext);
            const visible = active && evaluate(objective.visibleWhen, definition, state, predicateContext);
            const available = active && evaluate(objective.availableWhen, definition, state, predicateContext);
            let nextState = available ? 'available' : 'inactive';
            if (available && evaluate(objective.progressWhen, definition, state, predicateContext)) nextState = 'inProgress';
            let disposition = null;
            for (const terminal of objective.terminalWhen || []) {
                if (active && evaluate(terminal.when, definition, state, predicateContext)) {
                    nextState = 'terminal';
                    disposition = terminal.disposition;
                    break;
                }
            }
            const nextVisibility = visible ? (nextState === 'terminal' ? 'resolved' : 'visible') : 'hidden';
            if (current.state !== nextState || current.visibility !== nextVisibility || current.disposition !== disposition) {
                state.objectives[objective.id] = {
                    state: nextState,
                    visibility: nextVisibility,
                    disposition,
                };
                changed = true;
            }
        }
        if (!changed) break;
    }
}

function reduceOutcomeDimensions(definition, state, predicateContext) {
    for (const dimension of definition.outcomeDimensions || []) {
        const derivations = [...(dimension.derive || [])].sort((a, b) => b.priority - a.priority);
        const matched = derivations.find((derivation) => evaluate(derivation.when, definition, state, predicateContext));
        if (matched) state.outcomeDimensions[dimension.id] = matched.value;
        else delete state.outcomeDimensions[dimension.id];
    }
}

function selectByPriority(records, definition, state, predicateContext) {
    return [...records]
        .sort((a, b) => b.priority - a.priority)
        .find((record) => evaluate(record.when, definition, state, predicateContext)) || null;
}

function objectiveTerminalText(objective, disposition) {
    return objective?.playerText?.terminal?.find((item) => item.disposition === disposition)?.text || null;
}

export function eligibleMissionCommandBearingAwards(definition = {}, state = {}) {
    return (definition.commandBearingAwards || [])
        .filter((award) => {
            const objective = state.objectives?.[award.sourceObjectiveId];
            return objective?.state === 'terminal'
                && award.eligibleDispositions.includes(objective.disposition);
        })
        .map((award) => ({
            id: award.id,
            sourceMissionId: definition.id,
            sourceObjectiveId: award.sourceObjectiveId,
            reason: award.reason,
        }));
}

function createTransitionPacket(definition, state, transition, effects) {
    const terminal = (definition.terminalDispositions || []).find((item) => item.id === state.terminalDisposition);
    const optionalOutcomeSummaries = [];
    for (const objective of definition.objectives || []) {
        const effectiveClass = objective.class === 'conditional' ? objective.activatedAs : objective.class;
        const objectiveState = state.objectives[objective.id];
        if (effectiveClass !== 'optional' || objectiveState.visibility === 'hidden' || objectiveState.state !== 'terminal') continue;
        const text = objectiveTerminalText(objective, objectiveState.disposition);
        if (text) optionalOutcomeSummaries.push(text);
    }
    return {
        kind: TRANSITION_PACKET_KIND,
        sourceMissionId: definition.id,
        sourceDisposition: state.terminalDisposition,
        committedEffects: effects,
        playerKnownOutcomeSummary: terminal?.playerText?.summary ? [terminal.playerText.summary] : [],
        optionalOutcomeSummaries,
        unresolvedPlayerKnownConsequences: [],
        next: structuredClone(transition.target),
        mustNarrate: [...transition.mustNarrate],
        mustNotReveal: [...transition.mustNotReveal],
    };
}

export function reduceMissionEvidence({
    definition = {},
    state: inputState = {},
    acceptedClaims = [],
    sourceContribution = null,
    shipCapabilityEvidenceById = new Map(),
} = {}) {
    const state = structuredClone(inputState);
    if (state.transitionReceipt && acceptedClaims.every((claim) => state.acceptedEvidenceKeys.includes(claim.evidenceKey))) {
        return {
            state,
            effects: [],
            transitionPacket: structuredClone(state.transitionReceipt.packet),
            commandBearingAwards: eligibleMissionCommandBearingAwards(definition, state),
        };
    }
    const index = indexMissionDefinition(definition);
    const effects = [];
    let changed = false;
    const acceptedAtMissionRevision = state.revision;
    for (const claim of [...acceptedClaims].sort(compareClaims)) {
        if (!claim?.evidenceKey || state.acceptedEvidenceKeys.includes(claim.evidenceKey)) continue;
        const contributionId = sourceContribution?.id || claim.sourceContributionId || null;
        state.acceptedEvidenceKeys.push(claim.evidenceKey);
        state.evidenceLog.push({
            claimId: claim.claimId,
            policyId: claim.policyId || null,
            evidenceKey: claim.evidenceKey,
            claimType: claim.claimType,
            targetId: claim.targetId,
            value: claim.value ?? null,
            sourceContributionId: contributionId,
            ...(claim.evidenceQuote ? { evidenceQuote: claim.evidenceQuote } : {}),
            ...(claim.evidenceQuoteHash ? { evidenceQuoteHash: claim.evidenceQuoteHash } : {}),
            ...(Array.isArray(claim.dependencyEffectIds) && claim.dependencyEffectIds.length > 0
                ? { dependencyEffectIds: [...claim.dependencyEffectIds] }
                : {}),
            acceptedAtMissionRevision,
            ...(claim.delivery ? { delivery: structuredClone(claim.delivery) } : {}),
        });
        applyClaim(definition, state, claim);
        effects.push({
            id: claim.claimId,
            type: `mission.${claim.claimType}`,
            targetId: claim.targetId,
            value: claim.value ?? null,
            sourceContributionIds: contributionId ? [contributionId] : [],
            ...(Array.isArray(claim.dependencyEffectIds) && claim.dependencyEffectIds.length > 0
                ? { dependencyEffectIds: [...claim.dependencyEffectIds] }
                : {}),
            playerVisibility: effectVisibility(index, state, claim),
            status: 'active',
        });
        changed = true;
    }
    if (!changed) return {
        state,
        effects: [],
        transitionPacket: state.transitionReceipt?.packet || null,
        commandBearingAwards: eligibleMissionCommandBearingAwards(definition, state),
    };

    const predicateContext = { shipCapabilityEvidenceById };
    reduceObjectives(definition, state, predicateContext);
    reduceOutcomeDimensions(definition, state, predicateContext);
    if (state.status !== 'terminal' && evaluate(definition.closeWhen, definition, state, predicateContext)) {
        const terminal = selectByPriority(definition.terminalDispositions || [], definition, state, predicateContext);
        if (!terminal) throw new TypeError('closeWhen is true without an eligible terminal disposition');
        state.status = 'terminal';
        state.terminalDisposition = terminal.id;
    }
    state.revision += 1;

    let transitionPacket = null;
    if (state.status === 'terminal' && !state.transitionReceipt) {
        const transition = selectByPriority(definition.transitions || [], definition, state, predicateContext);
        if (!transition) throw new TypeError('terminal mission has no eligible transition');
        transitionPacket = createTransitionPacket(definition, state, transition, effects);
        state.transitionReceipt = {
            kind: 'directive.missionTransitionReceipt.v1',
            transitionId: transition.id,
            committedAtRevision: state.revision,
            target: structuredClone(transition.target),
            packet: structuredClone(transitionPacket),
        };
    }
    return {
        state,
        effects,
        transitionPacket,
        commandBearingAwards: eligibleMissionCommandBearingAwards(definition, state),
    };
}
