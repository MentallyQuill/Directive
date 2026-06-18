import { handleExtensionDisabled } from './events.js';
import { exposeGlobalBridge } from './global-bridge.js';
import { refreshRuntimeSafely } from './runtime-mount.js';

export async function directiveOnInstall() {
  return { ok: true };
}

export async function directiveOnUpdate() {
  return refreshRuntimeSafely();
}

export async function directiveOnEnable() {
  exposeGlobalBridge();
  return refreshRuntimeSafely();
}

export async function directiveOnDisable() {
  handleExtensionDisabled();
  return { ok: true };
}

export async function directiveOnDelete() {
  handleExtensionDisabled();
  return { ok: true };
}

export async function directiveOnClean() {
  handleExtensionDisabled();
  return { ok: true };
}

export async function directiveOnActivate() {
  exposeGlobalBridge();
  return refreshRuntimeSafely();
}
