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
      contains: (name) => this.className.split(/\s+/).includes(name)
    };
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) {
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  click() {
    if (!this.disabled) this.listeners.get('click')?.({ currentTarget: this });
  }
}

globalThis.document = {
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text })
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
      playerName: 'Sam Vickers', playerRole: 'Executive Officer', chapter: 'Prelude: A Ship Underway',
      canOpenChat: true, canSaveGame: true, activeTimeline: { saveId: 'save.current' },
      checkpoints: [{ id: 'save.current', name: 'Current save', loadable: true }]
    }]
  }
};

const all = (root) => [root, ...root.children.flatMap(all)];
const byClass = (root, className) => all(root).filter((node) => node.className.split(/\s+/).includes(className));
const byData = (root, key, value) => all(root).filter((node) => node.dataset[key] === value);
const textOf = (root) => all(root).map((node) => node.textContent || '').join(' ');

resetCampaignPanelState();
let startCampaignCalls = 0;
renderCampaignPanel(body, view, {
  startCreatorDraft: () => { startCampaignCalls += 1; }
});

assert.equal(byClass(body, 'campaign-layout').length, 1);
assert.equal(byClass(body, 'campaign-master').length, 1);
assert.equal(byClass(body, 'campaign-detail').length, 1);
assert.equal(byData(body, 'directiveScrollOwner', 'true').length, 2);

const previews = byData(body, 'campaignAvailability', 'coming-later');
assert.equal(previews.length, 5);
for (const preview of previews) {
  assert.equal(preview.tagName, 'BUTTON');
  assert.equal(preview.getAttribute('aria-disabled'), null);
  assert.equal(preview.tabIndex, 0);
  assert.equal(preview.listeners.has('click'), true);
  assert.doesNotMatch(textOf(preview), /Coming later/i);
}
assert.match(textOf(previews[0]), /Current approved campaign description\./);
assert.match(textOf(body), /Current save/);
assert.doesNotMatch(textOf(body), /Load Campaign|Save As|Import package/i);

const availablePreview = byData(body, 'campaignAvailability', 'available').find((node) => node.tagName === 'BUTTON');
assert.ok(availablePreview);
availablePreview.click();

const ashesHero = byClass(body, 'campaign-library-hero')[0];
assert.ok(ashesHero);
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

console.log('PASS certified Campaign panel');
