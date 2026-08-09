import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createDutyReportManifest,
    createDutyReportVisibleSegment,
    dutyReportTextHash,
    validateDutyReportManifest,
} from '../../src/mission/v1/duty-report-delivery.mjs';
import { selectPendingDutyReport } from '../../src/mission/v1/duty-report-planner.mjs';

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

console.log('V1 Duty Report delivery contract tests passed.');
