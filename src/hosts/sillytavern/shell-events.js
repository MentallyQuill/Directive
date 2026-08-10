import { runRuntimeAction } from '../../runtime/runtime-actions.js';
import { removeGlobalBridge } from '../../extension/global-bridge.js';
import { closeAllDirectiveOverlays } from '../../ui/directive-overlay-root.js';
import { createSillyTavernEventAdapter } from './events-adapter.mjs';
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
let deleteCapture = null;

function enabled() {
  return getSillyTavernDirectiveRuntimeBridge().enabled !== false;
}

function app() {
  return getSillyTavernDirectiveRuntimeBridge().runtimeApp;
}

function report(label, error) {
  console.warn(`[Directive] ${label}:`, error);
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

function installDeleteCapture(root = globalThis.document) {
  disposeDeleteCapture();
  if (!root?.addEventListener) return false;
  root.addEventListener('pointerdown', captureDeleteIntent, true);
  deleteCapture = root;
  return true;
}

function disposeDeleteCapture() {
  deleteCapture?.removeEventListener?.('pointerdown', captureDeleteIntent, true);
  deleteCapture = null;
  deleteIntent = null;
}

function payloadWithDeleteIntent(payload) {
  const intent = deleteIntent;
  deleteIntent = null;
  if (!intent || Date.now() - intent.capturedAt > 10000) return payload;
  return { hostMessageId: intent.hostMessageId, sillyTavernPayload: payload };
}

export function handlePlayerMessage(payload = {}) {
  if (!enabled()) return { handled: false, reason: 'extension-disabled' };
  const token = markDirectiveTurnActivity({ label: 'Directive is reading your post...', phase: 'reading' });
  Promise.resolve(app()?.observeHostPlayerMessage?.(payload))
    .catch((error) => report('Accepted-pair settlement failed', error))
    .finally(() => finishDirectiveTurnActivity(token));
  return { handled: true, scheduled: true, abortDefaultGeneration: false };
}

export async function handleMessageEdited(payload = {}) {
  if (!enabled()) return { handled: false, reason: 'extension-disabled' };
  return app()?.handleHostMessageEdited?.(payload);
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

export async function handleChatChanged(payload = {}) {
  if (!enabled()) return { refreshed: false, reason: 'extension-disabled' };
  await app()?.handleHostChatChanged?.(payload);
  try {
    return await runRuntimeAction('runtime.refresh');
  } catch (error) {
    report('Runtime refresh after chat change failed', error);
    return { refreshed: false, error: error?.message || String(error) };
  }
}

export function disposeSillyTavernDirectiveEventLifecycle() {
  lifecycle?.dispose?.();
  lifecycle = null;
  disposeDeleteCapture();
}

export async function handleExtensionDisabled() {
  setSillyTavernDirectiveRuntimeEnabled(false);
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
  register(adapter, [events.MESSAGE_SWIPED || 'MESSAGE_SWIPED'], handleMessageSelectedSwipeChanged, disposers);
  register(adapter, [events.MESSAGE_DELETED, events.MESSAGE_REMOVED, 'MESSAGE_DELETED'], handleMessageDeleted, disposers);
  register(adapter, [events.GENERATION_STOPPED || 'GENERATION_STOPPED'], handleGenerationStopped, disposers);
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
  handleMessageDeleted,
  handleMessageSelectedSwipeChanged,
  handleGenerationStopped,
  handleChatChanged,
  handleExtensionDisabled,
  disposeSillyTavernDirectiveEventLifecycle,
  captureDeleteIntent,
  payloadWithDeleteIntent
});
