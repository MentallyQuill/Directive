import assert from 'node:assert/strict';

import {
  collectSillyTavernExternalPromptKeys,
  observeSillyTavernExternalPromptEnvironment,
  summarizeSillyTavernExternalMessageMarkers
} from '../../src/hosts/sillytavern/external-context-observer.mjs';

const context = {
  userHandle: 'directive-soak-c',
  chatId: 'ashes-chat-c',
  extensionPrompts: {
    'directive.campaign.context': { value: 'Directive-owned prompt body must not be inspected here.' },
    summaryception: { value: 'Raw Summaryception text must not persist.' },
    '3_vectfox': { value: 'Raw vector hit must not persist.' },
    '3_vectfox_eventbase': { value: 'Raw EventBase text must not persist.' },
    worldInfoBefore: { value: 'Raw lorebook before text must not persist.' },
    worldInfoAfter: { value: 'Raw lorebook after text must not persist.' },
    customDepthWI_3_1: { value: 'Raw at-depth WI text must not persist.' },
    customWIOutlet_memory: { value: 'Raw outlet WI text must not persist.' },
    '2_floating_prompt': { value: 'Raw Author Note text must not persist.' },
    third_party_context_block: { value: 'Raw unknown external context must not persist.' }
  },
  worldInfoSettings: {
    world_info: {
      globalSelect: ['Ashes Native Lorebook']
    },
    world_info_depth: 3,
    world_info_budget: 100,
    world_info_recursive: true,
    rawPromptBody: 'Raw world info body must not persist.'
  },
  extensionSettings: {
    STMemoryBooks: {
      moduleSettings: {
        enabled: true,
        autoSummaryEnabled: true,
        autoCreateEnabled: true,
        unhideBeforeMemory: true,
        sidePromptsEnabled: true,
        summaryEntrySettings: {
          position: 4
        }
      },
      entryCount: 4,
      entryHash: 'stmb-entry-hash',
      promptText: 'Raw Memory Books side prompt must not persist.'
    },
    summaryception: {
      enabled: true,
      connectionSource: 'custom',
      promptText: 'Raw Summaryception prompt must not persist.'
    },
    vectfox: {
      enabled: true,
      vector_backend: 'qdrant',
      enabled_world_info: true,
      summarizer_injection_enabled: true,
      eventbase_ghost_enabled: true,
      qdrant_api_key: 'SECRET-QDRANT',
      vectorPayload: ['Raw vector payload must not persist.']
    }
  },
  chatMetadata: {
    world_info: 'Ashes Memory Book',
    STMemoryBooks: {
      entryCount: 4,
      rawContent: 'Raw generated memory must not persist.'
    },
    summaryception: {
      summarizedUpTo: 8,
      layers: [[{ text: 'Raw summary layer must not persist.' }]],
      ghostedIndices: [1, 2]
    }
  },
  chat: [
    { id: '0', is_user: true, mes: 'Visible player row.' },
    { id: '1', is_user: true, mes: 'Ghosted player row.', extra: { sc_ghosted: true } },
    { id: '2', is_user: false, mes: 'Memory hidden row.', extra: { stmb_hidden: true } },
    { id: '3', is_user: true, mes: 'Memory unhidden row.', extra: { stmb_unhidden: true } },
    { id: '4', is_user: true, mes: 'Vector excluded row.', extra: { vectfox_prompt_ghosted: true } },
    { id: '5', is_user: true, mes: 'Native hidden row.', is_hidden: true }
  ]
};

const externalKeys = collectSillyTavernExternalPromptKeys(context);
assert.equal(externalKeys.includes('directive.campaign.context'), false);
assert.equal(externalKeys.includes('summaryception'), true);
assert.equal(externalKeys.includes('3_vectfox_eventbase'), true);
assert.equal(externalKeys.includes('worldInfoBefore'), true);

const markers = summarizeSillyTavernExternalMessageMarkers(context.chat);
assert.equal(markers.summaryceptionGhosted, 1);
assert.equal(markers.memoryBooksHidden, 1);
assert.equal(markers.memoryBooksUnhidden, 1);
assert.equal(markers.vectFoxGhosted, 1);
assert.equal(markers.nativeHidden, 1);

const environment = observeSillyTavernExternalPromptEnvironment(context, {
  observedAt: '2026-06-28T23:00:00.000Z',
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes'
});

assert.equal(environment.kind, 'directive.externalPromptEnvironment.v1');
assert.equal(environment.status, 'observed');
assert.equal(environment.host, 'sillytavern');
assert.equal(environment.userHandle, 'directive-soak-c');
assert.equal(environment.chatId, 'ashes-chat-c');
assert.equal(environment.worldInfo.active, true);
assert.deepEqual(environment.worldInfo.activeNames, ['Ashes Native Lorebook']);
assert.equal(environment.worldInfo.chatBoundName, 'Ashes Memory Book');
assert.equal(environment.worldInfo.promptPositions.includes('before'), true);
assert.equal(environment.worldInfo.promptPositions.includes('after'), true);
assert.equal(environment.worldInfo.promptPositions.includes('atDepth'), true);
assert.equal(environment.worldInfo.promptPositions.includes('outlet'), true);
assert.equal(environment.worldInfo.promptPositions.includes('authorNote'), true);
assert.equal(environment.memoryBooks.enabled, true);
assert.equal(environment.memoryBooks.stMemoryBookEntryCount, 4);
assert.equal(environment.memoryBooks.riskyModes.autoSummary, true);
assert.equal(environment.memoryBooks.riskyModes.autoCreate, true);
assert.equal(environment.memoryBooks.riskyModes.autoHideUnhide, true);
assert.equal(environment.memoryBooks.riskyModes.sidePrompts, true);
assert.equal(environment.memoryBooks.riskyModes.atDepthUserOrAssistant, true);
assert.equal(environment.summaryception.enabled, true);
assert.equal(environment.summaryception.promptKeyActive, true);
assert.equal(environment.summaryception.summarizedUpTo, 8);
assert.equal(environment.summaryception.layerCount, 1);
assert.equal(environment.summaryception.ghostedCount, 2);
assert.equal(environment.summaryception.externalModelCalls, true);
assert.equal(environment.vectFox.enabled, true);
assert.equal(environment.vectFox.backendType, 'qdrant');
assert.equal(environment.vectFox.semanticWorldInfoEnabled, true);
assert.equal(environment.vectFox.summarizerInjectionEnabled, true);
assert.equal(environment.vectFox.ghostingEnabled, true);
assert.equal(environment.vectFox.generationInterceptorActive, true);
assert.equal(environment.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(environment.knownExternalPromptKeys.includes('3_vectfox'), true);
assert.equal(environment.knownExternalPromptKeys.includes('worldInfoBefore'), true);
assert.equal(environment.knownExternalPromptKeys.includes('directive.campaign.context'), false);
assert.equal(environment.knownExternalPromptKeys.includes('third_party_context_block'), true);
assert.equal(environment.unknownExternalContext.status, 'observed');
assert.equal(environment.unknownExternalContext.promptKeyCount, 1);
assert.equal(environment.unknownExternalContext.promptKeyPrefixes.includes('third_party_context_block'), true);
assert.match(environment.unknownExternalContext.promptKeyHash, /^[a-f0-9]{64}$/);
assert.match(environment.unknownExternalContext.promptKeyPrefixHash, /^[a-f0-9]{64}$/);
assert.equal(environment.unknownExternalContext.redactionReason, 'prompt-key-hash-only');
assert.equal(environment.diagnostics.length, 5);
const unknownDiagnostic = environment.diagnostics.find((entry) => entry.target === 'unknownExternalContext');
assert.equal(unknownDiagnostic.kind, 'directive.externalPromptEnvironmentDiagnostic.v1');
assert.equal(unknownDiagnostic.layer, 'hostFinalPromptComposition');
assert.equal(unknownDiagnostic.status, 'observed');
assert.equal(unknownDiagnostic.authority.directiveAuthority, false);
assert.equal(unknownDiagnostic.authority.role, 'diagnostics-provenance-only');
assert.equal(unknownDiagnostic.rawContentCaptured, false);
assert.match(unknownDiagnostic.evidenceHash, /^[a-f0-9]{64}$/);
assert.equal(environment.diagnostics.every((entry) => entry.authority?.directiveAuthority === false), true);
assert.equal(environment.diagnostics.every((entry) => entry.rawContentCaptured === false), true);
assert.equal(environment.redactions.some((entry) => entry.reason === 'secret'), true);
assert.equal(environment.redactions.some((entry) => entry.reason === 'raw-payload'), true);
assert.match(environment.hash, /^[a-f0-9]{64}$/);
assert.equal(environment.byteLength > 0, true);

const settingsOnlySummaryception = observeSillyTavernExternalPromptEnvironment({
  userHandle: 'directive-soak-a',
  chatId: 'ashes-summaryception-settings-only',
  extensionSettings: {
    summaryception: {
      enabled: true,
      connectionSource: 'profile',
      fixtureDiagnostics: {
        summarizedUpTo: 2,
        layerCount: 1,
        ghostedCount: 1,
        staleness: {
          status: 'observed',
          chatLength: 5,
          summarizedRangeBeyondChat: false,
          staleAfterMutation: false,
          ghostedSystemVisibleCount: 0,
          summarizedOnlyCount: 0
        }
      }
    }
  },
  chatMetadata: {},
  chat: [{ id: '0', is_user: true, mes: 'Visible player row.' }]
}, {
  observedAt: '2026-06-28T23:00:15.000Z'
});
assert.equal(settingsOnlySummaryception.summaryception.enabled, true);
assert.equal(settingsOnlySummaryception.summaryception.layerCount, 1);
assert.equal(settingsOnlySummaryception.summaryception.ghostedCount, 1);
assert.equal(settingsOnlySummaryception.summaryception.staleness.status, 'observed');

const serialized = JSON.stringify(environment);
assert.equal(serialized.includes('SECRET-QDRANT'), false);
assert.equal(serialized.includes('Raw vector payload'), false);
assert.equal(serialized.includes('Raw Summaryception'), false);
assert.equal(serialized.includes('Raw Memory Books'), false);
assert.equal(serialized.includes('Raw world info'), false);
assert.equal(serialized.includes('Raw generated memory'), false);
assert.equal(serialized.includes('Raw unknown external context'), false);

const previousGlobalChatMetadata = globalThis.chat_metadata;
const previousGlobalWorldInfoSettings = globalThis.world_info_settings;
const previousGlobalWorldInfoEntries = globalThis.world_info_entries;
try {
  globalThis.chat_metadata = {
    world_info: 'Directive External Context Fixture'
  };
  globalThis.world_info_settings = {
    world_info: {
      globalSelect: ['Directive External Context Fixture']
    }
  };
  globalThis.world_info_entries = {
    100001: {
      uid: 100001,
      stmemorybooks: true,
      STMB_start: 0,
      STMB_end: 1
    }
  };
  const fallbackEnvironment = observeSillyTavernExternalPromptEnvironment({
    userHandle: 'directive-soak-a',
    chatId: 'ashes-fixture-chat',
    extensionPrompts: {
      '1_memory': { value: 'Raw Memory Books prompt must not persist.' }
    },
    extensionSettings: {}
  }, {
    observedAt: '2026-06-28T23:00:30.000Z'
  });
  assert.equal(fallbackEnvironment.worldInfo.active, true);
  assert.equal(fallbackEnvironment.worldInfo.enabled, true);
  assert.equal(fallbackEnvironment.worldInfo.chatBoundName, 'Directive External Context Fixture');
  assert.deepEqual(fallbackEnvironment.worldInfo.activeNames, ['Directive External Context Fixture']);
  assert.equal(fallbackEnvironment.memoryBooks.rangeDiagnostics.status, 'valid');
  assert.equal(fallbackEnvironment.memoryBooks.rangeDiagnostics.entryRangeCount, 1);
} finally {
  if (previousGlobalChatMetadata === undefined) delete globalThis.chat_metadata;
  else globalThis.chat_metadata = previousGlobalChatMetadata;
  if (previousGlobalWorldInfoSettings === undefined) delete globalThis.world_info_settings;
  else globalThis.world_info_settings = previousGlobalWorldInfoSettings;
  if (previousGlobalWorldInfoEntries === undefined) delete globalThis.world_info_entries;
  else globalThis.world_info_entries = previousGlobalWorldInfoEntries;
}

const unavailable = observeSillyTavernExternalPromptEnvironment(null, {
  observedAt: '2026-06-28T23:01:00.000Z',
  userHandle: 'directive-soak-d'
});
assert.equal(unavailable.status, 'unavailable');
assert.equal(unavailable.unknownSignals.includes('sillytavern-context-unavailable'), true);

console.log('SillyTavern external-context observer tests passed.');
