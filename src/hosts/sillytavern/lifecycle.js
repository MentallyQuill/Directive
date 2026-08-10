import { exposeGlobalBridge } from '../../extension/global-bridge.js';
import { refreshRuntimeSafely } from '../../extension/runtime-mount.js';
import { activateSillyTavernDirectiveRuntime } from './runtime-activation.mjs';
import { handleExtensionDisabled } from './shell-events.js';

export async function directiveOnInstall() {
  return { ok: true };
}

export async function directiveOnUpdate() {
  return refreshRuntimeSafely();
}

export async function directiveOnEnable() {
  exposeGlobalBridge();
  return activateSillyTavernDirectiveRuntime();
}

export async function directiveOnDisable() {
  await handleExtensionDisabled();
  return { ok: true };
}

export async function directiveOnDelete() {
  await handleExtensionDisabled();
  return { ok: true };
}

export async function directiveOnClean() {
  await handleExtensionDisabled();
  return { ok: true };
}

export async function directiveOnActivate() {
  exposeGlobalBridge();
  return activateSillyTavernDirectiveRuntime();
}
