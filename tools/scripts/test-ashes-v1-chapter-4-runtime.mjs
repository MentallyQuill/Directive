import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { deliveredDutyReportIds } from '../../src/mission/v1/duty-report-planner.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const definitionPath = 'packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json';
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

function initialCampaignState() {
    return {
        campaign: { id: 'campaign.ashes' },
        activeCampaignPackage: {
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
        },
        campaignChatBinding: { saveId: 'save.chapter4-runtime', chatId: 'chat.chapter4-runtime' },
        mission: {
            activeMissionId: definition.packageBinding.sourceId,
            legacyStatus: 'must-remain-unchanged',
            openAssignments: [{ id: 'legacy.assignment' }],
            pressure: { id: 'legacy.pressure' },
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
            saveId: 'save.chapter4-runtime',
            chatId: 'chat.chapter4-runtime',
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.chapter4.${number}`,
            previousAssistant: {
                hostMessageId: `message.chapter4.assistant.${number}`,
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
                hostMessageId: `message.chapter4.player.${number}`,
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
        now: () => '2026-08-09T23:45:00.000Z',
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
        now: () => '2026-08-09T23:45:00.000Z',
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
        progress: state.mission.progress,
    });
}

const outputs = [
    interpretation([candidate('policy.chapter4.process-decision', 'currentPlayer', 'jointInquiry')]),
    interpretation([candidate('policy.chapter4.process-joint-result', 'previousAssistant', 'jointPublicInquiry')]),
    interpretation([candidate('policy.chapter4.history-evidence', 'previousAssistant')]),
    interpretation([candidate('policy.chapter4.history-disclosed', 'previousAssistant')]),
    interpretation([candidate('policy.chapter4.history-disclosed', 'previousAssistant')]),
    interpretation([], { assistantAcceptance: 'ambiguous', abstained: true }),
    interpretation([candidate('policy.chapter4.solenn-evidence', 'previousAssistant')]),
    interpretation([candidate('policy.chapter4.solenn-disclosed', 'previousAssistant')]),
    interpretation([candidate('policy.chapter4.access-evidence', 'previousAssistant')]),
    interpretation([candidate('policy.chapter4.access-disclosed', 'previousAssistant')]),
    interpretation([candidate('policy.chapter4.evidence-route', 'previousAssistant', 'directInquiry')]),
    interpretation([candidate('policy.chapter4.solenn-decision', 'currentPlayer', 'restorativeProceedings')]),
    interpretation([candidate('policy.chapter4.interface-decision', 'currentPlayer', 'sharedOversight')]),
    interpretation([
        candidate('policy.chapter4.solenn-restorative-result', 'previousAssistant', 'restorativeProcess'),
        candidate('policy.chapter4.interface-shared-result', 'previousAssistant', 'sharedSecured'),
    ]),
];
const harness = createHarness({ outputs });
const rootsBefore = legacyRoots(harness.campaignState);

const processChoiceSnapshot = snapshot(1, {
    playerText: 'Negotiate a joint public inquiry with Demeris and protect the witness process.',
});
const processChoice = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: processChoiceSnapshot });
assert.equal(processChoice.status, 'settled');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter4.process-decision'], 'jointInquiry');
const processContributionId = harness.campaignState.mission.v1.evidenceLog.at(-1).sourceContributionId;
const processContribution = harness.campaignState.storySettlement.episodes
    .flatMap((episode) => episode.contributions || [])
    .find((contribution) => contribution.id === processContributionId);
assert.equal(processContribution?.role, 'user', 'the inquiry posture is owned by player prose');

const processResult = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(2, { assistantText: 'Marr and the Breckenridge establish the joint public inquiry with witnessed safeguards.' }),
});
assert.equal(processResult.status, 'settled');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter4.process-result'], 'jointPublicInquiry');

const historyEvidence = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(3, { assistantText: 'The inquiry corroborates the relief and evacuation record from independent archives.' }),
});
assert.equal(historyEvidence.status, 'settled');

const smuggled = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(4, { assistantText: 'Generic narration attempts to reveal the wartime record before its required report.' }),
});
assert.equal(smuggled.status, 'settled-no-effect');
assert.equal(smuggled.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(smuggled.diagnostics.rejectedDutyReportReasonCode, 'required-manifest-missing');
assert.equal(harness.campaignState.mission.v1.knownFacts.includes('fact.chapter4.survival-and-evacuation-record'), false);

const availableActors = [
    { id: 'priya-nayar', capabilityRoles: ['operations'] },
    { id: 'rowan-saye', capabilityRoles: ['science'] },
    { id: 'imani-cross', capabilityRoles: ['engineering'] },
    { id: 'miriam-sato', capabilityRoles: ['medical'] },
    { id: 'hadrik-bronn', capabilityRoles: ['security'] },
    { id: 'mara-whitaker', capabilityRoles: ['command'] },
];

function prepareReport(suffix) {
    return harness.runtime.preparePendingDutyReport({
        runtimeAssets,
        availableActors,
        responseId: `response.chapter4.report.${suffix}`,
        sourceTransactionId: `transaction.chapter4.report.${suffix}`,
    });
}

function snapshotForReport(preparation, number) {
    const responseText = `The assigned officer gives the report. ${preparation.segment.canonicalText} The briefing continues.`;
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
        playerText: 'Understood. Preserve that aggregate finding in the mission record.',
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

async function deliverNextReport(expectedReportId, number, expectedText) {
    const preparation = prepareReport(expectedReportId.split('.').at(-1));
    assert.equal(preparation.ok, true, expectedReportId);
    assert.equal(preparation.status, 'ready', expectedReportId);
    assert.equal(preparation.packet.reportId, expectedReportId);
    assert.equal(preparation.segment.canonicalText.includes(expectedText), true, expectedReportId);
    const delivered = await harness.runtime.settleAcceptedPair({
        runtimeAssets,
        snapshot: snapshotForReport(preparation, number),
    });
    assert.equal(delivered.ok, true, expectedReportId);
    assert.equal(delivered.diagnostics.acceptedDutyReportCount, 1, expectedReportId);
}

await deliverNextReport('report.chapter4.survival-and-evacuation-record', 5, 'wartime decision');
assert.equal(harness.campaignState.mission.v1.knownFacts.includes('fact.chapter4.survival-and-evacuation-record'), true);

const insignificant = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(6, {
        assistantText: 'A corridor light flickers once and steadies without changing any operational condition.',
        playerText: 'I glance toward it, then return to the inquiry.',
    }),
});
assert.equal(insignificant.status, 'settled-no-effect');
assert.equal(insignificant.diagnostics.acceptedClaimCount, 0);
assert.equal(harness.campaignState.ship.conditions.length, 1, 'incidental prose cannot create a ship tracker');
assert.deepEqual(legacyRoots(harness.campaignState), rootsBefore);

const solennEvidence = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(7, { assistantText: 'Testimony and records corroborate the benefits, wider use, forged clearance, and concealed deaths.' }),
});
assert.equal(solennEvidence.status, 'settled');
await deliverNextReport('report.chapter4.solenn-use-benefit-and-harm', 8, 'forged clearance');

const accessEvidence = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(9, { assistantText: 'Recovered access records corroborate continuing Compact use and the Orison lead.' }),
});
assert.equal(accessEvidence.status, 'settled');
await deliverNextReport('report.chapter4.continuing-access-and-orison-route', 10, 'Orison response scenario');
assert.deepEqual(deliveredDutyReportIds({ definition, state: harness.campaignState.mission.v1 }), [
    'report.chapter4.continuing-access-and-orison-route',
    'report.chapter4.solenn-use-benefit-and-harm',
    'report.chapter4.survival-and-evacuation-record',
]);

const route = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(11, { assistantText: 'The completed joint inquiry supplied the direct evidentiary route.' }),
});
assert.equal(route.status, 'settled');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter4.evidence-route'], 'directInquiry');

const solennChoice = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(12, { playerText: 'Use restorative proceedings for Solenn under the public record.' }),
});
assert.equal(solennChoice.status, 'settled');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter4.solenn-decision'], 'restorativeProceedings');

const interfaceChoice = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(13, { playerText: 'Place the interface under accountable shared oversight.' }),
});
assert.equal(interfaceChoice.status, 'settled');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter4.interface-decision'], 'sharedOversight');
assert.equal(harness.campaignState.mission.v1.status, 'active', 'choices alone cannot close the mission');

const finalSnapshot = snapshot(14, {
    assistantText: 'The restorative process formally begins, and shared technical custody is actually secured under witnessed controls.',
});
const terminal = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: finalSnapshot });
assert.equal(terminal.status, 'settled');
assert.equal(terminal.diagnostics.acceptedClaimCount, 2);
assert.equal(harness.campaignState.mission.v1.status, 'terminal');
assert.equal(harness.campaignState.mission.v1.terminalDisposition, 'sharedAccountability');
assert.equal(harness.campaignState.mission.v1.transitionReceipt.target.id, 'chapter-5-old-lessons');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter4.process'].disposition, 'completed');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter4.truth'].disposition, 'completed');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter4.accountability'].disposition, 'completed');
assert.equal(
    new Set(harness.campaignState.mission.v1.evidenceLog.slice(-2).map((entry) => entry.sourceContributionId)).size,
    1,
    'one accepted generation can settle both authored accountability aggregates without creating story trackers',
);
assert.deepEqual(legacyRoots(harness.campaignState), rootsBefore);

const invalidated = await harness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: finalSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(invalidated.ok, true);
assert.equal(invalidated.status, 'invalidated');
assert.equal(harness.campaignState.mission.v1.status, 'active');
assert.equal(harness.campaignState.mission.v1.terminalDisposition, null);
assert.equal(harness.campaignState.mission.v1.transitionReceipt, null);
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter4.solenn-result'], 'pending');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter4.interface-result'], 'pending');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter4.accountability'].disposition, null);

const restored = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: finalSnapshot });
assert.equal(restored.status, 'settled');
assert.equal(harness.campaignState.mission.v1.status, 'terminal');
assert.equal(
    harness.campaignState.mission.v1.evidenceLog.slice(-2).every((entry) => entry.sourceContributionId.endsWith('.r1')),
    true,
    'restored selected swipe advances the source custody epoch',
);
assert.equal(harness.generationCount, 15);
assert.ok(harness.persistCount > 0);
assert.deepEqual(legacyRoots(harness.campaignState), rootsBefore);

console.log('Ashes V1 Chapter 4 runtime tests passed.');
