import { commitDirectorTurn } from '../campaign/transaction-state.mjs';
import {
  COMMAND_BEARING_OUTCOME_LADDER,
  createCommandBearingInterventionPrompt,
  migrateCommandBearingState,
  validateCommandBearingSpendCommit,
  spendCommandBearingPoint
} from '../command/command-bearing.mjs';
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
  const interventionPrompt = createCommandBearingInterventionPrompt(migrateCommandBearingState(campaignState), {
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

function trackDefinition(track) {
  return track === 'inspiration'
    ? 'Inspiration is leadership through trust, shared purpose, transparency, dignity, mentorship, and voluntary cooperation.'
    : 'Resolve is leadership through lawful authority, preparation, credible boundaries, discipline, and accepted responsibility.';
}

function attachProvisionalOutcomeFields(campaignState, turnPacket) {
  const next = cloneJson(turnPacket);
  const bearingEligibility = createBearingEligibility(campaignState, next);
  const warningConfirmation = createWarningConfirmation(next);
  const provisionalOutcome = cloneJson(next.outcomePacket);
  next.provisionalOutcome = provisionalOutcome;
  next.bearingEligibility = bearingEligibility;
  next.warningConfirmation = warningConfirmation;
  next.anchoredConsequences = cloneJson(provisionalOutcome.costs || []);
  next.finalOutcome = null;
  next.bearingSpend = null;
  return next;
}

function createWarningConfirmation(turnPacket) {
  const warnings = (turnPacket.competencePacket?.proceduralWarnings || [])
    .filter((warning) => warning.confirmationRequired === true);
  const criticalWarnings = warnings.filter((warning) => warning.severity === 'critical');
  return {
    required: warnings.length > 0,
    warningIds: warnings.map((warning) => warning.id),
    criticalWarningIds: criticalWarnings.map((warning) => warning.id),
    severity: criticalWarnings.length > 0 ? 'critical' : warnings.length > 0 ? 'serious' : 'none',
    message: warnings.length > 0
      ? 'This order departs from standard procedure. Confirm informed intent, revise the order, or request counsel.'
      : null
  };
}

function requireWarningConfirmation(turnPacket, { confirmWarnings = false, confirmedWarningIds = [] } = {}) {
  const confirmation = turnPacket.warningConfirmation || createWarningConfirmation(turnPacket);
  if (!confirmation.required) {
    return [];
  }
  if (!confirmWarnings) {
    throw new Error(`Procedural warning confirmation required: ${confirmation.warningIds.join(', ')}`);
  }
  const confirmed = confirmedWarningIds.length > 0 ? confirmedWarningIds : confirmation.warningIds;
  const confirmedSet = new Set(confirmed);
  const missing = confirmation.warningIds.filter((warningId) => !confirmedSet.has(warningId));
  if (missing.length > 0) {
    throw new Error(`Missing procedural warning confirmation for: ${missing.join(', ')}`);
  }
  return confirmed;
}

function latestLedgerEntryFor(state, outcomeId) {
  return (state.turnLedger?.entries || []).find((entry) => entry.outcomeId === outcomeId) || null;
}

function applyBearingSpendToCommittedState(committedState, turnPacket, spendRequest) {
  const request = isObject(spendRequest) ? spendRequest : { track: spendRequest };
  const track = normalizeTrack(request.track);
  if (!track) {
    throw new Error(`Unknown Command Bearing track "${request.track}"`);
  }
  const readiedId = request.readiedId || request.id || null;
  const eligibility = turnPacket.bearingEligibility || createBearingEligibility(committedState, turnPacket);
  const spend = spendCommandBearingPoint(committedState.commandBearing || {}, {
    outcomeId: turnPacket.outcomePacket.id,
    track,
    resultBand: turnPacket.provisionalOutcome?.resultBand || eligibility.resultBand,
    eligibleTracks: eligibility.eligibleTracks,
    rationale: eligibility.rationale?.[track] || request.rationale || '',
    readiedId,
    ingressId: request.ingressId || null,
    hostMessageId: request.hostMessageId || null
  });
  if (!spend.applied) {
    throw new Error(spend.reason || `Cannot spend ${trackLabel(track)} on this outcome.`);
  }

  const nextState = cloneJson(committedState);
  nextState.commandBearing = spend.commandBearing;
  const ledgerEntry = latestLedgerEntryFor(nextState, turnPacket.outcomePacket.id);
  const spendRecord = {
    outcomeId: turnPacket.outcomePacket.id,
    readiedId: readiedId || '',
    ingressId: request.ingressId || '',
    hostMessageId: request.hostMessageId || '',
    track,
    label: trackLabel(track),
    from: spend.from,
    to: spend.to,
    rationale: eligibility.rationale?.[track] || request.rationale || '',
    fit: request.fit || 'strong',
    causalBasis: request.causalBasis || [
      eligibility.rationale?.[track] || request.rationale || `${trackLabel(track)} was eligible for this committed action.`
    ]
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

function createCommandBearingAdjustmentPacket(provisionalOutcome, spendRecord) {
  return {
    kind: 'directive.commandBearingOutcomeAdjustment',
    outcomeId: spendRecord.outcomeId,
    readiedId: spendRecord.readiedId || '',
    track: spendRecord.track,
    trackDefinition: trackDefinition(spendRecord.track),
    outcomeLadder: [...COMMAND_BEARING_OUTCOME_LADDER],
    baseOutcome: {
      resultBand: spendRecord.from,
      summary: provisionalOutcome.summary || '',
      visibleCosts: cloneJson(provisionalOutcome.costs || [])
    },
    eligibility: {
      fit: spendRecord.fit || 'strong',
      causalBasis: cloneJson(spendRecord.causalBasis || [])
    },
    spend: {
      from: spendRecord.from,
      to: spendRecord.to,
      rule: 'One valid Command Bearing point improves a spendable outcome by exactly two bands.'
    },
    finalOutcome: {
      resultBand: spendRecord.to,
      summary: provisionalOutcome.summary || '',
      improvements: [
        `${spendRecord.label} improves the committed result from ${spendRecord.from} to ${spendRecord.to}.`
      ],
      anchoredConsequences: cloneJson(provisionalOutcome.costs || [])
    },
    safety: {
      narrateFinalOutcomeOnly: true,
      mayChangeResultBand: false,
      mayEraseAnchoredConsequences: false,
      mayInventHiddenFacts: false,
      mayWritePlayerInterior: false
    }
  };
}

function finalizeTurnPacket(provisionalTurnPacket, { spendRecord = null } = {}) {
  const next = cloneJson(provisionalTurnPacket);
  const provisionalOutcome = next.provisionalOutcome || cloneJson(next.outcomePacket);
  next.provisionalOutcome = cloneJson(provisionalOutcome);
  if (spendRecord) {
    const adjustment = createCommandBearingAdjustmentPacket(provisionalOutcome, {
      ...spendRecord,
      outcomeId: next.outcomePacket.id
    });
    next.outcomePacket.resultBand = spendRecord.to;
    next.finalOutcome = {
      ...cloneJson(provisionalOutcome),
      resultBand: spendRecord.to
    };
    next.bearingSpend = cloneJson({
      ...spendRecord,
      outcomeId: next.outcomePacket.id
    });
    next.commandBearingAdjustment = cloneJson(adjustment);
    next.commandLogPacket.visibleConsequences = [
      ...(next.commandLogPacket.visibleConsequences || []),
      `${spendRecord.label} invoked: ${spendRecord.from} improved to ${spendRecord.to}.`
    ];
    next.narratorPacket.commandBearingAdjustment = cloneJson(adjustment);
    next.narratorPacket.constraints = [
      ...(next.narratorPacket.constraints || []),
      `${spendRecord.label} improved the final result to ${spendRecord.to}; narrate the stronger outcome without erasing anchored consequences.`,
      'Use narratorPacket.commandBearingAdjustment as the source of truth for the Command Bearing spend; do not change mechanics.'
    ];
  } else {
    next.finalOutcome = cloneJson(next.outcomePacket);
    next.bearingSpend = null;
    next.commandBearingAdjustment = null;
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
  graphPath,
  projectionPath,
  turnId,
  playerInput,
  sceneSnapshotOverrides = {}
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
    graphPath,
    projectionPath,
    turnId: id,
    playerInput,
    sceneSnapshotOverrides
  });
  const turnPacket = coordinated.turnPacket;
  const provisionalTurnPacket = attachProvisionalOutcomeFields(campaignState, turnPacket);
  return {
    kind: 'directive.runtimeProvisionalDirectorTurn',
    coordinatorDiagnostics: cloneJson(coordinated.diagnostics),
    turnPacket: provisionalTurnPacket,
    provisionalOutcome: cloneJson(provisionalTurnPacket.provisionalOutcome),
    competencePacket: cloneJson(provisionalTurnPacket.competencePacket || null),
    warningConfirmation: cloneJson(provisionalTurnPacket.warningConfirmation),
    commandBearingPrompt: cloneJson(provisionalTurnPacket.bearingEligibility.interventionPrompt),
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
  graphPath,
  projectionPath,
  turnId,
  playerInput,
  sceneSnapshotOverrides = {},
  generationRouter = null
}) {
  requireObject(campaignState, 'campaignState');
  requireObject(packageData, 'packageData');
  requireObject(projection, 'projection');
  requireObject(crewDataset, 'crewDataset');
  const id = requireNonEmptyString(turnId, 'turnId');
  const coordinated = await createDirectorCoordinatorTurnAsync({
    campaignState, packageData, graph, projection, crewDataset, graphPath, projectionPath,
    turnId: id, playerInput, sceneSnapshotOverrides, generationRouter
  });
  const provisionalTurnPacket = attachProvisionalOutcomeFields(campaignState, coordinated.turnPacket);
  return {
    kind: 'directive.runtimeProvisionalDirectorTurn',
    coordinatorDiagnostics: cloneJson(coordinated.diagnostics),
    turnPacket: provisionalTurnPacket,
    provisionalOutcome: cloneJson(provisionalTurnPacket.provisionalOutcome),
    competencePacket: cloneJson(provisionalTurnPacket.competencePacket || null),
    warningConfirmation: cloneJson(provisionalTurnPacket.warningConfirmation),
    commandBearingPrompt: cloneJson(provisionalTurnPacket.bearingEligibility.interventionPrompt),
    narratorPacket: cloneJson(provisionalTurnPacket.narratorPacket),
    commandLogPacket: cloneJson(provisionalTurnPacket.commandLogPacket)
  };
}
export function commitProvisionalDirectorTurnRuntime({
  campaignState,
  turnPacket,
  spendTrack = null,
  readiedCommandBearing = null,
  confirmWarnings = false,
  confirmedWarningIds = []
}) {
  requireObject(campaignState, 'campaignState');
  requireObject(turnPacket, 'turnPacket');
  if (spendTrack) {
    throw new Error('Command Bearing points must be readied before the player message; post-outcome spendTrack commits are disabled.');
  }
  const spendCandidatePacket = turnPacket.provisionalOutcome
    ? cloneJson(turnPacket)
    : attachProvisionalOutcomeFields(campaignState, turnPacket);
  let finalTurnPacket = spendCandidatePacket;
  const spendRequest = readiedCommandBearing || null;
  if (spendRequest) {
    const track = normalizeTrack(spendRequest.track);
    if (!track) {
      throw new Error(`Unknown Command Bearing track "${spendRequest.track}"`);
    }
    const eligibility = spendCandidatePacket.bearingEligibility || createBearingEligibility(campaignState, spendCandidatePacket);
    const commandBearing = migrateCommandBearingState(campaignState);
    const readiedId = spendRequest.readiedId || spendRequest.id || null;
    const spendCheck = spendCommandBearingPoint(commandBearing, {
      outcomeId: spendCandidatePacket.outcomePacket.id,
      track,
      resultBand: spendCandidatePacket.provisionalOutcome?.resultBand || spendCandidatePacket.outcomePacket.resultBand,
      eligibleTracks: eligibility.eligibleTracks,
      rationale: eligibility.rationale?.[track] || spendRequest.rationale || '',
      readiedId,
      ingressId: spendRequest.ingressId || null,
      hostMessageId: spendRequest.hostMessageId || null
    });
    if (!spendCheck.applied) {
      throw new Error(spendCheck.reason || `Cannot spend ${trackLabel(track)} on this outcome.`);
    }
    if (readiedCommandBearing) {
      const validation = validateCommandBearingSpendCommit({
        outcomeId: spendCandidatePacket.outcomePacket.id,
        ingressId: spendRequest.ingressId || '',
        readiedId: readiedId || '',
        track,
        from: spendCheck.from,
        to: spendCheck.to,
        fit: spendRequest.fit || 'strong',
        causalBasis: spendRequest.causalBasis || [eligibility.rationale?.[track] || spendRequest.rationale || 'Readied point matched the committed action.']
      }, {
        commandBearing,
        readied: {
          id: readiedId || '',
          track,
          chatId: spendRequest.chatId || '',
          status: 'attached',
          ingressId: spendRequest.ingressId || ''
        },
        ingressId: spendRequest.ingressId || '',
        chatId: spendRequest.chatId || '',
        outcomeId: spendCandidatePacket.outcomePacket.id
      });
      if (!validation.accepted) {
        throw new Error(validation.rejections[0]?.message || `Cannot spend readied ${trackLabel(track)} on this outcome.`);
      }
    }
    finalTurnPacket = finalizeTurnPacket(spendCandidatePacket, {
      spendRecord: {
        outcomeId: spendCandidatePacket.outcomePacket.id,
        readiedId: readiedId || '',
        ingressId: spendRequest.ingressId || '',
        hostMessageId: spendRequest.hostMessageId || '',
        track,
        label: trackLabel(track),
        from: spendCheck.from,
        to: spendCheck.to,
        rationale: eligibility.rationale?.[track] || spendRequest.rationale || '',
        fit: spendRequest.fit || 'strong',
        causalBasis: spendRequest.causalBasis || [eligibility.rationale?.[track] || spendRequest.rationale || `${trackLabel(track)} matched this committed action.`]
      }
    });
  } else {
    finalTurnPacket = finalizeTurnPacket(spendCandidatePacket);
  }
  const confirmedWarnings = requireWarningConfirmation(finalTurnPacket, {
    confirmWarnings,
    confirmedWarningIds
  });

  const nextCampaignState = commitDirectorTurn(campaignState, finalTurnPacket, {
    confirmedWarningIds: confirmedWarnings
  });
  const committed = spendRequest
    ? applyBearingSpendToCommittedState(nextCampaignState, finalTurnPacket, {
      ...spendRequest,
      track: normalizeTrack(spendRequest.track)
    })
    : { campaignState: nextCampaignState, spendRecord: null };
  return {
    kind: 'directive.runtimeCommittedDirectorTurn',
    turnPacket: finalTurnPacket,
    campaignState: committed.campaignState,
    commandBearingSpend: cloneJson(committed.spendRecord),
    competencePacket: cloneJson(finalTurnPacket.competencePacket || null),
    warningConfirmation: cloneJson(finalTurnPacket.warningConfirmation || createWarningConfirmation(finalTurnPacket)),
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
