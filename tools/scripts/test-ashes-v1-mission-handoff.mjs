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
const chapter5Definition = readJson('packages/bundled/breckenridge/v1/chapter-5-old-lessons.mission-v1.json');
const openOrders2Definition = readJson('packages/bundled/breckenridge/v1/open-orders-2-what-survives.mission-v1.json');
const chapter6Definition = readJson('packages/bundled/breckenridge/v1/chapter-6-the-cost-of-knowing.mission-v1.json');
const chapter7Definition = readJson('packages/bundled/breckenridge/v1/chapter-7-a-peace-of-their-own.mission-v1.json');
const openOrders3Definition = readJson('packages/bundled/breckenridge/v1/open-orders-3-before-the-lamps-go-out.mission-v1.json');
const preludeScenarios = readJson('tests/fixtures/mission/v1/prelude-hesperus-scenarios.fixture.json');
const chapterScenarios = readJson('tests/fixtures/mission/v1/chapter-1-empty-convoy-scenarios.fixture.json');
const chapter2Scenarios = readJson('tests/fixtures/mission/v1/chapter-2-false-colors-scenarios.fixture.json');
const openOrdersScenarios = readJson('tests/fixtures/mission/v1/open-orders-1-scenarios.fixture.json');
const chapter3Scenarios = readJson('tests/fixtures/mission/v1/chapter-3-dead-letters-scenarios.fixture.json');
const chapter4Scenarios = readJson('tests/fixtures/mission/v1/chapter-4-colony-that-stayed-scenarios.fixture.json');
const chapter5Scenarios = readJson('tests/fixtures/mission/v1/chapter-5-old-lessons-scenarios.fixture.json');
const openOrders2Scenarios = readJson('tests/fixtures/mission/v1/open-orders-2-scenarios.fixture.json');
const chapter6Scenarios = readJson('tests/fixtures/mission/v1/chapter-6-cost-of-knowing-scenarios.fixture.json');
const chapter7Scenarios = readJson('tests/fixtures/mission/v1/chapter-7-peace-of-their-own-scenarios.fixture.json');
const openOrders3Scenarios = readJson('tests/fixtures/mission/v1/open-orders-3-scenarios.fixture.json');
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
    const sourceNamespace = definition.packageBinding.sourceId;
    let state = createMissionState({ definition, branchId });
    for (const [index, step] of steps.entries()) {
        const selectedSwipeId = step.sourceRole === 'assistant' ? `swipe.${sourceNamespace}.${scenarioId}.${index + 1}` : null;
        const source = {
            messageId: `message.${sourceNamespace}.${scenarioId}.${index + 1}`,
            branchId,
            accepted: true,
            selectedSwipeId,
            textHash: createHash('sha256').update(`${sourceNamespace}:${scenarioId}:${index}:${step.claimId}`).digest('hex'),
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
                id: `contribution.${sourceNamespace}.${scenarioId}.${index + 1}`,
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
    const sourceNamespace = definition.packageBinding.sourceId;
    let settlement = createEmptyStorySettlement({ branchId });
    settlement = openStoryEpisode(settlement, {
        episodeId: `episode.${sourceNamespace}.${scenarioId}`,
        sceneId: `scene.${sourceNamespace}.${scenarioId}`,
        references: { missionIds: [definition.id] },
    });
    const contributions = steps.map((step, index) => {
        const selectedSwipeId = step.sourceRole === 'assistant' ? `swipe.${sourceNamespace}.${scenarioId}.${index + 1}` : null;
        return {
            id: `contribution.${sourceNamespace}.${scenarioId}.${index + 1}`,
            messageId: `message.${sourceNamespace}.${scenarioId}.${index + 1}`,
            swipeId: selectedSwipeId,
            role: step.sourceRole,
            textHash: createHash('sha256').update(`${sourceNamespace}:${scenarioId}:${index}:${step.claimId}`).digest('hex'),
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
const chapter5Assets = assetsFor([
    preludeDefinition,
    chapterDefinition,
    chapter2Definition,
    openOrdersDefinition,
    chapter3Definition,
    chapter4Definition,
    chapter5Definition,
]);
const openOrders2Assets = assetsFor([
    preludeDefinition,
    chapterDefinition,
    chapter2Definition,
    openOrdersDefinition,
    chapter3Definition,
    chapter4Definition,
    chapter5Definition,
    openOrders2Definition,
]);
const chapter6Assets = assetsFor([
    preludeDefinition,
    chapterDefinition,
    chapter2Definition,
    openOrdersDefinition,
    chapter3Definition,
    chapter4Definition,
    chapter5Definition,
    openOrders2Definition,
    chapter6Definition,
]);
const chapter7Assets = assetsFor([
    preludeDefinition,
    chapterDefinition,
    chapter2Definition,
    openOrdersDefinition,
    chapter3Definition,
    chapter4Definition,
    chapter5Definition,
    openOrders2Definition,
    chapter6Definition,
    chapter7Definition,
]);
const openOrders3Assets = assetsFor([
    preludeDefinition,
    chapterDefinition,
    chapter2Definition,
    openOrdersDefinition,
    chapter3Definition,
    chapter4Definition,
    chapter5Definition,
    openOrders2Definition,
    chapter6Definition,
    chapter7Definition,
    openOrders3Definition,
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
const preChapter5ActivationCampaignState = structuredClone(campaignState);

const chapter5Ready = runtime.inspectPendingTransition({ runtimeAssets: chapter5Assets });
assert.equal(chapter5Ready.ok, true);
assert.equal(chapter5Ready.status, 'ready');
assert.equal(chapter5Ready.targetDefinitionId, chapter5Definition.id);
assert.equal(chapter5Ready.activatable, true);

const chapter5Activated = await runtime.activatePendingTransition({ runtimeAssets: chapter5Assets });
assert.equal(chapter5Activated.ok, true);
assert.equal(chapter5Activated.status, 'activated');
assert.equal(chapter5Activated.targetDefinitionId, chapter5Definition.id);
assert.equal(chapter5Activated.noChange, false);
assert.equal(persistCount, 6);
assert.equal(campaignState.mission.activeMissionId, chapter5Definition.packageBinding.sourceId);
assert.equal(campaignState.mission.legacyStatus, 'must-remain-untouched');
assert.deepEqual(campaignState.mission.legacyPressure, { id: 'legacy-pressure-must-remain-untouched' });
assert.deepEqual(campaignState.mission.legacyAssignments, [{ id: 'legacy-assignment-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyRewards, [{ id: 'legacy-reward-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyProgress, { id: 'legacy-progress-must-remain-untouched' });
assert.equal(campaignState.mission.v1.definitionId, chapter5Definition.id);
assert.equal(campaignState.mission.v1.status, 'active');
assert.deepEqual(Object.keys(campaignState.mission.v1.objectives), chapter5Definition.objectives.map((item) => item.id));
assert.equal(JSON.stringify(campaignState.mission.v1).includes('objective.chapter4.'), false);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('outcome.chapter4.'), false);
for (const sentinel of ['legacy-pressure-', 'legacy-assignment-', 'legacy-reward-', 'legacy-progress-']) {
    assert.equal(JSON.stringify(campaignState.mission.v1).includes(sentinel), false, `${sentinel} cannot copy into Old Lessons V1`);
}
assert.equal(campaignState.mission.v1History.length, 6);
assert.equal(campaignState.mission.v1History[5].definitionId, chapter4Definition.id);
assert.deepEqual(campaignState.mission.v1History[5].state, terminalChapter4);
assert.equal(campaignState.mission.v1Journey.revision, 6);
assert.deepEqual({
    ship: campaignState.ship,
    relationships: campaignState.relationships,
    questLedger: campaignState.questLedger,
    threadLedger: campaignState.threadLedger,
    commandLog: campaignState.commandLog,
    commandBearing: campaignState.commandBearing,
}, unrelatedBefore, 'Old Lessons activation cannot mutate legacy tracking roots');
const chapter5ActivatedCampaignState = structuredClone(campaignState);

const chapter5Reloaded = JSON.parse(JSON.stringify(campaignState));
const chapter5ReloadedJourney = validateMissionJourney({
    campaignState: chapter5Reloaded,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
        chapter5Definition,
    ],
});
assert.equal(chapter5ReloadedJourney.ok, true, chapter5ReloadedJourney.errors.join('\n'));
assert.equal(validateMissionStateAuthority({ definition: chapter5Definition, state: chapter5Reloaded.mission.v1 }).ok, true);

const chapter5Replay = await runtime.activatePendingTransition({ runtimeAssets: chapter5Assets });
assert.equal(chapter5Replay.ok, true);
assert.equal(chapter5Replay.status, 'no-pending-transition');
assert.equal(chapter5Replay.noChange, true);
assert.equal(persistCount, 6, 'Old Lessons activation replay cannot persist twice');

const terminalChapter5 = settleScenario({
    definition: chapter5Definition,
    fixture: chapter5Scenarios,
    scenarioId: 'multi-front-success',
});
const chapter5Story = storySettlementForScenario(chapter5Scenarios, 'multi-front-success', chapter5Definition);
const chapter5MutationMessageId = chapter5Story.contributions[0].messageId;
campaignState.mission.v1 = terminalChapter5;
campaignState.storySettlement = chapter5Story.settlement;
const openOrders2Journey = validateMissionJourney({
    campaignState,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
        chapter5Definition,
    ],
});
assert.equal(openOrders2Journey.ok, true, openOrders2Journey.errors.join('\n'));
const openOrders2Pending = runtime.inspectPendingTransition({ runtimeAssets: chapter5Assets });
assert.equal(openOrders2Pending.ok, true);
assert.equal(openOrders2Pending.status, 'pending');
assert.equal(openOrders2Pending.reasonCode, 'transition-target-definition-unavailable');
assert.equal(openOrders2Pending.targetDefinitionId, null);
assert.equal(openOrders2Pending.activatable, false);
const terminalChapter5CampaignState = structuredClone(campaignState);
const preOpenOrders2ActivationCampaignState = structuredClone(campaignState);

const openOrders2Ready = runtime.inspectPendingTransition({ runtimeAssets: openOrders2Assets });
assert.equal(openOrders2Ready.ok, true);
assert.equal(openOrders2Ready.status, 'ready');
assert.equal(openOrders2Ready.targetDefinitionId, openOrders2Definition.id);
assert.equal(openOrders2Ready.activatable, true);

const openOrders2Activated = await runtime.activatePendingTransition({ runtimeAssets: openOrders2Assets });
assert.equal(openOrders2Activated.ok, true);
assert.equal(openOrders2Activated.status, 'activated');
assert.equal(openOrders2Activated.targetDefinitionId, openOrders2Definition.id);
assert.equal(openOrders2Activated.noChange, false);
assert.equal(persistCount, 7);
assert.equal(campaignState.mission.activeMissionId, openOrders2Definition.packageBinding.sourceId);
assert.equal(campaignState.mission.legacyStatus, 'must-remain-untouched');
assert.deepEqual(campaignState.mission.legacyPressure, { id: 'legacy-pressure-must-remain-untouched' });
assert.deepEqual(campaignState.mission.legacyAssignments, [{ id: 'legacy-assignment-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyRewards, [{ id: 'legacy-reward-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyProgress, { id: 'legacy-progress-must-remain-untouched' });
assert.equal(campaignState.mission.v1.definitionId, openOrders2Definition.id);
assert.equal(campaignState.mission.v1.status, 'active');
assert.deepEqual(Object.keys(campaignState.mission.v1.objectives), openOrders2Definition.objectives.map((item) => item.id));
assert.equal(JSON.stringify(campaignState.mission.v1).includes('objective.chapter5.'), false);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('outcome.chapter5.'), false);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('fact.current-starfleet-credentials'), false);
for (const sentinel of ['legacy-pressure-', 'legacy-assignment-', 'legacy-reward-', 'legacy-progress-']) {
    assert.equal(JSON.stringify(campaignState.mission.v1).includes(sentinel), false, `${sentinel} cannot copy into Open Orders II V1`);
}
assert.equal(campaignState.mission.v1History.length, 7);
assert.equal(campaignState.mission.v1History[6].definitionId, chapter5Definition.id);
assert.deepEqual(campaignState.mission.v1History[6].state, terminalChapter5);
assert.equal(campaignState.mission.v1Journey.revision, 7);
assert.deepEqual({
    ship: campaignState.ship,
    relationships: campaignState.relationships,
    questLedger: campaignState.questLedger,
    threadLedger: campaignState.threadLedger,
    commandLog: campaignState.commandLog,
    commandBearing: campaignState.commandBearing,
}, unrelatedBefore, 'Open Orders II activation cannot mutate legacy tracking roots');
const openOrders2ActivatedCampaignState = structuredClone(campaignState);

const openOrders2Reloaded = JSON.parse(JSON.stringify(campaignState));
const openOrders2ReloadedJourney = validateMissionJourney({
    campaignState: openOrders2Reloaded,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
        chapter5Definition,
        openOrders2Definition,
    ],
});
assert.equal(openOrders2ReloadedJourney.ok, true, openOrders2ReloadedJourney.errors.join('\n'));
assert.equal(validateMissionStateAuthority({ definition: openOrders2Definition, state: openOrders2Reloaded.mission.v1 }).ok, true);

const openOrders2Replay = await runtime.activatePendingTransition({ runtimeAssets: openOrders2Assets });
assert.equal(openOrders2Replay.ok, true);
assert.equal(openOrders2Replay.status, 'no-pending-transition');
assert.equal(openOrders2Replay.noChange, true);
assert.equal(persistCount, 7, 'Open Orders II activation replay cannot persist twice');

const terminalOpenOrders2 = settleScenario({
    definition: openOrders2Definition,
    fixture: openOrders2Scenarios,
    scenarioId: 'two-assignment-normal',
});
const openOrders2Story = storySettlementForScenario(
    openOrders2Scenarios,
    'two-assignment-normal',
    openOrders2Definition,
);
const openOrders2MutationMessageId = openOrders2Story.contributions[0].messageId;
campaignState.mission.v1 = terminalOpenOrders2;
campaignState.storySettlement = openOrders2Story.settlement;
const chapter6Journey = validateMissionJourney({
    campaignState,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
        chapter5Definition,
        openOrders2Definition,
    ],
});
assert.equal(chapter6Journey.ok, true, chapter6Journey.errors.join('\n'));
const chapter6Pending = runtime.inspectPendingTransition({ runtimeAssets: openOrders2Assets });
assert.equal(chapter6Pending.ok, true);
assert.equal(chapter6Pending.status, 'pending');
assert.equal(chapter6Pending.reasonCode, 'transition-target-definition-unavailable');
assert.equal(chapter6Pending.targetDefinitionId, null);
assert.equal(chapter6Pending.activatable, false);
const terminalOpenOrders2CampaignState = structuredClone(campaignState);

const chapter6Ready = runtime.inspectPendingTransition({ runtimeAssets: chapter6Assets });
assert.equal(chapter6Ready.ok, true);
assert.equal(chapter6Ready.status, 'ready');
assert.equal(chapter6Ready.targetDefinitionId, chapter6Definition.id);
assert.equal(chapter6Ready.activatable, true);

const preChapter6ActivationCampaignState = structuredClone(campaignState);
const chapter6Activated = await runtime.activatePendingTransition({ runtimeAssets: chapter6Assets });
assert.equal(chapter6Activated.ok, true);
assert.equal(chapter6Activated.status, 'activated');
assert.equal(chapter6Activated.targetDefinitionId, chapter6Definition.id);
assert.equal(chapter6Activated.noChange, false);
assert.equal(persistCount, 8);
assert.equal(campaignState.mission.activeMissionId, chapter6Definition.packageBinding.sourceId);
assert.equal(campaignState.mission.legacyStatus, 'must-remain-untouched');
assert.deepEqual(campaignState.mission.legacyPressure, { id: 'legacy-pressure-must-remain-untouched' });
assert.deepEqual(campaignState.mission.legacyAssignments, [{ id: 'legacy-assignment-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyRewards, [{ id: 'legacy-reward-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyProgress, { id: 'legacy-progress-must-remain-untouched' });
assert.equal(campaignState.mission.v1.definitionId, chapter6Definition.id);
assert.equal(campaignState.mission.v1.status, 'active');
assert.deepEqual(Object.keys(campaignState.mission.v1.objectives), chapter6Definition.objectives.map((item) => item.id));
assert.equal(JSON.stringify(campaignState.mission.v1).includes('objective.open-orders2.'), false);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('outcome.open-orders2.'), false);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('fact.current-starfleet-credentials'), false);
for (const sentinel of ['legacy-pressure-', 'legacy-assignment-', 'legacy-reward-', 'legacy-progress-']) {
    assert.equal(JSON.stringify(campaignState.mission.v1).includes(sentinel), false, `${sentinel} cannot copy into Chapter 6 V1`);
}
assert.equal(campaignState.mission.v1History.length, 8);
assert.equal(campaignState.mission.v1History[7].definitionId, openOrders2Definition.id);
assert.deepEqual(campaignState.mission.v1History[7].state, terminalOpenOrders2);
assert.equal(campaignState.mission.v1Journey.revision, 8);
assert.deepEqual({
    ship: campaignState.ship,
    relationships: campaignState.relationships,
    questLedger: campaignState.questLedger,
    threadLedger: campaignState.threadLedger,
    commandLog: campaignState.commandLog,
    commandBearing: campaignState.commandBearing,
}, unrelatedBefore, 'Chapter 6 activation cannot mutate legacy tracking roots');
const chapter6ActivatedCampaignState = structuredClone(campaignState);

const chapter6Reloaded = JSON.parse(JSON.stringify(campaignState));
const chapter6ReloadedJourney = validateMissionJourney({
    campaignState: chapter6Reloaded,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
        chapter5Definition,
        openOrders2Definition,
        chapter6Definition,
    ],
});
assert.equal(chapter6ReloadedJourney.ok, true, chapter6ReloadedJourney.errors.join('\n'));
assert.equal(validateMissionStateAuthority({ definition: chapter6Definition, state: chapter6Reloaded.mission.v1 }).ok, true);

const chapter6Replay = await runtime.activatePendingTransition({ runtimeAssets: chapter6Assets });
assert.equal(chapter6Replay.ok, true);
assert.equal(chapter6Replay.status, 'no-pending-transition');
assert.equal(chapter6Replay.noChange, true);
assert.equal(persistCount, 8, 'Chapter 6 activation replay cannot persist twice');

const terminalChapter6 = settleScenario({
    definition: chapter6Definition,
    fixture: chapter6Scenarios,
    scenarioId: 'accountable-preservation',
});
const chapter6Story = storySettlementForScenario(
    chapter6Scenarios,
    'accountable-preservation',
    chapter6Definition,
);
const chapter6MutationStepIndex = stepsForScenario(
    chapter6Scenarios,
    'accountable-preservation',
).steps.findIndex((step) => step.policyId === 'policy.chapter6.farwatch-account-route');
assert.notEqual(chapter6MutationStepIndex, -1);
const chapter6MutationMessageId = chapter6Story.contributions[chapter6MutationStepIndex].messageId;
campaignState.mission.v1 = terminalChapter6;
campaignState.storySettlement = chapter6Story.settlement;
const chapter7Journey = validateMissionJourney({
    campaignState,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
        chapter5Definition,
        openOrders2Definition,
        chapter6Definition,
    ],
});
assert.equal(chapter7Journey.ok, true, chapter7Journey.errors.join('\n'));
const chapter7Pending = runtime.inspectPendingTransition({ runtimeAssets: chapter6Assets });
assert.equal(chapter7Pending.ok, true);
assert.equal(chapter7Pending.status, 'pending');
assert.equal(chapter7Pending.reasonCode, 'transition-target-definition-unavailable');
assert.equal(chapter7Pending.targetDefinitionId, null);
assert.equal(chapter7Pending.activatable, false);
const terminalChapter6CampaignState = structuredClone(campaignState);

const chapter7Ready = runtime.inspectPendingTransition({ runtimeAssets: chapter7Assets });
assert.equal(chapter7Ready.ok, true);
assert.equal(chapter7Ready.status, 'ready');
assert.equal(chapter7Ready.targetDefinitionId, chapter7Definition.id);
assert.equal(chapter7Ready.activatable, true);

const preChapter7ActivationCampaignState = structuredClone(campaignState);
const chapter7Activated = await runtime.activatePendingTransition({ runtimeAssets: chapter7Assets });
assert.equal(chapter7Activated.ok, true);
assert.equal(chapter7Activated.status, 'activated');
assert.equal(chapter7Activated.targetDefinitionId, chapter7Definition.id);
assert.equal(chapter7Activated.noChange, false);
assert.equal(persistCount, 9);
assert.equal(campaignState.mission.activeMissionId, chapter7Definition.packageBinding.sourceId);
assert.equal(campaignState.mission.legacyStatus, 'must-remain-untouched');
assert.deepEqual(campaignState.mission.legacyPressure, { id: 'legacy-pressure-must-remain-untouched' });
assert.deepEqual(campaignState.mission.legacyAssignments, [{ id: 'legacy-assignment-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyRewards, [{ id: 'legacy-reward-must-remain-untouched' }]);
assert.deepEqual(campaignState.mission.legacyProgress, { id: 'legacy-progress-must-remain-untouched' });
assert.equal(campaignState.mission.v1.definitionId, chapter7Definition.id);
assert.equal(campaignState.mission.v1.status, 'active');
assert.deepEqual(Object.keys(campaignState.mission.v1.objectives), chapter7Definition.objectives.map((item) => item.id));
assert.equal(campaignState.mission.v1.clocks['clock.chapter7.task-group-arrival'].state, 'running');
assert.equal(campaignState.mission.v1.clocks['clock.chapter7.task-group-arrival'].value, 36);
assert.equal(campaignState.mission.v1.clocks['clock.chapter7.task-group-arrival'].visibility, 'visible');
assert.equal(JSON.stringify(campaignState.mission.v1).includes('objective.chapter6.'), false);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('outcome.chapter6.'), false);
for (const sentinel of ['legacy-pressure-', 'legacy-assignment-', 'legacy-reward-', 'legacy-progress-']) {
    assert.equal(JSON.stringify(campaignState.mission.v1).includes(sentinel), false, `${sentinel} cannot copy into Chapter 7 V1`);
}
assert.equal(campaignState.mission.v1History.length, 9);
assert.equal(campaignState.mission.v1History[8].definitionId, chapter6Definition.id);
assert.deepEqual(campaignState.mission.v1History[8].state, terminalChapter6);
assert.equal(campaignState.mission.v1Journey.revision, 9);
assert.deepEqual({
    ship: campaignState.ship,
    relationships: campaignState.relationships,
    questLedger: campaignState.questLedger,
    threadLedger: campaignState.threadLedger,
    commandLog: campaignState.commandLog,
    commandBearing: campaignState.commandBearing,
}, unrelatedBefore, 'Chapter 7 activation cannot mutate legacy tracking roots');
const chapter7ActivatedCampaignState = structuredClone(campaignState);

const chapter7Reloaded = JSON.parse(JSON.stringify(campaignState));
const chapter7ReloadedJourney = validateMissionJourney({
    campaignState: chapter7Reloaded,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
        chapter5Definition,
        openOrders2Definition,
        chapter6Definition,
        chapter7Definition,
    ],
});
assert.equal(chapter7ReloadedJourney.ok, true, chapter7ReloadedJourney.errors.join('\n'));
assert.equal(validateMissionStateAuthority({ definition: chapter7Definition, state: chapter7Reloaded.mission.v1 }).ok, true);

const chapter7Replay = await runtime.activatePendingTransition({ runtimeAssets: chapter7Assets });
assert.equal(chapter7Replay.ok, true);
assert.equal(chapter7Replay.status, 'no-pending-transition');
assert.equal(chapter7Replay.noChange, true);
assert.equal(persistCount, 9, 'Chapter 7 activation replay cannot persist twice');

const terminalChapter7 = settleScenario({
    definition: chapter7Definition,
    fixture: chapter7Scenarios,
    scenarioId: 'provisional-accord-before-deadline',
});
const chapter7Story = storySettlementForScenario(
    chapter7Scenarios,
    'provisional-accord-before-deadline',
    chapter7Definition,
);
const chapter7MutationStepIndex = stepsForScenario(
    chapter7Scenarios,
    'provisional-accord-before-deadline',
).steps.findIndex((step) => step.policyId === 'policy.chapter7.political-account-route');
assert.notEqual(chapter7MutationStepIndex, -1);
const chapter7MutationMessageId = chapter7Story.contributions[chapter7MutationStepIndex].messageId;
campaignState.mission.v1 = terminalChapter7;
campaignState.storySettlement = chapter7Story.settlement;
const openOrders3Journey = validateMissionJourney({
    campaignState,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
        chapter5Definition,
        openOrders2Definition,
        chapter6Definition,
        chapter7Definition,
    ],
});
assert.equal(openOrders3Journey.ok, true, openOrders3Journey.errors.join('\n'));
const openOrders3Pending = runtime.inspectPendingTransition({ runtimeAssets: chapter7Assets });
assert.equal(openOrders3Pending.ok, true);
assert.equal(openOrders3Pending.status, 'pending');
assert.equal(openOrders3Pending.reasonCode, 'transition-target-definition-unavailable');
assert.equal(openOrders3Pending.targetDefinitionId, null);
assert.equal(openOrders3Pending.activatable, false);
const terminalChapter7CampaignState = structuredClone(campaignState);

const openOrders3Ready = runtime.inspectPendingTransition({ runtimeAssets: openOrders3Assets });
assert.equal(openOrders3Ready.ok, true);
assert.equal(openOrders3Ready.status, 'ready');
assert.equal(openOrders3Ready.targetDefinitionId, openOrders3Definition.id);
assert.equal(openOrders3Ready.activatable, true);
const preOpenOrders3ActivationCampaignState = structuredClone(campaignState);

const openOrders3Activated = await runtime.activatePendingTransition({ runtimeAssets: openOrders3Assets });
assert.equal(openOrders3Activated.ok, true);
assert.equal(openOrders3Activated.status, 'activated');
assert.equal(openOrders3Activated.targetDefinitionId, openOrders3Definition.id);
assert.equal(openOrders3Activated.noChange, false);
assert.equal(persistCount, 10);
assert.equal(campaignState.mission.activeMissionId, openOrders3Definition.packageBinding.sourceId);
assert.equal(campaignState.mission.legacyStatus, 'must-remain-untouched');
assert.equal(campaignState.mission.v1.definitionId, openOrders3Definition.id);
assert.equal(campaignState.mission.v1.status, 'active');
assert.deepEqual(
    Object.keys(campaignState.mission.v1.objectives),
    openOrders3Definition.objectives.map((item) => item.id),
);
assert.equal(JSON.stringify(campaignState.mission.v1).includes('objective.chapter7.'), false);
assert.equal(campaignState.mission.v1History.length, 10);
assert.equal(campaignState.mission.v1History[9].definitionId, chapter7Definition.id);
assert.equal(campaignState.mission.v1Journey.revision, 10);
assert.deepEqual({
    ship: campaignState.ship,
    relationships: campaignState.relationships,
    questLedger: campaignState.questLedger,
    threadLedger: campaignState.threadLedger,
    commandLog: campaignState.commandLog,
    commandBearing: campaignState.commandBearing,
}, unrelatedBefore, 'Open Orders III activation cannot mutate legacy tracking roots');
const openOrders3ActivatedCampaignState = structuredClone(campaignState);

const openOrders3Reloaded = JSON.parse(JSON.stringify(campaignState));
const openOrders3ReloadedJourney = validateMissionJourney({
    campaignState: openOrders3Reloaded,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
        chapter5Definition,
        openOrders2Definition,
        chapter6Definition,
        chapter7Definition,
        openOrders3Definition,
    ],
});
assert.equal(openOrders3ReloadedJourney.ok, true, openOrders3ReloadedJourney.errors.join('\n'));
assert.equal(validateMissionStateAuthority({
    definition: openOrders3Definition,
    state: openOrders3Reloaded.mission.v1,
}).ok, true);

const openOrders3Replay = await runtime.activatePendingTransition({ runtimeAssets: openOrders3Assets });
assert.equal(openOrders3Replay.ok, true);
assert.equal(openOrders3Replay.status, 'no-pending-transition');
assert.equal(openOrders3Replay.noChange, true);
assert.equal(persistCount, 10, 'Open Orders III activation replay cannot persist twice');

const terminalOpenOrders3 = settleScenario({
    definition: openOrders3Definition,
    fixture: openOrders3Scenarios,
    scenarioId: 'name-and-signal-normal',
});
const openOrders3Story = storySettlementForScenario(
    openOrders3Scenarios,
    'name-and-signal-normal',
    openOrders3Definition,
);
const openOrders3MutationStepIndex = stepsForScenario(
    openOrders3Scenarios,
    'name-and-signal-normal',
).steps.findIndex((step) => step.policyId === 'policy.open-orders3.signal-assessment-disclosed');
assert.notEqual(openOrders3MutationStepIndex, -1);
const openOrders3MutationMessageId = openOrders3Story.contributions[openOrders3MutationStepIndex].messageId;
campaignState.mission.v1 = terminalOpenOrders3;
campaignState.storySettlement = openOrders3Story.settlement;
const chapter8Journey = validateMissionJourney({
    campaignState,
    definitions: [
        preludeDefinition,
        chapterDefinition,
        chapter2Definition,
        openOrdersDefinition,
        chapter3Definition,
        chapter4Definition,
        chapter5Definition,
        openOrders2Definition,
        chapter6Definition,
        chapter7Definition,
        openOrders3Definition,
    ],
});
assert.equal(chapter8Journey.ok, true, chapter8Journey.errors.join('\n'));
const chapter8Pending = runtime.inspectPendingTransition({ runtimeAssets: openOrders3Assets });
assert.equal(chapter8Pending.ok, true);
assert.equal(chapter8Pending.status, 'pending');
assert.equal(chapter8Pending.reasonCode, 'transition-target-definition-unavailable');
assert.equal(chapter8Pending.targetDefinitionId, null);
assert.equal(chapter8Pending.activatable, false);
const terminalOpenOrders3CampaignState = structuredClone(campaignState);

const journeyContributionIds = [
    ...terminalOpenOrders3CampaignState.mission.v1History.flatMap((archive) => (
        archive.state.evidenceLog.map((entry) => entry.sourceContributionId)
    )),
    ...terminalOpenOrders3CampaignState.mission.v1.evidenceLog.map((entry) => entry.sourceContributionId),
];
assert.equal(
    new Set(journeyContributionIds).size,
    journeyContributionIds.length,
    'accepted source contribution identity remains unique across the eleven-entry journey',
);

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

for (const [label, initialState] of [
    ['before-old-lessons-activation', preChapter5ActivationCampaignState],
    ['after-old-lessons-activation', chapter5ActivatedCampaignState],
]) {
    const chapter4Mutation = createMutationHarness(initialState);
    const chapter4MutationResult = await chapter4Mutation.mutationRuntime.invalidateSourceMutation({
        runtimeAssets: chapter5Assets,
        hostMessageId: chapter4MutationMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
    });
    assert.equal(chapter4MutationResult.ok, true, label);
    assert.equal(chapter4MutationResult.status, 'invalidated', label);
    assert.equal(chapter4Mutation.state.mission.v1.definitionId, chapter4Definition.id, label);
    assert.equal(chapter4Mutation.state.mission.v1.status, 'active', label);
    assert.equal(chapter4Mutation.state.mission.v1.terminalDisposition, null, label);
    assert.equal(chapter4Mutation.state.mission.v1.transitionReceipt, null, label);
    assert.equal(chapter4Mutation.state.mission.v1History.length, 5, label);
    assert.equal(chapter4Mutation.state.mission.v1Journey.revision, 5, label);
    assert.equal(JSON.stringify(chapter4Mutation.state.mission.v1).includes('objective.chapter5.'), false, label);
    assert.equal(chapter4Mutation.generationCount, 0, `${label} reconstruction cannot call a provider`);
}

for (const [label, initialState] of [
    ['before-open-orders2-activation', preOpenOrders2ActivationCampaignState],
    ['after-open-orders2-activation', openOrders2ActivatedCampaignState],
]) {
    const chapter5Mutation = createMutationHarness(initialState);
    const chapter5MutationResult = await chapter5Mutation.mutationRuntime.invalidateSourceMutation({
        runtimeAssets: openOrders2Assets,
        hostMessageId: chapter5MutationMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
    });
    assert.equal(chapter5MutationResult.ok, true, label);
    assert.equal(chapter5MutationResult.status, 'invalidated', label);
    assert.equal(chapter5Mutation.state.mission.v1.definitionId, chapter5Definition.id, label);
    assert.equal(chapter5Mutation.state.mission.v1.status, 'active', label);
    assert.equal(chapter5Mutation.state.mission.v1.terminalDisposition, null, label);
    assert.equal(chapter5Mutation.state.mission.v1.transitionReceipt, null, label);
    assert.equal(chapter5Mutation.state.mission.v1History.length, 6, label);
    assert.equal(chapter5Mutation.state.mission.v1Journey.revision, 6, label);
    assert.equal(JSON.stringify(chapter5Mutation.state.mission.v1).includes('objective.open-orders2.'), false, label);
    assert.equal(chapter5Mutation.generationCount, 0, `${label} reconstruction cannot call a provider`);
}

for (const [label, initialState] of [
    ['before-chapter6-activation', preChapter6ActivationCampaignState],
    ['after-chapter6-activation', chapter6ActivatedCampaignState],
]) {
    const openOrders2TransitionMutation = createMutationHarness(initialState);
    const openOrders2TransitionMutationResult = await openOrders2TransitionMutation.mutationRuntime.invalidateSourceMutation({
        runtimeAssets: chapter6Assets,
        hostMessageId: openOrders2MutationMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
    });
    assert.equal(openOrders2TransitionMutationResult.ok, true, label);
    assert.equal(openOrders2TransitionMutationResult.status, 'invalidated', label);
    assert.equal(openOrders2TransitionMutation.state.mission.v1.definitionId, openOrders2Definition.id, label);
    assert.equal(openOrders2TransitionMutation.state.mission.v1.status, 'active', label);
    assert.equal(openOrders2TransitionMutation.state.mission.v1.terminalDisposition, null, label);
    assert.equal(openOrders2TransitionMutation.state.mission.v1.transitionReceipt, null, label);
    assert.equal(openOrders2TransitionMutation.state.mission.v1History.length, 7, label);
    assert.equal(openOrders2TransitionMutation.state.mission.v1Journey.revision, 7, label);
    assert.equal(JSON.stringify(openOrders2TransitionMutation.state.mission.v1).includes('objective.chapter6.'), false, label);
    assert.equal(openOrders2TransitionMutation.generationCount, 0, `${label} reconstruction cannot call a provider`);
}

for (const [label, initialState] of [
    ['before-chapter7-activation', preChapter7ActivationCampaignState],
    ['after-chapter7-activation', chapter7ActivatedCampaignState],
]) {
    const chapter6TransitionMutation = createMutationHarness(initialState);
    const chapter6TransitionMutationResult = await chapter6TransitionMutation.mutationRuntime.invalidateSourceMutation({
        runtimeAssets: chapter7Assets,
        hostMessageId: chapter6MutationMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
    });
    assert.equal(chapter6TransitionMutationResult.ok, true, label);
    assert.equal(chapter6TransitionMutationResult.status, 'invalidated', label);
    assert.equal(chapter6TransitionMutation.state.mission.v1.definitionId, chapter6Definition.id, label);
    assert.equal(chapter6TransitionMutation.state.mission.v1.status, 'active', label);
    assert.equal(chapter6TransitionMutation.state.mission.v1.terminalDisposition, null, label);
    assert.equal(chapter6TransitionMutation.state.mission.v1.transitionReceipt, null, label);
    assert.equal(chapter6TransitionMutation.state.mission.v1History.length, 8, label);
    assert.equal(chapter6TransitionMutation.state.mission.v1Journey.revision, 8, label);
    assert.equal(JSON.stringify(chapter6TransitionMutation.state.mission.v1).includes('objective.chapter7.'), false, label);
    assert.equal(chapter6TransitionMutation.generationCount, 0, `${label} reconstruction cannot call a provider`);
}

for (const [label, initialState] of [
    ['before-open-orders3-activation', preOpenOrders3ActivationCampaignState],
    ['after-open-orders3-activation', openOrders3ActivatedCampaignState],
]) {
    const chapter7TransitionMutation = createMutationHarness(initialState);
    const chapter7TransitionMutationResult = await chapter7TransitionMutation.mutationRuntime.invalidateSourceMutation({
        runtimeAssets: openOrders3Assets,
        hostMessageId: chapter7MutationMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
    });
    assert.equal(chapter7TransitionMutationResult.ok, true, label);
    assert.equal(chapter7TransitionMutationResult.status, 'invalidated', label);
    assert.equal(chapter7TransitionMutation.state.mission.v1.definitionId, chapter7Definition.id, label);
    assert.equal(chapter7TransitionMutation.state.mission.v1.status, 'active', label);
    assert.equal(chapter7TransitionMutation.state.mission.v1.terminalDisposition, null, label);
    assert.equal(chapter7TransitionMutation.state.mission.v1.transitionReceipt, null, label);
    assert.equal(chapter7TransitionMutation.state.mission.v1History.length, 9, label);
    assert.equal(chapter7TransitionMutation.state.mission.v1Journey.revision, 9, label);
    assert.equal(JSON.stringify(chapter7TransitionMutation.state.mission.v1).includes('objective.open-orders3.'), false, label);
    assert.equal(chapter7TransitionMutation.generationCount, 0, `${label} reconstruction cannot call a provider`);
}

const openOrders2Mutation = createMutationHarness(terminalOpenOrders2CampaignState);
const openOrders2MutationResult = await openOrders2Mutation.mutationRuntime.invalidateSourceMutation({
    runtimeAssets: openOrders2Assets,
    hostMessageId: openOrders2MutationMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(openOrders2MutationResult.ok, true);
assert.equal(openOrders2MutationResult.status, 'invalidated');
assert.equal(openOrders2Mutation.state.mission.v1.definitionId, openOrders2Definition.id);
assert.equal(openOrders2Mutation.state.mission.v1.status, 'active');
assert.equal(openOrders2Mutation.state.mission.v1.terminalDisposition, null);
assert.equal(openOrders2Mutation.state.mission.v1.transitionReceipt, null);
assert.equal(openOrders2Mutation.state.mission.v1History.length, 7);
assert.equal(openOrders2Mutation.state.mission.v1Journey.revision, 7);
assert.equal(openOrders2Mutation.generationCount, 0, 'Open Orders II reconstruction cannot call a provider');

const chapter6Mutation = createMutationHarness(terminalChapter6CampaignState);
const chapter6MutationResult = await chapter6Mutation.mutationRuntime.invalidateSourceMutation({
    runtimeAssets: chapter6Assets,
    hostMessageId: chapter6MutationMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(chapter6MutationResult.ok, true);
assert.equal(chapter6MutationResult.status, 'invalidated');
assert.equal(chapter6Mutation.state.mission.v1.definitionId, chapter6Definition.id);
assert.equal(chapter6Mutation.state.mission.v1.status, 'active');
assert.equal(chapter6Mutation.state.mission.v1.terminalDisposition, null);
assert.equal(chapter6Mutation.state.mission.v1.transitionReceipt, null);
assert.equal(chapter6Mutation.state.mission.v1History.length, 8);
assert.equal(chapter6Mutation.state.mission.v1Journey.revision, 8);
assert.equal(chapter6Mutation.generationCount, 0, 'Chapter 6 reconstruction cannot call a provider');

const chapter7Mutation = createMutationHarness(terminalChapter7CampaignState);
const chapter7MutationResult = await chapter7Mutation.mutationRuntime.invalidateSourceMutation({
    runtimeAssets: chapter7Assets,
    hostMessageId: chapter7MutationMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(chapter7MutationResult.ok, true);
assert.equal(chapter7MutationResult.status, 'invalidated');
assert.equal(chapter7Mutation.state.mission.v1.definitionId, chapter7Definition.id);
assert.equal(chapter7Mutation.state.mission.v1.status, 'active');
assert.equal(chapter7Mutation.state.mission.v1.terminalDisposition, null);
assert.equal(chapter7Mutation.state.mission.v1.transitionReceipt, null);
assert.equal(chapter7Mutation.state.mission.v1History.length, 9);
assert.equal(chapter7Mutation.state.mission.v1Journey.revision, 9);
assert.equal(chapter7Mutation.generationCount, 0, 'Chapter 7 reconstruction cannot call a provider');

const openOrders3Mutation = createMutationHarness(terminalOpenOrders3CampaignState);
const openOrders3MutationResult = await openOrders3Mutation.mutationRuntime.invalidateSourceMutation({
    runtimeAssets: openOrders3Assets,
    hostMessageId: openOrders3MutationMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(openOrders3MutationResult.ok, true);
assert.equal(openOrders3MutationResult.status, 'invalidated');
assert.equal(openOrders3Mutation.state.mission.v1.definitionId, openOrders3Definition.id);
assert.equal(openOrders3Mutation.state.mission.v1.status, 'active');
assert.equal(openOrders3Mutation.state.mission.v1.terminalDisposition, null);
assert.equal(openOrders3Mutation.state.mission.v1.transitionReceipt, null);
assert.equal(openOrders3Mutation.state.mission.v1History.length, 10);
assert.equal(openOrders3Mutation.state.mission.v1Journey.revision, 10);
assert.equal(openOrders3Mutation.state.mission.v1.knownFacts.includes('fact.open-orders3.signal-assessment'), false);
assert.equal(openOrders3Mutation.state.mission.v1.outcomes['outcome.open-orders3.signal-result'], 'pending');
assert.equal(openOrders3Mutation.generationCount, 0, 'Open Orders III reconstruction cannot call a provider');

console.log('Ashes V1 Prelude through Open Orders III handoff tests passed.');
