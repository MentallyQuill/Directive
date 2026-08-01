import assert from 'node:assert/strict';

class FakeClassList {
  constructor(element) { this.element = element; }
  values() { return new Set(String(this.element.className || '').split(/\s+/).filter(Boolean)); }
  write(values) { this.element.className = [...values].join(' '); }
  add(...names) { const values = this.values(); names.forEach((name) => values.add(name)); this.write(values); }
  remove(...names) { const values = this.values(); names.forEach((name) => values.delete(name)); this.write(values); }
  contains(name) { return this.values().has(name); }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.textContent = '';
    this.disabled = false;
  }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') this.className = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
  }
  getAttribute(name) { return this.attributes.get(name) || null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  async click() { if (!this.disabled) await this.listeners.get('click')?.({ target: this, currentTarget: this, preventDefault() {} }); }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const actionMatch = selector.match(/^\[data-campaign-action="([^"]+)"\]$/);
    if (actionMatch) return this.dataset.campaignAction === actionMatch[1];
    if (selector === '[data-campaign-package-id]') return Boolean(this.dataset.campaignPackageId);
    const fieldMatch = selector.match(/^\[data-campaign-field="([^"]+)"\]$/);
    if (fieldMatch) return this.dataset.campaignField === fieldMatch[1];
    return false;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body', this);
    this.documentElement = new FakeElement('html', this);
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
}

function textOf(node) {
  return [node.textContent || '', ...node.children.map(textOf)].join(' ');
}

globalThis.document = new FakeDocument();
const { renderCampaignBrowser } = await import('../../src/ui/campaign-browser.js');

const packages = [
  {
    packageId: 'ashes',
    title: 'Ashes of Peace',
    campaign: { highConcept: 'Rebuild a damaged command after a war.', theater: 'Asterion Reach', eraLabel: 'Postwar' },
    ship: { id: 'breckenridge', name: 'U.S.S. Breckenridge' },
    playerRole: { label: 'Executive Officer' },
    structure: { expectedSessions: 8, mainQuestCount: 3, sideQuestCount: 2 },
    openingHook: 'A damaged ship arrives without a crew.',
    assets: { images: [{ kind: 'ship.hero', subjectId: 'breckenridge', path: 'ashes.png' }] },
    actions: { startNewCampaign: true }
  },
  {
    packageId: 'black-current',
    title: 'Black Current',
    campaign: { highConcept: 'Find the truth beneath a silent ocean.', theater: 'Pelagic Belt', eraLabel: 'Late frontier' },
    ship: { id: 'serein', name: 'U.S.S. Serein' },
    playerRole: { label: 'Mission Commander' },
    structure: { expectedSessions: 5, mainQuestCount: 2, sideQuestCount: 1 },
    actions: { resumeDraft: 'draft-black-current' },
    importPayload: { fileName: 'black-current.zip', bytes: new Uint8Array([1, 2, 3]) }
  }
];
const calls = [];
let closed = 0;
const actions = {
  async startCreatorDraft(payload) { calls.push(['start', payload]); },
  async resumeCreatorDraft(payload) { calls.push(['continue', payload]); },
  async importCampaignPackageArchive(payload) { calls.push(['import', payload]); },
  async refresh() { calls.push(['refresh']); }
};
const dialog = document.createElement('section');
const rendered = renderCampaignBrowser(dialog, { packages, actions, close: () => { closed += 1; } });

assert.equal(rendered.browser.dataset.campaignBrowser, 'true');
assert.equal(rendered.master.querySelectorAll('[data-campaign-package-id]').length, 2);
assert.equal(calls.length, 0, 'initial presentation must not invoke a runtime action');
assert.match(textOf(rendered.detail), /Rebuild a damaged command/);
assert.match(textOf(rendered.detail), /Asterion Reach/);
assert.match(textOf(rendered.detail), /U\.S\.S\. Breckenridge/);
assert.match(textOf(rendered.detail), /Executive Officer/);
assert.match(textOf(rendered.detail), /A damaged ship arrives/);

await rendered.master.querySelectorAll('[data-campaign-package-id]')[1].click();
assert.equal(calls.length, 0, 'selection must not start a campaign');
assert.match(textOf(rendered.detail), /Black Current/);
assert.match(textOf(rendered.detail), /Pelagic Belt/);

await rendered.detail.querySelector('[data-campaign-action="continue"]').click();
assert.deepEqual(calls[0], ['continue', { draftId: 'draft-black-current' }]);
await rendered.detail.querySelector('[data-campaign-action="import"]').click();
assert.deepEqual(calls[2], ['import', { fileName: 'black-current.zip', bytes: new Uint8Array([1, 2, 3]) }]);
await rendered.detail.querySelector('[data-campaign-action="cancel"]').click();
assert.equal(closed, 3, 'Continue, Import, and Cancel should each close the chooser');

const emptyDialog = document.createElement('section');
const empty = renderCampaignBrowser(emptyDialog, { packages: [], close: () => {} });
assert.match(textOf(empty.browser), /No campaign packages are available/);

console.log('Campaign browser tests passed.');
