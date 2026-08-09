import { DUTY_REPORT_PACKET_KIND } from './duty-report-planner.mjs';

export const DUTY_REPORT_VISIBLE_SEGMENT_KIND = 'directive.dutyReportVisibleSegment.v1';
export const DUTY_REPORT_MANIFEST_KIND = 'directive.dutyReportManifest.v1';
export const DUTY_REPORT_DELIVERY_KIND = 'directive.dutyReportDelivery.v1';
export const DUTY_REPORT_CONTRACT_VERSION = 1;

const MAX_SUMMARY_LENGTH = 500;
const MAX_SEGMENT_LENGTH = 620;
const MAX_RESPONSE_LENGTH = 7000;
const PACKET_FIELDS = new Set([
    'kind',
    'reportId',
    'reporterId',
    'factId',
    'urgency',
    'confidence',
    'deliveryRequirement',
    'playerText',
    'authorizedClaim',
]);
const MANIFEST_FIELDS = new Set([
    'kind',
    'contractVersion',
    'packageId',
    'packageVersion',
    'missionId',
    'definitionVersion',
    'branchId',
    'reportId',
    'factId',
    'reporterId',
    'policyId',
    'responseId',
    'sourceTransactionId',
    'responseTextHash',
    'segmentTextHash',
]);
const DELIVERY_FIELDS = new Set([
    'kind',
    'contractVersion',
    'reportId',
    'factId',
    'reporterId',
    'policyId',
    'responseId',
    'hostMessageId',
    'selectedSwipeId',
    'visibleTextHash',
    'segmentTextHash',
    'sourceTransactionId',
]);
const CONFIDENCE_LABEL = Object.freeze({
    preliminary: 'Preliminary',
    credible: 'Credible',
    confirmed: 'Confirmed',
});
const URGENCIES = new Set(['routine', 'material', 'urgent']);
const DELIVERY_REQUIREMENTS = new Set(['optional', 'required']);

function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
    return String(value ?? '').trim();
}

function stableId(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(compact(value));
}

function unknownFields(value, allowed) {
    if (!isObject(value)) return [];
    return Object.keys(value).filter((field) => !allowed.has(field));
}

export function normalizeDutyReportVisibleText(value = '') {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function dutyReportTextHash(value = '') {
    let hash = 0x811c9dc5;
    for (const character of normalizeDutyReportVisibleText(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function routeFor(definition, reportId) {
    return (Array.isArray(definition?.reportRoutes) ? definition.reportRoutes : [])
        .find((route) => route?.id === reportId) || null;
}

function packetErrors(packet, definition) {
    const errors = [];
    if (!isObject(packet)) return ['packet must be an object'];
    for (const field of unknownFields(packet, PACKET_FIELDS)) errors.push(`packet contains unknown field: ${field}`);
    if (packet.kind !== DUTY_REPORT_PACKET_KIND) errors.push(`packet kind must be ${DUTY_REPORT_PACKET_KIND}`);
    const route = routeFor(definition, packet.reportId);
    if (!route) errors.push('packet reportId is not authored');
    if (!stableId(packet.reporterId)) errors.push('packet reporterId must be a stable id');
    if (route) {
        if (packet.factId !== route.factId) errors.push('packet factId does not match the authored route');
        if (packet.urgency !== route.urgency) errors.push('packet urgency does not match the authored route');
        if (packet.confidence !== route.confidence) errors.push('packet confidence does not match the authored route');
        if (packet.deliveryRequirement !== route.deliveryRequirement) {
            errors.push('packet deliveryRequirement does not match the authored route');
        }
        if (packet?.playerText?.summary !== route?.playerText?.summary) {
            errors.push('packet playerText does not match the authored route');
        }
        if (packet?.authorizedClaim?.claimType !== 'factDisclosed'
            || packet?.authorizedClaim?.targetId !== route.factId
            || packet?.authorizedClaim?.policyId !== route.evidencePolicyId) {
            errors.push('packet authorizedClaim does not match the authored route');
        }
    }
    const summary = normalizeDutyReportVisibleText(packet?.playerText?.summary);
    if (!summary || summary.length > MAX_SUMMARY_LENGTH) {
        errors.push(`packet playerText summary must contain 1-${MAX_SUMMARY_LENGTH} normalized characters`);
    }
    if (!Object.hasOwn(CONFIDENCE_LABEL, packet.confidence)) errors.push('packet confidence is unknown');
    return errors;
}

function throwErrors(label, errors) {
    if (errors.length === 0) return;
    const error = new TypeError(`${label}: ${errors.join('; ')}`);
    error.code = 'DIRECTIVE_DUTY_REPORT_INVALID';
    error.details = { errors: [...errors] };
    throw error;
}

export function parseDutyReportManifestEnvelope(value = {}) {
    const errors = [];
    if (!isObject(value)) return { ok: false, errors: ['manifest must be an object'] };
    for (const field of unknownFields(value, MANIFEST_FIELDS)) errors.push(`manifest contains unknown field: ${field}`);
    if (value.kind !== DUTY_REPORT_MANIFEST_KIND) errors.push(`manifest kind must be ${DUTY_REPORT_MANIFEST_KIND}`);
    if (value.contractVersion !== DUTY_REPORT_CONTRACT_VERSION) errors.push('manifest contractVersion is unknown');
    for (const field of [
        'packageId',
        'packageVersion',
        'missionId',
        'definitionVersion',
        'branchId',
        'reportId',
        'factId',
        'reporterId',
        'policyId',
    ]) {
        if (!stableId(value[field])) errors.push(`manifest ${field} must be a stable id`);
    }
    for (const field of ['responseId', 'sourceTransactionId']) {
        const text = compact(value[field]);
        if (!text || text.length > 300) errors.push(`manifest ${field} must contain 1-300 characters`);
    }
    for (const field of ['responseTextHash', 'segmentTextHash']) {
        if (!/^[0-9a-f]{8}$/.test(compact(value[field]))) errors.push(`manifest ${field} is invalid`);
    }
    return errors.length > 0
        ? { ok: false, errors }
        : { ok: true, errors: [], value: cloneJson(value) };
}

export function withoutProvisionalDutyReportManifest(metadata = {}) {
    if (!isObject(metadata)) return {};
    const next = cloneJson(metadata);
    delete next.dutyReportManifest;
    return next;
}

export function createDutyReportVisibleSegment(packet = {}) {
    const errors = [];
    if (!isObject(packet)) errors.push('packet must be an object');
    for (const field of unknownFields(packet, PACKET_FIELDS)) errors.push(`packet contains unknown field: ${field}`);
    if (packet?.kind !== DUTY_REPORT_PACKET_KIND) errors.push(`packet kind must be ${DUTY_REPORT_PACKET_KIND}`);
    if (!stableId(packet?.reportId)) errors.push('packet reportId must be a stable id');
    if (!stableId(packet?.reporterId)) errors.push('packet reporterId must be a stable id');
    if (!URGENCIES.has(packet?.urgency)) errors.push('packet urgency is unknown');
    if (!DELIVERY_REQUIREMENTS.has(packet?.deliveryRequirement)) {
        errors.push('packet deliveryRequirement is unknown');
    }
    const summary = normalizeDutyReportVisibleText(packet?.playerText?.summary);
    if (!summary || summary.length > MAX_SUMMARY_LENGTH) {
        errors.push(`packet playerText summary must contain 1-${MAX_SUMMARY_LENGTH} normalized characters`);
    }
    if (!Object.hasOwn(CONFIDENCE_LABEL, packet?.confidence)) errors.push('packet confidence is unknown');
    throwErrors('Duty Report segment is invalid', errors);
    const canonicalText = `Duty Report — ${summary} Confidence: ${CONFIDENCE_LABEL[packet.confidence]}.`;
    if (canonicalText.length > MAX_SEGMENT_LENGTH) {
        throwErrors('Duty Report segment is invalid', [`segment exceeds ${MAX_SEGMENT_LENGTH} characters`]);
    }
    return {
        kind: DUTY_REPORT_VISIBLE_SEGMENT_KIND,
        contractVersion: DUTY_REPORT_CONTRACT_VERSION,
        reportId: packet.reportId,
        reporterId: packet.reporterId,
        urgency: packet.urgency,
        confidence: packet.confidence,
        summary,
        canonicalText,
    };
}

function countExactSegments(responseText, segmentText) {
    if (!segmentText) return 0;
    let count = 0;
    let cursor = 0;
    while (cursor <= responseText.length) {
        const index = responseText.indexOf(segmentText, cursor);
        if (index < 0) break;
        count += 1;
        cursor = index + segmentText.length;
    }
    return count;
}

export function createDutyReportManifest({
    definition = {},
    packet = {},
    branchId = null,
    responseId = null,
    sourceTransactionId = null,
    responseText = '',
    segment = null,
} = {}) {
    const errors = packetErrors(packet, definition);
    if (!stableId(branchId)) errors.push('branchId must be a stable id');
    if (!compact(responseId)) errors.push('responseId is required');
    if (!compact(sourceTransactionId)) errors.push('sourceTransactionId is required');
    const normalizedResponse = normalizeDutyReportVisibleText(responseText);
    if (!normalizedResponse || normalizedResponse.length > MAX_RESPONSE_LENGTH) {
        errors.push(`responseText must contain 1-${MAX_RESPONSE_LENGTH} normalized characters`);
    }
    let expectedSegment = null;
    try {
        expectedSegment = createDutyReportVisibleSegment(packet);
    } catch (error) {
        errors.push(...(error?.details?.errors || ['segment is invalid']));
    }
    if (expectedSegment && JSON.stringify(segment) !== JSON.stringify(expectedSegment)) {
        errors.push('segment does not match the deterministic packet segment');
    }
    if (expectedSegment && countExactSegments(normalizedResponse, expectedSegment.canonicalText) !== 1) {
        errors.push('segment must occur exactly once in responseText');
    }
    throwErrors('Duty Report manifest is invalid', errors);
    const route = routeFor(definition, packet.reportId);
    return {
        kind: DUTY_REPORT_MANIFEST_KIND,
        contractVersion: DUTY_REPORT_CONTRACT_VERSION,
        packageId: definition.packageBinding.packageId,
        packageVersion: definition.packageBinding.packageVersion,
        missionId: definition.id,
        definitionVersion: definition.version,
        branchId: compact(branchId),
        reportId: route.id,
        factId: route.factId,
        reporterId: packet.reporterId,
        policyId: route.evidencePolicyId,
        responseId: compact(responseId),
        sourceTransactionId: compact(sourceTransactionId),
        responseTextHash: dutyReportTextHash(normalizedResponse),
        segmentTextHash: dutyReportTextHash(expectedSegment.canonicalText),
    };
}

export function validateDutyReportManifest({
    definition = {},
    manifest = {},
    branchId = null,
    responseId = null,
    responseText = '',
} = {}) {
    const parsed = parseDutyReportManifestEnvelope(manifest);
    if (!parsed.ok) return parsed;
    const errors = [];
    if (manifest.packageId !== definition?.packageBinding?.packageId) errors.push('manifest packageId does not match');
    if (manifest.packageVersion !== definition?.packageBinding?.packageVersion) errors.push('manifest packageVersion does not match');
    if (manifest.missionId !== definition?.id) errors.push('manifest missionId does not match');
    if (manifest.definitionVersion !== definition?.version) errors.push('manifest definitionVersion does not match');
    if (!stableId(branchId) || manifest.branchId !== branchId) errors.push('manifest branchId does not match');
    const route = routeFor(definition, manifest.reportId);
    if (!route) errors.push('manifest reportId is not authored');
    if (route && manifest.factId !== route.factId) errors.push('manifest factId does not match the authored route');
    if (!stableId(manifest.reporterId)) errors.push('manifest reporterId must be a stable id');
    if (route && manifest.policyId !== route.evidencePolicyId) errors.push('manifest policyId does not match the authored route');
    if (!compact(responseId) || manifest.responseId !== responseId) errors.push('manifest responseId does not match');
    if (!compact(manifest.sourceTransactionId)) errors.push('manifest sourceTransactionId is required');
    const normalizedResponse = normalizeDutyReportVisibleText(responseText);
    if (!normalizedResponse || dutyReportTextHash(normalizedResponse) !== manifest.responseTextHash) {
        errors.push('manifest responseTextHash does not match');
    }
    if (route) {
        let segment = null;
        try {
            segment = createDutyReportVisibleSegment({
                kind: DUTY_REPORT_PACKET_KIND,
                reportId: route.id,
                reporterId: manifest.reporterId,
                factId: route.factId,
                urgency: route.urgency,
                confidence: route.confidence,
                deliveryRequirement: route.deliveryRequirement,
                playerText: cloneJson(route.playerText),
                authorizedClaim: {
                    claimType: 'factDisclosed',
                    targetId: route.factId,
                    policyId: route.evidencePolicyId,
                },
            });
        } catch {
            errors.push('authored segment is invalid');
        }
        if (segment) {
            if (dutyReportTextHash(segment.canonicalText) !== manifest.segmentTextHash) {
                errors.push('manifest segmentTextHash does not match');
            }
            if (countExactSegments(normalizedResponse, segment.canonicalText) !== 1) {
                errors.push('manifest segment must occur exactly once in responseText');
            }
        }
    }
    return errors.length > 0
        ? { ok: false, errors }
        : { ok: true, errors: [], value: cloneJson(manifest) };
}

export function validateDutyReportDeliveryReceipt({
    definition = {},
    delivery = {},
    claim = {},
    source = {},
} = {}) {
    const errors = [];
    if (!isObject(delivery)) return { ok: false, errors: ['delivery must be an object'] };
    for (const field of unknownFields(delivery, DELIVERY_FIELDS)) errors.push(`delivery contains unknown field: ${field}`);
    if (delivery.kind !== DUTY_REPORT_DELIVERY_KIND) errors.push(`delivery kind must be ${DUTY_REPORT_DELIVERY_KIND}`);
    if (delivery.contractVersion !== DUTY_REPORT_CONTRACT_VERSION) errors.push('delivery contractVersion is unknown');
    const route = routeFor(definition, delivery.reportId);
    if (!route) errors.push('delivery reportId is not authored');
    if (claim.claimType !== 'factDisclosed') errors.push('delivery requires a factDisclosed claim');
    if (route && (delivery.factId !== route.factId || claim.targetId !== route.factId)) {
        errors.push('delivery factId does not match the authored route and claim');
    }
    if (route && (delivery.policyId !== route.evidencePolicyId || claim.policyId !== route.evidencePolicyId)) {
        errors.push('delivery policyId does not match the authored route and claim');
    }
    if (!stableId(delivery.reporterId)) errors.push('delivery reporterId must be a stable id');
    if (!compact(delivery.responseId) || delivery.responseId !== source.responseId) {
        errors.push('delivery responseId does not match the accepted source');
    }
    if (!compact(delivery.hostMessageId) || delivery.hostMessageId !== source.messageId) {
        errors.push('delivery hostMessageId does not match the accepted source');
    }
    if ((delivery.selectedSwipeId || null) !== (source.selectedSwipeId || null)) {
        errors.push('delivery selectedSwipeId does not match the accepted source');
    }
    if (!compact(delivery.visibleTextHash) || delivery.visibleTextHash !== source.textHash) {
        errors.push('delivery visibleTextHash does not match the accepted source');
    }
    if (!/^[0-9a-f]{8}$/.test(compact(delivery.segmentTextHash))) {
        errors.push('delivery segmentTextHash is invalid');
    }
    if (!compact(delivery.sourceTransactionId)) errors.push('delivery sourceTransactionId is required');
    if (source.role !== 'assistant' || source.accepted !== true || source.dutyReportCustodyOwned !== true) {
        errors.push('delivery requires an accepted assistant source with Directive Duty Report custody');
    }
    return errors.length > 0
        ? { ok: false, errors }
        : { ok: true, errors: [], value: cloneJson(delivery), route: cloneJson(route) };
}

export function materializeAcceptedDutyReportClaim({
    definition = {},
    manifest = null,
    branchId = null,
    source = {},
} = {}) {
    if (!manifest) {
        return { ok: false, status: 'none', reasonCode: 'manifest-missing', errors: [] };
    }
    if (source.role !== 'assistant' || source.accepted !== true || source.dutyReportCustodyOwned !== true) {
        return { ok: false, status: 'rejected', reasonCode: 'assistant-not-accepted', errors: [] };
    }
    const validated = validateDutyReportManifest({
        definition,
        manifest,
        branchId,
        responseId: source.responseId,
        responseText: source.text,
    });
    if (!validated.ok) {
        const responseMismatch = validated.errors.some((error) => (
            error.includes('responseTextHash') || error.includes('segment must occur')
        ));
        return {
            ok: false,
            status: 'rejected',
            reasonCode: responseMismatch ? 'manifest-response-mismatch' : 'manifest-invalid',
            errors: [...validated.errors],
        };
    }
    const route = routeFor(definition, manifest.reportId);
    const delivery = {
        kind: DUTY_REPORT_DELIVERY_KIND,
        contractVersion: DUTY_REPORT_CONTRACT_VERSION,
        reportId: route.id,
        factId: route.factId,
        reporterId: manifest.reporterId,
        policyId: route.evidencePolicyId,
        responseId: manifest.responseId,
        hostMessageId: source.messageId,
        selectedSwipeId: source.selectedSwipeId || null,
        visibleTextHash: source.textHash,
        segmentTextHash: manifest.segmentTextHash,
        sourceTransactionId: manifest.sourceTransactionId,
    };
    const identity = [
        branchId,
        source.messageId,
        source.selectedSwipeId || 'no-swipe',
        source.textHash,
        route.evidencePolicyId,
        route.id,
    ].join('|');
    const claim = {
        claimId: `claim.${dutyReportTextHash(identity)}`,
        policyId: route.evidencePolicyId,
        claimType: 'factDisclosed',
        targetId: route.factId,
        sourceRef: {
            messageId: source.messageId,
            swipeId: source.selectedSwipeId || null,
            textHash: source.textHash,
        },
        delivery,
    };
    const receiptValidation = validateDutyReportDeliveryReceipt({ definition, delivery, claim, source });
    if (!receiptValidation.ok) {
        return {
            ok: false,
            status: 'rejected',
            reasonCode: 'delivery-invalid',
            errors: [...receiptValidation.errors],
        };
    }
    return {
        ok: true,
        status: 'materialized',
        reasonCode: null,
        route: cloneJson(route),
        claim,
        delivery,
        errors: [],
    };
}
