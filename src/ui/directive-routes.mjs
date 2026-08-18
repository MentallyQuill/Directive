export const DIRECTIVE_PRIMARY_ROUTES = Object.freeze([
  {
    id: 'campaign',
    label: 'Campaign',
    shortLabel: 'Campaign',
    shelfLabel: 'Campaigns & Saves',
    iconSlot: 'route.campaign',
    icon: 'fa-solid fa-rocket',
    description: 'Create, save, and load Directive campaigns.'
  },
  {
    id: 'mission',
    label: 'Mission',
    shortLabel: 'Mission',
    shelfLabel: 'Objectives & Outcomes',
    iconSlot: 'route.mission',
    icon: 'fa-solid fa-compass',
    description: 'Review the active mission, objectives, known information, and outcomes.'
  },
  {
    id: 'people',
    label: 'People',
    shortLabel: 'People',
    shelfLabel: 'Roster & Contacts',
    iconSlot: 'route.people',
    icon: 'fa-solid fa-user-group',
    description: 'Review people, standing, assignments, and relationship history.'
  },
  {
    id: 'ship',
    label: 'Ship',
    shortLabel: 'Ship',
    shelfLabel: 'Operational Status',
    iconSlot: 'route.ship',
    icon: 'fa-solid fa-shuttle-space',
    description: 'Review ship capability, condition, restrictions, and technical history.'
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    shelfLabel: 'General',
    iconSlot: 'route.settings',
    icon: 'fa-solid fa-sliders',
    description: 'Change player preferences and provider configuration.'
  }
]);

export function resolveDirectiveRouteId(routeId, { hasActiveCampaign = false, fallback = '' } = {}) {
  const value = String(routeId || '').trim();
  if (DIRECTIVE_PRIMARY_ROUTES.some((route) => route.id === value)) return value;
  return fallback || (hasActiveCampaign ? 'mission' : 'campaign');
}

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
