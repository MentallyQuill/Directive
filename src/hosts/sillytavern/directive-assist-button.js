import {
  DIRECTIVE_ASSIST_ACTIONS
} from '../../assist/directive-assist.mjs';
import { runRuntimeAction } from '../../runtime/runtime-actions.js';

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

function createButton({ className = '', title = '', label = '', iconClassName = '', iconGlyph = '', action = null } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className || 'menu_button interactable';
  button.title = title || label;
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
    iconClassName: 'fa-solid fa-arrow-turn-down',
    className: 'menu_button interactable'
  });
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
    iconClassName: 'directive-vector-glyph',
    iconGlyph: 'action-close',
    className: 'menu_button interactable'
  });
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
    iconClassName: 'fa-solid fa-check',
    className: 'menu_button interactable'
  });
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
      iconClassName: 'fa-solid fa-i-cursor',
      className: 'menu_button interactable'
    });
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
      iconClassName: 'fa-solid fa-clock-rotate-left',
      className: 'menu_button interactable'
    });
    restore.addEventListener('click', () => {
      setChatInputValue(chatInput, lastRecovery.original);
      closePreview();
    });
    actions.appendChild(restore);
  }

  const again = createButton({
    label: 'Try Again',
    iconClassName: 'fa-solid fa-arrows-rotate',
    className: 'menu_button interactable'
  });
  again.addEventListener('click', retry);
  const cancel = createButton({
    label: 'Cancel',
    iconClassName: 'directive-vector-glyph',
    iconGlyph: 'action-close',
    className: 'menu_button interactable'
  });
  cancel.addEventListener('click', closePreview);
  actions.append(again, cancel);
  body.appendChild(actions);
  preview.replaceChildren(body);
}

function renderPreview({ assistResult, chatInput, retry }) {
  const preview = getOrCreateLayer(DIRECTIVE_ASSIST_PREVIEW_ID, 'directive-assist-preview');
  preview.hidden = false;
  if (assistResult.action === 'briefMe') {
    renderBrief(preview, { assistResult, chatInput });
  } else {
    renderDraft(preview, { assistResult, chatInput, retry });
  }
  return preview;
}

async function runAssistAction({ action, chatInput, runAssist }) {
  const button = document.getElementById(DIRECTIVE_ASSIST_BUTTON_ID);
  const originalTitle = button?.title || '';
  if (button) {
    button.dataset.directiveAssistBusy = 'true';
    button.title = 'Directive Assist is drafting.';
  }
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
    if (button) {
      button.dataset.directiveAssistBusy = 'false';
      button.title = originalTitle || 'Open Directive Assist';
    }
  }
}

function buildMenu({ chatInput, runAssist }) {
  const menu = getOrCreateLayer(DIRECTIVE_ASSIST_MENU_ID, 'directive-assist-menu');
  menu.replaceChildren();
  for (const action of MENU_ACTIONS) {
    const item = createButton({
      label: action.label,
      action: action.id,
      iconClassName: action.id === 'briefMe'
        ? 'fa-solid fa-circle-info'
        : action.id === 'frameAsReport'
          ? 'fa-solid fa-clipboard-list'
          : action.id === 'frameAsOrder'
            ? 'fa-solid fa-bullhorn'
            : 'fa-solid fa-pen-nib',
      className: 'menu_button interactable directive-assist-menu-action'
    });
    item.addEventListener('click', () => runAssistAction({
      action: action.id,
      chatInput,
      runAssist
    }));
    menu.appendChild(item);
  }
  return menu;
}

export function installDirectiveAssistButton({
  runAssist = (payload) => runRuntimeAction('assist.run', payload)
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
  button.setAttribute('aria-label', 'Open Directive Assist');
  button.dataset.directiveAssistBusy = 'false';

  const menu = buildMenu({ chatInput, runAssist });
  button.addEventListener('click', (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    closePreview();
    menu.hidden = !menu.hidden;
  });

  placeAssistButton(button, chatInput);
  return true;
}

export const __directiveAssistButtonTestHooks = Object.freeze({
  chatInputValue,
  setChatInputValue,
  replaceSelectedText,
  selectedTextAvailable,
  getLastRecovery() {
    return lastRecovery ? { ...lastRecovery } : null;
  },
  resetRecovery() {
    lastRecovery = null;
  }
});
