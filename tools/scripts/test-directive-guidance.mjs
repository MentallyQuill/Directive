import assert from 'node:assert/strict';

import {
  DIRECTIVE_GUIDANCE_STORAGE_KEYS,
  __directiveGuidanceTestHooks,
  getDirectiveGuidancePreferences,
  resetDirectiveGuidanceProgress,
  runDirectiveGuidanceStartupOffer,
  setDirectiveGuidancePreference,
  showDirectiveGuidanceTip,
  showDirectiveGuidanceTutorial
} from '../../src/guidance/directive-guidance.js';
import { DIRECTIVE_TIPS } from '../../src/guidance/directive-guidance-content.mjs';

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  sync(value) {
    this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  write() {
    this.element._className = [...this.values].join(' ');
  }

  add(...tokens) {
    for (const token of tokens.filter(Boolean)) this.values.add(token);
    this.write();
  }

  remove(...tokens) {
    for (const token of tokens.filter(Boolean)) this.values.delete(token);
    this.write();
  }

  contains(token) {
    return this.values.has(token);
  }

  toggle(token, force) {
    const next = force === undefined ? !this.values.has(token) : Boolean(force);
    if (next) this.values.add(token);
    else this.values.delete(token);
    this.write();
    return next;
  }
}

function dataKey(name) {
  return String(name || '').slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || '').toLowerCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.style = {};
    this._id = '';
    this._className = '';
    this.classList = new FakeClassList(this);
    this.dataset = new Proxy({}, {
      set: (target, key, value) => {
        target[key] = String(value);
        return true;
      }
    });
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value || '');
    if (this._id) this.ownerDocument.elementsById.set(this._id, this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
    this.classList.sync(this._className);
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'id') this.id = normalized;
    if (name === 'class') this.className = normalized;
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = normalized;
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) delete this.dataset[dataKey(name)];
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    if (node.id) this.ownerDocument.elementsById.set(node.id, node);
    return node;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
    if (this.id) this.ownerDocument.elementsById.delete(this.id);
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(type, handler) {
    if (!this.eventListeners.has(type)) this.eventListeners.set(type, []);
    this.eventListeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const handlers = this.eventListeners.get(type) || [];
    this.eventListeners.set(type, handlers.filter((item) => item !== handler));
  }

  async click() {
    if (this.disabled) return undefined;
    for (const handler of this.eventListeners.get('click') || []) {
      await handler({
        type: 'click',
        target: this,
        currentTarget: this,
        preventDefault() {},
        stopPropagation() {}
      });
    }
    return undefined;
  }

  focus() {
    this.focused = true;
  }

  scrollIntoView(options) {
    this.scrollOptions = options || true;
  }

  getBoundingClientRect() {
    return this.rect || { left: 120, top: 110, right: 220, bottom: 150, width: 100, height: 40 };
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return this.ownerDocument.querySelectorAllWithin(this, selector);
  }

  closest(selector) {
    let cursor = this;
    while (cursor) {
      if (this.ownerDocument.matchesSelector(cursor, selector)) return cursor;
      cursor = cursor.parentNode;
    }
    return null;
  }
}

class FakeDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new FakeElement('body', this);
    this.documentElement = new FakeElement('html', this);
    this.listeners = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(type, handlers.filter((item) => item !== handler));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return this.querySelectorAllWithin(this.body, selector);
  }

  querySelectorAllWithin(root, selector) {
    const selectors = String(selector || '').split(',').map((item) => item.trim()).filter(Boolean);
    const matches = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (selectors.some((item) => this.matchesSelector(child, item))) matches.push(child);
        visit(child);
      }
    };
    visit(root);
    return matches;
  }

  matchesSelector(element, selector) {
    if (!element || !selector) return false;
    const notSelector = selector.match(/^\[([^\]=]+)=["']?([^"'\]]+)["']?\]$/);
    if (notSelector) {
      const [, name, value] = notSelector;
      const key = name.startsWith('data-') ? dataKey(name) : '';
      return key ? element.dataset[key] === value : element.getAttribute(name) === value;
    }
    const hasAttr = selector.match(/^\[([^\]]+)\]$/);
    if (hasAttr) {
      const name = hasAttr[1];
      const key = name.startsWith('data-') ? dataKey(name) : '';
      return key ? element.dataset[key] !== undefined : element.attributes.has(name);
    }
    if (selector.startsWith('#')) return element.id === selector.slice(1);
    if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
    return element.tagName === selector.toLowerCase();
  }
}

class FakeStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;
const originalWindowValues = {
  innerWidth: globalThis.innerWidth,
  innerHeight: globalThis.innerHeight,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  setTimeout: globalThis.setTimeout
};

const document = new FakeDocument();
globalThis.document = document;
globalThis.localStorage = new FakeStorage();
globalThis.innerWidth = 1024;
globalThis.innerHeight = 768;
globalThis.requestAnimationFrame = (callback) => callback();
globalThis.setTimeout = (callback) => {
  callback?.();
  return 0;
};

function addTarget({ id = '', tour = '', dataset = {}, tag = 'button' } = {}) {
  const element = document.createElement(tag);
  if (id) element.id = id;
  if (tour) element.dataset.directiveTour = tour;
  for (const [key, value] of Object.entries(dataset)) element.dataset[key] = value;
  document.body.appendChild(element);
  return element;
}

function elementText(element) {
  return `${element?.textContent || ''}${(element?.children || []).map((child) => elementText(child)).join('')}`;
}

function findButtonByText(text) {
  return [...document.querySelectorAll('button')].find((button) => elementText(button).includes(text)) || null;
}

try {
  resetDirectiveGuidanceProgress();
  assert.equal(getDirectiveGuidancePreferences().firstTutorialCompleted, false);
  setDirectiveGuidancePreference('tutorialPromptsDisabled', true);
  setDirectiveGuidancePreference('tipsDisabled', true);
  let preferences = getDirectiveGuidancePreferences();
  assert.equal(preferences.tutorialPromptsDisabled, true);
  assert.equal(preferences.tipsDisabled, true);
  resetDirectiveGuidanceProgress();
  preferences = getDirectiveGuidancePreferences();
  assert.equal(preferences.tutorialPromptsDisabled, false, 'Reset Tutorial Progress should allow the tutorial prompt to appear again.');
  assert.equal(preferences.firstTutorialCompleted, false);

  setDirectiveGuidancePreference('tutorialPromptsDisabled', false);
  setDirectiveGuidancePreference('tipsDisabled', false);
  const startup = await runDirectiveGuidanceStartupOffer();
  assert.equal(startup.shown, true);
  const startupPopover = document.getElementById('directive-guidance-popover');
  assert.equal(startupPopover?.dataset.guidanceKind, 'startup');
  assert.match(startupPopover.style.left, /^\d+px$/, 'Guidance popovers should use pixel viewport centering for left placement.');
  assert.match(startupPopover.style.top, /^\d+px$/, 'Guidance popovers should use pixel viewport centering for top placement.');
  assert.equal(startupPopover.style.transform, 'none', 'Guidance popovers should not rely on percentage transforms for center placement.');
  assert.match(elementText(document.body), /Learn Directive/);
  assert(document.querySelector('[data-directive-tooltip="Begin Tutorial"]') || document.getElementById('directive-guidance-popover'));

  addTarget({ tour: 'route.campaign' });
  addTarget({ tour: 'route-body.campaign', tag: 'main' });
  const tutorial = await showDirectiveGuidanceTutorial({ tutorialId: 'tutorial.basic' }, {
    navigateToRoute: async (routeId) => {
      addTarget({ tour: `route-body.${routeId}`, tag: 'main' });
    }
  });
  assert.equal(tutorial.shown, true);
  assert.equal(document.getElementById('directive-guidance-popover')?.dataset.guidanceKind, 'tutorial');
  const highlightedRoute = document.querySelector('[data-directive-tour="route.campaign"]');
  assert(highlightedRoute.classList.contains('directive-guidance-target-highlight'));

  __directiveGuidanceTestHooks.close();
  globalThis.localStorage.removeItem(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipsDisabled);
  addTarget({ id: 'directive-assist-button', tour: 'assist.launcher' });
  const assistAction = addTarget({
    tour: 'assist.action.briefMe',
    dataset: { directiveAssistAction: 'briefMe' }
  });
  const assistMenu = addTarget({ id: 'directive-assist-menu', tag: 'div' });
  assistMenu.hidden = true;
  let assistMenuClicked = false;
  document.getElementById('directive-assist-button').addEventListener('click', () => {
    assistMenuClicked = true;
    assistMenu.hidden = false;
  });
  const tip = await showDirectiveGuidanceTip({ tipId: 'tip.assist.brief' });
  assert.equal(tip.shown, true);
  assert.equal(document.getElementById('directive-guidance-popover')?.dataset.guidanceKind, 'tip');
  assert(document.querySelector('[aria-label="Last Tip"]'), 'Tip popup should expose Last Tip arrow button.');
  assert(document.querySelector('[aria-label="Next Tip"]'), 'Tip popup should expose Next Tip arrow button.');
  await findButtonByText('Show Me').click();
  assert.equal(assistMenuClicked, true);
  assert(assistAction.classList.contains('directive-guidance-target-highlight'), 'Show Me should highlight the exact Assist action.');

  assert(DIRECTIVE_TIPS.length >= 30, 'Guidance should provide a real rotating tip library, not one placeholder tip.');
  console.log('Directive guidance tests passed.');
} finally {
  __directiveGuidanceTestHooks.close();
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
  globalThis.innerWidth = originalWindowValues.innerWidth;
  globalThis.innerHeight = originalWindowValues.innerHeight;
  globalThis.requestAnimationFrame = originalWindowValues.requestAnimationFrame;
  globalThis.setTimeout = originalWindowValues.setTimeout;
}
