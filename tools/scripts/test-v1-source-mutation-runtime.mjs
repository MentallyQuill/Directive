import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createMessageReconciler } from '../../src/runtime/message-reconciler.mjs';
import {
    createStateDeltaGateway,
    initializeCampaignRuntimeTracking,
    recordDirectiveResponse,
    recordTurnIngress,
} from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));
const packageData = {
    manifest: {
        id: definition.packageBinding.packageId,
        version: definition.packageBinding.packageVersion,
    },
};
const definitionRecord = { path: 'prelude.mission-v1.json', definition };
const runtimeAssets = {
    packageData,
    missionDefinitions: [definitionRecord],
    missionDefinitionsById: new Map([[definition.id, definitionRecord]]),
};

function initialCampaignState() {
    return {
        campaign: { id: 'campaign.ashes' },
        activeCampaignPackage: {
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
        },
        campaignChatBinding: { saveId: 'save.alpha', chatId: 'chat.alpha' },
        mission: {
            activeMissionId: definition.packageBinding.sourceId,
        },
    };
}

function snapshot(number, {
    saveId = 'save.alpha',
    chatId = 'chat.alpha',
} = {}) {
    const assistantHash = String(number).repeat(64);
    const playerHash = String(number + 4).repeat(64);
    return {
        kind: 'directive.sceneHandshakeSnapshot.v1',
        envelope: {
            campaignId: 'campaign.ashes',
            saveId,
            chatId,
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.${number}`,
            previousAssistant: {
                hostMessageId: `message.assistant.${number}`,
                text: `Assistant source ${number}`,
                textHash: assistantHash,
                sourceIntegrity: 'clean',
                selectedVariantId: String(number),
                selectedVariant: {
                    selectedVariantId: String(number),
                    selectedTextHash: assistantHash,
                    sourceIntegrity: 'clean',
                },
            },
            currentPlayer: {
                hostMessageId: `message.player.${number}`,
                text: `Player source ${number}`,
                textHash: playerHash,
            },
        },
    };
}

function output(candidateId, sourceSlot = 'previousAssistant', value = undefined, assistantAcceptance = 'accepted') {
    return JSON.stringify({
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance,
        claims: [{
            candidateId,
            sourceSlot,
            ...(value === undefined ? {} : { value }),
        }],
        abstained: false,
    });
}

function multiOutput(claims, assistantAcceptance = 'accepted') {
    return JSON.stringify({
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance,
        claims,
        abstained: false,
    });
}

function createHarness({ state = initialCampaignState(), outputs = [] } = {}) {
    let campaignState = structuredClone(state);
    let persistCount = 0;
    let generationCount = 0;
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => { persistCount += 1; },
        now: () => '2026-08-09T15:00:00.000Z',
    });
    const generationRouter = {
        generate: async () => {
            const text = outputs[generationCount] ?? outputs.at(-1) ?? '';
            generationCount += 1;
            return { ok: true, response: { text } };
        },
    };
    const runtime = createV1MissionRuntime({
        getState: () => campaignState,
        stateDeltaGateway: gateway,
        generationRouter,
        now: () => '2026-08-09T15:00:00.000Z',
    });
    return {
        runtime,
        gateway,
        get campaignState() { return campaignState; },
        get persistCount() { return persistCount; },
        get generationCount() { return generationCount; },
    };
}

const harness = createHarness({
    outputs: [
        output('policy.prelude.command-handover-completed'),
        output('policy.prelude.staff-readiness-established'),
        output('policy.prelude.command-handover-completed'),
    ],
});
await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: snapshot(1) });
await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: snapshot(2) });
assert.equal(harness.campaignState.mission.v1.events.includes('event.prelude.command-handover-completed'), true);
assert.equal(harness.campaignState.mission.v1.events.includes('event.prelude.staff-readiness-established'), true);
assert.equal(harness.campaignState.storySettlement.episodes.length, 1);
assert.equal(harness.campaignState.storySettlement.episodes[0].contributions.length, 4);
assert.equal(harness.generationCount, 2);

const firstInvalidation = await harness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.assistant.1',
    eventType: 'directiveResponseEdited',
});
assert.equal(firstInvalidation.ok, true);
assert.equal(firstInvalidation.status, 'invalidated');
assert.equal(firstInvalidation.invalidatedContributionCount, 1);
assert.deepEqual(firstInvalidation.committedRoots, ['mission', 'storySettlement']);
assert.deepEqual(firstInvalidation.reviewToken, {
    kind: 'directive.episodeReviewToken.v1',
    branchId: 'save.alpha',
    episodeId: harness.campaignState.storySettlement.activeEpisode,
    episodeRevision: harness.campaignState.storySettlement.revision,
    checkpointSequence: 1,
});
assert.equal(harness.campaignState.mission.v1.events.includes('event.prelude.command-handover-completed'), false);
assert.equal(harness.campaignState.mission.v1.events.includes('event.prelude.staff-readiness-established'), true);
assert.equal(harness.campaignState.storySettlement.episodes[0].status, 'open');
assert.deepEqual(
    harness.campaignState.storySettlement.episodes[0].effects.map((effect) => effect.targetId),
    ['event.prelude.staff-readiness-established'],
);
assert.deepEqual(
    harness.campaignState.storySettlement.episodes[0].contributions.map((item) => item.messageId),
    ['message.player.1', 'message.assistant.2', 'message.player.2'],
);
assert.deepEqual(
    harness.campaignState.storySettlement.episodes[0].workingCapsule.recentEvidence.map((item) => item.contributionId),
    harness.campaignState.storySettlement.episodes[0].contributions.map((item) => item.id),
    'source repair removes only the invalidated excerpt and retains independent accepted evidence',
);
assert.equal(harness.generationCount, 2, 'reconstruction never reinterprets transcript prose');
const replayRevision = harness.gateway.revision();
const replay = await harness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.assistant.1',
    eventType: 'directiveResponseDeleted',
});
assert.equal(replay.ok, true);
assert.equal(replay.status, 'no-change');
assert.equal(replay.noChange, true);
assert.equal(harness.gateway.revision(), replayRevision);

const unrelated = await harness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.unrelated',
    eventType: 'hostMessageEdited',
});
assert.equal(unrelated.status, 'no-change');
assert.equal(harness.gateway.revision(), replayRevision);

const restoredSource = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: snapshot(1) });
assert.equal(
    restoredSource.status,
    'settled',
    `restoring an invalidated swipe can settle a new acceptance epoch: ${JSON.stringify(restoredSource)}`,
);
assert.equal(harness.campaignState.mission.v1.events.includes('event.prelude.command-handover-completed'), true);
const restoredContribution = harness.campaignState.mission.v1.evidenceLog
    .find((entry) => entry.targetId === 'event.prelude.command-handover-completed')
    ?.sourceContributionId;
assert.match(restoredContribution, /\.r1$/);
assert.equal(harness.campaignState.storySettlement.episodes.length, 1);
assert.equal(harness.campaignState.storySettlement.episodes[0].status, 'open');
assert.deepEqual(
    harness.campaignState.storySettlement.episodes[0].effects
        .find((effect) => effect.targetId === 'event.prelude.command-handover-completed')
        ?.sourceContributionIds,
    [restoredContribution],
);
const reinvalidatedSource = await harness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.assistant.1',
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(reinvalidatedSource.status, 'invalidated');
assert.equal(harness.campaignState.mission.v1.events.includes('event.prelude.command-handover-completed'), false);
assert.equal(harness.campaignState.storySettlement.episodes[0].status, 'open');
assert.deepEqual(
    harness.campaignState.storySettlement.episodes[0].effects.map((effect) => effect.targetId),
    ['event.prelude.staff-readiness-established'],
);
assert.equal(harness.generationCount, 3);

const persistedState = JSON.parse(JSON.stringify(harness.campaignState));
const restartedHarness = createHarness({ state: persistedState });
const secondInvalidation = await restartedHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.assistant.2',
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(secondInvalidation.status, 'invalidated');
assert.equal(restartedHarness.campaignState.mission.v1.events.includes('event.prelude.staff-readiness-established'), false);
assert.equal(restartedHarness.campaignState.storySettlement.episodes.length, 1);
assert.equal(restartedHarness.campaignState.storySettlement.episodes[0].status, 'open');
assert.equal(restartedHarness.campaignState.storySettlement.episodes[0].effects.length, 0);
assert.deepEqual(
    restartedHarness.campaignState.storySettlement.episodes[0].contributions.map((item) => item.role),
    ['user', 'user'],
    'accepted player context survives removal of the mission-effect sources',
);
assert.equal(
    restartedHarness.campaignState.storySettlement.receipts
        .filter((receipt) => receipt.disposition === 'invalidated').length,
    3,
);
assert.equal(harness.generationCount, 3);
assert.equal(restartedHarness.generationCount, 0, 'persisted-state reconstruction does not call a model after restart');

const playerState = initialCampaignState();
playerState.mission.v1 = createMissionState({ definition, branchId: 'save.alpha' });
playerState.mission.v1.knownFacts.push('fact.hesperus.passenger-risk');
const playerHarness = createHarness({
    state: playerState,
    outputs: [output(
        'policy.hesperus.rescue-risk-decision',
        'currentPlayer',
        'saferPlan',
        'corrected',
    )],
});
await playerHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: snapshot(3) });
assert.equal(playerHarness.campaignState.mission.v1.outcomes['outcome.hesperus.rescue-risk-decision'], 'saferPlan');
assert.deepEqual(playerHarness.campaignState.storySettlement.episodes[0].contributions.map((item) => item.role), ['user']);
const playerInvalidation = await playerHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.player.3',
    eventType: 'playerMessageDeleted',
});
assert.equal(playerInvalidation.status, 'invalidated');
assert.equal(playerHarness.campaignState.mission.v1.outcomes['outcome.hesperus.rescue-risk-decision'], 'unmade');
assert.equal(playerHarness.generationCount, 1);

const mixedPairState = initialCampaignState();
const mixedPairDefinition = structuredClone(definition);
mixedPairDefinition.evidencePolicies
    .find((policy) => policy.id === 'policy.hesperus.rescue-risk-decision').when = {
        missionStatus: { equals: 'active' },
    };
const mixedPairDefinitionRecord = { path: 'mixed-pair.mission-v1.json', definition: mixedPairDefinition };
const mixedPairRuntimeAssets = {
    packageData,
    missionDefinitions: [mixedPairDefinitionRecord],
    missionDefinitionsById: new Map([[mixedPairDefinition.id, mixedPairDefinitionRecord]]),
};
mixedPairState.mission.v1 = createMissionState({ definition: mixedPairDefinition, branchId: 'save.alpha' });
const mixedPairInterpretation = multiOutput([
    {
        candidateId: 'policy.prelude.command-handover-completed',
        sourceSlot: 'previousAssistant',
    },
    {
        candidateId: 'policy.hesperus.rescue-risk-decision',
        sourceSlot: 'currentPlayer',
        value: 'saferPlan',
    },
]);
const mixedPairHarness = createHarness({
    state: mixedPairState,
    outputs: [
        mixedPairInterpretation,
        output('policy.hesperus.rescue-risk-decision', 'currentPlayer', 'saferPlan'),
        output('policy.hesperus.rescue-risk-decision', 'currentPlayer', 'saferPlan'),
    ],
});
await mixedPairHarness.runtime.settleAcceptedPair({ runtimeAssets: mixedPairRuntimeAssets, snapshot: snapshot(9) });
const mixedPlayerInvalidation = await mixedPairHarness.runtime.invalidateSourceMutation({
    runtimeAssets: mixedPairRuntimeAssets,
    hostMessageId: 'message.player.9',
    eventType: 'playerMessageEdited',
});
assert.equal(mixedPlayerInvalidation.status, 'invalidated');
assert.equal(mixedPairHarness.campaignState.mission.v1.events.includes('event.prelude.command-handover-completed'), true);
assert.equal(mixedPairHarness.campaignState.mission.v1.outcomes['outcome.hesperus.rescue-risk-decision'], 'unmade');
const mixedPairRestoration = await mixedPairHarness.runtime.settleAcceptedPair({
    runtimeAssets: mixedPairRuntimeAssets,
    snapshot: snapshot(9),
});
assert.equal(
    mixedPairRestoration.status,
    'settled',
    `mixed-source restoration settles the invalidated epoch: ${JSON.stringify(mixedPairRestoration)}`,
);
assert.equal(mixedPairHarness.campaignState.mission.v1.outcomes['outcome.hesperus.rescue-risk-decision'], 'saferPlan');
assert.equal(mixedPairHarness.generationCount, 2);
assert.match(
    mixedPairHarness.campaignState.mission.v1.evidenceLog
        .find((entry) => entry.targetId === 'outcome.hesperus.rescue-risk-decision')
        ?.sourceContributionId,
    /\.r1$/,
);
const mixedEditedInvalidation = await mixedPairHarness.runtime.invalidateSourceMutation({
    runtimeAssets: mixedPairRuntimeAssets,
    hostMessageId: 'message.player.9',
    eventType: 'playerMessageEdited',
});
assert.equal(mixedEditedInvalidation.status, 'invalidated');
const editedMixedSnapshot = snapshot(9);
editedMixedSnapshot.source.sourceRangeHash = 'range.9.edited-player';
editedMixedSnapshot.source.currentPlayer.text = 'Player source 9, edited after review.';
editedMixedSnapshot.source.currentPlayer.textHash = 'e'.repeat(64);
const editedMixedRestoration = await mixedPairHarness.runtime.settleAcceptedPair({
    runtimeAssets: mixedPairRuntimeAssets,
    snapshot: editedMixedSnapshot,
});
assert.equal(editedMixedRestoration.status, 'settled');
assert.equal(mixedPairHarness.campaignState.mission.v1.outcomes['outcome.hesperus.rescue-risk-decision'], 'saferPlan');
assert.equal(mixedPairHarness.generationCount, 3, 'an edited player source is not hidden by the already-settled assistant half of the pair');

const insignificantHarness = createHarness({
    outputs: [JSON.stringify({
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance: 'ambiguous',
        claims: [],
        abstained: true,
    })],
});
await insignificantHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: snapshot(4) });
const preMutationInsignificantState = structuredClone(insignificantHarness.campaignState);
assert.deepEqual(
    insignificantHarness.campaignState.storySettlement.receipts[0].sourceMessageIds,
    ['message.player.4'],
    'insignificant receipts retain compact source identity without prose',
);
const insignificantInvalidation = await insignificantHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.player.4',
    eventType: 'playerMessageEdited',
});
assert.equal(insignificantInvalidation.status, 'invalidated');
assert.equal(insignificantInvalidation.invalidatedContributionCount, 1);
assert.equal(
    insignificantHarness.campaignState.storySettlement.receipts.some((receipt) => receipt.disposition === 'invalidated'),
    true,
);
assert.equal(insignificantHarness.generationCount, 1);
const restoredInsignificant = await insignificantHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(4),
});
assert.equal(restoredInsignificant.ok, true);
assert.equal(
    insignificantHarness.campaignState.storySettlement.receipts.some((receipt) => (
        receipt.disposition === 'insignificant'
        && receipt.sourceMessageIds.includes('message.player.4')
        && receipt.sourceContributionIds.some((id) => id.endsWith('.r1'))
    )),
    true,
    'Story-only source recovery advances contribution custody without mission-state assistance',
);

const orderingState = initialCampaignState();
const orderingDefinition = structuredClone(definition);
orderingDefinition.evidencePolicies.find(
    (policy) => policy.id === 'policy.hesperus.rescue-risk-decision',
).when = true;
const orderingRecord = { path: 'prelude.ordering-test.mission-v1.json', definition: orderingDefinition };
const orderingRuntimeAssets = {
    packageData,
    missionDefinitions: [orderingRecord],
    missionDefinitionsById: new Map([[orderingDefinition.id, orderingRecord]]),
};
orderingState.mission.v1 = createMissionState({ definition: orderingDefinition, branchId: 'save.alpha' });
const orderingHarness = createHarness({
    state: orderingState,
    outputs: [
        output('policy.hesperus.rescue-risk-decision', 'currentPlayer', 'saferPlan', 'corrected'),
        output('policy.hesperus.rescue-risk-decision', 'currentPlayer', 'proceedKnownRisk', 'corrected'),
        output('policy.prelude.command-handover-completed'),
    ],
});
await orderingHarness.runtime.settleAcceptedPair({ runtimeAssets: orderingRuntimeAssets, snapshot: snapshot(5) });
await orderingHarness.runtime.settleAcceptedPair({ runtimeAssets: orderingRuntimeAssets, snapshot: snapshot(6) });
await orderingHarness.runtime.settleAcceptedPair({ runtimeAssets: orderingRuntimeAssets, snapshot: snapshot(7) });
assert.equal(orderingHarness.campaignState.mission.v1.outcomes['outcome.hesperus.rescue-risk-decision'], 'proceedKnownRisk');
const orderingInvalidation = await orderingHarness.runtime.invalidateSourceMutation({
    runtimeAssets: orderingRuntimeAssets,
    hostMessageId: 'message.assistant.7',
    eventType: 'directiveResponseDeleted',
});
assert.equal(orderingInvalidation.status, 'invalidated');
assert.equal(
    orderingHarness.campaignState.mission.v1.outcomes['outcome.hesperus.rescue-risk-decision'],
    'proceedKnownRisk',
    'reconstruction preserves accepted-batch chronology for surviving updates to one outcome',
);

const wrongBranchState = structuredClone(harness.campaignState);
wrongBranchState.campaignChatBinding.saveId = 'save.beta';
const wrongBranchHarness = createHarness({ state: wrongBranchState, outputs: [output('policy.prelude.command-handover-completed')] });
const wrongBranchRevision = wrongBranchHarness.gateway.revision();
const wrongBranchInvalidation = await wrongBranchHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.assistant.2',
    eventType: 'directiveResponseDeleted',
});
assert.equal(wrongBranchInvalidation.status, 'unavailable');
assert.equal(wrongBranchInvalidation.reasonCode, 'mission-branch-mismatch');
assert.equal(wrongBranchHarness.gateway.revision(), wrongBranchRevision);
assert.equal(wrongBranchHarness.generationCount, 0);

const alphaIsolationHarness = createHarness({
    outputs: [output('policy.prelude.command-handover-completed')],
});
const betaIsolationState = initialCampaignState();
betaIsolationState.campaignChatBinding = { saveId: 'save.beta', chatId: 'chat.beta' };
betaIsolationState.mission.v1 = createMissionState({ definition, branchId: 'save.beta' });
const betaIsolationHarness = createHarness({
    state: betaIsolationState,
    outputs: [output('policy.prelude.command-handover-completed')],
});
await alphaIsolationHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: snapshot(8) });
await betaIsolationHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(8, { saveId: 'save.beta', chatId: 'chat.beta' }),
});
const betaIsolationMutation = await betaIsolationHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.assistant.8',
    eventType: 'directiveResponseDeleted',
});
assert.equal(betaIsolationMutation.status, 'invalidated');
assert.equal(betaIsolationHarness.campaignState.mission.v1.events.includes('event.prelude.command-handover-completed'), false);
assert.equal(alphaIsolationHarness.campaignState.mission.v1.events.includes('event.prelude.command-handover-completed'), true);

let reconcilerState = initializeCampaignRuntimeTracking({ campaign: { id: 'campaign.ashes' } });
reconcilerState = recordTurnIngress(reconcilerState, {
    id: 'ingress.recognized.response',
    hostMessageId: 'message.player.recognized.response',
    status: 'classified',
    textHash: 'hash.player.recognized.response',
    sourceFrameId: 'frame.recognized.response',
    coreTransactionId: 'transaction.recognized.response',
});
reconcilerState = recordDirectiveResponse(reconcilerState, {
    id: 'response.recognized',
    ingressId: 'ingress.recognized.response',
    turnId: 'turn.recognized',
    hostMessageId: 'message.assistant.recognized',
    strategy: 'directivePosted',
    responseKind: 'storyReply',
    status: 'posted',
    sourceFrameId: 'frame.recognized.response',
    coreTransactionId: 'transaction.recognized.response',
});
reconcilerState = recordTurnIngress(reconcilerState, {
    id: 'ingress.recognized.player',
    hostMessageId: 'message.player.recognized',
    status: 'classified',
    textHash: 'hash.player.recognized',
    sourceFrameId: 'frame.recognized.player',
    coreTransactionId: 'transaction.recognized.player',
});
const invalidationCalls = [];
const postRepairObservations = [];
const reconcilerRows = (name) => (
    (name === 'responseLedger'
        ? reconcilerState.directiveRuntimeEvidence?.coreStoreReadProjections?.responses
        : reconcilerState.directiveRuntimeEvidence?.coreStoreReadProjections?.[name])
    || reconcilerState.runtimeTracking?.[name]
    || []
);
const reconciler = createMessageReconciler({
    getCampaignState: () => reconcilerState,
    setCampaignState: (next) => { reconcilerState = next; },
    repairRuntime: {
        handleSourceMutation: async ({ eventType }) => ({
            status: 'recorded',
            id: `recovery.${eventType}`,
            decision: {
                repairProjection: {
                    kind: 'directive.repairProjection.v2',
                    sourceProjectionStatus: 'invalidated',
                    responseProjectionStatus: 'invalidated',
                    recoveryJournalStatus: 'invalidated',
                    returnedAction: 'invalidated',
                    shouldRestoreRevision: false,
                    restoreRevision: null,
                },
            },
        }),
    },
    invalidateV1MissionSource: async (input) => {
        invalidationCalls.push(input);
        const responseStatus = reconcilerRows('responseLedger')
            .find((entry) => entry.hostMessageId === input.hostMessageId)?.status || null;
        const ingressStatus = reconcilerRows('ingressLedger')
            .find((entry) => entry.hostMessageId === input.hostMessageId)?.status || null;
        postRepairObservations.push({ hostMessageId: input.hostMessageId, responseStatus, ingressStatus });
        return {
            ok: true,
            attempted: true,
            status: 'invalidated',
            invalidatedContributionCount: 1,
            committedRoots: ['mission', 'storySettlement'],
            noChange: false,
        };
    },
});

const recognizedResponseMutation = await reconciler.reconcileEdited({
    hostMessageId: 'message.assistant.recognized',
});
assert.equal(recognizedResponseMutation.matched, true);
assert.equal(recognizedResponseMutation.action, 'invalidated');
assert.equal(invalidationCalls.at(-1).eventType, 'directiveResponseEdited');
assert.equal(postRepairObservations.at(-1).responseStatus, 'invalidated');

const recognizedPlayerMutation = await reconciler.reconcileDeleted({
    hostMessageId: 'message.player.recognized',
});
assert.equal(recognizedPlayerMutation.matched, true);
assert.equal(recognizedPlayerMutation.action, 'invalidated');
assert.equal(invalidationCalls.at(-1).eventType, 'playerMessageDeleted');
assert.equal(postRepairObservations.at(-1).ingressStatus, 'invalidated');

for (const [method, hostMessageId, eventType] of [
    ['reconcileEdited', 'message.assistant.edit', 'sceneHandshakeSourceEdited'],
    ['reconcileDeleted', 'message.player.delete', 'sceneHandshakeSourceDeleted'],
    ['reconcileSelectedSwipeChanged', 'message.assistant.swipe', 'sceneHandshakeSourceSelectedSwipeChanged'],
]) {
    const result = await reconciler[method]({ hostMessageId });
    assert.equal(result.matched, true);
    assert.equal(result.action, 'v1SourceInvalidated');
    assert.equal(result.v1SourceInvalidation.status, 'invalidated');
    assert.equal(invalidationCalls.at(-1).eventType, eventType);
    assert.equal(invalidationCalls.at(-1).hostMessageId, hostMessageId);
}

const failingCallbackReconciler = createMessageReconciler({
    getCampaignState: () => reconcilerState,
    setCampaignState: (next) => { reconcilerState = next; },
    repairRuntime: {
        handleSourceMutation: async () => ({ status: 'recorded', id: 'recovery.callback-failure' }),
    },
    invalidateV1MissionSource: async () => { throw new Error('secret callback failure'); },
});
const callbackFailure = await failingCallbackReconciler.reconcileDeleted({ hostMessageId: 'message.callback.failure' });
assert.equal(callbackFailure.action, 'ignored');
assert.equal(callbackFailure.v1SourceInvalidation.reasonCode, 'v1-invalidation-threw');
assert.equal(JSON.stringify(callbackFailure).includes('secret callback failure'), false);

console.log('V1 source mutation runtime tests passed.');
