import { getSillyTavernDirectiveRuntimeBridge } from './runtime-bridge.mjs';

const SEND_BUTTON_SELECTOR = '#send_but';
const SEND_TEXTAREA_SELECTOR = '#send_textarea';
const FILE_INPUT_SELECTOR = '#file_form_input';
const CONTINUE_MESSAGE = 'Continue.';

let installedRoot = null;
let installedHandler = null;

function createInputEvent(root) {
  const EventConstructor = root?.defaultView?.Event || globalThis.Event;
  return typeof EventConstructor === 'function'
    ? new EventConstructor('input', { bubbles: true })
    : null;
}

export function normalizeBlankSendContinue(event, {
  root = installedRoot || globalThis.document,
  bridge = getSillyTavernDirectiveRuntimeBridge()
} = {}) {
  try {
    if (!event?.target?.closest?.(SEND_BUTTON_SELECTOR)) return false;
    if (bridge?.enabled === false || bridge?.runtimeApp?.isCurrentChatBound?.() !== true) return false;

    const textarea = root?.querySelector?.(SEND_TEXTAREA_SELECTOR);
    if (!textarea || String(textarea.value ?? '').trim()) return false;

    const fileInput = root?.querySelector?.(FILE_INPUT_SELECTOR);
    if (!fileInput?.files || typeof fileInput.files.length !== 'number') return false;
    if (fileInput.files.length > 0) return false;
    if (typeof textarea.dispatchEvent !== 'function') return false;

    const inputEvent = createInputEvent(root);
    if (!inputEvent) return false;

    const previousValue = textarea.value;
    textarea.value = CONTINUE_MESSAGE;
    try {
      textarea.dispatchEvent(inputEvent);
    } catch {
      textarea.value = previousValue;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function installBlankSendContinue({ root = globalThis.document } = {}) {
  if (!root?.addEventListener) return false;
  if (installedRoot === root && installedHandler) return true;
  disposeBlankSendContinue();
  installedRoot = root;
  installedHandler = (event) => normalizeBlankSendContinue(event, { root });
  root.addEventListener('click', installedHandler, true);
  return true;
}

export function disposeBlankSendContinue() {
  if (!installedRoot || !installedHandler) return false;
  installedRoot.removeEventListener?.('click', installedHandler, true);
  installedRoot = null;
  installedHandler = null;
  return true;
}

export const __blankSendContinueTestHooks = Object.freeze({
  normalizeBlankSendContinue
});
