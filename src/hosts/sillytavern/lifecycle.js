import { exposeGlobalBridge } from '../../extension/global-bridge.js';
import { refreshRuntimeSafely } from '../../extension/runtime-mount.js';
import { handleExtensionDisabled } from './shell-events.js';
import {
  installDirectiveGenerationInterceptor,
  setSillyTavernDirectiveRuntimeEnabled
} from './runtime-bridge.mjs';

export async function directiveOnInstall() {
  return { ok: true };
}

export async function directiveOnUpdate() {
  return refreshRuntimeSafely();
}

export async function directiveOnEnable() {
  setSillyTavernDirectiveRuntimeEnabled(true);
  installDirectiveGenerationInterceptor();
  exposeGlobalBridge();
  return refreshRuntimeSafely();
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
  setSillyTavernDirectiveRuntimeEnabled(true);
  installDirectiveGenerationInterceptor();
  exposeGlobalBridge();
  return refreshRuntimeSafely();
}
