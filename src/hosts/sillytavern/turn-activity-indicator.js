import { runRuntimeAction } from '../../runtime/runtime-actions.js';
import { appendDirectiveOverlay } from '../../ui/directive-overlay-root.js';

const DIRECTIVE_TURN_ACTIVITY_ID = 'directive-turn-activity-indicator';
const DEFAULT_REVEAL_DELAY_MS = 350;
const DEFAULT_LABEL = 'Directive is reading your post...';
const BACKGROUND_LABEL = 'Updating campaign context...';
const REVIEW_LABEL = 'Campaign context needs review.';
const SCENE_HANDSHAKE_REVIEW_LABEL = 'Scene details need review.';
const CONTINUITY_PROJECTION_REVIEW_LABEL = 'Continuity context needs review.';
const ACTIVATION_REVIEW_LABEL = 'Campaign setup needs review.';
const INTRO_REWRITE_REVIEW_LABEL = 'Opening scene rewrite needs review.';
const SETTLED_CLEAR_DELAY_MS = 900;
const REVIEW_CLEAR_DELAY_MS = 8000;
const HOST_GENERATION_STARTED_CLEAR_DELAY_MS = 150;
const HOST_GENERATION_HANDOFF_TIMEOUT_MS = 120000;
const RECENT_HOST_GENERATION_START_MS = 5000;

const SIDECAR_SETTLED_STATUSES = new Set(['applied', 'noChange', 'complete', 'settled', 'skipped']);
const SIDECAR_REVIEW_STATUSES = new Set(['failed', 'rejected', 'error']);
const SCENE_HANDSHAKE_REVIEW_DISPOSITIONS = new Set(['internalReview', 'operatorRecovery']);
const CONTINUITY_PROJECTION_FAILURE_PHASES = new Set(['continuityProjectionFailed', 'continuityProjectionReview']);
const CONTINUITY_PROJECTION_COMPLETE_PHASES = new Set(['continuityProjectionInstalled', 'continuityProjectionSkipped']);
const ACTIVATION_FAILURE_PHASES = new Set(['activationFailed', 'introRewriteFailed']);
const ACTIVATION_COMPLETE_PHASES = new Set(['activationComplete', 'activationCanceled', 'introRewriteComplete', 'introRewriteCanceled']);

const WORKER_LABELS = Object.freeze({
  continuity: 'Continuity',
  relationship: 'Crew Bonds',
  crew: 'Crew',
  ship: 'Ship',
  commandBearing: 'Command Bearing',
  missionDirector: 'Mission',
  promptUpdate: 'Prompt'
});

const SCENE_HANDSHAKE_ROOT_LABELS = Object.freeze({
  commandLog: 'Log',
  mission: 'Orders',
  ship: 'Ship',
  threadLedger: 'Threads',
  threads: 'Threads'
});

const CONTINUITY_PROJECTION_STEP_LABELS = Object.freeze({
  planner: 'Planner',
  matrix: 'Matrix',
  prompt: 'Context'
});

const CONTINUITY_PROJECTION_STEP_ORDER = Object.freeze(['planner', 'matrix', 'prompt']);

const ACTIVATION_STEP_LABELS = Object.freeze({
  save: 'Save',
  chat: 'Chat',
  intro: 'Opening Scene',
  prompt: 'Prompt',
  ready: 'Ready'
});

const ACTIVATION_STEP_ORDER = Object.freeze(['save', 'chat', 'intro', 'prompt', 'ready']);

let nextActivityId = 0;
const activeActivities = new Map();
const jobActivities = new Map();
let revealTimer = null;
const clearTimers = new Map();
const hostGenerationWaitTimers = new Map();
let lastHostGenerationStart = null;

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
  appendDirectiveOverlay(indicator, { fallbackParent: document.body });
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

function clearHostGenerationWaitTimer(token) {
  const timer = hostGenerationWaitTimers.get(token);
  if (timer !== undefined) {
    globalThis.clearTimeout?.(timer);
    hostGenerationWaitTimers.delete(token);
  }
}

function clearActivity(token) {
  clearActivityTimer(token);
  clearHostGenerationWaitTimer(token);
  activeActivities.delete(token);
}

function normalizeWorkerKey(value) {
  return String(value || '').trim();
}

function workerLabel(workerKey) {
  const key = normalizeWorkerKey(workerKey);
  return WORKER_LABELS[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (match) => match.toUpperCase());
}

function normalizeSceneHandshakeRoot(value) {
  return String(value || '').trim().split('.')[0];
}

function sceneHandshakeRootLabel(root) {
  const key = normalizeSceneHandshakeRoot(root);
  return SCENE_HANDSHAKE_ROOT_LABELS[key] || '';
}

function sceneHandshakeNeedsReview(event = {}) {
  return event.phase === 'sceneHandshakeSettled'
    && SCENE_HANDSHAKE_REVIEW_DISPOSITIONS.has(String(event.disposition || ''));
}

function isActivationProgressEvent(event = {}) {
  const phase = String(event.phase || '');
  return phase.startsWith('activation') || phase.startsWith('introRewrite');
}

function isContinuityProjectionProgressEvent(event = {}) {
  return String(event.phase || '').startsWith('continuityProjection');
}

function isJobProgressEvent(event = {}) {
  return isActivationProgressEvent(event) || isContinuityProjectionProgressEvent(event);
}

function continuityProjectionNeedsReview(event = {}) {
  return isContinuityProjectionProgressEvent(event)
    && (CONTINUITY_PROJECTION_FAILURE_PHASES.has(String(event.phase || ''))
      || SIDECAR_REVIEW_STATUSES.has(String(event.status || '')));
}

function activationNeedsReview(event = {}) {
  return isActivationProgressEvent(event)
    && (ACTIVATION_FAILURE_PHASES.has(String(event.phase || ''))
      || SIDECAR_REVIEW_STATUSES.has(String(event.status || '')));
}

function labelForClassification(classification) {
  switch (classification) {
    case 'sceneNavigation':
      return 'Directive is advancing the scene...';
    case 'locationTransition':
      return 'Directive is pacing the move...';
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
  if (sceneHandshakeNeedsReview(event) || activity.reviewLabel) return activity.reviewLabel || SCENE_HANDSHAKE_REVIEW_LABEL;
  if (continuityProjectionNeedsReview(event)) return CONTINUITY_PROJECTION_REVIEW_LABEL;
  if (activationNeedsReview(event)) {
    return event.phase === 'introRewriteFailed' ? INTRO_REWRITE_REVIEW_LABEL : ACTIVATION_REVIEW_LABEL;
  }
  if (event.mode === 'review' || event.phase === 'recovery' || activity.mode === 'review') return REVIEW_LABEL;
  switch (event.phase) {
    case 'activationStarting':
    case 'activationPreparing':
      return 'Starting campaign setup...';
    case 'activationPrepared':
      return 'Campaign save ready.';
    case 'activationChatCreating':
      return 'Creating campaign chat...';
    case 'activationChatBound':
      return 'Campaign chat ready.';
    case 'activationIntroGenerating':
      return 'Writing opening scene...';
    case 'activationIntroGenerated':
      return 'Opening scene ready.';
    case 'activationIntroPosting':
      return 'Posting opening scene...';
    case 'activationIntroPosted':
      return 'Opening scene posted.';
    case 'activationPromptInstalling':
      return 'Installing campaign context...';
    case 'activationPromptInstalled':
      return 'Campaign context installed.';
    case 'activationChatOpening':
      return 'Opening campaign chat...';
    case 'activationChatOpened':
      return 'Campaign chat opened.';
    case 'activationComplete':
      return 'Campaign ready.';
    case 'activationCanceled':
      return 'Campaign setup canceled.';
    case 'activationFailed':
      return ACTIVATION_REVIEW_LABEL;
    case 'introRewriteGenerating':
      return 'Rewriting opening scene...';
    case 'introRewritePosting':
      return 'Posting rewritten opening scene...';
    case 'introRewriteComplete':
      return 'Opening scene updated.';
    case 'introRewriteCanceled':
      return 'Opening scene rewrite canceled.';
    case 'introRewriteFailed':
      return INTRO_REWRITE_REVIEW_LABEL;
    case 'reading':
      return DEFAULT_LABEL;
    case 'settlingSceneHandshake':
      return 'Directive is checking the prior scene...';
    case 'sceneHandshakeSettled':
      return Number(event.operationCount || 0) > 0 ? 'Scene details filed.' : 'Directive is checking intent...';
    case 'classifying':
      return 'Directive is checking intent...';
    case 'classified':
    case 'routing':
      return labelForClassification(event.classification || activity.classification);
    case 'scene':
      return event.classification === 'sceneNavigation'
        ? 'Directive is advancing the scene...'
        : 'Directive is reading the scene...';
    case 'locationTransition':
      return 'Directive is pacing the move...';
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
    case 'continuityProjectionPlanning':
      return 'Directive is planning the continuity matrix...';
    case 'continuityProjectionBuilding':
      return 'Directive is building the continuity matrix...';
    case 'continuityProjectionValidating':
      return 'Directive is checking the continuity matrix...';
    case 'continuityProjectionInstalling':
      return 'Directive is installing continuity context...';
    case 'continuityProjectionInstalled':
      return 'Continuity context ready.';
    case 'continuityProjectionSkipped':
      return 'Continuity context already current.';
    case 'continuityProjectionFailed':
    case 'continuityProjectionReview':
      return CONTINUITY_PROJECTION_REVIEW_LABEL;
    case 'syncingPrompt':
      if (event.source === 'sceneHandshake' || (activity.sceneDetails?.size || 0) > 0) {
        return 'Directive is syncing scene details...';
      }
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
  const source = activity || {};
  return [...(source.sidecars || new Map()).entries()];
}

function activeSceneDetailEntries(activity = {}) {
  const source = activity || {};
  return [...(source.sceneDetails || new Map()).entries()];
}

function activeContinuityProjectionEntries(activity = {}) {
  const source = activity || {};
  const entries = [...(source.continuityProjectionSteps || new Map()).entries()];
  return entries.sort(([left], [right]) => {
    const leftIndex = CONTINUITY_PROJECTION_STEP_ORDER.indexOf(left);
    const rightIndex = CONTINUITY_PROJECTION_STEP_ORDER.indexOf(right);
    return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
  });
}

function activeActivationEntries(activity = {}) {
  const source = activity || {};
  const entries = [...(source.activationSteps || new Map()).entries()];
  return entries.sort(([left], [right]) => {
    const leftIndex = ACTIVATION_STEP_ORDER.indexOf(left);
    const rightIndex = ACTIVATION_STEP_ORDER.indexOf(right);
    return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
  });
}

function hasReviewSidecar(activity = {}) {
  return activeSidecarEntries(activity).some(([, sidecar]) => SIDECAR_REVIEW_STATUSES.has(sidecar.status));
}

function hasReviewContinuityProjection(activity = {}) {
  return activeContinuityProjectionEntries(activity).some(([, step]) => step.status === 'review');
}

function hasReviewActivationStep(activity = {}) {
  return activeActivationEntries(activity).some(([, step]) => step.status === 'review');
}

function hasPendingSidecar(activity = {}) {
  return activeSidecarEntries(activity).some(([, sidecar]) => !SIDECAR_REVIEW_STATUSES.has(sidecar.status));
}

function hasPendingContinuityProjection(activity = {}) {
  return activeContinuityProjectionEntries(activity).some(([, step]) => (
    step.status !== 'settled' && step.status !== 'skipped' && step.status !== 'review'
  ));
}

function renderChips(chips, activity = {}) {
  if (!chips) return;
  chips.replaceChildren();
  const sceneEntries = activeSceneDetailEntries(activity).map(([key, detail]) => [
    `scene:${key}`,
    { status: detail.status || 'settled', label: detail.label || sceneHandshakeRootLabel(key) || 'Scene' }
  ]);
  const activationEntries = activeActivationEntries(activity).map(([key, step]) => [
    `activation:${key}`,
    { status: step.status || 'running', label: step.label || ACTIVATION_STEP_LABELS[key] || key }
  ]);
  const projectionEntries = activeContinuityProjectionEntries(activity).map(([key, step]) => [
    `continuityProjection:${key}`,
    { status: step.status || 'running', label: step.label || CONTINUITY_PROJECTION_STEP_LABELS[key] || key }
  ]);
  const sidecarEntries = activeSidecarEntries(activity).map(([key, sidecar]) => [
    `sidecar:${key}`,
    { status: sidecar.status || 'queued', label: workerLabel(key) }
  ]);
  const entries = [...activationEntries, ...sceneEntries, ...projectionEntries, ...sidecarEntries];
  chips.hidden = entries.length === 0;
  for (const [, chipState] of entries) {
    const chip = document.createElement('span');
    const status = chipState.status || 'queued';
    chip.className = 'directive-turn-activity-chip';
    chip.dataset.directiveTurnActivityChipStatus = SIDECAR_REVIEW_STATUSES.has(status) ? 'review' : status;
    chip.textContent = chipState.label;
    chips.appendChild(chip);
  }
}

function renderActions(actions, activity = {}) {
  if (!actions) return;
  const source = activity || {};
  const needsReview = source.mode === 'review'
    || hasReviewSidecar(source)
    || hasReviewContinuityProjection(source)
    || hasReviewActivationStep(source);
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
    sceneDetails: new Map(),
    continuityProjectionSteps: new Map(),
    activationSteps: new Map(),
    reviewLabel: null,
    awaitingHostGeneration: false,
    hostGenerationHandoff: null,
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

function scheduleHostGenerationWaitTimeout(token) {
  clearHostGenerationWaitTimer(token);
  const delay = Math.max(0, Number(HOST_GENERATION_HANDOFF_TIMEOUT_MS) || 0);
  const timer = globalThis.setTimeout?.(() => {
    const activity = activeActivities.get(token);
    if (activity?.awaitingHostGeneration) {
      activity.awaitingHostGeneration = false;
      activity.hostGenerationHandoff = {
        ...(activity.hostGenerationHandoff || {}),
        status: 'timeout',
        timedOutAt: Date.now()
      };
      clearActivity(token);
      updateIndicator(0);
    }
  }, delay);
  if (timer !== undefined) hostGenerationWaitTimers.set(token, timer);
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

function updateSceneHandshake(activity, event = {}) {
  if (!activity.sceneDetails) activity.sceneDetails = new Map();
  if (event.phase === 'settlingSceneHandshake') {
    activity.sceneDetails.clear();
    activity.sceneDetails.set('scene', { status: 'running', label: 'Scene' });
    return;
  }
  if (event.phase !== 'sceneHandshakeSettled') return;
  activity.sceneDetails.clear();
  const needsReview = sceneHandshakeNeedsReview(event);
  const roots = Array.isArray(event.committedRoots) ? event.committedRoots : [];
  for (const root of roots) {
    const key = normalizeSceneHandshakeRoot(root);
    const label = sceneHandshakeRootLabel(key);
    if (!key || !label) continue;
    activity.sceneDetails.set(key, { status: needsReview ? 'review' : 'settled', label });
  }
  if (needsReview) {
    activity.reviewLabel = SCENE_HANDSHAKE_REVIEW_LABEL;
    if (activity.sceneDetails.size === 0) {
      activity.sceneDetails.set('scene', { status: 'review', label: 'Scene' });
    }
  }
}

function setContinuityProjectionStep(activity, key, status) {
  if (!key) return;
  if (!activity.continuityProjectionSteps) activity.continuityProjectionSteps = new Map();
  activity.continuityProjectionSteps.set(key, {
    status,
    label: CONTINUITY_PROJECTION_STEP_LABELS[key] || key
  });
}

function completeContinuityProjectionSteps(activity, keys = []) {
  for (const key of keys) setContinuityProjectionStep(activity, key, 'settled');
}

function continuityProjectionStepForPhase(phase) {
  switch (phase) {
    case 'continuityProjectionPlanning':
      return 'planner';
    case 'continuityProjectionBuilding':
    case 'continuityProjectionValidating':
      return 'matrix';
    case 'continuityProjectionInstalling':
    case 'continuityProjectionInstalled':
    case 'continuityProjectionSkipped':
      return 'prompt';
    default:
      return null;
  }
}

function updateContinuityProjection(activity, event = {}) {
  if (!isContinuityProjectionProgressEvent(event)) return;
  if (!activity.continuityProjectionSteps) activity.continuityProjectionSteps = new Map();
  const phase = String(event.phase || '');
  const plannerEnabled = event.planner === true || event.usesPlanner === true;
  if (phase === 'continuityProjectionPlanning') {
    activity.continuityProjectionSteps.clear();
    if (plannerEnabled) setContinuityProjectionStep(activity, 'planner', 'running');
    setContinuityProjectionStep(activity, 'matrix', 'queued');
    return;
  }
  if (phase === 'continuityProjectionBuilding') {
    if (plannerEnabled || activity.continuityProjectionSteps.has('planner')) {
      setContinuityProjectionStep(activity, 'planner', plannerEnabled ? 'running' : 'settled');
    }
    setContinuityProjectionStep(activity, 'matrix', 'running');
    return;
  }
  if (phase === 'continuityProjectionValidating') {
    if (activity.continuityProjectionSteps.has('planner')) setContinuityProjectionStep(activity, 'planner', 'settled');
    setContinuityProjectionStep(activity, 'matrix', 'running');
    return;
  }
  if (phase === 'continuityProjectionInstalling') {
    completeContinuityProjectionSteps(activity, ['planner', 'matrix'].filter((key) => (
      key !== 'planner' || activity.continuityProjectionSteps.has('planner')
    )));
    setContinuityProjectionStep(activity, 'prompt', 'running');
    return;
  }
  if (phase === 'continuityProjectionInstalled' || phase === 'continuityProjectionSkipped') {
    completeContinuityProjectionSteps(activity, ['planner', 'matrix', 'prompt'].filter((key) => (
      key !== 'planner' || activity.continuityProjectionSteps.has('planner')
    )));
    return;
  }
  if (continuityProjectionNeedsReview(event)) {
    const step = event.step || continuityProjectionStepForPhase(event.failedPhase) || continuityProjectionStepForPhase(phase) || 'matrix';
    setContinuityProjectionStep(activity, step, 'review');
    activity.reviewLabel = CONTINUITY_PROJECTION_REVIEW_LABEL;
  }
}

function setActivationStep(activity, key, status) {
  if (!key) return;
  if (!activity.activationSteps) activity.activationSteps = new Map();
  activity.activationSteps.set(key, {
    status,
    label: ACTIVATION_STEP_LABELS[key] || key
  });
}

function completeActivationSteps(activity, keys = []) {
  for (const key of keys) setActivationStep(activity, key, 'settled');
}

function activationStepForJournalStep(step) {
  switch (step) {
    case 'prepared':
      return 'save';
    case 'chatBound':
      return 'chat';
    case 'introGenerated':
    case 'introPosted':
      return 'intro';
    case 'promptInstalled':
      return 'prompt';
    case 'chatOpened':
    case 'activated':
      return 'ready';
    default:
      return null;
  }
}

function updateActivation(activity, event = {}) {
  if (!isActivationProgressEvent(event)) return;
  if (!activity.activationSteps) activity.activationSteps = new Map();
  switch (event.phase) {
    case 'activationStarting':
    case 'activationPreparing':
      setActivationStep(activity, 'save', 'running');
      break;
    case 'activationPrepared':
      setActivationStep(activity, 'save', 'settled');
      break;
    case 'activationChatCreating':
      completeActivationSteps(activity, ['save']);
      setActivationStep(activity, 'chat', 'running');
      break;
    case 'activationChatBound':
      completeActivationSteps(activity, ['save', 'chat']);
      break;
    case 'activationIntroGenerating':
      completeActivationSteps(activity, ['save', 'chat']);
      setActivationStep(activity, 'intro', 'running');
      break;
    case 'activationIntroGenerated':
      completeActivationSteps(activity, ['save', 'chat']);
      setActivationStep(activity, 'intro', 'settled');
      break;
    case 'activationIntroPosting':
      completeActivationSteps(activity, ['save', 'chat']);
      setActivationStep(activity, 'intro', 'running');
      break;
    case 'activationIntroPosted':
      completeActivationSteps(activity, ['save', 'chat', 'intro']);
      break;
    case 'activationPromptInstalling':
      completeActivationSteps(activity, ['save', 'chat', 'intro']);
      setActivationStep(activity, 'prompt', 'running');
      break;
    case 'activationPromptInstalled':
      completeActivationSteps(activity, ['save', 'chat', 'intro', 'prompt']);
      break;
    case 'activationChatOpening':
    case 'activationChatOpened':
      completeActivationSteps(activity, ['save', 'chat', 'intro', 'prompt']);
      setActivationStep(activity, 'ready', event.phase === 'activationChatOpened' ? 'settled' : 'running');
      break;
    case 'activationComplete':
      completeActivationSteps(activity, ACTIVATION_STEP_ORDER);
      break;
    case 'activationCanceled':
      setActivationStep(activity, activationStepForJournalStep(event.step) || 'intro', 'settled');
      break;
    case 'activationFailed': {
      completeActivationSteps(activity, ACTIVATION_STEP_ORDER.slice(0, Math.max(0, ACTIVATION_STEP_ORDER.indexOf(activationStepForJournalStep(event.failedStep)))));
      const failedKey = activationStepForJournalStep(event.failedStep) || 'ready';
      setActivationStep(activity, failedKey, 'review');
      activity.reviewLabel = ACTIVATION_REVIEW_LABEL;
      break;
    }
    case 'introRewriteGenerating':
    case 'introRewritePosting':
      setActivationStep(activity, 'intro', 'running');
      break;
    case 'introRewriteComplete':
      setActivationStep(activity, 'intro', 'settled');
      break;
    case 'introRewriteCanceled':
      setActivationStep(activity, 'intro', 'settled');
      break;
    case 'introRewriteFailed':
      setActivationStep(activity, 'intro', 'review');
      activity.reviewLabel = INTRO_REWRITE_REVIEW_LABEL;
      break;
    default:
      break;
  }
}

function updateHostGenerationHandoff(activity, event = {}) {
  if (event.phase !== 'delegatingHostGeneration' || event.responseStrategy !== 'injectAndContinue') return;
  activity.awaitingHostGeneration = true;
  activity.hostGenerationHandoff = {
    status: 'waiting',
    ingressId: event.ingressId || null,
    turnId: event.turnId || null,
    outcomeId: event.outcomeId || null,
    classification: event.classification || null,
    startedAt: activity.hostGenerationHandoff?.startedAt || Date.now()
  };
}

function recentHostGenerationStarted() {
  if (!lastHostGenerationStart?.recordedAt) return false;
  return Date.now() - Number(lastHostGenerationStart.recordedAt || 0) <= RECENT_HOST_GENERATION_START_MS;
}

function completeHostGenerationHandoff(activity, { clearDelayMs = HOST_GENERATION_STARTED_CLEAR_DELAY_MS } = {}) {
  if (!activity?.token) return { ok: false, reason: 'activity-unavailable' };
  activity.awaitingHostGeneration = false;
  activity.hostGenerationHandoff = {
    ...(activity.hostGenerationHandoff || {}),
    status: 'started',
    startedAt: activity.hostGenerationHandoff?.startedAt || null,
    confirmedAt: Date.now()
  };
  clearHostGenerationWaitTimer(activity.token);
  if (activity.mode === 'review' || hasReviewSidecar(activity) || hasReviewContinuityProjection(activity) || hasReviewActivationStep(activity)) {
    updateIndicator(0);
    return { ok: true, retained: 'review', token: activity.token };
  }
  if (hasPendingSidecar(activity) || hasPendingContinuityProjection(activity)) {
    activity.mode = 'background';
    activity.label = BACKGROUND_LABEL;
    updateIndicator(0);
    return { ok: true, retained: 'sidecars', token: activity.token };
  }
  scheduleClear(activity.token, clearDelayMs);
  updateIndicator(0);
  return { ok: true, token: activity.token };
}

export function updateDirectiveTurnActivity(token, event = {}) {
  if (!token) return false;
  const activity = activeActivities.get(token);
  if (!activity) return false;
  clearActivityTimer(token);
  const phase = event.phase || activity.phase || 'active';
  activity.phase = phase;
  activity.classification = event.classification || activity.classification || null;
  const nextMode = event.mode || (
    phase === 'sidecarsQueued' || phase === 'sidecarsRunning' || phase === 'sidecarWorker' || phase === 'sidecarsSettled'
      ? 'background'
      : activity.mode || 'blocking'
  );
  activity.mode = activity.reviewLabel ? 'review' : nextMode;
  updateSidecars(activity, event);
  updateSceneHandshake(activity, event);
  updateContinuityProjection(activity, event);
  updateActivation(activity, event);
  updateHostGenerationHandoff(activity, event);
  if (sceneHandshakeNeedsReview(event)) activity.mode = 'review';
  if (continuityProjectionNeedsReview(event) || hasReviewContinuityProjection(activity)) activity.mode = 'review';
  if (activationNeedsReview(event) || hasReviewActivationStep(activity)) activity.mode = 'review';
  if (event.status && SIDECAR_REVIEW_STATUSES.has(String(event.status))) activity.mode = 'review';
  if (hasReviewSidecar(activity)) activity.mode = 'review';
  if (activity.mode === 'review' && !activity.reviewLabel) activity.reviewLabel = REVIEW_LABEL;
  activity.label = labelForPhase(event, activity);
  if (activity.awaitingHostGeneration && activity.mode !== 'review') {
    activity.mode = 'blocking';
    activity.label = labelForPhase({ phase: 'delegatingHostGeneration' }, activity);
  }
  if (activity.mode === 'background'
    && activity.blockingComplete
    && !activity.awaitingHostGeneration
    && !hasPendingSidecar(activity)
    && !hasPendingContinuityProjection(activity)
    && !hasReviewSidecar(activity)
    && !hasReviewContinuityProjection(activity)) {
    scheduleClear(token, SETTLED_CLEAR_DELAY_MS);
  }
  if (activity.mode === 'review'
    && activity.blockingComplete
    && !activity.awaitingHostGeneration
    && !hasPendingSidecar(activity)
    && !hasPendingContinuityProjection(activity)) {
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
  if (activity.mode === 'review' || hasReviewSidecar(activity) || hasReviewContinuityProjection(activity)) {
    activity.mode = 'review';
    activity.label = activity.label || REVIEW_LABEL;
    if (!hasPendingSidecar(activity) && !hasPendingContinuityProjection(activity)) scheduleClear(token, REVIEW_CLEAR_DELAY_MS);
    updateIndicator(0);
    return;
  }
  if (activity.awaitingHostGeneration) {
    activity.mode = 'blocking';
    activity.label = labelForPhase({ phase: 'delegatingHostGeneration' }, activity);
    if (recentHostGenerationStarted()) {
      completeHostGenerationHandoff(activity);
      return;
    }
    scheduleHostGenerationWaitTimeout(token);
    updateIndicator(0);
    return;
  }
  if (hasPendingSidecar(activity)) {
    activity.mode = 'background';
    activity.label = BACKGROUND_LABEL;
    updateIndicator(0);
    return;
  }
  if (hasPendingContinuityProjection(activity)) {
    activity.mode = activity.mode || 'blocking';
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

export function cancelActiveDirectiveTurnActivities() {
  let canceledCount = 0;
  for (const [token, activity] of [...activeActivities.entries()]) {
    if (activity?.mode === 'review' || hasReviewSidecar(activity) || hasReviewActivationStep(activity)) continue;
    clearActivity(token);
    canceledCount += 1;
  }
  for (const [jobKey, token] of [...jobActivities.entries()]) {
    if (!activeActivities.has(token)) jobActivities.delete(jobKey);
  }
  updateIndicator(0);
  return {
    ok: true,
    canceledCount,
    activeCount: activeActivities.size
  };
}

export function resolveDirectiveHostGenerationHandoff(payload = {}) {
  lastHostGenerationStart = {
    recordedAt: Date.now(),
    type: payload?.type || null,
    responseStrategy: payload?.responseStrategy || null
  };
  const activity = [...activeActivities.values()].filter((entry) => entry?.awaitingHostGeneration).at(-1);
  if (!activity) {
    return { ok: false, reason: 'no-active-host-generation-handoff' };
  }
  return completeHostGenerationHandoff(activity);
}

function activationJobKey(payload = {}) {
  return String(
    payload.jobId
    || payload.activityId
    || payload.activationId
    || payload.campaignId
    || 'campaign-activation'
  );
}

export function reportDirectiveJobProgress(payload = {}) {
  if (!isJobProgressEvent(payload)) return false;
  const jobKey = activationJobKey(payload);
  let token = jobActivities.get(jobKey);
  if (!token || !activeActivities.has(token)) {
    token = markDirectiveTurnActivity({
      phase: payload.phase || 'activationStarting',
      label: labelForPhase(payload),
      mode: (activationNeedsReview(payload) || continuityProjectionNeedsReview(payload)) ? 'review' : (payload.mode || 'blocking'),
      delayMs: payload.delayMs ?? 0
    });
    jobActivities.set(jobKey, token);
  }
  const event = {
    ...payload,
    mode: (activationNeedsReview(payload) || continuityProjectionNeedsReview(payload)) ? 'review' : (payload.mode || 'blocking')
  };
  updateDirectiveTurnActivity(token, event);
  const activity = activeActivities.get(token);
  if (!activity) return true;
  if (ACTIVATION_COMPLETE_PHASES.has(String(payload.phase || ''))) {
    activity.blockingComplete = true;
    scheduleClear(token, SETTLED_CLEAR_DELAY_MS);
    jobActivities.delete(jobKey);
    updateIndicator(0);
  } else if (activationNeedsReview(payload)) {
    activity.blockingComplete = true;
    scheduleClear(token, REVIEW_CLEAR_DELAY_MS);
    jobActivities.delete(jobKey);
    updateIndicator(0);
  } else if (
    isContinuityProjectionProgressEvent(payload)
    && payload.source !== 'activation'
    && !String(payload.jobId || '').startsWith('campaignActivation:')
    && CONTINUITY_PROJECTION_COMPLETE_PHASES.has(String(payload.phase || ''))
  ) {
    activity.blockingComplete = true;
    scheduleClear(token, SETTLED_CLEAR_DELAY_MS);
    jobActivities.delete(jobKey);
    updateIndicator(0);
  } else if (continuityProjectionNeedsReview(payload)) {
    activity.blockingComplete = true;
    scheduleClear(token, REVIEW_CLEAR_DELAY_MS);
    jobActivities.delete(jobKey);
    updateIndicator(0);
  }
  return true;
}

export function disposeDirectiveTurnActivity() {
  for (const token of activeActivities.keys()) clearActivityTimer(token);
  for (const token of activeActivities.keys()) clearHostGenerationWaitTimer(token);
  activeActivities.clear();
  jobActivities.clear();
  hostGenerationWaitTimers.clear();
  lastHostGenerationStart = null;
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
      sidecars: Object.fromEntries(activity.sidecars || new Map()),
      sceneDetails: Object.fromEntries(activity.sceneDetails || new Map()),
      continuityProjectionSteps: Object.fromEntries(activity.continuityProjectionSteps || new Map()),
      activationSteps: Object.fromEntries(activity.activationSteps || new Map()),
      awaitingHostGeneration: activity.awaitingHostGeneration === true,
      hostGenerationHandoff: activity.hostGenerationHandoff ? { ...activity.hostGenerationHandoff } : null
    };
  },
  cancelActiveDirectiveTurnActivities,
  resolveDirectiveHostGenerationHandoff,
  updateIndicator
});
