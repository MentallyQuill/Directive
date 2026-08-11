import assert from 'node:assert/strict';
import { renderCrewPanel, resetCrewPanelState } from '../../src/ui/crew-panel.js';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.classList = { add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); } };
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
}

globalThis.document = {
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text })
};

const projection = {
  branchId: 'save.current',
  kind: 'directive.playerProjection.v1',
  player: {
    kind: 'directive.playerIdentityProjection.v1', playerId: 'player.sam', name: 'Sam Vickers', rank: 'Commander', billet: 'Executive Officer',
    species: { label: 'Human' }, appearance: 'Attentive and deliberate.', dossier: { briefBiography: 'Visible biography.' }, portrait: null
  },
  mission: { kind: 'directive.missionPlayerProjection.v1', missionId: 'mission.prelude', objectives: [] },
  people: {
    kind: 'directive.peoplePlayerProjection.v1',
    people: [{
      id: 'person.whitaker', name: 'Mara Whitaker', billet: 'Commanding Officer', categoryId: 'ships-company',
      portrait: { kind: 'crew.portrait.formal', subjectId: 'person.whitaker' },
      service: { organization: 'starfleet', department: 'command', rankCode: 'captain', rankLabel: 'Captain' },
      profileSummary: 'Visible profile.', relationshipPosture: 'Watchful', moments: []
    }]
  },
  ship: { kind: 'directive.shipPlayerProjection.v1', shipId: 'ship.breckenridge' },
  commandBearing: {
    kind: 'directive.commandBearingPlayerProjection.v1', balance: 1, capacity: 3, latestAwardReason: null, pendingEdge: null, latestSpend: null
  }
};

const body = new Element('div');
resetCrewPanelState();
const packageData = { assets: { images: [{
  id: 'crew.whitaker', kind: 'crew.portrait.formal', subjectId: 'person.whitaker',
  variants: { thumb: 'whitaker-thumb.webp', detail: 'whitaker-detail.webp' }, alt: 'Mara Whitaker'
}] } };
const view = {
  campaignState: { campaign: { id: 'campaign.ashes' } },
  activeSaveId: 'save.current',
  currentChatActivePackage: packageData,
  v1PlayerProjection: projection
};
renderCrewPanel(body, view, { reserveCommandBearingEdge() {} });

const all = (root) => [root, ...root.children.flatMap(all)];
const nodes = all(body);
const byClass = (className) => nodes.filter((node) => node.className.split(/\s+/).includes(className));
const firstIndex = (className) => nodes.findIndex((node) => node.className.split(/\s+/).includes(className));
const text = nodes.map((node) => node.textContent || '').join(' ');

assert.equal(byClass('people-route').length, 1);
assert.equal(byClass('people-layout').length, 1);
assert.equal(byClass('people-roster').length, 1);
assert.equal(byClass('people-detail').length, 2, 'desktop detail and the open phone record share the same person model');
assert.equal(byClass('people-collection-toolbar').length, 2);
assert.equal(byClass('collection-category').length, 2);
assert.equal(byClass('collection-drag-handle').length >= 6, true);
assert.equal(byClass('people-row-image').length, 2);
assert.equal(byClass('mobile-crew-avatar').length, 2);
assert.equal(byClass('directive-command-bearing-strip').length, 1);
assert.ok(firstIndex('directive-command-bearing-strip') < firstIndex('people-layout'));
assert.equal(nodes.filter((node) => node.dataset.directiveScrollOwner === 'true').length, 3);
assert.match(text, /1 of 3 available/);
assert.match(text, /Sam Vickers/);
assert.match(text, /Mara Whitaker/);
assert.doesNotMatch(text, /Marks|Ranks|Resolve|Inspiration/);

const whitakerRow = nodes.find((node) => node.dataset.personId === 'person.whitaker' && node.className.split(/\s+/).includes('people-row'));
whitakerRow.listeners.get('click')();
const rerendered = all(body);
const detailPortrait = rerendered.find((node) => node.className.split(/\s+/).includes('people-detail-portrait'));
const detailImage = all(detailPortrait).find((node) => node.tagName === 'IMG');
assert.match(detailImage.src, /whitaker-detail\.webp$/);

console.log('PASS certified People panel');
