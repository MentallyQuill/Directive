import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { deliveredDutyReportIds } from '../../src/mission/v1/duty-report-planner.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createV1PlayerProjection } from '../../src/projection/v1/player-projection.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const canonicalDefinition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));

function assetsFor(definition) {
    const record = { path: 'prelude.mission-v1.json', definition };
    return {
        packageData: {
            manifest: {
                id: definition.packageBinding.packageId,
                version: definition.packageBinding.packageVersion,
            },
        },
        missionDefinitions: [record],
        missionDefinitionsById: new Map([[definition.id, record]]),
    };
}

function definitionFor(reportId) {
    const definition = structuredClone(canonicalDefinition);
    const distress = definition.facts.find((fact) => fact.id === 'fact.hesperus.distress-established');
    distress.initiallyTrue = true;
    if (reportId === 'report.hesperus.passenger-risk') distress.visibility = 'known';
    return definition;
}

function stateFor(definition) {
    return {
        campaign: { id: 'campaign.ashes' },
        activeCampaignPackage: {
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
        },
        campaignChatBinding: { saveId: 'save.report', chatId: 'chat.report' },
        mission: {
            activeMissionId: definition.packageBinding.sourceId,
            v1: createMissionState({ definition, branchId: 'save.report' }),
        },
        ship: { technicalDebt: [{ id: 'legacy.ship-sentinel' }] },
        relationships: { people: [{ id: 'legacy.relationship-sentinel' }] },
        threadLedger: { records: [{ id: 'legacy.thread-sentinel' }] },
        quests: [{ id: 'legacy.quest-sentinel' }],
        commandLog: { entries: [{ id: 'legacy.command-sentinel' }] },
        commandBearing: { current: 3 },
    };
}

function acceptedInterpretation(assistantAcceptance = 'accepted') {
    return JSON.stringify({
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance,
        claims: [],
        abstained: true,
    });
}

function createHarness({ definition, state = stateFor(definition), outputs = [], persistError = null } = {}) {
    let campaignState = structuredClone(state);
    let generationIndex = 0;
    let persistCount = 0;
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => {
            persistCount += 1;
            if (persistError) throw persistError;
        },
        now: () => '2026-08-09T20:00:00.000Z',
    });
    const runtime = createV1MissionRuntime({
        getState: () => campaignState,
        stateDeltaGateway: gateway,
        generationRouter: {
            async generate() {
                const output = outputs[generationIndex] ?? outputs.at(-1);
                generationIndex += 1;
                if (output instanceof Error) throw output;
                return { ok: true, response: { text: output || '' } };
            },
        },
        now: () => '2026-08-09T20:00:00.000Z',
    });
    return {
        runtime,
        gateway,
        get campaignState() { return campaignState; },
        get generationCount() { return generationIndex; },
        get persistCount() { return persistCount; },
    };
}

const actors = {
    'report.hesperus.distress': [{ id: 'priya-nayar', capabilityRoles: ['operations'] }],
    'report.hesperus.passenger-risk': [{ id: 'miriam-sato', capabilityRoles: ['medical'] }],
};

function prepare(harness, runtimeAssets, reportId, suffix = '1') {
    return harness.runtime.preparePendingDutyReport({
        runtimeAssets,
        availableActors: actors[reportId],
        responseId: `response.report.${suffix}`,
        sourceTransactionId: `transaction.report.${suffix}`,
    });
}

function unrelatedTrackingRoots(state) {
    return structuredClone({
        ship: state.ship,
        relationships: state.relationships,
        threadLedger: state.threadLedger,
        quests: state.quests,
        commandLog: state.commandLog,
        commandBearing: state.commandBearing,
    });
}

function snapshotFor({ preparation, definition, suffix = '1' }) {
    const responseText = `The officer steps forward. ${preparation.segment.canonicalText} The bridge waits.`;
    const manifest = createDutyReportManifest({
        definition,
        packet: preparation.packet,
        branchId: preparation.manifestInput.branchId,
        responseId: preparation.manifestInput.responseId,
        sourceTransactionId: preparation.manifestInput.sourceTransactionId,
        responseText,
        segment: preparation.segment,
    });
    return {
        manifest,
        snapshot: {
            kind: 'directive.sceneHandshakeSnapshot.v1',
            envelope: {
                campaignId: 'campaign.ashes',
                saveId: 'save.report',
                chatId: 'chat.report',
                packageId: definition.packageBinding.packageId,
                packageVersion: definition.packageBinding.packageVersion,
                activeMissionId: definition.packageBinding.sourceId,
            },
            source: {
                sourceRangeHash: `range.report.${suffix}`,
                previousAssistant: {
                    hostMessageId: `message.assistant.report.${suffix}`,
                    text: responseText,
                    textHash: 'a1b2c3d4',
                    sourceIntegrity: 'clean',
                    selectedVariantId: '0',
                    selectedVariant: {
                        selectedVariantId: '0',
                        selectedSwipeId: '0',
                        selectedSwipeIndex: 0,
                        selectedTextHash: 'a1b2c3d4',
                        sourceIntegrity: 'clean',
                        responseId: preparation.manifestInput.responseId,
                        directiveOwned: true,
                        dutyReportCustodyOwned: true,
                        dutyReportManifest: manifest,
                    },
                },
                currentPlayer: {
                    hostMessageId: `message.player.report.${suffix}`,
                    text: 'Understood. Proceed.',
                    textHash: 'd4c3b2a1',
                },
            },
        },
    };
}

for (const reportId of ['report.hesperus.distress', 'report.hesperus.passenger-risk']) {
    const definition = definitionFor(reportId);
    const runtimeAssets = assetsFor(definition);
    const harness = createHarness({ definition, outputs: [acceptedInterpretation()] });
    const stateBeforePreparation = structuredClone(harness.campaignState);
    const unrelatedBefore = unrelatedTrackingRoots(harness.campaignState);
    const preparation = prepare(harness, runtimeAssets, reportId, reportId.split('.').at(-1));
    assert.equal(preparation.ok, true, reportId);
    assert.equal(preparation.status, 'ready', reportId);
    assert.equal(preparation.packet.reportId, reportId);
    assert.equal(preparation.segment.reportId, reportId);
    assert.equal(JSON.stringify(preparation).includes('fact.hesperus.record-falsified'), false);
    assert.equal(JSON.stringify(preparation).includes('objective.prelude.hesperus-accountability'), false);
    assert.equal(JSON.stringify(preparation).includes('directorText'), false);
    assert.deepEqual(harness.campaignState, stateBeforePreparation, `${reportId}: preparation is pure`);
    assert.equal(harness.persistCount, 0, `${reportId}: preparation does not persist`);
    assert.equal(harness.generationCount, 0, `${reportId}: preparation does not invoke a model`);

    const provisional = snapshotFor({
        preparation,
        definition,
        suffix: reportId.split('.').at(-1),
    });
    assert.deepEqual(
        deliveredDutyReportIds({ definition, state: harness.campaignState.mission.v1 }),
        [],
        `${reportId}: a generated and posted provisional manifest is not delivery`,
    );
    const restartedBeforeAcceptance = createHarness({
        definition,
        state: JSON.parse(JSON.stringify(harness.campaignState)),
    });
    assert.equal(
        prepare(restartedBeforeAcceptance, runtimeAssets, reportId, 'restart').packet.reportId,
        reportId,
        `${reportId}: restart before acceptance does not suppress delivery`,
    );

    const settled = await harness.runtime.settleAcceptedPair({
        runtimeAssets,
        snapshot: provisional.snapshot,
    });
    assert.equal(settled.ok, true, `${reportId}: ${JSON.stringify(settled)}`);
    assert.equal(settled.diagnostics.acceptedDutyReportCount, 1, reportId);
    assert.deepEqual(
        unrelatedTrackingRoots(harness.campaignState),
        unrelatedBefore,
        `${reportId}: delivery does not create ship, relationship, quest, log, or Command Bearing tracking spam`,
    );
    assert.deepEqual(
        deliveredDutyReportIds({ definition, state: harness.campaignState.mission.v1 }),
        [reportId],
        reportId,
    );
    assert.equal(
        prepare(harness, runtimeAssets, reportId, 'after-acceptance').status,
        'no-pending-report',
        `${reportId}: only settled evidence suppresses the delivered route`,
    );
    const projectionBeforeMutation = createV1PlayerProjection({
        campaignState: harness.campaignState,
        runtimeAssets,
        definition,
    });
    if (reportId === 'report.hesperus.distress') {
        assert.equal(
            projectionBeforeMutation.mission.objectives.some((item) => item.id === 'objective.prelude.hesperus-rescue'),
            true,
        );
    } else {
        assert.equal(projectionBeforeMutation.mission.clocks.some((item) => item.id === 'clock.hesperus-life-support'), true);
    }

    const invalidated = await harness.runtime.invalidateSourceMutation({
        runtimeAssets,
        hostMessageId: provisional.snapshot.source.previousAssistant.hostMessageId,
        eventType: reportId === 'report.hesperus.distress'
            ? 'directiveResponseSelectedSwipeChanged'
            : 'directiveResponseDeleted',
    });
    assert.equal(invalidated.status, 'invalidated', reportId);
    assert.equal(harness.campaignState.mission.v1.knownFacts.includes(preparation.packet.factId), false, reportId);
    assert.equal(harness.campaignState.mission.v1.evidenceLog.some((entry) => entry.delivery?.reportId === reportId), false, reportId);
    assert.equal(
        harness.campaignState.storySettlement.episodes.flatMap((episode) => episode.effects)
            .some((effect) => effect.targetId === preparation.packet.factId),
        false,
        `${reportId}: the source-owned story effect is removed`,
    );
    const projectionAfterMutation = createV1PlayerProjection({
        campaignState: harness.campaignState,
        runtimeAssets,
        definition,
    });
    if (reportId === 'report.hesperus.distress') {
        assert.equal(
            projectionAfterMutation.mission.objectives.some((item) => item.id === 'objective.prelude.hesperus-rescue'),
            false,
        );
    } else {
        assert.equal(projectionAfterMutation.mission.clocks.some((item) => item.id === 'clock.hesperus-life-support'), false);
    }
    assert.equal(prepare(harness, runtimeAssets, reportId, 'eligible-again').packet.reportId, reportId);
    assert.deepEqual(unrelatedTrackingRoots(harness.campaignState), unrelatedBefore, `${reportId}: repair stays scoped`);
}

const rejectedDefinition = definitionFor('report.hesperus.distress');
const rejectedAssets = assetsFor(rejectedDefinition);
const rejectedHarness = createHarness({ definition: rejectedDefinition, outputs: [acceptedInterpretation('rejected')] });
const rejectedPreparation = prepare(rejectedHarness, rejectedAssets, 'report.hesperus.distress', 'rejected');
const rejectedSource = snapshotFor({
    preparation: rejectedPreparation,
    definition: rejectedDefinition,
    suffix: 'rejected',
});
const rejected = await rejectedHarness.runtime.settleAcceptedPair({
    runtimeAssets: rejectedAssets,
    snapshot: rejectedSource.snapshot,
});
assert.equal(rejected.diagnostics.acceptedDutyReportCount, 0);
assert.equal(prepare(rejectedHarness, rejectedAssets, 'report.hesperus.distress', 'after-reject').packet.reportId, 'report.hesperus.distress');

const failedHarness = createHarness({ definition: rejectedDefinition, outputs: [new Error('SECRET REPORT PROVIDER FAILURE')] });
const failedPreparation = prepare(failedHarness, rejectedAssets, 'report.hesperus.distress', 'provider-failure');
const failedSource = snapshotFor({
    preparation: failedPreparation,
    definition: rejectedDefinition,
    suffix: 'provider-failure',
});
const failed = await failedHarness.runtime.settleAcceptedPair({
    runtimeAssets: rejectedAssets,
    snapshot: failedSource.snapshot,
});
assert.equal(failed.ok, false);
assert.equal(JSON.stringify(failed).includes('SECRET REPORT PROVIDER FAILURE'), false);
assert.equal(prepare(failedHarness, rejectedAssets, 'report.hesperus.distress', 'after-failure').packet.reportId, 'report.hesperus.distress');

const persistenceHarness = createHarness({
    definition: rejectedDefinition,
    outputs: [acceptedInterpretation()],
    persistError: new Error('SECRET REPORT PERSISTENCE FAILURE'),
});
const persistenceBefore = structuredClone(persistenceHarness.campaignState);
const persistencePreparation = prepare(
    persistenceHarness,
    rejectedAssets,
    'report.hesperus.distress',
    'persistence-failure',
);
const persistenceSource = snapshotFor({
    preparation: persistencePreparation,
    definition: rejectedDefinition,
    suffix: 'persistence-failure',
});
const persistenceFailure = await persistenceHarness.runtime.settleAcceptedPair({
    runtimeAssets: rejectedAssets,
    snapshot: persistenceSource.snapshot,
});
assert.equal(persistenceFailure.ok, false);
assert.equal(JSON.stringify(persistenceFailure).includes('SECRET REPORT PERSISTENCE FAILURE'), false);
assert.deepEqual(persistenceHarness.campaignState, persistenceBefore, 'failed persistence rolls report state back');
assert.equal(
    prepare(persistenceHarness, rejectedAssets, 'report.hesperus.distress', 'after-persistence-failure').packet.reportId,
    'report.hesperus.distress',
);

const forgedState = stateFor(rejectedDefinition);
forgedState.mission.v1.evidenceLog.push({
    claimId: 'claim.forged-report',
    policyId: 'policy.hesperus.distress-disclosed',
    claimType: 'factDisclosed',
    targetId: 'fact.hesperus.distress-established',
    sourceRef: { messageId: 'message.forged', swipeId: '0', textHash: 'a1b2c3d4' },
    sourceContributionId: 'contribution.forged',
    acceptedAtMissionRevision: 1,
});
const forgedHarness = createHarness({ definition: rejectedDefinition, state: forgedState });
const forgedPreparation = prepare(forgedHarness, rejectedAssets, 'report.hesperus.distress', 'forged-state');
assert.equal(forgedPreparation.ok, false);
assert.equal(forgedPreparation.reasonCode, 'mission-state-invalid');

console.log('V1 Duty Report runtime mutation and preparation tests passed.');
