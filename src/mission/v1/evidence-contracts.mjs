import {
    indexMissionDefinition,
    MISSION_EVIDENCE_CLAIM_TYPES,
    MISSION_EVIDENCE_TARGET_COLLECTION_BY_CLAIM_TYPE,
} from './mission-contracts.mjs';
import { missionStateContext } from './mission-state.mjs';
import { collectMissionPredicateRefs, evaluateMissionPredicate } from './predicate-evaluator.mjs';
import { validateDutyReportDeliveryReceipt } from './duty-report-delivery.mjs';

export { MISSION_EVIDENCE_CLAIM_TYPES } from './mission-contracts.mjs';

export const MISSION_EVIDENCE_PROPOSAL_KIND = 'directive.missionEvidenceProposal.v1';
const PLAYER_PROVABLE_CLAIM_TYPES = new Set(['intentExpressed', 'decisionRecorded']);
const ACCEPTED_SOURCE_ROLES = new Set(['user', 'assistant', 'runtime', 'adjudicator']);
const AUTHORITATIVE_SOURCE_ROLES = new Set(['runtime', 'adjudicator']);
const CLAIM_VALIDATION_ORDER = Object.freeze({
    worldFactEstablished: 10,
    eventOccurred: 20,
    outcomeObserved: 30,
    factDisclosed: 40,
    intentExpressed: 50,
    decisionRecorded: 60,
    timeAdvanced: 70,
});

function rejection(claim, reasonCode) {
    return { ...claim, reasonCode };
}

function rejectAll(claims, reasonCode) {
    return {
        acceptedClaims: [],
        rejectedClaims: claims.map((claim) => rejection(claim, reasonCode)),
        errors: [],
        proposalRejected: true,
        rejectionReasonCode: reasonCode,
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

function isStableId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function addUnique(values, value) {
    if (!values.includes(value)) values.push(value);
}

function stageAcceptedClaim(state, claim) {
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

function claimOrder(a, b) {
    const rankDifference = (CLAIM_VALIDATION_ORDER[a.claim.claimType] ?? 999)
        - (CLAIM_VALIDATION_ORDER[b.claim.claimType] ?? 999);
    if (rankDifference !== 0) return rankDifference;
    const idDifference = a.claim.claimId.localeCompare(b.claim.claimId);
    return idDifference || a.originalIndex - b.originalIndex;
}

export function revalidateMissionEvidenceReplay({
    definition = {},
    state = {},
    claims = [],
    shipCapabilityEvidenceById = new Map(),
    activeDependencyEffectIds = new Set(),
} = {}) {
    const index = indexMissionDefinition(definition);
    const stagedState = structuredClone(state);
    stagedState.knownFacts = [...(stagedState.knownFacts || [])];
    stagedState.worldFacts = [...(stagedState.worldFacts || [])];
    stagedState.events = [...(stagedState.events || [])];
    stagedState.outcomes = { ...(stagedState.outcomes || {}) };
    stagedState.objectives = { ...(stagedState.objectives || {}) };
    stagedState.clocks = { ...(stagedState.clocks || {}) };
    const acceptedClaims = [];
    const rejectedRecords = [];
    const ordered = (Array.isArray(claims) ? claims : [])
        .map((claim, originalIndex) => ({ claim, originalIndex }))
        .sort((left, right) => claimOrder(
            { ...left, policy: index.evidencePolicies.get(left.claim?.policyId) },
            { ...right, policy: index.evidencePolicies.get(right.claim?.policyId) },
        ));

    for (const { claim, originalIndex } of ordered) {
        const policy = index.evidencePolicies.get(claim?.policyId);
        if (!policy || policy.claimType !== claim?.claimType || policy.targetId !== claim?.targetId) {
            rejectedRecords.push({ claim, originalIndex, reasonCode: 'policy-mismatch' });
            continue;
        }
        if ((claim.dependencyEffectIds || []).some((effectId) => !activeDependencyEffectIds.has(effectId))) {
            rejectedRecords.push({ claim, originalIndex, reasonCode: 'dependency-not-met' });
            continue;
        }
        const policyResult = evaluateMissionPredicate(policy.when, missionStateContext(definition, stagedState, {
            shipCapabilityEvidenceById,
        }));
        const disclosureHasTruth = claim.claimType !== 'factDisclosed'
            || stagedState.worldFacts.includes(claim.targetId);
        if (!policyResult.ok || !policyResult.value || !disclosureHasTruth) {
            rejectedRecords.push({ claim, originalIndex, reasonCode: 'precondition-not-met' });
            continue;
        }
        acceptedClaims.push(structuredClone(claim));
        stageAcceptedClaim(stagedState, claim);
    }

    return {
        acceptedClaims,
        rejectedClaims: rejectedRecords
            .sort((left, right) => left.originalIndex - right.originalIndex)
            .map(({ claim, reasonCode }) => rejection(claim, reasonCode)),
    };
}

export function validateMissionEvidenceProposal({
    definition = {},
    state = {},
    proposal = {},
    resolveSourceRef,
    shipCapabilityEvidenceById = new Map(),
} = {}) {
    const claims = Array.isArray(proposal?.claims) ? proposal.claims : [];
    if (proposal.kind !== MISSION_EVIDENCE_PROPOSAL_KIND) return rejectAll(claims, 'effect-not-allowed');
    if (proposal.missionId !== definition.id) return rejectAll(claims, 'effect-not-allowed');
    if (proposal.branchId !== state.branchId) return rejectAll(claims, 'wrong-branch');
    if (proposal.baseRevision !== state.revision) return rejectAll(claims, 'stale-revision');

    const index = indexMissionDefinition(definition);
    const candidates = [];
    const rejectedRecords = [];
    const previouslyAccepted = new Set(Array.isArray(state.acceptedEvidenceKeys) ? state.acceptedEvidenceKeys : []);
    const seenClaimIds = new Set();

    function rejectAt(claim, reasonCode, originalIndex) {
        rejectedRecords.push({ claim, reasonCode, originalIndex });
    }

    for (const [originalIndex, claim] of claims.entries()) {
        if (!isStableId(claim?.claimId)) {
            rejectAt(claim, 'effect-not-allowed', originalIndex);
            continue;
        }
        if (seenClaimIds.has(claim.claimId)) {
            rejectAt(claim, 'duplicate-claim', originalIndex);
            continue;
        }
        seenClaimIds.add(claim.claimId);
        const source = typeof resolveSourceRef === 'function' && claim?.sourceRef && typeof claim.sourceRef === 'object'
            ? resolveSourceRef(claim.sourceRef)
            : null;
        if (!source) {
            rejectAt(claim, 'source-missing', originalIndex);
            continue;
        }
        if (source.branchId !== state.branchId) {
            rejectAt(claim, 'wrong-branch', originalIndex);
            continue;
        }
        if (source.accepted !== true) {
            rejectAt(claim, 'source-not-accepted', originalIndex);
            continue;
        }
        if (!ACCEPTED_SOURCE_ROLES.has(source.role)) {
            rejectAt(claim, 'source-not-accepted', originalIndex);
            continue;
        }
        if ((claim?.sourceRef?.swipeId || null) !== (source.selectedSwipeId || null)) {
            rejectAt(claim, 'swipe-mismatch', originalIndex);
            continue;
        }
        if (claim?.sourceRef?.textHash !== source.textHash) {
            rejectAt(claim, 'hash-mismatch', originalIndex);
            continue;
        }
        if (source.acceptedAtRevision > state.revision) {
            rejectAt(claim, 'stale-revision', originalIndex);
            continue;
        }
        if (!MISSION_EVIDENCE_CLAIM_TYPES.has(claim?.claimType)) {
            rejectAt(claim, 'effect-not-allowed', originalIndex);
            continue;
        }
        if (!targetExistsAnywhere(index, claim?.targetId)) {
            rejectAt(claim, 'unknown-target', originalIndex);
            continue;
        }
        const policy = index.evidencePolicies.get(claim?.policyId);
        if (!policy) {
            rejectAt(claim, 'unknown-policy', originalIndex);
            continue;
        }
        if (policy.claimType !== claim.claimType || policy.targetId !== claim.targetId) {
            rejectAt(claim, 'policy-mismatch', originalIndex);
            continue;
        }
        const collection = MISSION_EVIDENCE_TARGET_COLLECTION_BY_CLAIM_TYPE[claim.claimType];
        if (!index[collection].has(claim.targetId)) {
            rejectAt(claim, 'effect-not-allowed', originalIndex);
            continue;
        }
        if (claim.claimType === 'worldFactEstablished' && !AUTHORITATIVE_SOURCE_ROLES.has(source.role)) {
            rejectAt(claim, 'world-truth-authority-required', originalIndex);
            continue;
        }
        if (claim.claimType === 'timeAdvanced' && !AUTHORITATIVE_SOURCE_ROLES.has(source.role)) {
            rejectAt(claim, 'authoritative-time-required', originalIndex);
            continue;
        }
        if (!Array.isArray(policy.sourceRoles) || !policy.sourceRoles.includes(source.role)) {
            rejectAt(claim, 'source-role-not-authorized', originalIndex);
            continue;
        }
        if (Object.hasOwn(claim, 'delivery')) {
            const delivery = validateDutyReportDeliveryReceipt({
                definition,
                delivery: claim.delivery,
                claim,
                source,
            });
            if (!delivery.ok) {
                rejectAt(claim, 'delivery-invalid', originalIndex);
                continue;
            }
        }
        if (new Set(['decisionRecorded', 'outcomeObserved']).has(claim.claimType)) {
            const outcome = index.outcomes.get(claim.targetId);
            if (!outcome?.allowedValues?.includes(claim.value)) {
                rejectAt(claim, 'effect-not-allowed', originalIndex);
                continue;
            }
        }
        if (claim.claimType === 'timeAdvanced' && (!Number.isFinite(claim.value) || claim.value <= 0)) {
            rejectAt(claim, 'effect-not-allowed', originalIndex);
            continue;
        }
        if (source.role === 'user' && !PLAYER_PROVABLE_CLAIM_TYPES.has(claim.claimType)) {
            rejectAt(claim, 'player-cannot-prove-outcome', originalIndex);
            continue;
        }
        const key = evidenceKey(state.branchId, claim, source);
        if (previouslyAccepted.has(key)) {
            rejectAt(claim, 'duplicate-claim', originalIndex);
            continue;
        }
        candidates.push({ claim, source, policy, evidenceKey: key, originalIndex });
    }

    const stagedState = structuredClone(state);
    stagedState.knownFacts = [...(stagedState.knownFacts || [])];
    stagedState.worldFacts = [...(stagedState.worldFacts || [])];
    stagedState.events = [...(stagedState.events || [])];
    stagedState.outcomes = { ...(stagedState.outcomes || {}) };
    stagedState.objectives = { ...(stagedState.objectives || {}) };
    stagedState.clocks = { ...(stagedState.clocks || {}) };
    const acceptedClaims = [];
    const acceptedInProposal = new Set();
    for (const candidate of [...candidates].sort(claimOrder)) {
        if (acceptedInProposal.has(candidate.evidenceKey)) {
            rejectAt(candidate.claim, 'duplicate-claim', candidate.originalIndex);
            continue;
        }
        const policyResult = evaluateMissionPredicate(
            candidate.policy.when,
            missionStateContext(definition, stagedState, { shipCapabilityEvidenceById }),
        );
        const disclosureHasTruth = candidate.claim.claimType !== 'factDisclosed'
            || stagedState.worldFacts.includes(candidate.claim.targetId);
        if (!policyResult.ok || !policyResult.value || !disclosureHasTruth) {
            rejectAt(candidate.claim, 'precondition-not-met', candidate.originalIndex);
            continue;
        }
        const shipCapabilityRefs = collectMissionPredicateRefs(candidate.policy.when).shipCapabilities;
        const dependencyEffectIds = [...new Set([...shipCapabilityRefs].flatMap((capabilityId) => (
            shipCapabilityEvidenceById.get(capabilityId) || []
        )))].sort();
        const accepted = {
            ...candidate.claim,
            evidenceKey: candidate.evidenceKey,
            ...(dependencyEffectIds.length > 0 ? { dependencyEffectIds } : {}),
            ...(typeof candidate.source?.contributionId === 'string' && candidate.source.contributionId.length > 0
                ? { sourceContributionId: candidate.source.contributionId }
                : {}),
        };
        acceptedClaims.push(accepted);
        acceptedInProposal.add(candidate.evidenceKey);
        stageAcceptedClaim(stagedState, accepted);
    }

    const rejectedClaims = rejectedRecords
        .sort((a, b) => a.originalIndex - b.originalIndex)
        .map((record) => rejection(record.claim, record.reasonCode));

    return {
        acceptedClaims,
        rejectedClaims,
        errors: [],
        proposalRejected: false,
        rejectionReasonCode: null,
    };
}
