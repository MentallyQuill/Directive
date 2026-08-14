import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePackageImage } from '../../src/packages/package-image-resolver.mjs';

const resolved = resolvePackageImage({
  assets: {
    images: [{
      id: 'ship.cohesion',
      kind: 'ship.cohesion',
      subjectId: 'ship.1',
      variants: { hero: 'ship.png' },
      visualAnchors: {
        bridge: { x: 0.62, y: 0.34 },
        offCanvas: { x: 2, y: 0.5 },
        notFinite: { x: Number.NaN, y: 0.2 },
        '': { x: 0.4, y: 0.4 },
      },
    }],
  },
}, { kind: 'ship.cohesion', subjectId: 'ship.1', variant: 'hero' });

assert.deepEqual(resolved.visualAnchors, { bridge: { x: 0.62, y: 0.34 } });
assert.equal(Object.isFrozen(resolved.visualAnchors), true);
assert.equal(Object.isFrozen(resolved.visualAnchors.bridge), true);

const placeholder = resolvePackageImage({}, {
  kind: 'ship.cohesion',
  subjectId: 'missing-ship',
  variant: 'hero',
});
assert.deepEqual(placeholder.visualAnchors, {});
assert.equal(Object.isFrozen(placeholder.visualAnchors), true);

const packageData = JSON.parse(readFileSync(
  new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json', import.meta.url),
  'utf8',
));
const breckenridge = resolvePackageImage(packageData, {
  kind: 'ship.cohesion',
  subjectId: 'uss-breckenridge',
  variant: 'hero',
});
assert.deepEqual(Object.keys(breckenridge.visualAnchors).sort(), [
  'aft-hull',
  'bridge',
  'central-saucer',
  'crew-habitat',
  'engineering',
  'forward-sensors',
  'port-nacelle',
  'shuttlebay',
  'sickbay',
  'starboard-nacelle',
]);

console.log('Package image visual anchors passed.');
