import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { deliveredDutyReportIds } from '../../src/mission/v1/duty-report-planner.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json',
    'utf8',
));
const definitionRecord = {
    path: 'packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json',
    definition,
};
const runtimeAssets = {
    packageData: {
        manifest: {
            id: definition.packageBinding.packageId,
            version: definition.packageBinding.packageVersion,
        },
    },
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
        campaignChatBinding: { saveId: 'save.open-orders1-runtime', chatId: 'chat.open-orders1-runtime' },
        mission: {
            activeMissionId: definition.packageBinding.sourceId,
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
            saveId: 'save.open-orders1-runtime',
            chatId: 'chat.open-orders1-runtime',
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.open-orders1.${number}`,
            previousAssistant: {
                hostMessageId: `message.open-orders1.assistant.${number}`,
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
                hostMessageId: `message.open-orders1.player.${number}`,
                text: playerText,
                textHash: playerHash,
                sourceIntegrity: 'clean',
            },
        },
    };
}

function interpretation(claims, {
    assistantAcceptance = 'accepted',
    abstained = false,
} = {}) {
    return JSON.stringify({
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance,
        claims,
        abstained,
    });
}

function candidate(candidateId, sourceSlot, value) {
    return {
        candidateId,
        sourceSlot,
        ...(value === undefined ? {} : { value }),
    };
}

function createHarness({ state = initialCampaignState(), outputs = [] } = {}) {
    let campaignState = structuredClone(state);
    let persistCount = 0;
    let generationCount = 0;
    const requests = [];
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => { persistCount += 1; },
        now: () => '2026-08-09T23:00:00.000Z',
    });
    const runtime = createV1MissionRuntime({
        getState: () => campaignState,
        stateDeltaGateway: gateway,
        generationRouter: {
            generate: async (_roleId, request) => {
                requests.push(structuredClone(request));
                const text = outputs[generationCount] ?? outputs.at(-1) ?? '';
                generationCount += 1;
                return { ok: true, response: { text } };
            },
        },
        now: () => '2026-08-09T23:00:00.000Z',
    });
    return {
        runtime,
        requests,
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

function activeMissionEffectTargets(state) {
    return (state.storySettlement?.episodes || []).flatMap((episode) => (
        (episode.effects || [])
            .filter((effect) => effect.status === 'active' && effect.type?.startsWith('mission.'))
            .map((effect) => effect.targetId)
    ));
}

const abstainedOutput = interpretation([], { assistantAcceptance: 'accepted', abstained: true });
const mainHarness = createHarness({
    outputs: [
        interpretation([candidate('policy.open-orders1.long-repair-engagement', 'currentPlayer', 'direct')]),
        interpretation([candidate('policy.open-orders1.borrowed-wings-engagement', 'currentPlayer', 'delegated')]),
        interpretation([candidate('policy.open-orders1.quiet-channels-engagement', 'currentPlayer', 'declined')]),
        interpretation([candidate('policy.open-orders1.borrowed-wings-result', 'previousAssistant', 'assetEarned')]),
        interpretation([
            candidate('policy.open-orders1.long-repair-assessed', 'previousAssistant'),
            candidate('policy.open-orders1.borrowed-wings-assessed', 'previousAssistant'),
        ]),
        interpretation([candidate('policy.open-orders1.long-repair-assessment-disclosed', 'previousAssistant')]),
        abstainedOutput,
        abstainedOutput,
        interpretation([
            candidate('policy.open-orders1.long-repair-result', 'previousAssistant', 'assetEarned'),
            candidate('policy.open-orders1.borrowed-wings-result', 'previousAssistant', 'resolvedWithLimits'),
        ]),
        interpretation([candidate('policy.open-orders1.conclude-after-two', 'currentPlayer', 'concludeAfterTwo')]),
    ],
});
const rootsBefore = legacyRoots(mainHarness.campaignState);

const directSnapshot = snapshot(1, {
    playerText: 'I will personally lead the Breckenridge repair assessment.',
});
const direct = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: directSnapshot });
assert.equal(direct.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders1.long-repair-engagement'], 'direct');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders1.long-repair-result'], 'pending');

const delegatedSnapshot = snapshot(2, {
    playerText: 'I delegate the civilian rescue-wing assessment to Vale with Bronn supporting.',
});
const delegated = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: delegatedSnapshot });
assert.equal(delegated.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders1.borrowed-wings-engagement'], 'delegated');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders1.borrowed-wings-result'], 'pending');

const declinedSnapshot = snapshot(3, {
    playerText: 'We will knowingly decline the Quiet Channels work during this stop.',
});
const declined = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: declinedSnapshot });
assert.equal(declined.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders1.quiet-channels-engagement'], 'declined');
assert.equal(mainHarness.campaignState.mission.v1.objectives['objective.open-orders1.quiet-channels'].disposition, null);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders1.quiet-channels-result'], 'pending');

const prematureDelegatedResult = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(4, {
        assistantText: 'The order has been delegated, so the rescue-wing asset is already ours.',
    }),
});
assert.equal(prematureDelegatedResult.status, 'settled-no-effect');
assert.equal(prematureDelegatedResult.diagnostics.rejectedClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders1.borrowed-wings-result'], 'pending');

const assessmentSnapshot = snapshot(5, {
    assistantText: [
        'Cross completes a bounded engineering assessment of the ship work and records the actual limits.',
        'Vale and Bronn complete the delegated civilian rescue-wing assessment offscreen and return with a witnessed record.',
    ].join(' '),
});
const assessments = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: assessmentSnapshot });
assert.equal(assessments.status, 'settled');
assert.equal(assessments.diagnostics.acceptedClaimCount, 2);
assert.equal(mainHarness.campaignState.mission.v1.events.includes('event.open-orders1.long-repair-assessed'), true);
assert.equal(mainHarness.campaignState.mission.v1.events.includes('event.open-orders1.borrowed-wings-assessed'), true);
assert.equal(
    new Set(mainHarness.campaignState.mission.v1.evidenceLog.slice(-2).map((entry) => entry.sourceContributionId)).size,
    1,
    'one selected assistant generation owns both aggregate assessment events',
);

const smuggledReport = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(6, {
        assistantText: 'A generic line attempts to disclose the engineering assessment without a delivered Duty Report.',
    }),
});
assert.equal(smuggledReport.status, 'settled-no-effect');
assert.equal(smuggledReport.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(smuggledReport.diagnostics.rejectedDutyReportReasonCode, 'required-manifest-missing');
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders1.long-repair-assessment'), false);

const availableActors = [
    { id: 'imani-cross', capabilityRoles: ['engineering'] },
    { id: 'kieran-vale', capabilityRoles: ['flight'] },
    { id: 'hadrik-bronn', capabilityRoles: ['security'] },
    { id: 'priya-nayar', capabilityRoles: ['operations', 'communications'] },
    { id: 'mara-whitaker', capabilityRoles: ['command'] },
];

function prepareReport(suffix) {
    return mainHarness.runtime.preparePendingDutyReport({
        runtimeAssets,
        availableActors,
        responseId: `response.open-orders1.report.${suffix}`,
        sourceTransactionId: `transaction.open-orders1.report.${suffix}`,
    });
}

function snapshotForReport(preparation, number) {
    const responseText = `The assigned officer gives the assessment. ${preparation.segment.canonicalText} The briefing continues.`;
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
        playerText: 'Understood. Preserve that assessment in the shared record.',
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

async function deliverNextReport(expectedReportId, number) {
    const preparation = prepareReport(expectedReportId.split('.').at(-1));
    assert.equal(preparation.ok, true, expectedReportId);
    assert.equal(preparation.status, 'ready', expectedReportId);
    assert.equal(preparation.packet.reportId, expectedReportId);
    const reportSnapshot = snapshotForReport(preparation, number);
    const delivered = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: reportSnapshot });
    assert.equal(delivered.ok, true, expectedReportId);
    assert.equal(delivered.diagnostics.acceptedDutyReportCount, 1, expectedReportId);
    return reportSnapshot;
}

const wingsReportSnapshot = await deliverNextReport('report.open-orders1.borrowed-wings-assessment', 7);
const longReportSnapshot = await deliverNextReport('report.open-orders1.long-repair-assessment', 8);
assert.deepEqual(deliveredDutyReportIds({
    definition,
    state: mainHarness.campaignState.mission.v1,
}), [
    'report.open-orders1.borrowed-wings-assessment',
    'report.open-orders1.long-repair-assessment',
]);
assert.equal(prepareReport('none').status, 'no-pending-report', 'declined assignment cannot create a report');
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders1.borrowed-wings-assessment'), true);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders1.long-repair-assessment'), true);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders1.quiet-channels-assessment'), false);

const resultsSnapshot = snapshot(9, {
    assistantText: [
        'The engineering work earns bounded Helix Yard support under documented limits.',
        'The delegated rescue-wing effort resolves usefully but retains explicit qualification limits.',
    ].join(' '),
});
const results = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: resultsSnapshot });
assert.equal(results.status, 'settled');
assert.equal(results.diagnostics.acceptedClaimCount, 2);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders1.long-repair-result'], 'assetEarned');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders1.borrowed-wings-result'], 'resolvedWithLimits');
assert.equal(Object.keys(mainHarness.campaignState.mission.v1.objectives).length, 4, 'results remain one authored interval aggregate');
assert.equal(
    new Set(mainHarness.campaignState.mission.v1.evidenceLog.slice(-2).map((entry) => entry.sourceContributionId)).size,
    1,
    'one selected assistant generation owns both result claims',
);
const preConclusionState = structuredClone(mainHarness.campaignState);

const conclusionSnapshot = snapshot(10, {
    playerText: 'We have completed the two assignments we came for. Conclude this work interval and depart.',
});
const conclusion = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: conclusionSnapshot });
assert.equal(conclusion.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders1.conclusion'], 'concludeAfterTwo');
assert.equal(mainHarness.campaignState.mission.v1.objectives['objective.open-orders1.quiet-channels'].disposition, 'knowinglyDeclined');
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);
const finalState = structuredClone(mainHarness.campaignState);

const mutationCases = [
    {
        label: 'direct engagement edit',
        hostMessageId: directSnapshot.source.currentPlayer.hostMessageId,
        eventType: 'playerMessageEdited',
        verify(state) {
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.long-repair-engagement'], 'pending');
            assert.equal(state.mission.v1.events.includes('event.open-orders1.long-repair-assessed'), false);
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.long-repair-result'], 'pending');
            assert.equal(
                activeMissionEffectTargets(state).includes('event.open-orders1.long-repair-assessed'),
                false,
                'causally pruned mission evidence cannot survive as an active story effect',
            );
            assert.equal(state.mission.v1.events.includes('event.open-orders1.borrowed-wings-assessed'), true);
            assert.equal(
                activeMissionEffectTargets(state).includes('event.open-orders1.borrowed-wings-assessed'),
                true,
                'independent surviving evidence and its story effect remain active',
            );
            assert.equal(state.mission.v1.status, 'active');
        },
    },
    {
        label: 'terminal direct engagement edit',
        state: finalState,
        hostMessageId: directSnapshot.source.currentPlayer.hostMessageId,
        eventType: 'playerMessageEdited',
        verify(state) {
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.long-repair-engagement'], 'pending');
            assert.equal(state.mission.v1.events.includes('event.open-orders1.long-repair-assessed'), false);
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.long-repair-result'], 'pending');
            assert.equal(activeMissionEffectTargets(state).includes('event.open-orders1.long-repair-assessed'), false);
            assert.equal(state.mission.v1.status, 'active');
        },
    },
    {
        label: 'delegated engagement deletion',
        hostMessageId: delegatedSnapshot.source.currentPlayer.hostMessageId,
        eventType: 'playerMessageDeleted',
        verify(state) {
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.borrowed-wings-engagement'], 'pending');
            assert.equal(state.mission.v1.events.includes('event.open-orders1.borrowed-wings-assessed'), false);
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.borrowed-wings-result'], 'pending');
            assert.equal(state.mission.v1.status, 'active');
        },
    },
    {
        label: 'assessment swipe change',
        hostMessageId: assessmentSnapshot.source.previousAssistant.hostMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
        verify(state) {
            assert.equal(state.mission.v1.events.includes('event.open-orders1.long-repair-assessed'), false);
            assert.equal(state.mission.v1.events.includes('event.open-orders1.borrowed-wings-assessed'), false);
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders1.long-repair-assessment'), false);
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders1.borrowed-wings-assessment'), false);
            assert.equal(state.mission.v1.status, 'active');
        },
    },
    {
        label: 'report edit',
        hostMessageId: wingsReportSnapshot.source.previousAssistant.hostMessageId,
        eventType: 'directiveResponseEdited',
        verify(state) {
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders1.borrowed-wings-assessment'), false);
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.borrowed-wings-result'], 'pending');
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders1.long-repair-assessment'), true);
            assert.equal(state.mission.v1.status, 'active');
        },
    },
    {
        label: 'result deletion',
        hostMessageId: resultsSnapshot.source.previousAssistant.hostMessageId,
        eventType: 'directiveResponseDeleted',
        verify(state) {
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.long-repair-result'], 'pending');
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.borrowed-wings-result'], 'pending');
            assert.equal(state.mission.v1.status, 'active');
        },
    },
    {
        label: 'conclusion edit',
        state: finalState,
        hostMessageId: conclusionSnapshot.source.currentPlayer.hostMessageId,
        eventType: 'playerMessageEdited',
        verify(state) {
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.long-repair-result'], 'assetEarned');
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.borrowed-wings-result'], 'resolvedWithLimits');
            assert.equal(state.mission.v1.outcomes['outcome.open-orders1.conclusion'], 'pending');
            assert.equal(state.mission.v1.status, 'active');
        },
    },
];

for (const mutationCase of mutationCases) {
    const mutationHarness = createHarness({ state: mutationCase.state || preConclusionState });
    const invalidated = await mutationHarness.runtime.invalidateSourceMutation({
        runtimeAssets,
        hostMessageId: mutationCase.hostMessageId,
        eventType: mutationCase.eventType,
    });
    assert.equal(invalidated.ok, true, mutationCase.label);
    assert.equal(invalidated.status, 'invalidated', mutationCase.label);
    mutationCase.verify(mutationHarness.campaignState);
    assert.equal(mutationHarness.generationCount, 0, `${mutationCase.label} cannot call a provider`);
    assert.deepEqual(legacyRoots(mutationHarness.campaignState), rootsBefore, mutationCase.label);
}

const quietHarness = createHarness({
    outputs: [interpretation([], { assistantAcceptance: 'ambiguous', abstained: true })],
});
const quietRoots = legacyRoots(quietHarness.campaignState);
const quiet = await quietHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(20, {
        assistantText: 'The lounge lights warm gradually while the crew finishes dinner.',
        playerText: 'I finish my tea and watch the stars for a while.',
    }),
});
assert.equal(quiet.status, 'settled-no-effect');
assert.equal(quiet.diagnostics.acceptedClaimCount, 0);
assert.equal(quietHarness.campaignState.mission.v1.revision, 0);
assert.deepEqual(quietHarness.campaignState.mission.v1.evidenceLog, []);
assert.equal(quietHarness.runtime.preparePendingDutyReport({
    runtimeAssets,
    availableActors,
    responseId: 'response.open-orders1.none',
    sourceTransactionId: 'transaction.open-orders1.none',
}).status, 'no-pending-report');
assert.deepEqual(legacyRoots(quietHarness.campaignState), quietRoots);

const assistantDecisionHarness = createHarness({
    outputs: [interpretation([
        candidate('policy.open-orders1.long-repair-engagement', 'previousAssistant', 'direct'),
    ])],
});
const assistantDecision = await assistantDecisionHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(21, {
        assistantText: 'The narration declares that the XO personally accepts the Long Repair.',
        playerText: 'I listen without making that decision.',
    }),
});
assert.equal(assistantDecision.status, 'unavailable');
assert.equal(assistantDecision.ok, false, 'an unauthorized assistant decision fails closed');
assert.equal(assistantDecisionHarness.campaignState.mission.v1, undefined);
assert.equal(assistantDecisionHarness.persistCount, 0, 'assistant prose cannot persist a player-owned decision');

assert.equal(mainHarness.generationCount, 10, 'report preparation and source rebuild add no provider calls');
assert.equal(longReportSnapshot.source.previousAssistant.selectedVariant.dutyReportCustodyOwned, true);

console.log('Ashes V1 Open Orders I accepted-pair runtime tests passed.');
