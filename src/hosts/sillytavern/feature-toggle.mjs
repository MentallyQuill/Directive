import { exposeGlobalBridge } from '../../extension/global-bridge.js';
import { installExtensionsMenuButton } from '../../extension/menu-button.js';
import { refreshRuntimeSafely } from '../../extension/runtime-mount.js';
import { installExtensionsMenuDropdown } from '../../extension/settings-panel.js';
import { installDirectiveAssistButton } from './directive-assist-button.js';
import { installDirectiveMessageActions } from './message-actions.js';
import { installMissionComponentsCapture } from './mission-components-capture.js';
import { handleExtensionDisabled, wireEvents } from './shell-events.js';
import {
  installDirectiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeEnabled
} from './runtime-bridge.mjs';
import {
  isSillyTavernDirectiveEnabled,
  setSillyTavernDirectiveEnabledSetting
} from './settings-store.mjs';

function currentSillyTavernContext() {
  try {
    return globalThis.SillyTavern?.getContext?.() || null;
  } catch {
    return null;
  }
}

function resolveContext(context = null) {
  return context || currentSillyTavernContext();
}

function dropdownOptions(context, enabled) {
  return {
    directiveEnabled: enabled,
    onDirectiveEnabledChange: (nextEnabled) => setSillyTavernDirectiveFeatureEnabled(nextEnabled, {
      context
    })
  };
}

export function getSillyTavernDirectiveFeatureEnabled(context = null) {
  return isSillyTavernDirectiveEnabled(resolveContext(context));
}

export async function applySillyTavernDirectiveFeatureState({
  context = null,
  enabled = getSillyTavernDirectiveFeatureEnabled(context)
} = {}) {
  const resolvedContext = resolveContext(context);
  const active = enabled !== false;
  setSillyTavernDirectiveRuntimeEnabled(active);

  if (active) {
    if (resolvedContext) wireEvents(resolvedContext);
    installDirectiveGenerationInterceptor();
    exposeGlobalBridge();
    installDirectiveAssistButton();
    installDirectiveMessageActions({ context: resolvedContext });
    installMissionComponentsCapture();
  } else {
    await handleExtensionDisabled();
  }

  installExtensionsMenuButton({ directiveEnabled: active });
  installExtensionsMenuDropdown(dropdownOptions(resolvedContext, active));

  if (active) await refreshRuntimeSafely();
  return { enabled: active };
}

export async function setSillyTavernDirectiveFeatureEnabled(value, {
  context = null,
  persist = true
} = {}) {
  const resolvedContext = resolveContext(context);
  const enabled = persist
    ? setSillyTavernDirectiveEnabledSetting(value, resolvedContext)
    : value !== false;
  return applySillyTavernDirectiveFeatureState({
    context: resolvedContext,
    enabled
  });
}
