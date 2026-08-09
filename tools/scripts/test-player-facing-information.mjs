import assert from 'node:assert/strict';

import {
  buildPlayerFacingInformation,
  resolveSelectedQuestId
} from '../../src/ui/player-facing-information.mjs';
import { resolveMissionDisplayIdentity } from '../../src/ui/mission-display-identity.mjs';

assert.deepEqual(
  resolveMissionDisplayIdentity({ missionId: 'prelude-a-ship-underway', explicitTitle: 'A Ship Underway' }),
  { id: 'prelude-a-ship-underway', title: 'A Ship Underway', category: 'main' },
  'mission display identity should stay structured and presentation-free'
);

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

const authoredMissionInformation = buildPlayerFacingInformation({
  campaignState: {
    mission: {
      activeMissionId: 'prelude-a-ship-underway',
      title: 'prelude-a-ship-underway',
      status: 'active'
    },
    questLedger: {
      instances: [{
        id: 'prelude-a-ship-underway',
        title: 'A Ship Underway',
        status: 'active'
      }]
    }
  }
});

assert.equal(
  authoredMissionInformation.quests[0].title,
  'A Ship Underway',
  'the main quest should use its authored quest-ledger title instead of its runtime ID'
);

const graphAuthoredMissionInformation = buildPlayerFacingInformation({
  campaignState: {
    mission: { activeMissionId: 'prelude-a-ship-underway', title: 'prelude-a-ship-underway', status: 'active' }
  },
  runtimeView: {
    missionGraphs: [{
      manifest: {
        id: 'breckenridge.ashes-of-peace.prelude-a-ship-underway',
        missionId: 'prelude-a-ship-underway',
        title: 'A Ship Underway'
      }
    }]
  }
});
assert.equal(
  graphAuthoredMissionInformation.quests[0].title,
  'A Ship Underway',
  'the main quest should resolve a real mission graph by manifest missionId before graph id'
);

const mergedPeopleInformation = buildPlayerFacingInformation({
  campaignState: {
    crew: {
      roster: [{
        id: 'mara-whitaker',
        assignment: 'Command handover',
        relationshipSummary: 'Professional and evaluating.'
      }]
    },
    narrativeThreads: {
      records: [
        { id: 'history:arrival', characterId: 'mara-whitaker', visibility: 'player', summary: 'Received the incoming executive officer.' },
        { id: 'history:hidden', characterId: 'mara-whitaker', visibility: 'hidden', summary: 'Private command concern.' }
      ]
    }
  },
  coreProjections: {
    crewDataset: {
      officers: [{ id: 'mara-whitaker', name: 'Mara Whitaker', billet: 'Commanding Officer' }]
    },
    packageData: {
      crew: {
        senior: [{
          id: 'mara-whitaker',
          affiliation: 'Starfleet',
          service: { organization: 'starfleet', department: 'command', rankCode: 'captain', rankLabel: 'Captain' },
          knownFacts: ['Retains final legal command.'],
          involvement: { quest: 'A Ship Underway', objective: 'Complete the command handover.' }
        }]
      }
    }
  }
});

const mergedMara = mergedPeopleInformation.crew.find((person) => person.id === 'mara-whitaker');
assert.equal(mergedMara.name, 'Mara Whitaker');
assert.equal(mergedMara.role, 'Commanding Officer');
assert.equal(mergedMara.affiliation, 'Starfleet');
assert.equal(mergedMara.service.rankCode, 'captain');
assert.deepEqual(mergedMara.knownFacts, ['Retains final legal command.']);
assert.equal(mergedMara.relationship, 'Professional and evaluating.');
assert.equal(mergedMara.involvement.quest, 'A Ship Underway');
assert.deepEqual(mergedMara.history.map((entry) => entry.id), ['history:arrival']);
assert.doesNotMatch(JSON.stringify(mergedMara), /Private command concern/);

const privatePersonInformation = buildPlayerFacingInformation({
  coreProjections: {
    packageData: {
      crew: {
        senior: [{
          id: 'director-only-contact',
          name: 'Director Only Contact',
          visibility: 'directorOnly',
          knownFacts: ['Secret identity'],
          relationshipSummary: 'Private motive'
        }]
      }
    }
  }
});
assert.equal(
  privatePersonInformation.crew.some((person) => person.id === 'director-only-contact'),
  false,
  'People projection must exclude person sources that are not explicitly player-safe'
);
assert.doesNotMatch(JSON.stringify(privatePersonInformation), /Secret identity|Private motive/);

const privateQuestInformation = buildPlayerFacingInformation({
  campaignState: {
    openWorld: {
      quests: [
        { id: 'visible-q', title: 'Visible Quest', description: 'Known work' },
        { id: 'hidden-q', title: 'Secret Quest', visibility: 'hidden', description: 'Director secret' }
      ]
    },
    questLedger: {
      records: [{ id: 'director-q', title: 'Director Quest', visibility: 'directorOnly', description: 'Private route' }]
    }
  }
});
assert.deepEqual(privateQuestInformation.quests.map((quest) => quest.id), ['visible-q']);
assert.doesNotMatch(JSON.stringify(privateQuestInformation), /Secret Quest|Director Quest|Director secret|Private route/);
assert.equal(privateQuestInformation.quests[0].urgency, null, 'missing urgency must not become a bogus zero-minute countdown');

const playerPersonInformation = buildPlayerFacingInformation({
  campaignState: {
    player: { id: 'player-commander', name: 'Sam Vickers' }
  }
});
assert.equal(
  playerPersonInformation.crew.find((person) => person.id === 'player-commander').isPlayer,
  true,
  'the player-facing People record should be explicitly identifiable for portrait management'
);

console.log('Player-facing information projection tests passed');
