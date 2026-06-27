import { assertHostPromptBlockSafeForInjection } from '../generation/prompt-injection-safety.mjs';
import {
  CONTINUITY_VISIBILITY,
  asArray,
  cloneJson,
  compact,
  hashContinuityText
} from './fact-schema.mjs';
import { buildContinuityFactIndex } from './fact-index.mjs';
import { DIRECTIVE_STATIC_PROMPT_KEYS, CONTINUITY_PROMPT_LANES } from './prompt-keys.mjs';
import { buildContinuitySourceFrame } from './source-frame.mjs';
import { activeContinuityProjectionHints } from './projection-hints.mjs';
import { continuityProjectionPolicyHash } from './projection-cache.mjs';
import {
  buildDeterministicContinuityProjectionPlan,
  defaultContinuityLaneForFact,
  validateContinuityProjectionPlan
} from './projection-plan-validator.mjs';

const ROLE = 'system';

function revisionOf(campaignState) {
  return Number(campaignState?.runtimeTracking?.revision ?? campaignState?.turnLedger?.entries?.length ?? 0) || 0;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function source(campaignState, id, sourceHash) {
  return {
    kind: 'directive.continuityProjectionMatrix',
    id: `${campaignState?.campaign?.id || 'campaign'}:${id}:${sourceHash || 'source'}`,
    revision: revisionOf(campaignState)
  };
}

function lineForFact(fact) {
  return compact(fact?.render?.narrator || fact?.summary || fact?.id);
}

function activeSceneLines(sourceFrame, campaignState, packageData, scene = {}) {
  const mission = campaignState?.mission || {};
  const lines = [
    `Location id: ${sourceFrame.locationId || 'unknown'}`,
    `Active mission: ${mission.activeMissionId || mission.activeMissionGraphId || 'unknown'}`,
    `Active phase: ${sourceFrame.activePhaseId || mission.activePhaseId || mission.phase || 'unknown'}`,
    scene.currentQuestion ? `Current question: ${compact(scene.currentQuestion)}` : null,
    scene.immediateStakes ? `Immediate stakes: ${compact(scene.immediateStakes)}` : null
  ];
  const present = scene.presentCharacterIds || scene.presentCharacters || scene.presentActorIds || [];
  if (present.length) lines.push(`Present or directly relevant: ${present.join(', ')}`);
  const location = asArray(packageData?.world?.locations).find((entry) => entry.id === sourceFrame.locationId);
  if (location) lines.push(`${location.name || location.id}: ${compact(location.playerSafeSummary || location.playerSummary || location.summary)}`);
  return lines.filter(Boolean);
}

function buildLaneContent({
  lane,
  factIndex,
  plan,
  sourceFrame,
  campaignState,
  packageData,
  scene
}) {
  if (lane.promptKey === 'directive.contract') {
    return [
      'Directive continuity contract:',
      '- Treat the supplied continuity facts as higher priority than generic genre defaults.',
      '- Do not infer missing demographics, locations, travel times, or relationships when a supplied fact covers them.',
      '- Generated prose is not a source of truth until committed and validated.',
      '- Do not reveal director-only or hidden state.'
    ].join('\n');
  }
  if (lane.promptKey === 'directive.scene.active') {
    return activeSceneLines(sourceFrame, campaignState, packageData, scene).map((line) => `- ${line}`).join('\n');
  }
  const target = lane.promptKey === 'directive.continuity.invariants'
    ? 'invariants'
    : (lane.promptKey === 'directive.continuity.domain'
      ? 'domain'
      : (lane.promptKey === 'directive.recap.committed' ? 'recap' : 'revolving'));
  const factById = new Map(factIndex.facts.map((fact) => [fact.id, fact]));
  const plannedFactIds = new Set(asArray(plan?.laneFactIds?.[lane.promptKey]));
  const lines = factIndex.facts
    .filter((fact) => plannedFactIds.has(fact.id))
    .map((fact) => factById.get(fact.id) || fact)
    .slice(0, target === 'invariants' ? 24 : 18)
    .map(lineForFact)
    .filter(Boolean);
  if (lane.promptKey === 'directive.recap.committed' && !lines.length) {
    return '- No committed recap entries beyond campaign initialization.';
  }
  return lines.length ? lines.map((line) => `- ${line}`).join('\n') : '- No additional continuity facts selected for this lane.';
}

function createLaneBlock({
  lane,
  content,
  campaignState,
  sourceHash,
  sourceIds = []
}) {
  const normalized = assertHostPromptBlockSafeForInjection({
    id: lane.id,
    title: lane.title,
    audience: 'narratorSafe',
    source: source(campaignState, lane.id, sourceHash),
    priority: lane.priority,
    content,
    placement: lane.placement,
    depth: lane.depth,
    role: ROLE,
    safety: {
      rawHiddenValuesExposed: false,
      directorOnlyDataIncluded: false,
      playerVisible: true
    }
  });
  return {
    ...normalized,
    promptKey: lane.promptKey,
    content: normalized.text,
    placement: lane.placement,
    depth: lane.depth,
    role: ROLE,
    ttl: lane.ttl,
    sourceHash,
    sourceIds,
    tokenEstimate: estimateTokens(normalized.text),
    hash: hashContinuityText({ promptKey: lane.promptKey, content: normalized.text }),
    contentHash: hashContinuityText(normalized.text)
  };
}

export function buildContinuityProjectionMatrix({
  campaignState,
  packageData = null,
  crewDataset = null,
  campaignProjection = null,
  scene = {},
  playerText = '',
  recentMessageSummary = '',
  recentChatMessages = [],
  acceptedAssistantVariant = null,
  projectionPlan = null,
  projectionPlannerContext = null,
  projectionPlannerResult = null,
  projectionFallbackReason = null,
  projectionHints = null,
  createdAt = null
} = {}) {
  if (!campaignState || typeof campaignState !== 'object') throw new Error('campaignState must be an object.');
  const sourceFrame = buildContinuitySourceFrame({
    campaignState,
    packageData,
    crewDataset,
    campaignProjection,
    scene,
    playerText,
    recentMessageSummary,
    recentChatMessages,
    acceptedAssistantVariant
  });
  const factIndex = buildContinuityFactIndex({
    campaignState,
    packageData,
    crewDataset,
    campaignProjection,
    audience: CONTINUITY_VISIBILITY.narratorSafe
  });
  const activeHints = projectionHints || activeContinuityProjectionHints(campaignState);
  const deterministicPlan = buildDeterministicContinuityProjectionPlan({
    factIndex,
    projectionHints: activeHints,
    sourceFrame,
    reason: projectionFallbackReason || 'deterministic-floor'
  });
  const plan = validateContinuityProjectionPlan(projectionPlan || deterministicPlan, {
    factIndex,
    projectionHints: activeHints,
    sourceFrame,
    candidateFactIds: projectionPlannerContext?.candidateFactIds || null,
    hardFloorFactIds: projectionPlannerContext?.hardFloorFactIds || null,
    fallbackReason: projectionPlan ? null : (projectionFallbackReason || 'deterministic-floor')
  });
  const plannerMode = projectionPlannerResult
    ? (projectionPlan ? 'utilityAssisted' : 'utilityFallback')
    : (projectionPlan ? 'externalPlan' : 'localOnly');
  const policyHash = continuityProjectionPolicyHash({
    staticPromptKeys: DIRECTIVE_STATIC_PROMPT_KEYS,
    projectionHints: activeHints,
    plannerMode
  });
  const blocks = CONTINUITY_PROMPT_LANES.map((lane) => createLaneBlock({
    lane,
    content: buildLaneContent({ lane, factIndex, plan, sourceFrame, campaignState, packageData, scene }),
    campaignState,
    sourceHash: sourceFrame.sourceHash,
    sourceIds: asArray(plan.laneFactIds?.[lane.promptKey])
  }));
  const text = blocks.map((block) => `[Directive: ${block.title}]\n${block.content}`).join('\n\n');
  return {
    kind: 'directive.continuityProjectionMatrix.v1',
    createdAt,
    sourceFrame,
    factIndex: {
      sourceCount: factIndex.sourceCount,
      acceptedCount: factIndex.acceptedCount,
      conflicts: cloneJson(factIndex.conflicts),
      rejected: cloneJson(factIndex.rejected)
    },
    staticPromptKeys: [...DIRECTIVE_STATIC_PROMPT_KEYS],
    blocks,
    omitted: cloneJson(plan.omitted),
    plan,
    planner: projectionPlannerResult ? {
      status: projectionPlan ? 'accepted' : 'fallback',
      ok: projectionPlannerResult.ok === true,
      skipped: projectionPlannerResult.skipped === true,
      fallbackReason: projectionPlannerResult.fallbackReason || null,
      requestHash: projectionPlannerResult.request?.requestHash || null,
      candidateFactCount: projectionPlannerResult.request?.candidateFacts?.length ?? null,
      repairedJson: projectionPlannerResult.repairedJson === true,
      diagnostics: cloneJson(projectionPlannerResult.diagnostics || null),
      error: cloneJson(projectionPlannerResult.error || null)
    } : null,
    projectionHints: activeHints.map((hint) => ({
      id: hint.id,
      factId: hint.factId,
      mode: hint.mode,
      force: hint.force,
      minimumLane: hint.minimumLane,
      expiresRevision: hint.expiresRevision
    })),
    policyHash,
    text,
    hash: hashContinuityText(text),
    contentHash: hashContinuityText(text),
    audit: {
      blockCount: blocks.length,
      factCount: factIndex.acceptedCount,
      conflictCount: factIndex.conflicts.length,
      rejectedCount: factIndex.rejected.length,
      selectedFactCount: plan.selectedFactIds.length,
      omittedFactCount: plan.omitted.length,
      validatorRejectionCount: plan.rejections.length
    }
  };
}

export const __continuityProjectionMatrixTestHooks = Object.freeze({
  classifyFact: defaultContinuityLaneForFact,
  activeSceneLines
});
