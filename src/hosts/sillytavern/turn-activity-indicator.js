import { runRuntimeAction } from '../../runtime/runtime-actions.js';

const DIRECTIVE_TURN_ACTIVITY_ID = 'directive-turn-activity-indicator';
const DEFAULT_REVEAL_DELAY_MS = 350;
const DEFAULT_LABEL = 'Directive is reading your post...';
const BACKGROUND_LABEL = 'Updating campaign context...';
const REVIEW_LABEL = 'Campaign context needs review.';
const SETTLED_CLEAR_DELAY_MS = 900;
const REVIEW_CLEAR_DELAY_MS = 8000;

const SIDECAR_SETTLED_STATUSES = new Set(['applied', 'noChange', 'complete', 'settled', 'skipped']);
const SIDECAR_REVIEW_STATUSES = new Set(['failed', 'rejected', 'error']);

const WORKER_LABELS = Object.freeze({
  continuity: 'Continuity',
  relationship: 'Crew Bonds',
  crew: 'Crew',
  ship: 'Ship',
  commandBearing: 'Command Bearing',
  missionDirector: 'Mission',
  promptUpdate: 'Prompt'
});

let nextActivityId = 0;
const activeActivities = new Map();
let revealTimer = null;
const clearTimers = new Map();

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
  label.textContent = DEFAULT_LABEL;

  const body = document.createElement('span');
  body.className = 'directive-turn-activity-body';

  const chips = document.createElement('span');
  chips.className = 'directive-turn-activity-chips';
  chips.setAttribute('aria-hidden', 'true');

  const actions = document.createElement('span');
  actions.className = 'directive-turn-activity-actions';

  const openMission = document.createElement('button');
  openMission.type = 'button';
  openMission.className = 'directive-turn-activity-action';
  openMission.textContent = 'Open Mission';
  openMission.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await runRuntimeAction('runtime.setTab', { tabId: 'mission' });
      await runRuntimeAction('runtime.open');
    } catch (error) {
      console.warn('[Directive] Failed to open Mission for activity review:', error);
    }
  });

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'directive-turn-activity-action';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const activity = latestActivity();
    if (activity?.token) {
      clearActivity(activity.token);
      updateIndicator(0);
    }
  });

  actions.append(openMission, dismiss);
  body.append(label, chips, actions);
  indicator.append(createSpinner(), body);
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

function clearActivityTimer(token) {
  const timer = clearTimers.get(token);
  if (timer !== undefined) {
    globalThis.clearTimeout?.(timer);
    clearTimers.delete(token);
  }
}

function clearActivity(token) {
  clearActivityTimer(token);
  activeActivities.delete(token);
}

function normalizeWorkerKey(value) {
  return String(value || '').trim();
}

function workerLabel(workerKey) {
  const key = normalizeWorkerKey(workerKey);
  return WORKER_LABELS[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (match) => match.toUpperCase());
}

function labelForClassification(classification) {
  switch (classification) {
    case 'sceneNavigation':
      return 'Directive is advancing the scene...';
    case 'sceneColor':
    case 'noDirectiveAction':
      return 'Directive is reading the scene...';
    case 'routineCommand':
      return 'Directive is logging the action...';
    case 'counselRequest':
      return 'Directive is filing an advisory note...';
    case 'clarificationNeeded':
      return 'Directive is preparing a clarification...';
    case 'riskConfirmationNeeded':
      return 'Directive is preparing a checkpoint...';
    case 'consequentialCommand':
    case 'directorResponseNeeded':
      return 'Directive is resolving the command...';
    default:
      return 'Directive is routing the turn...';
  }
}

function labelForPhase(event = {}, activity = {}) {
  if (event.label) return String(event.label);
  if (event.mode === 'review' || event.phase === 'recovery' || activity.mode === 'review') return REVIEW_LABEL;
  switch (event.phase) {
    case 'reading':
      return DEFAULT_LABEL;
    case 'classifying':
      return 'Directive is checking intent...';
    case 'classified':
    case 'routing':
      return labelForClassification(event.classification || activity.classification);
    case 'scene':
      return event.classification === 'sceneNavigation'
        ? 'Directive is advancing the scene...'
        : 'Directive is reading the scene...';
    case 'routine':
      return 'Directive is logging the action...';
    case 'counsel':
      return 'Directive is filing an advisory note...';
    case 'pause':
      return labelForClassification(event.classification || activity.classification);
    case 'directorReview':
      return 'Directive is reviewing the command...';
    case 'committingOutcome':
      return 'Directive is committing outcome mechanics...';
    case 'writingResponse':
      return 'Directive is writing the response...';
    case 'delegatingHostGeneration':
      return 'Directive is handing the scene back to chat...';
    case 'syncingPrompt':
      return 'Directive is syncing campaign context...';
    case 'postCommitConversation':
      return 'Directive is updating narrative context...';
    case 'sidecarsQueued':
    case 'sidecarsRunning':
    case 'sidecarWorker':
      return BACKGROUND_LABEL;
    case 'sidecarsSettled':
      return 'Campaign context updated.';
    default:
      return activity.label || DEFAULT_LABEL;
  }
}

function activeSidecarEntries(activity = {}) {
  return [...(activity.sidecars || new Map()).entries()];
}

function hasReviewSidecar(activity = {}) {
  return activeSidecarEntries(activity).some(([, sidecar]) => SIDECAR_REVIEW_STATUSES.has(sidecar.status));
}

function hasPendingSidecar(activity = {}) {
  return activeSidecarEntries(activity).some(([, sidecar]) => !SIDECAR_REVIEW_STATUSES.has(sidecar.status));
}

function renderChips(chips, activity = {}) {
  if (!chips) return;
  chips.replaceChildren();
  const entries = activeSidecarEntries(activity);
  chips.hidden = entries.length === 0;
  for (const [workerKey, sidecar] of entries) {
    const chip = document.createElement('span');
    const status = sidecar.status || 'queued';
    chip.className = 'directive-turn-activity-chip';
    chip.dataset.directiveTurnActivityChipStatus = SIDECAR_REVIEW_STATUSES.has(status) ? 'review' : status;
    chip.textContent = workerLabel(workerKey);
    chips.appendChild(chip);
  }
}

function renderActions(actions, activity = {}) {
  if (!actions) return;
  const needsReview = activity.mode === 'review' || hasReviewSidecar(activity);
  actions.hidden = !needsReview;
}

function setIndicatorVisible(visible) {
  const indicator = indicatorElement();
  if (!indicator) return;
  indicator.hidden = !visible;
  const activity = latestActivity();
  indicator.dataset.directiveTurnActivity = visible ? (activity?.mode || 'active') : 'idle';
  indicator.dataset.directiveTurnActivityPhase = activity?.phase || 'idle';
  const label = indicator.querySelector?.('.directive-turn-activity-label');
  if (label && activity?.label) label.textContent = activity.label;
  renderChips(indicator.querySelector?.('.directive-turn-activity-chips'), activity);
  renderActions(indicator.querySelector?.('.directive-turn-activity-actions'), activity);
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
  indicator.dataset.directiveTurnActivity = activity?.mode || 'active';
  indicator.dataset.directiveTurnActivityPhase = activity?.phase || 'active';
  renderChips(indicator.querySelector?.('.directive-turn-activity-chips'), activity);
  renderActions(indicator.querySelector?.('.directive-turn-activity-actions'), activity);
  if (!indicator.hidden) return;
  if (revealTimer !== null) return;
  revealTimer = globalThis.setTimeout?.(() => {
    revealTimer = null;
    if (activeActivities.size > 0) setIndicatorVisible(true);
  }, Math.max(0, Number(delayMs) || 0));
}

export function markDirectiveTurnActivity({
  label = DEFAULT_LABEL,
  phase = 'reading',
  mode = 'blocking',
  delayMs = DEFAULT_REVEAL_DELAY_MS
} = {}) {
  const token = `directive-turn-activity-${++nextActivityId}`;
  activeActivities.set(token, {
    token,
    label,
    phase,
    mode,
    classification: null,
    blockingComplete: false,
    sidecars: new Map(),
    startedAt: Date.now()
  });
  updateIndicator(delayMs);
  return token;
}

function scheduleClear(token, delayMs) {
  clearActivityTimer(token);
  const delay = Math.max(0, Number(delayMs) || 0);
  const timer = globalThis.setTimeout?.(() => {
    clearActivity(token);
    updateIndicator(0);
  }, delay);
  if (timer !== undefined) clearTimers.set(token, timer);
}

function updateSidecars(activity, event = {}) {
  if (!activity.sidecars) activity.sidecars = new Map();
  const requested = Array.isArray(event.requested) ? event.requested : [];
  for (const workerKey of requested) {
    const key = normalizeWorkerKey(workerKey);
    if (!key || key === 'promptUpdate') continue;
    if (!activity.sidecars.has(key)) {
      activity.sidecars.set(key, { status: 'queued' });
    }
  }
  const workerKey = normalizeWorkerKey(event.workerKey);
  if (workerKey) {
    const status = String(event.status || 'running');
    if (SIDECAR_SETTLED_STATUSES.has(status)) {
      activity.sidecars.delete(workerKey);
    } else {
      activity.sidecars.set(workerKey, { status });
    }
  }
  if (Array.isArray(event.results)) {
    for (const result of event.results) {
      const key = normalizeWorkerKey(result?.workerKey);
      if (!key) continue;
      const status = String(result?.status || 'complete');
      if (SIDECAR_SETTLED_STATUSES.has(status)) {
        activity.sidecars.delete(key);
      } else {
        activity.sidecars.set(key, { status });
      }
    }
  }
}

export function updateDirectiveTurnActivity(token, event = {}) {
  if (!token) return false;
  const activity = activeActivities.get(token);
  if (!activity) return false;
  clearActivityTimer(token);
  const phase = event.phase || activity.phase || 'active';
  activity.phase = phase;
  activity.classification = event.classification || activity.classification || null;
  activity.mode = event.mode || (
    phase === 'sidecarsQueued' || phase === 'sidecarsRunning' || phase === 'sidecarWorker' || phase === 'sidecarsSettled'
      ? 'background'
      : activity.mode || 'blocking'
  );
  updateSidecars(activity, event);
  if (event.status && SIDECAR_REVIEW_STATUSES.has(String(event.status))) activity.mode = 'review';
  if (hasReviewSidecar(activity)) activity.mode = 'review';
  activity.label = labelForPhase(event, activity);
  if (activity.mode === 'background' && activity.blockingComplete && !hasPendingSidecar(activity) && !hasReviewSidecar(activity)) {
    scheduleClear(token, SETTLED_CLEAR_DELAY_MS);
  }
  if (activity.mode === 'review' && !hasPendingSidecar(activity)) {
    scheduleClear(token, REVIEW_CLEAR_DELAY_MS);
  }
  updateIndicator(0);
  return true;
}

export function finishDirectiveTurnActivity(token, event = {}) {
  if (!token) return;
  const activity = activeActivities.get(token);
  if (!activity) return;
  activity.blockingComplete = true;
  if (event.phase || event.label || event.classification || event.mode) {
    updateDirectiveTurnActivity(token, event);
  }
  if (activity.mode === 'review' || hasReviewSidecar(activity)) {
    activity.mode = 'review';
    activity.label = activity.label || REVIEW_LABEL;
    if (!hasPendingSidecar(activity)) scheduleClear(token, REVIEW_CLEAR_DELAY_MS);
    updateIndicator(0);
    return;
  }
  if (hasPendingSidecar(activity)) {
    activity.mode = 'background';
    activity.label = BACKGROUND_LABEL;
    updateIndicator(0);
    return;
  }
  clearActivity(token);
  updateIndicator(0);
}

export function clearDirectiveTurnActivity(token) {
  if (token) clearActivity(token);
  updateIndicator();
}

export function disposeDirectiveTurnActivity() {
  for (const token of activeActivities.keys()) clearActivityTimer(token);
  activeActivities.clear();
  clearRevealTimer();
  const indicator = canUseDocument() ? document.getElementById(DIRECTIVE_TURN_ACTIVITY_ID) : null;
  indicator?.remove?.();
}

export const __directiveTurnActivityTestHooks = Object.freeze({
  DIRECTIVE_TURN_ACTIVITY_ID,
  activeCount: () => activeActivities.size,
  latestActivity: () => {
    const activity = latestActivity();
    if (!activity) return null;
    return {
      ...activity,
      sidecars: Object.fromEntries(activity.sidecars || new Map())
    };
  },
  updateIndicator
});
