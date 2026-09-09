import { canonicalJson, sha256Json } from '../storage/v1-state-delta-codec.mjs';
import { stableSha256Hex } from '../runtime/v1-stable-hash.mjs';
import {
    CONTINUITY_EVENT_KIND,
    isContinuityStableId,
    requireSourceQuote,
    validateContinuityChanges,
} from './continuity-contracts.mjs';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function normalize(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unique(values) {
    return [...new Set(values)];
}

function sourcePairIdentity(sourcePair = {}) {
    return Object.fromEntries(['previousAssistant', 'currentPlayer'].map((slot) => {
        const source = sourcePair?.[slot] || {};
        return [slot, {
            messageId: source.messageId,
            selectedSwipeId: source.selectedSwipeId ?? null,
            textHash: source.textHash,
        }];
    }));
}

function normalizeChange(change) {
    const source = {
        operation: change.operation,
        sourceSlot: change.sourceSlot,
        evidenceQuote: normalize(change.evidenceQuote),
    };
    if (change.operation === 'open') {
        return {
            ...source,
            localRef: change.localRef,
            title: normalize(change.title),
            category: change.category,
        };
    }
    if (change.operation === 'addFact') {
        return {
            ...source,
            threadRef: change.threadRef,
            text: normalize(change.text),
            claimType: change.claimType,
            authoredRef: change.authoredRef,
            supersedesFactId: change.supersedesFactId,
            ...(Object.hasOwn(change, 'linkedIds') ? { linkedIds: clone(change.linkedIds) } : {}),
            ...(Object.hasOwn(change, 'deadlineElapsedSeconds') ? { deadlineElapsedSeconds: change.deadlineElapsedSeconds } : {}),
        };
    }
    return {
        ...source,
        threadRef: change.threadRef,
        status: change.status,
    };
}

function payloadFor(change) {
    if (change.operation === 'open') {
        return { title: change.title, category: change.category };
    }
    if (change.operation === 'addFact') {
        return {
            text: change.text,
            claimType: change.claimType,
            authoredRef: change.authoredRef,
            supersedesFactId: change.supersedesFactId,
            ...(Object.hasOwn(change, 'linkedIds') ? { linkedIds: clone(change.linkedIds) } : {}),
            ...(Object.hasOwn(change, 'deadlineElapsedSeconds') ? { deadlineElapsedSeconds: change.deadlineElapsedSeconds } : {}),
        };
    }
    return { status: change.status };
}

function creationByThread(events) {
    return new Map(events
        .filter((event) => event?.operation === 'open')
        .map((event) => [event.threadId, event]));
}

function compareChanges(left, right) {
    const rank = { open: 0, addFact: 1, setStatus: 2 };
    return rank[left.operation] - rank[right.operation]
        || canonicalJson(left).localeCompare(canonicalJson(right));
}

function filteredAcceptedChanges(changes, assistantAccepted) {
    const accepted = changes.filter((change) => (
        assistantAccepted || change.sourceSlot !== 'previousAssistant'
    ));
    const survivingLocalRefs = new Set(accepted
        .filter((change) => change.operation === 'open')
        .map((change) => change.localRef));
    let filtered = accepted.filter((change) => (
        change.operation === 'open'
        || !changes.some((candidate) => candidate.operation === 'open' && candidate.localRef === change.threadRef)
        || survivingLocalRefs.has(change.threadRef)
    ));
    const groundedLocalRefs = new Set(filtered
        .filter((change) => change.operation === 'addFact' && survivingLocalRefs.has(change.threadRef))
        .map((change) => change.threadRef));
    for (const open of filtered.filter((change) => change.operation === 'open')) {
        if (open.category === 'obligation' && open.sourceSlot === 'currentPlayer') {
            groundedLocalRefs.add(open.localRef);
        }
    }
    filtered = filtered.filter((change) => (
        change.operation === 'open'
            ? groundedLocalRefs.has(change.localRef)
            : !survivingLocalRefs.has(change.threadRef) || groundedLocalRefs.has(change.threadRef)
    ));
    return filtered;
}

function assertMaterializeInput({
    contributionIds,
    branchId,
    sourceRangeHash,
    settledAtRevision,
    existingEvents,
}) {
    if (!isContinuityStableId(branchId)) throw new TypeError('continuity-branch-id-invalid');
    if (typeof sourceRangeHash !== 'string' || !sourceRangeHash) {
        throw new TypeError('continuity-source-range-hash-invalid');
    }
    if (!Number.isInteger(settledAtRevision) || settledAtRevision < 0) {
        throw new TypeError('continuity-settled-revision-invalid');
    }
    if (!Array.isArray(existingEvents)) throw new TypeError('continuity-existing-events-invalid');
    for (const slot of ['previousAssistant', 'currentPlayer']) {
        if (!isContinuityStableId(contributionIds?.[slot])) {
            throw new TypeError(`continuity-source-contribution-invalid:${slot}`);
        }
    }
}

function equivalentPayload(left, right) {
    return left.operation === right.operation
        && left.threadId === right.threadId
        && canonicalJson(left.payload) === canonicalJson(right.payload);
}

export async function materializeContinuityChanges({
    changes,
    sourcePair,
    assistantAccepted,
    contributionIds,
    branchId,
    sourceRangeHash,
    existingEvents = [],
    settledAtRevision,
    authoredIds = [],
    authoredDeadlines = {},
    knownLinkIds = [],
    temporalContext = null,
    limits = {},
} = {}) {
    assertMaterializeInput({
        contributionIds, branchId, sourceRangeHash, settledAtRevision, existingEvents,
    });
    if (existingEvents.some((event) => event?.branchId !== branchId)) {
        throw new TypeError('continuity-existing-event-branch-invalid');
    }
    const existingThreads = projectContinuityThreads(existingEvents);
    const validation = validateContinuityChanges(changes, {
        sourcePair,
        existingThreads,
        authoredIds,
        authoredDeadlines,
        knownLinkIds,
        temporalContext,
        limits,
    });
    if (!validation.ok) {
        throw new TypeError(`continuity-changes-invalid:${validation.errors.join(',')}`);
    }
    const normalized = filteredAcceptedChanges(changes.map(normalizeChange), assistantAccepted === true)
        .sort(compareChanges);
    if (normalized.length === 0) return clone(existingEvents);

    const result = clone(existingEvents);
    const pairIdentity = sourcePairIdentity(sourcePair);
    const localThreadIds = new Map();
    const localCreationIds = new Map();
    for (const change of normalized.filter((candidate) => candidate.operation === 'open')) {
        const digest = await sha256Json({
            contract: CONTINUITY_EVENT_KIND,
            branchId,
            sourceRangeHash,
            sourcePair: pairIdentity,
            change,
            localRef: change.localRef,
        });
        localThreadIds.set(change.localRef, `continuity-thread.${digest}`);
        localCreationIds.set(change.localRef, `continuity-event.${digest}`);
    }

    const creations = creationByThread(result);
    const addedEvents = [];
    for (const change of normalized) {
        const threadId = change.operation === 'open'
            ? localThreadIds.get(change.localRef)
            : localThreadIds.get(change.threadRef) || change.threadRef;
        const changeIdentity = {
            ...change,
            threadRef: change.operation === 'open' ? undefined : threadId,
        };
        delete changeIdentity.localRef;
        if (change.operation === 'open') changeIdentity.localRef = change.localRef;
        const eventId = change.operation === 'open'
            ? localCreationIds.get(change.localRef)
            : `continuity-event.${await sha256Json({
                contract: CONTINUITY_EVENT_KIND,
                branchId,
                sourceRangeHash,
                sourcePair: pairIdentity,
                change: changeIdentity,
                localRef: localThreadIds.has(change.threadRef) ? change.threadRef : null,
            })}`;
        const creation = change.operation === 'open'
            ? null
            : creations.get(threadId) || addedEvents.find((event) => (
                event.operation === 'open' && event.threadId === threadId
            ));
        if (change.operation !== 'open' && !creation) {
            throw new TypeError(`continuity-thread-creation-missing:${threadId}`);
        }
        const dependencies = creation ? [creation.id] : [];
        if (change.operation === 'addFact') for (const linkedId of change.linkedIds || []) {
            const linkedCreation = creations.get(linkedId);
            if (linkedCreation) dependencies.push(linkedCreation.id);
        }
        if (change.operation === 'addFact' && change.supersedesFactId !== null) {
            dependencies.push(change.supersedesFactId);
        }
        if (change.operation === 'setStatus' && ['resolved', 'expired'].includes(change.status)) {
            const liveThread = projectContinuityThreads([...result, ...addedEvents])
                .find((thread) => thread.id === threadId);
            dependencies.push(...(liveThread?.facts || []).map((fact) => fact.id));
        }
        const source = requireSourceQuote(change, sourcePair, limits);
        const event = {
            kind: CONTINUITY_EVENT_KIND,
            id: eventId,
            threadId,
            branchId,
            operation: change.operation,
            payload: payloadFor(change),
            sourceContributionIds: [contributionIds[change.sourceSlot]],
            sources: [source],
            dependsOnEventIds: unique(dependencies),
            settledAtRevision,
        };
        const prior = result.find((candidate) => candidate.id === event.id);
        if (prior) {
            if (!equivalentPayload(prior, event)) {
                throw new TypeError(`continuity-event-id-integrity:${event.id}`);
            }
            continue;
        }
        addedEvents.push(event);
        if (event.operation === 'open') creations.set(event.threadId, event);
    }
    return [...result, ...addedEvents];
}

export function pruneContinuityEvents(events, invalidSourceIds = new Set()) {
    const invalid = invalidSourceIds instanceof Set
        ? invalidSourceIds
        : new Set(Array.isArray(invalidSourceIds) ? invalidSourceIds : []);
    let survivors = (Array.isArray(events) ? events : []).filter((event) => (
        !(event.sourceContributionIds || []).some((id) => invalid.has(id))
    ));
    let changed = true;
    while (changed) {
        const survivorIds = new Set(survivors.map((event) => event.id));
        const next = survivors.filter((event) => (
            (event.dependsOnEventIds || []).every((id) => survivorIds.has(id))
        ));
        changed = next.length !== survivors.length;
        survivors = next;
    }
    return clone(survivors);
}

export function projectContinuityThreads(events) {
    const threads = new Map();
    const surviving = pruneContinuityEvents(events, new Set());
    for (const event of surviving) {
        if (event.operation === 'open') {
            if (!threads.has(event.threadId)) {
                threads.set(event.threadId, {
                    id: event.threadId,
                    title: event.payload.title,
                    category: event.payload.category,
                    status: 'active',
                    facts: [],
                    sourceContributionIds: [],
                });
            }
        }
        const thread = threads.get(event.threadId);
        if (!thread) continue;
        thread.sourceContributionIds = unique([
            ...thread.sourceContributionIds,
            ...(event.sourceContributionIds || []),
        ]);
        if (event.operation === 'addFact') {
            if (event.payload.supersedesFactId !== null) {
                thread.facts = thread.facts.filter((fact) => fact.id !== event.payload.supersedesFactId);
            }
            thread.facts.push({
                id: event.id,
                text: event.payload.text,
                claimType: event.payload.claimType,
                authoredRef: event.payload.authoredRef,
                ...(Object.hasOwn(event.payload, 'linkedIds') ? { linkedIds: clone(event.payload.linkedIds) } : {}),
                ...(Object.hasOwn(event.payload, 'deadlineElapsedSeconds') ? { deadlineElapsedSeconds: event.payload.deadlineElapsedSeconds } : {}),
                sourceContributionIds: clone(event.sourceContributionIds),
                sources: clone(event.sources),
            });
        } else if (event.operation === 'setStatus') {
            thread.status = event.payload.status;
        }
    }
    return [...threads.values()].map(clone);
}

function contributionReplacement(contributionMap, id) {
    if (contributionMap instanceof Map) return contributionMap.get(id);
    if (contributionMap && typeof contributionMap === 'object') return contributionMap[id];
    return undefined;
}

export function rebindContinuityEventsSync(events, { branchId, contributionMap } = {}) {
    if (!isContinuityStableId(branchId)) throw new TypeError('continuity-rebind-branch-invalid');
    if (!(contributionMap instanceof Map) && (!contributionMap || typeof contributionMap !== 'object')) {
        throw new TypeError('continuity-rebind-contribution-map-invalid');
    }
    const sourceEvents = clone(Array.isArray(events) ? events : []);
    for (const event of sourceEvents) {
        for (const contributionId of event.sourceContributionIds || []) {
            if (!isContinuityStableId(contributionReplacement(contributionMap, contributionId))) {
                throw new TypeError(`continuity-contribution-map-missing:${contributionId}`);
            }
        }
    }
    const threadMap = new Map();
    for (const event of sourceEvents) {
        if (threadMap.has(event.threadId)) continue;
        const digest = stableSha256Hex(canonicalJson({
            contract: 'directive.continuityThreadRebind.v1',
            branchId,
            sourceThreadId: event.threadId,
        }));
        threadMap.set(event.threadId, `continuity-thread.${digest}`);
    }
    const eventMap = new Map();
    for (const event of sourceEvents) {
        const sourceContributionIds = event.sourceContributionIds
            .map((id) => contributionReplacement(contributionMap, id));
        const digest = stableSha256Hex(canonicalJson({
            contract: 'directive.continuityEventRebind.v1',
            branchId,
            sourceEventId: event.id,
            threadId: threadMap.get(event.threadId),
            operation: event.operation,
            payload: event.payload,
            sourceContributionIds,
        }));
        eventMap.set(event.id, `continuity-event.${digest}`);
    }
    const rebound = sourceEvents.map((event) => ({
        ...event,
        id: eventMap.get(event.id),
        threadId: threadMap.get(event.threadId),
        branchId,
        payload: event.operation === 'addFact' && event.payload.supersedesFactId !== null
            ? {
                ...event.payload,
                supersedesFactId: eventMap.get(event.payload.supersedesFactId),
            }
            : event.payload,
        sourceContributionIds: event.sourceContributionIds
            .map((id) => contributionReplacement(contributionMap, id)),
        dependsOnEventIds: event.dependsOnEventIds.map((id) => eventMap.get(id)),
    }));
    for (const event of rebound) if (event.operation === 'addFact' && event.payload.linkedIds) {
        event.payload = { ...event.payload, linkedIds: event.payload.linkedIds.map(id => threadMap.get(id) || id) };
    }
    if (rebound.some((event) => (
        !event.id || !event.threadId || event.dependsOnEventIds.some((id) => !id)
        || (event.operation === 'addFact' && event.payload.supersedesFactId === undefined)
    ))) {
        throw new TypeError('continuity-event-map-missing');
    }
    return { events: rebound, eventMap, threadMap };
}

export async function rebindContinuityEvents(events, options = {}) {
    return rebindContinuityEventsSync(events, options);
}
