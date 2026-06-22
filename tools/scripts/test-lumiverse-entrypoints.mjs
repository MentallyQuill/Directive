import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STATUS_REQUEST_TYPE = 'directive.status.request';
const STATUS_RESPONSE_TYPE = 'directive.status';
const RUNTIME_REQUEST_TYPE = 'directive.runtime.request';
const RUNTIME_RESPONSE_TYPE = 'directive.runtime.response';
const MANIFEST_PATH = path.resolve('spindle.json');
const LUMIVERSE_FRONTEND_SOURCE_PATH = 'src/hosts/lumiverse/frontend.js';
const LUMIVERSE_LIVE_SMOKE_PATH = 'tools/scripts/smoke-lumiverse-live.mjs';

function readManifest() {
  assert.equal(existsSync(MANIFEST_PATH), true, 'spindle.json should exist at repo root');
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(path.resolve(filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function importFresh(filePath) {
  return import(`${pathToFileURL(path.resolve(filePath)).href}?test=${Date.now()}-${Math.random()}`);
}

function setFlag(state, flagId, value) {
  const flag = (state.mission?.outcomeFlags || []).find((item) => item.id === flagId);
  if (!flag) throw new Error(`Missing flag "${flagId}"`);
  flag.value = value;
}

function openWorldReadyProjection(sourceProjection) {
  const projectionRecord = cloneJson(sourceProjection);
  const state = projectionRecord.initialState;
  state.player.name = 'Talia Serrin';
  state.player.creationStatus = 'ready';
  state.worldState.currentLocationId = 'helix-yard-karth';
  state.attentionState.mode = 'open-operations';
  state.attentionState.foregroundQuestId = null;
  state.attentionState.scene = null;
  state.questLedger.foregroundQuestId = null;
  state.questLedger.instances = state.questLedger.instances.map((quest) => (
    quest.id === 'side-the-long-repair'
      ? { ...quest, status: 'available', foreground: false }
      : { ...quest, foreground: false }
  ));
  state.mission = {
    ...(state.mission || {}),
    activeMissionId: null,
    activeMissionGraphId: null,
    activePhaseId: 'open-operations',
    phase: 'Open Operations',
    openWorldManaged: true,
    locationId: 'helix-yard-karth'
  };
  setFlag(state, 'prelude.ship-state', 'complete-with-accepted-limitation');
  setFlag(state, 'prelude.bronn', 'debate-not-closed');
  setFlag(state, 'prelude.priya', 'approval-bottlenecked');
  setFlag(state, 'prelude.hesperus-resolution', 'passengers-transferred');
  return projectionRecord;
}

function createFakeSpindle() {
  const eventHandlers = new Map();
  const frontendHandlers = new Set();
  const permissionDeniedHandlers = new Set();
  const permissionChangedHandlers = new Set();
  const granted = new Set([
    'generation',
    'interceptor',
    'tools',
    'app_manipulation'
  ]);
  const files = new Map();
  const generationCalls = [];
  const storageCalls = [];
  const spindle = {
    logs: [],
    sentFrontend: [],
    files,
    generationCalls,
    storageCalls,
    registeredTools: [],
    unregisteredTools: [],
    interceptors: [],
    log: {
      debug(...args) {
        spindle.logs.push([
          'debug',
          ...args
        ]);
      },
      info(...args) {
        spindle.logs.push([
          'info',
          ...args
        ]);
      },
      warn(...args) {
        spindle.logs.push([
          'warn',
          ...args
        ]);
      },
      error(...args) {
        spindle.logs.push([
          'error',
          ...args
        ]);
      }
    },
    permissions: {
      has(permission) {
        return granted.has(permission);
      },
      async getGranted() {
        return [...granted];
      },
      onDenied(handler) {
        permissionDeniedHandlers.add(handler);
        return () => permissionDeniedHandlers.delete(handler);
      },
      onChanged(handler) {
        permissionChangedHandlers.add(handler);
        return () => permissionChangedHandlers.delete(handler);
      }
    },
    userStorage: {
      async getJson(filePath, options = {}) {
        storageCalls.push({
          method: 'getJson',
          filePath,
          userId: options.userId || null
        });
        return files.has(filePath) ? JSON.parse(JSON.stringify(files.get(filePath))) : options.fallback;
      },
      async setJson(filePath, value, options = {}) {
        storageCalls.push({
          method: 'setJson',
          filePath,
          userId: options.userId || null
        });
        files.set(filePath, JSON.parse(JSON.stringify(value)));
      },
      async exists(filePath, userId = null) {
        storageCalls.push({
          method: 'exists',
          filePath,
          userId
        });
        return files.has(filePath);
      },
      async list(prefix = '', userId = null) {
        storageCalls.push({
          method: 'list',
          filePath: prefix,
          userId
        });
        return [...files.keys()].filter((filePath) => filePath.startsWith(prefix));
      },
      async delete(filePath, userId = null) {
        storageCalls.push({
          method: 'delete',
          filePath,
          userId
        });
        files.delete(filePath);
      }
    },
    connections: {
      async list(userId) {
        storageCalls.push({
          method: 'connections.list',
          filePath: '',
          userId
        });
        return [
          {
            id: 'connection-lumiverse-entrypoint',
            provider: 'openai-compatible',
            api_url: 'http://localhost:1234/v1',
            model: 'entrypoint-model',
            is_default: true,
            has_api_key: true
          }
        ];
      },
      async get(connectionId, userId) {
        storageCalls.push({
          method: 'connections.get',
          filePath: connectionId,
          userId
        });
        return null;
      }
    },
    generate: {
      async quiet(input) {
        generationCalls.push({
          mode: 'quiet',
          input: JSON.parse(JSON.stringify(input))
        });
        return {
          content: 'Lumiverse narration confirms the committed Directive outcome without changing mechanics.'
        };
      },
      async raw(input) {
        generationCalls.push({
          mode: 'raw',
          input: JSON.parse(JSON.stringify(input))
        });
        return {
          content: input.messages?.[0]?.content || ''
        };
      },
      async batch(input) {
        generationCalls.push({
          mode: 'batch',
          input: JSON.parse(JSON.stringify(input))
        });
        return input.requests.map((request, index) => ({
          index,
          success: true,
          content: request.messages?.[0]?.content || ''
        }));
      },
      observe(chatId) {
        return {
          chatId
        };
      }
    },
    on(eventName, handler) {
      if (!eventHandlers.has(eventName)) {
        eventHandlers.set(eventName, new Set());
      }
      eventHandlers.get(eventName).add(handler);
      return () => eventHandlers.get(eventName)?.delete(handler);
    },
    async emit(eventName, payload) {
      let result;
      for (const handler of eventHandlers.get(eventName) || []) {
        result = await handler(payload);
      }
      return result;
    },
    registerTool(tool) {
      spindle.registeredTools.push(tool);
    },
    unregisterTool(name) {
      spindle.unregisteredTools.push(name);
    },
    registerInterceptor(handler, priority) {
      const record = {
        handler,
        priority,
        active: true
      };
      spindle.interceptors.push(record);
      return () => {
        record.active = false;
      };
    },
    onFrontendMessage(handler) {
      frontendHandlers.add(handler);
      return () => frontendHandlers.delete(handler);
    },
    async emitFrontendMessage(payload, userId) {
      for (const handler of frontendHandlers) {
        await handler(payload, userId);
      }
    },
    sendToFrontend(payload, userId) {
      spindle.sentFrontend.push({
        payload,
        userId
      });
    },
    grant(permission) {
      granted.add(permission);
      for (const handler of permissionChangedHandlers) {
        handler({
          permission,
          granted: true,
          allGranted: [...granted]
        });
      }
    },
    revoke(permission) {
      granted.delete(permission);
      for (const handler of permissionChangedHandlers) {
        handler({
          permission,
          granted: false,
          allGranted: [...granted]
        });
      }
    },
    deny(permission, operation) {
      for (const handler of permissionDeniedHandlers) {
        handler({
          permission,
          operation
        });
      }
    }
  };
  return spindle;
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.id = '';
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this.style = {
      setProperty: (name, value) => {
        this.style[name] = String(value);
      }
    };
    this.className = '';
    this.classList = {
      add: (...classNames) => {
        const values = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
        for (const className of classNames) {
          if (className) values.add(className);
        }
        this.className = [...values].join(' ');
      },
      remove: (...classNames) => {
        const values = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
        for (const className of classNames) {
          values.delete(className);
        }
        this.className = [...values].join(' ');
      },
      contains: (className) => String(this.className || '').split(/\s+/).includes(className)
      ,
      toggle: (className, force) => {
        const values = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
        const enabled = force === undefined ? !values.has(className) : Boolean(force);
        if (enabled) values.add(className);
        else values.delete(className);
        this.className = [...values].join(' ');
        return enabled;
      }
    };
    this._textContent = '';
    this.removed = false;
    this.parentNode = null;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node) node.parentNode = this;
      this.children.push(node);
    }
  }

  appendChild(node) {
    if (node) node.parentNode = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) {
      if (child) child.parentNode = null;
    }
    for (const node of nodes) {
      if (node) node.parentNode = this;
    }
    this.children = [...nodes];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  addEventListener(eventName, handler) {
    this.listeners[eventName] = handler;
  }

  remove() {
    this.removed = true;
    if (this.parentNode?.children) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
    this.parentNode = null;
  }

  matchesSelector(selector) {
    const value = String(selector || '').trim();
    if (!value) return false;
    if (value.startsWith('#')) return this.id === value.slice(1);
    if (value.startsWith('.')) {
      return String(this.className || '').split(/\s+/).includes(value.slice(1));
    }
    const dataMatch = value.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/i);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (dataMatch[2] === undefined) return this.dataset[key] !== undefined;
      return this.dataset[key] === dataMatch[2];
    }
    return this.tagName === value;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const selectors = String(selector || '').split(',').map((item) => item.trim()).filter(Boolean);
    const matches = [];
    function visit(element) {
      if (!element) return;
      if (selectors.some((item) => element.matchesSelector?.(item))) {
        matches.push(element);
      }
      for (const child of element.children || []) {
        visit(child);
      }
    }
    for (const child of this.children || []) {
      visit(child);
    }
    return matches;
  }

  set textContent(value) {
    this._textContent = String(value);
  }

  get textContent() {
    return [
      this._textContent,
      ...this.children.map((child) => child?.textContent || '')
    ].join('');
  }
}

function collectText(element) {
  return element.textContent;
}

function findElement(element, predicate) {
  if (!element) {
    return null;
  }
  if (predicate(element)) {
    return element;
  }
  for (const child of element.children || []) {
    const match = findElement(child, predicate);
    if (match) {
      return match;
    }
  }
  return null;
}

const manifest = readManifest();
assert.equal(manifest.identifier, 'directive');
assert.equal(manifest.entry_backend, 'src/hosts/lumiverse/backend.js');
assert.equal(manifest.entry_frontend, 'dist/frontend.js');
assert.equal(manifest.minimum_lumiverse_version, '1.0.4');
assert.deepEqual(manifest.permissions, [
  'generation',
  'interceptor',
  'tools',
  'app_manipulation'
]);
assert.equal(existsSync(path.resolve(manifest.entry_backend)), true);
assert.equal(existsSync(path.resolve('src/frontend.ts')), true);
assert.equal(existsSync(path.resolve(LUMIVERSE_FRONTEND_SOURCE_PATH)), true);

const frontendSource = readFileSync(path.resolve(LUMIVERSE_FRONTEND_SOURCE_PATH), 'utf8');
assert.match(frontendSource, /setDirectiveRuntimeMountHost/, 'Lumiverse frontend should mount the shared runtime shell into a host-owned app mount');
assert.match(frontendSource, /showDirectiveRuntimePanel/, 'Lumiverse frontend should open the shared command-spine runtime shell');
assert.match(frontendSource, /mountApp[\s\S]*app-overlay/, 'Lumiverse frontend should request an app overlay instead of using the drawer tab as the primary UI');
assert.doesNotMatch(frontendSource, /createDirectiveCompactShell/, 'Lumiverse frontend should not use the legacy compact drawer-tab shell');

const liveSmokeSource = readFileSync(path.resolve(LUMIVERSE_LIVE_SMOKE_PATH), 'utf8');
assert.match(liveSmokeSource, /minimum_lumiverse_version|DIRECTIVE_LUMIVERSE_PRESERVE_DEV_MODE|PRESERVE_DEV_MODE|isLocalDevExtension/, 'Lumiverse live smoke should preserve local-dev extension installs under the 1.0.4 Spindle dev-mode contract');
assert.match(liveSmokeSource, /preservedLocalDev|importedLocal|localDev/, 'Lumiverse live smoke output should report import-local and local-dev preservation decisions');
assert.match(liveSmokeSource, /if\s*\(IMPORT_LOCAL\s*&&\s*!preservingDevMode\)/, 'Lumiverse live smoke should not call import-local while preserving a local-dev Directive extension');

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = openWorldReadyProjection(readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json'));
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');
const directorFixture = readJson('tests/fixtures/mission/prelude-hesperus-fraud-director-loop.fixture.json');

const originalSpindle = globalThis.spindle;
const originalLumiverseHooks = globalThis.__directiveLumiverseTestHooks;
const spindle = createFakeSpindle();
globalThis.spindle = spindle;
let idSequence = 0;
const nowValues = [
  '2026-06-19T18:00:00.000Z',
  '2026-06-19T18:01:00.000Z',
  '2026-06-19T18:02:00.000Z',
  '2026-06-19T18:03:00.000Z',
  '2026-06-19T18:04:00.000Z',
  '2026-06-19T18:05:00.000Z',
  '2026-06-19T18:06:00.000Z',
  '2026-06-19T18:07:00.000Z'
];
let nowIndex = 0;
globalThis.__directiveLumiverseTestHooks = {
  packageLoader: async () => ({
    packages: [packageData],
    projections: [{
      path: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
      projection
    }],
    crewDatasets: [{
      path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs: [{
      path: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
      graph: missionGraph
    }]
  }),
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-lumiverse-entrypoint-${idSequence}`;
  },
  now() {
    return nowValues[nowIndex++] || nowValues.at(-1);
  }
};

try {
  const backendModule = await importFresh(manifest.entry_backend);
  const backend = backendModule.directiveLumiverseBackend;
  assert.equal(backend.host.id, 'lumiverse');
  assert.equal(spindle.registeredTools[0].name, 'directive_get_active_situation');
  assert.equal(spindle.registeredTools[0].council_eligible, true);
  assert.deepEqual(spindle.registeredTools.map((tool) => tool.name), [
    'directive_get_active_situation',
    'directive_search_command_log',
    'directive_get_crew_context',
    'directive_get_ship_status'
  ]);
  assert.equal(spindle.registeredTools.every((tool) => tool.council_eligible === true), true);
  assert.equal(spindle.interceptors[0].priority, 80);

  await spindle.emit('MESSAGE_SENT', {
    chatId: 'chat-1',
    messageId: 'message-1'
  });
  await spindle.emit('GENERATION_STARTED', {
    chatId: 'chat-1',
    generationId: 'generation-1'
  });

  const status = await backend.status();
  assert.equal(status.host.displayName, 'Lumiverse');
  assert.equal(status.features.toolsRegistered, true);
  assert.equal(status.features.interceptorRegistered, true);
  assert.equal(status.events.messageEvents, 1);
  assert.equal(status.events.generationEvents, 1);
  assert.equal(status.events.lastEvent.eventName, 'generationStarted');

  await spindle.emitFrontendMessage({
    type: STATUS_REQUEST_TYPE
  }, 'user-1');
  assert.equal(spindle.sentFrontend.length, 1);
  assert.equal(spindle.sentFrontend[0].userId, 'user-1');
  assert.equal(spindle.sentFrontend[0].payload.type, STATUS_RESPONSE_TYPE);

  await spindle.emitFrontendMessage({
    type: STATUS_REQUEST_TYPE
  }, undefined);
  assert.equal(spindle.sentFrontend.length, 1, 'backend must not broadcast status replies without a user id');

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-init',
    action: 'initialize'
  }, 'user-1');
  let runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.userId, 'user-1');
  assert.equal(runtimeResponse.payload.type, RUNTIME_RESPONSE_TYPE);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert.equal(runtimeResponse.payload.payload.summary.initialized, true);
  assert.equal(runtimeResponse.payload.payload.summary.campaign.packageCount, 1);

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-start',
    action: 'startQuickCampaign',
    params: {
      simulationMode: 'Command'
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert.equal(runtimeResponse.payload.payload.summary.campaignState.playerName, 'Talia Serrin');
  assert.equal(runtimeResponse.payload.payload.summary.activeSaveId, 'save-lumiverse-entrypoint-3');
  assert.equal(spindle.files.has('indexes/saves.v1.json'), true);
  assert.equal(spindle.files.has('saves/save-lumiverse-entrypoint-3.v1.json'), true);
  assert.equal(spindle.storageCalls.some((call) => call.userId === 'user-1'), true);

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-manual-save',
    action: 'saveCurrentGame',
    params: {
      summary: 'Lumiverse entrypoint manual save.'
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert.equal(runtimeResponse.payload.payload.result.save.id, 'save-lumiverse-entrypoint-3');
  assert.equal(runtimeResponse.payload.payload.result.save.current, true);
  assert.equal(runtimeResponse.payload.payload.summary.activeSaveId, 'save-lumiverse-entrypoint-3');
  assert.equal(spindle.files.has('saves/save-lumiverse-entrypoint-3.v1.json'), true);

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-load',
    action: 'loadGame',
    params: {
      saveId: 'save-lumiverse-entrypoint-3'
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert.equal(runtimeResponse.payload.payload.summary.activeSaveId, 'save-lumiverse-entrypoint-3');

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-open-world-opportunities',
    action: 'getQuestOpportunities',
    params: {
      playerIntent: 'Review the long repair at Helix Yard.',
      limit: 4
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert(runtimeResponse.payload.payload.result.openWorld.opportunities.some((quest) => quest.id === 'side-the-long-repair'));
  assert(runtimeResponse.payload.payload.summary.campaignState.openWorld.quests.some((quest) => quest.id === 'side-the-long-repair'));

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-open-world-accept',
    action: 'acceptOpenWorldQuest',
    params: {
      questId: 'side-the-long-repair',
      makeForeground: true
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  let lumiverseOpenWorld = runtimeResponse.payload.payload.summary.campaignState.openWorld;
  assert.equal(lumiverseOpenWorld.foregroundQuestId, 'side-the-long-repair');
  assert.equal(lumiverseOpenWorld.quests.find((quest) => quest.id === 'side-the-long-repair').status, 'active');
  assert.doesNotMatch(JSON.stringify(lumiverseOpenWorld), /hiddenFacts|directorOnlyData|rawRelationshipValues|hecate|pale lantern/i);

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-open-world-delegate',
    action: 'delegateOpenWorldQuest',
    params: {
      questId: 'side-the-long-repair',
      actorIds: ['priya-nayar']
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  lumiverseOpenWorld = runtimeResponse.payload.payload.summary.campaignState.openWorld;
  assert.equal(lumiverseOpenWorld.quests.find((quest) => quest.id === 'side-the-long-repair').status, 'delegated');
  assert.deepEqual(runtimeResponse.payload.payload.result.openWorld.assignedActorIds, ['priya-nayar']);

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-open-world-time',
    action: 'advanceOpenWorldTime',
    params: {
      hours: 2,
      reason: 'downtime'
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert.equal(runtimeResponse.payload.payload.result.openWorld.hours, 2);
  assert.equal(runtimeResponse.payload.payload.summary.campaignState.openWorld.locationId, 'helix-yard-karth');

  const sceneSnapshot = directorFixture.input.sceneSnapshot;
  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-preview',
    action: 'previewDirectorTurn',
    params: {
      turnId: 'turn.lumiverse.entrypoint.preview',
      playerInput: sceneSnapshot.playerInput,
      sceneSnapshotOverrides: {
        activeMissionGraphId: sceneSnapshot.activeMissionGraphId,
        activePhaseId: sceneSnapshot.activePhaseId,
        stardate: sceneSnapshot.stardate,
        locationId: sceneSnapshot.locationId,
        presentCharacters: sceneSnapshot.presentCharacters,
        knownFactIds: sceneSnapshot.knownFactIds,
        activeDecisionPointIds: sceneSnapshot.activeDecisionPointIds
      }
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert.equal(runtimeResponse.payload.payload.summary.pendingOutcome.resultBand, 'Partial Success');

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-commit',
    action: 'commitProvisionalDirectorTurn',
    params: {
      confirmWarnings: true,
      generateNarration: true
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert.equal(runtimeResponse.payload.payload.summary.lastOutcome.resultBand, 'Partial Success');
  assert.equal(runtimeResponse.payload.payload.summary.lastNarration.ok, true);
  const quietCall = spindle.generationCalls.find((call) => call.mode === 'quiet');
  assert.equal(Boolean(quietCall), true);
  assert.equal(quietCall.input.userId, 'user-1');
  assert.ok([...spindle.files.keys()].some((filePath) => filePath.startsWith('saves/autosave-')));

  const generationCallCountAfterCommit = spindle.generationCalls.length;
  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-run-no-generation',
    action: 'runDirectorTurn',
    params: {
      turnId: 'turn.lumiverse.entrypoint.no-generation',
      playerInput: sceneSnapshot.playerInput,
      generateNarration: false,
      generateCommandLogSummary: false,
      sceneSnapshotOverrides: {
        activeMissionGraphId: sceneSnapshot.activeMissionGraphId,
        activePhaseId: sceneSnapshot.activePhaseId,
        stardate: sceneSnapshot.stardate,
        locationId: sceneSnapshot.locationId,
        presentCharacters: sceneSnapshot.presentCharacters,
        knownFactIds: sceneSnapshot.knownFactIds,
        activeDecisionPointIds: sceneSnapshot.activeDecisionPointIds
      }
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert.equal(runtimeResponse.payload.payload.summary.lastOutcome.resultBand, 'Partial Success');
  assert.equal(spindle.generationCalls.length, generationCallCountAfterCommit);

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-sidecars',
    action: 'runSidecars'
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert.equal(runtimeResponse.payload.payload.result.sidecars.strategy, 'concurrent');
  assert.equal(runtimeResponse.payload.payload.result.sidecars.results.length, 2);
  assert.equal(runtimeResponse.payload.payload.result.sidecars.results.every((entry) => entry.status === 'complete'), true);
  const batchCall = spindle.generationCalls.find((call) => call.mode === 'batch');
  assert.equal(Boolean(batchCall), true);
  assert.equal(batchCall.input.concurrent, true);
  assert.equal(batchCall.input.userId, 'user-1');
  assert.equal(batchCall.input.requests[0].connection_id, 'connection-lumiverse-entrypoint');
  assert.equal(batchCall.input.requests[0].provider, 'openai-compatible');
  assert.equal(batchCall.input.requests[0].model, 'entrypoint-model');

  const toolResultText = await spindle.emit('TOOL_INVOCATION', {
    toolName: 'directive_get_active_situation',
    args: {}
  });
  const toolResult = JSON.parse(toolResultText);
  assert.equal(toolResult.host.id, 'lumiverse');
  assert.equal(toolResult.runtime.campaignState.playerName, 'Talia Serrin');
  assert.equal(toolResult.safety.hiddenStateIncluded, false);
  assert.equal(toolResult.safety.mutationAllowed, false);

  const logSearchText = await spindle.emit('TOOL_INVOCATION', {
    toolName: 'directive_search_command_log',
    args: {
      query: 'Breckenridge',
      limit: 5
    }
  });
  const logSearch = JSON.parse(logSearchText);
  assert.equal(logSearch.loaded, true);
  assert.equal(logSearch.safety.hiddenStateIncluded, false);
  assert.equal(logSearch.matches.length >= 1, true);
  assert.equal(logSearch.matches.some((entry) => String(entry.summary || '').includes('Breckenridge')), true);

  const crewContextText = await spindle.emit('TOOL_INVOCATION', {
    toolName: 'directive_get_crew_context',
    args: {}
  });
  const crewContext = JSON.parse(crewContextText);
  assert.equal(crewContext.loaded, true);
  assert.equal(crewContext.safety.mutationAllowed, false);
  assert.equal(crewContext.crew.rawValuesHidden, true);
  assert.equal(crewContext.crew.seniorCrew.some((crew) => crew.name === 'Talia Serrin'), true);
  assert.equal(crewContext.crew.seniorCrew.some((crew) => crew.name === 'Mara Whitaker'), true);

  const shipStatusText = await spindle.emit('TOOL_INVOCATION', {
    toolName: 'directive_get_ship_status',
    args: {}
  });
  const shipStatus = JSON.parse(shipStatusText);
  assert.equal(shipStatus.loaded, true);
  assert.equal(shipStatus.safety.hiddenStateIncluded, false);
  assert.equal(shipStatus.ship.name, 'U.S.S. Breckenridge');
  assert.equal(Array.isArray(shipStatus.ship.technicalDebt), true);

  const intercepted = await spindle.interceptors[0].handler([
    {
      role: 'user',
      content: 'Continue.'
    }
  ], {
    chatId: 'chat-1'
  });
  assert.equal(intercepted.messages.length, 2);
  assert.equal(intercepted.messages[0].role, 'system');
  assert.match(intercepted.messages[0].content, /\[Directive Context: Active Situation\]/);
  assert.match(intercepted.messages[0].content, /Talia Serrin/);
  assert.match(intercepted.messages[0].content, /U\.S\.S\. Breckenridge/);
  assert.doesNotMatch(intercepted.messages[0].content, /hiddenFacts|directorOnlyData|rawRelationshipValues/i);
  assert.deepEqual(intercepted.messages[1], {
    role: 'user',
    content: 'Continue.'
  });
  assert.equal(intercepted.breakdown[0].name, 'Directive Context');

  spindle.revoke('tools');
  assert.equal(backend.state.toolsRegistered, false);
  assert.equal(spindle.unregisteredTools.includes('directive_get_active_situation'), true);
  assert.equal(spindle.unregisteredTools.includes('directive_search_command_log'), true);
  assert.equal(spindle.unregisteredTools.includes('directive_get_crew_context'), true);
  assert.equal(spindle.unregisteredTools.includes('directive_get_ship_status'), true);
  spindle.grant('tools');
  assert.equal(backend.state.toolsRegistered, true);

  spindle.deny('generation', 'generate.quiet');
  assert.equal((await backend.status()).diagnostics.lastPermissionDenied.permission, 'generation');

  backend.dispose();
} finally {
  if (originalSpindle === undefined) {
    delete globalThis.spindle;
  } else {
    globalThis.spindle = originalSpindle;
  }
  if (originalLumiverseHooks === undefined) {
    delete globalThis.__directiveLumiverseTestHooks;
  } else {
    globalThis.__directiveLumiverseTestHooks = originalLumiverseHooks;
  }
}

const originalDocument = globalThis.document;
const documentHead = new FakeElement('head');
const documentBody = new FakeElement('body');
const documentElement = new FakeElement('html');
documentElement.append(documentHead, documentBody);
const documentStub = {
  head: documentHead,
  body: documentBody,
  documentElement,
  createElement(tagName) {
    return new FakeElement(tagName);
  },
  getElementById(id) {
    return findElement(documentElement, (element) => element.id === id);
  },
  addEventListener() {},
  removeEventListener() {}
};
const frontendView = {
  kind: 'directive.runtimeView',
  activeTab: 'campaign',
  activeScreen: 'campaign',
  activePackageId: null,
  activeSaveId: null,
  activePackage: null,
  campaign: {
    packages: [],
    saves: [],
    packageCount: 0,
    saveCount: 0,
    draftCount: 0
  },
  creator: null,
  campaignState: null,
  host: {
    id: 'lumiverse',
    displayName: 'Lumiverse',
    capabilities: {
      generation: {
        batchConcurrent: true
      }
    }
  },
  storageDiagnostics: null,
  lastDirectorTurn: null,
  lastNarrationResult: null,
  lastCommandLogSummarySidecarResult: null,
  lastOpenWorldActionResult: null,
  lastDirectiveAssistResult: null,
  lastStateSafetyResult: null,
  pendingDirectorTurn: null,
  pendingOutcomeReplacement: null,
  openWorld: null,
  lastError: null
};
async function settleFrontendRender() {
  await Promise.resolve();
  await Promise.resolve();
}
function emitRuntimeView(backendHandlers, request, view = frontendView) {
  backendHandlers[0]({
    type: RUNTIME_RESPONSE_TYPE,
    payload: {
      requestId: request.requestId,
      action: request.action,
      ok: true,
      result: {
        activeSaveId: view.activeSaveId || null
      },
      summary: {
        initialized: true,
        activeTab: view.activeTab || null,
        activeSaveId: view.activeSaveId || null,
        host: view.host || null,
        campaign: view.campaign || {},
        campaignState: view.campaignState || null
      },
      view
    }
  });
}
function findPanel() {
  return findElement(documentBody, (element) => element.id === 'directive-runtime-panel');
}
globalThis.document = documentStub;

try {
  const frontendModule = await importFresh(LUMIVERSE_FRONTEND_SOURCE_PATH);
  let appMountDestroyed = false;
  let launcherDestroyed = false;
  let unsubscribed = false;
  let mountOptions = null;
  const mountRoot = new FakeElement('div');
  documentBody.appendChild(mountRoot);
  const launcherTab = {
    root: new FakeElement('root'),
    destroy() {
      launcherDestroyed = true;
    },
    onActivate(handler) {
      launcherTab.activate = handler;
      return () => {
        launcherTab.activate = null;
      };
    }
  };
  const backendHandlers = [];
  const sentToBackend = [];
  const ctx = {
    ui: {
      mountApp(options) {
        mountOptions = options;
        return {
          root: mountRoot,
          destroy() {
            appMountDestroyed = true;
            mountRoot.remove();
          }
        };
      },
      registerDrawerTab(options) {
        assert.equal(options.id, 'directive');
        assert.equal(options.title, 'Directive');
        return launcherTab;
      }
    },
    sendToBackend(payload) {
      sentToBackend.push(payload);
    },
    onBackendMessage(handler) {
      backendHandlers.push(handler);
      return () => {
        unsubscribed = true;
      };
    }
  };

  const cleanup = frontendModule.setup(ctx);
  assert.equal(mountOptions.position, 'app-overlay');
  assert.equal(mountOptions.className, 'directive-lumiverse-command-shelf-mount');
  assert.equal(sentToBackend[0].type, STATUS_REQUEST_TYPE);
  assert.equal(sentToBackend[1].type, RUNTIME_REQUEST_TYPE);
  assert.equal(sentToBackend[1].action, 'getView');

  backendHandlers[0]({
    type: STATUS_RESPONSE_TYPE,
    payload: {
      host: frontendView.host,
      permissions: [
        'generation',
        'interceptor',
        'tools',
        'app_manipulation'
      ],
      features: {
        toolsRegistered: true,
        interceptorRegistered: true
      },
      runtime: {
        lastView: {
          initialized: true,
          host: frontendView.host,
          campaign: frontendView.campaign
        }
      }
    }
  });
  emitRuntimeView(backendHandlers, sentToBackend[1]);
  await settleFrontendRender();

  const panel = findPanel();
  assert.equal(panel?.dataset?.directiveShell, 'command-spine');
  assert.equal(panel?.dataset?.drawerOpen, 'false');
  assert.equal(findElement(mountRoot, (element) => element?.dataset?.directiveShellActions === 'top-right'), null);
  assert.equal(findElement(mountRoot, (element) => element?.dataset?.directiveShell === 'bottom-navigation'), null);
  assert.match(collectText(mountRoot), /Campaign/);

  const missionRoute = findElement(mountRoot, (element) => element?.dataset?.routeId === 'mission');
  assert.equal(missionRoute !== null, true);
  const routeClick = missionRoute.listeners.click({
    stopPropagation() {}
  });
  routeClick?.catch?.(() => {});
  await Promise.resolve();
  assert.equal(sentToBackend.at(-1).action, 'getView');
  assert.equal(sentToBackend.at(-1).params.tabId, 'mission');

  cleanup();
  assert.equal(unsubscribed, true);
  assert.equal(appMountDestroyed, true);
  assert.equal(launcherDestroyed, true);
} finally {
  if (originalDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
  }
}

console.log('Lumiverse entrypoint tests passed.');
