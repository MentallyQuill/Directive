import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createV1PlayerProjection } from '../../src/projection/v1/player-projection.mjs';
import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import { createV1CommandBearing } from '../../src/command/v1-command-bearing.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const crewDataset = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
    'utf8',
));
const shipDataset = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json',
    'utf8',
));
const branchId = 'save.composite';
const campaignState = {
    activeCampaignPackage: {
        packageId: definition.packageBinding.packageId,
        packageVersion: definition.packageBinding.packageVersion,
    },
    campaignChatBinding: { saveId: branchId, chatId: 'chat.composite' },
    mission: {
        activeMissionId: definition.packageBinding.sourceId,
        v1: createMissionState({ definition, branchId }),
    },
    storySettlement: createEmptyStorySettlement({ branchId }),
    commandBearing: createV1CommandBearing(),
    player: {
        id: 'player-commander',
        name: 'Ren Okada',
        pronounsOrAddress: 'he/him',
        rank: 'Commander',
        billet: 'Executive Officer',
        role: 'Second-in-command',
        species: { id: 'human', label: 'Human', summary: 'A Human Starfleet officer.' },
        appearance: 'Attentive and deliberate.',
        firstImpression: 'Measured until action is required.',
        dossier: { briefBiography: 'Ren Okada was shaped by wartime service.' },
        portrait: null,
    },
    ship: {
        id: 'uss-breckenridge',
        name: 'U.S.S. Breckenridge',
        class: 'Intrepid-class',
        registry: 'NCC-74656',
        operationalOverview: {
            kind: 'directive.shipOperationalOverview.v1',
            status: 'serviceable',
            summary: 'The Breckenridge is certified for service after repair and modernization.',
            materialLimitations: [],
            history: [],
        },
    },
};
const runtimeAssets = {
    packageData: {
        manifest: {
            id: definition.packageBinding.packageId,
            version: definition.packageBinding.packageVersion,
        },
    },
    crewDataset,
    shipDataset,
};

const stateBefore = structuredClone(campaignState);
const assetsBefore = structuredClone(runtimeAssets);
const projection = createV1PlayerProjection({ campaignState, runtimeAssets, definition });
assert.equal(projection.kind, 'directive.playerProjection.v1');
assert.equal(projection.packageId, definition.packageBinding.packageId);
assert.equal(projection.branchId, branchId);
assert.equal(projection.mission.kind, 'directive.missionPlayerProjection.v1');
assert.deepEqual(projection.mission.objectives.map((item) => item.id), [
    'objective.prelude.command-handover',
    'objective.prelude.staff-readiness',
]);
assert.equal(projection.story.kind, 'directive.storyPlayerProjection.v1');
assert.deepEqual(projection.story.entries, []);
assert.equal(projection.player.kind, 'directive.playerIdentityProjection.v1');
assert.equal(projection.player.name, 'Ren Okada');
assert.equal(projection.player.portrait, null);
assert.equal(projection.ship.kind, 'directive.shipPlayerProjection.v1');
assert.equal(projection.people.kind, 'directive.peoplePlayerProjection.v1');
assert.equal(projection.commandBearing.kind, 'directive.commandBearingPlayerProjection.v1');
assert.equal(projection.commandBearing.balance, 0);
assert.equal(Object.hasOwn(projection.commandBearing, 'tracks'), false);
assert.equal(projection.people.people.length, 7);
assert.equal(Object.hasOwn(projection.ship, 'technicalDebt'), false);
assert.equal(Object.hasOwn(projection.ship.operationalStatus, 'issues'), false);
assert.equal(Object.hasOwn(projection.people, 'objectives'), false);
assert.equal(Object.hasOwn(projection.story, 'objectives'), false);
assert.equal(Object.hasOwn(projection.mission, 'entries'), false);
for (const forbidden of [
    'ship.integrated-validation-pending',
    'Ship still has new-plating smell',
    'hiddenQuestion',
    'professionalConfidence',
    'record falsification',
    'mustNotReveal',
]) {
    assert.equal(JSON.stringify(projection).includes(forbidden), false, forbidden);
}
assert.deepEqual(projection.sourceRefs, {
    definitionId: definition.id,
    definitionVersion: definition.version,
    packageId: definition.packageBinding.packageId,
    packageVersion: definition.packageBinding.packageVersion,
    missionRevision: 0,
    storyRevision: 0,
});
assert.deepEqual(campaignState, stateBefore);
assert.deepEqual(runtimeAssets, assetsBefore);
assert.deepEqual(createV1PlayerProjection({ campaignState, runtimeAssets, definition }), projection);
assert.deepEqual(
    createV1PlayerProjection({
        campaignState: JSON.parse(JSON.stringify(campaignState)),
        runtimeAssets,
        definition,
    }),
    projection,
    'projection survives a JSON save/restart round trip',
);

const readinessClaims = [
    ['claim.readiness.handover', 'eventOccurred', 'event.prelude.command-handover-completed', true],
    ['claim.readiness.staff', 'eventOccurred', 'event.prelude.staff-readiness-established', true],
    ['claim.readiness.distress', 'factDisclosed', 'fact.hesperus.distress-established', true],
    ['claim.readiness.rescue', 'outcomeObserved', 'outcome.hesperus.rescue-result', 'safe'],
].map(([claimId, claimType, targetId, value]) => ({
    claimId,
    policyId: null,
    evidenceKey: `evidence.${claimId}`,
    claimType,
    targetId,
    value,
    sourceContributionId: 'contribution.readiness',
}));
const readinessMissionState = reduceMissionEvidence({
    definition,
    state: createMissionState({ definition, branchId }),
    acceptedClaims: readinessClaims,
    sourceContribution: null,
}).state;
const readinessState = {
    ...structuredClone(campaignState),
    mission: {
        ...structuredClone(campaignState.mission),
        v1: readinessMissionState,
    },
};
const readinessId = definition.projectionHints.shipReadinessObjectiveId;
const readinessProjection = createV1PlayerProjection({
    campaignState: readinessState,
    runtimeAssets,
    definition,
});
const readinessObjective = readinessProjection.mission.objectives.find((item) => item.id === readinessId);
assert.ok(readinessObjective);
assert.deepEqual(readinessProjection.ship.operationalStatus.readinessObjectiveLink, { id: readinessId });
assert.equal(JSON.stringify(readinessProjection.ship).includes(readinessObjective.title), false);
assert.equal(JSON.stringify(readinessProjection).split(readinessObjective.title).length - 1, 1);

const forgedVisibilityState = structuredClone(campaignState);
forgedVisibilityState.mission.v1.objectives['objective.prelude.hesperus-accountability'].visibility = 'visible';
assert.throws(
    () => createV1PlayerProjection({
        campaignState: forgedVisibilityState,
        runtimeAssets,
        definition,
    }),
    (error) => error.code === 'DIRECTIVE_V1_PROJECTION_STATE_INVALID',
);
const forgedClockState = structuredClone(campaignState);
forgedClockState.mission.v1.clocks['clock.hesperus-life-support'].visibility = 'visible';
assert.throws(
    () => createV1PlayerProjection({ campaignState: forgedClockState, runtimeAssets, definition }),
    (error) => error.code === 'DIRECTIVE_V1_PROJECTION_STATE_INVALID',
);
const forgedDimensionState = structuredClone(campaignState);
forgedDimensionState.mission.v1.outcomeDimensions['dimension.hesperus.accountability'] = 'handed-off';
assert.throws(
    () => createV1PlayerProjection({ campaignState: forgedDimensionState, runtimeAssets, definition }),
    (error) => error.code === 'DIRECTIVE_V1_PROJECTION_STATE_INVALID',
);

let fractionalTimeMissionState = createMissionState({ definition, branchId });
fractionalTimeMissionState = reduceMissionEvidence({
    definition,
    state: fractionalTimeMissionState,
    acceptedClaims: [{
        claimId: 'claim.fractional.distress',
        policyId: null,
        evidenceKey: 'evidence.fractional.distress',
        claimType: 'worldFactEstablished',
        targetId: 'fact.hesperus.distress-established',
        value: true,
        sourceContributionId: 'contribution.fractional',
    }],
}).state;
fractionalTimeMissionState = reduceMissionEvidence({
    definition,
    state: fractionalTimeMissionState,
    acceptedClaims: [{
        claimId: 'claim.fractional.time',
        policyId: null,
        evidenceKey: 'evidence.fractional.time',
        claimType: 'timeAdvanced',
        targetId: 'clock.hesperus-life-support',
        value: 0.5,
        sourceContributionId: 'contribution.fractional',
    }],
}).state;
const fractionalTimeProjection = createV1PlayerProjection({
    campaignState: {
        ...campaignState,
        mission: { ...campaignState.mission, v1: fractionalTimeMissionState },
    },
    runtimeAssets,
    definition,
});
assert.equal(fractionalTimeProjection.mission.revision, 2);

assert.throws(
    () => createV1PlayerProjection({
        campaignState: {
            ...campaignState,
            storySettlement: { ...campaignState.storySettlement, branchId: 'save.other' },
        },
        runtimeAssets,
        definition,
    }),
    (error) => error.code === 'DIRECTIVE_V1_PROJECTION_BRANCH_MISMATCH',
);
assert.throws(
    () => createV1PlayerProjection({
        campaignState,
        runtimeAssets: { ...runtimeAssets, packageData: {} },
        definition,
    }),
    (error) => error.code === 'DIRECTIVE_V1_PROJECTION_DEFINITION_MISMATCH',
);
assert.throws(
    () => createV1PlayerProjection({
        campaignState: {
            ...campaignState,
            activeCampaignPackage: {
                ...campaignState.activeCampaignPackage,
                packageVersion: '0.0.0-wrong',
            },
        },
        runtimeAssets,
        definition,
    }),
    (error) => error.code === 'DIRECTIVE_V1_PROJECTION_DEFINITION_MISMATCH',
);
assert.throws(
    () => createV1PlayerProjection({
        campaignState: {
            ...campaignState,
            mission: {
                ...campaignState.mission,
                v1: { ...campaignState.mission.v1, revision: 'forged' },
            },
        },
        runtimeAssets,
        definition,
    }),
    (error) => error.code === 'DIRECTIVE_V1_PROJECTION_STATE_INVALID',
);
assert.throws(
    () => createV1PlayerProjection({
        campaignState: {
            ...campaignState,
            storySettlement: { ...campaignState.storySettlement, revision: -1 },
        },
        runtimeAssets,
        definition,
    }),
    (error) => error.code === 'DIRECTIVE_V1_PROJECTION_STATE_INVALID',
);
assert.throws(
    () => createV1PlayerProjection({
        campaignState,
        runtimeAssets,
        definition: { ...definition, version: '2.0.0' },
    }),
    (error) => error.code === 'DIRECTIVE_V1_PROJECTION_DEFINITION_MISMATCH',
);

console.log('V1 composite player projection tests passed.');
