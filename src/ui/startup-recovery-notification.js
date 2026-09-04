import {
  acquireDirectiveNotificationSurface,
  releaseDirectiveNotificationSurface,
} from './directive-notification-surface.js';
import { createElement } from './runtime-ui-kit.js';

const RECOVERY_ERROR_CODES = new Set([
  'DIRECTIVE_V1_MONOLITHIC_SAVE_UNRECOVERABLE',
  'DIRECTIVE_V1_MONOLITHIC_RECOVERY_CONFLICT',
  'DIRECTIVE_V1_MONOLITHIC_RECOVERY_WRITE_FAILED',
  'DIRECTIVE_V1_MONOLITHIC_RECOVERY_WRITE_VERIFICATION_FAILED',
  'DIRECTIVE_V1_MONOLITHIC_SAVE_MIGRATION_FAILED',
  'DIRECTIVE_V1_MONOLITHIC_RECOVERY_INDEX_WRITE_FAILED',
  'DIRECTIVE_V1_CAMPAIGN_DELETION_TOMBSTONE_INVALID',
  'DIRECTIVE_V1_CAMPAIGN_DELETION_RESUME_TARGET_INVALID',
]);

let activeCard = null;

export function isDirectiveStartupRecoveryError(error) {
  return RECOVERY_ERROR_CODES.has(String(error?.code || ''));
}

export function directiveStartupRecoveryMessage(error) {
  const code = isDirectiveStartupRecoveryError(error)
    ? String(error.code)
    : 'DIRECTIVE_STORAGE_STARTUP_FAILED';
  if (code === 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_INDEX_WRITE_FAILED') {
    return {
      code,
      message: 'Directive upgraded the older V1 save, but could not finish publishing its recovery verification record. Reload SillyTavern to retry safely before continuing.',
    };
  }
  if (code.startsWith('DIRECTIVE_V1_CAMPAIGN_DELETION_')) {
    return {
      code,
      message: 'Directive could not safely verify a pending campaign deletion. The campaign remains unavailable and no further deletion was attempted. Back up the directive-v1 files for this SillyTavern account before changing anything.',
    };
  }
  const originalRestored = error?.details?.originalRestored;
  const message = originalRestored === false
    ? 'Directive could not safely restore an older V1 save after an interrupted upgrade. Stop here and use the backed-up directive-v1 files for this SillyTavern account.'
    : 'Directive found an older V1 save it could not safely upgrade. It was left unchanged. Back up the directive-v1 files for this SillyTavern account before changing anything.';
  return { code, message };
}

export function resetDirectiveStartupRecoveryNotification(reason = 'reset') {
  activeCard?.remove?.();
  activeCard = null;
  releaseDirectiveNotificationSurface('system');
  return { reset: true, reason };
}

export function showDirectiveStartupRecoveryNotification(error) {
  resetDirectiveStartupRecoveryNotification('replace');
  const notice = directiveStartupRecoveryMessage(error);
  const { systemSlot } = acquireDirectiveNotificationSurface('system');
  const card = createElement('article', 'directive-notification-card directive-startup-recovery-notification is-system');
  card.setAttribute('role', 'alert');

  const content = createElement('div', 'directive-preset-update-notification-content');
  const category = createElement('span', 'directive-notification-category');
  category.textContent = 'Storage recovery';
  const titleRow = createElement('span', 'directive-notification-title-row');
  const glyph = createElement('span', 'directive-vector-glyph directive-notification-title-icon');
  glyph.dataset.glyph = 'route-settings';
  glyph.setAttribute('aria-hidden', 'true');
  const title = createElement('strong', 'directive-gameplay-notification-title');
  title.textContent = 'Directive save needs attention';
  titleRow.append(glyph, title);
  const message = createElement('span', 'directive-gameplay-notification-summary');
  message.textContent = notice.message;
  const code = createElement('code', 'directive-startup-recovery-code');
  code.textContent = notice.code;
  content.append(category, titleRow, message, code);

  const actions = createElement('div', 'directive-preset-update-notification-actions');
  const dismiss = createElement('button', 'directive-preset-update-action is-later');
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener('click', () => resetDirectiveStartupRecoveryNotification('dismissed'));
  actions.appendChild(dismiss);
  card.append(content, actions);
  systemSlot.appendChild(card);
  activeCard = card;
  return { shown: true, ...notice };
}
