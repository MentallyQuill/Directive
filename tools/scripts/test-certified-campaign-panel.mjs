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
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
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
      { packageId: ashesId, title: 'Ashes of Peace', campaign: { highConcept: 'Current Ashes description.' }, assets: { images: [] } },
      { packageId: 'directive:campaign-package:glass-harbor-drowned-constellation', title: 'Drowned Constellation', campaign: { highConcept: 'Current approved campaign description.' }, assets: { images: [] } }
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
renderCampaignPanel(body, view, {});

assert.equal(byClass(body, 'campaign-layout').length, 1);
assert.equal(byClass(body, 'campaign-master').length, 1);
assert.equal(byClass(body, 'campaign-detail').length, 1);
assert.equal(byData(body, 'directiveScrollOwner', 'true').length, 2);

const previews = byData(body, 'campaignAvailability', 'coming-later');
assert.equal(previews.length, 1);
assert.equal(previews[0].getAttribute('aria-disabled'), 'true');
assert.equal(previews[0].tabIndex, -1);
assert.equal(previews[0].listeners.has('click'), false);
assert.match(textOf(previews[0]), /Coming later/);
assert.match(textOf(previews[0]), /Current approved campaign description\./);

assert.match(textOf(body), /Current save/);
assert.doesNotMatch(textOf(body), /Load Campaign|Save As|Import package/i);

console.log('PASS certified Campaign panel');
