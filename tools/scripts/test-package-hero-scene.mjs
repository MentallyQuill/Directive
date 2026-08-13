import assert from 'node:assert/strict';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.style = { setProperty() {} };
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
      foreground: 'ship.webp'
    },
    alt: 'Breckenridge scene'
  }] }
};

const scene = createPackageHeroVisual(layeredPackage, {
  kind: 'ship.hero', subjectId: 'uss-breckenridge', variant: 'hero'
}, { wrapperClass: 'ship-hero', loading: 'eager' });

assert.equal(scene.classList.contains('directive-hero-scene'), true);
assert.equal(scene.classList.contains('ship-hero'), true);
assert.equal(scene.dataset.mediaKind, 'ship.hero');
assert.equal(scene.dataset.mediaSubject, 'uss-breckenridge');
assert.equal(scene.getAttribute('role'), 'img');
assert.equal(scene.getAttribute('aria-label'), 'Breckenridge scene');
assert.deepEqual(scene.children.map((node) => node.dataset.heroSceneLayer), [
  'background', 'stars', 'stars-glow', 'foreground'
]);
assert.equal(scene.children[1].src.endsWith('/stars.webp'), true);
assert.equal(scene.children[2].src, scene.children[1].src);
assert.equal(scene.children.every((node) => node.alt === ''), true);
assert.equal(scene.children.every((node) => node.getAttribute('aria-hidden') === 'true'), true);
assert.equal(scene.children.every((node) => node.loading === 'eager'), true);

const fallback = createPackageHeroVisual({ assets: { images: [{
  kind: 'ship.hero', subjectId: 'uss-breckenridge', variants: { hero: 'fallback.webp' }
}] } }, {
  kind: 'ship.hero', subjectId: 'uss-breckenridge', variant: 'hero'
}, { wrapperClass: 'ship-hero' });
assert.equal(fallback.classList.contains('directive-hero-scene'), false);
assert.equal(fallback.children[0].src.endsWith('/fallback.webp'), true);

console.log('PASS package hero scene renderer');
