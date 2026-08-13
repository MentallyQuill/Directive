import assert from 'node:assert/strict';

function selectorClasses(selector) {
  return String(selector || '')
    .split('.')
    .slice(1)
    .filter(Boolean);
}

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.type = '';
    this.classList = {
      add: (...names) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.add(name));
        this.className = [...classes].join(' ');
      },
      remove: (...names) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.delete(name));
        this.className = [...classes].join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.contains(name) : Boolean(force);
        if (enabled) this.classList.add(name);
        else this.classList.remove(name);
        return enabled;
      }
    };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  click() {
    const event = { target: this, currentTarget: this };
    for (const handler of this.listeners.get('click') || []) handler(event);
  }

  matches(selector) {
    return selectorClasses(selector).every((name) => this.classList.contains(name));
  }

  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (child.matches(selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  contains(candidate) {
    if (candidate === this) return true;
    return this.children.some((child) => child.contains(candidate));
  }
}

const documentListeners = new Map();
const testDocument = {
  body: null,
  createElement: (tagName) => new Element(tagName, testDocument),
  addEventListener(type, handler) {
    const handlers = documentListeners.get(type) || [];
    handlers.push(handler);
    documentListeners.set(type, handlers);
  },
  dispatch(type, event) {
    for (const handler of documentListeners.get(type) || []) handler(event);
  },
  listenerCount(type) {
    return (documentListeners.get(type) || []).length;
  },
  querySelectorAll(selector) {
    const matches = testDocument.body.matches(selector) ? [testDocument.body] : [];
    return [...matches, ...testDocument.body.querySelectorAll(selector)];
  }
};
testDocument.body = new Element('body', testDocument);
globalThis.document = testDocument;

const { bindResponsiveHero } = await import('../../src/ui/responsive-hero.js');

function createHero(label) {
  const hero = new Element('section', testDocument);
  const secondary = new Element('p', testDocument);
  hero.appendChild(secondary);
  testDocument.body.appendChild(hero);
  bindResponsiveHero(hero, { label, secondary: [secondary] });
  return { hero, secondary, control: hero.querySelector('.directive-responsive-hero-toggle') };
}

const ship = createHero('Ship');

assert.equal(ship.hero.classList.contains('directive-responsive-hero'), true);
assert.equal(ship.hero.classList.contains('is-expanded'), false);
assert.equal(ship.control.type, 'button');
assert.equal(ship.control.getAttribute('aria-expanded'), 'false');
assert.equal(ship.control.getAttribute('aria-label'), 'Expand Ship image');
assert.equal(ship.secondary.classList.contains('directive-responsive-hero-secondary'), true);

ship.control.click();
assert.equal(ship.hero.classList.contains('is-expanded'), true);
assert.equal(ship.control.getAttribute('aria-expanded'), 'true');
assert.equal(ship.control.getAttribute('aria-label'), 'Collapse Ship image');

ship.control.click();
assert.equal(ship.hero.classList.contains('is-expanded'), false);
assert.equal(ship.control.getAttribute('aria-expanded'), 'false');

ship.control.click();
testDocument.dispatch('pointerdown', { target: testDocument.body });
assert.equal(ship.hero.classList.contains('is-expanded'), true, 'outside taps must leave the banner unchanged');
assert.equal(ship.control.getAttribute('aria-label'), 'Collapse Ship image');

const campaign = createHero('Campaign');
assert.equal(campaign.hero.classList.contains('is-expanded'), false, 'a newly rendered hero must start compact');
assert.equal(testDocument.listenerCount('pointerdown'), 0, 'responsive heroes must not install outside-tap delegation');

campaign.control.click();
testDocument.dispatch('pointerdown', { target: ship.hero });
assert.equal(ship.hero.classList.contains('is-expanded'), true, 'inside taps must preserve their hero');
assert.equal(campaign.hero.classList.contains('is-expanded'), true, 'a tap outside another hero must leave it unchanged');

ship.control.click();
campaign.control.click();
assert.equal(ship.hero.classList.contains('is-expanded'), false);
assert.equal(campaign.hero.classList.contains('is-expanded'), false);

assert.equal(documentListeners.has('keydown'), false, 'responsive heroes must not consume Escape or other keys');

console.log('PASS responsive hero interaction');
