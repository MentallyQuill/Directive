import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { deliveredDutyReportIds } from '../../src/mission/v1/duty-report-planner.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json',
    'utf8',
));
const definitionRecord = {
    path: 'packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json',
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
        campaignChatBinding: { saveId: 'save.chapter3-runtime', chatId: 'chat.chapter3-runtime' },
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
            saveId: 'save.chapter3-runtime',
            chatId: 'chat.chapter3-runtime',
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.chapter3.${number}`,
            previousAssistant: {
                hostMessageId: `message.chapter3.assistant.${number}`,
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
                hostMessageId: `message.chapter3.player.${number}`,
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
        now: () => '2026-08-09T23:30:00.000Z',
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
        now: () => '2026-08-09T23:30:00.000Z',
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
    interpretation([candidate('policy.chapter3.access-result', 'previousAssistant', 'safeAccess')]),
    interpretation([candidate('policy.chapter3.site-contact', 'previousAssistant')]),
    interpretation([candidate('policy.chapter3.relay-character-disclosed', 'previousAssistant')]),
    interpretation([candidate('policy.chapter3.relay-character-disclosed', 'previousAssistant')]),
    interpretation([], { assistantAcceptance: 'ambiguous', abstained: true }),
    interpretation([candidate('policy.chapter3.relay-evidence', 'previousAssistant')]),
    interpretation([candidate('policy.chapter3.architecture-disclosed', 'previousAssistant')]),
    interpretation([candidate('policy.chapter3.direct-access-evidence', 'previousAssistant')]),
    interpretation([candidate('policy.chapter3.access-route-disclosed', 'previousAssistant')]),
    interpretation([candidate('policy.chapter3.relay-decision', 'currentPlayer', 'isolate')]),
    interpretation([candidate('policy.chapter3.archive-decision', 'currentPlayer', 'jointProtection')]),
    interpretation([
        candidate('policy.chapter3.relay-isolated', 'previousAssistant', 'preservedIsolated'),
        candidate('policy.chapter3.archive-protected-joint', 'previousAssistant', 'protectedJoint'),
    ]),
];
const harness = createHarness({ outputs });
const rootsBefore = legacyRoots(harness.campaignState);

const accessSnapshot = snapshot(1, {
    assistantText: 'The Breckenridge establishes a stable operating position near Hecate Seven.',
});
const access = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: accessSnapshot });
assert.equal(access.status, 'settled');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter3.access-result'], 'safeAccess');

const contactSnapshot = snapshot(2, {
    assistantText: 'The completed sensor pass establishes sustained technical contact with the installation.',
});
const contact = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: contactSnapshot });
assert.equal(contact.status, 'settled');
assert.equal(harness.campaignState.mission.v1.events.includes('event.chapter3.site-contact-established'), true);

const smuggled = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(3, {
        assistantText: 'A generic narration line attempts to reveal the installation before a required report is delivered.',
    }),
});
assert.equal(smuggled.status, 'settled-no-effect');
assert.equal(smuggled.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(smuggled.diagnostics.rejectedDutyReportReasonCode, 'required-manifest-missing');
assert.equal(harness.campaignState.mission.v1.knownFacts.includes('fact.chapter3.relay-archive-character'), false);

const availableActors = [
    { id: 'priya-nayar', capabilityRoles: ['operations'] },
    { id: 'rowan-saye', capabilityRoles: ['science'] },
    { id: 'imani-cross', capabilityRoles: ['engineering'] },
    { id: 'hadrik-bronn', capabilityRoles: ['security'] },
    { id: 'mara-whitaker', capabilityRoles: ['command'] },
];

function prepareReport(suffix) {
    return harness.runtime.preparePendingDutyReport({
        runtimeAssets,
        availableActors,
        responseId: `response.chapter3.report.${suffix}`,
        sourceTransactionId: `transaction.chapter3.report.${suffix}`,
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
        playerText: 'Understood. Preserve that finding in the mission record.',
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

await deliverNextReport('report.chapter3.relay-archive-character', 4, 'Dominion-origin');
assert.equal(harness.campaignState.mission.v1.knownFacts.includes('fact.chapter3.relay-archive-character'), true);

const insignificant = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(5, {
        assistantText: 'A console light flickers once and steadies without changing any mission condition.',
        playerText: 'I glance at it, then return my attention to the briefing.',
    }),
});
assert.equal(insignificant.status, 'settled-no-effect');
assert.equal(insignificant.diagnostics.acceptedClaimCount, 0);
assert.equal(harness.campaignState.ship.conditions.length, 1, 'incidental prose cannot create a ship tracker');
assert.deepEqual(legacyRoots(harness.campaignState), rootsBefore);

const relayEvidence = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(6, {
        assistantText: 'The completed analysis recovers enough system evidence for a bounded architectural assessment.',
    }),
});
assert.equal(relayEvidence.status, 'settled');
await deliverNextReport('report.chapter3.network-architecture-picture', 7, 'distributed predictive node');

const accessEvidence = await harness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(8, {
        assistantText: 'The recovered logs and traffic records establish a supportable access history and next lead.',
    }),
});
assert.equal(accessEvidence.status, 'settled');
await deliverNextReport('report.chapter3.access-history-and-demeris-route', 9, 'Demeris');
assert.deepEqual(deliveredDutyReportIds({
    definition,
    state: harness.campaignState.mission.v1,
}), [
    'report.chapter3.access-history-and-demeris-route',
    'report.chapter3.network-architecture-picture',
    'report.chapter3.relay-archive-character',
]);

const relayChoiceSnapshot = snapshot(10, {
    playerText: 'Preserve and isolate the physical relay under accountable control.',
});
const relayChoice = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: relayChoiceSnapshot });
assert.equal(relayChoice.status, 'settled');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter3.relay-decision'], 'isolate');
const relayDecisionContributionId = harness.campaignState.mission.v1.evidenceLog.at(-1).sourceContributionId;
const relayDecisionContribution = harness.campaignState.storySettlement.episodes
    .flatMap((episode) => episode.contributions || [])
    .find((contribution) => contribution.id === relayDecisionContributionId);
assert.equal(
    relayDecisionContribution?.role,
    'user',
    'the physical-system decision is owned by player prose',
);

const archiveChoiceSnapshot = snapshot(11, {
    playerText: 'Place the recovered human material under accountable joint protection with affected communities.',
});
const archiveChoice = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: archiveChoiceSnapshot });
assert.equal(archiveChoice.status, 'settled');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter3.archive-decision'], 'jointProtection');
assert.equal(harness.campaignState.mission.v1.status, 'active', 'choices alone cannot close the mission');

const finalSnapshot = snapshot(12, {
    assistantText: 'The relay is actually isolated under accountable control, and the archive transfer completes under witnessed joint protection.',
});
const terminal = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: finalSnapshot });
assert.equal(terminal.status, 'settled');
assert.equal(terminal.diagnostics.acceptedClaimCount, 2);
assert.equal(harness.campaignState.mission.v1.status, 'terminal');
assert.equal(harness.campaignState.mission.v1.terminalDisposition, 'accountableIsolation');
assert.equal(harness.campaignState.mission.v1.transitionReceipt.target.id, 'chapter-4-the-colony-that-stayed');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter3.access'].disposition, 'completed');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter3.evidence'].disposition, 'completed');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter3.custody'].disposition, 'completed');
assert.equal(
    new Set(harness.campaignState.mission.v1.evidenceLog.slice(-2).map((entry) => entry.sourceContributionId)).size,
    1,
    'one accepted generation can settle multiple authored aggregates without creating separate story trackers',
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
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter3.relay-result'], 'pending');
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter3.archive-result'], 'pending');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter3.custody'].disposition, null);

const restored = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: finalSnapshot });
assert.equal(restored.status, 'settled');
assert.equal(harness.campaignState.mission.v1.status, 'terminal');
assert.equal(
    harness.campaignState.mission.v1.evidenceLog.slice(-2).every((entry) => entry.sourceContributionId.endsWith('.r1')),
    true,
    'restored selected swipe advances the source custody epoch',
);
assert.equal(harness.generationCount, 13);
assert.ok(harness.persistCount > 0);
assert.deepEqual(legacyRoots(harness.campaignState), rootsBefore);

console.log('Ashes V1 Chapter 3 runtime tests passed.');
