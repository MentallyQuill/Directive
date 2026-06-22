import { exposeGlobalBridge } from '../../extension/global-bridge.js';
import { installExtensionsMenuButton } from '../../extension/menu-button.js';
import { configureRuntimeApp } from '../../extension/runtime-mount.js';
import { installExtensionsMenuDropdown } from '../../extension/settings-panel.js';
import { createDirectiveRuntimeApp } from '../../runtime/runtime-app.mjs';
import { installDirectiveAssistButton } from './directive-assist-button.js';
import { createSillyTavernDirectiveHost } from './host-factory.mjs';
import { installDirectiveMessageActions } from './message-actions.js';
import {
  installDirectiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeBridge
} from './runtime-bridge.mjs';
import { wireEvents } from './shell-events.js';

export function getSillyTavernContext() {
  try {
    return globalThis.SillyTavern?.getContext?.() || null;
  } catch (error) {
    console.error('[Directive] SillyTavern.getContext() failed:', error);
    return null;
  }
}

export async function bootstrapDirectiveExtension() {
  const ctx = getSillyTavernContext();
  if (!ctx) {
    console.warn('[Directive] SillyTavern context unavailable; runtime shell not mounted.');
    return { ok: false, reason: 'missing-context' };
  }

  const host = createSillyTavernDirectiveHost({ context: ctx });
  const app = createDirectiveRuntimeApp({ host });
  configureRuntimeApp(app);
  await app.initialize();
  const turnOrchestrator = app.getChatTurnOrchestrator?.() || null;
  setSillyTavernDirectiveRuntimeBridge({ app, turnOrchestrator, directiveHost: host, active: true });
  installDirectiveGenerationInterceptor();
  wireEvents(ctx);
  installExtensionsMenuButton();
  installDirectiveAssistButton();
  installDirectiveMessageActions({ context: ctx });
  installExtensionsMenuDropdown();
  exposeGlobalBridge();
  console.log('[Directive] Extension initialized.');
  return { ok: true, hostId: host.id, chatNative: Boolean(turnOrchestrator) };
}
