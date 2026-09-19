import assert from 'node:assert/strict';
import { createSillyTavernChatAdapter } from '../../src/hosts/sillytavern/chat-adapter.mjs';
import { createSillyTavernGenerationClient } from '../../src/hosts/sillytavern/generation-client.mjs';
import { createFakeEventAdapter } from '../../src/hosts/fake/fake-host.mjs';
import {
  __directiveEventTestHooks,
  handleNativeBranchRefusalUiMessage,
  disposeSillyTavernDirectiveEventLifecycle,
  wireEvents
} from '../../src/hosts/sillytavern/shell-events.js';
import {
  clearSillyTavernDirectiveRuntimeBridge,
  directiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeBridge
} from '../../src/hosts/sillytavern/runtime-bridge.mjs';
import { __directiveTurnActivityTestHooks } from '../../src/hosts/sillytavern/turn-activity-indicator.js';
import { __settlementRetryDialogTestHooks } from '../../src/ui/settlement-retry-dialog.js';
import {
  __gameplayNotificationCenterTestHooks,
  publishGameplayNotifications,
} from '../../src/ui/gameplay-notification-center.js';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { __directiveRuntimeActionTestHooks, registerRuntimeAction } from '../../src/runtime/runtime-actions.js';

const eventSource = createFakeEventAdapter();
// Native's emitter stores registrations in arrays, so the same callback can be
// invoked twice when a concrete event and symbolic fallback resolve identically.
const nativeListeners = new Map();
const nativeDeleteSource = {
  on(name, handler) { const handlers = nativeListeners.get(name) || []; handlers.push(handler); nativeListeners.set(name, handlers); },
  off(name, handler) { nativeListeners.set(name, (nativeListeners.get(name) || []).filter(item => item !== handler)); },
  async emit(name, payload) { for (const handler of nativeListeners.get(name) || []) await handler(payload); },
};
let nativeDeleteCalls = 0;
setSillyTavernDirectiveRuntimeBridge({app:{async handleHostMessageDeleted(payload) {
  assert.equal(payload, 33);
  nativeDeleteCalls++;
}}});
wireEvents({eventSource:nativeDeleteSource,eventTypes:{MESSAGE_DELETED:'message_deleted'}});
await nativeDeleteSource.emit('message_deleted', 33);
assert.equal(nativeDeleteCalls, 1, 'native numeric deletion invokes runtime once despite symbolic fallback alias');
disposeSillyTavernDirectiveEventLifecycle();
assert.equal(nativeListeners.get('message_deleted').length, 0);
await nativeDeleteSource.emit('message_deleted', 33);
assert.equal(nativeDeleteCalls, 1, 'disposed lifecycle receives no deletion');
wireEvents({eventSource:nativeDeleteSource,eventTypes:{MESSAGE_DELETED:'message_deleted'}});
wireEvents({eventSource:nativeDeleteSource,eventTypes:{MESSAGE_DELETED:'message_deleted'}});
await nativeDeleteSource.emit('message_deleted', 33);
assert.equal(nativeDeleteCalls, 2, 'rewiring replaces prior lifecycle and still receives exactly one callback');
disposeSillyTavernDirectiveEventLifecycle();
assert.equal(nativeListeners.get('message_deleted').length, 0);
clearSillyTavernDirectiveRuntimeBridge();
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

const playerEventSource = createFakeEventAdapter();
const currentPlayerEventTypes = {
  MESSAGE_SENT: 'message_sent',
  USER_MESSAGE_RENDERED: 'user_message_rendered'
};
let observedPlayerMessages = 0;
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async observeHostPlayerMessage() {
      observedPlayerMessages += 1;
      return { handled: true };
    }
  }
});
wireEvents({ eventSource: playerEventSource, eventTypes: currentPlayerEventTypes });
assert.equal(
  playerEventSource.listenerCount('message_sent'),
  1,
  'the resolved MESSAGE_SENT event must not be registered again through its symbolic fallback'
);
assert.equal(
  playerEventSource.listenerCount('user_message_rendered'),
  0,
  'one logical user send must use one canonical host event instead of observing both sent and rendered phases'
);
await playerEventSource.emit('message_sent', 1);
await playerEventSource.emit('user_message_rendered', 1);
await Promise.resolve();
assert.equal(observedPlayerMessages, 1, 'one SillyTavern user send must schedule one Directive observation');
disposeSillyTavernDirectiveEventLifecycle();
clearSillyTavernDirectiveRuntimeBridge();

const renderedFallbackEventSource = createFakeEventAdapter();
let renderedFallbackCalls = 0;
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async observeHostPlayerMessage() {
      renderedFallbackCalls += 1;
      return { handled: true };
    }
  }
});
wireEvents({
  eventSource: renderedFallbackEventSource,
  eventTypes: { USER_MESSAGE_RENDERED: 'legacy_user_message_rendered' }
});
assert.equal(renderedFallbackEventSource.listenerCount('legacy_user_message_rendered'), 1);
renderedFallbackEventSource.emit('legacy_user_message_rendered', 2);
await Promise.resolve();
assert.equal(renderedFallbackCalls, 1, 'legacy hosts without MESSAGE_SENT must retain rendered-message observation');
disposeSillyTavernDirectiveEventLifecycle();
clearSillyTavernDirectiveRuntimeBridge();

let releaseEditedReconciliation = null;
const editedReconciliation = new Promise((resolve) => { releaseEditedReconciliation = resolve; });
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async handleHostMessageEdited() {
      return editedReconciliation;
    }
  }
});
const editCallbackTimeout = Symbol('edit-callback-timeout');
const editCallbackResult = await Promise.race([
  __directiveEventTestHooks.handleMessageEdited(42),
  new Promise((resolve) => setTimeout(() => resolve(editCallbackTimeout), 25))
]);
assert.notEqual(
  editCallbackResult,
  editCallbackTimeout,
  'native edit callback must release before authoritative reconciliation finishes'
);
assert.deepEqual(editCallbackResult, {
  handled: true,
  scheduled: true,
  abortDefaultGeneration: false
});
releaseEditedReconciliation({ handled: true });
await editedReconciliation;
clearSillyTavernDirectiveRuntimeBridge();

const pairedEventSource = createFakeEventAdapter();
let pairedEditCalls = 0;
let independentVisibilityCalls = 0;
let releaseVisibilityReconciliation = null;
const visibilityReconciliation = new Promise((resolve) => { releaseVisibilityReconciliation = resolve; });
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async handleHostMessageEdited() {
      pairedEditCalls += 1;
      return { handled: true };
    },
    async handleHostMessageVisibilityChanged() {
      independentVisibilityCalls += 1;
      return visibilityReconciliation;
    }
  },
  directiveHost: { chat: { getCurrentChatId: () => 'chat.event-dedup' } }
});
wireEvents({ eventSource: pairedEventSource, eventTypes });
pairedEventSource.emit('edited', 57);
await Promise.resolve();
pairedEventSource.emit('updated', 57);
await Promise.resolve();
assert.equal(pairedEditCalls, 1, 'the update paired with a native edit must not repeat edit reconciliation');
assert.equal(independentVisibilityCalls, 0, 'the paired update must be consumed before visibility reconciliation');
pairedEventSource.emit('updated', 58);
await Promise.resolve();
assert.equal(pairedEditCalls, 1);
assert.equal(independentVisibilityCalls, 1, 'an independent update must still reconcile message visibility');
const visibilityCallbackResult = __directiveEventTestHooks.handleMessageVisibilityChanged({
  messageId: 59,
  visible: false
});
assert.deepEqual(visibilityCallbackResult, {
  handled: true,
  scheduled: true,
  abortDefaultGeneration: false
}, 'visibility reconciliation must not block the native update callback');
releaseVisibilityReconciliation({ handled: true });
await visibilityReconciliation;
disposeSillyTavernDirectiveEventLifecycle();
clearSillyTavernDirectiveRuntimeBridge();

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
const documentBeforeDisableNotificationTest = globalThis.document;
installFakeDom();
publishGameplayNotifications([{
  id: 'people.newContact.person.disable-test.1',
  route: 'people',
  subjectId: 'person.disable-test',
  kind: 'newContact',
  title: 'New contact',
  summary: 'Disable lifecycle test.',
  priority: 60,
  sourceRevision: 'mission:0;story:1',
}], { onView: async () => {} });
assert.equal(__gameplayNotificationCenterTestHooks.state().visible, 1);
await __directiveEventTestHooks.handleExtensionDisabled();
assert.equal(restoreCount, 1, 'extension disable must restore the preset selected before campaign play');
assert.equal(__gameplayNotificationCenterTestHooks.state().visible, 0, 'extension disable must clear gameplay notifications');
if (documentBeforeDisableNotificationTest === undefined) delete globalThis.document;
else globalThis.document = documentBeforeDisableNotificationTest;
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
let releaseEndedReview = null;
const heldEndedReview = new Promise((resolve) => { releaseEndedReview = resolve; });
setSillyTavernDirectiveRuntimeBridge({
  app: {
    async handleHostGenerationEnded(payload) {
      endedPayload = payload;
      await heldEndedReview;
      return { handled: true };
    }
  }
});
const endedCallbackTimeout = Symbol('ended-callback-timeout');
const immediateEndedResult = __directiveEventTestHooks.handleGenerationEnded({ messageId: 'assistant.42' });
assert.deepEqual(endedPayload, { messageId: 'assistant.42' },
  'runtime must acquire finalization ownership before the next native listener can run');
const endedCallbackResult = await Promise.race([
  immediateEndedResult,
  new Promise((resolve) => setTimeout(() => resolve(endedCallbackTimeout), 25)),
]);
assert.notEqual(
  endedCallbackResult,
  endedCallbackTimeout,
  'post-narration Directive work must not hold SillyTavern generation-ended listeners',
);
assert.deepEqual(endedCallbackResult, {
  handled: true,
  scheduled: true,
  abortDefaultGeneration: false,
});
assert.deepEqual(endedPayload, { messageId: 'assistant.42' });
releaseEndedReview({ handled: true });
await heldEndedReview;
clearSillyTavernDirectiveRuntimeBridge();

const lifecycleStarts = [];
let streamSignals = 0;
setSillyTavernDirectiveRuntimeBridge({ app: {
  handleHostGenerationStarted: payload => { lifecycleStarts.push(payload); return { handled: true }; },
  handleHostStreamTokenReceived: () => { streamSignals++; },
} });
__directiveEventTestHooks.handleGenerationStarted('quiet', { quietToLoud: true });
assert.equal(lifecycleStarts[0].quietToLoud, true, 'visible quiet generation preserves its lifecycle intent');
__directiveEventTestHooks.handleStreamTokenReceived('Visible output');
assert.equal(streamSignals, 1, 'stream observation reaches runtime synchronously');
const ownedClient = createSillyTavernGenerationClient({ contextFactory: () => ({
  generateRaw: async () => {
    const start = __directiveEventTestHooks.handleGenerationStarted('normal');
    assert.equal(start.reason, 'directive-owned-generation');
    __directiveEventTestHooks.handleStreamTokenReceived('Owned output');
    return 'Owned narration.';
  },
}) });
await ownedClient.generateNarration({ prompt: 'Opening' });
assert.equal(lifecycleStarts.length, 1, 'owned generation cannot reserve an unpaired native lifecycle');
assert.equal(streamSignals, 1);
clearSillyTavernDirectiveRuntimeBridge();

installFakeDom();
let releaseBoundarySettlement = null;
const boundarySettlement = new Promise((resolve) => { releaseBoundarySettlement = resolve; });
setSillyTavernDirectiveRuntimeBridge({
  turnOrchestrator: {
    async interceptGeneration() {
      await boundarySettlement;
      return {
        handled: true,
        abortDefaultGeneration: false,
        responseStrategy: 'injectAndContinue'
      };
    }
  }
});
const boundaryInterception = directiveGenerationInterceptor([], 8192, () => {}, 'normal');
await new Promise((resolve) => setTimeout(resolve, 400));
const boundaryActivity = globalThis.document.getElementById('directive-turn-activity-indicator');
assert.equal(boundaryActivity?.hidden, false, 'slow generation-boundary settlement must expose reading activity');
assert.equal(
  boundaryActivity?.querySelector('.directive-notification-category')?.textContent,
  'Directive',
  'reading activity should use the unified notification category hierarchy'
);
assert.equal(
  boundaryActivity?.querySelector('.directive-turn-activity-label')?.textContent,
  'Processing the turn...'
);
releaseBoundarySettlement();
await boundaryInterception;
await new Promise((resolve) => setTimeout(resolve, 75));
assert.equal(
  boundaryActivity?.querySelector('.directive-notification-category')?.textContent,
  'SillyTavern',
  'handoff should update the same card category without creating another notification'
);
assert.equal(
  boundaryActivity?.querySelector('.directive-turn-activity-label')?.textContent,
  'Waiting for the reply',
  'successful settlement must hand activity off to host narration'
);
await new Promise((resolve) => setTimeout(resolve, 850));
assert.equal(__directiveTurnActivityTestHooks.activeActivities().length, 1, 'waiting persists until an actual host lifecycle event');
__directiveEventTestHooks.handleGenerationEnded();
assert.equal(__directiveTurnActivityTestHooks.activeActivities().length, 0);
clearSillyTavernDirectiveRuntimeBridge();

let abortImmediately = null;
let settlementRetryCalls = 0;
let initialRecoveryShown = false;
let continuedGeneration = null;
setSillyTavernDirectiveRuntimeBridge({
  app: {
    isCurrentChatBound: () => true,
    getCurrentChatBinding: () => ({campaignId:'campaign.retry',saveId:'save.retry',chatId:'chat.retry'}),
    async retryPendingAcceptedPairSettlement() {
      settlementRetryCalls += 1;
      return { ok: true };
    }
  },
  turnOrchestrator: {
    async interceptGeneration() {
      if (initialRecoveryShown) {
        settlementRetryCalls += 1;
        return { handled: true, abortDefaultGeneration: false, responseStrategy: 'injectAndContinue' };
      }
      initialRecoveryShown = true;
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
      getCurrentChatId: () => 'chat.retry',
      async continueHostGeneration(options) {
        continuedGeneration = options;
        // The production chat adapter calls SillyTavern Generate, which invokes the interceptor again.
        const releaseHandoff = options.onGenerationStarting?.();
        try { await directiveGenerationInterceptor([], 8192, () => {}, options.type); }
        finally { releaseHandoff?.(); }
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
assert.equal(settlementRetryCalls, 2, 'Retry prepares through the same interceptor that native Generate re-enters');
assert.equal(typeof continuedGeneration.onGenerationFailed, 'function');
const { onGenerationFailed, onGenerationStarting, isActive, signal: continuationSignal, ...continuedOptions } = continuedGeneration;
assert.equal(typeof onGenerationStarting, 'function', 'native reentry carries Retry operation ownership');
assert.equal(typeof isActive, 'function', 'native handoff rechecks recovery binding');
assert.ok(continuationSignal instanceof AbortSignal, 'Retry forwards cancellation through the native generation handoff');
assert.deepEqual(continuedOptions, {
  reason: 'directive-settlement-retry',
  type: 'normal',
  automaticTrigger: true,
  waitForCompletion: false
});
assert.equal(__directiveTurnActivityTestHooks.activeActivities().length, 1, 'retry generation owns one activity');
assert.equal(__directiveTurnActivityTestHooks.activeActivities()[0].phase, 'waiting', 'retry re-enters the normal handoff lifecycle');
__directiveEventTestHooks.handleGenerationEnded();
assert.equal(__directiveTurnActivityTestHooks.activeActivities().length, 0);
clearSillyTavernDirectiveRuntimeBridge();

let releaseReplayRetry = null;
const replayRetryPending = new Promise((resolve) => { releaseReplayRetry = resolve; });
let replayContinuationCount = 0;
let replayPreparationCount = 0;
setSillyTavernDirectiveRuntimeBridge({
  app: {
    isCurrentChatBound: () => true,
    getCurrentChatBinding: () => ({campaignId:'campaign.retry',saveId:'save.retry',chatId:'chat.retry'}),
    async retryPendingAcceptedPairSettlement() {
      return replayRetryPending;
    }
  },
  turnOrchestrator: {
    async interceptGeneration() {
      if (++replayPreparationCount === 2) {
        await replayRetryPending;
        return { handled: true, abortDefaultGeneration: false };
      }
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
      getCurrentChatId: () => 'chat.retry',
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

// Exercise the real adapter default without waiting several seconds in the test.
const narrationContext = { chat: [], extensionSettings: { directive: { providers: { utility: { analysisLimits: { hostNarrationTimeoutSeconds: 2 } } } } } };
const narrationAdapter = createSillyTavernChatAdapter({ contextFactory: () => narrationContext, scriptModule: { Generate: async () => ({}) } });
const realNow = Date.now;
const realSetTimeout = globalThis.setTimeout;
let clockMs = 0;
try {
  Date.now = () => clockMs;
  globalThis.setTimeout = (callback, milliseconds, ...args) => { clockMs += milliseconds; queueMicrotask(() => callback(...args)); return 1; };
  assert.equal((await narrationAdapter.continueHostGeneration()).ok, true);
  assert.equal(clockMs, 2000, 'native narration observation honors configured wait');
  narrationContext.extensionSettings.directive.providers.utility.analysisLimits.hostNarrationTimeoutSeconds = 7;
  await narrationAdapter.continueHostGeneration();
  assert.equal(clockMs, 9000, 'changed wait applies without rebuilding adapter');
  await narrationAdapter.continueHostGeneration({ observationTimeoutMs: 1000 });
  assert.equal(clockMs, 10000, 'explicit observation deadline remains available to callers');
} finally {
  Date.now = realNow;
  globalThis.setTimeout = realSetTimeout;
}

// A refused native child gets visible, deduplicated recovery without an ineffective Retry.
installFakeDom();
__directiveRuntimeActionTestHooks.clearRuntimeActions();
registerRuntimeAction('runtime.refresh', () => ({ refreshed: true }));
const refusedParentBinding = { hostId: 'fake', campaignId: 'campaign.refused', saveId: 'save.parent', chatId: 'chat.parent', entityType: 'character', entityId: '7', entityName: 'Captain' };
let refusedChildId = 'chat.refused-one';
let parentOpens = 0;
let ordinaryRefusalChat = false;
setSillyTavernDirectiveRuntimeBridge({
  app: {
    getCurrentChatBinding: () => refusedParentBinding,
    isCurrentChatBound: () => false,
    async openCampaignChat() { parentOpens += 1; return { ok: true }; },
    async handleHostChatChanged() { if (ordinaryRefusalChat) return { active: false, timelineFork: null }; return { active: false, timelineFork: {
      status: 'blocked', reasonCode: 'DIRECTIVE_BRANCH_DECISION_HISTORY_UNAVAILABLE',
      parentBinding: refusedParentBinding, childBinding: { ...refusedParentBinding, chatId: refusedChildId },
      message: 'Directive cannot attach this earlier branch. Your original timeline is unchanged. Use Campaign Continue, or Campaign Load Game to choose an earlier checkpoint if one is available.'
    } }; },
  },
  directiveHost: { chat: { getCurrentChatId: () => refusedChildId, getCurrentBinding: () => ({ ...refusedParentBinding, chatId: refusedChildId }) } },
  turnOrchestrator: { async interceptGeneration() { return { handled: true, abortDefaultGeneration: true, responseStrategy: 'cancelStaleTurn', reasonCode: 'DIRECTIVE_BRANCH_DECISION_HISTORY_UNAVAILABLE' }; } },
});
let refusalAborted = false;
const refusalGeneration = await directiveGenerationInterceptor([], 4096, () => { refusalAborted = true; }, 'normal');
assert.equal(refusalGeneration.abortDefaultGeneration, true);
assert.equal(refusalAborted, true);
await __directiveEventTestHooks.handleChatChanged();
let refusalDialog = document.querySelector('.branch-history-dialog-overlay');
assert.ok(refusalDialog, 'the dedicated refusal must be visible');
const allRefusalNodes = root => [root, ...root.children.flatMap(allRefusalNodes)];
assert.equal(refusalDialog.querySelector('.timeline-dialog').getAttribute('role'), 'dialog');
assert.match(allRefusalNodes(refusalDialog).map(node => node.textContent).join(' '), /original timeline is unchanged/);
assert.match(allRefusalNodes(refusalDialog).map(node => node.textContent).join(' '), /if one is available/);
assert.ok(!allRefusalNodes(refusalDialog).some(node => /retry/i.test(node.textContent)));
await __directiveEventTestHooks.handleChatChanged();
assert.equal(document.querySelector('.branch-history-dialog-overlay'), refusalDialog, 'same exact parent/child identity is deduplicated');
await refusalDialog.querySelector('.campaign-command-primary').click();
assert.equal(parentOpens, 1);
assert.equal(refusalDialog.isConnected, false);
await __directiveEventTestHooks.handleChatChanged();
assert.equal(document.querySelector('.branch-history-dialog-overlay'), null, 'dismissed duplicate remains deduplicated');
refusedChildId = 'chat.refused-two';
await __directiveEventTestHooks.handleChatChanged();
assert.ok(document.querySelector('.branch-history-dialog-overlay'), 'a different rejected child has its own explanation');
ordinaryRefusalChat = true;
refusedChildId = 'chat.ordinary';
await __directiveEventTestHooks.handleChatChanged();
assert.equal(document.querySelector('.branch-history-dialog-overlay'), null, 'unrelated ordinary chat must not retain the focus-trapping refusal dialog');

let releaseRefusalRefresh;
let reportRefusalRefresh;
const refusalRefreshStarted = new Promise(resolve => { reportRefusalRefresh = resolve; });
const refusalRefreshHeld = new Promise(resolve => { releaseRefusalRefresh = resolve; });
let holdRefusalRefresh = true;
registerRuntimeAction('runtime.refresh', async () => {
  if (holdRefusalRefresh) { holdRefusalRefresh = false; reportRefusalRefresh(); await refusalRefreshHeld; }
  return { refreshed: true };
}, { replace: true });
ordinaryRefusalChat = false;
refusedChildId = 'chat.delayed-refusal';
const delayedRefusal = __directiveEventTestHooks.handleChatChanged();
await refusalRefreshStarted;
ordinaryRefusalChat = true;
refusedChildId = 'chat.ordinary-after-delay';
await __directiveEventTestHooks.handleChatChanged();
releaseRefusalRefresh();
await delayedRefusal;
assert.equal(document.querySelector('.branch-history-dialog-overlay'), null, 'an older delayed refresh must not reopen the rejected-child dialog over another chat');
ordinaryRefusalChat = false;
refusedChildId = 'chat.visible-before-delay';
await __directiveEventTestHooks.handleChatChanged();
assert.ok(document.querySelector('.branch-history-dialog-overlay'));
let releaseSilentRefresh;
let reportSilentRefresh;
const silentRefreshStarted = new Promise(resolve => { reportSilentRefresh = resolve; });
const silentRefreshHeld = new Promise(resolve => { releaseSilentRefresh = resolve; });
registerRuntimeAction('runtime.refresh', async () => {
  reportSilentRefresh(); await silentRefreshHeld; return { refreshed: true };
}, { replace: true });
const silentSwitch = __directiveEventTestHooks.handleChatChanged();
await silentRefreshStarted;
refusedChildId = 'chat.changed-before-event-delivery';
releaseSilentRefresh();
await silentSwitch;
assert.equal(Boolean(document.querySelector('.branch-history-dialog-overlay')), false,
  'existing modal must close after host identity changes during refresh even before the next event is delivered');
refusedChildId = 'chat.same-child-different-parent';
const staleParentRefusal = { status: 'blocked', reasonCode: 'DIRECTIVE_BRANCH_DECISION_HISTORY_UNAVAILABLE',
  parentBinding: structuredClone(refusedParentBinding), childBinding: { ...refusedParentBinding, chatId: refusedChildId }, message: 'Earlier branch unavailable.' };
refusedParentBinding.saveId = 'save.different-active-parent';
handleNativeBranchRefusalUiMessage({ type: 'directive.nativeBranchRefusal.v1', payload: staleParentRefusal });
assert.equal(Boolean(document.querySelector('.branch-history-dialog-overlay')), false,
  'delivered refusal for a different active parent must not show even when the child chat identity matches');



disposeSillyTavernDirectiveEventLifecycle();
clearSillyTavernDirectiveRuntimeBridge();
__directiveRuntimeActionTestHooks.clearRuntimeActions();

console.log('PASS V1 SillyTavern event wiring');
