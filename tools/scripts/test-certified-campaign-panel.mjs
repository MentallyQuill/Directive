import assert from 'node:assert/strict';
import { renderCampaignPanel, resetCampaignPanelState } from '../../src/ui/campaign-panel.js';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.tabIndex = 0;
    this.disabled = false;
    this.hidden = false;
    this.id = '';
    this.isConnected = true;
    this.replaceCount = 0;
    this.value = '';
    this.classList = {
      add: (...names) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.add(name));
        this.className = [...classes].join(' ');
      },
      remove: (...names) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.delete(name));
        this.className = [...classes].join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.contains(name) : Boolean(force);
        if (enabled) this.classList.add(name);
        else this.classList.remove(name);
        return enabled;
      }
    };
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) {
    this.replaceCount += 1;
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  querySelector(selector) {
    if (!selector.startsWith('.')) return null;
    const className = selector.slice(1);
    return this.children.flatMap((child) => [child, ...all(child)]).find((node) => node.classList.contains(className)) || null;
  }
  contains(candidate) { return candidate === this || this.children.some((child) => child.contains(candidate)); }
  focus() { globalThis.document.activeElement = this; }
  select() {}
  remove() {
    this.isConnected = false;
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
  }
  click() {
    if (!this.disabled) return this.listeners.get('click')?.({ currentTarget: this });
  }
}

const documentBody = new Element('body');
const documentListeners = new Map();
globalThis.document = {
  activeElement: null,
  body: documentBody,
  documentElement: documentBody,
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text }),
  addEventListener: (type, handler) => documentListeners.set(type, handler),
  querySelectorAll: () => [],
  getElementById: (id) => {
    const visit = (node) => node.id === id ? node : node.children.map(visit).find(Boolean);
    return visit(documentBody) || null;
  }
};

const ashesId = 'directive:campaign-package:breckenridge-ashes-of-peace';
const body = new Element('div');
const view = {
  campaign: {
    packages: [
      {
        packageId: ashesId,
        title: 'Ashes of Peace',
        campaign: {
          highConcept: 'Current Ashes description.',
          eraLabel: '2376, Post-Dominion War',
          theater: 'Asterion Reach'
        },
        ship: { name: 'U.S.S. Breckenridge', class: 'Intrepid-class' },
        playerRole: { rank: 'Commander', billet: 'Executive Officer' },
        assets: { images: [] }
      },
      {
        packageId: 'directive:campaign-package:glass-harbor-drowned-constellation',
        title: 'Drowned Constellation',
        campaign: {
          highConcept: 'Current approved campaign description.',
          eraLabel: '2373, Dominion War',
          theater: 'Nerine Reef'
        },
        ship: { name: 'U.S.S. Glass Harbor', class: 'Steamrunner-class' },
        playerRole: { rank: 'Commander', billet: 'Executive Officer' },
        assets: { images: [] }
      },
      {
        packageId: 'directive:campaign-package:serein-black-current',
        title: 'Black Current',
        campaign: { highConcept: 'Black Current approved description.', eraLabel: '2376, Post-Dominion War', theater: 'Vanta Wake' },
        ship: { name: 'U.S.S. Serein', class: 'Steamrunner-class' },
        playerRole: { rank: 'Commander', billet: 'Executive Officer' },
        assets: { images: [] }
      },
      {
        packageId: 'directive:campaign-package:eudora-vale-broken-accord',
        title: 'Broken Accord',
        campaign: { highConcept: 'Broken Accord approved description.', eraLabel: '2378, Post-Dominion War', theater: 'Ilyra System' },
        ship: { name: 'U.S.S. Eudora Vale', class: 'Intrepid-class' },
        playerRole: { rank: 'Commander', billet: 'Executive Officer' },
        assets: { images: [] }
      },
      {
        packageId: 'directive:campaign-package:aster-vale-unseen-border',
        title: 'Unseen Border',
        campaign: { highConcept: 'Unseen Border approved description.', eraLabel: '2371', theater: 'Lacuna March' },
        ship: { name: 'U.S.S. Aster Vale', class: 'New Orleans-class' },
        playerRole: { rank: 'Commander', billet: 'Executive Officer' },
        assets: { images: [] }
      },
      {
        packageId: 'directive:campaign-package:celandine-enemys-garden',
        title: "Enemy's Garden",
        campaign: { highConcept: "Enemy's Garden approved description.", eraLabel: '2376, Post-Dominion War', theater: 'Cyradon Relief Cluster' },
        ship: { name: 'U.S.S. Celandine', class: 'Norway-class' },
        playerRole: { rank: 'Commander', billet: 'Executive Officer' },
        assets: { images: [] }
      }
    ]
  },
  campaignIndex: {
    selectedCampaignId: 'campaign.ashes',
    campaigns: [{
      id: 'campaign.ashes', packageId: ashesId, title: 'Ashes of Peace', active: true,
      characterName: 'Ren Okada - Ashes of Peace',
      playerName: 'Sam Vickers', playerRole: 'Executive Officer', chapter: 'Prelude: A Ship Underway',
      canOpenChat: true, canSaveGame: true, activeTimeline: { saveId: 'save.current' },
      savedGames: [{
        id: 'saved.before-whitaker', name: 'Before Whitaker', loadable: true,
        chapter: 'Prelude: A Ship Underway', stardate: 53068.4, createdAt: '2026-08-11T12:00:00.000Z'
      }]
    }]
  }
};

const all = (root) => [root, ...root.children.flatMap(all)];
const byClass = (root, className) => all(root).filter((node) => node.className.split(/\s+/).includes(className));
const byData = (root, key, value) => all(root).filter((node) => node.dataset[key] === value);
const textOf = (root) => all(root).map((node) => node.textContent || '').join(' ');

resetCampaignPanelState();
let startCampaignCalls = 0;
let savedPayload = null;
let resolvePanelSave;
let resolvePanelRefresh;
let panelRefreshStarted = false;
const panelSave = new Promise((resolve) => { resolvePanelSave = resolve; });
const panelRefresh = new Promise((resolve) => { resolvePanelRefresh = resolve; });
renderCampaignPanel(body, view, {
  startCreatorDraft: () => { startCampaignCalls += 1; },
  saveGame: async (payload) => {
    savedPayload = payload;
    return panelSave;
  },
  refresh: async () => {
    panelRefreshStarted = true;
    await panelRefresh;
  }
});

assert.equal(byClass(body, 'campaign-dashboard').length, 1, 'active campaign must default to its focused dashboard');
assert.equal(byClass(body, 'campaign-master').length, 0, 'active dashboard must not render the persistent Campaign browser');
assert.equal(byClass(body, 'campaign-saves').length, 0, 'active dashboard must keep saved games inside Load Game');
const dashboard = byClass(body, 'campaign-dashboard')[0];
const dashboardHero = byClass(body, 'campaign-dashboard-hero')[0];
assert.ok(dashboardHero, 'active dashboard must expose its full-height hero contract');
assert.equal(dashboardHero.classList.contains('directive-responsive-hero'), false);
assert.equal(byClass(dashboardHero, 'directive-responsive-hero-toggle').length, 0);
assert.equal(dashboardHero.getAttribute('aria-expanded'), null);
const dashboardActions = byClass(body, 'campaign-dashboard-actions')[0];
assert.equal(dashboardHero.parentNode, dashboard);
assert.equal(dashboardActions.parentNode, dashboard);
const dashboardDelete = byData(body, 'campaignAction', 'delete')[0];
assert.ok(dashboardDelete, 'active dashboard must expose the approved icon-only campaign delete control');
assert.equal(dashboardDelete.getAttribute('aria-label'), 'Delete campaign');
assert.equal(dashboardDelete.dataset.directiveTooltip, 'Delete campaign');
assert.equal(byClass(dashboardDelete, 'campaign-delete-icon').length, 1);
assert.equal(textOf(dashboardDelete).trim(), '');
const campaignsControl = byData(body, 'campaignAction', 'campaigns')[0];
assert.ok(campaignsControl, 'active dashboard must expose the Campaign browser on demand');
await campaignsControl.click();
assert.equal(byClass(body, 'campaign-dashboard').length, 0, 'Campaigns must leave dashboard mode');
assert.equal(byClass(body, 'campaign-layout').length, 1);
assert.equal(byClass(body, 'campaign-master').length, 1);
assert.equal(byClass(body, 'campaign-detail').length, 1);
assert.equal(byData(body, 'directiveScrollOwner', 'true').length, 3);
const backToCurrent = byData(body, 'campaignAction', 'back-to-current')[0];
assert.ok(backToCurrent, 'Campaign browser must return to the current campaign without a runtime action');

const mobileAccordion = byClass(body, 'campaign-mobile-accordion')[0];
assert.ok(mobileAccordion);
const mobileTriggers = byClass(body, 'campaign-mobile-trigger');
const mobileDetails = byClass(body, 'campaign-mobile-detail');
assert.equal(mobileTriggers.length, 7);
assert.equal(mobileDetails.length, 7);
const currentMobileTrigger = byData(body, 'mobileRecordKey', 'campaign:campaign.ashes')[0];
assert.equal(currentMobileTrigger.getAttribute('aria-expanded'), 'true');
const currentMobileDetail = mobileDetails.find((node) => node.id === currentMobileTrigger.getAttribute('aria-controls'));
assert.ok(currentMobileDetail);
assert.equal(currentMobileDetail.hidden, false);
assert.equal(all(currentMobileDetail).filter((node) => node.tagName === 'H2').length, 0, 'phone Campaign detail must not repeat its trigger title');
assert.match(textOf(currentMobileDetail), /Sam Vickers/);

const futureMobileTrigger = byData(body, 'mobileRecordKey', 'package:directive:campaign-package:glass-harbor-drowned-constellation')[0];
const futureMobileDetail = mobileDetails.find((node) => node.id === futureMobileTrigger.getAttribute('aria-controls'));
const replacementCount = body.replaceCount;
futureMobileTrigger.focus();
await futureMobileTrigger.click();
assert.equal(body.replaceCount, replacementCount, 'phone disclosure must not replace the route body');
assert.equal(byClass(body, 'campaign-mobile-accordion')[0], mobileAccordion, 'phone disclosure must retain list identity');
assert.equal(globalThis.document.activeElement, futureMobileTrigger, 'phone disclosure must retain focus');
assert.equal(currentMobileTrigger.getAttribute('aria-expanded'), 'false');
assert.equal(currentMobileDetail.hidden, true);
assert.equal(futureMobileTrigger.getAttribute('aria-expanded'), 'true');
assert.equal(futureMobileDetail.hidden, false);
assert.equal(all(futureMobileDetail).filter((node) => node.tagName === 'H2').length, 0, 'phone library detail must not repeat its trigger title');
assert.match(textOf(futureMobileDetail), /Coming later/);
assert.equal(byData(body, 'campaignRecordKey', 'package:directive:campaign-package:glass-harbor-drowned-constellation')[0].getAttribute('aria-pressed'), 'true');
assert.match(textOf(byClass(body, 'campaign-detail')[0]), /Drowned Constellation/);
await futureMobileTrigger.click();
assert.equal(futureMobileTrigger.getAttribute('aria-expanded'), 'false');
assert.equal(mobileDetails.every((node) => node.hidden), true, 'tapping the open Campaign must collapse all records');

const previews = byData(body, 'campaignAvailability', 'coming-later')
  .filter((node) => node.tagName === 'BUTTON' && node.dataset.campaignRecordKey);
assert.equal(previews.length, 5);
for (const preview of previews) {
  assert.equal(preview.tagName, 'BUTTON');
  assert.equal(preview.getAttribute('aria-disabled'), null);
  assert.equal(preview.tabIndex, 0);
  assert.equal(preview.listeners.has('click'), true);
  assert.doesNotMatch(textOf(preview), /Coming later/i);
}
assert.match(textOf(previews[0]), /Current approved campaign description\./);
assert.doesNotMatch(textOf(body), /Load Campaign|Save As|Save checkpoint|Import package/i);
const campaignActions = byClass(body, 'campaign-detail-actions')[0];
assert.ok(campaignActions);
assert.deepEqual(campaignActions.children.map((node) => textOf(node).trim()), [
  'Continue',
  'Save Game',
  'Load Game',
  ''
]);
assert.equal(campaignActions.children[3].classList.contains('campaign-command-danger'), true);
assert.equal(campaignActions.children[3].listeners.has('click'), true);

campaignActions.children[1].click();
const saveOverlay = byClass(documentBody, 'save-game-dialog-overlay')[0];
const saveInput = byClass(saveOverlay, 'timeline-dialog-input')[0];
const savePrimary = byClass(saveOverlay, 'campaign-command-primary')[0];
saveInput.value = 'Ready Room';
const saveClick = savePrimary.listeners.get('click')();
await Promise.resolve();
assert.deepEqual(savedPayload, { name: 'Ready Room' });
assert.equal(saveOverlay.isConnected, true);
resolvePanelSave({ savedGameId: 'saved.ready-room' });
await Promise.resolve();
await Promise.resolve();
assert.equal(saveOverlay.isConnected, false, 'Campaign refresh must not retain a durably completed Save Game dialog');
assert.equal(panelRefreshStarted, true, 'Campaign refresh must begin after the Save Game dialog closes');
resolvePanelRefresh();
await saveClick;

const availablePreview = byData(body, 'campaignAvailability', 'available').find((node) => node.tagName === 'BUTTON');
assert.ok(availablePreview);
availablePreview.click();

const ashesHero = byClass(body, 'campaign-library-hero')[0];
assert.ok(ashesHero);
assert.equal(ashesHero.classList.contains('directive-responsive-hero'), true);
const ashesHeroToggle = byClass(ashesHero, 'directive-responsive-hero-toggle')[0];
assert.ok(ashesHeroToggle);
assert.equal(ashesHero.classList.contains('is-expanded'), false);
assert.equal(ashesHeroToggle.getAttribute('aria-expanded'), 'false');
assert.equal(textOf(byClass(ashesHero, 'campaign-hero-copy')[0]).trim(), 'Ashes of Peace');
const ashesBody = byClass(body, 'campaign-library-detail-body')[0];
assert.ok(ashesBody);
assert.match(textOf(ashesBody), /Current Ashes description\./);
const ashesFacts = byClass(ashesBody, 'campaign-library-facts')[0];
assert.ok(ashesFacts);
assert.equal(ashesFacts.children.length, 4);
assert.match(textOf(ashesFacts), /Era 2376, Post-Dominion War/);
assert.match(textOf(ashesFacts), /Theater Asterion Reach/);
assert.match(textOf(ashesFacts), /Assignment U\.S\.S\. Breckenridge, Intrepid-class/);
assert.match(textOf(ashesFacts), /Your Role Commander, Executive Officer/);

byData(body, 'campaignAvailability', 'coming-later').find((node) => node.tagName === 'BUTTON').click();

const futureDetail = byClass(body, 'campaign-library-hero')[0];
assert.ok(futureDetail);
assert.equal(futureDetail.dataset.campaignAvailability, 'coming-later');
assert.equal(futureDetail.classList.contains('is-coming-later'), true);
assert.match(textOf(futureDetail), /Coming later/);
assert.match(textOf(futureDetail), /Drowned Constellation/);
assert.doesNotMatch(textOf(futureDetail), /Current approved campaign description\./);
const futureBody = byClass(body, 'campaign-library-detail-body')[0];
assert.ok(futureBody);
assert.match(textOf(futureBody), /Current approved campaign description\./);
const futureFacts = byClass(futureBody, 'campaign-library-facts')[0];
assert.ok(futureFacts);
assert.equal(futureFacts.children.length, 4);
assert.match(textOf(futureFacts), /Era 2373, Dominion War/);
assert.match(textOf(futureFacts), /Theater Nerine Reef/);
assert.match(textOf(futureFacts), /Assignment U\.S\.S\. Glass Harbor, Steamrunner-class/);
assert.match(textOf(futureFacts), /Your Role Commander, Executive Officer/);
const futureAction = byClass(body, 'campaign-command-primary')[0];
assert.ok(futureAction);
assert.match(textOf(futureAction), /New campaign/);
assert.equal(futureAction.disabled, true);
futureAction.click();
assert.equal(startCampaignCalls, 0);

const sizeDisclosure = /\b(?:mission|chapter)\s+count\b|\bexpected sessions\b|\bstory arcs\b|\bquest templates\b|\b\d+\s+(?:missions|chapters|sessions)\b/i;
for (const pack of view.campaign.packages) {
  const row = byData(body, 'campaignRecordKey', `package:${pack.packageId}`).find((node) => node.tagName === 'BUTTON');
  assert.ok(row, `${pack.title} must remain selectable`);
  row.click();
  const heroCopy = byClass(body, 'campaign-hero-copy')[0];
  const packageBody = byClass(body, 'campaign-library-detail-body')[0];
  assert.ok(heroCopy, `${pack.title} must render hero copy`);
  assert.ok(packageBody, `${pack.title} must render below-hero detail`);
  assert.match(textOf(heroCopy), new RegExp(pack.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(textOf(heroCopy), new RegExp(pack.campaign.highConcept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(textOf(packageBody), new RegExp(pack.campaign.highConcept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(byClass(packageBody, 'campaign-fact').length, 4, `${pack.title} must render four campaign facts`);
  assert.doesNotMatch(textOf(packageBody), sizeDisclosure, `${pack.title} must not reveal campaign size`);
  assert.doesNotMatch(textOf(heroCopy), /Playable in V1/i);
}

const currentBackControl = byData(body, 'campaignAction', 'back-to-current')[0];
const runtimeCallsBeforeBack = startCampaignCalls;
await currentBackControl.click();
assert.equal(byClass(body, 'campaign-dashboard').length, 1, 'Back to Current Campaign must restore the focused dashboard');
assert.equal(startCampaignCalls, runtimeCallsBeforeBack, 'browser navigation must not invoke a campaign runtime action');

const emptyBody = new Element('div');
resetCampaignPanelState();
renderCampaignPanel(emptyBody, {
  campaign: { packages: view.campaign.packages },
  campaignIndex: { selectedCampaignId: null, campaigns: [] }
});
assert.equal(byClass(emptyBody, 'campaign-dashboard').length, 0, 'no active campaign cannot render a dashboard');
assert.equal(byClass(emptyBody, 'campaign-browser').length, 1, 'no active campaign must default to the Campaign browser');
assert.equal(byData(emptyBody, 'campaignAction', 'back-to-current').length, 0, 'browser without an active campaign must omit the back control');

const activatedBody = new Element('div');
renderCampaignPanel(activatedBody, view);
assert.equal(byClass(activatedBody, 'campaign-dashboard').length, 1, 'a newly active campaign must replace stale browser mode with its dashboard');

console.log('PASS certified Campaign panel');
