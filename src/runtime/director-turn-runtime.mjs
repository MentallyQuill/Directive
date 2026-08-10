import {
  commitV1DirectorCustodyTurn,
  createV1DirectorCustodyTurnPacket
} from '../campaign/transaction-state.mjs';
import { buildOpenWorldSceneSnapshot, createDirectorCoordinatorTurn, createDirectorCoordinatorTurnAsync } from '../directors/open-world-turn-coordinator.mjs';

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

function attachProvisionalOutcomeFields(turnPacket) {
  const next = cloneJson(turnPacket);
  const provisionalOutcome = cloneJson(next.outcomePacket);
  next.provisionalOutcome = provisionalOutcome;
  next.bearingEligibility = null;
  next.warningConfirmation = null;
  next.anchoredConsequences = cloneJson(provisionalOutcome.costs || []);
  next.finalOutcome = null;
  next.bearingSpend = null;
  return next;
}

function finalizeTurnPacket(provisionalTurnPacket) {
  const next = cloneJson(provisionalTurnPacket);
  const provisionalOutcome = next.provisionalOutcome || cloneJson(next.outcomePacket);
  next.provisionalOutcome = cloneJson(provisionalOutcome);
  next.finalOutcome = cloneJson(next.outcomePacket);
  next.bearingSpend = null;
  next.commandBearingAdjustment = null;
  return next;
}

function seniorCrewIds(campaignState) {
  return (campaignState.crew?.seniorCrewIds || []).filter(Boolean);
}

function defaultPresentCharacters(campaignState, activePhaseId) {
  const playerId = campaignState.player?.id || 'player-commander';
  const captainId = campaignState.captainState?.crewId || 'mara-whitaker';
  if ([
    'senior-readiness-conference',
    'fallback-command-drill',
    'combined-load-test',
    'final-command-review'
  ].includes(activePhaseId)) {
    return [...new Set([playerId, ...seniorCrewIds(campaignState), captainId])];
  }
  return [...new Set([playerId, captainId])];
}

export function buildSceneSnapshotFromCampaignState(campaignState, {
  playerInput,
  overrides = {},
  packageData
} = {}) {
  requireObject(campaignState, 'campaignState');
  requireObject(packageData, 'packageData');
  const input = requireNonEmptyString(playerInput, 'playerInput');
  return buildOpenWorldSceneSnapshot(campaignState, packageData, input, overrides);
}

export function createProvisionalDirectorTurnRuntime({
  campaignState,
  packageData,
  graph = null,
  projection,
  crewDataset,
  shipDataset = null,
  graphPath,
  projectionPath,
  turnId,
  playerInput,
  sceneSnapshotOverrides = {},
  arbiterPlan = null,
  coreRecallEntries = []
}) {
  requireObject(campaignState, 'campaignState');
  requireObject(packageData, 'packageData');
  requireObject(projection, 'projection');
  requireObject(crewDataset, 'crewDataset');
  const id = requireNonEmptyString(turnId, 'turnId');
  const coordinated = createDirectorCoordinatorTurn({
    campaignState,
    packageData,
    graph,
    projection,
    crewDataset,
    shipDataset,
    graphPath,
    projectionPath,
    turnId: id,
    playerInput,
    sceneSnapshotOverrides,
    arbiterPlan,
    coreRecallEntries
  });
  const turnPacket = coordinated.turnPacket;
  const provisionalTurnPacket = attachProvisionalOutcomeFields(turnPacket);
  return {
    kind: 'directive.runtimeProvisionalDirectorTurn',
    coordinatorDiagnostics: cloneJson(coordinated.diagnostics),
    turnPacket: provisionalTurnPacket,
    provisionalOutcome: cloneJson(provisionalTurnPacket.provisionalOutcome),
    competencePacket: null,
    warningConfirmation: null,
    commandBearingPrompt: null,
    narratorPacket: cloneJson(provisionalTurnPacket.narratorPacket),
    commandLogPacket: cloneJson(provisionalTurnPacket.commandLogPacket)
  };
}


export async function createProvisionalDirectorTurnRuntimeAsync({
  campaignState,
  packageData,
  graph = null,
  projection,
  crewDataset,
  shipDataset = null,
  graphPath,
  projectionPath,
  turnId,
  playerInput,
  sceneSnapshotOverrides = {},
  generationRouter = null,
  arbiterPlan = null,
  coreRecallEntries = [],
  message = null,
  recentTranscript = [],
  sourceFrameRef = null
}) {
  requireObject(campaignState, 'campaignState');
  requireObject(packageData, 'packageData');
  requireObject(projection, 'projection');
  requireObject(crewDataset, 'crewDataset');
  const id = requireNonEmptyString(turnId, 'turnId');
  const coordinated = await createDirectorCoordinatorTurnAsync({
    campaignState, packageData, graph, projection, crewDataset, shipDataset, graphPath, projectionPath,
    turnId: id, playerInput, sceneSnapshotOverrides, generationRouter, arbiterPlan, coreRecallEntries,
    message, recentTranscript, sourceFrameRef
  });
  const provisionalTurnPacket = attachProvisionalOutcomeFields(coordinated.turnPacket);
  return {
    kind: 'directive.runtimeProvisionalDirectorTurn',
    coordinatorDiagnostics: cloneJson(coordinated.diagnostics),
    turnPacket: provisionalTurnPacket,
    provisionalOutcome: cloneJson(provisionalTurnPacket.provisionalOutcome),
    competencePacket: null,
    warningConfirmation: null,
    commandBearingPrompt: null,
    narratorPacket: cloneJson(provisionalTurnPacket.narratorPacket),
    commandLogPacket: cloneJson(provisionalTurnPacket.commandLogPacket)
  };
}
export function commitProvisionalDirectorTurnRuntime({
  campaignState,
  turnPacket,
  spendTrack = null,
  readiedCommandBearing = null
}) {
  requireObject(campaignState, 'campaignState');
  requireObject(turnPacket, 'turnPacket');
  if (spendTrack || readiedCommandBearing) {
    const error = new Error('Command Bearing spending requires the V1 neutral-reserve mechanic.');
    error.code = 'DIRECTIVE_V1_COMMAND_BEARING_UNAVAILABLE';
    throw error;
  }
  const spendCandidatePacket = turnPacket.provisionalOutcome
    ? cloneJson(turnPacket)
    : attachProvisionalOutcomeFields(turnPacket);
  const finalTurnPacket = finalizeTurnPacket(spendCandidatePacket);
  const mechanicsTurnPacket = createV1DirectorCustodyTurnPacket(finalTurnPacket);
  const nextCampaignState = commitV1DirectorCustodyTurn(campaignState, mechanicsTurnPacket);
  return {
    kind: 'directive.runtimeCommittedDirectorTurn',
    turnPacket: finalTurnPacket,
    mechanicsTurnPacket,
    campaignState: nextCampaignState,
    commandBearingSpend: null,
    competencePacket: null,
    warningConfirmation: null,
    narratorPacket: cloneJson(finalTurnPacket.narratorPacket),
    commandLogPacket: cloneJson(finalTurnPacket.commandLogPacket)
  };
}

export function runDirectorTurnRuntime(options) {
  const provisional = createProvisionalDirectorTurnRuntime(options);
  const committed = commitProvisionalDirectorTurnRuntime({
    campaignState: options.campaignState,
    turnPacket: provisional.turnPacket
  });
  return {
    kind: 'directive.runtimeDirectorTurn',
    coordinatorDiagnostics: cloneJson(provisional.coordinatorDiagnostics || null),
    turnPacket: committed.turnPacket,
    campaignState: committed.campaignState,
    narratorPacket: cloneJson(committed.narratorPacket),
    commandLogPacket: cloneJson(committed.commandLogPacket)
  };
}
