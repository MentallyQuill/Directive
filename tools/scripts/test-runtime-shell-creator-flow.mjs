import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import {
  __directiveRuntimeAppTestHooks,
  createDirectiveRuntimeApp
} from '../../src/runtime/runtime-app.mjs';
import { CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT } from '../../src/creators/character-creator-assist.mjs';
import {
  DIRECTIVE_RUNTIME_PANEL_ID,
  __directiveRuntimeShellTestHooks,
  resetDirectiveRuntimeLayout,
  setDirectiveRuntimeApp,
  showDirectiveRuntimePanel
} from '../../src/runtime/runtime-shell.js';
import {
  getDirectiveStorageIndexes,
  listCampaignSaves,
  listCharacterCreatorDrafts
} from '../../src/storage/directive-storage-repository.mjs';

const root = process.cwd();

function longCreatorSelfFillText(seed, minimumLength = CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT + 140) {
  const sentence = `${seed} `;
  let text = sentence;
  while (text.length <= minimumLength) text += sentence;
  return text.trim();
}

const OVER_LIMIT_CREATOR_SERVICE_SUMMARY = longCreatorSelfFillText('Tactical service record, Dominion War fleet experience, and outsider transfer status frame the officer as disciplined but newly accountable to the Breckenridge crew while leaving room for the player to revise public details.');
const OVER_LIMIT_CREATOR_COMMAND_STYLE = longCreatorSelfFillText('Command style is perceptive, candid, and decisive, with impatience as the pressure point that can turn urgency into friction while preserving the full editable service-record prose.', CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT + 60);
const OVER_LIMIT_CREATOR_BRIEF_BIO = [
  longCreatorSelfFillText('Talia Serrin is a tactical-minded Starfleet Commander whose Dominion War service taught her to make quick decisions without treating lives as expendable.', 540),
  'Her longer biography keeps the post-transfer command history available for the Character tab disclosure after the first paragraph is collapsed.'
].join('\n\n');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function localHeader(nameBytes, data, localOffset = 0) {
  const buffer = Buffer.alloc(30 + nameBytes.length + data.length);
  buffer.writeUInt32LE(0x04034b50, 0);
  buffer.writeUInt16LE(20, 4);
  buffer.writeUInt16LE(0, 6);
  buffer.writeUInt16LE(0, 8);
  buffer.writeUInt16LE(0, 10);
  buffer.writeUInt16LE(0, 12);
  buffer.writeUInt32LE(0, 14);
  buffer.writeUInt32LE(data.length, 18);
  buffer.writeUInt32LE(data.length, 22);
  buffer.writeUInt16LE(nameBytes.length, 26);
  buffer.writeUInt16LE(0, 28);
  nameBytes.copy(buffer, 30);
  data.copy(buffer, 30 + nameBytes.length);
  return { buffer, localOffset };
}

function centralHeader(nameBytes, data, localOffset) {
  const buffer = Buffer.alloc(46 + nameBytes.length);
  buffer.writeUInt32LE(0x02014b50, 0);
  buffer.writeUInt16LE(20, 4);
  buffer.writeUInt16LE(20, 6);
  buffer.writeUInt16LE(0, 8);
  buffer.writeUInt16LE(0, 10);
  buffer.writeUInt16LE(0, 12);
  buffer.writeUInt16LE(0, 14);
  buffer.writeUInt32LE(0, 16);
  buffer.writeUInt32LE(data.length, 20);
  buffer.writeUInt32LE(data.length, 24);
  buffer.writeUInt16LE(nameBytes.length, 28);
  buffer.writeUInt16LE(0, 30);
  buffer.writeUInt16LE(0, 32);
  buffer.writeUInt16LE(0, 34);
  buffer.writeUInt16LE(0, 36);
  buffer.writeUInt32LE(0, 38);
  buffer.writeUInt32LE(localOffset, 42);
  nameBytes.copy(buffer, 46);
  return buffer;
}

function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
  const buffer = Buffer.alloc(22);
  buffer.writeUInt32LE(0x06054b50, 0);
  buffer.writeUInt16LE(0, 4);
  buffer.writeUInt16LE(0, 6);
  buffer.writeUInt16LE(entryCount, 8);
  buffer.writeUInt16LE(entryCount, 10);
  buffer.writeUInt32LE(centralSize, 12);
  buffer.writeUInt32LE(centralOffset, 16);
  buffer.writeUInt16LE(0, 20);
  return buffer;
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.path, 'utf8');
    const data = Buffer.from(entry.text, 'utf8');
    const local = localHeader(nameBytes, data, localOffset);
    localParts.push(local.buffer);
    centralParts.push(centralHeader(nameBytes, data, localOffset));
    localOffset += local.buffer.length;
  }
  const centralOffset = localOffset;
  const central = Buffer.concat(centralParts);
  return Buffer.concat([
    ...localParts,
    central,
    endOfCentralDirectory(entries.length, central.length, centralOffset)
  ]);
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
    },
    async deleteJsonFile(filePath) {
      files.delete(filePath);
      return { deleted: true, path: filePath };
    }
  };
}

function createSequence(values) {
  let index = 0;
  return () => values[index++] || values.at(-1);
}

function createCreatorFlowGenerationClient() {
  const calls = [];
  let characterDraftCalls = 0;
  let identityDraftCalls = 0;
  const partialRefineResponse = {
    text: JSON.stringify({
      kind: 'directive.characterCreatorSectionDraftResult',
      sectionId: 'identity',
      mode: 'refine',
      fields: {
        'identity.name': 'Sam Vickers',
        'identity.speciesId': 'human',
        'identity.ageBandId': 'mid-career'
      },
      notes: ['Retained the supplied name, species, and age band.'],
      warnings: []
    }),
    providerId: 'fake-character-creator',
    model: 'fake-reasoner',
    usage: { total_tokens: 142 }
  };

  function structuredResponse(payload) {
    return {
      text: JSON.stringify(payload),
      providerId: 'fake-character-creator',
      model: 'fake-reasoner',
      usage: { total_tokens: 176 }
    };
  }

  async function generate(role, request = {}) {
    calls.push({ role, request: cloneJson(request) });
    if (role === 'characterCreatorSectionDraft') {
      characterDraftCalls += 1;
      if (request.sectionId === 'identity') {
        identityDraftCalls += 1;
      }
      if (request.sectionId === 'identity' && /Cancel Pending/.test(String(request.prompt || ''))) {
        assert(request.signal, 'Pending identity generation should receive an abort signal');
        return new Promise((resolve, reject) => {
          const rejectCanceled = () => {
            const error = new Error('Draft canceled.');
            error.name = 'AbortError';
            error.code = 'DIRECTIVE_GENERATION_ABORTED';
            reject(error);
          };
          if (request.signal.aborted) {
            rejectCanceled();
            return;
          }
          request.signal.addEventListener('abort', rejectCanceled, { once: true });
        });
      }
      if (request.sectionId === 'identity' && identityDraftCalls === 1) {
        return { text: 'not json', providerId: 'fake-character-creator' };
      }
      if (request.sectionId === 'identity') return cloneJson(partialRefineResponse);
      if (request.sectionId === 'service') {
        return structuredResponse({
          kind: 'directive.characterCreatorSectionDraftResult',
          sectionId: 'service',
          mode: 'refine',
          fields: {
            'service.careerBackgroundId': 'tactical-security',
            'service.formativeExperienceId': 'dominion-war-fleet-service',
            'service.assignmentReasonId': 'experienced-outsider-transfer',
            'dossier.serviceSummary': OVER_LIMIT_CREATOR_SERVICE_SUMMARY
          },
          notes: ['Turned service choices into editable dossier text.'],
          warnings: []
        });
      }
      if (request.sectionId === 'personality') {
        return structuredResponse({
          kind: 'directive.characterCreatorSectionDraftResult',
          sectionId: 'personality',
          mode: 'refine',
          fields: {
            'personality.traits.insight': 'perceptive',
            'personality.traits.connection': 'candid',
            'personality.traits.execution': 'decisive',
            'personality.flawId': 'impatient',
            'dossier.traits': 'Command style is perceptive, candid, and decisive, with impatience as the pressure point that can turn urgency into friction.'
          },
          notes: ['Turned personality choices into editable command-style text.'],
          warnings: []
        });
      }
      return cloneJson(partialRefineResponse);
    }
    return { text: 'Fake generation response.', providerId: `fake-${role}` };
  }

  return {
    generate,
    role(roleName) {
      return {
        id: `fake-${roleName}`,
        async generateNarration(request = {}) {
          return generate(roleName, request);
        }
      };
    },
    calls() {
      return cloneJson(calls);
    }
  };
}

class FakeNodeList {
  constructor(items = []) {
    this.items = items;
    this.length = items.length;
    for (let index = 0; index < items.length; index += 1) {
      this[index] = items[index];
    }
  }

  item(index) {
    return this.items[index] || null;
  }

  forEach(callback, thisArg = undefined) {
    this.items.forEach(callback, thisArg);
  }

  [Symbol.iterator]() {
    return this.items[Symbol.iterator]();
  }
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
    if (handler) await handler({ type: 'click', target: this, currentTarget: this, preventDefault() {} });
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

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches?.(selector)) return current;
      current = current.parentNode;
    }
    return null;
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
    return new FakeNodeList(matches);
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

function queryAll(rootElement, selector) {
  return Array.from(rootElement.querySelectorAll(selector));
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

function findButtonByDataset(rootElement, key, value) {
  const buttons = [];
  const visit = (element) => {
    if (element.tagName === 'button') buttons.push(element);
    for (const child of element.children) visit(child);
  };
  visit(rootElement);
  const button = buttons.find((item) => item.dataset?.[key] === value);
  assert(button, `Missing button with dataset ${key}=${value}`);
  return button;
}

function findControl(rootElement, inputPath) {
  const control = queryAll(rootElement, '[data-input-path]')
    .find((item) => item.dataset.inputPath === inputPath);
  assert(control, `Missing control "${inputPath}"`);
  return control;
}

function setControl(rootElement, inputPath, value) {
  findControl(rootElement, inputPath).value = value;
}

function emitControlEvent(control, type) {
  const handler = control.eventListeners.get(type);
  if (!handler) return;
  handler({ type, target: control, currentTarget: control, preventDefault() {} });
}

function setRuntimeControl(rootElement, inputPath, value) {
  const control = findControl(rootElement, inputPath);
  control.value = value;
  emitControlEvent(control, 'input');
  emitControlEvent(control, 'change');
  return control;
}

function assertNoUnwiredPlaceholders(rootElement) {
  assert.doesNotMatch(textOf(rootElement), /not wired yet/i);
}

function assertActiveSettingsSubtab(rootElement, label) {
  const activeSubtabs = queryAll(rootElement, '.directive-settings-subtab-active');
  assert.equal(activeSubtabs.length, 1, 'Settings should have exactly one active subtab');
  assert.equal(textOf(activeSubtabs[0]).trim(), label, `Settings should select ${label}`);
}

function assertModelRoutingFolders(rootElement) {
  if (!/Model Call Routing/.test(textOf(rootElement))) return;
  const folders = queryAll(rootElement, '.directive-provider-role-folder');
  const summaries = queryAll(rootElement, '.directive-provider-role-folder-summary');
  assert(folders.length >= 4, 'Model Call Routing should render category dropdown folders');
  assert.equal(summaries.length, folders.length, 'Each model-call category folder should expose a summary control');
  assert.match(textOf(rootElement), /Story Output/);
  assert.match(textOf(rootElement), /Turn Reading/);
  assert.match(textOf(rootElement), /State Sidecars/);
}

const projectedCharacter = __directiveRuntimeAppTestHooks.createPlayerCharacterView({
  campaignState: {
    player: {
      id: 'player-commander',
      name: 'Talia Serrin',
      rank: 'Commander',
      billet: 'Executive Officer',
      dossier: {
        serviceSummary: OVER_LIMIT_CREATOR_SERVICE_SUMMARY,
        traits: OVER_LIMIT_CREATOR_COMMAND_STYLE,
        briefBiography: OVER_LIMIT_CREATOR_BRIEF_BIO
      }
    },
    relationships: {
      perceptionLedger: [{
        id: 'relationship-perception.outcome-1.jalen-orr.1',
        crewId: 'jalen-orr',
        playerFacingImpact: 'Slight Improvement',
        perceivedByCharacter: {
          clarity: 'clear',
          cue: 'Jalen stops pressing once the accountable delay is named.',
          summary: 'Talia can read Jalen as more confident that the operational risk was handled plainly.'
        },
        sourceOutcomeId: 'outcome-1',
        visible: true
      }]
    }
  },
  packageData: {
    crew: {
      senior: [{ id: 'jalen-orr', name: 'Jalen Orr' }]
    }
  }
});
assert.equal(projectedCharacter.relationshipPerceptions.length, 1);
assert.equal(projectedCharacter.relationshipPerceptions[0].crewName, 'Jalen Orr');
assert.equal(projectedCharacter.relationshipPerceptions[0].impact, 'Slight Improvement');
assert.match(projectedCharacter.relationshipPerceptions[0].cue, /stops pressing/);
assert.match(projectedCharacter.relationshipPerceptions[0].summary, /more confident/);
assert.equal(projectedCharacter.dossier.briefBiography, OVER_LIMIT_CREATOR_BRIEF_BIO);
assert.equal(projectedCharacter.serviceRecord.find((item) => item.title === 'Service Summary')?.summary, OVER_LIMIT_CREATOR_SERVICE_SUMMARY);
assert.equal(projectedCharacter.serviceRecord.find((item) => item.title === 'Command Style')?.summary, OVER_LIMIT_CREATOR_COMMAND_STYLE);

async function assertCampaignPanelsRender(panel) {
  assert.match(textOf(panel), /Mission/);
  assert.match(textOf(panel), /Talia Serrin/);
  assert.match(textOf(panel), /A Ship Underway/);
  assert.match(textOf(panel), /Formal Objectives/);
  assertNoUnwiredPlaceholders(panel);

  await findButton(panel, 'Crew').click();
  assert.match(textOf(panel), /Personnel/);
  assert.match(textOf(panel), /Character/);
  assert.match(textOf(panel), /Service Record/);
  const characterBiography = panel.querySelector('.directive-character-biography-disclosure');
  const characterBiographyToggle = characterBiography?.querySelector('.directive-character-biography-toggle');
  const characterBiographyMore = characterBiography?.querySelector('.directive-character-biography-more');
  assert(characterBiography, 'Character tab should render the player character biography disclosure');
  assert(characterBiographyToggle, 'Long player character biographies should expose a More/Less toggle');
  assert(characterBiographyMore, 'Long player character biographies should keep later paragraphs in a collapsible region');
  assert.equal(characterBiographyToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(characterBiographyMore.hidden, true);
  await characterBiographyToggle.click();
  assert.equal(characterBiographyToggle.getAttribute('aria-expanded'), 'true');
  assert.equal(characterBiographyMore.hidden, false);
  assert.match(textOf(characterBiographyMore), /post-transfer command history available/);
  const serviceRecordSection = panel.querySelector('.directive-character-service-record-section');
  const serviceRecordToggle = serviceRecordSection?.querySelector('.directive-character-section-toggle');
  const serviceRecordContent = serviceRecordSection?.querySelector('.directive-character-section-content');
  assert(serviceRecordSection, 'Character tab should render a Service Record section');
  assert(serviceRecordToggle, 'Service Record should expose a dropdown toggle');
  assert(serviceRecordContent, 'Service Record should render collapsible content');
  assert.equal(serviceRecordToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(serviceRecordContent.hidden, true, 'Service Record should be collapsed by default');
  await serviceRecordToggle.click();
  assert.equal(serviceRecordToggle.getAttribute('aria-expanded'), 'true');
  assert.equal(serviceRecordContent.hidden, false);
  assert.match(textOf(serviceRecordSection), /Tactical service record/);
  assert(textOf(serviceRecordSection).includes(OVER_LIMIT_CREATOR_SERVICE_SUMMARY), 'Service Record should show the full generated Service Summary once expanded');
  assert.match(textOf(panel), /Command Bearing/);
  assert.match(textOf(panel), /Standing With Senior Staff/);
  const crewSubtab = findButtonByDataset(panel, 'directiveCrewSubtab', 'crew');
  await crewSubtab.click();
  assert.match(textOf(panel), /Mara Whitaker/);
  assert.match(textOf(panel), /Hadrik Bronn/);
  assert.match(textOf(panel), /Talia Serrin/);
  assert.match(textOf(panel), /Command division/);
  assert.doesNotMatch(textOf(panel), /Crew Continuity/);
  assert.doesNotMatch(textOf(panel), /Relationship continuity is active/);
  assertNoUnwiredPlaceholders(panel);

  await findButton(panel, 'Ship').click();
  assert.match(textOf(panel), /U\.S\.S\. Breckenridge/);
  assert.match(textOf(panel), /Intrepid-class/);
  assert.match(textOf(panel), /Known Technical Debt/);
  assert.match(textOf(panel), /Command-network certificate compatibility issue/);
  assertNoUnwiredPlaceholders(panel);

  await findButton(panel, 'Log').click();
  assert.match(textOf(panel), /Campaign Start/);
  assert.match(textOf(panel), /accepted assignment/);
  assert.match(textOf(panel), /First mission state initialized from package projection/);
  assertNoUnwiredPlaceholders(panel);

  await findButton(panel, 'Settings').click();
  assertActiveSettingsSubtab(panel, 'Systems');
  const systemsSection = queryAll(panel, '.directive-settings-section').find((section) => section.id === 'directive-settings-systems-section');
  const systemsText = textOf(systemsSection);
  assert.match(systemsText, /Max Turn Save History/);
  assert.match(systemsText, /Autosave Every Messages/);
  assert.match(systemsText, /Apply/);
  assert.doesNotMatch(systemsText, /Command Bearing/);
  assert.doesNotMatch(systemsText, /Simulation Mode/);
  assert.doesNotMatch(systemsText, /Allowed Modes/);
  assert.doesNotMatch(systemsText, /Consequence Policy/);
  assert.doesNotMatch(systemsText, /Mode Summary/);
  await findButton(panel, 'Safety').click();
  assertActiveSettingsSubtab(panel, 'Safety');
  assert.match(textOf(panel), /Storage Check/);
  assert.match(textOf(panel), /Refresh Diagnostics/);
  assert.match(textOf(panel), /Reload Active Save/);
  assert.match(textOf(panel), /Safety/);
  assert.match(textOf(panel), /Verify Active Save/);
  assert.match(textOf(panel), /Settle Active State/);
  assert.match(textOf(panel), /Export Active Save/);
  assert.match(textOf(panel), /Clean Missing Records/);
  assertNoUnwiredPlaceholders(panel);
  await findButton(panel, 'Refresh Diagnostics').click();
  assert.match(textOf(panel), /Storage Check/);
  assert.match(textOf(panel), /Storage diagnostics refreshed/);
  await findButton(panel, 'Verify Active Save').click();
  assert.match(textOf(panel), /verified at revision/);
  await findButton(panel, 'Export Active Save').click();
  assert.match(textOf(panel), /Prepared directive-save-/);
  await findButton(panel, 'Clean Missing Records').click();
  assert.match(textOf(panel), /No missing index records needed cleanup/);
  await findButton(panel, 'Reload Active Save').click();
  assert.match(textOf(panel), /Active Save\s+Active save mounted/);

  await findButton(panel, 'Mission').click();
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');
const adapter = createMemoryJsonAdapter();
const generation = createCreatorFlowGenerationClient();
const host = createFakeDirectiveHost({
  chatNative: true,
  storage: adapter,
  generation,
  chatOptions: {
    chatId: 'shell-flow-pre-campaign-chat',
    entityName: 'Captain Whitaker'
  }
});
const fakeDocument = new FakeDocument();
let idSequence = 0;
globalThis.document = fakeDocument;

const app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => ({
    packages: [packageData],
    projections: [projection],
    crewDatasets: [{
      path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs: [{
      path: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
      graph: missionGraph
    }]
  }),
  narrationProvider: {
    id: 'shell-narrator',
    async generateNarration() {
      return {
        providerId: 'shell-narrator',
        text: 'The Breckenridge accepts the order and folds the result into the active mission log.'
      };
    }
  },
  // Distinct ids are required because Save Game As creates another save slot.
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
assert.match(textOf(panel), /Ashes of Peace\s+U\.S\.S\. Breckenridge \/ Intrepid-class/);
assert.match(textOf(panel), /Campaign Library/);
assert.doesNotMatch(textOf(panel), /Import Status\s+Ready/);
assert.equal(findButton(panel, 'Choose File').disabled, false);

const packageImportZip = createStoredZip([{
  path: 'package/ashes-of-peace.campaign-package.json',
  text: JSON.stringify(packageData)
}, {
  path: 'package/ashes-of-peace.campaign-projection.json',
  text: JSON.stringify(projection)
}, {
  path: 'package/breckenridge-senior-staff.crew-dataset.json',
  text: JSON.stringify(crewDataset)
}, {
  path: 'package/prelude-a-ship-underway.mission-graph.json',
  text: JSON.stringify(missionGraph)
}]);
await app.importCampaignPackageArchive({
  fileName: 'ashes-of-peace-copy.directive-campaign.zip',
  bytes: packageImportZip
});
await showDirectiveRuntimePanel();
assert.match(textOf(panel), /Import Diagnostics/);
assert.match(textOf(panel), /Last Import\s+Stored/);
assert.match(textOf(panel), /Source\s+imported/);

const incompletePackage = cloneJson(packageData);
incompletePackage.manifest.id = 'directive:campaign-package:incomplete-import-test';
incompletePackage.manifest.slug = 'incomplete-import-test';
incompletePackage.manifest.title = 'Incomplete Import Test';
incompletePackage.ship.id = 'incomplete-import';
incompletePackage.ship.name = 'U.S.S. Incomplete';
const incompleteImportZip = createStoredZip([{
  path: 'package/incomplete.campaign-package.json',
  text: JSON.stringify(incompletePackage)
}]);
await app.importCampaignPackageArchive({
  fileName: 'incomplete.directive-campaign.zip',
  bytes: incompleteImportZip
});
const importView = await app.getCurrentView({ tabId: 'campaign' });
const incompleteCard = importView.campaign.packages.find((pack) => pack.packageId === incompletePackage.manifest.id);
assert(incompleteCard, 'incomplete imported package should be visible for diagnostics');
assert.equal(incompleteCard.actions.startNewCampaign, false);
assert.equal(incompleteCard.runtimeAssets.hasProjection, false);

const campaignLibraryText = textOf(panel);
assert.match(campaignLibraryText, /Campaign Briefing/);
assert.match(campaignLibraryText, /Mara Whitaker/);
assert.doesNotMatch(campaignLibraryText, /Runtime Projection/);
assert.doesNotMatch(campaignLibraryText, /Mission Graphs/);
assert.doesNotMatch(campaignLibraryText, /Package Health/);
const newCampaignButton = await findButton(panel, 'New Campaign');
assert(newCampaignButton.querySelector('.fa-wand-magic-sparkles'), 'New Campaign should use a sparkle icon');
await newCampaignButton.click();
assert.match(textOf(panel), /Character Creator/);
assert.match(textOf(panel), /Commander, Executive Officer/);
assert.equal(findControl(panel, 'settings.simulationMode').value, 'Command');
assert.match(textOf(panel), /Campaign Difficulty/);
assert.match(textOf(panel), /Story-forward/);
assert.match(textOf(panel), /Full simulation/);
let difficultyOptions = queryAll(panel, '.directive-creator-difficulty-option');
assert.equal(difficultyOptions.length, 2, 'Character Creator should render visible Campaign Difficulty options');
assert.equal(
  difficultyOptions.some((button) => button.dataset.creatorDifficultyOption === 'Command' && button.dataset.selected === 'true'),
  true,
  'Command should be the visible default Campaign Difficulty'
);
assert.doesNotMatch(textOf(panel), /Return to Campaign/);
assert.match(textOf(panel), /Campaign Library/);
assert.equal(findButton(panel, 'Back').disabled, true);
let sectionWands = queryAll(panel, '.directive-creator-section-wand');
assert.equal(sectionWands.length, 4, 'Character Creator should render one wand helper per guided section');
assert.equal(sectionWands.some((button) => button.dataset.creatorSectionWand === 'identity'), true);
for (const path of [
  'identity.appearance',
  'dossier.serviceSummary',
  'dossier.traits',
  'dossier.briefBiography',
  'dossier.publicReputation'
]) {
  assert.equal(findControl(panel, path).maxLength, CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT, `${path} should use the self-fill character limit`);
  assert.equal(findControl(panel, path).getAttribute('maxlength'), String(CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT), `${path} should expose the self-fill maxlength attribute`);
}

await findButton(panel, 'Campaign Library').click();
let drafts = await listCharacterCreatorDrafts(adapter);
assert.equal(drafts.length, 0, 'empty creator draft should be discarded when returning to Campaign Library');
assert.doesNotMatch(textOf(panel), /Continue Character Setup/, 'empty creator draft should not produce resume action');

await findButton(panel, 'New Campaign').click();
setControl(panel, 'identity.name', 'Temporary Officer');
await findButton(panel, 'Discard Character').click();
drafts = await listCharacterCreatorDrafts(adapter);
assert.equal(drafts.length, 0, 'Discard Character should delete the active in-progress draft');
assert.doesNotMatch(textOf(panel), /Continue Character Setup/, 'discarded creator draft should not produce resume action');

await findButton(panel, 'New Campaign').click();

sectionWands = queryAll(panel, '.directive-creator-section-wand');
const identityWand = sectionWands.find((button) => button.dataset.creatorSectionWand === 'identity');
assert(identityWand, 'Identity section wand should be present');
await identityWand.click();
assert.equal(findControl(panel, 'identity.name').value, '', 'Local fallback should preview instead of auto-applying an empty section');
assert.match(textOf(panel), /Suggested Draft/);
assert.match(textOf(panel), /Local fallback/);
await findButton(panel, 'Apply').click();
assert.equal(findControl(panel, 'identity.name').value, 'Ari Venn');
assert.equal(findControl(panel, 'identity.speciesId').value, 'human');
let creatorDraftCalls = generation.calls().filter((call) => call.role === 'characterCreatorSectionDraft');
assert.equal(creatorDraftCalls.length, 1, 'Identity wand should request a Character Creator section draft');
assert.equal(creatorDraftCalls[0].request.mode, 'create');

setControl(panel, 'identity.name', 'Sam Vickers');
setControl(panel, 'identity.pronounsOrAddress', '');
setControl(panel, 'identity.speciesId', 'human');
setControl(panel, 'identity.ageBandId', 'mid-career');
setControl(panel, 'identity.appearance', '');
await identityWand.click();
creatorDraftCalls = generation.calls().filter((call) => call.role === 'characterCreatorSectionDraft');
assert.equal(creatorDraftCalls.length, 2, 'Partial identity wand should make a second provider request');
assert.equal(creatorDraftCalls[1].request.mode, 'refine');
assert.match(textOf(panel), /Suggested Refinement/);
assert.equal(findControl(panel, 'identity.name').value, 'Sam Vickers', 'Partial identity refine should preview before applying');
await findButton(panel, 'Apply').click();
assert.equal(findControl(panel, 'identity.pronounsOrAddress').value, 'they/them');
assert.match(findControl(panel, 'identity.appearance').value, /steady presence expected of the Executive Officer/);

setControl(panel, 'identity.name', 'Cancel Pending');
const cancelingIdentityDraft = identityWand.click();
assert.equal(identityWand.dataset.creatorAssistBusy, 'true', 'Busy creator wand should remain active for cancellation');
assert(identityWand.querySelector('.fa-xmark'), 'Busy creator wand should swap the wand icon for a cancel X');
assert.match(textOf(panel), /Generating with Reasoning/, 'Pending creator assist should name the active provider lane');
const identityAssistControl = identityWand.closest('.directive-creator-section-assist-control');
assert(identityAssistControl, 'Creator wand should be wrapped with an assist control');
assert.equal(identityAssistControl.dataset.creatorAssistBusy, 'true');
assert(identityAssistControl.querySelector('.directive-creator-assist-busy-spinner'), 'Busy creator assist should render a spinner next to the wand');
await identityWand.click();
await cancelingIdentityDraft;
assert.equal(identityWand.dataset.creatorAssistBusy, 'false');
assert(identityWand.querySelector('.fa-wand-magic-sparkles'), 'Canceled creator wand should restore the wand icon');
assert.match(textOf(panel), /Draft canceled\./);

setControl(panel, 'identity.name', 'Talia Serrin');
setControl(panel, 'identity.pronounsOrAddress', 'she/her');
setControl(panel, 'identity.speciesId', 'human');
setControl(panel, 'identity.ageBandId', 'mid-career');
setControl(panel, 'identity.appearance', 'A composed officer with a quiet voice and a habit of watching the room before speaking.');
await findButton(panel, 'Next: Service').click();
assert.equal(findControl(panel, 'settings.simulationMode').value, 'Command');

drafts = await listCharacterCreatorDrafts(adapter);
assert.equal(drafts.length, 1);
assert.equal(drafts[0].status, 'inProgress');
assert.equal(drafts[0].progress.hasMeaningfulInput, true);
assert.equal(drafts[0].progress.identityComplete, true);
assert.equal(drafts[0].progress.readyForCampaignStart, false);

await resetDirectiveRuntimeLayout();
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'campaign');
assert.equal(panel.dataset.drawerOpen, 'false');
assert.equal(panel.dataset.fullscreen, 'false');
assert.equal(panel.dataset.workspaceRequired, 'false');
assert.equal(__directiveRuntimeShellTestHooks.getLayout().shelfLeft, 16);
drafts = await listCharacterCreatorDrafts(adapter);
assert.equal(drafts.length, 1, 'Reset Window should not delete stored creator drafts');
assert.equal(drafts[0].status, 'inProgress');
assert.match(textOf(panel), /Campaign Library/);
await findButton(panel, 'Continue Character Setup').click();
assert.equal(findControl(panel, 'identity.name').value, 'Talia Serrin');
assert.equal(findButton(panel, 'Back').disabled, false);

setControl(panel, 'service.careerBackgroundId', 'tactical-security');
setControl(panel, 'service.formativeExperienceId', 'dominion-war-fleet-service');
setControl(panel, 'service.assignmentReasonId', 'experienced-outsider-transfer');
const serviceWand = queryAll(panel, '.directive-creator-section-wand').find((button) => button.dataset.creatorSectionWand === 'service');
await serviceWand.click();
assert.match(textOf(panel), /Suggested Refinement/);
assert.match(textOf(panel), /Tactical service record/);
await findButton(panel, 'Apply').click();
assert.equal(findControl(panel, 'dossier.serviceSummary').value, OVER_LIMIT_CREATOR_SERVICE_SUMMARY);
assert(findControl(panel, 'dossier.serviceSummary').value.length > CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT);
await findButton(panel, 'Next: Personality').click();
setControl(panel, 'personality.traits.insight', 'perceptive');
setControl(panel, 'personality.traits.connection', 'candid');
setControl(panel, 'personality.traits.execution', 'decisive');
setControl(panel, 'personality.flawId', 'impatient');
const personalityWand = queryAll(panel, '.directive-creator-section-wand').find((button) => button.dataset.creatorSectionWand === 'personality');
await personalityWand.click();
assert.match(textOf(panel), /Command style is perceptive/);
await findButton(panel, 'Apply').click();
assert.match(findControl(panel, 'dossier.traits').value, /Command style is perceptive/);
await findButton(panel, 'Next: Review').click();
assert.match(findControl(panel, 'dossier.briefBiography').value, /Talia Serrin/);
assert.match(findControl(panel, 'dossier.publicReputation').value, /Talia Serrin/);
setControl(panel, 'dossier.briefBiography', OVER_LIMIT_CREATOR_BRIEF_BIO);
setControl(panel, 'dossier.publicReputation', 'Talia Serrin is known as a decisive and observant officer whose restraint has improved since the war.');
difficultyOptions = queryAll(panel, '.directive-creator-difficulty-option');
const explorationDifficulty = difficultyOptions.find((button) => button.dataset.creatorDifficultyOption === 'Exploration');
assert(explorationDifficulty, 'Exploration Campaign Difficulty option should be present');
await explorationDifficulty.click();
await findButton(panel, 'Save Draft').click();
assert.equal(findControl(panel, 'settings.simulationMode').value, 'Exploration');
assert.match(textOf(panel), /No player or senior staff death/);

drafts = await listCharacterCreatorDrafts(adapter);
assert.equal(drafts[0].progress.readyForCampaignStart, true, JSON.stringify(drafts[0].progress));
assert.equal(findButton(panel, 'Start Campaign').disabled, false);
let observedMissionRouteBeforeChatCreate = false;
const originalCreateOrBindCampaignChat = host.chat.createOrBindCampaignChat.bind(host.chat);
host.chat.createOrBindCampaignChat = async (options = {}) => {
  observedMissionRouteBeforeChatCreate = true;
  assert.equal(
    __directiveRuntimeShellTestHooks.getActiveTab(),
    'mission',
    'Start Campaign should persist the Mission route before host chat creation can reload the extension.'
  );
  assert.equal(
    __directiveRuntimeShellTestHooks.getLayout().activeRoute,
    'mission',
    'The persisted shell route should already be Mission when host chat creation starts.'
  );
  return originalCreateOrBindCampaignChat(options);
};
try {
  await findButton(panel, 'Start Campaign').click();
} finally {
  host.chat.createOrBindCampaignChat = originalCreateOrBindCampaignChat;
}
assert.equal(observedMissionRouteBeforeChatCreate, true);
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'mission');

await assertCampaignPanelsRender(panel);
assert.match(textOf(panel), /Mode\s+Exploration/);
await findButton(panel, 'Campaign').click();
const sessionDifficultyFacts = queryAll(panel, '.directive-campaign-session-difficulty-fact');
assert(sessionDifficultyFacts.length >= 1, 'Campaign Command session rows should render Campaign Difficulty metadata.');
assert.match(textOf(sessionDifficultyFacts[0]), /Campaign Difficulty/);
assert.match(textOf(sessionDifficultyFacts[0]), /Exploration/);
assert.match(textOf(sessionDifficultyFacts[0]), /Story-forward/);
await findButton(panel, 'Mission').click();
assert.doesNotMatch(textOf(panel), /Command Input/);
assert.doesNotMatch(textOf(panel), /What does the XO do\?/);
assert.doesNotMatch(textOf(panel), /Preview Outcome/);
assert.match(textOf(panel), /Continue play in the bound campaign chat\./);
await findButton(panel, 'Settings').click();
await findButton(panel, 'Systems').click();
assert.equal(findControl(panel, 'settings.autosaveEveryMessages').value, '20');
let runtimeApplyButton = findButton(panel, 'Apply');
assert.equal(runtimeApplyButton.disabled, true, 'Runtime Apply should be inactive until a setting changes');
setRuntimeControl(panel, 'settings.autosaveEveryMessages', '1');
assert.equal(runtimeApplyButton.disabled, false, 'Runtime Apply should activate after a setting changes');
await runtimeApplyButton.click();
assert.equal(findControl(panel, 'settings.autosaveEveryMessages').value, '1');
await findButton(panel, 'Mission').click();
await app.previewDirectorTurn({
  playerInput: 'I report to Captain Whitaker, acknowledge the active Hesperus situation, and coordinate a cautious response from the bridge.'
});
await showDirectiveRuntimePanel();
assert.match(textOf(panel), /Provisional Outcome/);
assert.match(textOf(panel), /Accept Outcome/);
assert.match(textOf(panel), /Success/);
await findButton(panel, 'Settings').click();
assert.match(textOf(panel), /Clear Preview/);
await findButton(panel, 'Mission').click();
await findButton(panel, 'Accept Outcome').click();
assert.match(textOf(panel), /Latest Committed Outcome/);
assert.doesNotMatch(textOf(panel), /Outcome recorded\./, 'Mission should not show persistence-only last-outcome copy');
assert.match(textOf(panel), /Continue play in the bound campaign chat\./);
await findButton(panel, 'Log').click();
assert.match(textOf(panel), /working transfer/);
const logCards = queryAll(panel, '.directive-log-entry-card');
assert.equal(logCards.length, 2, 'Log should render both campaign start and accepted outcome records');
assert.deepEqual(
  queryAll(panel, '.directive-log-timeline-marker').map((marker) => textOf(marker).trim()),
  ['02', '01'],
  'Log should preserve chronological record numbers while displaying newest records first'
);
assert.match(textOf(logCards[0]), /working transfer/, 'Latest accepted outcome should appear first');
assert.match(textOf(logCards[1]), /Campaign Start/, 'Campaign start should remain the first chronological record');
await findButton(panel, 'Campaign').click();
assert.match(textOf(panel), /Narration completed for the latest committed turn\./);
assert.doesNotMatch(textOf(panel), /sourceOutcomeId|outcome\.turn|```json|"\s*summary/, 'Campaign snapshot should not expose raw command-log sidecar JSON');
await findButton(panel, 'Mission').click();

const saves = await listCampaignSaves(adapter);
assert.equal(saves.length, 2);
assert.equal(saves.some((save) => save.slotType === 'autosave'), true);
const firstSave = saves.find((save) => save.slotType === 'firstSave');
assert(firstSave, 'first save should still exist after autosave');
assert.equal(firstSave.current, true);
assert.equal(firstSave.metadata.playerName, 'Talia Serrin');
const revisionBeforeManualSave = firstSave.revision;

await findButton(panel, 'Campaign').click();
await findButton(panel, 'Records').click();
assert.match(textOf(panel), /Save Library/);
assert(queryAll(panel, '[data-input-path]').every((control) => control.dataset.inputPath !== 'saveAs.name'), 'Records should not render a Save As name field before Save Game As is clicked');
await findButton(panel, 'Save Game').click();
let updatedSaves = await listCampaignSaves(adapter);
assert.equal(updatedSaves.length, 2);
assert.equal(updatedSaves.find((save) => save.slotType === 'firstSave').revision, revisionBeforeManualSave + 1);
await findButton(panel, 'Settings').click();
await findButton(panel, 'Safety').click();
assertActiveSettingsSubtab(panel, 'Safety');
await findButton(panel, 'Settle Active State').click();
assert.match(textOf(panel), /Active state settled into/);
updatedSaves = await listCampaignSaves(adapter);
assert.equal(updatedSaves.find((save) => save.slotType === 'firstSave').revision, revisionBeforeManualSave + 2);
await findButton(panel, 'Providers').click();
assertActiveSettingsSubtab(panel, 'Providers');
assertModelRoutingFolders(panel);
await resetDirectiveRuntimeLayout();
await findButton(panel, 'Settings').click();
assertActiveSettingsSubtab(panel, 'Systems');
await findButton(panel, 'Systems').click();
assert.equal(findControl(panel, 'settings.maxTurnSaveHistory').value, '20');
assert.equal(findControl(panel, 'settings.autosaveEveryMessages').value, '1');
runtimeApplyButton = findButton(panel, 'Apply');
assert.equal(runtimeApplyButton.disabled, true, 'Runtime Apply should reset to inactive after the settings panel rerenders');
setRuntimeControl(panel, 'settings.maxTurnSaveHistory', '8');
assert.equal(runtimeApplyButton.disabled, false, 'Runtime Apply should activate for runtime history changes');
await runtimeApplyButton.click();
assert.equal(findControl(panel, 'settings.maxTurnSaveHistory').value, '8');
assert.equal(findControl(panel, 'settings.autosaveEveryMessages').value, '1');
updatedSaves = await listCampaignSaves(adapter);
assert.equal(updatedSaves.find((save) => save.slotType === 'firstSave').revision, revisionBeforeManualSave + 3);

await findButton(panel, 'Campaign').click();
await findButton(panel, 'Records').click();
await findButton(panel, 'Save Game As...').click();
let saveAsDialog = globalThis.document.body.querySelector('.directive-record-save-as-dialog');
assert(saveAsDialog, 'Save Game As should open a naming dialog');
assert(findButton(saveAsDialog, 'Save'), 'Save Game As dialog should include Save');
assert(findButton(saveAsDialog, 'Cancel'), 'Save Game As dialog should include Cancel');
await findButton(saveAsDialog, 'Cancel').click();
assert.equal(globalThis.document.body.querySelector('.directive-record-save-as-dialog'), null, 'Cancel should close the Save Game As dialog');

await findButton(panel, 'Save Game As...').click();
saveAsDialog = globalThis.document.body.querySelector('.directive-record-save-as-dialog');
assert(saveAsDialog, 'Save Game As should reopen the naming dialog');
const saveAsNameInput = saveAsDialog.querySelector('.directive-record-save-as-name-input');
assert(saveAsNameInput, 'Save Game As dialog should include a save-name input');
saveAsNameInput.value = 'Talia Serrin - Branch Save';
await findButton(saveAsDialog, 'Save').click();
updatedSaves = await listCampaignSaves(adapter);
assert.equal(updatedSaves.length, 3);
assert.equal(updatedSaves.some((save) => save.name === 'Talia Serrin - Branch Save'), true);

await findButton(panel, 'Records').click();
assert.match(textOf(panel), /Save Library/);
let recordRows = queryAll(panel, '.directive-starship-save-row');
const autosaveRow = recordRows.find((row) => /Autosave/i.test(textOf(row)));
assert(autosaveRow, 'Records should render the autosave row before deletion');
await autosaveRow.click();
const autosavesBeforeDelete = (await listCampaignSaves(adapter)).filter((save) => save.slotType === 'autosave');
assert.equal(autosavesBeforeDelete.length, 1);
const autosavePath = (await getDirectiveStorageIndexes(adapter)).saveIndex.saves[autosavesBeforeDelete[0].id].path;
await findButton(panel, 'Delete Save').click();
updatedSaves = await listCampaignSaves(adapter);
assert.equal(updatedSaves.length, 2);
assert.equal(updatedSaves.some((save) => save.slotType === 'autosave'), false);
assert.equal((await getDirectiveStorageIndexes(adapter)).saveIndex.saves[autosavesBeforeDelete[0].id], undefined);
assert.equal((await getDirectiveStorageIndexes(adapter)).storageIndex.files[autosavePath], undefined);
recordRows = queryAll(panel, '.directive-starship-save-row');
assert.equal(recordRows.some((row) => /Autosave/i.test(textOf(row))), false, 'Records should remove the deleted autosave row');
await findButton(panel, 'Load Save').click();
await assertCampaignPanelsRender(panel);

__directiveRuntimeShellTestHooks.reset();
delete globalThis.document;

console.log('Runtime shell creator flow tests passed: package import, draft save, resume, begin campaign, first save, save as, delete save, load, state-backed runtime panels');
