import {
  hideDirectiveRuntimePanel,
  refreshDirectiveRuntimePanel,
  setDirectiveRuntimeApp,
  setDirectiveRuntimeTab,
  showDirectiveRuntimePanel,
} from '../runtime/runtime-shell.js';
import { registerRuntimeActions, runRuntimeAction } from '../runtime/runtime-actions.js';

export function configureRuntimeActions() {
  registerRuntimeActions([
    {
      id: 'runtime.show',
      category: 'runtime',
      label: 'Show Directive',
      handler: async () => showDirectiveRuntimePanel(),
    },
    {
      id: 'runtime.hide',
      category: 'runtime',
      label: 'Hide Directive',
      handler: () => hideDirectiveRuntimePanel(),
    },
    {
      id: 'runtime.refresh',
      category: 'runtime',
      label: 'Refresh Directive',
      handler: async () => refreshDirectiveRuntimePanel(),
    },
    {
      id: 'runtime.open',
      category: 'runtime',
      label: 'Open Directive',
      handler: async () => showDirectiveRuntimePanel(),
    },
    {
      id: 'runtime.toggle',
      category: 'runtime',
      label: 'Toggle Directive',
      handler: async ({ opener = null } = {}) => {
        const panel = typeof document !== 'undefined'
          ? document.getElementById('directive-runtime-panel')
          : null;
        return panel && panel.hidden !== true
          ? hideDirectiveRuntimePanel()
          : showDirectiveRuntimePanel({ opener });
      },
    },
    {
      id: 'runtime.setTab',
      category: 'runtime',
      label: 'Open Directive route',
      handler: async ({ tabId } = {}) => setDirectiveRuntimeTab(tabId),
    },
    {
      id: 'ui.refresh',
      category: 'ui',
      label: 'Refresh Directive UI',
      handler: async () => refreshDirectiveRuntimePanel(),
    },
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
