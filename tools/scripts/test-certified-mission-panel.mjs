import assert from 'node:assert/strict';
import { renderMissionPanel } from '../../src/ui/mission-panel.js';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
    this.classList = { add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); } };
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener() {}
}

globalThis.document = {
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text })
};

const projection = {
  kind: 'directive.playerProjection.v1',
  player: { kind: 'directive.playerIdentityProjection.v1', playerId: 'player.sam', name: 'Sam Vickers' },
  mission: {
    kind: 'directive.missionPlayerProjection.v1',
    missionId: 'mission.prelude',
    title: 'Prelude: A Ship Underway',
    summary: 'Assume command and establish readiness.',
    status: 'active',
    objectives: [
      { id: 'objective.handover', class: 'required', status: 'active', disposition: null, title: 'Complete the handover', summary: 'Set command boundaries.', terminalText: null },
      { id: 'objective.rescue', class: 'optional', status: 'terminal', disposition: 'completed', title: 'Aid the transport', summary: 'Protect its passengers.', terminalText: 'Passengers safe.' }
    ],
    progress: { requiredCompleted: 0, requiredTotal: 1, optionalCompleted: 1, optionalTotal: 1 },
    facts: [{ id: 'fact.distress', summary: 'A transport sent a distress call.' }],
    clocks: [],
    capabilities: [],
    terminal: null
  },
  people: { kind: 'directive.peoplePlayerProjection.v1', people: [] },
  ship: { kind: 'directive.shipPlayerProjection.v1', shipId: 'ship.breckenridge' },
  commandBearing: { kind: 'directive.commandBearingPlayerProjection.v1', balance: 0, capacity: 3 },
  private: { plot: 'fraud conspiracy' }
};

const body = new Element('div');
renderMissionPanel(body, { campaignState: {}, v1PlayerProjection: projection });

const all = (root) => [root, ...root.children.flatMap(all)];
const byClass = (className) => all(body).filter((node) => node.className.split(/\s+/).includes(className));
const text = all(body).map((node) => node.textContent || '').join(' ');

assert.equal(byClass('mission-layout').length, 1);
assert.equal(byClass('mission-collection').length, 1);
assert.equal(byClass('mission-detail').length, 1);
assert.equal(all(body).filter((node) => node.dataset.directiveScrollOwner === 'true').length, 2);
assert.match(text, /Prelude: A Ship Underway/);
assert.match(text, /Primary objectives/);
assert.match(text, /Optional objectives/);
assert.equal(byClass('is-resolved').length, 1);
assert.doesNotMatch(text, /fraud/i);
assert.doesNotMatch(text, /percent|reconciliation|open world|recovery/i);

console.log('PASS certified Mission panel');
