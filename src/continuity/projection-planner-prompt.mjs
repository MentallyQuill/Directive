import {
  CONTINUITY_VISIBILITY,
  asArray,
  cloneJson,
  compact,
  hashContinuityText
} from './fact-schema.mjs';
import { CONTINUITY_PROMPT_LANES } from './prompt-keys.mjs';
import { defaultContinuityLaneForFact } from './projection-plan-validator.mjs';

export const CONTINUITY_PLANNER_REQUEST_KIND = 'directive.continuityProjectionPlannerRequest.v1';

const FACT_LANE_KEYS = Object.freeze([
  'directive.continuity.invariants',
  'directive.continuity.domain',
  'directive.recap.committed',
  'directive.context.revolving'
]);

const DEFAULT_CANDIDATE_FACT_LIMIT = 80;
const MAX_SUMMARY_LENGTH = 360;
const MAX_RECENT_MESSAGES = 8;

function truncateText(value = '', maxLength = MAX_SUMMARY_LENGTH) {
  const text = compact(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function tagSet(fact) {
  return new Set(asArray(fact?.tags).map((tag) => compact(tag).toLowerCase()).filter(Boolean));
}

function isHardFloorFact(fact) {
  const criticality = compact(fact?.criticality).toLowerCase();
  const tags = tagSet(fact);
  return criticality === 'hard'
    || criticality === 'critical'
    || tags.has('contradiction-guard')
    || tags.has('invariant');
}

function sourceFrameSceneSummary(scene = {}) {
  return {
    missionTitle: truncateText(scene?.missionTitle || ''),
    phaseLabel: truncateText(scene?.phaseLabel || ''),
    location: truncateText(scene?.location || ''),
    currentQuestion: truncateText(scene?.currentQuestion || ''),
    immediateStakes: truncateText(scene?.immediateStakes || ''),
    presentActorIds: asArray(scene?.presentActorIds || scene?.presentCharacterIds || scene?.presentCharacters).map(compact).filter(Boolean),
    relevantActorIds: asArray(scene?.relevantActorIds || scene?.relevantCrewIds).map(compact).filter(Boolean),
    availableDecisionPointIds: asArray(scene?.availableDecisionPointIds).map(compact).filter(Boolean)
  };
}

function sourceFrameSummary(sourceFrame = {}) {
  return {
    kind: sourceFrame.kind || null,
    campaignId: sourceFrame.campaignId || null,
    packageId: sourceFrame.packageId || null,
    saveId: sourceFrame.saveId || null,
    branchId: sourceFrame.branchId || null,
    chatId: sourceFrame.chatId || null,
    revision: sourceFrame.revision ?? null,
    mechanicsRevision: sourceFrame.mechanicsRevision ?? null,
    locationId: sourceFrame.locationId || null,
    activeQuestId: sourceFrame.activeQuestId || null,
    activePhaseId: sourceFrame.activePhaseId || null,
    playerTextHash: sourceFrame.playerText ? hashContinuityText(sourceFrame.playerText) : null,
    playerTextPreview: truncateText(sourceFrame.playerText || '', 300),
    recentMessageSummaryHash: sourceFrame.recentMessageSummary ? hashContinuityText(sourceFrame.recentMessageSummary) : null,
    recentMessageSummaryPreview: truncateText(sourceFrame.recentMessageSummary || '', 300),
    presentActorIds: asArray(sourceFrame.presentActorIds).map(compact).filter(Boolean),
    referencedActorIds: asArray(sourceFrame.referencedActorIds).map(compact).filter(Boolean),
    relevantActorIds: asArray(sourceFrame.relevantActorIds).map(compact).filter(Boolean),
    recentMessages: asArray(sourceFrame.recentMessages).slice(-MAX_RECENT_MESSAGES).map((message) => ({
      id: message?.id || null,
      role: message?.role || null,
      hash: message?.hash || hashContinuityText(message?.text || ''),
      textPreview: truncateText(message?.text || '', 240)
    })),
    scene: sourceFrameSceneSummary(sourceFrame.scene || {})
  };
}

function factUseStatFor(factId, stats = {}) {
  const stat = stats?.[factId] || null;
  if (!stat || typeof stat !== 'object') return null;
  return {
    selectedCount: Number(stat.selectedCount || 0),
    guardedCount: Number(stat.guardedCount || 0),
    violationCount: Number(stat.violationCount || 0),
    lastSelectedRevision: stat.lastSelectedRevision ?? null,
    lastGuardedRevision: stat.lastGuardedRevision ?? null,
    lastViolationRevision: stat.lastViolationRevision ?? null,
    lastLane: compact(stat.lastLane) || null
  };
}

function sanitizeFactForPlanner(fact, sourceFrame = {}) {
  return {
    id: fact.id,
    kind: compact(fact.kind) || 'fact',
    subject: fact.subject || null,
    predicate: fact.predicate || null,
    summary: truncateText(fact.summary || fact.render?.narrator || fact.id),
    narratorText: truncateText(fact.render?.narrator || fact.summary || fact.id),
    authority: fact.authority || null,
    authorityRank: Number(fact.authorityRank || 0),
    visibility: fact.visibility || CONTINUITY_VISIBILITY.narratorSafe,
    criticality: compact(fact.criticality) || 'medium',
    stability: compact(fact.stability) || 'stable',
    confidence: Number.isFinite(Number(fact.confidence)) ? Number(fact.confidence) : null,
    tags: asArray(fact.tags).map(compact).filter(Boolean),
    defaultLane: defaultContinuityLaneForFact(fact),
    hardFloor: isHardFloorFact(fact),
    sourceKind: compact(fact.source?.kind || fact.source?.type) || null,
    revision: fact.revision ?? null,
    turnId: fact.turnId || null,
    useStats: factUseStatFor(fact.id, sourceFrame.factUseStats || {})
  };
}

function sanitizeProjectionHints(hints = []) {
  return asArray(hints).map((hint) => ({
    id: hint?.id || null,
    factId: hint?.factId || null,
    mode: hint?.mode || null,
    force: hint?.force || null,
    minimumLane: hint?.minimumLane || null,
    expiresRevision: hint?.expiresRevision ?? null,
    reason: truncateText(hint?.reason || '', 220)
  })).filter((hint) => hint.factId);
}

function sanitizeRejectedClaims(sourceFrame = {}) {
  return asArray(sourceFrame.rejectedClaims).slice(-12).map((claim) => ({
    id: claim?.id || null,
    status: claim?.status || null,
    sourceHash: claim?.sourceHash || null,
    findingFactIds: asArray(claim?.findingFactIds).map(compact).filter(Boolean),
    findingKinds: asArray(claim?.findingKinds).map(compact).filter(Boolean),
    recordedAt: claim?.recordedAt || claim?.createdAt || null
  })).filter((claim) => claim.id || claim.sourceHash || claim.findingFactIds.length || claim.findingKinds.length);
}

function laneBudgets() {
  return Object.fromEntries(CONTINUITY_PROMPT_LANES.map((lane) => [lane.promptKey, {
    promptKey: lane.promptKey,
    title: lane.title,
    depth: lane.depth,
    ttl: lane.ttl,
    maySelectFacts: FACT_LANE_KEYS.includes(lane.promptKey)
  }]));
}

export function continuityProjectionPlannerSystemPrompt() {
  return [
    'You are Directive\'s Continuity Projection Matrix planner.',
    'Return JSON only. Do not write prose outside the JSON object.',
    'Select existing fact IDs for prompt projection. Never invent facts, values, summaries, hidden state, or prompt text.',
    'The validator is authoritative and will reject unknown fact IDs, illegal lanes, hidden data, hard-floor demotions, over-budget support facts, and model-authored fact prose.',
    'Legal fact lanes: directive.continuity.invariants, directive.continuity.domain, directive.recap.committed, directive.context.revolving.',
    'Do not target directive.contract or directive.scene.active; those are static/backend lanes.',
    'Prefer small, relevant sets. Preserve hardFloor facts, current-turn actor facts, contradiction guards, and active projection hints.',
    'Use lane aliases only if needed: L1=invariants, L3=domain, L4=recap, L5=revolving.',
    'Output shape: {"kind":"directive.continuityProjectionPlan.v1","operations":[{"factId":"...","lane":"...","reason":"...","action":"select","force":"boost","ttl":"scene","confidence":0.8}],"omitted":[{"factId":"...","reason":"..."}],"guardFocus":["fact.id"],"compressionGroups":[{"id":"...","factIds":["..."],"lane":"...","reason":"..."}]}'
  ].join('\n');
}

export function buildContinuityProjectionPlannerRequest({
  factIndex,
  sourceFrame = null,
  projectionHints = [],
  policy = {},
  maxCandidateFacts = DEFAULT_CANDIDATE_FACT_LIMIT
} = {}) {
  const facts = asArray(factIndex?.facts).slice(0, Math.max(1, Number(maxCandidateFacts) || DEFAULT_CANDIDATE_FACT_LIMIT));
  const frame = sourceFrameSummary(sourceFrame || {});
  const hints = sanitizeProjectionHints(projectionHints);
  const hardFloorFactIds = facts.filter(isHardFloorFact).map((fact) => fact.id);
  const turnRelevantActorIds = new Set(asArray(sourceFrame?.relevantActorIds).map((id) => compact(id).toLowerCase()).filter(Boolean));
  const turnRelevantFactIds = facts.filter((fact) => {
    if (!turnRelevantActorIds.size) return false;
    const subject = compact(fact.subject).toLowerCase();
    const id = compact(fact.id).toLowerCase();
    return [...turnRelevantActorIds].some((actorId) => (
      subject === actorId
      || subject === `crew.${actorId}`
      || id.includes(actorId)
      || asArray(fact.tags).some((tag) => compact(tag).toLowerCase() === actorId)
    ));
  }).map((fact) => fact.id);
  const request = {
    kind: CONTINUITY_PLANNER_REQUEST_KIND,
    schemaVersion: 1,
    sourceHash: sourceFrame?.sourceHash || null,
    candidateFacts: facts.map((fact) => sanitizeFactForPlanner(fact, sourceFrame || {})),
    sourceFrame: frame,
    projectionHints: hints,
    rejectedClaimSignals: sanitizeRejectedClaims(sourceFrame || {}),
    hardFloorFactIds,
    turnRelevantFactIds,
    policy: {
      audience: CONTINUITY_VISIBILITY.narratorSafe,
      factLanes: FACT_LANE_KEYS,
      laneBudgets: laneBudgets(),
      maxCandidateFacts: facts.length,
      noPromptInjection: true,
      noStateMutation: true,
      noHiddenData: true,
      ...cloneJson(policy || {})
    }
  };
  request.requestHash = hashContinuityText(request);
  return request;
}

export const __continuityProjectionPlannerPromptTestHooks = Object.freeze({
  FACT_LANE_KEYS,
  sourceFrameSummary,
  sanitizeFactForPlanner,
  sanitizeRejectedClaims
});
