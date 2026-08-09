import assert from 'node:assert/strict';

import {
    validateMissionEvidenceProposal,
} from '../../src/mission/v1/evidence-contracts.mjs';

const definition = {
    id: 'mission.hesperus-reference',
    objectives: [{ id: 'objective.hesperus-rescue' }],
    facts: [{ id: 'fact.hesperus-discrepancy-known' }],
    events: [{ id: 'event.survivors-transferred' }],
    outcomes: [{ id: 'outcome.evidence-preserved', allowedValues: ['unknown', 'yes', 'no'] }],
    clocks: [{ id: 'clock.life-support' }],
};
const state = {
    branchId: 'save.alpha',
    revision: 4,
    acceptedEvidenceKeys: [],
};
const assistantSource = {
    messageId: 'message.assistant-4',
    branchId: 'save.alpha',
    accepted: true,
    selectedSwipeId: 'swipe.2',
    textHash: 'a'.repeat(64),
    role: 'assistant',
    acceptedAtRevision: 4,
};
const playerSource = {
    messageId: 'message.player-4',
    branchId: 'save.alpha',
    accepted: true,
    selectedSwipeId: null,
    textHash: 'b'.repeat(64),
    role: 'user',
    acceptedAtRevision: 4,
};
const acceptedSources = new Map([
    [assistantSource.messageId, assistantSource],
    [playerSource.messageId, playerSource],
]);
const sourceRef = (source) => ({
    messageId: source.messageId,
    swipeId: source.selectedSwipeId,
    textHash: source.textHash,
});
const proposal = {
    kind: 'directive.missionEvidenceProposal.v1',
    branchId: 'save.alpha',
    missionId: 'mission.hesperus-reference',
    baseRevision: 4,
    providerConfidence: 0.99,
    claims: [
        {
            claimId: 'claim.survivors-transferred',
            claimType: 'eventOccurred',
            targetId: 'event.survivors-transferred',
            sourceRef: sourceRef(assistantSource),
        },
        {
            claimId: 'claim.player-declares-evidence',
            claimType: 'outcomeObserved',
            targetId: 'outcome.evidence-preserved',
            value: 'yes',
            sourceRef: sourceRef(playerSource),
        },
    ],
};

const result = validateMissionEvidenceProposal({
    definition,
    state,
    proposal,
    resolveSourceRef: (ref) => acceptedSources.get(ref.messageId),
});
assert.deepEqual(result.acceptedClaims.map((claim) => claim.targetId), ['event.survivors-transferred']);
assert.equal(result.rejectedClaims[0].reasonCode, 'player-cannot-prove-outcome');

function validate({ proposalOverrides = {}, claims = [proposal.claims[0]], sources = acceptedSources, stateOverrides = {} } = {}) {
    return validateMissionEvidenceProposal({
        definition,
        state: { ...state, ...stateOverrides },
        proposal: { ...proposal, ...proposalOverrides, claims },
        resolveSourceRef: (ref) => sources.get(ref.messageId),
    });
}

for (const [label, options, reasonCode] of [
    ['wrong proposal branch', { proposalOverrides: { branchId: 'save.beta' } }, 'wrong-branch'],
    ['stale proposal revision', { proposalOverrides: { baseRevision: 3 } }, 'stale-revision'],
    ['source missing', {
        claims: [{ ...proposal.claims[0], sourceRef: { ...proposal.claims[0].sourceRef, messageId: 'message.missing' } }],
    }, 'source-missing'],
    ['source not accepted', {
        sources: new Map([[assistantSource.messageId, { ...assistantSource, accepted: false }]]),
    }, 'source-not-accepted'],
    ['swipe mismatch', {
        claims: [{ ...proposal.claims[0], sourceRef: { ...proposal.claims[0].sourceRef, swipeId: 'swipe.1' } }],
    }, 'swipe-mismatch'],
    ['hash mismatch', {
        claims: [{ ...proposal.claims[0], sourceRef: { ...proposal.claims[0].sourceRef, textHash: 'c'.repeat(64) } }],
    }, 'hash-mismatch'],
    ['unknown target', {
        claims: [{ ...proposal.claims[0], targetId: 'event.unknown' }],
    }, 'unknown-target'],
    ['effect not allowed', {
        claims: [{ ...proposal.claims[0], claimType: 'factDisclosed' }],
    }, 'effect-not-allowed'],
]) {
    const rejected = validate(options);
    assert.equal(rejected.acceptedClaims.length, 0, label);
    assert.equal(rejected.rejectedClaims[0]?.reasonCode, reasonCode, label);
}

const duplicateInProposal = validate({ claims: [proposal.claims[0], { ...proposal.claims[0], claimId: 'claim.duplicate' }] });
assert.equal(duplicateInProposal.acceptedClaims.length, 1);
assert.equal(duplicateInProposal.rejectedClaims[0].reasonCode, 'duplicate-claim');
assert.equal(typeof duplicateInProposal.acceptedClaims[0].evidenceKey, 'string');

const duplicateFromState = validate({
    stateOverrides: { acceptedEvidenceKeys: [duplicateInProposal.acceptedClaims[0].evidenceKey] },
});
assert.equal(duplicateFromState.rejectedClaims[0].reasonCode, 'duplicate-claim');

for (const claim of [
    {
        claimId: 'claim.player-intent',
        claimType: 'intentExpressed',
        targetId: 'objective.hesperus-rescue',
        sourceRef: sourceRef(playerSource),
    },
    {
        claimId: 'claim.player-decision',
        claimType: 'decisionRecorded',
        targetId: 'outcome.evidence-preserved',
        value: 'no',
        sourceRef: sourceRef(playerSource),
    },
    {
        claimId: 'claim.time-advanced',
        claimType: 'timeAdvanced',
        targetId: 'clock.life-support',
        value: 5,
        sourceRef: sourceRef(assistantSource),
    },
]) {
    const accepted = validate({ claims: [claim] });
    assert.equal(accepted.acceptedClaims.length, 1, `${claim.claimType}: ${JSON.stringify(accepted.rejectedClaims)}`);
}

for (const [label, options, reasonCode] of [
    ['wrong proposal kind', { proposalOverrides: { kind: 'directive.missionEvidenceProposal.v0' } }, 'effect-not-allowed'],
    ['wrong mission', { proposalOverrides: { missionId: 'mission.other' } }, 'effect-not-allowed'],
    ['unsupported source role', {
        sources: new Map([[assistantSource.messageId, { ...assistantSource, role: 'model' }]]),
    }, 'source-not-accepted'],
    ['invalid outcome value', {
        claims: [{
            claimId: 'claim.invalid-outcome',
            claimType: 'outcomeObserved',
            targetId: 'outcome.evidence-preserved',
            value: 'maybe',
            sourceRef: sourceRef(assistantSource),
        }],
    }, 'effect-not-allowed'],
    ['invalid time advance', {
        claims: [{
            claimId: 'claim.invalid-time',
            claimType: 'timeAdvanced',
            targetId: 'clock.life-support',
            value: -5,
            sourceRef: sourceRef(assistantSource),
        }],
    }, 'effect-not-allowed'],
]) {
    const rejected = validate(options);
    assert.equal(rejected.acceptedClaims.length, 0, label);
    assert.equal(rejected.rejectedClaims[0]?.reasonCode, reasonCode, label);
}

console.log('V1 mission evidence tests passed.');
