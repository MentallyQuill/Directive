import { evaluateConditionSet } from '../world/predicate-evaluator.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function arcs(packageData) { return asArray(packageData?.storyArcs?.arcs); }
function milestones(packageData) {
  const topLevel = asArray(packageData?.storyArcs?.milestones);
  if (topLevel.length) return topLevel;
  return arcs(packageData).flatMap((arc) => asArray(arc.milestones).map((milestone) => ({ ...milestone, arcId: milestone.arcId || arc.id })));
}

export function createStoryArcLedger(packageData) {
  return {
    schemaVersion: 2,
    arcs: arcs(packageData).map((arc) => ({
      id: arc.id,
      status: arc.initialStatus || 'active',
      stageId: arc.initialStageId || arc.stages?.[0]?.id || null,
      completedMilestoneIds: [],
      history: []
    })),
    milestones: milestones(packageData).map((milestone) => ({
      id: milestone.id,
      arcId: milestone.arcId,
      status: milestone.initialStatus || 'locked',
      completedAt: null,
      sourceEventIds: [],
      outcomeId: null
    })),
    revealedLeadIds: [],
    endingAxes: asArray(packageData?.storyArcs?.endingAxes).map((axis) => ({ id: axis.id, state: axis.initialState || null, evidence: [] })),
    endingProfileId: null,
    rawValuesHidden: true
  };
}

export function evaluateMilestones(ledger, { packageData, state, sourceEventId = null } = {}) {
  const next = cloneJson(ledger || createStoryArcLedger(packageData));
  const milestoneById = new Map(asArray(next.milestones).map((record) => [record.id, record]));
  const completed = [];
  const unlocked = [];
  const stardate = state?.worldState?.currentStardate ?? state?.campaign?.currentStardate ?? null;

  for (const template of milestones(packageData)) {
    const record = milestoneById.get(template.id) || { id: template.id, arcId: template.arcId, status: template.initialStatus || 'locked', completedAt: null, sourceEventIds: [] };
    if (record.status === 'complete') continue;
    const gate = evaluateConditionSet(template.gates ?? template.availability ?? true, { state, packageData, milestone: template });
    const completionPredicate = template.completion ?? (template.questTemplateId ? { questResolved: template.questTemplateId } : false);
    const completion = evaluateConditionSet(completionPredicate, { state, packageData, milestone: template });
    if (completion.eligible) {
      record.status = 'complete';
      record.completedAt = stardate;
      record.sourceEventIds = [...new Set([...(record.sourceEventIds || []), sourceEventId].filter(Boolean))];
      completed.push(record.id);
    } else if (gate.eligible && record.status === 'locked') {
      record.status = 'available';
      unlocked.push(record.id);
    }
    milestoneById.set(record.id, record);
  }

  next.milestones = [...milestoneById.values()];
  for (const arcState of asArray(next.arcs)) {
    const arc = arcs(packageData).find((candidate) => candidate.id === arcState.id);
    if (!arc) continue;
    arcState.completedMilestoneIds = next.milestones.filter((record) => record.arcId === arc.id && record.status === 'complete').map((record) => record.id);
    for (const stage of asArray(arc.stages)) {
      const requirements = asArray(stage.requiredMilestoneIds || stage.milestoneIds);
      if (requirements.length && requirements.every((id) => arcState.completedMilestoneIds.includes(id))) arcState.stageId = stage.id;
    }
    const required = asArray(arc.requiredMilestoneIds);
    if (required.length && required.every((id) => arcState.completedMilestoneIds.includes(id))) arcState.status = 'complete';
  }
  next.rawValuesHidden = true;
  return { ledger: next, completed, unlocked };
}

export function chooseEndingProfile(ledger, packageData, state) {
  const profiles = asArray(packageData?.storyArcs?.endingProfiles);
  const eligible = profiles.filter((profile) => evaluateConditionSet(profile.conditions ?? false, { state, packageData, ledger }).eligible);
  const selected = eligible.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0] || null;
  return selected;
}

export function applyStoryArcDelta(ledger = {}, delta = {}) {
  const next = cloneJson(ledger);
  const milestonesById = new Map(asArray(next.milestones).map((entry) => [entry.id, entry]));
  for (const update of asArray(delta.milestoneUpdates)) {
    milestonesById.set(update.id, { ...(milestonesById.get(update.id) || {}), ...cloneJson(update) });
  }
  next.milestones = [...milestonesById.values()];
  if (Array.isArray(delta.revealedLeadIdsAdd)) next.revealedLeadIds = [...new Set([...(next.revealedLeadIds || []), ...delta.revealedLeadIdsAdd])];
  const axisById = new Map(asArray(next.endingAxes).map((entry) => [entry.id, entry]));
  for (const update of asArray(delta.endingAxisUpdates)) {
    const previous = axisById.get(update.id) || { id: update.id, evidence: [] };
    axisById.set(update.id, { ...previous, ...cloneJson(update), evidence: [...new Set([...(previous.evidence || []), ...(update.evidence || [])])] });
  }
  next.endingAxes = [...axisById.values()];
  if ('endingProfileIdSet' in delta) next.endingProfileId = delta.endingProfileIdSet;
  next.rawValuesHidden = true;
  return next;
}

export const __storyArcDirectorTestHooks = Object.freeze({ arcs, milestones });
