export const DIRECTIVE_PRIMARY_ROUTES = Object.freeze([
  {
    id: 'campaign',
    label: 'Campaign',
    shortLabel: 'Campaign',
    shelfLabel: 'Library & Records',
    iconSlot: 'route.campaign',
    icon: 'fa-solid fa-rocket',
    description: 'Create, save, and load Directive campaigns.'
  },
  {
    id: 'mission',
    label: 'Mission',
    shortLabel: 'Mission',
    shelfLabel: 'Command & Context',
    iconSlot: 'route.mission',
    icon: 'fa-solid fa-compass',
    description: 'Run the current mission turn and review pending outcomes.'
  },
  {
    id: 'crew',
    label: 'Crew',
    shortLabel: 'Crew',
    shelfLabel: 'Roster & Roles',
    iconSlot: 'route.crew',
    icon: 'fa-solid fa-user-group',
    description: 'Review senior staff context and public crew state.'
  },
  {
    id: 'ship',
    label: 'Ship',
    shortLabel: 'Ship',
    shelfLabel: 'Status & Systems',
    iconSlot: 'route.ship',
    icon: 'fa-solid fa-shuttle-space',
    description: 'Review ship condition, pressure, and public technical state.'
  },
  {
    id: 'log',
    label: 'Log',
    shortLabel: 'Log',
    shelfLabel: 'Index & Recall',
    iconSlot: 'route.log',
    icon: 'fa-solid fa-list-check',
    description: 'Review committed player-facing command history.'
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    shelfLabel: 'Safety & Controls',
    iconSlot: 'route.settings',
    icon: 'fa-solid fa-sliders',
    description: 'Inspect runtime settings, diagnostics, and host status.'
  }
]);

export function normalizeDirectiveRouteId(routeId, fallback = 'campaign') {
  const value = String(routeId || '').trim();
  return DIRECTIVE_PRIMARY_ROUTES.some((route) => route.id === value) ? value : fallback;
}

export function getDirectiveRoute(routeId) {
  const normalized = normalizeDirectiveRouteId(routeId);
  return DIRECTIVE_PRIMARY_ROUTES.find((route) => route.id === normalized) || DIRECTIVE_PRIMARY_ROUTES[0];
}

export function getDirectiveRouteLabel(routeId) {
  return getDirectiveRoute(routeId).label;
}
