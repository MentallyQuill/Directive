import assert from 'node:assert/strict';
import { renderShipPanel } from '../../src/ui/ship-panel.js';

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
  player: { kind: 'directive.playerIdentityProjection.v1' },
  mission: { kind: 'directive.missionPlayerProjection.v1' },
  people: { kind: 'directive.peoplePlayerProjection.v1' },
  commandBearing: { kind: 'directive.commandBearingPlayerProjection.v1' },
  ship: {
    kind: 'directive.shipPlayerProjection.v1',
    shipId: 'uss-breckenridge', name: 'U.S.S. Breckenridge', class: 'Intrepid-class', registry: 'NCC-74638',
    capabilitySummary: 'A long-range explorer returned to service after modernization.',
    operationalStatus: {
      status: 'serviceable', summary: 'Certified for service while integrated validation continues.', readiness: null,
      materialLimitations: [{ id: 'limit.warp', summary: 'Maximum warp is temporarily restricted.' }], readinessObjectiveLink: null
    },
    capabilities: [{ id: 'cap.sensors', label: 'Long-range sensors', summary: 'Long-range sensors are available.' }],
    constraints: [{ id: 'constraint.corroboration', label: 'Corroboration required', summary: 'Fine claims need a second source.' }],
    systems: [{
      id: 'system.sensors', label: 'Sensor Calibration', summary: 'Calibration remains provisional.',
      currentState: { id: 'state.provisional', label: 'Provisional', why: 'No clean baseline is accepted.', mechanicalEffect: 'Fine claims require corroboration.' },
      stateLadder: [{ id: 'state.provisional', rank: 0, label: 'Provisional', why: 'No clean baseline is accepted.', mechanicalEffect: 'Fine claims require corroboration.' }],
      workOrders: [{ id: 'milestone.baseline', status: 'known', label: 'Establish a clean baseline', summary: 'Compare against an independent reference.' }]
    }]
  },
  issues: [{ title: 'technical debt', owner: 'Engineering' }]
};

const body = new Element('div');
renderShipPanel(body, { campaignState: {}, v1PlayerProjection: projection, activePackage: { assets: {} } });

const all = (root) => [root, ...root.children.flatMap(all)];
const nodes = all(body);
const byClass = (className) => nodes.filter((node) => node.className.split(/\s+/).includes(className));
const text = nodes.map((node) => node.textContent || '').join(' ');

assert.equal(byClass('ship-layout').length, 1);
assert.equal(byClass('ship-hero').length, 1);
assert.equal(byClass('ship-board').length, 1);
assert.equal(nodes.filter((node) => node.dataset.directiveScrollOwner === 'true').length, 1);
assert.match(text, /U\.S\.S\. Breckenridge/);
assert.match(text, /Operational status/);
assert.match(text, /Material limitations/);
assert.match(text, /Long-range sensors are available/);
assert.match(text, /Sensor Calibration/);
assert.match(text, /Provisional/);
assert.match(text, /Why this state/);
assert.match(text, /Fine claims require corroboration/);
assert.match(text, /Establish a clean baseline/);
assert.doesNotMatch(text, /technical debt|issue count|readiness percentage/i);

console.log('PASS certified Ship panel');
