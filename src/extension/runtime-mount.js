import {
  hideDirectiveRuntimePanel,
  refreshDirectiveRuntimePanel,
  resetDirectiveRuntimeLayout,
  runCampaignIntroRewriteFromRuntime,
  runDirectiveAssistFromRuntime,
  runSceneReconciliationFromRuntime,
  setDirectiveRuntimeApp,
  setDirectiveRuntimeTab,
  showDirectiveRuntimePanel,
  toggleDirectiveRuntimeDrawer,
  toggleDirectiveRuntimeFullscreen
} from '../runtime/runtime-shell.js';
import { registerRuntimeActions, runRuntimeAction } from '../runtime/runtime-actions.js';
import { SCENE_RECONCILIATION_ACTION_IDS } from '../runtime/scene-reconciliation.mjs';

export function configureRuntimeActions() {
  registerRuntimeActions([
    {
      id: 'runtime.show',
      category: 'runtime',
      label: 'Show Directive command spine',
      handler: async () => showDirectiveRuntimePanel()
    },
    {
      id: 'runtime.hide',
      category: 'runtime',
      label: 'Hide Directive command spine',
      handler: () => hideDirectiveRuntimePanel()
    },
    {
      id: 'runtime.refresh',
      category: 'runtime',
      label: 'Refresh Directive drawer',
      handler: async () => refreshDirectiveRuntimePanel()
    },
    {
      id: 'runtime.open',
      category: 'runtime',
      label: 'Open Directive command spine',
      handler: async () => showDirectiveRuntimePanel()
    },
    {
      id: 'runtime.toggle',
      category: 'runtime',
      label: 'Toggle Directive command spine',
      handler: async () => {
        const panel = typeof document !== 'undefined'
          ? document.getElementById('directive-runtime-panel')
          : null;
        if (panel && panel.hidden !== true) {
          return hideDirectiveRuntimePanel();
        }
        return showDirectiveRuntimePanel();
      }
    },
    {
      id: 'runtime.setTab',
      category: 'runtime',
      label: 'Open Directive route drawer',
      handler: async ({ tabId } = {}) => setDirectiveRuntimeTab(tabId)
    },
    {
      id: 'runtime.toggleDrawer',
      category: 'runtime',
      label: 'Toggle Directive route drawer',
      handler: async ({ tabId } = {}) => toggleDirectiveRuntimeDrawer(tabId)
    },
    {
      id: 'runtime.toggleFullscreen',
      category: 'runtime',
      label: 'Toggle Directive full-screen workspace',
      handler: ({ fullscreen } = {}) => toggleDirectiveRuntimeFullscreen(fullscreen)
    },
    {
      id: 'runtime.resetLayout',
      category: 'runtime',
      label: 'Reset Directive shelf layout',
      handler: async () => resetDirectiveRuntimeLayout()
    },
    {
      id: 'ui.refresh',
      category: 'ui',
      label: 'Refresh Directive UI',
      handler: async () => refreshDirectiveRuntimePanel()
    },
    {
      id: 'assist.run',
      category: 'assist',
      label: 'Run Directive Assist',
      handler: async (payload = {}) => runDirectiveAssistFromRuntime(payload)
    },
    {
      id: 'campaignIntro.rewrite',
      category: 'campaign',
      label: 'Rewrite Campaign Intro',
      handler: async (payload = {}) => runCampaignIntroRewriteFromRuntime(payload)
    },
    {
      id: SCENE_RECONCILIATION_ACTION_IDS.reconcileMessage,
      category: 'reconciliation',
      label: 'Reconcile This Message',
      handler: async (payload = {}) => runSceneReconciliationFromRuntime('reconcileMessage', payload)
    },
    {
      id: SCENE_RECONCILIATION_ACTION_IDS.setStart,
      category: 'reconciliation',
      label: 'Set Reconciliation Start',
      handler: async (payload = {}) => runSceneReconciliationFromRuntime('setStart', payload)
    },
    {
      id: SCENE_RECONCILIATION_ACTION_IDS.setEnd,
      category: 'reconciliation',
      label: 'Set Reconciliation End',
      handler: async (payload = {}) => runSceneReconciliationFromRuntime('setEnd', payload)
    },
    {
      id: SCENE_RECONCILIATION_ACTION_IDS.reconcileFromHere,
      category: 'reconciliation',
      label: 'Reconcile From Here',
      handler: async (payload = {}) => runSceneReconciliationFromRuntime('reconcileFromHere', payload)
    },
    {
      id: SCENE_RECONCILIATION_ACTION_IDS.recalculateFromHere,
      category: 'reconciliation',
      label: 'Recalculate From Here',
      handler: async (payload = {}) => runSceneReconciliationFromRuntime('recalculateFromHere', payload)
    },
    {
      id: SCENE_RECONCILIATION_ACTION_IDS.reconcileMarked,
      category: 'reconciliation',
      label: 'Reconcile Marked Passage',
      handler: async (payload = {}) => runSceneReconciliationFromRuntime('reconcileMarked', payload)
    },
    {
      id: SCENE_RECONCILIATION_ACTION_IDS.openPending,
      category: 'reconciliation',
      label: 'Open Pending Reconciliation',
      handler: async (payload = {}) => runSceneReconciliationFromRuntime('openPending', payload)
    },
    {
      id: SCENE_RECONCILIATION_ACTION_IDS.applyPending,
      category: 'reconciliation',
      label: 'Apply Pending Reconciliation',
      handler: async (payload = {}) => runSceneReconciliationFromRuntime('applyPending', payload)
    },
    {
      id: SCENE_RECONCILIATION_ACTION_IDS.rejectPending,
      category: 'reconciliation',
      label: 'Reject Pending Reconciliation',
      handler: async (payload = {}) => runSceneReconciliationFromRuntime('rejectPending', payload)
    }
  ], { replace: true });
}

export function configureRuntimeApp(app) {
  setDirectiveRuntimeApp(app);
}

export async function refreshRuntimeSafely() {
  try {
    return await runRuntimeAction('runtime.refresh');
  } catch (error) {
    return { refreshed: false, error: error?.message || String(error) };
  }
}
