import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import {
    createInitialMissionJourney,
    validateMissionJourney,
} from '../../src/mission/v1/mission-journey.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { validateMissionStateAuthority } from '../../src/mission/v1/mission-state-authority.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContributions,
    openStoryEpisode,
} from '../../src/story/story-settlement.mjs';

const preludeDefinition = readJson('packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json');
const chapterDefinition = readJson('packages/bundled/breckenridge/v1/chapter-1-the-empty-convoy.mission-v1.json');
const chapter2Definition = readJson('packages/bundled/breckenridge/v1/chapter-2-false-colors.mission-v1.json');
const openOrdersDefinition = readJson('packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json');
const chapter3Definition = readJson('packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json');
const chapter4Definition = readJson('packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json');
const preludeScenarios = readJson('tests/fixtures/mission/v1/prelude-hesperus-scenarios.fixture.json');
const chapterScenarios = readJson('tests/fixtures/mission/v1/chapter-1-empty-convoy-scenarios.fixture.json');
const chapter2Scenarios = readJson('tests/fixtures/mission/v1/chapter-2-false-colors-scenarios.fixture.json');
const openOrdersScenarios = readJson('tests/fixtures/mission/v1/open-orders-1-scenarios.fixture.json');
const chapter3Scenarios = readJson('tests/fixtures/mission/v1/chapter-3-dead-letters-scenarios.fixture.json');
const chapter4Scenarios = readJson('tests/fixtures/mission/v1/chapter-4-colony-that-stayed-scenarios.fixture.json');
const branchId = 'save.ashes-v1-handoff';

function readJson(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function stepsForScenario(fixture, scenarioId) {
    const scenario = fixture.scenarios.find((candidate) => candidate.id === scenarioId);
    assert.ok(scenario, `missing scenario ${scenarioId}`);
    return {
        scenario,
        steps: [
            ...(scenario.sequence || []).flatMap((fragmentId) => fixture.fragments[fragmentId] || []),
            ...(scenario.steps || []),
        ],
    };
}

function settleScenario({ definition, fixture, scenarioId }) {
    const { scenario, steps } = stepsForScenario(fixture, scenarioId);
    let state = createMissionState({ definition, branchId });
    for (const [index, step] of steps.entries()) {
        const selectedSwipeId = step.sourceRole === 'assistant' ? `swipe.${scenarioId}.${index + 1}` : null;
        const source = {
            messageId: `message.${scenarioId}.${index + 1}`,
            branchId,
            accepted: true,
            selectedSwipeId,
            textHash: createHash('sha256').update(`${scenarioId}:${index}:${step.claimId}`).digest('hex'),
            role: step.sourceRole,
            acceptedAtRevision: state.revision,
        };
        const proposal = {
            kind: 'directive.missionEvidenceProposal.v1',
            branchId,
            missionId: definition.id,
            baseRevision: state.revision,
            providerConfidence: 0.99,
            claims: [{
                claimId: step.claimId,
                policyId: step.policyId,
                claimType: step.claimType,
                targetId: step.targetId,
                ...(Object.hasOwn(step, 'value') ? { value: step.value } : {}),
                sourceRef: {
                    messageId: source.messageId,
                    swipeId: selectedSwipeId,
                    textHash: source.textHash,
                },
            }],
        };
        const evidence = validateMissionEvidenceProposal({
            definition,
            state,
            proposal,
            resolveSourceRef: (ref) => ref?.messageId === source.messageId ? source : null,
        });
        assert.deepEqual(evidence.rejectedClaims, [], `${scenarioId}:${step.claimId}`);
        assert.equal(evidence.acceptedClaims.length, 1, `${scenarioId}:${step.claimId}`);
        state = reduceMissionEvidence({
            definition,
            state,
            acceptedClaims: evidence.acceptedClaims,
            sourceContribution: {
                id: `contribution.${scenarioId}.${index + 1}`,
                messageId: source.messageId,
                swipeId: selectedSwipeId,
                role: source.role,
                textHash: source.textHash,
                acceptedAtRevision: source.acceptedAtRevision,
            },
        }).state;
    }
    assert.equal(state.status, scenario.expected.status);
    return state;
}

function storySettlementForScenario(fixture, scenarioId, definition = preludeDefinition) {
    const { steps } = stepsForScenario(fixture, scenarioId);
    let settlement = createEmptyStorySettlement({ branchId });
    settlement = openStoryEpisode(settlement, {
        episodeId: `episode.${scenarioId}`,
        sceneId: `scene.${scenarioId}`,
        references: { missionIds: [definition.id] },
    });
    const contributions = steps.map((step, index) => {
        const selectedSwipeId = step.sourceRole === 'assistant' ? `swipe.${scenarioId}.${index + 1}` : null;
        return {
            id: `contribution.${scenarioId}.${index + 1}`,
            messageId: `message.${scenarioId}.${index + 1}`,
            swipeId: selectedSwipeId,
            role: step.sourceRole,
            textHash: createHash('sha256').update(`${scenarioId}:${index}:${step.claimId}`).digest('hex'),
            acceptedAtRevision: index,
        };
    });
    return {
        settlement: acceptStoryContributions(settlement, contributions),
        contributions,
    };
}

function assetsFor(definitions) {
    const records = definitions.map((definition) => ({
        path: `packages/bundled/breckenridge/v1/${definition.packageBinding.sourceId}.mission-v1.json`,
        definition,
    }));
    return {
        packageData: {
            manifest: {
                id: preludeDefinition.packageBinding.packageId,
                version: preludeDefinition.packageBinding.packageVersion,
            },
        },
        missionDefinitions: records,
        missionDefinitionsById: new Map(records.map((record) => [record.definition.id, record])),
    };
}

const terminalPrelude = settleScenario({
    definition: preludeDefinition,
    fixture: preludeScenarios,
    scenarioId: 'rescue-success-no-discovery',
});
assert.equal(terminalPrelude.status, 'terminal');
assert.equal(terminalPrelude.transitionReceipt.target.id, 'chapter-1-the-empty-convoy');
const preludeStory = storySettlementForScenario(preludeScenarios, 'rescue-success-no-discovery');
const preludeMutationMessageId = preludeStory.contributions[0].messageId;
const initialJourney = createInitialMissionJourney({ branchId, definition: preludeDefinition });
let campaignState = {
    activeCampaignPackage: {
        packageId: preludeDefinition.packageBinding.packageId,
        packageVersion: preludeDefinition.packageBinding.packageVersion,
    },
    campaignChatBinding: { saveId: branchId, chatId: 'chat.ashes-v1-handoff' },
    mission: {
        activeMissionId: preludeDefinition.packageBinding.sourceId,
        legacyStatus: 'must-remain-untouched',
        legacyPressure: { id: 'legacy-pressure-must-remain-untouched' },
        legacyAssignments: [{ id: 'legacy-assignment-must-remain-untouched' }],
        legacyRewards: [{ id: 'legacy-reward-must-remain-untouched' }],
        legacyProgress: { id: 'legacy-progress-must-remain-untouched' },
        v1: terminalPrelude,
        v1Journey: initialJourney.journey,
        v1History: initialJourney.history,
    },
    ship: { conditions: [{ id: 'ship.legacy-unchanged' }] },
    relationships: { people: [{ id: 'relationship.legacy-unchanged' }] },
    questLedger: { records: [{ id: 'quest.legacy-unchanged' }] },
    threadLedger: { records: [{ id: 'thread.legacy-unchanged' }] },
    commandLog: { entries: [{ id: 'log.legacy-unchanged' }] },
    commandBearing: { current: 4 },
    storySettlement: preludeStory.settlement,
};
const unrelatedBefore = structuredClone({
    ship: campaignState.ship,
    relationships: campaignState.relationships,
    questLedger: campaignState.questLedger,
    threadLedger: campaignState.threadLedger,
    commandLog: campaignState.commandLog,
    commandBearing: campaignState.commandBearing,
});
let persistCount = 0;
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
            throw new Error('MISSION_HANDOFF_MUST_NOT_CALL_PROVIDER');
        },
    },
    now: () => '2026-08-09T20:00:00.000Z',
});
const sourceOnlyAssets = assetsFor([preludeDefinition]);
const completeAssets = assetsFor([preludeDefinition, chapterDefinition]);
const chapter2Assets = assetsFor([preludeDefinition, chapterDefinition, chapter2Definition]);
const openOrdersAssets = assetsFor([preludeDefinition, chapterDefinition, chapter2Definition, openOrdersDefinition]);
const chapter3Assets = assetsFor([
    preludeDefinition,
    chapterDefinition,
    chapter2Definition,
    openOrdersDefinition,
    chapter3Definition,
]);
const chapter4Assets = assetsFor([
    preludeDefinition,
    chapterDefinition,
    chapter2Definition,
    openOrdersDefinition,
    chapter3Definition,
    chapter4Definition,
]);

const pending = runtime.inspectPendingTransition({ runtimeAssets: sourceOnlyAssets });
assert.equal(pending.ok, true);
assert.equal(pending.status, 'pending');
assert.equal(pending.reasonCode, 'transition-target-definition-unavailable');
assert.equal(pending.activatable, false);

const ready = runtime.inspectPendingTransition({ runtimeAssets: completeAssets });
assert.equal(ready.ok, true);
assert.equal(ready.status, 'ready');
assert.equal(ready.targetDefinitionId, chapterDefinition.id);
assert.equal(ready.activatable, true);

const preActivationCampaignState = structuredClone(campaignState);
const activated = await runtime.activatePendingTransition({ runtimeAssets: completeAssets });
assert.equal(activated.ok, true);
assert.equal(activated.status, 'activated');
assert.equal(activated.targetDefinitionId, chapterDefinition.id);
assert.equal(activated.noChange, false);
assert.equal(persistCount, 1);
assert.equal(campaignState.mission.activeMissionId, chapterDefinition.packageBinding.sourceId);
assert.equal(campaignState.mission.legacyStatus, 'must-remain-untouched');
assert.equal(campaignState.mission.v1.definitionId, chapterDefinition.id);
assert.equal(campaignState.mission.v1.status, 'active');
assert.deepEqual(Object.keys(campaignState.mission.v1.objectives), chapterDefinition.objectives.map((item) => item.id));
assert.equal(JSON.stringify(campaignState.mission.v1).includes('objective.prelude.'), false);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('outcome.prelude.'), false);
assert.equal(campaignState.mission.v1History.length, 1);
assert.equal(campaignState.mission.v1History[0].definitionId, preludeDefinition.id);
assert.deepEqual(campaignState.mission.v1History[0].state, terminalPrelude);
assert.equal(campaignState.mission.v1Journey.revision, 1);
assert.deepEqual({
    ship: campaignState.ship,
    relationships: campaignState.relationships,
    questLedger: campaignState.questLedger,
    threadLedger: campaignState.threadLedger,
    commandLog: campaignState.commandLog,
    commandBearing: campaignState.commandBearing,
}, unrelatedBefore, 'mission activation cannot mutate legacy tracking roots');
const activatedCampaignState = structuredClone(campaignState);

const reloaded = JSON.parse(JSON.stringify(campaignState));
const reloadedJourney = validateMissionJourney({
    campaignState: reloaded,
    definitions: [preludeDefinition, chapterDefinition],
});
assert.equal(reloadedJourney.ok, true, reloadedJourney.errors.join('\n'));
assert.equal(validateMissionStateAuthority({
    definition: chapterDefinition,
    state: reloaded.mission.v1,
}).ok, true);

const replay = await runtime.activatePendingTransition({ runtimeAssets: completeAssets });
assert.equal(replay.ok, true);
assert.equal(replay.status, 'no-pending-transition');
assert.equal(replay.noChange, true);
assert.equal(persistCount, 1, 'activation replay cannot persist twice');
assert.equal(campaignState.mission.v1Journey.revision, 1);

const terminalChapter = settleScenario({
    definition: chapterDefinition,
    fixture: chapterScenarios,
    scenarioId: 'cooperative-success',
});
const chapterStory = storySettlementForScenario(chapterScenarios, 'cooperative-success', chapterDefinition);
const chapterMutationMessageId = chapterStory.contributions[0].messageId;
campaignState.mission.v1 = terminalChapter;
campaignState.storySettlement = chapterStory.settlement;
const chapterJourney = validateMissionJourney({
    campaignState,
    definitions: [preludeDefinition, chapterDefinition],
});
assert.equal(chapterJourney.ok, true, chapterJourney.errors.join('\n'));
const chapterPending = runtime.inspectPendingTransition({ runtimeAssets: completeAssets });
assert.equal(chapterPending.ok, true);
assert.equal(chapterPending.status, 'pending');
assert.equal(chapterPending.reasonCode, 'transition-target-definition-unavailable');
assert.equal(chapterPending.targetDefinitionId, null);
assert.equal(chapterPending.activatable, false);
const preChapter2ActivationCampaignState = structuredClone(campaignState);

const chapterReady = runtime.inspectPendingTransition({ runtimeAssets: chapter2Assets });
assert.equal(chapterReady.ok, true);
assert.equal(chapterReady.status, 'ready');
assert.equal(chapterReady.targetDefinitionId, chapter2Definition.id);
assert.equal(chapterReady.activatable, true);

const chapter2Activated = await runtime.activatePendingTransition({ runtimeAssets: chapter2Assets });
assert.equal(chapter2Activated.ok, true);
assert.equal(chapter2Activated.status, 'activated');
assert.equal(chapter2Activated.targetDefinitionId, chapter2Definition.id);
assert.equal(chapter2Activated.noChange, false);
assert.equal(persistCount, 2);
assert.equal(campaignState.mission.activeMissionId, chapter2Definition.packageBinding.sourceId);
assert.equal(campaignState.mission.legacyStatus, 'must-remain-untouched');
assert.equal(campaignState.mission.v1.definitionId, chapter2Definition.id);
assert.equal(campaignState.mission.v1.status, 'active');
assert.deepEqual(Object.keys(campaignState.mission.v1.objectives), chapter2Definition.objectives.map((item) => item.id));
assert.equal(JSON.stringify(campaignState.mission.v1).includes('objective.chapter1.'), false);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('outcome.chapter1.'), false);
assert.equal(campaignState.mission.v1History.length, 2);
assert.equal(campaignState.mission.v1History[0].definitionId, preludeDefinition.id);
assert.equal(campaignState.mission.v1History[1].definitionId, chapterDefinition.id);
assert.deepEqual(campaignState.mission.v1History[1].state, terminalChapter);
assert.equal(campaignState.mission.v1Journey.revision, 2);
assert.deepEqual({
    ship: campaignState.ship,
    relationships: campaignState.relationships,
    questLedger: campaignState.questLedger,
    threadLedger: campaignState.threadLedger,
    commandLog: campaignState.commandLog,
    commandBearing: campaignState.commandBearing,
}, unrelatedBefore, 'Chapter 2 activation cannot mutate legacy tracking roots');
const chapter2ActivatedCampaignState = structuredClone(campaignState);

const chapter2Reloaded = JSON.parse(JSON.stringify(campaignState));
const chapter2ReloadedJourney = validateMissionJourney({
    campaignState: chapter2Reloaded,
    definitions: [preludeDefinition, chapterDefinition, chapter2Definition],
});
assert.equal(chapter2ReloadedJourney.ok, true, chapter2ReloadedJourney.errors.join('\n'));
assert.equal(validateMissionStateAuthority({
    definition: chapter2Definition,
    state: chapter2Reloaded.mission.v1,
}).ok, true);

const chapter2Replay = await runtime.activatePendingTransition({ runtimeAssets: chapter2Assets });
assert.equal(chapter2Replay.ok, true);
assert.equal(chapter2Replay.status, 'no-pending-transition');
assert.equal(chapter2Replay.noChange, true);
assert.equal(persistCount, 2, 'Chapter 2 activation replay cannot persist twice');

const terminalChapter2 = settleScenario({
    definition: chapter2Definition,
    fixture: chapter2Scenarios,
    scenarioId: 'joint-legitimacy',
});
const chapter2Story = storySettlementForScenario(chapter2Scenarios, 'joint-legitimacy', chapter2Definition);
const chapter2MutationMessageId = chapter2Story.contributions[0].messageId;
campaignState.mission.v1 = terminalChapter2;
campaignState.storySettlement = chapter2Story.settlement;
const openOrdersJourney = validateMissionJourney({
    campaignState,
    definitions: [preludeDefinition, chapterDefinition, chapter2Definition],
});
assert.equal(openOrdersJourney.ok, true, openOrdersJourney.errors.join('\n'));
const openOrdersPending = runtime.inspectPendingTransition({ runtimeAssets: chapter2Assets });
assert.equal(openOrdersPending.ok, true);
assert.equal(openOrdersPending.status, 'pending');
assert.equal(openOrdersPending.reasonCode, 'transition-target-definition-unavailable');
assert.equal(openOrdersPending.targetDefinitionId, null);
assert.equal(openOrdersPending.activatable, false);
const preOpenOrdersActivationCampaignState = structuredClone(campaignState);

const openOrdersReady = runtime.inspectPendingTransition({ runtimeAssets: openOrdersAssets });
assert.equal(openOrdersReady.ok, true);
assert.equal(openOrdersReady.status, 'ready');
assert.equal(openOrdersReady.targetDefinitionId, openOrdersDefinition.id);
assert.equal(openOrdersReady.activatable, true);

const openOrdersActivated = await runtime.activatePendingTransition({ runtimeAssets: openOrdersAssets });
assert.equal(openOrdersActivated.ok, true);
assert.equal(openOrdersActivated.status, 'activated');
assert.equal(openOrdersActivated.targetDefinitionId, openOrdersDefinition.id);
assert.equal(openOrdersActivated.noChange, false);
assert.equal(persistCount, 3);
assert.equal(campaignState.mission.activeMissionId, openOrdersDefinition.packageBinding.sourceId);
assert.equal(campaignState.mission.legacyStatus, 'must-remain-untouched');
assert.deepEqual(campaignState.mission.legacyPressure, { id: 'legacy-pressure-must-remain-untouched' });
assert.deepEqual(campaignState.mission.legacyAssignments, [{ id: 'legacy-assignment-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyRewards, [{ id: 'legacy-reward-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyProgress, { id: 'legacy-progress-must-remain-untouched' });
assert.equal(campaignState.mission.v1.definitionId, openOrdersDefinition.id);
assert.equal(campaignState.mission.v1.status, 'active');
assert.deepEqual(Object.keys(campaignState.mission.v1.objectives), openOrdersDefinition.objectives.map((item) => item.id));
assert.equal(JSON.stringify(campaignState.mission.v1).includes('objective.chapter2.'), false);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('outcome.chapter2.'), false);
for (const sentinel of ['legacy-pressure-', 'legacy-assignment-', 'legacy-reward-', 'legacy-progress-']) {
    assert.equal(JSON.stringify(campaignState.mission.v1).includes(sentinel), false, `${sentinel} cannot copy into V1`);
}
assert.equal(campaignState.mission.v1History.length, 3);
assert.equal(campaignState.mission.v1History[0].definitionId, preludeDefinition.id);
assert.equal(campaignState.mission.v1History[1].definitionId, chapterDefinition.id);
assert.equal(campaignState.mission.v1History[2].definitionId, chapter2Definition.id);
assert.deepEqual(campaignState.mission.v1History[2].state, terminalChapter2);
assert.equal(campaignState.mission.v1Journey.revision, 3);
assert.deepEqual({
    ship: campaignState.ship,
    relationships: campaignState.relationships,
    questLedger: campaignState.questLedger,
    threadLedger: campaignState.threadLedger,
    commandLog: campaignState.commandLog,
    commandBearing: campaignState.commandBearing,
}, unrelatedBefore, 'Open Orders I activation cannot mutate legacy tracking roots');
const openOrdersActivatedCampaignState = structuredClone(campaignState);

const openOrdersReloaded = JSON.parse(JSON.stringify(campaignState));
const openOrdersReloadedJourney = validateMissionJourney({
    campaignState: openOrdersReloaded,
    definitions: [preludeDefinition, chapterDefinition, chapter2Definition, openOrdersDefinition],
});
assert.equal(openOrdersReloadedJourney.ok, true, openOrdersReloadedJourney.errors.join('\n'));
assert.equal(validateMissionStateAuthority({
    definition: openOrdersDefinition,
    state: openOrdersReloaded.mission.v1,
}).ok, true);

const openOrdersReplay = await runtime.activatePendingTransition({ runtimeAssets: openOrdersAssets });
assert.equal(openOrdersReplay.ok, true);
assert.equal(openOrdersReplay.status, 'no-pending-transition');
assert.equal(openOrdersReplay.noChange, true);
assert.equal(persistCount, 3, 'Open Orders I activation replay cannot persist twice');

const terminalOpenOrders = settleScenario({
    definition: openOrdersDefinition,
    fixture: openOrdersScenarios,
    scenarioId: 'two-assignment-normal',
});
const openOrdersStory = storySettlementForScenario(
    openOrdersScenarios,
    'two-assignment-normal',
    openOrdersDefinition,
);
const openOrdersMutationMessageId = openOrdersStory.contributions[0].messageId;
campaignState.mission.v1 = terminalOpenOrders;
campaignState.storySettlement = openOrdersStory.settlement;
const chapter3Journey = validateMissionJourney({
    campaignState,
    definitions: [preludeDefinition, chapterDefinition, chapter2Definition, openOrdersDefinition],
});
assert.equal(chapter3Journey.ok, true, chapter3Journey.errors.join('\n'));
const chapter3Pending = runtime.inspectPendingTransition({ runtimeAssets: openOrdersAssets });
assert.equal(chapter3Pending.ok, true);
assert.equal(chapter3Pending.status, 'pending');
assert.equal(chapter3Pending.reasonCode, 'transition-target-definition-unavailable');
assert.equal(chapter3Pending.targetDefinitionId, null);
assert.equal(chapter3Pending.activatable, false);
const preChapter3ActivationCampaignState = structuredClone(campaignState);

const chapter3Ready = runtime.inspectPendingTransition({ runtimeAssets: chapter3Assets });
assert.equal(chapter3Ready.ok, true);
assert.equal(chapter3Ready.status, 'ready');
assert.equal(chapter3Ready.targetDefinitionId, chapter3Definition.id);
assert.equal(chapter3Ready.activatable, true);

const chapter3Activated = await runtime.activatePendingTransition({ runtimeAssets: chapter3Assets });
assert.equal(chapter3Activated.ok, true);
assert.equal(chapter3Activated.status, 'activated');
assert.equal(chapter3Activated.targetDefinitionId, chapter3Definition.id);
assert.equal(chapter3Activated.noChange, false);
assert.equal(persistCount, 4);
assert.equal(campaignState.mission.activeMissionId, chapter3Definition.packageBinding.sourceId);
assert.equal(campaignState.mission.legacyStatus, 'must-remain-untouched');
assert.deepEqual(campaignState.mission.legacyPressure, { id: 'legacy-pressure-must-remain-untouched' });
assert.deepEqual(campaignState.mission.legacyAssignments, [{ id: 'legacy-assignment-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyRewards, [{ id: 'legacy-reward-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyProgress, { id: 'legacy-progress-must-remain-untouched' });
assert.equal(campaignState.mission.v1.definitionId, chapter3Definition.id);
assert.equal(campaignState.mission.v1.status, 'active');
assert.deepEqual(Object.keys(campaignState.mission.v1.objectives), chapter3Definition.objectives.map((item) => item.id));
assert.equal(JSON.stringify(campaignState.mission.v1).includes('objective.open-orders1.'), false);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('outcome.open-orders1.'), false);
for (const sentinel of ['legacy-pressure-', 'legacy-assignment-', 'legacy-reward-', 'legacy-progress-']) {
    assert.equal(JSON.stringify(campaignState.mission.v1).includes(sentinel), false, `${sentinel} cannot copy into Dead Letters V1`);
}
assert.equal(campaignState.mission.v1History.length, 4);
assert.equal(campaignState.mission.v1History[0].definitionId, preludeDefinition.id);
assert.equal(campaignState.mission.v1History[1].definitionId, chapterDefinition.id);
assert.equal(campaignState.mission.v1History[2].definitionId, chapter2Definition.id);
assert.equal(campaignState.mission.v1History[3].definitionId, openOrdersDefinition.id);
assert.deepEqual(campaignState.mission.v1History[3].state, terminalOpenOrders);
assert.equal(campaignState.mission.v1Journey.revision, 4);
assert.deepEqual({
    ship: campaignState.ship,
    relationships: campaignState.relationships,
    questLedger: campaignState.questLedger,
    threadLedger: campaignState.threadLedger,
    commandLog: campaignState.commandLog,
    commandBearing: campaignState.commandBearing,
}, unrelatedBefore, 'Dead Letters activation cannot mutate legacy tracking roots');
const chapter3ActivatedCampaignState = structuredClone(campaignState);

const chapter3Reloaded = JSON.parse(JSON.stringify(campaignState));
const chapter3ReloadedJourney = validateMissionJourney({
    campaignState: chapter3Reloaded,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
    ],
});
assert.equal(chapter3ReloadedJourney.ok, true, chapter3ReloadedJourney.errors.join('\n'));
assert.equal(validateMissionStateAuthority({
    definition: chapter3Definition,
    state: chapter3Reloaded.mission.v1,
}).ok, true);

const chapter3Replay = await runtime.activatePendingTransition({ runtimeAssets: chapter3Assets });
assert.equal(chapter3Replay.ok, true);
assert.equal(chapter3Replay.status, 'no-pending-transition');
assert.equal(chapter3Replay.noChange, true);
assert.equal(persistCount, 4, 'Dead Letters activation replay cannot persist twice');

const terminalChapter3 = settleScenario({
    definition: chapter3Definition,
    fixture: chapter3Scenarios,
    scenarioId: 'accountable-isolation',
});
const chapter3Story = storySettlementForScenario(
    chapter3Scenarios,
    'accountable-isolation',
    chapter3Definition,
);
const chapter3MutationMessageId = chapter3Story.contributions[0].messageId;
campaignState.mission.v1 = terminalChapter3;
campaignState.storySettlement = chapter3Story.settlement;
const chapter4Journey = validateMissionJourney({
    campaignState,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
    ],
});
assert.equal(chapter4Journey.ok, true, chapter4Journey.errors.join('\n'));
const chapter4Pending = runtime.inspectPendingTransition({ runtimeAssets: chapter3Assets });
assert.equal(chapter4Pending.ok, true);
assert.equal(chapter4Pending.status, 'pending');
assert.equal(chapter4Pending.reasonCode, 'transition-target-definition-unavailable');
assert.equal(chapter4Pending.targetDefinitionId, null);
assert.equal(chapter4Pending.activatable, false);
const preChapter4ActivationCampaignState = structuredClone(campaignState);

const chapter4Ready = runtime.inspectPendingTransition({ runtimeAssets: chapter4Assets });
assert.equal(chapter4Ready.ok, true);
assert.equal(chapter4Ready.status, 'ready');
assert.equal(chapter4Ready.targetDefinitionId, chapter4Definition.id);
assert.equal(chapter4Ready.activatable, true);

const chapter4Activated = await runtime.activatePendingTransition({ runtimeAssets: chapter4Assets });
assert.equal(chapter4Activated.ok, true);
assert.equal(chapter4Activated.status, 'activated');
assert.equal(chapter4Activated.targetDefinitionId, chapter4Definition.id);
assert.equal(chapter4Activated.noChange, false);
assert.equal(persistCount, 5);
assert.equal(campaignState.mission.activeMissionId, chapter4Definition.packageBinding.sourceId);
assert.equal(campaignState.mission.legacyStatus, 'must-remain-untouched');
assert.deepEqual(campaignState.mission.legacyPressure, { id: 'legacy-pressure-must-remain-untouched' });
assert.deepEqual(campaignState.mission.legacyAssignments, [{ id: 'legacy-assignment-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyRewards, [{ id: 'legacy-reward-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyProgress, { id: 'legacy-progress-must-remain-untouched' });
assert.equal(campaignState.mission.v1.definitionId, chapter4Definition.id);
assert.equal(campaignState.mission.v1.status, 'active');
assert.deepEqual(Object.keys(campaignState.mission.v1.objectives), chapter4Definition.objectives.map((item) => item.id));
assert.equal(JSON.stringify(campaignState.mission.v1).includes('objective.chapter3.'), false);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('outcome.chapter3.'), false);
for (const sentinel of ['legacy-pressure-', 'legacy-assignment-', 'legacy-reward-', 'legacy-progress-']) {
    assert.equal(JSON.stringify(campaignState.mission.v1).includes(sentinel), false, `${sentinel} cannot copy into Colony V1`);
}
assert.equal(campaignState.mission.v1History.length, 5);
assert.equal(campaignState.mission.v1History[0].definitionId, preludeDefinition.id);
assert.equal(campaignState.mission.v1History[1].definitionId, chapterDefinition.id);
assert.equal(campaignState.mission.v1History[2].definitionId, chapter2Definition.id);
assert.equal(campaignState.mission.v1History[3].definitionId, openOrdersDefinition.id);
assert.equal(campaignState.mission.v1History[4].definitionId, chapter3Definition.id);
assert.deepEqual(campaignState.mission.v1History[4].state, terminalChapter3);
assert.equal(campaignState.mission.v1Journey.revision, 5);
assert.deepEqual({
    ship: campaignState.ship,
    relationships: campaignState.relationships,
    questLedger: campaignState.questLedger,
    threadLedger: campaignState.threadLedger,
    commandLog: campaignState.commandLog,
    commandBearing: campaignState.commandBearing,
}, unrelatedBefore, 'Colony activation cannot mutate legacy tracking roots');
const chapter4ActivatedCampaignState = structuredClone(campaignState);

const chapter4Reloaded = JSON.parse(JSON.stringify(campaignState));
const chapter4ReloadedJourney = validateMissionJourney({
    campaignState: chapter4Reloaded,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
    ],
});
assert.equal(chapter4ReloadedJourney.ok, true, chapter4ReloadedJourney.errors.join('\n'));
assert.equal(validateMissionStateAuthority({
    definition: chapter4Definition,
    state: chapter4Reloaded.mission.v1,
}).ok, true);

const chapter4Replay = await runtime.activatePendingTransition({ runtimeAssets: chapter4Assets });
assert.equal(chapter4Replay.ok, true);
assert.equal(chapter4Replay.status, 'no-pending-transition');
assert.equal(chapter4Replay.noChange, true);
assert.equal(persistCount, 5, 'Colony activation replay cannot persist twice');

const terminalChapter4 = settleScenario({
    definition: chapter4Definition,
    fixture: chapter4Scenarios,
    scenarioId: 'shared-accountability',
});
const chapter4Story = storySettlementForScenario(
    chapter4Scenarios,
    'shared-accountability',
    chapter4Definition,
);
const chapter4MutationMessageId = chapter4Story.contributions[0].messageId;
campaignState.mission.v1 = terminalChapter4;
campaignState.storySettlement = chapter4Story.settlement;
const chapter5Journey = validateMissionJourney({
    campaignState,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
    ],
});
assert.equal(chapter5Journey.ok, true, chapter5Journey.errors.join('\n'));
const chapter5Pending = runtime.inspectPendingTransition({ runtimeAssets: chapter4Assets });
assert.equal(chapter5Pending.ok, true);
assert.equal(chapter5Pending.status, 'pending');
assert.equal(chapter5Pending.reasonCode, 'transition-target-definition-unavailable');
assert.equal(chapter5Pending.targetDefinitionId, null);
assert.equal(chapter5Pending.activatable, false);
const terminalChapter4CampaignState = structuredClone(campaignState);

function createMutationHarness(initialState) {
    let mutationState = structuredClone(initialState);
    let generationCount = 0;
    const mutationGateway = createStateDeltaGateway({
        getState: () => mutationState,
        setState: (next) => { mutationState = next; },
        persist: async () => {},
        now: () => '2026-08-09T20:30:00.000Z',
    });
    const mutationRuntime = createV1MissionRuntime({
        getState: () => mutationState,
        stateDeltaGateway: mutationGateway,
        generationRouter: {
            generate: async () => {
                generationCount += 1;
                throw new Error('SOURCE_REBUILD_MUST_NOT_CALL_PROVIDER');
            },
        },
        now: () => '2026-08-09T20:30:00.000Z',
    });
    return {
        mutationRuntime,
        get state() { return mutationState; },
        get generationCount() { return generationCount; },
    };
}

for (const [label, initialState, runtimeAssets] of [
    ['before-activation', preActivationCampaignState, completeAssets],
    ['after-activation', activatedCampaignState, completeAssets],
]) {
    const mutation = createMutationHarness(initialState);
    const result = await mutation.mutationRuntime.invalidateSourceMutation({
        runtimeAssets,
        hostMessageId: preludeMutationMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
    });
    assert.equal(result.ok, true, label);
    assert.equal(result.status, 'invalidated', label);
    assert.equal(mutation.state.mission.v1.definitionId, preludeDefinition.id, label);
    assert.equal(mutation.state.mission.v1.status, 'active', label);
    assert.equal(mutation.state.mission.v1History.length, 0, label);
    assert.equal(mutation.state.mission.v1Journey.revision, 0, label);
    assert.equal(JSON.stringify(mutation.state.mission.v1).includes('objective.chapter1.'), false, label);
    assert.equal(mutation.generationCount, 0, `${label} reconstruction cannot call a provider`);
}

for (const [label, initialState] of [
    ['before-chapter2-activation', preChapter2ActivationCampaignState],
    ['after-chapter2-activation', chapter2ActivatedCampaignState],
]) {
    const chapterMutation = createMutationHarness(initialState);
    const chapterMutationResult = await chapterMutation.mutationRuntime.invalidateSourceMutation({
        runtimeAssets: chapter2Assets,
        hostMessageId: chapterMutationMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
    });
    assert.equal(chapterMutationResult.ok, true, label);
    assert.equal(chapterMutationResult.status, 'invalidated', label);
    assert.equal(chapterMutation.state.mission.v1.definitionId, chapterDefinition.id, label);
    assert.equal(chapterMutation.state.mission.v1.status, 'active', label);
    assert.equal(chapterMutation.state.mission.v1History.length, 1, label);
    assert.equal(chapterMutation.state.mission.v1History[0].definitionId, preludeDefinition.id, label);
    assert.equal(chapterMutation.state.mission.v1Journey.revision, 1, label);
    assert.equal(JSON.stringify(chapterMutation.state.mission.v1).includes('objective.chapter2.'), false, label);
    assert.equal(chapterMutation.generationCount, 0, `${label} reconstruction cannot call a provider`);
}

for (const [label, initialState] of [
    ['before-open-orders-activation', preOpenOrdersActivationCampaignState],
    ['after-open-orders-activation', openOrdersActivatedCampaignState],
]) {
    const chapter2Mutation = createMutationHarness(initialState);
    const chapter2MutationResult = await chapter2Mutation.mutationRuntime.invalidateSourceMutation({
        runtimeAssets: openOrdersAssets,
        hostMessageId: chapter2MutationMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
    });
    assert.equal(chapter2MutationResult.ok, true, label);
    assert.equal(chapter2MutationResult.status, 'invalidated', label);
    assert.equal(chapter2Mutation.state.mission.v1.definitionId, chapter2Definition.id, label);
    assert.equal(chapter2Mutation.state.mission.v1.status, 'active', label);
    assert.equal(chapter2Mutation.state.mission.v1History.length, 2, label);
    assert.equal(chapter2Mutation.state.mission.v1History[0].definitionId, preludeDefinition.id, label);
    assert.equal(chapter2Mutation.state.mission.v1History[1].definitionId, chapterDefinition.id, label);
    assert.equal(chapter2Mutation.state.mission.v1Journey.revision, 2, label);
    assert.equal(JSON.stringify(chapter2Mutation.state.mission.v1).includes('objective.open-orders1.'), false, label);
    assert.equal(chapter2Mutation.generationCount, 0, `${label} reconstruction cannot call a provider`);
}

for (const [label, initialState] of [
    ['before-dead-letters-activation', preChapter3ActivationCampaignState],
    ['after-dead-letters-activation', chapter3ActivatedCampaignState],
]) {
    const openOrdersMutation = createMutationHarness(initialState);
    const openOrdersMutationResult = await openOrdersMutation.mutationRuntime.invalidateSourceMutation({
        runtimeAssets: chapter3Assets,
        hostMessageId: openOrdersMutationMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
    });
    assert.equal(openOrdersMutationResult.ok, true, label);
    assert.equal(openOrdersMutationResult.status, 'invalidated', label);
    assert.equal(openOrdersMutation.state.mission.v1.definitionId, openOrdersDefinition.id, label);
    assert.equal(openOrdersMutation.state.mission.v1.status, 'active', label);
    assert.equal(openOrdersMutation.state.mission.v1History.length, 3, label);
    assert.equal(openOrdersMutation.state.mission.v1History[0].definitionId, preludeDefinition.id, label);
    assert.equal(openOrdersMutation.state.mission.v1History[1].definitionId, chapterDefinition.id, label);
    assert.equal(openOrdersMutation.state.mission.v1History[2].definitionId, chapter2Definition.id, label);
    assert.equal(openOrdersMutation.state.mission.v1Journey.revision, 3, label);
    assert.equal(JSON.stringify(openOrdersMutation.state.mission.v1).includes('objective.chapter3.'), false, label);
    assert.equal(openOrdersMutation.generationCount, 0, `${label} reconstruction cannot call a provider`);
}

for (const [label, initialState] of [
    ['before-colony-activation', preChapter4ActivationCampaignState],
    ['after-colony-activation', chapter4ActivatedCampaignState],
]) {
    const chapter3Mutation = createMutationHarness(initialState);
    const chapter3MutationResult = await chapter3Mutation.mutationRuntime.invalidateSourceMutation({
        runtimeAssets: chapter4Assets,
        hostMessageId: chapter3MutationMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
    });
    assert.equal(chapter3MutationResult.ok, true, label);
    assert.equal(chapter3MutationResult.status, 'invalidated', label);
    assert.equal(chapter3Mutation.state.mission.v1.definitionId, chapter3Definition.id, label);
    assert.equal(chapter3Mutation.state.mission.v1.status, 'active', label);
    assert.equal(chapter3Mutation.state.mission.v1.terminalDisposition, null, label);
    assert.equal(chapter3Mutation.state.mission.v1.transitionReceipt, null, label);
    assert.equal(chapter3Mutation.state.mission.v1History.length, 4, label);
    assert.equal(chapter3Mutation.state.mission.v1Journey.revision, 4, label);
    assert.equal(JSON.stringify(chapter3Mutation.state.mission.v1).includes('objective.chapter4.'), false, label);
    assert.equal(chapter3Mutation.generationCount, 0, `${label} reconstruction cannot call a provider`);
}

const chapter4Mutation = createMutationHarness(terminalChapter4CampaignState);
const chapter4MutationResult = await chapter4Mutation.mutationRuntime.invalidateSourceMutation({
    runtimeAssets: chapter4Assets,
    hostMessageId: chapter4MutationMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(chapter4MutationResult.ok, true);
assert.equal(chapter4MutationResult.status, 'invalidated');
assert.equal(chapter4Mutation.state.mission.v1.definitionId, chapter4Definition.id);
assert.equal(chapter4Mutation.state.mission.v1.status, 'active');
assert.equal(chapter4Mutation.state.mission.v1.terminalDisposition, null);
assert.equal(chapter4Mutation.state.mission.v1.transitionReceipt, null);
assert.equal(chapter4Mutation.state.mission.v1History.length, 5);
assert.equal(chapter4Mutation.state.mission.v1Journey.revision, 5);
assert.equal(chapter4Mutation.generationCount, 0, 'Colony reconstruction cannot call a provider');

console.log('Ashes V1 Prelude through Colony handoff tests passed.');
