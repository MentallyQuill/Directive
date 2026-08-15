import { runRuntimeAction } from '../../runtime/runtime-actions.js';
import { removeGlobalBridge } from '../../extension/global-bridge.js';
import { closeAllDirectiveOverlays } from '../../ui/directive-overlay-root.js';
import { closeSettlementRetryDialog } from '../../ui/settlement-retry-dialog.js';
import { resetGameplayNotifications } from '../../ui/gameplay-notification-center.js';
import { createPreviousTimelineNameDialog } from '../../ui/timeline-dialogs.js';
import { createSillyTavernEventAdapter } from './events-adapter.mjs';
import { disposeBlankSendContinue } from './blank-send-continue.js';
import { disposeDirectiveLauncherButton } from './directive-launcher-button.js';
import {
  cancelActiveDirectiveTurnActivities,
  disposeDirectiveTurnActivity,
  finishDirectiveTurnActivity,
  markDirectiveTurnActivity
} from './turn-activity-indicator.js';
import {
  getSillyTavernDirectiveRuntimeBridge,
  removeDirectiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeEnabled
} from './runtime-bridge.mjs';

let lifecycle = null;
let deleteIntent = null;
let nativeBranchIntent = null;
let deleteCapture = null;
const editedUpdateMarkers = new Map();
const EDITED_UPDATE_MARKER_TTL_MS = 10000;

function enabled() {
  return getSillyTavernDirectiveRuntimeBridge().enabled !== false;
}

function app() {
  return getSillyTavernDirectiveRuntimeBridge().runtimeApp;
}

function report(label, error) {
  console.warn(`[Directive] ${label}:`, error);
}

function hostMessageKey(payload) {
  const id = payload && typeof payload === 'object'
    ? payload.hostMessageId
      ?? payload.messageId
      ?? payload.mesid
      ?? payload.id
      ?? payload.message?.hostMessageId
      ?? payload.message?.messageId
      ?? payload.message?.id
    : payload;
  const normalizedId = String(id ?? '').trim();
  if (!normalizedId) return '';
  const chatId = String(getSillyTavernDirectiveRuntimeBridge().host?.chat?.getCurrentChatId?.() ?? '').trim();
  return `${chatId}\u0000${normalizedId}`;
}

function markEditedUpdate(payload) {
  const key = hostMessageKey(payload);
  if (key) editedUpdateMarkers.set(key, Date.now() + EDITED_UPDATE_MARKER_TTL_MS);
}

function consumeEditedUpdate(payload) {
  const now = Date.now();
  for (const [key, expiresAt] of editedUpdateMarkers) {
    if (expiresAt <= now) editedUpdateMarkers.delete(key);
  }
  const key = hostMessageKey(payload);
  if (!key || !editedUpdateMarkers.has(key)) return false;
  editedUpdateMarkers.delete(key);
  return true;
}

function scheduleReconciliation(label, task) {
  Promise.resolve()
    .then(task)
    .catch((error) => report(label, error));
  return { handled: true, scheduled: true, abortDefaultGeneration: false };
}

function register(adapter, names, handler, disposers) {
  const seen = new Set();
  for (const name of names.filter(Boolean)) {
    if (seen.has(name)) continue;
    seen.add(name);
    disposers.push(adapter.on(name, handler));
  }
}

function captureDeleteIntent(event) {
  const row = event?.target?.closest?.('.mes_edit_delete')?.closest?.('.mes[mesid]');
  const hostMessageId = String(row?.getAttribute?.('mesid') ?? '').trim();
  if (hostMessageId) deleteIntent = { hostMessageId, capturedAt: Date.now() };
}

function captureNativeBranchIntent(event) {
  const row = event?.target?.closest?.('.mes_create_branch')?.closest?.('.mes[mesid]');
  const endpointHostMessageId = String(row?.getAttribute?.('mesid') ?? '').trim();
  const parentChatId = String(getSillyTavernDirectiveRuntimeBridge().host?.chat?.getCurrentChatId?.() ?? '').trim();
  if (!endpointHostMessageId || !parentChatId) return;
  nativeBranchIntent = {
    kind: 'directive.nativeBranchIntent.v1',
    parentChatId,
    endpointHostMessageId,
    capturedAt: Date.now()
  };
}

function installDeleteCapture(root = globalThis.document) {
  disposeDeleteCapture();
  if (!root?.addEventListener) return false;
  root.addEventListener('pointerdown', captureDeleteIntent, true);
  root.addEventListener('pointerdown', captureNativeBranchIntent, true);
  root.addEventListener('click', captureNativeBranchIntent, true);
  deleteCapture = root;
  return true;
}

function disposeDeleteCapture() {
  deleteCapture?.removeEventListener?.('pointerdown', captureDeleteIntent, true);
  deleteCapture?.removeEventListener?.('pointerdown', captureNativeBranchIntent, true);
  deleteCapture?.removeEventListener?.('click', captureNativeBranchIntent, true);
  deleteCapture = null;
  deleteIntent = null;
  nativeBranchIntent = null;
  editedUpdateMarkers.clear();
}

function payloadWithDeleteIntent(payload) {
  const intent = deleteIntent;
  deleteIntent = null;
  if (!intent || Date.now() - intent.capturedAt > 10000) return payload;
  return { hostMessageId: intent.hostMessageId, sillyTavernPayload: payload };
}

function payloadWithNativeBranchIntent(payload) {
  const intent = nativeBranchIntent;
  if (!intent || Date.now() - intent.capturedAt > 10000) {
    nativeBranchIntent = null;
    return payload;
  }
  const currentChatId = String(getSillyTavernDirectiveRuntimeBridge().host?.chat?.getCurrentChatId?.() ?? '').trim();
  if (!currentChatId || currentChatId === intent.parentChatId) return payload;
  nativeBranchIntent = null;
  const base = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : { sillyTavernPayload: payload };
  return { ...base, nativeBranchIntent: intent };
}

export function handlePlayerMessage(payload = {}) {
  if (!enabled()) return { handled: false, reason: 'extension-disabled' };
  const token = markDirectiveTurnActivity({ label: 'Directive is reading your post...', phase: 'reading' });
  Promise.resolve(app()?.observeHostPlayerMessage?.(payload))
    .catch((error) => report('Accepted-pair settlement failed', error))
    .finally(() => finishDirectiveTurnActivity(token));
  return { handled: true, scheduled: true, abortDefaultGeneration: false };
}

export function handleMessageEdited(payload = {}) {
  if (!enabled()) return { handled: false, reason: 'extension-disabled' };
  markEditedUpdate(payload);
  return scheduleReconciliation(
    'Edited-message reconciliation failed',
    () => app()?.handleHostMessageEdited?.(payload)
  );
}

export function handleMessageVisibilityChanged(payload = {}) {
  if (!enabled()) return { handled: false, reason: 'extension-disabled' };
  if (consumeEditedUpdate(payload)) {
    return { handled: true, scheduled: false, reason: 'paired-edit-update' };
  }
  return scheduleReconciliation(
    'Message-visibility reconciliation failed',
    () => app()?.handleHostMessageVisibilityChanged?.(payload)
  );
}

export async function handleMessageDeleted(payload = {}) {
  if (!enabled()) return { handled: false, reason: 'extension-disabled' };
  return app()?.handleHostMessageDeleted?.(payloadWithDeleteIntent(payload));
}

export async function handleMessageSelectedSwipeChanged(payload = {}) {
  if (!enabled()) return { handled: false, reason: 'extension-disabled' };
  return app()?.handleHostMessageSelectedSwipeChanged?.(payload);
}

export async function handleGenerationStopped(payload = {}) {
  if (!enabled()) return { handled: false, reason: 'extension-disabled' };
  const cancelResult = await app()?.handleHostGenerationStopped?.({ ...payload, reason: 'host-generation-stopped' });
  return {
    handled: true,
    abortDefaultGeneration: false,
    cancelResult,
    activityResult: cancelActiveDirectiveTurnActivities()
  };
}

export function handleGenerationEnded(payload = {}) {
  if (!enabled()) return { handled: false, reason: 'extension-disabled' };
  return scheduleReconciliation(
    'Post-narration Directive work failed',
    () => app()?.handleHostGenerationEnded?.(payload)
  );
}

export async function handleChatChanged(payload = {}) {
  if (!enabled()) return { refreshed: false, reason: 'extension-disabled' };
  const changed = await app()?.handleHostChatChanged?.(payloadWithNativeBranchIntent(payload));
  const fork = changed?.timelineFork;
  let refreshResult;
  try {
    refreshResult = await runRuntimeAction('runtime.refresh');
  } catch (error) {
    report('Runtime refresh after chat change failed', error);
    refreshResult = { refreshed: false, error: error?.message || String(error) };
  }
  if (fork && new Set(['activated', 'recovered']).has(fork.status) && fork.savedGameId && fork.suggestedName) {
    createPreviousTimelineNameDialog({
      savedGameId: fork.savedGameId,
      suggestedName: fork.suggestedName,
      onRename: async (options) => {
        try {
          await app()?.renameSavedGame?.(options);
          await runRuntimeAction('runtime.refresh');
        } catch (error) {
          report('Previous timeline rename failed', error);
        }
      }
    });
  }
  return { ...refreshResult, timelineFork: fork || null };
}

export function disposeSillyTavernDirectiveEventLifecycle() {
  lifecycle?.dispose?.();
  lifecycle = null;
  disposeDeleteCapture();
}

export async function handleExtensionDisabled() {
  setSillyTavernDirectiveRuntimeEnabled(false);
  resetGameplayNotifications('extension-disabled');
  closeSettlementRetryDialog('extension-disabled');
  try {
    await getSillyTavernDirectiveRuntimeBridge().host?.presets?.restoreNarrationPreset?.();
  } catch (error) {
    report('Preset restore during disable failed', error);
  }
  try {
    await app()?.clearDirectivePrompt?.({ reason: 'extension-disabled' });
  } catch (error) {
    report('Prompt clear during disable failed', error);
  }
  try { runRuntimeAction('runtime.hide'); } catch {}
  removeDirectiveGenerationInterceptor();
  removeGlobalBridge();
  disposeBlankSendContinue();
  disposeDirectiveLauncherButton();
  disposeDirectiveTurnActivity();
  disposeSillyTavernDirectiveEventLifecycle();
  closeAllDirectiveOverlays('extension-disabled');
}

export function wireEvents(context) {
  if (!context) return false;
  disposeSillyTavernDirectiveEventLifecycle();
  installDeleteCapture(context.document || globalThis.document);
  const adapter = createSillyTavernEventAdapter({ context });
  const events = context.eventTypes || context.event_types || {};
  const disposers = [];
  register(adapter, [events.CHAT_CHANGED || 'CHAT_CHANGED'], handleChatChanged, disposers);
  register(adapter, [
    events.MESSAGE_SENT,
    events.USER_MESSAGE_SENT,
    events.USER_MESSAGE_RENDERED,
    'MESSAGE_SENT'
  ], handlePlayerMessage, disposers);
  register(adapter, [events.MESSAGE_EDITED || 'MESSAGE_EDITED'], handleMessageEdited, disposers);
  register(adapter, [events.MESSAGE_UPDATED || 'MESSAGE_UPDATED'], handleMessageVisibilityChanged, disposers);
  register(adapter, [events.MESSAGE_SWIPED || 'MESSAGE_SWIPED'], handleMessageSelectedSwipeChanged, disposers);
  register(adapter, [events.MESSAGE_DELETED, events.MESSAGE_REMOVED, 'MESSAGE_DELETED'], handleMessageDeleted, disposers);
  register(adapter, [events.GENERATION_STOPPED || 'GENERATION_STOPPED'], handleGenerationStopped, disposers);
  register(adapter, [events.GENERATION_ENDED || 'GENERATION_ENDED'], handleGenerationEnded, disposers);
  register(adapter, [events.EXTENSION_DISABLED, events.EXTENSION_DISABLE, 'EXTENSION_DISABLED'], handleExtensionDisabled, disposers);
  lifecycle = {
    dispose() {
      for (const dispose of [...disposers].reverse()) {
        try { dispose(); } catch (error) { report('Event handler disposal failed', error); }
      }
      disposers.length = 0;
    }
  };
  return disposers.length > 0;
}

export const __directiveEventTestHooks = Object.freeze({
  wireEvents,
  handlePlayerMessage,
  handleMessageEdited,
  handleMessageVisibilityChanged,
  handleMessageDeleted,
  handleMessageSelectedSwipeChanged,
  handleGenerationStopped,
  handleGenerationEnded,
  handleChatChanged,
  handleExtensionDisabled,
  disposeSillyTavernDirectiveEventLifecycle,
  captureDeleteIntent,
  payloadWithDeleteIntent,
  captureNativeBranchIntent,
  payloadWithNativeBranchIntent
});
