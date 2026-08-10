import { appendDirectiveOverlay } from '../../ui/directive-overlay-root.js';

const INDICATOR_ID = 'directive-turn-activity-indicator';
const REVEAL_DELAY_MS = 350;
const HANDOFF_CLEAR_DELAY_MS = 150;
const DEFAULT_LABEL = 'Directive is reading your post...';

let nextActivityId = 0;
const activeActivities = new Map();
const clearTimers = new Map();
let revealTimer = null;

function canRender() {
  return typeof document !== 'undefined' && Boolean(document?.body);
}

function createIndicator() {
  const indicator = document.createElement('div');
  indicator.id = INDICATOR_ID;
  indicator.className = 'directive-turn-activity-indicator';
  indicator.dataset.directiveTurnActivity = 'active';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.hidden = true;

  const spinner = document.createElement('span');
  spinner.className = 'directive-turn-activity-spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const label = document.createElement('strong');
  label.className = 'directive-turn-activity-label';
  label.textContent = DEFAULT_LABEL;

  indicator.append(spinner, label);
  appendDirectiveOverlay(indicator, { fallbackParent: document.body });
  return indicator;
}

function indicatorElement() {
  if (!canRender()) return null;
  return document.getElementById(INDICATOR_ID) || createIndicator();
}

function latestActivity() {
  return [...activeActivities.values()].at(-1) || null;
}

function render(delayMs = REVEAL_DELAY_MS) {
  if (!canRender()) return;
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
  const show = () => {
    const indicator = indicatorElement();
    const activity = latestActivity();
    if (!indicator) return;
    indicator.hidden = !activity;
    if (!activity) return;
    indicator.dataset.directiveTurnActivityPhase = activity.phase;
    const label = indicator.querySelector('.directive-turn-activity-label');
    if (label) label.textContent = activity.label;
  };
  if (delayMs > 0 && latestActivity()) {
    revealTimer = setTimeout(show, delayMs);
  } else {
    show();
  }
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
    phase: String(phase || 'reading')
  });
  render();
  return token;
}

export function updateDirectiveTurnActivity(token, { label = null, phase = null } = {}) {
  const activity = activeActivities.get(token);
  if (!activity) return { ok: false, reason: 'activity-unavailable' };
  if (label) activity.label = String(label);
  if (phase) activity.phase = String(phase);
  render(0);
  return { ok: true, token };
}

export function clearDirectiveTurnActivity(token) {
  clearTimer(token);
  const removed = activeActivities.delete(token);
  render(0);
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
    updateDirectiveTurnActivity(token, {
      label: 'SillyTavern is writing...',
      phase: 'writing'
    });
    clearTimer(token);
    clearTimers.set(token, setTimeout(() => clearDirectiveTurnActivity(token), HANDOFF_CLEAR_DELAY_MS));
  }
  return { ok: true, handedOff: tokens.length };
}

export function disposeDirectiveTurnActivity() {
  cancelActiveDirectiveTurnActivities();
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = null;
  for (const timer of clearTimers.values()) clearTimeout(timer);
  clearTimers.clear();
  const indicator = canRender() ? document.getElementById(INDICATOR_ID) : null;
  indicator?.remove?.();
}

export const __directiveTurnActivityTestHooks = Object.freeze({
  activeActivities() {
    return [...activeActivities.values()].map((activity) => ({ ...activity }));
  }
});
