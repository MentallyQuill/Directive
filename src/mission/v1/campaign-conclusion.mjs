import { createHash } from 'node:crypto';

export const CAMPAIGN_CONCLUSION_KIND = 'directive.campaignConclusion.v1';
export const CAMPAIGN_CONCLUSION_CONTRACT_VERSION = 1;

const RECEIPT_FIELDS = new Set([
    'kind',
    'contractVersion',
    'id',
    'packageBinding',
    'branchId',
    'phaseId',
    'endConditionId',
    'source',
    'journeyRevision',
    'completedAt',
]);
const PACKAGE_FIELDS = new Set(['packageId', 'packageVersion']);
const SOURCE_FIELDS = new Set([
    'runId',
    'definitionId',
    'definitionVersion',
    'missionRevision',
    'disposition',
    'transitionId',
]);

function compact(value) {
    return String(value ?? '').trim();
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableId(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(compact(value));
}

function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function unknownFields(value, allowed) {
    return isObject(value) ? Object.keys(value).filter((field) => !allowed.has(field)) : [];
}

function conclusionId({
    packageId,
    packageVersion,
    branchId,
    phaseId,
    endConditionId,
    sourceRunId,
    transitionId,
    missionRevision,
} = {}) {
    return `campaign-conclusion.${createHash('sha256').update([
        packageId,
        packageVersion,
        branchId,
        phaseId,
        endConditionId,
        sourceRunId,
        transitionId,
        missionRevision,
    ].map((part) => String(part ?? '')).join('|')).digest('hex').slice(0, 24)}`;
}

function conclusionTarget({ campaignState = {}, sourceDefinition = {} } = {}) {
    const missionState = campaignState?.mission?.v1;
    const receipt = missionState?.transitionReceipt;
    const authored = (sourceDefinition.transitions || []).find((transition) => transition.id === receipt?.transitionId);
    const target = receipt?.target;
    if (!missionState || missionState.status !== 'terminal' || !receipt || !authored) {
        return { ok: false, reasonCode: 'campaign-conclusion-source-invalid', target: null, transition: null };
    }
    if (!sameJson(authored.target, target) || !sameJson(receipt.packet?.next, target)) {
        return { ok: false, reasonCode: 'campaign-conclusion-target-drift', target: null, transition: null };
    }
    if (target.kind !== 'phase') {
        return { ok: false, reasonCode: 'transition-not-campaign-conclusion', target, transition: authored };
    }
    if (!isObject(target.campaignConclusion) || !stableId(target.campaignConclusion.endConditionId)) {
        return { ok: false, reasonCode: 'phase-target-contract-unavailable', target, transition: authored };
    }
    return { ok: true, reasonCode: null, target, transition: authored };
}

function matchingEndCondition(packageData = {}, endConditionId = '') {
    const matches = (packageData?.endConditions?.conditions || [])
        .filter((condition) => condition?.id === endConditionId);
    if (matches.length !== 1) return { ok: false, reasonCode: 'campaign-conclusion-end-condition-unavailable' };
    if (matches[0].family !== 'authoredCompletion') {
        return { ok: false, reasonCode: 'campaign-conclusion-end-condition-invalid' };
    }
    return { ok: true, condition: matches[0] };
}

function sourceContext({ campaignState = {}, sourceDefinition = {}, packageData = {} } = {}) {
    const errors = [];
    const missionState = campaignState?.mission?.v1;
    const journey = campaignState?.mission?.v1Journey;
    const history = campaignState?.mission?.v1History;
    const branchId = compact(campaignState?.campaignChatBinding?.saveId);
    const activePackage = campaignState?.activeCampaignPackage || {};
    const manifest = packageData?.manifest || {};
    if (!isObject(missionState) || missionState.definitionId !== sourceDefinition.id
        || missionState.definitionVersion !== sourceDefinition.version
        || !sameJson(missionState.packageBinding, sourceDefinition.packageBinding)) {
        errors.push('campaign conclusion source definition does not match current mission authority');
    }
    if (!stableId(branchId) || missionState?.branchId !== branchId || journey?.branchId !== branchId) {
        errors.push('campaign conclusion branch does not match current mission authority');
    }
    if (!stableId(journey?.activeRunId)) errors.push('campaign conclusion source run is invalid');
    if (!Number.isInteger(journey?.revision) || journey.revision < 0
        || !Array.isArray(history) || history.length !== journey?.revision) {
        errors.push('campaign conclusion journey revision is invalid');
    }
    if (activePackage.packageId !== sourceDefinition?.packageBinding?.packageId
        || activePackage.packageVersion !== sourceDefinition?.packageBinding?.packageVersion
        || manifest.id !== sourceDefinition?.packageBinding?.packageId
        || manifest.version !== sourceDefinition?.packageBinding?.packageVersion) {
        errors.push('campaign conclusion package binding does not match');
    }
    return { ok: errors.length === 0, errors, missionState, journey, branchId };
}

export function validateCampaignConclusionReceipt({
    receipt,
    campaignState = {},
    sourceDefinition = {},
    packageData = {},
} = {}) {
    const errors = [];
    if (!isObject(receipt)) return { ok: false, errors: ['campaign conclusion receipt must be an object'] };
    for (const field of unknownFields(receipt, RECEIPT_FIELDS)) {
        errors.push(`campaign conclusion receipt contains unknown field: ${field}`);
    }
    if (receipt.kind !== CAMPAIGN_CONCLUSION_KIND) errors.push(`campaign conclusion kind must be ${CAMPAIGN_CONCLUSION_KIND}`);
    if (receipt.contractVersion !== CAMPAIGN_CONCLUSION_CONTRACT_VERSION) errors.push('campaign conclusion contractVersion is unknown');
    if (!stableId(receipt.id)) errors.push('campaign conclusion receipt id is invalid');
    if (!isObject(receipt.packageBinding)) {
        errors.push('campaign conclusion packageBinding must be an object');
    } else {
        for (const field of unknownFields(receipt.packageBinding, PACKAGE_FIELDS)) {
            errors.push(`campaign conclusion packageBinding contains unknown field: ${field}`);
        }
    }
    if (!isObject(receipt.source)) {
        errors.push('campaign conclusion source must be an object');
    } else {
        for (const field of unknownFields(receipt.source, SOURCE_FIELDS)) {
            errors.push(`campaign conclusion source contains unknown field: ${field}`);
        }
    }

    const targetResult = conclusionTarget({ campaignState, sourceDefinition });
    if (!targetResult.ok) errors.push(`campaign conclusion target is invalid: ${targetResult.reasonCode}`);
    const context = sourceContext({ campaignState, sourceDefinition, packageData });
    errors.push(...context.errors);
    const endConditionId = targetResult.target?.campaignConclusion?.endConditionId;
    const condition = matchingEndCondition(packageData, endConditionId);
    if (!condition.ok) errors.push(condition.reasonCode);

    if (context.ok && targetResult.ok) {
        const expectedPackage = {
            packageId: sourceDefinition.packageBinding.packageId,
            packageVersion: sourceDefinition.packageBinding.packageVersion,
        };
        const expectedSource = {
            runId: context.journey.activeRunId,
            definitionId: sourceDefinition.id,
            definitionVersion: sourceDefinition.version,
            missionRevision: context.missionState.revision,
            disposition: context.missionState.terminalDisposition,
            transitionId: context.missionState.transitionReceipt.transitionId,
        };
        if (!sameJson(receipt.packageBinding, expectedPackage)) errors.push('campaign conclusion packageBinding does not match source');
        if (receipt.branchId !== context.branchId) errors.push('campaign conclusion branchId does not match source');
        if (receipt.phaseId !== targetResult.target.id) errors.push('campaign conclusion phaseId does not match source');
        if (receipt.endConditionId !== endConditionId) errors.push('campaign conclusion endConditionId does not match source');
        if (!sameJson(receipt.source, expectedSource)) errors.push('campaign conclusion source does not match terminal mission');
        if (receipt.journeyRevision !== context.journey.revision) errors.push('campaign conclusion journeyRevision does not match source');
        const expectedId = conclusionId({
            packageId: expectedPackage.packageId,
            packageVersion: expectedPackage.packageVersion,
            branchId: context.branchId,
            phaseId: targetResult.target.id,
            endConditionId,
            sourceRunId: expectedSource.runId,
            transitionId: expectedSource.transitionId,
            missionRevision: expectedSource.missionRevision,
        });
        if (receipt.id !== expectedId) errors.push('campaign conclusion receipt id does not match source authority');
    }
    if (typeof receipt.completedAt !== 'string' || Number.isNaN(Date.parse(receipt.completedAt))) {
        errors.push('campaign conclusion completedAt is invalid');
    }
    return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function inspectCampaignConclusionTarget({
    campaignState = {},
    sourceDefinition = {},
    packageData = {},
} = {}) {
    const targetResult = conclusionTarget({ campaignState, sourceDefinition });
    if (!targetResult.ok) {
        const unsupported = targetResult.reasonCode === 'phase-target-contract-unavailable';
        const notConclusion = targetResult.reasonCode === 'transition-not-campaign-conclusion';
        return {
            ok: unsupported,
            status: notConclusion ? 'none' : (unsupported ? 'pending' : 'invalid'),
            reasonCode: targetResult.reasonCode,
            activatable: false,
            phaseId: targetResult.target?.id || null,
            endConditionId: null,
            receipt: null,
        };
    }
    const context = sourceContext({ campaignState, sourceDefinition, packageData });
    if (!context.ok) {
        return {
            ok: false,
            status: 'invalid',
            reasonCode: 'campaign-conclusion-source-invalid',
            activatable: false,
            phaseId: targetResult.target.id,
            endConditionId: targetResult.target.campaignConclusion.endConditionId,
            receipt: null,
        };
    }
    const endConditionId = targetResult.target.campaignConclusion.endConditionId;
    const condition = matchingEndCondition(packageData, endConditionId);
    if (!condition.ok) {
        return {
            ok: true,
            status: 'pending',
            reasonCode: condition.reasonCode,
            activatable: false,
            phaseId: targetResult.target.id,
            endConditionId,
            receipt: null,
        };
    }
    const existing = campaignState?.mission?.v1Conclusion;
    if (existing !== undefined && existing !== null) {
        const validation = validateCampaignConclusionReceipt({
            receipt: existing,
            campaignState,
            sourceDefinition,
            packageData,
        });
        if (!validation.ok) {
            return {
                ok: false,
                status: 'invalid',
                reasonCode: 'campaign-conclusion-receipt-invalid',
                activatable: false,
                phaseId: targetResult.target.id,
                endConditionId,
                receipt: null,
            };
        }
        return {
            ok: true,
            status: 'concluded',
            reasonCode: 'campaign-already-concluded',
            activatable: false,
            phaseId: targetResult.target.id,
            endConditionId,
            receipt: cloneJson(existing),
        };
    }
    return {
        ok: true,
        status: 'ready',
        reasonCode: null,
        activatable: true,
        phaseId: targetResult.target.id,
        endConditionId,
        receipt: null,
    };
}

export function createCampaignConclusionReceipt({
    campaignState = {},
    sourceDefinition = {},
    packageData = {},
    completedAt = null,
} = {}) {
    const inspection = inspectCampaignConclusionTarget({ campaignState, sourceDefinition, packageData });
    if (inspection.status === 'concluded' && inspection.receipt) return cloneJson(inspection.receipt);
    if (!inspection.ok || !inspection.activatable) {
        throw new TypeError(`campaign conclusion is not ready: ${inspection.reasonCode || inspection.status}`);
    }
    const missionState = campaignState.mission.v1;
    const journey = campaignState.mission.v1Journey;
    const branchId = campaignState.campaignChatBinding.saveId;
    const transitionId = missionState.transitionReceipt.transitionId;
    const receipt = {
        kind: CAMPAIGN_CONCLUSION_KIND,
        contractVersion: CAMPAIGN_CONCLUSION_CONTRACT_VERSION,
        id: conclusionId({
            packageId: sourceDefinition.packageBinding.packageId,
            packageVersion: sourceDefinition.packageBinding.packageVersion,
            branchId,
            phaseId: inspection.phaseId,
            endConditionId: inspection.endConditionId,
            sourceRunId: journey.activeRunId,
            transitionId,
            missionRevision: missionState.revision,
        }),
        packageBinding: {
            packageId: sourceDefinition.packageBinding.packageId,
            packageVersion: sourceDefinition.packageBinding.packageVersion,
        },
        branchId,
        phaseId: inspection.phaseId,
        endConditionId: inspection.endConditionId,
        source: {
            runId: journey.activeRunId,
            definitionId: sourceDefinition.id,
            definitionVersion: sourceDefinition.version,
            missionRevision: missionState.revision,
            disposition: missionState.terminalDisposition,
            transitionId,
        },
        journeyRevision: journey.revision,
        completedAt: compact(completedAt),
    };
    const validation = validateCampaignConclusionReceipt({
        receipt,
        campaignState,
        sourceDefinition,
        packageData,
    });
    if (!validation.ok) throw new TypeError(`campaign conclusion receipt is invalid: ${validation.errors.join('; ')}`);
    return receipt;
}
