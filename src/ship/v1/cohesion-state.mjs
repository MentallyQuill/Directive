import { indexCohesionCatalog } from './cohesion-contracts.mjs';
import { deriveShipMechanicsState } from './ship-mechanics-state.mjs';

const EFFECT_TYPES = Object.freeze({
  opportunity: 'ship.cohesionOpportunityChecked',
  created: 'ship.cohesionIssueCreated',
  phase: 'ship.cohesionPhaseCompleted',
  resolved: 'ship.cohesionIssueResolved',
  retired: 'ship.cohesionIssueRetired',
  guard: 'ship.cohesionGenerationGuardActivated',
});

function clone(value) {
  return structuredClone(value);
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} is required`);
  return value;
}

function requiredSequence(value) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError('sequence must be a non-negative integer');
  return value;
}

function baseEffect({ id, type, targetId, sequence, sourceContributionIds = [] }) {
  return Object.freeze({
    id: requiredText(id, 'effect id'),
    type,
    status: 'active',
    targetId: requiredText(targetId, 'target id'),
    sequence: requiredSequence(sequence),
    sourceContributionIds: Object.freeze([...new Set(sourceContributionIds)].sort()),
  });
}

export function createCohesionOpportunityCheckedEffect({
  id, sequence, elapsedSeconds, boundary = null, outcome, chancePercent, roll, sourceContributionIds = [],
} = {}) {
  if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 0) throw new TypeError('elapsedSeconds must be non-negative');
  if (!['created', 'none', 'paused', 'ineligible'].includes(outcome)) throw new TypeError('opportunity outcome is invalid');
  return Object.freeze({
    ...baseEffect({ id, type: EFFECT_TYPES.opportunity, targetId: `cohesion-opportunity.${sequence}`, sequence, sourceContributionIds }),
    elapsedSeconds,
    boundary: boundary == null ? null : String(boundary),
    outcome,
    chancePercent,
    roll,
  });
}

export function createCohesionIssueCreatedEffect({
  id, issueId, templateId, segmentIds, sequence, binding = null, sourceContributionIds = [], campaignImmediate = false,
  opportunitySequence = null, majorArcId = null,
} = {}) {
  requiredText(templateId, 'templateId');
  if (!Array.isArray(segmentIds) || segmentIds.length < 1 || segmentIds.length > 4) {
    throw new TypeError('segmentIds must contain one to four segments');
  }
  if (new Set(segmentIds).size !== segmentIds.length || segmentIds.some((value) => !Number.isInteger(value) || value < 0 || value > 19)) {
    throw new TypeError('segmentIds must contain unique segment indexes from 0 through 19');
  }
  return Object.freeze({
    ...baseEffect({ id, type: EFFECT_TYPES.created, targetId: issueId, sequence, sourceContributionIds }),
    templateId,
    segmentIds: Object.freeze([...segmentIds].sort((left, right) => left - right)),
    binding: binding == null ? null : clone(binding),
    campaignImmediate: campaignImmediate === true,
    opportunitySequence: Number.isInteger(opportunitySequence) ? opportunitySequence : null,
    majorArcId: majorArcId == null ? null : String(majorArcId),
  });
}

export function createCohesionPhaseCompletedEffect({ id, issueId, phaseId, sequence, sourceContributionIds = [] } = {}) {
  return Object.freeze({
    ...baseEffect({ id, type: EFFECT_TYPES.phase, targetId: issueId, sequence, sourceContributionIds }),
    phaseId: requiredText(phaseId, 'phaseId'),
  });
}

export function createCohesionIssueResolvedEffect({
  id, issueId, cohesionRestored, sequence, sourceContributionIds = [], method = 'quest',
} = {}) {
  if (!Number.isInteger(cohesionRestored) || cohesionRestored < 1 || cohesionRestored > 20) {
    throw new TypeError('cohesionRestored must be between 1 and 20');
  }
  return Object.freeze({
    ...baseEffect({ id, type: EFFECT_TYPES.resolved, targetId: issueId, sequence, sourceContributionIds }),
    cohesionRestored,
    method,
  });
}

export function createCohesionIssueRetiredEffect({ id, issueId, reason, sequence, sourceContributionIds = [] } = {}) {
  return Object.freeze({
    ...baseEffect({ id, type: EFFECT_TYPES.retired, targetId: issueId, sequence, sourceContributionIds }),
    reason: requiredText(reason, 'reason'),
  });
}

export function createCohesionGenerationGuardEffect({
  id, sequence, guardId, remainingChecks, sourceContributionIds = [],
} = {}) {
  if (!Number.isInteger(remainingChecks) || remainingChecks < 1) throw new TypeError('remainingChecks must be positive');
  return Object.freeze({
    ...baseEffect({ id, type: EFFECT_TYPES.guard, targetId: guardId, sequence, sourceContributionIds }),
    remainingChecks,
  });
}

export function activeCohesionEffects(storySettlement = {}) {
  return (storySettlement?.episodes || [])
    .filter((episode) => episode?.status !== 'invalidated')
    .flatMap((episode) => episode?.effects || [])
    .filter((effect) => effect?.status === 'active' && Object.values(EFFECT_TYPES).includes(effect?.type))
    .map(clone)
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0) || String(left.id).localeCompare(String(right.id)));
}

export function cohesionBandForTotal(total) {
  const bounded = Math.max(0, Math.min(100, Number(total) || 0));
  if (bounded >= 75) return Object.freeze({ id: 'ready', label: 'Ready', minimum: 75, maximum: 100 });
  if (bounded >= 40) return Object.freeze({ id: 'strained', label: 'Strained', minimum: 40, maximum: 74 });
  return Object.freeze({ id: 'critical', label: 'Critical', minimum: 0, maximum: 39 });
}

function phaseProjection(phases, completedIds) {
  const completed = phases.filter((phase) => completedIds.has(phase.id));
  return {
    phases: phases.map((phase) => ({ ...clone(phase), status: completedIds.has(phase.id) ? 'completed' : 'available' })),
    completedPhaseCount: completed.length,
    currentPhase: phases.find((phase) => !completedIds.has(phase.id)) || null,
  };
}

function authoredIssues({ catalogIndex, shipState }) {
  const systems = new Map(shipState.systems.map((system) => [system.id, system]));
  const issues = [];
  const completed = [];
  let nextSegment = 0;
  for (const contract of catalogIndex.authoredIssues) {
    const system = systems.get(contract.systemId);
    if (!system) throw new TypeError(`Cohesion authored issue references missing system: ${contract.systemId}`);
    const segmentIds = Array.from({ length: contract.level }, () => nextSegment++);
    if (system.currentState.id === contract.terminalStateId) {
      completed.push({
        id: contract.id,
        title: contract.playerText.title,
        level: contract.level,
        cohesionRestored: contract.level * 5,
        method: 'authored-system',
        sequence: -1,
      });
      continue;
    }
    const orders = new Map(system.workOrders.map((order) => [order.id, order]));
    const phases = contract.phaseMilestoneIds.map((id) => {
      const order = orders.get(id);
      return { id, label: order?.label || 'Unknown work order', summary: order?.summary || '' };
    });
    const completedIds = new Set(system.workOrders.filter(({ status }) => status === 'satisfied').map(({ id }) => id));
    issues.push({
      id: contract.id,
      authored: true,
      templateId: null,
      systemId: contract.systemId,
      level: contract.level,
      cohesion: contract.level * 5,
      primaryFamily: contract.primaryFamily,
      anchor: contract.anchor,
      conditionId: contract.conditionId,
      playerText: clone(contract.playerText),
      approaches: [],
      computerHelp: contract.computerHelp,
      completion: null,
      binding: null,
      segmentIds,
      sequence: -1,
      campaignImmediate: true,
      ...phaseProjection(phases, completedIds),
    });
  }
  return { issues, completed, nextSegment };
}

function createdIssues({ catalogIndex, effects, occupiedSegments }) {
  const created = effects.filter(({ type }) => type === EFFECT_TYPES.created);
  const phasesByIssue = new Map();
  for (const effect of effects.filter(({ type }) => type === EFFECT_TYPES.phase)) {
    if (!phasesByIssue.has(effect.targetId)) phasesByIssue.set(effect.targetId, new Set());
    phasesByIssue.get(effect.targetId).add(effect.phaseId);
  }
  const resolutionByIssue = new Map(effects.filter(({ type }) => type === EFFECT_TYPES.resolved).map((effect) => [effect.targetId, effect]));
  const retirementByIssue = new Map(effects.filter(({ type }) => type === EFFECT_TYPES.retired).map((effect) => [effect.targetId, effect]));
  const issues = [];
  const completed = [];
  for (const effect of created) {
    if (resolutionByIssue.has(effect.targetId)) {
      const resolved = resolutionByIssue.get(effect.targetId);
      const template = catalogIndex.templates.get(effect.templateId);
      if (template) completed.push({
        id: effect.targetId,
        title: template.title,
        templateId: template.id,
        level: template.level,
        cohesionRestored: resolved.cohesionRestored,
        method: resolved.method || 'quest',
        sequence: resolved.sequence,
      });
      continue;
    }
    if (retirementByIssue.has(effect.targetId)) continue;
    const template = catalogIndex.templates.get(effect.templateId);
    if (!template) throw new TypeError(`Cohesion issue references missing template: ${effect.templateId}`);
    if (effect.segmentIds.length !== template.level) throw new TypeError(`${effect.targetId} segment count must match template level`);
    for (const segmentId of effect.segmentIds) {
      if (occupiedSegments.has(segmentId)) throw new TypeError(`Cohesion segment ${segmentId} has multiple owners`);
      occupiedSegments.add(segmentId);
    }
    issues.push({
      id: effect.targetId,
      authored: false,
      templateId: template.id,
      level: template.level,
      cohesion: template.cohesion,
      primaryFamily: template.primaryFamily,
      secondaryFamilies: clone(template.secondaryFamilies),
      anchor: template.anchor,
      conditionId: effect.targetId,
      playerText: { title: template.title, ...clone(template.playerText) },
      approaches: clone(template.approaches),
      computerHelp: template.computerHelp,
      completion: clone(template.completion),
      binding: effect.binding == null ? null : clone(effect.binding),
      segmentIds: clone(effect.segmentIds),
      sequence: effect.sequence,
      opportunitySequence: effect.opportunitySequence,
      majorArcId: effect.majorArcId,
      campaignImmediate: effect.campaignImmediate === true,
      ...phaseProjection(template.phases, phasesByIssue.get(effect.targetId) || new Set()),
    });
  }
  return { issues, completed };
}

function issuePriority(left, right) {
  return Number(right.campaignImmediate) - Number(left.campaignImmediate)
    || Number(right.authored) - Number(left.authored)
    || Number(right.completedPhaseCount > 0) - Number(left.completedPhaseCount > 0)
    || left.sequence - right.sequence
    || left.id.localeCompare(right.id);
}

export function deriveCohesionState({ catalog = {}, shipDataset = {}, storySettlement = {}, branchId = '' } = {}) {
  const catalogIndex = indexCohesionCatalog(catalog);
  const shipState = deriveShipMechanicsState({ shipDataset, storySettlement });
  const authored = authoredIssues({ catalogIndex, shipState });
  const occupiedSegments = new Set(authored.issues.flatMap(({ segmentIds }) => segmentIds));
  const effects = activeCohesionEffects(storySettlement);
  const generated = createdIssues({ catalogIndex, effects, occupiedSegments });
  const issues = [...authored.issues, ...generated.issues].sort(issuePriority);
  const visibleLimit = catalogIndex.policy.schedule.visibleLimit;
  const visibleTasks = issues.slice(0, visibleLimit).map(clone);
  const queuedTasks = issues.slice(visibleLimit).map(clone);
  const debt = issues.reduce((sum, issue) => sum + issue.cohesion, 0);
  const total = Math.max(0, 100 - debt);
  const ownerBySegment = new Map(issues.flatMap((issue) => issue.segmentIds.map((segmentId) => [segmentId, issue])));
  const visibleIds = new Set(visibleTasks.map(({ id }) => id));
  const segments = Array.from({ length: 20 }, (_, index) => {
    const issue = ownerBySegment.get(index);
    return {
      index,
      filled: !issue,
      issueId: issue?.id || null,
      visible: issue ? visibleIds.has(issue.id) : false,
      level: issue?.level || null,
    };
  });
  const completedHistory = [...authored.completed, ...generated.completed]
    .sort((left, right) => right.sequence - left.sequence || left.id.localeCompare(right.id));
  return {
    kind: 'directive.cohesionState.v1',
    branchId: String(branchId || ''),
    total,
    debt,
    band: cohesionBandForTotal(total),
    segments,
    issues: issues.map(clone),
    visibleTasks,
    queuedTasks,
    queuedCount: queuedTasks.length,
    queuedCohesion: queuedTasks.reduce((sum, issue) => sum + issue.cohesion, 0),
    completedHistory,
    opportunityChecks: effects.filter(({ type }) => type === EFFECT_TYPES.opportunity).map(clone),
    generationGuards: effects.filter(({ type }) => type === EFFECT_TYPES.guard).map(clone),
  };
}

export { EFFECT_TYPES as COHESION_EFFECT_TYPES };
