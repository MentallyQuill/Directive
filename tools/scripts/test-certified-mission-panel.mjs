import assert from 'node:assert/strict';
import { renderMissionPanel } from '../../src/ui/mission-panel.js';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.id = '';
    this.replaceCount = 0;
    this.classList = { add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); } };
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) { this.replaceCount += 1; this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  focus() { globalThis.document.activeElement = this; }
  click() { return this.listeners.get('click')?.({ currentTarget: this }); }
}

globalThis.document = {
  activeElement: null,
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text })
};

const projection = {
  kind: 'directive.playerProjection.v1',
  time: {
    kind: 'directive.timePlayerProjection.v1',
    stardate: 53068.405312,
    secondOfDay: 31059,
    clockDisplay: '08:37:39',
    stardateDisplay: '53068.4'
  },
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
assert.equal(byClass('directive-ship-chronometer-mission').length, 2);
for (const chronometer of byClass('directive-ship-chronometer-mission')) {
  assert.equal(chronometer.getAttribute('aria-label'), 'Current accepted ship time');
  assert.match(all(chronometer).map((node) => node.textContent || '').join(''), /Ship time08:37:39Stardate 53068\.4/);
}
assert.equal(all(body).filter((node) => node.dataset.directiveScrollOwner === 'true').length, 3);
const mobileAccordion = byClass('mission-mobile-accordion')[0];
const mobileTrigger = byClass('mission-mobile-trigger')[0];
const mobileDetail = byClass('mission-mobile-detail')[0];
assert.ok(mobileAccordion);
assert.ok(mobileTrigger);
assert.ok(mobileDetail);
assert.equal(mobileTrigger.getAttribute('aria-expanded'), 'true');
assert.equal(mobileTrigger.getAttribute('aria-controls'), mobileDetail.id);
assert.equal(mobileDetail.hidden, false);
assert.equal(all(mobileDetail).filter((node) => node.tagName === 'H2').length, 0, 'phone Mission detail must not repeat its trigger title');
assert.equal(byClass('mission-mobile-detail')[0].children[0].className.includes('mission-hero'), true);
assert.doesNotMatch(all(mobileDetail).map((node) => node.textContent || '').join(' '), /Current mission/i);
assert.match(all(mobileDetail).map((node) => node.textContent || '').join(' '), /Assume command and establish readiness/);
assert.match(all(mobileDetail).map((node) => node.textContent || '').join(' '), /Primary objectives/);
const replacementCount = body.replaceCount;
mobileTrigger.focus();
await mobileTrigger.click();
assert.equal(mobileTrigger.getAttribute('aria-expanded'), 'false');
assert.equal(mobileDetail.hidden, true);
assert.equal(body.replaceCount, replacementCount, 'Mission disclosure must not replace the route body');
assert.equal(byClass('mission-mobile-accordion')[0], mobileAccordion, 'Mission disclosure must retain list identity');
assert.equal(globalThis.document.activeElement, mobileTrigger, 'Mission disclosure must retain focus');
assert.match(text, /Prelude: A Ship Underway/);
assert.match(text, /Primary objectives/);
assert.match(text, /Optional objectives/);
assert.equal(byClass('is-resolved').length, 2, 'desktop and phone details must each render the resolved objective');
assert.doesNotMatch(text, /fraud/i);
assert.doesNotMatch(text, /percent|reconciliation|open world|recovery/i);

console.log('PASS certified Mission panel');
