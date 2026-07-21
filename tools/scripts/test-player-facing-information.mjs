import assert from 'node:assert/strict';

import {
  buildPlayerFacingInformation,
  resolveSelectedQuestId
} from '../../src/ui/player-facing-information.mjs';

const campaignState = {
  campaign: { id: 'campaign:ashes' },
  mission: {
    id: 'main:ashes',
    title: 'Ashes of Peace',
    status: 'active',
    currentObjective: 'Secure the Hesperus.',
    openAssignments: [
      { id: 'assignment:brief', title: 'Brief Bronn', summary: 'Meet Bronn before alpha shift.', status: 'open', assignmentScope: 'playerCurrentOrder' },
      { id: 'assignment:delegated', title: 'Audit Sensors', summary: 'Nayar runs the sensor audit.', status: 'open', assignmentScope: 'delegatedCrewOrder' }
    ]
  },
  openWorld: {
    quests: [
      { id: 'side:relay', title: 'Silent Relay', status: 'available', category: 'side', urgencyMinutes: 80 },
      { id: 'crew:bronn', title: 'Bronn Needs a Decision', status: 'inactive', category: 'crew' },
      { id: 'done:survey', title: 'Survey the Debris Field', status: 'completed', category: 'open-world' }
    ]
  },
  crew: {
    roster: [{ id: 'crew:bronn', name: 'Bronn', role: 'Chief Engineer', standing: 'Wary', availability: 'Available' }]
  },
  ship: {
    name: 'U.S.S. Breckenridge',
    condition: 'Operational',
    restrictions: [],
    damage: [{ id: 'damage:reactor', label: 'Reactor degradation' }]
  },
  narrativeThreads: {
    records: [
      {
        id: 'fact:reactor',
        visibility: 'player',
        missionId: 'main:ashes',
        summary: 'The reactor has 41 minutes remaining.',
        kind: 'fact',
        createdAt: '2026-07-20T09:01:00.000Z'
      },
      {
        id: 'hidden:mutiny',
        visibility: 'hidden',
        missionId: 'main:ashes',
        summary: 'Private mutiny plan.',
        kind: 'fact'
      },
      {
        id: 'fact:relay',
        visibility: 'public',
        questId: 'side:relay',
        summary: 'The relay is broadcasting on an obsolete channel.',
        kind: 'discovery'
      }
    ]
  }
};

const information = buildPlayerFacingInformation({
  campaignState,
  coreProjections: {},
  runtimeView: {}
});

assert.deepEqual(
  information.quests.map(({ id }) => id),
  ['main:ashes', 'assignment:brief', 'side:relay', 'crew:bronn', 'done:survey']
);
assert.equal(information.quests[0].status, 'active');
assert.equal(information.quests.find(({ id }) => id === 'side:relay').urgency.remainingMinutes, 80);
assert.equal(information.quests.find(({ id }) => id === 'assignment:brief').objective, 'Meet Bronn before alpha shift.');
assert.doesNotMatch(JSON.stringify(information.quests), /Audit Sensors/);
assert.deepEqual(information.quests[0].knownFacts.map(({ id }) => id), ['fact:reactor']);
assert.deepEqual(information.quests.find(({ id }) => id === 'side:relay').knownFacts.map(({ id }) => id), ['fact:relay']);
assert.match(JSON.stringify(information), /41 minutes remaining/);
assert.doesNotMatch(JSON.stringify(information), /Private mutiny plan/);
assert.equal(information.crew[0].id, 'crew:bronn');
assert.equal(information.ship.condition, 'Operational');
assert.equal(information.ship.history[0].id, 'damage:reactor');

assert.equal(resolveSelectedQuestId({
  quests: information.quests,
  selectedQuestId: 'side:relay',
  activeMissionId: 'main:ashes'
}), 'side:relay');
assert.equal(resolveSelectedQuestId({
  quests: information.quests,
  selectedQuestId: 'missing',
  activeMissionId: 'main:ashes'
}), 'main:ashes');
assert.equal(resolveSelectedQuestId({
  quests: information.quests.filter(({ id }) => id !== 'main:ashes'),
  selectedQuestId: 'missing',
  activeMissionId: 'main:ashes'
}), 'assignment:brief');
assert.equal(resolveSelectedQuestId({ quests: [], selectedQuestId: 'missing', activeMissionId: 'main:ashes' }), null);

console.log('Player-facing information projection tests passed');
