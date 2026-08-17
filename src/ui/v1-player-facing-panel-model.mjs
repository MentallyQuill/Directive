const PLAYER_PROJECTION_KIND = 'directive.playerProjection.v1';
const TIME_PROJECTION_KIND = 'directive.timePlayerProjection.v1';
const PLAYER_IDENTITY_PROJECTION_KIND = 'directive.playerIdentityProjection.v1';
const MISSION_PROJECTION_KIND = 'directive.missionPlayerProjection.v1';
const PEOPLE_PROJECTION_KIND = 'directive.peoplePlayerProjection.v1';
const SHIP_PROJECTION_KIND = 'directive.shipPlayerProjection.v1';
const COMMAND_BEARING_PROJECTION_KIND = 'directive.commandBearingPlayerProjection.v1';

export const ASHES_V1_PACKAGE_ID = 'directive:campaign-package:breckenridge-ashes-of-peace';

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function projectionError(message) {
  const error = new Error(message);
  error.code = 'DIRECTIVE_V1_PLAYER_PROJECTION_REQUIRED';
  return error;
}

function requireProjectionKind(value, kind, label) {
  if (value?.kind !== kind) {
    throw projectionError(`Directive V1 requires an exact ${label} player projection.`);
  }
  return value;
}

export function requireV1PlayerProjection(view = {}) {
  const projection = view?.v1PlayerProjection || null;
  if (!view?.campaignState && !projection) return null;
  if (projection?.kind !== PLAYER_PROJECTION_KIND) {
    throw projectionError('This campaign is not valid Directive V1 state and cannot be displayed.');
  }
  requireProjectionKind(projection.time, TIME_PROJECTION_KIND, 'time');
  requireProjectionKind(projection.player, PLAYER_IDENTITY_PROJECTION_KIND, 'player identity');
  requireProjectionKind(projection.mission, MISSION_PROJECTION_KIND, 'mission');
  requireProjectionKind(projection.people, PEOPLE_PROJECTION_KIND, 'people');
  requireProjectionKind(projection.ship, SHIP_PROJECTION_KIND, 'ship');
  requireProjectionKind(projection.commandBearing, COMMAND_BEARING_PROJECTION_KIND, 'Command Bearing');
  return projection;
}

export function createV1MissionPanelModel(projection) {
  requireProjectionKind(projection?.mission, MISSION_PROJECTION_KIND, 'mission');
  const mission = projection.mission;
  const objectives = copy(mission.objectives || []);
  return {
    missionId: mission.missionId,
    title: mission.title,
    summary: mission.summary,
    status: mission.status,
    primaryObjectives: objectives.filter((objective) => objective.class === 'required'),
    optionalObjectives: objectives.filter((objective) => objective.class === 'optional'),
    progress: copy(mission.progress),
    capabilities: copy(mission.capabilities || []),
    knownFacts: copy(mission.facts || []),
    clocks: copy(mission.clocks || []),
    outcomeDimensions: copy(mission.outcomeDimensions || []),
    terminal: copy(mission.terminal)
  };
}

export function createV1CrewPanelModel(projection) {
  requireProjectionKind(projection?.player, PLAYER_IDENTITY_PROJECTION_KIND, 'player identity');
  requireProjectionKind(projection?.people, PEOPLE_PROJECTION_KIND, 'people');
  requireProjectionKind(projection?.commandBearing, COMMAND_BEARING_PROJECTION_KIND, 'Command Bearing');
  return {
    player: copy(projection.player),
    people: copy(projection.people.people || []),
    commandBearing: {
      balance: projection.commandBearing.balance,
      capacity: projection.commandBearing.capacity,
      latestAwardReason: projection.commandBearing.latestAwardReason || null,
      pendingEdge: copy(projection.commandBearing.pendingEdge),
      pendingCohesionRelief: copy(projection.commandBearing.pendingCohesionRelief ?? null),
      latestSpend: copy(projection.commandBearing.latestSpend)
    }
  };
}

export function createV1ShipPanelModel(projection) {
  requireProjectionKind(projection?.ship, SHIP_PROJECTION_KIND, 'ship');
  return copy(projection.ship);
}

export function createV1CampaignPanelModel(view = {}) {
  const packages = copy(view?.campaign?.packages || []).map((pack) => ({
    ...pack,
    available: (pack.packageId || pack.id || pack.manifest?.id) === ASHES_V1_PACKAGE_ID
  }));
  const campaigns = copy(view?.campaignIndex?.campaigns || [])
    .filter((campaign) => campaign.packageId === ASHES_V1_PACKAGE_ID);
  return { packages, campaigns };
}
