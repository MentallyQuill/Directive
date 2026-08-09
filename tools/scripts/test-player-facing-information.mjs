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
    description: 'Join the Breckenridge and establish a working command relationship.',
    currentObjective: 'Secure the Hesperus.',
    formalObjectives: [
      { id: 'task:aboard', text: 'Transfer aboard', status: 'completed' },
      { id: 'task:handover', text: 'Complete the ready-room handover', status: 'current' }
    ],
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
    roster: [{
      id: 'crew:bronn', name: 'Bronn', role: 'Chief Engineer', standing: 'Wary', availability: 'Available',
      category: "Ship's Company", affiliation: 'Starfleet', portrait: { path: 'assets/bronn.webp' },
      service: { organization: 'starfleet', department: 'engineering', rankCode: 'lieutenant_commander', rankLabel: 'Lieutenant Commander' },
      knownFacts: ['Owns the stabilization plan.'], relationshipSummary: 'Professional and direct.'
    }]
  },
  ship: {
    id: 'ship:breckenridge',
    name: 'U.S.S. Breckenridge',
    class: 'Intrepid-class',
    registry: 'NCC-74638',
    condition: 'Operational',
    position: 'Transfer waypoint',
    course: 'Asterion Reach',
    flightStatus: 'Impulse / Station-keeping',
    restrictions: [],
    damage: [{ id: 'damage:reactor', label: 'Reactor degradation', playerSummary: 'High-load operation remains restricted.', status: 'active', severity: 'moderate', department: 'Engineering' }],
    capabilities: [{ id: 'sensor', label: 'Long-range sensor processing', playerSummary: 'Upgraded extended-range detection.', status: 'available' }]
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
assert.equal(information.quests[0].description, 'Join the Breckenridge and establish a working command relationship.');
assert.deepEqual(information.quests[0].tasks, [
  { id: 'task:aboard', text: 'Transfer aboard', status: 'completed' },
  { id: 'task:handover', text: 'Complete the ready-room handover', status: 'current' }
]);
assert.equal(information.quests.find(({ id }) => id === 'side:relay').urgency.remainingMinutes, 80);
assert.equal(information.quests.find(({ id }) => id === 'assignment:brief').objective, 'Meet Bronn before alpha shift.');
assert.doesNotMatch(JSON.stringify(information.quests), /Audit Sensors/);
assert.deepEqual(information.quests[0].knownFacts.map(({ id }) => id), ['fact:reactor']);
assert.deepEqual(information.quests.find(({ id }) => id === 'side:relay').knownFacts.map(({ id }) => id), ['fact:relay']);
assert.match(JSON.stringify(information), /41 minutes remaining/);
assert.doesNotMatch(JSON.stringify(information), /Private mutiny plan/);
assert.equal(information.crew[0].id, 'crew:bronn');
assert.equal(information.crew[0].category, "Ship's Company");
assert.equal(information.crew[0].affiliation, 'Starfleet');
assert.deepEqual(information.crew[0].service, { organization: 'starfleet', department: 'engineering', rankCode: 'lieutenant_commander', rankLabel: 'Lieutenant Commander' });
assert.deepEqual(information.crew[0].knownFacts, ['Owns the stabilization plan.']);
assert.equal(information.crew[0].relationship, 'Professional and direct.');
assert.equal(information.ship.condition, 'Operational');
assert.equal(information.ship.className, 'Intrepid-class');
assert.equal(information.ship.registry, 'NCC-74638');
assert.equal(information.ship.position, 'Transfer waypoint');
assert.equal(information.ship.issues[0].effect, 'High-load operation remains restricted.');
assert.equal(information.ship.capabilities[0].description, 'Upgraded extended-range detection.');
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
