import { handleModelOutputLimitUiMessage } from '../../ui/model-output-limit-notification.js';
import { configureRuntimeApp } from '../../extension/runtime-mount.js';
import { createDirectiveRuntimeApp } from '../../runtime/runtime-app.mjs';
import { configureDirectiveOverlayRoot } from '../../ui/directive-overlay-root.js';
import { handleGameplayNotificationUiMessage } from '../../ui/gameplay-notification-center.js';
import {
  isDirectiveStartupRecoveryError,
  showDirectiveStartupRecoveryNotification,
} from '../../ui/startup-recovery-notification.js';
import {
  hideDirectiveRuntimePanel,
  openAnalysisCapacitySettings,
  runDirectivePresetStartupReminder,
} from '../../runtime/runtime-shell.js';
import { activateSillyTavernDirectiveRuntime } from './runtime-activation.mjs';
import { disposeBlankSendContinue } from './blank-send-continue.js';
import { disposeDirectiveLauncherButton } from './directive-launcher-button.js';
import { createSillyTavernDirectiveHost } from './host-factory.mjs';
import {
  removeDirectiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeBridge,
} from './runtime-bridge.mjs';
import { disposeSillyTavernDirectiveEventLifecycle } from './shell-events.js';
import { removeGlobalBridge } from '../../extension/global-bridge.js';

export function handleDirectiveUiMessage(message) {
  const result = handleModelOutputLimitUiMessage(message, { onOpenSettings: openAnalysisCapacitySettings });
  return result.handled ? result : handleGameplayNotificationUiMessage(message);
}

export function getSillyTavernContext() {
  try {
    return globalThis.SillyTavern?.getContext?.() || null;
  } catch (error) {
    console.error('[Directive] SillyTavern.getContext() failed:', error);
    return null;
  }
}

export async function bootstrapDirectiveExtension(options = {}) {
  const ctx = options.context || getSillyTavernContext();
  if (!ctx) {
    console.warn('[Directive] SillyTavern context unavailable; runtime shell not mounted.');
    return { ok: false, reason: 'missing-context' };
  }

  const hostFactory = options.hostFactory || createSillyTavernDirectiveHost;
  const appFactory = options.appFactory || createDirectiveRuntimeApp;
  const activateRuntime = options.activateRuntime || activateSillyTavernDirectiveRuntime;
  const host = hostFactory({
    context: ctx,
    ui: { send: handleDirectiveUiMessage }
  });
  configureDirectiveOverlayRoot({
    document: ctx.document || globalThis.document,
    resolveHost: (documentRef) => documentRef?.getElementById?.('sheld')
      || documentRef?.querySelector?.('#chat')?.parentElement
      || documentRef?.body
  });
  const app = appFactory({ host });
  try {
    await app.initialize();
  } catch (error) {
    if (!isDirectiveStartupRecoveryError(error)) throw error;
    configureRuntimeApp(null);
    setSillyTavernDirectiveRuntimeBridge({ app: null, turnOrchestrator: null, directiveHost: null, active: false });
    disposeSillyTavernDirectiveEventLifecycle();
    removeDirectiveGenerationInterceptor();
    removeGlobalBridge();
    disposeBlankSendContinue();
    disposeDirectiveLauncherButton();
    hideDirectiveRuntimePanel();
    const notice = showDirectiveStartupRecoveryNotification(error);
    host.logger?.error?.(`[Directive] ${notice.code}: ${notice.message}`);
    return { ok: false, reason: 'storage-recovery-required', errorCode: notice.code };
  }
  configureRuntimeApp(app);
  const turnOrchestrator = app.getChatTurnOrchestrator?.() || null;
  setSillyTavernDirectiveRuntimeBridge({ app, turnOrchestrator, directiveHost: host, active: true });
  await activateRuntime({ context: ctx });
  try {
    await runDirectivePresetStartupReminder({ app });
  } catch (error) {
    console.warn('[Directive] Directive preset startup reminder failed:', error);
  }
  console.log('[Directive] Extension initialized.');
  return { ok: true, hostId: host.id, chatNative: Boolean(turnOrchestrator) };
}
