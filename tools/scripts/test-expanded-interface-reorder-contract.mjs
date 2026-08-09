import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/ui/expanded-interface-reorder.js', import.meta.url), 'utf8');
assert.match(source, /pointerdown/);
assert.match(source, /pointerType === 'touch'/);
assert.match(source, /longPressMs = 175/);
assert.match(source, /mobile-drag-ghost/);
assert.match(source, /mobile-drag-placeholder/);
assert.match(source, /scrollTop/);
assert.match(source, /ArrowUp/);
assert.match(source, /ArrowDown/);

console.log('Expanded interface reorder controller contract passed');
