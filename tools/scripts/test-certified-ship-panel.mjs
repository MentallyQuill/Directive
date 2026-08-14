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
    this.listeners = new Map();
    this.style = { setProperty: () => {} };
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { const removed = new Set(names); this.className = this.className.split(/\s+/).filter((name) => name && !removed.has(name)).join(' '); },
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => { const enabled = force === undefined ? !this.classList.contains(name) : Boolean(force); if (enabled) this.classList.add(name); else this.classList.remove(name); return enabled; },
    };
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'class') this.className = String(value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  click() { this.listeners.get('click')?.({ currentTarget: this, preventDefault() {} }); }
  querySelector(selector) {
    if (!selector.startsWith('.')) return null;
    const className = selector.slice(1);
    return all(this).find((node) => node.classList.contains(className)) || null;
  }
  contains(candidate) { return candidate === this || this.children.some((child) => child.contains(candidate)); }
}

globalThis.document = {
  createElement: (tagName) => new Element(tagName),
  createElementNS: (_namespace, tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text }),
  addEventListener: () => {},
  querySelectorAll: () => [],
};

const task = (id, title, level, anchor, primaryFamily) => ({
  id, authored: false, title, level, primaryFamily, reward: { cohesion: level * 5, segments: level }, anchor,
  segmentIds: Array.from({ length: level }, (_, index) => index + 5),
  playerText: {
    situation: `${title} needs the commander.`, objective: `Resolve ${title}.`,
    whyItMatters: `${title} gives the player a useful operational option.`,
    operationalEffect: `${title} currently limits the relevant team.`,
  },
  currentPhase: { id: 'phase.1', label: 'Speak with the team' },
  phases: [{ id: 'phase.1', label: 'Speak with the team', status: 'available' }],
  approaches: ['meet privately', 'delegate a drill'],
  computerHelp: `The computer can identify who and where to ask about ${title}.`,
  completion: { guidance: `Complete after ${title} has a visible result.`, exclusions: ['A vague order is insufficient.'] },
  binding: { mode: 'backgroundOnly', crew: { id: 'crew.ari', name: 'Ari Chen' } },
});

const visibleTasks = [
  task('issue.watch', 'The Missed Watch', 1, 'crew', 'personnel'),
  task('issue.handoff', 'The Handoff Gap', 1, 'central', 'coordination'),
  task('issue.drill', 'Damage Control Drill', 2, 'engineering', 'training'),
];
const projection = {
  kind: 'directive.playerProjection.v1',
  player: { kind: 'directive.playerIdentityProjection.v1' },
  mission: { kind: 'directive.missionPlayerProjection.v1' },
  people: { kind: 'directive.peoplePlayerProjection.v1' },
  commandBearing: {
    kind: 'directive.commandBearingPlayerProjection.v1', balance: 1, capacity: 3,
    pendingEdge: null, pendingCohesionRelief: null, latestSpend: null,
  },
  ship: {
    kind: 'directive.shipPlayerProjection.v1', shipId: 'uss-breckenridge', name: 'U.S.S. Breckenridge',
    class: 'Intrepid-class', registry: 'NCC-74656', capabilitySummary: 'Explorer.',
    operationalStatus: { status: 'serviceable', summary: 'Old summary.', readiness: null, materialLimitations: [], readinessObjectiveLink: null },
    systems: [], constraints: [], capabilities: [],
    cohesion: {
      total: 65, band: { id: 'strained', label: 'Strained' },
      segments: Array.from({ length: 20 }, (_, index) => ({ index, filled: index >= 6, ...(index < 6 ? { taskId: visibleTasks[index % 3].id } : {}) })),
      visibleTasks,
      backlog: { count: 4, cohesion: 25 },
      completedHistory: [{ id: 'done.1', title: 'Recovered the lost pet', cohesionRestored: 5, method: 'quest' }],
    },
  },
};

const body = new Element('div');
renderShipPanel(body, {
  campaignState: {}, v1PlayerProjection: projection,
  activePackage: { assets: { images: [{ id: 'ship.cohesion', kind: 'ship.cohesion', subjectId: 'uss-breckenridge', variants: { hero: 'ship.png' }, alt: 'Breckenridge' }] } },
}, {});

function all(root) { return [root, ...root.children.flatMap(all)]; }
const nodes = all(body);
const byClass = (className) => nodes.filter((node) => node.className.split(/\s+/).includes(className));
const text = nodes.map((node) => node.textContent || '').join(' ');

assert.equal(byClass('ship-cohesion-workspace').length, 1);
assert.equal(byClass('ship-cohesion-ring').length, 1);
assert.equal(byClass('ship-cohesion-segment').length, 20);
assert.equal(byClass('ship-cohesion-ring-layer').length, 2);
assert.equal(byClass('is-back').filter((node) => node.classList.contains('ship-cohesion-ring-layer')).length, 1);
assert.equal(byClass('is-front').filter((node) => node.classList.contains('ship-cohesion-ring-layer')).length, 1);
const logicalSegments = byClass('ship-cohesion-segment');
const segmentShapes = byClass('ship-cohesion-segment-shape');
assert.equal(logicalSegments.every(({ tagName }) => tagName === 'G'), true);
assert.equal(logicalSegments.every((segment) => segment.getAttribute('role') === 'listitem'), true);
assert.equal(segmentShapes.length, 40);
assert.equal(byClass('is-desktop').filter((node) => node.classList.contains('ship-cohesion-segment-shape')).length, 20);
assert.equal(byClass('is-mobile').filter((node) => node.classList.contains('ship-cohesion-segment-shape')).length, 20);
assert.equal(segmentShapes.every(({ tagName }) => tagName === 'PATH'), true);
assert.equal(segmentShapes.every((shape) => (shape.getAttribute('d') || '').trim().endsWith('Z')), true);
assert.equal(segmentShapes.every((shape) => ((shape.getAttribute('d') || '').match(/\bA\b/g) || []).length === 2), true);
assert.equal(segmentShapes.every((shape) => ((shape.getAttribute('d') || '').match(/\bQ\b/g) || []).length === 4), true);
assert.equal(byClass('ship-task-button').length, 3);
assert.equal(byClass('ship-task-button').every((button) => !/ship-task-position-/.test(button.className)), true);
assert.equal(byClass('ship-task-mobile-panel').length, 3);
assert.equal(byClass('ship-task-mobile-panel').every(({ hidden }) => hidden === true), true);
assert.equal(byClass('ship-task-button').every((button) => button.getAttribute('aria-expanded') === 'false'), true);
assert.equal(byClass('ship-task-leaders').length, 1);
assert.equal(byClass('ship-task-leader').length, 3);
assert.equal(byClass('ship-task-leader').every(({ tagName }) => tagName === 'POLYLINE'), true);
assert.equal(byClass('ship-task-detail').length, 1);
assert.equal(byClass('ship-task-category-icon').length, 4);
assert.deepEqual(
  byClass('ship-task-category-icon').map((icon) => icon.dataset.category),
  ['personnel', 'coordination', 'training', 'personnel'],
);
assert.equal(byClass('ship-task-category-icon').every((icon) => icon.getAttribute('aria-hidden') === 'true'), true);
assert.equal(nodes.filter((node) => node.dataset.directiveScrollOwner === 'true').length, 1);
assert.match(text, /Cohesion 65/);
assert.match(text, /Strained/);
assert.match(text, /The Missed Watch/);
assert.match(text, /Why it matters to you/);
assert.match(text, /How to pursue it/);
assert.match(text, /always ask the ship's computer for help/i);
assert.match(text, /4 more issues queued/i);
assert.match(text, /Recovered the lost pet/);
assert.doesNotMatch(text, /Why this state|Gameplay effect|Operational status|Material limitations|Active constraints/i);
assert.equal(byClass('ship-hero').length, 0);
assert.equal(byClass('ship-system-card').length, 0);

byClass('ship-task-button')[1].click();
assert.equal(
  byClass('ship-task-detail')[0].querySelector('.ship-task-category-icon')?.dataset.category,
  'coordination',
  'task selection updates the detail title icon',
);
assert.equal(byClass('ship-task-button')[1].getAttribute('aria-expanded'), 'true');
assert.equal(byClass('ship-task-mobile-panel')[1].hidden, false);
assert.equal(byClass('ship-task-mobile-panel').filter(({ hidden }) => hidden === false).length, 1);
assert.equal(byClass('ship-task-mobile-panel')[1].querySelector('.ship-task-detail-header'), null, 'inline details omit the repeated task header');

byClass('ship-task-button')[0].click();
assert.equal(byClass('ship-task-button')[0].getAttribute('aria-expanded'), 'true');
assert.equal(byClass('ship-task-button')[1].getAttribute('aria-expanded'), 'false');
assert.equal(byClass('ship-task-mobile-panel')[0].hidden, false);
assert.equal(byClass('ship-task-mobile-panel')[1].hidden, true);

byClass('ship-task-button')[0].click();
assert.equal(byClass('ship-task-button')[0].getAttribute('aria-expanded'), 'false');
assert.equal(byClass('ship-task-mobile-panel').every(({ hidden }) => hidden === true), true);

console.log('PASS certified Cohesion Ship panel');
