import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { deliveredDutyReportIds } from '../../src/mission/v1/duty-report-planner.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const definitionPath = 'packages/bundled/breckenridge/v1/open-orders-3-before-the-lamps-go-out.mission-v1.json';
const definition = JSON.parse(fs.readFileSync(definitionPath, 'utf8'));
const definitionRecord = { path: definitionPath, definition };
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

function initialCampaignState(suffix = 'main') {
    return {
        campaign: { id: 'campaign.ashes' },
        activeCampaignPackage: {
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
        },
        campaignChatBinding: {
            saveId: `save.open-orders3-runtime.${suffix}`,
            chatId: `chat.open-orders3-runtime.${suffix}`,
        },
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
    suffix = 'main',
    assistantText = 'The selected assistant response.',
    playerText = 'I acknowledge the report and continue.',
} = {}) {
    const assistantHash = String(number).padStart(2, '0').repeat(32);
    const playerHash = String(number + 40).padStart(2, '0').repeat(32);
    return {
        kind: 'directive.sceneHandshakeSnapshot.v1',
        envelope: {
            campaignId: 'campaign.ashes',
            saveId: `save.open-orders3-runtime.${suffix}`,
            chatId: `chat.open-orders3-runtime.${suffix}`,
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.open-orders3.${suffix}.${number}`,
            previousAssistant: {
                hostMessageId: `message.open-orders3.${suffix}.assistant.${number}`,
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
                hostMessageId: `message.open-orders3.${suffix}.player.${number}`,
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

function createHarness({ state = initialCampaignState(), outputs = [] } = {}) {
    let campaignState = structuredClone(state);
    let persistCount = 0;
    let generationCount = 0;
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => { persistCount += 1; },
        now: () => '2026-08-10T08:00:00.000Z',
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
        now: () => '2026-08-10T08:00:00.000Z',
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
    { id: 'mara-whitaker', capabilityRoles: ['command'] },
    { id: 'miriam-sato', capabilityRoles: ['counseling'] },
    { id: 'priya-nayar', capabilityRoles: ['operations', 'command'] },
    { id: 'rowan-saye', capabilityRoles: ['science'] },
    { id: 'hadrik-bronn', capabilityRoles: ['security'] },
    { id: 'imani-cross', capabilityRoles: ['engineering'] },
];

function prepareReport(harness, suffix) {
    return harness.runtime.preparePendingDutyReport({
        runtimeAssets,
        availableActors,
        responseId: `response.open-orders3.report.${suffix}`,
        sourceTransactionId: `transaction.open-orders3.report.${suffix}`,
    });
}

function snapshotForReport(preparation, number, suffix) {
    const responseText = `The assigned officer gives one aggregate report. ${preparation.segment.canonicalText}`;
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
        suffix,
        assistantText: responseText,
        playerText: 'Understood. Preserve the aggregate finding in the shared record.',
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

async function deliverNextReport(harness, expectedReportId, number, suffix) {
    const preparation = prepareReport(harness, `${suffix}.${number}`);
    assert.equal(preparation.ok, true, expectedReportId);
    assert.equal(preparation.status, 'ready', expectedReportId);
    assert.equal(preparation.packet.reportId, expectedReportId);
    const reportSnapshot = snapshotForReport(preparation, number, suffix);
    const delivered = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: reportSnapshot });
    assert.equal(delivered.ok, true, expectedReportId);
    assert.equal(delivered.diagnostics.acceptedDutyReportCount, 1, expectedReportId);
    return reportSnapshot;
}

const abstainedOutput = interpretation([], { assistantAcceptance: 'accepted', abstained: true });
const mainHarness = createHarness({
    outputs: [
        interpretation([
            candidate('policy.open-orders3.name-engagement', 'currentPlayer', 'direct'),
            candidate('policy.open-orders3.signal-engagement', 'currentPlayer', 'delegated'),
            candidate('policy.open-orders3.signatures-engagement', 'currentPlayer', 'declined'),
        ]),
        interpretation([candidate('policy.open-orders3.signal-result', 'previousAssistant', 'assetEarned')]),
        interpretation([
            candidate('policy.open-orders3.name-assessed', 'previousAssistant'),
            candidate('policy.open-orders3.signal-assessed', 'previousAssistant'),
        ]),
        interpretation([candidate('policy.open-orders3.name-assessment-disclosed', 'previousAssistant')]),
        abstainedOutput,
        abstainedOutput,
        interpretation([
            candidate('policy.open-orders3.name-result', 'previousAssistant', 'assetEarned'),
            candidate('policy.open-orders3.signal-result', 'previousAssistant', 'resolvedWithoutAsset'),
            candidate('policy.open-orders3.readiness-prepared', 'previousAssistant'),
        ]),
        interpretation([candidate('policy.open-orders3.readiness-disclosed', 'previousAssistant')]),
        abstainedOutput,
        interpretation([candidate('policy.open-orders3.conclude-after-two', 'currentPlayer', 'concludeAfterTwo')]),
        abstainedOutput,
        interpretation([
            candidate('policy.open-orders3.signal-result', 'previousAssistant', 'resolvedWithoutAsset'),
        ]),
        interpretation([candidate('policy.open-orders3.conclude-after-two', 'currentPlayer', 'concludeAfterTwo')]),
    ],
});
const rootsBefore = legacyRoots(mainHarness.campaignState);

const engagementSnapshot = snapshot(1, {
    playerText: [
        'I will personally lead The Name on the Hull.',
        'I delegate A Signal Toward Home to Rowan and Priya.',
        'We will knowingly leave Two Signatures unpursued during this interval.',
    ].join(' '),
});
const engagements = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: engagementSnapshot });
assert.equal(engagements.status, 'settled');
assert.equal(engagements.diagnostics.acceptedClaimCount, 3);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders3.name-engagement'], 'direct');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders3.signal-engagement'], 'delegated');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders3.signatures-engagement'], 'declined');
assert.equal(new Set(mainHarness.campaignState.mission.v1.evidenceLog
    .slice(-3).map((entry) => entry.sourceContributionId)).size, 1);

const prematureResult = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(2, {
        assistantText: 'Delegation alone means the relay capability is already ours.',
    }),
});
assert.equal(prematureResult.status, 'settled-no-effect');
assert.equal(prematureResult.diagnostics.rejectedClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders3.signal-result'], 'pending');

const assessmentSnapshot = snapshot(3, {
    assistantText: 'Whitaker and Sato complete the name assessment while Rowan and Priya complete the signal assessment.',
});
const assessments = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: assessmentSnapshot });
assert.equal(assessments.status, 'settled');
assert.equal(assessments.diagnostics.acceptedClaimCount, 2);

const smuggledAssignmentReport = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(4, {
        assistantText: 'A generic narration line tries to disclose the name assessment without report custody.',
    }),
});
assert.equal(smuggledAssignmentReport.status, 'settled-no-effect');
assert.equal(smuggledAssignmentReport.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders3.name-assessment'), false);

const nameReportSnapshot = await deliverNextReport(
    mainHarness,
    'report.open-orders3.name-assessment',
    5,
    'main',
);
const signalReportSnapshot = await deliverNextReport(
    mainHarness,
    'report.open-orders3.signal-assessment',
    6,
    'main',
);
assert.deepEqual(deliveredDutyReportIds({ definition, state: mainHarness.campaignState.mission.v1 }), [
    'report.open-orders3.name-assessment',
    'report.open-orders3.signal-assessment',
]);

const resultsSnapshot = snapshot(7, {
    assistantText: 'The name settlement earns goodwill, the signal work closes responsibly without a durable asset, and the distributed readiness review is complete.',
});
const results = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: resultsSnapshot });
assert.equal(results.status, 'settled');
assert.equal(results.diagnostics.acceptedClaimCount, 3);
assert.equal(mainHarness.campaignState.mission.v1.events.includes('event.open-orders3.readiness-prepared'), true);

const smuggledReadiness = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(8, {
        assistantText: 'Generic narration tries to disclose the critical readiness result without a manifest.',
    }),
});
assert.equal(smuggledReadiness.status, 'settled-no-effect');
assert.equal(smuggledReadiness.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders3.distributed-readiness'), false);

const readinessReportSnapshot = await deliverNextReport(
    mainHarness,
    'report.open-orders3.distributed-readiness',
    9,
    'main',
);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders3.distributed-readiness'), true);
assert.equal(prepareReport(mainHarness, 'none').status, 'no-pending-report');

const conclusionSnapshot = snapshot(10, {
    playerText: 'The two resolved assignments are enough. Conclude this interval and proceed with the remaining work recorded.',
});
const conclusionResult = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: conclusionSnapshot,
});
assert.equal(conclusionResult.status, 'settled');
assert.equal(conclusionResult.diagnostics.acceptedClaimCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.terminalDisposition, 'responsibleInterval');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt.target.id, 'chapter-8-the-last-directive');
assert.equal(mainHarness.campaignState.mission.v1.objectives['objective.open-orders3.signatures'].disposition, 'knowinglyDeclined');
assert.equal(mainHarness.campaignState.mission.v1.outcomeDimensions['dimension.open-orders3.signatures'], 'declined');
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);
const terminalState = structuredClone(mainHarness.campaignState);

const invalidatedSignalReport = await mainHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: signalReportSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(invalidatedSignalReport.status, 'invalidated');
assert.equal(mainHarness.campaignState.mission.v1.status, 'active');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt, null);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders3.name-assessment'), true);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders3.signal-assessment'), false);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders3.name-result'], 'assetEarned');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders3.signal-result'], 'pending');
assert.equal(mainHarness.generationCount, 10, 'source rebuild cannot call a provider');
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);

const restoredSignalReport = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: signalReportSnapshot,
});
assert.equal(restoredSignalReport.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders3.signal-assessment'), true);
const restoredSignalEvidence = mainHarness.campaignState.mission.v1.evidenceLog
    .find((entry) => entry.targetId === 'fact.open-orders3.signal-assessment');
assert.equal(restoredSignalEvidence.sourceContributionId.endsWith('.r1'), true);

const restoredResults = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(11, {
        assistantText: 'With the restored assessment in custody, the relay work closes responsibly without a durable asset.',
    }),
});
assert.equal(restoredResults.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.open-orders3.signal-result'], 'resolvedWithoutAsset');
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.open-orders3.distributed-readiness'), true);
const restoredConclusion = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(12, {
        playerText: 'The restored record supports the same normal two-assignment conclusion. Proceed.',
    }),
});
assert.equal(restoredConclusion.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt.target.id, 'chapter-8-the-last-directive');
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);

const consentHarness = createHarness({
    state: initialCampaignState('consent'),
    outputs: [
        interpretation([candidate('policy.open-orders3.signatures-engagement', 'currentPlayer', 'direct')]),
        interpretation([candidate('policy.open-orders3.signatures-assessed', 'previousAssistant')]),
        abstainedOutput,
        interpretation([candidate('policy.open-orders3.signatures-result', 'currentPlayer', 'assetEarned')]),
    ],
});
await consentHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(20, {
        suffix: 'consent',
        playerText: 'I will support Imani directly while preserving her independent decision.',
    }),
});
await consentHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(21, {
        suffix: 'consent',
        assistantText: 'The representation, precedent, Helix need, and consent assessment is complete.',
    }),
});
await deliverNextReport(
    consentHarness,
    'report.open-orders3.signatures-assessment',
    22,
    'consent',
);
const selfCertifiedConsent = await consentHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(23, {
        suffix: 'consent',
        playerText: 'I declare that Imani consented and that the Cross Isolation Protocol is ours.',
    }),
});
assert.equal(selfCertifiedConsent.status, 'unavailable');
assert.equal(selfCertifiedConsent.reasonCode, 'invalid-output');
assert.equal(selfCertifiedConsent.noChange, true);
assert.equal(consentHarness.campaignState.mission.v1.outcomes['outcome.open-orders3.signatures-result'], 'pending');

const quietHarness = createHarness({
    state: initialCampaignState('quiet'),
    outputs: [interpretation([], { assistantAcceptance: 'ambiguous', abstained: true })],
});
const quietRoots = legacyRoots(quietHarness.campaignState);
const quiet = await quietHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(30, {
        suffix: 'quiet',
        assistantText: 'A corridor light flickers once while two crew members exchange a passing joke.',
        playerText: 'I let the moment pass and return to the actual preparation work.',
    }),
});
assert.equal(quiet.status, 'settled-no-effect');
assert.equal(quiet.diagnostics.acceptedClaimCount, 0);
assert.equal(quietHarness.campaignState.mission.v1.revision, 0);
assert.deepEqual(quietHarness.campaignState.mission.v1.evidenceLog, []);
assert.deepEqual(legacyRoots(quietHarness.campaignState), quietRoots);

assert.equal(nameReportSnapshot.source.previousAssistant.selectedVariant.dutyReportCustodyOwned, true);
assert.equal(readinessReportSnapshot.source.previousAssistant.selectedVariant.dutyReportCustodyOwned, true);
assert.equal(terminalState.mission.v1.status, 'terminal');

console.log('Ashes V1 Open Orders III accepted-pair runtime tests passed.');
