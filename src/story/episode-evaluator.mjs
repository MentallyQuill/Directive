import { validateStorySettlement } from './story-settlement-contracts.mjs';
import { selectCurrentStoryEpisodes } from './story-settlement.mjs';
import {
    EPISODE_SIGNIFICANCE_CRITERIA,
    EPISODE_SOFT_BOUNDARY_REASONS,
} from './episode-boundary.mjs';
import { validatePeopleEvent } from '../people/people-event-contracts.mjs';

export const EPISODE_EVALUATION_REQUEST_KIND = 'directive.episodeEvaluationRequest.v1';
export const EPISODE_EVALUATION_PROPOSAL_KIND = 'directive.episodeEvaluationProposal.v1';
export const EPISODE_EVALUATOR_ROLE_ID = 'episodeEvaluator';
export const EPISODE_EVALUATOR_MAX_TIMEOUT_MS = 10000;

export const SOFT_BOUNDARY_REASONS = EPISODE_SOFT_BOUNDARY_REASONS;
export const LASTING_SIGNIFICANCE_CRITERIA = EPISODE_SIGNIFICANCE_CRITERIA;

const DECISIONS = new Set(['continue', 'seal', 'abstain']);
const BOUNDARY_REASONS = new Set(SOFT_BOUNDARY_REASONS);
const SIGNIFICANCE_CRITERIA = new Set(LASTING_SIGNIFICANCE_CRITERIA);
const PROPOSAL_FIELDS = new Set([
    'kind',
    'branchId',
    'episodeId',
    'baseRevision',
    'checkpointSequence',
    'decision',
    'boundaryReason',
    'significanceCriteria',
    'summary',
    'foregroundQuestion',
    'sourceContributionIds',
    'effectIds',
    'relationshipUpdates',
    'characterMoments',
]);
const REQUIRED_PROPOSAL_FIELDS = [...PROPOSAL_FIELDS];
const REQUEST_FIELDS = new Set([
    'kind',
    'envelope',
    'pendingSourceContributionIds',
    'workingCapsule',
    'recentEvidence',
    'visibleEffects',
    'references',
    'recentSealedSummaries',
    'peopleEvents',
    'currentRelationships',
]);
const ENVELOPE_FIELDS = new Set(['branchId', 'episodeId', 'baseRevision', 'checkpointSequence']);
const REQUEST_CAPSULE_FIELDS = new Set([
    'kind',
    'summary',
    'foregroundQuestion',
    'sourceContributionIds',
    'effectIds',
    'needsReview',
    'lastEvaluatedCheckpointSequence',
    'updatedAtRevision',
]);
const REQUEST_EVIDENCE_FIELDS = new Set(['contributionId', 'role', 'textHash', 'excerpt']);
const REQUEST_EFFECT_FIELDS = new Set(['id', 'type', 'targetId', 'value', 'sourceContributionIds']);
const REQUEST_REFERENCE_FIELDS = new Set(['missionIds', 'questIds', 'participantIds', 'locationIds']);
const REQUEST_SEALED_SUMMARY_FIELDS = new Set(['episodeId', 'sealedAtRevision', 'summary']);
const REQUEST_RELATIONSHIP_FIELDS = new Set(['personId', 'posture', 'openMatter']);
const RELATIONSHIP_UPDATE_FIELDS = new Set(['personId', 'posture', 'openMatter', 'sourceContributionIds']);
const CHARACTER_MOMENT_FIELDS = new Set(['personId', 'title', 'summary', 'sourceContributionIds']);
const REQUEST_ROLES = new Set(['user', 'assistant', 'runtime', 'adjudicator']);
const MAX_VISIBLE_EFFECTS = 24;
const MAX_REFERENCE_IDS = 32;
const MAX_RECENT_SEALED_SUMMARIES = 2;
const MAX_CONTINUE_SUMMARY_CHARS = 768;
const MAX_SEALED_SUMMARY_CHARS = 1024;
const MAX_QUESTION_CHARS = 240;
const MAX_PEOPLE_EVENTS = 24;
const MAX_RELATIONSHIPS = 32;
const MAX_RELATIONSHIP_TEXT_CHARS = 240;
const MAX_MOMENT_TITLE_CHARS = 120;
const MAX_MOMENT_SUMMARY_CHARS = 512;

function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function textLength(value) {
    return [...String(value ?? '')].length;
}

function compactText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStableId(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]*$/.test(value);
}

function activeEpisode(settlement) {
    return settlement.episodes.find((episode) => episode.id === settlement.activeEpisode) || null;
}

function projectedReferences(references = {}) {
    const bounded = (value, field) => {
        const ids = [...new Set((Array.isArray(value) ? value : []).filter(isStableId))];
        if (ids.length > MAX_REFERENCE_IDS) {
            throw new TypeError(`episode evaluation ${field} exceeds ${MAX_REFERENCE_IDS} references`);
        }
        return ids;
    };
    return {
        missionIds: bounded(references.missionIds, 'missionIds'),
        questIds: bounded(references.questIds, 'questIds'),
        participantIds: bounded(references.participantIds, 'participantIds'),
        locationIds: bounded(references.locationIds, 'locationIds'),
    };
}

function projectedVisibleEffects(episode, capsule) {
    const visible = episode.effects.filter((effect) => (
        effect.status === 'active' && effect.playerVisibility === 'visible'
    ));
    const cited = new Set(capsule.effectIds);
    const citedEffects = visible.filter((effect) => cited.has(effect.id));
    if (citedEffects.length > MAX_VISIBLE_EFFECTS) {
        throw new TypeError(`working capsule cites more than ${MAX_VISIBLE_EFFECTS} visible effects`);
    }
    const uncited = visible.filter((effect) => !cited.has(effect.id));
    const selected = [
        ...citedEffects,
        ...uncited.slice(-(MAX_VISIBLE_EFFECTS - citedEffects.length)),
    ];
    return selected.map((effect) => ({
        id: effect.id,
        type: effect.type,
        targetId: effect.targetId,
        ...(Object.hasOwn(effect, 'value') ? { value: cloneJson(effect.value) } : {}),
        sourceContributionIds: [...new Set(effect.sourceContributionIds || [])],
    }));
}

function projectedPeopleEvents(episode) {
    return cloneJson((episode.peopleEvents || []).slice(-MAX_PEOPLE_EVENTS));
}

function projectedCurrentRelationships(settlement, episode) {
    const byPerson = new Map();
    for (const candidate of [...selectCurrentStoryEpisodes(settlement), episode]) {
        for (const effect of candidate.effects || []) {
            if (effect?.playerVisibility !== 'visible' || effect?.status !== 'active' || !isStableId(effect?.targetId)) continue;
            if (!new Set(['character.relationshipPosture', 'character.relationshipOpenMatter']).has(effect.type)) continue;
            const current = byPerson.get(effect.targetId) || {
                personId: effect.targetId,
                posture: null,
                openMatter: null,
            };
            if (effect.type === 'character.relationshipPosture' && compactText(effect.value)) {
                current.posture = compactText(effect.value);
            }
            if (effect.type === 'character.relationshipOpenMatter') {
                current.openMatter = compactText(effect.value) || null;
            }
            byPerson.set(effect.targetId, current);
        }
    }
    return [...byPerson.values()].slice(-MAX_RELATIONSHIPS);
}

function objectFieldErrors(value, allowed, label, errors) {
    if (!isObject(value)) {
        errors.push(`${label} must be an object`);
        return false;
    }
    for (const field of Object.keys(value)) {
        if (!allowed.has(field)) errors.push(`${label} contains unknown field: ${field}`);
    }
    for (const field of allowed) {
        if (!Object.hasOwn(value, field)) errors.push(`${label} is missing required field: ${field}`);
    }
    return true;
}

function requestIdArray(value, { label, maximum, errors }) {
    if (!Array.isArray(value)) {
        errors.push(`${label} must be an array`);
        return [];
    }
    if (value.length > maximum) errors.push(`${label} exceeds ${maximum} ids`);
    if (new Set(value).size !== value.length) errors.push(`${label} must be unique`);
    for (const id of value) {
        if (!isStableId(id)) errors.push(`${label} contains an invalid id`);
    }
    return value;
}

export function validateEpisodeEvaluationRequest(value = {}) {
    const errors = [];
    if (!objectFieldErrors(value, REQUEST_FIELDS, 'request', errors)) return { ok: false, errors };
    if (value.kind !== EPISODE_EVALUATION_REQUEST_KIND) {
        errors.push(`request kind must be ${EPISODE_EVALUATION_REQUEST_KIND}`);
    }
    const envelopeOk = objectFieldErrors(value.envelope, ENVELOPE_FIELDS, 'request envelope', errors);
    if (envelopeOk) {
        if (!isStableId(value.envelope.branchId)) errors.push('request envelope branchId must be stable');
        if (!isStableId(value.envelope.episodeId)) errors.push('request envelope episodeId must be stable');
        if (!Number.isInteger(value.envelope.baseRevision) || value.envelope.baseRevision < 0) {
            errors.push('request envelope baseRevision must be a non-negative integer');
        }
        if (!Number.isInteger(value.envelope.checkpointSequence) || value.envelope.checkpointSequence < 1) {
            errors.push('request envelope checkpointSequence must be a positive integer');
        }
    }
    requestIdArray(value.pendingSourceContributionIds, {
        label: 'request pendingSourceContributionIds', maximum: 128, errors,
    });
    const capsuleOk = objectFieldErrors(value.workingCapsule, REQUEST_CAPSULE_FIELDS, 'request workingCapsule', errors);
    if (capsuleOk) {
        if (value.workingCapsule.kind !== 'directive.storyWorkingCapsule.v1') {
            errors.push('request workingCapsule kind is invalid');
        }
        if (typeof value.workingCapsule.summary !== 'string'
            || textLength(value.workingCapsule.summary) > MAX_CONTINUE_SUMMARY_CHARS) {
            errors.push('request workingCapsule summary is invalid');
        }
        if (value.workingCapsule.foregroundQuestion !== null
            && (typeof value.workingCapsule.foregroundQuestion !== 'string'
                || !compactText(value.workingCapsule.foregroundQuestion)
                || textLength(value.workingCapsule.foregroundQuestion) > MAX_QUESTION_CHARS)) {
            errors.push('request workingCapsule foregroundQuestion is invalid');
        }
        requestIdArray(value.workingCapsule.sourceContributionIds, {
            label: 'request workingCapsule sourceContributionIds', maximum: 128, errors,
        });
        requestIdArray(value.workingCapsule.effectIds, {
            label: 'request workingCapsule effectIds', maximum: MAX_VISIBLE_EFFECTS, errors,
        });
        if (typeof value.workingCapsule.needsReview !== 'boolean') errors.push('request workingCapsule needsReview must be boolean');
        if (!Number.isInteger(value.workingCapsule.lastEvaluatedCheckpointSequence)
            || value.workingCapsule.lastEvaluatedCheckpointSequence < 0
            || value.workingCapsule.lastEvaluatedCheckpointSequence >= value.envelope?.checkpointSequence) {
            errors.push('request workingCapsule lastEvaluatedCheckpointSequence must precede the pending checkpoint');
        }
        if (!Number.isInteger(value.workingCapsule.updatedAtRevision)
            || value.workingCapsule.updatedAtRevision < 0
            || value.workingCapsule.updatedAtRevision > value.envelope?.baseRevision) {
            errors.push('request workingCapsule updatedAtRevision is invalid');
        }
    }
    if (!Array.isArray(value.recentEvidence)) {
        errors.push('request recentEvidence must be an array');
    } else {
        if (value.recentEvidence.length > 6) errors.push('request recentEvidence exceeds six excerpts');
        const evidenceIds = new Set();
        let totalChars = 0;
        for (const [index, evidence] of value.recentEvidence.entries()) {
            const label = `request recentEvidence[${index}]`;
            if (!objectFieldErrors(evidence, REQUEST_EVIDENCE_FIELDS, label, errors)) continue;
            if (!isStableId(evidence.contributionId)) errors.push(`${label} contributionId must be stable`);
            else if (evidenceIds.has(evidence.contributionId)) errors.push('request recentEvidence contributionIds must be unique');
            evidenceIds.add(evidence.contributionId);
            if (!REQUEST_ROLES.has(evidence.role)) errors.push(`${label} role is invalid`);
            if (typeof evidence.textHash !== 'string' || !/^(?:[a-f0-9]{8}|[a-f0-9]{32,128})$/.test(evidence.textHash)) {
                errors.push(`${label} textHash is invalid`);
            }
            if (typeof evidence.excerpt !== 'string'
                || !evidence.excerpt
                || textLength(evidence.excerpt) > 240) {
                errors.push(`${label} excerpt is invalid`);
            } else {
                totalChars += textLength(evidence.excerpt);
            }
        }
        if (totalChars > 1200) errors.push('request recentEvidence exceeds 1200 characters');
    }
    if (!Array.isArray(value.visibleEffects)) {
        errors.push('request visibleEffects must be an array');
    } else {
        if (value.visibleEffects.length > MAX_VISIBLE_EFFECTS) errors.push(`request visibleEffects exceeds ${MAX_VISIBLE_EFFECTS} effects`);
        const effectIds = new Set();
        for (const [index, effect] of value.visibleEffects.entries()) {
            const label = `request visibleEffects[${index}]`;
            if (!isObject(effect)) {
                errors.push(`${label} must be an object`);
                continue;
            }
            for (const field of Object.keys(effect)) {
                if (!REQUEST_EFFECT_FIELDS.has(field)) errors.push(`${label} contains unknown field: ${field}`);
            }
            for (const field of ['id', 'type', 'targetId', 'sourceContributionIds']) {
                if (!Object.hasOwn(effect, field)) errors.push(`${label} is missing required field: ${field}`);
            }
            if (!isStableId(effect.id)) errors.push(`${label} id must be stable`);
            else if (effectIds.has(effect.id)) errors.push('request visibleEffects ids must be unique');
            effectIds.add(effect.id);
            if (typeof effect.type !== 'string' || !effect.type || effect.type.length > 128) {
                errors.push(`${label} type must be a non-empty bounded string`);
            }
            if (effect.targetId !== null && !isStableId(effect.targetId)) errors.push(`${label} targetId must be stable or null`);
            if (Object.hasOwn(effect, 'value')
                && effect.value !== null
                && !new Set(['string', 'number', 'boolean']).has(typeof effect.value)) {
                errors.push(`${label} value must be a scalar`);
            }
            requestIdArray(effect.sourceContributionIds, {
                label: `${label} sourceContributionIds`, maximum: 128, errors,
            });
        }
        for (const effectId of value.workingCapsule?.effectIds || []) {
            if (!effectIds.has(effectId)) errors.push(`request workingCapsule references unavailable visible effect: ${effectId}`);
        }
    }
    if (!objectFieldErrors(value.references, REQUEST_REFERENCE_FIELDS, 'request references', errors)) {
        // The object error is sufficient.
    } else {
        for (const field of REQUEST_REFERENCE_FIELDS) {
            requestIdArray(value.references[field], { label: `request references ${field}`, maximum: MAX_REFERENCE_IDS, errors });
        }
    }
    if (!Array.isArray(value.recentSealedSummaries)) {
        errors.push('request recentSealedSummaries must be an array');
    } else {
        if (value.recentSealedSummaries.length > MAX_RECENT_SEALED_SUMMARIES) {
            errors.push(`request recentSealedSummaries exceeds ${MAX_RECENT_SEALED_SUMMARIES} entries`);
        }
        const episodeIds = new Set();
        for (const [index, entry] of value.recentSealedSummaries.entries()) {
            const label = `request recentSealedSummaries[${index}]`;
            if (!objectFieldErrors(entry, REQUEST_SEALED_SUMMARY_FIELDS, label, errors)) continue;
            if (!isStableId(entry.episodeId)) errors.push(`${label} episodeId must be stable`);
            else if (episodeIds.has(entry.episodeId)) errors.push('request recentSealedSummaries episodeIds must be unique');
            episodeIds.add(entry.episodeId);
            if (!Number.isInteger(entry.sealedAtRevision) || entry.sealedAtRevision < 0) {
                errors.push(`${label} sealedAtRevision must be a non-negative integer`);
            }
            if (typeof entry.summary !== 'string' || !compactText(entry.summary) || textLength(entry.summary) > MAX_SEALED_SUMMARY_CHARS) {
                errors.push(`${label} summary is invalid`);
            }
        }
    }
    if (!Array.isArray(value.peopleEvents)) {
        errors.push('request peopleEvents must be an array');
    } else {
        if (value.peopleEvents.length > MAX_PEOPLE_EVENTS) {
            errors.push(`request peopleEvents exceeds ${MAX_PEOPLE_EVENTS} entries`);
        }
        const eventIds = new Set();
        const knownPersonIds = [
            ...(value.references?.participantIds || []),
            ...value.peopleEvents.map((event) => event?.personId).filter(isStableId),
        ];
        for (const [index, event] of value.peopleEvents.entries()) {
            if (eventIds.has(event?.id)) errors.push('request peopleEvents ids must be unique');
            eventIds.add(event?.id);
            const result = validatePeopleEvent(event, { knownPersonIds });
            errors.push(...result.errors.map((error) => `request peopleEvents[${index}] ${error}`));
        }
    }
    if (!Array.isArray(value.currentRelationships)) {
        errors.push('request currentRelationships must be an array');
    } else {
        if (value.currentRelationships.length > MAX_RELATIONSHIPS) {
            errors.push(`request currentRelationships exceeds ${MAX_RELATIONSHIPS} entries`);
        }
        const personIds = new Set();
        for (const [index, relationship] of value.currentRelationships.entries()) {
            const label = `request currentRelationships[${index}]`;
            if (!objectFieldErrors(relationship, REQUEST_RELATIONSHIP_FIELDS, label, errors)) continue;
            if (!isStableId(relationship.personId)) errors.push(`${label} personId must be stable`);
            else if (personIds.has(relationship.personId)) errors.push('request currentRelationships personIds must be unique');
            personIds.add(relationship.personId);
            for (const field of ['posture', 'openMatter']) {
                if (relationship[field] !== null
                    && (typeof relationship[field] !== 'string'
                        || !compactText(relationship[field])
                        || textLength(relationship[field]) > MAX_RELATIONSHIP_TEXT_CHARS)) {
                    errors.push(`${label} ${field} must be null or a non-empty bounded string`);
                }
            }
        }
    }
    return { ok: errors.length === 0, errors };
}

export function createEpisodeEvaluationRequest({ settlement = {} } = {}) {
    const validation = validateStorySettlement(settlement);
    if (!validation.ok) throw new TypeError(validation.errors.join('\n'));
    const episode = activeEpisode(settlement);
    if (!episode) throw new TypeError('episode evaluation requires an active episode');
    if (!episode.workingCapsule) throw new TypeError('episode evaluation requires a working capsule');
    if (!episode.boundaryState) throw new TypeError('episode evaluation requires checkpoint state');
    if (episode.boundaryState.checkpointSequence <= episode.workingCapsule.lastEvaluatedCheckpointSequence) {
        throw new TypeError('episode evaluation requires a pending checkpoint');
    }
    const capsule = episode.workingCapsule;
    const recentSealedSummaries = selectCurrentStoryEpisodes(settlement)
        .filter((candidate) => typeof candidate.summary === 'string' && candidate.summary.length > 0)
        .slice(-MAX_RECENT_SEALED_SUMMARIES)
        .map((candidate) => ({
            episodeId: candidate.id,
            sealedAtRevision: candidate.sealedAtRevision,
            summary: candidate.summary,
        }));
    const request = {
        kind: EPISODE_EVALUATION_REQUEST_KIND,
        envelope: {
            branchId: settlement.branchId,
            episodeId: episode.id,
            baseRevision: settlement.revision,
            checkpointSequence: episode.boundaryState.checkpointSequence,
        },
        pendingSourceContributionIds: cloneJson(episode.boundaryState.sourceContributionIds),
        workingCapsule: {
            kind: capsule.kind,
            summary: capsule.summary,
            foregroundQuestion: capsule.foregroundQuestion,
            sourceContributionIds: cloneJson(capsule.sourceContributionIds),
            effectIds: cloneJson(capsule.effectIds),
            needsReview: capsule.needsReview,
            lastEvaluatedCheckpointSequence: capsule.lastEvaluatedCheckpointSequence,
            updatedAtRevision: capsule.updatedAtRevision,
        },
        recentEvidence: cloneJson(capsule.recentEvidence),
        visibleEffects: projectedVisibleEffects(episode, capsule),
        references: projectedReferences(episode.references),
        recentSealedSummaries,
        peopleEvents: projectedPeopleEvents(episode),
        currentRelationships: projectedCurrentRelationships(settlement, episode),
    };
    const requestValidation = validateEpisodeEvaluationRequest(request);
    if (!requestValidation.ok) throw new TypeError(requestValidation.errors.join('\n'));
    return request;
}

function parseStrictJsonObject(value) {
    if (isObject(value)) return { ok: true, value: cloneJson(value) };
    if (typeof value !== 'string' || !value.trim()) {
        return { ok: false, errors: ['episode evaluation output must be a JSON object'] };
    }
    try {
        const parsed = JSON.parse(value.trim());
        if (!isObject(parsed)) return { ok: false, errors: ['episode evaluation output must be a JSON object'] };
        return { ok: true, value: parsed };
    } catch {
        return { ok: false, errors: ['episode evaluation output must contain strict JSON only'] };
    }
}

function validateUniqueIds(value, {
    field,
    allowed,
    maximum,
    errors,
}) {
    if (!Array.isArray(value)) {
        errors.push(`${field} must be an array`);
        return [];
    }
    if (value.length > maximum) errors.push(`${field} exceeds its maximum size`);
    if (new Set(value).size !== value.length) errors.push(`${field} must be unique`);
    for (const id of value) {
        if (!isStableId(id)) errors.push(`${field} contains an invalid id`);
        else if (!allowed.has(id)) errors.push(`${field} references unknown ${field === 'effectIds' ? 'effect' : 'source'}: ${id}`);
    }
    return value;
}

function validateRelationshipUpdates(value, {
    allowedPeopleIds,
    allowedSourceIds,
    relationshipSourceIdsByPerson,
    errors,
}) {
    if (!Array.isArray(value)) {
        errors.push('relationshipUpdates must be an array');
        return [];
    }
    if (value.length > MAX_RELATIONSHIPS) errors.push(`relationshipUpdates exceeds ${MAX_RELATIONSHIPS} entries`);
    const personIds = new Set();
    for (const [index, update] of value.entries()) {
        const label = `relationshipUpdates[${index}]`;
        if (!objectFieldErrors(update, RELATIONSHIP_UPDATE_FIELDS, label, errors)) continue;
        if (!isStableId(update.personId) || !allowedPeopleIds.has(update.personId)) {
            errors.push(`${label} references unknown person`);
        } else if (personIds.has(update.personId)) {
            errors.push('relationshipUpdates allows one update per person');
        }
        personIds.add(update.personId);
        if (typeof update.posture !== 'string'
            || !compactText(update.posture)
            || textLength(update.posture) > MAX_RELATIONSHIP_TEXT_CHARS) {
            errors.push(`${label} posture must be a non-empty bounded string`);
        }
        if (update.openMatter !== null
            && (typeof update.openMatter !== 'string'
                || !compactText(update.openMatter)
                || textLength(update.openMatter) > MAX_RELATIONSHIP_TEXT_CHARS)) {
            errors.push(`${label} openMatter must be null or a non-empty bounded string`);
        }
        const sources = validateUniqueIds(update.sourceContributionIds, {
            field: `${label} sourceContributionIds`,
            allowed: allowedSourceIds,
            maximum: 16,
            errors,
        });
        if (sources.length === 0) errors.push(`${label} relationship sourceContributionIds must be non-empty`);
        const personSources = relationshipSourceIdsByPerson.get(update.personId) || new Set();
        if (sources.length > 0 && !sources.some((sourceId) => personSources.has(sourceId))) {
            errors.push(`${label} must cite relationshipEvidence for the same person`);
        }
    }
    return value;
}

function validateCharacterMoments(value, {
    allowedPeopleIds,
    allowedSourceIds,
    relationshipSourceIdsByPerson,
    errors,
}) {
    if (!Array.isArray(value)) {
        errors.push('characterMoments must be an array');
        return [];
    }
    if (value.length > MAX_RELATIONSHIPS) errors.push(`characterMoments exceeds ${MAX_RELATIONSHIPS} entries`);
    const personIds = new Set();
    for (const [index, moment] of value.entries()) {
        const label = `characterMoments[${index}]`;
        if (!objectFieldErrors(moment, CHARACTER_MOMENT_FIELDS, label, errors)) continue;
        if (!isStableId(moment.personId) || !allowedPeopleIds.has(moment.personId)) {
            errors.push(`${label} references unknown person`);
        } else if (personIds.has(moment.personId)) {
            errors.push('characterMoments allows one defining moment per person in a sealed episode');
        }
        personIds.add(moment.personId);
        if (typeof moment.title !== 'string'
            || !compactText(moment.title)
            || textLength(moment.title) > MAX_MOMENT_TITLE_CHARS) {
            errors.push(`${label} title must be a non-empty bounded string`);
        }
        if (typeof moment.summary !== 'string'
            || !compactText(moment.summary)
            || textLength(moment.summary) > MAX_MOMENT_SUMMARY_CHARS) {
            errors.push(`${label} summary must be a non-empty bounded string`);
        }
        const sources = validateUniqueIds(moment.sourceContributionIds, {
            field: `${label} sourceContributionIds`,
            allowed: allowedSourceIds,
            maximum: 16,
            errors,
        });
        if (sources.length === 0) errors.push(`${label} sourceContributionIds must be non-empty`);
        const personSources = relationshipSourceIdsByPerson.get(moment.personId) || new Set();
        if (sources.length > 0 && !sources.some((sourceId) => personSources.has(sourceId))) {
            errors.push(`${label} must cite relationshipEvidence for the same person`);
        }
    }
    return value;
}

function proposalErrors(value, request) {
    const errors = [];
    for (const field of Object.keys(value)) {
        if (!PROPOSAL_FIELDS.has(field)) errors.push(`proposal contains unknown field: ${field}`);
    }
    for (const field of REQUIRED_PROPOSAL_FIELDS) {
        if (!Object.hasOwn(value, field)) errors.push(`proposal is missing required field: ${field}`);
    }
    if (value.kind !== EPISODE_EVALUATION_PROPOSAL_KIND) {
        errors.push(`kind must be ${EPISODE_EVALUATION_PROPOSAL_KIND}`);
    }
    for (const field of ['branchId', 'episodeId', 'baseRevision', 'checkpointSequence']) {
        if (!Object.is(value[field], request?.envelope?.[field])) {
            errors.push(`${field} must match the evaluation request`);
        }
    }
    if (!DECISIONS.has(value.decision)) errors.push('decision is unknown');
    const allowedSourceIds = new Set([
        ...(request?.workingCapsule?.sourceContributionIds || []),
        ...(request?.recentEvidence || []).map((item) => item.contributionId),
        ...(request?.visibleEffects || []).flatMap((item) => item.sourceContributionIds || []),
        ...(request?.peopleEvents || []).flatMap((item) => item.sourceContributionIds || []),
    ]);
    const allowedEffectIds = new Set((request?.visibleEffects || []).map((item) => item.id));
    const sourceContributionIds = validateUniqueIds(value.sourceContributionIds, {
        field: 'sourceContributionIds',
        allowed: allowedSourceIds,
        maximum: 128,
        errors,
    });
    const effectIds = validateUniqueIds(value.effectIds, {
        field: 'effectIds',
        allowed: allowedEffectIds,
        maximum: MAX_VISIBLE_EFFECTS,
        errors,
    });
    const allowedPeopleIds = new Set([
        ...(request?.references?.participantIds || []),
        ...(request?.peopleEvents || []).map((item) => item.personId),
        ...(request?.currentRelationships || []).map((item) => item.personId),
    ]);
    const relationshipSourceIdsByPerson = new Map();
    for (const event of request?.peopleEvents || []) {
        if (event.type !== 'relationshipEvidence') continue;
        const sources = relationshipSourceIdsByPerson.get(event.personId) || new Set();
        for (const sourceId of event.sourceContributionIds || []) sources.add(sourceId);
        relationshipSourceIdsByPerson.set(event.personId, sources);
    }
    const relationshipUpdates = validateRelationshipUpdates(value.relationshipUpdates, {
        allowedPeopleIds,
        allowedSourceIds,
        relationshipSourceIdsByPerson,
        errors,
    });
    const characterMoments = validateCharacterMoments(value.characterMoments, {
        allowedPeopleIds,
        allowedSourceIds,
        relationshipSourceIdsByPerson,
        errors,
    });
    if (!Array.isArray(value.significanceCriteria)) {
        errors.push('significanceCriteria must be an array');
    } else {
        if (new Set(value.significanceCriteria).size !== value.significanceCriteria.length) {
            errors.push('significanceCriteria must be unique');
        }
        for (const criterion of value.significanceCriteria) {
            if (!SIGNIFICANCE_CRITERIA.has(criterion)) errors.push(`significanceCriteria contains unsupported value: ${criterion}`);
        }
    }

    if (value.decision === 'continue') {
        if (characterMoments.length > 0) errors.push('character moment creation requires a seal decision');
        if (value.boundaryReason !== null) errors.push('continue boundaryReason must be null');
        if ((value.significanceCriteria?.length || 0) > 0) errors.push('continue significanceCriteria must be empty');
        if (typeof value.summary !== 'string' || textLength(value.summary) > MAX_CONTINUE_SUMMARY_CHARS) {
            errors.push(`continue summary must be a string of at most ${MAX_CONTINUE_SUMMARY_CHARS} characters`);
        }
        if (value.foregroundQuestion !== null
            && (typeof value.foregroundQuestion !== 'string'
                || value.foregroundQuestion.length === 0
                || textLength(value.foregroundQuestion) > MAX_QUESTION_CHARS)) {
            errors.push(`continue foregroundQuestion must be null or a non-empty string of at most ${MAX_QUESTION_CHARS} characters`);
        }
        if (typeof value.summary === 'string' && value.summary.length > 0 && !compactText(value.summary)) {
            errors.push('continue summary cannot contain only whitespace');
        }
        if (typeof value.foregroundQuestion === 'string' && !compactText(value.foregroundQuestion)) {
            errors.push('continue foregroundQuestion cannot contain only whitespace');
        }
        const hasSemanticText = (typeof value.summary === 'string' && compactText(value.summary).length > 0)
            || (typeof value.foregroundQuestion === 'string' && compactText(value.foregroundQuestion).length > 0);
        if (hasSemanticText && sourceContributionIds.length === 0) errors.push('continue semantic content requires sourceContributionIds');
        if (!hasSemanticText && (sourceContributionIds.length > 0 || effectIds.length > 0)) {
            errors.push('continue semantic references require summary or foregroundQuestion');
        }
    } else if (value.decision === 'seal') {
        if (!BOUNDARY_REASONS.has(value.boundaryReason)) errors.push('seal boundaryReason is unsupported');
        if (!Array.isArray(value.significanceCriteria) || value.significanceCriteria.length === 0) {
            errors.push('seal requires at least one significance criterion');
        }
        if (typeof value.summary !== 'string'
            || compactText(value.summary).length === 0
            || textLength(value.summary) > MAX_SEALED_SUMMARY_CHARS) {
            errors.push(`seal summary must be non-empty and at most ${MAX_SEALED_SUMMARY_CHARS} characters`);
        }
        if (value.foregroundQuestion !== null) errors.push('seal foregroundQuestion must be null');
        if (sourceContributionIds.length === 0) errors.push('seal requires sourceContributionIds');
        const pendingSourceIds = new Set(request?.pendingSourceContributionIds || []);
        const visibleEffectsById = new Map((request?.visibleEffects || []).map((effect) => [effect.id, effect]));
        const citesPendingSource = sourceContributionIds.some((id) => pendingSourceIds.has(id));
        const citesPendingEffect = effectIds.some((id) => (
            visibleEffectsById.get(id)?.sourceContributionIds?.some((sourceId) => pendingSourceIds.has(sourceId))
        ));
        if (!citesPendingSource && !citesPendingEffect) {
            errors.push('seal must cite evidence from the pending checkpoint');
        }
    } else if (value.decision === 'abstain') {
        if (value.boundaryReason !== null) errors.push('abstain boundaryReason must be null');
        if ((value.significanceCriteria?.length || 0) > 0) errors.push('abstain significanceCriteria must be empty');
        if (value.summary !== null) errors.push('abstain summary must be null');
        if (value.foregroundQuestion !== null) errors.push('abstain foregroundQuestion must be null');
        if (sourceContributionIds.length > 0 || effectIds.length > 0) errors.push('abstain cannot cite sources or effects');
        if (relationshipUpdates.length > 0 || characterMoments.length > 0) {
            errors.push('abstain cannot update relationships or create character moments');
        }
    }
    return errors;
}

export function parseEpisodeEvaluationProposal(value, { request = {} } = {}) {
    const requestValidation = validateEpisodeEvaluationRequest(request);
    if (!requestValidation.ok) {
        return { ok: false, errors: requestValidation.errors.map((error) => `invalid request: ${error}`) };
    }
    const parsed = parseStrictJsonObject(value);
    if (!parsed.ok) return parsed;
    const errors = proposalErrors(parsed.value, request);
    if (errors.length > 0) return { ok: false, errors };
    const normalized = cloneJson(parsed.value);
    if (typeof normalized.summary === 'string') normalized.summary = compactText(normalized.summary);
    if (typeof normalized.foregroundQuestion === 'string') {
        normalized.foregroundQuestion = compactText(normalized.foregroundQuestion);
    }
    normalized.relationshipUpdates = normalized.relationshipUpdates.map((update) => ({
        ...update,
        posture: compactText(update.posture),
        openMatter: update.openMatter === null ? null : compactText(update.openMatter),
    }));
    normalized.characterMoments = normalized.characterMoments.map((moment) => ({
        ...moment,
        title: compactText(moment.title),
        summary: compactText(moment.summary),
    }));
    return { ok: true, value: normalized };
}

export function createEpisodeEvaluationPrompt({ request = {} } = {}) {
    const validation = validateEpisodeEvaluationRequest(request);
    if (!validation.ok) throw new TypeError(validation.errors.join('\n'));
    const systemPrompt = [
        'You are Directive V1 Episode Evaluator, a bounded Reasoning analysis role.',
        'Compare recent accepted evidence with the current working capsule. Retain only new narrative understanding; replace the capsule summary instead of appending or repeating prior memory.',
        'Recommend sealing only for lasting significance at an actual semantic boundary. A passing detail, routine acknowledgement, atmosphere, transient emotion, or one light flicker is not lasting significance.',
        'Treat one continuous encounter as one episode. No memory is a valid result when nothing durable changed.',
        'Never use topic, keyword, speaker, sentiment, token count, or elapsed time as boundary evidence.',
        'Player text proves intent, speech, or commitment only. It does not prove that an attempted action succeeded. Accepted assistant evidence may establish depicted outcomes.',
        'Use peopleEvents as source-backed relationship evidence. Update a person relationship posture only when the evidence changes the durable current stance toward the player; use openMatter for one live unresolved matter, or null when none remains.',
        'Preserve comprehensive relationship history through characterMoments only when sealing. A defining moment is a durable relationship turning point, not routine sentiment or every interaction. Emit at most one defining moment per person in this sealed episode; there is no lifetime limit.',
        'A continue decision may update relationship posture but must not create characterMoments. An abstain decision must leave both arrays empty.',
        'Use only sourceContributionIds and effectIds supplied in the request. Do not invent facts, IDs, objectives, trackers, consequences, rewards, hidden state, or narration.',
        'A seal must cite at least one pendingSourceContributionId, directly or through a cited visible effect sourced by it. Do not seal by merely reinterpreting older reviewed history.',
        `Allowed boundaryReason values for seal: ${SOFT_BOUNDARY_REASONS.join(', ')}.`,
        `Allowed significanceCriteria values for seal: ${LASTING_SIGNIFICANCE_CRITERIA.join(', ')}.`,
        'Return exactly one strict JSON object with no markdown, prose, rationale, or extra fields:',
        '{"kind":"directive.episodeEvaluationProposal.v1","branchId":"exact","episodeId":"exact","baseRevision":0,"checkpointSequence":0,"decision":"continue|seal|abstain","boundaryReason":null,"significanceCriteria":[],"summary":"replacement or sealed summary","foregroundQuestion":null,"sourceContributionIds":[],"effectIds":[],"relationshipUpdates":[],"characterMoments":[]}',
    ].join('\n');
    const user = `Evaluate this bounded active episode snapshot:\n${JSON.stringify(request, null, 2)}`;
    return {
        kind: 'directive.episodeEvaluationRequest.v1',
        prompt: `${systemPrompt}\n\n${user}`,
        systemPrompt,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: user },
        ],
        structuredOutput: true,
        jsonSchema: {
            type: 'object',
            additionalProperties: false,
            required: [
                'kind', 'branchId', 'episodeId', 'baseRevision', 'checkpointSequence', 'decision',
                'boundaryReason', 'significanceCriteria', 'summary', 'foregroundQuestion',
                'sourceContributionIds', 'effectIds', 'relationshipUpdates', 'characterMoments',
            ],
            properties: {
                kind: { type: 'string', const: EPISODE_EVALUATION_PROPOSAL_KIND },
                branchId: { type: 'string', const: request.envelope.branchId },
                episodeId: { type: 'string', const: request.envelope.episodeId },
                baseRevision: { type: 'integer', const: request.envelope.baseRevision },
                checkpointSequence: { type: 'integer', const: request.envelope.checkpointSequence },
                decision: { type: 'string', enum: ['continue', 'seal', 'abstain'] },
                boundaryReason: {
                    anyOf: [{ type: 'string', enum: [...SOFT_BOUNDARY_REASONS] }, { type: 'null' }],
                },
                significanceCriteria: {
                    type: 'array',
                    uniqueItems: true,
                    items: { type: 'string', enum: [...LASTING_SIGNIFICANCE_CRITERIA] },
                },
                summary: { anyOf: [{ type: 'string', maxLength: MAX_SEALED_SUMMARY_CHARS }, { type: 'null' }] },
                foregroundQuestion: {
                    anyOf: [{ type: 'string', maxLength: MAX_QUESTION_CHARS }, { type: 'null' }],
                },
                sourceContributionIds: {
                    type: 'array', uniqueItems: true, items: { type: 'string' }, maxItems: 128,
                },
                effectIds: {
                    type: 'array', uniqueItems: true, items: { type: 'string' }, maxItems: MAX_VISIBLE_EFFECTS,
                },
                relationshipUpdates: {
                    type: 'array',
                    maxItems: MAX_RELATIONSHIPS,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['personId', 'posture', 'openMatter', 'sourceContributionIds'],
                        properties: {
                            personId: { type: 'string' },
                            posture: { type: 'string', minLength: 1, maxLength: MAX_RELATIONSHIP_TEXT_CHARS },
                            openMatter: {
                                anyOf: [
                                    { type: 'string', minLength: 1, maxLength: MAX_RELATIONSHIP_TEXT_CHARS },
                                    { type: 'null' },
                                ],
                            },
                            sourceContributionIds: {
                                type: 'array', minItems: 1, maxItems: 16, uniqueItems: true, items: { type: 'string' },
                            },
                        },
                    },
                },
                characterMoments: {
                    type: 'array',
                    maxItems: MAX_RELATIONSHIPS,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['personId', 'title', 'summary', 'sourceContributionIds'],
                        properties: {
                            personId: { type: 'string' },
                            title: { type: 'string', minLength: 1, maxLength: MAX_MOMENT_TITLE_CHARS },
                            summary: { type: 'string', minLength: 1, maxLength: MAX_MOMENT_SUMMARY_CHARS },
                            sourceContributionIds: {
                                type: 'array', minItems: 1, maxItems: 16, uniqueItems: true, items: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
        metadata: {
            roleId: EPISODE_EVALUATOR_ROLE_ID,
            branchId: request.envelope.branchId,
            episodeId: request.envelope.episodeId,
            baseRevision: request.envelope.baseRevision,
            checkpointSequence: request.envelope.checkpointSequence,
            recentEvidenceCount: request.recentEvidence.length,
            visibleEffectCount: request.visibleEffects.length,
            peopleEventCount: request.peopleEvents.length,
            currentRelationshipCount: request.currentRelationships.length,
        },
        parameters: {
            temperature: 0.1,
            top_p: 0.9,
            max_tokens: 1400,
        },
    };
}

function responsePayload(generation = {}) {
    for (const candidate of [
        generation?.response?.structuredOutput,
        generation?.response?.json,
        generation?.response?.data,
        generation?.response?.content,
    ]) {
        if (isObject(candidate)) return candidate;
    }
    return generation?.response?.text
        || (typeof generation?.response?.content === 'string' ? generation.response.content : '')
        || generation?.response?.raw?.text
        || generation?.text
        || (typeof generation?.content === 'string' ? generation.content : '')
        || '';
}

function boundedTimeout(timeoutMs) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return 8000;
    return Math.min(Math.max(Math.floor(timeoutMs), 1), EPISODE_EVALUATOR_MAX_TIMEOUT_MS);
}

function timeoutResult(timeoutMs) {
    return {
        ok: false,
        status: 'unavailable',
        reasonCode: 'provider-timeout',
        diagnostics: { timeoutMs },
    };
}

function abortedResult() {
    return {
        ok: false,
        status: 'unavailable',
        reasonCode: 'provider-aborted',
        diagnostics: {},
    };
}

async function runWithTimeout(factory, timeoutMs, externalSignal = null) {
    if (externalSignal?.aborted) return abortedResult();
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const providerSignal = controller?.signal || externalSignal || null;
    let timeoutId = null;
    let removeExternalAbort = null;
    let resolveExternalAbort = null;
    const externalAbort = new Promise((resolve) => { resolveExternalAbort = resolve; });
    if (externalSignal?.addEventListener) {
        const onAbort = () => {
            controller?.abort(externalSignal.reason);
            resolveExternalAbort(abortedResult());
        };
        externalSignal.addEventListener('abort', onAbort, { once: true });
        removeExternalAbort = () => externalSignal.removeEventListener('abort', onAbort);
    }
    let pending = null;
    try {
        pending = Promise.resolve(factory(providerSignal));
        return await Promise.race([
            pending,
            new Promise((resolve) => {
                timeoutId = setTimeout(() => {
                    controller?.abort(new Error('provider-timeout'));
                    resolve(timeoutResult(timeoutMs));
                }, timeoutMs);
            }),
            externalAbort,
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        removeExternalAbort?.();
        pending?.catch?.(() => null);
    }
}

export function createEpisodeEvaluator({ generationRouter = null, timeoutMs = 8000 } = {}) {
    const effectiveTimeoutMs = boundedTimeout(timeoutMs);
    return async function evaluateEpisode({ request = {}, signal = null } = {}) {
        if (typeof generationRouter?.generate !== 'function') {
            return { ok: false, status: 'unavailable', reasonCode: 'provider-missing', diagnostics: {} };
        }
        const requestValidation = validateEpisodeEvaluationRequest(request);
        if (!requestValidation.ok) {
            return {
                ok: false,
                status: 'rejected',
                reasonCode: 'invalid-request',
                diagnostics: { errorCount: requestValidation.errors.length },
            };
        }
        let generation = null;
        try {
            const result = await runWithTimeout(
                (providerSignal) => generationRouter.generate(
                    EPISODE_EVALUATOR_ROLE_ID,
                    createEpisodeEvaluationPrompt({ request }),
                    {
                        timeoutMs: effectiveTimeoutMs,
                        signal: providerSignal,
                        allowVisibleOutputRetry: false,
                    },
                ),
                effectiveTimeoutMs,
                signal,
            );
            if (new Set(['provider-timeout', 'provider-aborted']).has(result?.reasonCode)) return result;
            generation = result;
        } catch {
            return { ok: false, status: 'unavailable', reasonCode: 'provider-threw', diagnostics: {} };
        }
        const payload = responsePayload(generation);
        const diagnostics = {
            providerId: generation?.diagnostics?.providerId || generation?.response?.providerId || null,
            model: generation?.diagnostics?.model || generation?.response?.model || null,
            latencyMs: Number.isFinite(generation?.diagnostics?.latencyMs) ? generation.diagnostics.latencyMs : null,
        };
        if (generation?.ok !== true || (!isObject(payload) && !String(payload || '').trim())) {
            return { ok: false, status: 'unavailable', reasonCode: 'provider-empty', diagnostics };
        }
        const parsed = parseEpisodeEvaluationProposal(payload, { request });
        if (!parsed.ok) {
            return {
                ok: false,
                status: 'rejected',
                reasonCode: 'invalid-output',
                diagnostics: { ...diagnostics, errorCount: parsed.errors.length },
            };
        }
        return {
            ok: true,
            status: parsed.value.decision,
            proposal: parsed.value,
            diagnostics,
        };
    };
}
