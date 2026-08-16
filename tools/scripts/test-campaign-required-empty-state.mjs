import assert from 'node:assert/strict';
import fs from 'node:fs';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
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

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  click() {
    return this.listeners.get('click')?.({
      target: this,
      currentTarget: this,
      preventDefault() {},
      stopPropagation() {},
    });
  }

  focus() {
    this.focused = true;
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
  syncCampaignRequiredGuidance,
} = await import('../../src/ui/current-chat-empty-state.js');

const body = document.createElement('section');
appendCurrentChatEmptyState(body, { currentChat: { status: 'none-selected' } });

assert.equal(body.dataset.campaignRequired, 'true');
assert.equal(body.querySelectorAll('.directive-campaign-required').length, 1);
const lcarsRails = body.querySelectorAll('.directive-campaign-required-rail');
assert.equal(lcarsRails.length, 2);
assert.ok(lcarsRails.every((rail) => rail.getAttribute('aria-hidden') === 'true'));
const lcarsSegments = body.querySelectorAll('.directive-campaign-required-segment');
assert.equal(lcarsSegments.length, 6);
assert.deepEqual(
  lcarsSegments.map((segment) => segment.dataset.tone),
  ['amber', 'lilac', 'blue', 'violet', 'salmon', 'amber'],
);
const lcarsCore = body.querySelector('.directive-campaign-required-core');
assert.equal(lcarsCore.children[0].classList.contains('directive-campaign-required-icon-pod'), true);
assert.equal(lcarsCore.children[1].classList.contains('directive-campaign-required-copy'), true);
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

const { createDirectiveExpandedShell } = await import('../../src/ui/directive-expanded-shell.js');
const shell = createDirectiveExpandedShell({
  routes: ['campaign', 'mission', 'people', 'ship', 'settings'].map((id) => ({ id, label: id })),
  activeRouteId: 'ship',
});
const shellBody = shell.querySelector('[data-directive-runtime-body="true"]');
appendCurrentChatEmptyState(shellBody, { currentChat: { status: 'none-selected' } });
assert.equal(syncCampaignRequiredGuidance(shell, shellBody), true);
assert.equal(shell.getAttribute('data-campaign-guidance'), 'true');
const campaign = shell.querySelector('[data-route-id="campaign"]');
assert.equal(campaign.classList.contains('is-campaign-guidance-target'), true);
assert.equal(campaign.getAttribute('aria-describedby'), CAMPAIGN_GUIDANCE_INSTRUCTION_ID);

delete shellBody.dataset.campaignRequired;
assert.equal(syncCampaignRequiredGuidance(shell, shellBody), false);
assert.equal(shell.getAttribute('data-campaign-guidance'), 'false');
assert.equal(campaign.classList.contains('is-campaign-guidance-target'), false);
assert.equal(campaign.getAttribute('aria-describedby'), null);

const css = fs.readFileSync(new URL('../../styles/directive.css', import.meta.url), 'utf8');
assert.match(css, /@keyframes\s+directive-campaign-guidance-pulse/);
assert.match(
  css,
  /\.directive-route-control\.is-campaign-guidance-target:not\(\.active\)[\s\S]*?animation:\s*directive-campaign-guidance-pulse\s+2\.4s\s+linear\s+infinite/,
);
assert.match(
  css,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.directive-route-control\.is-campaign-guidance-target:not\(\.active\)[\s\S]*?animation:\s*none/,
);
const pulseKeyframes = css.match(/@keyframes\s+directive-campaign-guidance-pulse[\s\S]*?\n\}/)?.[0] || '';
assert.doesNotMatch(pulseKeyframes, /transform:/);
assert.match(pulseKeyframes, /8\.333%\s*,\s*50%/);
assert.match(pulseKeyframes, /58\.333%\s*,\s*100%/);
assert.doesNotMatch(pulseKeyframes, /inset\s+0\s+0\s+0\s+1px/);

const runtimeSource = fs.readFileSync(new URL('../../src/runtime/runtime-shell.js', import.meta.url), 'utf8');
assert.match(runtimeSource, /delete\s+body\.dataset\.campaignRequired/);
assert.ok(
  [...runtimeSource.matchAll(/syncCampaignRequiredGuidance\(panel, body\)/g)].length >= 3,
  'runtime shell must clear, apply, and error-clean campaign guidance state',
);

console.log('Campaign-required empty-state renderer, route guards, and shell guidance passed.');
