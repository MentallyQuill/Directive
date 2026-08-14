import assert from 'node:assert/strict';
import { createFakeEventAdapter } from '../../src/hosts/fake/fake-host.mjs';
import {
  __directiveEventTestHooks,
  disposeSillyTavernDirectiveEventLifecycle,
  wireEvents
} from '../../src/hosts/sillytavern/shell-events.js';
import {
  clearSillyTavernDirectiveRuntimeBridge,
  directiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeBridge
} from '../../src/hosts/sillytavern/runtime-bridge.mjs';
import { __settlementRetryDialogTestHooks } from '../../src/ui/settlement-retry-dialog.js';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { __directiveRuntimeActionTestHooks, registerRuntimeAction } from '../../src/runtime/runtime-actions.js';

const eventSource = createFakeEventAdapter();
const eventTypes = {
  CHAT_CHANGED: 'chat',
  MESSAGE_SENT: 'sent',
  MESSAGE_EDITED: 'edited',
  MESSAGE_UPDATED: 'updated',
  MESSAGE_SWIPED: 'swiped',
  MESSAGE_DELETED: 'deleted',
  GENERATION_STOPPED: 'stopped',
  GENERATION_ENDED: 'ended',
  EXTENSION_DISABLED: 'disabled'
};
assert.equal(wireEvents({ eventSource, eventTypes }), true);
for (const event of Object.values(eventTypes)) assert.equal(eventSource.listenerCount(event), 1);
assert.equal(eventSource.listenerCount('updated'), 1);
disposeSillyTavernDirectiveEventLifecycle();
for (const event of Object.values(eventTypes)) assert.equal(eventSource.listenerCount(event), 0);

const row = { getAttribute: () => '42' };
const deleteButton = { closest: (selector) => selector === '.mes[mesid]' ? row : null };
__directiveEventTestHooks.captureDeleteIntent({
  target: { closest: (selector) => selector === '.mes_edit_delete' ? deleteButton : null }
});
assert.equal(__directiveEventTestHooks.payloadWithDeleteIntent({}).hostMessageId, '42');

let branchPayload = null;
let currentBranchChatId = 'chat.parent';
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async handleHostChatChanged(payload) {
      branchPayload = payload;
      return {};
    }
  },
  directiveHost: { chat: { getCurrentChatId: () => currentBranchChatId } }
});
const branchRow = { getAttribute: () => '17' };
const branchButton = { closest: (selector) => selector === '.mes[mesid]' ? branchRow : null };
__directiveEventTestHooks.captureNativeBranchIntent({
  target: { closest: (selector) => selector === '.mes_create_branch' ? branchButton : null }
});
currentBranchChatId = 'chat.child';
registerRuntimeAction('runtime.refresh', () => ({ refreshed: true }));
await __directiveEventTestHooks.handleChatChanged({ chatId: 'chat.child' });
assert.equal(branchPayload.nativeBranchIntent.kind, 'directive.nativeBranchIntent.v1');
assert.equal(branchPayload.nativeBranchIntent.parentChatId, 'chat.parent');
assert.equal(branchPayload.nativeBranchIntent.endpointHostMessageId, '17');
assert.equal(typeof branchPayload.nativeBranchIntent.capturedAt, 'number');
clearSillyTavernDirectiveRuntimeBridge();
__directiveRuntimeActionTestHooks.clearRuntimeActions();

let restoreCount = 0;
setSillyTavernDirectiveRuntimeBridge({
  app: { async clearDirectivePrompt() {} },
  directiveHost: {
    presets: {
      async restoreNarrationPreset() {
        restoreCount += 1;
      }
    }
  }
});
await __directiveEventTestHooks.handleExtensionDisabled();
assert.equal(restoreCount, 1, 'extension disable must restore the preset selected before campaign play');
clearSillyTavernDirectiveRuntimeBridge();

let renamed = null;
const branchUiSequence = [];
const previousPrompt = globalThis.prompt;
globalThis.prompt = (label, value) => {
  branchUiSequence.push('prompt');
  assert.match(label, /Name Previous Timeline/);
  assert.equal(value, 'Prelude — Stardate 53068.4');
  return 'Before Whitaker';
};
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async handleHostChatChanged() {
      return {
        timelineFork: {
          status: 'activated',
          savedGameId: 'checkpoint.1',
          suggestedName: 'Prelude — Stardate 53068.4'
        }
      };
    },
    async renameSavedGame(options) { renamed = options; }
  }
});
registerRuntimeAction('runtime.refresh', () => {
  branchUiSequence.push('refresh');
  return { refreshed: true };
});
await __directiveEventTestHooks.handleChatChanged();
assert.deepEqual(branchUiSequence, ['refresh', 'prompt', 'refresh'], 'refresh must finish before the naming dialog opens');
assert.deepEqual(renamed, { savedGameId: 'checkpoint.1', name: 'Before Whitaker' });
globalThis.prompt = previousPrompt;
clearSillyTavernDirectiveRuntimeBridge();
__directiveRuntimeActionTestHooks.clearRuntimeActions();

let endedPayload = null;
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async handleHostGenerationEnded(payload) {
      endedPayload = payload;
      return { handled: true };
    }
  }
});
await __directiveEventTestHooks.handleGenerationEnded({ messageId: 'assistant.42' });
assert.deepEqual(endedPayload, { messageId: 'assistant.42' });
clearSillyTavernDirectiveRuntimeBridge();

installFakeDom();
let abortImmediately = null;
let settlementRetryCalls = 0;
let continuedGeneration = null;
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async retryPendingAcceptedPairSettlement() {
      settlementRetryCalls += 1;
      return { ok: true };
    }
  },
  turnOrchestrator: {
    async interceptGeneration() {
      return {
        handled: true,
        abortDefaultGeneration: true,
        responseStrategy: 'blockAndRetry',
        settlementError: { reasonCode: 'persistence-failed', persistenceAttempts: 3 }
      };
    }
  },
  directiveHost: {
    chat: {
      async continueHostGeneration(options) {
        continuedGeneration = options;
        return { ok: true };
      }
    }
  }
});
const blocked = await directiveGenerationInterceptor([], 8192, (immediately) => { abortImmediately = immediately; }, 'normal');
assert.equal(blocked.abortDefaultGeneration, true);
assert.equal(abortImmediately, false, 'Directive must let later extension interceptors run before SillyTavern aborts narration');
const retryButton = globalThis.document.querySelector('[data-settlement-retry-action="retry"]');
assert(retryButton, 'blocked settlement must expose manual Retry');
await retryButton.listeners.get('click')[0]({ preventDefault() {} });
assert.equal(settlementRetryCalls, 1);
assert.deepEqual(continuedGeneration, {
  reason: 'directive-settlement-retry',
  type: 'normal',
  automaticTrigger: true,
  waitForCompletion: false
});
clearSillyTavernDirectiveRuntimeBridge();

let releaseReplayRetry = null;
const replayRetryPending = new Promise((resolve) => { releaseReplayRetry = resolve; });
let replayContinuationCount = 0;
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async retryPendingAcceptedPairSettlement() {
      return replayRetryPending;
    }
  },
  turnOrchestrator: {
    async interceptGeneration() {
      return {
        handled: true,
        abortDefaultGeneration: true,
        responseStrategy: 'blockAndRetry',
        settlementError: { reasonCode: 'accepted-pair-replay-pending', persistenceAttempts: 0 }
      };
    }
  },
  directiveHost: {
    chat: {
      async continueHostGeneration() {
        replayContinuationCount += 1;
        return { ok: true };
      }
    }
  }
});
await directiveGenerationInterceptor([], 8192, () => {}, 'normal');
const firstReplayDialog = __settlementRetryDialogTestHooks.active();
const pendingReplayClick = firstReplayDialog.retry.listeners.get('click')[0]({ preventDefault() {} });
await firstReplayDialog.close.listeners.get('click')[0]({ preventDefault() {} });
assert.equal(firstReplayDialog.overlay.isConnected, false);
await directiveGenerationInterceptor([], 8192, () => {}, 'normal');
const replacementReplayDialog = __settlementRetryDialogTestHooks.active();
releaseReplayRetry({ ok: true });
await pendingReplayClick;
assert.equal(replayContinuationCount, 0, 'dismissed Retry completion must not start host narration');
assert.equal(replacementReplayDialog.overlay.isConnected, true, 'a stale Retry completion must not close a newer dialog');
replacementReplayDialog.close.click();
clearSillyTavernDirectiveRuntimeBridge();

setSillyTavernDirectiveRuntimeBridge({
  app: { async clearDirectivePrompt() {} },
  turnOrchestrator: {
    async interceptGeneration() {
      return {
        handled: true,
        abortDefaultGeneration: true,
        responseStrategy: 'blockAndRetry',
        settlementError: { reasonCode: 'accepted-pair-replay-pending', persistenceAttempts: 0 }
      };
    }
  }
});
await directiveGenerationInterceptor([], 8192, () => {}, 'normal');
const disabledReplayDialog = __settlementRetryDialogTestHooks.active();
await __directiveEventTestHooks.handleExtensionDisabled();
assert.equal(disabledReplayDialog.overlay.isConnected, false, 'extension teardown must close narration recovery state');
assert.equal(__settlementRetryDialogTestHooks.active(), null);
clearSillyTavernDirectiveRuntimeBridge();

let passThroughAbortCalls = 0;
let downstreamExtensionRuns = 0;
const hostNarration = [{ role: 'user', content: 'HOST_CHAT_CANARY' }];
setSillyTavernDirectiveRuntimeBridge({
  turnOrchestrator: {
    async interceptGeneration({ chat }) {
      assert.equal(chat, hostNarration);
      return {
        handled: true,
        abortDefaultGeneration: false,
        responseStrategy: 'injectAndContinue'
      };
    }
  }
});
const passThrough = await directiveGenerationInterceptor(
  hostNarration,
  8192,
  () => { passThroughAbortCalls += 1; },
  'normal'
);
if (passThrough.abortDefaultGeneration === false) downstreamExtensionRuns += 1;
assert.equal(passThroughAbortCalls, 0, 'successful Directive interception must not abort host narration');
assert.equal(downstreamExtensionRuns, 1, 'normal downstream extension participation remains available');
assert.deepEqual(hostNarration, [{ role: 'user', content: 'HOST_CHAT_CANARY' }], 'Directive must not rewrite host chat');
clearSillyTavernDirectiveRuntimeBridge();

console.log('PASS V1 SillyTavern event wiring');
