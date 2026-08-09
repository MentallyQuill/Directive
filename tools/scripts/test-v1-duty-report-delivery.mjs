import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createDutyReportManifest,
    createDutyReportVisibleSegment,
    dutyReportTextHash,
    parseDutyReportManifestEnvelope,
    validateDutyReportManifest,
    withoutProvisionalDutyReportManifest,
} from '../../src/mission/v1/duty-report-delivery.mjs';
import { selectPendingDutyReport } from '../../src/mission/v1/duty-report-planner.mjs';
import { buildSceneHandshakeSnapshot } from '../../src/runtime/scene-handshake-settler.mjs';
import { createLatestPairSourceSettlementPrompt } from '../../src/runtime/source-settlement-latest-pair-provider.mjs';

const definition = JSON.parse(fs.readFileSync(
    'tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json',
    'utf8',
));
const state = {
    branchId: 'save.alpha',
    revision: 4,
    knownFacts: [],
    worldFacts: ['fact.hesperus-discrepancy-known'],
    events: [],
    outcomes: Object.fromEntries(definition.outcomes.map((outcome) => [outcome.id, outcome.initialValue])),
    objectives: Object.fromEntries(definition.objectives.map((objective) => [objective.id, {
        state: 'available',
        disposition: null,
    }])),
    clocks: Object.fromEntries(definition.clocks.map((clock) => [clock.id, {
        state: 'running',
        value: clock.initialValue,
    }])),
};
const packet = selectPendingDutyReport({
    definition,
    state,
    availableActors: [{ id: 'hadrik-bronn', capabilityRoles: ['engineering'] }],
});
const segment = createDutyReportVisibleSegment(packet);
assert.deepEqual(segment, {
    kind: 'directive.dutyReportVisibleSegment.v1',
    contractVersion: 1,
    reportId: 'report.hesperus-discrepancy',
    reporterId: 'hadrik-bronn',
    urgency: 'material',
    confidence: 'credible',
    summary: 'Engineering has a material discrepancy to report.',
    canonicalText: 'Duty Report — Engineering has a material discrepancy to report. Confidence: Credible.',
});
assert.equal(Object.hasOwn(segment, 'factId'), false);
assert.equal(Object.hasOwn(segment, 'policyId'), false);

const responseText = `Bronn opens the reviewed file. ${segment.canonicalText} He waits for your direction.`;
const inputSnapshot = structuredClone({ definition, packet, responseText, segment });
const manifest = createDutyReportManifest({
    definition,
    packet,
    branchId: 'save.alpha',
    responseId: 'directive-response.1',
    sourceTransactionId: 'txn.ingress.1',
    responseText,
    segment,
});
assert.deepEqual(manifest, {
    kind: 'directive.dutyReportManifest.v1',
    contractVersion: 1,
    packageId: definition.packageBinding.packageId,
    packageVersion: definition.packageBinding.packageVersion,
    missionId: definition.id,
    definitionVersion: definition.version,
    branchId: 'save.alpha',
    reportId: 'report.hesperus-discrepancy',
    factId: 'fact.hesperus-discrepancy-known',
    reporterId: 'hadrik-bronn',
    policyId: 'policy.hesperus-discrepancy-disclosed',
    responseId: 'directive-response.1',
    sourceTransactionId: 'txn.ingress.1',
    responseTextHash: dutyReportTextHash(responseText),
    segmentTextHash: dutyReportTextHash(segment.canonicalText),
});
assert.deepEqual({ definition, packet, responseText, segment }, inputSnapshot);
assert.equal(JSON.stringify(manifest).includes(responseText), false);
assert.equal(JSON.stringify(manifest).includes(segment.canonicalText), false);
assert.deepEqual(parseDutyReportManifestEnvelope(manifest), {
    ok: true,
    errors: [],
    value: manifest,
});
assert.equal(parseDutyReportManifestEnvelope({ ...manifest, extra: true }).ok, false);
assert.equal(parseDutyReportManifestEnvelope({ ...manifest, responseTextHash: 'not-a-hash' }).ok, false);
assert.deepEqual(withoutProvisionalDutyReportManifest({
    dutyReportManifest: manifest,
    responseRetry: true,
}), { responseRetry: true });
assert.deepEqual(withoutProvisionalDutyReportManifest(null), {});

const valid = validateDutyReportManifest({
    definition,
    manifest,
    branchId: 'save.alpha',
    responseId: 'directive-response.1',
    responseText,
});
assert.equal(valid.ok, true, valid.errors.join('\n'));
assert.deepEqual(valid.value, manifest);

function validationErrors(overrides = {}, context = {}) {
    return validateDutyReportManifest({
        definition: context.definition || definition,
        manifest: { ...manifest, ...overrides },
        branchId: context.branchId || 'save.alpha',
        responseId: context.responseId || 'directive-response.1',
        responseText: context.responseText || responseText,
    }).errors.join('\n');
}

for (const [label, overrides, context, pattern] of [
    ['kind', { kind: 'directive.dutyReportManifest.v0' }, {}, /kind/],
    ['contract version', { contractVersion: 2 }, {}, /contractVersion/],
    ['unknown field', { modelRationale: 'trust me' }, {}, /unknown field/],
    ['package id', { packageId: 'package.other' }, {}, /packageId/],
    ['package version', { packageVersion: '9.9.9' }, {}, /packageVersion/],
    ['mission id', { missionId: 'mission.other' }, {}, /missionId/],
    ['definition version', { definitionVersion: '9.9.9' }, {}, /definitionVersion/],
    ['branch', { branchId: 'save.other' }, {}, /branchId/],
    ['report', { reportId: 'report.unknown' }, {}, /reportId/],
    ['fact', { factId: 'fact.unknown' }, {}, /factId/],
    ['reporter', { reporterId: '' }, {}, /reporterId/],
    ['policy', { policyId: 'policy.unknown' }, {}, /policyId/],
    ['response id', { responseId: 'response.other' }, {}, /responseId/],
    ['transaction', { sourceTransactionId: '' }, {}, /sourceTransactionId/],
    ['response hash', { responseTextHash: 'deadbeef' }, {}, /responseTextHash/],
    ['segment hash', { segmentTextHash: 'deadbeef' }, {}, /segmentTextHash/],
    ['edited response', {}, { responseText: `${responseText} Edited.` }, /responseTextHash/],
]) {
    assert.match(validationErrors(overrides, context), pattern, label);
}

for (const [label, options, pattern] of [
    ['missing segment', { responseText: 'Bronn opens the reviewed file.' }, /segment must occur exactly once/],
    ['repeated segment', {
        responseText: `${segment.canonicalText} ${segment.canonicalText}`,
    }, /segment must occur exactly once/],
    ['empty response id', { responseId: '' }, /responseId/],
    ['empty transaction id', { sourceTransactionId: '' }, /sourceTransactionId/],
    ['packet fact mismatch', { packet: { ...packet, factId: 'fact.unknown' } }, /packet factId/],
    ['packet summary mismatch', {
        packet: { ...packet, playerText: { summary: 'A different disclosure.' } },
    }, /packet playerText/],
    ['over-budget segment', {
        packet: { ...packet, playerText: { summary: 'x'.repeat(700) } },
    }, /packet playerText|segment/],
]) {
    assert.throws(() => createDutyReportManifest({
        definition,
        packet: options.packet || packet,
        branchId: options.branchId ?? 'save.alpha',
        responseId: options.responseId ?? 'directive-response.1',
        sourceTransactionId: options.sourceTransactionId ?? 'txn.ingress.1',
        responseText: options.responseText ?? responseText,
        segment: options.segment || (options.packet ? createDutyReportVisibleSegment(options.packet) : segment),
    }), pattern, label);
}

assert.throws(() => createDutyReportVisibleSegment({
    ...packet,
    extra: 'not allowed',
}), /unknown field/);

function assistantMessage({ selected = 0, selectedManifest = manifest, rootManifest = null } = {}) {
    const swipes = [
        responseText,
        'Bronn closes the file without presenting a report.',
    ];
    return {
        id: 'assistant.1',
        hostMessageId: 'assistant.1',
        text: swipes[selected],
        metadata: {
            responseKind: 'narration',
            idempotencyKey: 'directive-response.1',
            selectedSwipeIndex: selected,
        },
        raw: {
            id: 'assistant.1',
            mes: swipes[selected],
            swipes,
            swipe_id: selected,
            extra: {
                directive: {
                    responseKind: 'narration',
                    idempotencyKey: 'directive-response.1',
                },
                ...(rootManifest ? { runtimeMetadata: { dutyReportManifest: rootManifest } } : {}),
            },
            swipe_info: [
                {
                    extra: {
                        runtimeMetadata: selected === 0 && selectedManifest
                            ? { dutyReportManifest: selectedManifest }
                            : {},
                    },
                },
                { extra: { runtimeMetadata: {} } },
            ],
        },
    };
}

const campaignState = {
    campaign: { id: 'campaign.alpha' },
    activeCampaignPackage: {
        packageId: definition.packageBinding.packageId,
        version: definition.packageBinding.packageVersion,
    },
    campaignChatBinding: { saveId: 'save.alpha', chatId: 'chat.alpha' },
    mission: { activeMissionId: definition.packageBinding.sourceId },
};
const currentPlayerMessage = {
    id: 'player.2',
    hostMessageId: 'player.2',
    text: 'Understood. Show me the discrepancy.',
    isUser: true,
};
const selectedSnapshot = buildSceneHandshakeSnapshot({
    campaignState,
    previousAssistantMessage: assistantMessage(),
    currentPlayerMessage,
    chatId: 'chat.alpha',
    ingressId: 'ingress.2',
});
assert.deepEqual(selectedSnapshot.source.previousAssistant.selectedVariant.dutyReportManifest, manifest);
assert.deepEqual(
    JSON.parse(JSON.stringify(selectedSnapshot)).source.previousAssistant.selectedVariant.dutyReportManifest,
    manifest,
);

const alternateSnapshot = buildSceneHandshakeSnapshot({
    campaignState,
    previousAssistantMessage: assistantMessage({ selected: 1, selectedManifest: null, rootManifest: manifest }),
    currentPlayerMessage,
    chatId: 'chat.alpha',
    ingressId: 'ingress.2',
});
assert.equal(alternateSnapshot.source.previousAssistant.selectedVariant.dutyReportManifest, null);

const singleSwipe = assistantMessage();
singleSwipe.raw.swipes = [responseText];
singleSwipe.raw.swipe_id = 0;
singleSwipe.raw.swipe_info = [];
singleSwipe.raw.extra.runtimeMetadata = { dutyReportManifest: manifest };
const fallbackSnapshot = buildSceneHandshakeSnapshot({
    campaignState,
    previousAssistantMessage: singleSwipe,
    currentPlayerMessage,
    chatId: 'chat.alpha',
    ingressId: 'ingress.2',
});
assert.deepEqual(fallbackSnapshot.source.previousAssistant.selectedVariant.dutyReportManifest, manifest);

const prompt = createLatestPairSourceSettlementPrompt(selectedSnapshot);
assert.equal(prompt.prompt.includes('dutyReportManifest'), false);
assert.equal(prompt.prompt.includes('txn.ingress.1'), false);
assert.equal(JSON.stringify(prompt.metadata).includes('dutyReportManifest'), false);
assert.deepEqual(selectedSnapshot.source.previousAssistant.selectedVariant.dutyReportManifest, manifest);

console.log('V1 Duty Report delivery contract tests passed.');
