import { selectCurrentStoryEpisodes } from '../../story/story-settlement.mjs';

export const PEOPLE_PLAYER_PROJECTION_KIND = 'directive.peoplePlayerProjection.v1';
export const PEOPLE_PROMPT_PROJECTION_KIND = 'directive.peoplePromptProjection.v1';

const MAX_PROMPT_DEFINING_MOMENTS = 8;

function compact(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function currentEpisodes(storySettlement = {}) {
    const sealed = selectCurrentStoryEpisodes(storySettlement);
    const active = (storySettlement.episodes || []).find((episode) => (
        episode?.id === storySettlement.activeEpisode && episode?.status === 'open'
    ));
    return active ? [...sealed, structuredClone(active)] : sealed;
}

function latestVisibleRelationshipValue(episodes, characterId, type) {
    for (let episodeIndex = episodes.length - 1; episodeIndex >= 0; episodeIndex -= 1) {
        const effects = episodes[episodeIndex].effects || [];
        for (let effectIndex = effects.length - 1; effectIndex >= 0; effectIndex -= 1) {
            const effect = effects[effectIndex];
            if (effect?.type === type
                && effect?.targetId === characterId
                && effect?.playerVisibility === 'visible'
                && effect?.status === 'active') {
                return compact(effect.value) || null;
            }
        }
    }
    return null;
}

function momentsByCharacter(episodes) {
    const byCharacter = new Map();
    for (const episode of episodes.filter((candidate) => candidate.status === 'sealed')) {
        for (const moment of episode.characterMoments || []) {
            if (moment.playerVisibility !== 'visible') continue;
            const records = byCharacter.get(moment.characterId) || [];
            records.push({
                id: moment.id,
                episodeId: episode.id,
                sealedAtRevision: episode.sealedAtRevision,
                ...(compact(moment.title) ? { title: compact(moment.title) } : {}),
                summary: compact(moment.summary),
                sourceRefs: {
                    episodeId: episode.id,
                    sourceContributionIds: [...moment.sourceContributionIds],
                },
            });
            byCharacter.set(moment.characterId, records);
        }
    }
    for (const [characterId, records] of byCharacter.entries()) {
        byCharacter.set(characterId, records.sort((left, right) => (
            right.sealedAtRevision - left.sealedAtRevision || left.id.localeCompare(right.id)
        )));
    }
    return byCharacter;
}

function publicRecord(values = {}) {
    const result = {};
    for (const field of ['affiliation', 'age', 'birthplace', 'serviceBackground', 'assignmentHistory']) {
        if (compact(values[field])) result[field] = compact(values[field]);
    }
    return result;
}

function authoredPerson(officer, crewDataset) {
    return {
        id: officer.id,
        name: compact(officer.name),
        billet: compact(officer.billet),
        categoryId: compact(officer.categoryId) || 'unknown-unsorted',
        portrait: {
            kind: 'crew.portrait.formal',
            subjectId: officer.id,
        },
        service: structuredClone(officer.service || null),
        species: compact(officer.species),
        publicRecord: publicRecord(officer.publicRecord),
        profileSummary: compact(officer.profileSummary),
        knownSince: null,
        relationshipPosture: null,
        relationshipOpenMatter: null,
        moments: [],
        sourceRefs: {
            datasetId: crewDataset?.manifest?.id || null,
            episodeIds: [],
        },
    };
}

function emergentPerson(event, episodeId) {
    const facts = event.publicFacts || {};
    return {
        id: event.personId,
        name: compact(facts.displayName || event.name),
        billet: compact(facts.role),
        categoryId: 'unknown-unsorted',
        portrait: {
            kind: 'people.portrait.none',
            subjectId: event.personId,
        },
        service: null,
        species: compact(facts.species),
        publicRecord: publicRecord(facts),
        profileSummary: compact(facts.profileSummary),
        knownSince: compact(event.introductionSummary) || null,
        relationshipPosture: null,
        relationshipOpenMatter: null,
        moments: [],
        sourceRefs: {
            datasetId: null,
            episodeIds: [episodeId],
        },
    };
}

function applyPublicFact(person, event) {
    const value = compact(event.value);
    if (!value) return;
    if (event.field === 'displayName') person.name = value;
    else if (event.field === 'role') person.billet = value;
    else if (event.field === 'species') person.species = value;
    else if (event.field === 'profileSummary') person.profileSummary = value;
    else person.publicRecord[event.field] = value;
}

function appendEpisodeRef(person, episodeId) {
    if (!person.sourceRefs.episodeIds.includes(episodeId)) person.sourceRefs.episodeIds.push(episodeId);
}

export function createPeoplePlayerProjection({
    runtimeAssets = {},
    missionProjection = {},
    storySettlement = {},
} = {}) {
    const crewDataset = runtimeAssets.crewDataset || {};
    const episodes = currentEpisodes(storySettlement);
    const moments = momentsByCharacter(episodes);
    const peopleById = new Map();
    for (const officer of crewDataset.officers || []) {
        peopleById.set(officer.id, authoredPerson(officer, crewDataset));
    }

    for (const episode of episodes) {
        for (const event of episode.peopleEvents || []) {
            if (event.type !== 'personIntroduced') continue;
            if (!peopleById.has(event.personId)) {
                peopleById.set(event.personId, emergentPerson(event, episode.id));
            } else {
                appendEpisodeRef(peopleById.get(event.personId), episode.id);
            }
        }
        for (const event of episode.peopleEvents || []) {
            if (event.type !== 'publicFactLearned') continue;
            const person = peopleById.get(event.personId);
            if (!person) continue;
            applyPublicFact(person, event);
            appendEpisodeRef(person, episode.id);
        }
    }

    const people = [...peopleById.values()].map((person) => {
        const personMoments = structuredClone(moments.get(person.id) || []);
        const episodeIds = new Set([
            ...person.sourceRefs.episodeIds,
            ...personMoments.map((moment) => moment.episodeId),
        ]);
        return {
            ...person,
            relationshipPosture: latestVisibleRelationshipValue(
                episodes,
                person.id,
                'character.relationshipPosture',
            ),
            relationshipOpenMatter: latestVisibleRelationshipValue(
                episodes,
                person.id,
                'character.relationshipOpenMatter',
            ),
            moments: personMoments,
            sourceRefs: {
                ...person.sourceRefs,
                episodeIds: [...episodeIds],
            },
        };
    });
    return {
        kind: PEOPLE_PLAYER_PROJECTION_KIND,
        missionId: missionProjection?.missionId || null,
        people,
    };
}

export function createPeoplePromptProjection({ peopleProjection = {} } = {}) {
    const people = (peopleProjection.people || []).map((person) => ({
        id: person.id,
        name: person.name,
        ...(compact(person.billet) ? { role: compact(person.billet) } : {}),
        ...(compact(person.species) ? { species: compact(person.species) } : {}),
        ...(compact(person.publicRecord?.affiliation)
            ? { affiliation: compact(person.publicRecord.affiliation) }
            : {}),
        relationshipPosture: compact(person.relationshipPosture) || null,
        relationshipOpenMatter: compact(person.relationshipOpenMatter) || null,
    }));
    const recentDefiningMoments = (peopleProjection.people || [])
        .flatMap((person) => (person.moments || []).map((moment) => ({
            personId: person.id,
            momentId: moment.id,
            sealedAtRevision: moment.sealedAtRevision,
            ...(compact(moment.title) ? { title: compact(moment.title) } : {}),
            summary: compact(moment.summary),
        })))
        .sort((left, right) => (
            right.sealedAtRevision - left.sealedAtRevision || left.momentId.localeCompare(right.momentId)
        ))
        .slice(0, MAX_PROMPT_DEFINING_MOMENTS);
    return {
        kind: PEOPLE_PROMPT_PROJECTION_KIND,
        people,
        recentDefiningMoments,
    };
}
