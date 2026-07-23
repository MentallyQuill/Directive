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
    description: 'Review quests, objectives, urgency, and known information.'
  },
  {
    id: 'people',
    label: 'People',
    shortLabel: 'People',
    shelfLabel: 'Roster & Roles',
    iconSlot: 'route.people',
    icon: 'fa-solid fa-user-group',
    description: 'Review people, standing, assignments, and relationship history.'
  },
  {
    id: 'ship',
    label: 'Ship',
    shortLabel: 'Ship',
    shelfLabel: 'Status & Systems',
    iconSlot: 'route.ship',
    icon: 'fa-solid fa-shuttle-space',
    description: 'Review ship capability, condition, restrictions, and technical history.'
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    shelfLabel: 'Providers & Controls',
    iconSlot: 'route.settings',
    icon: 'fa-solid fa-sliders',
    description: 'Change player preferences and open advanced troubleshooting.'
  }
]);

const REMOVED_ROUTE_IDS = new Set(['log', 'intel', 'inventory', 'map', 'open-threads', 'open-world', 'context', 'components', 'recovery']);

export function resolveDirectiveRouteId(routeId, { hasActiveCampaign = false, fallback = '' } = {}) {
  const value = String(routeId || '').trim();
  if (DIRECTIVE_PRIMARY_ROUTES.some((route) => route.id === value)) return value;
  if (REMOVED_ROUTE_IDS.has(value) || !value) return hasActiveCampaign ? 'mission' : 'campaign';
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
