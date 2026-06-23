import assert from 'node:assert/strict';

import {
  SCENE_RECONCILIATION_ACTION_IDS,
  SCENE_RECONCILIATION_TOOLTIPS
} from '../../src/runtime/scene-reconciliation.mjs';
import {
  CAMPAIGN_INTRO_REWRITE_ACTION_ID,
  DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS,
  DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS,
  DIRECTIVE_RECONCILIATION_SELECTION_MENU_CLASS,
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
    this.style = {};
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

  insertBefore(node, referenceNode) {
    const index = this.children.indexOf(referenceNode);
    if (index < 0) return this.appendChild(node);
    node.parentNode = this;
    this.children.splice(index, 0, node);
    this.ownerDocument.registerTree(node);
    return node;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
    this.ownerDocument.unregisterTree(this);
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

  unregisterTree(element) {
    if (element.id) this.elementsById.delete(element.id);
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
  const edit = document.createElement('div');
  edit.className = 'mes_button mes_edit fa-solid fa-pencil interactable';
  edit.title = 'Edit';
  buttons.appendChild(edit);
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
const middleMessage = createMessage(fakeDocument, {
  mesid: 8,
  text: 'Engineering confirms the passage is still active.',
  includeExtra: true
});
const fallbackMessage = createMessage(fakeDocument, {
  mesid: 9,
  text: 'Ship status: Shields degraded.',
  includeExtra: false
});
chat.append(firstMessage, middleMessage, fallbackMessage);
fakeDocument.body.appendChild(chat);

const calls = [];
function markerFromPayload(payload) {
  return {
    hostMessageId: payload?.message?.hostMessageId || null,
    index: payload?.message?.index ?? null
  };
}

const installed = installDirectiveMessageActions({
  async runAction(actionId, payload) {
    calls.push({ actionId, payload });
    if (actionId === SCENE_RECONCILIATION_ACTION_IDS.clearMarkers) {
      return {
        result: {
          ok: true,
          summary: 'Reconciliation markers cleared.',
          sceneReconciliation: { markers: { start: null, end: null } }
        }
      };
    }
    if (actionId === SCENE_RECONCILIATION_ACTION_IDS.setEnd) {
      return {
        result: {
          ok: true,
          summary: 'Reconciliation end moved.',
          sceneReconciliation: {
            markers: {
              start: { hostMessageId: '7', index: 7 },
              end: markerFromPayload(payload)
            }
          }
        }
      };
    }
    if (actionId === SCENE_RECONCILIATION_ACTION_IDS.setStart) {
      return {
        result: {
          ok: true,
          summary: 'Reconciliation start moved.',
          sceneReconciliation: {
            markers: {
              start: markerFromPayload(payload),
              end: { hostMessageId: '9', index: 9 }
            }
          }
        }
      };
    }
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
assert(!classNames(firstButton).has('fa-compass'), 'Directive message action should not use the legacy compass icon');
const firstButtonIcon = firstButton.children.find((child) => child?.dataset?.glyph === 'route-ship');
assert(firstButtonIcon, 'Directive message action should use the Directive ship glyph');
assert.match(firstButtonIcon.className, /directive-vector-glyph/);
assert.match(firstButtonIcon.className, /directive-message-actions-icon/);
assert.equal(firstButton.getAttribute('aria-haspopup'), 'menu');
assert.equal(firstButton.getAttribute('aria-expanded'), 'false');
assert.equal(firstMessage.querySelector(`.directive-reconciliation-status-icon`), null, 'No reconciliation status icon should render without active markers');

const fallbackButton = findByClass(fallbackMessage, DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS);
assert(fallbackButton, 'Directive message action button should create a fallback extra buttons container');
assert(fallbackMessage.querySelector('.extraMesButtons'), 'Fallback message should receive an extra buttons container');

assert.equal(__directiveMessageActionsTestHooks.processExistingMessages({
  runAction: async () => ({ result: { ok: true } })
}), 3);
assert.equal(firstMessage.querySelectorAll(`.${DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS}`).length, 1, 'Installer should not duplicate buttons');

await firstButton.click();
const firstMenu = findByClass(fakeDocument.body, DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS);
assert(firstMenu, 'Directive message action menu should be attached as a floating host-level menu');
assert.equal(firstMenu.parentNode, fakeDocument.body);
assert.equal(firstMenu.dataset.directiveMessageId, '7');
assert.equal(firstMenu.hidden, false);
assert.equal(firstButton.getAttribute('aria-expanded'), 'true');
assert(!firstButton.children.includes(firstMenu), 'Directive message action menu should not be clipped inside the button');

const reconcileFromHere = findByDataset(firstMenu, 'directiveMessageAction', 'reconcileFromHere');
const recalculateFromHere = findByDataset(firstMenu, 'directiveMessageAction', 'recalculateFromHere');
const rewriteIntro = findByDataset(firstMenu, 'directiveMessageAction', 'rewriteCampaignIntro');
assert(rewriteIntro, 'Menu should include Rewrite Intro');
assert(reconcileFromHere, 'Menu should include Reconcile From Here');
assert(recalculateFromHere, 'Menu should include Recalculate From Here');
assert.equal(rewriteIntro.dataset.directiveRuntimeAction, CAMPAIGN_INTRO_REWRITE_ACTION_ID);
assert.match(rewriteIntro.title, /selected SillyTavern swipe/);
assert.equal(reconcileFromHere.title, SCENE_RECONCILIATION_TOOLTIPS.reconcileFromHere);
assert.equal(recalculateFromHere.title, SCENE_RECONCILIATION_TOOLTIPS.recalculateFromHere);
assert.notEqual(reconcileFromHere.title, recalculateFromHere.title);
assert.match(reconcileFromHere.title, /Does not rerun Mission Director outcomes/);
assert.match(recalculateFromHere.title, /May replace or drop later outcomes/);

await rewriteIntro.click();
assert.equal(calls.at(-1).actionId, CAMPAIGN_INTRO_REWRITE_ACTION_ID);
assert.equal(calls.at(-1).payload.message.hostMessageId, '7');

await reconcileFromHere.click();
assert.equal(calls.at(-1).actionId, SCENE_RECONCILIATION_ACTION_IDS.reconcileFromHere);
assert.equal(calls.at(-1).payload.message.hostMessageId, '7');
assert.equal(calls.at(-1).payload.message.index, 7);
assert.match(calls.at(-1).payload.message.text, /cargo bay/);

await firstButton.click();
await recalculateFromHere.click();
assert.equal(calls.at(-1).actionId, SCENE_RECONCILIATION_ACTION_IDS.recalculateFromHere);

__directiveMessageActionsTestHooks.setSceneReconciliationState({
  markers: {
    start: { hostMessageId: '7', index: 7 },
    end: { hostMessageId: '9', index: 9 }
  }
});
const startStatus = firstMessage.querySelector('.directive-reconciliation-status-icon');
const rangeStatus = middleMessage.querySelector('.directive-reconciliation-status-icon');
const endStatus = fallbackMessage.querySelector('.directive-reconciliation-status-icon');
assert(startStatus, 'Start message should receive a reconciliation status icon');
assert(rangeStatus, 'Middle message should receive a reconciliation range status icon');
assert(endStatus, 'End message should receive a reconciliation status icon');
assert.equal(startStatus.dataset.directiveReconciliationStatus, 'start');
assert.equal(rangeStatus.dataset.directiveReconciliationStatus, 'range');
assert.equal(endStatus.dataset.directiveReconciliationStatus, 'end');
assert.equal(firstMessage.dataset.directiveReconciliationMarker, 'start');
assert.equal(middleMessage.dataset.directiveReconciliationMarker, 'range');
assert.equal(fallbackMessage.dataset.directiveReconciliationMarker, 'end');
assert.equal(startStatus.children[0].dataset.glyph, 'route-ship');
assert.match(startStatus.children[0].className, /directive-reconciliation-status-glyph/);
assert.equal(startStatus.parentNode.children.indexOf(startStatus) < startStatus.parentNode.children.indexOf(firstMessage.querySelector('.mes_edit')), true, 'Reconciliation status should sit to the left of Edit');
assert.equal(startStatus.getAttribute('role'), 'button');
assert.equal(startStatus.getAttribute('aria-haspopup'), 'menu');

await rangeStatus.click();
const selectionMenu = findByClass(fakeDocument.body, DIRECTIVE_RECONCILIATION_SELECTION_MENU_CLASS);
assert(selectionMenu, 'Clicking a reconciliation status icon should open a floating selection menu');
assert.equal(selectionMenu.parentNode, fakeDocument.body);
assert.equal(selectionMenu.hidden, false);
assert.equal(selectionMenu.dataset.directiveMessageId, '8');
assert.equal(rangeStatus.getAttribute('aria-expanded'), 'true');
const clearSet = findByDataset(selectionMenu, 'directiveReconciliationAction', 'clear');
const keepEarlier = findByDataset(selectionMenu, 'directiveReconciliationAction', 'keepEarlier');
const keepLater = findByDataset(selectionMenu, 'directiveReconciliationAction', 'keepLater');
assert(clearSet, 'Selection menu should allow clearing the reconciliation set');
assert(keepEarlier, 'Selection menu should allow keeping earlier messages when clicked inside a range');
assert(keepLater, 'Selection menu should allow keeping later messages when clicked inside a range');
assert.equal(clearSet.dataset.directiveRuntimeAction, SCENE_RECONCILIATION_ACTION_IDS.clearMarkers);

await keepEarlier.click();
assert.equal(calls.at(-1).actionId, SCENE_RECONCILIATION_ACTION_IDS.setEnd);
assert.equal(calls.at(-1).payload.message.hostMessageId, '7');
assert.equal(firstMessage.querySelector('.directive-reconciliation-status-icon').dataset.directiveReconciliationStatus, 'single');
assert.equal(middleMessage.querySelector('.directive-reconciliation-status-icon'), null, 'Keeping earlier messages should move the end marker before the clicked message');

__directiveMessageActionsTestHooks.setSceneReconciliationState({
  markers: {
    start: { hostMessageId: '7', index: 7 },
    end: { hostMessageId: '9', index: 9 }
  }
});
await middleMessage.querySelector('.directive-reconciliation-status-icon').click();
await findByDataset(selectionMenu, 'directiveReconciliationAction', 'keepLater').click();
assert.equal(calls.at(-1).actionId, SCENE_RECONCILIATION_ACTION_IDS.setStart);
assert.equal(calls.at(-1).payload.message.hostMessageId, '9');
assert.equal(fallbackMessage.querySelector('.directive-reconciliation-status-icon').dataset.directiveReconciliationStatus, 'single');
assert.equal(middleMessage.querySelector('.directive-reconciliation-status-icon'), null, 'Keeping later messages should move the start marker after the clicked message');

__directiveMessageActionsTestHooks.setSceneReconciliationState({
  markers: {
    start: { hostMessageId: '7', index: 7 },
    end: { hostMessageId: '9', index: 9 }
  }
});
await middleMessage.querySelector('.directive-reconciliation-status-icon').click();
await findByDataset(selectionMenu, 'directiveReconciliationAction', 'clear').click();
assert.equal(calls.at(-1).actionId, SCENE_RECONCILIATION_ACTION_IDS.clearMarkers);
assert.equal(firstMessage.querySelector('.directive-reconciliation-status-icon'), null, 'Clearing from the selection menu should remove start status icon');
assert.equal(middleMessage.querySelector('.directive-reconciliation-status-icon'), null, 'Clearing from the selection menu should remove range status icon');
assert.equal(fallbackMessage.querySelector('.directive-reconciliation-status-icon'), null, 'Clearing from the selection menu should remove end status icon');

__directiveMessageActionsTestHooks.setSceneReconciliationState({
  markers: {
    start: { hostMessageId: '9', index: 9 },
    end: { hostMessageId: '7', index: 7 }
  }
});
await middleMessage.querySelector('.directive-reconciliation-status-icon').click();
assert.equal(findByDataset(selectionMenu, 'directiveReconciliationAction', 'keepEarlier').dataset.directiveRuntimeAction, SCENE_RECONCILIATION_ACTION_IDS.setStart);
assert.equal(findByDataset(selectionMenu, 'directiveReconciliationAction', 'keepLater').dataset.directiveRuntimeAction, SCENE_RECONCILIATION_ACTION_IDS.setEnd);

__directiveMessageActionsTestHooks.setSceneReconciliationState({
  markers: {
    start: { hostMessageId: '7', index: 7 },
    end: { hostMessageId: '7', index: 7 }
  }
});
assert.equal(firstMessage.querySelector('.directive-reconciliation-status-icon').dataset.directiveReconciliationStatus, 'single');
assert.equal(middleMessage.querySelector('.directive-reconciliation-status-icon'), null, 'Middle rows outside a single-message selection should clear their status icon');
assert.equal(fallbackMessage.querySelector('.directive-reconciliation-status-icon'), null, 'Rows outside the active selection should clear their status icon');

__directiveMessageActionsTestHooks.setSceneReconciliationState({ markers: { start: null, end: null } });
assert.equal(firstMessage.querySelector('.directive-reconciliation-status-icon'), null, 'Clearing markers should remove start status icon');
assert.equal(firstMessage.dataset.directiveReconciliationMarker, undefined);

firstMessage.remove();
assert.equal(__directiveMessageActionsTestHooks.processExistingMessages({
  runAction: async () => ({ result: { ok: true } })
}), 2);
assert.equal(findByDataset(fakeDocument.body, 'directiveMessageId', '7'), null, 'Floating menus should be removed when their message row leaves the chat DOM');

console.log('test-sillytavern-message-actions: ok');
