import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
installFakeDom();
const { setSillyTavernDirectiveRuntimeBridge, clearSillyTavernDirectiveRuntimeBridge, directiveGenerationInterceptor } = await import('../../src/hosts/sillytavern/runtime-bridge.mjs');
const { __settlementRetryDialogTestHooks } = await import('../../src/ui/settlement-retry-dialog.js');
const { createSillyTavernChatAdapter } = await import('../../src/hosts/sillytavern/chat-adapter.mjs');
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

// Native swipe reserves an out-of-range index before Generate, then rolls it back
// when Directive blocks that generation. Retry must enter that lifecycle again.
for (const [streaming, failHandoff] of [[true, false], [false, false], [true, true]]) {
  const originalInfo = { send_date: 'original-date', extra: { source: 'original' } };
  const message = {
    mes: 'Original assistant draft.', is_user: false, swipe_id: 0,
    swipes: ['Original assistant draft.'], swipe_info: [structuredClone(originalInfo)],
  };
  const nativeContext = { chat: [message], chatId: `swipe-retry-${streaming}` };
  let preparationCount = 0;
  let nativeSwipeCount = 0;
  let completedSwipe;
  const nativeScript = {
    isGenerating: () => false,
    isSwipingAllowed: () => true,
    isMessageSwipeable: () => true,
    getOverswipeBehavior: () => 'regenerate',
    async Generate(type) {
      assert.equal(type, 'swipe');
      let aborted = false;
      await directiveGenerationInterceptor([], 100, () => { aborted = true; }, type);
      if (aborted) return;
      // ST writes both streaming and nonstreaming replies at the selected index.
      if (!streaming) message.swipes.length++;
      message.mes = 'Replacement assistant draft.';
      message.swipes[message.swipe_id] = message.mes;
      message.swipe_info[message.swipe_id] = { extra: { source: 'replacement' } };
    },
    swipe(_event, direction, { message: target, forceSwipeId } = {}) {
      assert.equal(direction, 'right');
      assert.equal(target, message);
      nativeSwipeCount++;
      message.swipe_id = forceSwipeId ?? message.swipes.length;
      completedSwipe = (async () => {
        try {
          await nativeScript.Generate('swipe');
        } finally {
          message.swipe_id = Math.min(message.swipe_id, message.swipes.length - 1);
          message.mes = message.swipes[message.swipe_id];
        }
      })();
      return completedSwipe;
    },
  };
  const nativeChat = createSillyTavernChatAdapter({
    contextFactory: () => nativeContext, scriptModule: nativeScript,
  });
  setSillyTavernDirectiveRuntimeBridge({
    app: { isCurrentChatBound: () => true },
    turnOrchestrator: { async interceptGeneration() {
      preparationCount++;
      return preparationCount === 1 || (failHandoff && preparationCount === 3)
        ? { handled: true, abortDefaultGeneration: true, settlementError: { reasonCode: 'director-invalid-output' } }
        : { handled: true, abortDefaultGeneration: false };
    } },
    directiveHost: { chat: nativeChat },
  });
  try {
    await nativeScript.swipe(null, 'right', { message });
    assert.equal(message.swipe_id, 0, 'failed initial swipe restores the original selection');
    assert.deepEqual(message.swipes, ['Original assistant draft.']);
    await __settlementRetryDialogTestHooks.active().retry.listeners.get('click')[0]({});
    await completedSwipe;
    if (failHandoff) {
      assert.deepEqual(message.swipes, ['Original assistant draft.'], 'a failed Retry handoff preserves all prior drafts');
      assert.equal(message.swipe_id, 0, 'native failure cleanup restores the original selection again');
      for (let i = 0; i < 50 && !__settlementRetryDialogTestHooks.active(); i++) {
        await new Promise(resolve => setTimeout(resolve, 2));
      }
      assert.ok(__settlementRetryDialogTestHooks.active(), 'native swipe rollback must retain explicit Retry');
      await __settlementRetryDialogTestHooks.active().retry.listeners.get('click')[0]({});
      await completedSwipe;
    }
    assert.equal(message.swipes[0], 'Original assistant draft.', 'Retry must not overwrite the original native swipe');
    assert.deepEqual(message.swipe_info[0], originalInfo, 'original swipe metadata remains intact');
    assert.deepEqual(message.swipes, ['Original assistant draft.', 'Replacement assistant draft.']);
    assert.equal(message.swipe_id, 1);
    assert.equal(nativeSwipeCount, failHandoff ? 3 : 2, 'Retry re-enters native reservation and rollback');
  } finally { clearSillyTavernDirectiveRuntimeBridge(); }
}

// A native reasoning-only response may create a slot without visible narration.
// Native promise fulfillment alone must not consume the owner's recovery action.
for (const emptyText of ['', '   ']) {
  const target = { mes: 'Original draft.', is_user: false, swipe_id: 0, swipes: ['Original draft.'] };
  let failed;
  const emptyChat = createSillyTavernChatAdapter({
    contextFactory: () => ({ chat: [target], chatId: 'empty-swipe' }),
    scriptModule: {
      isGenerating: () => false,
      async swipe() {
        target.swipes.push(emptyText);
        target.swipe_id = 1;
        target.mes = emptyText;
        target.extra = { reasoning: 'Internal analysis without narration.' };
      },
    },
  });
  const released = await emptyChat.continueHostGeneration({
    type: 'swipe', waitForCompletion: false,
    onGenerationFailed: result => { failed = result; },
  });
  assert.equal(released.released, true, 'native lifecycle starts asynchronously');
  for (let i = 0; i < 50 && !failed; i++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(failed?.error?.code, 'DIRECTIVE_HOST_SWIPE_NOT_GENERATED');
  assert.equal(target.swipes[0], 'Original draft.');
}

// A swipe Retry must never fall back to the unsafe raw Generate entry point.
{
  let rawStarts = 0;
  const target = { mes: 'Keep this draft.', is_user: false, swipe_id: 0, swipes: ['Keep this draft.'] };
  const unsupportedChat = createSillyTavernChatAdapter({
    contextFactory: () => ({ chat: [target], chatId: 'unsupported-swipe' }),
    scriptModule: { isGenerating: () => false, Generate() { rawStarts++; } },
  });
  const result = await unsupportedChat.continueHostGeneration({ type: 'swipe', waitForCompletion: false });
  assert.equal(result.ok, false);
  assert.equal(rawStarts, 0);
  assert.deepEqual(target.swipes, ['Keep this draft.']);
}

// Importing the native API is asynchronous: Stop or a changed source cancels dispatch.
for (const change of ['stop', 'chat', 'text']) {
  let resolveScript;
  let nativeStarts = 0;
  const target = { mes: 'Keep this draft.', is_user: false, swipe_id: 0, swipes: ['Keep this draft.'] };
  const ctx = { chat: [target], chatId: 'original-swipe-chat' };
  const controller = new AbortController();
  const guardedChat = createSillyTavernChatAdapter({
    contextFactory: () => ctx,
    importScript: () => new Promise(resolve => { resolveScript = resolve; }),
  });
  const pending = guardedChat.continueHostGeneration({ type: 'swipe', signal: controller.signal, waitForCompletion: false });
  if (change === 'stop') controller.abort();
  if (change === 'chat') ctx.chatId = 'another-swipe-chat';
  if (change === 'text') target.mes = 'Player edited this draft.';
  resolveScript({ isGenerating: () => false, swipe() { nativeStarts++; }, Generate() { nativeStarts++; } });
  assert.equal((await pending).ok, false, `${change} during import must cancel swipe Retry`);
  assert.equal(nativeStarts, 0);
  assert.deepEqual(target.swipes, ['Keep this draft.']);
}
console.log('Retry generation handoff passed.');

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
