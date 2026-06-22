export const DIRECTIVE_VECTOR_GLYPHS = Object.freeze({
  'route-campaign': Object.freeze({ file: './icons/route-campaign.svg', label: 'Campaign', category: 'Route' }),
  'route-mission': Object.freeze({ file: './icons/route-mission.svg', label: 'Course Plot', category: 'Route' }),
  'route-crew': Object.freeze({ file: './icons/route-crew.svg', label: 'Bridge Roster', category: 'Route' }),
  'route-ship': Object.freeze({ file: './icons/route-ship.svg', label: 'Vessel Schematic', category: 'Route' }),
  'route-log': Object.freeze({ file: './icons/route-log.svg', label: 'Stardate Record', category: 'Route' }),
  'route-settings': Object.freeze({ file: './icons/route-settings.svg', label: 'Systems Matrix', category: 'Route' }),
  'action-drawer-collapse': Object.freeze({ file: './icons/action-drawer-collapse.svg', label: 'Collapse Drawer', category: 'Shell' }),
  'action-drawer-expand': Object.freeze({ file: './icons/action-drawer-expand.svg', label: 'Expand Drawer', category: 'Shell' }),
  'action-close': Object.freeze({ file: './icons/action-close.svg', label: 'Close', category: 'Shell' }),
  'action-refresh': Object.freeze({ file: './icons/action-refresh.svg', label: 'Refresh Diagnostics', category: 'Shell' }),
  'action-resize': Object.freeze({ file: './icons/action-resize.svg', label: 'Resize Drawer', category: 'Shell' })
});

export function getDirectiveVectorGlyph(id) {
  return DIRECTIVE_VECTOR_GLYPHS[String(id || '').trim()] || null;
}
