import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { createDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { deliveredDutyReportIds } from '../../src/mission/v1/duty-report-planner.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import {
    createInitialMissionJourney,
    createSuccessorMissionJourney,
    validateMissionJourney,
} from '../../src/mission/v1/mission-journey.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

function readJson(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const definitionPath = 'packages/bundled/breckenridge/v1/chapter-8-the-last-directive.mission-v1.json';
const definition = readJson(definitionPath);
const openOrders3Path = 'packages/bundled/breckenridge/v1/open-orders-3-before-the-lamps-go-out.mission-v1.json';
const openOrders3Definition = readJson(openOrders3Path);
const openOrders3Scenarios = readJson('tests/fixtures/mission/v1/open-orders-3-scenarios.fixture.json');
const priorDefinitionPaths = [
    'prelude-a-ship-underway',
    'chapter-1-the-empty-convoy',
    'chapter-2-false-colors',
    'open-orders-1-work-worth-doing',
    'chapter-3-dead-letters',
    'chapter-4-the-colony-that-stayed',
    'chapter-5-old-lessons',
    'open-orders-2-what-survives',
    'chapter-6-the-cost-of-knowing',
    'chapter-7-a-peace-of-their-own',
].map((slug) => `packages/bundled/breckenridge/v1/${slug}.mission-v1.json`);
const allDefinitions = [...priorDefinitionPaths.map(readJson), openOrders3Definition, definition];
const definitionRecords = allDefinitions.map((missionDefinition) => ({
    path: `packages/bundled/breckenridge/v1/${missionDefinition.packageBinding.sourceId}.mission-v1.json`,
    definition: missionDefinition,
}));
const runtimeAssets = {
    packageData: {
        manifest: {
            id: definition.packageBinding.packageId,
            version: definition.packageBinding.packageVersion,
        },
    },
    missionDefinitions: definitionRecords,
    missionDefinitionsById: new Map(definitionRecords.map((record) => [record.definition.id, record])),
};

function settleOpenOrders3() {
    const scenario = openOrders3Scenarios.scenarios.find((candidate) => candidate.id === 'name-and-signal-normal');
    assert.ok(scenario);
    const steps = scenario.sequence.flatMap((fragmentId) => openOrders3Scenarios.fragments[fragmentId]);
    const branchId = 'save.chapter8-runtime.main';
    let state = createMissionState({ definition: openOrders3Definition, branchId });
    for (const [index, step] of steps.entries()) {
        const selectedSwipeId = step.sourceRole === 'assistant' ? `swipe.open-orders3.${index + 1}` : null;
        const source = {
            messageId: `message.open-orders3.${index + 1}`,
            branchId,
            accepted: true,
            selectedSwipeId,
            textHash: createHash('sha256').update(`open-orders3:${index}:${step.claimId}`).digest('hex'),
            role: step.sourceRole,
            acceptedAtRevision: state.revision,
        };
        const evidence = validateMissionEvidenceProposal({
            definition: openOrders3Definition,
            state,
            proposal: {
                kind: 'directive.missionEvidenceProposal.v1',
                branchId,
                missionId: openOrders3Definition.id,
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
            },
            resolveSourceRef: (ref) => ref?.messageId === source.messageId ? source : null,
        });
        assert.deepEqual(evidence.rejectedClaims, [], step.claimId);
        assert.equal(evidence.acceptedClaims.length, 1, step.claimId);
        state = reduceMissionEvidence({
            definition: openOrders3Definition,
            state,
            acceptedClaims: evidence.acceptedClaims,
            sourceContribution: {
                id: `contribution.open-orders3.${index + 1}`,
                messageId: source.messageId,
                swipeId: selectedSwipeId,
                role: source.role,
                textHash: source.textHash,
                acceptedAtRevision: source.acceptedAtRevision,
            },
        }).state;
    }
    assert.equal(state.status, 'terminal');
    return state;
}

function activatedCampaignState() {
    const branchId = 'save.chapter8-runtime.main';
    const terminalSource = settleOpenOrders3();
    const initial = createInitialMissionJourney({ branchId, definition: openOrders3Definition });
    const successor = createSuccessorMissionJourney({
        journey: initial.journey,
        history: initial.history,
        sourceState: terminalSource,
        sourceDefinition: openOrders3Definition,
        targetDefinition: definition,
    });
    assert.deepEqual(
        successor.currentState.entryContext.capabilities.map((capability) => capability.id),
        [
            'capability.chapter8.breckenridge-memorial-goodwill',
            'capability.chapter8.long-range-relay-window',
            'capability.chapter8.distributed-command-readiness',
        ],
    );
    const campaignState = {
        campaign: { id: 'campaign.ashes' },
        activeCampaignPackage: {
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
        },
        campaignChatBinding: {
            saveId: branchId,
            chatId: 'chat.chapter8-runtime.main',
        },
        mission: {
            activeMissionId: definition.packageBinding.sourceId,
            v1: successor.currentState,
            v1Journey: successor.journey,
            v1History: successor.history,
            legacyStatus: 'must-remain-unchanged',
            openAssignments: [{ id: 'legacy.assignment' }],
            pressure: { id: 'legacy.pressure' },
            rewards: [{ id: 'legacy.reward' }],
            progress: { id: 'legacy.progress' },
        },
        ship: { conditions: [{ id: 'legacy.ship' }] },
        relationships: { people: [{ id: 'legacy.relationship' }] },
        questLedger: { records: [{ id: 'legacy.quest' }] },
        threadLedger: { records: [{ id: 'legacy.thread' }] },
        commandLog: { entries: [{ id: 'legacy.command' }] },
        commandBearing: { current: 3 },
    };
    assert.deepEqual(validateMissionJourney({ campaignState, definitions: allDefinitions }), { ok: true, errors: [] });
    return campaignState;
}

function snapshot(number, {
    assistantText = 'The selected assistant response.',
    playerText = 'I acknowledge the report and continue.',
} = {}) {
    const assistantHash = String(number).padStart(2, '0').repeat(32);
    const playerHash = String(number + 40).padStart(2, '0').repeat(32);
    return {
        kind: 'directive.sceneHandshakeSnapshot.v1',
        envelope: {
            campaignId: 'campaign.ashes',
            saveId: 'save.chapter8-runtime.main',
            chatId: 'chat.chapter8-runtime.main',
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.chapter8.${number}`,
            previousAssistant: {
                hostMessageId: `message.chapter8.assistant.${number}`,
                text: assistantText,
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
                hostMessageId: `message.chapter8.player.${number}`,
                text: playerText,
                textHash: playerHash,
                sourceIntegrity: 'clean',
            },
        },
    };
}

function interpretation(claims, { assistantAcceptance = 'accepted', abstained = false } = {}) {
    return JSON.stringify({
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance,
        claims,
        abstained,
    });
}

function candidate(candidateId, sourceSlot, value) {
    return { candidateId, sourceSlot, ...(value === undefined ? {} : { value }) };
}

function createHarness({ state = activatedCampaignState(), outputs = [] } = {}) {
    let campaignState = structuredClone(state);
    let persistCount = 0;
    let generationCount = 0;
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => { persistCount += 1; },
        now: () => '2026-08-10T09:00:00.000Z',
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
        now: () => '2026-08-10T09:00:00.000Z',
    });
    return {
        runtime,
        get campaignState() { return campaignState; },
        get persistCount() { return persistCount; },
        get generationCount() { return generationCount; },
    };
}

function legacyRoots(state) {
    return structuredClone({
        ship: state.ship,
        relationships: state.relationships,
        questLedger: state.questLedger,
        threadLedger: state.threadLedger,
        commandLog: state.commandLog,
        commandBearing: state.commandBearing,
        openAssignments: state.mission.openAssignments,
        pressure: state.mission.pressure,
        rewards: state.mission.rewards,
        progress: state.mission.progress,
    });
}

const availableActors = [
    { id: 'mara-whitaker', capabilityRoles: ['command', 'operations', 'diplomacy', 'communications', 'tactical', 'security', 'science', 'engineering', 'flight', 'medical'] },
    { id: 'priya-nayar', capabilityRoles: ['command', 'operations', 'diplomacy', 'communications'] },
    { id: 'hadrik-bronn', capabilityRoles: ['tactical', 'security', 'command'] },
    { id: 'rowan-saye', capabilityRoles: ['science'] },
    { id: 'imani-cross', capabilityRoles: ['engineering'] },
    { id: 'kieran-vale', capabilityRoles: ['flight'] },
    { id: 'miriam-sato', capabilityRoles: ['medical'] },
];

function prepareReport(harness, suffix) {
    return harness.runtime.preparePendingDutyReport({
        runtimeAssets,
        availableActors,
        responseId: `response.chapter8.report.${suffix}`,
        sourceTransactionId: `transaction.chapter8.report.${suffix}`,
    });
}

function snapshotForReport(preparation, number) {
    const responseText = `The assigned officer gives one aggregate front report. ${preparation.segment.canonicalText}`;
    const manifest = createDutyReportManifest({
        definition,
        packet: preparation.packet,
        branchId: preparation.manifestInput.branchId,
        responseId: preparation.manifestInput.responseId,
        sourceTransactionId: preparation.manifestInput.sourceTransactionId,
        responseText,
        segment: preparation.segment,
    });
    const result = snapshot(number, {
        assistantText: responseText,
        playerText: 'Understood. Preserve that aggregate front result in the shared record.',
    });
    result.source.previousAssistant.selectedVariant = {
        ...result.source.previousAssistant.selectedVariant,
        selectedSwipeId: String(number),
        selectedSwipeIndex: number,
        responseId: preparation.manifestInput.responseId,
        directiveOwned: true,
        dutyReportCustodyOwned: true,
        dutyReportManifest: manifest,
    };
    return result;
}

async function deliverNextReport(harness, expectedReportId, number) {
    const preparation = prepareReport(harness, `${expectedReportId}.${number}`);
    assert.equal(preparation.ok, true, expectedReportId);
    assert.equal(preparation.status, 'ready', expectedReportId);
    assert.equal(preparation.packet.reportId, expectedReportId);
    const reportSnapshot = snapshotForReport(preparation, number);
    const delivered = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: reportSnapshot });
    assert.equal(delivered.ok, true, expectedReportId);
    assert.equal(delivered.diagnostics.acceptedDutyReportCount, 1, expectedReportId);
    return reportSnapshot;
}

const abstainedOutput = interpretation([], { assistantAcceptance: 'accepted', abstained: true });
const initialState = activatedCampaignState();
const mainHarness = createHarness({
    state: initialState,
    outputs: [
        interpretation([candidate('policy.chapter8.command-plan', 'currentPlayer', 'executablePlanIssued')]),
        interpretation([
            candidate('policy.chapter8.core-report', 'previousAssistant'),
            candidate('policy.chapter8.core-result', 'previousAssistant', 'quorumBroken'),
            candidate('policy.chapter8.core-disclosed', 'previousAssistant'),
        ]),
        abstainedOutput,
        interpretation([
            candidate('policy.chapter8.civilians-report', 'previousAssistant'),
            candidate('policy.chapter8.civilians-result', 'previousAssistant', 'protectedWithCasualties'),
        ]),
        abstainedOutput,
        interpretation([
            candidate('policy.chapter8.mesh-report', 'previousAssistant'),
            candidate('policy.chapter8.mesh-result', 'previousAssistant', 'manualMeshWithGaps'),
        ]),
        abstainedOutput,
        interpretation([
            candidate('policy.chapter8.weapons-report', 'previousAssistant'),
            candidate('policy.chapter8.weapons-result', 'previousAssistant', 'manualControlWithDamage'),
        ]),
        abstainedOutput,
        interpretation([
            candidate('policy.chapter8.command-report', 'previousAssistant'),
            candidate('policy.chapter8.command-result', 'previousAssistant', 'contestedFunctional'),
        ]),
        abstainedOutput,
        abstainedOutput,
    ],
});
const rootsBefore = legacyRoots(mainHarness.campaignState);

const plan = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(1, {
        playerText: [
            'First priority is stopping civilian movement into weapons zones while we break the coordination path.',
            'Reject automated regional orders; Priya owns the human-confirmed mesh and Bronn owns a manual weapons freeze.',
            'Miriam and Kieran coordinate evacuation and triage, while Rowan and Imani isolate the core paths.',
            'Only Whitaker or I may authorize regional movement; fire only on confirmed hostile action, and local leads may act unilaterally to save lives or prevent an imminent launch.',
        ].join(' '),
    }),
});
assert.equal(plan.status, 'settled');
assert.equal(plan.diagnostics.acceptedClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.chapter8.command-plan'], 'executablePlanIssued');
assert.equal(mainHarness.campaignState.mission.v1.status, 'active');

const smuggledCore = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(2, {
        assistantText: 'The core team establishes the three-path quorum and breaks two paths, while generic narration also tries to disclose the result without report custody.',
    }),
});
assert.equal(smuggledCore.status, 'settled');
assert.equal(smuggledCore.diagnostics.acceptedClaimCount, 2);
assert.equal(smuggledCore.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.chapter8.core-result'], 'quorumBroken');
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter8.core-account'), false);
assert.equal(mainHarness.campaignState.mission.v1.objectives['objective.chapter8.core'].state, 'inProgress');
const coreReportSnapshot = await deliverNextReport(mainHarness, 'report.chapter8.core-account', 3);
assert.equal(mainHarness.campaignState.mission.v1.objectives['objective.chapter8.core'].disposition, 'completed');
assert.equal(mainHarness.campaignState.mission.v1.status, 'active', 'one completed front cannot end Nightfall');

for (const step of [
    { number: 4, reportNumber: 5, reportId: 'report.chapter8.civilians-account', outcomeId: 'outcome.chapter8.civilians-result', expected: 'protectedWithCasualties' },
    { number: 6, reportNumber: 7, reportId: 'report.chapter8.mesh-account', outcomeId: 'outcome.chapter8.mesh-result', expected: 'manualMeshWithGaps' },
    { number: 8, reportNumber: 9, reportId: 'report.chapter8.weapons-account', outcomeId: 'outcome.chapter8.weapons-result', expected: 'manualControlWithDamage' },
    { number: 10, reportNumber: 11, reportId: 'report.chapter8.command-account', outcomeId: 'outcome.chapter8.command-result', expected: 'contestedFunctional' },
]) {
    const result = await mainHarness.runtime.settleAcceptedPair({
        runtimeAssets,
        snapshot: snapshot(step.number, {
            assistantText: `The front reaches its aggregate world result for ${step.reportId}.`,
        }),
    });
    assert.equal(result.status, 'settled', step.reportId);
    assert.equal(result.diagnostics.acceptedClaimCount, 2, step.reportId);
    assert.equal(mainHarness.campaignState.mission.v1.outcomes[step.outcomeId], step.expected, step.reportId);
    await deliverNextReport(mainHarness, step.reportId, step.reportNumber);
}

assert.deepEqual(deliveredDutyReportIds({ definition, state: mainHarness.campaignState.mission.v1 }), [
    'report.chapter8.civilians-account',
    'report.chapter8.command-account',
    'report.chapter8.core-account',
    'report.chapter8.mesh-account',
    'report.chapter8.weapons-account',
]);
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.terminalDisposition, 'peaceAtCost');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt.target.id, 'epilogue-the-terms-we-keep');
assert.equal(mainHarness.campaignState.mission.activeMissionId, definition.packageBinding.sourceId, 'epilogue remains pending until its V1 definition exists');
assert.equal(mainHarness.campaignState.mission.v1Journey.revision, 1);
assert.deepEqual(
    mainHarness.campaignState.mission.v1.entryContext.capabilities.map((capability) => capability.id),
    initialState.mission.v1.entryContext.capabilities.map((capability) => capability.id),
);
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);
assert.deepEqual(validateMissionJourney({
    campaignState: mainHarness.campaignState,
    definitions: allDefinitions,
}), { ok: true, errors: [] });

const generationBeforeInvalidation = mainHarness.generationCount;
const invalidatedCoreReport = await mainHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: coreReportSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(invalidatedCoreReport.status, 'invalidated');
assert.equal(mainHarness.generationCount, generationBeforeInvalidation, 'source rebuild cannot call a provider');
assert.equal(mainHarness.campaignState.mission.v1.status, 'active');
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter8.core-account'), false);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.chapter8.core-result'], 'quorumBroken');
assert.deepEqual(
    mainHarness.campaignState.mission.v1.entryContext.capabilities.map((capability) => capability.id),
    initialState.mission.v1.entryContext.capabilities.map((capability) => capability.id),
    'rebuilding Chapter 8 preserves its historically derived entry receipt',
);
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);

const restoredCoreReport = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: coreReportSnapshot,
});
assert.equal(restoredCoreReport.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.terminalDisposition, 'peaceAtCost');
const restoredCoreEvidence = mainHarness.campaignState.mission.v1.evidenceLog
    .find((entry) => entry.targetId === 'fact.chapter8.core-account');
assert.equal(restoredCoreEvidence.sourceContributionId.endsWith('.r1'), true);
assert.deepEqual(validateMissionJourney({
    campaignState: JSON.parse(JSON.stringify(mainHarness.campaignState)),
    definitions: allDefinitions,
}), { ok: true, errors: [] }, 'Chapter 8 journey survives JSON restart');

const quietHarness = createHarness({
    state: initialState,
    outputs: [interpretation([], { assistantAcceptance: 'ambiguous', abstained: true })],
});
const quietRoots = legacyRoots(quietHarness.campaignState);
const quiet = await quietHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(30, {
        assistantText: 'One console repeats a harmless stale label before Priya clears it from the local display.',
        playerText: 'I note the nuisance and return to the actual regional response.',
    }),
});
assert.equal(quiet.status, 'settled-no-effect');
assert.equal(quiet.diagnostics.acceptedClaimCount, 0);
assert.equal(quietHarness.campaignState.mission.v1.revision, 0);
assert.deepEqual(quietHarness.campaignState.mission.v1.evidenceLog, []);
assert.deepEqual(quietHarness.campaignState.storySettlement?.episodes || [], []);
assert.deepEqual(legacyRoots(quietHarness.campaignState), quietRoots);

console.log('Ashes V1 Chapter 8 accepted-pair runtime tests passed.');
