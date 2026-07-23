import assert from 'node:assert/strict';

import { createResponsiveRecordState } from '../../src/ui/responsive-record-list.js';

const changes = [];
const state = createResponsiveRecordState({
  recordIds: ['one', 'two', 'three'],
  selectedRecordId: 'one',
  onChange: (snapshot) => changes.push(snapshot)
});

assert.deepEqual(state.snapshot(), { selectedRecordId: 'one', openRecordId: null });
state.toggle('two');
assert.deepEqual(state.snapshot(), { selectedRecordId: 'two', openRecordId: 'two' });
state.toggle('three');
assert.deepEqual(state.snapshot(), { selectedRecordId: 'three', openRecordId: 'three' });
state.toggle('three');
assert.deepEqual(state.snapshot(), { selectedRecordId: 'three', openRecordId: null });
state.select('missing');
assert.deepEqual(state.snapshot(), { selectedRecordId: 'three', openRecordId: null });
assert.equal(changes.length, 3);

console.log('Responsive record list tests passed.');
