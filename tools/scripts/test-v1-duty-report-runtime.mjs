import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

import { createDutyReportManifest, createDutyReportVisibleSegment, validateDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { deliveredDutyReportIds } from '../../src/mission/v1/duty-report-planner.mjs';
import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { validateMissionStateAuthority } from '../../src/mission/v1/mission-state-authority.mjs';
import { createV1PlayerProjection } from '../../src/projection/v1/player-projection.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const canonicalDefinition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
    'utf8',
));

function assetsFor(definition) {
    const record = { path: 'prelude.mission-v1.json', definition };
    return {
        ...loadAshesRuntimeAssets(),
        missionDefinitions: [record],
        missionDefinitionsById: new Map([[definition.id, record]]),
    };
}

function definitionFor(reportId) {
    const definition = structuredClone(canonicalDefinition);
    const distress = definition.facts.find((fact) => fact.id === 'fact.hesperus.distress-established');
    distress.initiallyTrue = true;
    // Transport/custody fixture: an authored immediate interruption. Canonical
    // scene sequencing is exercised in test-scene-pacing-runtime.mjs.
    definition.reportRoutes.forEach(route=>{route.sceneInterruptWhen=true;});
    if (reportId === 'report.hesperus.passenger-risk') distress.visibility = 'known';
    return definition;
}

function stateFor(definition) {
    const branchId = 'save.report';
    const journey = createInitialMissionJourney({ branchId, definition });
    const state = createAshesInitialState({
        campaignId: 'campaign.ashes',
        saveId: branchId,
        chatId: 'chat.report',
    });
    state.mission = {
            activeMissionId: definition.packageBinding.sourceId,
            v1: createMissionState({ definition, branchId }),
            v1Journey: journey.journey,
            v1History: journey.history,
    };
    state.commandBearing.balance = 3;
    return state;
}

function acceptedInterpretation(assistantAcceptance = 'accepted', claims = []) {
    return JSON.stringify({
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance,
        claims,
        abstained: claims.length === 0,
        time: { decision: 'unchanged', basis: 'noPassage', elapsedSeconds: 0, reason: 'same-second', confidence: 0.9 },
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

function protectedStateRoots(state) {
    return structuredClone({
        ship: state.ship,
        commandBearing: state.commandBearing,
    });
}

function snapshotFor({ preparation, definition, suffix = '1', extraText = '' }) {
    const responseText = `The officer steps forward. ${preparation.segment.canonicalText} The bridge waits.${extraText ? ` ${extraText}` : ''}`;
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
            kind: 'directive.acceptedPairSnapshot.v1',
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

const historical = JSON.parse(fs.readFileSync('tools/scripts/fixtures/duty-report-v1-settled.json', 'utf8'));
for (const item of historical.cases) {
    const definition = definitionFor(item.reportId);
    assert.equal(createHash('sha256').update(JSON.stringify(definition)).digest('hex'), item.definitionHash,
        'historical fixture binds the exact baseline authored definition');
    const runtimeAssets = assetsFor(definition);
    assert.equal(validateMissionStateAuthority({ definition, state: item.state.mission.v1 }).ok, true);
    const harness = createHarness({ definition, state: JSON.parse(JSON.stringify(item.state)),
        outputs: [new Error('historical replay must not call a provider')] });
    const replay = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: item.snapshot });
    assert.equal(replay.status, 'already-settled');
    assert.equal(harness.generationCount, 0);
    assert.equal(harness.persistCount, 0);
    assert.deepEqual(harness.campaignState, item.state, 'old inadequate V1 accepted authority is preserved exactly');
    assert.deepEqual(deliveredDutyReportIds({ definition, state: harness.campaignState.mission.v1 }), [item.reportId]);
}

// Historical V1 envelopes remain recognizable, but a notice announcing a report
// cannot create new authority for the substance that it did not communicate.
for (const [metadataMode, expectedReason] of [
    ['legacy', 'legacy-report-substance-required'], ['invalid', 'manifest-invalid'],
    ['unsupported', 'manifest-version-unsupported'], ['absent', null],
]) {
  for (const alias of [false, true]) {
    const reportId = 'report.hesperus.distress';
    const definition = definitionFor(reportId);
    definition.reportRoutes.find(route => route.id === reportId).deliveryRequirement = 'optional';
    const candidateId = alias ? 'policy.hesperus.distress-disclosed-alias' : 'policy.hesperus.distress-disclosed';
    if (alias) definition.evidencePolicies.push({
        ...structuredClone(definition.evidencePolicies.find(policy => policy.id === 'policy.hesperus.distress-disclosed')),
        id: candidateId,
    });
    const runtimeAssets = assetsFor(definition);
    const harness = createHarness({ definition, outputs: [acceptedInterpretation('accepted', [{
        candidateId, sourceSlot: 'previousAssistant',
        evidenceQuote: 'The officer steps forward.',
    }])] });
    const preparation = prepare(harness, runtimeAssets, reportId, metadataMode);
    preparation.segment = createDutyReportVisibleSegment(preparation.packet, { contractVersion: 1 });
    const provisional = snapshotFor({ preparation, definition, suffix: metadataMode });
    const variant = provisional.snapshot.source.previousAssistant.selectedVariant;
    if (metadataMode !== 'legacy') {
        variant.dutyReportManifest = null;
        variant.dutyReportCustodyOwned = false;
        variant.dutyReportManifestStatus = metadataMode;
    }
    const result = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: provisional.snapshot });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(harness.generationCount, 1, 'the actual interpreter candidate is valid without a repair pass');
    assert.equal(result.diagnostics.rejectedDutyReportReasonCode, expectedReason, metadataMode);
    assert.equal(harness.campaignState.mission.v1.knownFacts.includes(preparation.packet.factId), metadataMode === 'absent',
        `${metadataMode}/${candidateId}: only ordinary metadata-absent optional prose may disclose without typed report custody`);
  }
}

for (const reportId of ['report.hesperus.distress', 'report.hesperus.passenger-risk']) {
    const definition = definitionFor(reportId);
    const runtimeAssets = assetsFor(definition);
    const harness = createHarness({ definition, outputs: [acceptedInterpretation()] });
    const preparation = prepare(harness, runtimeAssets, reportId, 'legacy');
    preparation.segment = createDutyReportVisibleSegment(preparation.packet, { contractVersion: 1 });
    const provisional = snapshotFor({ preparation, definition, suffix: 'legacy' });
    const previous = provisional.snapshot.source.previousAssistant;
    assert.equal(validateDutyReportManifest({ definition, manifest: provisional.manifest,
        branchId: 'save.report', responseId: previous.selectedVariant.responseId, responseText: previous.text }).ok, true);
    const settled = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: provisional.snapshot });
    assert.equal(settled.ok, true);
    assert.equal(settled.diagnostics.acceptedDutyReportCount, 0, `${reportId}: V1 notice is not substantive disclosure`);
    assert.equal(settled.diagnostics.rejectedDutyReportReasonCode, 'legacy-report-substance-required');
    assert.equal(harness.campaignState.mission.v1.knownFacts.includes(preparation.packet.factId), false);
    const fresh = prepare(harness, runtimeAssets, reportId, 'redelivery');
    assert.equal(fresh.status, 'ready');
    assert.equal(fresh.segment.contractVersion, 2);
    assert.equal(fresh.segment.summary, definition.facts.find(fact => fact.id === fresh.packet.factId).playerText.summary);
    const redelivery = snapshotFor({ preparation: fresh, definition, suffix: 'redelivery' });
    const accepted = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: redelivery.snapshot });
    assert.equal(accepted.diagnostics.acceptedDutyReportCount, 1);
    assert.equal(harness.campaignState.mission.v1.knownFacts.includes(fresh.packet.factId), true);

    const adequateHarness = createHarness({ definition, outputs: [acceptedInterpretation()] });
    const adequate = snapshotFor({ preparation, definition, suffix: 'adequate-legacy',
        extraText: definition.facts.find(fact => fact.id === preparation.packet.factId).playerText.summary });
    const acceptedLegacy = await adequateHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: adequate.snapshot });
    assert.equal(acceptedLegacy.diagnostics.acceptedDutyReportCount, 1, 'V1 that actually contains the full fact can still settle');
    assert.equal(adequateHarness.campaignState.mission.v1.evidenceLog.find(entry => entry.delivery)?.delivery.contractVersion, 1);
}

for (const reportId of ['report.hesperus.distress', 'report.hesperus.passenger-risk']) {
    const definition = definitionFor(reportId);
    const runtimeAssets = assetsFor(definition);
    const harness = createHarness({ definition, outputs: [acceptedInterpretation()] });
    const stateBeforePreparation = structuredClone(harness.campaignState);
    const protectedBefore = protectedStateRoots(harness.campaignState);
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
        protectedStateRoots(harness.campaignState),
        protectedBefore,
        `${reportId}: delivery stays within mission and story authority`,
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
        assert.equal(
            projectionBeforeMutation.mission.facts.some((item) => item.id === 'fact.hesperus.passenger-risk'),
            true,
        );
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
        assert.equal(
            projectionAfterMutation.mission.facts.some((item) => item.id === 'fact.hesperus.passenger-risk'),
            false,
        );
    }
    assert.equal(prepare(harness, runtimeAssets, reportId, 'eligible-again').packet.reportId, reportId);
    assert.deepEqual(protectedStateRoots(harness.campaignState), protectedBefore, `${reportId}: repair stays scoped`);
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
