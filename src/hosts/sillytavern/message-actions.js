import { runRuntimeAction } from '../../runtime/runtime-actions.js';
import {
  SCENE_RECONCILIATION_ACTION_IDS,
  SCENE_RECONCILIATION_MESSAGE_ACTIONS
} from '../../runtime/scene-reconciliation.mjs';

export const DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS = 'directive-message-actions-button';
export const DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS = 'directive-message-actions-menu';

const MESSAGE_SELECTOR = '#chat .mes[mesid]';
const RESCAN_EVENT_KEYS = Object.freeze([
  'USER_MESSAGE_RENDERED',
  'CHARACTER_MESSAGE_RENDERED',
  'MESSAGE_UPDATED',
  'MESSAGE_SWIPED',
  'MORE_MESSAGES_LOADED',
  'CHAT_CHANGED',
  'CHAT_LOADED'
]);

let observer = null;
let installed = false;
let eventRegistrationCount = 0;
let pendingRescan = false;

function canUseDocument() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function numericIndex(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function messageIdFromElement(messageElement) {
  return compact(
    messageElement?.getAttribute?.('mesid')
    || messageElement?.dataset?.messageId
    || messageElement?.dataset?.mesid
    || ''
  );
}

function messageTextFromElement(messageElement) {
  const textElement = messageElement?.querySelector?.('.mes_text');
  return compact(textElement?.textContent || messageElement?.textContent || '');
}

function messagePayloadFromElement(messageElement) {
  const hostMessageId = messageIdFromElement(messageElement);
  return {
    message: {
      hostMessageId,
      id: hostMessageId,
      index: numericIndex(hostMessageId),
      text: messageTextFromElement(messageElement)
    }
  };
}

function getOrCreateExtraButtons(messageElement) {
  const existing = messageElement.querySelector?.('.extraMesButtons');
  if (existing) return existing;
  const mesButtons = messageElement.querySelector?.('.mes_buttons')
    || messageElement.querySelector?.('.mes_block')
    || messageElement;
  const extra = document.createElement('div');
  extra.className = 'extraMesButtons';
  mesButtons.appendChild?.(extra);
  return extra;
}

function closeMenus(except = null) {
  const menus = document.querySelectorAll?.(`.${DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS}`) || [];
  for (const menu of menus) {
    if (menu !== except) menu.hidden = true;
  }
}

function notifyResult(action, result) {
  const label = action?.label || 'Directive action';
  if (result?.ok === false || result?.result?.ok === false) {
    const reason = result?.reason || result?.result?.reason || result?.error?.message || 'Action could not complete.';
    globalThis.toastr?.warning?.(`${label}: ${reason}`);
    return;
  }
  const summary = result?.result?.summary
    || result?.result?.sceneReconciliation?.lastResult?.summary
    || result?.summary
    || label;
  globalThis.toastr?.success?.(summary);
}

async function runRuntimeActionSafely(actionId, payload = {}) {
  try {
    return await runRuntimeAction(actionId, payload);
  } catch {
    return null;
  }
}

function createMenuItem({ action, messageElement, runAction }) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'menu_button interactable directive-message-actions-menu-item';
  item.title = action.tooltip;
  item.setAttribute('aria-label', `${action.label}: ${action.tooltip}`);
  item.dataset.directiveMessageAction = action.id;
  item.dataset.directiveRuntimeAction = action.runtimeActionId;
  if (action.icon) {
    const icon = document.createElement('i');
    icon.className = action.icon;
    icon.setAttribute('aria-hidden', 'true');
    item.appendChild(icon);
  }
  const text = document.createElement('span');
  text.textContent = action.label;
  item.appendChild(text);
  item.addEventListener('click', async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    item.disabled = true;
    try {
      const result = await runAction(action.runtimeActionId, messagePayloadFromElement(messageElement));
      notifyResult(action, result);
      if (
        action.runtimeActionId === SCENE_RECONCILIATION_ACTION_IDS.openPending
        || action.runtimeActionId === SCENE_RECONCILIATION_ACTION_IDS.recalculateFromHere
      ) {
        await runRuntimeActionSafely('runtime.setTab', { tabId: 'mission' });
        await runRuntimeActionSafely('runtime.open');
      } else {
        await runRuntimeActionSafely('runtime.refresh');
      }
    } catch (error) {
      console.warn('[Directive] Message action failed:', error);
      globalThis.toastr?.error?.(error?.message || String(error));
    } finally {
      item.disabled = false;
      closeMenus();
    }
  });
  return item;
}

function createMenu({ messageElement, runAction }) {
  const menu = document.createElement('div');
  menu.className = DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS;
  menu.hidden = true;
  menu.dataset.directiveMessageActionsMenu = 'true';
  for (const action of SCENE_RECONCILIATION_MESSAGE_ACTIONS) {
    menu.appendChild(createMenuItem({ action, messageElement, runAction }));
  }
  return menu;
}

function processMessage(messageElement, { runAction }) {
  if (!messageElement?.querySelector || !messageIdFromElement(messageElement)) return false;
  if (messageElement.querySelector(`.${DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS}`)) return true;
  const extraButtons = getOrCreateExtraButtons(messageElement);
  if (!extraButtons) return false;
  const button = document.createElement('div');
  button.className = `mes_button interactable fa-solid fa-compass ${DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS}`;
  button.title = 'Directive message actions';
  button.setAttribute('role', 'button');
  button.setAttribute('aria-label', 'Directive message actions');
  button.tabIndex = 0;
  button.dataset.directiveMessageActions = 'true';
  const menu = createMenu({ messageElement, runAction });
  const toggleMenu = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const nextHidden = !menu.hidden;
    closeMenus(menu);
    menu.hidden = nextHidden;
  };
  button.addEventListener('click', toggleMenu);
  button.addEventListener('keydown', (event) => {
    if (event?.key === 'Enter' || event?.key === ' ') toggleMenu(event);
  });
  button.appendChild(menu);
  extraButtons.appendChild(button);
  return true;
}

function processExistingMessages(options) {
  if (!canUseDocument()) return 0;
  const messages = document.querySelectorAll?.(MESSAGE_SELECTOR) || [];
  let count = 0;
  for (const messageElement of messages) {
    if (processMessage(messageElement, options)) count += 1;
  }
  return count;
}

function scheduleRescan(options) {
  if (!installed) return;
  if (pendingRescan) return;
  pendingRescan = true;
  const run = () => {
    pendingRescan = false;
    if (!installed) return;
    processExistingMessages(options);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
}

function installObserver(options) {
  if (observer || typeof MutationObserver !== 'function') return false;
  const chat = document.querySelector?.('#chat');
  if (!chat) return false;
  observer = new MutationObserver(() => scheduleRescan(options));
  observer.observe(chat, { childList: true, subtree: true });
  return true;
}

function registerHostEvents(context, options) {
  const eventSource = context?.eventSource || context?.eventBus || null;
  if (!eventSource || typeof eventSource.on !== 'function') return 0;
  const eventTypes = context?.eventTypes || context?.event_types || {};
  let count = 0;
  for (const key of RESCAN_EVENT_KEYS) {
    const eventName = eventTypes[key] || key;
    if (!eventName) continue;
    eventSource.on(eventName, () => scheduleRescan(options));
    count += 1;
  }
  return count;
}

export function installDirectiveMessageActions({
  context = null,
  runAction = (actionId, payload) => runRuntimeAction(actionId, payload)
} = {}) {
  if (!canUseDocument()) return false;
  const options = { runAction };
  processExistingMessages(options);
  installObserver(options);
  if (!installed) {
    document.addEventListener?.('click', () => closeMenus());
  }
  if (!installed && context) {
    eventRegistrationCount = registerHostEvents(context, options);
  }
  installed = true;
  return true;
}

export function disposeDirectiveMessageActions() {
  observer?.disconnect?.();
  observer = null;
  if (canUseDocument()) {
    const controls = document.querySelectorAll?.(
      `.${DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS}, .${DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS}`
    ) || [];
    for (const control of controls) control.remove?.();
  }
  installed = false;
  eventRegistrationCount = 0;
}

export const __directiveMessageActionsTestHooks = Object.freeze({
  processExistingMessages,
  processMessage,
  messagePayloadFromElement,
  messageIdFromElement,
  messageTextFromElement,
  getEventRegistrationCount() {
    return eventRegistrationCount;
  },
  reset() {
    disposeDirectiveMessageActions();
    pendingRescan = false;
  }
});
