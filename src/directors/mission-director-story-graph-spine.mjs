import { hashStableJson } from '../runtime/architecture-redesign-contracts.mjs';
import { buildStoryContextIndex, deriveStoryPositionCandidates } from '../story/story-context-index.mjs';
import {
  normalizeStoryDeltaPlan,
  normalizeStoryDeltaReview,
  normalizeStoryPositionReview,
  normalizeStoryPositionSelection
} from '../story/story-position-contracts.mjs';

function extractData(result = {}) {
  const response = result.response || result;
  if (response.content && typeof response.content === 'object') return response.content;
  if (response.data && typeof response.data === 'object') return response.data;
  const text = response.text || response.content || response.raw?.text || '';
  if (typeof text === 'string' && text.trim()) return JSON.parse(text);
  return null;
}

async function generateJson(generationRouter, roleId, request) {
  if (typeof generationRouter?.generate !== 'function') return { ok: false, error: { code: 'generation_router_missing' } };
  try {
    const result = await generationRouter.generate(roleId, request);
    if (!result?.ok) return { ok: false, error: result?.error || { code: 'provider_failed' } };
    return { ok: true, value: extractData(result) };
  } catch (error) {
    return { ok: false, error: { code: error?.code || 'provider_exception', message: error?.message || String(error) } };
  }
}

export function buildMissionStoryGraphContext({
  sourceHash,
  campaignState,
  packageData,
  missionGraph,
  sourceFrameRef = null,
  branchId = 'main'
} = {}) {
  const storyContextIndex = buildStoryContextIndex({ campaignState, packageData, missionGraph, sourceFrameRef, branchId });
  const storyCandidates = deriveStoryPositionCandidates({ storyContextIndex });
  return {
    sourceHash,
    storyContextIndex,
    storyCandidates,
    candidateIds: storyCandidates.map((candidate) => candidate.id)
  };
}

export async function runMissionDirectorStoryPositionSelection({
  generationRouter,
  sourceHash,
  campaignState,
  packageData,
  missionGraph,
  sourceFrameRef = null,
  branchId = 'main'
} = {}) {
  const context = buildMissionStoryGraphContext({ sourceHash, campaignState, packageData, missionGraph, sourceFrameRef, branchId });
  const selectionRaw = await generateJson(generationRouter, 'missionDirectorStoryPositioner', {
    lane: 'utility',
    sourceHash,
    context,
    responseFormat: 'json'
  });
  if (!selectionRaw.ok) return { ok: false, diagnostics: { stage: 'storyPositioner', error: selectionRaw.error }, ...context };
  const selection = normalizeStoryPositionSelection(selectionRaw.value, {
    sourceHash,
    candidateIds: context.candidateIds
  });
  if (!selection.ok) return { ok: false, diagnostics: { stage: 'storyPositionSelectionValidation', error: selection.error }, ...context };
  const selectionHash = hashStableJson(selection.value);
  const reviewRaw = await generateJson(generationRouter, 'missionDirectorStoryPositionReviewer', {
    lane: 'utility',
    sourceHash,
    context: { ...context, selection: selection.value, selectionHash },
    responseFormat: 'json'
  });
  if (!reviewRaw.ok) return { ok: false, selection: selection.value, selectionHash, diagnostics: { stage: 'storyPositionReviewer', error: reviewRaw.error }, ...context };
  const selectionReview = normalizeStoryPositionReview(reviewRaw.value, { sourceHash, selectionHash });
  if (!selectionReview.ok || !selectionReview.value.approved) {
    return {
      ok: false,
      selection: selection.value,
      selectionHash,
      selectionReview: selectionReview.value || null,
      diagnostics: { stage: 'storyPositionReviewValidation', error: selectionReview.error },
      ...context
    };
  }
  return {
    ok: true,
    selection: selection.value,
    selectionHash,
    selectionReview: selectionReview.value,
    ...context
  };
}

export async function runMissionDirectorStoryDeltaSpine({
  generationRouter,
  sourceHash,
  storyContextIndex,
  storyCandidates,
  selection,
  selectionHash,
  outcomePlanHash = ''
} = {}) {
  const context = {
    sourceHash,
    storyContextIndex,
    storyCandidates,
    selection,
    selectionHash,
    outcomePlanHash
  };
  const knownNodeIds = (storyContextIndex?.graph?.nodes || []).map((node) => node.id);
  const knownFactIds = storyContextIndex?.knownFactIds || [];
  const knownThreadIds = storyCandidates.map((candidate) => candidate.coordinates?.threadId).filter(Boolean);
  const deltaRaw = await generateJson(generationRouter, 'missionDirectorStoryDeltaPlanner', {
    lane: 'reasoning',
    sourceHash,
    context,
    responseFormat: 'json'
  });
  if (!deltaRaw.ok) return { ok: false, diagnostics: { stage: 'storyDeltaPlanner', error: deltaRaw.error } };
  const deltaPlan = normalizeStoryDeltaPlan(deltaRaw.value, {
    sourceHash,
    selectionHash,
    outcomePlanHash,
    knownNodeIds,
    knownFactIds,
    knownThreadIds
  });
  if (!deltaPlan.ok) return { ok: false, diagnostics: { stage: 'storyDeltaPlanValidation', error: deltaPlan.error } };
  const deltaPlanHash = hashStableJson(deltaPlan.value);
  const deltaReviewRaw = await generateJson(generationRouter, 'missionDirectorStoryDeltaReviewer', {
    lane: 'utility',
    sourceHash,
    context: { ...context, deltaPlan: deltaPlan.value, deltaPlanHash },
    responseFormat: 'json'
  });
  if (!deltaReviewRaw.ok) return { ok: false, deltaPlan: deltaPlan.value, deltaPlanHash, diagnostics: { stage: 'storyDeltaReviewer', error: deltaReviewRaw.error } };
  const deltaReview = normalizeStoryDeltaReview(deltaReviewRaw.value, { sourceHash, deltaPlanHash });
  if (!deltaReview.ok || !deltaReview.value.approved) {
    return {
      ok: false,
      deltaPlan: deltaPlan.value,
      deltaPlanHash,
      deltaReview: deltaReview.value || null,
      diagnostics: { stage: 'storyDeltaReviewValidation', error: deltaReview.error }
    };
  }
  return {
    ok: true,
    deltaPlan: deltaPlan.value,
    deltaPlanHash,
    deltaReview: deltaReview.value
  };
}

export async function runMissionDirectorStoryGraphSpine(options = {}) {
  const selectionResult = await runMissionDirectorStoryPositionSelection(options);
  if (!selectionResult.ok) return selectionResult;
  const deltaResult = await runMissionDirectorStoryDeltaSpine({
    generationRouter: options.generationRouter,
    sourceHash: options.sourceHash,
    storyContextIndex: selectionResult.storyContextIndex,
    storyCandidates: selectionResult.storyCandidates,
    selection: selectionResult.selection,
    selectionHash: selectionResult.selectionHash,
    outcomePlanHash: options.outcomePlanHash
  });
  if (!deltaResult.ok) {
    return {
      ok: false,
      selection: selectionResult.selection,
      selectionReview: selectionResult.selectionReview,
      storyContextIndex: selectionResult.storyContextIndex,
      storyCandidates: selectionResult.storyCandidates,
      diagnostics: deltaResult.diagnostics
    };
  }
  return {
    ok: true,
    selection: selectionResult.selection,
    selectionReview: selectionResult.selectionReview,
    deltaPlan: deltaResult.deltaPlan,
    deltaReview: deltaResult.deltaReview,
    storyContextIndex: selectionResult.storyContextIndex,
    storyCandidates: selectionResult.storyCandidates,
    hashes: {
      selectionHash: selectionResult.selectionHash,
      deltaPlanHash: deltaResult.deltaPlanHash,
      indexHash: selectionResult.storyContextIndex.indexHash
    },
    diagnostics: {
      selectedCandidateIds: [
        selectionResult.selection.primaryCandidateId,
        ...selectionResult.selection.secondaryCandidateIds
      ]
    }
  };
}
