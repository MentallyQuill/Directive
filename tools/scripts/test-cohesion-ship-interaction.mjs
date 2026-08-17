import assert from 'node:assert/strict';
import { renderShipPanel } from '../../src/ui/ship-panel.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase(); this.children = []; this.dataset = {}; this.attributes = new Map();
    this.className = ''; this.textContent = ''; this.listeners = new Map(); this.style = { setProperty: () => {} };
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { const removed = new Set(names); this.className = this.className.split(/\s+/).filter((name) => name && !removed.has(name)).join(' '); },
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => { const active = force === undefined ? !this.classList.contains(name) : Boolean(force); if (active) this.classList.add(name); else this.classList.remove(name); return active; },
    };
  }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  async trigger(type) { for (const listener of this.listeners.get(type) || []) await listener({ currentTarget: this, preventDefault() {} }); }
  contains(candidate) { return candidate === this || this.children.some((child) => child.contains(candidate)); }
}

globalThis.document = {
  createElement: (tagName) => new FakeElement(tagName), createElementNS: (_namespace, tagName) => new FakeElement(tagName),
  createTextNode: (text) => Object.assign(new FakeElement('#text'), { textContent: text }), addEventListener: () => {}, querySelectorAll: () => [],
};

const makeTask = (id, title, segmentIds) => ({
  id, authored: false, title, level: segmentIds.length, reward: { cohesion: segmentIds.length * 5, segments: segmentIds.length },
  anchor: 'central', segmentIds,
  playerText: { situation: `${title} situation`, objective: `${title} objective`, whyItMatters: `${title} player reward`, operationalEffect: `${title} limitation` },
  currentPhase: { id: `${id}.phase`, label: `${title} next step` },
  phases: [{ id: `${id}.phase`, label: `${title} next step`, status: 'available' }],
  approaches: [`Discuss ${title}`], computerHelp: `Computer help for ${title}`,
  completion: { guidance: `Finish ${title}`, exclusions: [] }, binding: { mode: 'roleOnly', roles: {} },
});
const tasks = [makeTask('task.one', 'First Task', [0]), makeTask('task.two', 'Second Task', [1, 2])];
const projection = {
  kind: 'directive.playerProjection.v1', player: { kind: 'directive.playerIdentityProjection.v1' },
  time: { kind: 'directive.timePlayerProjection.v1', stardate: 53068.4, secondOfDay: 30600, clockDisplay: '08:30:00', stardateDisplay: '53068.4' },
  mission: { kind: 'directive.missionPlayerProjection.v1' }, people: { kind: 'directive.peoplePlayerProjection.v1' },
  commandBearing: { kind: 'directive.commandBearingPlayerProjection.v1', balance: 1, capacity: 3, pendingEdge: null, pendingCohesionRelief: null, latestSpend: null },
  ship: {
    kind: 'directive.shipPlayerProjection.v1', shipId: 'uss-breckenridge', name: 'U.S.S. Breckenridge', class: 'Intrepid-class', registry: 'NCC-74656',
    capabilitySummary: '', operationalStatus: { status: 'serviceable', summary: '', materialLimitations: [] }, systems: [], capabilities: [], constraints: [],
    cohesion: {
      total: 85, band: { id: 'ready', label: 'Ready' }, visibleTasks: tasks, backlog: { count: 0, cohesion: 0 }, completedHistory: [],
      segments: Array.from({ length: 20 }, (_, index) => ({ index, filled: index > 2, ...(index <= 2 ? { taskId: index === 0 ? 'task.one' : 'task.two' } : {}) })),
    },
  },
};
let reservedIssueId = null;
const body = new FakeElement('main');
renderShipPanel(body, { campaignState: {}, v1PlayerProjection: projection, activePackage: { assets: {} } }, {
  async reserveCohesionRelief({ issueId }) { reservedIssueId = issueId; return { applied: true }; },
});

const all = (root) => [root, ...root.children.flatMap(all)];
const byClass = (name) => all(body).filter((node) => node.classList.contains(name));
const textOf = (root) => all(root).map((node) => node.textContent || '').join(' ');
const buttons = byClass('ship-task-button');
const detail = byClass('ship-task-detail')[0];
const mobilePanels = byClass('ship-task-mobile-panel');
assert.equal(buttons.every(({ tagName }) => tagName === 'BUTTON'), true);
assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
assert.equal(buttons.every((button) => button.getAttribute('aria-expanded') === 'false'), true);
assert.equal(mobilePanels.length, buttons.length);
assert.equal(mobilePanels.every(({ hidden }) => hidden === true), true);
assert.match(textOf(detail), /First Task situation/);

await buttons[1].trigger('click');
assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
assert.match(textOf(detail), /Second Task situation/);
assert.match(textOf(detail), /\+10 Cohesion/);
assert.equal(buttons[1].getAttribute('aria-expanded'), 'true');
assert.equal(mobilePanels[1].hidden, false);
assert.equal(mobilePanels.filter(({ hidden }) => hidden === false).length, 1);
assert.equal(byClass('ship-task-mobile-panel')[1].children.some((node) => node.classList.contains('ship-task-detail-header')), false);

await buttons[0].trigger('click');
assert.equal(buttons[0].getAttribute('aria-expanded'), 'true');
assert.equal(buttons[1].getAttribute('aria-expanded'), 'false');
assert.equal(mobilePanels[0].hidden, false);
assert.equal(mobilePanels[1].hidden, true);

await buttons[0].trigger('click');
assert.equal(buttons[0].getAttribute('aria-expanded'), 'false');
assert.equal(mobilePanels.every(({ hidden }) => hidden === true), true);

await buttons[1].trigger('click');

await buttons[1].trigger('pointerenter');
assert.equal(byClass('ship-cohesion-segment').filter((segment) => segment.classList.contains('is-preview')).length, 2);
await buttons[1].trigger('pointerleave');
assert.equal(byClass('ship-cohesion-segment').filter((segment) => segment.classList.contains('is-preview')).length, 2, 'selected task remains previewed');

const reliefButton = detail.children.flatMap(all).find((node) => node.classList.contains('ship-command-relief-button'));
assert.equal(reliefButton.tagName, 'BUTTON');
await reliefButton.trigger('click');
assert.equal(reservedIssueId, 'task.two');

console.log('Cohesion Ship interactions passed.');
