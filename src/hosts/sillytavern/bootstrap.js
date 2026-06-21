import { exposeGlobalBridge } from '../../extension/global-bridge.js';
import { installExtensionsMenuButton } from '../../extension/menu-button.js';
import { configureRuntimeApp } from '../../extension/runtime-mount.js';
import { installExtensionsMenuDropdown } from '../../extension/settings-panel.js';
import { createDirectiveRuntimeApp } from '../../runtime/runtime-app.mjs';
import { installDirectiveAssistButton } from './directive-assist-button.js';
import { createSillyTavernDirectiveHost } from './host-factory.mjs';
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

  wireEvents(ctx);
  const host = createSillyTavernDirectiveHost({ context: ctx });
  configureRuntimeApp(createDirectiveRuntimeApp({ host }));
  installExtensionsMenuButton();
  installDirectiveAssistButton();
  installExtensionsMenuDropdown();
  exposeGlobalBridge();
  console.log('[Directive] Extension initialized.');
  return { ok: true };
}
