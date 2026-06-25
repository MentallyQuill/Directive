import { runRuntimeAction } from '../../runtime/runtime-actions.js';
import { OUTCOME_INTEGRITY_EDIT_ACTION_ID } from '../../runtime/outcome-integrity.mjs';
import {
  SCENE_RECONCILIATION_ACTION_IDS,
  SCENE_RECONCILIATION_MESSAGE_ACTIONS
} from '../../runtime/scene-reconciliation.mjs';

export const DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS = 'directive-message-actions-button';
export const DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS = 'directive-message-actions-menu';
export const DIRECTIVE_RECONCILIATION_SELECTION_MENU_CLASS = 'directive-reconciliation-selection-menu';
export const CAMPAIGN_INTRO_REWRITE_ACTION_ID = 'campaignIntro.rewrite';

const DIRECTIVE_MESSAGE_ACTIONS_ICON_GLYPH = 'route-ship';
const DIRECTIVE_RECONCILIATION_STATUS_CLASS = 'directive-reconciliation-status-icon';
const DIRECTIVE_RECONCILIATION_STATUS_GLYPH_CLASS = 'directive-reconciliation-status-glyph';
const DIRECTIVE_RECONCILIATION_SELECTION_ITEM_CLASS = 'directive-reconciliation-selection-menu-item';
const RECONCILIATION_MARKER_STATES = new Set(['start', 'end', 'range', 'single']);
const RECONCILIATION_SELECTION_ACTIONS = Object.freeze({
  clear: Object.freeze({
    id: 'clear',
    runtimeActionId: SCENE_RECONCILIATION_ACTION_IDS.clearMarkers,
    label: 'Clear Reconciliation Set',
    tooltip: 'Remove the active start and end reconciliation markers.'
  }),
  keepEarlier: Object.freeze({
    id: 'keepEarlier',
    runtimeActionId: SCENE_RECONCILIATION_ACTION_IDS.setEnd,
    label: 'Keep Earlier Messages',
    tooltip: 'Move the reconciliation end marker to the message before this one.'
  }),
  keepLater: Object.freeze({
    id: 'keepLater',
    runtimeActionId: SCENE_RECONCILIATION_ACTION_IDS.setStart,
    label: 'Keep Later Messages',
    tooltip: 'Move the reconciliation start marker to the message after this one.'
  })
});

export const CAMPAIGN_INTRO_MESSAGE_ACTION = Object.freeze({
  id: 'rewriteCampaignIntro',
  runtimeActionId: CAMPAIGN_INTRO_REWRITE_ACTION_ID,
  label: 'Rewrite Intro',
  tooltip: 'Regenerate the campaign intro as a selected SillyTavern swipe before play begins.',
  icon: 'fa-solid fa-rotate-right'
});

export const OUTCOME_INTEGRITY_MESSAGE_ACTION = Object.freeze({
  id: 'editProse',
  runtimeActionId: OUTCOME_INTEGRITY_EDIT_ACTION_ID,
  label: 'Edit Prose',
  tooltip: 'Edit wording and dialogue while preserving committed outcomes, costs, relationships, and Command Bearing.',
  icon: 'fa-solid fa-pen-to-square'
});

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
let sceneReconciliationState = null;
let reconciliationSelectionMenu = null;
let activeRunAction = null;

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

function sceneReconciliationFromResult(result) {
  return result?.result?.sceneReconciliation
    || result?.sceneReconciliation
    || result?.result?.view?.chatNative?.sceneReconciliation
    || result?.view?.chatNative?.sceneReconciliation
    || null;
}

function setSceneReconciliationState(next) {
  sceneReconciliationState = next && typeof next === 'object' ? next : null;
  updateReconciliationStatusMarkers();
}

function getOrCreateExtraButtons(messageElement) {
  const existing = messageElement.querySelector?.('.extraMesButtons');
  if (existing) {
    const targets = new Set(String(existing.dataset.directiveTour || '').split(/\s+/).filter(Boolean));
    targets.add('host.message-actions');
    existing.dataset.directiveTour = [...targets].join(' ');
    return existing;
  }
  const mesButtons = messageElement.querySelector?.('.mes_buttons')
    || messageElement.querySelector?.('.mes_block')
    || messageElement;
  const extra = document.createElement('div');
  extra.className = 'extraMesButtons';
  extra.dataset.directiveTour = 'host.message-actions';
  mesButtons.appendChild?.(extra);
  return extra;
}

function closeMenus(except = null) {
  const menus = document.querySelectorAll?.(`.${DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS}`) || [];
  for (const menu of menus) {
    if (menu !== except) menu.hidden = true;
  }
  const buttons = document.querySelectorAll?.(`.${DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS}`) || [];
  for (const button of buttons) {
    if (button.dataset?.directiveMessageActionsMenuId !== except?.id) {
      button.setAttribute?.('aria-expanded', 'false');
    }
  }
}

function closeReconciliationSelectionMenu(except = null) {
  if (reconciliationSelectionMenu && reconciliationSelectionMenu !== except) {
    reconciliationSelectionMenu.hidden = true;
  }
  const icons = document.querySelectorAll?.(`.${DIRECTIVE_RECONCILIATION_STATUS_CLASS}`) || [];
  for (const icon of icons) {
    if (icon.dataset?.directiveReconciliationSelectionMenuId !== except?.id) {
      icon.setAttribute?.('aria-expanded', 'false');
    }
  }
}

function isElementConnected(element) {
  if (!element) return false;
  if (typeof element.isConnected === 'boolean') return element.isConnected;
  let cursor = element;
  while (cursor) {
    if (cursor === document.body) return true;
    cursor = cursor.parentNode;
  }
  return false;
}

function cleanupDetachedMenus() {
  const menus = document.querySelectorAll?.(`.${DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS}`) || [];
  for (const menu of menus) {
    if (menu.__directiveMessageElement && !isElementConnected(menu.__directiveMessageElement)) {
      menu.remove?.();
    }
  }
  if (
    reconciliationSelectionMenu?.__directiveMessageElement
    && !isElementConnected(reconciliationSelectionMenu.__directiveMessageElement)
  ) {
    reconciliationSelectionMenu.remove?.();
    reconciliationSelectionMenu = null;
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

async function runConfiguredAction(actionId, payload = {}) {
  const runner = typeof activeRunAction === 'function' ? activeRunAction : runRuntimeAction;
  return runner(actionId, payload);
}

function clearElement(element) {
  while (element?.children?.length) {
    element.children[0].remove?.();
  }
}

function createMenuItem({ action, messageElement, runAction }) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'menu_button interactable directive-message-actions-menu-item';
  item.title = action.tooltip;
  item.setAttribute('aria-label', `${action.label}: ${action.tooltip}`);
  item.dataset.directiveMessageAction = action.id;
  item.dataset.directiveTour = `message.action.${action.id}`;
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
      setSceneReconciliationState(sceneReconciliationFromResult(result) || sceneReconciliationState);
      notifyResult(action, result);
      if (
        action.runtimeActionId === SCENE_RECONCILIATION_ACTION_IDS.openPending
        || action.runtimeActionId === SCENE_RECONCILIATION_ACTION_IDS.recalculateFromHere
      ) {
        setSceneReconciliationState(sceneReconciliationFromResult(await runRuntimeActionSafely('runtime.setTab', { tabId: 'mission' })) || sceneReconciliationState);
        setSceneReconciliationState(sceneReconciliationFromResult(await runRuntimeActionSafely('runtime.open')) || sceneReconciliationState);
      } else {
        setSceneReconciliationState(sceneReconciliationFromResult(await runRuntimeActionSafely('runtime.refresh')) || sceneReconciliationState);
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
  menu.dataset.directiveMessageId = messageIdFromElement(messageElement);
  menu.__directiveMessageElement = messageElement;
  menu.addEventListener?.('click', (event) => {
    event?.stopPropagation?.();
  });
  for (const action of [OUTCOME_INTEGRITY_MESSAGE_ACTION, CAMPAIGN_INTRO_MESSAGE_ACTION, ...SCENE_RECONCILIATION_MESSAGE_ACTIONS]) {
    menu.appendChild(createMenuItem({ action, messageElement, runAction }));
  }
  return menu;
}

function createShipIcon() {
  const icon = document.createElement('span');
  icon.className = 'directive-vector-glyph directive-message-actions-icon';
  icon.dataset.glyph = DIRECTIVE_MESSAGE_ACTIONS_ICON_GLYPH;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function createStatusGlyph() {
  const icon = document.createElement('span');
  icon.className = `directive-vector-glyph ${DIRECTIVE_RECONCILIATION_STATUS_GLYPH_CLASS}`;
  icon.dataset.glyph = DIRECTIVE_MESSAGE_ACTIONS_ICON_GLYPH;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function createStatusIcon(messageElement) {
  const status = document.createElement('div');
  status.className = `mes_button interactable ${DIRECTIVE_RECONCILIATION_STATUS_CLASS}`;
  status.setAttribute('role', 'button');
  status.setAttribute('aria-haspopup', 'menu');
  status.setAttribute('aria-expanded', 'false');
  status.tabIndex = 0;
  status.dataset.directiveReconciliationStatus = 'range';
  status.dataset.directiveTour = 'message.marker.status';
  const toggleMenu = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    toggleReconciliationSelectionMenu(status, messageElement);
  };
  status.addEventListener?.('click', toggleMenu);
  status.addEventListener?.('keydown', (event) => {
    if (event?.key === 'Enter' || event?.key === ' ') toggleMenu(event);
  });
  status.appendChild(createStatusGlyph());
  return status;
}

function getOrCreateStatusIcon(messageElement) {
  let status = messageElement.querySelector?.(`.${DIRECTIVE_RECONCILIATION_STATUS_CLASS}`);
  if (status) return status;
  const buttons = messageElement.querySelector?.('.mes_buttons');
  if (!buttons) return null;
  status = createStatusIcon(messageElement);
  const editButton = buttons.querySelector?.('.mes_edit');
  if (editButton?.parentNode === buttons && typeof buttons.insertBefore === 'function') {
    buttons.insertBefore(status, editButton);
  } else {
    buttons.appendChild?.(status);
  }
  return status;
}

function removeStatusIcon(messageElement) {
  const status = messageElement.querySelector?.(`.${DIRECTIVE_RECONCILIATION_STATUS_CLASS}`);
  status?.remove?.();
  delete messageElement.dataset.directiveReconciliationMarker;
}

function anchorMessageId(anchor) {
  return compact(anchor?.hostMessageId || anchor?.messageId || anchor?.id || '');
}

function anchorMatchesMessage(anchor, messageElement) {
  const markerId = anchorMessageId(anchor);
  if (markerId && markerId === messageIdFromElement(messageElement)) return true;
  const markerIndex = numericIndex(anchor?.index);
  return markerIndex !== null && markerIndex === numericIndex(messageIdFromElement(messageElement));
}

function markerTooltip(markerState) {
  if (markerState === 'start') return 'Directive reconciliation start marker. Click to adjust this reconciliation set.';
  if (markerState === 'end') return 'Directive reconciliation end marker. Click to adjust this reconciliation set.';
  if (markerState === 'single') return 'Directive reconciliation start and end marker. Click to clear this reconciliation set.';
  return 'Inside the marked Directive reconciliation passage. Click to adjust this reconciliation set.';
}

function applyMarkerState(messageElement, markerState) {
  if (!RECONCILIATION_MARKER_STATES.has(markerState)) {
    removeStatusIcon(messageElement);
    return;
  }
  const status = getOrCreateStatusIcon(messageElement);
  if (!status) return;
  status.dataset.directiveReconciliationStatus = markerState;
  status.title = markerTooltip(markerState);
  status.setAttribute('aria-label', status.title);
  messageElement.dataset.directiveReconciliationMarker = markerState;
}

function selectedRangeForMessages(messages, markers) {
  const start = markers?.start || null;
  const end = markers?.end || null;
  if (!start && !end) return null;
  let startIndex = start ? messages.findIndex((message) => anchorMatchesMessage(start, message)) : -1;
  let endIndex = end ? messages.findIndex((message) => anchorMatchesMessage(end, message)) : -1;
  if (start && startIndex < 0 && !end) return null;
  if (end && endIndex < 0 && !start) return null;
  if (!end && startIndex >= 0) return { startIndex, endIndex: startIndex, singlePoint: false, startOnly: true };
  if (!start && endIndex >= 0) return { startIndex: endIndex, endIndex, singlePoint: false, endOnly: true };
  if (startIndex < 0 || endIndex < 0) return null;
  const startMarkerIndex = startIndex;
  const endMarkerIndex = endIndex;
  if (endIndex < startIndex) [startIndex, endIndex] = [endIndex, startIndex];
  return { startIndex, endIndex, startMarkerIndex, endMarkerIndex, singlePoint: startIndex === endIndex, startOnly: false, endOnly: false };
}

function reconciliationSelectionContext(messageElement) {
  const messages = [...(document.querySelectorAll?.(MESSAGE_SELECTOR) || [])];
  const range = selectedRangeForMessages(messages, sceneReconciliationState?.markers || {});
  const index = messages.indexOf(messageElement);
  if (!range || index < range.startIndex || index > range.endIndex) return null;
  return {
    messages,
    range,
    index,
    hasBothMarkers: Boolean(sceneReconciliationState?.markers?.start && sceneReconciliationState?.markers?.end),
    previousInRange: index > range.startIndex ? messages[index - 1] : null,
    nextInRange: index < range.endIndex ? messages[index + 1] : null
  };
}

function actionIdForRangeBoundary(range, boundary) {
  if (boundary === 'end') {
    return range.endMarkerIndex === range.endIndex
      ? SCENE_RECONCILIATION_ACTION_IDS.setEnd
      : SCENE_RECONCILIATION_ACTION_IDS.setStart;
  }
  return range.startMarkerIndex === range.startIndex
    ? SCENE_RECONCILIATION_ACTION_IDS.setStart
    : SCENE_RECONCILIATION_ACTION_IDS.setEnd;
}

function ensureReconciliationSelectionMenu() {
  if (reconciliationSelectionMenu && isElementConnected(reconciliationSelectionMenu)) {
    return reconciliationSelectionMenu;
  }
  reconciliationSelectionMenu?.remove?.();
  reconciliationSelectionMenu = document.createElement('div');
  reconciliationSelectionMenu.id = 'directive-reconciliation-selection-menu';
  reconciliationSelectionMenu.className = DIRECTIVE_RECONCILIATION_SELECTION_MENU_CLASS;
  reconciliationSelectionMenu.hidden = true;
  reconciliationSelectionMenu.dataset.directiveReconciliationSelectionMenu = 'true';
  reconciliationSelectionMenu.addEventListener?.('click', (event) => {
    event?.stopPropagation?.();
  });
  attachFloatingMenu(reconciliationSelectionMenu, document.body);
  return reconciliationSelectionMenu;
}

function createSelectionMenuItem({ action, messageElement, targetMessageElement = null }) {
  const item = document.createElement('button');
  const runtimeActionId = action.runtimeActionId;
  item.type = 'button';
  item.className = `menu_button interactable ${DIRECTIVE_RECONCILIATION_SELECTION_ITEM_CLASS}`;
  item.title = action.tooltip;
  item.setAttribute('aria-label', `${action.label}: ${action.tooltip}`);
  item.dataset.directiveReconciliationAction = action.id;
  item.dataset.directiveTour = `message.marker.${action.id}`;
  item.dataset.directiveRuntimeAction = runtimeActionId;
  const text = document.createElement('span');
  text.textContent = action.label;
  item.appendChild(text);
  item.addEventListener?.('click', async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    item.disabled = true;
    try {
      const payloadSource = targetMessageElement || messageElement;
      const result = await runConfiguredAction(runtimeActionId, messagePayloadFromElement(payloadSource));
      setSceneReconciliationState(sceneReconciliationFromResult(result) || sceneReconciliationState);
      notifyResult(action, result);
      setSceneReconciliationState(sceneReconciliationFromResult(await runRuntimeActionSafely('runtime.refresh')) || sceneReconciliationState);
    } catch (error) {
      console.warn('[Directive] Reconciliation marker action failed:', error);
      globalThis.toastr?.error?.(error?.message || String(error));
    } finally {
      item.disabled = false;
      closeReconciliationSelectionMenu();
    }
  });
  return item;
}

function renderReconciliationSelectionMenu(menu, messageElement) {
  const context = reconciliationSelectionContext(messageElement);
  if (!context) return false;
  clearElement(menu);
  menu.__directiveMessageElement = messageElement;
  menu.dataset.directiveMessageId = messageIdFromElement(messageElement);
  menu.appendChild(createSelectionMenuItem({
    action: RECONCILIATION_SELECTION_ACTIONS.clear,
    messageElement
  }));
  if (context.hasBothMarkers && !context.range.singlePoint && context.previousInRange) {
    menu.appendChild(createSelectionMenuItem({
      action: {
        ...RECONCILIATION_SELECTION_ACTIONS.keepEarlier,
        runtimeActionId: actionIdForRangeBoundary(context.range, 'end')
      },
      messageElement,
      targetMessageElement: context.previousInRange
    }));
  }
  if (context.hasBothMarkers && !context.range.singlePoint && context.nextInRange) {
    menu.appendChild(createSelectionMenuItem({
      action: {
        ...RECONCILIATION_SELECTION_ACTIONS.keepLater,
        runtimeActionId: actionIdForRangeBoundary(context.range, 'start')
      },
      messageElement,
      targetMessageElement: context.nextInRange
    }));
  }
  return true;
}

function toggleReconciliationSelectionMenu(statusIcon, messageElement) {
  const menu = ensureReconciliationSelectionMenu();
  const wasOpenForThisMessage = !menu.hidden && menu.__directiveMessageElement === messageElement;
  closeMenus();
  closeReconciliationSelectionMenu();
  if (wasOpenForThisMessage) return;
  if (!renderReconciliationSelectionMenu(menu, messageElement)) return;
  menu.hidden = false;
  statusIcon.dataset.directiveReconciliationSelectionMenuId = menu.id;
  statusIcon.setAttribute?.('aria-controls', menu.id);
  statusIcon.setAttribute?.('aria-expanded', 'true');
  positionMenu(menu, statusIcon);
}

function updateReconciliationStatusMarkers() {
  if (!canUseDocument()) return;
  const messages = [...(document.querySelectorAll?.(MESSAGE_SELECTOR) || [])];
  const range = selectedRangeForMessages(messages, sceneReconciliationState?.markers || {});
  for (let index = 0; index < messages.length; index += 1) {
    const messageElement = messages[index];
    if (!range || index < range.startIndex || index > range.endIndex) {
      removeStatusIcon(messageElement);
      continue;
    }
    if (range.singlePoint) applyMarkerState(messageElement, 'single');
    else if (range.startOnly || index === range.startIndex) applyMarkerState(messageElement, 'start');
    else if (range.endOnly || index === range.endIndex) applyMarkerState(messageElement, 'end');
    else applyMarkerState(messageElement, 'range');
  }
}

function attachFloatingMenu(menu, fallbackParent) {
  const host = document.body || fallbackParent;
  host?.appendChild?.(menu);
}

function positionMenu(menu, anchor) {
  if (!menu?.style || typeof anchor?.getBoundingClientRect !== 'function') return;
  const viewportWidth = Number(globalThis.innerWidth || document.documentElement?.clientWidth || 0);
  const viewportHeight = Number(globalThis.innerHeight || document.documentElement?.clientHeight || 0);
  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = typeof menu.getBoundingClientRect === 'function'
    ? menu.getBoundingClientRect()
    : { width: 300, height: 0 };
  const menuWidth = Math.max(0, menuRect.width || 300);
  const menuHeight = Math.max(0, menuRect.height || 0);
  const gutter = 12;
  const maxLeft = viewportWidth > 0 ? Math.max(gutter, viewportWidth - menuWidth - gutter) : anchorRect.right;
  const preferredLeft = anchorRect.right - menuWidth;
  const left = Math.min(Math.max(gutter, preferredLeft), maxLeft);
  const belowTop = anchorRect.bottom + 4;
  const aboveTop = anchorRect.top - menuHeight - 4;
  const hasRoomBelow = viewportHeight <= 0 || belowTop + menuHeight <= viewportHeight - gutter;
  const top = hasRoomBelow || aboveTop < gutter ? belowTop : aboveTop;
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(Math.max(gutter, top))}px`;
}

function getMenuForButton(button) {
  const menuId = button?.dataset?.directiveMessageActionsMenuId;
  if (menuId) return document.getElementById?.(menuId) || null;
  return button?.querySelector?.(`.${DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS}`) || null;
}

function isCurrentButtonShape(button) {
  if (!button) return false;
  if (/\bfa-compass\b/.test(button.className || '')) return false;
  if (!button.querySelector?.('.directive-message-actions-icon')) return false;
  const menu = getMenuForButton(button);
  return Boolean(menu && menu.parentNode === document.body);
}

function processMessage(messageElement, { runAction }) {
  if (!messageElement?.querySelector || !messageIdFromElement(messageElement)) return false;
  cleanupDetachedMenus();
  const existingButton = messageElement.querySelector(`.${DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS}`);
  if (existingButton) {
    if (isCurrentButtonShape(existingButton)) return true;
    getMenuForButton(existingButton)?.remove?.();
    existingButton.remove?.();
  }
  const extraButtons = getOrCreateExtraButtons(messageElement);
  if (!extraButtons) return false;
  const button = document.createElement('div');
  button.className = `mes_button interactable ${DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS}`;
  button.title = 'Directive message actions';
  button.setAttribute('role', 'button');
  button.setAttribute('aria-label', 'Directive message actions');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.tabIndex = 0;
  button.dataset.directiveMessageActions = 'true';
  button.dataset.directiveTour = 'message.launcher';
  const menu = createMenu({ messageElement, runAction });
  const menuId = `directive-message-actions-menu-${messageIdFromElement(messageElement)}`;
  menu.id = menuId;
  button.dataset.directiveMessageActionsMenuId = menuId;
  button.setAttribute('aria-controls', menuId);
  const toggleMenu = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const nextHidden = !menu.hidden;
    closeReconciliationSelectionMenu();
    closeMenus(menu);
    menu.hidden = nextHidden;
    button.setAttribute('aria-expanded', nextHidden ? 'false' : 'true');
    if (!nextHidden) positionMenu(menu, button);
  };
  button.addEventListener('click', toggleMenu);
  button.addEventListener('keydown', (event) => {
    if (event?.key === 'Enter' || event?.key === ' ') toggleMenu(event);
  });
  button.appendChild(createShipIcon());
  extraButtons.appendChild(button);
  attachFloatingMenu(menu, extraButtons);
  return true;
}

function processExistingMessages(options) {
  if (!canUseDocument()) return 0;
  cleanupDetachedMenus();
  const messages = document.querySelectorAll?.(MESSAGE_SELECTOR) || [];
  let count = 0;
  for (const messageElement of messages) {
    if (processMessage(messageElement, options)) count += 1;
  }
  updateReconciliationStatusMarkers();
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
  activeRunAction = runAction;
  const options = { runAction };
  processExistingMessages(options);
  installObserver(options);
  if (!installed) {
    document.addEventListener?.('click', () => {
      closeMenus();
      closeReconciliationSelectionMenu();
    });
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
      `.${DIRECTIVE_MESSAGE_ACTIONS_BUTTON_CLASS}, .${DIRECTIVE_MESSAGE_ACTIONS_MENU_CLASS}, .${DIRECTIVE_RECONCILIATION_STATUS_CLASS}, .${DIRECTIVE_RECONCILIATION_SELECTION_MENU_CLASS}`
    ) || [];
    for (const control of controls) control.remove?.();
    for (const messageElement of document.querySelectorAll?.(MESSAGE_SELECTOR) || []) {
      delete messageElement.dataset.directiveReconciliationMarker;
    }
  }
  installed = false;
  eventRegistrationCount = 0;
  sceneReconciliationState = null;
  reconciliationSelectionMenu = null;
  activeRunAction = null;
}

export const __directiveMessageActionsTestHooks = Object.freeze({
  processExistingMessages,
  processMessage,
  messagePayloadFromElement,
  messageIdFromElement,
  messageTextFromElement,
  setSceneReconciliationState,
  updateReconciliationStatusMarkers,
  getEventRegistrationCount() {
    return eventRegistrationCount;
  },
  reset() {
    disposeDirectiveMessageActions();
    pendingRescan = false;
  }
});
