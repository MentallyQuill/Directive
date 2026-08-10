import assert from 'node:assert/strict';

import {
  DIRECTIVE_TOUCH_REORDER_DELAY_MS,
  createReorderableCollectionController,
  moveItemInList
} from '../../src/ui/reorderable-collection.js';

assert.equal(DIRECTIVE_TOUCH_REORDER_DELAY_MS, 175);

const original = ['alpha', 'beta', 'gamma'];
assert.deepEqual(moveItemInList(original, 0, 2), ['beta', 'gamma', 'alpha']);
assert.deepEqual(original, ['alpha', 'beta', 'gamma'], 'reordering must not mutate its input');

const changes = [];
const controller = createReorderableCollectionController({
  categories: [
    { id: 'command', recordIds: ['janeway', 'chakotay'] },
    { id: 'science', recordIds: ['tuvok'] }
  ],
  onChange: (next, detail) => changes.push({ next, detail })
});

controller.moveRecord({ recordId: 'chakotay', toCategoryId: 'science', toIndex: 1 });
assert.deepEqual(controller.snapshot(), [
  { id: 'command', recordIds: ['janeway'] },
  { id: 'science', recordIds: ['tuvok', 'chakotay'] }
]);
assert.equal(changes[0].detail.kind, 'record');

controller.moveRecordByKeyboard({ recordId: 'chakotay', direction: 'up' });
assert.deepEqual(controller.snapshot()[1].recordIds, ['chakotay', 'tuvok']);

controller.moveCategory({ categoryId: 'science', toIndex: 0 });
assert.deepEqual(controller.snapshot().map((item) => item.id), ['science', 'command']);

console.log('Reorderable collection tests passed.');
