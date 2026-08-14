import assert from 'node:assert/strict';

import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import {
  planCohesionOpportunity,
  selectWeightedCohesionLevel,
} from '../../src/ship/v1/cohesion-scheduler.mjs';

const { cohesionCatalog: catalog } = loadAshesRuntimeAssets();
const HOUR = 3600;

function state({ total = 75, unresolved = 2, lastCheckHours = null, issues = [], completedHistory = [], guards = [] } = {}) {
  const occupied = issues.flatMap(({ segmentIds = [] }) => segmentIds);
  return {
    total,
    issues: [
      ...Array.from({ length: Math.max(0, unresolved - issues.length) }, (_, index) => ({
        id: `authored.${index}`,
        authored: true,
        level: 1,
        primaryFamily: index % 2 ? 'systems' : 'coordination',
        segmentIds: [index],
        sequence: -1,
      })),
      ...issues,
    ],
    segments: Array.from({ length: 20 }, (_, index) => ({ index, filled: !occupied.includes(index) && index >= unresolved })),
    opportunityChecks: lastCheckHours == null ? [] : [{ sequence: 4, elapsedSeconds: lastCheckHours * HOUR }],
    completedHistory,
    generationGuards: guards,
  };
}

const identity = { packageId: catalog.packageId, campaignId: 'campaign.a', branchId: 'branch.a', majorArcId: 'arc.1' };

assert.equal(planCohesionOpportunity({
  catalog, cohesionState: state(), authoritativeTime: { elapsedSeconds: 3 * HOUR }, campaignIdentity: identity,
}).due, false);

const warmup = planCohesionOpportunity({
  catalog, cohesionState: state(), authoritativeTime: { elapsedSeconds: 4 * HOUR }, campaignIdentity: identity,
});
assert.equal(warmup.due, true);
assert.equal(warmup.chancePercent, 100);
assert.equal(warmup.opportunityEffect.outcome, 'created');
assert.equal(warmup.effects.length, 2);

assert.equal(planCohesionOpportunity({
  catalog, cohesionState: state({ lastCheckHours: 4 }), authoritativeTime: { elapsedSeconds: 15 * HOUR }, campaignIdentity: identity,
}).due, false);
assert.equal(planCohesionOpportunity({
  catalog, cohesionState: state({ lastCheckHours: 4 }), authoritativeTime: { elapsedSeconds: 16 * HOUR }, campaignIdentity: identity,
}).due, true);
assert.equal(planCohesionOpportunity({
  catalog,
  cohesionState: state({ lastCheckHours: 4 }),
  authoritativeTime: { elapsedSeconds: 8 * HOUR },
  boundary: 'hard:mission-transition',
  campaignIdentity: identity,
}).due, true);
assert.equal(planCohesionOpportunity({
  catalog,
  cohesionState: state({ lastCheckHours: 4 }),
  authoritativeTime: { elapsedSeconds: 7 * HOUR + 3599 },
  boundary: 'soft:scene-close',
  campaignIdentity: identity,
}).due, false);

function findChanceSeed({ unresolved, predicate }) {
  for (let index = 0; index < 5000; index += 1) {
    const result = planCohesionOpportunity({
      catalog,
      cohesionState: state({ unresolved }),
      authoritativeTime: { elapsedSeconds: 4 * HOUR },
      campaignIdentity: { ...identity, campaignId: `campaign.roll.${index}` },
    });
    if (predicate(result)) return result;
  }
  throw new Error('Unable to find deterministic chance seed');
}

const normalHit = findChanceSeed({ unresolved: 3, predicate: (result) => result.roll <= 35 });
const normalMiss = findChanceSeed({ unresolved: 3, predicate: (result) => result.roll > 35 });
assert.equal(normalHit.chancePercent, 35);
assert.equal(normalHit.opportunityEffect.outcome, 'created');
assert.equal(normalMiss.opportunityEffect.outcome, 'none');

const crowdedHit = findChanceSeed({ unresolved: 8, predicate: (result) => result.roll <= 15 });
const crowdedMiss = findChanceSeed({ unresolved: 8, predicate: (result) => result.roll > 15 });
assert.equal(crowdedHit.chancePercent, 15);
assert.equal(crowdedHit.opportunityEffect.outcome, 'created');
assert.equal(crowdedMiss.opportunityEffect.outcome, 'none');

const paused = planCohesionOpportunity({
  catalog,
  cohesionState: state({ total: 39, unresolved: 9 }),
  authoritativeTime: { elapsedSeconds: 4 * HOUR },
  campaignIdentity: identity,
});
assert.equal(paused.due, true);
assert.equal(paused.opportunityEffect.outcome, 'paused');
assert.equal(paused.issueEffect, null);

assert.deepEqual([
  selectWeightedCohesionLevel(1),
  selectWeightedCohesionLevel(50),
  selectWeightedCohesionLevel(51),
  selectWeightedCohesionLevel(80),
  selectWeightedCohesionLevel(81),
  selectWeightedCohesionLevel(95),
  selectWeightedCohesionLevel(96),
  selectWeightedCohesionLevel(100),
], [1, 1, 2, 2, 3, 3, 4, 4]);

const deterministicA = planCohesionOpportunity({
  catalog, cohesionState: state(), authoritativeTime: { elapsedSeconds: 4 * HOUR }, campaignIdentity: identity,
});
const deterministicB = planCohesionOpportunity({
  catalog, cohesionState: state(), authoritativeTime: { elapsedSeconds: 4 * HOUR }, campaignIdentity: identity,
});
assert.deepEqual(deterministicA, deterministicB);
assert.match(deterministicA.issueEffect.targetId, /^cohesion-issue\.[a-f0-9]{24}$/);
assert.equal(deterministicA.issueEffect.segmentIds.length, deterministicA.template.level);
assert.equal(deterministicA.issueEffect.binding.mode, deterministicA.template.bindingMode);
if (deterministicA.template.bindingMode === 'backgroundOnly') {
  assert.match(deterministicA.issueEffect.binding.crew.id, /^cohesion-crew\.[a-f0-9]{24}$/);
  assert.equal(catalog.backgroundCrew.names.includes(deterministicA.issueEffect.binding.crew.name), true);
}

const cooldownIssue = {
  id: 'issue.cooldown', authored: false, templateId: deterministicA.template.id,
  level: deterministicA.template.level, primaryFamily: deterministicA.template.primaryFamily,
  segmentIds: deterministicA.issueEffect.segmentIds, opportunitySequence: 4, sequence: 4,
};
const afterCooldown = planCohesionOpportunity({
  catalog,
  cohesionState: state({ unresolved: 2, lastCheckHours: 4, issues: [cooldownIssue] }),
  authoritativeTime: { elapsedSeconds: 16 * HOUR },
  campaignIdentity: identity,
});
assert.notEqual(afterCooldown.template?.id, deterministicA.template.id);

const recentFamilies = [
  { id: 'issue.recent.1', authored: false, templateId: 'cohesion.l1.handoff-gap', level: 1, primaryFamily: 'coordination', segmentIds: [5], opportunitySequence: 2, sequence: 2 },
  { id: 'issue.recent.2', authored: false, templateId: 'cohesion.l1.next-step-owner', level: 1, primaryFamily: 'coordination', segmentIds: [6], opportunitySequence: 3, sequence: 3 },
];
const diverse = planCohesionOpportunity({
  catalog,
  cohesionState: state({ unresolved: 2, issues: recentFamilies }),
  authoritativeTime: { elapsedSeconds: 4 * HOUR },
  campaignIdentity: { ...identity, campaignId: 'campaign.family-diversity' },
});
assert.notEqual(diverse.template?.primaryFamily, 'coordination');

const levelFourUsed = planCohesionOpportunity({
  catalog,
  cohesionState: state({
    unresolved: 2,
    completedHistory: [{ id: 'done.l4', level: 4, templateId: 'cohesion.l4.long-watch', majorArcId: 'arc.1', sequence: 2 }],
  }),
  authoritativeTime: { elapsedSeconds: 4 * HOUR },
  campaignIdentity: { ...identity, campaignId: 'campaign.level-four-guard' },
  forcedLevelRoll: 100,
});
assert.notEqual(levelFourUsed.template?.level, 4);

console.log('V1 Cohesion scheduler passed.');
