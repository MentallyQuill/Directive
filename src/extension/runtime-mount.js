import {
  hideDirectiveRuntimePanel,
  refreshDirectiveRuntimePanel,
  resetDirectiveRuntimeLayout,
  setDirectiveRuntimeApp,
  setDirectiveRuntimeTab,
  showDirectiveRuntimePanel,
  toggleDirectiveRuntimeDrawer,
  toggleDirectiveRuntimeFullscreen
} from '../runtime/runtime-shell.js';
import { registerRuntimeActions, runRuntimeAction } from '../runtime/runtime-actions.js';

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
