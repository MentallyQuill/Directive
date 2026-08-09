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
    evidencePolicies: [
        {
            id: 'policy.survivors-transferred',
            claimType: 'eventOccurred',
            targetId: 'event.survivors-transferred',
            sourceRoles: ['assistant', 'runtime', 'adjudicator'],
            when: true,
        },
        {
            id: 'policy.evidence-observed',
            claimType: 'outcomeObserved',
            targetId: 'outcome.evidence-preserved',
            sourceRoles: ['assistant', 'runtime', 'adjudicator'],
            when: true,
        },
        {
            id: 'policy.evidence-decision',
            claimType: 'decisionRecorded',
            targetId: 'outcome.evidence-preserved',
            sourceRoles: ['user'],
            when: { factKnown: 'fact.hesperus-discrepancy-known' },
        },
        {
            id: 'policy.rescue-intent',
            claimType: 'intentExpressed',
            targetId: 'objective.hesperus-rescue',
            sourceRoles: ['user'],
            when: true,
        },
        {
            id: 'policy.authoritative-time',
            claimType: 'timeAdvanced',
            targetId: 'clock.life-support',
            sourceRoles: ['runtime', 'adjudicator'],
            when: { clockState: { id: 'clock.life-support', equals: 'running' } },
        },
        {
            id: 'policy.discrepancy-established',
            claimType: 'worldFactEstablished',
            targetId: 'fact.hesperus-discrepancy-known',
            sourceRoles: ['runtime', 'adjudicator'],
            when: true,
        },
        {
            id: 'policy.discrepancy-disclosed',
            claimType: 'factDisclosed',
            targetId: 'fact.hesperus-discrepancy-known',
            sourceRoles: ['assistant', 'runtime', 'adjudicator'],
            when: { worldFact: 'fact.hesperus-discrepancy-known' },
        },
    ],
};
const state = {
    branchId: 'save.alpha',
    revision: 4,
    acceptedEvidenceKeys: [],
    knownFacts: [],
    worldFacts: [],
    events: [],
    outcomes: { 'outcome.evidence-preserved': 'unknown' },
    objectives: { 'objective.hesperus-rescue': { state: 'available', disposition: null } },
    clocks: { 'clock.life-support': { state: 'running', value: 30 } },
    status: 'active',
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
const runtimeSource = {
    messageId: 'runtime.clock-4',
    branchId: 'save.alpha',
    accepted: true,
    selectedSwipeId: null,
    textHash: 'c'.repeat(64),
    role: 'runtime',
    acceptedAtRevision: 4,
};
const acceptedSources = new Map([
    [assistantSource.messageId, assistantSource],
    [playerSource.messageId, playerSource],
    [runtimeSource.messageId, runtimeSource],
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
            policyId: 'policy.survivors-transferred',
            claimType: 'eventOccurred',
            targetId: 'event.survivors-transferred',
            sourceRef: sourceRef(assistantSource),
        },
        {
            claimId: 'claim.player-declares-evidence',
            policyId: 'policy.evidence-observed',
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
assert.equal(result.rejectedClaims[0].reasonCode, 'source-role-not-authorized');

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
    }, 'policy-mismatch'],
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
        policyId: 'policy.rescue-intent',
        claimType: 'intentExpressed',
        targetId: 'objective.hesperus-rescue',
        sourceRef: sourceRef(playerSource),
    },
    {
        claimId: 'claim.player-decision',
        policyId: 'policy.evidence-decision',
        claimType: 'decisionRecorded',
        targetId: 'outcome.evidence-preserved',
        value: 'no',
        sourceRef: sourceRef(playerSource),
    },
    {
        claimId: 'claim.time-advanced',
        policyId: 'policy.authoritative-time',
        claimType: 'timeAdvanced',
        targetId: 'clock.life-support',
        value: 5,
        sourceRef: sourceRef(runtimeSource),
    },
]) {
    const accepted = validate({ claims: [claim] });
    if (claim.claimType === 'decisionRecorded') {
        const informed = validate({
            claims: [claim],
            stateOverrides: { knownFacts: ['fact.hesperus-discrepancy-known'] },
        });
        assert.equal(informed.acceptedClaims.length, 1, `${claim.claimType}: ${JSON.stringify(informed.rejectedClaims)}`);
    } else {
        assert.equal(accepted.acceptedClaims.length, 1, `${claim.claimType}: ${JSON.stringify(accepted.rejectedClaims)}`);
    }
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
            policyId: 'policy.evidence-observed',
            claimType: 'outcomeObserved',
            targetId: 'outcome.evidence-preserved',
            value: 'maybe',
            sourceRef: sourceRef(assistantSource),
        }],
    }, 'effect-not-allowed'],
    ['invalid time advance', {
        claims: [{
            claimId: 'claim.invalid-time',
            policyId: 'policy.authoritative-time',
            claimType: 'timeAdvanced',
            targetId: 'clock.life-support',
            value: -5,
            sourceRef: sourceRef(runtimeSource),
        }],
    }, 'effect-not-allowed'],
]) {
    const rejected = validate(options);
    assert.equal(rejected.acceptedClaims.length, 0, label);
    assert.equal(rejected.rejectedClaims[0]?.reasonCode, reasonCode, label);
}

const missingClaimId = validate({ claims: [{ ...proposal.claims[0], claimId: '' }] });
assert.equal(missingClaimId.rejectedClaims[0].reasonCode, 'effect-not-allowed');

const duplicateClaimId = validate({ claims: [
    proposal.claims[0],
    {
        claimId: proposal.claims[0].claimId,
        policyId: 'policy.discrepancy-disclosed',
        claimType: 'factDisclosed',
        targetId: 'fact.hesperus-discrepancy-known',
        sourceRef: sourceRef(assistantSource),
    },
] });
assert.equal(duplicateClaimId.acceptedClaims.length, 1);
assert.equal(duplicateClaimId.rejectedClaims[0].reasonCode, 'duplicate-claim');

for (const [label, claim, reasonCode] of [
    ['missing policy', { ...proposal.claims[0], policyId: undefined }, 'unknown-policy'],
    ['unknown policy', { ...proposal.claims[0], policyId: 'policy.unknown' }, 'unknown-policy'],
    ['policy target mismatch', {
        ...proposal.claims[0],
        policyId: 'policy.discrepancy-disclosed',
    }, 'policy-mismatch'],
    ['uninformed player decision', {
        claimId: 'claim.uninformed-decision',
        policyId: 'policy.evidence-decision',
        claimType: 'decisionRecorded',
        targetId: 'outcome.evidence-preserved',
        value: 'no',
        sourceRef: sourceRef(playerSource),
    }, 'precondition-not-met'],
    ['assistant establishes world truth', {
        claimId: 'claim.assistant-truth',
        policyId: 'policy.discrepancy-established',
        claimType: 'worldFactEstablished',
        targetId: 'fact.hesperus-discrepancy-known',
        sourceRef: sourceRef(assistantSource),
    }, 'world-truth-authority-required'],
    ['assistant advances authoritative time', {
        claimId: 'claim.assistant-time',
        policyId: 'policy.authoritative-time',
        claimType: 'timeAdvanced',
        targetId: 'clock.life-support',
        value: 5,
        sourceRef: sourceRef(assistantSource),
    }, 'authoritative-time-required'],
    ['disclosure before truth', {
        claimId: 'claim.premature-disclosure',
        policyId: 'policy.discrepancy-disclosed',
        claimType: 'factDisclosed',
        targetId: 'fact.hesperus-discrepancy-known',
        sourceRef: sourceRef(assistantSource),
    }, 'precondition-not-met'],
]) {
    const rejected = validate({ claims: [claim] });
    assert.equal(rejected.acceptedClaims.length, 0, label);
    assert.equal(rejected.rejectedClaims[0]?.reasonCode, reasonCode, label);
}

const establishmentAndDisclosure = validate({
    claims: [
        {
            claimId: 'claim.discrepancy-disclosed',
            policyId: 'policy.discrepancy-disclosed',
            claimType: 'factDisclosed',
            targetId: 'fact.hesperus-discrepancy-known',
            sourceRef: sourceRef(assistantSource),
        },
        {
            claimId: 'claim.discrepancy-established',
            policyId: 'policy.discrepancy-established',
            claimType: 'worldFactEstablished',
            targetId: 'fact.hesperus-discrepancy-known',
            sourceRef: sourceRef(runtimeSource),
        },
        {
            claimId: 'claim.informed-decision',
            policyId: 'policy.evidence-decision',
            claimType: 'decisionRecorded',
            targetId: 'outcome.evidence-preserved',
            value: 'yes',
            sourceRef: sourceRef(playerSource),
        },
    ],
});
assert.deepEqual(
    establishmentAndDisclosure.acceptedClaims.map((claim) => claim.claimType),
    ['worldFactEstablished', 'factDisclosed', 'decisionRecorded'],
);
assert.equal(establishmentAndDisclosure.acceptedClaims[1].policyId, 'policy.discrepancy-disclosed');
assert.equal(establishmentAndDisclosure.rejectedClaims.length, 0);

const lowConfidence = validate({
    proposalOverrides: { providerConfidence: 0.01 },
});
assert.equal(lowConfidence.acceptedClaims.length, 1);

console.log('V1 mission evidence tests passed.');
