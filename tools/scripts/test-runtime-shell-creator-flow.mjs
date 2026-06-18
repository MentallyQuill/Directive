import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import {
  DIRECTIVE_RUNTIME_PANEL_ID,
  __directiveRuntimeShellTestHooks,
  setDirectiveRuntimeApp,
  showDirectiveRuntimePanel
} from '../../src/runtime/runtime-shell.js';
import {
  listCampaignSaves,
  listCharacterCreatorDrafts
} from '../../src/storage/directive-storage-repository.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryJsonAdapter() {
  const files = new Map();
  return {
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
    }
  };
}

function createSequence(values) {
  let index = 0;
  return () => values[index++] || values.at(-1);
}

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  syncFromString(value) {
    this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  syncToElement() {
    this.element._className = [...this.values].join(' ');
  }

  add(...classes) {
    for (const className of classes) {
      if (className) this.values.add(className);
    }
    this.syncToElement();
  }

  remove(...classes) {
    for (const className of classes) {
      this.values.delete(className);
    }
    this.syncToElement();
  }

  toggle(className, force) {
    if (force === true) {
      this.values.add(className);
    } else if (force === false) {
      this.values.delete(className);
    } else if (this.values.has(className)) {
      this.values.delete(className);
    } else {
      this.values.add(className);
    }
    this.syncToElement();
    return this.values.has(className);
  }

  contains(className) {
    return this.values.has(className);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.parentNode = null;
    this.dataset = {};
    this.textContent = '';
    this.title = '';
    this.type = '';
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.rows = 0;
    this._id = '';
    this._className = '';
    this.classList = new FakeClassList(this);
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value || '');
    this.ownerDocument.registerElement(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
    this.classList.syncFromString(this._className);
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'id') this.id = normalized;
    if (name === 'class') this.className = normalized;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = normalized;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
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

  replaceChildren(...nodes) {
    for (const child of [...this.children]) {
      this.ownerDocument.unregisterTree(child);
      child.parentNode = null;
    }
    this.children = [];
    this.textContent = '';
    this.append(...nodes);
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
    this.ownerDocument.unregisterTree(this);
    this.parentNode = null;
  }

  addEventListener(type, handler) {
    this.eventListeners.set(type, handler);
  }

  async click() {
    if (this.disabled) return;
    const handler = this.eventListeners.get('click');
    if (handler) await handler({ type: 'click', target: this, preventDefault() {} });
  }

  matches(selector) {
    if (selector.startsWith('.')) {
      return this.classList.contains(selector.slice(1));
    }
    if (selector === '[data-directive-runtime-body="true"]') {
      return this.dataset.directiveRuntimeBody === 'true';
    }
    if (selector === '[data-input-path]') {
      return typeof this.dataset.inputPath === 'string';
    }
    return false;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      for (const child of element.children) {
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
    this.elementsById = new Map();
    this.body = new FakeElement('body', this);
    this.documentElement = new FakeElement('html', this);
    this.readyState = 'complete';
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  registerElement(element) {
    if (element.id) this.elementsById.set(element.id, element);
  }

  registerTree(element) {
    this.registerElement(element);
    for (const child of element.children) this.registerTree(child);
  }

  unregisterTree(element) {
    if (element.id && this.elementsById.get(element.id) === element) {
      this.elementsById.delete(element.id);
    }
    for (const child of element.children) this.unregisterTree(child);
  }
}

function textOf(element) {
  return [
    element.textContent || '',
    ...element.children.map(textOf)
  ].join(' ');
}

function findButton(rootElement, label) {
  const buttons = [];
  const visit = (element) => {
    if (element.tagName === 'button') buttons.push(element);
    for (const child of element.children) visit(child);
  };
  visit(rootElement);
  const button = buttons.find((item) => textOf(item).trim() === label);
  assert(button, `Missing button "${label}"`);
  return button;
}

function findControl(rootElement, inputPath) {
  const control = rootElement.querySelectorAll('[data-input-path]')
    .find((item) => item.dataset.inputPath === inputPath);
  assert(control, `Missing control "${inputPath}"`);
  return control;
}

function setControl(rootElement, inputPath, value) {
  findControl(rootElement, inputPath).value = value;
}

const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const adapter = createMemoryJsonAdapter();
const fakeDocument = new FakeDocument();
let idSequence = 0;
globalThis.document = fakeDocument;

const app = createDirectiveRuntimeApp({
  adapter,
  packageLoader: async () => ({
    packages: [packageData],
    projections: [projection]
  }),
  // Distinct ids are required because Save As creates another save slot.
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-shell-test-${idSequence}`;
  },
  now: createSequence([
    '2026-06-18T22:00:00.000Z',
    '2026-06-18T22:01:00.000Z',
    '2026-06-18T22:02:00.000Z',
    '2026-06-18T22:03:00.000Z',
    '2026-06-18T22:04:00.000Z',
    '2026-06-18T22:05:00.000Z',
    '2026-06-18T22:06:00.000Z'
  ])
});
setDirectiveRuntimeApp(app);

await showDirectiveRuntimePanel();
const panel = fakeDocument.getElementById(DIRECTIVE_RUNTIME_PANEL_ID);
assert(panel, 'runtime panel should exist');
assert.match(textOf(panel), /U\.S\.S\. Breckinridge: Ashes of Peace/);

await findButton(panel, 'Start Campaign').click();
assert.match(textOf(panel), /Character Creator/);
assert.match(textOf(panel), /Commander, Executive Officer/);

setControl(panel, 'identity.name', 'Talia Serrin');
setControl(panel, 'identity.pronounsOrAddress', 'she/her');
setControl(panel, 'identity.speciesId', 'human');
setControl(panel, 'identity.ageBandId', 'mid-career');
setControl(panel, 'identity.appearance', 'A composed officer with a quiet voice and a habit of watching the room before speaking.');
await findButton(panel, 'Save Draft').click();

let drafts = await listCharacterCreatorDrafts(adapter);
assert.equal(drafts.length, 1);
assert.equal(drafts[0].status, 'inProgress');
assert.equal(drafts[0].progress.identityComplete, true);
assert.equal(drafts[0].progress.readyForCampaignStart, false);

await findButton(panel, 'Back').click();
assert.match(textOf(panel), /Creator Drafts/);
await findButton(panel, 'Resume Draft').click();
assert.equal(findControl(panel, 'identity.name').value, 'Talia Serrin');

setControl(panel, 'service.careerBackgroundId', 'tactical-security');
setControl(panel, 'service.formativeExperienceId', 'dominion-war-fleet-service');
setControl(panel, 'service.assignmentReasonId', 'experienced-outsider-transfer');
setControl(panel, 'personality.traits.insight', 'perceptive');
setControl(panel, 'personality.traits.connection', 'candid');
setControl(panel, 'personality.traits.execution', 'decisive');
setControl(panel, 'personality.flawId', 'impatient');
setControl(panel, 'dossier.briefBiography', 'Talia Serrin is a tactical-minded Starfleet Commander whose Dominion War service taught her to make quick decisions without treating lives as expendable. Her transfer gives the Breckinridge a disciplined executive officer with a measured command presence.');
setControl(panel, 'dossier.publicReputation', 'Talia Serrin is known as a decisive and observant officer whose restraint has improved since the war.');
await findButton(panel, 'Save Draft').click();

drafts = await listCharacterCreatorDrafts(adapter);
assert.equal(drafts[0].progress.readyForCampaignStart, true, JSON.stringify(drafts[0].progress));
assert.equal(findButton(panel, 'Begin').disabled, false);
await findButton(panel, 'Begin').click();

assert.match(textOf(panel), /Mission/);
assert.match(textOf(panel), /Talia Serrin/);

const saves = await listCampaignSaves(adapter);
assert.equal(saves.length, 1);
assert.equal(saves[0].slotType, 'firstSave');
assert.equal(saves[0].current, true);
assert.equal(saves[0].metadata.playerName, 'Talia Serrin');

await findButton(panel, 'Save Game').click();
let updatedSaves = await listCampaignSaves(adapter);
assert.equal(updatedSaves.length, 1);
assert.equal(updatedSaves[0].revision, 2);

globalThis.prompt = () => 'Talia Serrin - Branch Save';
await findButton(panel, 'Save As').click();
updatedSaves = await listCampaignSaves(adapter);
assert.equal(updatedSaves.length, 2);
assert.equal(updatedSaves.some((save) => save.name === 'Talia Serrin - Branch Save'), true);

await findButton(panel, 'Starships').click();
assert.match(textOf(panel), /Saves/);
await findButton(panel, 'Load Save').click();
assert.match(textOf(panel), /Mission/);
assert.match(textOf(panel), /Talia Serrin/);

__directiveRuntimeShellTestHooks.reset();
delete globalThis.document;
delete globalThis.prompt;

console.log('Runtime shell creator flow tests passed: draft save, resume, begin campaign, first save, save as, load');
