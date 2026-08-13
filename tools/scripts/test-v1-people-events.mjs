import assert from 'node:assert/strict';

import { validatePeopleEvent } from '../../src/people/people-event-contracts.mjs';
import { createEpisodeHardBoundary } from '../../src/story/episode-boundary.mjs';
import { createEmptyStorySettlement } from '../../src/story/story-settlement-contracts.mjs';
import {
    acceptStoryContribution,
    appendStoryPeopleEvents,
    invalidateStorySource,
    openStoryEpisode,
    sealStoryEpisode,
    selectCurrentStoryEpisodes,
} from '../../src/story/story-settlement.mjs';

let settlement = openStoryEpisode(createEmptyStorySettlement({ branchId: 'save.people-events' }), {
    episodeId: 'episode.people-introduction',
    sceneId: 'scene.people-introduction',
});
settlement = acceptStoryContribution(settlement, {
    id: 'contribution.people-introduction',
    messageId: 'message.people-introduction',
    swipeId: 'swipe.1',
    role: 'assistant',
    textHash: 'a'.repeat(64),
    acceptedAtRevision: settlement.revision,
});

const introduction = {
    id: 'people-event.ari-introduction',
    type: 'personIntroduced',
    personId: 'person.emergent.ari-sol',
    name: 'Ari Sol',
    introductionSummary: 'Ari introduced herself while repairing relay junction four.',
    publicFacts: { role: 'Damage-control technician' },
    sourceContributionIds: ['contribution.people-introduction'],
};
assert.equal(validatePeopleEvent(introduction, {
    knownContributionIds: ['contribution.people-introduction'],
}).ok, true);

settlement = appendStoryPeopleEvents(settlement, [introduction]);
const episode = settlement.episodes.find(({ id }) => id === settlement.activeEpisode);
assert.deepEqual(episode.peopleEvents, [introduction]);
assert.deepEqual(episode.references.participantIds, ['person.emergent.ari-sol']);

const learnedFact = {
    id: 'people-event.ari-birthplace',
    type: 'publicFactLearned',
    personId: 'person.emergent.ari-sol',
    field: 'birthplace',
    value: 'Nairobi, Earth',
    sourceContributionIds: ['contribution.people-introduction'],
};
assert.equal(validatePeopleEvent(learnedFact, {
    knownContributionIds: ['contribution.people-introduction'],
    knownPersonIds: ['person.emergent.ari-sol'],
}).ok, true);

const relationshipEvidence = {
    id: 'people-event.ari-trust',
    type: 'relationshipEvidence',
    personId: 'person.emergent.ari-sol',
    summary: 'Ari trusted the commander with the damaged relay access code after they protected her repair team.',
    sourceContributionIds: ['contribution.people-introduction'],
};
assert.equal(validatePeopleEvent(relationshipEvidence, {
    knownContributionIds: ['contribution.people-introduction'],
    knownPersonIds: ['person.emergent.ari-sol'],
}).ok, true);
assert.match(validatePeopleEvent({
    ...relationshipEvidence,
    privateMotive: 'A hidden reason the player cannot know.',
}, {
    knownContributionIds: ['contribution.people-introduction'],
    knownPersonIds: ['person.emergent.ari-sol'],
}).errors.join('\n'), /unknown field/);

settlement = acceptStoryContribution(settlement, {
    id: 'contribution.people-fact-correction',
    messageId: 'message.people-fact-correction',
    swipeId: 'swipe.1',
    role: 'assistant',
    textHash: 'b'.repeat(64),
    acceptedAtRevision: settlement.revision,
});
settlement = appendStoryPeopleEvents(settlement, [learnedFact, {
    ...learnedFact,
    id: 'people-event.ari-birthplace-corrected',
    value: 'Mombasa, Earth',
    sourceContributionIds: ['contribution.people-fact-correction'],
}]);
const boundary = createEpisodeHardBoundary({
    id: 'boundary.people-introduction',
    branchId: 'save.people-events',
    code: 'authored-scene-closure',
    source: { kind: 'campaignReducer', id: 'campaign.people-introduction' },
    sourceContributionIds: [
        'contribution.people-introduction',
        'contribution.people-fact-correction',
    ],
});
settlement = sealStoryEpisode(settlement, {
    boundaryReason: boundary.code,
    hardBoundary: boundary,
    summary: 'The commander met Ari and learned her public service record.',
    significance: { meaningfulDisclosure: true },
});
const recovered = invalidateStorySource(settlement, {
    contributionId: 'contribution.people-fact-correction',
    reason: 'selected-swipe-changed',
});
const currentEvents = selectCurrentStoryEpisodes(recovered)
    .flatMap((currentEpisode) => currentEpisode.peopleEvents || []);
assert.deepEqual(currentEvents.map((event) => event.id), [
    'people-event.ari-introduction',
    'people-event.ari-birthplace',
]);

console.log('V1 People event tests passed.');
