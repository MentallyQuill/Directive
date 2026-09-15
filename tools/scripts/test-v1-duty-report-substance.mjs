import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    createDutyReportVisibleSegment, createDutyReportManifest, validateDutyReportManifest,
    materializeAcceptedDutyReportClaim, validateDutyReportDeliveryReceipt,
} from '../../src/mission/v1/duty-report-delivery.mjs';

let routeCount = 0;
for (const file of fs.readdirSync('packages/bundled/breckenridge/v1').filter(file => file.endsWith('.mission-v1.json'))) {
    const definition = JSON.parse(fs.readFileSync(`packages/bundled/breckenridge/v1/${file}`, 'utf8'));
    for (const route of definition.reportRoutes || []) {
        routeCount += 1;
        const before = structuredClone(definition);
        const packet = { kind: 'directive.dutyReportPacket.v1', reportId: route.id, reporterId: 'reporter.authored',
            factId: route.factId, urgency: route.urgency, confidence: route.confidence,
            deliveryRequirement: route.deliveryRequirement, playerText: structuredClone(route.playerText),
            authorizedClaim: { claimType: 'factDisclosed', targetId: route.factId, policyId: route.evidencePolicyId } };
        const segment = createDutyReportVisibleSegment(packet, { definition, contractVersion: 2 });
        assert.equal(segment.summary, definition.facts.find(fact => fact.id === route.factId).playerText.summary.replace(/\s+/g, ' ').trim());
        assert.ok(segment.summary.length <= 500);
        assert.ok(segment.canonicalText.length <= 620);
        const responseText = `The officer reports: ${segment.canonicalText}`;
        const input = { definition, packet, segment, branchId: 'save.substance', responseId: 'response.substance',
            sourceTransactionId: 'transaction.substance', responseText };
        const manifest = createDutyReportManifest(input);
        assert.equal(manifest.contractVersion, 2);
        assert.equal(validateDutyReportManifest({ ...input, manifest }).ok, true);
        const source = { role: 'assistant', accepted: true, dutyReportCustodyOwned: true,
            messageId: 'assistant.substance', responseId: input.responseId, selectedSwipeId: '1',
            textHash: '12345678', text: responseText };
        const result = materializeAcceptedDutyReportClaim({ definition, manifest, branchId: input.branchId, source });
        assert.equal(result.ok, true);
        assert.equal(result.delivery.contractVersion, 2);
        assert.equal(result.claim.targetId, route.factId);
        assert.equal(validateDutyReportDeliveryReceipt({ definition, ...result, source }).ok, true);
        for (const patch of [{ contractVersion: 3 }, { factId: 'fact.wrong' }, { policyId: 'policy.wrong' },
            { branchId: 'save.wrong' }, { responseTextHash: '0000000000000000' }]) {
            assert.equal(materializeAcceptedDutyReportClaim({ definition, manifest: { ...manifest, ...patch },
                branchId: input.branchId, source }).ok, false);
        }
        assert.equal(validateDutyReportManifest({ ...input, manifest, responseText: `${responseText} ${segment.canonicalText}` }).ok, false);
        assert.equal(validateDutyReportDeliveryReceipt({ definition, ...result, source: { ...source, selectedSwipeId: '0' } }).ok, false);
        assert.throws(() => createDutyReportManifest({ ...input, contractVersion: 1 }), /segment/,
            'a prepared V2 segment cannot be silently reinterpreted under V1');
        const legacy = createDutyReportVisibleSegment(packet, { contractVersion: 1 });
        assert.equal(legacy.summary, route.playerText.summary.replace(/\s+/g, ' ').trim());
        const legacyManifest = createDutyReportManifest({ ...input, segment: legacy, responseText: legacy.canonicalText });
        assert.equal(legacyManifest.contractVersion, 1);
        assert.equal(validateDutyReportManifest({ ...input, manifest: legacyManifest, responseText: legacy.canonicalText }).ok, true);
        assert.deepEqual(definition, before, 'neither version mutates authored routes or facts');
    }
}
assert.equal(routeCount, 84);
console.log(`PASS substantive Duty Report contract (${routeCount} unchanged authored routes)`);
