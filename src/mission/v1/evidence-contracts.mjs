import { indexMissionDefinition } from './mission-contracts.mjs';

export const MISSION_EVIDENCE_PROPOSAL_KIND = 'directive.missionEvidenceProposal.v1';
export const MISSION_EVIDENCE_CLAIM_TYPES = Object.freeze(new Set([
    'intentExpressed',
    'decisionRecorded',
    'factDisclosed',
    'eventOccurred',
    'outcomeObserved',
    'timeAdvanced',
]));

const PLAYER_PROVABLE_CLAIM_TYPES = new Set(['intentExpressed', 'decisionRecorded']);
const ACCEPTED_SOURCE_ROLES = new Set(['user', 'assistant', 'runtime', 'adjudicator']);
const TARGET_COLLECTION_BY_CLAIM_TYPE = Object.freeze({
    intentExpressed: 'objectives',
    decisionRecorded: 'outcomes',
    factDisclosed: 'facts',
    eventOccurred: 'events',
    outcomeObserved: 'outcomes',
    timeAdvanced: 'clocks',
});

function rejection(claim, reasonCode) {
    return { ...claim, reasonCode };
}

function rejectAll(claims, reasonCode) {
    return {
        acceptedClaims: [],
        rejectedClaims: claims.map((claim) => rejection(claim, reasonCode)),
        errors: [],
    };
}

function evidenceKey(branchId, claim, source) {
    return [
        branchId,
        source.messageId,
        source.selectedSwipeId || 'no-swipe',
        source.textHash,
        claim.claimType,
        claim.targetId,
    ].join('|');
}

function targetExistsAnywhere(index, targetId) {
    return ['objectives', 'facts', 'events', 'outcomes', 'clocks']
        .some((key) => index[key].has(targetId));
}

export function validateMissionEvidenceProposal({
    definition = {},
    state = {},
    proposal = {},
    resolveSourceRef,
} = {}) {
    const claims = Array.isArray(proposal?.claims) ? proposal.claims : [];
    if (proposal.kind !== MISSION_EVIDENCE_PROPOSAL_KIND) return rejectAll(claims, 'effect-not-allowed');
    if (proposal.missionId !== definition.id) return rejectAll(claims, 'effect-not-allowed');
    if (proposal.branchId !== state.branchId) return rejectAll(claims, 'wrong-branch');
    if (proposal.baseRevision !== state.revision) return rejectAll(claims, 'stale-revision');

    const index = indexMissionDefinition(definition);
    const acceptedClaims = [];
    const rejectedClaims = [];
    const seen = new Set(Array.isArray(state.acceptedEvidenceKeys) ? state.acceptedEvidenceKeys : []);

    for (const claim of claims) {
        const source = typeof resolveSourceRef === 'function' ? resolveSourceRef(claim?.sourceRef) : null;
        if (!source) {
            rejectedClaims.push(rejection(claim, 'source-missing'));
            continue;
        }
        if (source.branchId !== state.branchId) {
            rejectedClaims.push(rejection(claim, 'wrong-branch'));
            continue;
        }
        if (source.accepted !== true) {
            rejectedClaims.push(rejection(claim, 'source-not-accepted'));
            continue;
        }
        if (!ACCEPTED_SOURCE_ROLES.has(source.role)) {
            rejectedClaims.push(rejection(claim, 'source-not-accepted'));
            continue;
        }
        if ((claim?.sourceRef?.swipeId || null) !== (source.selectedSwipeId || null)) {
            rejectedClaims.push(rejection(claim, 'swipe-mismatch'));
            continue;
        }
        if (claim?.sourceRef?.textHash !== source.textHash) {
            rejectedClaims.push(rejection(claim, 'hash-mismatch'));
            continue;
        }
        if (source.acceptedAtRevision > state.revision) {
            rejectedClaims.push(rejection(claim, 'stale-revision'));
            continue;
        }
        if (!MISSION_EVIDENCE_CLAIM_TYPES.has(claim?.claimType)) {
            rejectedClaims.push(rejection(claim, 'effect-not-allowed'));
            continue;
        }
        if (!targetExistsAnywhere(index, claim?.targetId)) {
            rejectedClaims.push(rejection(claim, 'unknown-target'));
            continue;
        }
        const collection = TARGET_COLLECTION_BY_CLAIM_TYPE[claim.claimType];
        if (!index[collection].has(claim.targetId)) {
            rejectedClaims.push(rejection(claim, 'effect-not-allowed'));
            continue;
        }
        if (new Set(['decisionRecorded', 'outcomeObserved']).has(claim.claimType)) {
            const outcome = index.outcomes.get(claim.targetId);
            if (!outcome?.allowedValues?.includes(claim.value)) {
                rejectedClaims.push(rejection(claim, 'effect-not-allowed'));
                continue;
            }
        }
        if (claim.claimType === 'timeAdvanced' && (!Number.isFinite(claim.value) || claim.value <= 0)) {
            rejectedClaims.push(rejection(claim, 'effect-not-allowed'));
            continue;
        }
        if (source.role === 'user' && !PLAYER_PROVABLE_CLAIM_TYPES.has(claim.claimType)) {
            rejectedClaims.push(rejection(claim, 'player-cannot-prove-outcome'));
            continue;
        }
        const key = evidenceKey(state.branchId, claim, source);
        if (seen.has(key)) {
            rejectedClaims.push(rejection(claim, 'duplicate-claim'));
            continue;
        }
        seen.add(key);
        acceptedClaims.push({ ...claim, evidenceKey: key });
    }

    return { acceptedClaims, rejectedClaims, errors: [] };
}
