import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { deliveredDutyReportIds } from '../../src/mission/v1/duty-report-planner.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const definitionPath = 'packages/bundled/breckenridge/v1/chapter-5-old-lessons.mission-v1.json';
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
        campaignChatBinding: { saveId: 'save.chapter5-runtime', chatId: 'chat.chapter5-runtime' },
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
            saveId: 'save.chapter5-runtime',
            chatId: 'chat.chapter5-runtime',
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.chapter5.${number}`,
            previousAssistant: {
                hostMessageId: `message.chapter5.assistant.${number}`,
                text: assistantText,
                textHash: assistantHash,
                sourceIntegrity: 'clean',
                selectedVariantId: String(number),
                selectedVariant: { selectedVariantId: String(number), selectedTextHash: assistantHash, sourceIntegrity: 'clean' },
            },
            currentPlayer: {
                hostMessageId: `message.chapter5.player.${number}`,
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
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => { persistCount += 1; },
        now: () => '2026-08-10T00:15:00.000Z',
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
        now: () => '2026-08-10T00:15:00.000Z',
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
        progress: state.mission.progress,
    });
}

const outputs = [
    interpretation([candidate('policy.chapter5.traffic-result', 'previousAssistant', 'stabilized')]),
    interpretation([candidate('policy.chapter5.platform-result', 'previousAssistant', 'controlled')]),
    interpretation([candidate('policy.chapter5.concentration-evidence', 'previousAssistant')]),
    interpretation([candidate('policy.chapter5.concentration-disclosed', 'previousAssistant')]),
    interpretation([candidate('policy.chapter5.concentration-disclosed', 'previousAssistant')]),
    interpretation([], { assistantAcceptance: 'ambiguous', abstained: true }),
    interpretation([candidate('policy.chapter5.sigma-target-evidence', 'previousAssistant')]),
    interpretation([candidate('policy.chapter5.sigma-target-disclosed', 'previousAssistant')]),
    interpretation([candidate('policy.chapter5.control-chain-evidence', 'previousAssistant')]),
    interpretation([candidate('policy.chapter5.control-chain-disclosed', 'previousAssistant')]),
    interpretation([candidate('policy.chapter5.evidence-route', 'previousAssistant', 'direct')]),
    interpretation([
        candidate('policy.chapter5.sigma-decision', 'currentPlayer', 'recoverOrIsolate'),
        candidate('policy.chapter5.command-posture', 'currentPlayer', 'integrateAndTest'),
    ]),
    interpretation([
        candidate('policy.chapter5.sigma-result', 'previousAssistant', 'secured'),
        candidate('policy.chapter5.operator-result', 'previousAssistant', 'operatorCaptured'),
    ]),
];
const harness = createHarness({ outputs });
const rootsBefore = legacyRoots(harness.campaignState);

const traffic = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(1, { assistantText: 'The shared traffic picture holds; civilian and Compact movement stabilizes without material loss.' }),
});
assert.equal(traffic.status, 'settled');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter5.traffic-result'], 'stabilized');

const platform = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(2, { assistantText: 'O-17 accepts the authenticated lockout and remains under accountable control.' }),
});
assert.equal(platform.status, 'settled');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter5.platform-result'], 'controlled');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter5.safety'].disposition, 'completed');

const pattern = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(3, { assistantText: 'Traffic geometry and warning timing corroborate deliberate concentration and a material gap in the historical model.' }),
});
assert.equal(pattern.status, 'settled');

const smuggled = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(4, { assistantText: 'Generic narration attempts to reveal the concentration finding before its required report.' }),
});
assert.equal(smuggled.status, 'settled-no-effect');
assert.equal(smuggled.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(smuggled.diagnostics.rejectedDutyReportReasonCode, 'required-manifest-missing');
assert.equal(harness.campaignState.mission.v1.knownFacts.includes('fact.chapter5.concentration-and-model-gap'), false);

const availableActors = [
    { id: 'priya-nayar', capabilityRoles: ['operations'] },
    { id: 'rowan-saye', capabilityRoles: ['science'] },
    { id: 'hadrik-bronn', capabilityRoles: ['security'] },
    { id: 'imani-cross', capabilityRoles: ['engineering'] },
    { id: 'mara-whitaker', capabilityRoles: ['command'] },
];

function prepareReport(suffix) {
    return harness.runtime.preparePendingDutyReport({
        runtimeAssets,
        availableActors,
        responseId: `response.chapter5.report.${suffix}`,
        sourceTransactionId: `transaction.chapter5.report.${suffix}`,
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
    const result = snapshot(number, { assistantText: responseText });
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
    assert.equal(delivered.diagnostics.acceptedDutyReportCount, 1, expectedReportId);
}

await deliverNextReport('report.chapter5.concentration-and-model-gap', 5, 'deliberate concentration');

const insignificant = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(6, {
        assistantText: 'A bridge indicator blinks once as traffic data refreshes, then returns to normal.',
        playerText: 'I keep my attention on the tactical picture.',
    }),
});
assert.equal(insignificant.status, 'settled-no-effect');
assert.equal(insignificant.diagnostics.acceptedClaimCount, 0);
assert.equal(harness.campaignState.ship.conditions.length, 1, 'incidental prose cannot create a ship tracker');
assert.deepEqual(legacyRoots(harness.campaignState), rootsBefore);

const targetEvidence = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(7, { assistantText: 'Buoy diagnostics and response timing corroborate the technical target and doctrinal prediction.' }),
});
assert.equal(targetEvidence.status, 'settled');
await deliverNextReport('report.chapter5.sigma-target-and-doctrine-model', 8, 'actual technical objective');

const chainEvidence = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(9, { assistantText: 'Authenticated traffic and interface limits establish local initiation followed by wider autonomous escalation.' }),
});
assert.equal(chainEvidence.status, 'settled');
await deliverNextReport('report.chapter5.holt-initiation-and-autonomous-escalation', 10, 'expanded it');
assert.deepEqual(deliveredDutyReportIds({ definition, state: harness.campaignState.mission.v1 }), [
    'report.chapter5.concentration-and-model-gap',
    'report.chapter5.holt-initiation-and-autonomous-escalation',
    'report.chapter5.sigma-target-and-doctrine-model',
]);

const route = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(11, { assistantText: 'The complete account rests on direct traffic, buoy, platform, and operator evidence.' }),
});
assert.equal(route.status, 'settled');

const choiceSnapshot = snapshot(12, {
    playerText: 'Recover and isolate Sigma-4. Use Bronn’s pattern, but test every assumption against Rowan and Priya’s evidence.',
});
const choices = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: choiceSnapshot });
assert.equal(choices.status, 'settled');
assert.equal(choices.diagnostics.acceptedClaimCount, 2);
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter5.sigma-decision'], 'recoverOrIsolate');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter5.command-posture'], 'integrateAndTest');
assert.equal(harness.campaignState.mission.v1.status, 'active', 'choices alone cannot close the operation');
const choiceContributionIds = new Set(harness.campaignState.mission.v1.evidenceLog.slice(-2).map((entry) => entry.sourceContributionId));
assert.equal(choiceContributionIds.size, 1, 'one player message owns both independent choices without extra trackers');

const finalSnapshot = snapshot(13, {
    assistantText: 'Sigma-4 is secured under accountable isolation, and the identified operator is captured with the portable evidence intact.',
});
const terminal = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: finalSnapshot });
assert.equal(terminal.status, 'settled');
assert.equal(terminal.diagnostics.acceptedClaimCount, 2);
assert.equal(harness.campaignState.mission.v1.status, 'terminal');
assert.equal(harness.campaignState.mission.v1.terminalDisposition, 'multiFrontSuccess');
assert.equal(harness.campaignState.mission.v1.transitionReceipt.target.id, 'open-orders-2-what-survives');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter5.safety'].disposition, 'completed');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter5.operation'].disposition, 'completed');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter5.understanding'].disposition, 'completed');
assert.equal(new Set(harness.campaignState.mission.v1.evidenceLog.slice(-2).map((entry) => entry.sourceContributionId)).size, 1);
assert.deepEqual(legacyRoots(harness.campaignState), rootsBefore);

const invalidated = await harness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: finalSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(invalidated.status, 'invalidated');
assert.equal(harness.campaignState.mission.v1.status, 'active');
assert.equal(harness.campaignState.mission.v1.terminalDisposition, null);
assert.equal(harness.campaignState.mission.v1.transitionReceipt, null);
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter5.sigma-result'], 'pending');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter5.operator-result'], 'pending');

const restored = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: finalSnapshot });
assert.equal(restored.status, 'settled');
assert.equal(harness.campaignState.mission.v1.status, 'terminal');
assert.equal(harness.campaignState.mission.v1.evidenceLog.slice(-2).every((entry) => entry.sourceContributionId.endsWith('.r1')), true);
assert.equal(harness.generationCount, 14);
assert.ok(harness.persistCount > 0);
assert.deepEqual(legacyRoots(harness.campaignState), rootsBefore);

console.log('Ashes V1 Chapter 5 runtime tests passed.');
