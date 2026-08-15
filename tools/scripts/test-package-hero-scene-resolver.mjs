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
          foreground: 'breckenridge-ship.webp',
          cruise: {
            farStars: 'breckenridge-stars-far.svg',
            nearStars: 'breckenridge-stars-near.svg',
            sunlight: 'breckenridge-sunlight.svg'
          },
          emissive: {
            windows: 'breckenridge-windows.png',
            nacelles: 'breckenridge-nacelles.png',
            windowNoise: 'breckenridge-window-noise.webp'
          }
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
    },
    cruise: {
      farStars: 'breckenridge-stars-far.svg',
      nearStars: 'breckenridge-stars-near.svg',
      sunlight: 'breckenridge-sunlight.svg'
    },
    emissive: {
      windows: 'breckenridge-windows.png',
      nacelles: 'breckenridge-nacelles.png',
      windowNoise: 'breckenridge-window-noise.webp'
    }
  }
);

const partialCruiseScene = resolvePackageHeroScene({ assets: { images: [{
  kind: 'ship.hero',
  subjectId: 'uss-breckenridge',
  layers: {
    background: 'background.webp',
    stars: 'stars.webp',
    foreground: 'foreground.webp',
    cruise: { farStars: 'far-stars.svg' }
  }
}] } }, { kind: 'ship.hero', subjectId: 'uss-breckenridge' });
assert.equal(
  Object.hasOwn(partialCruiseScene, 'cruise'),
  false,
  'partial cruise records must preserve the base scene without partial effects'
);

const partialEmissiveScene = resolvePackageHeroScene({ assets: { images: [{
  kind: 'ship.hero',
  subjectId: 'uss-breckenridge',
  layers: {
    background: 'background.webp',
    stars: 'stars.webp',
    foreground: 'foreground.webp',
    emissive: { windows: 'windows.png', nacelles: 'nacelles.png' }
  }
}] } }, { kind: 'ship.hero', subjectId: 'uss-breckenridge' });
assert.equal(
  Object.hasOwn(partialEmissiveScene, 'emissive'),
  false,
  'partial emissive records must preserve the base ship without partial illumination'
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
