import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { prepareV1AcceptedPairTimeAdvance } from '../../src/runtime/v1-accepted-pair-time.mjs';
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
                text: 'After ninety minutes of accepted story activity, the scene reaches a natural boundary.',
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
assert.equal(mainHarness.campaignState.mission.v1.clocks['clock.hesperus-life-support'].value, 28.5);
assert.equal(mainHarness.campaignState.mission.v1.evidenceLog.find(
    (entry) => entry.claimType === 'timeAdvanced',
).sourceContributionId.endsWith('.r1'), true);

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
