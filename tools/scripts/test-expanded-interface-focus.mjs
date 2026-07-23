import assert from 'node:assert/strict';

import { nextRovingFocusIndex } from '../../src/ui/expanded-interface-focus.js';

assert.equal(nextRovingFocusIndex({ currentIndex: 0, itemCount: 5, key: 'ArrowRight' }), 1);
assert.equal(nextRovingFocusIndex({ currentIndex: 4, itemCount: 5, key: 'ArrowRight' }), 0);
assert.equal(nextRovingFocusIndex({ currentIndex: 0, itemCount: 5, key: 'ArrowLeft' }), 4);
assert.equal(nextRovingFocusIndex({ currentIndex: 2, itemCount: 5, key: 'Home' }), 0);
assert.equal(nextRovingFocusIndex({ currentIndex: 2, itemCount: 5, key: 'End' }), 4);
assert.equal(nextRovingFocusIndex({ currentIndex: 2, itemCount: 5, key: 'Enter' }), 2);
assert.equal(nextRovingFocusIndex({ currentIndex: 0, itemCount: 0, key: 'ArrowRight' }), -1);

console.log('Expanded interface focus tests passed.');
