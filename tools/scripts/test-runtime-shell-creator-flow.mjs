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

function assertNoUnwiredPlaceholders(rootElement) {
  assert.doesNotMatch(textOf(rootElement), /not wired yet/i);
}

async function assertCampaignPanelsRender(panel) {
  assert.match(textOf(panel), /Mission/);
  assert.match(textOf(panel), /Talia Serrin/);
  assert.match(textOf(panel), /prelude-a-ship-underway/);
  assert.match(textOf(panel), /53049\.2/);
  assert.match(textOf(panel), /Formal Objectives/);
  assertNoUnwiredPlaceholders(panel);

  await findButton(panel, 'Crew').click();
  assert.match(textOf(panel), /Mara Whitaker/);
  assert.match(textOf(panel), /Hadrik Bronn/);
  assert.match(textOf(panel), /Talia Serrin/);
  assert.match(textOf(panel), /Tracked behind the scenes/);
  assertNoUnwiredPlaceholders(panel);

  await findButton(panel, 'Ship').click();
  assert.match(textOf(panel), /U\.S\.S\. Breckinridge/);
  assert.match(textOf(panel), /Intrepid-class/);
  assert.match(textOf(panel), /Known Technical Debt/);
  assert.match(textOf(panel), /Command-network certificate compatibility issue/);
  assertNoUnwiredPlaceholders(panel);

  await findButton(panel, 'Log').click();
  assert.match(textOf(panel), /campaignStart/);
  assert.match(textOf(panel), /accepted assignment/);
  assert.match(textOf(panel), /First mission state initialized from package projection/);
  assertNoUnwiredPlaceholders(panel);

  await findButton(panel, 'Settings').click();
  assert.match(textOf(panel), /Command Bearing/);
  assert.match(textOf(panel), /Simulation Mode/);
  assert.match(textOf(panel), /Allowed Modes/);
  assert.match(textOf(panel), /Storage Diagnostics/);
  assert.match(textOf(panel), /Refresh Diagnostics/);
  assert.match(textOf(panel), /Reload Active Save/);
  assertNoUnwiredPlaceholders(panel);
  await findButton(panel, 'Refresh Diagnostics').click();
  assert.match(textOf(panel), /Storage Diagnostics/);
  await findButton(panel, 'Reload Active Save').click();
  assert.match(textOf(panel), /Active Save\s+save-shell-test-/);

  await findButton(panel, 'Mission').click();
}

const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json');
const adapter = createMemoryJsonAdapter();
const fakeDocument = new FakeDocument();
let idSequence = 0;
globalThis.document = fakeDocument;

const app = createDirectiveRuntimeApp({
  adapter,
  packageLoader: async () => ({
    packages: [packageData],
    projections: [projection],
    crewDatasets: [{
      path: 'packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs: [{
      path: 'packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json',
      graph: missionGraph
    }]
  }),
  narrationProvider: {
    id: 'shell-narrator',
    async generateNarration() {
      return {
        providerId: 'shell-narrator',
        text: 'The Breckinridge accepts the order and folds the result into the active mission log.'
      };
    }
  },
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
assert.match(textOf(panel), /Package Library/);
assert.match(textOf(panel), /Import Status\s+Ready/);
assert.equal(findButton(panel, 'Import Package').disabled, false);

const packageImportZip = createStoredZip([{
  path: 'package/ashes-of-peace.starship-package.json',
  text: JSON.stringify(packageData)
}, {
  path: 'package/ashes-of-peace.campaign-projection.json',
  text: JSON.stringify(projection)
}, {
  path: 'package/breckinridge-senior-staff.crew-dataset.json',
  text: JSON.stringify(crewDataset)
}, {
  path: 'package/prelude-a-ship-underway.mission-graph.json',
  text: JSON.stringify(missionGraph)
}]);
await app.importStarshipPackageArchive({
  fileName: 'ashes-of-peace-copy.directive-starship.zip',
  bytes: packageImportZip
});
await showDirectiveRuntimePanel();
assert.match(textOf(panel), /Imported Packages\s+1/);
assert.match(textOf(panel), /Import Diagnostics/);
assert.match(textOf(panel), /Last Import\s+Stored/);
assert.match(textOf(panel), /Source\s+imported/);

const incompletePackage = cloneJson(packageData);
incompletePackage.manifest.id = 'directive:starship-package:incomplete-import-test';
incompletePackage.manifest.slug = 'incomplete-import-test';
incompletePackage.manifest.title = 'Incomplete Import Test';
incompletePackage.ship.id = 'incomplete-import';
incompletePackage.ship.name = 'U.S.S. Incomplete';
const incompleteImportZip = createStoredZip([{
  path: 'package/incomplete.starship-package.json',
  text: JSON.stringify(incompletePackage)
}]);
await app.importStarshipPackageArchive({
  fileName: 'incomplete.directive-starship.zip',
  bytes: incompleteImportZip
});
const importView = await app.getCurrentView({ tabId: 'starships' });
const incompleteCard = importView.starships.packages.find((pack) => pack.packageId === incompletePackage.manifest.id);
assert(incompleteCard, 'incomplete imported package should be visible for diagnostics');
assert.equal(incompleteCard.actions.startNewCampaign, false);
assert.equal(incompleteCard.runtimeAssets.hasProjection, false);

await findButton(panel, 'Start Campaign').click();
assert.match(textOf(panel), /Character Creator/);
assert.match(textOf(panel), /Commander, Executive Officer/);
assert.equal(findControl(panel, 'settings.simulationMode').value, 'Command');

setControl(panel, 'identity.name', 'Talia Serrin');
setControl(panel, 'identity.pronounsOrAddress', 'she/her');
setControl(panel, 'identity.speciesId', 'human');
setControl(panel, 'identity.ageBandId', 'mid-career');
setControl(panel, 'identity.appearance', 'A composed officer with a quiet voice and a habit of watching the room before speaking.');
await findButton(panel, 'Save Draft').click();
assert.equal(findControl(panel, 'settings.simulationMode').value, 'Command');

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
setControl(panel, 'settings.simulationMode', 'Exploration');
await findButton(panel, 'Save Draft').click();
assert.equal(findControl(panel, 'settings.simulationMode').value, 'Exploration');

drafts = await listCharacterCreatorDrafts(adapter);
assert.equal(drafts[0].progress.readyForCampaignStart, true, JSON.stringify(drafts[0].progress));
assert.equal(findButton(panel, 'Begin').disabled, false);
await findButton(panel, 'Begin').click();

await assertCampaignPanelsRender(panel);
assert.match(textOf(panel), /Mode\s+Exploration/);
assert.match(textOf(panel), /Player Action/);
setControl(panel, 'turn.playerInput', 'I report to Captain Whitaker, acknowledge the active Hesperus situation, and coordinate a cautious response from the bridge.');
await findButton(panel, 'Preview Outcome').click();
assert.match(textOf(panel), /Provisional Outcome/);
assert.match(textOf(panel), /Accept Outcome/);
assert.match(textOf(panel), /Success/);
await findButton(panel, 'Settings').click();
assert.match(textOf(panel), /Clear Preview/);
await findButton(panel, 'Mission').click();
await findButton(panel, 'Accept Outcome').click();
assert.match(textOf(panel), /Last Outcome/);
assert.match(textOf(panel), /Narration\s+complete/);
assert.match(textOf(panel), /Autosave\s+2026-/);
await findButton(panel, 'Log').click();
assert.match(textOf(panel), /working transfer/);
await findButton(panel, 'Mission').click();

const saves = await listCampaignSaves(adapter);
assert.equal(saves.length, 2);
assert.equal(saves.some((save) => save.slotType === 'autosave'), true);
const firstSave = saves.find((save) => save.slotType === 'firstSave');
assert(firstSave, 'first save should still exist after autosave');
assert.equal(firstSave.current, true);
assert.equal(firstSave.metadata.playerName, 'Talia Serrin');

await findButton(panel, 'Save Game').click();
let updatedSaves = await listCampaignSaves(adapter);
assert.equal(updatedSaves.length, 2);
assert.equal(updatedSaves.find((save) => save.slotType === 'firstSave').revision, 2);

setControl(panel, 'saveAs.name', 'Talia Serrin - Branch Save');
await findButton(panel, 'Save As').click();
updatedSaves = await listCampaignSaves(adapter);
assert.equal(updatedSaves.length, 3);
assert.equal(updatedSaves.some((save) => save.name === 'Talia Serrin - Branch Save'), true);

await findButton(panel, 'Starships').click();
assert.match(textOf(panel), /Saves/);
await findButton(panel, 'Load Save').click();
await assertCampaignPanelsRender(panel);

__directiveRuntimeShellTestHooks.reset();
delete globalThis.document;

console.log('Runtime shell creator flow tests passed: package import, draft save, resume, begin campaign, first save, save as, load, state-backed runtime panels');
