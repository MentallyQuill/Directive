import assert from 'node:assert/strict';

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  values() {
    return new Set(String(this.element.className || '').split(/\s+/).filter(Boolean));
  }

  write(values) {
    this.element.className = [...values].join(' ');
  }

  add(...names) {
    const values = this.values();
    names.forEach((name) => values.add(name));
    this.write(values);
  }

  remove(...names) {
    const values = this.values();
    names.forEach((name) => values.delete(name));
    this.write(values);
  }

  toggle(name, force) {
    const values = this.values();
    const next = force === undefined ? !values.has(name) : force === true;
    if (next) values.add(name);
    else values.delete(name);
    this.write(values);
    return next;
  }

  contains(name) {
    return this.values().has(name);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.dataset = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.hidden = false;
    this.textContent = '';
  }

  get id() {
    return this.attributes.get('id') || '';
  }

  set id(value) {
    this.setAttribute('id', value);
  }

  get isConnected() {
    return Boolean(this.parentNode);
  }

  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'class') this.className = normalized;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = normalized;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  addEventListener(type, handler) {
    this.eventListeners.set(type, handler);
  }

  removeEventListener(type) {
    this.eventListeners.delete(type);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector === '[data-directive-runtime-body="true"]') return this.dataset.directiveRuntimeBody === 'true';
    if (selector === '[data-route-id]') return Boolean(this.dataset.routeId);
    if (selector === '[data-shell-action="fullscreen"]') return this.dataset.shellAction === 'fullscreen';
    return false;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.listeners = new Map();
    this.documentElement = new FakeElement('html', this);
    this.body = new FakeElement('body', this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.body.querySelector(`#${id}`) || this.documentElement.querySelector(`#${id}`);
  }

  querySelector(selector) {
    return this.body.querySelector(selector) || this.documentElement.querySelector(selector);
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }
}

const fakeDocument = new FakeDocument();
globalThis.document = fakeDocument;
globalThis.requestAnimationFrame = (callback) => callback();

const {
  __directiveRuntimeShellTestHooks,
  hideDirectiveRuntimePanel,
  refreshDirectiveRuntimePanel,
  setDirectiveRuntimeApp,
  showDirectiveRuntimePanel
} = await import('../../src/runtime/runtime-shell.js');
const { registerActiveCreatorAssistSession } = await import('../../src/ui/character-creator-assist-dialog.js');

setDirectiveRuntimeApp(null);
const opener = fakeDocument.createElement('button');
fakeDocument.body.appendChild(opener);

await refreshDirectiveRuntimePanel();
const overlay = fakeDocument.getElementById('directive-runtime-overlay');
const panel = fakeDocument.getElementById('directive-runtime-panel');
assert(overlay, 'background refresh should mount the runtime overlay');
assert(panel, 'background refresh should mount the runtime panel');
assert.equal(overlay.hidden, true, 'background refresh should keep the runtime overlay hidden');
assert.equal(panel.hidden, true, 'background refresh should keep the runtime panel hidden');
assert.equal(panel.getAttribute('aria-hidden'), 'true');

const shown = await showDirectiveRuntimePanel({ opener });
assert.equal(shown.isOpen, true);
assert(overlay, 'runtime overlay should exist');
assert.equal(overlay.parentNode, fakeDocument.body, 'runtime overlay should mount at document body level');
assert.equal(panel.parentNode, overlay.querySelector('.directive-runtime-panel-host'));
assert.equal(overlay.hidden, false);
assert.equal(panel.hidden, false);
const assistCancellations = [];
registerActiveCreatorAssistSession({
  cancel(reason) {
    assistCancellations.push({ reason, overlayHidden: overlay.hidden, panelHidden: panel.hidden });
  }
});
hideDirectiveRuntimePanel();
assert.deepEqual(assistCancellations, [{
  reason: 'directive-closed',
  overlayHidden: false,
  panelHidden: false
}], 'runtime hide should cancel active creator assist before hiding the shell');
assert.equal(overlay.hidden, true);
assert.equal(panel.hidden, true);
assert.equal(opener, fakeDocument.activeElement, 'hide should restore focus to the opener');

await showDirectiveRuntimePanel({ opener });
const refreshCancellations = [];
registerActiveCreatorAssistSession({ cancel: (reason) => refreshCancellations.push(reason) });
await refreshDirectiveRuntimePanel();
assert.deepEqual(refreshCancellations, ['runtime-refresh'], 'runtime rerender should cancel an assist bound to the old creator form');

__directiveRuntimeShellTestHooks.reset();
console.log('Directive runtime overlay host tests passed.');
