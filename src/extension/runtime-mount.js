import {
  hideDirectiveRuntimePanel,
  refreshDirectiveRuntimePanel,
  resetDirectiveRuntimeLayout,
  runCampaignIntroRewriteFromRuntime,
  runCommandBearingFromRuntime,
  runCorrectAsSwipeFromRuntime,
  runCorrectAsSwipeSettleFromRuntime,
  beginDirectiveGuidanceTutorial,
  runDefineSelectionFromRuntime,
  runDirectiveAssistFromRuntime,
  runFactualGroundingReviewFromRuntime,
  runMissionComponentsFromRuntime,
  runOutcomeIntegrityEditFromRuntime,
  showDirectiveRuntimeGuidanceTip,
  runSceneReconciliationFromRuntime,
  setDirectiveRuntimeApp,
  setDirectiveRuntimeTab,
  showDirectiveRuntimePanel,
  toggleDirectiveRuntimeDrawer,
  toggleDirectiveRuntimeFullscreen
} from '../runtime/runtime-shell.js';
import { registerRuntimeActions, runRuntimeAction } from '../runtime/runtime-actions.js';
import { SCENE_RECONCILIATION_ACTION_IDS } from '../runtime/scene-reconciliation.mjs';
import { OUTCOME_INTEGRITY_EDIT_ACTION_ID } from '../runtime/outcome-integrity.mjs';
import {
  CORRECT_AS_SWIPE_ACTION_ID,
  CORRECT_AS_SWIPE_SETTLE_ACTION_ID
} from '../runtime/correct-as-swipe.mjs';

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
      id: 'guidance.beginTutorial',
      category: 'guidance',
      label: 'Begin Directive tutorial',
      handler: async (payload = {}) => beginDirectiveGuidanceTutorial(payload)
    },
    {
      id: 'guidance.showTip',
      category: 'guidance',
      label: 'Show Directive tip',
      handler: async (payload = {}) => showDirectiveRuntimeGuidanceTip(payload)
    },
    {
      id: 'assist.run',
      category: 'assist',
      label: 'Run Directive Assist',
      handler: async (payload = {}) => runDirectiveAssistFromRuntime(payload)
    },
    {
      id: 'testing.factualGroundingReview',
      category: 'testing',
      label: 'Run factual grounding review',
      handler: async (payload = {}) => runFactualGroundingReviewFromRuntime(payload)
    },
    {
      id: 'commandBearing.view',
      category: 'commandBearing',
      label: 'Read Command Bearing view',
      handler: async (payload = {}) => runCommandBearingFromRuntime('view', payload)
    },
    {
      id: 'commandBearing.ready',
      category: 'commandBearing',
      label: 'Ready Command Bearing point',
      handler: async (payload = {}) => runCommandBearingFromRuntime('ready', payload)
    },
    {
      id: 'commandBearing.cancel',
      category: 'commandBearing',
      label: 'Cancel Readied Command Bearing point',
      handler: async (payload = {}) => runCommandBearingFromRuntime('cancel', payload)
    },
    {
      id: 'campaignIntro.rewrite',
      category: 'campaign',
      label: 'Rewrite Campaign Intro',
      handler: async (payload = {}) => runCampaignIntroRewriteFromRuntime(payload)
    },
    {
      id: 'missionComponents.captureSelection',
      category: 'missionComponents',
      label: 'Capture Mission Component Selection',
      handler: async (payload = {}) => runMissionComponentsFromRuntime('captureSelection', payload)
    },
    {
      id: 'missionComponents.save',
      category: 'missionComponents',
      label: 'Save Mission Component',
      handler: async (payload = {}) => runMissionComponentsFromRuntime('save', payload)
    },
    {
      id: 'missionComponents.update',
      category: 'missionComponents',
      label: 'Update Mission Component',
      handler: async (payload = {}) => runMissionComponentsFromRuntime('update', payload)
    },
    {
      id: 'missionComponents.archive',
      category: 'missionComponents',
      label: 'Archive Mission Component',
      handler: async (payload = {}) => runMissionComponentsFromRuntime('archive', payload)
    },
    {
      id: 'missionComponents.openSource',
      category: 'missionComponents',
      label: 'Open Mission Component Source',
      handler: async (payload = {}) => runMissionComponentsFromRuntime('openSource', payload)
    },
    {
      id: 'defineSelection.lookup',
      category: 'defineSelection',
      label: 'Define Selection',
      handler: async (payload = {}) => runDefineSelectionFromRuntime(payload)
    },
    {
      id: CORRECT_AS_SWIPE_ACTION_ID,
      category: 'correctAsSwipe',
      label: 'Correct as Swipe',
      handler: async (payload = {}) => runCorrectAsSwipeFromRuntime(payload)
    },
    {
      id: CORRECT_AS_SWIPE_SETTLE_ACTION_ID,
      category: 'correctAsSwipe',
      label: 'Settle Correct-as-Swipe Case',
      handler: async (payload = {}) => runCorrectAsSwipeSettleFromRuntime(payload)
    },
    {
      id: OUTCOME_INTEGRITY_EDIT_ACTION_ID,
      category: 'outcomeIntegrity',
      label: 'Protected Message Edit',
      handler: async (payload = {}) => runOutcomeIntegrityEditFromRuntime(payload)
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
      id: SCENE_RECONCILIATION_ACTION_IDS.clearMarkers,
      category: 'reconciliation',
      label: 'Clear Reconciliation Set',
      handler: async (payload = {}) => runSceneReconciliationFromRuntime('clearMarkers', payload)
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
