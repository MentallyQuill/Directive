import assert from 'node:assert/strict';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.styleProperties = new Map();
    this.style = {
      setProperty: (name, value) => this.styleProperties.set(String(name), String(value))
    };
    this.classList = {
      add: (...names) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.add(name));
        this.className = [...classes].join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name)
    };
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

globalThis.document = { createElement: (tagName) => new Element(tagName) };

const { createPackageHeroVisual } = await import('../../src/ui/package-hero-scene.js');

const layeredPackage = {
  assets: { images: [{
    id: 'breckenridge.ship.primary',
    kind: 'ship.hero',
    subjectId: 'uss-breckenridge',
    variants: { hero: 'fallback.webp' },
    layers: {
      background: 'background.webp',
      stars: 'stars.webp',
      foreground: 'ship.webp',
      cruise: {
        farStars: 'stars-far.svg',
        nearStars: 'stars-near.svg',
        sunlight: 'sunlight.svg'
      },
      emissive: {
        windows: 'windows.png',
        nacelles: 'nacelles.png',
        windowNoise: 'window-noise.webp'
      }
    },
    alt: 'Breckenridge scene'
  }] }
};

const scene = createPackageHeroVisual(layeredPackage, {
  kind: 'ship.hero', subjectId: 'uss-breckenridge', variant: 'hero'
}, { wrapperClass: 'ship-hero', loading: 'eager' });

assert.equal(scene.classList.contains('directive-hero-scene'), true);
assert.equal(scene.classList.contains('directive-hero-scene-has-cruise'), true);
assert.equal(scene.classList.contains('ship-hero'), true);
assert.equal(scene.dataset.mediaKind, 'ship.hero');
assert.equal(scene.dataset.mediaSubject, 'uss-breckenridge');
assert.equal(scene.getAttribute('role'), 'img');
assert.equal(scene.getAttribute('aria-label'), 'Breckenridge scene');
assert.deepEqual(scene.children.map((node) => node.dataset.heroSceneLayer), [
  'background', 'stars', 'stars-far', 'stars-near', 'foreground', 'sunlight'
]);
assert.equal(scene.children[1].src.endsWith('/stars.webp'), true);
assert.equal(scene.children[2].tagName, 'SPAN');
assert.equal(scene.children[3].tagName, 'SPAN');
assert.match(scene.children[2].styleProperties.get('--directive-hero-star-texture'), /stars-far\.svg/);
assert.match(scene.children[3].styleProperties.get('--directive-hero-star-texture'), /stars-near\.svg/);
assert.equal(scene.children[4].tagName, 'SPAN');
assert.deepEqual(scene.children[4].children.map((node) => node.dataset.heroShipLayer), [
  'base', 'windows', 'nacelles'
]);
assert.equal(scene.children[4].children[0].src.endsWith('/ship.webp'), true);
assert.equal(scene.children[4].children[1].src.endsWith('/windows.png'), true);
assert.equal(scene.children[4].children[2].src.endsWith('/nacelles.png'), true);
assert.match(scene.children[4].styleProperties.get('--directive-hero-window-noise'), /window-noise\.webp/);
assert.equal(scene.children[5].src.endsWith('/sunlight.svg'), true);
assert.equal(scene.children.filter((node) => node.tagName === 'IMG').every((node) => node.alt === ''), true);
assert.equal(scene.children.every((node) => node.getAttribute('aria-hidden') === 'true'), true);
assert.equal(scene.children.filter((node) => node.tagName === 'IMG').every((node) => node.loading === 'eager'), true);

const legacyScene = createPackageHeroVisual({ assets: { images: [{
  id: 'legacy.ship.primary',
  kind: 'ship.hero',
  subjectId: 'legacy-ship',
  variants: { hero: 'legacy-fallback.webp' },
  layers: {
    background: 'legacy-background.webp',
    stars: 'legacy-stars.webp',
    foreground: 'legacy-ship.webp'
  }
}] } }, {
  kind: 'ship.hero', subjectId: 'legacy-ship', variant: 'hero'
}, { wrapperClass: 'ship-hero', loading: 'eager' });
assert.equal(legacyScene.classList.contains('directive-hero-scene-has-cruise'), false);
assert.deepEqual(legacyScene.children.map((node) => node.dataset.heroSceneLayer), [
  'background', 'stars', 'stars-glow', 'foreground'
]);
assert.equal(legacyScene.children[2].src, legacyScene.children[1].src);

const fallback = createPackageHeroVisual({ assets: { images: [{
  kind: 'ship.hero', subjectId: 'uss-breckenridge', variants: { hero: 'fallback.webp' }
}] } }, {
  kind: 'ship.hero', subjectId: 'uss-breckenridge', variant: 'hero'
}, { wrapperClass: 'ship-hero' });
assert.equal(fallback.classList.contains('directive-hero-scene'), false);
assert.equal(fallback.children[0].src.endsWith('/fallback.webp'), true);

console.log('PASS package hero scene renderer');
