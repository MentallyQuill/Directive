import assert from 'node:assert/strict';

import {
  PEOPLE_PREFERENCES_STORAGE_PREFIX,
  createPeopleCollectionPreferences
} from '../../src/ui/people-collection-preferences.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const records = [
  { id: 'player.sam', name: 'Sam Vickers', categoryId: 'ships-company' },
  { id: 'mara-whitaker', name: 'Mara Whitaker', categoryId: 'ships-company' },
  { id: 'envoy-tarel', name: 'Envoy Tarel', categoryId: 'allies-contacts' }
];

const storage = new MemoryStorage();
const controller = createPeopleCollectionPreferences({
  scopeKey: 'campaign.ashes:save.current',
  records,
  storage
});

assert.deepEqual(controller.snapshot(), {
  selectedPersonId: 'player.sam',
  collapsedCategoryIds: [],
  categories: [
    { id: 'ships-company', label: "Ship's Company", system: true, recordIds: ['player.sam', 'mara-whitaker'] },
    { id: 'allies-contacts', label: 'Allies and Contacts', system: true, recordIds: ['envoy-tarel'] }
  ]
});

controller.addCategory('Bridge Team');
let snapshot = controller.snapshot();
const bridge = snapshot.categories.find(({ label }) => label === 'Bridge Team');
assert.equal(bridge.system, false);
controller.moveRecord('player.sam', bridge.id, 0);
assert.deepEqual(controller.snapshot().categories.find(({ id }) => id === bridge.id).recordIds, ['player.sam']);
assert.deepEqual(controller.snapshot().categories.find(({ id }) => id === 'ships-company').recordIds, ['mara-whitaker']);

controller.renameCategory(bridge.id, 'Command Circle');
assert.equal(controller.snapshot().categories.find(({ id }) => id === bridge.id).label, 'Command Circle');
controller.moveCategory(bridge.id, 0);
assert.equal(controller.snapshot().categories[0].id, bridge.id);
controller.toggleCategory(bridge.id);
assert.deepEqual(controller.snapshot().collapsedCategoryIds, [bridge.id]);
controller.select('mara-whitaker');
assert.equal(controller.snapshot().selectedPersonId, 'mara-whitaker');

const restored = createPeopleCollectionPreferences({
  scopeKey: 'campaign.ashes:save.current',
  records,
  storage
});
assert.deepEqual(restored.snapshot(), controller.snapshot());

restored.removeCategory(bridge.id);
snapshot = restored.snapshot();
assert.equal(snapshot.categories.some(({ id }) => id === bridge.id), false);
assert.deepEqual(snapshot.categories.find(({ id }) => id === 'unknown-unsorted').recordIds, ['player.sam']);
const beforeSystemRemove = restored.snapshot();
restored.removeCategory('ships-company');
assert.deepEqual(restored.snapshot(), beforeSystemRemove);

const reconciled = createPeopleCollectionPreferences({
  scopeKey: 'campaign.ashes:save.current',
  records: [
    records[0],
    records[2],
    { id: 'new-contact', name: 'New Contact', categoryId: 'local-authorities' }
  ],
  storage
});
snapshot = reconciled.snapshot();
assert.equal(snapshot.categories.flatMap(({ recordIds }) => recordIds).includes('mara-whitaker'), false);
assert.deepEqual(snapshot.categories.find(({ id }) => id === 'local-authorities').recordIds, ['new-contact']);
assert.equal(snapshot.selectedPersonId, 'envoy-tarel');

const otherScope = createPeopleCollectionPreferences({
  scopeKey: 'campaign.other:save.current',
  records,
  storage
});
assert.equal(otherScope.snapshot().categories.some(({ label }) => label === 'Command Circle'), false);
assert.equal(storage.values.has(`${PEOPLE_PREFERENCES_STORAGE_PREFIX}${encodeURIComponent('campaign.ashes:save.current')}`), true);

storage.setItem(`${PEOPLE_PREFERENCES_STORAGE_PREFIX}${encodeURIComponent('malformed')}`, '{broken');
const malformed = createPeopleCollectionPreferences({ scopeKey: 'malformed', records, storage });
assert.deepEqual(malformed.snapshot().categories[0].recordIds, ['player.sam', 'mara-whitaker']);

const duplicateStorage = new MemoryStorage();
duplicateStorage.setItem(`${PEOPLE_PREFERENCES_STORAGE_PREFIX}${encodeURIComponent('duplicate')}`, JSON.stringify({
  selectedPersonId: 'missing',
  collapsedCategoryIds: ['ships-company', 'ships-company', 'missing'],
  categories: [
    { id: 'ships-company', label: 'Wrong label', system: false, recordIds: ['player.sam', 'player.sam', 'missing'] },
    { id: 'ships-company', label: 'Duplicate', system: false, recordIds: ['mara-whitaker'] }
  ]
}));
const normalized = createPeopleCollectionPreferences({ scopeKey: 'duplicate', records, storage: duplicateStorage }).snapshot();
assert.equal(normalized.categories.filter(({ id }) => id === 'ships-company').length, 1);
assert.equal(normalized.categories.find(({ id }) => id === 'ships-company').system, true);
assert.equal(normalized.categories.find(({ id }) => id === 'ships-company').label, "Ship's Company");
assert.deepEqual(normalized.categories.flatMap(({ recordIds }) => recordIds).sort(), records.map(({ id }) => id).sort());
assert.equal(normalized.selectedPersonId, 'player.sam');
assert.deepEqual(normalized.collapsedCategoryIds, ['ships-company']);

const throwingStorage = {
  getItem() { throw new Error('read denied'); },
  setItem() { throw new Error('write denied'); }
};
const resilient = createPeopleCollectionPreferences({ scopeKey: 'throwing', records, storage: throwingStorage });
resilient.addCategory('Still Works');
resilient.moveRecord('player.sam', resilient.snapshot().categories.find(({ label }) => label === 'Still Works').id, 0);
assert.equal(resilient.snapshot().categories.some(({ label, recordIds }) => label === 'Still Works' && recordIds[0] === 'player.sam'), true);

console.log('PASS People collection preferences');
