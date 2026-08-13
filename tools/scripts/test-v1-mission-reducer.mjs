import assert from 'node:assert/strict';
import fs from 'node:fs';

import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

const definition = JSON.parse(fs.readFileSync('tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json', 'utf8'));
const definitionValidation = validateMissionDefinition(definition);
assert.equal(definitionValidation.ok, true, definitionValidation.errors.join('\n'));

const state = createMissionState({ definition, branchId: 'save.alpha' });
assert.equal(state.kind, 'directive.missionState.v1');
assert.equal(state.definitionId, 'mission.hesperus-reference');
assert.equal(state.definitionVersion, '1.0.0');
assert.deepEqual(state.packageBinding, definition.packageBinding);
assert.equal(state.branchId, 'save.alpha');
assert.equal(state.revision, 0);
assert.equal(state.status, 'active');
assert.deepEqual(state.knownFacts, []);
assert.deepEqual(state.events, []);
assert.equal(state.outcomes['outcome.hesperus-evidence-preserved'], 'unknown');
assert.equal(state.objectives['objective.hesperus-rescue'].state, 'available');
assert.equal(state.objectives['objective.hesperus-rescue'].visibility, 'visible');
assert.equal(state.objectives['objective.hesperus-accountability'].state, 'inactive');
assert.equal(state.objectives['objective.hesperus-accountability'].visibility, 'hidden');
assert.equal(state.clocks['clock.hesperus-life-support'].state, 'running');
assert.equal(state.clocks['clock.hesperus-life-support'].value, 30);
assert.equal(state.clocks['clock.hesperus-life-support'].visibility, 'visible');
assert.equal(state.terminalDisposition, null);
assert.equal(state.transitionReceipt, null);

const initialTruthDefinition = structuredClone(definition);
initialTruthDefinition.facts[0].initiallyTrue = true;
initialTruthDefinition.facts[0].visibility = 'known';
const initialTruthState = createMissionState({ definition: initialTruthDefinition, branchId: 'save.initial-truth' });
assert.deepEqual(initialTruthState.worldFacts, ['fact.hesperus-discrepancy-known']);
assert.deepEqual(initialTruthState.knownFacts, ['fact.hesperus-discrepancy-known']);

const disclosureWithoutEstablishment = reduceMissionEvidence({
    definition,
    state,
    acceptedClaims: [{
        claimId: 'claim.disclosure-only',
        policyId: 'policy.hesperus-fraud-disclosed',
        claimType: 'factDisclosed',
        targetId: 'fact.hesperus-fraud-confirmed',
        evidenceKey: 'evidence.disclosure-only',
    }],
});
assert.deepEqual(disclosureWithoutEstablishment.state.knownFacts, ['fact.hesperus-fraud-confirmed']);
assert.deepEqual(disclosureWithoutEstablishment.state.worldFacts, []);

const stateBefore = structuredClone(state);
const rescueClaims = [{
    claimId: 'claim.survivors-transferred',
    policyId: 'policy.hesperus-survivors-transferred',
    claimType: 'eventOccurred',
    targetId: 'event.hesperus-survivors-transferred',
    evidenceKey: 'evidence.survivors-transferred',
}];
const sourceContribution = {
    id: 'contribution.hesperus-rescue',
    messageId: 'message.assistant-rescue',
    swipeId: 'swipe.1',
    role: 'assistant',
    textHash: 'a'.repeat(64),
    acceptedAtRevision: 1,
};
const rescueOnly = reduceMissionEvidence({
    definition,
    state,
    acceptedClaims: rescueClaims,
    sourceContribution,
});
assert.deepEqual(state, stateBefore);
assert.equal(rescueOnly.state.revision, 1);
assert.equal(rescueOnly.state.evidenceLog[0].claimId, 'claim.survivors-transferred');
assert.equal(rescueOnly.state.evidenceLog[0].policyId, 'policy.hesperus-survivors-transferred');
assert.equal(rescueOnly.state.status, 'terminal');
assert.equal(rescueOnly.state.terminalDisposition, 'primarySuccess');
assert.equal(rescueOnly.state.objectives['objective.hesperus-rescue'].disposition, 'completed');
assert.equal(rescueOnly.state.objectives['objective.hesperus-accountability'].state, 'inactive');
assert.equal(rescueOnly.state.objectives['objective.hesperus-accountability'].visibility, 'hidden');
assert.equal(rescueOnly.state.outcomeDimensions['dimension.lives-protected'], 'full');
assert.equal(rescueOnly.state.outcomeDimensions['dimension.accountability'], undefined);
assert.equal(rescueOnly.state.clocks['clock.hesperus-life-support'].state, 'resolved');
assert.equal(rescueOnly.transitionPacket.kind, 'directive.missionTransitionNarration.v1');
assert.equal(rescueOnly.transitionPacket.next.id, 'phase.command-review');
assert.equal(rescueOnly.transitionPacket.optionalOutcomeSummaries.length, 0);
assert.equal(rescueOnly.transitionPacket.mustNotReveal.includes('Do not mention undiscovered inspection misconduct.'), true);

const accountabilityClaims = [
    rescueClaims[0],
    {
        claimId: 'claim.fraud-established',
        policyId: 'policy.hesperus-fraud-established',
        claimType: 'worldFactEstablished',
        targetId: 'fact.hesperus-fraud-confirmed',
        evidenceKey: 'evidence.fraud-established',
    },
    {
        claimId: 'claim.fraud-confirmed',
        policyId: 'policy.hesperus-fraud-disclosed',
        claimType: 'factDisclosed',
        targetId: 'fact.hesperus-fraud-confirmed',
        evidenceKey: 'evidence.fraud-confirmed',
    },
    {
        claimId: 'claim.evidence-preserved',
        policyId: 'policy.hesperus-evidence-preserved',
        claimType: 'outcomeObserved',
        targetId: 'outcome.hesperus-evidence-preserved',
        value: 'yes',
        evidenceKey: 'evidence.evidence-preserved',
    },
];
const accountability = reduceMissionEvidence({
    definition,
    state,
    acceptedClaims: accountabilityClaims,
    sourceContribution,
});
assert.equal(accountability.state.terminalDisposition, 'primarySuccess');
assert.equal(accountability.state.objectives['objective.hesperus-accountability'].state, 'terminal');
assert.equal(accountability.state.objectives['objective.hesperus-accountability'].visibility, 'resolved');
assert.equal(accountability.state.objectives['objective.hesperus-accountability'].disposition, 'handedOff');
assert.equal(accountability.state.outcomeDimensions['dimension.accountability'], 'handed-off');
assert.deepEqual(accountability.state.worldFacts, ['fact.hesperus-fraud-confirmed']);
assert.deepEqual(accountability.state.knownFacts, ['fact.hesperus-fraud-confirmed']);
assert.deepEqual(
    accountability.state.evidenceLog.map((entry) => entry.claimId),
    [
        'claim.fraud-established',
        'claim.survivors-transferred',
        'claim.evidence-preserved',
        'claim.fraud-confirmed',
    ],
);
assert.deepEqual(accountability.transitionPacket.optionalOutcomeSummaries, ['Evidence was preserved and handed off for review.']);
assert.deepEqual(accountability.commandBearingAwards, [{
    id: 'award.hesperus-accountability',
    sourceMissionId: 'mission.hesperus-reference',
    sourceObjectiveId: 'objective.hesperus-accountability',
    reason: 'You carried the known Hesperus accountability question to a responsible disposition.',
}]);

const reorderedAccountability = reduceMissionEvidence({
    definition,
    state,
    acceptedClaims: [...accountabilityClaims].reverse(),
    sourceContribution,
});
assert.deepEqual(reorderedAccountability.state.objectives, accountability.state.objectives);
assert.deepEqual(reorderedAccountability.state.outcomeDimensions, accountability.state.outcomeDimensions);
assert.equal(reorderedAccountability.state.terminalDisposition, accountability.state.terminalDisposition);
assert.deepEqual(reorderedAccountability.state.evidenceLog, accountability.state.evidenceLog);

const reversedObjectiveDefinition = {
    ...definition,
    objectives: [...definition.objectives].reverse(),
};
const reversedObjectiveResult = reduceMissionEvidence({
    definition: reversedObjectiveDefinition,
    state: createMissionState({ definition: reversedObjectiveDefinition, branchId: 'save.alpha' }),
    acceptedClaims: accountabilityClaims,
    sourceContribution,
});
assert.deepEqual(reversedObjectiveResult.state.objectives, accountability.state.objectives);
assert.equal(reversedObjectiveResult.state.terminalDisposition, accountability.state.terminalDisposition);

const replay = reduceMissionEvidence({
    definition,
    state: rescueOnly.state,
    acceptedClaims: rescueClaims,
    sourceContribution,
});
assert.equal(replay.state.revision, rescueOnly.state.revision);
assert.deepEqual(replay.state.transitionReceipt, rescueOnly.state.transitionReceipt);
assert.deepEqual(replay.effects, []);
assert.deepEqual(replay.transitionPacket, rescueOnly.transitionPacket);

const timeAdvance = (value, suffix) => ({
    claimId: `claim.time-${suffix}`,
    claimType: 'timeAdvanced',
    targetId: 'clock.hesperus-life-support',
    value,
    evidenceKey: `evidence.time-${suffix}`,
});
const clockAdvanced = reduceMissionEvidence({
    definition,
    state,
    acceptedClaims: [timeAdvance(10, 'ten')],
    sourceContribution,
});
assert.equal(clockAdvanced.state.status, 'active');
assert.equal(clockAdvanced.state.clocks['clock.hesperus-life-support'].value, 20);
assert.equal(clockAdvanced.transitionPacket, null);
const reconstructedClock = reduceMissionEvidence({
    definition,
    state,
    acceptedClaims: [{
        ...timeAdvance(10, 'reconstructed'),
        sourceContributionId: 'contribution.original-time-source',
    }],
    sourceContribution: null,
});
assert.equal(reconstructedClock.state.evidenceLog[0].sourceContributionId, 'contribution.original-time-source');

const multiSource = reduceMissionEvidence({
    definition,
    state: createMissionState({ definition, branchId: 'save.multi-source' }),
    acceptedClaims: [
        {
            ...rescueClaims[0],
            claimId: 'claim.multi-source-rescue',
            evidenceKey: 'evidence.multi-source-rescue',
            sourceContributionId: 'contribution.assistant-outcome',
        },
        {
            ...accountabilityClaims.find((claim) => claim.claimType === 'decisionRecorded'),
            claimId: 'claim.multi-source-decision',
            evidenceKey: 'evidence.multi-source-decision',
            sourceContributionId: 'contribution.player-decision',
        },
    ],
    sourceContribution: null,
});
assert.deepEqual(
    multiSource.state.evidenceLog.map((entry) => entry.sourceContributionId),
    ['contribution.assistant-outcome', 'contribution.player-decision'],
);
assert.deepEqual(
    multiSource.effects.map((effect) => effect.sourceContributionIds[0]),
    ['contribution.assistant-outcome', 'contribution.player-decision'],
);
const dependentReduction = reduceMissionEvidence({
    definition,
    state,
    acceptedClaims: [{
        ...rescueClaims[0],
        claimId: 'claim.dependent-rescue',
        evidenceKey: 'evidence.dependent-rescue',
        dependencyEffectIds: ['effect.ship.isolation-test'],
    }],
    sourceContribution,
});
assert.deepEqual(dependentReduction.state.evidenceLog[0].dependencyEffectIds, ['effect.ship.isolation-test']);
assert.deepEqual(dependentReduction.effects[0].dependencyEffectIds, ['effect.ship.isolation-test']);
const shipObjectiveDefinition = structuredClone(definition);
const shipObjective = shipObjectiveDefinition.objectives.find((objective) => objective.id === 'objective.hesperus-accountability');
shipObjective.class = 'optional';
shipObjective.activatedAs = null;
shipObjective.activationWhen = { shipCapabilityAvailable: 'ship-capability.segmented-isolation' };
shipObjective.availableWhen = { shipCapabilityAvailable: 'ship-capability.segmented-isolation' };
shipObjective.visibleWhen = { shipCapabilityAvailable: 'ship-capability.segmented-isolation' };
shipObjective.progressWhen = false;
shipObjective.terminalWhen = [];
const shipObjectiveResult = reduceMissionEvidence({
    definition: shipObjectiveDefinition,
    state: createMissionState({ definition: shipObjectiveDefinition, branchId: 'save.ship-objective' }),
    acceptedClaims: [{
        claimId: 'claim.ship-objective-trigger',
        claimType: 'timeAdvanced',
        targetId: 'clock.hesperus-life-support',
        value: 1,
        evidenceKey: 'evidence.ship-objective-trigger',
    }],
    sourceContribution,
    shipCapabilityEvidenceById: new Map([[
        'ship-capability.segmented-isolation',
        ['effect.ship.isolation-test'],
    ]]),
});
assert.equal(shipObjectiveResult.state.objectives['objective.hesperus-accountability'].state, 'available');
assert.equal(shipObjectiveResult.state.objectives['objective.hesperus-accountability'].visibility, 'visible');
const clockExpired = reduceMissionEvidence({
    definition,
    state: clockAdvanced.state,
    acceptedClaims: [timeAdvance(25, 'twenty-five')],
    sourceContribution,
});
assert.equal(clockExpired.state.clocks['clock.hesperus-life-support'].state, 'expired');
assert.equal(clockExpired.state.clocks['clock.hesperus-life-support'].value, 0);
assert.equal(clockExpired.state.clocks['clock.hesperus-life-support'].expiryApplied, true);
assert.equal(clockExpired.state.events.includes('event.hesperus-life-support-exhausted'), true);

const rescueWithCost = reduceMissionEvidence({
    definition,
    state,
    acceptedClaims: [
        {
            claimId: 'claim.rescue-cost',
            claimType: 'outcomeObserved',
            targetId: 'outcome.hesperus-rescue-cost',
            value: 'material',
            evidenceKey: 'evidence.rescue-cost',
        },
        rescueClaims[0],
    ],
    sourceContribution,
});
assert.equal(rescueWithCost.state.objectives['objective.hesperus-rescue'].disposition, 'completedWithCost');
assert.equal(rescueWithCost.state.terminalDisposition, 'primarySuccessWithCost');
assert.equal(rescueWithCost.state.outcomeDimensions['dimension.lives-protected'], 'full-with-cost');

const hiddenClockDefinition = structuredClone(definition);
hiddenClockDefinition.clocks.push({
    ...hiddenClockDefinition.clocks[0],
    id: 'clock.hidden-causal-pressure',
    initialValue: 5,
    visibleWhen: false,
    expireWhen: {
        clockState: { id: 'clock.hidden-causal-pressure', equals: 'expired' },
    },
});
const hiddenClockState = createMissionState({ definition: hiddenClockDefinition, branchId: 'save.alpha' });
assert.equal(hiddenClockState.clocks['clock.hidden-causal-pressure'].visibility, 'hidden');
const hiddenClockExpired = reduceMissionEvidence({
    definition: hiddenClockDefinition,
    state: hiddenClockState,
    acceptedClaims: [{
        claimId: 'claim.hidden-time',
        claimType: 'timeAdvanced',
        targetId: 'clock.hidden-causal-pressure',
        value: 5,
        evidenceKey: 'evidence.hidden-time',
    }],
    sourceContribution,
});
assert.equal(hiddenClockExpired.state.status, 'active');
assert.equal(hiddenClockExpired.state.objectives['objective.hesperus-rescue'].disposition, null);
assert.equal(hiddenClockExpired.effects.find((effect) => effect.id === 'effect.clock.hidden-causal-pressure.expired')?.playerVisibility, 'hidden');

console.log('V1 mission reducer tests passed.');
