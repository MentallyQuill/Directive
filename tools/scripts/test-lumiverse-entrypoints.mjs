import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { applyPressureLedgerDelta } from '../../src/pressures/pressure-ledger.mjs';
import { buildPressureLedgerDeltaForTurn } from '../../src/pressures/pressure-seeding.mjs';

const STATUS_REQUEST_TYPE = 'directive.status.request';
const STATUS_RESPONSE_TYPE = 'directive.status';
const RUNTIME_REQUEST_TYPE = 'directive.runtime.request';
const RUNTIME_RESPONSE_TYPE = 'directive.runtime.response';
const MANIFEST_PATH = path.resolve('spindle.json');
const LUMIVERSE_FRONTEND_SOURCE_PATH = 'src/hosts/lumiverse/frontend.js';

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

function openOrdersReadyProjection(sourceProjection) {
  const projectionRecord = cloneJson(sourceProjection);
  const state = projectionRecord.initialState;
  state.player.name = 'Talia Serrin';
  state.player.creationStatus = 'ready';
  state.mission.activePhaseId = 'final-command-review';
  state.mission.phase = 'final-command-review';
  setFlag(state, 'prelude.ship-state', 'complete-with-accepted-limitation');
  setFlag(state, 'prelude.bronn', 'debate-not-closed');
  setFlag(state, 'prelude.priya', 'approval-bottlenecked');
  setFlag(state, 'prelude.hesperus-resolution', 'passengers-transferred');

  const delta = buildPressureLedgerDeltaForTurn({
    campaignState: state,
    outcomePacket: {
      id: 'outcome.lumiverse-entrypoint.open-orders',
      resultBand: 'Success',
      summary: 'Final review completed.',
      costs: [],
      revealedFactIds: [],
      commandDecisionAwards: []
    },
    intentParse: {
      primaryIntent: 'complete-final-command-review',
      signals: {}
    }
  });
  applyPressureLedgerDelta(state, delta);

  state.mainCampaign.completedChapters = [
    'prelude-a-ship-underway',
    'chapter-1-the-empty-convoy',
    'chapter-2-false-colors'
  ];
  state.mainCampaign.availableChapters = ['open-orders-1-work-worth-doing'];
  state.mainCampaign.lockedChapters = (state.mainCampaign.lockedChapters || [])
    .filter((chapterId) => chapterId !== 'open-orders-1-work-worth-doing');
  state.mainCampaign.chapterCursor = 'open-orders-1-work-worth-doing';
  state.mission.completedMissionId = 'chapter-2-false-colors';
  state.mission.nextMissionId = 'open-orders-1-work-worth-doing';
  state.mission.transitionStatus = 'open-orders-1-pending';
  state.sideMissions = {
    openOrdersIntervals: [],
    availableAssignments: [],
    completedAssignments: [],
    generationPausedUntil: 'open-orders-1-work-worth-doing'
  };
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
    'tools'
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
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this.style = {};
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
    };
    this._textContent = '';
    this.removed = false;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  appendChild(node) {
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
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
  'tools'
]);
assert.equal(existsSync(path.resolve(manifest.entry_backend)), true);
assert.equal(existsSync(path.resolve('src/frontend.ts')), true);
assert.equal(existsSync(path.resolve(LUMIVERSE_FRONTEND_SOURCE_PATH)), true);

const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const projection = openOrdersReadyProjection(readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json'));
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json');
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
      path: 'packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json',
      projection
    }],
    crewDatasets: [{
      path: 'packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs: [{
      path: 'packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json',
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
  assert.equal(runtimeResponse.payload.payload.summary.starships.packageCount, 1);

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
  assert.equal(runtimeResponse.payload.payload.summary.campaign.playerName, 'Talia Serrin');
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
    requestId: 'runtime-open-orders-select',
    action: 'commitOpenOrdersCandidateReview',
    params: {
      sideAssignmentId: 'side-the-long-repair',
      maxCandidates: 3
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert.equal(runtimeResponse.payload.payload.summary.campaign.openOrders.activeAssignmentId, 'side-the-long-repair');
  assert.equal(runtimeResponse.payload.payload.summary.campaign.openOrders.availableAssignments[0].status, 'selected');

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-open-orders-scene',
    action: 'startOpenOrdersAssignmentScene',
    params: {
      assignmentId: 'side-the-long-repair'
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  const lumiverseOpenOrders = runtimeResponse.payload.payload.summary.campaign.openOrders;
  assert.equal(lumiverseOpenOrders.activeAssignmentId, 'side-the-long-repair');
  assert.equal(lumiverseOpenOrders.availableAssignments[0].status, 'active');
  assert.equal(lumiverseOpenOrders.availableAssignments[0].sceneStatus, 'briefing');
  assert.match(lumiverseOpenOrders.availableAssignments[0].sceneBrief.sceneQuestion, /Breckinridge/);
  assert.doesNotMatch(JSON.stringify(lumiverseOpenOrders), /hiddenFacts|directorOnlyData|rawRelationshipValues|hecate|pale lantern/i);

  await spindle.emitFrontendMessage({
    type: RUNTIME_REQUEST_TYPE,
    requestId: 'runtime-open-orders-scene-beat',
    action: 'commitOpenOrdersAssignmentSceneBeat',
    params: {
      assignmentId: 'side-the-long-repair',
      playerIntent: 'Coordinate Engineering triage with Helix Yard and record what must wait.',
      approach: 'technical'
    }
  }, 'user-1');
  runtimeResponse = spindle.sentFrontend.at(-1);
  assert.equal(runtimeResponse.payload.payload.ok, true);
  assert.equal(runtimeResponse.payload.payload.result.sceneBeat.sequence, 1);
  assert.equal(runtimeResponse.payload.payload.result.sceneBeat.approach, 'technical');
  const lumiverseOpenOrdersAfterBeat = runtimeResponse.payload.payload.summary.campaign.openOrders;
  assert.equal(lumiverseOpenOrdersAfterBeat.availableAssignments[0].sceneStatus, 'in-progress');
  assert.equal(lumiverseOpenOrdersAfterBeat.availableAssignments[0].sceneBeatCount, 1);
  assert.match(lumiverseOpenOrdersAfterBeat.availableAssignments[0].latestSceneBeat, /Engineering triage/);
  assert.doesNotMatch(JSON.stringify(lumiverseOpenOrdersAfterBeat), /hiddenFacts|directorOnlyData|rawRelationshipValues|hecate|pale lantern/i);

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
  assert.equal(toolResult.runtime.campaign.playerName, 'Talia Serrin');
  assert.equal(toolResult.safety.hiddenStateIncluded, false);
  assert.equal(toolResult.safety.mutationAllowed, false);

  const logSearchText = await spindle.emit('TOOL_INVOCATION', {
    toolName: 'directive_search_command_log',
    args: {
      query: 'Breckinridge',
      limit: 5
    }
  });
  const logSearch = JSON.parse(logSearchText);
  assert.equal(logSearch.loaded, true);
  assert.equal(logSearch.safety.hiddenStateIncluded, false);
  assert.equal(logSearch.matches.length >= 1, true);
  assert.equal(logSearch.matches.some((entry) => String(entry.summary || '').includes('Breckinridge')), true);

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
  assert.equal(shipStatus.ship.name, 'U.S.S. Breckinridge');
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
  assert.match(intercepted.messages[0].content, /U\.S\.S\. Breckinridge/);
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
const documentStub = {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
};
globalThis.document = documentStub;

try {
  const frontendModule = await importFresh(LUMIVERSE_FRONTEND_SOURCE_PATH);
  let destroyed = false;
  let unsubscribed = false;
  const tab = {
    root: new FakeElement('root'),
    destroy() {
      destroyed = true;
    }
  };
  const backendHandlers = [];
  const sentToBackend = [];
  const ctx = {
    ui: {
      registerDrawerTab(options) {
        assert.equal(options.id, 'directive');
        assert.equal(options.title, 'Directive');
        return tab;
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
  assert.equal(sentToBackend[0].type, STATUS_REQUEST_TYPE);
  backendHandlers[0]({
    type: STATUS_RESPONSE_TYPE,
    payload: {
      host: {
        displayName: 'Lumiverse',
        capabilities: {
          generation: {
            batchConcurrent: true
          }
        }
      },
      permissions: [
        'generation',
        'tools'
      ],
      features: {
        toolsRegistered: true,
        interceptorRegistered: false
      },
      events: {
        lastEvent: {
          eventName: 'messageSent',
          at: '2026-06-19T00:00:00.000Z'
        }
      }
    }
  });
  assert.match(collectText(tab.root), /Lumiverse/);
  const shell = tab.root.children[0];
  assert.equal(shell?.dataset?.directiveShell, 'top-control');
  assert.equal(findElement(tab.root, (element) => element?.dataset?.directiveShellActions === 'top-right') !== null, true);
  const initialBackAction = findElement(tab.root, (element) => element?.dataset?.shellAction === 'back');
  assert.equal(initialBackAction !== null, true);
  assert.equal(initialBackAction.disabled, true);
  assert.equal(initialBackAction.attributes['aria-disabled'], 'true');
  assert.match(collectText(tab.root), /Load Latest/);
  assert.match(collectText(tab.root), /Save/);
  const settingsRoute = findElement(tab.root, (element) => element?.dataset?.routeId === 'settings');
  assert.equal(settingsRoute !== null, true);
  settingsRoute.listeners.click();
  assert.match(collectText(tab.root), /Concurrent sidecars/);
  const enabledBackAction = findElement(tab.root, (element) => element?.dataset?.shellAction === 'back');
  assert.equal(enabledBackAction.disabled, false);
  assert.equal(enabledBackAction.attributes['aria-disabled'], 'false');
  enabledBackAction.listeners.click({
    preventDefault() {}
  });
  const starshipsRoute = findElement(tab.root, (element) => element?.dataset?.routeId === 'starships');
  assert.equal(starshipsRoute.attributes['aria-selected'], 'true');
  const disabledBackAction = findElement(tab.root, (element) => element?.dataset?.shellAction === 'back');
  assert.equal(disabledBackAction.disabled, true);
  backendHandlers[0]({
    type: RUNTIME_RESPONSE_TYPE,
    payload: {
      requestId: 'frontend-runtime',
      action: 'startQuickCampaign',
      ok: true,
      summary: {
        initialized: true,
        campaign: {
          playerName: 'Talia Serrin',
          shipName: 'USS Breckinridge',
          openOrders: {
            activeAssignmentId: null,
            availableAssignments: [],
            intervals: []
          }
        },
        openOrdersReview: {
          candidates: [{
            id: 'candidate.pressure.ship.imani-technical-debt.side-the-long-repair',
            sideAssignmentId: 'side-the-long-repair',
            sideAssignmentTitle: 'The Long Repair',
            reason: 'The Long Repair is available because Imani has visible repair debt.'
          }]
        },
        activeSaveId: 'save-lumiverse-entrypoint-2',
        starships: {
          saveCount: 1
        },
        lastOutcome: {
          resultBand: 'Partial Success',
          summary: 'The crew protects the passengers and preserves the inspection record.'
        },
        lastNarration: {
          ok: true,
          text: 'The Breckinridge accepts the delay and keeps the evidence intact.'
        }
      }
    }
  });
  assert.match(collectText(tab.root), /Talia Serrin aboard USS Breckinridge/);
  assert.match(collectText(tab.root), /Partial Success/);
  assert.match(collectText(tab.root), /The Long Repair/);
  const startCandidateButton = findElement(tab.root, (element) => element.tagName === 'button' && element.textContent === 'Start Candidate');
  assert.equal(startCandidateButton !== null, true);
  startCandidateButton.listeners.click();
  assert.equal(sentToBackend.at(-1).type, RUNTIME_REQUEST_TYPE);
  assert.equal(sentToBackend.at(-1).action, 'commitOpenOrdersCandidateReview');
  assert.equal(sentToBackend.at(-1).params.decision, 'start');
  assert.equal(sentToBackend.at(-1).params.candidateId, 'candidate.pressure.ship.imani-technical-debt.side-the-long-repair');

  backendHandlers[0]({
    type: RUNTIME_RESPONSE_TYPE,
    payload: {
      requestId: 'frontend-open-orders-selected',
      action: 'commitOpenOrdersCandidateReview',
      ok: true,
      summary: {
        initialized: true,
        campaign: {
          playerName: 'Talia Serrin',
          shipName: 'USS Breckinridge',
          openOrders: {
            activeAssignmentId: 'side-the-long-repair',
            availableAssignments: [{
              id: 'side-the-long-repair',
              title: 'The Long Repair',
              status: 'selected',
              playerSummary: 'The Long Repair selected from Engineering Repair Debt.'
            }],
            intervals: []
          }
        },
        activeSaveId: 'save-lumiverse-entrypoint-2',
        starships: {
          saveCount: 1
        }
      }
    }
  });
  const openAssignmentButton = findElement(tab.root, (element) => element.tagName === 'button' && element.textContent === 'Open Assignment');
  assert.equal(openAssignmentButton !== null, true);
  assert.equal(openAssignmentButton.disabled, false);
  openAssignmentButton.listeners.click();
  assert.equal(sentToBackend.at(-1).action, 'startOpenOrdersAssignmentScene');
  assert.equal(sentToBackend.at(-1).params.assignmentId, 'side-the-long-repair');

  backendHandlers[0]({
    type: RUNTIME_RESPONSE_TYPE,
    payload: {
      requestId: 'frontend-open-orders-active',
      action: 'startOpenOrdersAssignmentScene',
      ok: true,
      summary: {
        initialized: true,
        campaign: {
          playerName: 'Talia Serrin',
          shipName: 'USS Breckinridge',
          openOrders: {
            activeAssignmentId: 'side-the-long-repair',
            availableAssignments: [{
              id: 'side-the-long-repair',
              title: 'The Long Repair',
              status: 'active',
              sceneStatus: 'briefing',
              sceneBeatCount: 0,
              playerSummary: 'The Long Repair is active Open Orders work.',
              sceneBrief: {
                sceneQuestion: 'How does the Breckinridge handle The Long Repair while preserving command continuity?'
              }
            }],
            intervals: []
          }
        },
        activeSaveId: 'save-lumiverse-entrypoint-2',
        starships: {
          saveCount: 1
        }
      }
    }
  });
  assert.match(collectText(tab.root), /How does the Breckinridge handle The Long Repair/);
  const advanceSceneButton = findElement(tab.root, (element) => element.tagName === 'button' && element.textContent === 'Advance Scene');
  assert.equal(advanceSceneButton !== null, true);
  assert.equal(advanceSceneButton.disabled, false);
  advanceSceneButton.listeners.click();
  assert.equal(sentToBackend.at(-1).action, 'commitOpenOrdersAssignmentSceneBeat');
  assert.equal(sentToBackend.at(-1).params.assignmentId, 'side-the-long-repair');
  assert.equal(sentToBackend.at(-1).params.approach, 'coordination');
  backendHandlers[0]({
    type: RUNTIME_RESPONSE_TYPE,
    payload: {
      requestId: 'frontend-open-orders-scene-beat',
      action: 'commitOpenOrdersAssignmentSceneBeat',
      ok: true,
      summary: {
        initialized: true,
        campaign: {
          playerName: 'Talia Serrin',
          shipName: 'USS Breckinridge',
          openOrders: {
            activeAssignmentId: 'side-the-long-repair',
            availableAssignments: [{
              id: 'side-the-long-repair',
              title: 'The Long Repair',
              status: 'active',
              sceneStatus: 'in-progress',
              sceneBeatCount: 1,
              latestSceneBeat: 'The Long Repair: Coordinate Engineering triage with Helix Yard.',
              playerSummary: 'The Long Repair is active Open Orders work.',
              sceneBrief: {
                sceneStatus: 'in-progress',
                sceneQuestion: 'How does the Breckinridge handle The Long Repair while preserving command continuity?'
              }
            }],
            intervals: []
          }
        },
        activeSaveId: 'save-lumiverse-entrypoint-2',
        starships: {
          saveCount: 1
        }
      }
    }
  });
  assert.match(collectText(tab.root), /Coordinate Engineering triage/);
  const resolveAssignmentButton = findElement(tab.root, (element) => element.tagName === 'button' && element.textContent === 'Resolve Assignment');
  assert.equal(resolveAssignmentButton !== null, true);
  assert.equal(resolveAssignmentButton.disabled, false);
  resolveAssignmentButton.listeners.click();
  assert.equal(sentToBackend.at(-1).action, 'commitOpenOrdersAssignmentResolution');
  assert.equal(sentToBackend.at(-1).params.assignmentMode, 'direct');
  backendHandlers[0]({
    type: RUNTIME_RESPONSE_TYPE,
    payload: {
      requestId: 'frontend-open-orders-active-refresh',
      action: 'startOpenOrdersAssignmentScene',
      ok: true,
      summary: {
        initialized: true,
        campaign: {
          playerName: 'Talia Serrin',
          shipName: 'USS Breckinridge',
          openOrders: {
            activeAssignmentId: 'side-the-long-repair',
            availableAssignments: [{
              id: 'side-the-long-repair',
              title: 'The Long Repair',
              status: 'active',
              sceneStatus: 'in-progress',
              sceneBeatCount: 1,
              latestSceneBeat: 'The Long Repair: Coordinate Engineering triage with Helix Yard.',
              playerSummary: 'The Long Repair is active Open Orders work.',
              sceneBrief: {
                sceneStatus: 'in-progress',
                sceneQuestion: 'How does the Breckinridge handle The Long Repair while preserving command continuity?'
              }
            }],
            intervals: []
          }
        },
        activeSaveId: 'save-lumiverse-entrypoint-2',
        starships: {
          saveCount: 1
        }
      }
    }
  });
  const delegateAssignmentButton = findElement(tab.root, (element) => element.tagName === 'button' && element.textContent === 'Delegate Assignment');
  assert.equal(delegateAssignmentButton !== null, true);
  assert.equal(delegateAssignmentButton.disabled, false);
  delegateAssignmentButton.listeners.click();
  assert.equal(sentToBackend.at(-1).action, 'commitOpenOrdersAssignmentResolution');
  assert.equal(sentToBackend.at(-1).params.assignmentMode, 'delegated');
  cleanup();
  assert.equal(unsubscribed, true);
  assert.equal(destroyed, true);
} finally {
  if (originalDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
  }
}

console.log('Lumiverse entrypoint tests passed.');
