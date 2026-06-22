import { bootstrapDirectiveExtension } from '../hosts/sillytavern/bootstrap.js';
import { configureRuntimeActions } from './runtime-mount.js';
import { __directiveEventTestHooks } from '../hosts/sillytavern/shell-events.js';
import { installDirectiveGenerationInterceptor } from '../hosts/sillytavern/runtime-bridge.mjs';

export {
  directiveOnInstall,
  directiveOnUpdate,
  directiveOnEnable,
  directiveOnDisable,
  directiveOnDelete,
  directiveOnClean,
  directiveOnActivate
} from './lifecycle.js';

configureRuntimeActions();
installDirectiveGenerationInterceptor();

function onDocumentReady(handler) {
  if (typeof document === 'undefined') return;
  if (typeof globalThis.$ === 'function') {
    globalThis.$(document).ready(handler);
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handler, { once: true });
    return;
  }
  handler();
}

onDocumentReady(async () => {
  await bootstrapDirectiveExtension();
});

export const __directiveTestHooks = __directiveEventTestHooks;
