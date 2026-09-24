// Pure fold over current, surviving episodes; callers own branch/episode selection.
const compact = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function projectRelationshipStates(episodes = []) {
    episodes = [...episodes].sort((a, b) => a.openedAtRevision - b.openedAtRevision || a.id.localeCompare(b.id));
    const states = new Map();
    const contributions = episodes.flatMap(episode => episode.contributions || []);
    const sourceOrder = new Map(contributions.map((source, index) => [source.id, index]));
    const effects = new Map();
    let effectOrder = 0;
    for (const episode of episodes) {
        for (const effect of episode.effects || []) {
            if (effect.playerVisibility !== 'visible' || effect.status !== 'active'
                || !['character.relationshipPosture', 'character.relationshipOpenMatter'].includes(effect.type)) continue;
            const state = states.get(effect.targetId) || {
                personId: effect.targetId, posture: null, openMatter: null, openMatterId: null,
                openMatterSourceContributionIds: [], blockedOpenMatterSourceIds: [],
            };
            effects.set(effect.id, effect);
            effectOrder += 1;
            if (effect.type === 'character.relationshipPosture') state.posture = compact(effect.value) || null;
            else {
                state.openMatterOrder = effectOrder;
                state.openMatter = compact(effect.value) || null;
                state.openMatterId = state.openMatter ? effect.id : null;
                state.openMatterSourceContributionIds = [...(effect.sourceContributionIds || [])];
            }
            states.set(effect.targetId, state);
        }
    }
    for (const episode of episodes) {
        for (const event of episode.peopleEvents || []) {
            if (event.type !== 'relationshipMatterResolved') continue;
            const state = states.get(event.personId);
            const target = effects.get(event.matterEffectId);
            if (!state || target?.type !== 'character.relationshipOpenMatter'
                || target.targetId !== event.personId || !compact(target.value)) continue;
            const cutoff = Math.max(-1, ...(event.sourceContributionIds || []).map(id => sourceOrder.get(id) ?? -1));
            state.blockedOpenMatterSourceIds = [...new Set([
                ...state.blockedOpenMatterSourceIds,
                ...contributions.slice(0, cutoff + 1).map(source => source.id),
            ])];
            if (state.openMatterId === event.matterEffectId) {
                state.openMatter = null;
                state.openMatterId = null;
                state.openMatterSourceContributionIds = [];
            }
        }
    }
    return states;
}

// The accepted source order, not repair/review time, decides whether an outcome
// can fulfill an obligation. Same-contribution outcomes are permitted.
export function createMatterResolutionSourceCheck(episodes = []) {
    const ordered = [...episodes].sort((a, b) => a.openedAtRevision - b.openedAtRevision || a.id.localeCompare(b.id));
    const sources = ordered.flatMap(episode => episode.contributions || []);
    const sourceOrder = new Map(sources.map((source, index) => [source.id, index]));
    const bySourceId = new Map(sources.map(source => [source.id, source]));
    const states = projectRelationshipStates(ordered);
    return ({ personId, matterEffectId, sourceContributionIds }) => {
        const current = states.get(personId);
        if (!matterEffectId || current?.openMatterId !== matterEffectId
            || !current.openMatterSourceContributionIds.length || !sourceContributionIds?.length) return false;
        const originOrders = current.openMatterSourceContributionIds.map(id => sourceOrder.get(id));
        if (originOrders.some(index => index === undefined)) return false;
        const firstEligible = Math.max(...originOrders);
        return sourceContributionIds.every(id => bySourceId.get(id)?.role === 'assistant'
            && sourceOrder.get(id) >= firstEligible);
    };
}
