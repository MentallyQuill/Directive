import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createV1PlayerProjection } from '../../src/projection/v1/player-projection.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import { createEpisodeHardBoundary } from '../../src/story/episode-boundary.mjs';
import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContributions,
    appendStoryEffects,
    invalidateStorySources,
    openStoryEpisode,
    sealStoryEpisode,
} from '../../src/story/story-settlement.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const campaignProjection = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
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
const branchId = 'save.rebuild';

const source = (suffix) => ({
    id: `contribution.${suffix}`,
    messageId: `message.${suffix}`,
    swipeId: `swipe.${suffix}`,
    role: 'assistant',
    textHash: suffix.repeat(64).slice(0, 64),
    acceptedAtRevision: 1,
});
const effect = (suffix) => ({
    id: `effect.${suffix}`,
    type: 'mission.eventOccurred',
    targetId: `event.${suffix}`,
    value: true,
    sourceContributionIds: [`contribution.${suffix}`],
    playerVisibility: 'visible',
    status: 'active',
});

let storySettlement = createEmptyStorySettlement({ branchId });
storySettlement = openStoryEpisode(storySettlement, {
    episodeId: 'episode.before-edit',
    sceneId: 'scene.before-edit',
    references: {
        missionIds: [definition.id],
        participantIds: ['mara-whitaker', 'hadrik-bronn'],
    },
});
storySettlement = acceptStoryContributions(storySettlement, [source('alpha'), source('beta')]);
storySettlement = appendStoryEffects(storySettlement, [effect('alpha'), effect('beta')]);
const boundary = createEpisodeHardBoundary({
    id: 'boundary.before-edit',
    branchId,
    code: 'authored-scene-closure',
    source: { kind: 'campaignReducer', id: 'campaign.before-edit' },
    sourceContributionIds: ['contribution.beta'],
});
storySettlement = sealStoryEpisode(storySettlement, {
    boundaryReason: boundary.code,
    hardBoundary: boundary,
    summary: 'Alpha and beta both occurred.',
    characterMoments: [{
        id: 'moment.whitaker.alpha',
        characterId: 'mara-whitaker',
        summary: 'Whitaker remembers alpha.',
        playerVisibility: 'visible',
        sourceContributionIds: ['contribution.alpha'],
    }, {
        id: 'moment.bronn.beta',
        characterId: 'hadrik-bronn',
        summary: 'Bronn remembers beta.',
        playerVisibility: 'visible',
        sourceContributionIds: ['contribution.beta'],
    }],
});

const campaignState = {
    ...structuredClone(campaignProjection.initialState),
    activeCampaignPackage: {
        packageId: definition.packageBinding.packageId,
        packageVersion: definition.packageBinding.packageVersion,
    },
    campaignChatBinding: { saveId: branchId, chatId: 'chat.rebuild' },
    mission: {
        ...structuredClone(campaignProjection.initialState.mission),
        v1: createMissionState({ definition, branchId }),
    },
    storySettlement,
};
const runtimeAssets = {
    packageData: { manifest: { id: definition.packageBinding.packageId, version: definition.packageBinding.packageVersion } },
    projection: campaignProjection,
    crewDataset,
    shipDataset,
    missionDefinitions: [{ path: 'prelude.mission-v1.json', definition }],
};
const before = createV1PlayerProjection({ campaignState, runtimeAssets, definition });
assert.deepEqual(before.story.entries.map((entry) => entry.id), ['episode.before-edit']);
assert.equal(before.people.people.find((person) => person.id === 'hadrik-bronn').moments.length, 1);

const rebuiltSettlement = invalidateStorySources(storySettlement, {
    contributionIds: ['contribution.beta'],
    reason: 'selected-swipe-changed',
    summarizeEffects: (effects) => effects.map((item) => item.targetId).join(' '),
});
const rebuiltState = { ...campaignState, storySettlement: rebuiltSettlement };
const rebuilt = createV1PlayerProjection({ campaignState: rebuiltState, runtimeAssets, definition });
assert.equal(rebuilt.story.entries.length, 1);
assert.match(rebuilt.story.entries[0].id, /supersession/);
assert.equal(rebuilt.story.entries[0].summary, 'event.alpha');
assert.equal(JSON.stringify(rebuilt).includes('event.beta'), false);
assert.equal(rebuilt.people.people.find((person) => person.id === 'mara-whitaker').moments.length, 1);
assert.equal(rebuilt.people.people.find((person) => person.id === 'hadrik-bronn').moments.length, 0);
assert.equal(JSON.stringify(rebuilt).includes('Bronn remembers beta'), false);
assert.equal(JSON.stringify(rebuilt).includes('technicalDebt'), false);

const restarted = createV1PlayerProjection({
    campaignState: JSON.parse(JSON.stringify(rebuiltState)),
    runtimeAssets,
    definition,
});
assert.deepEqual(restarted, rebuilt);

function acceptedPairSnapshot(number) {
    const assistantHash = String(number).repeat(64);
    const playerHash = String(number + 5).repeat(64);
    return {
        envelope: {
            campaignId: 'campaign.ashes.atomic',
            saveId: 'save.atomic-rebuild',
            chatId: 'chat.atomic-rebuild',
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.atomic.${number}`,
            previousAssistant: {
                hostMessageId: `message.atomic.assistant.${number}`,
                selectedVariantId: String(number),
                textHash: assistantHash,
                text: `Assistant source ${number}`,
                sourceIntegrity: 'clean',
                selectedVariant: {
                    selectedVariantId: String(number),
                    selectedTextHash: assistantHash,
                },
            },
            currentPlayer: {
                hostMessageId: `message.atomic.player.${number}`,
                textHash: playerHash,
                text: `Player source ${number}`,
                sourceIntegrity: 'clean',
            },
        },
    };
}

function interpretation(candidateId) {
    return JSON.stringify({
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance: 'accepted',
        claims: [{ candidateId, sourceSlot: 'previousAssistant' }],
        abstained: false,
    });
}

let atomicState = {
    ...structuredClone(campaignProjection.initialState),
    campaign: { ...structuredClone(campaignProjection.initialState.campaign), id: 'campaign.ashes.atomic' },
    activeCampaignPackage: {
        packageId: definition.packageBinding.packageId,
        packageVersion: definition.packageBinding.packageVersion,
    },
    campaignChatBinding: { saveId: 'save.atomic-rebuild', chatId: 'chat.atomic-rebuild' },
    mission: {
        ...structuredClone(campaignProjection.initialState.mission),
        activeMissionId: definition.packageBinding.sourceId,
    },
};
let generationIndex = 0;
const atomicOutputs = [
    interpretation('policy.prelude.command-handover-completed'),
    interpretation('policy.prelude.staff-readiness-established'),
];
const atomicGateway = createStateDeltaGateway({
    getState: () => atomicState,
    setState: (next) => { atomicState = next; },
    persist: async () => {},
    now: () => '2026-08-09T18:00:00.000Z',
});
const atomicRuntime = createV1MissionRuntime({
    getState: () => atomicState,
    stateDeltaGateway: atomicGateway,
    generationRouter: {
        generate: async () => ({
            ok: true,
            response: { text: atomicOutputs[generationIndex++] },
        }),
    },
    now: () => '2026-08-09T18:00:00.000Z',
});
const firstAtomicSettlement = await atomicRuntime.settleAcceptedPair({
    runtimeAssets,
    snapshot: acceptedPairSnapshot(1),
});
assert.equal(firstAtomicSettlement.ok, true, JSON.stringify(firstAtomicSettlement));
const secondAtomicSettlement = await atomicRuntime.settleAcceptedPair({
    runtimeAssets,
    snapshot: acceptedPairSnapshot(2),
});
assert.equal(secondAtomicSettlement.ok, true, JSON.stringify(secondAtomicSettlement));
const activeAtomicEpisode = atomicState.storySettlement.episodes
    .find((item) => item.id === atomicState.storySettlement.activeEpisode);
const alphaContributionId = activeAtomicEpisode.contributions
    .find((item) => item.messageId === 'message.atomic.assistant.1').id;
const betaContributionId = activeAtomicEpisode.contributions
    .find((item) => item.messageId === 'message.atomic.assistant.2').id;
const atomicBoundary = createEpisodeHardBoundary({
    id: 'boundary.atomic.before-edit',
    branchId: 'save.atomic-rebuild',
    code: 'authored-scene-closure',
    source: { kind: 'campaignReducer', id: 'campaign.atomic.before-edit' },
    sourceContributionIds: [betaContributionId],
});
atomicState = {
    ...atomicState,
    storySettlement: sealStoryEpisode(atomicState.storySettlement, {
        boundaryReason: atomicBoundary.code,
        hardBoundary: atomicBoundary,
        summary: 'The handover and staff-readiness review were completed.',
        characterMoments: [{
            id: 'moment.whitaker.atomic-alpha',
            characterId: 'mara-whitaker',
            summary: 'Whitaker remembers the completed handover.',
            playerVisibility: 'visible',
            sourceContributionIds: [alphaContributionId],
        }, {
            id: 'moment.bronn.atomic-beta',
            characterId: 'hadrik-bronn',
            summary: 'Bronn remembers the readiness review.',
            playerVisibility: 'visible',
            sourceContributionIds: [betaContributionId],
        }],
    }),
};
const atomicBefore = createV1PlayerProjection({ campaignState: atomicState, runtimeAssets, definition });
assert.equal(
    atomicBefore.mission.objectives.find((item) => item.id === 'objective.prelude.staff-readiness').status,
    'terminal',
);
assert.equal(atomicBefore.people.people.find((item) => item.id === 'hadrik-bronn').moments.length, 1);

const atomicInvalidation = await atomicRuntime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.atomic.assistant.2',
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(atomicInvalidation.status, 'invalidated');
assert.deepEqual(atomicInvalidation.committedRoots, ['mission', 'storySettlement']);
const atomicAfter = createV1PlayerProjection({ campaignState: atomicState, runtimeAssets, definition });
assert.equal(
    atomicAfter.mission.objectives.find((item) => item.id === 'objective.prelude.staff-readiness').status,
    'available',
);
assert.equal(
    atomicAfter.mission.objectives.find((item) => item.id === 'objective.prelude.command-handover').status,
    'terminal',
);
assert.equal(atomicAfter.story.entries.length, 1);
assert.equal(JSON.stringify(atomicAfter).includes('staff-readiness review'), false);
assert.equal(atomicAfter.people.people.find((item) => item.id === 'mara-whitaker').moments.length, 1);
assert.equal(atomicAfter.people.people.find((item) => item.id === 'hadrik-bronn').moments.length, 0);
assert.equal(generationIndex, 2, 'atomic repair does not reinterpret source prose');

console.log('V1 projection source-rebuild tests passed.');
