import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { prepareV1AcceptedPairTimeAdvance } from '../../src/runtime/v1-accepted-pair-time.mjs';
import {
    rebindV1CampaignStateCustody,
    reconstructV1BranchState,
} from '../../src/runtime/v1-branch-reconstruction.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const sourceDefinition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));

function clockReadyDefinition({ unit = 'hours', startWhen = undefined } = {}) {
    const definition = structuredClone(sourceDefinition);
    for (const factId of ['fact.hesperus.distress-established', 'fact.hesperus.passenger-risk']) {
        const fact = definition.facts.find((candidate) => candidate.id === factId);
        fact.initiallyTrue = true;
        fact.visibility = 'known';
    }
    const clock = definition.clocks.find((candidate) => candidate.id === 'clock.hesperus-life-support');
    clock.unit = unit;
    if (startWhen !== undefined) clock.startWhen = startWhen;
    return definition;
}

function snapshot(suffix = 'main') {
    return {
        kind: 'directive.acceptedPairSnapshot.v1',
        envelope: {
            campaignId: 'campaign.ashes',
            saveId: `save.time.${suffix}`,
            chatId: `chat.time.${suffix}`,
            packageId: sourceDefinition.packageBinding.packageId,
            packageVersion: sourceDefinition.packageBinding.packageVersion,
            activeMissionId: sourceDefinition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.time.${suffix}`,
            previousAssistant: {
                hostMessageId: `message.time.${suffix}.assistant`,
                text: 'After ninety minutes, Captain Whitaker settles the command handover terms and the scene reaches a natural boundary.',
                textHash: 'a'.repeat(64),
                sourceIntegrity: 'clean',
                selectedVariantId: '0',
                selectedVariant: {
                    selectedVariantId: '0',
                    selectedTextHash: 'a'.repeat(64),
                    sourceIntegrity: 'clean',
                },
            },
            currentPlayer: {
                hostMessageId: `message.time.${suffix}.player`,
                text: 'I acknowledge the elapsed time and continue.',
                textHash: 'b'.repeat(64),
                sourceIntegrity: 'clean',
            },
        },
    };
}

function timeBoundaryFor(sceneSnapshot, {
    id = 'time.boundary.accepted-scene',
    kind = 'directive.timeBoundary.v1',
    elapsedSeconds = 5400,
    currentPlayerHostMessageId = sceneSnapshot.source.currentPlayer.hostMessageId,
    rangeHash = sceneSnapshot.source.sourceRangeHash,
} = {}) {
    return {
        id,
        kind,
        type: 'time-advance',
        reason: 'explicit-duration',
        elapsedSeconds,
        elapsedMinutes: elapsedSeconds / 60,
        source: 'acceptedPairMissionEvidence',
        sourceAnchorRange: {
            kind: 'acceptedPair',
            previousAssistantHostMessageId: sceneSnapshot.source.previousAssistant.hostMessageId,
            currentPlayerHostMessageId,
            rangeHash,
        },
    };
}

function initialCampaignState(definition, sceneSnapshot, {
    suffix = 'main',
    boundary = timeBoundaryFor(sceneSnapshot),
} = {}) {
    const state = createAshesInitialState({
        campaignId: 'campaign.ashes',
        saveId: `save.time.${suffix}`,
        chatId: `chat.time.${suffix}`,
    });
    const branchId = `save.time.${suffix}`;
    const initialJourney = createInitialMissionJourney({ definition, branchId });
    state.mission = {
        activeMissionId: definition.packageBinding.sourceId,
        v1: createMissionState({ definition, branchId }),
        v1Journey: initialJourney.journey,
        v1History: initialJourney.history,
    };
    state.timeLedger.entries = boundary ? [structuredClone(boundary)] : [];
    state.timeLedger.lastBoundary = boundary ? structuredClone(boundary) : null;
    return state;
}

function runtimeAssets(definition) {
    const record = { path: 'test/clock-ready-definition.json', definition };
    const ashesAssets = loadAshesRuntimeAssets();
    return {
        packageData: ashesAssets.packageData,
        crewDataset: ashesAssets.crewDataset,
        shipDataset: ashesAssets.shipDataset,
        missionDefinitions: [record],
        missionDefinitionsById: new Map([[definition.id, record]]),
    };
}

function createHarness({ definition, sceneSnapshot, state, outputs = [], failPersistenceCount = 0 }) {
    let campaignState = structuredClone(state);
    let generationCount = 0;
    let persistCount = 0;
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => {
            persistCount += 1;
            if (persistCount <= failPersistenceCount) throw new Error(`planned persistence failure ${persistCount}`);
        },
        now: () => '2026-08-10T04:00:00.000Z',
    });
    const runtime = createV1MissionRuntime({
        getState: () => campaignState,
        stateDeltaGateway: gateway,
        generationRouter: {
            generate: async () => {
                const text = outputs[generationCount] ?? outputs.at(-1) ?? '';
                generationCount += 1;
                return { ok: true, response: { text } };
            },
        },
        prepareAcceptedPairTime: ({ campaignState: acceptedState, snapshot: acceptedSnapshot, timeDecision, runtimeAssets: acceptedAssets }) => (
            prepareV1AcceptedPairTimeAdvance({
                campaignState: acceptedState,
                snapshot: acceptedSnapshot,
                packageData: acceptedAssets.packageData,
                timeDecision,
                now: () => '2026-08-10T04:00:00.000Z',
            })
        ),
        now: () => '2026-08-10T04:00:00.000Z',
    });
    return {
        runtime,
        runtimeAssets: runtimeAssets(definition),
        sceneSnapshot,
        get campaignState() { return campaignState; },
        get generationCount() { return generationCount; },
        get persistCount() { return persistCount; },
    };
}

const abstained = JSON.stringify({
    kind: 'directive.missionEvidenceInterpretation.v1',
    assistantAcceptance: 'accepted',
    claims: [],
    abstained: true,
    time: {
        decision: 'advance',
        elapsedSeconds: 5400,
        reason: 'explicit-duration',
        confidence: 0.96,
    },
});
const unchanged = JSON.stringify({
    kind: 'directive.missionEvidenceInterpretation.v1',
    assistantAcceptance: 'accepted',
    claims: [],
    abstained: true,
    time: {
        decision: 'unchanged',
        elapsedSeconds: 0,
        reason: 'same-minute',
        confidence: 0.9,
    },
});
const acceptedAssistantClaim = JSON.stringify({
    kind: 'directive.missionEvidenceInterpretation.v1',
    assistantAcceptance: 'accepted',
    claims: [{
        candidateId: 'policy.prelude.command-handover-terms-settled',
        sourceSlot: 'previousAssistant',
        evidenceQuote: 'Captain Whitaker settles the command handover terms',
    }],
    abstained: false,
    time: {
        decision: 'unchanged',
        elapsedSeconds: 0,
        reason: 'same-minute',
        confidence: 0.9,
    },
});
const correctedPlayerClaim = JSON.stringify({
    kind: 'directive.missionEvidenceInterpretation.v1',
    assistantAcceptance: 'corrected',
    claims: [{
        candidateId: 'policy.hesperus.rescue-risk-decision',
        sourceSlot: 'currentPlayer',
        value: 'saferPlan',
        evidenceQuote: 'I acknowledge the elapsed time and continue.',
    }],
    abstained: false,
    time: {
        decision: 'unchanged',
        elapsedSeconds: 0,
        reason: 'same-minute',
        confidence: 0.9,
    },
});

const definition = clockReadyDefinition();
const mainSnapshot = snapshot('main');
const mainHarness = createHarness({
    definition,
    sceneSnapshot: mainSnapshot,
    state: initialCampaignState(definition, mainSnapshot, { boundary: null }),
    outputs: [abstained, abstained],
});

const advanced = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets: mainHarness.runtimeAssets,
    snapshot: mainSnapshot,
});
assert.equal(advanced.ok, true, JSON.stringify({
    status: advanced.status,
    reasonCode: advanced.reasonCode,
    diagnostics: advanced.diagnostics,
}));
assert.equal(advanced.status, 'settled');
assert.equal(advanced.time.status, 'committed');
assert.equal(mainHarness.persistCount, 1, 'accepted-pair authority must use one persistence commit');
assert.equal(mainHarness.campaignState.timeLedger.entries.length, 1);
assert.equal(advanced.diagnostics.acceptedClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.clocks['clock.hesperus-life-support'].state, 'running');
assert.equal(mainHarness.campaignState.mission.v1.clocks['clock.hesperus-life-support'].value, 28.5);
const timeEvidence = mainHarness.campaignState.mission.v1.evidenceLog.find(
    (entry) => entry.claimType === 'timeAdvanced',
);
assert.equal(timeEvidence.value, 1.5);
const timeContribution = mainHarness.campaignState.storySettlement.episodes
    .flatMap((episode) => episode.contributions)
    .find((contribution) => contribution.id === timeEvidence.sourceContributionId);
assert.equal(timeContribution.role, 'runtime');
assert.match(timeContribution.messageId, /^time-boundary:/);
assert.notEqual(timeContribution.messageId, mainSnapshot.source.currentPlayer.hostMessageId);

const replay = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets: mainHarness.runtimeAssets,
    snapshot: mainSnapshot,
});
assert.equal(replay.status, 'already-settled');
assert.equal(mainHarness.campaignState.mission.v1.clocks['clock.hesperus-life-support'].value, 28.5);
assert.equal(mainHarness.campaignState.mission.v1.evidenceLog.filter(
    (entry) => entry.claimType === 'timeAdvanced',
).length, 1);

const branchSnapshot = structuredClone(mainSnapshot);
branchSnapshot.envelope.saveId = 'save.time.branch-child';
branchSnapshot.envelope.chatId = 'chat.time.branch-child';
const branchRuntimeAssets = {
    ...mainHarness.runtimeAssets,
    missionDefinitions: [definition],
};
const branchReconstruction = rebindV1CampaignStateCustody({
    campaignState: mainHarness.campaignState,
    targetSaveId: branchSnapshot.envelope.saveId,
    targetChatBinding: {
        kind: 'directive.campaignChatBinding.v1',
        version: 1,
        campaignId: mainHarness.campaignState.campaign.id,
        saveId: branchSnapshot.envelope.saveId,
        chatId: branchSnapshot.envelope.chatId,
        status: 'bound',
    },
    runtimeAssets: branchRuntimeAssets,
});
const branchHarness = createHarness({
    definition,
    sceneSnapshot: branchSnapshot,
    state: branchReconstruction.campaignState,
    outputs: [abstained],
});
const branchReplay = await branchHarness.runtime.settleAcceptedPair({
    runtimeAssets: branchHarness.runtimeAssets,
    snapshot: branchSnapshot,
});
assert.equal(branchReplay.status, 'already-settled', 'retained branch authority must reconcile without reinterpretation');
assert.equal(branchHarness.generationCount, 0, 'retained branch authority cannot call the semantic provider');

const invalidated = await mainHarness.runtime.invalidateSourceMutation({
    runtimeAssets: mainHarness.runtimeAssets,
    hostMessageId: mainSnapshot.source.currentPlayer.hostMessageId,
    eventType: 'playerMessageEdited',
});
assert.equal(invalidated.status, 'invalidated');
assert.equal(mainHarness.campaignState.mission.v1.clocks['clock.hesperus-life-support'].value, 30);
assert.equal(mainHarness.campaignState.mission.v1.evidenceLog.some(
    (entry) => entry.claimType === 'timeAdvanced',
), false);
assert.equal(mainHarness.generationCount, 1, 'time reconstruction cannot call the semantic provider');

const restored = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets: mainHarness.runtimeAssets,
    snapshot: mainSnapshot,
});
assert.equal(restored.status, 'settled');
assert.equal(
    mainHarness.generationCount,
    2,
    'an invalidated exact pair must be reinterpreted before replacement authority exists',
);
assert.equal(mainHarness.campaignState.mission.v1.clocks['clock.hesperus-life-support'].value, 28.5);
assert.equal(mainHarness.campaignState.mission.v1.evidenceLog.find(
    (entry) => entry.claimType === 'timeAdvanced',
).sourceContributionId.endsWith('.r1'), true);

const restoredBranchSnapshot = structuredClone(mainSnapshot);
restoredBranchSnapshot.envelope.saveId = 'save.time.restored-branch-child';
restoredBranchSnapshot.envelope.chatId = 'chat.time.restored-branch-child';
const restoredBranchReconstruction = rebindV1CampaignStateCustody({
    campaignState: mainHarness.campaignState,
    targetSaveId: restoredBranchSnapshot.envelope.saveId,
    targetChatBinding: {
        kind: 'directive.campaignChatBinding.v1',
        version: 1,
        campaignId: mainHarness.campaignState.campaign.id,
        saveId: restoredBranchSnapshot.envelope.saveId,
        chatId: restoredBranchSnapshot.envelope.chatId,
        status: 'bound',
    },
    runtimeAssets: branchRuntimeAssets,
});
const restoredBranchHarness = createHarness({
    definition,
    sceneSnapshot: restoredBranchSnapshot,
    state: restoredBranchReconstruction.campaignState,
    outputs: [abstained],
});
const restoredBranchReplay = await restoredBranchHarness.runtime.settleAcceptedPair({
    runtimeAssets: restoredBranchHarness.runtimeAssets,
    snapshot: restoredBranchSnapshot,
});
assert.equal(
    restoredBranchReplay.status,
    'already-settled',
    'retained branch authority with invalidation history must reconcile without reinterpretation',
);
assert.equal(
    restoredBranchHarness.generationCount,
    0,
    'retained restored branch authority cannot call the semantic provider',
);

const discardedPlayerSnapshot = snapshot('discarded-player-parent');
const discardedPlayerHarness = createHarness({
    definition,
    sceneSnapshot: discardedPlayerSnapshot,
    state: initialCampaignState(definition, discardedPlayerSnapshot, {
        suffix: 'discarded-player-parent',
        boundary: null,
    }),
    outputs: [acceptedAssistantClaim, acceptedAssistantClaim],
});
const discardedPlayerInitialSettlement = await discardedPlayerHarness.runtime.settleAcceptedPair({
    runtimeAssets: discardedPlayerHarness.runtimeAssets,
    snapshot: discardedPlayerSnapshot,
});
assert.equal(discardedPlayerInitialSettlement.status, 'settled');
const discardedPlayerInvalidation = await discardedPlayerHarness.runtime.invalidateSourceMutation({
    runtimeAssets: discardedPlayerHarness.runtimeAssets,
    hostMessageId: discardedPlayerSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'assistantMessageEdited',
});
assert.equal(discardedPlayerInvalidation.status, 'invalidated');
const discardedPlayerResettlement = await discardedPlayerHarness.runtime.settleAcceptedPair({
    runtimeAssets: discardedPlayerHarness.runtimeAssets,
    snapshot: discardedPlayerSnapshot,
});
assert.equal(discardedPlayerResettlement.status, 'settled');

const newPlayerBranchSnapshot = structuredClone(discardedPlayerSnapshot);
newPlayerBranchSnapshot.envelope.saveId = 'save.time.discarded-player-child';
newPlayerBranchSnapshot.envelope.chatId = 'chat.time.discarded-player-child';
newPlayerBranchSnapshot.source.sourceRangeHash = 'range.time.discarded-player-child.new-player';
newPlayerBranchSnapshot.source.currentPlayer = {
    hostMessageId: 'message.time.discarded-player-child.new-player',
    text: 'I take the branch in a different direction.',
    textHash: 'c'.repeat(64),
    sourceIntegrity: 'clean',
};
const discardedPlayerParentMessages = [
    {
        id: discardedPlayerSnapshot.source.previousAssistant.hostMessageId,
        role: 'assistant',
        mes: discardedPlayerSnapshot.source.previousAssistant.text,
    },
    {
        id: discardedPlayerSnapshot.source.currentPlayer.hostMessageId,
        role: 'user',
        mes: discardedPlayerSnapshot.source.currentPlayer.text,
    },
];
const newPlayerBranchReconstruction = await reconstructV1BranchState({
    parentState: discardedPlayerHarness.campaignState,
    parentMessages: discardedPlayerParentMessages,
    childMessages: discardedPlayerParentMessages.slice(0, 1),
    targetSaveId: newPlayerBranchSnapshot.envelope.saveId,
    targetChatBinding: {
        kind: 'directive.campaignChatBinding.v1',
        version: 1,
        campaignId: discardedPlayerHarness.campaignState.campaign.id,
        saveId: newPlayerBranchSnapshot.envelope.saveId,
        chatId: newPlayerBranchSnapshot.envelope.chatId,
        status: 'bound',
    },
    runtimeAssets: branchRuntimeAssets,
});
const newPlayerBranchHarness = createHarness({
    definition,
    sceneSnapshot: newPlayerBranchSnapshot,
    state: newPlayerBranchReconstruction.campaignState,
    outputs: [unchanged],
});
assert.deepEqual(
    newPlayerBranchReconstruction.discardedHostMessageIds,
    [discardedPlayerSnapshot.source.currentPlayer.hostMessageId],
);
const newPlayerBranchSettlement = await newPlayerBranchHarness.runtime.settleAcceptedPair({
    runtimeAssets: newPlayerBranchHarness.runtimeAssets,
    snapshot: newPlayerBranchSnapshot,
});
assert.equal(
    newPlayerBranchSettlement.status,
    'settled-no-effect',
    'a new player response after a retained assistant must be interpreted',
);
assert.equal(
    newPlayerBranchHarness.generationCount,
    1,
    'assistant lineage alone cannot prove that the new accepted pair was already settled',
);

const correctedAssistantSnapshot = snapshot('corrected-assistant');
const correctedAssistantHarness = createHarness({
    definition,
    sceneSnapshot: correctedAssistantSnapshot,
    state: initialCampaignState(definition, correctedAssistantSnapshot, {
        suffix: 'corrected-assistant',
        boundary: null,
    }),
    outputs: [correctedPlayerClaim, unchanged],
});
const correctedAssistantSettlement = await correctedAssistantHarness.runtime.settleAcceptedPair({
    runtimeAssets: correctedAssistantHarness.runtimeAssets,
    snapshot: correctedAssistantSnapshot,
});
assert.equal(correctedAssistantSettlement.status, 'settled');
const correctedAssistantReplay = await correctedAssistantHarness.runtime.settleAcceptedPair({
    runtimeAssets: correctedAssistantHarness.runtimeAssets,
    snapshot: correctedAssistantSnapshot,
});
assert.equal(
    correctedAssistantReplay.status,
    'already-settled',
    'durable pair authority must preserve an exact corrected-assistant outcome',
);
assert.equal(correctedAssistantHarness.generationCount, 1);
assert.equal(correctedAssistantHarness.campaignState.storySettlement.acceptedPairReceipts.length, 1);

const agedCorrectedState = structuredClone(correctedAssistantHarness.campaignState);
const decisionTemplate = agedCorrectedState.timeLedger.decisions[0];
agedCorrectedState.timeLedger.decisions = Array.from({ length: 128 }, (_, index) => ({
    ...structuredClone(decisionTemplate),
    id: `v1-time-decision.aged-${index}`,
    sourceAnchorRange: {
        kind: 'acceptedPair',
        previousAssistantHostMessageId: `message.aged.${index}.assistant`,
        currentPlayerHostMessageId: `message.aged.${index}.player`,
        rangeHash: `range.aged.${index}`,
    },
    evidenceMessageIds: [`message.aged.${index}.assistant`, `message.aged.${index}.player`],
}));
const agedCorrectedSnapshot = structuredClone(correctedAssistantSnapshot);
agedCorrectedSnapshot.envelope.saveId = 'save.time.corrected-assistant-aged-child';
agedCorrectedSnapshot.envelope.chatId = 'chat.time.corrected-assistant-aged-child';
const agedCorrectedReconstruction = rebindV1CampaignStateCustody({
    campaignState: agedCorrectedState,
    targetSaveId: agedCorrectedSnapshot.envelope.saveId,
    targetChatBinding: {
        kind: 'directive.campaignChatBinding.v1',
        version: 1,
        campaignId: agedCorrectedState.campaign.id,
        saveId: agedCorrectedSnapshot.envelope.saveId,
        chatId: agedCorrectedSnapshot.envelope.chatId,
        status: 'bound',
    },
    runtimeAssets: branchRuntimeAssets,
});
const agedCorrectedHarness = createHarness({
    definition,
    sceneSnapshot: agedCorrectedSnapshot,
    state: agedCorrectedReconstruction.campaignState,
    outputs: [unchanged],
});
const agedCorrectedReplay = await agedCorrectedHarness.runtime.settleAcceptedPair({
    runtimeAssets: agedCorrectedHarness.runtimeAssets,
    snapshot: agedCorrectedSnapshot,
});
assert.equal(
    agedCorrectedReplay.status,
    'already-settled',
    'corrected pair authority must outlive the bounded 128-decision time ledger',
);
assert.equal(agedCorrectedHarness.generationCount, 0);

const sameTextOtherSwipeSnapshot = structuredClone(correctedAssistantSnapshot);
sameTextOtherSwipeSnapshot.source.previousAssistant = {
    ...sameTextOtherSwipeSnapshot.source.previousAssistant,
    selectedVariantId: '1',
    selectedVariant: {
        selectedVariantId: '1',
        selectedTextHash: correctedAssistantSnapshot.source.previousAssistant.textHash,
        sourceIntegrity: 'clean',
    },
};
const sameTextOtherSwipeSettlement = await correctedAssistantHarness.runtime.settleAcceptedPair({
    runtimeAssets: correctedAssistantHarness.runtimeAssets,
    snapshot: sameTextOtherSwipeSnapshot,
});
assert.notEqual(
    sameTextOtherSwipeSettlement.status,
    'already-settled',
    'identical assistant text under another swipe must be reinterpreted',
);
assert.equal(correctedAssistantHarness.generationCount, 2);
const rejectedAssistantInvalidation = await correctedAssistantHarness.runtime.invalidateSourceMutation({
    runtimeAssets: correctedAssistantHarness.runtimeAssets,
    hostMessageId: correctedAssistantSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'selected-swipe-changed',
});
assert.equal(
    rejectedAssistantInvalidation.status,
    'invalidated',
    'receipt custody must invalidate even though corrected assistant prose is absent from contributions',
);

const editedCorrectedAssistantSnapshot = structuredClone(correctedAssistantSnapshot);
editedCorrectedAssistantSnapshot.source.sourceRangeHash = 'range.time.corrected-assistant.edited';
editedCorrectedAssistantSnapshot.source.previousAssistant = {
    ...editedCorrectedAssistantSnapshot.source.previousAssistant,
    text: 'The corrected assistant response now says something materially different.',
    textHash: 'd'.repeat(64),
    selectedVariantId: '1',
    selectedVariant: {
        selectedVariantId: '1',
        selectedTextHash: 'd'.repeat(64),
        sourceIntegrity: 'clean',
    },
};
const editedCorrectedAssistantSettlement = await correctedAssistantHarness.runtime.settleAcceptedPair({
    runtimeAssets: correctedAssistantHarness.runtimeAssets,
    snapshot: editedCorrectedAssistantSnapshot,
});
assert.notEqual(editedCorrectedAssistantSettlement.status, 'already-settled');
assert.equal(
    correctedAssistantHarness.generationCount,
    3,
    'player custody alone cannot preserve stale assistant acceptance semantics',
);

const resettledCorrectedSnapshot = snapshot('resettled-corrected');
const resettledCorrectedHarness = createHarness({
    definition,
    sceneSnapshot: resettledCorrectedSnapshot,
    state: initialCampaignState(definition, resettledCorrectedSnapshot, {
        suffix: 'resettled-corrected',
        boundary: null,
    }),
    outputs: [acceptedAssistantClaim, correctedPlayerClaim],
});
const initiallyAccepted = await resettledCorrectedHarness.runtime.settleAcceptedPair({
    runtimeAssets: resettledCorrectedHarness.runtimeAssets,
    snapshot: resettledCorrectedSnapshot,
});
assert.equal(initiallyAccepted.status, 'settled');
const acceptedPairInvalidation = await resettledCorrectedHarness.runtime.invalidateSourceMutation({
    runtimeAssets: resettledCorrectedHarness.runtimeAssets,
    hostMessageId: resettledCorrectedSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'selected-swipe-changed',
});
assert.equal(acceptedPairInvalidation.status, 'invalidated');
const correctedReplacement = await resettledCorrectedHarness.runtime.settleAcceptedPair({
    runtimeAssets: resettledCorrectedHarness.runtimeAssets,
    snapshot: resettledCorrectedSnapshot,
});
assert.equal(correctedReplacement.status, 'settled');
assert.equal(
    resettledCorrectedHarness.campaignState.storySettlement.acceptedPairReceipts[0].assistantAcceptance,
    'corrected',
);

const resettledCorrectedBranchSnapshot = structuredClone(resettledCorrectedSnapshot);
resettledCorrectedBranchSnapshot.envelope.saveId = 'save.time.resettled-corrected-child';
resettledCorrectedBranchSnapshot.envelope.chatId = 'chat.time.resettled-corrected-child';
const resettledCorrectedReconstruction = rebindV1CampaignStateCustody({
    campaignState: resettledCorrectedHarness.campaignState,
    targetSaveId: resettledCorrectedBranchSnapshot.envelope.saveId,
    targetChatBinding: {
        kind: 'directive.campaignChatBinding.v1',
        version: 1,
        campaignId: resettledCorrectedHarness.campaignState.campaign.id,
        saveId: resettledCorrectedBranchSnapshot.envelope.saveId,
        chatId: resettledCorrectedBranchSnapshot.envelope.chatId,
        status: 'bound',
    },
    runtimeAssets: branchRuntimeAssets,
});
const resettledCorrectedBranchHarness = createHarness({
    definition,
    sceneSnapshot: resettledCorrectedBranchSnapshot,
    state: resettledCorrectedReconstruction.campaignState,
    outputs: [unchanged],
});
const resettledCorrectedBranchReplay = await resettledCorrectedBranchHarness.runtime.settleAcceptedPair({
    runtimeAssets: resettledCorrectedBranchHarness.runtimeAssets,
    snapshot: resettledCorrectedBranchSnapshot,
});
assert.equal(
    resettledCorrectedBranchReplay.status,
    'already-settled',
    'a corrected replacement receipt remains authoritative despite historical invalidation',
);
assert.equal(resettledCorrectedBranchHarness.generationCount, 0);

const failureSnapshot = snapshot('failure-atomic');
const failureInitialState = initialCampaignState(definition, failureSnapshot, {
    suffix: 'failure-atomic',
    boundary: null,
});
const failureHarness = createHarness({
    definition,
    sceneSnapshot: failureSnapshot,
    state: failureInitialState,
    outputs: [abstained],
    failPersistenceCount: 1,
});
const failed = await failureHarness.runtime.settleAcceptedPair({
    runtimeAssets: failureHarness.runtimeAssets,
    snapshot: failureSnapshot,
});
assert.equal(failed.ok, false);
assert.equal(failed.reasonCode, 'persistence-failed');
assert.equal(failureHarness.persistCount, 1, 'one failed atomic commit must not fall through to another root write');
assert.equal(failureHarness.campaignState.timeLedger.entries.length, 0);
assert.equal(failureHarness.campaignState.mission.v1.revision, failureInitialState.mission.v1.revision);
assert.deepEqual(failureHarness.campaignState.storySettlement, failureInitialState.storySettlement);

for (const [label, testDefinition, boundaryOptions] of [
    ['mismatched boundary', clockReadyDefinition(), { currentPlayerHostMessageId: 'message.other.player', rangeHash: 'range.other' }],
    ['not-started clock', clockReadyDefinition({ startWhen: false }), {}],
    ['unsupported clock unit', clockReadyDefinition({ unit: 'fortnights' }), {}],
]) {
    const suffix = label.replaceAll(' ', '-');
    const sceneSnapshot = snapshot(suffix);
    const boundary = timeBoundaryFor(sceneSnapshot, boundaryOptions);
    const harness = createHarness({
        definition: testDefinition,
        sceneSnapshot,
        state: initialCampaignState(testDefinition, sceneSnapshot, { suffix, boundary }),
        outputs: [unchanged],
    });
    const result = await harness.runtime.settleAcceptedPair({
        runtimeAssets: harness.runtimeAssets,
        snapshot: sceneSnapshot,
    });
    assert.equal(result.ok, true, label);
    assert.equal(result.status, 'settled-no-effect', label);
    assert.equal(result.diagnostics.acceptedClaimCount, 0, label);
    assert.equal(harness.campaignState.mission.v1.clocks['clock.hesperus-life-support'].value, 30, label);
    assert.equal(harness.campaignState.mission.v1.evidenceLog.length, 0, label);
}

console.log('V1 authoritative mission-time runtime tests passed.');
