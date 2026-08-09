export const EPISODE_HARD_BOUNDARY_KIND = 'directive.episodeHardBoundary.v1';
export const EPISODE_BOUNDARY_STATE_KIND = 'directive.episodeBoundaryState.v1';

export const EPISODE_HARD_BOUNDARY_CODES = Object.freeze([
    'mission-transition',
    'authored-scene-closure',
    'save-branch-change',
    'major-time-jump',
    'meaningful-location-transition',
    'world-settlement',
    'source-recovery',
]);

const SOURCE_KINDS_BY_CODE = Object.freeze({
    'mission-transition': new Set(['missionReducer']),
    'authored-scene-closure': new Set(['missionReducer', 'campaignReducer']),
    'save-branch-change': new Set(['branchRuntime']),
    'major-time-jump': new Set(['timeAdjudicator']),
    'meaningful-location-transition': new Set(['locationRuntime', 'campaignReducer']),
    'world-settlement': new Set(['missionReducer', 'campaignReducer']),
    'source-recovery': new Set(['sourceRecovery']),
});

const BOUNDARY_FIELDS = new Set(['kind', 'id', 'branchId', 'code', 'source', 'sourceContributionIds']);
const SOURCE_FIELDS = new Set(['kind', 'id']);

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStableId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function unknownFields(value, allowed) {
    return isObject(value) ? Object.keys(value).filter((key) => !allowed.has(key)) : [];
}

export function validateEpisodeHardBoundary(value = {}, {
    branchId = null,
    knownContributionIds = null,
} = {}) {
    const errors = [];
    if (!isObject(value)) return { ok: false, errors: ['boundary must be an object'] };
    for (const field of unknownFields(value, BOUNDARY_FIELDS)) errors.push(`unknown field: ${field}`);
    if (value.kind !== EPISODE_HARD_BOUNDARY_KIND) {
        errors.push(`kind must be ${EPISODE_HARD_BOUNDARY_KIND}`);
    }
    if (!isStableId(value.id)) errors.push('id must be a stable id');
    if (!isStableId(value.branchId)) errors.push('branchId must be a stable id');
    if (branchId !== null && value.branchId !== branchId) errors.push('branchId must match the active branch');
    if (!EPISODE_HARD_BOUNDARY_CODES.includes(value.code)) errors.push('code is unknown');
    if (!isObject(value.source)) {
        errors.push('source must be an object');
    } else {
        for (const field of unknownFields(value.source, SOURCE_FIELDS)) errors.push(`source unknown field: ${field}`);
        if (!isStableId(value.source.kind)) errors.push('source kind must be a stable id');
        if (!isStableId(value.source.id)) errors.push('source id must be a stable id');
        const allowedSourceKinds = SOURCE_KINDS_BY_CODE[value.code];
        if (allowedSourceKinds && !allowedSourceKinds.has(value.source.kind)) {
            errors.push(`source kind is not trusted for ${value.code}`);
        }
    }
    if (!Array.isArray(value.sourceContributionIds)) {
        errors.push('sourceContributionIds must be an array');
    } else {
        if (new Set(value.sourceContributionIds).size !== value.sourceContributionIds.length) {
            errors.push('sourceContributionIds must not contain duplicates');
        }
        const known = knownContributionIds === null ? null : new Set(knownContributionIds);
        for (const contributionId of value.sourceContributionIds) {
            if (!isStableId(contributionId)) {
                errors.push(`sourceContributionIds contains invalid id: ${contributionId}`);
            } else if (known && !known.has(contributionId)) {
                errors.push(`sourceContributionIds contains unknown contribution: ${contributionId}`);
            }
        }
    }
    return { ok: errors.length === 0, errors };
}

export function createEpisodeHardBoundary({
    id,
    branchId,
    code,
    source,
    sourceContributionIds = [],
} = {}) {
    const boundary = {
        kind: EPISODE_HARD_BOUNDARY_KIND,
        id,
        branchId,
        code,
        source: source ? { kind: source.kind, id: source.id } : source,
        sourceContributionIds: [...sourceContributionIds],
    };
    const result = validateEpisodeHardBoundary(boundary);
    if (!result.ok) throw new TypeError(result.errors.join('\n'));
    return boundary;
}

export function createInitialEpisodeBoundaryState({ openedAtRevision = 0 } = {}) {
    return {
        kind: EPISODE_BOUNDARY_STATE_KIND,
        checkpointSequence: 0,
        lastReviewedAtRevision: openedAtRevision,
        contributionCountAtLastReview: 0,
        effectCountAtLastReview: 0,
        decision: 'continue',
        sourceContributionIds: [],
    };
}
