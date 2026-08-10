import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { deliveredDutyReportIds } from '../../src/mission/v1/duty-report-planner.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const definitionPath = 'packages/bundled/breckenridge/v1/chapter-7-a-peace-of-their-own.mission-v1.json';
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
            saveId: `save.chapter7-runtime.${suffix}`,
            chatId: `chat.chapter7-runtime.${suffix}`,
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.chapter7.${suffix}.${number}`,
            previousAssistant: {
                hostMessageId: `message.chapter7.${suffix}.assistant.${number}`,
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
                hostMessageId: `message.chapter7.${suffix}.player.${number}`,
                text: playerText,
                textHash: playerHash,
                sourceIntegrity: 'clean',
            },
        },
    };
}

function timeBoundary(sceneSnapshot, elapsedMinutes) {
    return {
        id: `time.boundary.${sceneSnapshot.source.sourceRangeHash}`,
        kind: 'directive.timeBoundary.v1',
        type: 'time-advance',
        reason: 'explicit-duration',
        elapsedMinutes,
        source: 'timeAdvanceAdjudicator',
        sourceAnchorRange: {
            kind: 'sceneHandshakePair',
            previousAssistantHostMessageId: sceneSnapshot.source.previousAssistant.hostMessageId,
            currentPlayerHostMessageId: sceneSnapshot.source.currentPlayer.hostMessageId,
            rangeHash: sceneSnapshot.source.sourceRangeHash,
        },
    };
}

function initialCampaignState(suffix = 'main', boundary = null) {
    return {
        campaign: { id: 'campaign.ashes' },
        activeCampaignPackage: {
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
        },
        campaignChatBinding: {
            saveId: `save.chapter7-runtime.${suffix}`,
            chatId: `chat.chapter7-runtime.${suffix}`,
        },
        mission: {
            activeMissionId: definition.packageBinding.sourceId,
            legacyStatus: 'must-remain-unchanged',
            openAssignments: [{ id: 'legacy.assignment' }],
            pressure: { id: 'legacy.pressure' },
            rewards: [{ id: 'legacy.reward' }],
            progress: { id: 'legacy.progress' },
        },
        timeLedger: {
            entries: boundary ? [structuredClone(boundary)] : [],
            lastBoundary: boundary ? structuredClone(boundary) : null,
        },
        ship: { conditions: [{ id: 'legacy.ship' }] },
        relationships: { people: [{ id: 'legacy.relationship' }] },
        questLedger: { records: [{ id: 'legacy.quest' }] },
        threadLedger: { records: [{ id: 'legacy.thread' }] },
        commandLog: { entries: [{ id: 'legacy.command' }] },
        commandBearing: { current: 3 },
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

function createHarness({ state, outputs = [] } = {}) {
    let campaignState = structuredClone(state || initialCampaignState());
    let persistCount = 0;
    let generationCount = 0;
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => { persistCount += 1; },
        now: () => '2026-08-10T05:00:00.000Z',
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
        now: () => '2026-08-10T05:00:00.000Z',
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
    { id: 'priya-nayar', capabilityRoles: ['operations', 'command'] },
    { id: 'miriam-sato', capabilityRoles: ['counseling'] },
    { id: 'imani-cross', capabilityRoles: ['engineering'] },
    { id: 'rowan-saye', capabilityRoles: ['science'] },
    { id: 'mara-whitaker', capabilityRoles: ['command'] },
];

function prepareReport(harness, suffix) {
    return harness.runtime.preparePendingDutyReport({
        runtimeAssets,
        availableActors,
        responseId: `response.chapter7.${suffix}`,
        sourceTransactionId: `transaction.chapter7.${suffix}`,
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
const postureSnapshot = snapshot(1, {
    playerText: 'I will lead with direct negotiation while keeping an enforceable security boundary around Annex Six.',
});
const mainHarness = createHarness({
    state: initialCampaignState('main', timeBoundary(postureSnapshot, 90)),
    outputs: [
        interpretation([candidate('policy.chapter7.crisis-posture', 'currentPlayer', 'negotiation')]),
        interpretation([
            candidate('policy.chapter7.political-account-route', 'previousAssistant', 'directNegotiation'),
            candidate('policy.chapter7.interface-truth-route', 'previousAssistant', 'sharedLiveTelemetry'),
            candidate('policy.chapter7.standoff-result', 'previousAssistant', 'stabilized'),
            candidate('policy.chapter7.civilian-result', 'previousAssistant', 'protected'),
        ]),
        interpretation([
            candidate('policy.chapter7.political-account-disclosed', 'previousAssistant'),
            candidate('policy.chapter7.interface-truth-disclosed', 'previousAssistant'),
        ]),
        interpretation([candidate('policy.chapter7.interface-truth-disclosed', 'previousAssistant')]),
        interpretation([candidate('policy.chapter7.political-account-disclosed', 'previousAssistant')]),
        interpretation([
            candidate('policy.chapter7.interface-response', 'currentPlayer', 'sharedTelemetry'),
            candidate('policy.chapter7.settlement-framework', 'currentPlayer', 'otherConcreteFramework'),
        ]),
        interpretation([
            candidate('policy.chapter7.interface-result', 'previousAssistant', 'sharedControl'),
            candidate('policy.chapter7.settlement-result', 'previousAssistant', 'provisionalAccord'),
            candidate('policy.chapter7.annex-control', 'previousAssistant', 'sharedControl'),
            candidate('policy.chapter7.coalition-posture', 'previousAssistant', 'jointImplementation'),
        ]),
    ],
});
const rootsBefore = legacyRoots(mainHarness.campaignState);

const posture = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: postureSnapshot });
assert.equal(posture.status, 'settled');
assert.equal(posture.diagnostics.acceptedClaimCount, 2);
assert.equal(posture.diagnostics.acceptedTimeAdvanceCount, 1);
assert.equal(mainHarness.campaignState.mission.v1.clocks['clock.chapter7.task-group-arrival'].value, 34.5);
const timeEvidence = mainHarness.campaignState.mission.v1.evidenceLog.find((entry) => entry.claimType === 'timeAdvanced');
const timeContribution = mainHarness.campaignState.storySettlement.episodes
    .flatMap((episode) => episode.contributions)
    .find((contribution) => contribution.id === timeEvidence.sourceContributionId);
assert.equal(timeContribution.role, 'runtime');
assert.match(timeContribution.messageId, /^time-boundary:/);

const routesSnapshot = snapshot(2, {
    assistantText: [
        'Negotiation and public records establish the mixed legitimacy and faction account.',
        'Shared live telemetry proves manipulation affecting both sides.',
        'The standoff stabilizes and civilians remain protected.',
    ].join(' '),
});
const routes = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: routesSnapshot });
assert.equal(routes.status, 'settled');
assert.equal(routes.diagnostics.acceptedClaimCount, 4);
assert.equal(
    new Set(mainHarness.campaignState.mission.v1.evidenceLog.slice(-4).map((entry) => entry.sourceContributionId)).size,
    1,
    'one selected generation owns the aggregate routes and depicted standoff results',
);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter7.political-legitimacy-account'), false);
assert.equal(mainHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter7.mutual-telemetry-manipulation'), false);

const smuggledReports = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(3, {
        assistantText: 'Generic narration tries to disclose both aggregate accounts without Directive report custody.',
    }),
});
assert.equal(smuggledReports.status, 'settled-no-effect');
assert.equal(smuggledReports.diagnostics.strippedRequiredDutyReportClaimCount, 2);
assert.equal(smuggledReports.diagnostics.rejectedDutyReportReasonCode, 'required-manifest-missing');

const interfaceReportSnapshot = await deliverNextReport(
    mainHarness,
    'report.chapter7.interface-manipulation',
    4,
    'main',
);
const politicalReportSnapshot = await deliverNextReport(
    mainHarness,
    'report.chapter7.political-legitimacy',
    5,
    'main',
);
assert.deepEqual(deliveredDutyReportIds({ definition, state: mainHarness.campaignState.mission.v1 }), [
    'report.chapter7.interface-manipulation',
    'report.chapter7.political-legitimacy',
]);
assert.equal(prepareReport(mainHarness, 'main.none').status, 'no-pending-report');

const choicesSnapshot = snapshot(6, {
    playerText: 'Share independently verifiable telemetry and adopt a concrete bilateral arrangement with enforceable local review, even though it does not fit a standard charter template.',
});
const choices = await mainHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: choicesSnapshot });
assert.equal(choices.status, 'settled');
assert.equal(choices.diagnostics.acceptedClaimCount, 2);
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.chapter7.settlement-framework'], 'otherConcreteFramework');

const finalResultsSnapshot = snapshot(7, {
    assistantText: 'The accepted arrangement produces a provisional accord, shared Annex and interface control, and joint implementation by the coalition and task group.',
});
const finalResults = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: finalResultsSnapshot,
});
assert.equal(finalResults.status, 'settled');
assert.equal(finalResults.diagnostics.acceptedClaimCount, 4);
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.terminalDisposition, 'provisionalAccord');
assert.equal(mainHarness.campaignState.mission.v1.transitionReceipt.target.id, 'open-orders-3-before-the-lamps-go-out');
assert.equal(mainHarness.campaignState.mission.v1.clocks['clock.chapter7.task-group-arrival'].state, 'resolved');
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
assert.equal(mainHarness.campaignState.mission.v1.outcomes['outcome.chapter7.settlement-result'], 'pending');
const restoredResults = await mainHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: finalResultsSnapshot,
});
assert.equal(restoredResults.status, 'settled');
assert.equal(mainHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(mainHarness.campaignState.mission.v1.evidenceLog.at(-1).sourceContributionId.endsWith('.r1'), true);
assert.deepEqual(legacyRoots(mainHarness.campaignState), rootsBefore);

const reportMutationHarness = createHarness({ state: finalState, outputs: [abstainedOutput] });
const invalidatedPoliticalReport = await reportMutationHarness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: politicalReportSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'directiveResponseEdited',
});
assert.equal(invalidatedPoliticalReport.status, 'invalidated');
assert.equal(reportMutationHarness.campaignState.mission.v1.status, 'active');
assert.equal(reportMutationHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter7.political-legitimacy-account'), false);
assert.equal(reportMutationHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter7.mutual-telemetry-manipulation'), true);
assert.equal(reportMutationHarness.campaignState.mission.v1.outcomes['outcome.chapter7.settlement-framework'], 'pending');
assert.equal(reportMutationHarness.generationCount, 0, 'source rebuild cannot call a provider');
assert.deepEqual(legacyRoots(reportMutationHarness.campaignState), rootsBefore);

const earlyHarness = createHarness({
    state: initialCampaignState('early'),
    outputs: [
        interpretation([
            candidate('policy.chapter7.standoff-result', 'previousAssistant', 'openConflict'),
            candidate('policy.chapter7.civilian-result', 'previousAssistant', 'casualties'),
            candidate('policy.chapter7.interface-result', 'previousAssistant', 'retainedByHolt'),
            candidate('policy.chapter7.settlement-result', 'previousAssistant', 'openConflict'),
            candidate('policy.chapter7.annex-control', 'previousAssistant', 'contested'),
            candidate('policy.chapter7.coalition-posture', 'previousAssistant', 'openHostility'),
        ]),
        interpretation([
            candidate('policy.chapter7.political-account-route', 'previousAssistant', 'independentLegalReview'),
            candidate('policy.chapter7.interface-truth-route', 'previousAssistant', 'technicalIsolation'),
        ]),
        interpretation([candidate('policy.chapter7.interface-truth-disclosed', 'previousAssistant')]),
        interpretation([candidate('policy.chapter7.political-account-disclosed', 'previousAssistant')]),
    ],
});
const earlyConflict = await earlyHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(20, {
        suffix: 'early',
        assistantText: 'Before the manipulation account is known, violence widens, civilians die, Holt retains the interface, control fragments, and the forces enter open hostility.',
    }),
});
assert.equal(earlyConflict.status, 'settled');
assert.equal(earlyConflict.diagnostics.acceptedClaimCount, 6);
assert.equal(earlyHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter7.mutual-telemetry-manipulation'), false);
assert.equal(earlyHarness.campaignState.mission.v1.outcomes['outcome.chapter7.interface-response'], 'pending');
assert.equal(earlyHarness.campaignState.mission.v1.objectives['objective.chapter7.standoff'].disposition, 'completedWithCost');

const earlyRoutes = await earlyHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(21, {
        suffix: 'early',
        assistantText: 'Independent review and technical isolation establish alternate routes to the political and manipulation accounts.',
    }),
});
assert.equal(earlyRoutes.status, 'settled');
assert.equal(earlyRoutes.diagnostics.acceptedClaimCount, 2);
await deliverNextReport(earlyHarness, 'report.chapter7.interface-manipulation', 22, 'early');
await deliverNextReport(earlyHarness, 'report.chapter7.political-legitimacy', 23, 'early');
assert.equal(earlyHarness.campaignState.mission.v1.status, 'terminal');
assert.equal(earlyHarness.campaignState.mission.v1.terminalDisposition, 'openConflict');
assert.equal(earlyHarness.campaignState.mission.v1.outcomes['outcome.chapter7.interface-response'], 'pending');
assert.equal(earlyHarness.campaignState.mission.v1.outcomes['outcome.chapter7.settlement-framework'], 'pending');

const expirySnapshot = snapshot(30, { suffix: 'expiry' });
const expiryHarness = createHarness({
    state: initialCampaignState('expiry', timeBoundary(expirySnapshot, 36 * 60)),
    outputs: [abstainedOutput],
});
const expired = await expiryHarness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: expirySnapshot });
assert.equal(expired.status, 'settled');
assert.equal(expired.diagnostics.acceptedTimeAdvanceCount, 1);
assert.equal(expiryHarness.campaignState.mission.v1.status, 'active');
assert.equal(expiryHarness.campaignState.mission.v1.clocks['clock.chapter7.task-group-arrival'].state, 'expired');
assert.equal(expiryHarness.campaignState.mission.v1.events.includes('event.chapter7.task-group-arrived'), true);
assert.equal(expiryHarness.campaignState.mission.v1.transitionReceipt, null);

const quietHarness = createHarness({
    state: initialCampaignState('quiet'),
    outputs: [interpretation([], { assistantAcceptance: 'ambiguous', abstained: true })],
});
const quietRoots = legacyRoots(quietHarness.campaignState);
const quiet = await quietHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(31, {
        suffix: 'quiet',
        assistantText: 'A concourse light flickers once while someone repeats an unverified rumor.',
        playerText: 'I let the moment pass and return to the actual negotiation.',
    }),
});
assert.equal(quiet.status, 'settled-no-effect');
assert.equal(quiet.diagnostics.acceptedClaimCount, 0);
assert.equal(quietHarness.campaignState.mission.v1.revision, 0);
assert.deepEqual(quietHarness.campaignState.mission.v1.evidenceLog, []);
assert.deepEqual(legacyRoots(quietHarness.campaignState), quietRoots);

assert.equal(interfaceReportSnapshot.source.previousAssistant.selectedVariant.dutyReportCustodyOwned, true);
assert.equal(politicalReportSnapshot.source.previousAssistant.selectedVariant.dutyReportCustodyOwned, true);

console.log('Ashes V1 Chapter 7 accepted-pair runtime tests passed.');
