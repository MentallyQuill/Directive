import { stableHash24, stableSha256Hex } from '../../runtime/v1-stable-hash.mjs';
import { indexCohesionCatalog } from './cohesion-contracts.mjs';
import {
  createCohesionIssueCreatedEffect,
  createCohesionOpportunityCheckedEffect,
} from './cohesion-state.mjs';

const HOUR_SECONDS = 3600;

function hashInteger(key, maximum) {
  const value = Number.parseInt(stableSha256Hex(key).slice(0, 12), 16);
  return value % maximum;
}

function hashPercent(key) {
  return hashInteger(key, 100) + 1;
}

function identityKey(identity = {}) {
  return [
    identity.packageId || '',
    identity.campaignId || '',
    identity.branchId || '',
    identity.majorArcId || '',
  ].join('|');
}

function nextOpportunitySequence(state) {
  return Math.max(0, ...(state?.opportunityChecks || []).map(({ sequence }) => Number(sequence) || 0)) + 1;
}

function lastOpportunity(state) {
  return [...(state?.opportunityChecks || [])]
    .sort((left, right) => (right.elapsedSeconds ?? 0) - (left.elapsedSeconds ?? 0) || (right.sequence ?? 0) - (left.sequence ?? 0))[0] || null;
}

function scheduleDue({ schedule, state, elapsedSeconds, boundary }) {
  const last = lastOpportunity(state);
  if (!last) return elapsedSeconds >= schedule.warmupHours * HOUR_SECONDS
    ? { due: true, reason: 'warmup' }
    : { due: false, reason: 'warmup-pending' };
  const since = elapsedSeconds - last.elapsedSeconds;
  if (boundary && since >= schedule.boundaryMinimumHours * HOUR_SECONDS) return { due: true, reason: 'story-boundary' };
  if (since >= schedule.intervalHours * HOUR_SECONDS) return { due: true, reason: 'interval' };
  return { due: false, reason: 'interval-pending' };
}

export function selectWeightedCohesionLevel(roll) {
  const bounded = Math.max(1, Math.min(100, Number(roll) || 1));
  if (bounded <= 50) return 1;
  if (bounded <= 80) return 2;
  if (bounded <= 95) return 3;
  return 4;
}

function creationChance(schedule, unresolved) {
  if (unresolved < schedule.targetUnresolved) return 100;
  if (unresolved >= schedule.crowdedThreshold) return schedule.crowdedChancePercent;
  return schedule.normalChancePercent;
}

function recentGeneratedIssues(state) {
  return (state?.issues || [])
    .filter(({ authored, templateId }) => !authored && templateId)
    .sort((left, right) => (right.opportunitySequence ?? right.sequence ?? 0) - (left.opportunitySequence ?? left.sequence ?? 0));
}

function templateOnCooldown(template, state, opportunitySequence, policy, majorArcId) {
  const allRecords = [...(state?.issues || []), ...(state?.completedHistory || [])];
  if (template.level === 4 && allRecords.some((record) => (
    record.level === 4
    && ((state?.issues || []).some(({ id }) => id === record.id) || String(record.majorArcId || '') === String(majorArcId || ''))
  ))) return true;
  const records = allRecords
    .filter((record) => record.templateId === template.id);
  if (records.some((record) => record.id && (state?.issues || []).some(({ id }) => id === record.id))) return true;
  if (template.level === 4) return false;
  const cooldown = policy.cooldownChecks[String(template.level)] || 0;
  return records.some((record) => (
    Number.isInteger(record.opportunitySequence)
    && opportunitySequence - record.opportunitySequence <= cooldown
  ));
}

function chooseTemplate({ catalogIndex, state, desiredLevel, opportunitySequence, key, majorArcId, availableCount }) {
  const levels = [desiredLevel, 3, 2, 1]
    .filter((level, index, values) => level <= availableCount && values.indexOf(level) === index)
    .sort((left, right) => {
      if (left === desiredLevel) return -1;
      if (right === desiredLevel) return 1;
      return right - left;
    });
  const recentFamilies = new Set(recentGeneratedIssues(state).slice(0, 2).map(({ primaryFamily }) => primaryFamily));
  for (const level of levels) {
    let eligible = [...catalogIndex.templates.values()]
      .filter((template) => template.level === level)
      .filter((template) => !templateOnCooldown(template, state, opportunitySequence, catalogIndex.policy, majorArcId));
    if (eligible.length === 0) continue;
    const diverse = eligible.filter((template) => !recentFamilies.has(template.primaryFamily));
    if (diverse.length > 0) eligible = diverse;
    eligible.sort((left, right) => left.id.localeCompare(right.id));
    return eligible[hashInteger(`${key}|template|${level}`, eligible.length)];
  }
  return null;
}

function choose(array, key) {
  return array[hashInteger(key, array.length)];
}

function createBinding(template, backgroundCrew, key) {
  const variation = choose(template.variations, `${key}|variation`);
  if (template.bindingMode === 'backgroundOnly') {
    const name = choose(backgroundCrew.names, `${key}|name`);
    const crew = {
      id: `cohesion-crew.${stableHash24(`${key}|crew`)}`,
      name,
      pronouns: choose(backgroundCrew.pronouns, `${key}|pronouns`),
      rank: choose(backgroundCrew.ranks, `${key}|rank`),
      department: choose(backgroundCrew.departments, `${key}|department`),
      watch: choose(backgroundCrew.watches, `${key}|watch`),
      qualification: choose(backgroundCrew.qualifications, `${key}|qualification`),
    };
    return { mode: template.bindingMode, crew, roles: Object.fromEntries(template.bindingRoles.map((role) => [role, crew.id])), variation };
  }
  const departments = backgroundCrew.departments;
  return {
    mode: template.bindingMode,
    roles: Object.fromEntries(template.bindingRoles.map((role, index) => [
      role,
      departments[hashInteger(`${key}|role|${index}`, departments.length)],
    ])),
    variation,
  };
}

function allocateSegments(state, level, key) {
  const available = (state?.segments || [])
    .filter(({ filled }) => filled)
    .map(({ index }) => index)
    .sort((left, right) => left - right);
  if (available.length < level) return [];
  const rotation = hashInteger(`${key}|segments`, available.length);
  return Array.from({ length: level }, (_, offset) => available[(rotation + offset) % available.length])
    .sort((left, right) => left - right);
}

export function planCohesionOpportunity({
  catalog = {},
  cohesionState = {},
  authoritativeTime = {},
  boundary = null,
  campaignIdentity = {},
  sourceContributionIds = [],
  forcedLevelRoll = null,
} = {}) {
  const catalogIndex = indexCohesionCatalog(catalog);
  const elapsedSeconds = Math.max(0, Math.floor(Number(authoritativeTime.elapsedSeconds) || 0));
  const timing = scheduleDue({
    schedule: catalogIndex.policy.schedule,
    state: cohesionState,
    elapsedSeconds,
    boundary,
  });
  if (!timing.due) return { due: false, reason: timing.reason, effects: [], opportunityEffect: null, issueEffect: null };

  const opportunitySequence = nextOpportunitySequence(cohesionState);
  const key = `${identityKey(campaignIdentity)}|${opportunitySequence}|${elapsedSeconds}|${boundary || ''}`;
  const unresolved = (cohesionState?.issues || []).length;
  const chancePercent = creationChance(catalogIndex.policy.schedule, unresolved);
  const roll = hashPercent(`${key}|chance`);
  let outcome = 'none';
  let template = null;
  let issueEffect = null;

  if ((cohesionState?.total ?? 100) < catalogIndex.policy.schedule.criticalPauseBelow) {
    outcome = 'paused';
  } else if (roll <= chancePercent) {
    const availableCount = (cohesionState?.segments || []).filter(({ filled }) => filled).length;
    if (availableCount < 1) {
      outcome = 'ineligible';
    } else {
      const levelRoll = forcedLevelRoll == null ? hashPercent(`${key}|level`) : forcedLevelRoll;
      const desiredLevel = selectWeightedCohesionLevel(levelRoll);
      template = chooseTemplate({
        catalogIndex,
        state: cohesionState,
        desiredLevel,
        opportunitySequence,
        key,
        majorArcId: campaignIdentity.majorArcId,
        availableCount,
      });
      if (template) {
        const issueId = `cohesion-issue.${stableHash24(`${key}|${template.id}`)}`;
        issueEffect = createCohesionIssueCreatedEffect({
          id: `effect.cohesion-created.${stableHash24(`${key}|created`)}`,
          issueId,
          templateId: template.id,
          segmentIds: allocateSegments(cohesionState, template.level, key),
          sequence: (opportunitySequence * 2) + 1,
          opportunitySequence,
          majorArcId: campaignIdentity.majorArcId || null,
          binding: createBinding(template, catalogIndex.backgroundCrew, `${key}|${template.id}`),
          sourceContributionIds,
        });
        outcome = 'created';
      } else {
        outcome = 'ineligible';
      }
    }
  }

  const opportunityEffect = createCohesionOpportunityCheckedEffect({
    id: `effect.cohesion-opportunity.${stableHash24(`${key}|opportunity`)}`,
    sequence: opportunitySequence,
    elapsedSeconds,
    boundary,
    outcome,
    chancePercent,
    roll,
    sourceContributionIds,
  });
  return {
    due: true,
    reason: timing.reason,
    chancePercent,
    roll,
    opportunitySequence,
    template: template == null ? null : structuredClone(template),
    opportunityEffect,
    issueEffect,
    effects: issueEffect ? [opportunityEffect, issueEffect] : [opportunityEffect],
  };
}
