import { exposeGlobalBridge } from '../../extension/global-bridge.js';
import { refreshRuntimeSafely } from '../../extension/runtime-mount.js';
import { handleExtensionDisabled } from './shell-events.js';

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
