import { indexMissionDefinition } from './mission-contracts.mjs';
import { missionStateContext } from './mission-state.mjs';
import { evaluateMissionPredicate } from './predicate-evaluator.mjs';

const TRANSITION_PACKET_KIND = 'directive.missionTransitionNarration.v1';

function evaluate(predicate, definition, state) {
    const result = evaluateMissionPredicate(predicate, missionStateContext(definition, state));
    if (!result.ok) throw new TypeError(result.errors.join('\n'));
    return result.value;
}

function addUnique(values, value) {
    if (!values.includes(value)) values.push(value);
}

function effectVisibility(index, state, claim) {
    if (claim.claimType === 'factDisclosed') return 'visible';
    if (claim.claimType === 'eventOccurred') {
        return index.events.get(claim.targetId)?.playerVisibility || 'hidden';
    }
    if (new Set(['outcomeObserved', 'decisionRecorded']).has(claim.claimType)) {
        return index.outcomes.get(claim.targetId)?.playerVisibility || 'hidden';
    }
    if (claim.claimType === 'timeAdvanced') {
        return state.clocks[claim.targetId]?.visibility || 'hidden';
    }
    return 'hidden';
}

function applyClaim(definition, state, claim) {
    if (claim.claimType === 'factDisclosed') {
        addUnique(state.knownFacts, claim.targetId);
        addUnique(state.worldFacts, claim.targetId);
    } else if (claim.claimType === 'eventOccurred') {
        addUnique(state.events, claim.targetId);
    } else if (new Set(['outcomeObserved', 'decisionRecorded']).has(claim.claimType)) {
        state.outcomes[claim.targetId] = claim.value;
    } else if (claim.claimType === 'timeAdvanced') {
        const clockDefinition = indexMissionDefinition(definition).clocks.get(claim.targetId);
        const clock = state.clocks[claim.targetId];
        if (clockDefinition && clock?.state === 'running') {
            clock.value += clockDefinition.direction === 'down' ? -claim.value : claim.value;
            clock.lastAdvancementEvidenceKey = claim.evidenceKey;
            if (clockDefinition.direction === 'down' && clock.value <= 0) {
                clock.value = 0;
                clock.state = 'expired';
            }
        }
    }
}

function reduceClocks(definition, state, effects, sourceContribution) {
    const index = indexMissionDefinition(definition);
    for (const clockDefinition of definition.clocks || []) {
        const clock = state.clocks[clockDefinition.id];
        clock.visibility = evaluate(clockDefinition.visibleWhen, definition, state) ? 'visible' : 'hidden';
        if (clock.state === 'notStarted' && evaluate(clockDefinition.startWhen, definition, state)) clock.state = 'running';
        if (clock.state === 'running' && clockDefinition.pauseWhen && evaluate(clockDefinition.pauseWhen, definition, state)) {
            clock.state = 'paused';
        } else if (clock.state === 'paused' && clockDefinition.resumeWhen && evaluate(clockDefinition.resumeWhen, definition, state)) {
            clock.state = 'running';
        }
        if (clockDefinition.resolveWhen && evaluate(clockDefinition.resolveWhen, definition, state)) clock.state = 'resolved';
        if (clock.state === 'expired' && !clock.expiryApplied && evaluate(clockDefinition.expireWhen, definition, state)) {
            const consequence = clockDefinition.consequence;
            if (consequence.effectType === 'eventOccurred' && index.events.has(consequence.targetId)) {
                addUnique(state.events, consequence.targetId);
            }
            clock.expiryApplied = true;
            effects.push({
                id: `effect.${clockDefinition.id}.expired`,
                type: `mission.${consequence.effectType}`,
                targetId: consequence.targetId,
                value: consequence.value,
                sourceContributionIds: sourceContribution?.id ? [sourceContribution.id] : [],
                playerVisibility: clock.visibility,
                status: 'active',
            });
        }
    }
}

function reduceObjectives(definition, state) {
    for (let pass = 0; pass <= (definition.objectives || []).length; pass += 1) {
        let changed = false;
        for (const objective of definition.objectives || []) {
            const current = state.objectives[objective.id];
            if (current.state === 'terminal') continue;
            const active = evaluate(objective.activationWhen, definition, state);
            const visible = active && evaluate(objective.visibleWhen, definition, state);
            const available = active && evaluate(objective.availableWhen, definition, state);
            let nextState = available ? 'available' : 'inactive';
            if (available && evaluate(objective.progressWhen, definition, state)) nextState = 'inProgress';
            let disposition = null;
            for (const terminal of objective.terminalWhen || []) {
                if (active && evaluate(terminal.when, definition, state)) {
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

function reduceOutcomeDimensions(definition, state) {
    for (const dimension of definition.outcomeDimensions || []) {
        const derivations = [...(dimension.derive || [])].sort((a, b) => b.priority - a.priority);
        const matched = derivations.find((derivation) => evaluate(derivation.when, definition, state));
        if (matched) state.outcomeDimensions[dimension.id] = matched.value;
        else delete state.outcomeDimensions[dimension.id];
    }
}

function selectByPriority(records, definition, state) {
    return [...records]
        .sort((a, b) => b.priority - a.priority)
        .find((record) => evaluate(record.when, definition, state)) || null;
}

function objectiveTerminalText(objective, disposition) {
    return objective?.playerText?.terminal?.find((item) => item.disposition === disposition)?.text || null;
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
} = {}) {
    const state = structuredClone(inputState);
    if (state.transitionReceipt && acceptedClaims.every((claim) => state.acceptedEvidenceKeys.includes(claim.evidenceKey))) {
        return { state, effects: [], transitionPacket: structuredClone(state.transitionReceipt.packet) };
    }
    const index = indexMissionDefinition(definition);
    const effects = [];
    let changed = false;
    for (const claim of acceptedClaims) {
        if (!claim?.evidenceKey || state.acceptedEvidenceKeys.includes(claim.evidenceKey)) continue;
        state.acceptedEvidenceKeys.push(claim.evidenceKey);
        state.evidenceLog.push({
            evidenceKey: claim.evidenceKey,
            claimType: claim.claimType,
            targetId: claim.targetId,
            value: claim.value ?? null,
            sourceContributionId: sourceContribution?.id || null,
        });
        applyClaim(definition, state, claim);
        effects.push({
            id: claim.claimId,
            type: `mission.${claim.claimType}`,
            targetId: claim.targetId,
            value: claim.value ?? null,
            sourceContributionIds: sourceContribution?.id ? [sourceContribution.id] : [],
            playerVisibility: effectVisibility(index, state, claim),
            status: 'active',
        });
        changed = true;
    }
    if (!changed) return { state, effects: [], transitionPacket: state.transitionReceipt?.packet || null };

    reduceClocks(definition, state, effects, sourceContribution);
    reduceObjectives(definition, state);
    reduceOutcomeDimensions(definition, state);
    if (state.status !== 'terminal' && evaluate(definition.closeWhen, definition, state)) {
        const terminal = selectByPriority(definition.terminalDispositions || [], definition, state);
        if (!terminal) throw new TypeError('closeWhen is true without an eligible terminal disposition');
        state.status = 'terminal';
        state.terminalDisposition = terminal.id;
    }
    state.revision += 1;

    let transitionPacket = null;
    if (state.status === 'terminal' && !state.transitionReceipt) {
        const transition = selectByPriority(definition.transitions || [], definition, state);
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
    return { state, effects, transitionPacket };
}
