import assert from 'node:assert/strict';

import {
  createSillyTavernPromptAdapter
} from '../../src/hosts/sillytavern/prompt-adapter.mjs';
import {
  createSyntheticFastGateRuntime
} from '../../src/runtime/fast-gate-runtime-synthetic.mjs';
import {
  createSyntheticLensPromptScheduler
} from '../../src/runtime/lens-prompt-scheduler-synthetic.mjs';
import {
  createLensPromptScheduler,
  normalizePromptDirtyDomains
} from '../../src/runtime/lens-prompt-scheduler.mjs';
import {
  hashStableJson
} from '../../src/runtime/architecture-redesign-contracts.mjs';
import {
  createCoreStoreV2
} from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

assert.deepEqual(
  normalizePromptDirtyDomains(['ship', 'crew', 'relationships']),
  ['crewShipRelationship'],
  'sidecar crew/ship/relationship roots should dirty one LENS relationship domain'
);
assert.deepEqual(
  normalizePromptDirtyDomains(['commandBearing', 'commandLog', 'continuity', 'factIndex']),
  ['command', 'continuity'],
  'sidecar command and continuity roots should map to LENS prompt domains'
);

function createLoggingStorage() {
  const files = new Map();
  const writeLog = [];
  return {
    writeLog,
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      const serialized = JSON.stringify(value);
      writeLog.push({
        path: filePath,
        bytes: Buffer.byteLength(serialized, 'utf8')
      });
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

function createHarness({ nowPrefix = '2026-06-28T20:00', nowValues = [] } = {}) {
  let tick = 0;
  const storage = createLoggingStorage();
  const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
  const coreStore = createCoreStoreV2({
    adapter,
    campaignId: 'campaign-lens-synthetic',
    saveId: 'save-lens-synthetic',
    now: () => `${nowPrefix}:${String(tick++).padStart(2, '0')}.000Z`
  });
  let clockIndex = 0;
  const clock = () => nowValues[clockIndex++] || `${nowPrefix}:${String(clockIndex + 30).padStart(2, '0')}.000Z`;
  return { storage, adapter, coreStore, clock };
}

async function beginTransaction(harness, {
  transactionId = 'txn-lens-1',
  route = 'directiveCommit',
  hostMessageId = '70'
} = {}) {
  const fastGate = createSyntheticFastGateRuntime({
    coreStore: harness.coreStore,
    clock: harness.clock,
    deterministicRoute: () => ({ route, reason: `${route}-for-lens` }),
    releaseHostGeneration: async () => ({ ok: true }),
    storageWrites: harness.storage.writeLog
  });
  return fastGate.handleHostEvent({
    frameId: `frame:${transactionId}`,
    transactionId,
    campaignId: 'campaign-lens-synthetic',
    saveId: 'save-lens-synthetic',
    chatId: 'ashes-chat',
    hostMessageId,
    playerSubmittedAt: '2026-06-28T20:00:00.000Z',
    textHash: hashStableJson({ text: `Player source ${hostMessageId}` })
  });
}

const promptCalls = [];
const promptMap = new Map([
  ['summaryception', 'external-summaryception-block'],
  ['3_vectfox', 'external-vectfox-block'],
  ['3_vectfox_eventbase', 'external-vectfox-eventbase-block'],
  ['worldInfoBefore', 'external-world-info-before']
]);
const externalPromptKeys = new Set(['summaryception', '3_vectfox', '3_vectfox_eventbase', 'worldInfoBefore']);
const context = {
  chatId: 'ashes-chat',
  setExtensionPrompt(key, text, ...args) {
    promptMap.set(key, text);
    promptCalls.push([key, text, ...args]);
  },
  extension_prompt_types: {
    BEFORE_PROMPT: 0,
    IN_CHAT: 1,
    IN_PROMPT: 2
  },
  extension_prompt_roles: {
    SYSTEM: 0,
    USER: 1,
    ASSISTANT: 2
  }
};
const promptAdapter = createSillyTavernPromptAdapter({
  contextFactory: () => context
});
const externalSnapshot = Object.fromEntries([...promptMap.entries()].filter(([key]) => externalPromptKeys.has(key)));

const harness = createHarness({
  nowValues: [
    '2026-06-28T20:01:01.000Z',
    '2026-06-28T20:01:02.000Z',
    '2026-06-28T20:01:10.000Z',
    '2026-06-28T20:01:20.000Z',
    '2026-06-28T20:01:30.000Z',
    '2026-06-28T20:01:40.000Z'
  ]
});
await beginTransaction(harness, { transactionId: 'txn-lens-visible', route: 'directiveCommit', hostMessageId: '70' });
const mechanics = await harness.coreStore.commitMechanics('txn-lens-visible', {
  baseMechanicsRevision: 0,
  idempotencyKey: 'mechanics-lens-visible',
  turnId: 'turn-lens-visible',
  outcomeId: 'outcome-lens-visible',
  summary: 'Mechanics dirtied mission and command prompt domains.',
  committedRoots: ['mission', 'commandLog'],
  promptDirtyDomains: ['missionQuestThread', 'command'],
  operations: [{ domain: 'mission', op: 'appendLog', summary: 'Prompt-relevant change.' }]
});
assert.deepEqual(mechanics.promptDirtyDomains, ['missionQuestThread', 'command']);

const buildCalls = [];
const lens = createSyntheticLensPromptScheduler({
  coreStore: harness.coreStore,
  clock: harness.clock,
  buildDirectivePromptPacket: async (payload) => {
    buildCalls.push(payload);
    return {
      kind: 'directive.playerSafePromptContext',
      hash: hashStableJson({
        revision: payload.revision,
        dirtyDomains: payload.dirtyDomains,
        cacheKey: payload.cacheKey
      }),
      rawPromptBody: 'RAW_LENS_PROMPT_BODY',
      rawResponse: 'RAW_LENS_BUILDER_RESPONSE',
      blocks: [
        {
          id: 'lens-visible',
          promptKey: 'directive.lens.visible',
          title: 'Visible LENS Context',
          text: 'Visible-lane Directive context.',
          placement: 'inPrompt',
          depth: 0,
          role: 'system'
        },
        {
          id: 'summaryception',
          promptKey: 'summaryception',
          title: 'Malformed External Key',
          text: 'This must be scoped to Directive before install.',
          placement: 'inPrompt',
          depth: 1,
          role: 'system'
        }
      ]
    };
  },
  installPromptPacket: async ({ method, binding, packet }) => {
    if (method === 'rebuild') return promptAdapter.rebuild({ binding, packet });
    return promptAdapter.install({ binding, packet });
  },
  observeExternalPromptEnvironment: async () => ({
    host: 'sillytavern',
    userHandle: 'directive-soak-a',
    chatId: 'ashes-chat',
    campaignId: 'campaign-lens-synthetic',
    promptKeys: ['directive.lens.visible', 'summaryception', '3_vectfox'],
    worldInfo: {
      enabled: true,
      activeNames: ['Ashes Native Lorebook'],
      promptPositions: ['before', 'atDepth'],
      rawPromptBody: 'RAW_WORLD_INFO_PROMPT'
    },
    summaryception: {
      installed: true,
      enabled: true,
      promptKeyActive: true,
      promptText: 'RAW_SUMMARYCEPTION_PROMPT'
    },
    vectFox: {
      installed: true,
      enabled: true,
      promptKeys: ['3_vectfox'],
      qdrant_api_key: 'SECRET-QDRANT',
      vectorPayload: ['RAW_VECTOR_HIT']
    }
  })
});

const externalOnly = await lens.observeExternalEnvironment({
  transactionId: 'txn-lens-visible',
  environment: {
    host: 'sillytavern',
    userHandle: 'directive-soak-a',
    promptKeys: ['summaryception', '3_vectfox'],
    rawPromptBody: 'RAW_EXTERNAL_OBSERVATION_PROMPT',
    vectFox: {
      promptKeys: ['3_vectfox'],
      vectorPayload: ['RAW_EXTERNAL_OBSERVATION_VECTOR']
    }
  }
});
assert.equal(externalOnly.ref.knownExternalPromptKeys.includes('summaryception'), true);
assert.deepEqual(lens.inspect().pendingDirtyDomains, {}, 'external environment observation alone must not dirty prompt');
assert.equal(JSON.stringify(harness.coreStore.state).includes('RAW_EXTERNAL_OBSERVATION_PROMPT'), false);
assert.equal(JSON.stringify(harness.coreStore.state).includes('RAW_EXTERNAL_OBSERVATION_VECTOR'), false);

const beforeDiagnosticOnlyDirty = lens.inspect().pendingDirtyDomains;
assert.deepEqual(beforeDiagnosticOnlyDirty, {});
const diagnosticOnly = await lens.recordDiagnosticOnly({
  transactionId: 'txn-lens-visible',
  payload: {
    modelCallId: 'model-call-1',
    rawPrompt: 'RAW_DIAGNOSTIC_PROMPT'
  }
});
assert.equal(diagnosticOnly.dirtyPrompt, false);
assert.deepEqual(lens.inspect().pendingDirtyDomains, {}, 'diagnostics-only writes must not dirty prompt');
assert.equal(harness.coreStore.state.revisions.prompt, 0, 'CORE Store prompt revision remains owned by LENS in synthetic stage');

lens.enqueueDirty({
  lane: 'visible',
  source: 'core-mechanics',
  dirtyDomains: mechanics.promptDirtyDomains,
  idempotencyKey: 'dirty-visible-1'
});
lens.enqueueDirty({
  lane: 'visible',
  source: 'sre',
  dirtyDomains: ['sourceBinding', 'command', 'not-a-prompt-domain'],
  idempotencyKey: 'dirty-visible-2'
});
assert.deepEqual(lens.inspect().pendingDirtyDomains.visible, ['missionQuestThread', 'command', 'sourceBinding']);

const binding = {
  campaignId: 'campaign-lens-synthetic',
  saveId: 'save-lens-synthetic',
  chatId: 'ashes-chat',
  branchId: 'main'
};
const campaignContext = {
  campaignId: 'campaign-lens-synthetic',
  saveId: 'save-lens-synthetic',
  chatId: 'ashes-chat',
  branchId: 'main',
  mechanicsRevision: harness.coreStore.state.revisions.mechanics,
  cpmSourceHash: 'cpm-source-hash-1',
  policyHash: 'policy-hash-1',
  staticPromptKeyVersion: 'directive-static-v1',
  packageVersion: 'ashes-package-v1',
  crewDatasetHash: 'crew-hash-1',
  shipDatasetHash: 'ship-hash-1',
  projectionHash: 'projection-hash-1'
};

const seededRevisionInstalls = [];
const seededRevisionScheduler = createLensPromptScheduler({
  buildDirectivePromptPacket: async ({ revision }) => ({
    kind: 'directive.playerSafePromptContext',
    revision,
    hash: `seeded-revision-${revision}`,
    blocks: [{
      id: 'seeded-revision-block',
      title: 'Seeded Revision Block',
      promptKey: 'directive.seededRevision',
      priority: 1,
      placement: 'inPrompt',
      depth: 0,
      content: 'Revision seeding proof.'
    }]
  }),
  installPromptPacket: async ({ packet }) => {
    seededRevisionInstalls.push(cloneJson(packet));
    return { ok: true };
  }
});
seededRevisionScheduler.markDirty({
  lane: 'visible',
  source: 'active-binding',
  dirtyDomains: ['command']
});
const seededRevisionFlush = await seededRevisionScheduler.flush({
  lane: 'visible',
  binding: {
    ...binding,
    promptContextRevision: 7
  },
  campaignContext,
  promptFrame: { turnSourceHash: 'seeded-revision-source' },
  reason: 'fresh-scheduler-active-binding-revision'
});
assert.equal(seededRevisionFlush.status, 'installed');
assert.equal(seededRevisionFlush.directiveOwnedRevision, 8, 'Fresh LENS scheduler must continue from the active campaign binding revision.');
assert.equal(seededRevisionInstalls[0].revision, 8);
assert.equal(seededRevisionFlush.lensPromptRevisionRecord.kind, 'directive.lensPromptRevisionRecord.v1');
assert.equal(seededRevisionFlush.lensPromptRevisionRecord.revision, 8);
assert.equal(seededRevisionFlush.installed.lensPromptRevisionRecord.revision, 8);

const inspectionHarness = createHarness({
  nowPrefix: '2026-06-28T20:05',
  nowValues: [
    '2026-06-28T20:05:01.000Z',
    '2026-06-28T20:05:02.000Z',
    '2026-06-28T20:05:03.000Z',
    '2026-06-28T20:05:04.000Z'
  ]
});
await beginTransaction(inspectionHarness, {
  transactionId: 'txn-lens-inspection-bundle',
  route: 'directiveCommit',
  hostMessageId: '75'
});
const inspectionRefHash = 'b'.repeat(64);
const inspectionTargets = {
  stLorebooks: {
    status: 'active',
    installed: true,
    enabled: true,
    active: true,
    activeNameCount: 1,
    promptPositions: ['before'],
    directiveAuthority: false,
    rawContentCaptured: false
  },
  memoryBooks: {
    status: 'valid',
    installed: true,
    enabled: true,
    active: true,
    entryCount: 3,
    rangeDiagnostics: { status: 'valid', rangeHash: 'memory-range-hash' },
    directiveAuthority: false,
    rawContentCaptured: false
  },
  summaryception: {
    status: 'current',
    installed: true,
    enabled: true,
    promptKeyActive: true,
    staleness: { status: 'current' },
    directiveAuthority: false,
    rawContentCaptured: false
  },
  vectFox: {
    status: 'external-backend-configured',
    installed: true,
    enabled: true,
    backendDiagnostics: { status: 'external-backend-configured', backendType: 'qdrant' },
    directiveAuthority: false,
    rawContentCaptured: false
  }
};
const inspectionLens = createLensPromptScheduler({
  coreStore: inspectionHarness.coreStore,
  clock: inspectionHarness.clock,
  buildDirectivePromptPacket: async ({ revision }) => ({
    revision,
    hash: `inspection-packet-${revision}`,
    blocks: [{
      id: 'inspection-visible',
      promptKey: 'directive.lens.inspection-visible',
      title: 'Inspection Visible Prompt',
      text: 'Compact external inspection proof.',
      placement: 'inPrompt',
      depth: 0,
      role: 'system'
    }]
  }),
  installPromptPacket: async () => ({ ok: true }),
  observeExternalPromptEnvironment: async () => ({
    host: 'sillytavern',
    externalPromptEnvironmentRef: {
      kind: 'directive.externalPromptEnvironmentRef.v1',
      hash: inspectionRefHash,
      byteLength: 777,
      status: 'observed',
      observedAt: '2026-06-28T20:05:00.000Z',
      knownExternalPromptKeys: ['summaryception', '3_vectfox', 'worldInfoBefore']
    },
    knownExternalPromptKeys: ['summaryception', '3_vectfox', 'worldInfoBefore'],
    externalPromptEnvironmentTargets: inspectionTargets,
    rawPromptBody: 'RAW_INSPECTION_BUNDLE_PROMPT',
    vectFox: {
      vectorPayload: ['RAW_INSPECTION_BUNDLE_VECTOR']
    }
  })
});
inspectionLens.markDirty({
  lane: 'visible',
  source: 'prompt-adapter-inspection',
  dirtyDomains: ['continuity'],
  idempotencyKey: 'dirty-inspection-bundle'
});
const inspectionFlush = await inspectionLens.flush({
  transactionId: 'txn-lens-inspection-bundle',
  lane: 'visible',
  binding,
  campaignContext,
  promptFrame: { turnSourceHash: 'turn-source-hash-inspection-bundle' },
  reason: 'inspection-bundle-visible'
});
assert.equal(inspectionFlush.status, 'installed');
assert.equal(inspectionFlush.externalPromptEnvironmentRef.hash, inspectionRefHash);
assert.equal(inspectionFlush.lensPromptRevisionRecord.externalPromptEnvironmentRef.hash, inspectionRefHash);
assert.equal(inspectionFlush.lensPromptRevisionRecord.externalPromptEnvironmentRef.knownExternalPromptKeyCount, 3);
assert.equal(JSON.stringify(inspectionFlush.lensPromptRevisionRecord).includes('RAW_INSPECTION_BUNDLE_PROMPT'), false);
assert.equal(JSON.stringify(inspectionFlush.lensPromptRevisionRecord).includes('RAW_INSPECTION_BUNDLE_VECTOR'), false);
assert.equal(inspectionFlush.promptBudgetTrace.cacheInputs.externalPromptEnvironmentRef.hash, inspectionRefHash);
assert.equal(inspectionFlush.promptBudgetTrace.cacheInputs.externalPromptEnvironmentTargets.memoryBooks.rangeDiagnostics.status, 'valid');
assert.equal(inspectionFlush.promptBudgetTrace.cacheInputs.externalPromptEnvironmentTargets.summaryception.staleness.status, 'current');
assert.equal(inspectionFlush.promptBudgetTrace.cacheInputs.externalPromptEnvironmentTargets.vectFox.backendDiagnostics.status, 'external-backend-configured');
assert.equal(JSON.stringify(inspectionHarness.coreStore.state).includes('RAW_INSPECTION_BUNDLE_PROMPT'), false);
assert.equal(JSON.stringify(inspectionHarness.coreStore.state).includes('RAW_INSPECTION_BUNDLE_VECTOR'), false);

const visibleFlush = await lens.flush({
  transactionId: 'txn-lens-visible',
  lane: 'visible',
  binding,
  campaignContext,
  promptFrame: {
    turnSourceHash: 'turn-source-hash-1'
  },
  reason: 'visible-before-directive-generation'
});
assert.equal(visibleFlush.status, 'installed');
assert.equal(visibleFlush.directiveOwnedRevision, 1);
assert.equal(visibleFlush.dirtyDomains.includes('missionQuestThread'), true);
assert.equal(visibleFlush.dirtyDomains.includes('sourceBinding'), true);
assert.equal(visibleFlush.appliesTo, 'currentOrNextDirectiveGeneration');
assert.equal(buildCalls.length, 1);
assert.equal(promptCalls.some(([key]) => externalPromptKeys.has(key)), false, 'LENS install must not write external prompt keys');
assert.equal(promptCalls.some(([key]) => key === 'directive.campaign.summaryception'), true, 'Malformed external packet key should be scoped to Directive');
assert.deepEqual(
  Object.fromEntries([...promptMap.entries()].filter(([key]) => externalPromptKeys.has(key))),
  externalSnapshot,
  'LENS prompt install must preserve host-owned prompt values'
);
assert.deepEqual(lens.inspect().pendingDirtyDomains, {});
const visiblePromptDiagnostic = harness.coreStore.state.diagnostics.find((entry) => entry.redactedPayload?.status === 'installed');
assert(visiblePromptDiagnostic, 'LENS install should append compact prompt diagnostic');
assert.equal(visiblePromptDiagnostic.redactedPayload.cacheRecord.directiveOwnedRevision, 1);
assert.equal(visiblePromptDiagnostic.redactedPayload.cacheRecord.finalHostPromptMayIncludeExternal, true);
assert.equal(visiblePromptDiagnostic.redactedPayload.rawPromptBody, '[redacted-raw-payload]');
assert.equal(visiblePromptDiagnostic.redactedPayload.rawResponse, '[redacted-raw-payload]');
const serializedLensState = JSON.stringify(harness.coreStore.state);
assert.equal(serializedLensState.includes('RAW_LENS_PROMPT_BODY'), false);
assert.equal(serializedLensState.includes('RAW_WORLD_INFO_PROMPT'), false);
assert.equal(serializedLensState.includes('RAW_SUMMARYCEPTION_PROMPT'), false);
assert.equal(serializedLensState.includes('RAW_VECTOR_HIT'), false);
assert.equal(serializedLensState.includes('SECRET-QDRANT'), false);

const noDirtyFlush = await lens.flush({
  transactionId: 'txn-lens-visible',
  lane: 'visible',
  binding,
  campaignContext,
  promptFrame: { turnSourceHash: 'turn-source-hash-1' },
  reason: 'no-dirty-visible'
});
assert.equal(noDirtyFlush.status, 'reused');
assert.equal(noDirtyFlush.rebuilt, false);
assert.equal(buildCalls.length, 1, 'clean visible lane must not rebuild');

lens.enqueueDirty({
  lane: 'visible',
  source: 'sre',
  dirtyDomains: ['sourceBinding'],
  idempotencyKey: 'dirty-visible-stale-guard'
});
const beforeStaleGuardPromptCalls = promptCalls.length;
const beforeStaleGuardBuildCalls = buildCalls.length;
const staleGuardCalls = [];
const staleGuardFlush = await lens.flush({
  transactionId: 'txn-lens-visible',
  lane: 'visible',
  binding,
  campaignContext,
  promptFrame: { turnSourceHash: 'turn-source-hash-stale' },
  reason: 'visible-stale-source-build-only',
  idempotencyKey: 'visible-stale-source-build-only',
  beforeInstallPrompt: async (payload) => {
    staleGuardCalls.push(payload);
    return false;
  }
});
assert.equal(staleGuardFlush.status, 'installSkippedStale');
assert.equal(staleGuardFlush.rebuilt, false);
assert.equal(staleGuardFlush.dirtyPrompt, true);
assert.equal(staleGuardFlush.packet, undefined, 'Stale prompt install skips must not return raw prompt packets.');
assert.equal(staleGuardCalls.length, 1, 'LENS should ask the caller before host prompt install.');
assert.equal(staleGuardCalls[0].lane, 'visible');
assert.equal(staleGuardCalls[0].cacheKey, staleGuardFlush.cacheKey);
assert.deepEqual(staleGuardCalls[0].dirtyDomains, ['sourceBinding']);
assert.equal(buildCalls.length, beforeStaleGuardBuildCalls + 1, 'Stale install guard still builds enough to know the cache key.');
assert.equal(promptCalls.length, beforeStaleGuardPromptCalls, 'Stale install guard must prevent host prompt writes.');
assert.deepEqual(lens.inspect().pendingDirtyDomains.visible, ['sourceBinding'], 'Rejected stale install should keep dirty state for retry.');
assert.equal(lens.inspect().installed.visible.directiveOwnedRevision, 1, 'Rejected stale install must not advance installed revision.');
const staleSkippedDiagnostic = harness.coreStore.state.diagnostics.find((entry) => entry.redactedPayload?.status === 'installSkippedStale');
assert(staleSkippedDiagnostic, 'LENS stale install skip should append compact diagnostic evidence.');
assert.equal(JSON.stringify(staleSkippedDiagnostic).includes('RAW_LENS_PROMPT_BODY'), false);
assert.equal(JSON.stringify(staleSkippedDiagnostic).includes('RAW_LENS_BUILDER_RESPONSE'), false);

const hostHarness = createHarness({
  nowPrefix: '2026-06-28T20:10',
  nowValues: [
    '2026-06-28T20:10:01.000Z',
    '2026-06-28T20:10:02.000Z',
    '2026-06-28T20:10:04.000Z',
    '2026-06-28T20:10:10.000Z',
    '2026-06-28T20:10:20.000Z'
  ]
});
const hostGate = await beginTransaction(hostHarness, { transactionId: 'txn-lens-host', route: 'hostContinue', hostMessageId: '80' });
const hostLens = createSyntheticLensPromptScheduler({
  coreStore: hostHarness.coreStore,
  clock: hostHarness.clock,
  buildDirectivePromptPacket: async (payload) => ({
    hash: hashStableJson({ revision: payload.revision, dirtyDomains: payload.dirtyDomains }),
    blocks: [{
      id: 'host-next',
      promptKey: 'directive.lens.host-next',
      title: 'Host Next Prompt',
      text: 'Applies to the next host generation.',
      placement: 'inPrompt',
      depth: 0,
      role: 'system'
    }]
  }),
  installPromptPacket: async ({ packet }) => {
    assert.equal(packet.revision, 1);
    return { ok: true };
  },
  observeExternalPromptEnvironment: async () => ({
    host: 'sillytavern',
    status: 'observed',
    promptKeys: ['summaryception']
  })
});
hostLens.enqueueDirty({
  lane: 'visible',
  dirtyDomains: ['continuity'],
  source: 'hostContinue-background',
  idempotencyKey: 'host-dirty-1'
});
const hostFlush = await hostLens.flush({
  transactionId: 'txn-lens-host',
  lane: 'visible',
  binding,
  campaignContext: {
    ...campaignContext,
    mechanicsRevision: hostHarness.coreStore.state.revisions.mechanics
  },
  promptFrame: { turnSourceHash: 'host-turn-source-hash' },
  hostGenerationReleasedAt: hostGate.releasedAt,
  reason: 'host-continue-next-generation'
});
assert.equal(hostGate.released, true);
assert.equal(hostFlush.status, 'installed');
assert.equal(hostFlush.appliesTo, 'nextGeneration', 'hostContinue prompt rebuild should be recorded as next-generation if host generation was already released');

const backgroundHarness = createHarness({
  nowPrefix: '2026-06-28T20:20',
  nowValues: [
    '2026-06-28T20:20:01.000Z',
    '2026-06-28T20:20:02.000Z',
    '2026-06-28T20:20:10.000Z',
    '2026-06-28T20:20:20.000Z'
  ]
});
await beginTransaction(backgroundHarness, { transactionId: 'txn-lens-background', route: 'directiveCommit', hostMessageId: '90' });
await backgroundHarness.coreStore.commitBackgroundBatch('txn-lens-background', {
  baseMechanicsRevision: 0,
  idempotencyKey: 'background-lens-1',
  batchId: 'forge-lens-1',
  phaseAfter: 'backgroundSettling',
  promptDirtyDomains: ['continuity', 'crewShipRelationship'],
  operations: [{ domain: 'continuity', op: 'upsertFactHash', factHash: 'fact-lens-1' }]
});
const backgroundBuildCalls = [];
const backgroundLens = createSyntheticLensPromptScheduler({
  coreStore: backgroundHarness.coreStore,
  clock: backgroundHarness.clock,
  buildDirectivePromptPacket: async (payload) => {
    backgroundBuildCalls.push(payload);
    return {
      hash: hashStableJson({ revision: payload.revision, dirtyDomains: payload.dirtyDomains }),
      blocks: [{
        id: 'background',
        promptKey: 'directive.lens.background',
        title: 'Background Prompt',
        text: 'Background-batch Directive context.',
        placement: 'inPrompt',
        depth: 0,
        role: 'system'
      }]
    };
  },
  installPromptPacket: async () => ({ ok: true }),
  observeExternalPromptEnvironment: async () => ({
    host: 'sillytavern',
    status: 'observed',
    vectFox: {
      installed: true,
      enabled: false,
      disabledPresent: true
    }
  })
});
backgroundLens.enqueueDirty({
  lane: 'background',
  source: 'forge-batch',
  dirtyDomains: ['continuity']
});
backgroundLens.enqueueDirty({
  lane: 'background',
  source: 'forge-batch',
  dirtyDomains: ['crewShipRelationship', 'continuity']
});
const backgroundFlush = await backgroundLens.flush({
  transactionId: 'txn-lens-background',
  lane: 'background',
  binding,
  campaignContext: {
    ...campaignContext,
    mechanicsRevision: backgroundHarness.coreStore.state.revisions.mechanics,
    cpmSourceHash: 'cpm-source-hash-background'
  },
  reason: 'background-batch-coalesced'
});
assert.equal(backgroundFlush.status, 'installed');
assert.deepEqual(backgroundFlush.dirtyDomains, ['continuity', 'crewShipRelationship']);
assert.equal(backgroundBuildCalls.length, 1, 'background batch should produce one prompt rebuild');

backgroundLens.enqueueDirty({
  lane: 'background',
  source: 'forge-accepted-batch',
  dirtyDomains: ['continuity'],
  idempotencyKey: 'accepted-batch-cache-a'
});
const acceptedBatchFlushA = await backgroundLens.flush({
  transactionId: 'txn-lens-background',
  lane: 'background',
  binding,
  campaignContext: {
    ...campaignContext,
    mechanicsRevision: backgroundHarness.coreStore.state.revisions.mechanics,
    cpmSourceHash: 'cpm-source-hash-background'
  },
  promptFrame: {
    sourceToken: 'source-token-accepted-batch-cache',
    coreAcceptedBatchProjection: {
      kind: 'directive.coreAcceptedSidecarBatchProjection.v1',
      acceptedBatchHash: 'accepted-batch-hash-a',
      background: { backgroundBatchId: 'background-batch-a' }
    }
  },
  reason: 'accepted-batch-cache-a'
});
backgroundLens.enqueueDirty({
  lane: 'background',
  source: 'forge-accepted-batch',
  dirtyDomains: ['continuity'],
  idempotencyKey: 'accepted-batch-cache-b'
});
const acceptedBatchFlushB = await backgroundLens.flush({
  transactionId: 'txn-lens-background',
  lane: 'background',
  binding,
  campaignContext: {
    ...campaignContext,
    mechanicsRevision: backgroundHarness.coreStore.state.revisions.mechanics,
    cpmSourceHash: 'cpm-source-hash-background'
  },
  promptFrame: {
    sourceToken: 'source-token-accepted-batch-cache',
    coreAcceptedBatchProjection: {
      kind: 'directive.coreAcceptedSidecarBatchProjection.v1',
      acceptedBatchHash: 'accepted-batch-hash-b',
      background: { backgroundBatchId: 'background-batch-b' }
    }
  },
  reason: 'accepted-batch-cache-b'
});
assert.equal(
  acceptedBatchFlushB.status,
  'installed',
  'Distinct accepted sidecar batch hashes must force a distinct LENS prompt cache install.'
);
assert.notEqual(
  acceptedBatchFlushB.cacheKey,
  acceptedBatchFlushA.cacheKey,
  'LENS cache identity must include compact CORE accepted-batch projection evidence.'
);
const productionAcceptedBuildCalls = [];
const productionAcceptedLens = createLensPromptScheduler({
  clock: backgroundHarness.clock,
  buildDirectivePromptPacket: async (payload) => {
    productionAcceptedBuildCalls.push(payload);
    return {
      hash: hashStableJson({
        revision: payload.revision,
        cacheKey: payload.cacheKey,
        acceptedBatchHash: payload.promptFrame?.coreAcceptedBatchProjection?.acceptedBatchHash || null
      }),
      blocks: [{
        id: 'production-accepted-sidecar',
        promptKey: 'directive.lens.production-accepted-sidecar',
        title: 'Production Accepted Sidecar Prompt',
        text: 'Accepted sidecar projection.',
        placement: 'inPrompt',
        depth: 0,
        role: 'system'
      }]
    };
  },
  installPromptPacket: async () => ({ ok: true }),
  observeExternalPromptEnvironment: async () => ({
    host: 'sillytavern',
    status: 'observed'
  })
});
productionAcceptedLens.enqueueDirty({
  lane: 'background',
  source: 'forge-accepted-batch',
  dirtyDomains: ['continuity'],
  idempotencyKey: 'production-accepted-a'
});
const productionAcceptedFlushA = await productionAcceptedLens.flush({
  transactionId: 'txn-lens-background',
  lane: 'background',
  binding,
  campaignContext: {
    ...campaignContext,
    mechanicsRevision: backgroundHarness.coreStore.state.revisions.mechanics,
    cpmSourceHash: 'cpm-source-hash-background'
  },
  promptFrame: {
    sourceToken: 'source-token-production-accepted',
    coreAcceptedBatchProjection: {
      kind: 'directive.coreAcceptedSidecarBatchProjection.v1',
      acceptedBatchHash: 'production-accepted-hash-a',
      background: { backgroundBatchId: 'production-background-a' }
    }
  },
  reason: 'production-accepted-a'
});
productionAcceptedLens.enqueueDirty({
  lane: 'background',
  source: 'forge-accepted-batch',
  dirtyDomains: ['continuity'],
  idempotencyKey: 'production-accepted-b'
});
const productionAcceptedFlushB = await productionAcceptedLens.flush({
  transactionId: 'txn-lens-background',
  lane: 'background',
  binding,
  campaignContext: {
    ...campaignContext,
    mechanicsRevision: backgroundHarness.coreStore.state.revisions.mechanics,
    cpmSourceHash: 'cpm-source-hash-background'
  },
  promptFrame: {
    sourceToken: 'source-token-production-accepted',
    coreAcceptedBatchProjection: {
      kind: 'directive.coreAcceptedSidecarBatchProjection.v1',
      acceptedBatchHash: 'production-accepted-hash-b',
      background: { backgroundBatchId: 'production-background-b' }
    }
  },
  reason: 'production-accepted-b'
});
assert.equal(productionAcceptedFlushA.status, 'installed');
assert.equal(productionAcceptedFlushB.status, 'installed');
assert.notEqual(productionAcceptedFlushB.cacheKey, productionAcceptedFlushA.cacheKey);
assert.equal(productionAcceptedBuildCalls.length, 2, 'Production LENS should rebuild for a distinct CORE accepted-batch projection hash.');

const commandReviewBuildCalls = [];
const commandReviewInstallCalls = [];
const commandReviewLens = createLensPromptScheduler({
  clock: backgroundHarness.clock,
  buildDirectivePromptPacket: async (payload) => {
    commandReviewBuildCalls.push(payload);
    return {
      hash: hashStableJson({
        revision: payload.revision,
        cacheKey: payload.cacheKey,
        reviewHash: payload.cacheInputs?.commandBearingReview?.reviewHash || null
      }),
      blocks: [{
        id: 'command-bearing-review',
        promptKey: 'directive.lens.command-bearing-review',
        title: 'Command Bearing Review Prompt',
        text: 'Command Bearing review projection.',
        placement: 'inPrompt',
        depth: 0,
        role: 'system'
      }]
    };
  },
  installPromptPacket: async (payload) => {
    commandReviewInstallCalls.push(payload);
    return { ok: true };
  },
  observeExternalPromptEnvironment: async () => ({
    host: 'sillytavern',
    status: 'observed'
  })
});
commandReviewLens.enqueueDirty({
  lane: 'background',
  source: 'command-bearing-review',
  dirtyDomains: ['command'],
  idempotencyKey: 'command-review-a'
});
const commandReviewFlushA = await commandReviewLens.flush({
  transactionId: 'txn-command-review',
  lane: 'background',
  binding,
  campaignContext,
  promptFrame: {
    sourceToken: 'source-token-command-review',
    coreCommandBearingReviewProjection: {
      kind: 'directive.coreCommandBearingReviewProjection.v1',
      transactionId: 'txn-command-review',
      batchId: 'command-review-batch-a',
      reviewHash: 'command-review-hash-a',
      sourceFrameRef: { id: 'frame-command-review' },
      closures: [{ closureId: 'closure-command-review-a' }]
    }
  },
  reason: 'command-review-a'
});
commandReviewLens.enqueueDirty({
  lane: 'background',
  source: 'command-bearing-review',
  dirtyDomains: ['command'],
  idempotencyKey: 'command-review-b'
});
const commandReviewFlushB = await commandReviewLens.flush({
  transactionId: 'txn-command-review',
  lane: 'background',
  binding,
  campaignContext,
  promptFrame: {
    sourceToken: 'source-token-command-review',
    coreCommandBearingReviewProjection: {
      kind: 'directive.coreCommandBearingReviewProjection.v1',
      transactionId: 'txn-command-review',
      batchId: 'command-review-batch-b',
      reviewHash: 'command-review-hash-b',
      sourceFrameRef: { id: 'frame-command-review' },
      closures: [{ closureId: 'closure-command-review-b' }]
    }
  },
  reason: 'command-review-b'
});
assert.equal(commandReviewFlushA.status, 'installed');
assert.equal(commandReviewFlushB.status, 'installed');
assert.notEqual(commandReviewFlushB.cacheKey, commandReviewFlushA.cacheKey, 'Command Bearing review projection hash must participate in LENS cache identity.');
assert.equal(commandReviewBuildCalls[0].promptFrame.coreCommandBearingReviewProjection.kind, 'directive.coreCommandBearingReviewProjection.v1');
assert.equal(commandReviewBuildCalls[0].cacheInputs.commandBearingReview.reviewHash, 'command-review-hash-a');
assert.equal(commandReviewInstallCalls[0].cacheInputs.commandBearingReview.reviewHash, 'command-review-hash-a');
assert.equal(JSON.stringify(commandReviewInstallCalls).includes('RAW_BACKGROUND_REVIEW_TEXT'), false);

const failureHarness = createHarness({
  nowPrefix: '2026-06-28T20:30',
  nowValues: [
    '2026-06-28T20:30:01.000Z',
    '2026-06-28T20:30:02.000Z',
    '2026-06-28T20:30:10.000Z',
    '2026-06-28T20:30:20.000Z',
    '2026-06-28T20:30:30.000Z'
  ]
});
await beginTransaction(failureHarness, { transactionId: 'txn-lens-failure', route: 'directiveCommit', hostMessageId: '95' });
let failureInstallCalls = 0;
const failureLens = createSyntheticLensPromptScheduler({
  coreStore: failureHarness.coreStore,
  clock: failureHarness.clock,
  buildDirectivePromptPacket: async (payload) => ({
    hash: hashStableJson({ revision: payload.revision, dirtyDomains: payload.dirtyDomains, failure: true }),
    blocks: [{
      id: 'failure-retry',
      promptKey: 'directive.lens.failure-retry',
      title: 'Failure Retry Prompt',
      text: 'Retryable prompt install.',
      placement: 'inPrompt',
      depth: 0,
      role: 'system'
    }]
  }),
  installPromptPacket: async () => {
    failureInstallCalls += 1;
    if (failureInstallCalls === 1) {
      return { ok: false, error: { message: 'Synthetic install failure' } };
    }
    return { ok: true };
  },
  observeExternalPromptEnvironment: async () => ({
    host: 'sillytavern',
    status: 'observed'
  })
});
failureLens.enqueueDirty({
  lane: 'visible',
  source: 'core-mechanics',
  dirtyDomains: ['terminalRecovery'],
  idempotencyKey: 'failure-dirty-1'
});
await assert.rejects(
  () => failureLens.flush({
    transactionId: 'txn-lens-failure',
    lane: 'visible',
    binding,
    campaignContext: {
      ...campaignContext,
      mechanicsRevision: failureHarness.coreStore.state.revisions.mechanics,
      cpmSourceHash: 'failure-cpm-source'
    },
    idempotencyKey: 'failure-flush-1',
    reason: 'install-failure-keeps-dirty'
  }),
  /Synthetic install failure/
);
assert.deepEqual(failureLens.inspect().pendingDirtyDomains.visible, ['terminalRecovery'], 'failed install must leave dirty domains pending');
const retryFailureFlush = await failureLens.flush({
  transactionId: 'txn-lens-failure',
  lane: 'visible',
  binding,
  campaignContext: {
    ...campaignContext,
    mechanicsRevision: failureHarness.coreStore.state.revisions.mechanics,
    cpmSourceHash: 'failure-cpm-source'
  },
  idempotencyKey: 'failure-flush-1',
  reason: 'install-failure-retry'
});
assert.equal(retryFailureFlush.status, 'installed');
assert.equal(failureInstallCalls, 2);
assert.deepEqual(failureLens.inspect().pendingDirtyDomains, {});
const replayFailureFlush = await failureLens.flush({
  transactionId: 'txn-lens-failure',
  lane: 'visible',
  binding,
  campaignContext: {
    ...campaignContext,
    mechanicsRevision: failureHarness.coreStore.state.revisions.mechanics,
    cpmSourceHash: 'failure-cpm-source'
  },
  idempotencyKey: 'failure-flush-1',
  reason: 'install-failure-replay'
});
assert.equal(replayFailureFlush.replayed, true);
assert.equal(failureInstallCalls, 2, 'successful retry with same idempotency key must not install twice');

console.log('LENS prompt scheduler tests passed.');
