import {
  commitV1DirectorCustodyTurn,
  createV1DirectorCustodyTurnPacket,
} from '../campaign/transaction-state.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} must be a non-empty string`);
  return text;
}

function presentCharacters(campaignState, overrides = {}) {
  const explicit = Array.isArray(overrides.presentCharacters)
    ? overrides.presentCharacters.filter(Boolean)
    : [];
  if (explicit.length > 0) return [...new Set(explicit)];
  return [...new Set([
    campaignState.player?.id || 'player-commander',
    campaignState.captainState?.crewId,
  ].filter(Boolean))];
}

export function buildSceneSnapshotFromCampaignState(campaignState, {
  playerInput,
  overrides = {},
} = {}) {
  requireObject(campaignState, 'campaignState');
  const input = requireNonEmptyString(playerInput, 'playerInput');
  return {
    kind: 'directive.v1NarrationSceneSnapshot',
    campaignId: requireNonEmptyString(campaignState.campaign?.id, 'campaignState.campaign.id'),
    missionId: requireNonEmptyString(campaignState.mission?.activeMissionId, 'campaignState.mission.activeMissionId'),
    locationId: String(overrides.locationId || campaignState.worldState?.currentLocationId || '').trim() || null,
    stardate: overrides.stardate ?? campaignState.worldState?.currentStardate ?? null,
    presentCharacters: presentCharacters(campaignState, overrides),
    playerInput: input,
  };
}

function createNarrationTurn({
  campaignState,
  turnId,
  playerInput,
  sceneSnapshotOverrides = {},
  arbiterPlan = null,
} = {}) {
  requireObject(campaignState, 'campaignState');
  const id = requireNonEmptyString(turnId, 'turnId');
  const sceneSnapshot = buildSceneSnapshotFromCampaignState(campaignState, {
    playerInput,
    overrides: sceneSnapshotOverrides,
  });
  return {
    kind: 'directive.v1NarrationTurn',
    turnId: id,
    semanticAuthority: 'acceptedPairSettlement',
    semanticStateDeltaApplied: false,
    sceneSnapshot,
    arbiterPlan: cloneJson(arbiterPlan),
    narratorPacket: {
      kind: 'directive.v1NarratorPacket',
      sourceTurnId: id,
      playerInput: sceneSnapshot.playerInput,
      guidance: [
        'Continue the current scene from the player input without declaring hidden facts or mission completion.',
        'Narration is provisional until the player sends their next message and accepts this response.',
        'Do not create trackers, rewards, relationship changes, ship issues, or mission state in prose metadata.',
      ],
      rawHiddenValuesExposed: false,
      directorOnlyDataIncluded: false,
    },
  };
}

export function createProvisionalDirectorTurnRuntime(options = {}) {
  const turnPacket = createNarrationTurn(options);
  return {
    kind: 'directive.v1ProvisionalNarrationTurn',
    turnPacket,
    narratorPacket: cloneJson(turnPacket.narratorPacket),
  };
}

export async function createProvisionalDirectorTurnRuntimeAsync(options = {}) {
  return createProvisionalDirectorTurnRuntime(options);
}

export function commitProvisionalDirectorTurnRuntime({ campaignState, turnPacket } = {}) {
  requireObject(campaignState, 'campaignState');
  const custodyPacket = createV1DirectorCustodyTurnPacket(turnPacket);
  return {
    kind: 'directive.v1CommittedNarrationTurn',
    turnPacket: custodyPacket,
    mechanicsTurnPacket: custodyPacket,
    campaignState: commitV1DirectorCustodyTurn(campaignState, custodyPacket),
    narratorPacket: cloneJson(custodyPacket.narratorPacket),
  };
}

export function runDirectorTurnRuntime(options = {}) {
  const provisional = createProvisionalDirectorTurnRuntime(options);
  const committed = commitProvisionalDirectorTurnRuntime({
    campaignState: options.campaignState,
    turnPacket: provisional.turnPacket,
  });
  return {
    kind: 'directive.v1NarrationRuntimeTurn',
    turnPacket: committed.turnPacket,
    campaignState: committed.campaignState,
    narratorPacket: cloneJson(committed.narratorPacket),
  };
}
