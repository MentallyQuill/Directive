import { hasRuntimeAction, listRuntimeActions, runRuntimeAction } from '../runtime/runtime-actions.js';

let exposedBridge = null;
let exposedActions = null;

function getDirectiveNamespace() {
  if (!globalThis.Directive || typeof globalThis.Directive !== 'object') {
    globalThis.Directive = {};
  }
  return globalThis.Directive;
}

export function exposeGlobalBridge() {
  const namespace = getDirectiveNamespace();
  exposedActions = {
    has: hasRuntimeAction,
    list: listRuntimeActions,
    run: runRuntimeAction
  };
  exposedBridge = {
    showRuntime: () => runRuntimeAction('runtime.show'),
    hideRuntime: () => runRuntimeAction('runtime.hide'),
    refreshRuntime: () => runRuntimeAction('runtime.refresh'),
    runAction: runRuntimeAction,
    listActions: listRuntimeActions
  };
  namespace.actions = exposedActions;
  namespace.bridge = exposedBridge;
  return namespace;
}

export function removeGlobalBridge() {
  const namespace = globalThis.Directive;
  if (namespace && typeof namespace === 'object') {
    if (namespace.bridge === exposedBridge) delete namespace.bridge;
    if (namespace.actions === exposedActions) delete namespace.actions;
  }
  exposedBridge = null;
  exposedActions = null;
}
