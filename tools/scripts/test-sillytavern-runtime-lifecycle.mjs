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
  reportDirectiveJobProgress,
  reportDirectiveStorageProgress,
  updateDirectiveTurnActivity
} from '../../src/hosts/sillytavern/turn-activity-indicator.js';
import {
  __directiveRuntimeActionTestHooks,
  registerRuntimeAction
} from '../../src/runtime/runtime-actions.js';
import { OUTCOME_INTEGRITY_EDIT_ACTION_ID } from '../../src/runtime/outcome-integrity.mjs';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert.equal(manifest.generate_interceptor, 'directiveGenerationInterceptor');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.id = '';
    this.hidden = false;
    this.textContent = '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener() {}

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    const dataAttribute = selector.match(/^\[data-([^=\]]+)(?:="([^"]*)")?\]$/);
    if (dataAttribute) {
      const key = dataAttribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const actual = this.dataset?.[key];
      return dataAttribute[2] === undefined ? actual !== undefined : String(actual) === dataAttribute[2];
    }
    return false;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      if (node.matches?.(selector)) results.push(node);
      for (const child of node.children || []) visit(child);
    };
    visit(this);
    return results;
  }
}

function createFakeDocument() {
  const body = new FakeElement('body');
  return {
    body,
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    getElementById(id) {
      return body.querySelector(`#${id}`);
    }
  };
}

const registered = new Map();
const unregistered = [];
const eventSource = {
  on(name, handler) {
    registered.set(name, handler);
  },
  off(name, handler) {
    unregistered.push({ name, handler });
    if (registered.get(name) === handler) registered.delete(name);
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
  MESSAGE_SWIPED: 'message-swiped',
  MESSAGE_REMOVED: 'message-removed',
  GENERATION_STOPPED: 'generation-stopped',
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
  eventTypes.MESSAGE_UPDATED,
  eventTypes.MESSAGE_SWIPED,
  eventTypes.MESSAGE_REMOVED,
  eventTypes.MESSAGE_SENT,
  eventTypes.GENERATION_STOPPED,
  eventTypes.USER_MESSAGE_SENT,
  eventTypes.USER_MESSAGE_RENDERED
].sort());
assert.equal(registered.has(eventTypes.MESSAGE_UPDATED), true, 'MESSAGE_UPDATED should be routed to visibility-only observation, not edit recovery.');

const calls = [];
let nativeEditDecision = { protected: true, nativeEdit: 'intercept', mode: 'strict' };
const app = {
  async observeHostPlayerMessage(payload) {
    calls.push(['sent', payload]);
    return { handled: true, abortDefaultGeneration: false };
  },
  async handleHostMessageEdited(payload) {
    calls.push(['edited', payload]);
    return { handled: true };
  },
  async handleHostMessageVisibilityChanged(payload) {
    calls.push(['visibility', payload]);
    return { handled: true, action: 'visibilityOnlySourceRow' };
  },
  async handleHostMessageDeleted(payload) {
    calls.push(['deleted', payload]);
    return { handled: true };
  },
  async handleHostMessageSelectedSwipeChanged(payload) {
    calls.push(['selected-swipe', payload]);
    return { handled: true, action: 'selectedSwipeSourceMutation' };
  },
  async handleHostGenerationStopped(payload) {
    calls.push(['generation-stopped', payload]);
    return { handled: true, canceledCount: 1 };
  },
  async handleHostChatChanged(payload) {
    calls.push(['chat', payload]);
    return { active: true };
  },
  async clearDirectivePrompt(payload) {
    calls.push(['lens-clear', payload]);
    const result = await host.prompt.clear({
      reason: payload?.reason || 'extension-disabled',
      lane: 'all'
    });
    return { status: 'cleared', lane: 'all', result };
  },
  getOutcomeIntegrityNativeEditDecision(payload) {
    calls.push(['integrity-decision', payload.hostMessageId]);
    if (payload.hostMessageId === '24') {
      return Promise.resolve({ protected: false, nativeEdit: 'allow', reason: 'player-message' });
    }
    return { ...nativeEditDecision };
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
let nextInterceptResult = { handled: true, abortDefaultGeneration: true };
const orchestrator = {
  async interceptGeneration(payload) {
    calls.push(['intercept', payload.type]);
    return { ...nextInterceptResult };
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

nativeEditDecision = { protected: false, nativeEdit: 'allow', reason: 'player-message' };
let allowedPreventedNativeEdit = false;
const allowCallsBefore = calls.length;
const nativeEditAllowed = __directiveEventTestHooks.captureNativeProtectedEditIntent({
  target: {
    closest(selector) {
      if (selector === '.mes_edit') return {
        closest(rowSelector) {
          return rowSelector === '.mes[mesid]' ? {
            getAttribute(name) {
              return name === 'mesid' ? '23' : null;
            }
          } : null;
        }
      };
      if (selector === '.mes_edit_delete') return null;
      return null;
    }
  },
  preventDefault() { allowedPreventedNativeEdit = true; },
  stopPropagation() {},
  stopImmediatePropagation() {}
});
assert.equal(nativeEditAllowed, false);
assert.equal(allowedPreventedNativeEdit, false);
assert.deepEqual(calls.slice(allowCallsBefore), [
  ['integrity-decision', '23']
]);

let asyncAllowedPreventedNativeEdit = false;
let replayedAsyncAllowedNativeEdit = 0;
const asyncAllowCallsBefore = calls.length;
const nativeEditAsyncAllowed = __directiveEventTestHooks.captureNativeProtectedEditIntent({
  target: {
    closest(selector) {
      if (selector === '.mes_edit') return {
        closest(rowSelector) {
          return rowSelector === '.mes[mesid]' ? {
            getAttribute(name) {
              return name === 'mesid' ? '24' : null;
            }
          } : null;
        },
        click() {
          replayedAsyncAllowedNativeEdit += 1;
        }
      };
      if (selector === '.mes_edit_delete') return null;
      return null;
    }
  },
  preventDefault() { asyncAllowedPreventedNativeEdit = true; },
  stopPropagation() {},
  stopImmediatePropagation() {}
});
assert.equal(nativeEditAsyncAllowed, true);
assert.equal(asyncAllowedPreventedNativeEdit, true);
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(replayedAsyncAllowedNativeEdit, 1);
assert.deepEqual(calls.slice(asyncAllowCallsBefore), [
  ['integrity-decision', '24']
]);

const sentResult = await registered.get('message-sent')({ id: 4 });
assert.equal(sentResult.scheduled, true);
const callsBeforeSentObservation = calls.length;
assert.equal(calls.some((entry) => entry[0] === 'sent'), false, 'MESSAGE_SENT must return before Directive turn observation runs.');
assert.equal(__directiveTurnActivityTestHooks.activeCount(), 1);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(calls.slice(callsBeforeSentObservation).map((entry) => entry[0]), ['sent']);
assert.equal(__directiveTurnActivityTestHooks.activeCount(), 0);
const stopActivityToken = markDirectiveTurnActivity({ delayMs: 0 });
assert.equal(__directiveTurnActivityTestHooks.activeCount(), 1);
const stopResult = await registered.get('generation-stopped')({ source: 'test-stop-button' });
assert.equal(stopResult.handled, true);
assert.equal(stopResult.cancelResult.canceledCount, 1);
assert.equal(stopResult.activityResult.canceledCount, 1);
assert.equal(__directiveTurnActivityTestHooks.activeCount(), 0);
assert.equal(calls.at(-1)[0], 'generation-stopped');
assert.equal(calls.at(-1)[1].reason, 'host-generation-stopped');
clearDirectiveTurnActivity(stopActivityToken);

const selectedSwipeResult = await registered.get('message-swiped')({ id: '31', selectedSwipeIndex: 1, swipeCount: 3 });
assert.equal(selectedSwipeResult.handled, true);
assert.equal(selectedSwipeResult.action, 'selectedSwipeSourceMutation');
assert.deepEqual(calls.at(-1), ['selected-swipe', { id: '31', selectedSwipeIndex: 1, swipeCount: 3 }]);

const originalDocument = globalThis.document;
globalThis.document = createFakeDocument();
const activityToken = markDirectiveTurnActivity({ delayMs: 0 });
let activity;
updateDirectiveTurnActivity(activityToken, { phase: 'classifying' });
assert.equal(__directiveTurnActivityTestHooks.latestActivity().label, 'Directive is checking intent...');
updateDirectiveTurnActivity(activityToken, { phase: 'classified', classification: 'sceneNavigation' });
assert.equal(__directiveTurnActivityTestHooks.latestActivity().label, 'Directive is advancing the scene...');
assert.doesNotMatch(__directiveTurnActivityTestHooks.latestActivity().label, /order/i);
updateDirectiveTurnActivity(activityToken, { phase: 'settlingSceneHandshake' });
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Directive is checking the prior scene...');
assert.equal(activity.sceneDetails.scene.status, 'running');
updateDirectiveTurnActivity(activityToken, {
  phase: 'sceneHandshakeSettled',
  disposition: 'autoCommit',
  operationCount: 4,
  committedRoots: ['mission', 'commandLog', 'ship', 'threadLedger', 'runtimeTracking']
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Scene details filed.');
assert.deepEqual(
  Object.fromEntries(Object.entries(activity.sceneDetails).map(([key, value]) => [key, value.label])),
  { mission: 'Orders', commandLog: 'Log', ship: 'Ship', threadLedger: 'Threads' }
);
updateDirectiveTurnActivity(activityToken, { phase: 'syncingPrompt', source: 'sceneHandshake' });
assert.equal(__directiveTurnActivityTestHooks.latestActivity().label, 'Directive is syncing scene details...');
await new Promise((resolve) => setTimeout(resolve, 0));
const indicator = globalThis.document.getElementById(__directiveTurnActivityTestHooks.DIRECTIVE_TURN_ACTIVITY_ID);
assert.equal(indicator.hidden, false);
assert.equal(indicator.querySelector('.directive-turn-activity-label').textContent, 'Directive is syncing scene details...');
assert.deepEqual(
  indicator.querySelectorAll('.directive-turn-activity-chip').map((chip) => chip.textContent),
  ['Orders', 'Log', 'Ship', 'Threads']
);
updateDirectiveTurnActivity(activityToken, {
  phase: 'continuityProjectionPlanning',
  mode: 'blocking',
  source: 'sceneHandshake',
  planner: true
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Directive is planning the continuity matrix...');
assert.equal(activity.continuityProjectionSteps.planner.status, 'running');
assert.equal(activity.continuityProjectionSteps.matrix.status, 'queued');
updateDirectiveTurnActivity(activityToken, {
  phase: 'continuityProjectionBuilding',
  mode: 'blocking',
  source: 'sceneHandshake',
  planner: true
});
assert.equal(__directiveTurnActivityTestHooks.latestActivity().label, 'Directive is building the continuity matrix...');
updateDirectiveTurnActivity(activityToken, {
  phase: 'continuityProjectionValidating',
  mode: 'blocking',
  source: 'sceneHandshake',
  planner: true,
  blockCount: 8,
  selectedFactCount: 14
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Directive is checking the continuity matrix...');
assert.equal(activity.continuityProjectionSteps.planner.status, 'settled');
assert.equal(activity.continuityProjectionSteps.matrix.status, 'running');
updateDirectiveTurnActivity(activityToken, {
  phase: 'continuityProjectionInstalling',
  mode: 'blocking',
  source: 'sceneHandshake',
  planner: true
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Directive is installing continuity context...');
assert.equal(activity.continuityProjectionSteps.matrix.status, 'settled');
assert.equal(activity.continuityProjectionSteps.prompt.status, 'running');
updateDirectiveTurnActivity(activityToken, {
  phase: 'continuityProjectionInstalled',
  mode: 'blocking',
  source: 'sceneHandshake',
  planner: true,
  status: 'complete'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Continuity context ready.');
assert.deepEqual(
  Object.fromEntries(Object.entries(activity.continuityProjectionSteps).map(([key, value]) => [key, value.status])),
  { planner: 'settled', matrix: 'settled', prompt: 'settled' }
);
assert.deepEqual(
  indicator.querySelectorAll('.directive-turn-activity-chip').map((chip) => chip.textContent),
  ['Orders', 'Log', 'Ship', 'Threads', 'Planner', 'Matrix', 'Context']
);
updateDirectiveTurnActivity(activityToken, { phase: 'classifying' });
assert.equal(__directiveTurnActivityTestHooks.latestActivity().label, 'Directive is checking intent...');
updateDirectiveTurnActivity(activityToken, {
  phase: 'sidecarsQueued',
  mode: 'background',
  requested: ['continuity', 'ship', 'promptUpdate']
});
finishDirectiveTurnActivity(activityToken);
activity = __directiveTurnActivityTestHooks.latestActivity();
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

const handshakeReviewToken = markDirectiveTurnActivity({ delayMs: 0 });
updateDirectiveTurnActivity(handshakeReviewToken, {
  phase: 'sceneHandshakeSettled',
  disposition: 'internalReview',
  operationCount: 0,
  committedRoots: []
});
updateDirectiveTurnActivity(handshakeReviewToken, { phase: 'classifying', mode: 'blocking' });
finishDirectiveTurnActivity(handshakeReviewToken);
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.mode, 'review');
assert.equal(activity.label, 'Scene details need review.');
assert.equal(activity.sceneDetails.scene.status, 'review');
const reviewIndicator = globalThis.document.getElementById(__directiveTurnActivityTestHooks.DIRECTIVE_TURN_ACTIVITY_ID);
assert.equal(reviewIndicator.querySelector('.directive-turn-activity-actions').hidden, false);
clearDirectiveTurnActivity(handshakeReviewToken);

reportDirectiveJobProgress({
  jobId: 'activation-visual-test',
  phase: 'activationIntroGenerating',
  status: 'running'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Writing opening scene...');
assert.deepEqual(
  Object.fromEntries(Object.entries(activity.activationSteps).map(([key, value]) => [key, value.label])),
  { save: 'Save', chat: 'Chat', intro: 'Opening Scene' }
);
await new Promise((resolve) => setTimeout(resolve, 0));
const activationIndicator = globalThis.document.getElementById(__directiveTurnActivityTestHooks.DIRECTIVE_TURN_ACTIVITY_ID);
assert.equal(activationIndicator.querySelector('.directive-turn-activity-label').textContent, 'Writing opening scene...');
assert.deepEqual(
  activationIndicator.querySelectorAll('.directive-turn-activity-chip').map((chip) => chip.textContent),
  ['Save', 'Chat', 'Opening Scene']
);
reportDirectiveJobProgress({
  jobId: 'activation-visual-test',
  phase: 'continuityProjectionPlanning',
  source: 'activation',
  planner: true,
  status: 'running'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Directive is planning the continuity matrix...');
assert.equal(activity.continuityProjectionSteps.planner.status, 'running');
assert.equal(activity.continuityProjectionSteps.matrix.status, 'queued');
reportDirectiveJobProgress({
  jobId: 'activation-visual-test',
  phase: 'continuityProjectionInstalling',
  source: 'activation',
  planner: true,
  status: 'running'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Directive is installing continuity context...');
assert.equal(activity.continuityProjectionSteps.prompt.status, 'running');
assert.deepEqual(
  activationIndicator.querySelectorAll('.directive-turn-activity-chip').map((chip) => chip.textContent),
  ['Save', 'Chat', 'Opening Scene', 'Planner', 'Matrix', 'Context']
);
reportDirectiveJobProgress({
  jobId: 'activation-visual-test',
  phase: 'continuityProjectionInstalled',
  source: 'activation',
  planner: true,
  status: 'complete'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Continuity context ready.');
assert.equal(activity.continuityProjectionSteps.prompt.status, 'settled');
reportDirectiveJobProgress({
  jobId: 'activation-visual-test',
  phase: 'activationComplete',
  status: 'complete'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Campaign ready.');
assert.deepEqual(
  activationIndicator.querySelectorAll('.directive-turn-activity-chip').map((chip) => chip.textContent),
  ['Save', 'Chat', 'Opening Scene', 'Prompt', 'Ready', 'Planner', 'Matrix', 'Context']
);
clearDirectiveTurnActivity(activity.token);

reportDirectiveJobProgress({
  jobId: 'intro-rewrite-visual-test',
  phase: 'introRewriteGenerating',
  status: 'running'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Rewriting opening scene...');
assert.equal(activity.activationSteps.intro.label, 'Opening Scene');
reportDirectiveJobProgress({
  jobId: 'intro-rewrite-visual-test',
  phase: 'introRewriteFailed',
  status: 'failed'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.mode, 'review');
assert.equal(activity.label, 'Opening scene rewrite needs review.');
assert.equal(activity.activationSteps.intro.status, 'review');
assert.equal(activationIndicator.querySelector('.directive-turn-activity-actions').hidden, false);
clearDirectiveTurnActivity(activity.token);

reportDirectiveStorageProgress({
  operationId: 'storage-write-save',
  phase: 'storageWriteStarted',
  status: 'running',
  operation: 'writeJson',
  logicalKey: 'saves/save-storage-visual.v1.json',
  path: '/user/files/directive-saves-save-storage-visual.v1.json',
  delayMs: 0
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.activityKind, 'storage');
assert.equal(activity.label, 'Saving...');
assert.equal(activity.storageProgress.total, 1);
assert.equal(activity.storageProgress.stageCount, 1);
assert.equal(activity.storageFiles.saving.status, 'running');
assert.equal(activity.storageFiles.saving.label, 'Campaign Save');
assert.equal(__directiveTurnActivityTestHooks.cancelActiveDirectiveTurnActivities().canceledCount, 0, 'Generation-stop cleanup should not cancel active storage progress.');
reportDirectiveStorageProgress({
  operationId: 'storage-write-index',
  phase: 'storageWriteStarted',
  status: 'running',
  operation: 'writeJson',
  logicalKey: 'indexes/saves.v1.json',
  path: '/user/files/directive-indexes-saves.v1.json'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Saving...');
assert.equal(activity.storageProgress.total, 2);
assert.equal(activity.storageProgress.stageCount, 2);
await new Promise((resolve) => setTimeout(resolve, 0));
const storageIndicator = globalThis.document.getElementById(__directiveTurnActivityTestHooks.DIRECTIVE_TURN_ACTIVITY_ID);
assert.equal(storageIndicator.querySelector('.directive-turn-activity-label').textContent, 'Saving...');
assert.deepEqual(
  storageIndicator.querySelectorAll('.directive-turn-activity-chip').map((chip) => chip.textContent),
  ['Campaign Save', 'Records']
);
reportDirectiveStorageProgress({
  operationId: 'storage-write-save',
  phase: 'storageWriteComplete',
  status: 'complete',
  operation: 'writeJson',
  logicalKey: 'saves/save-storage-visual.v1.json',
  path: '/user/files/directive-saves-save-storage-visual.v1.json'
});
reportDirectiveStorageProgress({
  operationId: 'storage-write-index',
  phase: 'storageWriteComplete',
  status: 'complete',
  operation: 'writeJson',
  logicalKey: 'indexes/saves.v1.json',
  path: '/user/files/directive-indexes-saves.v1.json'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Saving...');
assert.equal(activity.storageFiles.saving.status, 'settled');
assert.equal(activity.storageFiles.records.status, 'settled');
const firstStorageToken = activity.token;
reportDirectiveStorageProgress({
  operationId: 'storage-write-preferences',
  phase: 'storageWriteStarted',
  status: 'running',
  operation: 'writeJson',
  logicalKey: 'system/ui-preferences.v1.json',
  path: '/user/files/directive-system-ui-preferences.v1.json'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.token, firstStorageToken);
assert.equal(activity.label, 'Saving...');
assert.equal(activity.storageFiles.preferences.status, 'running');
assert.equal(__directiveTurnActivityTestHooks.activeCount(), 1);
assert.deepEqual(
  storageIndicator.querySelectorAll('.directive-turn-activity-chip').map((chip) => chip.textContent),
  ['Campaign Save', 'Records', 'Preferences']
);
reportDirectiveStorageProgress({
  operationId: 'storage-write-preferences',
  phase: 'storageWriteComplete',
  status: 'complete',
  operation: 'writeJson',
  logicalKey: 'system/ui-preferences.v1.json',
  path: '/user/files/directive-system-ui-preferences.v1.json'
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Saving...');
assert.equal(activity.storageFiles.preferences.status, 'settled');
await new Promise((resolve) => setTimeout(resolve, 1450));
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.label, 'Saved.');
assert.equal(activity.phase, 'storageComplete');
clearDirectiveTurnActivity(activity.token);

reportDirectiveStorageProgress({
  operationId: 'storage-write-fail',
  phase: 'storageWriteStarted',
  status: 'running',
  operation: 'writeJson',
  logicalKey: 'system/storage-index.v1.json',
  path: '/user/files/directive-system-storage-index.v1.json',
  delayMs: 0
});
reportDirectiveStorageProgress({
  operationId: 'storage-write-fail',
  phase: 'storageWriteFailed',
  status: 'failed',
  operation: 'writeJson',
  logicalKey: 'system/storage-index.v1.json',
  path: '/user/files/directive-system-storage-index.v1.json',
  error: {
    message: 'upload failed'
  }
});
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.mode, 'review');
assert.equal(activity.label, 'Storage update needs review.');
assert.equal(activity.storageFiles.indexing.status, 'review');
const storageReviewIndicator = globalThis.document.getElementById(__directiveTurnActivityTestHooks.DIRECTIVE_TURN_ACTIVITY_ID);
assert.equal(storageReviewIndicator.querySelector('.directive-turn-activity-actions').hidden, false);
assert.equal(
  storageReviewIndicator.querySelectorAll('.directive-turn-activity-action')[0].textContent,
  'Open Settings'
);
clearDirectiveTurnActivity(activity.token);

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
if (originalDocument === undefined) {
  delete globalThis.document;
} else {
  globalThis.document = originalDocument;
}

await registered.get('message-edited')({ id: 4, text: 'edited' });
await registered.get('message-updated')({ id: 4, extra: { sc_ghosted: true } });
await registered.get('message-deleted')(4);
__directiveEventTestHooks.rememberNativeDeleteIntent('16', { source: 'test-native-delete-button' });
await registered.get('message-deleted')(41);
await registered.get('chat-changed')({ chatId: 'chat-2' });
const intercepted = await globalThis.directiveGenerationInterceptor([], 4096, () => {}, 'normal');
assert.equal(intercepted.abortDefaultGeneration, true);
assert.deepEqual(calls.slice(callsBeforeSentObservation, callsBeforeSentObservation + 8).map((entry) => entry[0]), ['sent', 'generation-stopped', 'selected-swipe', 'edited', 'visibility', 'deleted', 'deleted', 'chat']);
assert.deepEqual(calls[callsBeforeSentObservation + 6], ['deleted', {
  hostMessageId: '16',
  source: 'test-native-delete-button',
  sillyTavernPayload: 41
}]);
assert.equal(calls.some((entry) => entry[0] === 'intercept'), true);

const originalSillyTavernForVisibilityFallback = globalThis.SillyTavern;
const visibilityFallbackContext = {
  chatId: 'visibility-fallback-chat',
  chat: []
};
globalThis.SillyTavern = {
  getContext: () => visibilityFallbackContext
};
try {
  __directiveEventTestHooks.resetUserMessageFallbackBaseline(visibilityFallbackContext);
  visibilityFallbackContext.chat.push({
    id: 'visibility-fallback-player',
    is_user: true,
    mes: 'Sam waited for her reply.'
  });
  const visibilityFallbackCallsBefore = calls.length;
  const primaryVisibilitySent = await registered.get('message-sent')({
    id: 'visibility-fallback-player',
    index: 0,
    message: visibilityFallbackContext.chat[0]
  });
  assert.equal(primaryVisibilitySent.scheduled, true);
  await registered.get('message-updated')({
    id: 'visibility-fallback-player',
    index: 0,
    extra: {
      sc_ghosted: true,
      stmb_hidden: true,
      vectfox_prompt_ghosted: true
    }
  });
  const visibilityFallbackScan = __directiveEventTestHooks.scanLatestUserMessageFallback(
    'visibility-dom-mutation',
    visibilityFallbackContext
  );
  assert.equal(
    visibilityFallbackScan.handled,
    false,
    'Visibility-only DOM mutation must not schedule a second normal player observation while the primary MESSAGE_SENT observation is pending.'
  );
  assert.equal(visibilityFallbackScan.reason, 'observation-pending');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(
    calls.slice(visibilityFallbackCallsBefore).map((entry) => entry[0]),
    ['visibility', 'sent'],
    'Visibility-only update should produce one visibility reconciliation and one primary sent observation, not a duplicate sent observation.'
  );

  visibilityFallbackContext.chatId = 'visibility-fallback-retry-chat';
  visibilityFallbackContext.chat = [];
  __directiveEventTestHooks.resetUserMessageFallbackBaseline(visibilityFallbackContext);
  visibilityFallbackContext.chat.push({
    id: 'visibility-fallback-retry-player',
    is_user: true,
    mes: 'Sam waited for her reply after the first observer missed the binding.'
  });
  const originalObserveHostPlayerMessage = app.observeHostPlayerMessage;
  let visibilityRetryAttempts = 0;
  app.observeHostPlayerMessage = async (payload) => {
    visibilityRetryAttempts += 1;
    calls.push(['sent-retry', payload]);
    return visibilityRetryAttempts === 1
      ? { handled: false, reason: 'inactive-or-unbound' }
      : { handled: true, abortDefaultGeneration: false };
  };
  try {
    const retryVisibilitySent = await registered.get('message-sent')({
      id: 'visibility-fallback-retry-player',
      index: 0,
      message: visibilityFallbackContext.chat[0]
    });
    assert.equal(retryVisibilitySent.scheduled, true);
    await new Promise((resolve) => setTimeout(resolve, 2800));
    assert.equal(visibilityRetryAttempts, 2, 'Primary observation retry should succeed once after the transient miss.');
    const retryVisibilityFallbackScan = __directiveEventTestHooks.scanLatestUserMessageFallback(
      'visibility-retry-dom-mutation',
      visibilityFallbackContext
    );
    assert.equal(
      retryVisibilityFallbackScan.handled,
      false,
      'Fallback scan must not reobserve a primary MESSAGE_SENT row after its retry succeeds.'
    );
    assert.equal(retryVisibilityFallbackScan.reason, 'already-observed');
  } finally {
    app.observeHostPlayerMessage = originalObserveHostPlayerMessage;
  }
} finally {
  if (originalSillyTavernForVisibilityFallback === undefined) {
    delete globalThis.SillyTavern;
  } else {
    globalThis.SillyTavern = originalSillyTavernForVisibilityFallback;
  }
}

const originalDocumentForHandoff = globalThis.document;
globalThis.document = createFakeDocument();
const handoffToken = markDirectiveTurnActivity({ delayMs: 0 });
updateDirectiveTurnActivity(handoffToken, {
  phase: 'delegatingHostGeneration',
  responseStrategy: 'injectAndContinue'
});
finishDirectiveTurnActivity(handoffToken);
activity = __directiveTurnActivityTestHooks.latestActivity();
assert.equal(activity.awaitingHostGeneration, true);
assert.equal(activity.label, 'Directive is handing the scene back to chat...');
assert.equal(__directiveTurnActivityTestHooks.activeCount(), 1);
nextInterceptResult = { handled: true, responseStrategy: 'injectAndContinue', abortDefaultGeneration: false };
const allowedNativeGeneration = await globalThis.directiveGenerationInterceptor([], 4096, () => {}, 'normal');
assert.equal(allowedNativeGeneration.abortDefaultGeneration, false);
await new Promise((resolve) => setTimeout(resolve, 180));
assert.equal(__directiveTurnActivityTestHooks.activeCount(), 0);
nextInterceptResult = { handled: true, abortDefaultGeneration: true };
if (originalDocumentForHandoff === undefined) {
  delete globalThis.document;
} else {
  globalThis.document = originalDocumentForHandoff;
}

await registered.get('extension-disabled')();
assert.equal(promptClearCount, 1);
const extensionDisableLensClear = calls.find((entry) => entry[0] === 'lens-clear');
assert.deepEqual(extensionDisableLensClear, ['lens-clear', { reason: 'extension-disabled' }]);
const extensionDisablePromptClear = calls.find((entry) => entry[0] === 'prompt-clear');
assert.equal(extensionDisablePromptClear[1].reason, 'extension-disabled');
assert.equal(extensionDisablePromptClear[1].lane, 'all');
assert.equal(extensionDisablePromptClear[1].preservePacket, undefined);
assert.equal(globalThis.directiveGenerationInterceptor, undefined);
assert.equal(getSillyTavernDirectiveRuntimeBridge().enabled, false);
assert.equal(registered.size, 0);
assert.equal(unregistered.length, 12);

clearSillyTavernDirectiveRuntimeBridge();
__directiveRuntimeActionTestHooks.clearRuntimeActions();

console.log('SillyTavern runtime lifecycle tests passed: manifest interceptor, message/edit/delete/chat events, fail-safe bridge routing, and disable cleanup');
