import { selectCurrentStoryEpisodes } from '../../story/story-settlement.mjs';

export const STORY_PLAYER_PROJECTION_KIND = 'directive.storyPlayerProjection.v1';

function referencesFor(episode = {}) {
    const copy = (value) => [...new Set((Array.isArray(value) ? value : []).filter(Boolean))];
    return {
        missionIds: copy(episode.references?.missionIds),
        questIds: copy(episode.references?.questIds),
        participantIds: copy(episode.references?.participantIds),
        locationIds: copy(episode.references?.locationIds),
    };
}

function visibleEffects(episode = {}) {
    return (episode.effects || []).filter((effect) => (
        effect.status === 'active' && effect.playerVisibility === 'visible'
    ));
}

function projectedEffect(effect) {
    return {
        id: effect.id,
        type: effect.type,
        targetId: effect.targetId,
        ...(Object.hasOwn(effect, 'value') ? { value: structuredClone(effect.value) } : {}),
    };
}

function projectedConsequence(consequence) {
    return {
        id: consequence.id,
        summary: consequence.summary,
    };
}

export function createStoryPlayerProjection({ settlement = {} } = {}) {
    const entries = selectCurrentStoryEpisodes(settlement).map((episode) => {
        const effects = visibleEffects(episode);
        return {
            id: episode.id,
            sealedAtRevision: episode.sealedAtRevision,
            summary: episode.summary,
            lastingChanges: effects.map(projectedEffect),
            unresolvedConsequences: (episode.unresolvedConsequences || [])
                .filter((item) => item.status === 'unresolved'
                    && item.playerVisibility === 'visible'
                    && typeof item.summary === 'string'
                    && item.summary.length > 0)
                .map(projectedConsequence),
            references: referencesFor(episode),
            sourceRefs: {
                episodeId: episode.id,
                effectIds: effects.map((effect) => effect.id),
            },
        };
    });
    const focusedEntry = entries.find((entry) => entry.id === settlement.focus?.episodeId);
    const focusedConsequence = focusedEntry?.unresolvedConsequences.find(
        (item) => item.id === settlement.focus?.consequenceId,
    );
    const focus = focusedEntry && focusedConsequence ? {
        id: settlement.focus.id,
        episodeId: focusedEntry.id,
        consequenceId: focusedConsequence.id,
    } : null;
    return {
        kind: STORY_PLAYER_PROJECTION_KIND,
        branchId: settlement.branchId || null,
        revision: Number.isInteger(settlement.revision) ? settlement.revision : 0,
        entries,
        focus,
    };
}
