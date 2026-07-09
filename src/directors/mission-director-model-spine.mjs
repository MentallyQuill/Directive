import { buildMissionDirectorFrame } from './mission-director-frame.mjs';
import {
  MISSION_STORY_POSITION_KIND,
  normalizeMissionDirectorPlanReview,
  normalizeMissionOutcomePlan,
  normalizeMissionStoryPosition
} from './mission-director-model-contracts.mjs';
import {
  runMissionDirectorStoryDeltaSpine,
  runMissionDirectorStoryPositionSelection
} from './mission-director-story-graph-spine.mjs';
import { hashStableJson } from '../runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function extractData(result = {}) {
  const response = result.response || result;
  if (response.content && typeof response.content === 'object') return response.content;
  if (response.data && typeof response.data === 'object') return response.data;
  const text = response.text || response.content || response.raw?.text || '';
  if (typeof text === 'string' && text.trim()) return JSON.parse(text);
  return null;
}

async function generateJson(generationRouter, roleId, request) {
  if (!generationRouter || typeof generationRouter.generate !== 'function') {
    return { ok: false, error: { code: 'generation_router_missing' } };
  }
  try {
    const result = await generationRouter.generate(roleId, request);
    if (!result?.ok) return { ok: false, error: result?.error || { code: 'provider_failed' } };
    return { ok: true, value: extractData(result), error: null };
  } catch (error) {
    return { ok: false, error: { code: error?.code || 'provider_exception', message: error?.message || String(error) } };
  }
}

function selectedCandidateFromGraph(storyGraph = {}) {
  const primary = storyGraph.selection?.primaryCandidateId || '';
  return (storyGraph.storyCandidates || []).find((candidate) => candidate.id === primary) || null;
}

function storyPositionFromSelection({ sourceHash, storyGraph, frameResult }) {
  const candidate = selectedCandidateFromGraph(storyGraph) || {};
  const storyMap = frameResult?.frame?.packageStoryMap || {};
  const phase = (storyMap.phases || []).find((item) => item.id === candidate.coordinates?.phaseId) || null;
  const decisions = (storyMap.decisionPoints || []).filter((item) => item.phaseId === candidate.coordinates?.phaseId);
  const outcomes = (storyMap.outcomeOptions || []).filter((item) => !item.phaseId || item.phaseId === candidate.coordinates?.phaseId);
  return normalizeMissionStoryPosition({
    kind: MISSION_STORY_POSITION_KIND,
    schemaVersion: 1,
    sourceHash,
    confidence: storyGraph.selection?.confidence ?? 0,
    storyPosition: {
      contextType: candidate.candidateType || 'story_graph_candidate',
      missionId: candidate.coordinates?.missionId || frameResult?.frame?.currentStoryState?.activeMissionId || '',
      questId: frameResult?.frame?.currentStoryState?.foregroundQuestId || candidate.coordinates?.missionId || '',
      phaseId: candidate.coordinates?.phaseId || frameResult?.frame?.currentStoryState?.activePhaseId || '',
      locationId: candidate.coordinates?.locationId || frameResult?.frame?.currentStoryState?.locationId || '',
      anchorId: candidate.nodeId || candidate.id || '',
      anchorFrom: '',
      anchorTo: '',
      arc: '',
      phase: phase?.label || candidate.nodeId || '',
      currentConversation: candidate.label || candidate.nodeId || ''
    },
    sceneContinuity: {
      mustPreserve: storyGraph.selection?.continuityGuards?.mustPreserve || [],
      mustNotReestablish: storyGraph.selection?.continuityGuards?.mustNotReestablish || []
    },
    outcomeRelevance: {
      route: storyGraph.selection?.route || 'pause',
      reason: `Model selected story candidate ${candidate.id || 'unknown'}.`,
      activeDecisionIds: decisions.map((item) => item.id).filter(Boolean),
      candidateOutcomeIds: outcomes.map((item) => item.id).filter(Boolean),
      requiresClarification: storyGraph.selection?.route === 'clarify'
    },
    sourceUse: {
      evidenceRefs: storyGraph.selection?.evidenceRefs || [],
      ignoredStaleSetup: storyGraph.selection?.ignoredStaleSetup || [],
      uncertainties: storyGraph.selection?.unresolved || []
    }
  }, { expectedSourceHash: sourceHash });
}

export function buildTurnPacketFromOutcomePlan({ turnId, sceneSnapshot = {}, storyPosition, outcomePlan, review, storyGraph = null }) {
  const outcomeId = `outcome.${String(turnId || 'mission-model').replace(/^turn\./, '')}`;
  const summary = compact(outcomePlan.outcomeSummary) || 'Mission Director outcome plan accepted.';
  const selectedCandidateIds = storyGraph?.selection
    ? [storyGraph.selection.primaryCandidateId, ...(storyGraph.selection.secondaryCandidateIds || [])].filter(Boolean)
    : [];
  return {
    contractVersion: 2,
    turnId,
    sceneSnapshot: cloneJson(sceneSnapshot),
    modelStoryPosition: cloneJson(storyPosition),
    modelPlanReview: cloneJson(review),
    intentParse: {
      summary,
      primaryIntent: 'model-authored-mission-outcome',
      targetIds: [],
      declaredMethod: summary,
      assumptions: [],
      signals: { modelAuthored: true }
    },
    actionClassification: {
      category: 'modelAuthoredMissionOutcome',
      reason: storyPosition.outcomeRelevance?.reason || 'Mission Director model spine selected outcome.'
    },
    authorityCapabilityCheck: {
      result: 'model-reviewed-custody-pending',
      authority: { result: 'model-reviewed', basis: [] },
      capability: { result: 'model-reviewed', basis: [] },
      constraints: []
    },
    directorResponse: {
      usedDecisionPointIds: cloneJson(storyPosition.outcomeRelevance?.activeDecisionIds || []),
      usedFactIds: cloneJson(outcomePlan.consequencePlan?.revealedFactIds || []),
      usedClockIds: [],
      usedPressureIds: [],
      primaryPressureIds: [],
      secondaryPressureIds: [],
      commandDecisionCandidates: cloneJson(outcomePlan.consequencePlan?.commandDecisionAwards || []),
      focusBudget: { primaryPressureMax: 1, secondaryPressureMax: 1, relationshipBeatMax: 1 },
      responseSummary: summary
    },
    outcomePacket: {
      id: outcomeId,
      resultBand: outcomePlan.resultBand,
      summary,
      costs: cloneJson(outcomePlan.consequencePlan?.costs || []),
      revealedFactIds: cloneJson(outcomePlan.consequencePlan?.revealedFactIds || []),
      commandDecisionAwards: cloneJson(outcomePlan.consequencePlan?.commandDecisionAwards || []),
      questCompleted: outcomePlan.consequencePlan?.completionRecommendation === 'completeQuest'
    },
    competencePacket: {
      sourceOutcomeId: outcomeId,
      assumedActions: [],
      proceduralWarnings: cloneJson(outcomePlan.diagnostics?.uncertainties || []),
      authorityNotes: [],
      counselRequests: [],
      noGotchaPolicyApplied: true
    },
    stateDelta: {
      outcomeId,
      mission: {},
      openWorld: {
        sourceAnchorRange: cloneJson(sceneSnapshot.sourceAnchorRange || null),
        modelStateProposal: cloneJson(outcomePlan.stateProposal || null),
        modelStoryDeltaPlan: cloneJson(storyGraph?.deltaPlan || null)
      }
    },
    narratorPacket: {
      sourceOutcomeId: outcomeId,
      resultBand: outcomePlan.resultBand,
      summary,
      constraints: [
        ...cloneJson(outcomePlan.narrationPlan?.constraints || []),
        'Do not reestablish completed story nodes as pending unless the turn is an authorized rerun branch.'
      ],
      allowedFacts: cloneJson(outcomePlan.narrationPlan?.allowedFacts || []),
      forbiddenFacts: cloneJson(outcomePlan.narrationPlan?.forbiddenFacts || []),
      mustPreserve: cloneJson(outcomePlan.narrationPlan?.mustPreserve || []),
      mustNotReestablish: cloneJson(outcomePlan.narrationPlan?.mustNotReestablish || [])
    },
    commandLogPacket: {
      sourceOutcomeId: outcomeId,
      summaryInputs: [summary],
      visibleConsequences: cloneJson(outcomePlan.consequencePlan?.costs || [])
    },
    provenance: {
      modelSpine: true,
      storyPositionHash: hashStableJson(storyPosition),
      outcomePlanHash: hashStableJson(outcomePlan),
      reviewHash: hashStableJson(review),
      storyGraph: storyGraph
        ? {
            indexHash: storyGraph.storyContextIndex?.indexHash || storyGraph.hashes?.indexHash || null,
            selectedCandidateIds,
            selectionHash: storyGraph.selectionHash || storyGraph.hashes?.selectionHash || null,
            deltaPlanHash: storyGraph.deltaPlanHash || storyGraph.hashes?.deltaPlanHash || null
          }
        : null
    }
  };
}

export async function runMissionDirectorModelSpine(options = {}) {
  const {
    generationRouter,
    turnId,
    sceneSnapshot = {}
  } = options;
  const frameResult = buildMissionDirectorFrame(options);
  const sourceHash = frameResult.sourceHash;
  const storyGraphSelection = await runMissionDirectorStoryPositionSelection({
    generationRouter,
    sourceHash,
    campaignState: options.campaignState,
    packageData: options.packageData,
    missionGraph: options.graph || frameResult.frame.packageStoryMap,
    sourceFrameRef: options.sourceFrameRef || null,
    branchId: options.campaignState?.campaignChatBinding?.saveId || 'main'
  });
  if (!storyGraphSelection.ok) return { ok: false, route: 'pause', turnPacket: null, diagnostics: { stage: 'storyGraphSelection', error: storyGraphSelection.diagnostics } };
  const story = storyPositionFromSelection({ sourceHash, storyGraph: storyGraphSelection, frameResult });
  if (!story.ok) return { ok: false, route: 'pause', turnPacket: null, diagnostics: { stage: 'storyGraphSelectionAdapter', error: story.error } };
  if (story.value.outcomeRelevance.route !== 'outcome') {
    return {
      ok: true,
      route: story.value.outcomeRelevance.route,
      storyPosition: story.value,
      storyGraph: storyGraphSelection,
      outcomePlan: null,
      review: null,
      turnPacket: null,
      diagnostics: { sourceHash, storyGraph: storyGraphSelection.diagnostics }
    };
  }
  const storyPositionHash = hashStableJson(story.value);
  const outcomeRaw = await generateJson(generationRouter, 'missionDirectorOutcomePlanner', {
    lane: 'reasoning',
    sourceHash,
    context: { ...frameResult, sourceHash, storyPosition: story.value, storyPositionHash },
    responseFormat: 'json'
  });
  if (!outcomeRaw.ok) return { ok: false, route: 'pause', storyPosition: story.value, turnPacket: null, diagnostics: { stage: 'outcomePlanner', error: outcomeRaw.error } };
  const outcome = normalizeMissionOutcomePlan(outcomeRaw.value, {
    expectedSourceHash: sourceHash,
    expectedStoryPositionHash: storyPositionHash,
    allowedRoots: frameResult.allowedRoots,
    allowedFactIds: frameResult.allowedFactIds,
    allowedDecisionIds: frameResult.allowedDecisionIds
  });
  if (!outcome.ok) return { ok: false, route: 'pause', storyPosition: story.value, turnPacket: null, diagnostics: { stage: 'outcomePlannerValidation', error: outcome.error } };
  const outcomePlanHash = hashStableJson(outcome.value);
  const storyDelta = await runMissionDirectorStoryDeltaSpine({
    generationRouter,
    sourceHash,
    storyContextIndex: storyGraphSelection.storyContextIndex,
    storyCandidates: storyGraphSelection.storyCandidates,
    selection: storyGraphSelection.selection,
    selectionHash: storyGraphSelection.selectionHash,
    outcomePlanHash
  });
  if (!storyDelta.ok) return { ok: false, route: 'pause', storyPosition: story.value, outcomePlan: outcome.value, turnPacket: null, diagnostics: { stage: 'storyGraphDelta', error: storyDelta.diagnostics } };
  const storyGraph = {
    ...storyGraphSelection,
    deltaPlan: storyDelta.deltaPlan,
    deltaReview: storyDelta.deltaReview,
    deltaPlanHash: storyDelta.deltaPlanHash
  };
  const reviewRaw = await generateJson(generationRouter, 'missionDirectorPlanReviewer', {
    lane: 'utility',
    sourceHash,
    context: { sourceHash, storyPosition: story.value, storyPositionHash, outcomePlan: outcome.value, outcomePlanHash },
    responseFormat: 'json'
  });
  if (!reviewRaw.ok) return { ok: false, route: 'pause', storyPosition: story.value, outcomePlan: outcome.value, turnPacket: null, diagnostics: { stage: 'reviewer', error: reviewRaw.error } };
  const review = normalizeMissionDirectorPlanReview(reviewRaw.value, { expectedSourceHash: sourceHash, expectedStoryPositionHash: storyPositionHash, expectedOutcomePlanHash: outcomePlanHash });
  if (!review.ok || !review.value.approved || review.value.requiredAction !== 'approve') {
    return { ok: false, route: review.value?.requiredAction || 'pause', storyPosition: story.value, outcomePlan: outcome.value, review: review.value || null, turnPacket: null, diagnostics: { stage: 'reviewerValidation', error: review.error } };
  }
  const turnPacket = buildTurnPacketFromOutcomePlan({ turnId, sceneSnapshot, storyPosition: story.value, outcomePlan: outcome.value, review: review.value, storyGraph });
  return {
    ok: true,
    route: 'outcome',
    storyPosition: story.value,
    storyGraph,
    outcomePlan: outcome.value,
    review: review.value,
    turnPacket,
    diagnostics: { sourceHash, storyPositionHash, outcomePlanHash }
  };
}
