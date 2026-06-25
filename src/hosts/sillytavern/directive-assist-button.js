import {
  DIRECTIVE_ASSIST_ACTIONS
} from '../../assist/directive-assist.mjs';
import { runRuntimeAction } from '../../runtime/runtime-actions.js';
import {
  SCENE_RECONCILIATION_ACTION_IDS,
  SCENE_RECONCILIATION_TOOLTIPS
} from '../../runtime/scene-reconciliation.mjs';
import { addTooltip } from '../../ui/runtime-ui-kit.js';

export const DIRECTIVE_ASSIST_BUTTON_ID = 'directive-assist-button';
export const DIRECTIVE_ASSIST_MENU_ID = 'directive-assist-menu';
export const DIRECTIVE_ASSIST_PREVIEW_ID = 'directive-assist-preview';

const CHAT_INPUT_SELECTORS = Object.freeze([
  '#send_textarea',
  'textarea#send_textarea',
  'textarea[name="send_textarea"]',
  '#send_textarea textarea',
  'textarea[placeholder*="Send"]',
  'textarea'
]);

const QUICK_BUTTON_SELECTORS = Object.freeze([
  '#extensionsMenuButton',
  '#extensionsMenuButtonContainer',
  '#extensionsMenuButtonHolder',
  '#leftSendForm',
  '.fa-wand-magic-sparkles',
  '.fa-magic'
]);

const MENU_ACTIONS = Object.freeze([
  DIRECTIVE_ASSIST_ACTIONS.draftInCharacter,
  DIRECTIVE_ASSIST_ACTIONS.briefMe,
  DIRECTIVE_ASSIST_ACTIONS.frameAsOrder,
  DIRECTIVE_ASSIST_ACTIONS.frameAsReport
]);

const SCENE_NAVIGATION_MENU_ACTIONS = Object.freeze([
  {
    id: 'continueScene',
    label: 'Continue Scene',
    title: 'Draft a local scene-continuation cue for the composer.',
    iconClassName: 'fa-solid fa-forward-step'
  },
  {
    id: 'cutWithinScene',
    label: 'Cut Within Scene',
    title: 'Draft a local scene-transition cue that stays inside the current unresolved situation.',
    iconClassName: 'fa-solid fa-scissors'
  }
]);

const RECONCILIATION_MENU_ACTIONS = Object.freeze([
  {
    id: 'reconcileMarked',
    label: 'Reconcile Marked Passage',
    runtimeActionId: SCENE_RECONCILIATION_ACTION_IDS.reconcileMarked,
    title: SCENE_RECONCILIATION_TOOLTIPS.reconcileMarked,
    iconClassName: 'fa-solid fa-arrows-rotate'
  },
  {
    id: 'openPending',
    label: 'Open Pending Reconciliation',
    runtimeActionId: SCENE_RECONCILIATION_ACTION_IDS.openPending,
    title: SCENE_RECONCILIATION_TOOLTIPS.openPending,
    iconClassName: 'fa-solid fa-list-check'
  }
]);

const COMMAND_BEARING_TRACKS = Object.freeze([
  {
    id: 'inspiration',
    label: 'Inspiration',
    checkAction: DIRECTIVE_ASSIST_ACTIONS.checkInspiration,
    iconClassName: 'fa-regular fa-lightbulb'
  },
  {
    id: 'resolve',
    label: 'Resolve',
    checkAction: DIRECTIVE_ASSIST_ACTIONS.checkResolve,
    iconClassName: 'fa-solid fa-shield-halved'
  }
]);

let lastRecovery = null;

function canUseDocument() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function queryFirst(selectors = []) {
  for (const selector of selectors) {
    const element = document.querySelector?.(selector);
    if (element) return element;
  }
  return null;
}

function createIcon(className, glyph = '') {
  const icon = document.createElement('i');
  icon.className = className;
  if (glyph) icon.dataset.glyph = glyph;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function createBusySpinner() {
  const spinner = document.createElement('span');
  spinner.className = 'directive-assist-button-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  return spinner;
}

function createButton({ className = '', title = '', label = '', iconClassName = '', iconGlyph = '', action = null } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className || 'menu_button interactable';
  addTooltip(button, title || label);
  if (action) button.dataset.directiveAssistAction = action;
  if (iconClassName || iconGlyph) {
    button.appendChild(createIcon(iconClassName || 'directive-vector-glyph', iconGlyph));
  }
  const text = document.createElement('span');
  text.textContent = label;
  button.appendChild(text);
  return button;
}

function chatInputValue(input) {
  return String(input?.value || '');
}

function dispatchChatInputEvents(input) {
  if (!input) return;
  for (const type of ['input', 'change']) {
    try {
      input.dispatchEvent?.(new Event(type, { bubbles: true }));
    } catch {
      input.dispatchEvent?.({ type, bubbles: true });
    }
  }
}

function setChatInputValue(input, value) {
  if (!input) return false;
  input.value = String(value || '');
  dispatchChatInputEvents(input);
  input.focus?.();
  return true;
}

function replaceSelectedText(input, value) {
  if (!input) return false;
  const start = Number(input.selectionStart);
  const end = Number(input.selectionEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) {
    return setChatInputValue(input, value);
  }
  const current = chatInputValue(input);
  input.value = `${current.slice(0, start)}${value}${current.slice(end)}`;
  const cursor = start + String(value || '').length;
  input.setSelectionRange?.(cursor, cursor);
  dispatchChatInputEvents(input);
  input.focus?.();
  return true;
}

function selectedTextAvailable(input) {
  const start = Number(input?.selectionStart);
  const end = Number(input?.selectionEnd);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function insertAfter(referenceNode, node) {
  const parent = referenceNode?.parentNode;
  if (!parent) return false;
  if (typeof referenceNode.after === 'function') {
    referenceNode.after(node);
    return true;
  }
  if (typeof parent.insertBefore === 'function') {
    parent.insertBefore(node, referenceNode.nextSibling || null);
    return true;
  }
  parent.appendChild?.(node);
  return true;
}

function insertBefore(referenceNode, node) {
  const parent = referenceNode?.parentNode;
  if (!parent) return false;
  if (typeof parent.insertBefore === 'function') {
    parent.insertBefore(node, referenceNode);
    return true;
  }
  parent.appendChild?.(node);
  return true;
}

function placeAssistButton(button, chatInput) {
  const quickButton = queryFirst(QUICK_BUTTON_SELECTORS);
  if (quickButton && insertAfter(quickButton, button)) return true;
  if (chatInput && insertBefore(chatInput, button)) return true;
  document.body?.appendChild(button);
  return true;
}

function getOrCreateLayer(id, className) {
  const existing = document.getElementById(id);
  if (existing) return existing;
  const layer = document.createElement('div');
  layer.id = id;
  layer.className = className;
  layer.hidden = true;
  document.body?.appendChild(layer);
  return layer;
}

function closeMenu() {
  const menu = document.getElementById(DIRECTIVE_ASSIST_MENU_ID);
  if (menu) menu.hidden = true;
}

function closePreview() {
  const preview = document.getElementById(DIRECTIVE_ASSIST_PREVIEW_ID);
  if (preview) preview.hidden = true;
}

function briefText(brief = {}) {
  const rows = [];
  if (brief.summary) rows.push(brief.summary);
  for (const [label, values] of [
    ['Known', brief.known],
    ['Uncertain', brief.uncertain],
    ['Routine', brief.routine],
    ['Pressure', brief.pressure],
    ['Decision', brief.decision]
  ]) {
    const list = Array.isArray(values) ? values.filter(Boolean) : [];
    if (list.length > 0) {
      rows.push(`${label}: ${list.join(' ')}`);
    }
  }
  return rows.join('\n');
}

function renderBrief(preview, { assistResult, chatInput }) {
  const body = document.createElement('div');
  body.className = 'directive-assist-preview-body';

  const title = document.createElement('strong');
  title.textContent = assistResult.title || 'Brief Me';
  body.appendChild(title);

  const text = document.createElement('div');
  text.className = 'directive-assist-brief';
  text.textContent = briefText(assistResult.brief) || 'No player-safe brief is available yet.';
  body.appendChild(text);

  const actions = document.createElement('div');
  actions.className = 'directive-assist-preview-actions';
  const insert = createButton({
    label: 'Insert Summary',
    title: 'Insert this player-safe brief into the chat box.',
    iconClassName: 'fa-solid fa-arrow-turn-down',
    className: 'menu_button interactable'
  });
  insert.dataset.directiveAssistPreviewAction = 'insertSummary';
  insert.dataset.directiveTour = 'assist.preview.insertSummary';
  insert.addEventListener('click', () => {
    const original = chatInputValue(chatInput);
    const summary = assistResult.brief?.summary || briefText(assistResult.brief);
    lastRecovery = {
      original,
      applied: summary,
      action: assistResult.action,
      appliedAt: Date.now()
    };
    setChatInputValue(chatInput, summary);
    closePreview();
  });
  const cancel = createButton({
    label: 'Cancel',
    title: 'Close Directive Assist without changing chat text.',
    iconClassName: 'directive-vector-glyph',
    iconGlyph: 'action-close',
    className: 'menu_button interactable'
  });
  cancel.dataset.directiveAssistPreviewAction = 'cancel';
  cancel.dataset.directiveTour = 'assist.preview.cancel';
  cancel.addEventListener('click', closePreview);
  actions.append(insert, cancel);
  body.appendChild(actions);
  preview.replaceChildren(body);
}

function renderDraft(preview, { assistResult, chatInput, retry }) {
  const body = document.createElement('div');
  body.className = 'directive-assist-preview-body';

  const title = document.createElement('strong');
  title.textContent = assistResult.title || assistResult.label || 'Directive Assist';
  body.appendChild(title);

  const editor = document.createElement('textarea');
  editor.className = 'directive-assist-draft-editor';
  editor.value = assistResult.replacementText || '';
  editor.rows = 7;
  body.appendChild(editor);

  const notes = [...(assistResult.notes || []), ...(assistResult.warnings || [])].filter(Boolean);
  if (notes.length > 0) {
    const noteList = document.createElement('div');
    noteList.className = 'directive-assist-notes';
    noteList.textContent = notes.join(' ');
    body.appendChild(noteList);
  }

  const actions = document.createElement('div');
  actions.className = 'directive-assist-preview-actions';
  const apply = createButton({
    label: 'Apply to Chat',
    title: 'Replace the chat box with this draft.',
    iconClassName: 'fa-solid fa-check',
    className: 'menu_button interactable'
  });
  apply.dataset.directiveAssistPreviewAction = 'applyToChat';
  apply.dataset.directiveTour = 'assist.preview.applyToChat';
  apply.addEventListener('click', () => {
    const original = chatInputValue(chatInput);
    const applied = editor.value;
    lastRecovery = {
      original,
      applied,
      action: assistResult.action,
      appliedAt: Date.now()
    };
    setChatInputValue(chatInput, applied);
    closePreview();
  });
  actions.appendChild(apply);

  if (selectedTextAvailable(chatInput)) {
    const replaceSelection = createButton({
      label: 'Replace Selection',
      title: 'Replace only the selected chat text with this draft.',
      iconClassName: 'fa-solid fa-i-cursor',
      className: 'menu_button interactable'
    });
    replaceSelection.dataset.directiveAssistPreviewAction = 'replaceSelection';
    replaceSelection.dataset.directiveTour = 'assist.preview.replaceSelection';
    replaceSelection.addEventListener('click', () => {
      const original = chatInputValue(chatInput);
      const applied = editor.value;
      lastRecovery = {
        original,
        applied,
        action: assistResult.action,
        appliedAt: Date.now()
      };
      replaceSelectedText(chatInput, applied);
      closePreview();
    });
    actions.appendChild(replaceSelection);
  }

  if (lastRecovery?.original) {
    const restore = createButton({
      label: 'Restore Rough Text',
      title: 'Restore the text that was in the chat box before applying Assist.',
      iconClassName: 'fa-solid fa-clock-rotate-left',
      className: 'menu_button interactable'
    });
    restore.dataset.directiveAssistPreviewAction = 'restoreRoughText';
    restore.dataset.directiveTour = 'assist.preview.restoreRoughText';
    restore.addEventListener('click', () => {
      setChatInputValue(chatInput, lastRecovery.original);
      closePreview();
    });
    actions.appendChild(restore);
  }

  const again = createButton({
    label: 'Try Again',
    title: 'Generate another Assist result for the same action.',
    iconClassName: 'fa-solid fa-arrows-rotate',
    className: 'menu_button interactable'
  });
  again.dataset.directiveAssistPreviewAction = 'tryAgain';
  again.dataset.directiveTour = 'assist.preview.tryAgain';
  again.addEventListener('click', retry);
  const cancel = createButton({
    label: 'Cancel',
    title: 'Close Directive Assist without changing chat text.',
    iconClassName: 'directive-vector-glyph',
    iconGlyph: 'action-close',
    className: 'menu_button interactable'
  });
  cancel.dataset.directiveAssistPreviewAction = 'cancel';
  cancel.dataset.directiveTour = 'assist.preview.cancel';
  cancel.addEventListener('click', closePreview);
  actions.append(again, cancel);
  body.appendChild(actions);
  preview.replaceChildren(body);
}

function renderFitCheck(preview, { assistResult }) {
  const body = document.createElement('div');
  body.className = 'directive-assist-preview-body directive-assist-fit-check';

  const title = document.createElement('strong');
  title.textContent = assistResult.title || `Check ${assistResult.label || 'Command Bearing'}`;
  body.appendChild(title);

  const summary = document.createElement('div');
  summary.className = `directive-assist-fit-summary directive-assist-fit-${assistResult.fit || 'unknown'}`;
  summary.textContent = assistResult.summary || 'No fit report is available.';
  body.appendChild(summary);

  const appendDetailGroup = (label, values) => {
    const items = (Array.isArray(values) ? values : [values]).filter(Boolean);
    if (!items.length) return;
    const group = document.createElement('div');
    group.className = 'directive-assist-fit-details';
    const heading = document.createElement('span');
    heading.className = 'directive-assist-fit-details-label';
    heading.textContent = label;
    const copy = document.createElement('p');
    copy.textContent = items.join(' ');
    group.append(heading, copy);
    body.appendChild(group);
  };
  appendDetailGroup('What works', assistResult.whatWorks || []);
  appendDetailGroup('Missing', assistResult.missing || []);
  appendDetailGroup('Tip', assistResult.suggestions?.length ? assistResult.suggestions : assistResult.tip);
  if (assistResult.warnings?.length) {
    appendDetailGroup('Warning', assistResult.warnings);
  }

  const actions = document.createElement('div');
  actions.className = 'directive-assist-preview-actions';
  const cancel = createButton({
    label: 'Close',
    title: 'Close the Command Bearing fit report without changing chat text.',
    iconClassName: 'directive-vector-glyph',
    iconGlyph: 'action-close',
    className: 'menu_button interactable'
  });
  cancel.dataset.directiveAssistPreviewAction = 'closeFitCheck';
  cancel.dataset.directiveTour = 'assist.preview.closeFitCheck';
  cancel.addEventListener('click', closePreview);
  actions.appendChild(cancel);
  body.appendChild(actions);
  preview.replaceChildren(body);
}

function renderPreview({ assistResult, chatInput, retry }) {
  const preview = getOrCreateLayer(DIRECTIVE_ASSIST_PREVIEW_ID, 'directive-assist-preview');
  preview.hidden = false;
  if (assistResult.kind === 'directive.commandBearingFitCheck') {
    renderFitCheck(preview, { assistResult });
  } else if (assistResult.action === 'briefMe') {
    renderBrief(preview, { assistResult, chatInput });
  } else {
    renderDraft(preview, { assistResult, chatInput, retry });
  }
  return preview;
}

function notifyAssistGeneration(action) {
  const label = DIRECTIVE_ASSIST_ACTIONS[action]?.label || 'Directive Assist';
  globalThis.toastr?.info?.(`${label} is generating.`);
}

function setAssistButtonBusy(button, busy, tooltip = '') {
  if (!button) return;
  button.dataset.directiveAssistBusy = busy ? 'true' : 'false';
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
  addTooltip(button, tooltip || (busy ? 'Directive Assist is drafting.' : 'Open Directive Assist'));
}

async function runAssistAction({ action, chatInput, runAssist }) {
  const button = document.getElementById(DIRECTIVE_ASSIST_BUTTON_ID);
  const originalTooltip = button?.dataset?.directiveTooltip || '';
  setAssistButtonBusy(button, true, 'Directive Assist is drafting.');
  notifyAssistGeneration(action);
  closeMenu();
  try {
    const payload = {
      action,
      inputText: chatInputValue(chatInput)
    };
    const result = await runAssist(payload);
    const assistResult = result?.assistResult || result;
    renderPreview({
      assistResult,
      chatInput,
      retry: () => runAssistAction({ action, chatInput, runAssist })
    });
    return assistResult;
  } finally {
    setAssistButtonBusy(button, false, originalTooltip || 'Open Directive Assist');
  }
}

function sceneNavigationShortcutText(action, currentText = '') {
  const current = String(currentText || '').trim();
  if (action === 'cutWithinScene') {
    return current
      ? `Cut within the current scene to ${current}`
      : 'Cut within the current scene to the next immediate beat.';
  }
  return 'Continue the scene.';
}

function createSceneNavigationShortcutResult({ action, chatInput }) {
  const spec = SCENE_NAVIGATION_MENU_ACTIONS.find((item) => item.id === action)
    || SCENE_NAVIGATION_MENU_ACTIONS[0];
  return {
    ok: true,
    action: spec.id,
    label: spec.label,
    title: spec.label,
    source: 'local-scene-navigation-shortcut',
    replacementText: sceneNavigationShortcutText(spec.id, chatInputValue(chatInput)),
    notes: ['Scene navigation is still checked when the message is sent.'],
    warnings: []
  };
}

function runSceneNavigationShortcut({ action, chatInput }) {
  closeMenu();
  const assistResult = createSceneNavigationShortcutResult({ action, chatInput });
  renderPreview({
    assistResult,
    chatInput,
    retry: () => runSceneNavigationShortcut({ action, chatInput })
  });
  return assistResult;
}

async function runRuntimeActionSafely(actionId, payload = {}) {
  try {
    return await runRuntimeAction(actionId, payload);
  } catch {
    return null;
  }
}

function commandBearingViewFromResult(result = {}) {
  return result?.commandBearingPlayerView
    || result?.view?.commandBearingPlayerView
    || result?.view?.loadedCommandBearingPlayerView
    || null;
}

function renderCommandBearingSection(section, {
  view = null,
  runAssist,
  runCommandBearing,
  chatInput
} = {}) {
  section.replaceChildren();
  section.dataset.directiveCommandBearingStatus = view ? 'ready' : 'unavailable';

  const heading = document.createElement('div');
  heading.className = 'directive-assist-command-bearing-heading';
  const title = document.createElement('strong');
  title.textContent = 'Command Bearing';
  heading.appendChild(title);
  const status = document.createElement('span');
  status.className = 'directive-assist-command-bearing-status';
  const readied = view?.readied || null;
  status.textContent = readied?.track
    ? `${readied.track === 'inspiration' ? 'Inspiration' : 'Resolve'} readied`
    : 'No point readied';
  heading.appendChild(status);
  section.appendChild(heading);

  for (const track of COMMAND_BEARING_TRACKS) {
    const trackView = view?.tracks?.[track.id] || {};
    const points = Number(trackView.points || 0);
    const sameReadied = readied?.track === track.id;
    const otherReadied = readied && readied.track !== track.id;
    const row = document.createElement('div');
    row.className = 'directive-assist-command-bearing-row';
    row.dataset.directiveCommandBearingRow = track.id;
    row.dataset.directiveCommandBearingReadied = sameReadied ? 'true' : 'false';

    const trackSummary = document.createElement('div');
    trackSummary.className = 'directive-assist-command-bearing-track';
    trackSummary.appendChild(createIcon(`${track.iconClassName} directive-assist-command-bearing-track-icon`));

    const trackText = document.createElement('div');
    trackText.className = 'directive-assist-command-bearing-track-text';
    const label = document.createElement('span');
    label.className = 'directive-assist-command-bearing-label';
    label.textContent = track.label;
    trackText.appendChild(label);
    const count = document.createElement('span');
    count.className = 'directive-assist-command-bearing-count';
    count.dataset.directiveCommandBearingCount = track.id;
    count.textContent = `${points} ${points === 1 ? 'pt' : 'pts'}`;
    count.setAttribute('aria-label', `${track.label} points: ${points}`);
    trackText.appendChild(count);
    trackSummary.appendChild(trackText);
    row.appendChild(trackSummary);

    const actions = document.createElement('div');
    actions.className = 'directive-assist-command-bearing-actions';
    const check = createButton({
      label: 'Check',
      action: track.checkAction.id,
      title: track.checkAction.tooltip || `Check whether this message fits ${track.label}.`,
      iconClassName: 'fa-solid fa-magnifying-glass-chart',
      className: 'menu_button interactable directive-assist-command-bearing-check'
    });
    check.dataset.directiveTour = `assist.action.${track.checkAction.id}`;
    check.setAttribute('aria-label', `Check ${track.label}`);
    check.addEventListener('click', () => runAssistAction({
      action: track.checkAction.id,
      chatInput,
      runAssist
    }));
    actions.appendChild(check);

    const actionButton = createButton({
      label: sameReadied ? 'Cancel' : 'Ready',
      title: sameReadied
        ? `Cancel the Readied ${track.label} point.`
        : `Ready one ${track.label} point for the next player message.`,
      iconClassName: sameReadied ? 'fa-solid fa-xmark' : track.iconClassName,
      className: 'menu_button interactable directive-assist-command-bearing-button directive-assist-command-bearing-action'
    });
    actionButton.dataset.directiveCommandBearingTrack = track.id;
    actionButton.dataset.directiveCommandBearingAction = sameReadied ? 'cancel' : 'ready';
    actionButton.setAttribute('aria-label', sameReadied ? `Cancel Readied ${track.label} point` : `Ready ${track.label}`);
    actionButton.disabled = !view || (!sameReadied && (otherReadied || points <= 0));
    actionButton.addEventListener('click', async () => {
      actionButton.disabled = true;
      const result = sameReadied
        ? await runCommandBearing('cancel', { readiedId: readied?.id || null })
        : await runCommandBearing('ready', { track: track.id });
      renderCommandBearingSection(section, {
        view: commandBearingViewFromResult(result) || view,
        runAssist,
        runCommandBearing,
        chatInput
      });
    });
    actions.appendChild(actionButton);
    row.appendChild(actions);
    section.appendChild(row);
  }
}

async function refreshCommandBearingSection(menu, {
  runAssist,
  runCommandBearing,
  chatInput
} = {}) {
  const section = menu.querySelector?.('[data-directive-command-bearing-section="true"]')
    || menu.children?.find?.((child) => child.dataset?.directiveCommandBearingSection === 'true')
    || null;
  if (!section) return null;
  section.dataset.directiveCommandBearingStatus = 'loading';
  try {
    const result = await runCommandBearing('view', {});
    renderCommandBearingSection(section, {
      view: commandBearingViewFromResult(result),
      runAssist,
      runCommandBearing,
      chatInput
    });
    return result;
  } catch {
    renderCommandBearingSection(section, {
      view: null,
      runAssist,
      runCommandBearing,
      chatInput
    });
    return null;
  }
}

async function runReconciliationMenuAction({ action, runReconciliation }) {
  closeMenu();
  const result = await runReconciliation(action.runtimeActionId, {});
  await runRuntimeActionSafely('runtime.setTab', { tabId: 'mission' });
  await runRuntimeActionSafely('runtime.open');
  return result;
}

function appendMenuDivider(menu) {
  const divider = document.createElement('div');
  divider.className = 'directive-assist-menu-divider';
  divider.setAttribute('role', 'separator');
  menu.appendChild(divider);
}

function buildMenu({ chatInput, runAssist, runReconciliation, runCommandBearing }) {
  const menu = getOrCreateLayer(DIRECTIVE_ASSIST_MENU_ID, 'directive-assist-menu');
  menu.replaceChildren();
  const commandBearing = document.createElement('section');
  commandBearing.className = 'directive-assist-command-bearing';
  commandBearing.dataset.directiveCommandBearingSection = 'true';
  renderCommandBearingSection(commandBearing, {
    view: null,
    runAssist,
    runCommandBearing,
    chatInput
  });
  menu.appendChild(commandBearing);
  appendMenuDivider(menu);
  for (const action of MENU_ACTIONS) {
    const item = createButton({
      label: action.label,
      action: action.id,
      title: action.tooltip || action.label,
      iconClassName: action.id === 'briefMe'
        ? 'fa-solid fa-circle-info'
        : action.id === 'frameAsReport'
          ? 'fa-solid fa-clipboard-list'
          : action.id === 'frameAsOrder'
            ? 'fa-solid fa-bullhorn'
            : 'fa-solid fa-pen-nib',
      className: 'menu_button interactable directive-assist-menu-action'
    });
    item.dataset.directiveTour = `assist.action.${action.id}`;
    item.addEventListener('click', () => runAssistAction({
      action: action.id,
      chatInput,
      runAssist
    }));
    menu.appendChild(item);
  }
  appendMenuDivider(menu);
  for (const action of SCENE_NAVIGATION_MENU_ACTIONS) {
    const item = createButton({
      label: action.label,
      action: action.id,
      title: action.title,
      iconClassName: action.iconClassName,
      className: 'menu_button interactable directive-assist-menu-action directive-assist-menu-scene-action'
    });
    item.dataset.directiveTour = `assist.action.${action.id}`;
    item.addEventListener('click', () => runSceneNavigationShortcut({
      action: action.id,
      chatInput
    }));
    menu.appendChild(item);
  }
  appendMenuDivider(menu);
  for (const action of RECONCILIATION_MENU_ACTIONS) {
    const item = createButton({
      label: action.label,
      action: action.id,
      title: action.title,
      iconClassName: action.iconClassName,
      className: 'menu_button interactable directive-assist-menu-action directive-assist-menu-reconciliation-action'
    });
    item.dataset.directiveReconciliationAction = action.id;
    item.dataset.directiveRuntimeAction = action.runtimeActionId;
    item.dataset.directiveTour = `assist.reconciliation.${action.id}`;
    item.addEventListener('click', () => runReconciliationMenuAction({
      action,
      runReconciliation
    }));
    menu.appendChild(item);
  }
  return menu;
}

export function installDirectiveAssistButton({
  runAssist = (payload) => runRuntimeAction('assist.run', payload),
  runReconciliation = (actionId, payload) => runRuntimeAction(actionId, payload),
  runCommandBearing = (action, payload) => runRuntimeAction(`commandBearing.${action}`, payload)
} = {}) {
  if (!canUseDocument()) return false;
  if (document.getElementById(DIRECTIVE_ASSIST_BUTTON_ID)) return true;

  const chatInput = queryFirst(CHAT_INPUT_SELECTORS);
  if (!chatInput) return false;

  const button = createButton({
    label: '',
    title: 'Open Directive Assist',
    iconClassName: 'directive-vector-glyph directive-assist-button-icon',
    iconGlyph: 'route-ship',
    className: 'menu_button interactable directive-assist-button'
  });
  button.id = DIRECTIVE_ASSIST_BUTTON_ID;
  button.dataset.directiveTour = 'assist.launcher';
  button.setAttribute('aria-label', 'Open Directive Assist');
  button.setAttribute('aria-busy', 'false');
  button.dataset.directiveAssistBusy = 'false';
  button.appendChild(createBusySpinner());

  const menu = buildMenu({ chatInput, runAssist, runReconciliation, runCommandBearing });
  button.addEventListener('click', (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    closePreview();
    menu.hidden = !menu.hidden;
    if (!menu.hidden) {
      return refreshCommandBearingSection(menu, {
        runAssist,
        runCommandBearing,
        chatInput
      });
    }
    return undefined;
  });

  placeAssistButton(button, chatInput);
  return true;
}

export function disposeDirectiveAssistButton() {
  if (!canUseDocument()) return false;
  closeMenu();
  closePreview();
  document.getElementById(DIRECTIVE_ASSIST_BUTTON_ID)?.remove();
  document.getElementById(DIRECTIVE_ASSIST_MENU_ID)?.remove();
  document.getElementById(DIRECTIVE_ASSIST_PREVIEW_ID)?.remove();
  lastRecovery = null;
  return true;
}

export const __directiveAssistButtonTestHooks = Object.freeze({
  chatInputValue,
  setChatInputValue,
  replaceSelectedText,
  selectedTextAvailable,
  notifyAssistGeneration,
  setAssistButtonBusy,
  createSceneNavigationShortcutResult,
  runSceneNavigationShortcut,
  getLastRecovery() {
    return lastRecovery ? { ...lastRecovery } : null;
  },
  resetRecovery() {
    lastRecovery = null;
  }
});
