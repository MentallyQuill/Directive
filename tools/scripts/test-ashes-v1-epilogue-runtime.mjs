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

const definition = readJson('packages/bundled/breckenridge/v1/epilogue-the-terms-we-keep.mission-v1.json');
const chapter8Definition = readJson('packages/bundled/breckenridge/v1/chapter-8-the-last-directive.mission-v1.json');
const chapter8Scenarios = readJson('tests/fixtures/mission/v1/chapter-8-last-directive-scenarios.fixture.json');
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
    'open-orders-3-before-the-lamps-go-out',
].map((slug) => `packages/bundled/breckenridge/v1/${slug}.mission-v1.json`);
const allDefinitions = [...priorDefinitionPaths.map(readJson), chapter8Definition, definition];
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

function settleChapter8() {
    const scenario = chapter8Scenarios.scenarios.find((candidate) => candidate.id === 'peace-at-cost-nonlinear-quorum');
    assert.ok(scenario);
    const branchId = 'save.epilogue-runtime.main';
    let state = createMissionState({ definition: chapter8Definition, branchId });
    for (const [index, fragmentId] of scenario.sequence.entries()) {
        const steps = chapter8Scenarios.fragments[fragmentId];
        const role = steps[0].sourceRole;
        assert.equal(steps.every((step) => step.sourceRole === role), true, fragmentId);
        const selectedSwipeId = role === 'assistant' ? `swipe.chapter8.${index + 1}` : null;
        const source = {
            messageId: `message.chapter8.${index + 1}`,
            branchId,
            accepted: true,
            selectedSwipeId,
            textHash: createHash('sha256').update(`chapter8:${index}:${fragmentId}`).digest('hex'),
            role,
            acceptedAtRevision: state.revision,
        };
        const evidence = validateMissionEvidenceProposal({
            definition: chapter8Definition,
            state,
            proposal: {
                kind: 'directive.missionEvidenceProposal.v1',
                branchId,
                missionId: chapter8Definition.id,
                baseRevision: state.revision,
                providerConfidence: 0.99,
                claims: steps.map((step) => ({
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
                })),
            },
            resolveSourceRef: (ref) => ref?.messageId === source.messageId ? source : null,
        });
        assert.deepEqual(evidence.rejectedClaims, [], fragmentId);
        assert.equal(evidence.acceptedClaims.length, steps.length, fragmentId);
        state = reduceMissionEvidence({
            definition: chapter8Definition,
            state,
            acceptedClaims: evidence.acceptedClaims,
            sourceContribution: {
                id: `contribution.chapter8.${index + 1}`,
                messageId: source.messageId,
                swipeId: selectedSwipeId,
                role,
                textHash: source.textHash,
                acceptedAtRevision: source.acceptedAtRevision,
            },
        }).state;
    }
    assert.equal(state.status, 'terminal');
    assert.equal(state.terminalDisposition, 'peaceAtCost');
    return state;
}

function activatedCampaignState() {
    const branchId = 'save.epilogue-runtime.main';
    const terminalSource = settleChapter8();
    const initial = createInitialMissionJourney({ branchId, definition: chapter8Definition });
    const successor = createSuccessorMissionJourney({
        journey: initial.journey,
        history: initial.history,
        sourceState: terminalSource,
        sourceDefinition: chapter8Definition,
        targetDefinition: definition,
    });
    assert.deepEqual(successor.currentState.entryContext.capabilities.map((capability) => capability.id), [
        'capability.epilogue.nightfall-aftermath-record',
    ]);
    assert.deepEqual(successor.currentState.entryContext.capabilities[0].dimensions, [
        { id: 'dimension.chapter8.command', value: 'contested-functional' },
        { id: 'dimension.chapter8.mesh', value: 'manual-mesh-with-gaps' },
        { id: 'dimension.chapter8.weapons', value: 'manual-control-with-damage' },
        { id: 'dimension.chapter8.core', value: 'quorum-broken' },
        { id: 'dimension.chapter8.civilians', value: 'protected-with-casualties' },
    ]);
    const campaignState = {
        campaign: { id: 'campaign.ashes' },
        activeCampaignPackage: {
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
        },
        campaignChatBinding: {
            saveId: branchId,
            chatId: 'chat.epilogue-runtime.main',
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
            saveId: 'save.epilogue-runtime.main',
            chatId: 'chat.epilogue-runtime.main',
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.epilogue.${number}`,
            previousAssistant: {
                hostMessageId: `message.epilogue.assistant.${number}`,
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
                hostMessageId: `message.epilogue.player.${number}`,
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
        now: () => '2026-08-10T10:00:00.000Z',
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
        now: () => '2026-08-10T10:00:00.000Z',
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
    { id: 'mara-whitaker', capabilityRoles: ['captain', 'command', 'operations', 'diplomacy', 'medical'] },
    { id: 'priya-nayar', capabilityRoles: ['command', 'operations', 'diplomacy'] },
    { id: 'miriam-sato', capabilityRoles: ['medical'] },
];

function prepareReport(harness, suffix) {
    return harness.runtime.preparePendingDutyReport({
        runtimeAssets,
        availableActors,
        responseId: `response.epilogue.report.${suffix}`,
        sourceTransactionId: `transaction.epilogue.report.${suffix}`,
    });
}

function snapshotForReport(preparation, number) {
    const responseText = `The assigned officer gives the required aggregate record. ${preparation.segment.canonicalText}`;
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
        playerText: 'Understood. Preserve that aggregate account in the settlement record.',
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
        interpretation([
            candidate('policy.epilogue.aftermath-report', 'previousAssistant'),
            candidate('policy.epilogue.aftermath-disclosed', 'previousAssistant'),
        ]),
        abstainedOutput,
        interpretation([
            candidate('policy.epilogue.command-report', 'previousAssistant'),
            candidate('policy.epilogue.command-future', 'previousAssistant', 'continuedAuthority'),
            candidate('policy.epilogue.command-disclosed', 'previousAssistant'),
        ]),
        abstainedOutput,
        interpretation([candidate('policy.epilogue.accountability-position', 'currentPlayer', 'positionStated')]),
        interpretation([candidate('policy.epilogue.authority-position', 'currentPlayer', 'positionStated')]),
        interpretation([
            candidate('policy.epilogue.settlement-report', 'previousAssistant'),
            candidate('policy.epilogue.compact-status', 'previousAssistant', 'sunsetCharter'),
            candidate('policy.epilogue.defense-control', 'previousAssistant', 'starfleetControl'),
            candidate('policy.epilogue.farwatch-accountability', 'previousAssistant', 'classifiedReview'),
            candidate('policy.epilogue.lantern-custody', 'previousAssistant', 'starfleetCustody'),
            candidate('policy.epilogue.cardassian-participation', 'previousAssistant', 'technicalCooperation'),
            candidate('policy.epilogue.public-narrative', 'previousAssistant', 'communitiesSelfSaved'),
            candidate('policy.epilogue.settlement-disclosed', 'previousAssistant'),
        ]),
        abstainedOutput,
        abstainedOutput,
    ],
});
const rootsBefore = legacyRoots(mainHarness.campaignState);

const aftermath = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(1, {
        assistantText: 'The senior staff gives the complete Nightfall aftermath across all five established fronts, while generic narration also tries to mark it delivered.',
    }),
});
assert.equal(aftermath.status, 'settled');
assert.equal(aftermath.diagnostics.acceptedClaimCount, 1);
assert.equal(aftermath.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.epilogue.aftermath-record'), false);
const aftermathReportSnapshot = await deliverNextReport(mainHarness, 'report.epilogue.aftermath-record', 2);
assert.equal(mainHarness.campaignState.mission.v1.objectives['objective.epilogue.aftermath'].disposition, 'completed');

const command = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(3, {
        assistantText: 'Whitaker completes her private review and keeps the player in command with an explicit growth path.',
    }),
});
assert.equal(command.status, 'settled');
assert.equal(command.diagnostics.acceptedClaimCount, 2);
assert.equal(command.diagnostics.strippedRequiredDutyReportClaimCount, 1);
const commandReportSnapshot = await deliverNextReport(mainHarness, 'report.epilogue.command-review', 4);
assert.equal(mainHarness.campaignState.mission.v1.objectives['objective.epilogue.command'].disposition, 'completed');
assert.equal(mainHarness.campaignState.mission.v1.status, 'active', 'command review can settle before the political conference');

for (const [number, playerText, outcomeId] of [
    [5, 'Evidence remains preserved under review, Pale Lantern stays in controlled custody, and the public record must name supported responsibility without exposing dangerous technical details.', 'outcome.epilogue.accountability-position'],
    [6, 'Retain regional civil participation under a limited charter, with Starfleet defense control bounded by local consultation and independently authenticated safeguards.', 'outcome.epilogue.authority-position'],
]) {
    const position = await mainHarness.runtime.settleAcceptedPair({
        runtimeAssets,
        snapshot: snapshot(number, { playerText }),
    });
    assert.equal(position.status, 'settled', outcomeId);
    assert.equal(position.diagnostics.acceptedClaimCount, 1, outcomeId);
    assert.equal(mainHarness.campaignState.mission.v1.outcomes[outcomeId], 'positionStated', outcomeId);
}

const settlement = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(7, {
        assistantText: 'The conference closes with a complete account of every adopted authority, defense, accountability, custody, participation, and public-narrative term.',
    }),
});
assert.equal(settlement.status, 'settled');
assert.equal(settlement.diagnostics.acceptedClaimCount, 7);
assert.equal(settlement.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.epilogue.settlement-account'), false);
const settlementReportSnapshot = await deliverNextReport(mainHarness, 'report.epilogue.settlement-account', 8);

assert.deepEqual(deliveredDutyReportIds({ definition, state: mainHarness.campaignState.mission.v1 }), [
    'report.epilogue.aftermath-record',
    'report.epilogue.command-review',
    'report.epilogue.settlement-account',
]);
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.terminalDisposition, 'managedSettlement');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt.target.kind, 'phase');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt.target.id, 'ashes-authored-conclusion');
assert.equal(mainHarness.campaignState.mission.activeMissionId, definition.packageBinding.sourceId);
const pendingConclusion = mainHarness.runtime.inspectPendingTransition({ runtimeAssets });
assert.equal(pendingConclusion.ok, true);
assert.equal(pendingConclusion.status, 'pending');
assert.equal(pendingConclusion.reasonCode, 'phase-target-contract-unavailable');
assert.equal(pendingConclusion.sourceDefinitionId, definition.id);
assert.equal(pendingConclusion.targetDefinitionId, null);
assert.equal(pendingConclusion.activatable, false);
assert.equal(pendingConclusion.noChange, true);
assert.deepEqual(mainHarness.campaignState.mission.v1.entryContext, initialState.mission.v1.entryContext);
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);
assert.deepEqual(validateMissionJourney({
    campaignState: mainHarness.campaignState,
    definitions: allDefinitions,
}), { ok: true, errors: [] });

const generationBeforeInvalidation = mainHarness.generationCount;
const invalidatedCommandReport = await mainHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: commandReportSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(invalidatedCommandReport.status, 'invalidated');
assert.equal(mainHarness.generationCount, generationBeforeInvalidation, 'source rebuild cannot call a provider');
assert.equal(mainHarness.campaignState.mission.v1.status, 'active');
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.epilogue.command-review'), false);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.epilogue.command-future'], 'continuedAuthority');
assert.deepEqual(mainHarness.campaignState.mission.v1.entryContext, initialState.mission.v1.entryContext);
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);

const restoredCommandReport = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: commandReportSnapshot,
});
assert.equal(restoredCommandReport.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.terminalDisposition, 'managedSettlement');
const restoredCommandEvidence = mainHarness.campaignState.mission.v1.evidenceLog
    .find((entry) => entry.targetId === 'fact.epilogue.command-review');
assert.equal(restoredCommandEvidence.sourceContributionId.endsWith('.r1'), true);
assert.deepEqual(validateMissionJourney({
    campaignState: JSON.parse(JSON.stringify(mainHarness.campaignState)),
    definitions: allDefinitions,
}), { ok: true, errors: [] }, 'epilogue journey survives JSON restart');

const quietHarness = createHarness({
    state: initialState,
    outputs: [interpretation([], { assistantAcceptance: 'ambiguous', abstained: true })],
});
const quietRoots = legacyRoots(quietHarness.campaignState);
const quiet = await quietHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(30, {
        assistantText: 'A corridor light flickers once during repairs and immediately returns to normal.',
        playerText: 'I leave the harmless light alone and return to the settlement record.',
    }),
});
assert.equal(quiet.status, 'settled-no-effect');
assert.equal(quiet.diagnostics.acceptedClaimCount, 0);
assert.equal(quietHarness.campaignState.mission.v1.revision, 0);
assert.deepEqual(quietHarness.campaignState.mission.v1.evidenceLog, []);
assert.deepEqual(quietHarness.campaignState.storySettlement?.episodes || [], []);
assert.deepEqual(legacyRoots(quietHarness.campaignState), quietRoots);

assert.equal(aftermathReportSnapshot.source.previousAssistant.selectedVariant.dutyReportCustodyOwned, true);
assert.equal(settlementReportSnapshot.source.previousAssistant.selectedVariant.dutyReportCustodyOwned, true);

console.log('Ashes V1 epilogue accepted-pair runtime tests passed.');
