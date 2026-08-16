import assert from 'node:assert/strict';

import {
    revalidateMissionEvidenceReplay,
    validateMissionEvidenceProposal,
} from '../../src/mission/v1/evidence-contracts.mjs';

const definition = {
    id: 'mission.hesperus-reference',
    objectives: [{
        id: 'objective.hesperus-rescue',
        terminalWhen: [{
            disposition: 'completed',
            when: { outcomeIs: { id: 'outcome.rescue-result', equals: 'safe' } },
        }],
    }],
    facts: [{ id: 'fact.hesperus-discrepancy-known' }],
    events: [{ id: 'event.survivors-transferred' }, { id: 'event.rescue-begun' }],
    outcomes: [
        { id: 'outcome.evidence-preserved', allowedValues: ['unknown', 'yes', 'no'] },
        { id: 'outcome.rescue-result', allowedValues: ['pending', 'safe'] },
    ],
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
            id: 'policy.rescue-begun',
            claimType: 'eventOccurred',
            targetId: 'event.rescue-begun',
            sourceRoles: ['assistant', 'runtime', 'adjudicator'],
            when: true,
        },
        {
            id: 'policy.rescue-result',
            claimType: 'outcomeObserved',
            targetId: 'outcome.rescue-result',
            sourceRoles: ['assistant', 'runtime', 'adjudicator'],
            when: { eventOccurred: 'event.rescue-begun' },
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
    outcomes: {
        'outcome.evidence-preserved': 'unknown',
        'outcome.rescue-result': 'pending',
    },
    objectives: { 'objective.hesperus-rescue': { state: 'available', disposition: null } },
    clocks: { 'clock.life-support': { state: 'running', value: 30 } },
    status: 'active',
};
const assistantSource = {
    contributionId: 'contribution.assistant-4',
    messageId: 'message.assistant-4',
    branchId: 'save.alpha',
    accepted: true,
    selectedSwipeId: 'swipe.2',
    textHash: 'a'.repeat(64),
    role: 'assistant',
    acceptedAtRevision: 4,
};
const playerSource = {
    contributionId: 'contribution.player-4',
    messageId: 'message.player-4',
    branchId: 'save.alpha',
    accepted: true,
    selectedSwipeId: null,
    textHash: 'b'.repeat(64),
    role: 'user',
    acceptedAtRevision: 4,
};
const runtimeSource = {
    contributionId: 'contribution.runtime-clock-4',
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
assert.equal(result.acceptedClaims[0].sourceContributionId, 'contribution.assistant-4');
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

const sameProposalCannotCreateTerminalPrerequisite = validate({
    claims: [
        {
            claimId: 'claim.rescue-begun',
            policyId: 'policy.rescue-begun',
            claimType: 'eventOccurred',
            targetId: 'event.rescue-begun',
            sourceRef: sourceRef(assistantSource),
        },
        {
            claimId: 'claim.rescue-result',
            policyId: 'policy.rescue-result',
            claimType: 'outcomeObserved',
            targetId: 'outcome.rescue-result',
            value: 'safe',
            sourceRef: sourceRef(assistantSource),
        },
    ],
});
assert.deepEqual(
    sameProposalCannotCreateTerminalPrerequisite.acceptedClaims.map((claim) => claim.claimId),
    ['claim.rescue-begun'],
);
assert.equal(sameProposalCannotCreateTerminalPrerequisite.rejectedClaims[0]?.claimId, 'claim.rescue-result');
assert.equal(sameProposalCannotCreateTerminalPrerequisite.rejectedClaims[0]?.reasonCode, 'precondition-not-met');

const replayCannotCreateTerminalPrerequisite = revalidateMissionEvidenceReplay({
    definition,
    state,
    claims: [
        {
            claimId: 'claim.rescue-begun',
            policyId: 'policy.rescue-begun',
            claimType: 'eventOccurred',
            targetId: 'event.rescue-begun',
        },
        {
            claimId: 'claim.rescue-result',
            policyId: 'policy.rescue-result',
            claimType: 'outcomeObserved',
            targetId: 'outcome.rescue-result',
            value: 'safe',
        },
    ],
});
assert.deepEqual(replayCannotCreateTerminalPrerequisite.acceptedClaims.map((claim) => claim.claimId), ['claim.rescue-begun']);
assert.equal(replayCannotCreateTerminalPrerequisite.rejectedClaims[0]?.claimId, 'claim.rescue-result');
assert.equal(replayCannotCreateTerminalPrerequisite.rejectedClaims[0]?.reasonCode, 'precondition-not-met');

const shipCapabilityDefinition = structuredClone(definition);
shipCapabilityDefinition.events.push({ id: 'event.segmented-isolation-used' });
shipCapabilityDefinition.evidencePolicies.push({
    id: 'policy.segmented-isolation-used',
    claimType: 'eventOccurred',
    targetId: 'event.segmented-isolation-used',
    sourceRoles: ['assistant'],
    when: { shipCapabilityAvailable: 'ship-capability.segmented-isolation' },
});
const shipCapabilityClaim = {
    claimId: 'claim.segmented-isolation-used',
    policyId: 'policy.segmented-isolation-used',
    claimType: 'eventOccurred',
    targetId: 'event.segmented-isolation-used',
    sourceRef: sourceRef(assistantSource),
};
const withoutShipCapability = validateMissionEvidenceProposal({
    definition: shipCapabilityDefinition,
    state: { ...state, events: [] },
    proposal: { ...proposal, claims: [shipCapabilityClaim] },
    resolveSourceRef: () => assistantSource,
    shipCapabilityEvidenceById: new Map(),
});
assert.equal(withoutShipCapability.acceptedClaims.length, 0);
assert.equal(withoutShipCapability.rejectedClaims[0].reasonCode, 'precondition-not-met');

const withShipCapability = validateMissionEvidenceProposal({
    definition: shipCapabilityDefinition,
    state: { ...state, events: [] },
    proposal: { ...proposal, claims: [shipCapabilityClaim] },
    resolveSourceRef: () => assistantSource,
    shipCapabilityEvidenceById: new Map([[
        'ship-capability.segmented-isolation',
        ['effect.ship.isolation-test'],
    ]]),
});
assert.equal(withShipCapability.acceptedClaims.length, 1);
assert.deepEqual(withShipCapability.acceptedClaims[0].dependencyEffectIds, ['effect.ship.isolation-test']);

const replayWithDependency = revalidateMissionEvidenceReplay({
    definition: shipCapabilityDefinition,
    state: { ...state, events: [] },
    claims: withShipCapability.acceptedClaims,
    shipCapabilityEvidenceById: new Map([[
        'ship-capability.segmented-isolation',
        ['effect.ship.isolation-test'],
    ]]),
    activeDependencyEffectIds: new Set(['effect.ship.isolation-test']),
});
assert.equal(replayWithDependency.acceptedClaims.length, 1);

const replayWithoutDependency = revalidateMissionEvidenceReplay({
    definition: shipCapabilityDefinition,
    state: { ...state, events: [] },
    claims: withShipCapability.acceptedClaims,
    shipCapabilityEvidenceById: new Map(),
    activeDependencyEffectIds: new Set(),
});
assert.equal(replayWithoutDependency.acceptedClaims.length, 0);
assert.equal(replayWithoutDependency.rejectedClaims[0].reasonCode, 'dependency-not-met');

const reportDefinition = {
    ...definition,
    reportRoutes: [{
        id: 'report.hesperus-discrepancy',
        factId: 'fact.hesperus-discrepancy-known',
        evidencePolicyId: 'policy.discrepancy-disclosed',
        capabilityRoles: ['engineering'],
        preferredActorIds: ['hadrik-bronn'],
        fallbackActorIds: ['mara-whitaker'],
        urgency: 'material',
        confidence: 'credible',
        deliveryRequirement: 'required',
        when: true,
        playerText: { summary: 'Engineering has a discrepancy to report.' },
    }],
};
const reportSource = {
    ...assistantSource,
    responseId: 'directive-response.report-4',
    directiveOwned: true,
    dutyReportCustodyOwned: true,
};
const reportDelivery = {
    kind: 'directive.dutyReportDelivery.v1',
    contractVersion: 1,
    reportId: 'report.hesperus-discrepancy',
    factId: 'fact.hesperus-discrepancy-known',
    reporterId: 'hadrik-bronn',
    policyId: 'policy.discrepancy-disclosed',
    responseId: 'directive-response.report-4',
    hostMessageId: reportSource.messageId,
    selectedSwipeId: reportSource.selectedSwipeId,
    visibleTextHash: reportSource.textHash,
    segmentTextHash: 'a1b2c3d4e5f60718',
    sourceTransactionId: 'txn.report-4',
};
const reportClaim = {
    claimId: 'claim.report-disclosure',
    policyId: 'policy.discrepancy-disclosed',
    claimType: 'factDisclosed',
    targetId: 'fact.hesperus-discrepancy-known',
    sourceRef: sourceRef(reportSource),
    delivery: reportDelivery,
};
const acceptedReport = validateMissionEvidenceProposal({
    definition: reportDefinition,
    state: { ...state, worldFacts: ['fact.hesperus-discrepancy-known'] },
    proposal: { ...proposal, claims: [reportClaim] },
    resolveSourceRef: () => reportSource,
});
assert.equal(acceptedReport.acceptedClaims.length, 1);
assert.deepEqual(acceptedReport.acceptedClaims[0].delivery, reportDelivery);
for (const [label, delivery] of [
    ['wrong response', { ...reportDelivery, responseId: 'directive-response.forged' }],
    ['wrong selected swipe', { ...reportDelivery, selectedSwipeId: 'swipe.forged' }],
    ['wrong visible hash', { ...reportDelivery, visibleTextHash: 'f'.repeat(64) }],
    ['unknown delivery field', { ...reportDelivery, modelRationale: 'trust me' }],
]) {
    const rejected = validateMissionEvidenceProposal({
        definition: reportDefinition,
        state: { ...state, worldFacts: ['fact.hesperus-discrepancy-known'] },
        proposal: { ...proposal, claims: [{ ...reportClaim, delivery }] },
        resolveSourceRef: () => reportSource,
    });
    assert.equal(rejected.acceptedClaims.length, 0, label);
    assert.equal(rejected.rejectedClaims[0].reasonCode, 'delivery-invalid', label);
}

console.log('V1 mission evidence tests passed.');
