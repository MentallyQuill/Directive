import {
  acquireDirectiveNotificationSurface,
  releaseDirectiveNotificationSurface,
} from '../../ui/directive-notification-surface.js';

const INDICATOR_ID = 'directive-turn-activity-indicator';
const MIN_READING_VISIBLE_MS = 450;
const HANDOFF_CLEAR_DELAY_MS = 350;
const DEFAULT_LABEL = 'Directive is reading your post...';

let nextActivityId = 0;
const activeActivities = new Map();
const clearTimers = new Map();

function canRender() {
  return typeof document !== 'undefined' && Boolean(document?.body);
}

function createIndicator() {
  const indicator = document.createElement('article');
  indicator.id = INDICATOR_ID;
  indicator.className = 'directive-notification-card directive-turn-activity-indicator is-activity';
  indicator.dataset.directiveTurnActivity = 'active';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');

  const copy = document.createElement('div');
  copy.className = 'directive-turn-activity-copy';

  const category = document.createElement('span');
  category.className = 'directive-notification-category';

  const titleRow = document.createElement('span');
  titleRow.className = 'directive-notification-title-row';
  const icon = document.createElement('span');
  icon.className = 'directive-vector-glyph directive-notification-title-icon';
  icon.dataset.glyph = 'route-campaign';
  icon.setAttribute('aria-hidden', 'true');

  const label = document.createElement('strong');
  label.className = 'directive-turn-activity-label';

  titleRow.append(icon, label);
  copy.append(category, titleRow);
  indicator.appendChild(copy);
  acquireDirectiveNotificationSurface('activity').activitySlot.appendChild(indicator);
  return indicator;
}

function indicatorElement() {
  if (!canRender()) return null;
  return document.getElementById(INDICATOR_ID) || createIndicator();
}

function latestActivity() {
  return [...activeActivities.values()].at(-1) || null;
}

function activityPresentation(activity) {
  if (activity?.phase === 'writing') return { category: 'SillyTavern', title: 'Writing...' };
  if (activity?.phase === 'reading') return { category: 'Directive', title: 'Reading your post...' };
  return { category: 'Directive', title: activity?.label || DEFAULT_LABEL };
}

function render() {
  if (!canRender()) return;
  const activity = latestActivity();
  const existing = document.getElementById(INDICATOR_ID);
  if (!activity) {
    existing?.remove?.();
    releaseDirectiveNotificationSurface('activity');
    return;
  }
  const indicator = existing || indicatorElement();
  if (!indicator) return;
  indicator.hidden = false;
  indicator.dataset.directiveTurnActivityPhase = activity.phase;
  const presentation = activityPresentation(activity);
  const category = indicator.querySelector('.directive-notification-category');
  if (category) category.textContent = presentation.category;
  const label = indicator.querySelector('.directive-turn-activity-label');
  if (label) label.textContent = presentation.title;
}

function clearTimer(token) {
  const timer = clearTimers.get(token);
  if (timer) clearTimeout(timer);
  clearTimers.delete(token);
}

export function markDirectiveTurnActivity({ label = DEFAULT_LABEL, phase = 'reading' } = {}) {
  const token = `directive-turn-${++nextActivityId}`;
  activeActivities.set(token, {
    token,
    label: String(label || DEFAULT_LABEL),
    phase: String(phase || 'reading'),
    visibleAt: Date.now()
  });
  render();
  return token;
}

export function updateDirectiveTurnActivity(token, { label = null, phase = null } = {}) {
  const activity = activeActivities.get(token);
  if (!activity) return { ok: false, reason: 'activity-unavailable' };
  if (label) activity.label = String(label);
  if (phase) activity.phase = String(phase);
  render();
  return { ok: true, token };
}

export function clearDirectiveTurnActivity(token) {
  clearTimer(token);
  const removed = activeActivities.delete(token);
  render();
  return { ok: removed, token };
}

export function finishDirectiveTurnActivity(token) {
  return clearDirectiveTurnActivity(token);
}

export function cancelActiveDirectiveTurnActivities() {
  const count = activeActivities.size;
  for (const token of [...activeActivities.keys()]) clearDirectiveTurnActivity(token);
  return { ok: true, canceled: count };
}

export function resolveDirectiveHostGenerationHandoff() {
  const tokens = [...activeActivities.keys()];
  for (const token of tokens) {
    const activity = activeActivities.get(token);
    if (!activity) continue;
    clearTimer(token);
    const beginWriting = () => {
      if (!activeActivities.has(token)) return;
      updateDirectiveTurnActivity(token, {
        label: 'SillyTavern is writing...',
        phase: 'writing'
      });
      clearTimer(token);
      clearTimers.set(token, setTimeout(() => clearDirectiveTurnActivity(token), HANDOFF_CLEAR_DELAY_MS));
    };
    const remainingReadingMs = Math.max(0, MIN_READING_VISIBLE_MS - (Date.now() - activity.visibleAt));
    if (remainingReadingMs > 0) {
      clearTimers.set(token, setTimeout(beginWriting, remainingReadingMs));
    } else {
      beginWriting();
    }
  }
  return { ok: true, handedOff: tokens.length };
}

export function disposeDirectiveTurnActivity() {
  cancelActiveDirectiveTurnActivities();
  for (const timer of clearTimers.values()) clearTimeout(timer);
  clearTimers.clear();
  const indicator = canRender() ? document.getElementById(INDICATOR_ID) : null;
  indicator?.remove?.();
  releaseDirectiveNotificationSurface('activity');
}

export const __directiveTurnActivityTestHooks = Object.freeze({
  activeActivities() {
    return [...activeActivities.values()].map((activity) => ({ ...activity }));
  }
});
