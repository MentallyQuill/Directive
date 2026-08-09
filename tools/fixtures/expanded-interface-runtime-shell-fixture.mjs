import {
  setDirectiveRuntimeApp,
  setDirectiveRuntimeMountHost,
  showDirectiveRuntimePanel
} from '/src/runtime/runtime-shell.js';

const routeIds = ['campaign', 'mission', 'people', 'ship', 'settings'];
const baseView = {
  activeScreen: 'campaign',
  campaign: { packages: [], saves: [] },
  campaignState: { campaign: { id: 'runtime-shell-timing-fixture' } },
  currentChatCampaignState: null,
  playerFacingInformation: { quests: [], crew: [], ship: null },
  settings: {},
  providerStatus: {}
};
const retainedViews = new Map(routeIds.map((routeId) => [routeId, { ...baseView, activeTab: routeId }]));

globalThis.__directiveRuntimeViewReads = 0;
localStorage.setItem('directive.guidance.tipsDisabled.v1', 'true');

setDirectiveRuntimeMountHost(document.body);
setDirectiveRuntimeApp({
  async getCurrentView({ tabId = 'campaign' } = {}) {
    globalThis.__directiveRuntimeViewReads += 1;
    return retainedViews.get(tabId) || retainedViews.get('campaign');
  },
  getRetainedView({ tabId = 'campaign' } = {}) {
    return retainedViews.get(tabId) || null;
  }
});

await showDirectiveRuntimePanel();
globalThis.__directiveRuntimeShellReady = true;
