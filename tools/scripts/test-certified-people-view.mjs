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

const packageData = { assets: { images: [{
  id: 'crew.whitaker', kind: 'crew.portrait.formal', subjectId: 'person.whitaker',
  variants: { thumb: 'whitaker-thumb.webp', detail: 'whitaker-detail.webp' }
}] } };
const people = buildCertifiedPeopleView(projection, {
  campaignState: { campaign: { id: 'campaign.ashes' } },
  activeSaveId: 'save.current',
  currentChatActivePackage: packageData
});
assert.equal(people.player.id, 'player.sam');
assert.deepEqual(people.people.map(({ id }) => id), ['person.whitaker']);
assert.equal(people.scopeKey, 'campaign.ashes:save.current');
assert.equal(people.packageData, packageData);
assert.deepEqual(people.records.map(({ id, isPlayer }) => ({ id, isPlayer })), [
  { id: 'player.sam', isPlayer: true },
  { id: 'person.whitaker', isPlayer: false }
]);
assert.equal(people.commandBearing.balance, 1);
assert.equal(JSON.stringify(people).includes('must not escape'), false);
projection.people.people[0].name = 'Mutated input';
assert.equal(people.people[0].name, 'Mara Whitaker');
assert.equal(people.records[1].name, 'Mara Whitaker');

console.log('PASS certified People view');
