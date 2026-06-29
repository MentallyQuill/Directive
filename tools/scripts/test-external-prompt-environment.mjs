import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  collectExternalPromptKeys,
  createExternalPromptEnvironmentRef,
  hashStableJson,
  normalizeExternalPromptEnvironment,
  stableJsonByteLength
} from '../../src/runtime/architecture-redesign-contracts.mjs';

const schema = JSON.parse(fs.readFileSync('schemas/runtime/external-prompt-environment.schema.json', 'utf8'));
const requiredRootFields = new Set(schema.required);
const soakUsers = [
  {
    handle: 'directive-soak-a',
    worldInfo: {
      enabled: true,
      activeNames: ['Ashes Native Lorebook'],
      chatBoundName: 'Ashes Native Lorebook',
      promptPositions: ['before', 'atDepth'],
      recursive: true,
      rawPromptBody: 'Raw native lorebook body must not persist.'
    },
    memoryBooks: {
      installed: true,
      enabled: false,
      entryCount: 0
    },
    summaryception: {
      installed: false
    },
    vectFox: {
      installed: true,
      enabled: false,
      disabledPresent: true,
      promptKeys: []
    },
    promptKeys: ['directive.campaign.context', 'worldInfoBefore']
  },
  {
    handle: 'directive-soak-b',
    worldInfo: {
      enabled: true,
      activeNames: ['Memory Books World'],
      chatBoundName: 'Memory Books World',
      promptPositions: ['atDepth']
    },
    memoryBooks: {
      installed: true,
      enabled: true,
      activeBookName: 'Sam Vickers Memories',
      entryCount: 48,
      entryHash: hashStableJson({ entries: 48 }),
      autoSummary: true,
      sidePrompts: true,
      promptText: 'Raw STMB side prompt must not persist.'
    },
    summaryception: {
      installed: false
    },
    vectFox: {
      installed: true,
      enabled: false,
      disabledPresent: true
    },
    promptKeys: ['directive.campaign.context', 'worldInfoAfter']
  },
  {
    handle: 'directive-soak-c',
    worldInfo: {
      enabled: false,
      activeNames: []
    },
    memoryBooks: {
      installed: false
    },
    summaryception: {
      installed: true,
      enabled: true,
      promptKeyActive: true,
      summarizedUpTo: 3100,
      layerCount: 7,
      ghostedCount: 2200,
      injectionHash: hashStableJson({ summary: 'c' }),
      promptText: 'Raw Summaryception text must not persist.'
    },
    vectFox: {
      installed: true,
      enabled: false,
      disabledPresent: true
    },
    promptKeys: ['directive.campaign.context', 'summaryception']
  },
  {
    handle: 'directive-soak-d',
    worldInfo: {
      enabled: true,
      activeNames: ['Vector Boundary Lore'],
      chatBoundName: 'Vector Boundary Lore'
    },
    memoryBooks: {
      installed: false
    },
    summaryception: {
      installed: false
    },
    vectFox: {
      installed: true,
      enabled: true,
      promptKeys: ['3_vectfox', '3_vectfox_eventbase'],
      vectorBackend: 'qdrant',
      generationInterceptorActive: true,
      qdrant_api_key: 'SECRET-QDRANT-KEY',
      vectorPayload: ['Raw vector hit must not persist.']
    },
    promptKeys: ['directive.campaign.context', '3_vectfox', '3_vectfox_eventbase']
  },
  {
    handle: 'directive-soak-e',
    worldInfo: {
      enabled: true,
      activeNames: ['Combined Conflict Lore'],
      chatBoundName: 'Combined Conflict Lore',
      promptPositions: ['before', 'after', 'atDepth']
    },
    memoryBooks: {
      installed: true,
      enabled: true,
      activeBookName: 'Combined Memory Book',
      entryCount: 96,
      entryHash: hashStableJson({ entries: 96 }),
      autoHideUnhide: true,
      atDepthUserOrAssistant: true
    },
    summaryception: {
      installed: true,
      enabled: true,
      promptKeyActive: true,
      summarizedUpTo: 4200,
      layerCount: 11,
      ghostedCount: 3600,
      injectionHash: hashStableJson({ summary: 'e' })
    },
    vectFox: {
      installed: true,
      enabled: true,
      promptKeys: ['3_vectfox', '3_vectfox_summarizer'],
      vectorBackend: 'local',
      summarizerInjectionEnabled: true,
      ghostingEnabled: true
    },
    promptKeys: [
      'directive.campaign.context',
      'worldInfoBefore',
      'summaryception',
      '3_vectfox',
      '3_vectfox_summarizer'
    ]
  }
];

assert.equal(soakUsers.length, 5);
assert.equal(soakUsers.some((profile) => profile.handle === 'default-user'), false, 'default-user is reserved for human testing.');

const environments = soakUsers.map((profile) => normalizeExternalPromptEnvironment({
  host: 'sillytavern',
  userHandle: profile.handle,
  chatId: `ashes-${profile.handle}`,
  campaignId: 'campaign-ashes-external-fixture',
  observedAt: '2026-06-28T13:00:00.000Z',
  promptKeys: profile.promptKeys,
  worldInfo: profile.worldInfo,
  memoryBooks: profile.memoryBooks,
  summaryception: profile.summaryception,
  vectFox: profile.vectFox,
  unknownSignals: profile.handle === 'directive-soak-e' ? ['combined-extension-prompt-order-needs-live-proof'] : []
}));

const hashes = new Set(environments.map((environment) => environment.hash));
assert.equal(hashes.size, environments.length, 'Each soak-user fixture should produce a distinct external environment hash.');

for (const environment of environments) {
  for (const field of requiredRootFields) {
    assert.equal(Object.hasOwn(environment, field), true, `${environment.userHandle} should include schema required field ${field}`);
  }
  assert.equal(environment.kind, 'directive.externalPromptEnvironment.v1');
  assert.equal(environment.host, 'sillytavern');
  assert.equal(environment.userHandle.startsWith('directive-soak-'), true);
  const { byteLength: _byteLength, ...withoutByteLength } = environment;
  assert.equal(environment.byteLength, stableJsonByteLength(withoutByteLength));
  assert.match(environment.hash, /^[a-f0-9]{64}$/);
  const ref = createExternalPromptEnvironmentRef(environment);
  assert.equal(ref.hash, environment.hash);
  assert.equal(ref.knownExternalPromptKeys.some((key) => key.startsWith('directive.')), false);
  assert.deepEqual(ref.knownExternalPromptKeys, collectExternalPromptKeys(environment));
  const serialized = JSON.stringify(environment);
  assert.equal(serialized.includes('SECRET'), false);
  assert.equal(serialized.includes('Raw native lorebook body'), false);
  assert.equal(serialized.includes('Raw STMB side prompt'), false);
  assert.equal(serialized.includes('Raw Summaryception text'), false);
  assert.equal(serialized.includes('Raw vector hit'), false);
}

const byUser = Object.fromEntries(environments.map((environment) => [environment.userHandle, environment]));
assert.deepEqual(byUser['directive-soak-a'].worldInfo.activeNames, ['Ashes Native Lorebook']);
assert.equal(byUser['directive-soak-b'].memoryBooks.stMemoryBookEntryCount, 48);
assert.equal(byUser['directive-soak-b'].memoryBooks.riskyModes.autoSummary, true);
assert.equal(byUser['directive-soak-c'].summaryception.ghostedCount, 2200);
assert.equal(byUser['directive-soak-c'].knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(byUser['directive-soak-d'].vectFox.enabled, true);
assert.equal(byUser['directive-soak-d'].vectFox.generationInterceptorActive, true);
assert.equal(byUser['directive-soak-e'].memoryBooks.riskyModes.atDepthUserOrAssistant, true);
assert.equal(byUser['directive-soak-e'].summaryception.enabled, true);
assert.equal(byUser['directive-soak-e'].vectFox.summarizerInjectionEnabled, true);
assert.equal(byUser['directive-soak-e'].unknownSignals.includes('combined-extension-prompt-order-needs-live-proof'), true);

console.log('External prompt environment tests passed.');
