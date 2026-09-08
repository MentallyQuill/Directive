import { sha256Json } from '../storage/v1-state-delta-codec.mjs';

export const CONTINUITY_EVENT_KIND = 'directive.continuityEvent.v1';
export const STORY_DIRECTOR_RECEIPT_KIND = 'directive.storyDirectorReceipt.v1';
export const PENDING_DOSSIER_KIND = 'directive.pendingDossier.v1';

export const CONTINUITY_CATEGORIES = Object.freeze(new Set([
    'obligation',
    'schedule',
    'constraint',
    'resource-consequence',
    'unresolved-problem',
]));
export const CONTINUITY_CLAIM_TYPES = Object.freeze(new Set([
    'narrated-fact',
    'character-claim',
    'player-commitment',
]));
export const CONTINUITY_STATUSES = Object.freeze(new Set(['active', 'deferred', 'resolved']));

const SOURCE_SLOTS = new Set(['previousAssistant', 'currentPlayer']);
const OPERATION_FIELDS = Object.freeze({
    open: new Set(['operation', 'localRef', 'title', 'category', 'sourceSlot', 'evidenceQuote']),
    addFact: new Set([
        'operation', 'threadRef', 'text', 'claimType', 'authoredRef', 'supersedesFactId',
        'sourceSlot', 'evidenceQuote',
    ]),
    setStatus: new Set(['operation', 'threadRef', 'status', 'sourceSlot', 'evidenceQuote']),
});
const EVENT_FIELDS = new Set([
    'kind', 'id', 'threadId', 'branchId', 'operation', 'payload', 'sourceContributionIds',
    'sources', 'dependsOnEventIds', 'settledAtRevision',
]);
const EVENT_PAYLOAD_FIELDS = Object.freeze({
    open: new Set(['title', 'category']),
    addFact: new Set(['text', 'claimType', 'authoredRef', 'supersedesFactId']),
    setStatus: new Set(['status']),
});
const SOURCE_ANCHOR_FIELDS = new Set([
    'messageId', 'selectedSwipeId', 'textHash', 'evidenceQuote',
]);
const DIRECTOR_RECEIPT_FIELDS = new Set([
    'kind', 'id', 'branchId', 'packageId', 'packageVersion', 'missionId', 'generationType',
    'generationTargetKey', 'requestKey', 'reuseKey', 'sourceRangeHash', 'sourceContributionIds',
    'instruction', 'dependencyIds', 'settledAtRevision',
]);
const DIRECTOR_GENERATION_TYPES = new Set(['normal', 'continue', 'swipe', 'regenerate']);
const PENDING_DOSSIER_FIELDS = new Set([
    'kind', 'id', 'personId', 'introductionSourceContributionIds', 'status', 'attemptCount',
    'publicContext',
]);
const PENDING_DOSSIER_STATUSES = new Set(['pending', 'in-flight', 'staged', 'failed']);

function normalize(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function isContinuityStableId(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]*$/.test(value);
}

function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unknownFields(value, allowed, prefix, errors) {
    for (const field of Object.keys(plainObject(value) ? value : {})) {
        if (!allowed.has(field)) errors.push(`${prefix}-field-unknown:${field}`);
    }
}

function validateNullableStableId(value, prefix, errors) {
    if (value !== null && !isContinuityStableId(value)) errors.push(`${prefix}-invalid`);
}

function validateIdArray(value, prefix, errors, { nonEmpty = false } = {}) {
    if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
        errors.push(`${prefix}-invalid`);
        return;
    }
    if (new Set(value).size !== value.length) errors.push(`${prefix}-duplicate`);
    if (value.some((id) => !isContinuityStableId(id))) errors.push(`${prefix}-invalid-id`);
}

export function requireSourceQuote(change, sourcePair) {
    if (!SOURCE_SLOTS.has(change?.sourceSlot)) {
        throw new TypeError('continuity-source-slot-invalid');
    }
    const source = sourcePair?.[change.sourceSlot];
    const quote = normalize(change?.evidenceQuote);
    if (!source?.messageId || !source.textHash || quote.length < 12
        || quote.length > 240 || !normalize(source.text).includes(quote)) {
        throw new TypeError('continuity-source-quote-invalid');
    }
    return {
        messageId: source.messageId,
        selectedSwipeId: source.selectedSwipeId ?? null,
        textHash: source.textHash,
        evidenceQuote: quote,
    };
}

function validateOpen(change, errors) {
    if (!isContinuityStableId(change.localRef) || change.localRef.length > 80) {
        errors.push('continuity-local-ref-invalid');
    }
    const title = normalize(change.title);
    if (!title || title.length > 120) errors.push('continuity-title-invalid');
    if (!CONTINUITY_CATEGORIES.has(change.category)) errors.push('continuity-category-invalid');
}

function validateAddFact(change, authoredIds, errors) {
    if (!isContinuityStableId(change.threadRef)) errors.push('continuity-thread-ref-invalid');
    const text = normalize(change.text);
    if (!text || text.length > 512) errors.push('continuity-fact-text-invalid');
    if (!CONTINUITY_CLAIM_TYPES.has(change.claimType)) errors.push('continuity-claim-type-invalid');
    validateNullableStableId(change.authoredRef, 'continuity-authored-ref', errors);
    validateNullableStableId(change.supersedesFactId, 'continuity-supersedes-fact', errors);
    if (change.authoredRef !== null && !authoredIds.has(change.authoredRef)) {
        errors.push(`continuity-authored-ref-unknown:${change.authoredRef}`);
    }
    if (change.sourceSlot === 'currentPlayer' && change.claimType !== 'player-commitment') {
        errors.push('continuity-player-claim-type-invalid');
    }
    if (change.sourceSlot === 'previousAssistant' && change.claimType === 'player-commitment') {
        errors.push('continuity-player-commitment-source-invalid');
    }
}

function validateSetStatus(change, errors) {
    if (!isContinuityStableId(change.threadRef)) errors.push('continuity-thread-ref-invalid');
    if (!CONTINUITY_STATUSES.has(change.status)) errors.push('continuity-status-invalid');
    if (change.status === 'resolved' && change.sourceSlot !== 'previousAssistant') {
        errors.push('continuity-resolved-source-invalid');
    }
}

export function validateContinuityChanges(changes, {
    sourcePair,
    existingThreads = [],
    authoredIds = [],
} = {}) {
    const errors = [];
    if (!Array.isArray(changes)) return { ok: false, errors: ['continuity-changes-invalid'] };
    if (changes.length > 16) errors.push('continuity-change-count-exceeded');
    const threads = Array.isArray(existingThreads) ? existingThreads : [];
    const existingThreadIds = new Set(threads.map((thread) => thread?.id).filter(isContinuityStableId));
    const factThread = new Map();
    for (const thread of threads) {
        for (const fact of Array.isArray(thread?.facts) ? thread.facts : []) {
            if (isContinuityStableId(fact?.id)) factThread.set(fact.id, thread.id);
        }
    }
    const authoredIdSet = new Set(Array.isArray(authoredIds) ? authoredIds : authoredIds instanceof Set ? authoredIds : []);
    const localRefs = new Set();
    const duplicateLocalRefs = new Set();

    for (const [index, change] of changes.entries()) {
        if (!plainObject(change)) {
            errors.push(`continuity-change-invalid:${index}`);
            continue;
        }
        const allowed = OPERATION_FIELDS[change.operation];
        if (!allowed) {
            errors.push(`continuity-operation-invalid:${index}`);
            continue;
        }
        unknownFields(change, allowed, `continuity-change-${index}`, errors);
        for (const field of allowed) {
            if (!Object.hasOwn(change, field)) errors.push(`continuity-change-${index}-field-required:${field}`);
        }
        try {
            requireSourceQuote(change, sourcePair);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : 'continuity-source-invalid');
        }
        if (change.operation === 'open') {
            validateOpen(change, errors);
            if (localRefs.has(change.localRef)) duplicateLocalRefs.add(change.localRef);
            localRefs.add(change.localRef);
        } else if (change.operation === 'addFact') {
            validateAddFact(change, authoredIdSet, errors);
        } else {
            validateSetStatus(change, errors);
        }
    }
    for (const localRef of duplicateLocalRefs) errors.push(`continuity-local-ref-duplicate:${localRef}`);

    for (const change of changes) {
        if (!plainObject(change) || !new Set(['addFact', 'setStatus']).has(change.operation)) continue;
        if (!existingThreadIds.has(change.threadRef) && !localRefs.has(change.threadRef)) {
            errors.push(`continuity-thread-ref-unknown:${change.threadRef}`);
        }
        if (change.operation === 'addFact' && change.supersedesFactId !== null) {
            const owner = factThread.get(change.supersedesFactId);
            if (!owner) errors.push(`continuity-supersedes-fact-unknown:${change.supersedesFactId}`);
            else if (owner !== change.threadRef) {
                errors.push(`continuity-supersedes-cross-thread:${change.supersedesFactId}`);
            }
        }
    }
    for (const localRef of localRefs) {
        const open = changes.find((change) => change?.operation === 'open' && change.localRef === localRef);
        const hasFact = changes.some((change) => change?.operation === 'addFact' && change.threadRef === localRef);
        const explicitPlayerObligation = open?.category === 'obligation' && open.sourceSlot === 'currentPlayer';
        if (!hasFact && !explicitPlayerObligation) errors.push(`continuity-open-ungrounded:${localRef}`);
    }
    return { ok: errors.length === 0, errors };
}

export function validateContinuitySourceAnchor(source, { prefix = 'continuity-source' } = {}) {
    const errors = [];
    if (!plainObject(source)) return { ok: false, errors: [`${prefix}-invalid`] };
    unknownFields(source, SOURCE_ANCHOR_FIELDS, prefix, errors);
    if (typeof source.messageId !== 'string' || !source.messageId || source.messageId.length > 300) {
        errors.push(`${prefix}-message-id-invalid`);
    }
    if (source.selectedSwipeId !== null
        && (typeof source.selectedSwipeId !== 'string' || !source.selectedSwipeId || source.selectedSwipeId.length > 300)) {
        errors.push(`${prefix}-swipe-id-invalid`);
    }
    if (typeof source.textHash !== 'string' || !source.textHash || source.textHash.length > 128) {
        errors.push(`${prefix}-text-hash-invalid`);
    }
    const quote = normalize(source.evidenceQuote);
    if (quote.length < 12 || quote.length > 240 || quote !== source.evidenceQuote) {
        errors.push(`${prefix}-quote-invalid`);
    }
    return { ok: errors.length === 0, errors };
}

export function validateContinuityEvent(event, {
    branchId = null,
    maximumRevision = null,
    knownContributionIds = null,
    knownEventIds = null,
    knownThreadIds = null,
} = {}) {
    const errors = [];
    if (!plainObject(event)) return { ok: false, errors: ['continuity-event-invalid'] };
    unknownFields(event, EVENT_FIELDS, 'continuity-event', errors);
    if (event.kind !== CONTINUITY_EVENT_KIND) errors.push('continuity-event-kind-invalid');
    if (!isContinuityStableId(event.id)) errors.push('continuity-event-id-invalid');
    if (!isContinuityStableId(event.threadId)) errors.push('continuity-event-thread-id-invalid');
    if (!isContinuityStableId(event.branchId) || (branchId !== null && event.branchId !== branchId)) {
        errors.push('continuity-event-branch-invalid');
    }
    const payloadFields = EVENT_PAYLOAD_FIELDS[event.operation];
    if (!payloadFields || !plainObject(event.payload)) {
        errors.push('continuity-event-operation-invalid');
    } else {
        unknownFields(event.payload, payloadFields, 'continuity-event-payload', errors);
        for (const field of payloadFields) {
            if (!Object.hasOwn(event.payload, field)) errors.push(`continuity-event-payload-field-required:${field}`);
        }
        if (event.operation === 'open') validateOpen({ ...event.payload, localRef: 'event-local-ref' }, errors);
        if (event.operation === 'addFact') {
            validateAddFact({
                ...event.payload,
                threadRef: event.threadId,
                sourceSlot: event.payload.claimType === 'player-commitment' ? 'currentPlayer' : 'previousAssistant',
            }, new Set(event.payload.authoredRef === null ? [] : [event.payload.authoredRef]), errors);
        }
        if (event.operation === 'setStatus') validateSetStatus({
            ...event.payload,
            threadRef: event.threadId,
            sourceSlot: event.payload.status === 'resolved' ? 'previousAssistant' : 'currentPlayer',
        }, errors);
    }
    validateIdArray(event.sourceContributionIds, 'continuity-event-sources', errors, { nonEmpty: true });
    if (knownContributionIds instanceof Set && Array.isArray(event.sourceContributionIds)) {
        for (const id of event.sourceContributionIds) {
            if (!knownContributionIds.has(id)) errors.push(`continuity-event-source-unknown:${id}`);
        }
    }
    if (!Array.isArray(event.sources) || event.sources.length !== event.sourceContributionIds?.length) {
        errors.push('continuity-event-source-anchors-invalid');
    } else {
        for (const [index, source] of event.sources.entries()) {
            errors.push(...validateContinuitySourceAnchor(source, { prefix: `continuity-event-source-${index}` }).errors);
        }
    }
    validateIdArray(event.dependsOnEventIds, 'continuity-event-dependencies', errors);
    if (knownEventIds instanceof Set && Array.isArray(event.dependsOnEventIds)) {
        for (const id of event.dependsOnEventIds) {
            if (!knownEventIds.has(id)) errors.push(`continuity-event-dependency-unknown:${id}`);
        }
    }
    if (event.operation === 'open' && event.dependsOnEventIds?.length !== 0) {
        errors.push('continuity-open-dependencies-invalid');
    }
    if (event.operation !== 'open' && knownThreadIds instanceof Set && !knownThreadIds.has(event.threadId)) {
        errors.push(`continuity-event-thread-unknown:${event.threadId}`);
    }
    if (!Number.isInteger(event.settledAtRevision) || event.settledAtRevision < 0
        || (Number.isInteger(maximumRevision) && event.settledAtRevision > maximumRevision)) {
        errors.push('continuity-event-revision-invalid');
    }
    return { ok: errors.length === 0, errors };
}

export function validateDirectorReceipt(receipt, {
    branchId = null,
    maximumRevision = null,
    knownContributionIds = null,
} = {}) {
    const errors = [];
    if (!plainObject(receipt)) return { ok: false, errors: ['director-receipt-invalid'] };
    unknownFields(receipt, DIRECTOR_RECEIPT_FIELDS, 'director-receipt', errors);
    if (receipt.kind !== STORY_DIRECTOR_RECEIPT_KIND) errors.push('director-receipt-kind-invalid');
    if (!isContinuityStableId(receipt.id)) errors.push('director-receipt-id-invalid');
    if (!isContinuityStableId(receipt.branchId) || (branchId !== null && receipt.branchId !== branchId)) {
        errors.push('director-receipt-branch-invalid');
    }
    for (const field of ['packageId', 'missionId']) {
        if (!isContinuityStableId(receipt[field])) errors.push(`director-receipt-${field}-invalid`);
    }
    if ((typeof receipt.packageVersion !== 'string' && !Number.isInteger(receipt.packageVersion))
        || String(receipt.packageVersion).length === 0 || String(receipt.packageVersion).length > 80) {
        errors.push('director-receipt-package-version-invalid');
    }
    if (!DIRECTOR_GENERATION_TYPES.has(receipt.generationType)) {
        errors.push('director-receipt-generation-type-invalid');
    }
    for (const field of ['generationTargetKey', 'requestKey', 'reuseKey', 'sourceRangeHash']) {
        if (typeof receipt[field] !== 'string' || !receipt[field] || receipt[field].length > 300) {
            errors.push(`director-receipt-${field}-invalid`);
        }
    }
    validateIdArray(receipt.sourceContributionIds, 'director-receipt-sources', errors, { nonEmpty: true });
    if (knownContributionIds instanceof Set && Array.isArray(receipt.sourceContributionIds)) {
        for (const id of receipt.sourceContributionIds) {
            if (!knownContributionIds.has(id)) errors.push(`director-receipt-source-unknown:${id}`);
        }
    }
    if (typeof receipt.instruction !== 'string' || !normalize(receipt.instruction)
        || receipt.instruction.length > 4096) {
        errors.push('director-receipt-instruction-invalid');
    }
    validateIdArray(receipt.dependencyIds, 'director-receipt-dependencies', errors);
    if (!Number.isInteger(receipt.settledAtRevision) || receipt.settledAtRevision < 0
        || (Number.isInteger(maximumRevision) && receipt.settledAtRevision > maximumRevision)) {
        errors.push('director-receipt-revision-invalid');
    }
    return { ok: errors.length === 0, errors };
}

export async function createDirectorReceipt(input = {}) {
    const value = {
        kind: STORY_DIRECTOR_RECEIPT_KIND,
        branchId: input.branchId,
        packageId: input.packageId,
        packageVersion: input.packageVersion,
        missionId: input.missionId,
        generationType: input.generationType,
        generationTargetKey: input.generationTargetKey,
        requestKey: input.requestKey,
        reuseKey: input.reuseKey,
        sourceRangeHash: input.sourceRangeHash,
        sourceContributionIds: structuredClone(input.sourceContributionIds || []),
        instruction: input.instruction,
        dependencyIds: structuredClone(input.dependencyIds || []),
        settledAtRevision: input.settledAtRevision,
    };
    const digest = await sha256Json({
        contract: STORY_DIRECTOR_RECEIPT_KIND,
        ...value,
        settledAtRevision: undefined,
    });
    const receipt = { ...value, id: `director-receipt.${digest}` };
    const result = validateDirectorReceipt(receipt);
    if (!result.ok) throw new TypeError(`director-receipt-invalid:${result.errors.join(',')}`);
    return receipt;
}

export function validatePendingDossier(job, { knownContributionIds = null } = {}) {
    const errors = [];
    if (!plainObject(job)) return { ok: false, errors: ['pending-dossier-invalid'] };
    unknownFields(job, PENDING_DOSSIER_FIELDS, 'pending-dossier', errors);
    if (job.kind !== PENDING_DOSSIER_KIND) errors.push('pending-dossier-kind-invalid');
    if (!isContinuityStableId(job.id)) errors.push('pending-dossier-id-invalid');
    if (!isContinuityStableId(job.personId)) errors.push('pending-dossier-person-id-invalid');
    validateIdArray(job.introductionSourceContributionIds, 'pending-dossier-sources', errors, { nonEmpty: true });
    if (knownContributionIds instanceof Set && Array.isArray(job.introductionSourceContributionIds)) {
        for (const id of job.introductionSourceContributionIds) {
            if (!knownContributionIds.has(id)) errors.push(`pending-dossier-source-unknown:${id}`);
        }
    }
    if (!PENDING_DOSSIER_STATUSES.has(job.status)) errors.push('pending-dossier-status-invalid');
    if (!Number.isInteger(job.attemptCount) || job.attemptCount < 0 || job.attemptCount > 1) {
        errors.push('pending-dossier-attempt-count-invalid');
    }
    if (Object.hasOwn(job, 'publicContext') && !plainObject(job.publicContext)) {
        errors.push('pending-dossier-public-context-invalid');
    }
    return { ok: errors.length === 0, errors };
}

export async function createPendingDossier({
    personId,
    introductionSourceContributionIds = [],
    publicContext = {},
} = {}) {
    const digest = await sha256Json({
        contract: PENDING_DOSSIER_KIND,
        personId,
        introductionSourceContributionIds,
    });
    const job = {
        kind: PENDING_DOSSIER_KIND,
        id: `pending-dossier.${digest}`,
        personId,
        introductionSourceContributionIds: structuredClone(introductionSourceContributionIds),
        status: 'pending',
        attemptCount: 0,
        publicContext: structuredClone(publicContext),
    };
    const result = validatePendingDossier(job);
    if (!result.ok) throw new TypeError(`pending-dossier-invalid:${result.errors.join(',')}`);
    return job;
}
