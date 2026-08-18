import { reduceMissionEvidence } from './mission-reducer.mjs';
import { createMissionState, validateMissionState } from './mission-state.mjs';
import { validateDutyReportDeliveryReceipt } from './duty-report-delivery.mjs';
import { collectMissionPredicateRefs } from './predicate-evaluator.mjs';
import { appendShipWorkEvidenceToMissionState } from '../../ship/v1/ship-work-evidence.mjs';

const CLAIM_TARGET_COLLECTION = Object.freeze({
    worldFactEstablished: 'facts',
    factDisclosed: 'facts',
    eventOccurred: 'events',
    outcomeObserved: 'outcomes',
    decisionRecorded: 'outcomes',
    intentExpressed: 'objectives',
});

function evidenceQuoteHash(value = '') {
    let hash = 0x811c9dc5;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function jsonEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function evidenceBatches(evidenceLog, errors) {
    const batches = [];
    let previousRevision = -1;
    for (const entry of evidenceLog) {
        const revision = entry?.acceptedAtMissionRevision;
        if (!Number.isInteger(revision) || revision < 0 || revision < previousRevision) {
            errors.push('evidenceLog acceptance revisions must be non-negative and monotonic');
            return [];
        }
        if (batches.length === 0 || batches.at(-1).revision !== revision) {
            batches.push({ revision, claims: [] });
        }
        batches.at(-1).claims.push(structuredClone(entry));
        previousRevision = revision;
    }
    return batches;
}

function validateEvidenceLog(definition, state, errors) {
    const collections = Object.fromEntries(Object.entries(CLAIM_TARGET_COLLECTION).map(
        ([claimType, collection]) => [claimType, new Map((definition[collection] || []).map((item) => [item.id, item]))],
    ));
    const evidenceKeys = new Set();
    for (const entry of state.evidenceLog || []) {
        const isShipWork = entry?.domain === 'shipWork' && entry?.claimType === 'shipMilestoneCompleted';
        const targetCollection = collections[entry?.claimType];
        if (!entry?.evidenceKey || typeof entry.evidenceKey !== 'string') {
            errors.push('evidenceLog entry evidenceKey must be a non-empty string');
        } else if (evidenceKeys.has(entry.evidenceKey)) {
            errors.push(`evidenceLog contains duplicate evidenceKey: ${entry.evidenceKey}`);
        }
        evidenceKeys.add(entry?.evidenceKey);
        if (!isShipWork && !targetCollection?.has(entry?.targetId)) {
            errors.push(`evidenceLog target is not authored for ${entry?.claimType || 'unknown claim type'}`);
            continue;
        }
        if (new Set(['outcomeObserved', 'decisionRecorded']).has(entry.claimType)) {
            const outcome = targetCollection.get(entry.targetId);
            if (!(outcome.allowedValues || []).includes(entry.value)) {
                errors.push(`evidenceLog outcome value is not authored: ${entry.targetId}`);
            }
        }
        if (typeof entry?.sourceContributionId !== 'string' || entry.sourceContributionId.length === 0) {
            errors.push('evidenceLog entry sourceContributionId is required');
        }
        if (entry.evidenceQuote !== undefined) {
            const quote = String(entry.evidenceQuote);
            if ([...quote].length < 12 || [...quote].length > 240) {
                errors.push('evidenceLog evidenceQuote must contain 12 through 240 characters');
            }
            if (entry.evidenceQuoteHash !== evidenceQuoteHash(quote)) {
                errors.push('evidenceLog evidenceQuoteHash does not match evidenceQuote');
            }
        } else if (entry.evidenceQuoteHash !== undefined) {
            errors.push('evidenceLog evidenceQuoteHash requires evidenceQuote');
        }
        if (entry?.delivery !== undefined) {
            const delivery = validateDutyReportDeliveryReceipt({
                definition,
                delivery: entry.delivery,
                claim: entry,
                source: {
                    role: 'assistant',
                    accepted: true,
                    dutyReportCustodyOwned: true,
                    messageId: entry.delivery?.hostMessageId,
                    selectedSwipeId: entry.delivery?.selectedSwipeId,
                    textHash: entry.delivery?.visibleTextHash,
                    responseId: entry.delivery?.responseId,
                },
            });
            if (!delivery.ok) {
                errors.push(`evidenceLog Duty Report delivery is invalid: ${delivery.errors.join('; ')}`);
            } else {
                const expectedEvidenceKey = [
                    state.branchId,
                    entry.delivery.hostMessageId,
                    entry.delivery.selectedSwipeId || 'no-swipe',
                    entry.delivery.visibleTextHash,
                    entry.claimType,
                    entry.targetId,
                ].join('|');
                if (entry.evidenceKey !== expectedEvidenceKey) {
                    errors.push('evidenceLog Duty Report delivery does not match evidenceKey source custody');
                }
            }
        }
    }
    if (!jsonEqual(state.acceptedEvidenceKeys || [], [...evidenceKeys])) {
        errors.push('acceptedEvidenceKeys must exactly match evidenceLog order');
    }
}

function addShipCapabilityDependencies(definition, claims, capabilityEvidenceById) {
    const policies = new Map((definition.evidencePolicies || []).map((policy) => [policy.id, policy]));
    for (const claim of claims) {
        const dependencies = Array.isArray(claim.dependencyEffectIds) ? claim.dependencyEffectIds : [];
        if (dependencies.length === 0) continue;
        const refs = collectMissionPredicateRefs(policies.get(claim.policyId)?.when).shipCapabilities;
        for (const capabilityId of refs) {
            const known = capabilityEvidenceById.get(capabilityId) || [];
            capabilityEvidenceById.set(capabilityId, [...new Set([...known, ...dependencies])].sort());
        }
    }
}

function comparableTransitionReceipt(receipt) {
    if (!receipt) return null;
    const copy = structuredClone(receipt);
    delete copy.committedAtRevision;
    return copy;
}

export function validateMissionStateAuthority({ definition = {}, state = {} } = {}) {
    const structural = validateMissionState({ definition, state });
    const errors = [...structural.errors];
    if (!structural.ok) return { ok: false, errors };
    validateEvidenceLog(definition, state, errors);
    const batches = evidenceBatches(state.evidenceLog, errors);
    if (errors.length > 0) return { ok: false, errors };

    let rebuilt = createMissionState({
        definition,
        branchId: state.branchId,
        ...(state.entryContext === undefined ? {} : { entryContext: state.entryContext }),
    });
    const shipCapabilityEvidenceById = new Map();
    try {
        for (const batch of batches) {
            const shipClaims = batch.claims.filter((claim) => claim.domain === 'shipWork');
            const missionClaims = batch.claims.filter((claim) => claim.domain !== 'shipWork');
            if (shipClaims.length > 0) {
                rebuilt = appendShipWorkEvidenceToMissionState(rebuilt, shipClaims);
            }
            if (missionClaims.length > 0) {
                addShipCapabilityDependencies(definition, missionClaims, shipCapabilityEvidenceById);
                rebuilt = reduceMissionEvidence({
                    definition,
                    state: rebuilt,
                    acceptedClaims: missionClaims,
                    sourceContribution: null,
                    shipCapabilityEvidenceById,
                }).state;
            }
        }
    } catch {
        return { ok: false, errors: [...errors, 'evidenceLog cannot reconstruct mission authority'] };
    }

    for (const field of [
        'status',
        'objectives',
        'knownFacts',
        'worldFacts',
        'events',
        'outcomes',
        'outcomeDimensions',
        'acceptedEvidenceKeys',
        'terminalDisposition',
        ...(state.entryContext === undefined ? [] : ['entryContext']),
    ]) {
        if (!jsonEqual(state[field], rebuilt[field])) {
            errors.push(`${field} does not match replayed accepted evidence`);
        }
    }
    if (!jsonEqual(
        comparableTransitionReceipt(state.transitionReceipt),
        comparableTransitionReceipt(rebuilt.transitionReceipt),
    )) {
        errors.push('transitionReceipt does not match replayed accepted evidence');
    }
    if (state.revision < rebuilt.revision) {
        errors.push('revision predates replayed accepted evidence');
    }
    return { ok: errors.length === 0, errors };
}
