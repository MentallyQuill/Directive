import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { renderCampaignPanel, resetCampaignPanelState } from '../../src/ui/campaign-panel.js';
import { renderMissionPanel } from '../../src/ui/mission-panel.js';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';
import { withTerminalDecisionLedgerProjection } from '../../src/runtime/terminal-decision-ledger-view.mjs';

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
    { id: 'keepEnding', action: 'keepEnding', label: 'Keep this ending' }
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
state.runtimeTracking.pendingInteractions = [];
const terminalLedger = {
  schemaVersion: 1,
  activeDecisionId: 'terminal-decision-ui',
  detections: [],
  decisions: [{
    id: 'terminal-decision-ui',
    authority: 'terminalDecisionProjection',
    coreProjection: {
      kind: 'directive.terminalEndConditionLedgerProjectionRef.v1',
      rowKind: 'decision',
      decisionId: 'terminal-decision-ui',
      status: 'pending'
    },
    status: 'pending',
    terminalOutcomeBand: 'Great Failure',
    finalCampaignBand: 'Partial Success',
    checkpoint: cloneJson(terminalInteraction.metadata.checkpoint),
    playerFacingSummary: terminalInteraction.metadata.reason,
    condition: {
      continuationFrameIds: ['survivors-after-breck-loss']
    }
  }, {
    id: 'terminal-decision-ui-legacy-decoy',
    status: 'pending',
    terminalOutcomeBand: 'Legacy Failure',
    finalCampaignBand: 'Legacy Ending',
    playerFacingSummary: 'Legacy unowned terminal decision must not render.'
  }],
  branchRecords: [],
  continuationFrames: []
};
state = withTerminalDecisionLedgerProjection(state, terminalLedger);
state.runtimeTracking.endConditionLedger = {
  schemaVersion: 1,
  activeDecisionId: 'terminal-decision-ui-legacy-decoy',
  detections: [],
  decisions: [{
    id: 'terminal-decision-ui-legacy-decoy',
    status: 'pending',
    terminalOutcomeBand: 'Legacy Failure',
    finalCampaignBand: 'Legacy Ending',
    playerFacingSummary: 'Legacy unowned terminal decision must not render.'
  }],
  branchRecords: [{
    id: 'terminal-branch:legacy-decoy',
    saveId: 'save-terminal-legacy-decoy',
    decisionId: 'terminal-decision-ui'
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
    pendingInteractions: []
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
assert.match(missionText, /The Breckenridge is lost but the Reach objective may still be saved/);
assert.doesNotMatch(missionText, /Legacy Failure/);
assert.doesNotMatch(missionText, /Legacy Ending/);
assert.doesNotMatch(missionText, /Revise Order/);
for (const [label, action] of [
  ['Replay from checkpoint', 'replayFromCheckpoint'],
  ['Push On', 'pushOn'],
  ['Keep this ending', 'keepEnding']
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
  'keepEnding'
]);

const nestedSceneReconciliationBody = document.createElement('main');
const nestedSceneReconciliationState = cloneJson(state);
nestedSceneReconciliationState.sceneReconciliation = undefined;
nestedSceneReconciliationState.runtimeTracking.sceneReconciliation = {
  pending: [{
    id: 'nested-scene-review',
    status: 'pending',
    summary: 'Nested scene review must not render.',
    allowedRoots: ['mission']
  }]
};
renderMissionPanel(nestedSceneReconciliationBody, {
  campaignState: nestedSceneReconciliationState,
  chatNative: {
    binding: { chatId: 'terminal-chat', chatName: 'Directive - Ashes of Peace' }
  },
  campaign: { saves: [] },
  activePackage: { campaign: { chapters: [] } },
  openWorld: { quests: [], opportunities: [] }
}, {
  resolveTerminalOutcomeDecision: async () => {},
  openCampaignChat: async () => {},
  refresh: async () => {}
});
const nestedSceneReconciliationText = textOf(nestedSceneReconciliationBody);
assert.doesNotMatch(nestedSceneReconciliationText, /Nested scene review must not render/);
assert.doesNotMatch(nestedSceneReconciliationText, /Changed Passage/);

const topLevelSceneReconciliationBody = document.createElement('main');
const topLevelSceneReconciliationState = cloneJson(nestedSceneReconciliationState);
topLevelSceneReconciliationState.sceneReconciliation = {
  pending: [{
    id: 'top-level-scene-review',
    status: 'pending',
    summary: 'Top-level scene review should render.',
    allowedRoots: ['mission']
  }]
};
renderMissionPanel(topLevelSceneReconciliationBody, {
  campaignState: topLevelSceneReconciliationState,
  chatNative: {
    binding: { chatId: 'terminal-chat', chatName: 'Directive - Ashes of Peace' }
  },
  campaign: { saves: [] },
  activePackage: { campaign: { chapters: [] } },
  openWorld: { quests: [], opportunities: [] }
}, {
  resolveTerminalOutcomeDecision: async () => {},
  openCampaignChat: async () => {},
  refresh: async () => {}
});
const topLevelSceneReconciliationText = textOf(topLevelSceneReconciliationBody);
assert.match(topLevelSceneReconciliationText, /Top-level scene review should render/);
assert.match(topLevelSceneReconciliationText, /Changed Passage/);

resetCampaignPanelState();
const recordsBody = document.createElement('main');
let loadedCheckpoint = '';
renderCampaignPanel(recordsBody, {
  campaign: { packages: [] },
  campaignIndex: {
    selectedCampaignId: 'campaign-end-condition-ui-test',
    campaigns: [{
      id: 'campaign-end-condition-ui-test',
      title: 'Ashes of Peace',
      playerName: 'Talia Serrin',
      playerRole: 'Executive Officer',
      status: 'complete',
      setting: 'Asterion Reach',
      chapter: 'The Last Directive',
      lastPlayedAt: '2026-06-23T12:00:00.000Z',
      premise: 'The completed campaign remains loadable through its immutable checkpoints.',
      packageId: 'directive:campaign-package:breckenridge-ashes-of-peace',
      image: { kind: 'ship.hero', subjectId: 'uss-breckenridge' },
      mediaPackage: { packageId: 'directive:campaign-package:breckenridge-ashes-of-peace', assets: {} },
      active: false,
      canOpenChat: false,
      canSaveGame: false,
      activeTimeline: { saveId: 'save-terminal-ui', chatBinding: null },
      checkpoints: [{
        id: 'checkpoint-terminal-ui',
        name: 'Before the Last Directive',
        chapter: 'The Last Directive',
        stardate: 53049.2,
        createdAt: '2026-06-23T11:30:00.000Z',
        loadable: true
      }]
    }]
  },
}, {
  refresh: async () => {},
  selectCampaign: async () => {},
  loadCheckpoint: async ({ checkpointId }) => { loadedCheckpoint = checkpointId; },
  deleteSave: async () => {}
});
assert.match(textOf(recordsBody), /Complete/);
assert.match(textOf(recordsBody), /Before the Last Directive/);
assert.doesNotMatch(textOf(recordsBody), /Terminal Branch|Load Campaign|Archive/);
await recordsBody.querySelector('.campaign-save-row').click();
await findButton(recordsBody, 'Load Game').click();
assert.equal(loadedCheckpoint, 'checkpoint-terminal-ui');

delete globalThis.document;
console.log('End-condition UI contract tests passed: Mission terminal card and completed-campaign checkpoint loading');
