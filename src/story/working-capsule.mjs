export const STORY_WORKING_CAPSULE_KIND = 'directive.storyWorkingCapsule.v1';
export const STORY_WORKING_CAPSULE_MAX_EXCERPTS = 6;
export const STORY_WORKING_CAPSULE_MAX_EXCERPT_CHARS = 240;
export const STORY_WORKING_CAPSULE_MAX_TOTAL_EXCERPT_CHARS = 1200;
export const STORY_WORKING_CAPSULE_MAX_SUMMARY_CHARS = 768;
export const STORY_WORKING_CAPSULE_MAX_QUESTION_CHARS = 240;

const CAPSULE_FIELDS = new Set([
    'kind',
    'summary',
    'foregroundQuestion',
    'sourceContributionIds',
    'effectIds',
    'recentEvidence',
    'observedContributionCount',
    'lastEvaluatedCheckpointSequence',
    'needsReview',
    'updatedAtRevision',
]);
const EVIDENCE_FIELDS = new Set(['contributionId', 'role', 'textHash', 'excerpt']);
const OBSERVATION_FIELDS = new Set(['contributionId', 'role', 'textHash', 'text']);
const SOURCE_CONTRIBUTION_ROLES = new Set(['user', 'assistant', 'runtime', 'adjudicator']);

function isStableId(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]*$/.test(value);
}

function uniqueStableIds(value, field, errors) {
    if (!Array.isArray(value)) {
        errors.push(`${field} must be an array`);
        return [];
    }
    if (new Set(value).size !== value.length) errors.push(`${field} must be unique`);
    if (value.length > 128) errors.push(`${field} must contain at most 128 ids`);
    for (const id of value) {
        if (!isStableId(id)) errors.push(`${field} contains an invalid id`);
    }
    return value;
}

function compactText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function textLength(value) {
    return [...String(value ?? '')].length;
}

function truncateText(value, maximum) {
    return [...value].slice(0, maximum).join('');
}

function assertKnownFields(value, allowed, label) {
    for (const field of Object.keys(value || {})) {
        if (!allowed.has(field)) throw new TypeError(`${label} contains unknown field: ${field}`);
    }
}

function assertUniqueIds(ids, label) {
    if (!Array.isArray(ids)) throw new TypeError(`${label} must be an array`);
    if (new Set(ids).size !== ids.length) throw new TypeError(`${label} must be unique`);
}

export function createEmptyStoryWorkingCapsule({ updatedAtRevision = 0 } = {}) {
    return {
        kind: STORY_WORKING_CAPSULE_KIND,
        summary: '',
        foregroundQuestion: null,
        sourceContributionIds: [],
        effectIds: [],
        recentEvidence: [],
        observedContributionCount: 0,
        lastEvaluatedCheckpointSequence: 0,
        needsReview: false,
        updatedAtRevision,
    };
}

export function validateStoryWorkingCapsule(value, {
    episode = {},
    settlementRevision = Number.MAX_SAFE_INTEGER,
} = {}) {
    const errors = [];
    const episodeId = isStableId(episode?.id) ? episode.id : '<unknown episode>';
    if (new Set(['sealed', 'invalidated']).has(episode?.status)) {
        if (value === undefined) return { ok: true, errors };
        errors.push(`${episodeId} terminal episodes cannot retain workingCapsule`);
        return { ok: false, errors };
    }
    if (value === undefined) {
        return { ok: false, errors: [`${episodeId} workingCapsule is required for a current episode`] };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, errors: [`${episodeId} workingCapsule must be an object`] };
    }
    for (const field of Object.keys(value)) {
        if (!CAPSULE_FIELDS.has(field)) errors.push(`${episodeId} workingCapsule contains unknown field: ${field}`);
    }
    if (value.kind !== STORY_WORKING_CAPSULE_KIND) {
        errors.push(`${episodeId} workingCapsule kind must be ${STORY_WORKING_CAPSULE_KIND}`);
    }
    if (typeof value.summary !== 'string' || textLength(value.summary) > STORY_WORKING_CAPSULE_MAX_SUMMARY_CHARS) {
        errors.push(`${episodeId} workingCapsule summary must be a string of at most ${STORY_WORKING_CAPSULE_MAX_SUMMARY_CHARS} characters`);
    }
    if (value.foregroundQuestion !== null
        && (typeof value.foregroundQuestion !== 'string'
            || value.foregroundQuestion.length === 0
            || textLength(value.foregroundQuestion) > STORY_WORKING_CAPSULE_MAX_QUESTION_CHARS)) {
        errors.push(`${episodeId} workingCapsule foregroundQuestion must be null or a non-empty string of at most ${STORY_WORKING_CAPSULE_MAX_QUESTION_CHARS} characters`);
    }
    const contributionIds = new Set((episode.contributions || []).map((item) => item.id));
    const activeEffectIds = new Set((episode.effects || []).filter((item) => item.status === 'active').map((item) => item.id));
    for (const id of uniqueStableIds(value.sourceContributionIds, `${episodeId} workingCapsule sourceContributionIds`, errors)) {
        if (!contributionIds.has(id)) errors.push(`${episodeId} workingCapsule references unknown source contribution: ${id}`);
    }
    for (const id of uniqueStableIds(value.effectIds, `${episodeId} workingCapsule effectIds`, errors)) {
        if (!activeEffectIds.has(id)) errors.push(`${episodeId} workingCapsule references unknown active effect: ${id}`);
    }
    const hasSemanticText = (typeof value.summary === 'string' && value.summary.length > 0)
        || value.foregroundQuestion !== null;
    if (hasSemanticText && value.sourceContributionIds?.length === 0) {
        errors.push(`${episodeId} workingCapsule semantic text requires sourceContributionIds`);
    }
    if (!hasSemanticText && ((value.sourceContributionIds?.length || 0) > 0 || (value.effectIds?.length || 0) > 0)) {
        errors.push(`${episodeId} workingCapsule semantic references require summary or foregroundQuestion`);
    }
    if (!Array.isArray(value.recentEvidence)) {
        errors.push(`${episodeId} workingCapsule recentEvidence must be an array`);
    } else {
        if (value.recentEvidence.length > STORY_WORKING_CAPSULE_MAX_EXCERPTS) {
            errors.push(`${episodeId} workingCapsule recentEvidence exceeds ${STORY_WORKING_CAPSULE_MAX_EXCERPTS} excerpts`);
        }
        const evidenceIds = new Set();
        let totalExcerptChars = 0;
        for (const evidence of value.recentEvidence) {
            for (const field of Object.keys(evidence || {})) {
                if (!EVIDENCE_FIELDS.has(field)) errors.push(`${episodeId} workingCapsule evidence contains unknown field: ${field}`);
            }
            if (!isStableId(evidence?.contributionId)) {
                errors.push(`${episodeId} workingCapsule evidence contributionId must be stable`);
            } else if (evidenceIds.has(evidence.contributionId)) {
                errors.push(`${episodeId} workingCapsule evidence contributionIds must be unique`);
            } else {
                evidenceIds.add(evidence.contributionId);
            }
            const contribution = (episode.contributions || []).find((item) => item.id === evidence?.contributionId);
            if (!contribution) {
                errors.push(`${episodeId} workingCapsule evidence references unknown source contribution: ${evidence?.contributionId}`);
            } else {
                if (evidence.role !== contribution.role) errors.push(`${episodeId} workingCapsule evidence role does not match accepted contribution`);
                if (evidence.textHash !== contribution.textHash) errors.push(`${episodeId} workingCapsule evidence textHash does not match accepted contribution`);
            }
            if (!SOURCE_CONTRIBUTION_ROLES.has(evidence?.role)) {
                errors.push(`${episodeId} workingCapsule evidence role is unknown`);
            }
            if (typeof evidence?.textHash !== 'string' || !/^(?:[a-f0-9]{8}|[a-f0-9]{32,128})$/.test(evidence.textHash)) {
                errors.push(`${episodeId} workingCapsule evidence textHash is invalid`);
            }
            if (typeof evidence?.excerpt !== 'string'
                || evidence.excerpt.length === 0
                || textLength(evidence.excerpt) > STORY_WORKING_CAPSULE_MAX_EXCERPT_CHARS) {
                errors.push(`${episodeId} workingCapsule evidence excerpt must be non-empty and at most ${STORY_WORKING_CAPSULE_MAX_EXCERPT_CHARS} characters`);
            } else {
                totalExcerptChars += textLength(evidence.excerpt);
            }
        }
        if (totalExcerptChars > STORY_WORKING_CAPSULE_MAX_TOTAL_EXCERPT_CHARS) {
            errors.push(`${episodeId} workingCapsule recentEvidence exceeds ${STORY_WORKING_CAPSULE_MAX_TOTAL_EXCERPT_CHARS} total characters`);
        }
    }
    if (!Number.isInteger(value.observedContributionCount)
        || value.observedContributionCount < 0
        || value.observedContributionCount > (episode.contributions?.length || 0)) {
        errors.push(`${episodeId} workingCapsule observedContributionCount must be within accepted contributions`);
    }
    const checkpointSequence = episode.boundaryState?.checkpointSequence || 0;
    if (!Number.isInteger(value.lastEvaluatedCheckpointSequence)
        || value.lastEvaluatedCheckpointSequence < 0
        || value.lastEvaluatedCheckpointSequence > checkpointSequence) {
        errors.push(`${episodeId} workingCapsule lastEvaluatedCheckpointSequence exceeds the current checkpoint`);
    }
    if (typeof value.needsReview !== 'boolean') {
        errors.push(`${episodeId} workingCapsule needsReview must be a boolean`);
    }
    if (!Number.isInteger(value.updatedAtRevision)
        || value.updatedAtRevision < (episode.openedAtRevision || 0)
        || value.updatedAtRevision > settlementRevision) {
        errors.push(`${episodeId} workingCapsule updatedAtRevision must be within the episode and settlement revisions`);
    }
    return { ok: errors.length === 0, errors };
}

function assertValidCapsule(capsule, options) {
    const result = validateStoryWorkingCapsule(capsule, options);
    if (!result.ok) throw new TypeError(result.errors.join('\n'));
    return capsule;
}

export function appendStoryWorkingEvidence(capsule, {
    episode,
    observations = [],
    updatedAtRevision,
} = {}) {
    assertValidCapsule(capsule, { episode, settlementRevision: updatedAtRevision });
    if (!Array.isArray(observations)) throw new TypeError('observations must be an array');
    const contributionIndex = new Map((episode.contributions || []).map((item, index) => [item.id, index]));
    const acceptedById = new Map((episode.contributions || []).map((item) => [item.id, item]));
    const prepared = [];
    const requestIds = new Set();
    for (const observation of observations) {
        if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
            throw new TypeError('working evidence observation must be an object');
        }
        assertKnownFields(observation, OBSERVATION_FIELDS, 'working evidence observation');
        if (!isStableId(observation.contributionId)) throw new TypeError('working evidence contributionId must be stable');
        if (requestIds.has(observation.contributionId)) throw new TypeError('working evidence observations must be unique');
        requestIds.add(observation.contributionId);
        const accepted = acceptedById.get(observation.contributionId);
        if (!accepted) throw new TypeError(`working evidence requires an accepted contribution: ${observation.contributionId}`);
        if (observation.role !== accepted.role) throw new TypeError(`working evidence role does not match accepted contribution: ${observation.contributionId}`);
        if (observation.textHash !== accepted.textHash) throw new TypeError(`working evidence text hash does not match accepted contribution: ${observation.contributionId}`);
        if (typeof observation.text !== 'string') throw new TypeError(`working evidence text must be a string: ${observation.contributionId}`);
        const excerpt = compactText(observation.text);
        if (!excerpt) throw new TypeError(`working evidence text is required: ${observation.contributionId}`);
        prepared.push({
            index: contributionIndex.get(observation.contributionId),
            evidence: {
                contributionId: observation.contributionId,
                role: observation.role,
                textHash: observation.textHash,
                excerpt: truncateText(excerpt, STORY_WORKING_CAPSULE_MAX_EXCERPT_CHARS),
            },
        });
    }
    prepared.sort((left, right) => left.index - right.index);
    const additions = prepared.filter((item) => item.index >= capsule.observedContributionCount);
    if (additions.length === 0) return structuredClone(capsule);

    const next = structuredClone(capsule);
    for (const { evidence } of additions) {
        next.recentEvidence = next.recentEvidence.filter((item) => item.contributionId !== evidence.contributionId);
        next.recentEvidence.push(evidence);
    }
    next.observedContributionCount = Math.max(
        next.observedContributionCount,
        ...additions.map((item) => item.index + 1),
    );
    while (next.recentEvidence.length > STORY_WORKING_CAPSULE_MAX_EXCERPTS
        || next.recentEvidence.reduce((total, item) => total + textLength(item.excerpt), 0) > STORY_WORKING_CAPSULE_MAX_TOTAL_EXCERPT_CHARS) {
        next.recentEvidence.shift();
    }
    next.updatedAtRevision = updatedAtRevision;
    return assertValidCapsule(next, { episode, settlementRevision: updatedAtRevision });
}

export function replaceStoryWorkingSemantics(capsule, {
    episode,
    summary = '',
    foregroundQuestion = null,
    sourceContributionIds = [],
    effectIds = [],
    needsReview = false,
    lastEvaluatedCheckpointSequence = capsule?.lastEvaluatedCheckpointSequence,
    updatedAtRevision,
} = {}) {
    assertValidCapsule(capsule, { episode, settlementRevision: updatedAtRevision });
    assertUniqueIds(sourceContributionIds, 'working capsule sourceContributionIds');
    assertUniqueIds(effectIds, 'working capsule effectIds');
    if (sourceContributionIds.length > 128) throw new TypeError('working capsule sourceContributionIds must contain at most 128 ids');
    if (effectIds.length > 128) throw new TypeError('working capsule effectIds must contain at most 128 ids');
    if (typeof summary !== 'string') throw new TypeError('working capsule summary must be a string');
    if (foregroundQuestion !== null && typeof foregroundQuestion !== 'string') {
        throw new TypeError('working capsule foregroundQuestion must be null or a string');
    }
    const compactSummary = compactText(summary);
    const compactQuestion = foregroundQuestion === null ? null : compactText(foregroundQuestion);
    if (textLength(compactSummary) > STORY_WORKING_CAPSULE_MAX_SUMMARY_CHARS) throw new TypeError('working capsule summary is too long');
    if (compactQuestion !== null && (!compactQuestion || textLength(compactQuestion) > STORY_WORKING_CAPSULE_MAX_QUESTION_CHARS)) {
        throw new TypeError('working capsule foregroundQuestion is invalid');
    }
    const acceptedIds = new Set((episode.contributions || []).map((item) => item.id));
    const activeEffectIds = new Set((episode.effects || []).filter((item) => item.status === 'active').map((item) => item.id));
    for (const id of sourceContributionIds) {
        if (!acceptedIds.has(id)) throw new TypeError(`working capsule references unknown accepted contribution: ${id}`);
    }
    for (const id of effectIds) {
        if (!activeEffectIds.has(id)) throw new TypeError(`working capsule references unknown active effect: ${id}`);
    }
    const next = {
        ...structuredClone(capsule),
        summary: compactSummary,
        foregroundQuestion: compactQuestion,
        sourceContributionIds: structuredClone(sourceContributionIds),
        effectIds: structuredClone(effectIds),
        needsReview,
        lastEvaluatedCheckpointSequence,
        updatedAtRevision,
    };
    return assertValidCapsule(next, { episode, settlementRevision: updatedAtRevision });
}

export function repairStoryWorkingCapsule(capsule, {
    episode,
    invalidatedContributionIds = [],
    updatedAtRevision,
} = {}) {
    if (!capsule) return null;
    const invalidated = new Set(invalidatedContributionIds);
    const survivingContributionIds = new Set((episode.contributions || []).map((item) => item.id));
    const survivingEffectIds = new Set((episode.effects || []).filter((item) => item.status === 'active').map((item) => item.id));
    const semanticCompromised = (capsule.sourceContributionIds || []).some((id) => invalidated.has(id) || !survivingContributionIds.has(id))
        || (capsule.effectIds || []).some((id) => !survivingEffectIds.has(id));
    const next = {
        ...structuredClone(capsule),
        recentEvidence: (capsule.recentEvidence || []).filter((item) => survivingContributionIds.has(item.contributionId)),
        observedContributionCount: episode.contributions?.length || 0,
        updatedAtRevision,
    };
    if (semanticCompromised) {
        next.summary = '';
        next.foregroundQuestion = null;
        next.sourceContributionIds = [];
        next.effectIds = [];
        next.needsReview = true;
    }
    return assertValidCapsule(next, { episode, settlementRevision: updatedAtRevision });
}
