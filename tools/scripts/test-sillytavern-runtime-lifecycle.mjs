import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  clearSillyTavernDirectiveRuntimeBridge,
  getSillyTavernDirectiveRuntimeBridge,
  installDirectiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeBridge
} from '../../src/hosts/sillytavern/runtime-bridge.mjs';
import {
  __directiveEventTestHooks,
  wireEvents
} from '../../src/hosts/sillytavern/shell-events.js';
import {
  __directiveTurnActivityTestHooks,
  clearDirectiveTurnActivity,
  finishDirectiveTurnActivity,
  markDirectiveTurnActivity,
  updateDirectiveTurnActivity
} from '../../src/hosts/sillytavern/turn-activity-indicator.js';
import {
  __directiveRuntimeActionTestHooks,
  registerRuntimeAction
} from '../../src/runtime/runtime-actions.js';
import { OUTCOME_INTEGRITY_EDIT_ACTION_ID } from '../../src/runtime/outcome-integrity.mjs';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert.equal(manifest.generate_interceptor, 'directiveGenerationInterceptor');

const registered = new Map();
const eventSource = {
  on(name, handler) {
    registered.set(name, handler);
  }
};
const eventTypes = {
  CHAT_CHANGED: 'chat-changed',
  MESSAGE_SENT: 'message-sent',
  USER_MESSAGE_SENT: 'user-message-sent',
  USER_MESSAGE_RENDERED: 'user-message-rendered',
  MESSAGE_EDITED: 'message-edited',
  MESSAGE_UPDATED: 'message-updated',
  MESSAGE_DELETED: 'message-deleted',
  MESSAGE_REMOVED: 'message-removed',
  EXTENSION_DISABLED: 'extension-disabled',
  EXTENSION_DISABLE: 'extension-disable'
};
assert.equal(wireEvents({ eventSource, eventTypes }), true);
assert.deepEqual([...registered.keys()].sort(), [
  eventTypes.CHAT_CHANGED,
  eventTypes.EXTENSION_DISABLE,
  eventTypes.EXTENSION_DISABLED,
  eventTypes.MESSAGE_DELETED,
  eventTypes.MESSAGE_EDITED,
  eventTypes.MESSAGE_REMOVED,
  eventTypes.MESSAGE_SENT,
  eventTypes.USER_MESSAGE_SENT,
  eventTypes.USER_MESSAGE_RENDERED
].sort());
assert.equal(registered.has(eventTypes.MESSAGE_UPDATED), false, 'MESSAGE_UPDATED should not duplicate edit recovery.');

const calls = [];
const app = {
  async observeHostPlayerMessage(payload) {
    calls.push(['sent', payload]);
    return { handled: true, abortDefaultGeneration: false };
  },
  async handleHostMessageEdited(payload) {
    calls.push(['edited', payload]);
    return { handled: true };
  },
  async handleHostMessageDeleted(payload) {
    calls.push(['deleted', payload]);
    return { handled: true };
  },
  async handleHostChatChanged(payload) {
    calls.push(['chat', payload]);
    return { active: true };
  },
  getOutcomeIntegrityNativeEditDecision(payload) {
    calls.push(['integrity-decision', payload.hostMessageId]);
    return { protected: true, nativeEdit: 'intercept', mode: 'strict' };
  }
};
let promptClearCount = 0;
const host = {
  prompt: {
    async clear(options) {
      promptClearCount += 1;
      calls.push(['prompt-clear', options]);
      return { ok: true };
    }
  },
  logger: { error() {} }
};
const orchestrator = {
  async interceptGeneration(payload) {
    calls.push(['intercept', payload.type]);
    return { handled: true, abortDefaultGeneration: true };
  }
};

__directiveRuntimeActionTestHooks.clearRuntimeActions();
registerRuntimeAction('runtime.refresh', () => ({ ok: true }));
registerRuntimeAction('runtime.hide', () => ({ ok: true }));
registerRuntimeAction(OUTCOME_INTEGRITY_EDIT_ACTION_ID, (payload) => {
  calls.push(['integrity-open', payload]);
  return { ok: true };
});
setSillyTavernDirectiveRuntimeBridge({ app, turnOrchestrator: orchestrator, directiveHost: host, active: true });
installDirectiveGenerationInterceptor();
assert.equal(typeof globalThis.directiveGenerationInterceptor, 'function');

const editRow = {
  getAttribute(name) {
    return name === 'mesid' ? '22' : null;
  }
};
const editButton = {
  closest(selector) {
    return selector === '.mes[mesid]' ? editRow : null;
  }
};
let preventedNativeEdit = false;
let stoppedNativeEdit = false;
let stoppedImmediateNativeEdit = false;
const nativeEditCaptured = __directiveEventTestHooks.captureNativeProtectedEditIntent({
  target: {
    closest(selector) {
      if (selector === '.mes_edit') return editButton;
      if (selector === '.mes_edit_delete') return null;
      return null;
    }
  },
  preventDefault() { preventedNativeEdit = true; },
  stopPropagation() { stoppedNativeEdit = true; },
  stopImmediatePropagation() { stoppedImmediateNativeEdit = true; }
});
assert.equal(nativeEditCaptured, true);
assert.equal(preventedNativeEdit, true);
assert.equal(stoppedNativeEdit, true);
assert.equal(stoppedImmediateNativeEdit, true);
await new Promise((resolve) => setTimeout(resolve, 120));
assert.deepEqual(calls.slice(-2), [
  ['integrity-decision', '22'],
  ['integrity-open', { message: { hostMessageId: '22', id: '22' } }]
]);

const sentResult = await registered.get('message-sent')({ id: 4 });
assert.equal(sentResult.scheduled, true);
const callsBeforeSentObservation = calls.length;
assert.equal(calls.some((entry) => entry[0] === 'sent'), false, 'MESSAGE_SENT must return before Directive turn observation runs.');
assert.equal(__directiveTurnActivityTestHooks.activeCount(), 1);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(calls.slice(callsBeforeSentObservation).map((entry) => entry[0]), ['sent']);
assert.equal(__directiveTurnActivityTestHooks.activeCount(), 0);

const activityToken = markDirectiveTurnActivity({ delayMs: 0 });
updateDirectiveTurnActivity(activityToken, { phase: 'classifying' });
assert.equal(__directiveTurnActivityTestHooks.latestActivity().label, 'Directive is checking intent...');
updateDirectiveTurnActivity(activityToken, { phase: 'classified', classification: 'sceneNavigation' });
assert.equal(__directiveTurnActivityTestHooks.latestActivity().label, 'Directive is advancing the scene...');
assert.doesNotMatch(__directiveTurnActivityTestHooks.latestActivity().label, /order/i);
updateDirectiveTurnActivity(activityToken, {
  phase: 'sidecarsQueued',
  mode: 'background',
  requested: ['continuity', 'ship', 'promptUpdate']
});
finishDirectiveTurnActivity(activityToken);
let activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.mode, 'background');
assert.equal(activity.label, 'Updating campaign context...');
assert.deepEqual(Object.keys(activity.sidecars).sort(), ['continuity', 'ship']);
updateDirectiveTurnActivity(activityToken, { phase: 'sidecarWorker', workerKey: 'continuity', status: 'applied' });
assert.deepEqual(Object.keys(__directiveTurnActivityTestHooks.latestActivity().sidecars), ['ship']);
clearDirectiveTurnActivity(activityToken);

const reviewToken = markDirectiveTurnActivity({ delayMs: 0 });
updateDirectiveTurnActivity(reviewToken, {
  phase: 'sidecarsQueued',
  mode: 'background',
  requested: ['crew']
});
finishDirectiveTurnActivity(reviewToken);
updateDirectiveTurnActivity(reviewToken, { phase: 'sidecarWorker', mode: 'review', workerKey: 'crew', status: 'failed' });
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.mode, 'review');
assert.equal(activity.label, 'Campaign context needs review.');
assert.equal(activity.sidecars.crew.status, 'failed');
clearDirectiveTurnActivity(reviewToken);

const recoveryToken = markDirectiveTurnActivity({ delayMs: 0 });
updateDirectiveTurnActivity(recoveryToken, {
  phase: 'recovery',
  mode: 'review',
  label: 'Directive needs review before this turn is fully settled.'
});
finishDirectiveTurnActivity(recoveryToken);
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.mode, 'review');
assert.equal(activity.label, 'Directive needs review before this turn is fully settled.');
clearDirectiveTurnActivity(recoveryToken);

await registered.get('message-edited')({ id: 4, text: 'edited' });
await registered.get('message-deleted')(4);
__directiveEventTestHooks.rememberNativeDeleteIntent('16', { source: 'test-native-delete-button' });
await registered.get('message-deleted')(41);
await registered.get('chat-changed')({ chatId: 'chat-2' });
const intercepted = await globalThis.directiveGenerationInterceptor([], 4096, () => {}, 'normal');
assert.equal(intercepted.abortDefaultGeneration, true);
assert.deepEqual(calls.slice(callsBeforeSentObservation, callsBeforeSentObservation + 5).map((entry) => entry[0]), ['sent', 'edited', 'deleted', 'deleted', 'chat']);
assert.deepEqual(calls[callsBeforeSentObservation + 3], ['deleted', {
  hostMessageId: '16',
  source: 'test-native-delete-button',
  sillyTavernPayload: 41
}]);
assert.equal(calls.some((entry) => entry[0] === 'intercept'), true);

await registered.get('extension-disabled')();
assert.equal(promptClearCount, 1);
assert.equal(globalThis.directiveGenerationInterceptor, undefined);
assert.equal(getSillyTavernDirectiveRuntimeBridge().enabled, false);

clearSillyTavernDirectiveRuntimeBridge();
__directiveRuntimeActionTestHooks.clearRuntimeActions();

console.log('SillyTavern runtime lifecycle tests passed: manifest interceptor, message/edit/delete/chat events, fail-safe bridge routing, and disable cleanup');
