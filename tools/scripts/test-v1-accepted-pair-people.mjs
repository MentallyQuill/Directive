import assert from 'node:assert/strict';

import {
    createPeopleInterpretationContext,
    materializeAcceptedPairPeopleEvents,
} from '../../src/people/accepted-pair-people.mjs';

const peopleContext = createPeopleInterpretationContext({
    crewDataset: {
        officers: [{ id: 'mara-whitaker', name: 'Mara Whitaker', billet: 'Commanding Officer' }],
    },
    storySettlement: { episodes: [] },
});
assert.deepEqual(peopleContext.knownPeople, [{
    id: 'mara-whitaker',
    name: 'Mara Whitaker',
    role: 'Commanding Officer',
}]);

const sourcePair = {
    previousAssistant: {
        messageId: 'message.assistant.people',
        selectedSwipeId: 'swipe.2',
        textHash: 'a'.repeat(64),
    },
    currentPlayer: {
        messageId: 'message.player.people',
        selectedSwipeId: null,
        textHash: 'b'.repeat(64),
    },
};
const events = materializeAcceptedPairPeopleEvents({
    branchId: 'save.people-materialize',
    peopleContext,
    sourcePair,
    sourceContributionIds: {
        previousAssistant: 'contribution.assistant.people',
        currentPlayer: 'contribution.player.people',
    },
    observations: [{
        type: 'personIntroduced',
        localRef: 'new-1',
        name: 'Ari Sol',
        introductionSummary: 'Ari gave her name during a direct engineering-deck conversation.',
        sourceSlot: 'previousAssistant',
    }, {
        type: 'personIntroduced',
        localRef: 'new-2',
        name: 'Tovan Rel',
        introductionSummary: 'Tovan introduced himself beside the damaged relay.',
        sourceSlot: 'previousAssistant',
    }, {
        type: 'relationshipEvidence',
        personRef: 'new-1',
        summary: 'The commander protected Ari\'s team from an unsafe restart order.',
        sourceSlot: 'currentPlayer',
    }],
});

const introductions = events.filter(({ type }) => type === 'personIntroduced');
assert.equal(introductions.length, 2);
assert.match(introductions[0].personId, /^person\.emergent\.[a-f0-9]{8}$/);
assert.match(introductions[1].personId, /^person\.emergent\.[a-f0-9]{8}$/);
assert.notEqual(introductions[0].personId, introductions[1].personId);
assert.deepEqual(events[2].sourceContributionIds, ['contribution.player.people']);
assert.equal(events[2].personId, introductions[0].personId);

console.log('V1 accepted-pair People materialization tests passed.');
