import assert from 'node:assert/strict';

import { resolvePackageHeroScene } from '../../src/packages/package-hero-scene-resolver.mjs';

const packageData = {
  assets: {
    images: [
      {
        id: 'other.ship',
        kind: 'ship.hero',
        subjectId: 'other-ship',
        layers: {
          background: 'other-background.webp',
          stars: 'other-stars.webp',
          foreground: 'other-ship.webp'
        }
      },
      {
        id: 'breckenridge.ship.primary',
        kind: 'ship.hero',
        subjectId: 'uss-breckenridge',
        layers: {
          background: 'breckenridge-background.webp',
          stars: 'breckenridge-stars.webp',
          foreground: 'breckenridge-ship.webp'
        },
        alt: 'The U.S.S. Breckenridge in flight'
      }
    ]
  }
};

assert.deepEqual(
  resolvePackageHeroScene(packageData, { kind: 'ship.hero', subjectId: 'uss-breckenridge' }),
  {
    type: 'layered-scene',
    source: 'package',
    id: 'breckenridge.ship.primary',
    kind: 'ship.hero',
    subjectId: 'uss-breckenridge',
    alt: 'The U.S.S. Breckenridge in flight',
    layers: {
      background: 'breckenridge-background.webp',
      stars: 'breckenridge-stars.webp',
      foreground: 'breckenridge-ship.webp'
    }
  }
);

assert.equal(
  resolvePackageHeroScene(packageData, { kind: 'ship.hero', subjectId: 'missing-ship' }),
  null,
  'scene lookup must not borrow another subject image'
);
assert.equal(
  resolvePackageHeroScene({ assets: { images: [{
    kind: 'ship.hero', subjectId: 'uss-breckenridge', layers: { background: 'only-one-layer.webp' }
  }] } }, { kind: 'ship.hero', subjectId: 'uss-breckenridge' }),
  null,
  'incomplete scene records must use the existing static fallback'
);

console.log('PASS package hero scene resolver');
