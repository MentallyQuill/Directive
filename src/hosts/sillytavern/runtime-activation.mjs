import { exposeGlobalBridge } from '../../extension/global-bridge.js';
import { refreshRuntimeSafely } from '../../extension/runtime-mount.js';
import { installBlankSendContinue } from './blank-send-continue.js';
import { installDirectiveLauncherButton } from './directive-launcher-button.js';
import { wireEvents } from './shell-events.js';
import {
  installDirectiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeEnabled
} from './runtime-bridge.mjs';

function currentSillyTavernContext() {
  try {
    return globalThis.SillyTavern?.getContext?.() || null;
  } catch {
    return null;
  }
}

export async function activateSillyTavernDirectiveRuntime({ context = null } = {}) {
  const resolvedContext = context || currentSillyTavernContext();
  setSillyTavernDirectiveRuntimeEnabled(true);
  if (resolvedContext) wireEvents(resolvedContext);
  installDirectiveGenerationInterceptor();
  exposeGlobalBridge();
  installBlankSendContinue({ root: resolvedContext?.document || globalThis.document });
  installDirectiveLauncherButton();
  await refreshRuntimeSafely();
  return { enabled: true };
}
