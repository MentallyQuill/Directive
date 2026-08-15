import assert from 'node:assert/strict';
import fs from 'node:fs';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.id = '';
    this.textContent = '';
    this.parentNode = null;
    this.classList = {
      add: (...names) => this.#writeClasses((classes) => names.forEach((name) => classes.add(name))),
      remove: (...names) => this.#writeClasses((classes) => names.forEach((name) => classes.delete(name))),
      contains: (name) => this.#classes().has(name),
      toggle: (name, force) => {
        const classes = this.#classes();
        const enabled = force === undefined ? !classes.has(name) : Boolean(force);
        if (enabled) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(' ');
        return enabled;
      },
    };
  }

  #classes() {
    return new Set(String(this.className || '').split(/\s+/).filter(Boolean));
  }

  #writeClasses(update) {
    const classes = this.#classes();
    update(classes);
    this.className = [...classes].join(' ');
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
  }

  getAttribute(name) {
    if (name === 'id' && this.id) return this.id;
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
  }

  #matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const dataMatch = selector.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/i);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!(key in this.dataset)) return false;
      return dataMatch[2] === undefined || String(this.dataset[key]) === dataMatch[2];
    }
    return false;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.#matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

globalThis.document = {
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: String(text) }),
};

const {
  appendCurrentChatEmptyState,
  CAMPAIGN_GUIDANCE_INSTRUCTION_ID,
} = await import('../../src/ui/current-chat-empty-state.js');

const body = document.createElement('section');
appendCurrentChatEmptyState(body, { currentChat: { status: 'none-selected' } });

assert.equal(body.dataset.campaignRequired, 'true');
assert.equal(body.querySelectorAll('.directive-campaign-required').length, 1);
assert.equal(
  body.querySelector('.directive-campaign-required-eyebrow').textContent,
  'CAMPAIGN CONNECTION REQUIRED',
);
assert.equal(
  body.querySelector(`#${CAMPAIGN_GUIDANCE_INSTRUCTION_ID}`).textContent,
  'Open Campaign below, then choose or load a save to bring this panel online.',
);
const icon = body.querySelector('.directive-campaign-required-icon');
assert.equal(icon.dataset.glyph, 'route-ship');
assert.equal(icon.getAttribute('aria-hidden'), 'true');
assert.match(body.querySelector('.directive-campaign-required-detail').textContent, /Campaign Records/);

const { renderMissionPanel } = await import('../../src/ui/mission-panel.js');
const { renderCrewPanel } = await import('../../src/ui/crew-panel.js');
const { renderShipPanel } = await import('../../src/ui/ship-panel.js');

for (const render of [renderMissionPanel, renderCrewPanel, renderShipPanel]) {
  const routeBody = document.createElement('section');
  render(routeBody, { currentChat: { status: 'none-selected' } });
  assert.equal(routeBody.dataset.campaignRequired, 'true');
  assert.equal(routeBody.querySelectorAll('.directive-campaign-required').length, 1);
  assert.equal(routeBody.querySelectorAll('.directive-runtime-empty').length, 0);
}

const missionSource = fs.readFileSync(new URL('../../src/ui/mission-panel.js', import.meta.url), 'utf8');
assert.match(missionSource, /appendEmpty\(body, 'No current V1 mission is available\.'\)/);

console.log('Campaign-required empty-state renderer and route guards passed.');
