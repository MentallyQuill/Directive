import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { deliveredDutyReportIds } from '../../src/mission/v1/duty-report-planner.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const definitionPath = 'packages/bundled/breckenridge/v1/chapter-6-the-cost-of-knowing.mission-v1.json';
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
            saveId: `save.chapter6-runtime.${suffix}`,
            chatId: `chat.chapter6-runtime.${suffix}`,
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
            saveId: `save.chapter6-runtime.${suffix}`,
            chatId: `chat.chapter6-runtime.${suffix}`,
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.chapter6.${suffix}.${number}`,
            previousAssistant: {
                hostMessageId: `message.chapter6.${suffix}.assistant.${number}`,
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
                hostMessageId: `message.chapter6.${suffix}.player.${number}`,
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
    const requests = [];
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => { persistCount += 1; },
        now: () => '2026-08-10T03:00:00.000Z',
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
        now: () => '2026-08-10T03:00:00.000Z',
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

const availableActors = [
    { id: 'priya-nayar', capabilityRoles: ['operations', 'intelligence'] },
    { id: 'imani-cross', capabilityRoles: ['engineering'] },
    { id: 'rowan-saye', capabilityRoles: ['science', 'sensors'] },
    { id: 'hadrik-bronn', capabilityRoles: ['security', 'tactical'] },
    { id: 'mara-whitaker', capabilityRoles: ['command'] },
];

function prepareReport(harness, suffix) {
    return harness.runtime.preparePendingDutyReport({
        runtimeAssets,
        availableActors,
        responseId: `response.chapter6.${suffix}`,
        sourceTransactionId: `transaction.chapter6.${suffix}`,
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
        interpretation([candidate('policy.chapter6.rourke-boundary', 'currentPlayer', 'restrictAccess')]),
        interpretation([candidate('policy.chapter6.false-emergency-active', 'previousAssistant')]),
        interpretation([candidate('policy.chapter6.network-response', 'currentPlayer', 'isolateAndVerify')]),
        interpretation([
            candidate('policy.chapter6.network-result', 'previousAssistant', 'contained'),
            candidate('policy.chapter6.farwatch-account-route', 'previousAssistant', 'lacunaArchive'),
            candidate('policy.chapter6.nightfall-risk-route', 'previousAssistant', 'lacunaTelemetry'),
        ]),
        interpretation([
            candidate('policy.chapter6.farwatch-account-disclosed', 'previousAssistant'),
            candidate('policy.chapter6.nightfall-risk-disclosed', 'previousAssistant'),
        ]),
        interpretation([candidate('policy.chapter6.nightfall-risk-disclosed', 'previousAssistant')]),
        interpretation([candidate('policy.chapter6.farwatch-account-disclosed', 'previousAssistant')]),
        interpretation([candidate('policy.chapter6.evidence-disposition', 'currentPlayer', 'jointIndependentCustody')]),
        interpretation([
            candidate('policy.chapter6.evidence-result', 'previousAssistant', 'assetSecured'),
            candidate('policy.chapter6.rourke-result', 'previousAssistant', 'cooperativeRestricted'),
            candidate('policy.chapter6.regional-information', 'previousAssistant', 'publicFramework'),
        ]),
        interpretation([
            candidate('policy.chapter6.evidence-result', 'previousAssistant', 'assetSecured'),
            candidate('policy.chapter6.rourke-result', 'previousAssistant', 'cooperativeRestricted'),
            candidate('policy.chapter6.regional-information', 'previousAssistant', 'publicFramework'),
        ]),
    ],
});
const rootsBefore = legacyRoots(mainHarness.campaignState);

const rourkeSnapshot = snapshot(1, {
    playerText: 'Rourke may cooperate, but I explicitly restrict his access to our network and evidence systems.',
});
const rourke = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: rourkeSnapshot });
assert.equal(rourke.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.chapter6.rourke-boundary'], 'restrictAccess');

const crisisSnapshot = snapshot(2, {
    assistantText: 'The authentic-looking recall, unauthorized purge, and compromise warning arrive together.',
});
const crisis = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: crisisSnapshot });
assert.equal(crisis.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.events.includes('event.chapter6.false-emergency-active'), true);

const networkChoiceSnapshot = snapshot(3, {
    playerText: 'Isolate the affected pathways and independently verify the recall before anyone complies.',
});
const networkChoice = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: networkChoiceSnapshot,
});
assert.equal(networkChoice.status, 'settled');

const routesSnapshot = snapshot(4, {
    assistantText: [
        'The crew contains the authenticated-path crisis without material new exposure.',
        'The Lacuna archive establishes a usable Farwatch operational account.',
        'Telemetry establishes the wider authenticated-path and Nightfall risk.',
    ].join(' '),
});
const routes = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: routesSnapshot });
assert.equal(routes.status, 'settled');
assert.equal(routes.diagnostics.acceptedClaimCount, 3);
assert.equal(
    new Set(mainHarness.campaignState.mission.v1.evidenceLog.slice(-3).map((entry) => entry.sourceContributionId)).size,
    1,
    'one selected generation owns the network result and both aggregate evidentiary routes',
);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter6.farwatch-operational-account'), false);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter6.authenticated-pathway-nightfall-risk'), false);

const smuggledReports = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(5, {
        assistantText: 'Generic narration tries to disclose both aggregate reports without Directive custody.',
    }),
});
assert.equal(smuggledReports.status, 'settled-no-effect');
assert.equal(smuggledReports.diagnostics.strippedRequiredDutyReportClaimCount, 2);
assert.equal(smuggledReports.diagnostics.rejectedDutyReportReasonCode, 'required-manifest-missing');

const riskReportSnapshot = await deliverNextReport(
    mainHarness,
    'report.chapter6.authenticated-pathway-nightfall-risk',
    6,
    'main',
);
assert.deepEqual(deliveredDutyReportIds({ definition, state: mainHarness.campaignState.mission.v1 }), [
    'report.chapter6.authenticated-pathway-nightfall-risk',
]);
assert.equal(mainHarness.campaignState.mission.v1.status, 'active');

const accountReportSnapshot = await deliverNextReport(
    mainHarness,
    'report.chapter6.farwatch-operational-account',
    7,
    'main',
);
assert.deepEqual(deliveredDutyReportIds({ definition, state: mainHarness.campaignState.mission.v1 }), [
    'report.chapter6.authenticated-pathway-nightfall-risk',
    'report.chapter6.farwatch-operational-account',
]);
assert.equal(prepareReport(mainHarness, 'main.none').status, 'no-pending-report');

const evidenceChoiceSnapshot = snapshot(8, {
    playerText: 'Now that I know the Farwatch account, preserve the archive under joint independent custody.',
});
const evidenceChoice = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: evidenceChoiceSnapshot,
});
assert.equal(evidenceChoice.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.chapter6.evidence-disposition'], 'jointIndependentCustody');

const finalResultsSnapshot = snapshot(9, {
    assistantText: [
        'An authenticated Farwatch Evidence Package survives under accountable custody.',
        'Rourke remains cooperative under material restrictions.',
        'Kessler and the Compact receive meaningful information through an accountable public framework.',
    ].join(' '),
});
const finalResults = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: finalResultsSnapshot,
});
assert.equal(finalResults.status, 'settled');
assert.equal(finalResults.diagnostics.acceptedClaimCount, 3);
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.terminalDisposition, 'accountablePreservation');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt.target.id, 'chapter-7-a-peace-of-their-own');
assert.equal(mainHarness.campaignState.mission.v1.outcomeDimensions['dimension.chapter6.evidence'], 'farwatch-evidence-package');
assert.equal(Object.keys(mainHarness.campaignState.mission.v1.objectives).length, 3);
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);
const finalState = structuredClone(mainHarness.campaignState);

const invalidatedResults = await mainHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: finalResultsSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(invalidatedResults.status, 'invalidated');
assert.equal(mainHarness.campaignState.mission.v1.status, 'active');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt, null);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.chapter6.evidence-result'], 'pending');
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter6.farwatch-operational-account'), true);
const restoredResults = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: finalResultsSnapshot,
});
assert.equal(restoredResults.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.evidenceLog.at(-1).sourceContributionId.endsWith('.r1'), true);
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);

const reportMutationHarness = createHarness({ state: finalState, outputs: [abstainedOutput] });
const invalidatedAccountReport = await reportMutationHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: accountReportSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'directiveResponseEdited',
});
assert.equal(invalidatedAccountReport.status, 'invalidated');
assert.equal(reportMutationHarness.campaignState.mission.v1.status, 'active');
assert.equal(reportMutationHarness.campaignState.mission.v1.transitionReceipt, null);
assert.equal(reportMutationHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter6.farwatch-operational-account'), false);
assert.equal(reportMutationHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter6.authenticated-pathway-nightfall-risk'), true);
assert.equal(reportMutationHarness.campaignState.mission.v1.outcomes['outcome.chapter6.evidence-disposition'], 'pending');
assert.equal(reportMutationHarness.generationCount, 0, 'source rebuild cannot call a provider');
assert.deepEqual(legacyRoots(reportMutationHarness.campaignState), rootsBefore);

const earlyHarness = createHarness({
    state: initialCampaignState('early'),
    outputs: [
        interpretation([
            candidate('policy.chapter6.evidence-result', 'previousAssistant', 'lostOrPurged'),
            candidate('policy.chapter6.rourke-result', 'previousAssistant', 'departedWithFarwatch'),
            candidate('policy.chapter6.regional-information', 'previousAssistant', 'privateBriefing'),
        ]),
        interpretation([
            candidate('policy.chapter6.false-emergency-active', 'previousAssistant'),
            candidate('policy.chapter6.network-result', 'previousAssistant', 'contained'),
            candidate('policy.chapter6.farwatch-account-route', 'previousAssistant', 'corroboratedTestimony'),
            candidate('policy.chapter6.nightfall-risk-route', 'previousAssistant', 'crossSystemCorroboration'),
        ]),
        interpretation([candidate('policy.chapter6.nightfall-risk-disclosed', 'previousAssistant')]),
        interpretation([candidate('policy.chapter6.farwatch-account-disclosed', 'previousAssistant')]),
    ],
});
const earlyRoots = legacyRoots(earlyHarness.campaignState);
const earlyLossSnapshot = snapshot(20, {
    suffix: 'early',
    assistantText: 'Before the full account is known, the archive is purged, Rourke departs with Farwatch, and Kessler receives a private warning.',
});
const earlyLoss = await earlyHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: earlyLossSnapshot,
});
assert.equal(earlyLoss.status, 'settled');
assert.equal(earlyHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter6.farwatch-operational-account'), false);
assert.equal(earlyHarness.campaignState.mission.v1.outcomes['outcome.chapter6.evidence-disposition'], 'pending');
assert.equal(earlyHarness.campaignState.mission.v1.objectives['objective.chapter6.evidence-authority'].disposition, 'completedWithCost');

const earlyRoutes = await earlyHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(21, {
        suffix: 'early',
        assistantText: 'The crisis is contained; testimony and cross-system records establish alternate routes to both truths.',
    }),
});
assert.equal(earlyRoutes.status, 'settled');
assert.equal(earlyRoutes.diagnostics.acceptedClaimCount, 4);
await deliverNextReport(
    earlyHarness,
    'report.chapter6.authenticated-pathway-nightfall-risk',
    22,
    'early',
);
await deliverNextReport(
    earlyHarness,
    'report.chapter6.farwatch-operational-account',
    23,
    'early',
);
assert.equal(earlyHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(earlyHarness.campaignState.mission.v1.terminalDisposition, 'evidenceLostForward');
assert.equal(earlyHarness.campaignState.mission.v1.outcomes['outcome.chapter6.evidence-disposition'], 'pending');
assert.equal(earlyHarness.campaignState.mission.v1.objectives['objective.chapter6.evidence-authority'].disposition, 'completedWithCost');
assert.deepEqual(legacyRoots(earlyHarness.campaignState), earlyRoots);

const quietHarness = createHarness({
    state: initialCampaignState('quiet'),
    outputs: [interpretation([], { assistantAcceptance: 'ambiguous', abstained: true })],
});
const quietRoots = legacyRoots(quietHarness.campaignState);
const quiet = await quietHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(30, {
        suffix: 'quiet',
        assistantText: 'A secure-room light flickers once while someone repeats an unverified corridor rumor.',
        playerText: 'I let the moment pass and return to my tea.',
    }),
});
assert.equal(quiet.status, 'settled-no-effect');
assert.equal(quiet.diagnostics.acceptedClaimCount, 0);
assert.equal(quietHarness.campaignState.mission.v1.revision, 0);
assert.deepEqual(quietHarness.campaignState.mission.v1.evidenceLog, []);
assert.deepEqual(legacyRoots(quietHarness.campaignState), quietRoots);

const assistantDecisionHarness = createHarness({
    state: initialCampaignState('authority'),
    outputs: [interpretation([
        candidate('policy.chapter6.rourke-boundary', 'previousAssistant', 'restrictAccess'),
    ])],
});
const assistantDecision = await assistantDecisionHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(31, {
        suffix: 'authority',
        assistantText: 'The narration declares that the XO restricts Rourke.',
        playerText: 'I listen without deciding.',
    }),
});
assert.equal(assistantDecision.status, 'unavailable');
assert.equal(assistantDecision.ok, false);
assert.equal(assistantDecisionHarness.campaignState.mission.v1, undefined);
assert.equal(assistantDecisionHarness.persistCount, 0);

assert.equal(riskReportSnapshot.source.previousAssistant.selectedVariant.dutyReportCustodyOwned, true);
assert.equal(accountReportSnapshot.source.previousAssistant.selectedVariant.dutyReportCustodyOwned, true);

console.log('Ashes V1 Chapter 6 accepted-pair runtime tests passed.');
