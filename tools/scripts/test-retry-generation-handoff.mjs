import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
installFakeDom();
const { setSillyTavernDirectiveRuntimeBridge, clearSillyTavernDirectiveRuntimeBridge, directiveGenerationInterceptor } = await import('../../src/hosts/sillytavern/runtime-bridge.mjs');
const { __settlementRetryDialogTestHooks } = await import('../../src/ui/settlement-retry-dialog.js');
let prepares = 0;
let starts = 0;
setSillyTavernDirectiveRuntimeBridge({
  app: { isCurrentChatBound: () => true, retryPendingAcceptedPairSettlement: async () => ({ ok: false, reasonCode: 'no-pending-settlement' }) },
  turnOrchestrator: { async interceptGeneration() {
    prepares++;
    return prepares === 1
      ? { handled: true, abortDefaultGeneration: true, settlementError: { reasonCode: 'director-timeout' } }
      : { handled: true, abortDefaultGeneration: false };
  } },
  directiveHost: { chat: { async continueHostGeneration() {
    starts++;
    return starts === 1 ? { ok: true, skipped: true, alreadyGenerating: true } : { ok: true, skipped: false };
  } } },
});
try {
  await directiveGenerationInterceptor([], 100, () => {}, 'normal');
  const dialog = __settlementRetryDialogTestHooks.active();
  await dialog.retry.listeners.get('click')[0]({});
  assert.equal(prepares, 2, 'Retry uses the same preparation as Generate even after settlement already succeeded');
  assert.equal(starts, 1, 'Retry attempts narration');
  assert.equal(dialog.overlay.isConnected, true, 'a skipped host start is not reported as successful narration');
  await dialog.retry.listeners.get('click')[0]({});
  assert.equal(starts, 2, 'another Retry can retry the narration handoff');
  assert.equal(dialog.overlay.isConnected, false);
} finally { clearSillyTavernDirectiveRuntimeBridge(); }
console.log('Retry generation handoff passed.');

const { createSillyTavernChatAdapter } = await import('../../src/hosts/sillytavern/chat-adapter.mjs');
let releaseImport;
let delayedStarts = 0;
const importGate = new Promise(resolve => { releaseImport = resolve; });
const delayedChat = createSillyTavernChatAdapter({
  contextFactory: () => ({ chat: [], chatId: 'delayed-retry' }),
  importScript: () => importGate,
});
const stopController = new AbortController();
const delayedStart = delayedChat.continueHostGeneration({ signal: stopController.signal, waitForCompletion: false });
stopController.abort();
releaseImport({ isGenerating: () => false, Generate() { delayedStarts++; } });
assert.equal((await delayedStart).ok, false);
assert.equal(delayedStarts, 0, 'Stop during module import prevents queued native Generate');
let rejectGeneration;
let preparationCalls = 0;
const chat = createSillyTavernChatAdapter({
  contextFactory: () => ({ chat: [], chatId: 'retry-chat' }),
  scriptModule: { isGenerating: () => false, Generate: () => new Promise((_, reject) => { rejectGeneration = reject; }) },
});
setSillyTavernDirectiveRuntimeBridge({
  app: { isCurrentChatBound: () => true },
  turnOrchestrator: { async interceptGeneration() {
    return ++preparationCalls === 1 ? { handled: true, abortDefaultGeneration: true } : { handled: true, abortDefaultGeneration: false };
  } },
  directiveHost: { chat },
});
try {
  await directiveGenerationInterceptor([], 100, () => {}, 'normal');
  await __settlementRetryDialogTestHooks.active().retry.listeners.get('click')[0]({});
  assert.equal(__settlementRetryDialogTestHooks.active(), null);
  rejectGeneration(new Error('Narration startup failed'));
  for (let i = 0; i < 50 && !__settlementRetryDialogTestHooks.active(); i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(__settlementRetryDialogTestHooks.active(), 'asynchronous native Generate rejection restores recovery');
  await __settlementRetryDialogTestHooks.active().retry.listeners.get('click')[0]({});
  const { handleGenerationStopped } = await import('../../src/hosts/sillytavern/shell-events.js');
  await handleGenerationStopped();
  rejectGeneration(new Error('Stopped native generation rejected late'));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(__settlementRetryDialogTestHooks.active(), null, 'late rejection after Stop must not reopen recovery');
} finally { clearSillyTavernDirectiveRuntimeBridge(); }
