export const DIRECTIVE_ICON_SLOTS = Object.freeze([
  'route.campaign',
  'route.mission',
  'route.people',
  'route.ship',
  'route.settings'
]);

export const DIRECTIVE_DEFAULT_ICON_PACK_ID = 'directive.icon.vector-glyphs.v1';

export const DIRECTIVE_ICON_FALLBACK = Object.freeze({
  type: 'class',
  value: 'fa-solid fa-circle',
  label: 'Directive item'
});

export const DIRECTIVE_ICON_SLOT_FALLBACKS = Object.freeze({
  'route.campaign': Object.freeze({ type: 'class', value: 'fa-solid fa-rocket', label: 'Campaign' }),
  'route.mission': Object.freeze({ type: 'class', value: 'fa-solid fa-compass', label: 'Mission' }),
  'route.people': Object.freeze({ type: 'class', value: 'fa-solid fa-user-group', label: 'People' }),
  'route.ship': Object.freeze({ type: 'class', value: 'fa-solid fa-shuttle-space', label: 'Ship' }),
  'route.settings': Object.freeze({ type: 'class', value: 'fa-solid fa-sliders', label: 'Settings' })
});

export const DIRECTIVE_VECTOR_GLYPH_SLOTS = Object.freeze({
  'route.campaign': Object.freeze({ type: 'mask', value: 'route-campaign', label: 'Campaign' }),
  'route.mission': Object.freeze({ type: 'mask', value: 'route-mission', label: 'Course Plot' }),
  'route.people': Object.freeze({ type: 'mask', value: 'route-crew', label: 'People' }),
  'route.ship': Object.freeze({ type: 'mask', value: 'route-ship', label: 'Vessel Schematic' }),
  'route.settings': Object.freeze({ type: 'mask', value: 'route-settings', label: 'Systems Matrix' })
});

export const DIRECTIVE_DEFAULT_ICON_PACK_SLOTS = Object.freeze({
  ...DIRECTIVE_ICON_SLOT_FALLBACKS,
  ...DIRECTIVE_VECTOR_GLYPH_SLOTS
});

export const DIRECTIVE_BUNDLED_ICON_PACKS = Object.freeze([
  Object.freeze({
    id: DIRECTIVE_DEFAULT_ICON_PACK_ID,
    kind: 'directive.icon-pack',
    schemaVersion: 1,
    source: 'bundled',
    label: 'Vector Glyphs',
    description: 'LCARS-inspired vector glyphs for Directive routes and shell controls, with class fallbacks for non-glyph slots.',
    slots: DIRECTIVE_DEFAULT_ICON_PACK_SLOTS
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
    glyph: resolved.glyph || (resolved.type === 'mask' ? resolved.value : ''),
    label: resolved.label || fallbackSlot.label || DIRECTIVE_ICON_FALLBACK.label
  });
}
