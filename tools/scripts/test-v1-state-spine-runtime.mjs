import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    armV1CommandBearingEdge,
    awardV1CommandBearing,
    reserveV1CommandBearingEdge,
} from '../../src/command/v1-command-bearing.mjs';
import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { V1_MUTABLE_STATE_DOMAINS } from '../../src/runtime/v1-campaign-state.mjs';
import {
    createPendingEpisodeReviewToken,
    createV1StateSpine,
} from '../../src/runtime/v1-state-spine.mjs';
import { createEpisodeHardBoundary } from '../../src/story/episode-boundary.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';

assert.equal(V1_MUTABLE_STATE_DOMAINS.includes('storySettlement'), true);

const definition = JSON.parse(fs.readFileSync('tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json', 'utf8'));
const rewardedObjective = definition.objectives.find((objective) => objective.id === 'objective.hesperus-accountability');
rewardedObjective.class = 'optional';
rewardedObjective.activatedAs = null;
rewardedObjective.activationWhen = true;
rewardedObjective.availableWhen = true;
rewardedObjective.visibleWhen = true;
rewardedObjective.progressWhen = { eventOccurred: 'event.hesperus-survivors-transferred' };
rewardedObjective.terminalWhen = [{
    disposition: 'completed',
    when: { eventOccurred: 'event.hesperus-survivors-transferred' },
}];
rewardedObjective.playerText.terminal = [{ disposition: 'completed', text: 'The accountability implications were addressed.' }];
definition.commandBearingAwards = [{
    id: 'award.hesperus-accountability',
    sourceObjectiveId: 'objective.hesperus-accountability',
    eligibleDispositions: ['completed'],
    reason: 'You carried the Hesperus accountability review through to completion.',
}];
let campaignState = createAshesInitialState({
    campaignId: 'campaign.ashes',
    saveId: 'save.alpha',
    chatId: 'chat.alpha',
});
const initialJourney = createInitialMissionJourney({ definition, branchId: 'save.alpha' });
campaignState.mission = {
    activeMissionId: definition.packageBinding.sourceId,
    v1: createMissionState({ definition, branchId: 'save.alpha' }),
    v1Journey: initialJourney.journey,
    v1History: initialJourney.history,
};
campaignState.commandBearing = awardV1CommandBearing(campaignState.commandBearing, {
    awardId: 'award.test.edge-credit',
    sourceId: 'objective.test.edge-credit',
    reason: 'Test credit for an accepted edge.',
}).commandBearing;
const reservedEdge = reserveV1CommandBearingEdge(campaignState.commandBearing, {
    spendId: 'spend.test.accepted-edge',
    reason: 'Test one atomic accepted-pair edge.',
}).commandBearing;
campaignState.commandBearing = armV1CommandBearingEdge(reservedEdge, {
    spendId: 'spend.test.accepted-edge',
    playerMessageId: 'message.player-before-rescue',
}).commandBearing;
let persistCount = 0;
const gateway = createStateDeltaGateway({
    getState: () => campaignState,
    setState: (next) => { campaignState = next; },
    persist: async () => { persistCount += 1; },
    now: () => '2026-08-09T12:00:00.000Z',
});
const source = {
    contributionId: 'contribution.hesperus-rescue',
    messageId: 'message.assistant-rescue',
    branchId: 'save.alpha',
    accepted: true,
    selectedSwipeId: 'swipe.1',
    textHash: 'a'.repeat(64),
    role: 'assistant',
    acceptedAtRevision: 0,
};
const spine = createV1StateSpine({
    getState: () => campaignState,
    stateDeltaGateway: gateway,
    resolveSourceRef: (ref) => ref.messageId === source.messageId ? source : null,
    now: () => '2026-08-09T12:00:00.000Z',
});
const sourceContribution = {
    id: 'contribution.hesperus-rescue',
    messageId: source.messageId,
    swipeId: source.selectedSwipeId,
    role: source.role,
    textHash: source.textHash,
    acceptedAtRevision: source.acceptedAtRevision,
};
const proposal = {
    kind: 'directive.missionEvidenceProposal.v1',
    branchId: 'save.alpha',
    missionId: definition.id,
    baseRevision: 0,
    claims: [{
        claimId: 'claim.survivors-transferred',
        policyId: 'policy.hesperus-survivors-transferred',
        claimType: 'eventOccurred',
        targetId: 'event.hesperus-survivors-transferred',
        sourceRef: {
            messageId: source.messageId,
            swipeId: source.selectedSwipeId,
            textHash: source.textHash,
        },
    }],
};

const settled = await spine.settleAcceptedPair({
    definition,
    missionDefinitions: [definition],
    proposal,
    sourceContribution,
    sourceObservations: [{
        contributionId: sourceContribution.id,
        role: sourceContribution.role,
        textHash: sourceContribution.textHash,
        text: 'The Hesperus survivors reached safety.',
    }],
    gatewayBaseRevision: 0,
    acceptedCommandBearingEdge: {
        spendId: 'spend.test.accepted-edge',
        assistantMessageId: source.messageId,
        assistantTextHash: source.textHash,
        acceptedByPlayerMessageId: 'message.player-accepts-rescue',
    },
    scene: {
        episodeId: 'episode.hesperus-rescue',
        sceneId: 'scene.hesperus-rescue',
        boundaryReason: 'accepted-next-player-ingress',
        summary: 'The Hesperus survivors reached safety and the diversion concluded.',
        unresolvedConsequences: [],
    },
});
assert.equal(persistCount, 1);
assert.equal(gateway.revision(), 1);
assert.equal(settled.evidence.acceptedClaims.length, 1);
assert.equal(settled.reviewToken, null, 'mission-transition hard boundaries do not queue soft review');
assert.equal(campaignState.storySettlement.episodes.length, 1);
assert.equal(campaignState.storySettlement.episodes[0].status, 'sealed');
assert.equal(campaignState.mission.v1.status, 'terminal');
assert.equal(campaignState.mission.v1.terminalDisposition, 'primarySuccess');
assert.equal(settled.commandBearingAwardCount, 1);
assert.equal(settled.acceptedCommandBearingEdge.applied, true);
assert.equal(campaignState.commandBearing.spends['spend.test.accepted-edge'].status, 'committed');
assert.equal(campaignState.commandBearing.balance, 1);
assert.equal(campaignState.commandBearing.awards['award.hesperus-accountability'].sourceId, 'objective.hesperus-accountability');

assert.throws(
    () => spine.reduceMissionProposal({
        definition: {
            ...definition,
            packageBinding: {
                ...definition.packageBinding,
                packageVersion: '0.4.0',
            },
        },
        proposal: { ...proposal, baseRevision: 1 },
        sourceContribution,
    }),
    (error) => error.code === 'DIRECTIVE_MISSION_DEFINITION_MISMATCH',
);

await assert.rejects(
    () => spine.settleAcceptedPair({
        definition,
        missionDefinitions: [definition],
        proposal: { ...proposal, baseRevision: 1 },
        sourceContribution,
        gatewayBaseRevision: 0,
        scene: {
            episodeId: 'episode.stale',
            sceneId: 'scene.stale',
            boundaryReason: 'accepted-next-player-ingress',
            summary: 'This stale scene must not commit.',
        },
    }),
    (error) => error.code === 'DIRECTIVE_STATE_REVISION_CONFLICT',
);
assert.equal(persistCount, 1);

await assert.rejects(
    () => spine.settleAcceptedPair({
        definition,
        missionDefinitions: [definition],
        proposal: { ...proposal, baseRevision: 0 },
        sourceContribution,
        gatewayBaseRevision: 1,
        scene: {
            episodeId: 'episode.mission-stale',
            sceneId: 'scene.mission-stale',
            boundaryReason: 'accepted-next-player-ingress',
            summary: 'Mission-stale analysis must not settle.',
        },
    }),
    (error) => error.code === 'DIRECTIVE_MISSION_EVIDENCE_STALE',
);
assert.equal(persistCount, 1);
assert.equal(gateway.revision(), 1);

await spine.invalidateSources({
    definition,
    branchId: 'save.alpha',
    contributionIds: ['contribution.hesperus-rescue'],
    missionDefinitions: [definition],
    gatewayBaseRevision: 1,
    reason: 'selected-swipe-changed',
});
assert.equal(persistCount, 2);
assert.equal(gateway.revision(), 2);
assert.equal(campaignState.storySettlement.episodes[0].status, 'invalidated');
assert.equal(campaignState.mission.v1.status, 'active');
assert.equal(campaignState.mission.v1.transitionReceipt, null);

await spine.invalidateSources({
    definition,
    branchId: 'save.alpha',
    contributionIds: ['contribution.hesperus-rescue'],
    gatewayBaseRevision: 2,
    reason: 'selected-swipe-changed',
});
assert.equal(persistCount, 2);
assert.equal(gateway.revision(), 2);
await spine.invalidateSources({
    definition,
    branchId: 'save.alpha',
    contributionIds: ['contribution.unrelated'],
    gatewayBaseRevision: 2,
    reason: 'unrelated-source-event',
});
assert.equal(persistCount, 2);
assert.equal(gateway.revision(), 2);

const accumulationEvents = Array.from({ length: 6 }, (_, index) => ({
    id: `event.accumulation-${index + 1}`,
    playerVisibility: 'visible',
    playerText: { summary: `Milestone ${index + 1} settled.` },
}));
const accumulationDefinition = {
    kind: 'directive.missionDefinition.v1',
    schemaVersion: 1,
    id: 'mission.accumulation-reference',
    version: '1.0.0',
    packageBinding: {
        packageId: definition.packageBinding.packageId,
        packageVersion: definition.packageBinding.packageVersion,
        sourceId: 'accumulation-reference',
    },
    playerText: { title: 'Accumulation', summary: 'Accumulate a semantic scene.' },
    facts: [],
    evidencePolicies: accumulationEvents.map((event) => ({
        id: `policy.${event.id}`,
        claimType: 'eventOccurred',
        targetId: event.id,
        sourceRoles: ['assistant'],
        when: true,
    })),
    reportRoutes: [],
    events: accumulationEvents,
    outcomes: [],
    objectives: [],
    outcomeDimensions: [],
    clocks: [],
    closeWhen: false,
    terminalDispositions: [],
    transitions: [],
};
let accumulationState = createAshesInitialState({
    campaignId: 'campaign.accumulation',
    saveId: 'save.accumulation',
    chatId: 'chat.accumulation',
});
const accumulationJourney = createInitialMissionJourney({
    definition: accumulationDefinition,
    branchId: 'save.accumulation',
});
accumulationState.mission = {
    activeMissionId: accumulationDefinition.packageBinding.sourceId,
    v1: createMissionState({ definition: accumulationDefinition, branchId: 'save.accumulation' }),
    v1Journey: accumulationJourney.journey,
    v1History: accumulationJourney.history,
};
let accumulationPersistCount = 0;
const accumulationPersistDescriptors = [];
const accumulationSources = new Map();
const accumulationGateway = createStateDeltaGateway({
    getState: () => accumulationState,
    setState: (next) => { accumulationState = next; },
    persist: async (_next, descriptor) => {
        accumulationPersistCount += 1;
        accumulationPersistDescriptors.push(structuredClone(descriptor));
    },
    now: () => '2026-08-09T13:00:00.000Z',
});
const accumulationSpine = createV1StateSpine({
    getState: () => accumulationState,
    stateDeltaGateway: accumulationGateway,
    resolveSourceRef: (ref) => accumulationSources.get(ref.messageId) || null,
    now: () => '2026-08-09T13:00:00.000Z',
    checkpointEveryContributions: 2,
});

function accumulationBoundary(number = 6) {
    return createEpisodeHardBoundary({
        id: `boundary.accumulation-${number}`,
        branchId: 'save.accumulation',
        code: 'authored-scene-closure',
        source: { kind: 'campaignReducer', id: `campaign.boundary-${number}` },
        sourceContributionIds: [`contribution.accumulation-${number}`],
    });
}

async function settleAccumulationEvent(number, { hardBoundary = null } = {}) {
    const sourceRecord = {
        contributionId: `contribution.accumulation-${number}`,
        messageId: `message.accumulation-${number}`,
        branchId: 'save.accumulation',
        accepted: true,
        selectedSwipeId: `swipe.${number}`,
        textHash: String(number).repeat(64),
        role: 'assistant',
        acceptedAtRevision: number - 1,
    };
    accumulationSources.set(sourceRecord.messageId, sourceRecord);
    const contribution = {
        id: sourceRecord.contributionId,
        messageId: sourceRecord.messageId,
        swipeId: sourceRecord.selectedSwipeId,
        role: sourceRecord.role,
        textHash: sourceRecord.textHash,
        acceptedAtRevision: sourceRecord.acceptedAtRevision,
    };
    const eventProposal = {
        kind: 'directive.missionEvidenceProposal.v1',
        branchId: 'save.accumulation',
        missionId: accumulationDefinition.id,
        baseRevision: number - 1,
        claims: [{
            claimId: `claim.accumulation-${number}`,
            policyId: `policy.event.accumulation-${number}`,
            claimType: 'eventOccurred',
            targetId: `event.accumulation-${number}`,
            sourceRef: {
                messageId: sourceRecord.messageId,
                swipeId: sourceRecord.selectedSwipeId,
                textHash: sourceRecord.textHash,
            },
        }],
    };
    const result = await accumulationSpine.settleAcceptedPair({
        definition: accumulationDefinition,
        proposal: eventProposal,
        sourceContributions: [contribution],
        sourceObservations: [{
            contributionId: contribution.id,
            role: contribution.role,
            textHash: contribution.textHash,
            text: `Milestone ${number} was accepted in the active encounter.`,
        }],
        gatewayBaseRevision: accumulationGateway.revision(),
        scene: {
            episodeId: 'episode.accumulated-scene',
            sceneId: 'scene.accumulated-scene',
            boundaryReason: 'accepted-next-player-ingress',
            summary: `Untrusted caller summary ${number}`,
        },
        hardBoundary,
    });
    return { result, eventProposal, contribution };
}

const firstAccumulation = await settleAccumulationEvent(1);
assert.equal(accumulationPersistCount, 1);
assert.equal(accumulationState.storySettlement.episodes.length, 1);
assert.equal(accumulationState.storySettlement.episodes[0].status, 'open');
assert.equal(firstAccumulation.result.reviewToken, null);

await assert.rejects(
    () => accumulationSpine.settleAcceptedPair({
        definition: accumulationDefinition,
        proposal: {
            kind: 'directive.missionEvidenceProposal.v1',
            branchId: 'save.accumulation',
            missionId: accumulationDefinition.id,
            baseRevision: 1,
            claims: [],
        },
        sourceContributions: [{
            id: 'contribution.missing-observation',
            messageId: 'message.missing-observation',
            swipeId: null,
            role: 'user',
            textHash: 'e'.repeat(64),
            acceptedAtRevision: 1,
        }],
        gatewayBaseRevision: accumulationGateway.revision(),
        scene: { episodeId: 'episode.ignored', sceneId: 'scene.ignored' },
    }),
    /require source observations/,
);
assert.equal(accumulationPersistCount, 1, 'missing excerpts fail before state mutation');

const insignificantDuringActive = await accumulationSpine.settleAcceptedPair({
    definition: accumulationDefinition,
    proposal: {
        kind: 'directive.missionEvidenceProposal.v1',
        branchId: 'save.accumulation',
        missionId: accumulationDefinition.id,
        baseRevision: 1,
        claims: [],
    },
    sourceContributions: [{
        id: 'contribution.accumulation-small-talk',
        messageId: 'message.accumulation-small-talk',
        swipeId: null,
        role: 'user',
        textHash: 'f'.repeat(64),
        acceptedAtRevision: 1,
    }],
    sourceObservations: [{
        contributionId: 'contribution.accumulation-small-talk',
        role: 'user',
        textHash: 'f'.repeat(64),
        text: 'A routine acknowledgement continues the same encounter.',
    }],
    gatewayBaseRevision: 1,
    scene: { episodeId: 'episode.ignored', sceneId: 'scene.ignored' },
});
assert.equal(insignificantDuringActive.noChange, false);
assert.equal(accumulationPersistCount, 2);
assert.equal(accumulationState.storySettlement.receipts.length, 0);
assert.equal(accumulationState.storySettlement.episodes.length, 1);
assert.deepEqual(
    accumulationState.storySettlement.episodes[0].contributions.map((item) => item.id),
    ['contribution.accumulation-1', 'contribution.accumulation-small-talk'],
);
assert.equal(accumulationState.storySettlement.episodes[0].workingCapsule.recentEvidence.at(-1).contributionId, 'contribution.accumulation-small-talk');
assert.deepEqual(insignificantDuringActive.reviewToken, {
    kind: 'directive.episodeReviewToken.v1',
    branchId: 'save.accumulation',
    episodeId: 'episode.accumulated-scene',
    episodeRevision: accumulationState.storySettlement.revision,
    checkpointSequence: 1,
});
assert.deepEqual(createPendingEpisodeReviewToken(accumulationState.storySettlement), insignificantDuringActive.reviewToken);

for (let number = 2; number <= 5; number += 1) await settleAccumulationEvent(number);
assert.equal(accumulationPersistCount, 6);
assert.equal(accumulationState.storySettlement.episodes.length, 1);
assert.equal(accumulationState.storySettlement.episodes[0].status, 'open');
assert.equal(accumulationState.storySettlement.episodes[0].contributions.length, 6);
assert.equal(accumulationState.storySettlement.episodes[0].effects.length, 5);
assert.equal(accumulationState.storySettlement.episodes[0].boundaryState.checkpointSequence, 3);
assert.equal(accumulationState.storySettlement.episodes[0].boundaryState.contributionCountAtLastReview, 6);
assert.equal(JSON.stringify(accumulationState.storySettlement).includes('Untrusted caller summary'), false);

const sixthAccumulation = await settleAccumulationEvent(6, {
    hardBoundary: accumulationBoundary(6),
});
assert.equal(accumulationPersistCount, 7);
assert.equal(sixthAccumulation.result.reviewToken, null);
assert.equal(accumulationState.storySettlement.episodes.length, 1);
assert.equal(accumulationState.storySettlement.episodes[0].status, 'sealed');
assert.equal(accumulationState.storySettlement.episodes[0].boundaryReason, 'authored-scene-closure');
assert.deepEqual(accumulationState.storySettlement.episodes[0].hardBoundary, accumulationBoundary(6));
assert.match(accumulationState.storySettlement.episodes[0].summary, /Milestone 1 settled/);
assert.match(accumulationState.storySettlement.episodes[0].summary, /Milestone 6 settled/);
assert.equal(accumulationState.storySettlement.episodes[0].summary.includes('Untrusted caller summary'), false);

const replayProposal = {
    ...sixthAccumulation.eventProposal,
    baseRevision: 6,
};
const replay = await accumulationSpine.settleAcceptedPair({
    definition: accumulationDefinition,
    proposal: replayProposal,
    sourceContributions: [sixthAccumulation.contribution],
    sourceObservations: [{
        contributionId: sixthAccumulation.contribution.id,
        role: sixthAccumulation.contribution.role,
        textHash: sixthAccumulation.contribution.textHash,
        text: 'Milestone 6 was accepted in the active encounter.',
    }],
    gatewayBaseRevision: accumulationGateway.revision(),
    scene: { episodeId: 'episode.accumulated-scene', sceneId: 'scene.accumulated-scene' },
    hardBoundary: accumulationBoundary(6),
});
assert.equal(replay.noChange, true);
assert.equal(accumulationPersistCount, 7);

await assert.rejects(
    () => accumulationSpine.settleAcceptedPair({
        definition: accumulationDefinition,
        proposal: { ...sixthAccumulation.eventProposal, baseRevision: 6 },
        sourceContributions: [sixthAccumulation.contribution],
        gatewayBaseRevision: accumulationGateway.revision(),
        scene: { episodeId: 'episode.invalid-boundary', sceneId: 'scene.invalid-boundary' },
        hardBoundary: { reason: 'topic changed' },
    }),
    (error) => error.code === 'DIRECTIVE_EPISODE_HARD_BOUNDARY_INVALID',
);
assert.equal(accumulationPersistCount, 7);

await accumulationSpine.invalidateSources({
    definition: accumulationDefinition,
    branchId: 'save.accumulation',
    contributionIds: ['contribution.accumulation-2'],
    gatewayBaseRevision: accumulationGateway.revision(),
    reason: 'selected-swipe-changed',
});
assert.equal(accumulationPersistCount, 8);
assert.equal(accumulationState.storySettlement.episodes[0].status, 'invalidated');
assert.equal(accumulationState.storySettlement.episodes.length, 2);
assert.equal(accumulationState.storySettlement.episodes[1].status, 'sealed');
assert.deepEqual(accumulationState.storySettlement.episodes[1].supersedesEpisodeIds, ['episode.accumulated-scene']);
assert.equal(accumulationState.storySettlement.episodes[1].hardBoundary.code, 'source-recovery');
assert.equal(accumulationState.storySettlement.episodes[1].summary.includes('Milestone 2 settled'), false);
assert.equal(accumulationState.storySettlement.episodes[1].summary.includes('Milestone 1 settled'), true);
assert.deepEqual(
    accumulationState.storySettlement.episodes[1].effects.map((item) => item.targetId),
    [
        'event.accumulation-1',
        'event.accumulation-3',
        'event.accumulation-4',
        'event.accumulation-5',
        'event.accumulation-6',
    ],
);
assert.equal(accumulationState.mission.v1.events.includes('event.accumulation-2'), false);
assert.equal(accumulationState.mission.v1.events.includes('event.accumulation-1'), true);
assert.equal(accumulationState.mission.v1.events.includes('event.accumulation-6'), true);
assert.equal(accumulationPersistDescriptors.at(-1).source, 'v1StateSpineSourceRecovery');
assert.doesNotMatch(accumulationPersistDescriptors.at(-1).source, /shadow/i);

let insignificantState = createAshesInitialState({
    campaignId: 'campaign.insignificant',
    saveId: 'save.insignificant',
    chatId: 'chat.insignificant',
});
const insignificantJourney = createInitialMissionJourney({
    definition: accumulationDefinition,
    branchId: 'save.insignificant',
});
insignificantState.mission = {
    activeMissionId: accumulationDefinition.packageBinding.sourceId,
    v1: createMissionState({ definition: accumulationDefinition, branchId: 'save.insignificant' }),
    v1Journey: insignificantJourney.journey,
    v1History: insignificantJourney.history,
};
let insignificantPersistCount = 0;
const insignificantGateway = createStateDeltaGateway({
    getState: () => insignificantState,
    setState: (next) => { insignificantState = next; },
    persist: async () => { insignificantPersistCount += 1; },
});
const insignificantSpine = createV1StateSpine({
    getState: () => insignificantState,
    stateDeltaGateway: insignificantGateway,
    resolveSourceRef: () => null,
});
const insignificantProposal = {
    kind: 'directive.missionEvidenceProposal.v1',
    branchId: 'save.insignificant',
    missionId: accumulationDefinition.id,
    baseRevision: 0,
    claims: [],
};
await insignificantSpine.settleAcceptedPair({
    definition: accumulationDefinition,
    proposal: insignificantProposal,
    sourceContributions: [],
    gatewayBaseRevision: 0,
    scene: { episodeId: 'episode.small-talk', sceneId: 'scene.small-talk' },
});
assert.equal(insignificantPersistCount, 1);
assert.equal(insignificantState.storySettlement.episodes.length, 0);
assert.equal(insignificantState.storySettlement.receipts[0].disposition, 'insignificant');
const replayInsignificant = await insignificantSpine.settleAcceptedPair({
    definition: accumulationDefinition,
    proposal: insignificantProposal,
    sourceContributions: [],
    gatewayBaseRevision: 1,
    scene: { episodeId: 'episode.small-talk', sceneId: 'scene.small-talk' },
});
assert.equal(replayInsignificant.noChange, true);
assert.equal(insignificantPersistCount, 1);

console.log('V1 state spine runtime tests passed.');
