import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createInitialMissionJourney,
    validateMissionJourney,
} from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import { createStoryPlayerProjection } from '../../src/projection/v1/story-projection.mjs';
import { selectCurrentStoryEpisodes } from '../../src/story/story-settlement.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const fixture = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json',
    'utf8',
));
const branchId = 'save.journey-rebuild';

function definitionFor(id, sourceId, targetId) {
    const definition = structuredClone(fixture);
    definition.id = id;
    definition.packageBinding.sourceId = sourceId;
    definition.playerText = {
        title: id,
        summary: `Player-safe summary for ${id}.`,
    };
    definition.transitions[0].target = targetId
        ? { kind: 'mission', id: targetId, playerSafeSetup: `Proceed to ${targetId}.` }
        : { kind: 'phase', id: 'phase.unmigrated', playerSafeSetup: 'Continue when authored.' };
    return definition;
}

const missionA = definitionFor('mission.journey-a', 'journey-a', 'journey-b');
const missionB = definitionFor('mission.journey-b', 'journey-b', 'journey-c');
missionB.entryCapabilities = [{
    id: 'capability.journey-a-rescue-practice',
    source: {
        definitionId: missionA.id,
        definitionVersion: missionA.version,
        requirements: [{
            dimensionId: 'dimension.lives-protected',
            in: ['full', 'full-with-cost'],
        }],
    },
    playerText: {
        label: 'Journey A rescue practice',
        summary: 'Reuse the rescue practice proven during Journey A.',
    },
}];
const missionC = definitionFor('mission.journey-c', 'journey-c', null);
const definitions = [missionA, missionB, missionC];
const ashesAssets = loadAshesRuntimeAssets();
const runtimeAssets = {
    packageData: ashesAssets.packageData,
    crewDataset: ashesAssets.crewDataset,
    shipDataset: ashesAssets.shipDataset,
    missionDefinitions: definitions.map((definition) => ({
        path: `${definition.id}.json`,
        definition,
    })),
};

function initialState(saveId = branchId) {
    const state = createAshesInitialState({
        campaignId: 'campaign.ashes',
        saveId,
        chatId: `chat.${saveId}`,
    });
    const initialJourney = createInitialMissionJourney({ definition: missionA, branchId: saveId });
    state.mission = {
        activeMissionId: missionA.packageBinding.sourceId,
        v1: createMissionState({ definition: missionA, branchId: saveId }),
        v1Journey: initialJourney.journey,
        v1History: initialJourney.history,
    };
    return state;
}

function snapshot(definition, number) {
    const assistantHash = ((number % 14) + 1).toString(16).repeat(64);
    const playerHash = (((number + 1) % 14) + 1).toString(16).repeat(64);
    return {
        kind: 'directive.acceptedPairSnapshot.v1',
        envelope: {
            campaignId: 'campaign.ashes',
            saveId: branchId,
            chatId: `chat.${branchId}`,
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.journey.${number}`,
            previousAssistant: {
                hostMessageId: `message.journey.assistant.${number}`,
                role: 'assistant',
                text: `Accepted assistant source ${number}.`,
                textHash: assistantHash,
                sourceIntegrity: 'clean',
                selectedVariant: {
                    selectedSwipeId: `swipe.${number}`,
                    selectedTextHash: assistantHash,
                },
            },
            currentPlayer: {
                hostMessageId: `message.journey.player.${number}`,
                role: 'user',
                text: `Accepted player source ${number}.`,
                textHash: playerHash,
                sourceIntegrity: 'clean',
            },
        },
    };
}

function output(candidateId, value = undefined) {
    return JSON.stringify({
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance: 'accepted',
        claims: [{
            candidateId,
            sourceSlot: 'previousAssistant',
            evidenceQuote: 'Accepted assistant source',
            ...(value === undefined ? {} : { value }),
        }],
        abstained: false,
        time: { decision: 'unchanged', elapsedSeconds: 0, reason: 'same-second', confidence: 0.9 },
    });
}

function createHarness({ state = initialState(), outputs = [] } = {}) {
    let campaignState = structuredClone(state);
    let persistCount = 0;
    let generationCount = 0;
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => { persistCount += 1; },
        now: () => '2026-08-09T20:00:00.000Z',
    });
    const runtime = createV1MissionRuntime({
        getState: () => campaignState,
        stateDeltaGateway: gateway,
        generationRouter: {
            generate: async () => {
                const text = outputs[generationCount] ?? outputs.at(-1) ?? '';
                generationCount += 1;
                return { ok: true, response: { text, providerId: 'test', model: 'test' } };
            },
        },
        now: () => '2026-08-09T20:00:00.000Z',
    });
    return {
        runtime,
        gateway,
        get campaignState() { return campaignState; },
        get persistCount() { return persistCount; },
        get generationCount() { return generationCount; },
    };
}

async function advanceThroughB(harness) {
    const closeA = await harness.runtime.settleAcceptedPair({
        runtimeAssets,
        snapshot: snapshot(missionA, 1),
    });
    assert.equal(closeA.transitionActivated, true, JSON.stringify(closeA));
    const closeB = await harness.runtime.settleAcceptedPair({
        runtimeAssets,
        snapshot: snapshot(missionB, 2),
    });
    assert.equal(closeB.transitionActivated, true, JSON.stringify(closeB));
    assert.deepEqual(validateMissionJourney({
        campaignState: harness.campaignState,
        definitions,
    }), { ok: true, errors: [] });
}

const rollbackHarness = createHarness({
    outputs: [
        output('policy.hesperus-survivors-transferred'),
        output('policy.hesperus-survivors-transferred'),
    ],
});
await advanceThroughB(rollbackHarness);
assert.deepEqual(
    rollbackHarness.campaignState.mission.v1History.map((entry) => entry.definitionId),
    [missionA.id, missionB.id],
);
assert.equal(rollbackHarness.campaignState.mission.v1.definitionId, missionC.id);
assert.equal(selectCurrentStoryEpisodes(rollbackHarness.campaignState.storySettlement).length, 2);
const beforeRollback = structuredClone(rollbackHarness.campaignState);
const generationBeforeRollback = rollbackHarness.generationCount;
const persistBeforeRollback = rollbackHarness.persistCount;

const incompleteAssets = {
    ...runtimeAssets,
    missionDefinitions: [{ path: `${missionC.id}.json`, definition: missionC }],
};
const incompleteHarness = createHarness({ state: beforeRollback });
const incompleteMutation = await incompleteHarness.runtime.invalidateSourceMutation({
    runtimeAssets: incompleteAssets,
    hostMessageId: 'message.journey.assistant.1',
    eventType: 'directiveResponseEdited',
});
assert.equal(incompleteMutation.ok, false);
assert.equal(incompleteMutation.reasonCode, 'mission-journey-invalid');
assert.deepEqual(incompleteHarness.campaignState, beforeRollback, 'missing archived definitions fail before mutation');
assert.equal(incompleteHarness.persistCount, 0);

const rollback = await rollbackHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.journey.assistant.1',
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(rollback.ok, true, JSON.stringify(rollback));
assert.equal(rollback.status, 'invalidated');
assert.equal(rollback.invalidatedContributionCount, 1);
assert.equal(rollbackHarness.persistCount, persistBeforeRollback + 1, 'journey and Story rollback share one transaction');
assert.equal(rollbackHarness.generationCount, generationBeforeRollback, 'historic reconstruction calls no model');
assert.equal(rollbackHarness.campaignState.mission.v1.definitionId, missionA.id);
assert.equal(rollbackHarness.campaignState.mission.v1.status, 'active');
assert.equal(rollbackHarness.campaignState.mission.activeMissionId, missionA.packageBinding.sourceId);
assert.deepEqual(rollbackHarness.campaignState.mission.v1History, []);
assert.equal(rollbackHarness.campaignState.mission.v1Journey.revision, 0);
assert.equal(
    rollbackHarness.campaignState.mission.v1Journey.activeRunId,
    beforeRollback.mission.v1History[0].runId,
    'the rebuilt source resumes its original run identity',
);
assert.deepEqual(validateMissionJourney({
    campaignState: rollbackHarness.campaignState,
    definitions,
}), { ok: true, errors: [] });
assert.deepEqual(selectCurrentStoryEpisodes(rollbackHarness.campaignState.storySettlement), []);
assert.deepEqual(
    createStoryPlayerProjection({ settlement: rollbackHarness.campaignState.storySettlement }).entries,
    [],
    'invalidated source and descendant episodes cannot leak into the player projection',
);
assert.equal(rollbackHarness.campaignState.storySettlement.activeEpisode, null);
assert.equal(
    JSON.stringify(rollbackHarness.campaignState.storySettlement).includes('Player-safe summary for mission.journey-b'),
    false,
    'descendant Story summaries are not retained as current or audit prose',
);
assert.deepEqual(
    rollbackHarness.campaignState.storySettlement.acceptedPairReceipts || [],
    [],
    'causal rollback removes the accepted-pair receipts for the invalidated source and every descendant pair',
);
for (const root of ['ship', 'commandBearing']) {
    assert.deepEqual(rollbackHarness.campaignState[root], beforeRollback[root], `${root} remains outside causal rollback`);
}

const replayRevision = rollbackHarness.gateway.revision();
const replay = await rollbackHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.journey.assistant.1',
    eventType: 'directiveResponseDeleted',
});
assert.equal(replay.status, 'no-change');
assert.equal(rollbackHarness.gateway.revision(), replayRevision);

const restartedState = JSON.parse(JSON.stringify(rollbackHarness.campaignState));
assert.deepEqual(validateMissionJourney({ campaignState: restartedState, definitions }), { ok: true, errors: [] });
const restartedHarness = createHarness({ state: restartedState });
const restartedReplay = await restartedHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.journey.assistant.1',
    eventType: 'directiveResponseEdited',
});
assert.equal(restartedReplay.status, 'no-change');
assert.equal(restartedHarness.generationCount, 0);

const causalReplayHarness = createHarness({
    state: restartedState,
    outputs: [
        output('policy.hesperus-survivors-transferred'),
        output('policy.hesperus-survivors-transferred'),
    ],
});
const replayedA = await causalReplayHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(missionA, 1),
});
assert.equal(replayedA.transitionActivated, true, JSON.stringify(replayedA));
const replayedB = await causalReplayHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(missionB, 2),
});
assert.equal(replayedB.transitionActivated, true, JSON.stringify(replayedB));
assert.equal(causalReplayHarness.generationCount, 2, 'both causally rolled-back pairs are reinterpreted');
assert.equal(causalReplayHarness.campaignState.mission.v1.definitionId, missionC.id);

const laterHarness = createHarness({
    outputs: [
        output('policy.hesperus-survivors-transferred'),
        output('policy.hesperus-survivors-transferred'),
    ],
});
await advanceThroughB(laterHarness);
const archivedA = structuredClone(laterHarness.campaignState.mission.v1History[0]);
const storyAId = selectCurrentStoryEpisodes(laterHarness.campaignState.storySettlement)[0].id;
const earlierPairReceipt = structuredClone(
    laterHarness.campaignState.storySettlement.acceptedPairReceipts.find(
        (receipt) => receipt.currentPlayer.messageId === 'message.journey.player.1',
    ),
);
const laterMutation = await laterHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.journey.assistant.2',
    eventType: 'directiveResponseEdited',
});
assert.equal(laterMutation.status, 'invalidated', JSON.stringify(laterMutation));
assert.deepEqual(laterHarness.campaignState.mission.v1History, [archivedA], 'earlier archived mission remains exact');
assert.equal(laterHarness.campaignState.mission.v1.definitionId, missionB.id);
assert.equal(laterHarness.campaignState.mission.v1.status, 'active');
assert.equal(laterHarness.campaignState.mission.v1Journey.revision, 1);
assert.deepEqual(
    laterHarness.campaignState.mission.v1.entryContext.capabilities.map((capability) => capability.id),
    ['capability.journey-a-rescue-practice'],
    'rebuilding a capability-bearing mission preserves its archived entry authority',
);
assert.deepEqual(
    selectCurrentStoryEpisodes(laterHarness.campaignState.storySettlement).map((episode) => episode.id),
    [storyAId],
    'earlier Story history remains current',
);
assert.deepEqual(
    laterHarness.campaignState.storySettlement.acceptedPairReceipts,
    [earlierPairReceipt],
    'rolling back a later mission preserves the exact receipt for an earlier unrelated pair',
);

const stillClosesHarness = createHarness({
    outputs: [
        output('policy.hesperus-rescue-cost', 'material'),
        output('policy.hesperus-survivors-transferred'),
    ],
});
const partialA = await stillClosesHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(missionA, 11),
});
assert.equal(partialA.transitionActivated, false, JSON.stringify(partialA));
assert.equal(partialA.diagnostics.acceptedClaimCount, 2, JSON.stringify(partialA));
const closedA = await stillClosesHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(missionA, 12),
});
assert.equal(closedA.transitionActivated, true);
const originalTargetRunId = stillClosesHarness.campaignState.mission.v1Journey.activeRunId;
const stillClosesMutation = await stillClosesHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.journey.assistant.11',
    eventType: 'directiveResponseEdited',
});
assert.equal(stillClosesMutation.status, 'invalidated');
assert.equal(stillClosesHarness.campaignState.mission.v1History.length, 1);
assert.equal(stillClosesHarness.campaignState.mission.v1History[0].definitionId, missionA.id);
assert.equal(stillClosesHarness.campaignState.mission.v1History[0].state.status, 'terminal');
assert.equal(stillClosesHarness.campaignState.mission.v1.definitionId, missionB.id);
assert.equal(stillClosesHarness.campaignState.mission.v1.status, 'active');
assert.notEqual(
    stillClosesHarness.campaignState.mission.v1Journey.activeRunId,
    originalTargetRunId,
    `a rebuilt closure creates a fresh successor activation epoch: ${JSON.stringify({
        originalTargetRunId,
        rebuiltTargetRunId: stillClosesHarness.campaignState.mission.v1Journey.activeRunId,
        archivedRevision: stillClosesHarness.campaignState.mission.v1History[0].state.revision,
        invalidated: stillClosesHarness.campaignState.mission.v1History[0].state.invalidatedSourceContributionIds,
        rollback: stillClosesMutation.journeyRollback,
    })}`,
);
assert.deepEqual(validateMissionJourney({
    campaignState: stillClosesHarness.campaignState,
    definitions,
}), { ok: true, errors: [] });

const storyOnlyHarness = createHarness({
    outputs: [output('policy.hesperus-survivors-transferred')],
});
await storyOnlyHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(missionA, 21),
});
const journeyBeforeStoryOnly = structuredClone(storyOnlyHarness.campaignState.mission);
const storyOnlyMutation = await storyOnlyHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: 'message.journey.player.21',
    eventType: 'playerMessageEdited',
});
assert.equal(storyOnlyMutation.status, 'invalidated');
assert.deepEqual(storyOnlyHarness.campaignState.mission, journeyBeforeStoryOnly);
assert.equal(selectCurrentStoryEpisodes(storyOnlyHarness.campaignState.storySettlement).length, 1);
assert.equal(selectCurrentStoryEpisodes(storyOnlyHarness.campaignState.storySettlement)[0].contributions.length, 2);

console.log('V1 mission journey source-rebuild tests passed.');
