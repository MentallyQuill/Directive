import assert from 'node:assert/strict';

import {
  SCENE_RECONCILIATION_ACTION_IDS,
  SCENE_RECONCILIATION_TOOLTIPS
} from '../../src/runtime/scene-reconciliation.mjs';
import {
  DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS,
  DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS,
  __directiveMessageActionsTestHooks,
  installDirectiveMessageActions
} from '../../src/hosts/sillytavern/message-actions.js';

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  sync(value) {
    this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || '').toLowerCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.textContent = '';
    this.title = '';
    this.type = '';
    this.hidden = false;
    this.disabled = false;
    this._id = '';
    this._className = '';
    this.classList = new FakeClassList(this);
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value || '');
    this.ownerDocument.registerTree(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
    this.classList.sync(this._className);
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    this.ownerDocument.registerTree(node);
    return node;
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name === 'class') this.className = text;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = text;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  addEventListener(type, handler) {
    this.eventListeners.set(type, handler);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return this.ownerDocument.querySelectorAllWithin(this, selector);
  }

  click() {
    const handler = this.eventListeners.get('click');
    if (!handler) return undefined;
    return handler({
      type: 'click',
      target: this,
      currentTarget: this,
      preventDefault() {},
      stopPropagation() {}
    });
  }
}

function classNames(element) {
  return new Set(String(element?.className || '').split(/\s+/).filter(Boolean));
}

function matchesSimpleSelector(element, selector) {
  if (!element) return false;
  const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch && element.id !== idMatch[1]) return false;
  const classMatches = [...selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((match) => match[1]);
  for (const className of classMatches) {
    if (!classNames(element).has(className)) return false;
  }
  const attrMatches = [...selector.matchAll(/\[([^\]=]+)(?:=["']?([^"'\]]+)["']?)?\]/g)];
  for (const [, name, value] of attrMatches) {
    if (!element.attributes.has(name)) return false;
    if (value !== undefined && element.getAttribute(name) !== value) return false;
  }
  const tag = selector.replace(/[#.][a-zA-Z0-9_-]+/g, '').replace(/\[[^\]]+\]/g, '').trim();
  return !tag || element.tagName === tag.toLowerCase();
}

class FakeDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new FakeElement('body', this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  addEventListener() {}

  registerTree(element) {
    if (element.id) this.elementsById.set(element.id, element);
    for (const child of element.children) this.registerTree(child);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return this.querySelectorAllWithin(this.body, selector);
  }

  querySelectorAllWithin(root, selector) {
    const parts = String(selector || '').trim().split(/\s+/).filter(Boolean);
    const matches = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (this.matchesSelectorChain(child, parts)) matches.push(child);
        visit(child);
      }
    };
    visit(root);
    return matches;
  }

  matchesSelectorChain(element, parts) {
    if (!parts.length) return false;
    if (!matchesSimpleSelector(element, parts.at(-1))) return false;
    let cursor = element.parentNode;
    for (let index = parts.length - 2; index >= 0; index -= 1) {
      while (cursor && !matchesSimpleSelector(cursor, parts[index])) {
        cursor = cursor.parentNode;
      }
      if (!cursor) return false;
      cursor = cursor.parentNode;
    }
    return true;
  }
}

function findByDataset(element, key, value) {
  if (element.dataset?.[key] === value) return element;
  for (const child of element.children || []) {
    const match = findByDataset(child, key, value);
    if (match) return match;
  }
  return null;
}

function findByClass(element, className) {
  if (classNames(element).has(className)) return element;
  for (const child of element.children || []) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

function createMessage(document, { mesid, text, includeExtra = true } = {}) {
  const message = document.createElement('div');
  message.className = 'mes';
  message.setAttribute('mesid', String(mesid));
  const block = document.createElement('div');
  block.className = 'mes_block';
  const buttons = document.createElement('div');
  buttons.className = 'mes_buttons';
  if (includeExtra) {
    const extra = document.createElement('div');
    extra.className = 'extraMesButtons';
    buttons.appendChild(extra);
  }
  const textElement = document.createElement('div');
  textElement.className = 'mes_text';
  textElement.textContent = text;
  block.append(buttons, textElement);
  message.appendChild(block);
  return message;
}

__directiveMessageActionsTestHooks.reset();
const fakeDocument = new FakeDocument();
globalThis.document = fakeDocument;
globalThis.MutationObserver = class {
  constructor(callback) {
    this.callback = callback;
  }

  observe() {
    this.observing = true;
  }

  disconnect() {
    this.observing = false;
  }
};

const chat = fakeDocument.createElement('div');
chat.id = 'chat';
const firstMessage = createMessage(fakeDocument, {
  mesid: 7,
  text: 'Log: The away team entered the cargo bay.',
  includeExtra: true
});
const fallbackMessage = createMessage(fakeDocument, {
  mesid: 8,
  text: 'Ship status: Shields degraded.',
  includeExtra: false
});
chat.append(firstMessage, fallbackMessage);
fakeDocument.body.appendChild(chat);

const calls = [];
const installed = installDirectiveMessageActions({
  async runAction(actionId, payload) {
    calls.push({ actionId, payload });
    return {
      result: {
        ok: true,
        summary: 'Message action completed.'
      }
    };
  }
});
assert.equal(installed, true);

const firstButton = findByClass(firstMessage, DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS);
assert(firstButton, 'Directive message action button should be inserted into existing extra buttons');
assert.equal(firstButton.title, 'Directive message actions');
assert.equal(firstButton.parentNode.className, 'extraMesButtons');

const fallbackButton = findByClass(fallbackMessage, DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS);
assert(fallbackButton, 'Directive message action button should create a fallback extra buttons container');
assert(fallbackMessage.querySelector('.extraMesButtons'), 'Fallback message should receive an extra buttons container');

assert.equal(__directiveMessageActionsTestHooks.processExistingMessages({
  runAction: async () => ({ result: { ok: true } })
}), 2);
assert.equal(firstMessage.querySelectorAll(`.${DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS}`).length, 1, 'Installer should not duplicate buttons');

await firstButton.click();
const firstMenu = findByClass(firstMessage, DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS);
assert(firstMenu, 'Directive message action menu should be attached to the message row');
assert.equal(firstMenu.hidden, false);

const reconcileFromHere = findByDataset(firstMenu, 'directiveMessageAction', 'reconcileFromHere');
const recalculateFromHere = findByDataset(firstMenu, 'directiveMessageAction', 'recalculateFromHere');
assert(reconcileFromHere, 'Menu should include Reconcile From Here');
assert(recalculateFromHere, 'Menu should include Recalculate From Here');
assert.equal(reconcileFromHere.title, SCENE_RECONCILIATION_TOOLTIPS.reconcileFromHere);
assert.equal(recalculateFromHere.title, SCENE_RECONCILIATION_TOOLTIPS.recalculateFromHere);
assert.notEqual(reconcileFromHere.title, recalculateFromHere.title);
assert.match(reconcileFromHere.title, /Does not rerun Mission Director outcomes/);
assert.match(recalculateFromHere.title, /May replace or drop later outcomes/);

await reconcileFromHere.click();
assert.equal(calls.at(-1).actionId, SCENE_RECONCILIATION_ACTION_IDS.reconcileFromHere);
assert.equal(calls.at(-1).payload.message.hostMessageId, '7');
assert.equal(calls.at(-1).payload.message.index, 7);
assert.match(calls.at(-1).payload.message.text, /cargo bay/);

await firstButton.click();
await recalculateFromHere.click();
assert.equal(calls.at(-1).actionId, SCENE_RECONCILIATION_ACTION_IDS.recalculateFromHere);

console.log('test-sillytavern-message-actions: ok');
