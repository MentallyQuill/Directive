import { PROGRESS_STAGES as STAGES, PROGRESS_PHASES, createProgressMenuRows, retainCompletedContextProgress } from './turn-progress-menu.mjs';
import {
  acquireDirectiveNotificationSurface,
  releaseDirectiveNotificationSurface,
} from '../../ui/directive-notification-surface.js';

const INDICATOR_ID = 'directive-turn-activity-indicator';
const DEFAULT_LABEL = 'Processing the turn...';
const MODEL_STAGES = new Set(['reviewing-events', 'reviewing-continuity', 'directing-story', 'reviewing-episode', 'updating-characters']);
const OUTCOMES = Object.freeze({ complete: 'Finished', failed: 'Failed', canceled: 'Canceled' });
let nextActivityId = 0;
const activeActivities = new Map();
const operations = new Map();
let history = [];
const archivedContext = new Map();
let sessionStartedAt = null;
let clockTimer = null;
const clock = () => performance.now();

function canRender() {
  return typeof document !== 'undefined' && Boolean(document?.body);
}

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function createIndicator() {
  const indicator = element('article', 'directive-notification-card directive-turn-activity-indicator is-activity');
  indicator.id = INDICATOR_ID;
  indicator.dataset.directiveTurnActivity = 'active';
  const copy = element('div', 'directive-turn-activity-copy');
  const category = element('span', 'directive-notification-category');
  const titleRow = element('span', 'directive-notification-title-row');
  titleRow.setAttribute('role', 'status');
  titleRow.setAttribute('aria-live', 'polite');
  titleRow.setAttribute('aria-atomic', 'true');
  const icon = element('span', 'directive-vector-glyph directive-notification-title-icon');
  icon.dataset.glyph = 'route-campaign';
  icon.setAttribute('aria-hidden', 'true');
  titleRow.append(icon, element('strong', 'directive-turn-activity-label'));
  const elapsed = element('span', 'directive-turn-activity-elapsed');
  elapsed.setAttribute('aria-live', 'off');
  const phase = element('span', 'directive-turn-activity-phase');
  phase.setAttribute('role', 'status');
  const concurrent = element('span', 'directive-turn-activity-concurrent');
  const details = element('details', 'directive-turn-activity-details');
  details.append(element('summary', '', 'Activity details'), element('ul', 'directive-turn-activity-history'));
  copy.append(category, titleRow, phase, elapsed, concurrent, details);
  indicator.appendChild(copy);
  acquireDirectiveNotificationSurface('activity').activitySlot.appendChild(indicator);
  return indicator;
}

function latestActivity() {
  return [...activeActivities.values()].at(-1) || null;
}

function presentation() {
  const activity = latestActivity();
  if (!activity) return null;
  const operation = [...operations.values()].at(-1);
  if (operation) return {
    category: 'Directive', phase: operation.stage, startedAt: operation.startedAt,
    detail: operation.phases?.length ? PROGRESS_PHASES[operation.phases.at(-1).phase] : '',
    title: `${STAGES[operation.stage]}...${operation.attempt > 1 ? ` (attempt ${operation.attempt})` : ''}`,
  };
  if (activity.phase === 'waiting' || activity.phase === 'receiving') return {
    category: 'SillyTavern', phase: activity.phase, startedAt: activity.phaseStartedAt,
    title: activity.phase === 'receiving' ? 'Receiving the reply...' : 'Waiting for the reply...',
  };
  return { category: 'Directive', phase: activity.phase, title: activity.label, startedAt: activity.phaseStartedAt };
}

function duration(start, end = clock()) {
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function renderClock() {
  const current = presentation();
  if (!current || !canRender()) return;
  const node = document.querySelector(`#${INDICATOR_ID} .directive-turn-activity-elapsed`);
  if (node) node.textContent = `This stage ${duration(current.startedAt)} · Total ${duration(sessionStartedAt)}`;
  const rows = createProgressMenuRows([...archivedContext.values(), ...history]);
  const durations = new Map(rows.flatMap(row => [row, ...(row.children || [])]).map(row => [row.id, row.duration]));
  const indicator = document.getElementById(INDICATOR_ID);
  for (const target of indicator?.querySelectorAll?.('[data-progress-duration]') || []) {
    const value = durations.get(target.dataset.progressDuration);
    if (value && target.textContent !== value) target.textContent = value;
  }
}

function trimHistory() {
  // Bound retained completed work without ever hiding an active operation.
  while (history.length > 40) {
    const index = history.findIndex(item => item.endedAt !== undefined);
    if (index < 0) break;
    retainCompletedContextProgress(archivedContext, history[index]);
    history.splice(index, 1);
  }
}

function renderProgressRow(row) {
  const item = element('li', 'directive-progress-item');
  item.dataset.outcome = row.state;
  const line = element('div', 'directive-progress-row');
  const dot = element('span', 'directive-progress-state-dot');
  dot.setAttribute('aria-hidden', 'true');
  const name = element('span', 'directive-progress-name', `${row.label}${row.count > 1 ? ` (${row.count} runs)` : ''}${row.attempt > 1 ? ` (attempt ${row.attempt})` : ''}`);
  if (row.source) name.append(element('small', 'directive-progress-source', row.source));
  const statusLabels = {active:'Running', complete:'Done', failed:'Failed', canceled:'Canceled', ended:'Ended'};
  const status = element('span', 'directive-progress-status', `${statusLabels[row.state] || 'Ended'}${row.failures && row.state !== 'failed' ? ` / ${row.failures} failed` : ''}`);
  const elapsed = element('span', 'directive-progress-duration', row.duration || '');
  if (row.duration) elapsed.dataset.progressDuration = row.id;
  line.append(dot, name, status, elapsed);
  item.append(line);
  if (row.children?.length) {
    const children = element('ul', 'directive-progress-children');
    children.append(...row.children.map(renderProgressRow));
    item.append(children);
  }
  return item;
}

function recordPhase(operation, event) {
  if (!MODEL_STAGES.has(operation.stage) || !Object.hasOwn(PROGRESS_PHASES, event.phase)) return;
  const startedAt = Number.isFinite(event.phaseStartedAt) ? event.phaseStartedAt : clock();
  const previous = operation.phases?.at(-1);
  const attempt = Number.isInteger(event.attempt) && event.attempt > 0 ? event.attempt : operation.attempt;
  if (previous?.phase === event.phase && previous.attempt === attempt) return;
  if (previous) {
    previous.endedAt = startedAt;
    previous.outcome = event.phase === 'validating-response' && previous.phase === 'waiting-model' ? 'complete' : 'ended';
  }
  operation.phases ||= [];
  operation.phases.push({phase:event.phase, attempt, startedAt});
}

function render() {
  const current = presentation();
  if (!current) {
    if (clockTimer !== null) clearInterval(clockTimer);
    clockTimer = null;
    history = [];
    archivedContext.clear();
    sessionStartedAt = null;
    if (canRender()) document.getElementById(INDICATOR_ID)?.remove?.();
    releaseDirectiveNotificationSurface('activity');
    return;
  }
  if (!canRender()) return;
  const indicator = document.getElementById(INDICATOR_ID) || createIndicator();
  indicator.hidden = false;
  indicator.dataset.directiveTurnActivityPhase = current.phase;
  const category = indicator.querySelector('.directive-notification-category');
  if (category.textContent !== current.category) category.textContent = current.category;
  const label = indicator.querySelector('.directive-turn-activity-label');
  if (label.textContent !== current.title) label.textContent = current.title;
  const phase = indicator.querySelector('.directive-turn-activity-phase');
  if (phase.textContent !== (current.detail || '')) phase.textContent = current.detail || '';
  phase.hidden = !current.detail;
  const concurrent = indicator.querySelector('.directive-turn-activity-concurrent');
  const others = [...operations.values()].slice(0, -1);
  concurrent.textContent = others.length ? `Also: ${others.map(item => STAGES[item.stage]).join('; ')}` : '';
  concurrent.hidden = others.length === 0;
  const list = indicator.querySelector('.directive-turn-activity-history');
  list.replaceChildren(...createProgressMenuRows([...archivedContext.values(), ...history]).map(renderProgressRow));
  const details = indicator.querySelector('.directive-turn-activity-details');
  details.hidden = history.length === 0;
  renderClock();
  if (clockTimer === null) clockTimer = setInterval(renderClock, 1000);
}

// Only allowlisted metadata crosses into this UI. Never retain model text or errors.
export function recordDirectiveTurnProgress(event = {}) {
  if (event.type === 'reset') {
    for (const operation of operations.values()) activeActivities.delete(operation.activityToken);
    operations.clear();
    history = [];
    archivedContext.clear();
    render();
    return;
  }
  if (typeof event.operationId !== 'string' || !event.operationId) return;
  if (event.type === 'start') {
    if (!Object.hasOwn(STAGES, event.stage) || !Number.isFinite(event.startedAt) || operations.has(event.operationId)) return;
    const operation = {
      operationId: event.operationId, stage: event.stage, startedAt: event.startedAt,
      attempt: Number.isInteger(event.attempt) && event.attempt > 0 ? event.attempt : 1,
    };
    recordPhase(operation, event);
    const alreadyVisible = activeActivities.size > 0;
    operations.set(event.operationId, operation);
    if (alreadyVisible) history.push(operation);
    // Model work can continue after narration. Give real operations their own
    // lifetime so a host end cannot dismiss still-running background work.
    if (alreadyVisible || MODEL_STAGES.has(operation.stage)) {
      operation.activityToken = markDirectiveTurnActivity({ phase: operation.stage });
    }
  } else {
    const operation = operations.get(event.operationId);
    if (!operation) return;
    if (event.type === 'update' && Number.isInteger(event.attempt) && event.attempt > operation.attempt) operation.attempt = event.attempt;
    if (event.type === 'update') recordPhase(operation, event);
    if (event.type === 'finish') {
      operation.endedAt = Number.isFinite(event.endedAt) ? event.endedAt : clock();
      operation.outcome = Object.hasOwn(OUTCOMES, event.outcome) ? event.outcome : 'failed';
      if (operation.phases?.length) Object.assign(operation.phases.at(-1), {endedAt:operation.endedAt, outcome:operation.outcome});
      operations.delete(event.operationId);
      activeActivities.delete(operation.activityToken);
    }
  }
  trimHistory();
  render();
}

export function markDirectiveTurnActivity({ label = DEFAULT_LABEL, phase = 'reading', hostGeneration = false } = {}) {
  const token = `directive-turn-${++nextActivityId}`;
  const startedAt = clock();
  if (!activeActivities.size) {
    sessionStartedAt = Math.min(startedAt, ...[...operations.values()].map(item => item.startedAt));
    history = [...operations.values()];
    archivedContext.clear();
  }
  activeActivities.set(token, { token, hostGeneration, label: String(label || DEFAULT_LABEL), phase: String(phase || 'reading'), phaseStartedAt: startedAt });
  render();
  return token;
}

export function updateDirectiveTurnActivity(token, { label = null, phase = null } = {}) {
  const activity = activeActivities.get(token);
  if (!activity) return { ok: false, reason: 'activity-unavailable' };
  if (label) activity.label = String(label);
  if (phase && phase !== activity.phase) {
    activity.phase = String(phase);
    activity.phaseStartedAt = clock();
  }
  render();
  return { ok: true, token };
}

export function clearDirectiveTurnActivity(token) {
  const removed = activeActivities.delete(token);
  render();
  return { ok: removed, token };
}

export function finishDirectiveTurnActivity(token) {
  return clearDirectiveTurnActivity(token);
}

export function cancelActiveDirectiveTurnActivities() {
  const count = activeActivities.size;
  activeActivities.clear();
  operations.clear();
  render();
  return { ok: true, canceled: count };
}

export function resolveDirectiveHostGenerationHandoff({ token } = {}) {
  const result = updateDirectiveTurnActivity(token, { phase: 'waiting' });
  if (result.ok) {
    history.push({ operationId: token, title: 'Waiting for the reply', startedAt: clock() });
    trimHistory();
    render();
  }
  return { ...result, handedOff: result.ok ? 1 : 0 };
}

// This proves receipt only, not that the host has rendered the chunk.
export function receiveDirectiveHostGenerationChunk() {
  for (const activity of activeActivities.values()) {
    if (activity.phase !== 'waiting') continue;
    const entry = history.find(item => item.operationId === activity.token && item.endedAt === undefined);
    if (entry) { entry.endedAt = clock(); entry.outcome = 'complete'; }
    history.push({ operationId: activity.token, title: 'Receiving the reply', startedAt: clock() });
    trimHistory();
    updateDirectiveTurnActivity(activity.token, { phase: 'receiving' });
  }
}

export function finishDirectiveHostGenerationActivities() {
  const tokens = [...activeActivities.values()]
    .filter(activity => activity.hostGeneration || activity.phase === 'waiting' || activity.phase === 'receiving')
    .map(activity => activity.token);
  for (const token of tokens) {
    for (const item of history.filter(item => item.operationId === token && item.endedAt === undefined)) {
      item.endedAt = clock();
      // Host end alone does not prove success (it also fires for errors).
      item.outcome = 'ended';
    }
    clearDirectiveTurnActivity(token);
  }
  return { ok: true, finished: tokens.length };
}

export function disposeDirectiveTurnActivity() {
  cancelActiveDirectiveTurnActivities();
}

export const __directiveTurnActivityTestHooks = Object.freeze({
  activeActivities: () => [...activeActivities.values()].map(activity => ({ ...activity })),
  progress: () => ({ rows: createProgressMenuRows([...archivedContext.values(), ...history]), presentation: presentation(), active: [...operations.values()].map(item => ({ ...item })), history: history.map(item => ({ ...item })) }),
});
