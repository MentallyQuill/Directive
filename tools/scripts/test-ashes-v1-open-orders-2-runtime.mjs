import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { deliveredDutyReportIds } from '../../src/mission/v1/duty-report-planner.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const definitionPath = 'packages/bundled/breckenridge/v1/open-orders-2-what-survives.mission-v1.json';
const definition = JSON.parse(fs.readFileSync(definitionPath, 'utf8'));
const definitionRecord = { path: definitionPath, definition };
const runtimeAssets = {
    packageData: { manifest: { id: definition.packageBinding.packageId, version: definition.packageBinding.packageVersion } },
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
        campaignChatBinding: { saveId: 'save.open-orders2-runtime', chatId: 'chat.open-orders2-runtime' },
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
            saveId: 'save.open-orders2-runtime',
            chatId: 'chat.open-orders2-runtime',
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.open-orders2.${number}`,
            previousAssistant: {
                hostMessageId: `message.open-orders2.assistant.${number}`,
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
                hostMessageId: `message.open-orders2.player.${number}`,
                text: playerText,
                textHash: playerHash,
                sourceIntegrity: 'clean',
            },
        },
    };
}

function interpretation(claims, { assistantAcceptance = 'accepted', abstained = false } = {}) {
    return JSON.stringify({ kind: 'directive.missionEvidenceInterpretation.v1', assistantAcceptance, claims, abstained });
}

function candidate(candidateId, sourceSlot, value) {
    return { candidateId, sourceSlot, ...(value === undefined ? {} : { value }) };
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
        now: () => '2026-08-10T01:00:00.000Z',
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
        now: () => '2026-08-10T01:00:00.000Z',
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
        interpretation([
            candidate('policy.open-orders2.last-watch-engagement', 'currentPlayer', 'direct'),
            candidate('policy.open-orders2.second-opinion-engagement', 'currentPlayer', 'delegated'),
            candidate('policy.open-orders2.unwelcome-result-engagement', 'currentPlayer', 'declined'),
        ]),
        interpretation([candidate('policy.open-orders2.second-opinion-result', 'previousAssistant', 'assetEarned')]),
        interpretation([
            candidate('policy.open-orders2.last-watch-assessed', 'previousAssistant'),
            candidate('policy.open-orders2.second-opinion-assessed', 'previousAssistant'),
        ]),
        interpretation([candidate('policy.open-orders2.last-watch-assessment-disclosed', 'previousAssistant')]),
        abstainedOutput,
        abstainedOutput,
        interpretation([
            candidate('policy.open-orders2.last-watch-result', 'previousAssistant', 'assetEarned'),
            candidate('policy.open-orders2.second-opinion-result', 'previousAssistant', 'resolvedWithoutAsset'),
            candidate('policy.open-orders2.credential-path-corroborated', 'previousAssistant'),
        ]),
        interpretation([candidate('policy.open-orders2.conclude-after-two', 'currentPlayer', 'concludeAfterTwo')]),
        interpretation([candidate('policy.open-orders2.credential-path-disclosed', 'previousAssistant')]),
        abstainedOutput,
        interpretation([candidate('policy.open-orders2.conclude-after-two', 'currentPlayer', 'concludeAfterTwo')]),
    ],
});
const rootsBefore = legacyRoots(mainHarness.campaignState);

const engagementSnapshot = snapshot(1, {
    playerText: [
        'I will personally lead The Last Watch.',
        'I delegate Second Opinion to Doctor Sato with appropriate independence.',
        'We will knowingly leave An Unwelcome Result unpursued during this stop.',
    ].join(' '),
});
const engagements = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: engagementSnapshot });
assert.equal(engagements.status, 'settled');
assert.equal(engagements.diagnostics.acceptedClaimCount, 3);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders2.last-watch-engagement'], 'direct');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders2.second-opinion-engagement'], 'delegated');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders2.unwelcome-result-engagement'], 'declined');
assert.equal(
    new Set(mainHarness.campaignState.mission.v1.evidenceLog.slice(-3).map((entry) => entry.sourceContributionId)).size,
    1,
    'one player message owns all three explicit assignment choices',
);

const prematureDelegatedResult = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(2, { assistantText: 'Delegation alone means the medical cooperative is already ours.' }),
});
assert.equal(prematureDelegatedResult.status, 'settled-no-effect');
assert.equal(prematureDelegatedResult.diagnostics.rejectedClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders2.second-opinion-result'], 'pending');

const assessmentSnapshot = snapshot(3, {
    assistantText: [
        'Bronn completes a usable assessment of Tonn, the defense network, targeting integrity, and authority consequences.',
        'Sato completes the delegated clinical and consent assessment across outcomes, risks, access, pressure, and patient choice.',
    ].join(' '),
});
const assessments = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: assessmentSnapshot });
assert.equal(assessments.status, 'settled');
assert.equal(assessments.diagnostics.acceptedClaimCount, 2);
assert.equal(mainHarness.campaignState.mission.v1.events.includes('event.open-orders2.last-watch-assessed'), true);
assert.equal(mainHarness.campaignState.mission.v1.events.includes('event.open-orders2.second-opinion-assessed'), true);
assert.equal(
    new Set(mainHarness.campaignState.mission.v1.evidenceLog.slice(-2).map((entry) => entry.sourceContributionId)).size,
    1,
    'one selected assistant generation owns both aggregate assignment assessments',
);

const smuggledAssignmentReport = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(4, { assistantText: 'A generic line attempts to disclose the defense assessment without a delivered Duty Report.' }),
});
assert.equal(smuggledAssignmentReport.status, 'settled-no-effect');
assert.equal(smuggledAssignmentReport.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(smuggledAssignmentReport.diagnostics.rejectedDutyReportReasonCode, 'required-manifest-missing');
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders2.last-watch-assessment'), false);

const availableActors = [
    { id: 'hadrik-bronn', capabilityRoles: ['security', 'tactical'] },
    { id: 'miriam-sato', capabilityRoles: ['medical', 'counseling'] },
    { id: 'priya-nayar', capabilityRoles: ['operations', 'intelligence'] },
    { id: 'rowan-saye', capabilityRoles: ['science', 'sensors'] },
    { id: 'mara-whitaker', capabilityRoles: ['command'] },
];

function prepareReport(suffix) {
    return mainHarness.runtime.preparePendingDutyReport({
        runtimeAssets,
        availableActors,
        responseId: `response.open-orders2.report.${suffix}`,
        sourceTransactionId: `transaction.open-orders2.report.${suffix}`,
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

const watchReportSnapshot = await deliverNextReport('report.open-orders2.last-watch-assessment', 5);
const opinionReportSnapshot = await deliverNextReport('report.open-orders2.second-opinion-assessment', 6);
assert.deepEqual(deliveredDutyReportIds({ definition, state: mainHarness.campaignState.mission.v1 }), [
    'report.open-orders2.last-watch-assessment',
    'report.open-orders2.second-opinion-assessment',
]);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders2.unwelcome-result-assessment'), false);

const resultsSnapshot = snapshot(7, {
    assistantText: [
        'The defense work responsibly corrects the fault and earns the Orison Defense Codes.',
        'The delegated medical review resolves responsibly but without a durable cooperative.',
        'Priya and Rowan complete corroboration of the current Starfleet Intelligence credential path and initiate the classified escalation.',
    ].join(' '),
});
const results = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: resultsSnapshot });
assert.equal(results.status, 'settled');
assert.equal(results.diagnostics.acceptedClaimCount, 3);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders2.last-watch-result'], 'assetEarned');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders2.second-opinion-result'], 'resolvedWithoutAsset');
assert.equal(mainHarness.campaignState.mission.v1.events.includes('event.open-orders2.credential-path-corroborated'), true);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders2.current-starfleet-credential-path'), false);
assert.equal(Object.keys(mainHarness.campaignState.mission.v1.objectives).length, 4, 'background discovery cannot create a fourth assignment tracker');
assert.equal(
    new Set(mainHarness.campaignState.mission.v1.evidenceLog.slice(-3).map((entry) => entry.sourceContributionId)).size,
    1,
    'one selected assistant generation owns both results and the independent background event',
);

const blockedConclusionSnapshot = snapshot(8, {
    playerText: 'The two assignments are complete. Conclude this interval and take us onward.',
});
const blockedConclusion = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: blockedConclusionSnapshot });
assert.equal(blockedConclusion.status, 'settled-no-effect');
assert.equal(blockedConclusion.diagnostics.rejectedClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders2.conclusion'], 'pending');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt, null);

const smuggledCredentialReport = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(9, { assistantText: 'A generic line tries to expose the current credentials without Directive report custody.' }),
});
assert.equal(smuggledCredentialReport.status, 'settled-no-effect');
assert.equal(smuggledCredentialReport.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders2.current-starfleet-credential-path'), false);

const credentialReportSnapshot = await deliverNextReport('report.open-orders2.current-starfleet-credential-path', 10);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders2.current-starfleet-credential-path'), true);
assert.deepEqual(deliveredDutyReportIds({ definition, state: mainHarness.campaignState.mission.v1 }), [
    'report.open-orders2.current-starfleet-credential-path',
    'report.open-orders2.last-watch-assessment',
    'report.open-orders2.second-opinion-assessment',
]);
assert.equal(prepareReport('none').status, 'no-pending-report', 'declined assignment cannot create a report');
const preConclusionState = structuredClone(mainHarness.campaignState);

const conclusionSnapshot = snapshot(11, {
    playerText: 'Now that the classified report is in hand, conclude this two-assignment interval and proceed.',
});
const conclusion = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: conclusionSnapshot });
assert.equal(conclusion.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.terminalDisposition, 'responsibleInterval');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders2.conclusion'], 'concludeAfterTwo');
assert.equal(mainHarness.campaignState.mission.v1.objectives['objective.open-orders2.unwelcome-result'].disposition, 'knowinglyDeclined');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt.target.id, 'chapter-6-the-cost-of-knowing');
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);
assert.equal(JSON.stringify(mainHarness.campaignState).includes('fact.current-starfleet-credentials'), false, 'V1 runtime cannot apply the premature legacy reaction fact');
const finalState = structuredClone(mainHarness.campaignState);

const invalidatedConclusion = await mainHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: conclusionSnapshot.source.currentPlayer.hostMessageId,
    eventType: 'playerMessageEdited',
});
assert.equal(invalidatedConclusion.status, 'invalidated');
assert.equal(mainHarness.campaignState.mission.v1.status, 'active');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt, null);
const restoredConclusion = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: conclusionSnapshot });
assert.equal(restoredConclusion.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt.target.id, 'chapter-6-the-cost-of-knowing');
assert.equal(mainHarness.campaignState.mission.v1.evidenceLog.at(-1).sourceContributionId.endsWith('.r1'), true, 'restored accepted source advances the custody epoch');
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);

const mutationCases = [
    {
        label: 'engagement edit',
        hostMessageId: engagementSnapshot.source.currentPlayer.hostMessageId,
        eventType: 'playerMessageEdited',
        verify(state) {
            assert.equal(state.mission.v1.outcomes['outcome.open-orders2.last-watch-engagement'], 'pending');
            assert.equal(state.mission.v1.outcomes['outcome.open-orders2.second-opinion-engagement'], 'pending');
            assert.equal(state.mission.v1.events.includes('event.open-orders2.last-watch-assessed'), false);
            assert.equal(state.mission.v1.outcomes['outcome.open-orders2.last-watch-result'], 'pending');
            assert.equal(state.mission.v1.events.includes('event.open-orders2.credential-path-corroborated'), true, 'independent background evidence survives');
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders2.current-starfleet-credential-path'), true);
            assert.equal(activeMissionEffectTargets(state).includes('event.open-orders2.last-watch-assessed'), false);
        },
    },
    {
        label: 'assessment swipe change',
        hostMessageId: assessmentSnapshot.source.previousAssistant.hostMessageId,
        eventType: 'directiveResponseSelectedSwipeChanged',
        verify(state) {
            assert.equal(state.mission.v1.events.includes('event.open-orders2.last-watch-assessed'), false);
            assert.equal(state.mission.v1.events.includes('event.open-orders2.second-opinion-assessed'), false);
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders2.last-watch-assessment'), false);
            assert.equal(state.mission.v1.outcomes['outcome.open-orders2.last-watch-result'], 'pending');
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders2.current-starfleet-credential-path'), true);
        },
    },
    {
        label: 'assignment report edit',
        hostMessageId: watchReportSnapshot.source.previousAssistant.hostMessageId,
        eventType: 'directiveResponseEdited',
        verify(state) {
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders2.last-watch-assessment'), false);
            assert.equal(state.mission.v1.outcomes['outcome.open-orders2.last-watch-result'], 'pending');
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders2.second-opinion-assessment'), true);
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders2.current-starfleet-credential-path'), true);
        },
    },
    {
        label: 'result and corroboration deletion',
        hostMessageId: resultsSnapshot.source.previousAssistant.hostMessageId,
        eventType: 'directiveResponseDeleted',
        verify(state) {
            assert.equal(state.mission.v1.outcomes['outcome.open-orders2.last-watch-result'], 'pending');
            assert.equal(state.mission.v1.outcomes['outcome.open-orders2.second-opinion-result'], 'pending');
            assert.equal(state.mission.v1.events.includes('event.open-orders2.credential-path-corroborated'), false);
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders2.current-starfleet-credential-path'), false);
            assert.equal(state.mission.v1.transitionReceipt, null);
        },
    },
    {
        label: 'credential report edit reopens terminal mission',
        state: finalState,
        hostMessageId: credentialReportSnapshot.source.previousAssistant.hostMessageId,
        eventType: 'directiveResponseEdited',
        verify(state) {
            assert.equal(state.mission.v1.events.includes('event.open-orders2.credential-path-corroborated'), true);
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders2.current-starfleet-credential-path'), false);
            assert.equal(state.mission.v1.outcomes['outcome.open-orders2.conclusion'], 'pending');
            assert.equal(state.mission.v1.status, 'active');
            assert.equal(state.mission.v1.transitionReceipt, null);
        },
    },
    {
        label: 'conclusion edit',
        state: finalState,
        hostMessageId: conclusionSnapshot.source.currentPlayer.hostMessageId,
        eventType: 'playerMessageEdited',
        verify(state) {
            assert.equal(state.mission.v1.knownFacts.includes('fact.open-orders2.current-starfleet-credential-path'), true);
            assert.equal(state.mission.v1.outcomes['outcome.open-orders2.conclusion'], 'pending');
            assert.equal(state.mission.v1.status, 'active');
            assert.equal(state.mission.v1.transitionReceipt, null);
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
        assistantText: 'A corridor light blinks once while the crew finishes a quiet meal after Orison.',
        playerText: 'I finish my tea and let the ship settle around us.',
    }),
});
assert.equal(quiet.status, 'settled-no-effect');
assert.equal(quiet.diagnostics.acceptedClaimCount, 0);
assert.equal(quietHarness.campaignState.mission.v1.revision, 0);
assert.deepEqual(quietHarness.campaignState.mission.v1.evidenceLog, []);
assert.equal(quietHarness.runtime.preparePendingDutyReport({
    runtimeAssets,
    availableActors,
    responseId: 'response.open-orders2.none',
    sourceTransactionId: 'transaction.open-orders2.none',
}).status, 'no-pending-report');
assert.deepEqual(legacyRoots(quietHarness.campaignState), quietRoots);

const assistantDecisionHarness = createHarness({
    outputs: [interpretation([
        candidate('policy.open-orders2.last-watch-engagement', 'previousAssistant', 'direct'),
    ])],
});
const assistantDecision = await assistantDecisionHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(21, {
        assistantText: 'The narration declares that the XO personally accepts The Last Watch.',
        playerText: 'I listen without making that decision.',
    }),
});
assert.equal(assistantDecision.status, 'unavailable');
assert.equal(assistantDecision.ok, false, 'unauthorized assistant decisions fail closed');
assert.equal(assistantDecisionHarness.campaignState.mission.v1, undefined);
assert.equal(assistantDecisionHarness.persistCount, 0);

assert.equal(mainHarness.generationCount, 12, 'report preparation and source rebuild add no provider calls; restoration reinterprets once');
assert.equal(opinionReportSnapshot.source.previousAssistant.selectedVariant.dutyReportCustodyOwned, true);
assert.equal(credentialReportSnapshot.source.previousAssistant.selectedVariant.dutyReportCustodyOwned, true);

console.log('Ashes V1 Open Orders II accepted-pair runtime tests passed.');
