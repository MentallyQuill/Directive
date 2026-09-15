import assert from 'node:assert/strict';

import { createFakeChatAdapter, createFakeDirectiveHost, createFakeEventAdapter, createFakeJsonStorage } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { createNativeBranchRefusal } from '../../src/runtime/native-branch-refusal.mjs';
import { createV1CampaignSave, storeV1CampaignSave } from '../../src/storage/v1-storage-repository.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import { registerRuntimeAction } from '../../src/runtime/runtime-actions.js';
import { handleChatChanged, disposeSillyTavernDirectiveEventLifecycle } from '../../src/hosts/sillytavern/shell-events.js';
import { bootstrapDirectiveExtension } from '../../src/hosts/sillytavern/bootstrap.js';
import { getSillyTavernDirectiveRuntimeBridge } from '../../src/hosts/sillytavern/runtime-bridge.mjs';
import { resetDirectiveNotificationSurface } from '../../src/ui/directive-notification-surface.js';
import {
  directiveStartupRecoveryMessage,
  resetDirectiveStartupRecoveryNotification,
} from '../../src/ui/startup-recovery-notification.js';
import { installFakeDom } from './helpers/fake-dom.mjs';

const all = (root) => [root, ...root.children.flatMap(all)];
const document = installFakeDom();
const log = [];
let activated = false;
const error = new Error('raw internal failure with secret save.123 and v1/recovery/private.json');
error.code = 'DIRECTIVE_V1_MONOLITHIC_SAVE_UNRECOVERABLE';
error.details = { saveId: 'secret-save-id', recoveryPath: 'v1/recovery/private.json' };

const result = await bootstrapDirectiveExtension({
  context: { document },
  hostFactory: () => ({
    id: 'sillytavern',
    logger: { error: (message) => log.push(message) },
  }),
  appFactory: () => ({
    async initialize() { throw error; },
  }),
  activateRuntime: async () => { activated = true; },
});

assert.deepEqual(result, {
  ok: false,
  reason: 'storage-recovery-required',
  errorCode: 'DIRECTIVE_V1_MONOLITHIC_SAVE_UNRECOVERABLE',
});
assert.equal(activated, false, 'runtime activation must stop after a recovery failure');
assert.deepEqual(getSillyTavernDirectiveRuntimeBridge(), {
  runtimeApp: null,
  orchestrator: null,
  host: null,
  enabled: false,
});
const notification = document.querySelector('.directive-startup-recovery-notification');
assert.ok(notification, 'a persistent startup recovery notification must be mounted');
assert.equal(notification.getAttribute('role'), 'alert');
const text = all(notification).map((node) => node.textContent || '').join(' ');
assert.match(text, /Directive save needs attention/);
assert.match(text, /left unchanged/);
assert.match(text, /Back up the directive-v1 files/);
assert.match(text, /DIRECTIVE_V1_MONOLITHIC_SAVE_UNRECOVERABLE/);
assert.doesNotMatch(text, /secret-save-id|private\.json|raw internal failure/);
assert.equal(log.length, 1);
assert.doesNotMatch(log[0], /secret-save-id|private\.json|raw internal failure/);

assert.deepEqual(
  directiveStartupRecoveryMessage({ code: 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_INDEX_WRITE_FAILED' }),
  {
    code: 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_INDEX_WRITE_FAILED',
    message: 'Directive upgraded the older V1 save, but could not finish publishing its recovery verification record. Reload SillyTavern to retry safely before continuing.',
  },
  'post-migration provenance publication failures must not claim the save was left unchanged',
);

const dismiss = all(notification).find((node) => node.tagName === 'BUTTON');
await dismiss.click();
assert.equal(document.querySelector('.directive-startup-recovery-notification'), null);

resetDirectiveStartupRecoveryNotification('test-cleanup');
resetDirectiveNotificationSurface('test-cleanup');
// A native child opened while initialization is awaiting package data must show
// its restored refusal once UI activation finishes, without replaying a turn.
const startupAssets = loadAshesRuntimeAssets();
const startupStorage = createFakeJsonStorage();
const startupState = createAshesInitialState({ campaignId: 'campaign.startup-refusal', saveId: 'save.startup-parent', chatId: 'chat.startup-parent' });
startupState.campaignChatBinding = { ...startupState.campaignChatBinding,
  hostId: 'fake', entityType: 'character', entityId: '7', entityName: 'Startup Captain' };
await storeV1CampaignSave(startupStorage, createV1CampaignSave({ id: 'save.startup-parent', name: 'Startup parent', state: startupState, createdAt: '2026-09-14T12:00:00.000Z' }));
const startupChat = createFakeChatAdapter({ chatId: 'chat.startup-parent', entityId: '7', entityName: 'Startup Captain',
  messages: [{ id: 'opening', role: 'assistant', text: 'Opening.' }, { id: 'later', role: 'assistant', text: 'Later.' }] });
await startupChat.updateBindingMetadata(startupState.campaignChatBinding);
startupChat.createNativeBranch({ endpointIndex: 0, childChatId: 'chat.startup-refused' });
await startupChat.storeNativeBranchRefusal(createNativeBranchRefusal({ parentBinding: startupState.campaignChatBinding, childBinding: startupChat.getCurrentBinding() }));
startupChat.pushPlayerMessage({ text: 'Continue this branch.', hostMessageId: 'unaccepted.startup.draft' });
startupChat.setCurrentChatId('chat.startup-parent');
let releaseStartupAssets;
let reportStartupWaiting;
const startupWaiting = new Promise(resolve => { reportStartupWaiting = resolve; });
const startupAssetsHeld = new Promise(resolve => { releaseStartupAssets = resolve; });
let startupApp;
let startupHost;
registerRuntimeAction('runtime.refresh', () => ({ refreshed: true }), { replace: true });
const startupAuthorityBefore = startupStorage.snapshot();
const starting = bootstrapDirectiveExtension({
  context: { document, eventSource: createFakeEventAdapter(), eventTypes: {} },
  hostFactory: ({ ui }) => (startupHost = createFakeDirectiveHost({ chatNative: true, chat: startupChat, storage: startupStorage, ui })),
  appFactory: ({ host }) => (startupApp = createDirectiveRuntimeApp({ host,
    packageLoader: async () => { reportStartupWaiting(); await startupAssetsHeld; return structuredClone(startupAssets); } })),
});
await startupWaiting;
startupChat.setCurrentChatId('chat.startup-refused');
releaseStartupAssets();
const started = await starting;
assert.equal(started.ok, true);
assert.equal(startupApp.isCurrentChatBound(), false);
assert.equal((await startupApp.getChatTurnOrchestrator().interceptGeneration()).abortDefaultGeneration, true);
assert.ok(document.querySelector('.branch-history-dialog-overlay'), 'activation must present refusal found before shell listeners were installed');
assert.equal(startupHost.generation.calls().length, 0, 'presenting startup refusal must not replay generation');
assert.deepEqual(startupStorage.snapshot(), startupAuthorityBefore, 'startup UI delivery must not write campaign authority');

startupChat.setCurrentChatId('chat.ordinary-between-reconciliations');
await handleChatChanged();
assert.equal(document.querySelector('.branch-history-dialog-overlay'), null);
startupChat.setCurrentChatId('chat.startup-refused');
// This is the direct call used by scheduleDeferredInternalChatChange; no shell
// handler consumes its return value, so the runtime must deliver the UI result.
await startupApp.handleHostChatChanged({ deferredDirectiveHostChange: true });
assert.ok(document.querySelector('.branch-history-dialog-overlay'), 'later deferred reconciliation must deliver its refusal without a shell return-value consumer');
startupChat.setCurrentChatId('chat.ordinary-after-reconciliation');
await handleChatChanged();
assert.equal(document.querySelector('.branch-history-dialog-overlay'), null);
assert.equal((await startupApp.getChatTurnOrchestrator().interceptGeneration()).handled, false);
disposeSillyTavernDirectiveEventLifecycle();

console.log('PASS SillyTavern startup recovery notification');
