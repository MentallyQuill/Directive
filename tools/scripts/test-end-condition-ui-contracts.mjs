import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { renderCampaignPanel, resetCampaignPanelState } from '../../src/ui/campaign-panel.js';
import { renderMissionPanel } from '../../src/ui/mission-panel.js';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));

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
    for (const className of classes.filter(Boolean)) this.values.add(className);
    this.syncToElement();
  }

  remove(...classes) {
    for (const className of classes.filter(Boolean)) this.values.delete(className);
    this.syncToElement();
  }

  contains(className) {
    return this.values.has(className);
  }

  toggle(className, force) {
    const shouldAdd = force === undefined ? !this.values.has(className) : Boolean(force);
    if (shouldAdd) this.values.add(className);
    else this.values.delete(className);
    this.syncToElement();
    return shouldAdd;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.textContent = '';
    this.title = '';
    this.type = '';
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.rows = 0;
    this._className = '';
    this.classList = new FakeClassList(this);
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
    if (name === 'class') this.className = normalized;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = normalized;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'class') this.className = '';
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.textContent = '';
    this.append(...nodes);
  }

  addEventListener(type, handler) {
    this.eventListeners.set(type, handler);
  }

  async click() {
    if (this.disabled) return;
    const handler = this.eventListeners.get('click');
    if (handler) {
      await handler({
        type: 'click',
        target: this,
        currentTarget: this,
        preventDefault() {},
        stopPropagation() {}
      });
    }
  }

  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector === '[data-input-path]') return typeof this.dataset.inputPath === 'string';
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
    return matches;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body', this);
    this.documentElement = new FakeElement('html', this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
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

const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const terminalInteraction = {
  id: 'terminal-decision-ui',
  kind: 'terminalOutcomeDecision',
  status: 'pending',
  turnId: 'turn-ui-terminal',
  outcomeId: 'outcome-ui-terminal',
  prompt: 'Directive Checkpoint',
  options: [
    { id: 'replayFromCheckpoint', action: 'replayFromCheckpoint', label: 'Replay from checkpoint' },
    { id: 'pushOn', action: 'pushOn', label: 'Push On' },
    { id: 'keepEnding', action: 'keepEnding', label: 'Keep this ending' },
    { id: 'saveTerminalBranch', action: 'saveTerminalBranch', label: 'Save as branch' }
  ],
  metadata: {
    decisionId: 'terminal-decision-ui',
    terminalOutcomeBand: 'Great Failure',
    finalCampaignBandCandidate: 'Partial Success',
    reason: 'The Breckenridge is lost but the Reach objective may still be saved.',
    checkpoint: {
      source: 'coreCheckpoint',
      retained: true,
      coreCheckpointRef: {
        kind: 'directive.coreMechanicsCheckpointRef.v1',
        campaignId: 'campaign-end-condition-ui-test',
        saveId: 'save-end-condition-ui-test',
        checkpointId: 'core-checkpoint-end-condition-ui-test',
        layout: 'core',
        sourceKind: 'coreStoreV2.checkpoint',
        sourceRevision: 1
      }
    },
    continuationFrameIds: ['survivors-after-breck-loss']
  }
};

globalThis.document = new FakeDocument();
let state = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
state.campaign = {
  ...(state.campaign || {}),
  id: 'campaign-end-condition-ui-test',
  title: 'Ashes of Peace',
  status: 'active'
};
state.runtimeTracking.pendingInteractions = [cloneJson(terminalInteraction)];
state.runtimeTracking.endConditionLedger = {
  schemaVersion: 1,
  activeDecisionId: 'terminal-decision-ui',
  detections: [],
  decisions: [{
    id: 'terminal-decision-ui',
    status: 'pending',
    terminalOutcomeBand: 'Great Failure',
    finalCampaignBand: 'Partial Success',
    checkpoint: cloneJson(terminalInteraction.metadata.checkpoint),
    playerFacingSummary: terminalInteraction.metadata.reason,
    condition: {
      continuationFrameIds: ['survivors-after-breck-loss']
    }
  }],
  branchRecords: [{
    id: 'terminal-branch:save-terminal-ui',
    saveId: 'save-terminal-ui',
    decisionId: 'terminal-decision-ui',
    conditionId: 'terminal.ashes.breck-destroyed-objective-saved'
  }],
  continuationFrames: []
};

const missionBody = document.createElement('main');
const terminalActions = [];
renderMissionPanel(missionBody, {
  campaignState: state,
  chatNative: {
    binding: { chatId: 'terminal-chat', chatName: 'Directive - Ashes of Peace' },
    prompt: { revision: 4 },
    tracking: {
      revision: 8,
      lastStableRevision: 8,
      ingressCount: 2,
      lastCommittedTurn: {
        outcomeId: 'outcome-ui-terminal',
        resultBand: 'Great Failure',
        narrationStatus: 'complete',
        responseStatus: 'complete'
      }
    },
    pendingInteractions: [cloneJson(terminalInteraction)]
  },
  campaign: { saves: [] },
  activePackage: { campaign: { chapters: [] } },
  openWorld: { quests: [], opportunities: [] }
}, {
  resolveTerminalOutcomeDecision: async (payload) => terminalActions.push(cloneJson(payload)),
  openCampaignChat: async () => {},
  refresh: async () => {}
});

const missionText = textOf(missionBody);
assert.match(missionText, /Directive Checkpoint/);
assert.match(missionText, /Terminal decision/);
assert.match(missionText, /Great Failure/);
assert.match(missionText, /Partial Success/);
assert.match(missionText, /CoreCheckpoint/);
assert.match(missionText, /Saved Terminal Branches\s+1/);
assert.match(missionText, /The Breckenridge is lost but the Reach objective may still be saved/);
assert.doesNotMatch(missionText, /Revise Order/);
for (const [label, action] of [
  ['Replay from checkpoint', 'replayFromCheckpoint'],
  ['Push On', 'pushOn'],
  ['Keep this ending', 'keepEnding'],
  ['Save as branch', 'saveTerminalBranch']
]) {
  await findButton(missionBody, label).click();
  assert.deepEqual(terminalActions.at(-1), {
    interactionId: 'terminal-decision-ui',
    action
  });
}
assert.deepEqual(terminalActions.map((entry) => entry.action), [
  'replayFromCheckpoint',
  'pushOn',
  'keepEnding',
  'saveTerminalBranch'
]);

resetCampaignPanelState();
const recordsBody = document.createElement('main');
const terminalSave = {
  id: 'save-terminal-ui',
  name: 'Terminal Timeline - Breckenridge Lost',
  slotType: 'manual',
  revision: 1,
  current: false,
  updatedAt: '2026-06-23T12:00:00.000Z',
  metadata: {
    campaignId: 'campaign-end-condition-ui-test',
    campaignTitle: 'Ashes of Peace',
    packageId: 'directive:campaign-package:breckenridge-ashes-of-peace',
    packageTitle: 'U.S.S. Breckenridge: Ashes of Peace - Open World',
    stardate: 53049.2,
    activeMissionId: 'chapter-8-the-last-directive',
    activePhaseId: 'terminal-aftermath',
    simulationMode: 'Command',
    summary: 'Terminal timeline preserved.',
    branch: {
      kind: 'terminalTimeline',
      reason: 'terminalOutcomeDecision',
      parentSaveId: 'save-parent-ui',
      parentSaveName: 'Talia Serrin - Ashes of Peace',
      divergenceOutcomeId: 'outcome-ui-terminal',
      terminalOutcomeId: 'terminal.ashes.breck-destroyed-objective-saved',
      terminalDecisionId: 'terminal-decision-ui',
      terminalConditionId: 'terminal.ashes.breck-destroyed-objective-saved'
    }
  }
};
renderCampaignPanel(recordsBody, {
  campaign: {
    packages: [],
    drafts: [],
    saves: [terminalSave],
    activeSaveId: null
  },
  activeSaveId: null
}, {
  refresh: async () => {},
  setActiveTab: () => {},
  loadGame: async () => {},
  deleteCampaignSave: async () => {}
});
const recordsText = textOf(recordsBody);
assert.match(recordsText, /Terminal Timeline/);
assert.match(recordsText, /Terminal timeline preserved/);
assert.match(recordsText, /Terminal Branch/);
assert.match(recordsText, /Breck Destroyed Objective Saved/);
assert.match(recordsText, /Talia Serrin - Ashes of Peace/);

delete globalThis.document;
console.log('End-condition UI contract tests passed: Mission terminal checkpoint card and Records terminal branch labels');
