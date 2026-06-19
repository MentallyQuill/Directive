export const DIRECTIVE_PRIMARY_ROUTES = Object.freeze([
  {
    id: 'starships',
    label: 'Starships',
    shortLabel: 'Ships',
    icon: 'fa-solid fa-rocket',
    description: 'Create, save, and load Directive campaigns.'
  },
  {
    id: 'mission',
    label: 'Mission',
    shortLabel: 'Mission',
    icon: 'fa-solid fa-compass',
    description: 'Run the current mission turn and review pending outcomes.'
  },
  {
    id: 'crew',
    label: 'Crew',
    shortLabel: 'Crew',
    icon: 'fa-solid fa-user-group',
    description: 'Review senior staff context and public crew state.'
  },
  {
    id: 'ship',
    label: 'Ship',
    shortLabel: 'Ship',
    icon: 'fa-solid fa-shuttle-space',
    description: 'Review ship condition, pressure, and public technical state.'
  },
  {
    id: 'log',
    label: 'Log',
    shortLabel: 'Log',
    icon: 'fa-solid fa-list-check',
    description: 'Review committed player-facing command history.'
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    icon: 'fa-solid fa-sliders',
    description: 'Inspect runtime settings, diagnostics, and host status.'
  }
]);

export function normalizeDirectiveRouteId(routeId, fallback = 'starships') {
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
