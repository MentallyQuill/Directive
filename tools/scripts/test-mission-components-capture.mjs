import assert from 'node:assert/strict';

import {
  __directiveRuntimeActionTestHooks,
  registerRuntimeAction
} from '../../src/runtime/runtime-actions.js';
import {
  DIRECTIVE_MISSION_COMPONENT_CAPTURE_BUTTON_CLASS,
  __missionComponentsCaptureTestHooks,
  installMissionComponentsCapture
} from '../../src/hosts/sillytavern/mission-components-capture.js';
import {
  clearSillyTavernDirectiveRuntimeBridge,
  setSillyTavernDirectiveRuntimeBridge
} from '../../src/hosts/sillytavern/runtime-bridge.mjs';
import { DIRECTIVE_OVERLAY_ROOT_ID } from '../../src/ui/directive-overlay-root.js';

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  sync(value) {
    this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  add(...values) {
    for (const value of values.filter(Boolean)) this.values.add(value);
    this.element._className = [...this.values].join(' ');
  }

  remove(...values) {
    for (const value of values) this.values.delete(value);
    this.element._className = [...this.values].join(' ');
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || '').toLowerCase();
    this.nodeType = 1;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.dataset = {};
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.textContent = '';
    this.hidden = false;
    this.style = {};
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
    node.parentElement = this;
    this.children.push(node);
    this.ownerDocument.registerTree(node);
    return node;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.ownerDocument.unregisterTree(this);
    this.parentNode = null;
    this.parentElement = null;
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

  removeEventListener(type, handler) {
    if (this.eventListeners.get(type) === handler) this.eventListeners.delete(type);
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains?.(node));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return this.ownerDocument.querySelectorAllWithin(this, selector);
  }

  getBoundingClientRect() {
    return { left: 100, top: 120, right: 260, bottom: 145, width: 160, height: 25 };
  }

  async click() {
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
    this.documentElement = new FakeElement('html', this);
    this.eventListeners = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  addEventListener(type, handler) {
    this.eventListeners.set(type, handler);
  }

  removeEventListener(type, handler) {
    if (this.eventListeners.get(type) === handler) this.eventListeners.delete(type);
  }

  registerTree(element) {
    if (element.id) this.elementsById.set(element.id, element);
    for (const child of element.children) this.registerTree(child);
  }

  unregisterTree(element) {
    if (element.id && this.elementsById.get(element.id) === element) this.elementsById.delete(element.id);
    for (const child of element.children) this.unregisterTree(child);
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
      while (cursor && !matchesSimpleSelector(cursor, parts[index])) cursor = cursor.parentNode;
      if (!cursor) return false;
      cursor = cursor.parentNode;
    }
    return true;
  }
}

function findByClass(element, className) {
  if (classNames(element).has(className)) return element;
  for (const child of element.children || []) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

function createMessage(document, { mesid, text } = {}) {
  const message = document.createElement('div');
  message.className = 'mes';
  message.setAttribute('mesid', String(mesid));
  const textElement = document.createElement('div');
  textElement.className = 'mes_text';
  textElement.textContent = text;
  message.appendChild(textElement);
  return { message, textElement };
}

__missionComponentsCaptureTestHooks.reset();
__directiveRuntimeActionTestHooks.clearRuntimeActions();

const fakeDocument = new FakeDocument();
globalThis.document = fakeDocument;
globalThis.innerWidth = 1000;
globalThis.innerHeight = 800;
globalThis.SillyTavern = {
  getContext: () => ({
    chatId: 'Directive - Ashes of Peace (57)'
  })
};
setSillyTavernDirectiveRuntimeBridge({
  active: true,
  directiveHost: {
    chat: {
      getBindingMetadata: () => ({
        chatId: 'Directive - Ashes of Peace (57)',
        campaignId: 'campaign-ashes',
        saveId: 'save-ashes'
      })
    }
  }
});

const chat = fakeDocument.createElement('div');
chat.id = 'chat';
const first = createMessage(fakeDocument, {
  mesid: 15,
  text: 'Coolant seal, port nacelle, junction 7-C. Installation pending.'
});
const second = createMessage(fakeDocument, {
  mesid: 16,
  text: 'Player reply has not happened yet.'
});
chat.append(first.message, second.message);
fakeDocument.body.appendChild(chat);

function setSelection({ anchorNode, focusNode, text }) {
  globalThis.getSelection = () => ({
    anchorNode,
    focusNode,
    rangeCount: 1,
    toString: () => text,
    getRangeAt: () => ({
      getBoundingClientRect: () => ({ left: 110, top: 130, right: 240, bottom: 148, width: 130, height: 18 })
    })
  });
}

const calls = [];
registerRuntimeAction('missionComponents.captureSelection', async (payload) => {
  calls.push(payload);
  return {
    ok: true,
    selectedText: payload.selection.selectedText,
    source: {
      chatId: payload.selection.chatId,
      hostMessageId: payload.selection.hostMessageId,
      messageRole: 'assistant',
      sourceAuthority: 'officialPacket'
    },
    proposal: {
      title: 'Port nacelle coolant seal',
      type: 'shipIssue',
      status: 'unresolved',
      summary: payload.selection.selectedText,
      sourceAuthority: 'officialPacket',
      tags: ['engineering'],
      links: {},
      warnings: []
    }
  };
});

assert.equal(installMissionComponentsCapture(), true);
setSelection({
  anchorNode: first.textElement,
  focusNode: first.textElement,
  text: 'Coolant seal, port nacelle, junction 7-C.'
});
__missionComponentsCaptureTestHooks.updateSelectionAffordance();

const button = findByClass(fakeDocument.body, DIRECTIVE_MISSION_COMPONENT_CAPTURE_BUTTON_CLASS);
assert(button, 'Selecting text inside one campaign message should show the Mission Component capture button');
assert.equal(button.hidden, false);
assert.equal(button.title, 'Add Component to Mission');
assert.equal(button.parentNode?.id, DIRECTIVE_OVERLAY_ROOT_ID);
assert.equal(button.children[0].dataset.glyph, 'route-ship');

await button.click();
assert.equal(calls.length, 1);
assert.equal(calls[0].selection.selectedText, 'Coolant seal, port nacelle, junction 7-C.');
assert.equal(calls[0].selection.hostMessageId, '15');
assert.equal(calls[0].selection.message.text, 'Coolant seal, port nacelle, junction 7-C. Installation pending.');
assert.equal(calls[0].selection.message.role, 'assistant');
assert.equal(calls[0].selection.messageElement, undefined, 'runtime payload must not include DOM message elements');
assert.equal(calls[0].selection.rect, undefined, 'runtime payload must not include DOM rects');

const player = createMessage(fakeDocument, {
  mesid: 17,
  text: 'Sam prepares his first question for Commander Cross.'
});
player.message.className = 'mes user_mes';
chat.appendChild(player.message);
setSelection({
  anchorNode: player.textElement,
  focusNode: player.textElement,
  text: 'Sam prepares his first question for Commander Cross.'
});
__missionComponentsCaptureTestHooks.updateSelectionAffordance();
assert.equal(button.hidden, false, 'Player-authored campaign selections should expose a capture button');
await button.click();
assert.equal(calls.length, 2);
assert.equal(calls[1].selection.hostMessageId, '17');
assert.equal(calls[1].selection.message.role, 'user');
assert.equal(calls[1].selection.message.isUser, true);

setSelection({
  anchorNode: first.textElement,
  focusNode: second.textElement,
  text: 'cross-message text'
});
__missionComponentsCaptureTestHooks.updateSelectionAffordance();
assert.equal(button.hidden, true, 'Cross-message selections should not expose a capture button');

first.message.dataset.directiveReconciliationMarker = 'single';
setSelection({
  anchorNode: first.textElement,
  focusNode: first.textElement,
  text: 'Coolant seal, port nacelle'
});
__missionComponentsCaptureTestHooks.updateSelectionAffordance();
assert.equal(button.hidden, true, 'Reconciliation-marked messages should not expose a capture button');
delete first.message.dataset.directiveReconciliationMarker;

globalThis.SillyTavern = {
  getContext: () => ({})
};
setSelection({
  anchorNode: first.textElement,
  focusNode: first.textElement,
  text: 'Coolant seal, port nacelle'
});
__missionComponentsCaptureTestHooks.updateSelectionAffordance();
assert.equal(button.hidden, true, 'Ambiguous current chat state should not expose a capture button');

__missionComponentsCaptureTestHooks.reset();
__directiveRuntimeActionTestHooks.clearRuntimeActions();
clearSillyTavernDirectiveRuntimeBridge();
delete globalThis.document;
delete globalThis.SillyTavern;
delete globalThis.getSelection;

console.log('test-mission-components-capture: ok');
