import assert from 'node:assert/strict';

import { buildDirectiveTrainingScenarioView } from '../../src/guidance/directive-training-scenario.mjs';
import { renderCampaignPanel, resetCampaignPanelState } from '../../src/ui/campaign-panel.js';
import { renderMissionPanel } from '../../src/ui/mission-panel.js';
import { renderCrewPanel, resetCrewPanelState } from '../../src/ui/crew-panel.js';
import { renderShipPanel } from '../../src/ui/ship-panel.js';
import { renderCommandLogPanel } from '../../src/ui/command-log-panel.js';
import { renderSettingsPanel, resetSettingsPanelState } from '../../src/ui/settings-panel.js';

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
    this.value = '';
    this.dataset = {};
    this.style = {
      values: new Map(),
      setProperty: (key, value) => this.style.values.set(key, value)
    };
    this._id = '';
    this._className = '';
    this.classList = new FakeClassList(this);
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
    if (this.disabled) return;
    for (const handler of this.eventListeners.get('click') || []) {
      await handler({
        type: 'click',
        target: this,
        currentTarget: this,
        preventDefault() {},
        stopPropagation() {}
      });
    }
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
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  addEventListener() {}

  removeEventListener() {}

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
    const tokenAttr = selector.match(/^\[([^\]~]+)~=["']?([^"'\]]+)["']?\]$/);
    if (tokenAttr) {
      const [, name, value] = tokenAttr;
      const key = name.startsWith('data-') ? dataKey(name) : '';
      const raw = key ? element.dataset[key] : element.getAttribute(name);
      return String(raw || '').split(/\s+/).includes(value);
    }
    const exactAttr = selector.match(/^\[([^\]=]+)=["']?([^"'\]]+)["']?\]$/);
    if (exactAttr) {
      const [, name, value] = exactAttr;
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

function createActions() {
  return new Proxy({
    setActiveTab() {},
    async refresh() {},
    async beginGuidanceTutorial() {},
    async showGuidanceTip() {},
    async setGuidancePreference() {},
    async resetGuidanceProgress() {}
  }, {
    get(target, key) {
      if (key in target) return target[key];
      return async () => ({ ok: true, inert: true });
    }
  });
}

function hasTour(root, target) {
  return Boolean(root.querySelector(`[data-directive-tour~="${target}"]`));
}

function assertTours(root, targets, label) {
  for (const target of targets) {
    assert(hasTour(root, target), `${label} should render tour target ${target}.`);
  }
}

const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;
globalThis.document = new FakeDocument();
globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {}
};

try {
  const actions = createActions();

  resetCampaignPanelState();
  const campaignBody = document.createElement('main');
  renderCampaignPanel(campaignBody, buildDirectiveTrainingScenarioView({ activeTab: 'campaign' }), actions);
  assertTours(campaignBody, [
    'campaign.index',
    'campaign.start',
    'campaign.detail',
    'campaign.saves'
  ], 'Campaign panel');

  const missionBody = document.createElement('main');
  renderMissionPanel(missionBody, buildDirectiveTrainingScenarioView({ activeTab: 'mission' }), actions);
  assertTours(missionBody, [
    'mission.overview',
    'mission.quest.journal'
  ], 'Mission panel');

  resetCrewPanelState();
  const crewBody = document.createElement('main');
  renderCrewPanel(crewBody, buildDirectiveTrainingScenarioView({ activeTab: 'crew' }), actions);
  assertTours(crewBody, [
    'crew.roster',
    'crew.roster-row',
    'crew.detail'
  ], 'Crew roster panel');

  const shipBody = document.createElement('main');
  renderShipPanel(shipBody, buildDirectiveTrainingScenarioView({ activeTab: 'ship' }), actions);
  assertTours(shipBody, ['ship.status'], 'Ship panel');

  const logBody = document.createElement('main');
  renderCommandLogPanel(logBody, buildDirectiveTrainingScenarioView({ activeTab: 'log' }), actions);
  assertTours(logBody, [
    'log.overview',
    'log.search',
    'log.filters',
    'log.timeline',
    'log.entry.latest'
  ], 'Command Log panel');

  resetSettingsPanelState();
  const settingsBody = document.createElement('main');
  renderSettingsPanel(settingsBody, buildDirectiveTrainingScenarioView({ activeTab: 'settings' }), actions);
  assertTours(settingsBody, [
    'settings.guidance',
    'settings.advanced',
    'settings.troubleshooting'
  ], 'Settings panel');

  console.log('Directive training render target tests passed.');
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
}
