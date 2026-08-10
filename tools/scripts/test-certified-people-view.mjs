import assert from 'node:assert/strict';
import { buildCertifiedPeopleView } from '../../src/ui/view-models/certified-people-view.mjs';

const projection = {
  player: {
    kind: 'directive.playerIdentityProjection.v1',
    playerId: 'player.sam',
    name: 'Sam Vickers',
    role: 'Executive Officer',
    dossier: { briefBiography: 'Visible biography.' }
  },
  people: {
    kind: 'directive.peoplePlayerProjection.v1',
    people: [{
      id: 'person.whitaker',
      name: 'Mara Whitaker',
      billet: 'Commanding Officer',
      profileSummary: 'Visible profile.',
      relationshipPosture: 'Watchful',
      moments: []
    }]
  },
  commandBearing: {
    kind: 'directive.commandBearingPlayerProjection.v1',
    balance: 1,
    capacity: 3,
    latestAwardReason: null,
    pendingEdge: null,
    latestSpend: null
  },
  private: { plot: 'must not escape' }
};

const people = buildCertifiedPeopleView(projection);
assert.equal(people.player.id, 'player.sam');
assert.deepEqual(people.people.map(({ id }) => id), ['person.whitaker']);
assert.equal(people.commandBearing.balance, 1);
assert.equal(JSON.stringify(people).includes('must not escape'), false);
projection.people.people[0].name = 'Mutated input';
assert.equal(people.people[0].name, 'Mara Whitaker');

console.log('PASS certified People view');
