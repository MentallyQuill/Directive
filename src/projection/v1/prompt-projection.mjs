export const PROMPT_STORY_PROJECTION_KIND = 'directive.promptStoryProjection.v1';
export const WORKING_STORY_PROMPT_PROJECTION_KIND = 'directive.workingStoryPromptProjection.v1';

function intersects(left = [], right = []) {
    const rightSet = new Set(right);
    return left.some((item) => rightSet.has(item));
}

function relevance(entry, { focus, activeMissionId, participantIds, locationId }) {
    let score = 0;
    if (focus?.episodeId === entry.id) score += 100;
    if (activeMissionId && entry.references?.missionIds?.includes(activeMissionId)) score += 40;
    if (intersects(entry.references?.participantIds || [], participantIds)) score += 25;
    if (locationId && entry.references?.locationIds?.includes(locationId)) score += 20;
    if ((entry.unresolvedConsequences || []).length > 0) score += 10;
    return score;
}

function promptEntry(entry) {
    return {
        id: entry.id,
        summary: entry.summary,
        lastingChanges: structuredClone(entry.lastingChanges || []),
        unresolvedConsequences: structuredClone(entry.unresolvedConsequences || []),
    };
}

function lengthOf(value) {
    return JSON.stringify(value).length;
}

function compactText(value, maximum) {
    return [...String(value ?? '').replace(/\s+/g, ' ').trim()].slice(0, maximum).join('');
}

export function createV1WorkingStoryPromptProjection({
    settlement = {},
    maxCharacters = 1800,
} = {}) {
    if (!Number.isInteger(maxCharacters) || maxCharacters < 240) {
        throw new TypeError('maxCharacters must be an integer of at least 240');
    }
    const episode = (settlement.episodes || []).find((item) => (
        item?.id === settlement.activeEpisode && item?.status === 'open'
    ));
    if (!episode?.workingCapsule) return null;
    const capsule = episode.workingCapsule;
    const projection = {
        kind: WORKING_STORY_PROMPT_PROJECTION_KIND,
        episodeId: episode.id,
        summary: compactText(capsule.summary, 768),
        foregroundQuestion: compactText(capsule.foregroundQuestion, 240) || null,
        recentEvidence: (capsule.recentEvidence || [])
            .filter((item) => new Set(['user', 'assistant']).has(item?.role))
            .slice(-6)
            .map((item) => ({
                role: item.role,
                excerpt: compactText(item.excerpt, 240),
            }))
            .filter((item) => item.excerpt),
        truncated: false,
    };
    while (projection.recentEvidence.length > 0 && lengthOf(projection) > maxCharacters) {
        projection.recentEvidence.shift();
        projection.truncated = true;
    }
    while (projection.summary.length > 0 && lengthOf(projection) > maxCharacters) {
        projection.summary = projection.summary.slice(0, -1);
        projection.truncated = true;
    }
    while (projection.foregroundQuestion && lengthOf(projection) > maxCharacters) {
        projection.foregroundQuestion = projection.foregroundQuestion.slice(0, -1) || null;
        projection.truncated = true;
    }
    return projection;
}

export function createV1PromptProjection({
    storyProjection = {},
    activeMissionId = null,
    participantIds = [],
    locationId = null,
    maxEntries = 6,
    maxCharacters = 4000,
} = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new TypeError('maxEntries must be a positive integer');
    if (!Number.isInteger(maxCharacters) || maxCharacters < 240) {
        throw new TypeError('maxCharacters must be an integer of at least 240');
    }
    const entries = Array.isArray(storyProjection.entries) ? storyProjection.entries : [];
    const currentFocusEntry = entries.find((entry) => entry.id === storyProjection.focus?.episodeId);
    const currentFocusConsequence = currentFocusEntry?.unresolvedConsequences?.find(
        (item) => item.id === storyProjection.focus?.consequenceId,
    );
    const focus = currentFocusEntry && currentFocusConsequence
        ? structuredClone(storyProjection.focus)
        : null;
    const ranked = entries.map((entry) => ({
        entry,
        score: relevance(entry, { focus, activeMissionId, participantIds, locationId }),
    })).sort((left, right) => (
        right.score - left.score
        || right.entry.sealedAtRevision - left.entry.sealedAtRevision
        || left.entry.id.localeCompare(right.entry.id)
    ));
    const projection = {
        kind: PROMPT_STORY_PROJECTION_KIND,
        branchId: storyProjection.branchId || null,
        revision: Number.isInteger(storyProjection.revision) ? storyProjection.revision : 0,
        focus,
        entries: [],
        truncated: false,
    };
    let trimmedEntry = false;
    for (const { entry } of ranked.slice(0, maxEntries)) {
        const full = promptEntry(entry);
        const candidate = { ...projection, entries: [...projection.entries, full] };
        if (lengthOf(candidate) <= maxCharacters) {
            projection.entries.push(full);
            continue;
        }
        if (projection.entries.length === 0) {
            const minimal = { id: entry.id, summary: '', lastingChanges: [], unresolvedConsequences: [] };
            if (lengthOf({ ...projection, entries: [minimal], truncated: true }) > maxCharacters && projection.focus) {
                projection.focus = {
                    episodeId: projection.focus.episodeId,
                    consequenceId: projection.focus.consequenceId,
                };
            }
            const remaining = Math.max(0, maxCharacters - lengthOf({ ...projection, entries: [minimal] }));
            minimal.summary = String(entry.summary || '').slice(0, remaining);
            while (minimal.summary.length > 0
                && lengthOf({ ...projection, entries: [minimal], truncated: true }) > maxCharacters) {
                minimal.summary = minimal.summary.slice(0, -1);
            }
            if (lengthOf({ ...projection, entries: [minimal], truncated: true }) <= maxCharacters) {
                projection.entries.push(minimal);
                trimmedEntry = true;
            }
        }
        break;
    }
    projection.truncated = trimmedEntry
        || projection.entries.length < entries.length
        || entries.length > maxEntries;
    return projection;
}
