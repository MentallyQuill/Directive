import {
  hideDirectiveRuntimePanel,
  refreshDirectiveRuntimePanel,
  setDirectiveRuntimeApp,
  setDirectiveRuntimeTab,
  showDirectiveRuntimePanel
} from '../runtime/runtime-shell.js';
import { registerRuntimeActions, runRuntimeAction } from '../runtime/runtime-actions.js';

export function configureRuntimeActions() {
  registerRuntimeActions([
    {
      id: 'runtime.show',
      category: 'runtime',
      label: 'Show runtime panel',
      handler: async () => showDirectiveRuntimePanel()
    },
    {
      id: 'runtime.hide',
      category: 'runtime',
      label: 'Hide runtime panel',
      handler: () => hideDirectiveRuntimePanel()
    },
    {
      id: 'runtime.refresh',
      category: 'runtime',
      label: 'Refresh runtime panel',
      handler: async () => refreshDirectiveRuntimePanel()
    },
    {
      id: 'runtime.open',
      category: 'runtime',
      label: 'Open runtime panel',
      handler: async () => {
        await showDirectiveRuntimePanel();
        return refreshDirectiveRuntimePanel();
      }
    },
    {
      id: 'runtime.toggle',
      category: 'runtime',
      label: 'Toggle runtime panel',
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
      label: 'Set runtime tab',
      handler: async ({ tabId } = {}) => setDirectiveRuntimeTab(tabId)
    },
    {
      id: 'ui.refresh',
      category: 'ui',
      label: 'Refresh Directive UI',
      handler: async () => refreshDirectiveRuntimePanel()
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
