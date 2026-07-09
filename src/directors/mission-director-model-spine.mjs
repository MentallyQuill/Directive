import { buildMissionDirectorFrame } from './mission-director-frame.mjs';
import {
  normalizeMissionDirectorPlanReview,
  normalizeMissionOutcomePlan,
  normalizeMissionStoryPosition
} from './mission-director-model-contracts.mjs';
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

export function buildTurnPacketFromOutcomePlan({ turnId, sceneSnapshot = {}, storyPosition, outcomePlan, review }) {
  const outcomeId = `outcome.${String(turnId || 'mission-model').replace(/^turn\./, '')}`;
  const summary = compact(outcomePlan.outcomeSummary) || 'Mission Director outcome plan accepted.';
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
        modelStateProposal: cloneJson(outcomePlan.stateProposal || null)
      }
    },
    narratorPacket: {
      sourceOutcomeId: outcomeId,
      resultBand: outcomePlan.resultBand,
      summary,
      constraints: cloneJson(outcomePlan.narrationPlan?.constraints || []),
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
      reviewHash: hashStableJson(review)
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
  const storyRaw = await generateJson(generationRouter, 'missionDirectorStoryPositioner', {
    lane: 'utility',
    sourceHash,
    context: { ...frameResult, sourceHash },
    responseFormat: 'json'
  });
  if (!storyRaw.ok) return { ok: false, route: 'pause', turnPacket: null, diagnostics: { stage: 'storyPositioner', error: storyRaw.error } };
  const story = normalizeMissionStoryPosition(storyRaw.value, { expectedSourceHash: sourceHash });
  if (!story.ok) return { ok: false, route: 'pause', turnPacket: null, diagnostics: { stage: 'storyPositionerValidation', error: story.error } };
  if (story.value.outcomeRelevance.route !== 'outcome') {
    return { ok: true, route: story.value.outcomeRelevance.route, storyPosition: story.value, outcomePlan: null, review: null, turnPacket: null, diagnostics: { sourceHash } };
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
  const turnPacket = buildTurnPacketFromOutcomePlan({ turnId, sceneSnapshot, storyPosition: story.value, outcomePlan: outcome.value, review: review.value });
  return {
    ok: true,
    route: 'outcome',
    storyPosition: story.value,
    outcomePlan: outcome.value,
    review: review.value,
    turnPacket,
    diagnostics: { sourceHash, storyPositionHash, outcomePlanHash }
  };
}
