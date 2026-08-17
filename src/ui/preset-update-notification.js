import {
  acquireDirectiveNotificationSurface,
  releaseDirectiveNotificationSurface,
} from './directive-notification-surface.js';
import { createElement } from './runtime-ui-kit.js';

let activeCard = null;

function removeActiveCard() {
  activeCard?.remove?.();
  activeCard = null;
  releaseDirectiveNotificationSurface('system');
}

function actionButton(action, label, handler) {
  const button = createElement('button', `directive-preset-update-action is-${action}`);
  button.type = 'button';
  button.dataset.notificationAction = action;
  button.textContent = label;
  button.addEventListener('click', async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (button.disabled) return;
    const card = button.closest?.('.directive-preset-update-notification');
    for (const control of card?.querySelectorAll?.('.directive-preset-update-action') || []) control.disabled = true;
    removeActiveCard();
    try {
      await handler?.();
    } catch (error) {
      console.warn('[Directive] Preset update notification action failed:', error);
    }
  });
  return button;
}

export function showPresetUpdateNotification(reminder = {}, handlers = {}) {
  removeActiveCard();
  const { systemSlot } = acquireDirectiveNotificationSurface('system');
  const card = createElement('article', 'directive-notification-card directive-preset-update-notification is-system');
  card.setAttribute('role', 'status');

  const content = createElement('div', 'directive-preset-update-notification-content');
  const category = createElement('span', 'directive-notification-category');
  category.textContent = 'Preset update';
  const titleRow = createElement('span', 'directive-notification-title-row');
  const glyph = createElement('span', 'directive-vector-glyph directive-notification-title-icon');
  glyph.dataset.glyph = 'route-settings';
  glyph.setAttribute('aria-hidden', 'true');
  const title = createElement('strong', 'directive-gameplay-notification-title directive-preset-update-notification-title');
  title.textContent = reminder.title || 'Directive Preset needs attention';
  titleRow.append(glyph, title);
  const message = createElement('span', 'directive-gameplay-notification-summary directive-preset-update-notification-message');
  message.textContent = reminder.message || 'Open Directive Preset settings to install the latest bundled preset.';
  const meta = createElement('span', 'directive-preset-update-notification-meta');
  meta.textContent = `Bundled preset ${reminder.bundledVersion || 'latest'}`;
  content.append(category, titleRow, message, meta);

  const actions = createElement('div', 'directive-preset-update-notification-actions');
  actions.append(
    actionButton('open', 'Open Preset Settings', handlers.onOpen),
    actionButton('later', 'Later', handlers.onLater),
    actionButton('disable', 'Stop Reminders', handlers.onDisable),
  );
  card.append(content, actions);
  systemSlot.appendChild(card);
  activeCard = card;
  return { shown: true };
}

export function resetPresetUpdateNotification(reason = 'reset') {
  removeActiveCard();
  return { reset: true, reason };
}
