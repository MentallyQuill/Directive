import { bootstrapDirectiveExtension } from './bootstrap.js';
import { configureRuntimeActions } from './runtime-mount.js';
import { __directiveEventTestHooks } from './events.js';

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
