import { DIRECTIVE_GUIDANCE_DEFAULT_TUTORIAL_ID, DIRECTIVE_TIPS, getDirectiveTip, getDirectiveTutorial } from './directive-guidance-content.mjs';
import { addTooltip, createElement, createIcon, clearElement } from '../ui/runtime-ui-kit.js';
import { appendDirectiveOverlay } from '../ui/directive-overlay-root.js';

export const DIRECTIVE_GUIDANCE_STORAGE_KEYS = Object.freeze({
  tutorialPromptsDisabled: 'directive.guidance.tutorialPromptsDisabled.v1',
  tipsDisabled: 'directive.guidance.tipsDisabled.v1',
  firstTutorialCompleted: 'directive.guidance.firstTutorialCompleted.v1',
  startupOfferDismissedAt: 'directive.guidance.startupOfferDismissedAt.v1',
  tipHistory: 'directive.guidance.tipHistory.v1',
  lastTipShownAt: 'directive.guidance.lastTipShownAt.v1'
});

const HISTORY_LIMIT = 80;
const POPOVER_ID = 'directive-guidance-popover';
const TARGET_HIGHLIGHT_CLASS = 'directive-guidance-target-highlight';
const TARGET_DIM_CLASS = 'directive-guidance-target-dim';
const GUIDANCE_FIXTURE_ATTRIBUTE = 'data-directive-guidance-fixture';

let activeSession = null;
let activeTarget = null;
let activeKeydownHandler = null;

function canUseDocument() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return '';
  }
}

function readStorage(key, fallback = '') {
  try {
    return globalThis.localStorage?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    // Browser storage can be unavailable; current-session UI still works.
  }
}

function removeStorage(key) {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Browser storage can be unavailable; current-session UI still works.
  }
}

function readBoolean(key) {
  return readStorage(key, 'false') === 'true';
}

function writeBoolean(key, value) {
  writeStorage(key, value === true ? 'true' : 'false');
}

function readJsonArray(key) {
  try {
    const value = JSON.parse(readStorage(key, '[]'));
    return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key, values = []) {
  writeStorage(key, JSON.stringify([...new Set(values.filter(Boolean))].slice(-HISTORY_LIMIT)));
}

export function getDirectiveGuidancePreferences() {
  return {
    tutorialPromptsDisabled: readBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tutorialPromptsDisabled),
    tipsDisabled: readBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipsDisabled),
    firstTutorialCompleted: readBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.firstTutorialCompleted),
    startupOfferDismissedAt: readStorage(DIRECTIVE_GUIDANCE_STORAGE_KEYS.startupOfferDismissedAt, ''),
    tipHistory: readJsonArray(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipHistory),
    lastTipShownAt: readStorage(DIRECTIVE_GUIDANCE_STORAGE_KEYS.lastTipShownAt, '')
  };
}

export function setDirectiveGuidancePreference(key, value) {
  if (key === 'tutorialPromptsDisabled') writeBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tutorialPromptsDisabled, value);
  if (key === 'tipsDisabled') writeBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipsDisabled, value);
  if (key === 'firstTutorialCompleted') writeBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.firstTutorialCompleted, value);
  if (key === 'startupOfferDismissedAt') {
    if (value) writeStorage(DIRECTIVE_GUIDANCE_STORAGE_KEYS.startupOfferDismissedAt, value);
    else removeStorage(DIRECTIVE_GUIDANCE_STORAGE_KEYS.startupOfferDismissedAt);
  }
  if (key === 'tipHistory') writeJsonArray(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipHistory, Array.isArray(value) ? value : []);
  if (key === 'lastTipShownAt') {
    if (value) writeStorage(DIRECTIVE_GUIDANCE_STORAGE_KEYS.lastTipShownAt, value);
    else removeStorage(DIRECTIVE_GUIDANCE_STORAGE_KEYS.lastTipShownAt);
  }
  return getDirectiveGuidancePreferences();
}

export function resetDirectiveGuidanceProgress() {
  writeBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tutorialPromptsDisabled, false);
  writeBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.firstTutorialCompleted, false);
  removeStorage(DIRECTIVE_GUIDANCE_STORAGE_KEYS.startupOfferDismissedAt);
  writeJsonArray(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipHistory, []);
  removeStorage(DIRECTIVE_GUIDANCE_STORAGE_KEYS.lastTipShownAt);
  return getDirectiveGuidancePreferences();
}

function recordTipShown(tipId) {
  const history = readJsonArray(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipHistory).filter((id) => id !== tipId);
  history.push(tipId);
  writeJsonArray(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipHistory, history);
  writeStorage(DIRECTIVE_GUIDANCE_STORAGE_KEYS.lastTipShownAt, nowIso());
  return history;
}

function selectTip({ tipId = '', direction = 'next' } = {}) {
  if (tipId) return getDirectiveTip(tipId) || DIRECTIVE_TIPS[0] || null;
  const history = readJsonArray(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipHistory);
  if (direction === 'previous' && history.length > 1) {
    return getDirectiveTip(history[history.length - 2]) || DIRECTIVE_TIPS[0] || null;
  }
  const lastId = history.at(-1);
  const lastIndex = DIRECTIVE_TIPS.findIndex((tipItem) => tipItem.id === lastId);
  const nextIndex = lastIndex >= 0 ? (lastIndex + 1) % DIRECTIVE_TIPS.length : 0;
  return DIRECTIVE_TIPS[nextIndex] || null;
}

function frameDelay() {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve));
      return;
    }
    globalThis.setTimeout?.(resolve, 0);
  });
}

function removeActiveTarget() {
  if (!activeTarget) return;
  activeTarget.classList?.remove?.(TARGET_HIGHLIGHT_CLASS, TARGET_DIM_CLASS);
  activeTarget.removeAttribute?.('data-directive-guidance-active-target');
  activeTarget = null;
}

function removeGuidancePopover() {
  if (!canUseDocument()) return;
  document.getElementById(POPOVER_ID)?.remove?.();
}

function removeGuidanceFixtures() {
  if (!canUseDocument()) return;
  for (const fixture of document.querySelectorAll?.(`[${GUIDANCE_FIXTURE_ATTRIBUTE}]`) || []) {
    fixture.remove?.();
  }
}

export function closeDirectiveGuidance(reason = 'close') {
  const session = activeSession;
  activeSession = null;
  removeActiveTarget();
  removeGuidanceFixtures();
  removeGuidancePopover();
  if (activeKeydownHandler && typeof document !== 'undefined') {
    document.removeEventListener?.('keydown', activeKeydownHandler);
    activeKeydownHandler = null;
  }
  session?.controller?.onGuidanceClose?.({
    kind: session.kind,
    reason,
    tutorialId: session.tutorial?.id || '',
    stepId: session.tutorial?.steps?.[session.stepIndex]?.id || ''
  });
  return { closed: true };
}

function visibleElement(elements = []) {
  for (const element of elements.filter(Boolean)) {
    if (element.hidden === true) continue;
    if (element.getAttribute?.('aria-hidden') === 'true') continue;
    if (typeof element.closest === 'function' && element.closest('[hidden], [aria-hidden="true"]')) continue;
    return element;
  }
  return null;
}

function targetSelectors(target = '') {
  const value = String(target || '').trim();
  if (!value) return [];
  if (/^[#.\[]/.test(value)) return [value];
  if (value.startsWith('assist.action.')) {
    return [`[data-directive-assist-action="${value.slice('assist.action.'.length)}"]`, `[data-directive-tour="${value}"]`];
  }
  if (value.startsWith('assist.preview.')) {
    return [`[data-directive-assist-preview-action="${value.slice('assist.preview.'.length)}"]`, `[data-directive-tour="${value}"]`];
  }
  if (value.startsWith('assist.reconciliation.')) {
    return [`[data-directive-reconciliation-action="${value.slice('assist.reconciliation.'.length)}"]`, `[data-directive-tour="${value}"]`];
  }
  if (value.startsWith('message.action.')) {
    return [`[data-directive-message-action="${value.slice('message.action.'.length)}"]`, `[data-directive-tour="${value}"]`];
  }
  if (value.startsWith('message.marker.')) {
    return [`[data-directive-reconciliation-action="${value.slice('message.marker.'.length)}"]`, `[data-directive-tour="${value}"]`];
  }
  const mapped = {
    'runtime.panel': '#directive-runtime-panel',
    'assist.launcher': '#directive-assist-button',
    'message.launcher': '[data-directive-message-actions="true"]',
    'message.marker.status': '[data-directive-reconciliation-status]',
    'host.message-actions': '.extraMesButtons, .mes_buttons',
    'chat.input': '#send_textarea, textarea#send_textarea, textarea[name="send_textarea"]'
  };
  return [mapped[value], `[data-directive-tour="${value}"]`, `[data-directive-tour~="${value}"]`].filter(Boolean);
}

export function resolveDirectiveGuidanceTarget(target = '', fallbackTarget = '') {
  if (!canUseDocument()) return null;
  for (const selector of targetSelectors(target)) {
    const match = visibleElement([...(document.querySelectorAll?.(selector) || [])]);
    if (match) return match;
  }
  for (const selector of targetSelectors(fallbackTarget)) {
    const match = visibleElement([...(document.querySelectorAll?.(selector) || [])]);
    if (match) return match;
  }
  return null;
}

function createGuidanceAssistPreviewButton({ label, action, tour, icon = 'fa-solid fa-circle-dot' } = {}) {
  const button = createElement('button', 'menu_button interactable');
  button.type = 'button';
  button.dataset.directiveAssistPreviewAction = action;
  button.dataset.directiveTour = tour;
  button.appendChild(createIcon(icon));
  const text = createElement('span');
  text.textContent = label;
  button.appendChild(text);
  addTooltip(button, label);
  button.addEventListener?.('click', (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
  });
  return button;
}

function ensureGuidanceAssistPreviewFixture() {
  if (!canUseDocument()) return null;
  const existingTarget = resolveDirectiveGuidanceTarget('assist.preview.applyToChat', '');
  if (existingTarget) return existingTarget.closest?.('.directive-assist-preview') || existingTarget;
  let preview = document.getElementById?.('directive-guidance-assist-preview');
  if (preview) return preview;

  preview = createElement('section', 'directive-assist-preview directive-guidance-assist-preview-fixture');
  preview.id = 'directive-guidance-assist-preview';
  preview.setAttribute(GUIDANCE_FIXTURE_ATTRIBUTE, 'assist-preview');
  preview.setAttribute('aria-label', 'Directive Assist tutorial preview');
  const body = createElement('div', 'directive-assist-preview-body');
  const title = createElement('strong');
  title.textContent = 'Assist Preview';
  const editor = createElement('textarea', 'directive-assist-draft-editor');
  editor.value = 'Tutorial preview draft. These controls are shown for guidance only.';
  editor.setAttribute('readonly', 'readonly');
  const actions = createElement('div', 'directive-assist-preview-actions');
  actions.append(
    createGuidanceAssistPreviewButton({
      label: 'Apply to Chat',
      action: 'applyToChat',
      tour: 'assist.preview.applyToChat',
      icon: 'fa-solid fa-check'
    }),
    createGuidanceAssistPreviewButton({
      label: 'Replace Selection',
      action: 'replaceSelection',
      tour: 'assist.preview.replaceSelection',
      icon: 'fa-solid fa-i-cursor'
    }),
    createGuidanceAssistPreviewButton({
      label: 'Restore Rough Text',
      action: 'restoreRoughText',
      tour: 'assist.preview.restoreRoughText',
      icon: 'fa-solid fa-clock-rotate-left'
    }),
    createGuidanceAssistPreviewButton({
      label: 'Insert Summary',
      action: 'insertSummary',
      tour: 'assist.preview.insertSummary',
      icon: 'fa-solid fa-arrow-turn-down'
    }),
    createGuidanceAssistPreviewButton({
      label: 'Try Again',
      action: 'tryAgain',
      tour: 'assist.preview.tryAgain',
      icon: 'fa-solid fa-arrows-rotate'
    }),
    createGuidanceAssistPreviewButton({
      label: 'Cancel',
      action: 'cancel',
      tour: 'assist.preview.cancel',
      icon: 'fa-solid fa-xmark'
    })
  );
  body.append(title, editor, actions);
  preview.appendChild(body);
  appendDirectiveOverlay(preview, { fallbackParent: document.body });
  return preview;
}

async function prepareDirectiveGuidanceTarget(item = {}, controller = {}) {
  if (item.route && typeof controller.navigateToRoute === 'function') {
    await controller.navigateToRoute(item.route);
  }
  if (!canUseDocument()) return;
  await frameDelay();
  const prepare = String(item.prepare || '').trim();
  if (prepare !== 'assist-preview') removeGuidanceFixtures();
  if (prepare === 'campaign-command' || prepare === 'campaign-library' || prepare === 'campaign-records') {
    const target = prepare === 'campaign-library'
      ? 'campaign.subtab.library'
      : prepare === 'campaign-records'
        ? 'campaign.subtab.records'
        : 'campaign.subtab.command';
    document.querySelector?.(`[data-directive-tour="${target}"]`)?.click?.();
  }
  if (prepare === 'mission-active' || prepare === 'mission-context' || prepare === 'mission-open-threads' || prepare === 'mission-open-world') {
    const target = prepare === 'mission-context'
      ? 'mission.subtab.context'
      : prepare === 'mission-open-threads'
        ? 'mission.subtab.open-threads'
        : prepare === 'mission-open-world'
          ? 'mission.subtab.open-world'
          : 'mission.subtab.active';
    document.querySelector?.(`[data-directive-tour="${target}"]`)?.click?.();
  }
  if (prepare === 'crew-character' || prepare === 'crew-roster') {
    const target = prepare === 'crew-roster' ? 'crew.subtab.crew' : 'crew.subtab.character';
    document.querySelector?.(`[data-directive-tour="${target}"]`)?.click?.();
  }
  if (prepare === 'settings-systems' || prepare === 'settings-providers' || prepare === 'settings-safety') {
    const tabTarget = prepare === 'settings-providers'
      ? 'settings.providers-tab'
      : prepare === 'settings-safety'
        ? 'settings.safety-tab'
        : 'settings.systems-tab';
    document.querySelector?.(`[data-directive-tour="${tabTarget}"]`)?.click?.();
  }
  if (prepare === 'assist-menu') {
    const menu = document.getElementById?.('directive-assist-menu');
    const launcher = document.getElementById?.('directive-assist-button');
    if (launcher && (!menu || menu.hidden === true)) launcher.click?.();
  }
  if (prepare === 'assist-preview' || String(item.target || '').startsWith('assist.preview.')) {
    if (!resolveDirectiveGuidanceTarget(item.target, '')) ensureGuidanceAssistPreviewFixture();
  }
  if (prepare === 'message-menu' || prepare === 'message-host-menu') {
    const launcher = visibleElement([...(document.querySelectorAll?.('[data-directive-message-actions="true"]') || [])]);
    const menuId = launcher?.dataset?.directiveMessageActionsMenuId;
    const menu = menuId ? document.getElementById?.(menuId) : null;
    if (launcher && (!menu || menu.hidden === true)) launcher.click?.();
  }
  if (prepare === 'marker-menu') {
    const status = visibleElement([...(document.querySelectorAll?.('[data-directive-reconciliation-status]') || [])]);
    const menu = document.getElementById?.('directive-reconciliation-selection-menu');
    if (status && (!menu || menu.hidden === true)) status.click?.();
  }
  await frameDelay();
}

function positionPopover(popover, target = null) {
  if (!popover) return;
  const viewportWidth = Number(globalThis.innerWidth) || 1024;
  const viewportHeight = Number(globalThis.innerHeight) || 768;
  const margin = 14;
  const width = Math.min(360, Math.max(280, viewportWidth - (margin * 2)));
  popover.style.width = `${width}px`;
  if (!target?.getBoundingClientRect) {
    const popRect = popover.getBoundingClientRect?.() || { width, height: 180 };
    const height = Number(popRect.height) || 180;
    const maxTop = Math.max(margin, viewportHeight - height - margin);
    popover.dataset.placement = 'center';
    popover.style.left = `${Math.max(margin, Math.round((viewportWidth - width) / 2))}px`;
    popover.style.top = `${Math.max(margin, Math.min(Math.round((viewportHeight - height) / 2), maxTop))}px`;
    popover.style.transform = 'none';
    return;
  }
  const rect = target.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect?.() || { width, height: 180 };
  let left = rect.right + margin;
  if (left + width > viewportWidth - margin) left = rect.left - width - margin;
  if (left < margin) left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
  let top = rect.top + (rect.height / 2) - (popRect.height / 2);
  top = Math.max(margin, Math.min(top, viewportHeight - popRect.height - margin));
  popover.dataset.placement = 'target';
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.transform = 'none';
}

async function focusGuidanceTarget(item = {}, controller = {}) {
  await prepareDirectiveGuidanceTarget(item, controller);
  removeActiveTarget();
  const target = resolveDirectiveGuidanceTarget(item.target, item.fallbackTarget);
  if (!target) {
    positionPopover(document.getElementById?.(POPOVER_ID), null);
    return null;
  }
  activeTarget = target;
  target.classList?.add?.(TARGET_HIGHLIGHT_CLASS);
  target.setAttribute?.('data-directive-guidance-active-target', 'true');
  try {
    target.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  } catch {
    target.scrollIntoView?.();
  }
  positionPopover(document.getElementById?.(POPOVER_ID), target);
  return target;
}

function bindEscapeClose() {
  if (activeKeydownHandler || typeof document === 'undefined') return;
  activeKeydownHandler = (event) => {
    if (event?.key !== 'Escape') return;
    closeDirectiveGuidance('escape');
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  document.addEventListener?.('keydown', activeKeydownHandler);
}

function createActionButton({ label, className = 'directive-button directive-secondary-command', tooltip = '', onClick = null, icon = '' }) {
  const button = createElement('button', className);
  button.type = 'button';
  if (icon) button.appendChild(createIcon(icon));
  const text = createElement('span');
  text.textContent = label;
  button.appendChild(text);
  addTooltip(button, tooltip || label);
  button.addEventListener?.('click', async (event) => {
    event?.preventDefault?.();
    await onClick?.(event);
  });
  return button;
}

function createIconActionButton({ label, icon, className = '', onClick }) {
  const button = createElement('button', `directive-guidance-icon-button directive-icon-button${className ? ` ${className}` : ''}`);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  addTooltip(button, label);
  button.appendChild(createIcon(icon));
  button.addEventListener?.('click', async (event) => {
    event?.preventDefault?.();
    await onClick?.(event);
  });
  return button;
}

function createPopoverShell({ kind, title, body, indexLabel = '' }) {
  removeGuidancePopover();
  const popover = createElement('section', 'directive-guidance-popover directive-lcars-panel');
  popover.id = POPOVER_ID;
  popover.dataset.guidanceKind = kind;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-modal', 'false');
  popover.setAttribute('aria-labelledby', 'directive-guidance-title');

  const header = createElement('header', 'directive-guidance-header');
  const kicker = createElement('span', 'directive-lcars-kicker directive-guidance-kicker');
  kicker.textContent = kind === 'tip' ? 'Tip' : kind === 'startup' ? 'Guidance' : 'Tutorial';
  const titleElement = createElement('h2', 'directive-guidance-title');
  titleElement.id = 'directive-guidance-title';
  titleElement.textContent = title;
  const index = createElement('span', 'directive-guidance-index');
  index.textContent = indexLabel;
  const closeButton = createIconActionButton({
    label: 'Close',
    icon: 'fa-solid fa-xmark',
    className: 'directive-guidance-close-button',
    onClick: () => closeDirectiveGuidance('close')
  });
  header.append(kicker, closeButton, titleElement, index);

  const copy = createElement('p', 'directive-guidance-body');
  copy.textContent = body;
  const actions = createElement('div', 'directive-guidance-actions');
  popover.append(header, copy, actions);
  appendDirectiveOverlay(popover, { fallbackParent: document.body });
  bindEscapeClose();
  return { popover, actions };
}

async function renderTutorialStep(controller = {}) {
  if (!activeSession || activeSession.kind !== 'tutorial') return { shown: false };
  const tutorial = activeSession.tutorial;
  const stepIndex = Math.max(0, Math.min(activeSession.stepIndex, tutorial.steps.length - 1));
  activeSession.stepIndex = stepIndex;
  const item = tutorial.steps[stepIndex];
  const activeController = activeSession.controller || controller;
  await activeController?.onTutorialStep?.({
    tutorial,
    tutorialId: tutorial.id,
    step: item,
    stepId: item.id,
    stepIndex
  });
  const { popover, actions } = createPopoverShell({
    kind: 'tutorial',
    title: item.title,
    body: item.body,
    indexLabel: `${stepIndex + 1}/${tutorial.steps.length}`
  });
  const backButton = createActionButton({
      label: 'Back',
      tooltip: 'Back',
      onClick: async () => {
        if (activeSession.stepIndex > 0) activeSession.stepIndex -= 1;
        await renderTutorialStep(activeController);
      }
    });
  backButton.disabled = stepIndex === 0;
  backButton.setAttribute('aria-disabled', stepIndex === 0 ? 'true' : 'false');
  actions.append(
    backButton,
    createActionButton({
      label: stepIndex >= tutorial.steps.length - 1 ? 'Finish' : 'Next',
      className: 'directive-button directive-primary-command',
      tooltip: stepIndex >= tutorial.steps.length - 1 ? 'Finish tutorial' : 'Next',
      onClick: async () => {
        if (activeSession.stepIndex >= tutorial.steps.length - 1) {
          writeBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.firstTutorialCompleted, true);
          closeDirectiveGuidance('finish');
          return;
        }
        activeSession.stepIndex += 1;
        await renderTutorialStep(activeController);
      }
    })
  );
  positionPopover(popover, null);
  await focusGuidanceTarget(item, activeController);
  return { shown: true, tutorialId: tutorial.id, stepId: item.id };
}

async function renderTip(tipItem, controller = {}) {
  if (!tipItem) return { shown: false, reason: 'missing-tip' };
  activeSession = { kind: 'tip', tipId: tipItem.id, controller };
  recordTipShown(tipItem.id);
  removeActiveTarget();
  const { popover, actions } = createPopoverShell({
    kind: 'tip',
    title: tipItem.title,
    body: tipItem.body
  });
  const nav = createElement('div', 'directive-guidance-tip-nav');
  nav.append(
    createIconActionButton({
      label: 'Last Tip',
      icon: 'fa-solid fa-arrow-left',
      onClick: async () => showDirectiveGuidanceTip({ direction: 'previous' }, controller)
    }),
    createIconActionButton({
      label: 'Next Tip',
      icon: 'fa-solid fa-arrow-right',
      onClick: async () => showDirectiveGuidanceTip({ direction: 'next' }, controller)
    })
  );
  actions.append(
    createActionButton({
      label: 'Show Me',
      className: 'directive-button directive-primary-command',
      tooltip: 'Show Me',
      onClick: async () => focusGuidanceTarget(tipItem, controller)
    }),
    nav,
    createActionButton({
      label: 'Disable Tips',
      tooltip: 'Disable Tips',
      onClick: () => {
        writeBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipsDisabled, true);
        closeDirectiveGuidance('disable-tips');
      }
    })
  );
  positionPopover(popover, null);
  return { shown: true, tipId: tipItem.id };
}

export async function showDirectiveGuidanceTutorial({ tutorialId = DIRECTIVE_GUIDANCE_DEFAULT_TUTORIAL_ID, stepIndex = 0 } = {}, controller = {}) {
  const tutorial = getDirectiveTutorial(tutorialId);
  if (!tutorial) return { shown: false, reason: 'missing-tutorial' };
  closeDirectiveGuidance('replace');
  const normalizedStepIndex = Math.max(0, Math.min(Number(stepIndex) || 0, tutorial.steps.length - 1));
  await controller?.onTutorialStart?.({
    tutorial,
    tutorialId: tutorial.id,
    step: tutorial.steps[normalizedStepIndex],
    stepId: tutorial.steps[normalizedStepIndex]?.id || '',
    stepIndex: normalizedStepIndex
  });
  activeSession = {
    kind: 'tutorial',
    tutorial,
    stepIndex: normalizedStepIndex,
    controller
  };
  return renderTutorialStep(controller);
}

export async function showDirectiveGuidanceTip({ tipId = '', direction = 'next' } = {}, controller = {}) {
  if (readBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipsDisabled)) {
    return { shown: false, reason: 'tips-disabled' };
  }
  closeDirectiveGuidance('replace');
  const tipItem = selectTip({ tipId, direction });
  return renderTip(tipItem, controller);
}

export async function runDirectiveGuidanceStartupOffer(controller = {}) {
  if (!canUseDocument()) return { shown: false, reason: 'missing-document' };
  const preferences = getDirectiveGuidancePreferences();
  const shouldOfferTutorial = !preferences.firstTutorialCompleted
    && !preferences.tutorialPromptsDisabled
    && !preferences.startupOfferDismissedAt;
  if (!shouldOfferTutorial) {
    if (!preferences.tipsDisabled) return showDirectiveGuidanceTip({ direction: 'next' }, controller);
    return { shown: false, reason: 'guidance-disabled' };
  }

  closeDirectiveGuidance('replace');
  activeSession = { kind: 'startup', controller };
  const { popover, actions } = createPopoverShell({
    kind: 'startup',
    title: 'Learn Directive',
    body: 'Start the basic walkthrough now, leave it for later, or turn off tutorial and tip prompts separately.'
  });
  actions.append(
    createActionButton({
      label: 'Begin Tutorial',
      className: 'directive-button directive-primary-command',
      tooltip: 'Begin Tutorial',
      onClick: async () => showDirectiveGuidanceTutorial({ tutorialId: DIRECTIVE_GUIDANCE_DEFAULT_TUTORIAL_ID }, controller)
    }),
    createActionButton({
      label: 'Later',
      tooltip: 'Later',
      onClick: () => {
        writeStorage(DIRECTIVE_GUIDANCE_STORAGE_KEYS.startupOfferDismissedAt, nowIso());
        closeDirectiveGuidance('later');
      }
    }),
    createActionButton({
      label: 'Disable Tutorial',
      tooltip: 'Disable Tutorial',
      onClick: () => {
        writeBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tutorialPromptsDisabled, true);
        closeDirectiveGuidance('disable-tutorial');
      }
    }),
    createActionButton({
      label: 'Disable Tips',
      tooltip: 'Disable Tips',
      onClick: () => {
        writeBoolean(DIRECTIVE_GUIDANCE_STORAGE_KEYS.tipsDisabled, true);
        closeDirectiveGuidance('disable-tips');
      }
    })
  );
  positionPopover(popover, null);
  return { shown: true, kind: 'startup' };
}

export const __directiveGuidanceTestHooks = Object.freeze({
  close: closeDirectiveGuidance,
  resolveTarget: resolveDirectiveGuidanceTarget,
  prepareTarget: prepareDirectiveGuidanceTarget,
  storageKeys: DIRECTIVE_GUIDANCE_STORAGE_KEYS
});
