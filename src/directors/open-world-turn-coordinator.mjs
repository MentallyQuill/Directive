import { runMissionDirectorTurn } from '../mission/director.mjs';
import { commitDirectorTurn } from '../campaign/transaction-state.mjs';
import { parseIntent } from '../adjudication/intent-parser.mjs';
import { missionGraphForQuest } from '../mission/quest-graph-adapter.mjs';
import { questInstanceById, questTemplateById } from '../quests/quest-ledger.mjs';
import {
  deterministicQuestActionInterpretation,
  interpretQuestActionWithModel,
  validateQuestActionInterpretation
} from '../quests/action-interpreter.mjs';
import { applySystemicQuestProgress, resolveSystemicQuestAction } from '../quests/systemic-quest-resolver.mjs';
import { processWorldBoundary, resolveQuestBoundary } from './director-coordinator.mjs';
import { planCommandBearingStateClosureReviews } from '../command/command-bearing.mjs';
import { createOpenWorldReducerBundle } from './open-world-event-reducers.mjs';
import {
  buildContinuityDirectorPacket,
  compactContinuityDirectorPacket
} from '../continuity/director-packets.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function token(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64); }

function foreground(state) {
  const id = state?.attentionState?.foregroundQuestId || state?.questLedger?.foregroundQuestId;
  return id ? questInstanceById(state.questLedger, id) : null;
}

function sourceAnchorRange(overrides = {}) {
  return cloneJson(overrides.sourceAnchorRange || overrides.anchorRange || overrides.reconciliation?.anchorRange || null);
}

export function buildOpenWorldSceneSnapshot(campaignState, packageData, playerInput, overrides = {}) {
  const quest = foreground(campaignState);
  const template = questTemplateById(packageData, quest?.templateId || quest?.id, campaignState);
  const scene = campaignState.attentionState?.scene || {};
  const mission = campaignState.mission || {};
  const knownFacts = asArray(campaignState.knowledgeLedger?.facts)
    .filter((fact) => typeof fact === 'string' || (fact?.known !== false && fact?.stale !== true))
    .map((fact) => typeof fact === 'string' ? fact : fact.id);
  return {
    campaignId: campaignState.campaign?.templateCampaignId || campaignState.campaign?.id,
    campaignInstanceId: campaignState.campaign?.id,
    questId: quest?.id || null,
    missionId: mission.activeMissionId || quest?.id || null,
    activeMissionGraphId: mission.activeMissionGraphId || template?.missionGraph?.id || null,
    activePhaseId: mission.activePhaseId || scene.phaseId || 'opening',
    stardate: campaignState.worldState?.currentStardate ?? campaignState.campaign?.currentStardate,
    locationId: campaignState.worldState?.currentLocationId || packageData?.world?.openingLocationId,
    presentCharacters: cloneJson(overrides.presentCharacters || overrides.presentCharacterIds || scene.presentCharacterIds || [campaignState.player?.id || 'player-commander']),
    knownFactIds: knownFacts,
    activeDecisionPointIds: cloneJson(mission.availableDecisionPointIds || []),
    simulationMode: campaignState.settings?.simulationMode || 'Command',
    playerInput: text(playerInput),
    sourceAnchorRange: sourceAnchorRange(overrides),
    sourceMessageIds: cloneJson(overrides.sourceMessageIds || []),
    reconciliationRunId: overrides.reconciliationRunId || overrides.reconciliation?.runId || null,
    replay: overrides.replay === true,
    ...cloneJson(overrides),
    playerInput: text(playerInput)
  };
}

function openOperationsPacket({ campaignState, packageData, turnId, playerInput, sceneSnapshot }) {
  const location = asArray(packageData?.world?.locations).find((item) => item.id === sceneSnapshot.locationId);
  const summary = `The command is acknowledged during open operations at ${location?.label || sceneSnapshot.locationId}; no formal quest objective is advanced until the player selects or creates an assignment.`;
  const outcomeId = `outcome.${token(turnId)}`;
  return {
    contractVersion: 2,
    turnId,
    sceneSnapshot,
    intentParse: { summary: text(playerInput), primaryIntent: 'open-operations', targetIds: [], declaredMethod: text(playerInput), assumptions: [], signals: { openWorld: true, noForegroundQuest: true } },
    actionClassification: { category: 'clarificationNeeded', reason: 'No foreground quest or bounded mission situation currently owns this consequential action.' },
    authorityCapabilityCheck: { authority: { result: 'availableWithinMissionFrame', basis: ['The player has command authority.'] }, capability: { result: 'unresolvedUntilTargetSelected', basis: ['The intended operational target is not yet bound to a quest or world action.'] }, constraints: [], result: 'clarificationNeeded' },
    directorResponse: { usedDecisionPointIds: [], usedFactIds: [], usedClockIds: [], usedPressureIds: [], primaryPressureIds: [], secondaryPressureIds: [], commandDecisionCandidates: [], focusBudget: { primaryPressureMax: 1, secondaryPressureMax: 1, relationshipBeatMax: 1 }, responseSummary: summary },
    outcomePacket: { id: outcomeId, resultBand: 'Partial Failure', summary, costs: [], revealedFactIds: [], commandDecisionAwards: [], questCompleted: false, simulationPolicy: { simulationMode: sceneSnapshot.simulationMode, fatalityAllowedForPlayerOrSeniorStaff: false, severityCeilingApplied: true } },
    competencePacket: { sourceOutcomeId: outcomeId, assumedActions: [], proceduralWarnings: [], authorityNotes: [], counselRequests: [{ id: `counsel.${outcomeId}`, summary: 'Clarify the operational target or select an available assignment.' }], noGotchaPolicyApplied: true },
    stateDelta: { outcomeId, mission: {}, openWorld: { sourceAnchorRange: cloneJson(sceneSnapshot.sourceAnchorRange) } },
    narratorPacket: { sourceOutcomeId: outcomeId, resultBand: 'Partial Failure', summary, constraints: ['Ask for or naturally establish a specific operational target.', 'Do not invent a quest resolution or hidden emergency.'], allowedFacts: [], forbiddenFacts: [] },
    commandLogPacket: { sourceOutcomeId: outcomeId, summaryInputs: [text(playerInput), summary], visibleConsequences: [] },
    provenance: { sourceAnchorRange: cloneJson(sceneSnapshot.sourceAnchorRange), reconciliationRunId: sceneSnapshot.reconciliationRunId, replay: sceneSnapshot.replay === true }
  };
}

function completedByPacket(packet, overrides) {
  if (overrides?.questResolution?.status === 'resolved') return true;
  if (packet?.outcomePacket?.questCompleted === true) return true;
  if (packet?.systemicResolution?.completed === true) return true;
  const delta = packet?.stateDelta?.mission || {};
  return Boolean(delta.completedMissionIdSet || ['complete', 'completed', 'resolved'].includes(String(delta.endStateSet || '').toLowerCase()));
}

function hasTacticalGraph(graph) {
  return Boolean(graph && asArray(graph.phases).length && asArray(graph.decisionPoints).length);
}

function runTacticalOrSystemic({
  campaignState,
  packageData,
  graph,
  projection,
  crewDataset,
  shipDataset = null,
  graphPath,
  projectionPath,
  turnId,
  playerInput,
  sceneSnapshot,
  interpretation = null,
  continuityDirectorPacket = null,
  arbiterPlan = null,
  coreRecallEntries = []
}) {
  const quest = foreground(campaignState);
  const intentParse = parseIntent(sceneSnapshot);
  const terminalCatastrophe = intentParse?.primaryIntent === 'terminal-catastrophic-command';
  if (terminalCatastrophe && hasTacticalGraph(graph)) {
    try {
      return {
        packet: runMissionDirectorTurn({
          turnId,
          graphPath: graphPath || `package:${graph.manifest?.id || campaignState.mission?.activeMissionId || 'active-mission'}`,
          projectionPath,
          graph,
          projection,
          crewDataset,
          shipDataset,
          sceneSnapshot,
          campaignState,
          continuityDirectorPacket,
          arbiterPlan,
          coreRecallEntries
        }),
        usedTacticalGraph: true,
        interpretation: null,
        fallbackReason: null
      };
    } catch (error) {
      return {
        packet: openOperationsPacket({ campaignState, packageData, turnId, playerInput, sceneSnapshot }),
        usedTacticalGraph: false,
        interpretation: null,
        fallbackReason: `terminal-tactical-graph-failed:${error?.message || error}`
      };
    }
  }
  if (!quest) return { packet: openOperationsPacket({ campaignState, packageData, turnId, playerInput, sceneSnapshot }), usedTacticalGraph: false, interpretation: null, fallbackReason: 'no-foreground-quest' };
  if (hasTacticalGraph(graph)) {
    try {
      return {
        packet: runMissionDirectorTurn({
          turnId,
          graphPath: graphPath || `package:${graph.manifest?.id || quest.id}`,
          projectionPath,
          graph,
          projection,
          crewDataset,
          shipDataset,
          sceneSnapshot,
          campaignState,
          continuityDirectorPacket,
          arbiterPlan,
          coreRecallEntries
        }),
        usedTacticalGraph: true,
        interpretation: null,
        fallbackReason: null
      };
    } catch (error) {
      const resolvedInterpretation = interpretation || deterministicQuestActionInterpretation({ playerInput, state: campaignState, packageData, questId: quest.id, sourceAnchorRange: sceneSnapshot.sourceAnchorRange });
      return {
        packet: resolveSystemicQuestAction({ state: campaignState, packageData, turnId, playerInput, interpretation: resolvedInterpretation.interpretation, questId: quest.id, sourceAnchorRange: sceneSnapshot.sourceAnchorRange }),
        usedTacticalGraph: false,
        interpretation: resolvedInterpretation,
        fallbackReason: `tactical-graph-failed:${error?.message || error}`
      };
    }
  }
  const resolvedInterpretation = interpretation || deterministicQuestActionInterpretation({ playerInput, state: campaignState, packageData, questId: quest.id, sourceAnchorRange: sceneSnapshot.sourceAnchorRange });
  if (!resolvedInterpretation?.ok || !resolvedInterpretation.interpretation) {
    return { packet: openOperationsPacket({ campaignState, packageData, turnId, playerInput, sceneSnapshot }), usedTacticalGraph: false, interpretation: resolvedInterpretation, fallbackReason: resolvedInterpretation?.reason || 'interpretation-failed' };
  }
  return {
    packet: resolveSystemicQuestAction({ state: campaignState, packageData, turnId, playerInput, interpretation: resolvedInterpretation.interpretation, questId: quest.id, sourceAnchorRange: sceneSnapshot.sourceAnchorRange }),
    usedTacticalGraph: false,
    interpretation: resolvedInterpretation,
    fallbackReason: null
  };
}

function finalizeCoordinatedTurn({ campaignState, packageData, packet, turnId, sceneSnapshot, sceneSnapshotOverrides, usedTacticalGraph, interpretation, fallbackReason, continuityDirectorPacket = null }) {
  const quest = foreground(campaignState);
  const continuityProjection = compactContinuityDirectorPacket(continuityDirectorPacket);
  packet.contractVersion = 2;
  packet.sceneSnapshot = cloneJson(packet.sceneSnapshot || sceneSnapshot);
  packet.provenance = {
    ...(packet.provenance || {}),
    sourceAnchorRange: cloneJson(sceneSnapshot.sourceAnchorRange),
    sourceMessageIds: cloneJson(sceneSnapshot.sourceMessageIds || []),
    reconciliationRunId: sceneSnapshot.reconciliationRunId,
    replay: sceneSnapshot.replay === true,
    modelInterpretationUsed: interpretation?.interpretation?.provenance?.method === 'model-validated',
    continuityProjection: cloneJson(continuityProjection)
  };
  packet.stateDelta = packet.stateDelta || { outcomeId: packet.outcomePacket.id, mission: {} };
  packet.stateDelta.openWorld = {
    ...(packet.stateDelta.openWorld || {}),
    sourceAnchorRange: cloneJson(sceneSnapshot.sourceAnchorRange)
  };

  let projected = commitDirectorTurn(campaignState, packet);
  if (packet.systemicResolution) projected = applySystemicQuestProgress(projected, packet);
  const boundaryEvent = {
    id: `event.${packet.outcomePacket.id}`,
    type: completedByPacket(packet, sceneSnapshotOverrides) ? 'quest.resolved' : 'turn.outcome.committed',
    sourceQuestId: quest?.id || null,
    sourceOutcomeId: packet.outcomePacket.id,
    sourceAnchorRange: cloneJson(sceneSnapshot.sourceAnchorRange),
    sourceMessageIds: cloneJson(sceneSnapshot.sourceMessageIds || []),
    sourceRunId: sceneSnapshot.reconciliationRunId,
    stardate: projected.worldState?.currentStardate,
    playerFacingSummary: packet.outcomePacket.summary,
    payload: {
      resultBand: packet.outcomePacket.resultBand,
      systemicDisposition: packet.systemicResolution?.disposition || null,
      costs: cloneJson(packet.outcomePacket.costs || []),
      objectiveUpdates: cloneJson(packet.systemicResolution?.objectiveUpdates || [])
    }
  };

  let boundary;
  if (quest && completedByPacket(packet, sceneSnapshotOverrides)) {
    boundary = resolveQuestBoundary({
      state: projected,
      packageData,
      questId: quest.id,
      outcomeId: packet.outcomePacket.id,
      outcomeKey: sceneSnapshotOverrides.questResolution?.outcomeKey || packet.outcomePacket.questOutcomeKey || packet.systemicResolution?.outcome?.id || null,
      sourceAnchorRange: sceneSnapshot.sourceAnchorRange
    });
  } else {
    boundary = processWorldBoundary({ state: projected, packageData, event: boundaryEvent, boundaryType: sceneSnapshotOverrides.boundaryType || 'turn' });
  }
  projected = boundary.state;
  packet.commandBearingReviewPlan = planCommandBearingStateClosureReviews({
    commandBearing: projected.commandBearing,
    previousState: campaignState,
    currentState: projected,
    closureSignals: sceneSnapshotOverrides.closureSignals || sceneSnapshot.closureSignals || null
  });

  const previousStateDelta = packet.stateDelta || {};
  const { rootsSet: _legacyRootsSet, reducerBundle: _previousReducerBundle, ...previousOpenWorldDelta } = previousStateDelta.openWorld || {};
  const reducerBundle = createOpenWorldReducerBundle({
    beforeState: campaignState,
    afterState: projected,
    boundaryResult: boundary,
    sourceOutcomeId: packet.outcomePacket.id,
    sourceAnchorRange: sceneSnapshot.sourceAnchorRange,
    now: sceneSnapshotOverrides.now || null
  });
  packet.stateDelta = {
    outcomeId: packet.outcomePacket.id,
    terminalState: cloneJson(previousStateDelta.terminalState || {}),
    mission: cloneJson(previousStateDelta.mission || {}),
    commandBearing: cloneJson(previousStateDelta.commandBearing || {}),
    commandCulture: cloneJson(previousStateDelta.commandCulture || {}),
    relationships: cloneJson(previousStateDelta.relationships || {}),
    pressureLedger: cloneJson(previousStateDelta.pressureLedger || {}),
    openWorld: {
      ...previousOpenWorldDelta,
      reducerBundle,
      eventsCommitted: cloneJson((boundary.events || [boundary.event]).map((item) => item?.id).filter(Boolean)),
      questAvailabilityChanges: cloneJson(boundary.questAvailabilityChanges || []),
      milestoneChanges: cloneJson(boundary.milestoneChanges || {}),
      reactionCount: asArray(boundary.reactions).length,
      sourceAnchorRange: cloneJson(sceneSnapshot.sourceAnchorRange)
    }
  };
  packet.narratorPacket = {
    ...(packet.narratorPacket || {}),
    constraints: [
      ...asArray(packet.narratorPacket?.constraints),
      'Directive campaign state is authoritative; narration may not change the committed result.',
      'Treat source-anchor provenance as audit metadata and never expose it in-character.'
    ]
  };
  return {
    turnPacket: packet,
    projectedState: projected,
    diagnostics: {
      usedTacticalGraph,
      usedSystemicResolver: Boolean(packet.systemicResolution),
      actionInterpretationMethod: interpretation?.interpretation?.provenance?.method || null,
      fallbackReason,
      continuityProjection: cloneJson(continuityProjection),
      sourceAnchorRangeHash: sceneSnapshot.sourceAnchorRange?.rangeHash || null,
      boundaryDiagnostics: cloneJson(boundary.diagnostics || null),
      reactionErrors: cloneJson(boundary.errors || [])
    }
  };
}

export function createDirectorCoordinatorTurn({
  campaignState,
  packageData,
  graph = null,
  projection,
  crewDataset,
  shipDataset,
  graphPath = null,
  projectionPath = null,
  turnId,
  playerInput,
  sceneSnapshotOverrides = {},
  actionInterpretation = null,
  arbiterPlan = null,
  coreRecallEntries = []
} = {}) {
  if (!campaignState || !packageData || !turnId || !text(playerInput)) throw new Error('campaignState, packageData, turnId, and playerInput are required.');
  const sceneSnapshot = buildOpenWorldSceneSnapshot(campaignState, packageData, playerInput, sceneSnapshotOverrides);
  const continuityDirectorPacket = buildContinuityDirectorPacket({
    audience: 'missionDirector',
    campaignState,
    packageData,
    crewDataset,
    shipDataset,
    campaignProjection: projection,
    scene: {
      activePhaseId: sceneSnapshot.activePhaseId,
      presentCharacterIds: sceneSnapshot.presentCharacters,
      locationId: sceneSnapshot.locationId
    },
    playerText: playerInput
  });
  const quest = foreground(campaignState);
  const generatedGraph = graph || (quest ? missionGraphForQuest(packageData, quest.templateId || quest.id, campaignState) : null);
  const validatedInterpretation = actionInterpretation
    ? validateQuestActionInterpretation(actionInterpretation, { state: campaignState, packageData, questId: quest?.id, playerInput, sourceAnchorRange: sceneSnapshot.sourceAnchorRange })
    : null;
  const resolved = runTacticalOrSystemic({ campaignState, packageData, graph: generatedGraph, projection, crewDataset, shipDataset, graphPath, projectionPath, turnId, playerInput, sceneSnapshot, interpretation: validatedInterpretation, continuityDirectorPacket, arbiterPlan, coreRecallEntries });
  return finalizeCoordinatedTurn({ campaignState, packageData, packet: resolved.packet, turnId, sceneSnapshot, sceneSnapshotOverrides, usedTacticalGraph: resolved.usedTacticalGraph, interpretation: resolved.interpretation, fallbackReason: resolved.fallbackReason, continuityDirectorPacket });
}

/** Async variant used by chat-native runtime. The model only interprets the
 * player's language; deterministic code still resolves capability and outcome. */
export async function createDirectorCoordinatorTurnAsync({ generationRouter = null, ...options } = {}) {
  const sceneSnapshot = buildOpenWorldSceneSnapshot(options.campaignState, options.packageData, options.playerInput, options.sceneSnapshotOverrides || {});
  const quest = foreground(options.campaignState);
  if (!quest || options.graph && hasTacticalGraph(options.graph)) return createDirectorCoordinatorTurn(options);
  const interpretation = await interpretQuestActionWithModel({
    generationRouter,
    playerInput: options.playerInput,
    state: options.campaignState,
    packageData: options.packageData,
    questId: quest.id,
    sourceAnchorRange: sceneSnapshot.sourceAnchorRange
  });
  return createDirectorCoordinatorTurn({ ...options, actionInterpretation: interpretation.interpretation });
}

export const __openWorldTurnCoordinatorTestHooks = Object.freeze({ foreground, completedByPacket, hasTacticalGraph, openOperationsPacket });
