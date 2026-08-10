import assert from 'node:assert/strict';

import {
    CAMPAIGN_CONCLUSION_KIND,
    createCampaignConclusionReceipt,
    inspectCampaignConclusionTarget,
    validateCampaignConclusionReceipt,
} from '../../src/mission/v1/campaign-conclusion.mjs';

const packageBinding = {
    packageId: 'package.ashes',
    packageVersion: '1.0.0',
    sourceId: 'epilogue-the-terms-we-keep',
};
const sourceDefinition = {
    id: 'mission.epilogue-the-terms-we-keep',
    version: '1.0.0',
    packageBinding,
    transitions: [{
        id: 'transition.epilogue.conclusion',
        priority: 100,
        when: true,
        target: {
            kind: 'phase',
            id: 'ashes-authored-conclusion',
            playerSafeSetup: 'The campaign concludes.',
            campaignConclusion: {
                endConditionId: 'completion.ashes.terms-we-keep-resolved',
            },
        },
        mustNarrate: [],
        mustNotReveal: [],
    }],
};
const packageData = {
    manifest: { id: packageBinding.packageId, version: packageBinding.packageVersion },
    endConditions: {
        version: 1,
        conditions: [{
            id: 'completion.ashes.terms-we-keep-resolved',
            family: 'authoredCompletion',
        }],
    },
};
const missionState = {
    kind: 'directive.missionState.v1',
    definitionId: sourceDefinition.id,
    definitionVersion: sourceDefinition.version,
    packageBinding,
    branchId: 'save.ashes',
    revision: 15,
    status: 'terminal',
    terminalDisposition: 'managedSettlement',
    transitionReceipt: {
        kind: 'directive.missionTransitionReceipt.v1',
        transitionId: 'transition.epilogue.conclusion',
        committedAtRevision: 15,
        target: structuredClone(sourceDefinition.transitions[0].target),
        packet: {
            kind: 'directive.missionTransitionPacket.v1',
            sourceMissionId: sourceDefinition.id,
            sourceDisposition: 'managedSettlement',
            next: structuredClone(sourceDefinition.transitions[0].target),
        },
    },
};
const campaignState = {
    activeCampaignPackage: {
        packageId: packageBinding.packageId,
        packageVersion: packageBinding.packageVersion,
    },
    campaignChatBinding: { saveId: 'save.ashes' },
    mission: {
        activeMissionId: packageBinding.sourceId,
        v1: missionState,
        v1Journey: {
            kind: 'directive.missionJourney.v1',
            contractVersion: 1,
            branchId: 'save.ashes',
            revision: 12,
            activeRunId: 'mission-run.epilogue',
        },
        v1History: Array.from({ length: 12 }, (_, index) => ({ runId: `mission-run.${index}` })),
    },
};

const ready = inspectCampaignConclusionTarget({
    campaignState,
    sourceDefinition,
    packageData,
});
assert.deepEqual(ready, {
    ok: true,
    status: 'ready',
    reasonCode: null,
    activatable: true,
    phaseId: 'ashes-authored-conclusion',
    endConditionId: 'completion.ashes.terms-we-keep-resolved',
    receipt: null,
});

const receipt = createCampaignConclusionReceipt({
    campaignState,
    sourceDefinition,
    packageData,
    completedAt: '2026-08-10T11:00:00.000Z',
});
assert.equal(receipt.kind, CAMPAIGN_CONCLUSION_KIND);
assert.equal(receipt.contractVersion, 1);
assert.match(receipt.id, /^campaign-conclusion\.[a-f0-9]{24}$/);
assert.deepEqual(receipt.packageBinding, {
    packageId: packageBinding.packageId,
    packageVersion: packageBinding.packageVersion,
});
assert.equal(receipt.branchId, 'save.ashes');
assert.equal(receipt.phaseId, 'ashes-authored-conclusion');
assert.equal(receipt.endConditionId, 'completion.ashes.terms-we-keep-resolved');
assert.deepEqual(receipt.source, {
    runId: 'mission-run.epilogue',
    definitionId: sourceDefinition.id,
    definitionVersion: sourceDefinition.version,
    missionRevision: 15,
    disposition: 'managedSettlement',
    transitionId: 'transition.epilogue.conclusion',
});
assert.equal(receipt.journeyRevision, 12);
assert.equal(receipt.completedAt, '2026-08-10T11:00:00.000Z');
assert.deepEqual(validateCampaignConclusionReceipt({
    receipt,
    campaignState,
    sourceDefinition,
    packageData,
}), { ok: true, errors: [] });

const concludedState = structuredClone(campaignState);
concludedState.mission.v1Conclusion = receipt;
const concluded = inspectCampaignConclusionTarget({
    campaignState: concludedState,
    sourceDefinition,
    packageData,
});
assert.equal(concluded.ok, true);
assert.equal(concluded.status, 'concluded');
assert.equal(concluded.reasonCode, 'campaign-already-concluded');
assert.equal(concluded.activatable, false);
assert.deepEqual(concluded.receipt, receipt);

for (const [label, mutate, expectedReason] of [
    ['missing authored metadata', (state, definition) => { delete definition.transitions[0].target.campaignConclusion; }, 'phase-target-contract-unavailable'],
    ['missing end condition', (state, definition, data) => { data.endConditions.conditions = []; }, 'campaign-conclusion-end-condition-unavailable'],
    ['wrong end-condition family', (state, definition, data) => { data.endConditions.conditions[0].family = 'terminalCandidate'; }, 'campaign-conclusion-end-condition-invalid'],
]) {
    const state = structuredClone(campaignState);
    const definition = structuredClone(sourceDefinition);
    const data = structuredClone(packageData);
    mutate(state, definition, data);
    const result = inspectCampaignConclusionTarget({ campaignState: state, sourceDefinition: definition, packageData: data });
    assert.equal(result.status, 'pending', label);
    assert.equal(result.reasonCode, expectedReason, label);
    assert.equal(result.activatable, false, label);
}

for (const [label, mutate] of [
    ['branch drift', (value) => { value.branchId = 'save.forged'; }],
    ['package drift', (value) => { value.packageBinding.packageVersion = '2.0.0'; }],
    ['run drift', (value) => { value.source.runId = 'mission-run.forged'; }],
    ['mission revision drift', (value) => { value.source.missionRevision = 14; }],
    ['journey revision drift', (value) => { value.journeyRevision = 11; }],
    ['end-condition drift', (value) => { value.endConditionId = 'completion.forged'; }],
    ['unknown field', (value) => { value.legacyQuestStatus = 'resolved'; }],
]) {
    const forged = structuredClone(receipt);
    mutate(forged);
    const validation = validateCampaignConclusionReceipt({
        receipt: forged,
        campaignState,
        sourceDefinition,
        packageData,
    });
    assert.equal(validation.ok, false, label);
    assert.equal(validation.errors.length > 0, true, label);
}

const forgedState = structuredClone(campaignState);
forgedState.mission.v1Conclusion = structuredClone(receipt);
forgedState.mission.v1Conclusion.source.runId = 'mission-run.forged';
const forgedInspection = inspectCampaignConclusionTarget({
    campaignState: forgedState,
    sourceDefinition,
    packageData,
});
assert.equal(forgedInspection.ok, false);
assert.equal(forgedInspection.status, 'invalid');
assert.equal(forgedInspection.reasonCode, 'campaign-conclusion-receipt-invalid');

console.log('V1 campaign conclusion receipt tests passed.');
