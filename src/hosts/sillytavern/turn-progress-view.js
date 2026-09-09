import {partitionProgressRows, PROGRESS_PHASES} from './turn-progress-menu.mjs';
import {acquireDirectiveNotificationSurface, releaseDirectiveNotificationSurface} from '../../ui/directive-notification-surface.js';
import {appendDirectiveModal} from '../../ui/directive-overlay-root.js';

let card;
let launcher;
let dialog;
let latest;
let opener;

function node(tag, className, text = '') {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}
function text(el, value) {
  if (el.textContent !== value) el.textContent = value;
}
function button(label, action) {
  const el = node('button', 'directive-progress-action', label);
  el.type = 'button';
  el.addEventListener('click', action);
  return el;
}
function list(className = '') {
  return node('ul', `directive-turn-activity-history ${className}`);
}

// Reconcile by operation identity, retaining focused summaries and open disclosures.
function updateRows(container, rows, shared = null) {
  const existing = shared || new Map([...container.children].map(el => [el.dataset.rowId, el]));
  rows.forEach((row, index) => {
    let item = existing.get(row.id);
    if (!item) {
      item = node('li', 'directive-progress-item');
      item.dataset.rowId = row.id;
      const disclosure = node('details', 'directive-progress-operation');
      const line = node('summary', 'directive-progress-row');
      const dot = node('span', 'directive-progress-state-dot');
      dot.setAttribute('aria-hidden', 'true');
      line.append(dot, node('span', 'directive-progress-name'), node('span', 'directive-progress-status'), node('span', 'directive-progress-duration'));
      const body = node('div', 'directive-progress-breakdown');
      body.append(node('span', 'directive-progress-source'), list('directive-progress-children'));
      disclosure.append(line, body);
      item.append(disclosure, node('span', 'directive-progress-phase'));
    }
    existing.delete(row.id);
    item.dataset.outcome = row.state;
    item.dataset.waiting = String(row.phase === 'waiting-model');
    const line = item.querySelector('summary');
    const label = `${row.label}${row.count > 1 ? ` (${row.count} runs)` : ''}${row.attempt > 1 ? ` (attempt ${row.attempt})` : ''}`;
    const name = line.querySelector('.directive-progress-name');
    name.classList.toggle('directive-turn-activity-label', Boolean(row.primary));
    text(name, label);
    const states = {active: row.phase === 'waiting-model' ? 'Waiting' : 'Running', complete: 'Done', failed: 'Failed', canceled: 'Canceled', ended: 'Ended'};
    const status = `${states[row.state] || 'Ended'}${row.failures && row.state !== 'failed' ? ` / ${row.failures} failed` : ''}`;
    text(line.querySelector('.directive-progress-status'), status);
    line.querySelector('.directive-progress-status').classList.toggle('is-visually-hidden', ['active', 'complete'].includes(row.state) && !row.failures);
    text(line.querySelector('.directive-progress-state-dot'), row.state === 'complete' ? '✓' : row.state === 'failed' ? '×' : row.state === 'canceled' ? '−' : '');
    const elapsed = line.querySelector('.directive-progress-duration');
    elapsed.dataset.progressDuration = row.id;
    elapsed.setAttribute('aria-live', 'off');
    text(elapsed, row.duration || '');
    const phase = item.lastElementChild;
    text(phase, row.state === 'active' ? PROGRESS_PHASES[row.phase] || '' : '');
    phase.hidden = !phase.textContent;
    text(item.querySelector('.directive-progress-source'), row.source || 'Observed activity');
    updateRows(item.querySelector('.directive-progress-children'), row.children || [], shared);
    if (container.children[index] !== item) container.insertBefore(item, container.children[index] || null);
  });
  if (!shared) for (const item of existing.values()) item.remove();
}

function closeLog() {
  dialog?.close();
}
function showLog(event) {
  opener = event.currentTarget;
  if (!dialog) {
    dialog = node('dialog', 'directive-progress-log');
    dialog.id = 'directive-turn-progress-log';
    dialog.setAttribute('aria-labelledby', 'directive-turn-progress-log-title');
    const header = node('div', 'directive-progress-log-header');
    const title = node('h2', '', 'Turn activity');
    title.id = 'directive-turn-progress-log-title';
    header.append(title, button('Close', closeLog));
    dialog.append(header, node('p', 'directive-progress-log-total'), list('directive-progress-log-rows'));
    dialog.addEventListener('close', () => {
      const target = opener?.isConnected ? opener : launcher || card?.querySelector('.directive-progress-full-log');
      target?.focus();
    });
    appendDirectiveModal(dialog);
  }
  updateLog();
  dialog.showModal();
}
function updateLog() {
  if (!dialog || !latest) return;
  text(dialog.querySelector('.directive-progress-log-total'), `${latest.current ? 'Current activity' : 'Last activity'} · Total ${latest.total}`);
  updateRows(dialog.querySelector('.directive-progress-log-rows'), latest.rows);
}

export function renderProgressView(model) {
  latest = model;
  if (!model.current) {
    const hadFocus = card?.contains(document.activeElement);
    card?.remove();
    card = null;
    if (model.rows.length && !launcher?.isConnected) {
      launcher = button('Last turn activity', showLog);
      launcher.id = 'directive-turn-activity-log-launcher';
      acquireDirectiveNotificationSurface('activity').activitySlot.append(launcher);
    }
    if (!model.rows.length) clearProgressView();
    if (hadFocus) launcher?.focus();
    updateLog();
    return;
  }
  launcher?.remove();
  launcher = null;
  if (!card?.isConnected) {
    card = node('article', 'directive-notification-card directive-turn-activity-indicator is-activity');
    card.id = 'directive-turn-activity-indicator';
    const copy = node('div', 'directive-turn-activity-copy');
    const header = node('div', 'directive-progress-heading');
    const elapsed = node('span', 'directive-turn-activity-elapsed');
    elapsed.setAttribute('aria-live', 'off');
    header.append(node('span', 'directive-notification-category'), elapsed);
    const announcement = node('span', 'directive-progress-announcement is-visually-hidden');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    const earlier = node('details', 'directive-turn-activity-details');
    earlier.append(node('summary', '', 'Earlier activity'), list('directive-progress-earlier'));
    const footer = node('div', 'directive-progress-footer');
    const fullLog = button('View full log', showLog);
    fullLog.classList.add('directive-progress-full-log');
    footer.append(earlier, fullLog);
    copy.append(header, announcement, list('directive-progress-active'), list('directive-progress-recent'), footer);
    card.append(copy);
    acquireDirectiveNotificationSurface('activity').activitySlot.append(card);
  }
  card.dataset.directiveTurnActivity = 'active';
  card.dataset.directiveTurnActivityPhase = model.current.phase;
  text(card.querySelector('.directive-notification-category'), model.current.category);
  text(card.querySelector('.directive-turn-activity-elapsed'), `Total ${model.total}`);
  const {active, recent, earlier} = partitionProgressRows(model.rows);
  const visibleActive = active.map(row => {
    const currentContext = row.id === 'turn-context' && row.children?.some(child => child.id === model.current.phase);
    return {...row, label: currentContext ? model.current.title : row.label, primary: row.id === model.current.operationId || currentContext};
  });
  if (!visibleActive.some(row => row.primary)) {
    visibleActive.push({id: 'current-activity', label: model.current.title, state: 'active', duration: model.stageDuration, primary: true});
  }
  text(card.querySelector('.directive-progress-announcement'), visibleActive.map(row => `${row.label}. ${PROGRESS_PHASES[row.phase] || 'Running'}`).join('. '));
  const focused = card.contains(document.activeElement) ? document.activeElement : null;
  const pool = new Map([...card.querySelectorAll('.directive-progress-item')].map(item => [item.dataset.rowId, item]));
  updateRows(card.querySelector('.directive-progress-active'), visibleActive, pool);
  updateRows(card.querySelector('.directive-progress-recent'), recent, pool);
  updateRows(card.querySelector('.directive-progress-earlier'), earlier, pool);
  for (const item of pool.values()) item.remove();
  const disclosure = card.querySelector('.directive-turn-activity-details');
  disclosure.hidden = !earlier.length;
  text(disclosure.querySelector('summary'), `Earlier activity (${earlier.length})`);
  card.querySelector('.directive-progress-full-log').hidden = !model.rows.length;
  if (focused?.isConnected && document.activeElement !== focused) {
    for (let ancestor = focused.parentElement; ancestor && ancestor !== card; ancestor = ancestor.parentElement) {
      if (ancestor.tagName === 'DETAILS') ancestor.open = true;
    }
    focused.focus({preventScroll: true});
  }
  updateLog();
}

export function updateProgressClocks(model) {
  latest = model;
  if (card) text(card.querySelector('.directive-turn-activity-elapsed'), `Total ${model.total}`);
  const durations = new Map();
  const collect = rows => rows.forEach(row => {durations.set(row.id, row.duration || ''); collect(row.children || []);});
  collect(model.rows);
  durations.set('current-activity', model.stageDuration || '');
  for (const root of [card, dialog]) {
    for (const target of root?.querySelectorAll('[data-progress-duration]') || []) {
      const value = durations.get(target.dataset.progressDuration);
      if (value !== undefined) text(target, value);
    }
  }
  if (dialog) text(dialog.querySelector('.directive-progress-log-total'), `${model.current ? 'Current activity' : 'Last activity'} · Total ${model.total}`);
}

export function clearProgressView() {
  dialog?.close();
  dialog?.remove();
  card?.remove();
  launcher?.remove();
  card = launcher = dialog = latest = opener = null;
  releaseDirectiveNotificationSurface('activity');
}
