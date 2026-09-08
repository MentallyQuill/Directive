import { PUBLIC_PERSON_FACT_FIELDS } from '../people/people-event-contracts.mjs';
import { validateStorySettlement } from '../story/story-settlement-contracts.mjs';

const IDENTITY_FIELDS = new Set(['personId', 'displayName']);

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function compact(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function assertSettlement(settlement) {
    const result = validateStorySettlement(settlement);
    if (!result.ok) throw new TypeError(result.errors.join('\n'));
}

export function mergeMissingDossierFields({ current = {}, generated = {} } = {}) {
    const patch = {};
    const conflicts = [];
    for (const field of PUBLIC_PERSON_FACT_FIELDS) {
        if (IDENTITY_FIELDS.has(field)) continue;
        const generatedValue = compact(generated?.[field]);
        if (!generatedValue) continue;
        const currentValue = compact(current?.[field]);
        if (!currentValue) patch[field] = generatedValue;
        else if (currentValue !== generatedValue) conflicts.push(field);
    }
    return { patch, conflicts };
}

function findIntroduction(settlement, personId) {
    for (const episode of settlement?.episodes || []) {
        for (const event of episode.peopleEvents || []) {
            if (event?.type === 'personIntroduced' && event.personId === personId) {
                return { episode, event };
            }
        }
    }
    return null;
}

function currentPublicFacts(settlement, personId) {
    const introduction = findIntroduction(settlement, personId);
    if (!introduction) return null;
    const facts = { ...clone(introduction.event.publicFacts || {}) };
    facts.displayName = compact(facts.displayName || introduction.event.name);
    for (const episode of settlement?.episodes || []) {
        for (const event of episode.peopleEvents || []) {
            if (event?.type === 'publicFactLearned' && event.personId === personId) {
                facts[event.field] = compact(event.value);
            }
        }
    }
    return facts;
}

function removeJob(settlement, jobId) {
    settlement.pendingDossiers = (settlement.pendingDossiers || []).filter((job) => job.id !== jobId);
}

export function prepareDossierAttempt({ campaignState, jobId } = {}) {
    const candidateState = clone(campaignState);
    const settlement = candidateState?.storySettlement;
    assertSettlement(settlement);
    const job = (settlement.pendingDossiers || []).find((item) => item.id === jobId);
    if (!job || job.status !== 'pending' || job.attemptCount !== 0) {
        return { candidateState, job: job ? clone(job) : null, status: 'unavailable' };
    }
    settlement.revision += 1;
    job.status = 'in-flight';
    job.attemptCount = 1;
    assertSettlement(settlement);
    return { candidateState, job: clone(job), status: 'started' };
}

export function prepareDossierRetries({ campaignState, activeJobIds = [] } = {}) {
    const candidateState = clone(campaignState);
    const settlement = candidateState?.storySettlement;
    assertSettlement(settlement);
    const active = new Set(Array.isArray(activeJobIds) ? activeJobIds : []);
    const queuedJobIds = [];
    for (const job of settlement.pendingDossiers || []) {
        const retryableFailure = job.status === 'failed';
        const orphanedFlight = job.status === 'in-flight' && !active.has(job.id);
        if (!retryableFailure && !orphanedFlight) continue;
        job.status = 'pending';
        job.attemptCount = 0;
        queuedJobIds.push(job.id);
    }
    if (queuedJobIds.length === 0) {
        return { candidateState, queuedJobIds, status: 'unchanged' };
    }
    settlement.revision += 1;
    assertSettlement(settlement);
    return { candidateState, queuedJobIds, status: 'queued' };
}

export function prepareDossierEnrichment({ campaignState, job, outcome } = {}) {
    const candidateState = clone(campaignState);
    const settlement = candidateState?.storySettlement;
    assertSettlement(settlement);
    const storedJob = (settlement.pendingDossiers || []).find((item) => item.id === job?.id);
    if (!storedJob || storedJob.personId !== job?.personId) {
        return { candidateState, patch: {}, conflicts: [], status: 'discarded' };
    }
    if (outcome?.ok !== true) {
        settlement.revision += 1;
        storedJob.status = 'failed';
        storedJob.attemptCount = 1;
        assertSettlement(settlement);
        return { candidateState, patch: {}, conflicts: [], status: 'failed' };
    }
    const introduction = findIntroduction(settlement, job.personId);
    const sourcesSurvive = introduction && job.introductionSourceContributionIds.every((id) => (
        (introduction.event.sourceContributionIds || []).includes(id)
    ));
    const generated = outcome.generated;
    const identityMatches = generated?.personId === job.personId
        && compact(generated?.displayName) === compact(introduction?.event?.name);
    if (!sourcesSurvive || !identityMatches) {
        settlement.revision += 1;
        removeJob(settlement, job.id);
        assertSettlement(settlement);
        return { candidateState, patch: {}, conflicts: [], status: 'discarded' };
    }
    const current = currentPublicFacts(settlement, job.personId);
    const { patch, conflicts } = mergeMissingDossierFields({ current, generated });
    settlement.revision += 1;
    introduction.event.publicFacts = { ...introduction.event.publicFacts, ...patch };
    removeJob(settlement, job.id);
    assertSettlement(settlement);
    return { candidateState, patch, conflicts, status: 'merged' };
}

export function createPeopleDossierQueue({ author, stageResult } = {}) {
    if (typeof author !== 'function') throw new TypeError('people-dossier-author-required');
    if (typeof stageResult !== 'function') throw new TypeError('people-dossier-stage-result-required');
    const flights = new Map();

    function run(job) {
        if (flights.has(job?.id)) return flights.get(job.id).promise;
        if (!job?.id || job.status === 'failed' || job.attemptCount > 1) {
            return Promise.resolve({
                ok: false,
                jobId: job?.id ?? null,
                reasonCode: 'attempt-unavailable',
            });
        }
        const controller = new AbortController();
        let settleCancellation;
        const cancellation = new Promise((resolve) => { settleCancellation = resolve; });
        const entry = { controller, canceled: false, promise: null, settleCancellation };
        const introduction = {
            personId: job.personId,
            name: compact(job.publicContext?.displayName),
            introductionSummary: compact(job.publicContext?.introductionSummary),
        };
        let authorResult;
        try {
            authorResult = author({
                introductions: [introduction],
                campaignContext: clone(job.publicContext?.campaignContext || {}),
                signal: controller.signal,
            });
        } catch (error) {
            authorResult = Promise.reject(error);
        }
        const authorWork = Promise.resolve(authorResult).then(async (result) => {
            const generated = result?.ok === true
                ? (result.dossiers || []).find((dossier) => dossier?.personId === job.personId)
                : null;
            const outcome = generated
                ? { ok: true, generated: clone(generated) }
                : { ok: false, reasonCode: result?.reasonCode || 'dossier-unavailable' };
            if (!entry.canceled) await stageResult({ job: clone(job), outcome: clone(outcome) });
            return entry.canceled
                ? { ok: false, jobId: job.id, reasonCode: 'aborted' }
                : { ok: outcome.ok, jobId: job.id, ...(outcome.ok ? { outcome } : { reasonCode: outcome.reasonCode }) };
        }).catch(async (error) => {
            const outcome = { ok: false, reasonCode: error?.code || 'provider-threw' };
            if (!entry.canceled) await stageResult({ job: clone(job), outcome });
            return entry.canceled
                ? { ok: false, jobId: job.id, reasonCode: 'aborted' }
                : { ok: false, jobId: job.id, reasonCode: outcome.reasonCode };
        });
        entry.promise = Promise.race([authorWork, cancellation]).finally(() => {
            if (flights.get(job.id) === entry) flights.delete(job.id);
        });
        flights.set(job.id, entry);
        return entry.promise;
    }

    function cancel(jobId) {
        const entry = flights.get(jobId);
        if (!entry) return false;
        entry.canceled = true;
        entry.controller.abort();
        entry.settleCancellation({ ok: false, jobId, reasonCode: 'aborted' });
        return true;
    }

    function clear() {
        for (const [jobId] of flights) cancel(jobId);
    }

    return { run, cancel, clear };
}
