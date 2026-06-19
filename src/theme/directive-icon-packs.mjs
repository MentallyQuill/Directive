export const DIRECTIVE_ICON_SLOTS = Object.freeze([
  'route.starships',
  'route.mission',
  'route.crew',
  'route.ship',
  'route.log',
  'route.settings',
  'action.back',
  'action.refresh',
  'action.start',
  'action.resume',
  'action.load',
  'action.save',
  'action.preview',
  'action.commit',
  'action.openOrders',
  'status.success',
  'status.warning',
  'status.danger',
  'division.command',
  'division.operations',
  'division.science'
]);

export const DIRECTIVE_DEFAULT_ICON_PACK_ID = 'directive.icon.command-line.default';

export const DIRECTIVE_ICON_FALLBACK = Object.freeze({
  type: 'class',
  value: 'fa-solid fa-circle',
  label: 'Directive item'
});

export const DIRECTIVE_ICON_SLOT_FALLBACKS = Object.freeze({
  'route.starships': Object.freeze({ type: 'class', value: 'fa-solid fa-rocket', label: 'Starships' }),
  'route.mission': Object.freeze({ type: 'class', value: 'fa-solid fa-compass', label: 'Mission' }),
  'route.crew': Object.freeze({ type: 'class', value: 'fa-solid fa-user-group', label: 'Crew' }),
  'route.ship': Object.freeze({ type: 'class', value: 'fa-solid fa-shuttle-space', label: 'Ship' }),
  'route.log': Object.freeze({ type: 'class', value: 'fa-solid fa-list-check', label: 'Log' }),
  'route.settings': Object.freeze({ type: 'class', value: 'fa-solid fa-sliders', label: 'Settings' }),
  'action.back': Object.freeze({ type: 'class', value: 'fa-solid fa-arrow-left', label: 'Back' }),
  'action.refresh': Object.freeze({ type: 'class', value: 'fa-solid fa-rotate', label: 'Refresh' }),
  'action.start': Object.freeze({ type: 'class', value: 'fa-solid fa-play', label: 'Start' }),
  'action.resume': Object.freeze({ type: 'class', value: 'fa-solid fa-pen-to-square', label: 'Resume' }),
  'action.load': Object.freeze({ type: 'class', value: 'fa-solid fa-folder-open', label: 'Load' }),
  'action.save': Object.freeze({ type: 'class', value: 'fa-solid fa-floppy-disk', label: 'Save' }),
  'action.preview': Object.freeze({ type: 'class', value: 'fa-solid fa-eye', label: 'Preview' }),
  'action.commit': Object.freeze({ type: 'class', value: 'fa-solid fa-check', label: 'Commit' }),
  'action.openOrders': Object.freeze({ type: 'class', value: 'fa-solid fa-share-nodes', label: 'Open Orders' }),
  'status.success': Object.freeze({ type: 'class', value: 'fa-solid fa-circle-check', label: 'Success' }),
  'status.warning': Object.freeze({ type: 'class', value: 'fa-solid fa-triangle-exclamation', label: 'Warning' }),
  'status.danger': Object.freeze({ type: 'class', value: 'fa-solid fa-circle-exclamation', label: 'Danger' }),
  'division.command': Object.freeze({ type: 'class', value: 'fa-solid fa-star', label: 'Command division' }),
  'division.operations': Object.freeze({ type: 'class', value: 'fa-solid fa-gears', label: 'Operations division' }),
  'division.science': Object.freeze({ type: 'class', value: 'fa-solid fa-flask', label: 'Science division' })
});

export const DIRECTIVE_BUNDLED_ICON_PACKS = Object.freeze([
  Object.freeze({
    id: DIRECTIVE_DEFAULT_ICON_PACK_ID,
    kind: 'directive.icon-pack',
    schemaVersion: 1,
    source: 'bundled',
    label: 'Command Line',
    description: 'Host-safe semantic icons for Directive routes, actions, status, and divisions.',
    slots: DIRECTIVE_ICON_SLOT_FALLBACKS
  })
]);

export function resolveDirectiveIconSlot(iconPack, slot) {
  const normalizedSlot = String(slot || '').trim();
  const packSlot = iconPack?.slots?.[normalizedSlot];
  const fallbackSlot = DIRECTIVE_ICON_SLOT_FALLBACKS[normalizedSlot] || DIRECTIVE_ICON_FALLBACK;
  const resolved = packSlot && typeof packSlot === 'object' ? packSlot : fallbackSlot;
  return Object.freeze({
    slot: normalizedSlot,
    source: resolved === packSlot ? 'pack' : 'fallback',
    type: resolved.type || fallbackSlot.type || DIRECTIVE_ICON_FALLBACK.type,
    value: resolved.value || fallbackSlot.value || DIRECTIVE_ICON_FALLBACK.value,
    label: resolved.label || fallbackSlot.label || DIRECTIVE_ICON_FALLBACK.label
  });
}
