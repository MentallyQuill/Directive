import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';

const definition = JSON.parse(fs.readFileSync(
    'packages/bundled/breckenridge/v1/chapter-1-the-empty-convoy.mission-v1.json',
    'utf8',
));
const definitionRecord = {
    path: 'packages/bundled/breckenridge/v1/chapter-1-the-empty-convoy.mission-v1.json',
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
        campaignChatBinding: { saveId: 'save.chapter1-runtime', chatId: 'chat.chapter1-runtime' },
        mission: {
            activeMissionId: definition.packageBinding.sourceId,
            legacyStatus: 'must-remain-unchanged',
            openAssignments: [{ id: 'legacy.assignment' }],
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
            saveId: 'save.chapter1-runtime',
            chatId: 'chat.chapter1-runtime',
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            activeMissionId: definition.packageBinding.sourceId,
        },
        source: {
            sourceRangeHash: `range.chapter1.${number}`,
            previousAssistant: {
                hostMessageId: `message.chapter1.assistant.${number}`,
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
                hostMessageId: `message.chapter1.player.${number}`,
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

function createHarness({ state = initialCampaignState(), outputs = [] } = {}) {
    let campaignState = structuredClone(state);
    let persistCount = 0;
    let generationCount = 0;
    const requests = [];
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        persist: async () => { persistCount += 1; },
        now: () => '2026-08-09T21:00:00.000Z',
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
        now: () => '2026-08-09T21:00:00.000Z',
    });
    return {
        runtime,
        gateway,
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
    });
}

const resolvedAssistantText = [
    'The quarantine-capable teams complete substantive contact with the convoy.',
    'All endangered personnel are now aboard safe transports and medical reports no material loss.',
].join(' ');
const multiClaimOutput = interpretation([
    {
        candidateId: 'policy.chapter1.initial-contact-completed',
        sourceSlot: 'previousAssistant',
    },
    {
        candidateId: 'policy.chapter1.relief-result',
        sourceSlot: 'previousAssistant',
        value: 'safe',
    },
]);
const harness = createHarness({ outputs: [multiClaimOutput, multiClaimOutput] });
const rootsBefore = legacyRoots(harness.campaignState);
const acceptedSnapshot = snapshot(1, {
    assistantText: resolvedAssistantText,
    playerText: 'Keep the quarantine teams in place and bring me the consolidated operational picture.',
});
const settled = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: acceptedSnapshot });
assert.equal(settled.ok, true);
assert.equal(settled.status, 'settled');
assert.equal(settled.diagnostics.selectedClaimCount, 2);
assert.equal(settled.diagnostics.acceptedClaimCount, 2);
assert.equal(settled.diagnostics.rejectedClaimCount, 0);
assert.equal(harness.generationCount, 1);
assert.equal(JSON.stringify(harness.requests[0]).includes(resolvedAssistantText), true, 'interpreter sees accepted natural-language prose');
assert.equal(harness.campaignState.mission.v1.events.includes('event.chapter1.initial-contact-completed'), true);
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter1.relief-result'], 'safe');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter1.relief'].disposition, 'completed');
assert.equal(Object.keys(harness.campaignState.mission.v1.objectives).length, 4, 'claims update one authored mission aggregate');
assert.equal(harness.campaignState.mission.v1.evidenceLog.length, 2);
assert.equal(
    new Set(harness.campaignState.mission.v1.evidenceLog.map((entry) => entry.sourceContributionId)).size,
    1,
    'one accepted assistant generation owns both high-value claims',
);
assert.deepEqual(legacyRoots(harness.campaignState), rootsBefore);

const invalidated = await harness.runtime.invalidateSourceMutation({
    runtimeAssets,
    hostMessageId: acceptedSnapshot.source.previousAssistant.hostMessageId,
    eventType: 'directiveResponseSelectedSwipeChanged',
});
assert.equal(invalidated.ok, true);
assert.equal(invalidated.status, 'invalidated');
assert.equal(harness.campaignState.mission.v1.events.includes('event.chapter1.initial-contact-completed'), false);
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter1.relief-result'], 'pending');
assert.equal(harness.campaignState.mission.v1.objectives['objective.chapter1.relief'].disposition, null);
assert.equal(harness.campaignState.mission.v1.evidenceLog.length, 0);
assert.equal(harness.generationCount, 1, 'source reconstruction cannot reinterpret prose');
assert.deepEqual(legacyRoots(harness.campaignState), rootsBefore);

const restored = await harness.runtime.settleAcceptedPair({ runtimeAssets, snapshot: acceptedSnapshot });
assert.equal(restored.status, 'settled');
assert.equal(harness.generationCount, 2);
assert.equal(harness.campaignState.mission.v1.outcomes['outcome.chapter1.relief-result'], 'safe');
assert.equal(
    harness.campaignState.mission.v1.evidenceLog.every((entry) => entry.sourceContributionId.endsWith('.r1')),
    true,
    'restored selected swipe advances its custody epoch',
);

const smuggleHarness = createHarness({
    outputs: [interpretation([{
        candidateId: 'policy.chapter1.authority-conflict-disclosed',
        sourceSlot: 'previousAssistant',
    }])],
});
const smuggle = await smuggleHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(2, {
        assistantText: 'A generic line claims there is a routing conflict without a delivered Duty Report.',
    }),
});
assert.equal(smuggle.status, 'settled-no-effect');
assert.equal(smuggle.diagnostics.strippedRequiredDutyReportClaimCount, 1);
assert.equal(smuggle.diagnostics.rejectedDutyReportReasonCode, 'required-manifest-missing');
assert.equal(smuggleHarness.campaignState.mission.v1.knownFacts.includes('fact.chapter1.authority-conflict'), false);

const insignificantHarness = createHarness({
    outputs: [interpretation([], { assistantAcceptance: 'ambiguous', abstained: true })],
});
const insignificantRoots = legacyRoots(insignificantHarness.campaignState);
const insignificant = await insignificantHarness.runtime.settleAcceptedPair({
    runtimeAssets,
    snapshot: snapshot(3, {
        assistantText: 'The turbolift ride is quiet, and no mission condition changes.',
        playerText: 'I look out at the stars for a moment.',
    }),
});
assert.equal(insignificant.status, 'settled-no-effect');
assert.equal(insignificant.diagnostics.acceptedClaimCount, 0);
assert.deepEqual(insignificantHarness.campaignState.mission.v1.evidenceLog, []);
assert.equal(insignificantHarness.campaignState.mission.v1.revision, 0);
assert.deepEqual(legacyRoots(insignificantHarness.campaignState), insignificantRoots);

console.log('Ashes V1 Chapter 1 accepted-pair runtime tests passed.');
