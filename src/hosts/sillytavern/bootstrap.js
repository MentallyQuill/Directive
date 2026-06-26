import { configureRuntimeApp } from '../../extension/runtime-mount.js';
import { createDirectiveRuntimeApp } from '../../runtime/runtime-app.mjs';
import { configureDirectiveOverlayRoot } from '../../ui/directive-overlay-root.js';
import {
  runDirectiveGuidanceStartupOffer,
  runDirectivePresetStartupReminder
} from '../../runtime/runtime-shell.js';
import {
  applySillyTavernDirectiveFeatureState,
  getSillyTavernDirectiveFeatureEnabled
} from './feature-toggle.mjs';
import { createSillyTavernDirectiveHost } from './host-factory.mjs';
import { setSillyTavernDirectiveRuntimeBridge } from './runtime-bridge.mjs';

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
  configureDirectiveOverlayRoot({
    document: ctx.document || globalThis.document,
    resolveHost: (documentRef) => documentRef?.getElementById?.('sheld')
      || documentRef?.querySelector?.('#chat')?.parentElement
      || documentRef?.body
  });
  const app = createDirectiveRuntimeApp({ host });
  configureRuntimeApp(app);
  await app.initialize();
  const turnOrchestrator = app.getChatTurnOrchestrator?.() || null;
  const directiveEnabled = getSillyTavernDirectiveFeatureEnabled(ctx);
  setSillyTavernDirectiveRuntimeBridge({ app, turnOrchestrator, directiveHost: host, active: directiveEnabled });
  await applySillyTavernDirectiveFeatureState({ context: ctx, enabled: directiveEnabled });
  if (directiveEnabled) {
    let presetReminder = null;
    try {
      presetReminder = await runDirectivePresetStartupReminder({ app });
    } catch (error) {
      console.warn('[Directive] Directive preset startup reminder failed:', error);
    }
    if (!presetReminder?.shown) {
      try {
        await runDirectiveGuidanceStartupOffer();
      } catch (error) {
        console.warn('[Directive] Directive guidance startup offer failed:', error);
      }
    }
  }
  console.log(`[Directive] Extension initialized${directiveEnabled ? '' : ' (disabled by Directive dropdown)'}.`);
  return { ok: true, hostId: host.id, chatNative: Boolean(turnOrchestrator), directiveEnabled };
}
