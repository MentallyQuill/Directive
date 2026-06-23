import { configureRuntimeApp } from '../../extension/runtime-mount.js';
import { createDirectiveRuntimeApp } from '../../runtime/runtime-app.mjs';
import {
  applySillyTavernDirectiveFeatureState,
  getSillyTavernDirectiveFeatureEnabled
} from './feature-toggle.mjs';
import { createSillyTavernDirectiveHost } from './host-factory.mjs';
import { setSillyTavernDirectiveRuntimeBridge } from './runtime-bridge.mjs';
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
  const directiveEnabled = getSillyTavernDirectiveFeatureEnabled(ctx);
  setSillyTavernDirectiveRuntimeBridge({ app, turnOrchestrator, directiveHost: host, active: directiveEnabled });
  wireEvents(ctx);
  await applySillyTavernDirectiveFeatureState({ context: ctx, enabled: directiveEnabled });
  console.log(`[Directive] Extension initialized${directiveEnabled ? '' : ' (disabled by Directive dropdown)'}.`);
  return { ok: true, hostId: host.id, chatNative: Boolean(turnOrchestrator), directiveEnabled };
}
