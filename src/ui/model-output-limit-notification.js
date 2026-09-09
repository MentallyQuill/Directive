import { acquireDirectiveNotificationSurface, releaseDirectiveNotificationSurface } from './directive-notification-surface.js';
import { createElement } from './runtime-ui-kit.js';

const OWNER = 'model-output-limit';
let activeCard = null;
let hasPendingOverride = false;
let pendingContext = {};

export function modelOutputLimitMessage({ analysisCapacity = 1, hasOutputOverride = false } = pendingContext) {
  const prefix = 'A model response reached its output limit. ';
  if (hasOutputOverride) return prefix + 'Increase or clear the exact output-token override in Settings under Advanced, then retry. Analysis Capacity does not change that override.';
  if (Number(analysisCapacity) >= 5) return prefix + 'Analysis Capacity is already at 5\u00d7. Check output-token overrides in Advanced or try another model.';
  return prefix + 'Try increasing Analysis Capacity in Settings, then retry.';
}

export function resetModelOutputLimitNotification() {
  activeCard?.remove?.();
  activeCard = null;
  hasPendingOverride = false;
  pendingContext = {};
  releaseDirectiveNotificationSurface(OWNER);
}

export function handleModelOutputLimitUiMessage(message = {}, { onOpenSettings } = {}) {
  if (message?.type !== 'directive.modelOutputLimit.v1') return { handled: false };
  const { systemSlot } = acquireDirectiveNotificationSurface(OWNER);
  // Keep one persistent card across retries and concurrent analysis roles.
  activeCard?.remove?.();
  const card = createElement('article', 'directive-notification-card directive-preset-update-notification directive-model-output-limit-notification is-system');
  card.setAttribute('role', 'status');
  const content = createElement('div', 'directive-preset-update-notification-content');
  const title = createElement('strong', 'directive-gameplay-notification-title');
  title.textContent = 'Model response limit';
  const summary = createElement('span', 'directive-gameplay-notification-summary');
  hasPendingOverride ||= message.payload?.hasOutputOverride === true;
  pendingContext = { ...message.payload, hasOutputOverride: hasPendingOverride };
  summary.textContent = modelOutputLimitMessage(pendingContext);
  content.append(title, summary);
  const actions = createElement('div', 'directive-preset-update-notification-actions');
  for (const [action, label] of [['open', 'Open Settings'], ['dismiss', 'Dismiss']]) {
    const button = createElement('button', 'directive-preset-update-action');
    button.type = 'button';
    button.dataset.modelOutputLimitAction = action;
    button.textContent = label;
    button.addEventListener('click', async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (button.disabled) return;
      button.disabled = true;
      if (action === 'dismiss') { resetModelOutputLimitNotification(); return; }
      try {
        await onOpenSettings?.();
        resetModelOutputLimitNotification();
      } catch (error) {
        button.disabled = false;
        console.warn('[Directive] Could not open Analysis Capacity settings:', error);
      }
    });
    actions.appendChild(button);
  }
  card.append(content, actions);
  systemSlot.appendChild(card);
  activeCard = card;
  return { handled: true, shown: true };
}
