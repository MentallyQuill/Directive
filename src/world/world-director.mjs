import { evaluatePredicate } from './predicate-evaluator.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function byId(values) { return new Map(asArray(values).filter((item) => item?.id).map((item) => [item.id, item])); }

export function createWorldState(world, { openingStardate = null } = {}) {
  const currentStardate = Number(openingStardate ?? world?.openingStardate ?? 0);
  return {
    schemaVersion: 2,
    regionId: world.id,
    currentLocationId: world.openingLocationId,
    currentStardate,
    elapsedHours: 0,
    visitedLocationIds: [world.openingLocationId],
    locations: asArray(world.locations).map((location) => ({
      id: location.id,
      status: location.initialStatus || 'accessible',
      discovered: location.initiallyDiscovered === true || location.id === world.openingLocationId,
      lastVisitedStardate: location.id === world.openingLocationId ? currentStardate : null,
      conditions: cloneJson(location.initialConditions || []),
      history: []
    })),
    factions: asArray(world.factions).map((faction) => ({
      id: faction.id,
      posture: faction.initialPosture,
      status: faction.initialStatus || 'active',
      resources: cloneJson(faction.resources || []),
      history: []
    })),
    actors: asArray(world.actors).map((actor) => ({
      id: actor.id,
      status: actor.initialStatus || 'available',
      locationId: actor.homeLocationId || null,
      knowledge: cloneJson(actor.knowledge || []),
      posture: actor.initialPosture || 'uncommitted',
      history: []
    })),
    fronts: asArray(world.fronts).map((front) => ({
      id: front.id,
      stage: front.initialStage,
      value: Number(front.initialValue || 0),
      status: 'active',
      lastAdvancedAt: null,
      history: []
    })),
    clocks: asArray(world.clocks).map((clock) => ({
      id: clock.id,
      value: clock.initial,
      min: clock.min,
      max: clock.max,
      visibility: clock.visibility,
      lastReason: 'campaign-start'
    })),
    tracks: asArray(world.stateTracks).map((track) => ({
      id: track.id,
      value: track.initial,
      min: track.min,
      max: track.max,
      visibility: track.visibility,
      lastReason: 'campaign-start'
    })),
    travel: { status: 'idle', routeIds: [], from: null, to: null, departedAt: null, arrivesAt: null },
    rawValuesHidden: true
  };
}

export function routeIndex(world) {
  const index = new Map();
  for (const route of asArray(world?.routes)) {
    index.set(`${route.from}->${route.to}`, route);
    if (route.bidirectional) index.set(`${route.to}->${route.from}`, { ...route, id: `${route.id}.reverse`, sourceRouteId: route.id, from: route.to, to: route.from });
  }
  return index;
}

export function findRoute(world, from, to) {
  return routeIndex(world).get(`${from}->${to}`) || null;
}

function routeAllowed(route, campaignState) {
  return evaluatePredicate(route?.requirements, campaignState).pass;
}

export function planTravel({ world, worldState, destinationId, campaignState = {} } = {}) {
  const start = worldState?.currentLocationId;
  if (!start || !destinationId) return { allowed: false, reason: 'Travel requires origin and destination.', routes: [] };
  if (start === destinationId) return { allowed: true, reason: 'Already at destination.', routes: [], travelHours: 0 };
  const adjacency = new Map();
  for (const route of routeIndex(world).values()) {
    if (!routeAllowed(route, { ...campaignState, worldState })) continue;
    if (!adjacency.has(route.from)) adjacency.set(route.from, []);
    adjacency.get(route.from).push(route);
  }
  const distances = new Map([[start, 0]]);
  const previous = new Map();
  const pending = new Set(asArray(world?.locations).map((location) => location.id));
  while (pending.size) {
    let current = null;
    let best = Number.POSITIVE_INFINITY;
    for (const id of pending) {
      const distance = distances.get(id) ?? Number.POSITIVE_INFINITY;
      if (distance < best) { best = distance; current = id; }
    }
    if (current === null || best === Number.POSITIVE_INFINITY) break;
    pending.delete(current);
    if (current === destinationId) break;
    for (const route of adjacency.get(current) || []) {
      const candidate = best + Number(route.travelHours || 0);
      if (candidate < (distances.get(route.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(route.to, candidate);
        previous.set(route.to, route);
      }
    }
  }
  if (!previous.has(destinationId)) return { allowed: false, reason: `No available route from ${start} to ${destinationId}.`, routes: [] };
  const routes = [];
  let cursor = destinationId;
  while (cursor !== start) {
    const route = previous.get(cursor);
    if (!route) break;
    routes.unshift(route);
    cursor = route.from;
  }
  return { allowed: true, reason: 'Route available.', routes, travelHours: distances.get(destinationId) };
}

export function canTravel({ world, worldState, destinationId, campaignState = {} } = {}) {
  if (worldState?.travel?.status === 'underway') return { allowed: false, reason: 'Travel is already underway.', routes: [] };
  return planTravel({ world, worldState, destinationId, campaignState });
}

function stardateDelta(world, hours) {
  const perDay = Number(world?.layout?.stardatePerDay ?? 2.74);
  return (Number(hours) / 24) * perDay;
}

export function advanceWorldTime({ world, worldState, hours, reason = 'time-advance', now = null } = {}) {
  const amount = Number(hours || 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('hours must be a non-negative number.');
  const next = cloneJson(worldState);
  const fromStardate = Number(next.currentStardate || 0);
  next.elapsedHours = Number(next.elapsedHours || 0) + amount;
  next.currentStardate = Number((fromStardate + stardateDelta(world, amount)).toFixed(3));
  return {
    worldState: next,
    event: {
      id: `event.time.${String(next.currentStardate).replace('.', '-')}.${reason}`,
      type: 'time.advanced',
      boundaryType: 'time-advance',
      stardate: next.currentStardate,
      payload: { hours: amount, fromStardate, toStardate: next.currentStardate, reason },
      committedAt: typeof now === 'function' ? now() : now,
      playerFacingSummary: amount > 0 ? `${amount} hours passed.` : ''
    }
  };
}

export function applyTravel({ world, worldState, destinationId, campaignState = {}, now = null } = {}) {
  const check = canTravel({ world, worldState, destinationId, campaignState });
  if (!check.allowed) throw new Error(check.reason);
  const next = cloneJson(worldState);
  const departedAt = Number(next.currentStardate || 0);
  const travelHours = Number(check.travelHours || 0);
  const arrival = departedAt + stardateDelta(world, travelHours);
  const from = next.currentLocationId;
  next.elapsedHours = Number(next.elapsedHours || 0) + travelHours;
  next.currentStardate = Number(arrival.toFixed(3));
  next.currentLocationId = destinationId;
  next.visitedLocationIds = [...new Set([...asArray(next.visitedLocationIds), destinationId])];
  next.travel = {
    status: 'arrived',
    routeIds: check.routes.map((route) => route.sourceRouteId || route.id),
    from,
    to: destinationId,
    departedAt,
    arrivesAt: next.currentStardate,
    travelHours,
    completedAt: typeof now === 'function' ? now() : (now || null)
  };
  const location = asArray(next.locations).find((item) => item.id === destinationId);
  if (location) {
    location.discovered = true;
    location.lastVisitedStardate = next.currentStardate;
    location.history = [...asArray(location.history), { type: 'visited', stardate: next.currentStardate }];
  }
  return {
    worldState: next,
    event: {
      id: `event.travel.${String(next.currentStardate).replace('.', '-')}.${destinationId}`,
      type: 'travel.completed',
      boundaryType: 'travel',
      stardate: next.currentStardate,
      locationIds: [from, destinationId],
      payload: { routeIds: next.travel.routeIds, from, to: destinationId, travelHours },
      playerFacingSummary: `The Breckenridge arrived at ${currentLocationTemplate(world, next)?.label || destinationId} after ${travelHours} hours in transit.`
    }
  };
}

export function adjustWorldClock(worldState, clockId, delta, reason = 'world-update') {
  const next = cloneJson(worldState);
  const clock = asArray(next.clocks).find((item) => item.id === clockId);
  if (!clock) throw new Error(`Unknown world clock "${clockId}".`);
  clock.value = Math.max(clock.min ?? Number.NEGATIVE_INFINITY, Math.min(clock.max ?? Number.POSITIVE_INFINITY, Number(clock.value || 0) + Number(delta || 0)));
  clock.lastReason = reason;
  return next;
}

export function adjustWorldTrack(worldState, trackId, delta, reason = 'world-update') {
  const next = cloneJson(worldState);
  const track = asArray(next.tracks).find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown world track "${trackId}".`);
  track.value = Math.max(track.min ?? Number.NEGATIVE_INFINITY, Math.min(track.max ?? Number.POSITIVE_INFINITY, Number(track.value || 0) + Number(delta || 0)));
  track.lastReason = reason;
  return next;
}

export function currentLocationTemplate(world, worldState) {
  return byId(world?.locations).get(worldState?.currentLocationId) || null;
}
