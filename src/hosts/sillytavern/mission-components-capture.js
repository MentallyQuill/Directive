import { runRuntimeAction } from '../../runtime/runtime-actions.js';
import { appendDirectiveOverlay } from '../../ui/directive-overlay-root.js';
import { getSillyTavernDirectiveRuntimeBridge } from './runtime-bridge.mjs';

export const DIRECTIVE_MISSION_COMPONENT_CAPTURE_BUTTON_CLASS = 'directive-mission-component-capture-button';
export const DIRECTIVE_MISSION_COMPONENT_POPOVER_CLASS = 'directive-mission-component-popover';
export const DIRECTIVE_MISSION_COMPONENT_SOURCE_HIGHLIGHT_CLASS = 'directive-mission-component-source-highlight';

const MESSAGE_SELECTOR = '#chat .mes[mesid]';
const MESSAGE_TEXT_SELECTOR = '.mes_text';
const DIRECTIVE_CHAT_METADATA_KEY = 'directiveCampaignBinding';
const BUTTON_LABEL = 'Add Component to Mission';

let installed = false;
let captureButton = null;
let reviewPopover = null;
let activeSelection = null;
let hideTimer = null;
let documentListeners = [];
let sourceOpenListener = null;

function canUseDocument() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function currentContext() {
  try {
    return globalThis.SillyTavern?.getContext?.() || null;
  } catch {
    return null;
  }
}

function contextChatId(context = currentContext()) {
  const candidates = [
    context?.chatId,
    context?.chat_id,
    context?.currentChatId,
    typeof context?.getCurrentChatId === 'function' ? context.getCurrentChatId() : null,
    context?.chatMetadata?.chat_id,
    context?.chat_metadata?.chat_id
  ];
  return candidates.map(compact).find(Boolean) || '';
}

function currentDirectiveBinding(context = currentContext()) {
  const metadata = context?.chatMetadata || context?.chat_metadata || {};
  const binding = metadata?.[DIRECTIVE_CHAT_METADATA_KEY];
  if (binding && typeof binding === 'object') return binding;
  const bridge = getSillyTavernDirectiveRuntimeBridge?.() || {};
  const hostBinding = bridge.host?.chat?.getBindingMetadata?.()
    || bridge.host?.chat?.getCurrentBinding?.()
    || null;
  return hostBinding && typeof hostBinding === 'object' ? hostBinding : null;
}

function directiveEnabled() {
  return getSillyTavernDirectiveRuntimeBridge()?.enabled !== false;
}

function hasActiveDirectiveCampaignChat() {
  const binding = currentDirectiveBinding();
  if (!binding) return false;
  const chatId = contextChatId();
  return Boolean(binding.chatId && chatId && String(binding.chatId) === String(chatId));
}

function classSet(element) {
  return new Set(String(element?.className || '').split(/\s+/).filter(Boolean));
}

function closestElement(node, selector) {
  let cursor = node?.nodeType === 1 ? node : node?.parentElement || node?.parentNode;
  while (cursor) {
    if (typeof cursor.closest === 'function') return cursor.closest(selector);
    if (matchesSelector(cursor, selector)) return cursor;
    cursor = cursor.parentElement || cursor.parentNode;
  }
  return null;
}

function matchesSelector(element, selector) {
  if (!element) return false;
  if (selector === MESSAGE_SELECTOR) {
    return classSet(element).has('mes') && Boolean(element.getAttribute?.('mesid'));
  }
  if (selector === MESSAGE_TEXT_SELECTOR) {
    return classSet(element).has('mes_text');
  }
  if (selector.startsWith('.')) return classSet(element).has(selector.slice(1));
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  return false;
}

function messageElementForNode(node) {
  return closestElement(node, MESSAGE_SELECTOR);
}

function messageTextElement(messageElement) {
  return messageElement?.querySelector?.(MESSAGE_TEXT_SELECTOR) || messageElement;
}

function messageIdFromElement(messageElement) {
  return compact(
    messageElement?.getAttribute?.('mesid')
    || messageElement?.dataset?.messageId
    || messageElement?.dataset?.mesid
  );
}

function messageTextFromElement(messageElement) {
  const textElement = messageTextElement(messageElement);
  return String(textElement?.textContent || messageElement?.textContent || '').trim();
}

function messageRoleFromElement(messageElement) {
  if (!messageElement) return '';
  const classes = classSet(messageElement);
  if (classes.has('user_mes') || messageElement.getAttribute?.('is_user') === 'true' || messageElement.dataset?.isUser === 'true') return 'user';
  if (classes.has('system_mes') || messageElement.getAttribute?.('is_system') === 'true' || messageElement.dataset?.isSystem === 'true') return 'system';
  return 'assistant';
}

function selectionOffsetsInTextElement(textElement, selection) {
  if (!textElement || !selection || selection.rangeCount <= 0) return { selectionStart: null, selectionEnd: null };
  if (typeof document.createRange !== 'function') return { selectionStart: null, selectionEnd: null };
  const range = selection.getRangeAt(0);
  if (!textElement.contains?.(range.startContainer) || !textElement.contains?.(range.endContainer)) {
    return { selectionStart: null, selectionEnd: null };
  }
  const before = document.createRange();
  before.selectNodeContents(textElement);
  before.setEnd(range.startContainer, range.startOffset);
  const selected = document.createRange();
  selected.selectNodeContents(textElement);
  selected.setEnd(range.endContainer, range.endOffset);
  return {
    selectionStart: String(before.toString?.() || '').length,
    selectionEnd: String(selected.toString?.() || '').length
  };
}

function selectionObject() {
  return globalThis.getSelection?.() || document.getSelection?.() || null;
}

function rangeRect(selection) {
  if (!selection || selection.rangeCount <= 0) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect?.();
  if (rect && (rect.width || rect.height)) return rect;
  const rects = range.getClientRects?.();
  return rects?.[rects.length - 1] || null;
}

function selectionInsideText(messageElement, selection) {
  const textElement = messageTextElement(messageElement);
  const anchorText = closestElement(selection.anchorNode, MESSAGE_TEXT_SELECTOR);
  const focusText = closestElement(selection.focusNode, MESSAGE_TEXT_SELECTOR);
  if (!anchorText || !focusText) return false;
  return anchorText === textElement && focusText === textElement;
}

function getFloatingSelectionState() {
  if (!canUseDocument() || !directiveEnabled() || !hasActiveDirectiveCampaignChat()) return null;
  const selection = selectionObject();
  const selectedText = String(selection?.toString?.() || '').trim();
  if (!selection || !selectedText || selection.rangeCount <= 0) return null;
  const anchorMessage = messageElementForNode(selection.anchorNode);
  const focusMessage = messageElementForNode(selection.focusNode);
  if (!anchorMessage || !focusMessage || anchorMessage !== focusMessage) {
    return {
      rejected: true,
      reason: 'cross-message-selection',
      summary: 'Select text inside one message to add a Mission Component.'
    };
  }
  if (!selectionInsideText(anchorMessage, selection)) return null;
  if (anchorMessage.dataset?.directiveReconciliationMarker || anchorMessage.querySelector?.('.directive-reconciliation-status-icon')) {
    return {
      rejected: true,
      reason: 'reconciliation-source',
      summary: 'Finish or clear Scene Reconciliation before capturing this message as a Mission Component.'
    };
  }
  const chat = document.querySelector?.('#chat');
  if (chat && !chat.contains?.(anchorMessage)) return null;
  const rect = rangeRect(selection) || anchorMessage.getBoundingClientRect?.();
  if (!rect) return null;
  const hostMessageId = messageIdFromElement(anchorMessage);
  if (!hostMessageId) return null;
  const messageText = messageTextFromElement(anchorMessage);
  const offsets = selectionOffsetsInTextElement(messageTextElement(anchorMessage), selection);
  const role = messageRoleFromElement(anchorMessage);
  return {
    selectedText,
    chatId: contextChatId(),
    host: 'sillytavern',
    hostMessageId,
    messageText,
    selectionStart: offsets.selectionStart,
    selectionEnd: offsets.selectionEnd,
    message: {
      hostMessageId,
      id: hostMessageId,
      index: Number.isInteger(Number(hostMessageId)) ? Number(hostMessageId) : null,
      text: messageText,
      role,
      isUser: role === 'user',
      isSystem: role === 'system'
    },
    rect,
    messageElement: anchorMessage
  };
}

function ensureCaptureButton() {
  if (captureButton && (captureButton.isConnected === true || captureButton.parentNode)) return captureButton;
  captureButton?.remove?.();
  captureButton = document.createElement('button');
  captureButton.type = 'button';
  captureButton.className = DIRECTIVE_MISSION_COMPONENT_CAPTURE_BUTTON_CLASS;
  captureButton.title = BUTTON_LABEL;
  captureButton.setAttribute('aria-label', BUTTON_LABEL);
  captureButton.dataset.directiveTour = 'mission-components.capture';
  const icon = document.createElement('span');
  icon.className = 'directive-vector-glyph directive-mission-component-capture-icon';
  icon.dataset.glyph = 'route-ship';
  icon.setAttribute('aria-hidden', 'true');
  captureButton.appendChild(icon);
  captureButton.addEventListener?.('mousedown', (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
  });
  captureButton.addEventListener?.('click', handleCaptureClick);
  appendDirectiveOverlay(captureButton, { fallbackParent: document.body });
  return captureButton;
}

function viewportSize() {
  return {
    width: Number(globalThis.innerWidth || document.documentElement?.clientWidth || 1024),
    height: Number(globalThis.innerHeight || document.documentElement?.clientHeight || 768)
  };
}

function positionButton(button, rect) {
  const viewport = viewportSize();
  const buttonRect = button.getBoundingClientRect?.() || { width: 38, height: 38 };
  const gutter = 8;
  const left = Math.max(gutter, Math.min(
    rect.right + 6,
    viewport.width - (buttonRect.width || 38) - gutter
  ));
  const top = Math.max(gutter, Math.min(
    rect.bottom + 6,
    viewport.height - (buttonRect.height || 38) - gutter
  ));
  button.style.left = `${Math.round(left)}px`;
  button.style.top = `${Math.round(top)}px`;
}

function hideCaptureButton() {
  activeSelection = null;
  if (captureButton) captureButton.hidden = true;
}

function scheduleSelectionUpdate() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(updateSelectionAffordance, 0);
}

function updateSelectionAffordance() {
  hideTimer = null;
  const state = getFloatingSelectionState();
  if (!state || state.rejected) {
    hideCaptureButton();
    return;
  }
  activeSelection = state;
  const button = ensureCaptureButton();
  button.hidden = false;
  positionButton(button, state.rect);
}

function ensurePopover() {
  if (reviewPopover && (reviewPopover.isConnected === true || reviewPopover.parentNode)) return reviewPopover;
  reviewPopover?.remove?.();
  reviewPopover = document.createElement('aside');
  reviewPopover.className = DIRECTIVE_MISSION_COMPONENT_POPOVER_CLASS;
  reviewPopover.setAttribute('role', 'dialog');
  reviewPopover.setAttribute('aria-label', 'Review Mission Component');
  reviewPopover.addEventListener?.('mousedown', (event) => {
    event.stopPropagation?.();
  });
  appendDirectiveOverlay(reviewPopover, { fallbackParent: document.body });
  return reviewPopover;
}

function positionPopover(popover, rect) {
  const viewport = viewportSize();
  const popoverRect = popover.getBoundingClientRect?.() || { width: 360, height: 360 };
  const gutter = 12;
  const width = popoverRect.width || 360;
  const height = popoverRect.height || 360;
  const left = Math.max(gutter, Math.min(rect.left, viewport.width - width - gutter));
  const below = rect.bottom + 10;
  const above = rect.top - height - 10;
  const top = below + height <= viewport.height - gutter || above < gutter
    ? below
    : above;
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(Math.max(gutter, Math.min(top, viewport.height - height - gutter)))}px`;
}

function clearElement(element) {
  if (typeof element.replaceChildren === 'function') {
    element.replaceChildren();
    return;
  }
  while (element?.children?.length) element.children[0].remove?.();
}

function field(label, name, value = '', { multiline = false, options = null } = {}) {
  const wrapper = document.createElement('label');
  wrapper.className = 'directive-mission-component-popover-field';
  const labelText = document.createElement('span');
  labelText.textContent = label;
  let input;
  if (Array.isArray(options)) {
    input = document.createElement('select');
    for (const option of options) {
      const item = document.createElement('option');
      item.value = option.id;
      item.textContent = option.label;
      item.selected = option.id === value;
      input.appendChild(item);
    }
  } else if (multiline) {
    input = document.createElement('textarea');
    input.rows = 4;
    input.value = value || '';
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
  }
  input.dataset.componentField = name;
  wrapper.append(labelText, input);
  return wrapper;
}

function valueOf(popover, name) {
  return popover.querySelector?.(`[data-component-field="${name}"]`)?.value || '';
}

function listValueOf(popover, name) {
  return valueOf(popover, name).split(',').map(compact).filter(Boolean);
}

function requiredPopoverFieldsValid(popover, selection) {
  return Boolean(
    compact(valueOf(popover, 'title'))
    && compact(valueOf(popover, 'type'))
    && compact(valueOf(popover, 'status'))
    && compact(valueOf(popover, 'sourceAuthority'))
    && compact(selection?.selectedText)
  );
}

function renderPopoverPending(popover, selection) {
  clearElement(popover);
  const title = document.createElement('h3');
  title.textContent = 'Add Component to Mission';
  const status = document.createElement('p');
  status.className = 'directive-mission-component-popover-status';
  status.textContent = 'Classifying selected source...';
  const source = document.createElement('blockquote');
  source.textContent = selection.selectedText;
  popover.append(title, status, source);
}

function optionList(values) {
  return values.map((id) => ({ id, label: id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (letter) => letter.toUpperCase()) }));
}

function renderPopoverReview(popover, selection, prepared) {
  clearElement(popover);
  const proposal = prepared?.proposal || {};
  const title = document.createElement('h3');
  title.textContent = 'Add Component to Mission';
  const warnings = Array.isArray(proposal.warnings) ? proposal.warnings.filter(Boolean) : [];
  if (warnings.length) {
    const warning = document.createElement('p');
    warning.className = 'directive-mission-component-popover-warning';
    warning.textContent = warnings[0];
    popover.appendChild(warning);
  }
  popover.append(
    title,
    field('Title', 'title', proposal.title || 'Mission Component'),
    field('Type', 'type', proposal.type || 'note', {
      options: optionList(['note', 'item', 'itemStat', 'shipIssue', 'lead', 'claim', 'memory', 'question', 'quote', 'procedure', 'sourceDocument'])
    }),
    field('Status', 'status', proposal.status || 'active', {
      options: optionList(['active', 'unresolved', 'confirmed', 'disputed', 'superseded', 'archived'])
    }),
    field('Source Authority', 'sourceAuthority', proposal.sourceAuthority || 'unknown', {
      options: optionList(['officialPacket', 'personalAssessment', 'dialogue', 'playerObservation', 'narration', 'systemStatus', 'unknown'])
    }),
    field('Summary', 'summary', proposal.summary || selection.selectedText, { multiline: true }),
    field('Tags', 'tags', (proposal.tags || []).join(', ')),
    field('Linked Crew', 'crewIds', (proposal.links?.crewIds || []).join(', ')),
    field('Linked Ship Systems', 'shipSystemIds', (proposal.links?.shipSystemIds || []).join(', ')),
    field('Linked Missions', 'missionIds', (proposal.links?.missionIds || []).join(', '))
  );
  const source = document.createElement('details');
  source.className = 'directive-mission-component-popover-source';
  const sourceSummary = document.createElement('summary');
  sourceSummary.textContent = 'Verbatim Source';
  const sourceText = document.createElement('p');
  sourceText.textContent = selection.selectedText;
  source.append(sourceSummary, sourceText);
  popover.appendChild(source);

  const row = document.createElement('div');
  row.className = 'directive-mission-component-popover-actions';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'directive-button directive-primary-command';
  save.textContent = 'Save Component';
  const syncSaveState = () => {
    save.disabled = !requiredPopoverFieldsValid(popover, selection);
  };
  for (const control of popover.querySelectorAll?.('[data-component-field]') || []) {
    control.addEventListener?.('input', syncSaveState);
    control.addEventListener?.('change', syncSaveState);
  }
  syncSaveState();
  save.addEventListener?.('click', async () => {
    if (!requiredPopoverFieldsValid(popover, selection)) {
      syncSaveState();
      return;
    }
    save.disabled = true;
    try {
      const result = await runRuntimeAction('missionComponents.save', {
        component: {
          title: valueOf(popover, 'title'),
          type: valueOf(popover, 'type'),
          status: valueOf(popover, 'status'),
          sourceAuthority: valueOf(popover, 'sourceAuthority'),
          summary: valueOf(popover, 'summary'),
          tags: valueOf(popover, 'tags').split(',').map(compact).filter(Boolean),
          links: {
            ...(proposal.links || {}),
            crewIds: listValueOf(popover, 'crewIds'),
            shipSystemIds: listValueOf(popover, 'shipSystemIds'),
            missionIds: listValueOf(popover, 'missionIds')
          },
          verbatim: selection.selectedText,
          source: prepared.source || selection,
          derived: {
            warnings
          }
        }
      });
      if (result?.ok === false) {
        renderPopoverError(popover, new Error(result.summary || 'Mission Component could not be saved.'));
        return;
      }
      renderPopoverSaved(popover, result);
      await runRuntimeAction('runtime.refresh');
    } catch (error) {
      renderPopoverError(popover, error);
    } finally {
      save.disabled = false;
    }
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'directive-button directive-secondary-command';
  cancel.textContent = 'Cancel';
  cancel.addEventListener?.('click', () => closePopover());
  row.append(save, cancel);
  popover.appendChild(row);
}

function renderPopoverSaved(popover, result) {
  clearElement(popover);
  const title = document.createElement('h3');
  title.textContent = result?.ok === false ? 'Component Not Saved' : 'Component Saved';
  const summary = document.createElement('p');
  summary.textContent = result?.summary || result?.component?.title || 'Mission Component saved.';
  const row = document.createElement('div');
  row.className = 'directive-mission-component-popover-actions';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'directive-button directive-secondary-command';
  open.textContent = 'Open Components';
  open.addEventListener?.('click', async () => {
    const detail = { targetId: 'directive-mission-components-section' };
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent('directive:mission-subtab', { detail })
      : { type: 'directive:mission-subtab', detail };
    document.dispatchEvent?.(event);
    await runRuntimeAction('runtime.setTab', { tabId: 'mission' });
    closePopover();
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'directive-button directive-secondary-command';
  close.textContent = 'Close';
  close.addEventListener?.('click', closePopover);
  row.append(open, close);
  popover.append(title, summary, row);
}

function renderPopoverError(popover, error) {
  clearElement(popover);
  const title = document.createElement('h3');
  title.textContent = 'Component Capture Failed';
  const summary = document.createElement('p');
  summary.className = 'directive-mission-component-popover-warning';
  summary.textContent = error?.message || String(error || 'Mission Component could not be captured.');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'directive-button directive-secondary-command';
  close.textContent = 'Close';
  close.addEventListener?.('click', closePopover);
  popover.append(title, summary, close);
}

function closePopover() {
  reviewPopover?.remove?.();
  reviewPopover = null;
}

function runtimeSelectionPayload(selection = {}) {
  return {
    selectedText: selection.selectedText,
    chatId: selection.chatId,
    host: selection.host || 'sillytavern',
    hostMessageId: selection.hostMessageId,
    messageText: selection.messageText,
    selectionStart: Number.isInteger(selection.selectionStart) ? selection.selectionStart : null,
    selectionEnd: Number.isInteger(selection.selectionEnd) ? selection.selectionEnd : null,
    message: {
      ...(selection.message || {}),
      hostMessageId: selection.hostMessageId || selection.message?.hostMessageId || selection.message?.id || '',
      text: selection.messageText || selection.message?.text || ''
    }
  };
}

async function handleCaptureClick(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  const selection = activeSelection || getFloatingSelectionState();
  if (!selection || selection.rejected) return;
  hideCaptureButton();
  const popover = ensurePopover();
  popover.hidden = false;
  renderPopoverPending(popover, selection);
  positionPopover(popover, selection.rect);
  try {
    const prepared = await runRuntimeAction('missionComponents.captureSelection', {
      selection: runtimeSelectionPayload(selection)
    });
    if (prepared?.ok === false) {
      renderPopoverError(popover, new Error(prepared.summary || 'Mission Component could not be captured.'));
      return;
    }
    renderPopoverReview(popover, selection, prepared);
    positionPopover(popover, selection.rect);
  } catch (error) {
    renderPopoverError(popover, error);
  }
}

function onDocumentMouseDown(event) {
  if (event.target === captureButton || event.target?.closest?.(`.${DIRECTIVE_MISSION_COMPONENT_POPOVER_CLASS}`)) return;
  hideCaptureButton();
}

function addDocumentListener(target, type, handler, options = undefined) {
  target?.addEventListener?.(type, handler, options);
  documentListeners.push(() => target?.removeEventListener?.(type, handler, options));
}

function sourceElementForSource(source = {}) {
  const id = compact(source.hostMessageId || source.messageId);
  if (!id) return null;
  const escaped = typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(id)
    : id.replace(/"/g, '\\"');
  return document.querySelector?.(`#chat .mes[mesid="${escaped}"]`)
    || [...(document.querySelectorAll?.(MESSAGE_SELECTOR) || [])].find((message) => messageIdFromElement(message) === id)
    || null;
}

function highlightSourceMessage(messageElement) {
  if (!messageElement) return false;
  for (const element of document.querySelectorAll?.(`.${DIRECTIVE_MISSION_COMPONENT_SOURCE_HIGHLIGHT_CLASS}`) || []) {
    element.classList?.remove?.(DIRECTIVE_MISSION_COMPONENT_SOURCE_HIGHLIGHT_CLASS);
  }
  messageElement.classList?.add?.(DIRECTIVE_MISSION_COMPONENT_SOURCE_HIGHLIGHT_CLASS);
  messageElement.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  setTimeout(() => {
    messageElement.classList?.remove?.(DIRECTIVE_MISSION_COMPONENT_SOURCE_HIGHLIGHT_CLASS);
  }, 3200);
  return true;
}

function handleOpenSourceEvent(event) {
  const source = event?.detail?.source || event?.source || null;
  highlightSourceMessage(sourceElementForSource(source));
}

export function installMissionComponentsCapture() {
  if (!canUseDocument()) return false;
  if (installed) return true;
  addDocumentListener(document, 'selectionchange', scheduleSelectionUpdate);
  addDocumentListener(document, 'mouseup', scheduleSelectionUpdate);
  addDocumentListener(document, 'keyup', scheduleSelectionUpdate);
  addDocumentListener(document, 'mousedown', onDocumentMouseDown);
  const chat = document.querySelector?.('#chat');
  addDocumentListener(chat, 'scroll', hideCaptureButton, { passive: true });
  addDocumentListener(globalThis, 'scroll', hideCaptureButton, { passive: true });
  addDocumentListener(globalThis, 'resize', hideCaptureButton, { passive: true });
  sourceOpenListener = handleOpenSourceEvent;
  document.addEventListener?.('directive:mission-component-open-source', sourceOpenListener);
  installed = true;
  scheduleSelectionUpdate();
  return true;
}

export function disposeMissionComponentsCapture() {
  for (const dispose of documentListeners.splice(0)) {
    try {
      dispose();
    } catch {
      // Best-effort listener cleanup.
    }
  }
  if (sourceOpenListener) {
    if (canUseDocument()) document.removeEventListener?.('directive:mission-component-open-source', sourceOpenListener);
    sourceOpenListener = null;
  }
  captureButton?.remove?.();
  reviewPopover?.remove?.();
  captureButton = null;
  reviewPopover = null;
  activeSelection = null;
  installed = false;
}

export const __missionComponentsCaptureTestHooks = Object.freeze({
  getFloatingSelectionState,
  updateSelectionAffordance,
  handleOpenSourceEvent,
  reset() {
    disposeMissionComponentsCapture();
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }
});
