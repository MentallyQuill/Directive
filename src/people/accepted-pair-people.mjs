import { stableSha256Hex } from '../runtime/v1-stable-hash.mjs';
import { selectCurrentStoryEpisodes } from '../story/story-settlement.mjs';
import {
    PUBLIC_PERSON_FACT_FIELDS,
    validatePeopleEvent,
} from './people-event-contracts.mjs';

function compact(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function shortHash(value) {
    return stableSha256Hex(value).slice(0, 8);
}

function currentEpisodes(settlement = {}) {
    const sealed = selectCurrentStoryEpisodes(settlement);
    const active = (settlement.episodes || []).find((episode) => (
        episode?.id === settlement.activeEpisode && episode?.status === 'open'
    ));
    return active ? [...sealed, structuredClone(active)] : sealed;
}

export function createPeopleInterpretationContext({
    crewDataset = {},
    storySettlement = {},
} = {}) {
    const known = new Map();
    for (const officer of crewDataset.officers || []) {
        if (!compact(officer?.id) || !compact(officer?.name)) continue;
        known.set(officer.id, {
            id: officer.id,
            name: compact(officer.name),
            role: compact(officer.billet || officer.role),
        });
    }
    for (const episode of currentEpisodes(storySettlement)) {
        for (const event of episode.peopleEvents || []) {
            if (event.type !== 'personIntroduced' || known.has(event.personId)) continue;
            const facts = event.publicFacts || {};
            known.set(event.personId, {
                id: event.personId,
                name: compact(facts.displayName || event.name),
                role: compact(facts.role),
            });
        }
        for (const event of episode.peopleEvents || []) {
            if (event.type !== 'publicFactLearned' || !known.has(event.personId)) continue;
            const person = known.get(event.personId);
            if (event.field === 'displayName') person.name = compact(event.value);
            if (event.field === 'role') person.role = compact(event.value);
        }
    }
    return {
        knownPeople: [...known.values()].sort((left, right) => left.id.localeCompare(right.id)),
    };
}

function dossierFor(dossiers, personId) {
    if (dossiers instanceof Map) return dossiers.get(personId) || null;
    if (Array.isArray(dossiers)) return dossiers.find((dossier) => dossier?.personId === personId) || null;
    return dossiers?.[personId] || null;
}

function publicFactsFromDossier(dossier = {}) {
    const facts = {};
    for (const field of PUBLIC_PERSON_FACT_FIELDS) {
        const value = compact(dossier?.[field]);
        if (value) facts[field] = value;
    }
    return facts;
}

export function materializeAcceptedPairPeopleEvents({
    observations = [],
    peopleContext = {},
    sourcePair = {},
    sourceContributionIds = {},
    branchId = '',
    dossiers = {},
} = {}) {
    const knownPersonIds = new Set((peopleContext.knownPeople || []).map((person) => person?.id).filter(Boolean));
    const localPersonIds = new Map();
    for (const observation of observations) {
        if (observation?.type !== 'personIntroduced') continue;
        if (localPersonIds.has(observation.localRef)) {
            throw new TypeError(`duplicate People introduction localRef: ${observation.localRef}`);
        }
        const source = sourcePair[observation.sourceSlot];
        if (!source?.messageId || !source?.textHash) throw new TypeError('People introduction source is unavailable');
        const identity = [
            branchId,
            source.messageId,
            source.selectedSwipeId || 'no-swipe',
            source.textHash,
            observation.localRef,
        ].join('|');
        const personId = `person.emergent.${shortHash(identity)}`;
        if (knownPersonIds.has(personId)) throw new TypeError(`People introduction personId collision: ${personId}`);
        localPersonIds.set(observation.localRef, personId);
        knownPersonIds.add(personId);
    }

    const events = observations.map((observation) => {
        const source = sourcePair[observation.sourceSlot];
        const contributionId = sourceContributionIds[observation.sourceSlot];
        if (!source?.messageId || !source?.textHash || !contributionId) {
            throw new TypeError('People observation source is unavailable');
        }
        const personId = observation.type === 'personIntroduced'
            ? localPersonIds.get(observation.localRef)
            : (localPersonIds.get(observation.personRef) || observation.personRef);
        if (!knownPersonIds.has(personId)) throw new TypeError(`People observation references unknown person: ${observation.personRef}`);
        const identity = [
            branchId,
            source.messageId,
            source.selectedSwipeId || 'no-swipe',
            source.textHash,
            observation.type,
            personId,
            JSON.stringify(observation),
        ].join('|');
        const base = {
            id: `people-event.${shortHash(identity)}`,
            type: observation.type,
            personId,
            sourceContributionIds: [contributionId],
        };
        if (observation.type === 'personIntroduced') {
            return {
                ...base,
                name: compact(observation.name),
                introductionSummary: compact(observation.introductionSummary),
                publicFacts: publicFactsFromDossier(dossierFor(dossiers, personId)),
            };
        }
        if (observation.type === 'publicFactLearned') {
            return {
                ...base,
                field: observation.field,
                value: compact(observation.value),
            };
        }
        return { ...base, summary: compact(observation.summary) };
    });

    const knownContributionIds = Object.values(sourceContributionIds).filter(Boolean);
    for (const event of events) {
        const result = validatePeopleEvent(event, {
            knownContributionIds,
            knownPersonIds: [...knownPersonIds],
        });
        if (!result.ok) throw new TypeError(result.errors.join('\n'));
    }
    return events;
}
