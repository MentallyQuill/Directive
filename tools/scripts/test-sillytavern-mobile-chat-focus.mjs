import assert from 'node:assert/strict';

import { createSillyTavernChatAdapter } from '../../src/hosts/sillytavern/chat-adapter.mjs';

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.listeners = new Map();
    this.composer = new FakeElement({ documentRef: this, tagName: 'TEXTAREA', id: 'send_textarea' });
  }

  addEventListener(type, handler, options) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ handler, capture: options === true || options?.capture === true });
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, handler, options) {
    const capture = options === true || options?.capture === true;
    this.listeners.set(type, (this.listeners.get(type) || [])
      .filter((entry) => entry.handler !== handler || entry.capture !== capture));
  }

  querySelector(selector) {
    return String(selector).includes('send_textarea') ? this.composer : null;
  }

  dispatch(type, event) {
    for (const { handler } of this.listeners.get(type) || []) handler(event);
  }
}

class FakeElement {
  constructor({ documentRef, tagName = 'BUTTON', id = '' }) {
    this.ownerDocument = documentRef;
    this.tagName = tagName;
    this.id = id;
    this.attributes = new Map();
    this.isConnected = true;
    this.readOnly = false;
    this.blurCount = 0;
    this.focusCount = 0;
  }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  matches(selector) {
    return String(selector).split(',').some((part) => {
      const value = part.trim();
      if (value === 'input') return this.tagName === 'INPUT';
      if (value === 'textarea') return this.tagName === 'TEXTAREA';
      if (value === '[contenteditable="true"]') return this.getAttribute('contenteditable') === 'true';
      return false;
    });
  }

  focus() {
    const relatedTarget = this.ownerDocument.activeElement;
    this.ownerDocument.activeElement = this;
    this.focusCount += 1;
    this.ownerDocument.dispatch('focusin', { target: this, relatedTarget });
  }

  blur() {
    this.blurCount += 1;
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const priorDocument = globalThis.document;
const priorWindow = globalThis.window;

try {
  const documentRef = new FakeDocument();
  const continueButton = new FakeElement({ documentRef });
  continueButton.focus();
  globalThis.document = documentRef;
  globalThis.window = {
    innerWidth: 390,
    matchMedia: (query) => ({ matches: query === '(max-width: 640px)' })
  };

  let currentChatId = 'other-chat';
  const context = {
    characters: [{ name: 'Directive Campaign', avatar: 'directive.png', chat: 'other-chat' }],
    characterId: 0,
    name2: 'Directive Campaign',
    get chatId() { return currentChatId; },
    getCurrentChatId() { return currentChatId; },
    async openCharacterChat(chatId) {
      currentChatId = chatId;
      setTimeout(() => documentRef.composer.focus(), 0);
    }
  };
  const adapter = createSillyTavernChatAdapter({ contextFactory: () => context });
  const opened = await adapter.openCampaignChat({
    hostId: 'sillytavern',
    campaignId: 'campaign-mobile-focus',
    saveId: 'save-mobile-focus',
    chatId: 'campaign-chat',
    entityType: 'character',
    entityId: '0',
    entityName: 'Directive Campaign'
  });
  assert.equal(opened, true);
  await delay(25);

  assert.equal(documentRef.composer.blurCount, 1, 'Directive mobile chat open must reject host composer autofocus');
  assert.equal(documentRef.activeElement, continueButton, 'Directive mobile chat open must restore prior non-editable focus');
  assert.equal(documentRef.composer.readOnly, true, 'Directive must guard the composer through the host autofocus window');
  assert.equal(documentRef.composer.getAttribute('inputmode'), 'none');
  await delay(425);
  assert.equal(documentRef.composer.readOnly, false, 'Directive must restore the composer read-only property');
  assert.equal(documentRef.composer.hasAttribute('readonly'), false, 'Directive must restore the composer readonly attribute');
  assert.equal(documentRef.composer.hasAttribute('inputmode'), false, 'Directive must restore the composer inputmode attribute');

  const desktopDocument = new FakeDocument();
  const desktopPriorFocus = new FakeElement({ documentRef: desktopDocument });
  desktopPriorFocus.focus();
  globalThis.document = desktopDocument;
  globalThis.window = {
    innerWidth: 1024,
    matchMedia: () => ({ matches: false })
  };
  let desktopChatId = 'desktop-other-chat';
  const desktopAdapter = createSillyTavernChatAdapter({
    contextFactory: () => ({
      characters: [{ name: 'Directive Campaign', avatar: 'directive.png', chat: 'desktop-other-chat' }],
      characterId: 0,
      name2: 'Directive Campaign',
      get chatId() { return desktopChatId; },
      getCurrentChatId() { return desktopChatId; },
      async openCharacterChat(chatId) {
        desktopChatId = chatId;
        setTimeout(() => desktopDocument.composer.focus(), 0);
      }
    })
  });
  assert.equal(await desktopAdapter.openCampaignChat({
    hostId: 'sillytavern', campaignId: 'campaign-desktop-focus', saveId: 'save-desktop-focus',
    chatId: 'desktop-campaign-chat', entityType: 'character', entityId: '0', entityName: 'Directive Campaign'
  }), true);
  await delay(25);
  assert.equal(desktopDocument.activeElement, desktopDocument.composer, 'desktop Directive open must preserve host composer autofocus');
  assert.equal(desktopDocument.composer.blurCount, 0);
  assert.equal(desktopDocument.composer.hasAttribute('inputmode'), false);
  assert.equal(desktopDocument.composer.hasAttribute('readonly'), false);

  const currentDocument = new FakeDocument();
  const currentPriorFocus = new FakeElement({ documentRef: currentDocument });
  currentPriorFocus.focus();
  globalThis.document = currentDocument;
  globalThis.window = {
    innerWidth: 390,
    matchMedia: (query) => ({ matches: query === '(max-width: 640px)' })
  };
  let currentOpenCalls = 0;
  const currentAdapter = createSillyTavernChatAdapter({
    contextFactory: () => ({
      characters: [{ name: 'Directive Campaign', avatar: 'directive.png', chat: 'current-campaign-chat' }],
      characterId: 0,
      name2: 'Directive Campaign',
      chatId: 'current-campaign-chat',
      getCurrentChatId: () => 'current-campaign-chat',
      async openCharacterChat() { currentOpenCalls += 1; }
    })
  });
  assert.equal(await currentAdapter.openCampaignChat({
    hostId: 'sillytavern', campaignId: 'campaign-current-focus', saveId: 'save-current-focus',
    chatId: 'current-campaign-chat', entityType: 'character', entityId: '0', entityName: 'Directive Campaign'
  }), true);
  assert.equal(currentOpenCalls, 0, 'already-current chat must not invoke host navigation');
  assert.equal(currentDocument.activeElement, currentPriorFocus);
  assert.equal(currentDocument.composer.hasAttribute('inputmode'), false, 'already-current chat must not mutate the composer');
  assert.equal(currentDocument.composer.hasAttribute('readonly'), false);
  assert.equal((currentDocument.listeners.get('focusin') || []).length, 0, 'already-current chat must not install a focus guard');

  const failedDocument = new FakeDocument();
  const failedPriorFocus = new FakeElement({ documentRef: failedDocument });
  failedPriorFocus.focus();
  globalThis.document = failedDocument;
  globalThis.window = {
    innerWidth: 390,
    matchMedia: (query) => ({ matches: query === '(max-width: 640px)' })
  };
  const failedAdapter = createSillyTavernChatAdapter({
    contextFactory: () => ({
      characters: [{ name: 'Directive Campaign', avatar: 'directive.png', chat: 'failed-other-chat' }],
      characterId: 0,
      name2: 'Directive Campaign',
      chatId: 'failed-other-chat',
      getCurrentChatId: () => 'failed-other-chat',
      async openCharacterChat() {
        setTimeout(() => failedDocument.composer.focus(), 0);
        throw new Error('host open failed');
      }
    })
  });
  assert.equal(await failedAdapter.openCampaignChat({
    hostId: 'sillytavern', campaignId: 'campaign-failed-focus', saveId: 'save-failed-focus',
    chatId: 'failed-campaign-chat', entityType: 'character', entityId: '0', entityName: 'Directive Campaign'
  }), false);
  await delay(25);
  assert.equal(failedDocument.composer.blurCount, 1, 'failed Directive open must still reject scheduled host autofocus');
  assert.equal(failedDocument.activeElement, failedPriorFocus);
  await delay(425);
  assert.equal(failedDocument.composer.readOnly, false, 'failed Directive open must restore composer editability');
  assert.equal(failedDocument.composer.hasAttribute('readonly'), false);
  assert.equal(failedDocument.composer.hasAttribute('inputmode'), false);
  assert.equal((failedDocument.listeners.get('focusin') || []).length, 0, 'failed Directive open must release its focus listener');
} finally {
  globalThis.document = priorDocument;
  globalThis.window = priorWindow;
}

console.log('SillyTavern mobile campaign chat focus tests passed.');
