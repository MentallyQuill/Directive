import { selectCurrentStoryEpisodes } from '../../story/story-settlement.mjs';

export const PEOPLE_PLAYER_PROJECTION_KIND = 'directive.peoplePlayerProjection.v1';

function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function profileCardFor(crewDataset, characterId) {
    return (crewDataset?.cards || []).find((card) => (
        card?.type === 'crew.profile'
        && card?.visibility === 'publicPackage'
        && card?.payload?.narratorSafe === true
        && card?.scope?.characters?.includes(characterId)
        && compact(card?.payload?.summary)
    )) || null;
}

function visibleRelationshipPosture(storySettlement, characterId) {
    const episodes = selectCurrentStoryEpisodes(storySettlement);
    for (let episodeIndex = episodes.length - 1; episodeIndex >= 0; episodeIndex -= 1) {
        const effects = episodes[episodeIndex].effects || [];
        for (let effectIndex = effects.length - 1; effectIndex >= 0; effectIndex -= 1) {
            const effect = effects[effectIndex];
            if (effect?.type === 'character.relationshipPosture'
                && effect?.targetId === characterId
                && effect?.playerVisibility === 'visible'
                && effect?.status === 'active'
                && compact(effect?.value)) {
                return compact(effect.value);
            }
        }
    }
    return null;
}

function momentsByCharacter(storySettlement = {}) {
    const byCharacter = new Map();
    for (const episode of selectCurrentStoryEpisodes(storySettlement)) {
        for (const moment of episode.characterMoments || []) {
            if (moment.playerVisibility !== 'visible') continue;
            const records = byCharacter.get(moment.characterId) || [];
            records.push({
                id: moment.id,
                episodeId: episode.id,
                sealedAtRevision: episode.sealedAtRevision,
                summary: moment.summary,
                sourceRefs: {
                    episodeId: episode.id,
                    sourceContributionIds: [...moment.sourceContributionIds],
                },
            });
            byCharacter.set(moment.characterId, records);
        }
    }
    for (const [characterId, records] of byCharacter.entries()) {
        byCharacter.set(characterId, records
            .sort((left, right) => right.sealedAtRevision - left.sealedAtRevision || left.id.localeCompare(right.id))
            .slice(0, 3));
    }
    return byCharacter;
}

function currentMissionLink(definition, missionProjection, profileCard) {
    if (!missionProjection?.missionId || missionProjection.missionId !== definition?.id) return null;
    if (!profileCard?.scope?.missions?.includes(definition?.packageBinding?.sourceId)) return null;
    return {
        missionId: missionProjection.missionId,
        title: missionProjection.title || definition?.playerText?.title || '',
    };
}

export function createPeoplePlayerProjection({
    runtimeAssets = {},
    definition = {},
    missionProjection = {},
    storySettlement = {},
} = {}) {
    const crewDataset = runtimeAssets.crewDataset || {};
    const moments = momentsByCharacter(storySettlement);
    const people = (crewDataset.officers || []).map((officer) => {
        const profileCard = profileCardFor(crewDataset, officer.id);
        const personMoments = structuredClone(moments.get(officer.id) || []);
        return {
            id: officer.id,
            name: officer.name,
            billet: officer.billet,
            profileSummary: compact(profileCard?.payload?.summary),
            relationshipPosture: visibleRelationshipPosture(storySettlement, officer.id),
            moments: personMoments,
            missionLink: currentMissionLink(definition, missionProjection, profileCard),
            sourceRefs: {
                datasetId: crewDataset?.manifest?.id || null,
                profileCardId: profileCard?.id || null,
                episodeIds: [...new Set(personMoments.map((moment) => moment.episodeId))],
            },
        };
    });
    return {
        kind: PEOPLE_PLAYER_PROJECTION_KIND,
        missionId: missionProjection?.missionId || null,
        people,
    };
}
