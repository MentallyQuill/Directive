import { commitDirectorTurn } from '../campaign/transaction-state.mjs';
import { runMissionDirectorTurn } from '../mission/director.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function defaultPresentCharacters(campaignState) {
  const playerId = campaignState.player?.id || 'player-commander';
  const captainId = campaignState.captainState?.crewId || 'mara-whitaker';
  return [...new Set([playerId, captainId])];
}

export function buildSceneSnapshotFromCampaignState(campaignState, {
  playerInput,
  overrides = {}
} = {}) {
  requireObject(campaignState, 'campaignState');
  const input = requireNonEmptyString(playerInput, 'playerInput');
  const mission = campaignState.mission || {};
  const campaign = campaignState.campaign || {};
  const base = {
    campaignId: campaign.id,
    missionId: mission.activeMissionId,
    activeMissionGraphId: mission.activeMissionGraphId,
    activePhaseId: mission.activePhaseId || mission.phase,
    stardate: campaign.currentStardate ?? campaign.openingStardate,
    locationId: campaignState.location?.id || 'breckinridge.bridge',
    presentCharacters: defaultPresentCharacters(campaignState),
    knownFactIds: cloneJson(mission.knownFacts || []),
    activeDecisionPointIds: cloneJson(mission.availableDecisionPointIds || []),
    playerInput: input
  };
  return {
    ...base,
    ...cloneJson(overrides),
    playerInput: input
  };
}

export function runDirectorTurnRuntime({
  campaignState,
  graph,
  projection,
  crewDataset,
  graphPath,
  projectionPath,
  turnId,
  playerInput,
  sceneSnapshotOverrides = {}
}) {
  requireObject(campaignState, 'campaignState');
  requireObject(graph, 'graph');
  requireObject(projection, 'projection');
  requireObject(crewDataset, 'crewDataset');
  const id = requireNonEmptyString(turnId, 'turnId');
  const sceneSnapshot = buildSceneSnapshotFromCampaignState(campaignState, {
    playerInput,
    overrides: sceneSnapshotOverrides
  });
  const turnPacket = runMissionDirectorTurn({
    turnId: id,
    graphPath: graphPath || campaignState.mission?.activeMissionGraphPath,
    projectionPath,
    graph,
    projection,
    crewDataset,
    sceneSnapshot,
    campaignState
  });
  const nextCampaignState = commitDirectorTurn(campaignState, turnPacket);
  return {
    kind: 'directive.runtimeDirectorTurn',
    turnPacket,
    campaignState: nextCampaignState,
    narratorPacket: cloneJson(turnPacket.narratorPacket),
    commandLogPacket: cloneJson(turnPacket.commandLogPacket)
  };
}
