import { objectiveResolutionRefs } from './objective-progress-policy.mjs';
import { createMissionState } from './mission-state.mjs';
import { reduceMissionEvidence } from './mission-reducer.mjs';
import { collectMissionPredicateRefs } from './predicate-evaluator.mjs';
import { appendShipWorkEvidenceToMissionState } from '../../ship/v1/ship-work-evidence.mjs';
import { revalidateMissionEvidenceReplay } from './evidence-contracts.mjs';

function initialState(definition, input) {
    return createMissionState({
        definition,
        branchId: input.branchId,
        ...(input.entryContext === undefined ? {} : { entryContext: input.entryContext }),
    });
}

function evidenceBatches(evidenceLog) {
    const batches = [];
    for (const entry of evidenceLog) {
        if (!batches.length || batches.at(-1).revision !== entry.acceptedAtMissionRevision) {
            batches.push({ revision: entry.acceptedAtMissionRevision, claims: [] });
        }
        batches.at(-1).claims.push(entry);
    }
    return batches;
}

export function rebuildObjectiveProgress(definition, input) {
    let state = initialState(definition, input);
    state.objectiveDecisions = structuredClone(input.objectiveDecisions || {});
    if (Object.values(state.objectiveDecisions).some(decision => decision.mode === 'player_set')) {
        // A player resolution can authorize the first subsequent evidence batch.
        // Establish that authority before checking the batch's prerequisites.
        state = reduceMissionEvidence({
            definition, state, forceRecompute: true, replaying: true,
        }).state;
    }
    const batches = evidenceBatches(input.evidenceLog);
    const shipCapabilityEvidenceById = new Map();
    for (const batch of batches) {
        state.revision = batch.revision;
        const shipClaims = batch.claims.filter(entry => entry.domain === 'shipWork');
        if (shipClaims.length) state = appendShipWorkEvidenceToMissionState(state, shipClaims);
        const claims = batch.claims.filter(entry => entry.domain !== 'shipWork');
        for (const claim of claims) {
            const policy = definition.evidencePolicies.find(item => item.id === claim.policyId);
            for (const id of collectMissionPredicateRefs(policy?.when).shipCapabilities) {
                if (claim.dependencyEffectIds?.length) {
                    shipCapabilityEvidenceById.set(id, claim.dependencyEffectIds);
                }
            }
        }
        const controllingDecision = Object.values(state.objectiveDecisions)
            .sort((left, right) => right.revision - left.revision)[0];
        if (controllingDecision) {
            const blocked = new Set(Object.values(state.objectiveDecisions).flatMap(control => [
                ...(control.rejectedEvidenceKeys || []),
                ...(control.proposal?.evidenceKeys || []),
            ]));
            const checked = revalidateMissionEvidenceReplay({
                definition,
                state,
                claims: claims.filter(claim => !blocked.has(claim.evidenceKey)
                    && definition.evidencePolicies.some(policy => policy.id === claim.policyId)),
                shipCapabilityEvidenceById,
                activeDependencyEffectIds: new Set([...shipCapabilityEvidenceById.values()].flat()),
            });
            for (const rejected of checked.rejectedClaims) {
                const entry = claims.find(claim => claim.claimId === rejected.claimId);
                if (entry && !controllingDecision.rejectedEvidenceKeys.includes(entry.evidenceKey)) {
                    controllingDecision.rejectedEvidenceKeys.push(entry.evidenceKey);
                    controllingDecision.rejectedEvidence.push(structuredClone(entry));
                }
            }
        }
        if (claims.length) {
            state = reduceMissionEvidence({
                definition, state, acceptedClaims: claims, shipCapabilityEvidenceById, replaying: true,
            }).state;
        }
    }
    if (!batches.length) {
        state = reduceMissionEvidence({
            definition, state, forceRecompute: true, shipCapabilityEvidenceById,
        }).state;
    }
    state.revision = input.revision;
    if (state.transitionReceipt) state.transitionReceipt.committedAtRevision = input.revision;
    // Rebuilding derived fields must not rewrite historical evidence custody.
    state.evidenceLog = structuredClone(input.evidenceLog);
    state.acceptedEvidenceKeys = [...input.acceptedEvidenceKeys];
    state.invalidatedSourceContributionIds = [...input.invalidatedSourceContributionIds];
    return state;
}

function resolutionEvidence(definition, state, objective) {
    const refs = objectiveResolutionRefs(definition, objective);
    let baseline = initialState(definition, state);
    baseline.objectiveDecisions = structuredClone(state.objectiveDecisions || {});
    for (const control of Object.values(baseline.objectiveDecisions)) {
        control.mode = 'automatic';
        control.proposal = null;
    }
    for (const batch of evidenceBatches(state.evidenceLog)) {
        baseline = reduceMissionEvidence({
            definition,
            state: baseline,
            acceptedClaims: batch.claims.filter(entry => entry.domain !== 'shipWork'),
            replaying: true,
        }).state;
        if (baseline.objectives[objective.id].state === 'terminal') {
            return batch.claims.filter(entry => refs.events.has(entry.targetId)
                || refs.outcomes.has(entry.targetId) || refs.facts.has(entry.targetId));
        }
    }
    return [];
}

export function adjustMissionObjectiveProgress({
    definition, state: input, objectiveId, action, disposition, proposalId,
} = {}) {
    const objective = definition.objectives.find(item => item.id === objectiveId);
    if (!objective || input.objectives[objectiveId]?.visibility === 'hidden') {
        throw new Error('Only visible objectives in the current mission can be adjusted.');
    }
    const state = structuredClone(input);
    const previous = state.objectiveDecisions?.[objectiveId];
    const decision = {
        ...structuredClone(previous || {}),
        mode: 'automatic',
        origin: 'player',
        revision: state.revision + 1,
        proposal: null,
        rejectedEvidenceKeys: [...(previous?.rejectedEvidenceKeys || [])],
    };
    if (action === 'acceptProposal') {
        if (!previous?.proposal || previous.proposal.id !== proposalId) {
            throw new Error('This proposal is no longer current.');
        }
        disposition = previous.proposal.disposition;
    }
    if (action === 'resolve' || action === 'acceptProposal') {
        if (!(objective.terminalWhen || []).some(item => item.disposition === disposition)) {
            throw new Error('This resolution is not authored for the objective.');
        }
        if (action === 'resolve' && input.objectives[objectiveId].state === 'terminal'
            && input.objectives[objectiveId].disposition !== disposition) {
            decision.rejectedEvidenceKeys.push(...resolutionEvidence(definition, state, objective)
                .map(entry => entry.evidenceKey));
        }
        decision.mode = 'player_set';
        decision.disposition = disposition;
        decision.sourceProposalId = action === 'acceptProposal' ? proposalId : null;
    } else if (action === 'reopen') {
        decision.mode = 'confirmation_required';
        decision.disposition = null;
        decision.rejectedEvidenceKeys.push(...resolutionEvidence(definition, state, objective)
            .map(entry => entry.evidenceKey));
    } else if (action === 'resume' || action === 'dismissProposal') {
        if (action === 'dismissProposal') decision.mode = previous?.mode || 'confirmation_required';
        decision.disposition = null;
    } else {
        throw new Error('Unknown objective progress action.');
    }
    if (previous?.proposal && action !== 'acceptProposal') {
        decision.rejectedEvidenceKeys.push(...previous.proposal.evidenceKeys);
    }
    decision.rejectedEvidenceKeys = [...new Set(decision.rejectedEvidenceKeys)];
    decision.rejectedEvidence = [
        ...(previous?.rejectedEvidence || []),
        ...state.evidenceLog.filter(entry => decision.rejectedEvidenceKeys.includes(entry.evidenceKey)),
    ].filter((entry, index, all) => all.findIndex(other => other.evidenceKey === entry.evidenceKey) === index);
    state.objectiveDecisions ||= {};
    state.objectiveDecisions[objectiveId] = decision;
    state.revision += 1;
    return { state: rebuildObjectiveProgress(definition, state) };
}
