import assert from 'node:assert/strict';

import { renderMissionQuestJournal } from '../../src/ui/mission-quest-journal.js';
import { renderCrewPanel } from '../../src/ui/crew-panel.js';
import { renderShipPanel } from '../../src/ui/ship-panel.js';
import { renderCampaignPanel } from '../../src/ui/campaign-panel.js';
import { renderSettingsPanel } from '../../src/ui/settings-panel.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.disabled = false;
    this._className = '';
  }

  get className() { return this._className; }
  set className(value) { this._className = String(value || ''); }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = normalized;
    }
  }

  getAttribute(name) { return this.attributes.get(name) || null; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) { this.children.push(node); return node; }
  addEventListener() {}
}

function textOf(element) {
  return [element.textContent || '', ...element.children.map(textOf)].join(' ');
}

function collect(element, predicate, result = []) {
  if (predicate(element)) result.push(element);
  element.children.forEach((child) => collect(child, predicate, result));
  return result;
}

globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };
const body = new FakeElement('div');
let selectedQuestId = null;

renderMissionQuestJournal(body, {
  quests: [
    {
      id: 'main:ashes', category: 'main', status: 'active', title: 'Ashes of Peace',
      objective: 'Secure the Hesperus.', urgency: { label: '41 minutes remaining', remainingMinutes: 41 },
      knownFacts: [{ id: 'fact:reactor', text: 'The reactor is degrading.' }],
      people: [{ id: 'crew:bronn', label: 'Bronn' }], location: { id: 'hesperus', label: 'Hesperus' }, history: []
    },
    {
      id: 'done:survey', category: 'open-world', status: 'completed', title: 'Survey the Debris Field',
      objective: null, urgency: null, knownFacts: [], people: [], location: null, history: []
    }
  ],
  selectedQuestId: 'main:ashes'
}, {
  selectMissionQuest: async ({ questId }) => { selectedQuestId = questId; }
});

const renderedText = textOf(body);
assert.match(renderedText, /Ashes of Peace/);
assert.match(renderedText, /Secure the Hesperus/);
assert.match(renderedText, /41 minutes remaining/);
assert.match(renderedText, /The reactor is degrading/);
assert.match(renderedText, /Completed/);
assert.doesNotMatch(renderedText, /Bound Chat|Prompt Context|Open Threads|Components|Recovery Console|Intel|Log/);

const selectedRows = collect(body, (element) => element.dataset.questId === 'main:ashes');
assert.equal(selectedRows.length, 1);
assert.equal(selectedRows[0].getAttribute('aria-selected'), 'true');
assert.equal(selectedRows[0].getAttribute('role'), 'option');
assert.equal(selectedQuestId, null);

delete globalThis.document;

globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };
const crewBody = new FakeElement('div');
renderCrewPanel(crewBody, {
  campaignState: { campaign: { id: 'campaign:panel' } },
  playerFacingInformation: {
    crew: [{
      id: 'crew:bronn', name: 'Bronn', role: 'Chief Engineer', availability: 'Available',
      standing: 'Wary', assignment: 'Reactor watch', history: [{ id: 'history:bronn', summary: 'Bronn challenged the repair order.' }]
    }]
  }
});
assert.match(textOf(crewBody), /Bronn/);
assert.match(textOf(crewBody), /Chief Engineer/);
assert.match(textOf(crewBody), /Wary/);
assert.match(textOf(crewBody), /Bronn challenged the repair order/);
assert.doesNotMatch(textOf(crewBody), /Command Bearing Evidence|Current Pressure|Command Context|Recent Command Memory|Open Threads/);

const shipBody = new FakeElement('div');
renderShipPanel(shipBody, {
  campaignState: { campaign: { id: 'campaign:panel' } },
  playerFacingInformation: {
    ship: {
      id: 'ship:breckenridge', name: 'U.S.S. Breckenridge', condition: 'Operational',
      capabilities: [{ id: 'warp', label: 'Warp drive', value: 'Available' }],
      restrictions: ['Maximum warp restricted'],
      damage: [{ id: 'reactor', label: 'Reactor degradation' }],
      history: [{ id: 'history:reactor', summary: 'Reactor validation remains open.' }]
    }
  }
});
assert.match(textOf(shipBody), /U\.S\.S\. Breckenridge/);
assert.match(textOf(shipBody), /Operational/);
assert.match(textOf(shipBody), /Warp drive/);
assert.match(textOf(shipBody), /Maximum warp restricted/);
assert.match(textOf(shipBody), /Reactor validation remains open/);
assert.equal((textOf(shipBody).match(/Operational/g) || []).length, 1);
assert.doesNotMatch(textOf(shipBody), /Technical Debt|Current Operational Condition|Runtime Asset Status/);

delete globalThis.document;

globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };
const campaignBody = new FakeElement('div');
renderCampaignPanel(campaignBody, {
  campaign: { sessions: [{ campaignTitle: 'Ashes of Peace', saveName: 'Current Save', updatedAt: '2026-07-20T09:00:00.000Z' }] },
  campaignState: { campaign: { title: 'Ashes of Peace' }, ship: { name: 'U.S.S. Breckenridge' }, mission: { activeMissionId: 'main:ashes' } }
}, {
  setActiveTab() {},
  refresh() {}
});
assert.match(textOf(campaignBody), /Ashes of Peace/);
assert.match(textOf(campaignBody), /Open Mission|Continue/);
assert.doesNotMatch(textOf(campaignBody), /Open Campaign Chat|Prompt Context|Latest Outcome|Active Mission|Phase/);

const settingsBody = new FakeElement('div');
renderSettingsPanel(settingsBody, { campaignState: {} }, {});
assert.match(textOf(settingsBody), /Player Preferences/);
assert.match(textOf(settingsBody), /Advanced/);
assert.match(textOf(settingsBody), /Developer & Troubleshooting/);
const settingsDisclosures = collect(settingsBody, (element) => element.tagName === 'DETAILS');
assert.equal(settingsDisclosures.length, 2);
assert.equal(settingsDisclosures.every((element) => element.open !== true), true);

delete globalThis.document;
console.log('Player-facing panel contracts passed');
