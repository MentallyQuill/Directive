const DIRECTIVE_TURN_ACTIVITY_ID = 'directive-turn-activity-indicator';
const DEFAULT_REVEAL_DELAY_MS = 350;

let nextActivityId = 0;
const activeActivities = new Map();
let revealTimer = null;

function canUseDocument() {
  return typeof document !== 'undefined' && document?.body;
}

function createSpinner() {
  const spinner = document.createElement('span');
  spinner.className = 'directive-turn-activity-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  return spinner;
}

function createIndicator() {
  const indicator = document.createElement('div');
  indicator.id = DIRECTIVE_TURN_ACTIVITY_ID;
  indicator.className = 'directive-turn-activity-indicator';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.hidden = true;

  const label = document.createElement('strong');
  label.className = 'directive-turn-activity-label';
  label.textContent = 'Directive is interpreting your order...';

  indicator.append(createSpinner(), label);
  document.body.appendChild(indicator);
  return indicator;
}

function indicatorElement() {
  if (!canUseDocument()) return null;
  return document.getElementById(DIRECTIVE_TURN_ACTIVITY_ID) || createIndicator();
}

function latestActivity() {
  return [...activeActivities.values()].at(-1) || null;
}

function clearRevealTimer() {
  if (revealTimer !== null) {
    globalThis.clearTimeout?.(revealTimer);
    revealTimer = null;
  }
}

function setIndicatorVisible(visible) {
  const indicator = indicatorElement();
  if (!indicator) return;
  indicator.hidden = !visible;
  indicator.dataset.directiveTurnActivity = visible ? 'active' : 'idle';
  const label = indicator.querySelector?.('.directive-turn-activity-label');
  const activity = latestActivity();
  if (label && activity?.label) label.textContent = activity.label;
}

function updateIndicator(delayMs = DEFAULT_REVEAL_DELAY_MS) {
  if (!canUseDocument()) return;
  if (activeActivities.size === 0) {
    clearRevealTimer();
    setIndicatorVisible(false);
    return;
  }
  const indicator = indicatorElement();
  if (!indicator) return;
  const label = indicator.querySelector?.('.directive-turn-activity-label');
  const activity = latestActivity();
  if (label && activity?.label) label.textContent = activity.label;
  if (!indicator.hidden) return;
  if (revealTimer !== null) return;
  revealTimer = globalThis.setTimeout?.(() => {
    revealTimer = null;
    if (activeActivities.size > 0) setIndicatorVisible(true);
  }, Math.max(0, Number(delayMs) || 0));
}

export function markDirectiveTurnActivity({
  label = 'Directive is interpreting your order...',
  delayMs = DEFAULT_REVEAL_DELAY_MS
} = {}) {
  const token = `directive-turn-activity-${++nextActivityId}`;
  activeActivities.set(token, {
    label,
    startedAt: Date.now()
  });
  updateIndicator(delayMs);
  return token;
}

export function clearDirectiveTurnActivity(token) {
  if (token) activeActivities.delete(token);
  updateIndicator();
}

export function disposeDirectiveTurnActivity() {
  activeActivities.clear();
  clearRevealTimer();
  const indicator = canUseDocument() ? document.getElementById(DIRECTIVE_TURN_ACTIVITY_ID) : null;
  indicator?.remove?.();
}

export const __directiveTurnActivityTestHooks = Object.freeze({
  DIRECTIVE_TURN_ACTIVITY_ID,
  activeCount: () => activeActivities.size,
  updateIndicator
});
