export const DIRECTIVE_ICON_SLOTS = Object.freeze([
  'route.campaign',
  'route.mission',
  'route.people',
  'route.crew',
  'route.ship',
  'route.settings',
  'action.back',
  'action.drawerCollapse',
  'action.drawerExpand',
  'action.fullscreen',
  'action.restore',
  'action.densityCompact',
  'action.densityExpanded',
  'action.refresh',
  'action.resize',
  'action.start',
  'action.resume',
  'action.load',
  'action.save',
  'action.preview',
  'action.commit',
  'action.openOrders',
  'action.close',
  'status.success',
  'status.warning',
  'status.danger',
  'division.command',
  'division.operations',
  'division.science'
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
  'route.crew': Object.freeze({ type: 'class', value: 'fa-solid fa-user-group', label: 'Crew' }),
  'route.ship': Object.freeze({ type: 'class', value: 'fa-solid fa-shuttle-space', label: 'Ship' }),
  'route.settings': Object.freeze({ type: 'class', value: 'fa-solid fa-sliders', label: 'Settings' }),
  'action.back': Object.freeze({ type: 'class', value: 'fa-solid fa-arrow-left', label: 'Back' }),
  'action.drawerCollapse': Object.freeze({ type: 'class', value: 'fa-solid fa-chevron-left', label: 'Collapse Drawer' }),
  'action.drawerExpand': Object.freeze({ type: 'class', value: 'fa-solid fa-chevron-right', label: 'Expand Drawer' }),
  'action.fullscreen': Object.freeze({ type: 'class', value: 'fa-regular fa-window-maximize', label: 'Full-Screen Workspace' }),
  'action.restore': Object.freeze({ type: 'class', value: 'fa-regular fa-window-restore', label: 'Restore Drawer' }),
  'action.densityCompact': Object.freeze({ type: 'class', value: 'fa-solid fa-outdent', label: 'Hide Shelf Labels' }),
  'action.densityExpanded': Object.freeze({ type: 'class', value: 'fa-solid fa-indent', label: 'Show Shelf Labels' }),
  'action.refresh': Object.freeze({ type: 'class', value: 'fa-solid fa-rotate', label: 'Refresh' }),
  'action.resize': Object.freeze({ type: 'class', value: 'fa-solid fa-up-right-and-down-left-from-center', label: 'Resize Drawer' }),
  'action.start': Object.freeze({ type: 'class', value: 'fa-solid fa-play', label: 'Start' }),
  'action.resume': Object.freeze({ type: 'class', value: 'fa-solid fa-pen-to-square', label: 'Resume' }),
  'action.load': Object.freeze({ type: 'class', value: 'fa-solid fa-folder-open', label: 'Load' }),
  'action.save': Object.freeze({ type: 'class', value: 'fa-solid fa-floppy-disk', label: 'Save' }),
  'action.preview': Object.freeze({ type: 'class', value: 'fa-solid fa-eye', label: 'Preview' }),
  'action.commit': Object.freeze({ type: 'class', value: 'fa-solid fa-check', label: 'Commit' }),
  'action.openOrders': Object.freeze({ type: 'class', value: 'fa-solid fa-share-nodes', label: 'Open Orders' }),
  'action.close': Object.freeze({ type: 'class', value: 'fa-solid fa-xmark', label: 'Close' }),
  'status.success': Object.freeze({ type: 'class', value: 'fa-solid fa-circle-check', label: 'Success' }),
  'status.warning': Object.freeze({ type: 'class', value: 'fa-solid fa-triangle-exclamation', label: 'Warning' }),
  'status.danger': Object.freeze({ type: 'class', value: 'fa-solid fa-circle-exclamation', label: 'Danger' }),
  'division.command': Object.freeze({ type: 'class', value: 'fa-solid fa-star', label: 'Command division' }),
  'division.operations': Object.freeze({ type: 'class', value: 'fa-solid fa-gears', label: 'Operations division' }),
  'division.science': Object.freeze({ type: 'class', value: 'fa-solid fa-flask', label: 'Science division' })
});

export const DIRECTIVE_VECTOR_GLYPH_SLOTS = Object.freeze({
  'route.campaign': Object.freeze({ type: 'mask', value: 'route-campaign', label: 'Campaign' }),
  'route.mission': Object.freeze({ type: 'mask', value: 'route-mission', label: 'Course Plot' }),
  'route.people': Object.freeze({ type: 'mask', value: 'route-crew', label: 'People' }),
  'route.crew': Object.freeze({ type: 'mask', value: 'route-crew', label: 'Bridge Roster' }),
  'route.ship': Object.freeze({ type: 'mask', value: 'route-ship', label: 'Vessel Schematic' }),
  'route.settings': Object.freeze({ type: 'mask', value: 'route-settings', label: 'Systems Matrix' }),
  'action.drawerCollapse': Object.freeze({ type: 'mask', value: 'action-drawer-collapse', label: 'Collapse Drawer' }),
  'action.drawerExpand': Object.freeze({ type: 'mask', value: 'action-drawer-expand', label: 'Expand Drawer' }),
  'action.close': Object.freeze({ type: 'mask', value: 'action-close', label: 'Close' }),
  'action.refresh': Object.freeze({ type: 'mask', value: 'action-refresh', label: 'Refresh Diagnostics' }),
  'action.resize': Object.freeze({ type: 'mask', value: 'action-resize', label: 'Resize Drawer' })
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
