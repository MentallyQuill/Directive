import { runRuntimeAction } from '../../runtime/runtime-actions.js';
import { addTooltip } from '../../ui/runtime-ui-kit.js';

export const DIRECTIVE_LAUNCHER_BUTTON_ID = 'directive-launcher-button';

const CHAT_INPUT_SELECTORS = Object.freeze([
  '#send_textarea',
  'textarea#send_textarea',
  'textarea[name="send_textarea"]',
  '#send_textarea textarea',
]);

const QUICK_BUTTON_SELECTORS = Object.freeze([
  '#extensionsMenuButton',
  '#extensionsMenuButtonContainer',
  '#extensionsMenuButtonHolder',
  '#leftSendForm',
]);

function canUseDocument() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function queryFirst(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector?.(selector);
    if (element) return element;
  }
  return null;
}

function insertAfter(reference, node) {
  if (!reference?.parentNode) return false;
  if (typeof reference.after === 'function') reference.after(node);
  else reference.parentNode.insertBefore?.(node, reference.nextSibling || null);
  return true;
}

function placeLauncher(button, chatInput) {
  const quickButton = queryFirst(QUICK_BUTTON_SELECTORS);
  if (quickButton && insertAfter(quickButton, button)) return true;
  if (chatInput?.parentNode?.insertBefore) {
    chatInput.parentNode.insertBefore(button, chatInput);
    return true;
  }
  document.body?.appendChild(button);
  return true;
}

export function installDirectiveLauncherButton({
  openDirective = () => runRuntimeAction('runtime.toggle'),
} = {}) {
  if (!canUseDocument()) return false;
  if (document.getElementById(DIRECTIVE_LAUNCHER_BUTTON_ID)) return true;
  const chatInput = queryFirst(CHAT_INPUT_SELECTORS);
  if (!chatInput) return false;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = DIRECTIVE_LAUNCHER_BUTTON_ID;
  button.className = 'menu_button interactable directive-launcher-button';
  button.dataset.directiveTour = 'runtime.launcher';
  button.setAttribute('aria-label', 'Open Directive');
  addTooltip(button, 'Open Directive');

  const icon = document.createElement('i');
  icon.className = 'directive-vector-glyph directive-launcher-button-icon';
  icon.dataset.glyph = 'route-ship';
  icon.setAttribute('aria-hidden', 'true');
  button.appendChild(icon);

  button.addEventListener('click', async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    await openDirective();
  });
  placeLauncher(button, chatInput);
  return true;
}

export function disposeDirectiveLauncherButton() {
  if (!canUseDocument()) return false;
  document.getElementById(DIRECTIVE_LAUNCHER_BUTTON_ID)?.remove();
  return true;
}
