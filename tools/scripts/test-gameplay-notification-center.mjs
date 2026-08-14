import assert from 'node:assert/strict';

import {
  __gameplayNotificationCenterTestHooks,
  handleGameplayNotificationUiMessage,
  publishGameplayNotifications,
  resetGameplayNotifications,
} from '../../src/ui/gameplay-notification-center.js';
import {
  __directiveRuntimeActionTestHooks,
  registerRuntimeAction,
} from '../../src/runtime/runtime-actions.js';

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
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.dataset = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.textContent = '';
  }
  get id() { return this.attributes.get('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, handler) {
    const handlers = this.eventListeners.get(type) || [];
    handlers.push(handler);
    this.eventListeners.set(type, handlers);
  }
  async dispatch(type) {
    const event = { type, preventDefault() {}, stopPropagation() {}, currentTarget: this, target: this };
    for (const handler of this.eventListeners.get(type) || []) await handler(event);
  }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    return this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html', this);
    this.body = new FakeElement('body', this);
    this.documentElement.appendChild(this.body);
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  getElementById(id) { return this.documentElement.querySelector(`#${id}`); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
}

class FakeClock {
  constructor() { this.time = 0; this.nextId = 1; this.tasks = new Map(); }
  now = () => this.time;
  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.tasks.set(id, { callback, at: this.time + delay });
    return id;
  };
  clearTimeout = (id) => { this.tasks.delete(id); };
  advance(milliseconds) {
    const target = this.time + milliseconds;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!next) break;
      const [id, task] = next;
      this.tasks.delete(id);
      this.time = task.at;
      task.callback();
    }
    this.time = target;
  }
}

globalThis.document = new FakeDocument();

const missionRecord = Object.freeze({
  id: 'mission.objectiveComplete.mission.alpha.2.objective.signal',
  route: 'mission',
  subjectId: 'mission.alpha',
  kind: 'objectiveComplete',
  title: 'Objective complete',
  summary: 'The signal source was located.',
  priority: 70,
  sourceRevision: 'mission:2;story:1',
});

resetGameplayNotifications('test-start');
publishGameplayNotifications([missionRecord], { onView: async () => {} });

assert.equal(
  document.querySelectorAll('.directive-gameplay-notification').length,
  1,
  'publishing one record should render one compact notification card',
);

await document.querySelector('.directive-gameplay-notification-dismiss').dispatch('click');
assert.equal(
  document.querySelector('.directive-gameplay-notification').classList.contains('is-exiting'),
  true,
  'clicking the notification body should start immediate fade dismissal',
);

resetGameplayNotifications('view-test');
let viewedRoute = null;
publishGameplayNotifications([missionRecord], {
  onView: async (record) => { viewedRoute = record.route; },
});
const viewButton = document.querySelector('.directive-gameplay-notification-view');
await viewButton.dispatch('click');
assert.equal(viewedRoute, 'mission', 'View should route through the notification record after dismissing');
assert.equal(
  document.querySelector('.directive-gameplay-notification-dismiss').querySelector('button'),
  null,
  'the broad dismiss control must not contain the sibling View button',
);

resetGameplayNotifications('timer-test');
const clock = new FakeClock();
__gameplayNotificationCenterTestHooks.configureClock(clock);
publishGameplayNotifications([missionRecord], { onView: async () => {} });
clock.advance(5999);
assert.equal(document.querySelector('.directive-gameplay-notification').classList.contains('is-exiting'), false);
clock.advance(1);
assert.equal(
  document.querySelector('.directive-gameplay-notification').classList.contains('is-exiting'),
  true,
  'a notification should begin fading after exactly six seconds of active display',
);
clock.advance(180);
assert.equal(document.querySelector('.directive-gameplay-notification'), null, 'the card should leave the DOM after its fade');

resetGameplayNotifications('pause-test');
publishGameplayNotifications([missionRecord], { onView: async () => {} });
const pausedCard = document.querySelector('.directive-gameplay-notification');
clock.advance(3000);
await pausedCard.dispatch('pointerenter');
clock.advance(6000);
assert.equal(pausedCard.classList.contains('is-exiting'), false, 'hover should pause the active display timer');
await pausedCard.dispatch('pointerleave');
clock.advance(2999);
assert.equal(pausedCard.classList.contains('is-exiting'), false);
clock.advance(1);
assert.equal(pausedCard.classList.contains('is-exiting'), true, 'leaving should resume only the remaining display time');

resetGameplayNotifications('queue-test');
const records = Array.from({ length: 5 }, (_, index) => ({
  ...missionRecord,
  id: `${missionRecord.id}.${index}`,
  subjectId: `mission.${index}`,
  title: `Objective complete ${index + 1}`,
}));
publishGameplayNotifications(records, { onView: async () => {} });
assert.deepEqual(
  __gameplayNotificationCenterTestHooks.state(),
  { visible: 3, queued: 2, known: 5 },
  'the center should cap the visible stack at three and queue overflow',
);
publishGameplayNotifications(records, { onView: async () => {} });
assert.deepEqual(
  __gameplayNotificationCenterTestHooks.state(),
  { visible: 3, queued: 2, known: 5 },
  'duplicate authoritative IDs should not enter the queue twice',
);
await document.querySelector('.directive-gameplay-notification-dismiss').dispatch('click');
clock.advance(180);
assert.deepEqual(
  __gameplayNotificationCenterTestHooks.state(),
  { visible: 3, queued: 1, known: 5 },
  'a dismissed slot should admit the next queued notification',
);

resetGameplayNotifications('focus-pause-test');
publishGameplayNotifications([missionRecord], { onView: async () => {} });
const focusPausedCard = document.querySelector('.directive-gameplay-notification');
const focusPausedView = focusPausedCard.querySelector('.directive-gameplay-notification-view');
clock.advance(2000);
await focusPausedCard.dispatch('pointerenter');
await focusPausedView.dispatch('focus');
await focusPausedCard.dispatch('pointerleave');
clock.advance(5000);
assert.equal(focusPausedCard.classList.contains('is-exiting'), false, 'View focus should keep a hovered timer paused');
await focusPausedView.dispatch('blur');
clock.advance(3999);
assert.equal(focusPausedCard.classList.contains('is-exiting'), false);
clock.advance(1);
assert.equal(focusPausedCard.classList.contains('is-exiting'), true, 'blur resumes the exact remaining time');

resetGameplayNotifications('message-refresh-test');
__directiveRuntimeActionTestHooks.clearRuntimeActions();
let refreshCount = 0;
registerRuntimeAction('runtime.refresh', async () => { refreshCount += 1; });
handleGameplayNotificationUiMessage({
  type: 'directive.gameplayNotifications.publish.v1',
  payload: { records: [missionRecord] },
});
await Promise.resolve();
await Promise.resolve();
assert.equal(refreshCount, 1, 'publishing a committed notification must refresh an already-open runtime panel');
__directiveRuntimeActionTestHooks.clearRuntimeActions();

resetGameplayNotifications('test-end');
console.log('Directive gameplay notification center tests passed.');
