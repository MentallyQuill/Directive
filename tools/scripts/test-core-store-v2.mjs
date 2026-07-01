import assert from 'node:assert/strict';

import {
  createTurnSourceFrameContract,
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  createCoreStoreV2,
  loadCoreStoreStateV2,
  readCoreStoreProjectionsV2
} from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';
import {
  loadV2SaveManifest,
  readV2ArtifactRef
} from '../../src/storage/transaction-store-v2.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createLoggingStorage() {
  const files = new Map();
  const writeLog = [];
  const readLog = [];
  const verifyLog = [];
  return {
    writeLog,
    readLog,
    verifyLog,
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([key, value]) => [key, cloneJson(value)]));
    },
    async readJson(filePath) {
      readLog.push(filePath);
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      writeLog.push(filePath);
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths) {
      verifyLog.push(...paths);
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

let tick = 0;
const storage = createLoggingStorage();
const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
const coreStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  now: () => `2026-06-28T15:00:${String(tick++).padStart(2, '0')}.000Z`
});

const sourceFrame = createTurnSourceFrameContract({
  id: 'frame-29',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '29',
  textHash: hashStableJson({ text: 'Sam waited for her reply.' }),
  createdAt: '2026-06-28T15:00:00.000Z'
});

const transaction = await coreStore.beginTurn(sourceFrame, {
  transactionId: 'txn-29',
  ingressId: 'ingress-29',
  idempotencyKey: 'begin-29'
});
assert.equal(transaction.phase, 'observed');
assert.equal(transaction.revisions.runtime, 1);
const duplicateBegin = await coreStore.beginTurn(sourceFrame, {
  transactionId: 'txn-29',
  ingressId: 'ingress-29',
  idempotencyKey: 'begin-29'
});
assert.equal(duplicateBegin.revisions.runtime, 1, 'same beginTurn idempotency key should replay without advancing revisions');
assert.equal(transaction.sourceFrame.campaignId, 'campaign-core-v2', 'CORE source frame refs should retain campaign id');
assert.equal(transaction.sourceFrame.saveId, 'save-core-v2', 'CORE source frame refs should retain save id');
assert.equal(transaction.sourceFrame.chatId, 'ashes-chat', 'CORE source frame refs should retain chat id');
const scopeGuardStorage = createLoggingStorage();
const scopeGuardAdapter = createLogicalStorageAdapter({ storage: scopeGuardStorage, hostId: 'fake' });
const scopeGuardStore = createCoreStoreV2({
  adapter: scopeGuardAdapter,
  campaignId: 'campaign-scope-a',
  saveId: 'save-scope-a',
  now: () => '2026-06-28T15:00:09.000Z'
});
const mismatchedScopeFrame = createTurnSourceFrameContract({
  id: 'frame-scope-mismatch',
  campaignId: 'campaign-scope-b',
  saveId: 'save-scope-b',
  chatId: 'scope-chat',
  hostMessageId: 'scope-host-1',
  textHash: hashStableJson({ text: 'wrong save' }),
  createdAt: '2026-06-28T15:00:09.000Z'
});
await assert.rejects(
  () => scopeGuardStore.beginTurn(mismatchedScopeFrame, {
    transactionId: 'txn-scope-mismatch',
    ingressId: 'ingress-scope-mismatch',
    idempotencyKey: 'begin-scope-mismatch'
  }),
  /CORE source frame scope mismatch/
);
assert.equal(scopeGuardStorage.writeLog.length, 0, 'CORE source frame scope mismatch must not write manifests or event segments');
await assert.rejects(
  () => coreStore.advanceTurn(transaction.id, { phase: 'settled' }),
  /Invalid CORE transaction phase transition/
);

const manifestBeforeAdvance = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
const beforeAdvanceHeadWrites = storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length;
const beforeAdvanceHostMapWrites = storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length;
const beforeAdvancePromptWrites = storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length;
const beforeAdvanceTurnWrites = storage.writeLog.filter((key) => key.includes('/turns/')).length;
const beforeAdvanceWriteStart = storage.writeLog.length;
const beforeAdvanceReadStart = storage.readLog.length;
await coreStore.advanceTurn(transaction.id, {
  phase: 'routePending',
  route: 'directiveCommit',
  reason: 'consequential-command',
  idempotencyKey: 'advance-29'
});
const advanceWriteKeys = storage.writeLog.slice(beforeAdvanceWriteStart);
const advanceReadKeys = storage.readLog.slice(beforeAdvanceReadStart);
assert.equal(storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length, beforeAdvanceHeadWrites, 'advanceTurn must not rewrite CORE head on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length, beforeAdvanceHostMapWrites, 'advanceTurn must not rewrite host map on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length, beforeAdvancePromptWrites, 'advanceTurn must not rewrite prompt cache on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.includes('/turns/')).length, beforeAdvanceTurnWrites, 'advanceTurn must not write turn segments');
assert.equal(advanceWriteKeys.filter((key) => key.includes('/events/')).length, 1, 'advanceTurn append should write exactly one event tail');
assert.equal(advanceWriteKeys.filter((key) => key.endsWith('/save-manifest.v2.json')).length, 1, 'advanceTurn append should publish one save manifest');
assert.equal(advanceWriteKeys.filter((key) => key.endsWith('/campaign-manifest.v2.json')).length, 1, 'advanceTurn append should publish one campaign manifest');
assert.equal(advanceWriteKeys.length, 3, 'advanceTurn append should write only event tail, save manifest, and campaign manifest');
assert.equal(advanceWriteKeys[advanceWriteKeys.length - 2].endsWith('/save-manifest.v2.json'), true, 'advanceTurn append should write save manifest after segment artifacts');
assert.equal(advanceWriteKeys[advanceWriteKeys.length - 1].endsWith('/campaign-manifest.v2.json'), true, 'advanceTurn append should write campaign manifest last');
assert.equal(advanceReadKeys.some((key) => key.endsWith('/head.v2.json')), false, 'advanceTurn append must not read CORE head');
assert.equal(advanceReadKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'advanceTurn append must not read host map');
assert.equal(advanceReadKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'advanceTurn append must not read prompt cache');
const manifestAfterAdvance = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
assert.deepEqual(manifestAfterAdvance.head, manifestBeforeAdvance.head, 'advanceTurn append should preserve the prior materialized head ref');
assert.deepEqual(manifestAfterAdvance.hostMap, manifestBeforeAdvance.hostMap, 'advanceTurn append should preserve the prior host-map ref');
assert.deepEqual(manifestAfterAdvance.promptCache, manifestBeforeAdvance.promptCache, 'advanceTurn append should preserve the prior prompt-cache ref');
assert.deepEqual(manifestAfterAdvance.turnSegments, manifestBeforeAdvance.turnSegments, 'advanceTurn append should preserve turn refs');
const hydratedAfterAdvance = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
assert.equal(hydratedAfterAdvance.transactions[transaction.id].phase, 'routePending', 'hydration should derive advanceTurn phase from appended events');
assert.equal(hydratedAfterAdvance.transactions[transaction.id].route, 'directiveCommit', 'hydration should derive advanceTurn route from appended events');
assert.equal(hydratedAfterAdvance.transactions[transaction.id].phaseAdvanceIdempotencyKeys.includes('advance-29'), true, 'hydration should preserve advanceTurn idempotency from events');
assert.equal(hydratedAfterAdvance.revisions.runtime, 2, 'hydration should derive runtime revision from appended advanceTurn event');
const beforeAdvanceReplayEvents = coreStore.state.events.length;
const replayAdvance = await coreStore.advanceTurn(transaction.id, {
  phase: 'routePending',
  route: 'directiveCommit',
  reason: 'consequential-command',
  idempotencyKey: 'advance-29'
});
assert.equal(replayAdvance.phase, 'routePending', 'same advance idempotency key should replay current transaction');
assert.equal(coreStore.state.events.length, beforeAdvanceReplayEvents, 'same advance idempotency key must not append another event');
await assert.rejects(
  () => coreStore.commitMechanics(transaction.id, {
    baseMechanicsRevision: 99,
    operations: [{ domain: 'mission', op: 'appendLog' }]
  }),
  /Stale CORE mechanics base revision/
);
const manifestBeforeMechanics = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
const beforeMechanicsHeadWrites = storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length;
const beforeMechanicsHostMapWrites = storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length;
const beforeMechanicsPromptWrites = storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length;
const beforeMechanicsWriteStart = storage.writeLog.length;
const beforeMechanicsReadStart = storage.readLog.length;
const mechanics = await coreStore.commitMechanics(transaction.id, {
  baseMechanicsRevision: 0,
  idempotencyKey: 'mechanics-29',
  turnId: 'turn-29',
  outcomeId: 'outcome-29',
  summary: 'Sam frames the tactical risk without overruling the bridge.',
  committedRoots: ['mission', 'commandLog'],
  promptDirtyDomains: ['missionQuestThread'],
  operations: [
    {
      domain: 'mission',
      op: 'appendLog',
      summary: 'Clarified the bridge decision under pressure.',
      sourceKind: 'directive.openWorldReducerBundle.v1',
      sourceHash: 'open-world-reducer-source-hash',
      operationCount: 1,
      changedRoots: ['worldState'],
      rawText: 'RAW_MECHANICS_TEXT'
    }
  ]
});
const mechanicsWriteKeys = storage.writeLog.slice(beforeMechanicsWriteStart);
const mechanicsReadKeys = storage.readLog.slice(beforeMechanicsReadStart);
assert.equal(storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length, beforeMechanicsHeadWrites, 'mechanics commit must not rewrite CORE head on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length, beforeMechanicsHostMapWrites, 'mechanics commit must not rewrite host map on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length, beforeMechanicsPromptWrites, 'mechanics commit must not rewrite prompt cache on the append-only hot path');
assert.equal(mechanicsWriteKeys.filter((key) => key.includes('/events/')).length, 1, 'mechanics append should write exactly one event tail');
assert.equal(mechanicsWriteKeys.filter((key) => key.includes('/turns/')).length, 1, 'mechanics append should write exactly one turn tail');
assert.equal(mechanicsWriteKeys.filter((key) => key.endsWith('/save-manifest.v2.json')).length, 1, 'mechanics append should publish one save manifest');
assert.equal(mechanicsWriteKeys.filter((key) => key.endsWith('/campaign-manifest.v2.json')).length, 1, 'mechanics append should publish one campaign manifest');
assert.equal(mechanicsWriteKeys.length, 4, 'mechanics append should write only event tail, turn tail, save manifest, and campaign manifest');
assert.equal(mechanicsWriteKeys[mechanicsWriteKeys.length - 2].endsWith('/save-manifest.v2.json'), true, 'mechanics append should write save manifest after segment artifacts');
assert.equal(mechanicsWriteKeys[mechanicsWriteKeys.length - 1].endsWith('/campaign-manifest.v2.json'), true, 'mechanics append should write campaign manifest last');
assert.equal(mechanicsReadKeys.some((key) => key.endsWith('/head.v2.json')), false, 'mechanics append must not read CORE head');
assert.equal(mechanicsReadKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'mechanics append must not read host map');
assert.equal(mechanicsReadKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'mechanics append must not read prompt cache');
const manifestAfterMechanics = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
assert.deepEqual(manifestAfterMechanics.head, manifestBeforeMechanics.head, 'mechanics append should preserve the prior materialized head ref');
assert.deepEqual(manifestAfterMechanics.hostMap, manifestBeforeMechanics.hostMap, 'mechanics append should preserve the prior host-map ref');
assert.deepEqual(manifestAfterMechanics.promptCache, manifestBeforeMechanics.promptCache, 'mechanics append should preserve the prior prompt-cache ref');
const hydratedAfterMechanics = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
assert.equal(hydratedAfterMechanics.transactions[transaction.id].turnId, 'turn-29', 'hydration should derive mechanics turn id from appended event/turn segments');
assert.equal(hydratedAfterMechanics.transactions[transaction.id].outcomeId, 'outcome-29', 'hydration should derive mechanics outcome from appended event/turn segments');
assert.equal(hydratedAfterMechanics.revisions.mechanics, 1, 'hydration should derive mechanics revision from appended event/turn segments');
assert.equal(hydratedAfterMechanics.promptDirtyDomains.includes('missionQuestThread'), true, 'hydration should derive prompt dirty domains from appended turn segments');
assert.equal(mechanics.outcomeId, 'outcome-29');
assert.equal(mechanics.operationCount, 1);
assert.equal(coreStore.state.revisions.prompt, 0, 'CORE must emit dirty domains without owning prompt revision');
const replayMechanics = await coreStore.commitMechanics(transaction.id, {
  baseMechanicsRevision: 0,
  idempotencyKey: 'mechanics-29',
  turnId: 'turn-29',
  outcomeId: 'outcome-29'
});
assert.equal(replayMechanics.id, mechanics.id, 'same mechanics idempotency key should replay the committed turn');

const beforeDiagnosticsMechanicsRevision = coreStore.state.revisions.mechanics;
const beforeDiagnosticsRuntimeRevision = coreStore.state.revisions.runtime;
const beforeDiagnosticsPromptRevision = coreStore.state.revisions.prompt;
const beforeDiagnosticsHeadWrites = storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length;
const beforeDiagnosticsPromptWrites = storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length;
const beforeDiagnosticsEventWrites = storage.writeLog.filter((key) => key.includes('/events/')).length;
const beforeDiagnosticsTurnWrites = storage.writeLog.filter((key) => key.includes('/turns/')).length;
const beforeDiagnosticsReadStart = storage.readLog.length;
const modelDiagnostic = await coreStore.appendDiagnostics(transaction.id, {
  type: 'modelCall',
  roleId: 'utilityTurnClassifier',
  status: 'ok',
  latencyMs: 950,
  promptText: 'RAW_PROVIDER_PROMPT',
  responseSnapshot: 'RAW_PROVIDER_RESPONSE',
  apiKey: 'SECRET-API-KEY',
  requestHash: 'request-hash-1'
});
assert.equal(coreStore.state.revisions.mechanics, beforeDiagnosticsMechanicsRevision, 'diagnostics must not advance mechanics revision');
assert.equal(coreStore.state.revisions.runtime, beforeDiagnosticsRuntimeRevision, 'diagnostics must not advance runtime revision');
assert.equal(coreStore.state.revisions.prompt, beforeDiagnosticsPromptRevision, 'diagnostics must not advance prompt revision');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length, beforeDiagnosticsHeadWrites, 'diagnostics-only append must not rewrite head');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length, beforeDiagnosticsPromptWrites, 'diagnostics-only append must not rewrite prompt cache');
assert.equal(storage.writeLog.filter((key) => key.includes('/events/')).length, beforeDiagnosticsEventWrites, 'diagnostics-only append must not rewrite event segments');
assert.equal(storage.writeLog.filter((key) => key.includes('/turns/')).length, beforeDiagnosticsTurnWrites, 'diagnostics-only append must not rewrite turn segments');
const diagnosticsReadKeys = storage.readLog.slice(beforeDiagnosticsReadStart);
assert.equal(diagnosticsReadKeys.some((key) => key.endsWith('/head.v2.json')), false, 'diagnostics-only append must not read head');
assert.equal(diagnosticsReadKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'diagnostics-only append must not read host map');
assert.equal(diagnosticsReadKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'diagnostics-only append must not read prompt cache');
assert.equal(diagnosticsReadKeys.some((key) => key.includes('/events/')), false, 'diagnostics-only append must not read event segments');
assert.equal(diagnosticsReadKeys.some((key) => key.includes('/turns/')), false, 'diagnostics-only append must not read turn segments');
assert.equal(modelDiagnostic.kind, 'directive.coreDiagnostic.v1');
assert.equal(modelDiagnostic.redactedPayload.promptText, '[redacted-raw-payload]');
assert.equal(modelDiagnostic.redactedPayload.responseSnapshot, '[redacted-raw-payload]');
assert.equal(modelDiagnostic.redactedPayload.apiKey, '[redacted-secret]');

const manifestBeforeResponse = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
const beforeResponseHeadWrites = storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length;
const beforeResponseHostMapWrites = storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length;
const beforeResponsePromptWrites = storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length;
const beforeResponseTurnWrites = storage.writeLog.filter((key) => key.includes('/turns/')).length;
const beforeResponseDiagnosticsWrites = storage.writeLog.filter((key) => key.includes('/diagnostics/')).length;
const beforeResponseWriteStart = storage.writeLog.length;
const beforeResponseReadStart = storage.readLog.length;
const postedResponse = await coreStore.recordVisibleResponse(transaction.id, {
  idempotencyKey: 'response-30-key',
  responseId: 'response-30',
  hostMessageId: '30',
  outcomeId: 'outcome-29',
  responseKind: 'directiveNarration',
  directiveGenerationStartedAt: '2026-06-28T15:00:40.000Z',
  generationStartedAt: '2026-06-28T15:00:40.000Z',
  postedAt: '2026-06-28T15:01:45.000Z',
  turnLatency: {
    playerSubmittedAt: '2026-06-28T15:00:00.000Z',
    turnObservedAt: '2026-06-28T15:00:00.000Z',
    routeDecidedAt: '2026-06-28T15:00:40.000Z',
    directiveGenerationStartedAt: '2026-06-28T15:00:40.000Z',
    visibleResponsePostedAt: '2026-06-28T15:01:45.000Z'
  },
  rawResponse: 'RAW_RESPONSE_TEXT'
});
const responseWriteKeys = storage.writeLog.slice(beforeResponseWriteStart);
const responseReadKeys = storage.readLog.slice(beforeResponseReadStart);
assert.equal(storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length, beforeResponseHeadWrites, 'recordVisibleResponse must not rewrite CORE head on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length, beforeResponseHostMapWrites, 'recordVisibleResponse must not rewrite host map on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length, beforeResponsePromptWrites, 'recordVisibleResponse must not rewrite prompt cache on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.includes('/turns/')).length, beforeResponseTurnWrites, 'recordVisibleResponse must not write turn segments');
assert.equal(storage.writeLog.filter((key) => key.includes('/diagnostics/')).length, beforeResponseDiagnosticsWrites, 'recordVisibleResponse must not write diagnostics segments');
assert.equal(responseWriteKeys.filter((key) => key.includes('/events/')).length, 1, 'recordVisibleResponse append should write exactly one event tail');
assert.equal(responseWriteKeys.filter((key) => key.endsWith('/save-manifest.v2.json')).length, 1, 'recordVisibleResponse append should publish one save manifest');
assert.equal(responseWriteKeys.filter((key) => key.endsWith('/campaign-manifest.v2.json')).length, 1, 'recordVisibleResponse append should publish one campaign manifest');
assert.equal(responseWriteKeys.length, 3, 'recordVisibleResponse append should write only event tail, save manifest, and campaign manifest');
assert.equal(responseWriteKeys[responseWriteKeys.length - 2].endsWith('/save-manifest.v2.json'), true, 'recordVisibleResponse append should write save manifest after segment artifacts');
assert.equal(responseWriteKeys[responseWriteKeys.length - 1].endsWith('/campaign-manifest.v2.json'), true, 'recordVisibleResponse append should write campaign manifest last');
assert.equal(responseReadKeys.some((key) => key.endsWith('/head.v2.json')), false, 'recordVisibleResponse append must not read CORE head');
assert.equal(responseReadKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'recordVisibleResponse append must not read host map');
assert.equal(responseReadKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'recordVisibleResponse append must not read prompt cache');
assert.equal(responseReadKeys.some((key) => key.includes('/turns/')), false, 'recordVisibleResponse append must not read turn segments');
const manifestAfterResponse = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
assert.deepEqual(manifestAfterResponse.head, manifestBeforeResponse.head, 'recordVisibleResponse append should preserve the prior materialized head ref');
assert.deepEqual(manifestAfterResponse.hostMap, manifestBeforeResponse.hostMap, 'recordVisibleResponse append should preserve the prior host-map ref');
assert.deepEqual(manifestAfterResponse.promptCache, manifestBeforeResponse.promptCache, 'recordVisibleResponse append should preserve the prior prompt-cache ref');
assert.deepEqual(manifestAfterResponse.turnSegments, manifestBeforeResponse.turnSegments, 'recordVisibleResponse append should preserve turn refs');
assert.deepEqual(manifestAfterResponse.diagnosticsSegments, manifestBeforeResponse.diagnosticsSegments, 'recordVisibleResponse append should preserve diagnostics refs');
const hydratedAfterResponse = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
assert.equal(hydratedAfterResponse.transactions[transaction.id].phase, 'visibleResponsePosted', 'hydration should derive visible response phase from appended events');
assert.equal(hydratedAfterResponse.transactions[transaction.id].visibleResponseRef.hostMessageId, '30', 'hydration should derive visible response host id from appended events');
assert.equal(hydratedAfterResponse.transactions[transaction.id].visibleResponseRef.textHash, null, 'hydration should keep hash-only missing response text state without raw response text');
assert.equal(hydratedAfterResponse.revisions.runtime, 4, 'hydration should derive runtime revision from appended response event');
const hydratedResponseReplayStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  now: () => `2026-06-28T15:00:${String(tick++).padStart(2, '0')}.000Z`,
  initialState: hydratedAfterResponse
});
const hydratedResponseReplayEventCount = hydratedResponseReplayStore.state.events.length;
const hydratedResponseReplay = await hydratedResponseReplayStore.recordVisibleResponse(transaction.id, {
  idempotencyKey: 'response-30-key',
  responseId: 'response-30',
  hostMessageId: '30',
  outcomeId: 'outcome-29',
  responseKind: 'directiveNarration'
});
assert.deepEqual(hydratedResponseReplay.visibleResponseRef, postedResponse.visibleResponseRef, 'hydrated same-key visible response should replay without mutation');
assert.equal(hydratedResponseReplayStore.state.events.length, hydratedResponseReplayEventCount, 'hydrated same-key visible response replay must not append another event');
const beforeResponseReplayEvents = coreStore.state.events.length;
const replayResponse = await coreStore.recordVisibleResponse(transaction.id, {
  idempotencyKey: 'response-30-key',
  responseId: 'response-30',
  hostMessageId: '30',
  outcomeId: 'outcome-29',
  responseKind: 'directiveNarration'
});
assert.deepEqual(replayResponse.visibleResponseRef, postedResponse.visibleResponseRef, 'same response idempotency key should replay visible response');
assert.equal(coreStore.state.events.length, beforeResponseReplayEvents, 'same response replay must not append another event');
await assert.rejects(
  () => coreStore.recordVisibleResponse(transaction.id, {
    idempotencyKey: 'response-30-other-key',
    responseId: 'response-31',
    hostMessageId: '31',
    outcomeId: 'outcome-29',
    responseKind: 'directiveNarration'
  }),
  /already has a visible response/
);
await coreStore.commitBackgroundBatch(transaction.id, {
  idempotencyKey: 'terminal-checkpoint-posted-29-key',
  batchId: 'terminal-checkpoint:txn-29:terminalOutcomeCheckpointPosted:terminal-decision-29',
  phaseAfter: 'backgroundSettling',
  outcomeId: 'outcome-29',
  backgroundEffectRefs: [
    {
      effect: 'terminalOutcomeCheckpointPosted',
      status: 'posted',
      interactionId: 'terminal-decision-29',
      outcomeId: 'outcome-29',
      turnId: 'turn-29',
      ingressId: 'ingress-29',
      hostMessageId: '29',
      checkpointHostMessageId: '30-checkpoint',
      rawCheckpointText: 'RAW_TERMINAL_CHECKPOINT_TEXT'
    }
  ],
  workers: [
    {
      worker: 'terminalOutcomeCheckpoint',
      sidecarType: 'terminalOutcomeCheckpoint',
      status: 'posted',
      interactionId: 'terminal-decision-29',
      outcomeId: 'outcome-29',
      checkpointHostMessageId: '30-checkpoint'
    }
  ]
});
const manifestBeforeBackground = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
const beforeBackgroundHeadWrites = storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length;
const beforeBackgroundHostMapWrites = storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length;
const beforeBackgroundPromptWrites = storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length;
const beforeBackgroundTurnWrites = storage.writeLog.filter((key) => key.includes('/turns/')).length;
const beforeBackgroundDiagnosticsWrites = storage.writeLog.filter((key) => key.includes('/diagnostics/')).length;
const beforeBackgroundWriteStart = storage.writeLog.length;
const beforeBackgroundReadStart = storage.readLog.length;
const acceptedBatchHash29 = hashStableJson({ accepted: 'sidecar-batch-29' });
const reviewHash29 = hashStableJson({ review: 'command-bearing-review-29' }).slice(0, 16);
const backgroundCommit29 = await coreStore.commitBackgroundBatch(transaction.id, {
  baseMechanicsRevision: 1,
  idempotencyKey: 'forge-29-key',
  batchId: 'forge-29',
  phaseAfter: 'backgroundSettling',
  sourceToken: 'turnSourceFrame:frame-29',
  sourceFrameRef: {
    kind: 'directive.turnSourceFrameRef.v1',
    schemaVersion: 1,
    id: 'frame-29',
    campaignId: 'campaign-core-v2',
    saveId: 'save-core-v2',
    chatId: 'ashes-chat',
    hostMessageId: '29',
    textHash: 'source-text-hash-29',
    selectedAssistantVariantHash: 'selected-assistant-hash-29',
    rawPlayerText: 'RAW_BACKGROUND_SOURCE_FRAME_TEXT'
  },
  promptDirtyDomains: ['continuity'],
  operations: [
    {
      domain: 'continuity',
      op: 'upsertFactHash',
      factHash: 'fact-hash-1'
    }
  ],
  backgroundEffectRefs: [
    {
      kind: 'directive.commandBearingReviewClosure.v1',
      id: 'closure-29',
      reviewHash: reviewHash29,
      rawReviewText: 'RAW_BACKGROUND_REVIEW_TEXT'
    }
  ],
  forgeBatchRef: {
    kind: 'directive.forgeBatchCommitRef.v1',
    batchId: 'forge-29',
    operationBundleHash: 'operation-bundle-hash-29',
    acceptedBatchHash: acceptedBatchHash29,
    reviewHash: reviewHash29,
    rawProviderText: 'RAW_BACKGROUND_PROVIDER_TEXT'
  },
  workers: [
    {
      worker: 'continuity',
      status: 'applied',
      sourceToken: 'source-token-29'
    }
  ]
});
const returnedBackground29 = backgroundCommit29.backgroundBatches.find((entry) => entry.batchId === 'forge-29');
assert.equal(returnedBackground29.forgeBatchRef.acceptedBatchHash, acceptedBatchHash29, 'commitBackgroundBatch return should carry accepted batch identity in durable ref evidence');
assert.equal(returnedBackground29.forgeBatchRef.reviewHash, reviewHash29, 'commitBackgroundBatch return should carry review hash identity in durable ref evidence');
assert.equal(returnedBackground29.backgroundEffectRefs[0].reviewHash, reviewHash29, 'commitBackgroundBatch return should carry compact effect review hash evidence');
assert.equal(JSON.stringify(returnedBackground29).includes('RAW_BACKGROUND_PROVIDER_TEXT'), false, 'returned background batch refs must redact raw provider text');
assert.equal(JSON.stringify(returnedBackground29).includes('RAW_BACKGROUND_REVIEW_TEXT'), false, 'returned background effect refs must redact raw review text');
const backgroundWriteKeys = storage.writeLog.slice(beforeBackgroundWriteStart);
const backgroundReadKeys = storage.readLog.slice(beforeBackgroundReadStart);
assert.equal(storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length, beforeBackgroundHeadWrites, 'commitBackgroundBatch must not rewrite CORE head on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length, beforeBackgroundHostMapWrites, 'commitBackgroundBatch must not rewrite host map on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length, beforeBackgroundPromptWrites, 'commitBackgroundBatch must not rewrite prompt cache on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.includes('/turns/')).length, beforeBackgroundTurnWrites, 'commitBackgroundBatch must not write turn segments');
assert.equal(storage.writeLog.filter((key) => key.includes('/diagnostics/')).length, beforeBackgroundDiagnosticsWrites, 'commitBackgroundBatch must not write diagnostics segments');
assert.equal(backgroundWriteKeys.filter((key) => key.includes('/events/')).length, 1, 'commitBackgroundBatch append should write exactly one event tail');
assert.equal(backgroundWriteKeys.filter((key) => key.endsWith('/save-manifest.v2.json')).length, 1, 'commitBackgroundBatch append should publish one save manifest');
assert.equal(backgroundWriteKeys.filter((key) => key.endsWith('/campaign-manifest.v2.json')).length, 1, 'commitBackgroundBatch append should publish one campaign manifest');
assert.equal(backgroundWriteKeys.length, 3, 'commitBackgroundBatch append should write only event tail, save manifest, and campaign manifest');
assert.equal(backgroundWriteKeys[backgroundWriteKeys.length - 2].endsWith('/save-manifest.v2.json'), true, 'commitBackgroundBatch append should write save manifest after segment artifacts');
assert.equal(backgroundWriteKeys[backgroundWriteKeys.length - 1].endsWith('/campaign-manifest.v2.json'), true, 'commitBackgroundBatch append should write campaign manifest last');
assert.equal(backgroundReadKeys.some((key) => key.endsWith('/head.v2.json')), false, 'commitBackgroundBatch append must not read CORE head');
assert.equal(backgroundReadKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'commitBackgroundBatch append must not read host map');
assert.equal(backgroundReadKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'commitBackgroundBatch append must not read prompt cache');
assert.equal(backgroundReadKeys.some((key) => key.includes('/turns/')), false, 'commitBackgroundBatch append must not read turn segments');
const manifestAfterBackground = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
assert.deepEqual(manifestAfterBackground.head, manifestBeforeBackground.head, 'commitBackgroundBatch append should preserve the prior materialized head ref');
assert.deepEqual(manifestAfterBackground.hostMap, manifestBeforeBackground.hostMap, 'commitBackgroundBatch append should preserve the prior host-map ref');
assert.deepEqual(manifestAfterBackground.promptCache, manifestBeforeBackground.promptCache, 'commitBackgroundBatch append should preserve the prior prompt-cache ref');
assert.deepEqual(manifestAfterBackground.turnSegments, manifestBeforeBackground.turnSegments, 'commitBackgroundBatch append should preserve turn refs');
assert.deepEqual(manifestAfterBackground.diagnosticsSegments, manifestBeforeBackground.diagnosticsSegments, 'commitBackgroundBatch append should preserve diagnostics refs');
const hydratedAfterBackground = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
assert.equal(hydratedAfterBackground.transactions[transaction.id].backgroundBatchIds.includes('forge-29'), true, 'hydration should derive background batch ids from appended events');
assert.equal(hydratedAfterBackground.transactions[transaction.id].backgroundBatches.some((entry) => entry.batchId === 'forge-29' && entry.operationCount === 1), true, 'hydration should derive background operation summary from appended events');
const hydratedBackground29 = hydratedAfterBackground.transactions[transaction.id].backgroundBatches.find((entry) => entry.batchId === 'forge-29');
assert.equal(hydratedBackground29.forgeBatchRef.acceptedBatchHash, acceptedBatchHash29, 'hydration should preserve compact accepted batch identity from background event refs');
assert.equal(hydratedBackground29.forgeBatchRef.reviewHash, reviewHash29, 'hydration should preserve compact review hash from background event refs');
assert.equal(hydratedBackground29.backgroundEffectRefs[0].reviewHash, reviewHash29, 'hydration should preserve compact effect review hash evidence');
assert.equal(JSON.stringify(hydratedBackground29).includes('RAW_BACKGROUND_PROVIDER_TEXT'), false, 'hydrated background refs must redact raw provider text');
assert.equal(JSON.stringify(hydratedBackground29).includes('RAW_BACKGROUND_REVIEW_TEXT'), false, 'hydrated background refs must redact raw review text');
assert.equal(hydratedAfterBackground.promptDirtyDomains.includes('continuity'), true, 'hydration should derive background prompt dirty domains from appended events');
assert.equal(hydratedAfterBackground.revisions.mechanics, 2, 'hydration should derive background mechanics revision from appended events');
const hydratedBackgroundReplayStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  now: () => `2026-06-28T15:00:${String(tick++).padStart(2, '0')}.000Z`,
  initialState: hydratedAfterBackground
});
const hydratedBackgroundReplayEventCount = hydratedBackgroundReplayStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length;
await hydratedBackgroundReplayStore.commitBackgroundBatch(transaction.id, {
  baseMechanicsRevision: 2,
  idempotencyKey: 'forge-29-key',
  batchId: 'forge-29',
  phaseAfter: 'backgroundSettling'
});
assert.equal(
  hydratedBackgroundReplayStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length,
  hydratedBackgroundReplayEventCount,
  'hydrated same-key background batch replay must not append another event'
);
await coreStore.commitBackgroundBatch(transaction.id, {
  idempotencyKey: 'command-log-summary-29-key',
  batchId: 'command-log-summary-29',
  phaseAfter: 'settled',
  outcomeId: 'outcome-29',
  backgroundEffectRefs: [
    {
      effect: 'commandLogAssistedSummary',
      status: 'applied',
      outcomeId: 'outcome-29',
      assistedSummaryHash: 'summary-hash-29',
      rawSummary: 'RAW_COMMAND_LOG_BACKGROUND_SUMMARY'
    }
  ],
  workers: [
    {
      worker: 'commandLogSummary',
      sidecarType: 'commandLogSummary',
      status: 'applied',
      outcomeId: 'outcome-29',
      assistedSummaryHash: 'summary-hash-29'
    }
  ]
});
const replayBackgroundBatchEvents = coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length;
await coreStore.commitBackgroundBatch(transaction.id, {
  idempotencyKey: 'command-log-summary-29-key',
  batchId: 'command-log-summary-29',
  phaseAfter: 'settled',
  outcomeId: 'outcome-29'
});
assert.equal(
  coreStore.state.events.filter((event) => event.type === 'backgroundBatchCommitted').length,
  replayBackgroundBatchEvents,
  'same background idempotency key must replay without appending another event'
);
await coreStore.appendDiagnostics(transaction.id, {
  type: 'sidecar',
  worker: 'continuity',
  status: 'applied',
  rawPromptBody: 'RAW_SIDECAR_PROMPT',
  rawResponse: 'RAW_REGULAR_SIDECAR_RESPONSE'
});
await coreStore.appendDiagnostics(transaction.id, {
  type: 'sidecar',
  worker: 'commandLogSummary',
  sidecarType: 'commandLogSummary',
  status: 'applied',
  outcomeId: 'outcome-29',
  rawSummary: 'RAW_COMMAND_LOG_SUMMARY_TEXT',
  rawPromptBody: 'RAW_COMMAND_LOG_SUMMARY_PROMPT'
});

const recoveryFrame = createTurnSourceFrameContract({
  id: 'frame-31',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '31',
  textHash: hashStableJson({ text: 'Edited dependent row.' }),
  createdAt: '2026-06-28T15:00:31.000Z'
});
const recoveryTransaction = await coreStore.beginTurn(recoveryFrame, {
  transactionId: 'txn-31',
  ingressId: 'ingress-31',
  idempotencyKey: 'begin-31'
});
const manifestBeforeRecovery = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
const beforeRecoveryHeadWrites = storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length;
const beforeRecoveryHostMapWrites = storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length;
const beforeRecoveryPromptWrites = storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length;
const beforeRecoveryTurnWrites = storage.writeLog.filter((key) => key.includes('/turns/')).length;
const beforeRecoveryDiagnosticsWrites = storage.writeLog.filter((key) => key.includes('/diagnostics/')).length;
const beforeRecoveryWriteStart = storage.writeLog.length;
const beforeRecoveryReadStart = storage.readLog.length;
await coreStore.markRecoveryRequired(recoveryTransaction.id, {
  id: 'recovery-31',
  reason: 'dependent-player-edit',
  status: 'required',
  idempotencyKey: 'recovery-31-key',
  rawText: 'RAW_EDITED_PLAYER_TEXT'
});
const recoveryWriteKeys = storage.writeLog.slice(beforeRecoveryWriteStart);
const recoveryReadKeys = storage.readLog.slice(beforeRecoveryReadStart);
assert.equal(storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length, beforeRecoveryHeadWrites, 'markRecoveryRequired must not rewrite CORE head on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length, beforeRecoveryHostMapWrites, 'markRecoveryRequired must not rewrite host map on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length, beforeRecoveryPromptWrites, 'markRecoveryRequired must not rewrite prompt cache on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.includes('/turns/')).length, beforeRecoveryTurnWrites, 'markRecoveryRequired must not write turn segments');
assert.equal(storage.writeLog.filter((key) => key.includes('/diagnostics/')).length, beforeRecoveryDiagnosticsWrites, 'markRecoveryRequired must not write diagnostics segments');
assert.equal(recoveryWriteKeys.filter((key) => key.includes('/events/')).length, 1, 'markRecoveryRequired append should write exactly one event tail');
assert.equal(recoveryWriteKeys.filter((key) => key.endsWith('/save-manifest.v2.json')).length, 1, 'markRecoveryRequired append should publish one save manifest');
assert.equal(recoveryWriteKeys.filter((key) => key.endsWith('/campaign-manifest.v2.json')).length, 1, 'markRecoveryRequired append should publish one campaign manifest');
assert.equal(recoveryWriteKeys.length, 3, 'markRecoveryRequired append should write only event tail, save manifest, and campaign manifest');
assert.equal(recoveryWriteKeys[recoveryWriteKeys.length - 2].endsWith('/save-manifest.v2.json'), true, 'markRecoveryRequired append should write save manifest after segment artifacts');
assert.equal(recoveryWriteKeys[recoveryWriteKeys.length - 1].endsWith('/campaign-manifest.v2.json'), true, 'markRecoveryRequired append should write campaign manifest last');
assert.equal(recoveryReadKeys.some((key) => key.endsWith('/head.v2.json')), false, 'markRecoveryRequired append must not read CORE head');
assert.equal(recoveryReadKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'markRecoveryRequired append must not read host map');
assert.equal(recoveryReadKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'markRecoveryRequired append must not read prompt cache');
assert.equal(recoveryReadKeys.some((key) => key.includes('/turns/')), false, 'markRecoveryRequired append must not read turn segments');
const manifestAfterRecovery = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
assert.deepEqual(manifestAfterRecovery.head, manifestBeforeRecovery.head, 'markRecoveryRequired append should preserve the prior materialized head ref');
assert.deepEqual(manifestAfterRecovery.hostMap, manifestBeforeRecovery.hostMap, 'markRecoveryRequired append should preserve the prior host-map ref');
assert.deepEqual(manifestAfterRecovery.promptCache, manifestBeforeRecovery.promptCache, 'markRecoveryRequired append should preserve the prior prompt-cache ref');
assert.deepEqual(manifestAfterRecovery.turnSegments, manifestBeforeRecovery.turnSegments, 'markRecoveryRequired append should preserve turn refs');
assert.deepEqual(manifestAfterRecovery.diagnosticsSegments, manifestBeforeRecovery.diagnosticsSegments, 'markRecoveryRequired append should preserve diagnostics refs');
const hydratedAfterRecovery = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
assert.equal(hydratedAfterRecovery.transactions[recoveryTransaction.id].phase, 'recoveryRequired', 'hydration should derive recovery phase from appended events');
assert.equal(hydratedAfterRecovery.transactions[recoveryTransaction.id].recoveryCaseId, 'recovery-31', 'hydration should derive recovery case id from appended events');
assert.equal(hydratedAfterRecovery.transactions[recoveryTransaction.id].recoveryIdempotencyKey, 'recovery-31-key', 'hydration should preserve recovery idempotency from appended events');
assert.equal(hydratedAfterRecovery.revisions.runtime >= coreStore.state.transactions[recoveryTransaction.id].revisions.runtime, true, 'hydration should fold runtime revision from appended recovery event');
const hydratedRecoveryReplayStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  now: () => `2026-06-28T15:00:${String(tick++).padStart(2, '0')}.000Z`,
  initialState: hydratedAfterRecovery
});
const hydratedRecoveryReplayEventCount = hydratedRecoveryReplayStore.state.events.length;
const hydratedRecoveryReplay = await hydratedRecoveryReplayStore.markRecoveryRequired(recoveryTransaction.id, {
  id: 'recovery-31',
  reason: 'dependent-player-edit',
  status: 'required',
  idempotencyKey: 'recovery-31-key'
});
assert.equal(hydratedRecoveryReplay.id, 'recovery-31', 'hydrated same-key recovery should replay the existing case');
assert.equal(hydratedRecoveryReplayStore.state.events.length, hydratedRecoveryReplayEventCount, 'hydrated same-key recovery replay must not append another event');

const retryFrame = createTurnSourceFrameContract({
  id: 'frame-32',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '32',
  textHash: hashStableJson({ text: 'Retry the visible response.' }),
  createdAt: '2026-06-28T15:00:32.000Z'
});
const retryTransaction = await coreStore.beginTurn(retryFrame, {
  transactionId: 'txn-32',
  ingressId: 'ingress-32',
  idempotencyKey: 'begin-32'
});
await coreStore.advanceTurn(retryTransaction.id, {
  phase: 'routePending',
  route: 'directiveCommit',
  reason: 'retryable-response-test',
  idempotencyKey: 'advance-32'
});
const responseRetryCase = await coreStore.markRecoveryRequired(retryTransaction.id, {
  id: 'recovery-32',
  reason: 'host-response-post-failure',
  responseRetry: true,
  repairDecision: {
    kind: 'directive.repairResponseRecoveryDecision.v1',
    eventType: 'hostResponsePostFailure',
    policySource: 'core-store-sentinel',
    responseStatus: 'responseRetryRequired',
    phaseAfter: 'responseRetryRequired',
    normalTurnAllowed: false
  },
  allowedActions: ['retryResponse'],
  idempotencyKey: 'recovery-32-key',
  rawText: 'RAW_FAILED_RESPONSE_TEXT'
});
assert.equal(responseRetryCase.status, 'required');
assert.equal(coreStore.state.transactions[retryTransaction.id].phase, 'responseRetryRequired');
await assert.rejects(
  () => coreStore.recordVisibleResponse(retryTransaction.id, {
    idempotencyKey: 'response-32-unauthorized-key',
    responseId: 'response-32-unauthorized',
    hostMessageId: '33-unauthorized',
    outcomeId: 'outcome-32',
    responseKind: 'directiveNarration'
  }),
  (error) => error?.code === 'DIRECTIVE_CORE_RESPONSE_RETRY_VISIBLE_RESPONSE_UNAUTHORIZED',
  'responseRetryRequired must not close without REPAIR retry actuation authorization'
);
const retriedResponse = await coreStore.recordVisibleResponse(retryTransaction.id, {
  idempotencyKey: 'response-32-key',
  responseId: 'response-32',
  hostMessageId: '33',
  outcomeId: 'outcome-32',
  responseKind: 'directiveNarration',
  repairDecision: {
    kind: 'directive.repairResponseRetryActuationDecision.v1',
    eventType: 'hostResponsePostFailure',
    action: 'recordVisibleResponse',
    authorized: true,
    recoveryResolved: true,
    reason: 'directive-response-retry-posted',
    recoveryCaseId: 'recovery-32',
    recoveryId: 'recovery-32',
    allowedActions: ['retryResponse']
  }
});
assert.equal(retriedResponse.phase, 'visibleResponsePosted', 'response retry phase must allow recording the eventual visible response');
const beforeRetryReplayEvents = coreStore.state.events.length;
await coreStore.recordVisibleResponse(retryTransaction.id, {
  idempotencyKey: 'response-32-key',
  responseId: 'response-32',
  hostMessageId: '33',
  outcomeId: 'outcome-32',
  responseKind: 'directiveNarration'
});
assert.equal(coreStore.state.events.length, beforeRetryReplayEvents, 'response retry replay must not append another visible-response event');
const retryResolutionProjection = coreStore.readProjections().recoveryJournal.find((entry) => (
  entry.transactionId === retryTransaction.id
  && entry.status === 'resolved'
  && entry.reason === 'directive-response-retry-posted'
));
assert.ok(retryResolutionProjection, 'response retry closure must project a resolved recovery');
assert.equal(retryResolutionProjection.repairDecision.kind, 'directive.repairResponseRetryActuationDecision.v1');
await assert.rejects(
  () => coreStore.recordVisibleResponse(recoveryTransaction.id, {
    idempotencyKey: 'response-31-key',
    responseId: 'response-31',
    hostMessageId: '34',
    outcomeId: 'outcome-31',
    responseKind: 'directiveNarration'
  }),
  (error) => error?.code === 'DIRECTIVE_CORE_RECOVERY_VISIBLE_RESPONSE_UNAUTHORIZED',
  'generic recoveryRequired remains terminal for visible responses'
);

const unavailableClosureFrame = createTurnSourceFrameContract({
  id: 'frame-36',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '36',
  textHash: hashStableJson({ text: 'A host-native response was unavailable, then reobserved.' }),
  createdAt: '2026-06-28T15:00:36.000Z'
});
const unavailableClosureTransaction = await coreStore.beginTurn(unavailableClosureFrame, {
  transactionId: 'txn-36',
  ingressId: 'ingress-36',
  idempotencyKey: 'begin-36'
});
await coreStore.advanceTurn(unavailableClosureTransaction.id, {
  phase: 'routePending',
  route: 'hostContinue',
  reason: 'host-native-unavailable-reobserve-closure-route',
  idempotencyKey: 'advance-36-route'
});
await coreStore.advanceTurn(unavailableClosureTransaction.id, {
  phase: 'hostContinueReleased',
  route: 'hostContinue',
  reason: 'host-native-unavailable-reobserve-closure-release',
  idempotencyKey: 'advance-36-release'
});
await coreStore.markRecoveryRequired(unavailableClosureTransaction.id, {
  id: 'recovery-36',
  reason: 'hostNativeAssistantUnavailable',
  phaseAfter: 'recoveryRequired',
  responseRetry: false,
  repairDecision: {
    kind: 'directive.repairResponseRecoveryDecision.v1',
    eventType: 'hostNativeAssistantUnavailable',
    responseStatus: 'unavailable',
    allowedActions: ['reobserveHostAssistantRows', 'reviewHostNativeAvailability'],
    normalTurnAllowed: false
  },
  allowedActions: ['reobserveHostAssistantRows', 'reviewHostNativeAvailability'],
  idempotencyKey: 'recovery-36-key'
});
assert.equal(coreStore.state.transactions[unavailableClosureTransaction.id].phase, 'recoveryRequired');
const unavailableClosureHash = hashStableJson({ text: 'The host-native row was reobserved safely.' });
const unavailableClosure = await coreStore.recordVisibleResponse(unavailableClosureTransaction.id, {
  idempotencyKey: 'response-36-key',
  responseId: 'response-36',
  hostMessageId: '37',
  outcomeId: 'outcome-36',
  responseKind: 'hostContinue',
  textHash: unavailableClosureHash,
  repairDecision: {
    kind: 'directive.repairResponseReobserveClosureDecision.v1',
    authorized: true,
    action: 'recordVisibleResponse',
    reason: 'host-native-response-reobserved',
    eventType: 'hostNativeAssistantUnavailable',
    recoveryCaseId: 'recovery-36',
    recoveryId: 'recovery-36',
    allowedActions: ['reobserveHostAssistantRows', 'reviewHostNativeAvailability'],
    recoveryResolved: true
  }
});
assert.equal(unavailableClosure.phase, 'visibleResponsePosted', 'authorized unavailable reobserve should close as visible response');
assert.equal(coreStore.state.transactions[unavailableClosureTransaction.id].recoveryCaseId, null);
const unavailableClosureProjection = await readCoreStoreProjectionsV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
const unavailableClosureRecovery = unavailableClosureProjection.recoveryJournal.find((entry) => (
  entry.transactionId === unavailableClosureTransaction.id
  && entry.status === 'resolved'
));
assert.equal(unavailableClosureRecovery.reason, 'host-native-response-reobserved');
assert.equal(unavailableClosureRecovery.hostMessageId, '37');
assert.equal(unavailableClosureRecovery.textHash, unavailableClosureHash);

const hostNativeRepairFrame = createTurnSourceFrameContract({
  id: 'frame-35',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '35',
  textHash: hashStableJson({ text: 'A host-native continuation is observed after background settlement.' }),
  createdAt: '2026-06-28T15:00:35.000Z'
});
const hostNativeRepairTransaction = await coreStore.beginTurn(hostNativeRepairFrame, {
  transactionId: 'txn-35',
  ingressId: 'ingress-35',
  idempotencyKey: 'begin-35'
});
await coreStore.advanceTurn(hostNativeRepairTransaction.id, {
  phase: 'routePending',
  route: 'hostContinue',
  reason: 'host-native-missing-hash-repair-test',
  idempotencyKey: 'advance-35-route'
});
await coreStore.advanceTurn(hostNativeRepairTransaction.id, {
  phase: 'hostContinueReleased',
  route: 'hostContinue',
  reason: 'host-native-released-before-background',
  idempotencyKey: 'advance-35-release'
});
await coreStore.commitBackgroundBatch(hostNativeRepairTransaction.id, {
  batchId: 'background-before-visible-35',
  idempotencyKey: 'background-before-visible-35',
  outcomeId: 'outcome-35',
  operations: [],
  workers: [{ workerKey: 'diagnostic', status: 'noChange' }]
});
assert.equal(coreStore.state.transactions[hostNativeRepairTransaction.id].phase, 'backgroundSettling');
await coreStore.recordVisibleResponse(hostNativeRepairTransaction.id, {
  idempotencyKey: 'response-35-key',
  responseId: 'response-35',
  hostMessageId: '36',
  responseKind: 'hostContinue',
  hostGenerationReleasedAt: '2026-06-28T15:00:35.000Z',
  postedAt: '2026-06-28T15:00:45.000Z'
});
assert.equal(coreStore.state.transactions[hostNativeRepairTransaction.id].visibleResponseRef.textHash, null);
const repairedHostNativeHash = hashStableJson({ text: 'Host-native row text was recovered later.' });
const manifestBeforeResponseRepair = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
const beforeResponseRepairHeadWrites = storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length;
const beforeResponseRepairHostMapWrites = storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length;
const beforeResponseRepairPromptWrites = storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length;
const beforeResponseRepairTurnWrites = storage.writeLog.filter((key) => key.includes('/turns/')).length;
const beforeResponseRepairDiagnosticsWrites = storage.writeLog.filter((key) => key.includes('/diagnostics/')).length;
const beforeResponseRepairWriteStart = storage.writeLog.length;
const beforeResponseRepairReadStart = storage.readLog.length;
await coreStore.repairVisibleResponseRef(hostNativeRepairTransaction.id, {
  hostMessageId: '36',
  textHash: repairedHostNativeHash,
  reason: 'test-missing-host-native-text-hash',
  idempotencyKey: 'repair-response-35-hash'
});
const responseRepairWriteKeys = storage.writeLog.slice(beforeResponseRepairWriteStart);
const responseRepairReadKeys = storage.readLog.slice(beforeResponseRepairReadStart);
assert.equal(storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length, beforeResponseRepairHeadWrites, 'repairVisibleResponseRef must not rewrite CORE head on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length, beforeResponseRepairHostMapWrites, 'repairVisibleResponseRef must not rewrite host map on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length, beforeResponseRepairPromptWrites, 'repairVisibleResponseRef must not rewrite prompt cache on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.includes('/turns/')).length, beforeResponseRepairTurnWrites, 'repairVisibleResponseRef must not write turn segments');
assert.equal(storage.writeLog.filter((key) => key.includes('/diagnostics/')).length, beforeResponseRepairDiagnosticsWrites, 'repairVisibleResponseRef must not write diagnostics segments');
assert.equal(responseRepairWriteKeys.filter((key) => key.includes('/events/')).length, 1, 'repairVisibleResponseRef append should write exactly one event tail');
assert.equal(responseRepairWriteKeys.filter((key) => key.endsWith('/save-manifest.v2.json')).length, 1, 'repairVisibleResponseRef append should publish one save manifest');
assert.equal(responseRepairWriteKeys.filter((key) => key.endsWith('/campaign-manifest.v2.json')).length, 1, 'repairVisibleResponseRef append should publish one campaign manifest');
assert.equal(responseRepairWriteKeys.length, 3, 'repairVisibleResponseRef append should write only event tail, save manifest, and campaign manifest');
assert.equal(responseRepairWriteKeys[responseRepairWriteKeys.length - 2].endsWith('/save-manifest.v2.json'), true, 'repairVisibleResponseRef append should write save manifest after segment artifacts');
assert.equal(responseRepairWriteKeys[responseRepairWriteKeys.length - 1].endsWith('/campaign-manifest.v2.json'), true, 'repairVisibleResponseRef append should write campaign manifest last');
assert.equal(responseRepairReadKeys.some((key) => key.endsWith('/head.v2.json')), false, 'repairVisibleResponseRef append must not read CORE head');
assert.equal(responseRepairReadKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'repairVisibleResponseRef append must not read host map');
assert.equal(responseRepairReadKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'repairVisibleResponseRef append must not read prompt cache');
assert.equal(responseRepairReadKeys.some((key) => key.includes('/turns/')), false, 'repairVisibleResponseRef append must not read turn segments');
const manifestAfterResponseRepair = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
assert.deepEqual(manifestAfterResponseRepair.head, manifestBeforeResponseRepair.head, 'repairVisibleResponseRef append should preserve the prior materialized head ref');
assert.deepEqual(manifestAfterResponseRepair.hostMap, manifestBeforeResponseRepair.hostMap, 'repairVisibleResponseRef append should preserve the prior host-map ref');
assert.deepEqual(manifestAfterResponseRepair.promptCache, manifestBeforeResponseRepair.promptCache, 'repairVisibleResponseRef append should preserve the prior prompt-cache ref');
assert.deepEqual(manifestAfterResponseRepair.turnSegments, manifestBeforeResponseRepair.turnSegments, 'repairVisibleResponseRef append should preserve turn refs');
assert.deepEqual(manifestAfterResponseRepair.diagnosticsSegments, manifestBeforeResponseRepair.diagnosticsSegments, 'repairVisibleResponseRef append should preserve diagnostics refs');
assert.equal(coreStore.state.transactions[hostNativeRepairTransaction.id].visibleResponseRef.textHash, repairedHostNativeHash);
const repairedProjection = await readCoreStoreProjectionsV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
const repairedProjectionResponse = repairedProjection.responseLedger.find((entry) => entry.transactionId === hostNativeRepairTransaction.id);
assert.equal(repairedProjectionResponse.textHash, repairedHostNativeHash);
const repairedProjectionHostRow = repairedProjection.hostMap.rows.find((entry) => entry.role === 'assistant' && entry.transactionId === hostNativeRepairTransaction.id);
assert.equal(repairedProjectionHostRow.textHash, repairedHostNativeHash, 'host-map projection should derive repaired response hash from events');
const hydratedAfterResponseRepair = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
assert.equal(hydratedAfterResponseRepair.transactions[hostNativeRepairTransaction.id].visibleResponseRef.textHash, repairedHostNativeHash, 'hydration should derive repaired response hash from appended events');
const beforeDuplicateRepairEvents = coreStore.state.events.length;
const duplicateRepair = await coreStore.repairVisibleResponseRef(hostNativeRepairTransaction.id, {
  hostMessageId: '36',
  textHash: repairedHostNativeHash,
  reason: 'duplicate-repair-no-op',
  idempotencyKey: 'repair-response-35-hash'
});
assert.equal(duplicateRepair.visibleResponseRef.textHash, repairedHostNativeHash, 'duplicate visible response repair should replay the repaired ref');
assert.equal(coreStore.state.events.length, beforeDuplicateRepairEvents, 'duplicate visible response repair must not append another event');
const hydratedResponseRepairStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  now: () => `2026-06-28T15:00:${String(tick++).padStart(2, '0')}.000Z`,
  initialState: hydratedAfterResponseRepair
});
await assert.rejects(
  () => hydratedResponseRepairStore.repairVisibleResponseRef(hostNativeRepairTransaction.id, {
    hostMessageId: '37',
    textHash: hashStableJson({ text: 'Wrong host row.' }),
    reason: 'wrong-host-from-hydrated-ref',
    idempotencyKey: 'repair-response-35-wrong-host'
  }),
  /visible response host id does not match repair patch/,
  'hydrated event-derived visible response refs should still reject host-id repair mismatches'
);

const settledRecoveryFrame = createTurnSourceFrameContract({
  id: 'frame-34',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '34',
  textHash: hashStableJson({ text: 'A source row that was already settled is edited.' }),
  createdAt: '2026-06-28T15:00:34.000Z'
});
const settledRecoveryTransaction = await coreStore.beginTurn(settledRecoveryFrame, {
  transactionId: 'txn-34',
  ingressId: 'ingress-34',
  idempotencyKey: 'begin-34'
});
await coreStore.advanceTurn(settledRecoveryTransaction.id, {
  phase: 'routePending',
  route: 'directiveCommit',
  reason: 'settled-source-mutation-test',
  idempotencyKey: 'settled-recovery-route-34'
});
await coreStore.advanceTurn(settledRecoveryTransaction.id, {
  phase: 'settled',
  route: 'directiveCommit',
  reason: 'settled-before-source-mutation-test',
  idempotencyKey: 'settled-before-recovery-34'
});
const settledRecoveryCase = await coreStore.markRecoveryRequired(settledRecoveryTransaction.id, {
  id: 'recovery-34',
  reason: 'playerMessageEdited',
  sourceMutation: {
    kind: 'directive.sourceMutation.v1',
    sourceKind: 'playerIngress',
    eventType: 'playerMessageEdited',
    hostMessageId: '34',
    ingressId: 'ingress-34',
    outcomeId: 'outcome-34',
    responseId: 'response-34',
    sourceFrameId: 'frame-34',
    replacementText: 'edited settled source raw text that must not persist',
    replacementTextHash: hashStableJson({ text: 'edited settled source' }),
    replacementTextPresent: true,
    preOutcomeRevision: 42,
    rawPlayerText: 'RAW_SETTLED_SOURCE_EDIT'
  },
  repairDecision: {
    kind: 'directive.repairDecision.v1',
    eventType: 'playerMessageEdited',
    sourceKind: 'playerIngress',
    transactionId: 'txn-34',
    sourceMutation: true,
    action: 'reviewRequired',
    normalTurnAllowed: false
  },
  dependentOutcomeId: 'outcome-34',
  dependentResponseId: 'response-34',
  allowedActions: ['reviewSourceMutation'],
  idempotencyKey: 'recovery-34-key'
});
assert.equal(settledRecoveryCase.phase, 'recoveryRequired');
assert.equal(coreStore.state.transactions[settledRecoveryTransaction.id].phase, 'recoveryRequired');

const terminalResolutionFrame = createTurnSourceFrameContract({
  id: 'frame-33',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '33',
  textHash: hashStableJson({ text: 'Push on from the terminal checkpoint.' }),
  createdAt: '2026-06-28T15:00:33.000Z'
});
const terminalResolutionTransaction = await coreStore.beginTurn(terminalResolutionFrame, {
  transactionId: 'txn-33',
  ingressId: 'ingress-33',
  idempotencyKey: 'begin-33'
});
await coreStore.advanceTurn(terminalResolutionTransaction.id, {
  phase: 'routePending',
  route: 'terminalCheckpointResolution',
  reason: 'terminal-checkpoint-resolution-test',
  idempotencyKey: 'terminal-resolution-route-33'
});
await coreStore.commitBackgroundBatch(terminalResolutionTransaction.id, {
  idempotencyKey: 'terminal-checkpoint-resolved-33-key',
  batchId: 'terminal-checkpoint:txn-33:terminalOutcomeCheckpointResolved:terminal-decision-29',
  phaseAfter: 'settled',
  outcomeId: 'outcome-29',
  backgroundEffectRefs: [
    {
      effect: 'terminalOutcomeCheckpointResolved',
      status: 'resolved',
      interactionId: 'terminal-decision-29',
      action: 'pushOn',
      outcomeId: 'outcome-29',
      ingressId: 'ingress-33',
      resolutionIngressId: 'ingress-33',
      resolutionHostMessageId: '33',
      rawPlayerText: 'RAW_TERMINAL_RESOLUTION_TEXT'
    }
  ],
  workers: [
    {
      worker: 'terminalOutcomeCheckpoint',
      sidecarType: 'terminalOutcomeCheckpoint',
      status: 'resolved',
      interactionId: 'terminal-decision-29',
      action: 'pushOn',
      outcomeId: 'outcome-29',
      ingressId: 'ingress-33',
      resolutionIngressId: 'ingress-33',
      resolutionHostMessageId: '33'
    }
  ]
});

const restartPriorFrame = createTurnSourceFrameContract({
  id: 'frame-restart-prior',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '37',
  textHash: hashStableJson({ text: 'Prior latest row before edit.' }),
  createdAt: '2026-06-28T15:00:37.000Z'
});
const restartPriorTransaction = await coreStore.beginTurn(restartPriorFrame, {
  transactionId: 'txn-restart-prior',
  ingressId: 'ingress-restart-prior',
  idempotencyKey: 'begin-restart-prior'
});
const restartReplacementFrame = createTurnSourceFrameContract({
  id: 'frame-restart-replacement',
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  chatId: 'ashes-chat',
  hostMessageId: '37',
  textHash: hashStableJson({ text: 'Edited latest row without a dependent response.' }),
  createdAt: '2026-06-28T15:00:38.000Z'
});
const restartReplacementTransaction = await coreStore.beginTurn(restartReplacementFrame, {
  transactionId: 'txn-restart-replacement',
  ingressId: 'ingress-restart-replacement',
  idempotencyKey: 'begin-restart-replacement'
});
await assert.rejects(
  () => coreStore.supersedeLatestSourceTransaction(transaction.id, restartReplacementTransaction.id, {
    idempotencyKey: 'restart-after-visible-key'
  }),
  /cannot restart after mechanics or visible response/
);
const manifestBeforeRestart = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
const beforeRestartHeadWrites = storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length;
const beforeRestartHostMapWrites = storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length;
const beforeRestartPromptWrites = storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length;
const beforeRestartTurnWrites = storage.writeLog.filter((key) => key.includes('/turns/')).length;
const beforeRestartDiagnosticsWrites = storage.writeLog.filter((key) => key.includes('/diagnostics/')).length;
const beforeRestartWriteStart = storage.writeLog.length;
const beforeRestartReadStart = storage.readLog.length;
const restartResult = await coreStore.supersedeLatestSourceTransaction(restartPriorTransaction.id, restartReplacementTransaction.id, {
  priorRecoveryId: 'recovery-restart-prior',
  reason: 'latest-source-reobserved',
  idempotencyKey: 'restart-prior-to-replacement-key',
  repairDecision: {
    kind: 'directive.repairSourceReobserveDecision.v1',
    action: 'restartLatestSource',
    rawPlayerText: 'RAW_RESTART_PLAYER_TEXT'
  },
  sourceMutation: {
    kind: 'directive.sourceMutation.v1',
    sourceKind: 'playerIngress',
    eventType: 'playerMessageReobserved',
    hostMessageId: '37',
    ingressId: 'ingress-restart-prior',
    sourceFrameId: 'frame-restart-prior',
    replacementIngressId: 'ingress-restart-replacement',
    replacementSourceFrameId: 'frame-restart-replacement',
    replacementText: 'RAW_RESTART_REPLACEMENT_TEXT'
  }
});
const restartWriteKeys = storage.writeLog.slice(beforeRestartWriteStart);
const restartReadKeys = storage.readLog.slice(beforeRestartReadStart);
assert.equal(storage.writeLog.filter((key) => key.endsWith('/head.v2.json')).length, beforeRestartHeadWrites, 'supersedeLatestSourceTransaction must not rewrite CORE head on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/host-map.v2.json')).length, beforeRestartHostMapWrites, 'supersedeLatestSourceTransaction must not rewrite host map on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.endsWith('/prompt-cache.v2.json')).length, beforeRestartPromptWrites, 'supersedeLatestSourceTransaction must not rewrite prompt cache on the append-only hot path');
assert.equal(storage.writeLog.filter((key) => key.includes('/turns/')).length, beforeRestartTurnWrites, 'supersedeLatestSourceTransaction must not write turn segments');
assert.equal(storage.writeLog.filter((key) => key.includes('/diagnostics/')).length, beforeRestartDiagnosticsWrites, 'supersedeLatestSourceTransaction must not write diagnostics segments');
assert.equal(restartWriteKeys.filter((key) => key.includes('/events/')).length, 1, 'supersedeLatestSourceTransaction append should write exactly one event tail');
assert.equal(restartWriteKeys.filter((key) => key.endsWith('/save-manifest.v2.json')).length, 1, 'supersedeLatestSourceTransaction append should publish one save manifest');
assert.equal(restartWriteKeys.filter((key) => key.endsWith('/campaign-manifest.v2.json')).length, 1, 'supersedeLatestSourceTransaction append should publish one campaign manifest');
assert.equal(restartWriteKeys.length, 3, 'supersedeLatestSourceTransaction append should write only event tail, save manifest, and campaign manifest');
assert.equal(restartWriteKeys[restartWriteKeys.length - 2].endsWith('/save-manifest.v2.json'), true, 'supersedeLatestSourceTransaction append should write save manifest after segment artifacts');
assert.equal(restartWriteKeys[restartWriteKeys.length - 1].endsWith('/campaign-manifest.v2.json'), true, 'supersedeLatestSourceTransaction append should write campaign manifest last');
assert.equal(restartReadKeys.some((key) => key.endsWith('/head.v2.json')), false, 'supersedeLatestSourceTransaction append must not read CORE head');
assert.equal(restartReadKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'supersedeLatestSourceTransaction append must not read host map');
assert.equal(restartReadKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'supersedeLatestSourceTransaction append must not read prompt cache');
assert.equal(restartReadKeys.some((key) => key.includes('/turns/')), false, 'supersedeLatestSourceTransaction append must not read turn segments');
const manifestAfterRestart = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
assert.deepEqual(manifestAfterRestart.head, manifestBeforeRestart.head, 'supersedeLatestSourceTransaction append should preserve the prior materialized head ref');
assert.deepEqual(manifestAfterRestart.hostMap, manifestBeforeRestart.hostMap, 'supersedeLatestSourceTransaction append should preserve the prior host-map ref');
assert.deepEqual(manifestAfterRestart.promptCache, manifestBeforeRestart.promptCache, 'supersedeLatestSourceTransaction append should preserve the prior prompt-cache ref');
assert.deepEqual(manifestAfterRestart.turnSegments, manifestBeforeRestart.turnSegments, 'supersedeLatestSourceTransaction append should preserve turn refs');
assert.deepEqual(manifestAfterRestart.diagnosticsSegments, manifestBeforeRestart.diagnosticsSegments, 'supersedeLatestSourceTransaction append should preserve diagnostics refs');
assert.equal(restartResult.status, 'recorded');
assert.equal(restartResult.priorTransaction.phase, 'restartSuperseded');
assert.equal(restartResult.transaction.phase, 'observed');
assert.equal(restartResult.sourceRestart.priorTransactionId, 'txn-restart-prior');
assert.equal(restartResult.sourceRestart.newTransactionId, 'txn-restart-replacement');
assert.equal(restartResult.sourceRestart.recoveryId, 'recovery-restart-prior');
assert.equal(coreStore.state.transactions['txn-restart-prior'].restartedByTransactionId, 'txn-restart-replacement');
assert.equal(coreStore.state.transactions['txn-restart-replacement'].restartedFromTransactionId, 'txn-restart-prior');
assert.equal(JSON.stringify(coreStore.state).includes('RAW_RESTART_PLAYER_TEXT'), false, 'CORE source restart refs must not retain raw player text.');
assert.equal(JSON.stringify(coreStore.state).includes('RAW_RESTART_REPLACEMENT_TEXT'), false, 'CORE source restart mutations must not retain raw replacement text.');
const hydratedAfterRestart = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
assert.equal(hydratedAfterRestart.transactions['txn-restart-prior'].phase, 'restartSuperseded', 'hydration should derive source-restart prior phase from appended events');
assert.equal(hydratedAfterRestart.transactions['txn-restart-prior'].restartedByTransactionId, 'txn-restart-replacement', 'hydration should derive source-restart prior replacement link from appended events');
assert.equal(hydratedAfterRestart.transactions['txn-restart-replacement'].restartedFromTransactionId, 'txn-restart-prior', 'hydration should derive replacement source link from appended events');
assert.equal(JSON.stringify(hydratedAfterRestart).includes('RAW_RESTART_PLAYER_TEXT'), false, 'hydrated CORE source restart refs must not retain raw player text.');
assert.equal(JSON.stringify(hydratedAfterRestart).includes('RAW_RESTART_REPLACEMENT_TEXT'), false, 'hydrated CORE source restart mutations must not retain raw replacement text.');
const hydratedRestartReplayStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  now: () => `2026-06-28T15:00:${String(tick++).padStart(2, '0')}.000Z`,
  initialState: hydratedAfterRestart
});
const hydratedRestartReplayEventCount = hydratedRestartReplayStore.state.events.filter((event) => event.type === 'latestSourceRestarted').length;
const hydratedRestartReplay = await hydratedRestartReplayStore.supersedeLatestSourceTransaction('txn-restart-prior', 'txn-restart-replacement', {
  priorRecoveryId: 'recovery-restart-prior',
  reason: 'latest-source-reobserved',
  idempotencyKey: 'restart-prior-to-replacement-key'
});
assert.equal(hydratedRestartReplay.transaction.id, 'txn-restart-replacement', 'hydrated same-key source restart should replay the replacement transaction');
assert.equal(
  hydratedRestartReplayStore.state.events.filter((event) => event.type === 'latestSourceRestarted').length,
  hydratedRestartReplayEventCount,
  'hydrated same-key source restart replay must not append another event'
);
await assert.rejects(
  () => hydratedRestartReplayStore.supersedeLatestSourceTransaction('txn-restart-prior', 'txn-restart-replacement', {
    idempotencyKey: 'restart-prior-to-replacement-hydrated-other-key'
  }),
  /already has a source restart/,
  'hydrated different-key source restart should reject as already restarted'
);
const restartEventCount = coreStore.state.events.filter((event) => event.type === 'latestSourceRestarted').length;
const replayRestartResult = await coreStore.supersedeLatestSourceTransaction(restartPriorTransaction.id, restartReplacementTransaction.id, {
  priorRecoveryId: 'recovery-restart-prior',
  reason: 'latest-source-reobserved',
  idempotencyKey: 'restart-prior-to-replacement-key'
});
assert.equal(replayRestartResult.transaction.id, 'txn-restart-replacement');
assert.equal(
  coreStore.state.events.filter((event) => event.type === 'latestSourceRestarted').length,
  restartEventCount,
  'source restart idempotency must not append another latestSourceRestarted event'
);
await assert.rejects(
  () => coreStore.supersedeLatestSourceTransaction(restartPriorTransaction.id, restartReplacementTransaction.id, {
    idempotencyKey: 'restart-prior-to-replacement-other-key'
  }),
  /already has a source restart/
);

const projections = coreStore.readProjections();
assert.equal(projections.ingressLedger.length, 9);
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-29').status, 'settled');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-31').status, 'recoveryRequired');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-32').status, 'complete');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-33').status, 'settled');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-34').status, 'recoveryRequired');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-35').status, 'complete');
assert.equal(projections.ingressLedger.find((entry) => entry.transactionId === 'txn-36').status, 'complete');
const restartPriorProjection = projections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-prior');
const restartReplacementProjection = projections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-replacement');
assert.equal(restartPriorProjection.status, 'restartSuperseded');
assert.equal(restartPriorProjection.restartedByTransactionId, 'txn-restart-replacement');
assert.equal(restartPriorProjection.sourceRestart.reason, 'latest-source-reobserved');
assert.equal(restartReplacementProjection.status, 'pending');
assert.equal(restartReplacementProjection.restartedFromTransactionId, 'txn-restart-prior');
assert.equal(restartReplacementProjection.sourceRestart.priorIngressId, 'ingress-restart-prior');
assert.equal(projections.responseLedger.length, 4);
assert.equal(projections.responseLedger[0].hostMessageId, '30');
assert.equal(projections.responseLedger[0].generationStartedAt, '2026-06-28T15:00:40.000Z');
assert.equal(projections.responseLedger[0].turnTiming.architectureWithin60s, true);
assert.equal(projections.responseLedger[0].turnTiming.generationStartLatencyMs, 40000);
assert.equal(projections.responseLedger.find((entry) => entry.transactionId === 'txn-35').textHash, repairedHostNativeHash);
assert.equal(projections.responseLedger.find((entry) => entry.transactionId === 'txn-36').textHash, unavailableClosureHash);
const directiveTurnTiming = projections.turnTiming.find((entry) => entry.transactionId === 'txn-29');
assert.ok(directiveTurnTiming, 'CORE projections should expose persisted generation-start timing for live proof');
assert.equal(directiveTurnTiming.route, 'directiveCommit');
assert.equal(directiveTurnTiming.turnTiming.directiveGenerationStartedAt, Date.parse('2026-06-28T15:00:40.000Z'));
assert.equal(directiveTurnTiming.turnTiming.visibleResponsePostedAt, Date.parse('2026-06-28T15:01:45.000Z'));
assert.equal(directiveTurnTiming.turnTiming.generationStartLatencyMs, 40000);
assert.equal(directiveTurnTiming.turnTiming.providerCompletionLatencyMs, 65000);
assert.equal(directiveTurnTiming.turnTiming.architectureWithin60s, true);
assert.equal(projections.turnLedger.entries.length, 1);
assert.equal(projections.turnLedger.lastCommittedOutcomeId, 'outcome-29');
assert.equal(projections.recoveryJournal.length, 7);
assert.equal(projections.recoveryJournal[0].id, 'recovery-31');
const responseRetryProjection = projections.recoveryJournal.find((entry) => entry.id === 'recovery-32');
assert.equal(responseRetryProjection.phase, 'responseRetryRequired');
assert.deepEqual(responseRetryProjection.allowedActions, ['retryResponse']);
assert.equal(responseRetryProjection.repairDecision.kind, 'directive.repairResponseRecoveryDecision.v1');
assert.equal(responseRetryProjection.repairDecision.policySource, 'core-store-sentinel');
const unavailableRecoveryRequiredProjection = projections.recoveryJournal.find((entry) => (
  entry.id === 'recovery-36'
  && entry.status === 'required'
));
assert.equal(unavailableRecoveryRequiredProjection.phase, 'recoveryRequired');
assert.deepEqual(unavailableRecoveryRequiredProjection.allowedActions, ['reobserveHostAssistantRows', 'reviewHostNativeAvailability']);
const unavailableRecoveryResolvedProjection = projections.recoveryJournal.find((entry) => (
  entry.id === 'recovery-36'
  && entry.status === 'resolved'
));
assert.equal(unavailableRecoveryResolvedProjection.phase, 'visibleResponsePosted');
assert.equal(unavailableRecoveryResolvedProjection.reason, 'host-native-response-reobserved');
assert.equal(unavailableRecoveryResolvedProjection.hostMessageId, '37');
const sourceMutationRecoveryProjection = projections.recoveryJournal.find((entry) => entry.id === 'recovery-34');
assert.equal(sourceMutationRecoveryProjection.reason, 'playerMessageEdited');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.kind, 'directive.sourceMutation.v1');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.sourceKind, 'playerIngress');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.sourceFrameId, 'frame-34');
assert.equal(sourceMutationRecoveryProjection.sourceMutation.replacementTextHash.length, 64);
assert.equal(sourceMutationRecoveryProjection.sourceMutation.replacementTextPresent, true);
assert.equal('replacementText' in sourceMutationRecoveryProjection.sourceMutation, false);
assert.equal(sourceMutationRecoveryProjection.sourceMutation.rawPlayerText, '[redacted-raw-payload]');
assert.equal(sourceMutationRecoveryProjection.repairDecision.kind, 'directive.repairDecision.v1');
assert.equal(sourceMutationRecoveryProjection.repairDecision.action, 'reviewRequired');
assert.equal(sourceMutationRecoveryProjection.repairDecision.normalTurnAllowed, false);
assert.equal(sourceMutationRecoveryProjection.dependentOutcomeId, 'outcome-34');
assert.equal(sourceMutationRecoveryProjection.dependentResponseId, 'response-34');
assert.deepEqual(sourceMutationRecoveryProjection.allowedActions, ['reviewSourceMutation']);
assert.equal(JSON.stringify(sourceMutationRecoveryProjection).includes('RAW_SETTLED_SOURCE_EDIT'), false);
assert.equal(JSON.stringify(sourceMutationRecoveryProjection).includes('edited settled source raw text'), false);
const restartRecoveryProjection = projections.recoveryJournal.find((entry) => entry.id === 'recovery-restart-prior');
assert.equal(restartRecoveryProjection.status, 'resolved');
assert.equal(restartRecoveryProjection.phase, 'restartSuperseded');
assert.equal(restartRecoveryProjection.replacementTransactionId, 'txn-restart-replacement');
assert.equal(restartRecoveryProjection.replacementIngressId, 'ingress-restart-replacement');
assert.equal(restartRecoveryProjection.sourceMutation.replacementTextHash.length, 64);
assert.equal(JSON.stringify(restartRecoveryProjection).includes('RAW_RESTART_REPLACEMENT_TEXT'), false);
assert.equal(projections.modelCallDiagnostics.length, 1);
assert.equal(projections.modelCallDiagnostics[0].promptText, '[redacted-raw-payload]');
assert.equal(projections.backgroundBatches.length, 5);
const forgeBackgroundBatch = projections.backgroundBatches.find((entry) => entry.batchId === 'forge-29');
assert.ok(forgeBackgroundBatch);
assert.equal(forgeBackgroundBatch.transactionId, 'txn-29');
assert.equal(forgeBackgroundBatch.operationCount, 1);
assert.equal(forgeBackgroundBatch.workerCount, 1);
const commandLogBackgroundBatch = projections.backgroundBatches.find((entry) => entry.batchId === 'command-log-summary-29');
assert.ok(commandLogBackgroundBatch);
assert.equal(commandLogBackgroundBatch.transactionId, 'txn-29');
assert.equal(commandLogBackgroundBatch.operationCount, 0);
assert.equal(commandLogBackgroundBatch.workerCount, 1);
const terminalCheckpointBackgroundBatches = projections.backgroundBatches.filter((entry) => String(entry.batchId || '').startsWith('terminal-checkpoint:'));
assert.equal(terminalCheckpointBackgroundBatches.length, 2);
assert.equal(terminalCheckpointBackgroundBatches.every((entry) => entry.operationCount === 0), true, 'Terminal checkpoint settlement must not create mechanics operations.');
assert.equal(terminalCheckpointBackgroundBatches.every((entry) => entry.workerCount === 1), true, 'Terminal checkpoint settlement must identify one terminal worker/control effect.');
assert.equal(terminalCheckpointBackgroundBatches.some((entry) => entry.transactionId === 'txn-33'), true, 'Terminal resolution ingress must settle its own CORE transaction.');
assert.equal(projections.sidecarDiagnostics.length, 7);
assert.equal(projections.sidecarDiagnostics.some((entry) => entry.worker === 'continuity'), true);
assert.equal(projections.sidecarDiagnostics.filter((entry) => entry.worker === 'terminalOutcomeCheckpoint').length, 2);
assert.equal(JSON.stringify(projections.sidecarDiagnostics).includes('RAW_TERMINAL_CHECKPOINT_TEXT'), false);
assert.equal(JSON.stringify(projections.sidecarDiagnostics).includes('RAW_TERMINAL_RESOLUTION_TEXT'), false);
assert.equal(JSON.stringify(coreStore.state.events).includes('RAW_TERMINAL_CHECKPOINT_TEXT'), false);
assert.equal(JSON.stringify(coreStore.state.events).includes('RAW_TERMINAL_RESOLUTION_TEXT'), false);
const continuityDiagnostic = projections.sidecarDiagnostics.find((entry) => entry.worker === 'continuity');
assert.equal(continuityDiagnostic.rawResponse, '[redacted-raw-payload]');
assert.equal(JSON.stringify(projections.sidecarDiagnostics).includes('RAW_REGULAR_SIDECAR_RESPONSE'), false);
const commandLogSummaryDiagnostic = projections.sidecarDiagnostics.find((entry) => entry.worker === 'commandLogSummary');
assert.ok(commandLogSummaryDiagnostic);
assert.equal(commandLogSummaryDiagnostic.rawSummary, '[redacted-raw-payload]');
assert.equal(commandLogSummaryDiagnostic.rawPromptBody, '[redacted-raw-payload]');
assert.equal(projections.sidecarDiagnostics.some((entry) => entry.worker === 'commandLogSummary' && entry.assistedSummaryHash === 'summary-hash-29'), true);
assert.equal(JSON.stringify(projections.sidecarDiagnostics).includes('RAW_COMMAND_LOG_SUMMARY_TEXT'), false);
assert.equal(JSON.stringify(projections.sidecarDiagnostics).includes('RAW_COMMAND_LOG_BACKGROUND_SUMMARY'), false);
const persistedProjectionReadStart = storage.readLog.length;
const persistedProjections = await readCoreStoreProjectionsV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
const persistedProjectionReadKeys = storage.readLog.slice(persistedProjectionReadStart);
assert.equal(
  persistedProjectionReadKeys.some((key) => key.endsWith('/host-map.v2.json')),
  false,
  'persisted projection loader should derive host-map rows from events without reading the host-map cache'
);
assert.equal(persistedProjections.ingressLedger.length, projections.ingressLedger.length, 'persisted projection loader should derive ingress from segments');
assert.equal(
  persistedProjections.hostMap.rows.some((row) => row.role === 'player' && row.hostMessageId === '29' && row.transactionId === 'txn-29'),
  true,
  'persisted projection loader should derive player host-map rows from turnObserved events'
);
assert.equal(
  persistedProjections.hostMap.rows.some((row) => row.role === 'assistant' && row.hostMessageId === '30' && row.transactionId === 'txn-29'),
  true,
  'persisted projection loader should derive assistant host-map rows from visibleResponseRecorded events'
);
assert.equal(
  persistedProjections.hostMap.rows.some((row) => (
    row.role === 'player'
    && row.transactionId === 'txn-restart-prior'
    && row.status === 'restartSuperseded'
    && row.replacementTransactionId === 'txn-restart-replacement'
  )),
  true,
  'persisted projection loader should derive source-restart host-map status from latestSourceRestarted events'
);
assert.equal(
  persistedProjections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-prior').status,
  'restartSuperseded',
  'persisted projection loader should preserve prior restart status'
);
assert.equal(
  persistedProjections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-replacement').restartedFromTransactionId,
  'txn-restart-prior',
  'persisted projection loader should preserve replacement source-restart link'
);
assert.equal(persistedProjections.responseLedger.length, projections.responseLedger.length, 'persisted projection loader should derive responses from segments');
assert.equal(persistedProjections.turnTiming.length, projections.turnTiming.length, 'persisted projection loader should derive generation-start timing from segments');
assert.equal(
  persistedProjections.turnTiming.find((entry) => entry.transactionId === 'txn-29').turnTiming.generationStartLatencyMs,
  40000,
  'persisted projection timing should preserve submit-to-generation-start latency'
);
assert.equal(persistedProjections.turnLedger.entries.length, projections.turnLedger.entries.length, 'persisted projection loader should derive turns from segments');
assert.equal(persistedProjections.recoveryJournal.length, projections.recoveryJournal.length, 'persisted projection loader should derive recovery from segments');
assert.equal(
  persistedProjections.recoveryJournal.find((entry) => entry.id === 'recovery-restart-prior').replacementTransactionId,
  'txn-restart-replacement',
  'persisted projection loader should preserve source-restart recovery resolution'
);
assert.equal(
  persistedProjections.recoveryJournal.find((entry) => entry.id === 'recovery-34').sourceMutation.sourceKind,
  'playerIngress',
  'persisted projection loader should preserve sanitized source-mutation recovery details'
);
assert.equal(persistedProjections.backgroundBatches.length, projections.backgroundBatches.length, 'persisted projection loader should derive background batches from segments');
const hydratedState = await loadCoreStoreStateV2(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2'
});
const hydratedCoreStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  now: () => `2026-06-28T15:01:${String(tick++).padStart(2, '0')}.000Z`,
  initialState: hydratedState
});
const hydratedProjections = hydratedCoreStore.readProjections();
assert.equal(hydratedProjections.ingressLedger.length, projections.ingressLedger.length, 'hydrated CORE Store should preserve ingress projections');
assert.equal(
  hydratedProjections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-prior').restartedByTransactionId,
  'txn-restart-replacement',
  'hydrated CORE Store should preserve prior source-restart link'
);
assert.equal(
  hydratedProjections.ingressLedger.find((entry) => entry.transactionId === 'txn-restart-replacement').sourceRestart.priorTransactionId,
  'txn-restart-prior',
  'hydrated CORE Store should preserve replacement source-restart ref'
);
assert.equal(hydratedProjections.responseLedger.length, projections.responseLedger.length, 'hydrated CORE Store should preserve response projections');
assert.equal(hydratedProjections.turnTiming.length, projections.turnTiming.length, 'hydrated CORE Store should preserve timing projections');
assert.equal(hydratedCoreStore.state.events.length, coreStore.state.events.length, 'hydrated CORE Store should preserve event segments');
assert.equal(hydratedCoreStore.state.counters.transactions, 9, 'hydrated CORE Store should derive current transaction count from event segments');
assert.equal(hydratedCoreStore.state.counters.diagnostics, 3, 'hydrated CORE Store should derive current diagnostic count from diagnostics segments');
assert.equal(hydratedCoreStore.state.revisions.diagnostic, 3, 'hydrated CORE Store should derive current diagnostic revision from diagnostics segments');
assert.equal(hydratedCoreStore.state.revisions.mechanics, 2, 'hydrated CORE Store should derive mechanics revision from event/turn segments');
assert.equal(hydratedCoreStore.state.revisions.prompt, 0, 'hydrated CORE Store must not advance prompt revision');
assert.equal(hydratedCoreStore.state.promptDirtyDomains.includes('missionQuestThread'), true);
assert.equal(hydratedCoreStore.state.promptDirtyDomains.includes('continuity'), true);

const head = await coreStore.loadHead();
assert.equal(
  head.coreStore.counters.transactions < hydratedCoreStore.state.counters.transactions,
  true,
  'CORE materialized head is a checkpoint/cache; current transaction authority comes from manifest-selected segments'
);
assert.equal(head.coreStore.revisions.prompt, 0, 'CORE head must not advance prompt revision');

const saveManifest = await loadV2SaveManifest(adapter, {
  campaignId: 'campaign-core-v2',
  saveId: 'save-core-v2',
  layout: 'core'
});
assert.equal(saveManifest.layout, 'core');
assert.equal(saveManifest.eventSegments.length, 1);
assert.equal(saveManifest.turnSegments.length, 1);
assert.equal(saveManifest.diagnosticsSegments.length >= 1, true);
const eventSegment = await readV2ArtifactRef(adapter, saveManifest.eventSegments[0]);
assert.equal(eventSegment.entries.every((entry) => entry.kind === 'directive.coreEvent.v1'), true);
assert.deepEqual(eventSegment.entries.map((entry) => entry.sequence), eventSegment.entries.map((_, index) => index + 1));
assert.equal(eventSegment.entries.every((entry) => entry.txnId && entry.sourceFrameId && entry.occurredAt), true);
assert.equal(eventSegment.entries.every((entry) => !('transactionId' in entry)), true);
assert.equal(eventSegment.entries.every((entry) => entry.revisionsBefore && entry.revisionsAfter), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'turnObserved'), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'phaseAdvanced'), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'mechanicsCommitted'), true);
const forgeBackgroundEvent = eventSegment.entries.find((entry) => entry.type === 'backgroundBatchCommitted' && entry.payload?.operationBundle?.batchId === 'forge-29');
assert.ok(forgeBackgroundEvent, 'CORE background event should retain the FORGE batch ref.');
assert.equal(forgeBackgroundEvent.payload.operationBundle.sourceToken, 'turnSourceFrame:frame-29');
assert.equal(forgeBackgroundEvent.payload.operationBundle.sourceFrameRef.id, 'frame-29');
assert.equal(forgeBackgroundEvent.payload.operationBundle.sourceFrameRef.textHash, 'source-text-hash-29');
assert.equal(JSON.stringify(forgeBackgroundEvent).includes('RAW_BACKGROUND_SOURCE_FRAME_TEXT'), false);
const mechanicsEvent = eventSegment.entries.find((entry) => entry.type === 'mechanicsCommitted');
const compactMechanicsOperation = mechanicsEvent.payload.operationBundle.operations.find((operation) => operation.sourceKind === 'directive.openWorldReducerBundle.v1');
assert.ok(compactMechanicsOperation, 'CORE mechanics event should retain redacted reducer-bundle operation metadata');
assert.equal(compactMechanicsOperation.sourceHash, 'open-world-reducer-source-hash');
assert.equal(compactMechanicsOperation.operationCount, 1);
assert.deepEqual(compactMechanicsOperation.changedRoots, ['worldState']);
assert.equal(JSON.stringify(compactMechanicsOperation).includes('RAW_MECHANICS_TEXT'), false);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'visibleResponseRecorded'), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'visibleResponseRefRepaired'), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'recoveryRequired'), true);
assert.equal(eventSegment.entries.some((entry) => entry.type === 'latestSourceRestarted'), true);
const settledRecoveryEvent = eventSegment.entries.find((entry) => entry.type === 'recoveryRequired' && entry.payload?.recoveryCase?.id === 'recovery-34');
assert.ok(settledRecoveryEvent, 'Settled source mutations should reopen the CORE transaction into recoveryRequired.');
assert.equal(settledRecoveryEvent.payload.sourceMutation.sourceKind, 'playerIngress');
assert.equal(settledRecoveryEvent.payload.sourceMutation.replacementTextHash.length, 64);
assert.equal(JSON.stringify(settledRecoveryEvent).includes('RAW_SETTLED_SOURCE_EDIT'), false);
const diagnosticSegment = await readV2ArtifactRef(adapter, saveManifest.diagnosticsSegments[0]);
const diagnosticEntries = (await Promise.all(saveManifest.diagnosticsSegments.map((ref) => readV2ArtifactRef(adapter, ref))))
  .flatMap((segment) => segment.entries || []);
assert.equal(diagnosticEntries.length, 3);
assert.equal(diagnosticSegment.entries.every((entry) => entry.kind === 'directive.coreDiagnostic.v1'), true);
assert.equal(diagnosticEntries.every((entry) => entry.redactedPayload && entry.sourceHash), true);
const hostMap = await readV2ArtifactRef(adapter, saveManifest.hostMap);
assert.equal(hostMap.excludesRawChatText, true);
assert.equal(hostMap.rows.some((row) => 'text' in row || 'mes' in row || 'rawText' in row || 'raw' in row), false);

assert.equal(storage.writeLog.some((key) => /^saves\/.+\.v1\.json$/.test(key)), false, 'CORE Store v2 must not write old full-save records');
assert.equal(storage.writeLog.some((key) => key === 'campaigns/campaign-core-v2/saves/save-core-v2/head.v2.json'), false, 'CORE Store v2 must not write active-save head path');
assert.equal(storage.writeLog.some((key) => key === 'campaigns/campaign-core-v2/saves/save-core-v2/save-manifest.v2.json'), false, 'CORE Store v2 must not write active-save manifest path');
assert.equal(storage.writeLog.some((key) => key.startsWith('campaigns/campaign-core-v2/saves/save-core-v2/core/')), true, 'CORE Store v2 writes the CORE namespace');
const serializedStorage = JSON.stringify(storage.snapshot());
for (const marker of [
  'payload":{"campaignState"',
  'rootsSet',
  'runtimeTracking',
  'snapshotBefore',
  'RAW_PROVIDER_PROMPT',
  'RAW_PROVIDER_RESPONSE',
  'RAW_MECHANICS_TEXT',
  'RAW_RESPONSE_TEXT',
  'RAW_SIDECAR_PROMPT',
  'RAW_REGULAR_SIDECAR_RESPONSE',
  'RAW_COMMAND_LOG_SUMMARY_TEXT',
  'RAW_COMMAND_LOG_SUMMARY_PROMPT',
  'RAW_COMMAND_LOG_BACKGROUND_SUMMARY',
  'RAW_BACKGROUND_SOURCE_FRAME_TEXT',
  'RAW_EDITED_PLAYER_TEXT',
  'RAW_SETTLED_SOURCE_EDIT',
  'SECRET-API-KEY'
]) {
  assert.equal(serializedStorage.includes(marker), false, `CORE Store v2 artifacts must not include ${marker}`);
}

assert.equal(coreStore.estimateSize() < 1024 * 1024, true);

let rewriteTick = 0;
const rewriteStorage = createLoggingStorage();
const rewriteAdapter = createLogicalStorageAdapter({ storage: rewriteStorage, hostId: 'fake' });
const rewriteCoreStore = createCoreStoreV2({
  adapter: rewriteAdapter,
  campaignId: 'campaign-core-rewrite-guard',
  saveId: 'save-core-rewrite-guard',
  now: () => `2026-06-28T16:${String(Math.floor(rewriteTick / 60)).padStart(2, '0')}:${String(rewriteTick++ % 60).padStart(2, '0')}.000Z`,
  segmentMaxBytes: {
    event: 14000,
    turn: 5000,
    diagnostics: 5000
  }
});

async function driveRewriteGuardTurn(index) {
  const frame = createTurnSourceFrameContract({
    id: `rewrite-frame-${String(index).padStart(4, '0')}`,
    campaignId: 'campaign-core-rewrite-guard',
    saveId: 'save-core-rewrite-guard',
    chatId: 'rewrite-guard-chat',
    hostMessageId: `rewrite-host-${String(index).padStart(4, '0')}`,
    textHash: hashStableJson({ text: `rewrite guard player ${index}` }),
    createdAt: `2026-06-28T16:00:${String(index % 60).padStart(2, '0')}.000Z`
  });
  const transaction = await rewriteCoreStore.beginTurn(frame, {
    transactionId: `rewrite-txn-${String(index).padStart(4, '0')}`,
    ingressId: `rewrite-ingress-${String(index).padStart(4, '0')}`,
    idempotencyKey: `rewrite-begin-${index}`
  });
  await rewriteCoreStore.advanceTurn(transaction.id, {
    phase: 'routePending',
    route: 'directiveCommit',
    reason: 'sealed-segment-rewrite-guard',
    idempotencyKey: `rewrite-route-${index}`
  });
  await rewriteCoreStore.commitMechanics(transaction.id, {
    baseMechanicsRevision: index - 1,
    idempotencyKey: `rewrite-mechanics-${index}`,
    turnId: `rewrite-turn-${String(index).padStart(4, '0')}`,
    outcomeId: `rewrite-outcome-${String(index).padStart(4, '0')}`,
    summary: `rewrite guard mechanics summary ${index} ${'x'.repeat(520)}`,
    committedRoots: ['mission'],
    promptDirtyDomains: ['missionQuestThread'],
    operations: [{
      domain: 'mission',
      op: 'appendLog',
      summary: `rewrite guard compact operation ${index}`,
      sourceHash: hashStableJson({ source: 'rewrite-guard', index }),
      operationCount: 1,
      changedRoots: ['mission']
    }]
  });
  await rewriteCoreStore.recordVisibleResponse(transaction.id, {
    idempotencyKey: `rewrite-response-${index}`,
    responseId: `rewrite-response-${String(index).padStart(4, '0')}`,
    hostMessageId: `rewrite-assistant-${String(index).padStart(4, '0')}`,
    outcomeId: `rewrite-outcome-${String(index).padStart(4, '0')}`,
    responseKind: 'directiveNarration',
    directiveGenerationStartedAt: `2026-06-28T16:01:${String(index % 60).padStart(2, '0')}.000Z`,
    postedAt: `2026-06-28T16:02:${String(index % 60).padStart(2, '0')}.000Z`
  });
}

async function openRewriteGuardTransaction(index) {
  const frame = createTurnSourceFrameContract({
    id: `rewrite-frame-${String(index).padStart(4, '0')}`,
    campaignId: 'campaign-core-rewrite-guard',
    saveId: 'save-core-rewrite-guard',
    chatId: 'rewrite-guard-chat',
    hostMessageId: `rewrite-host-${String(index).padStart(4, '0')}`,
    textHash: hashStableJson({ text: `rewrite guard player ${index}` }),
    createdAt: `2026-06-28T16:00:${String(index % 60).padStart(2, '0')}.000Z`
  });
  const transaction = await rewriteCoreStore.beginTurn(frame, {
    transactionId: `rewrite-txn-${String(index).padStart(4, '0')}`,
    ingressId: `rewrite-ingress-${String(index).padStart(4, '0')}`,
    idempotencyKey: `rewrite-begin-${index}`
  });
  await rewriteCoreStore.advanceTurn(transaction.id, {
    phase: 'routePending',
    route: 'directiveCommit',
    reason: 'sealed-segment-rewrite-guard',
    idempotencyKey: `rewrite-route-${index}`
  });
  return transaction;
}

async function commitRewriteGuardMechanics(transaction, index) {
  return rewriteCoreStore.commitMechanics(transaction.id, {
    baseMechanicsRevision: index - 1,
    idempotencyKey: `rewrite-mechanics-${index}`,
    turnId: `rewrite-turn-${String(index).padStart(4, '0')}`,
    outcomeId: `rewrite-outcome-${String(index).padStart(4, '0')}`,
    summary: `rewrite guard mechanics summary ${index} ${'x'.repeat(520)}`,
    committedRoots: ['mission'],
    promptDirtyDomains: ['missionQuestThread'],
    operations: [{
      domain: 'mission',
      op: 'appendLog',
      summary: `rewrite guard compact operation ${index}`,
      sourceHash: hashStableJson({ source: 'rewrite-guard', index }),
      operationCount: 1,
      changedRoots: ['mission']
    }]
  });
}

for (let index = 1; index <= 18; index += 1) {
  await driveRewriteGuardTurn(index);
}

const beforeOpenTransactionWriteStart = rewriteStorage.writeLog.length;
const beforeOpenTransactionReadStart = rewriteStorage.readLog.length;
const beforeOpenTransactionVerifyStart = rewriteStorage.verifyLog.length;
const rewriteHotTransaction = await openRewriteGuardTransaction(19);
const openTransactionWriteKeys = rewriteStorage.writeLog.slice(beforeOpenTransactionWriteStart);
const openTransactionReadKeys = rewriteStorage.readLog.slice(beforeOpenTransactionReadStart);
const openTransactionVerifyKeys = rewriteStorage.verifyLog.slice(beforeOpenTransactionVerifyStart);

const rewriteManifestBefore = await loadV2SaveManifest(rewriteAdapter, {
  campaignId: 'campaign-core-rewrite-guard',
  saveId: 'save-core-rewrite-guard',
  layout: 'core'
});
assert.equal(rewriteManifestBefore.eventSegments.length > 1, true, 'rewrite guard should force event segment rollover');
assert.equal(rewriteManifestBefore.turnSegments.length > 1, true, 'rewrite guard should force turn segment rollover');
const sealedCoreSegmentRefsBefore = [
  ...rewriteManifestBefore.eventSegments.slice(0, -1),
  ...rewriteManifestBefore.turnSegments.slice(0, -1)
];
const sealedCoreSegmentKeys = new Set(sealedCoreSegmentRefsBefore.map((ref) => ref.logicalKey));
const oldOpenTailRefs = [
  rewriteManifestBefore.eventSegments[rewriteManifestBefore.eventSegments.length - 1],
  rewriteManifestBefore.turnSegments[rewriteManifestBefore.turnSegments.length - 1]
];
const sealedCoreSegmentKeysForOpen = new Set([
  ...rewriteManifestBefore.eventSegments.slice(0, -1),
  ...rewriteManifestBefore.turnSegments.slice(0, -1)
].map((ref) => ref.logicalKey));
assert.deepEqual(
  openTransactionWriteKeys.filter((key) => sealedCoreSegmentKeysForOpen.has(key)),
  [],
  'hot CORE begin/route open must not rewrite sealed event/turn segments'
);
assert.deepEqual(
  openTransactionReadKeys.filter((key) => sealedCoreSegmentKeysForOpen.has(key)),
  [],
  'hot CORE begin/route open must not read sealed event/turn segments'
);
assert.deepEqual(
  openTransactionVerifyKeys.filter((key) => sealedCoreSegmentKeysForOpen.has(key)),
  [],
  'hot CORE begin/route open must not verify sealed event/turn segments'
);
assert.equal(openTransactionWriteKeys.some((key) => key.endsWith('/head.v2.json')), false, 'hot CORE begin/route open must not rewrite head');
assert.equal(openTransactionWriteKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'hot CORE begin/route open must not rewrite host map');
assert.equal(openTransactionWriteKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'hot CORE begin/route open must not rewrite prompt cache');
assert.equal(openTransactionReadKeys.some((key) => key.endsWith('/head.v2.json')), false, 'hot CORE begin/route open must not read head');
assert.equal(openTransactionReadKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'hot CORE begin/route open must not read host map');
assert.equal(openTransactionReadKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'hot CORE begin/route open must not read prompt cache');
assert.equal(openTransactionWriteKeys.filter((key) => key.includes('/events/')).length, 2, 'hot CORE begin/route open should write one begin event tail and one route event tail');
assert.equal(openTransactionWriteKeys.filter((key) => key.endsWith('/save-manifest.v2.json')).length, 2, 'hot CORE begin/route open should publish one save manifest per event append');
assert.equal(openTransactionWriteKeys.filter((key) => key.endsWith('/campaign-manifest.v2.json')).length, 2, 'hot CORE begin/route open should publish one campaign manifest per event append');
assert.equal(openTransactionWriteKeys.length, 6, 'hot CORE begin/route open should write only event tail and manifest pointers for each append');
const oldOpenTailRecords = await Promise.all(oldOpenTailRefs.map((ref) => readV2ArtifactRef(rewriteAdapter, ref)));
const writeStart = rewriteStorage.writeLog.length;
const readStart = rewriteStorage.readLog.length;
const verifyStart = rewriteStorage.verifyLog.length;
await commitRewriteGuardMechanics(rewriteHotTransaction, 19);
const hotTurnWriteKeys = rewriteStorage.writeLog.slice(writeStart);
const hotTurnReadKeys = rewriteStorage.readLog.slice(readStart);
const hotTurnVerifyKeys = rewriteStorage.verifyLog.slice(verifyStart);
assert.deepEqual(
  hotTurnWriteKeys.filter((key) => sealedCoreSegmentKeys.has(key)),
  [],
  'hot CORE turn must not rewrite sealed event/turn segments'
);
assert.deepEqual(
  hotTurnReadKeys.filter((key) => sealedCoreSegmentKeys.has(key)),
  [],
  'hot CORE turn must not read sealed event/turn segments'
);
assert.deepEqual(
  hotTurnVerifyKeys.filter((key) => sealedCoreSegmentKeys.has(key)),
  [],
  'hot CORE turn must not verify sealed event/turn segments'
);
assert.deepEqual(
  hotTurnWriteKeys.filter((key) => oldOpenTailRefs.some((ref) => ref.logicalKey === key)),
  [],
  'hot CORE turn must not overwrite the prior open event/turn tails'
);
assert.equal(hotTurnWriteKeys.some((key) => key.endsWith('/head.v2.json')), false, 'hot CORE mechanics append must not rewrite head');
assert.equal(hotTurnWriteKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'hot CORE mechanics append must not rewrite host map');
assert.equal(hotTurnWriteKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'hot CORE mechanics append must not rewrite prompt cache');
assert.equal(hotTurnReadKeys.some((key) => key.endsWith('/head.v2.json')), false, 'hot CORE mechanics append must not read head');
assert.equal(hotTurnReadKeys.some((key) => key.endsWith('/host-map.v2.json')), false, 'hot CORE mechanics append must not read host map');
assert.equal(hotTurnReadKeys.some((key) => key.endsWith('/prompt-cache.v2.json')), false, 'hot CORE mechanics append must not read prompt cache');
assert.equal(
  hotTurnWriteKeys.some((key) => (
    key.startsWith('campaigns/campaign-core-rewrite-guard/saves/save-core-rewrite-guard/')
    && !key.includes('/core/')
  )),
  false,
  'hot CORE mechanics append must not write active-save facade keys'
);
assert.equal(hotTurnWriteKeys.some((key) => key.endsWith('.v1.json')), false, 'hot CORE mechanics append must not write legacy v1 saves');
assert.equal(hotTurnWriteKeys.filter((key) => key.includes('/events/')).length, 1, 'hot CORE mechanics append should write one event tail');
assert.equal(hotTurnWriteKeys.filter((key) => key.includes('/turns/')).length, 1, 'hot CORE mechanics append should write one turn tail');
assert.equal(hotTurnWriteKeys.filter((key) => key.endsWith('/save-manifest.v2.json')).length, 1, 'hot CORE mechanics append should write one save manifest');
assert.equal(hotTurnWriteKeys.filter((key) => key.endsWith('/campaign-manifest.v2.json')).length, 1, 'hot CORE mechanics append should write one campaign manifest');
assert.equal(hotTurnWriteKeys.length, 4, 'hot CORE mechanics append should write only event tail, turn tail, save manifest, and campaign manifest');
assert.equal(hotTurnWriteKeys[hotTurnWriteKeys.length - 2].endsWith('/save-manifest.v2.json'), true, 'hot CORE mechanics append should publish save manifest after blobs');
assert.equal(hotTurnWriteKeys[hotTurnWriteKeys.length - 1].endsWith('/campaign-manifest.v2.json'), true, 'hot CORE mechanics append should publish campaign manifest last');
const rewriteManifestAfter = await loadV2SaveManifest(rewriteAdapter, {
  campaignId: 'campaign-core-rewrite-guard',
  saveId: 'save-core-rewrite-guard',
  layout: 'core'
});
assert.deepEqual(rewriteManifestAfter.head, rewriteManifestBefore.head, 'hot CORE mechanics append should preserve head ref');
assert.deepEqual(rewriteManifestAfter.hostMap, rewriteManifestBefore.hostMap, 'hot CORE mechanics append should preserve host-map ref');
assert.deepEqual(rewriteManifestAfter.promptCache, rewriteManifestBefore.promptCache, 'hot CORE mechanics append should preserve prompt-cache ref');
assert.deepEqual(rewriteManifestAfter.diagnosticsSegments, rewriteManifestBefore.diagnosticsSegments, 'hot CORE mechanics append should preserve diagnostics refs');
const afterSegmentRefsByKey = new Map([
  ...rewriteManifestAfter.eventSegments,
  ...rewriteManifestAfter.turnSegments
].map((ref) => [ref.logicalKey, ref]));
for (const sealedRef of sealedCoreSegmentRefsBefore) {
  assert.deepEqual(
    afterSegmentRefsByKey.get(sealedRef.logicalKey),
    sealedRef,
    `sealed CORE segment ref must remain stable: ${sealedRef.logicalKey}`
  );
}
const openTailRecordsAfter = await Promise.all(oldOpenTailRefs.map((ref) => readV2ArtifactRef(rewriteAdapter, ref)));
assert.deepEqual(openTailRecordsAfter, oldOpenTailRecords, 'old open event/turn tail records should remain readable and unchanged');
const rewriteEventEntriesAfter = [];
for (const ref of rewriteManifestAfter.eventSegments) {
  const segment = await readV2ArtifactRef(rewriteAdapter, ref);
  rewriteEventEntriesAfter.push(...segment.entries);
}
const rewriteTurnEntriesAfter = [];
for (const ref of rewriteManifestAfter.turnSegments) {
  const segment = await readV2ArtifactRef(rewriteAdapter, ref);
  rewriteTurnEntriesAfter.push(...segment.entries);
}
assert.equal(
  rewriteEventEntriesAfter.some((entry) => entry.idempotencyKey === 'rewrite-mechanics-19' && entry.type === 'mechanicsCommitted'),
  true,
  'hot CORE mechanics append should publish the new mechanics event through manifest-selected refs'
);
assert.equal(
  rewriteTurnEntriesAfter.some((entry) => entry.transactionId === rewriteHotTransaction.id && entry.turnId === 'rewrite-turn-0019'),
  true,
  'hot CORE mechanics append should publish the new turn through manifest-selected refs'
);

console.log('Core Store v2 tests passed.');
