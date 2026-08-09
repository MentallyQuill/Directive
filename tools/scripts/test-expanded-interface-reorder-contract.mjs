import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/ui/expanded-interface-reorder.js', import.meta.url), 'utf8');
assert.match(source, /pointerdown/);
assert.match(source, /lostpointercapture/);
assert.match(source, /addEventListener\?\.\('blur'/);
assert.match(source, /boxSizing/);
assert.match(source, /marginTop/);
assert.match(source, /marginBottom/);
assert.match(source, /\['touch', 'pen'\]\.includes\(state\.pointerType\)/);
assert.match(source, /longPressMs = 175/);
assert.match(source, /mobile-drag-ghost/);
assert.match(source, /mobile-drag-placeholder/);
assert.match(source, /previewSelector/);
assert.match(source, /handleCenterX/);
assert.match(source, /handleCenterY/);
assert.match(source, /event\.clientX - state\.handleCenterX/);
assert.match(source, /event\.clientY - state\.handleCenterY/);
assert.match(source, /scrollTop/);
assert.match(source, /ArrowUp/);
assert.match(source, /ArrowDown/);

console.log('Expanded interface reorder controller contract passed');
