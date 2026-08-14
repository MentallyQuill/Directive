import { runRuntimeAction } from '../runtime/runtime-actions.js';
import { refreshRuntimeSafely } from '../extension/runtime-mount.js';
import {
  acquireDirectiveNotificationSurface,
  releaseDirectiveNotificationSurface,
} from './directive-notification-surface.js';
import { createElement } from './runtime-ui-kit.js';

const MAX_VISIBLE = 3;
const DISPLAY_MS = 6000;
const EXIT_MS = 180;

let host = null;
let list = null;
let queued = [];
let visible = new Map();
let knownIds = new Set();
let clock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (id) => globalThis.clearTimeout(id),
};

function validRecord(record) {
  return Boolean(
    record
    && typeof record.id === 'string'
    && record.id.trim()
    && new Set(['mission', 'people', 'ship']).has(record.route)
    && typeof record.subjectId === 'string'
    && record.subjectId.trim()
    && typeof record.title === 'string'
    && record.title.trim()
  );
}

function ensureHost() {
  if (list?.parentNode) return host;
  const surface = acquireDirectiveNotificationSurface('gameplay');
  host = surface.host;
  list = surface.gameplaySlot;
  return host;
}

function routeLabel(route) {
  if (route === 'people') return 'People';
  if (route === 'ship') return 'Ship';
  return 'Mission';
}

function routeGlyph(route) {
  if (route === 'people') return 'route-crew';
  if (route === 'ship') return 'route-ship';
  return 'route-mission';
}

function createCard(entry) {
  const { record } = entry;
  const card = createElement('article', `directive-notification-card directive-gameplay-notification is-${record.route}`);
  card.dataset.notificationId = record.id;
  const dismiss = createElement('button', 'directive-gameplay-notification-dismiss');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', `Dismiss ${record.title} notification`);
  const category = createElement('span', 'directive-notification-category directive-gameplay-notification-category');
  category.textContent = `${routeLabel(record.route)} update`;
  const title = createElement('strong', 'directive-gameplay-notification-title');
  title.textContent = record.title;
  const titleRow = createElement('span', 'directive-notification-title-row');
  const titleIcon = createElement('span', 'directive-vector-glyph directive-notification-title-icon');
  titleIcon.dataset.glyph = routeGlyph(record.route);
  titleIcon.setAttribute('aria-hidden', 'true');
  titleRow.append(titleIcon, title);
  const summary = createElement('span', 'directive-gameplay-notification-summary');
  summary.textContent = record.summary || '';
  dismiss.append(category, titleRow, summary);
  const view = createElement('button', 'directive-gameplay-notification-view');
  view.type = 'button';
  view.setAttribute('aria-label', `View ${routeLabel(record.route)}`);
  view.title = `View ${routeLabel(record.route)}`;
  const icon = createElement('span', 'directive-vector-glyph directive-gameplay-notification-view-icon');
  icon.dataset.glyph = 'action-view';
  icon.setAttribute('aria-hidden', 'true');
  const viewText = createElement('span', 'directive-gameplay-notification-view-text');
  viewText.textContent = 'View';
  view.append(icon, viewText);
  card.append(dismiss, view);
  entry.card = card;
  dismiss.addEventListener('click', () => dismissEntry(entry, 'body'));
  card.addEventListener('pointerenter', () => pauseEntry(entry, 'hover'));
  card.addEventListener('pointerleave', () => resumeEntry(entry, 'hover'));
  view.addEventListener('focus', () => pauseEntry(entry, 'focus'));
  view.addEventListener('blur', () => resumeEntry(entry, 'focus'));
  view.addEventListener('click', async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!dismissEntry(entry, 'view')) return;
    try {
      await entry.onView(entry.record);
    } catch (error) {
      console.warn('[Directive] Notification route navigation failed:', error);
    }
  });
  return card;
}

function startEntryTimer(entry) {
  entry.startedAt = clock.now();
  entry.timerId = clock.setTimeout(() => dismissEntry(entry, 'timeout'), entry.remainingMs);
}

function pauseEntry(entry, reason) {
  if (entry.exiting || entry.pauseReasons.has(reason)) return;
  entry.pauseReasons.add(reason);
  if (entry.pauseReasons.size !== 1 || entry.timerId == null) return;
  entry.remainingMs = Math.max(0, entry.remainingMs - (clock.now() - entry.startedAt));
  clock.clearTimeout(entry.timerId);
  entry.timerId = null;
}

function resumeEntry(entry, reason) {
  if (entry.exiting || !entry.pauseReasons.has(reason)) return;
  entry.pauseReasons.delete(reason);
  if (entry.pauseReasons.size > 0 || entry.timerId != null) return;
  startEntryTimer(entry);
}

function clearEntryTimers(entry) {
  if (entry.timerId != null) clock.clearTimeout(entry.timerId);
  if (entry.exitTimerId != null) clock.clearTimeout(entry.exitTimerId);
  entry.timerId = null;
  entry.exitTimerId = null;
}

function dismissEntry(entry, reason) {
  if (!entry?.card || entry.exiting) return false;
  entry.exiting = true;
  entry.dismissReason = reason;
  if (entry.timerId != null) clock.clearTimeout(entry.timerId);
  entry.timerId = null;
  entry.card.classList.add('is-exiting');
  entry.exitTimerId = clock.setTimeout(() => {
    entry.card?.remove?.();
    visible.delete(entry.record.id);
    entry.exitTimerId = null;
    admitQueued();
    if (visible.size === 0 && queued.length === 0) {
      releaseDirectiveNotificationSurface('gameplay');
      host = null;
      list = null;
    }
  }, EXIT_MS);
  return true;
}

function showEntry(entry) {
  ensureHost();
  entry.pauseReasons = new Set();
  entry.remainingMs = DISPLAY_MS;
  visible.set(entry.record.id, entry);
  list.appendChild(createCard(entry));
  startEntryTimer(entry);
}

function admitQueued() {
  while (visible.size < MAX_VISIBLE && queued.length > 0) showEntry(queued.shift());
}

async function defaultViewRoute(record) {
  await runRuntimeAction('runtime.show');
  return runRuntimeAction('runtime.setTab', { tabId: record.route });
}

export function publishGameplayNotifications(records = [], { onView = defaultViewRoute } = {}) {
  for (const record of records) {
    if (!validRecord(record) || knownIds.has(record.id)) continue;
    knownIds.add(record.id);
    queued.push({ record: structuredClone(record), onView: typeof onView === 'function' ? onView : defaultViewRoute });
  }
  admitQueued();
  return { visible: visible.size, queued: queued.length };
}

export function resetGameplayNotifications(reason = 'reset') {
  for (const entry of visible.values()) {
    clearEntryTimers(entry);
    entry.card?.remove?.();
  }
  visible = new Map();
  queued = [];
  knownIds = new Set();
  releaseDirectiveNotificationSurface('gameplay');
  host = null;
  list = null;
  return { reset: true, reason };
}

export function handleGameplayNotificationUiMessage(message = {}) {
  if (message.type === 'directive.gameplayNotifications.reset.v1') {
    return resetGameplayNotifications(message.payload?.reason || 'runtime-reset');
  }
  if (message.type === 'directive.gameplayNotifications.publish.v1') {
    const published = publishGameplayNotifications(message.payload?.records || []);
    Promise.resolve(refreshRuntimeSafely()).catch((error) => {
      console.warn('[Directive] Runtime refresh after gameplay notification failed:', error);
    });
    return published;
  }
  return { handled: false };
}

export const __gameplayNotificationCenterTestHooks = Object.freeze({
  constants: { MAX_VISIBLE, DISPLAY_MS, EXIT_MS },
  state: () => ({ visible: visible.size, queued: queued.length, known: knownIds.size }),
  configureClock(nextClock) {
    if (!nextClock
      || typeof nextClock.now !== 'function'
      || typeof nextClock.setTimeout !== 'function'
      || typeof nextClock.clearTimeout !== 'function') {
      throw new TypeError('Gameplay notification test clock must provide now, setTimeout, and clearTimeout.');
    }
    clock = nextClock;
  },
});
