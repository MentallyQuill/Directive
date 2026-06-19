import { commitDirectorTurn } from '../campaign/transaction-state.mjs';
import {
  createCommandBearingInterventionPrompt,
  spendCommandBearingPoint
} from '../command/command-bearing.mjs';
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

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeTrack(track) {
  const key = String(track || '').trim().toLowerCase();
  return ['inspiration', 'resolve'].includes(key) ? key : null;
}

function trackLabel(track) {
  return track === 'inspiration' ? 'Inspiration' : 'Resolve';
}

function eligibleTracksFromTurnPacket(turnPacket) {
  return unique((turnPacket.outcomePacket?.commandDecisionAwards || [])
    .map((award) => normalizeTrack(award.track))
    .filter(Boolean));
}

function bearingRationaleFromTurnPacket(turnPacket) {
  const rationale = {};
  for (const award of turnPacket.outcomePacket?.commandDecisionAwards || []) {
    const track = normalizeTrack(award.track);
    if (track && !rationale[track]) {
      rationale[track] = award.reason || '';
    }
  }
  return rationale;
}

function createBearingEligibility(campaignState, turnPacket) {
  const outcomeId = requireNonEmptyString(turnPacket.outcomePacket?.id, 'outcomePacket.id');
  const resultBand = requireNonEmptyString(turnPacket.outcomePacket?.resultBand, 'outcomePacket.resultBand');
  const eligibleTracks = eligibleTracksFromTurnPacket(turnPacket);
  const rationale = bearingRationaleFromTurnPacket(turnPacket);
  const interventionPrompt = createCommandBearingInterventionPrompt(campaignState.commandStyle || {}, {
    outcomeId,
    resultBand,
    eligibleTracks,
    rationale
  });
  return {
    outcomeId,
    resultBand,
    eligibleTracks,
    rationale,
    interventionPrompt
  };
}

function attachProvisionalOutcomeFields(campaignState, turnPacket) {
  const next = cloneJson(turnPacket);
  const bearingEligibility = createBearingEligibility(campaignState, next);
  const provisionalOutcome = cloneJson(next.outcomePacket);
  next.provisionalOutcome = provisionalOutcome;
  next.bearingEligibility = bearingEligibility;
  next.anchoredConsequences = cloneJson(provisionalOutcome.costs || []);
  next.finalOutcome = null;
  next.bearingSpend = null;
  return next;
}

function latestLedgerEntryFor(state, outcomeId) {
  return (state.turnLedger?.entries || []).find((entry) => entry.outcomeId === outcomeId) || null;
}

function applyBearingSpendToCommittedState(committedState, turnPacket, spendTrack) {
  const track = normalizeTrack(spendTrack);
  if (!track) {
    throw new Error(`Unknown Command Bearing track "${spendTrack}"`);
  }
  const eligibility = turnPacket.bearingEligibility || createBearingEligibility(committedState, turnPacket);
  const spend = spendCommandBearingPoint(committedState.commandStyle || {}, {
    outcomeId: turnPacket.outcomePacket.id,
    track,
    resultBand: turnPacket.provisionalOutcome?.resultBand || eligibility.resultBand,
    eligibleTracks: eligibility.eligibleTracks,
    rationale: eligibility.rationale?.[track] || ''
  });
  if (!spend.applied) {
    throw new Error(spend.reason || `Cannot spend ${trackLabel(track)} on this outcome.`);
  }

  const nextState = cloneJson(committedState);
  nextState.commandStyle = spend.commandStyle;
  const ledgerEntry = latestLedgerEntryFor(nextState, turnPacket.outcomePacket.id);
  const spendRecord = {
    track,
    label: trackLabel(track),
    from: spend.from,
    to: spend.to,
    rationale: eligibility.rationale?.[track] || ''
  };
  if (ledgerEntry) {
    ledgerEntry.provisionalResultBand = spend.from;
    ledgerEntry.finalResultBand = spend.to;
    ledgerEntry.commandBearingSpend = cloneJson(spendRecord);
  }
  return {
    campaignState: nextState,
    spendRecord
  };
}

function finalizeTurnPacket(provisionalTurnPacket, { spendRecord = null } = {}) {
  const next = cloneJson(provisionalTurnPacket);
  const provisionalOutcome = next.provisionalOutcome || cloneJson(next.outcomePacket);
  next.provisionalOutcome = cloneJson(provisionalOutcome);
  if (spendRecord) {
    next.outcomePacket.resultBand = spendRecord.to;
    next.finalOutcome = {
      ...cloneJson(provisionalOutcome),
      resultBand: spendRecord.to
    };
    next.bearingSpend = cloneJson(spendRecord);
    next.commandLogPacket.visibleConsequences = [
      ...(next.commandLogPacket.visibleConsequences || []),
      `${spendRecord.label} invoked: ${spendRecord.from} improved to ${spendRecord.to}.`
    ];
    next.narratorPacket.constraints = [
      ...(next.narratorPacket.constraints || []),
      `${spendRecord.label} improved the final result to ${spendRecord.to}; narrate the stronger outcome without erasing anchored consequences.`
    ];
  } else {
    next.finalOutcome = cloneJson(next.outcomePacket);
    next.bearingSpend = null;
  }
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
  overrides = {}
} = {}) {
  requireObject(campaignState, 'campaignState');
  const input = requireNonEmptyString(playerInput, 'playerInput');
  const mission = campaignState.mission || {};
  const campaign = campaignState.campaign || {};
  const activePhaseId = mission.activePhaseId || mission.phase;
  const base = {
    campaignId: campaign.templateCampaignId || campaign.id,
    campaignInstanceId: campaign.id,
    missionId: mission.activeMissionId,
    activeMissionGraphId: mission.activeMissionGraphId,
    activePhaseId,
    stardate: campaign.currentStardate ?? campaign.openingStardate,
    locationId: campaignState.location?.id || 'breckinridge.bridge',
    presentCharacters: defaultPresentCharacters(campaignState, activePhaseId),
    knownFactIds: cloneJson(mission.knownFacts || []),
    activeDecisionPointIds: cloneJson(mission.availableDecisionPointIds || []),
    simulationMode: campaignState.settings?.simulationMode || 'Command',
    playerInput: input
  };
  return {
    ...base,
    ...cloneJson(overrides),
    playerInput: input
  };
}

export function createProvisionalDirectorTurnRuntime({
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
  const provisionalTurnPacket = attachProvisionalOutcomeFields(campaignState, turnPacket);
  return {
    kind: 'directive.runtimeProvisionalDirectorTurn',
    turnPacket: provisionalTurnPacket,
    provisionalOutcome: cloneJson(provisionalTurnPacket.provisionalOutcome),
    competencePacket: cloneJson(provisionalTurnPacket.competencePacket || null),
    commandBearingPrompt: cloneJson(provisionalTurnPacket.bearingEligibility.interventionPrompt),
    narratorPacket: cloneJson(provisionalTurnPacket.narratorPacket),
    commandLogPacket: cloneJson(provisionalTurnPacket.commandLogPacket)
  };
}

export function commitProvisionalDirectorTurnRuntime({
  campaignState,
  turnPacket,
  spendTrack = null
}) {
  requireObject(campaignState, 'campaignState');
  requireObject(turnPacket, 'turnPacket');
  const spendCandidatePacket = turnPacket.provisionalOutcome
    ? cloneJson(turnPacket)
    : attachProvisionalOutcomeFields(campaignState, turnPacket);
  let finalTurnPacket = spendCandidatePacket;
  if (spendTrack) {
    const track = normalizeTrack(spendTrack);
    if (!track) {
      throw new Error(`Unknown Command Bearing track "${spendTrack}"`);
    }
    const eligibility = spendCandidatePacket.bearingEligibility || createBearingEligibility(campaignState, spendCandidatePacket);
    const spendCheck = spendCommandBearingPoint(campaignState.commandStyle || {}, {
      outcomeId: spendCandidatePacket.outcomePacket.id,
      track,
      resultBand: spendCandidatePacket.provisionalOutcome?.resultBand || spendCandidatePacket.outcomePacket.resultBand,
      eligibleTracks: eligibility.eligibleTracks,
      rationale: eligibility.rationale?.[track] || ''
    });
    if (!spendCheck.applied) {
      throw new Error(spendCheck.reason || `Cannot spend ${trackLabel(track)} on this outcome.`);
    }
    finalTurnPacket = finalizeTurnPacket(spendCandidatePacket, {
      spendRecord: {
        track,
        label: trackLabel(track),
        from: spendCheck.from,
        to: spendCheck.to,
        rationale: eligibility.rationale?.[track] || ''
      }
    });
  } else {
    finalTurnPacket = finalizeTurnPacket(spendCandidatePacket);
  }

  const nextCampaignState = commitDirectorTurn(campaignState, finalTurnPacket);
  const committed = spendTrack
    ? applyBearingSpendToCommittedState(nextCampaignState, finalTurnPacket, spendTrack)
    : { campaignState: nextCampaignState, spendRecord: null };
  return {
    kind: 'directive.runtimeCommittedDirectorTurn',
    turnPacket: finalTurnPacket,
    campaignState: committed.campaignState,
    commandBearingSpend: cloneJson(committed.spendRecord),
    competencePacket: cloneJson(finalTurnPacket.competencePacket || null),
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
    turnPacket: committed.turnPacket,
    campaignState: committed.campaignState,
    narratorPacket: cloneJson(committed.narratorPacket),
    commandLogPacket: cloneJson(committed.commandLogPacket)
  };
}
