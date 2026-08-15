import { DIRECTIVE_BUNDLED_ICON_PACKS, resolveDirectiveIconSlot } from '../theme/directive-icon-packs.mjs';
import { currentChatEmptyMessage } from './current-chat-scope-copy.js';
import { createElement, createIconFromDescriptor } from './runtime-ui-kit.js';

export const CAMPAIGN_GUIDANCE_INSTRUCTION_ID = 'directive-campaign-guidance-instruction';
export const CAMPAIGN_GUIDANCE_INSTRUCTION = 'Open Campaign below, then choose or load a save to bring this panel online.';

export function appendCurrentChatEmptyState(container, view) {
  container.dataset.campaignRequired = 'true';

  const surface = createElement('section', 'directive-campaign-required');
  const icon = createIconFromDescriptor(
    resolveDirectiveIconSlot(DIRECTIVE_BUNDLED_ICON_PACKS[0], 'route.ship'),
    {
      slot: 'route.ship',
      fallbackClass: 'fa-solid fa-shuttle-space',
      className: 'directive-campaign-required-icon',
    },
  );
  icon.setAttribute('aria-hidden', 'true');

  const copy = createElement('div', 'directive-campaign-required-copy');
  const eyebrow = createElement('span', 'directive-campaign-required-eyebrow');
  eyebrow.textContent = 'CAMPAIGN CONNECTION REQUIRED';
  const instruction = createElement('p', 'directive-campaign-required-instruction');
  instruction.id = CAMPAIGN_GUIDANCE_INSTRUCTION_ID;
  instruction.textContent = CAMPAIGN_GUIDANCE_INSTRUCTION;
  const detail = createElement('p', 'directive-campaign-required-detail');
  detail.textContent = currentChatEmptyMessage(view);

  copy.append(eyebrow, instruction, detail);
  surface.append(icon, copy);
  container.appendChild(surface);
  return surface;
}

export function syncCampaignRequiredGuidance(panel, body) {
  const required = body?.dataset?.campaignRequired === 'true';
  const campaign = panel?.querySelector?.('[data-route-id="campaign"]');
  panel?.setAttribute?.('data-campaign-guidance', required ? 'true' : 'false');
  campaign?.classList?.toggle?.('is-campaign-guidance-target', required);
  if (required) campaign?.setAttribute?.('aria-describedby', CAMPAIGN_GUIDANCE_INSTRUCTION_ID);
  else campaign?.removeAttribute?.('aria-describedby');
  return required;
}
