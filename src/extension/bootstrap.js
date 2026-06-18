import { exposeGlobalBridge } from './global-bridge.js';
import { installExtensionsMenuButton } from './menu-button.js';
import { wireEvents } from './events.js';
import { configureRuntimeApp } from './runtime-mount.js';
import { createDirectiveRuntimeApp } from '../runtime/runtime-app.mjs';

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
  configureRuntimeApp(createDirectiveRuntimeApp());
  installExtensionsMenuButton();
  exposeGlobalBridge();
  console.log('[Directive] Extension initialized.');
  return { ok: true };
}
