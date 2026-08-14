import assert from 'node:assert/strict';

import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import {
  cohesionBandForTotal,
  createCohesionIssueCreatedEffect,
  createCohesionIssueResolvedEffect,
  createCohesionIssueRetiredEffect,
  createCohesionPhaseCompletedEffect,
  deriveCohesionState,
} from '../../src/ship/v1/cohesion-state.mjs';

const fixture = loadAshesRuntimeAssets();
const catalog = fixture.cohesionCatalog;
const shipDataset = fixture.shipDataset;

function settlement(effects = [], { status = 'sealed' } = {}) {
  return { episodes: [{ id: 'episode.test', status, effects }] };
}

function milestone(id, sequence) {
  return {
    id: `effect.milestone.${sequence}`,
    type: 'ship.milestoneCompleted',
    status: 'active',
    targetId: id,
    sequence,
  };
}

const opening = deriveCohesionState({ catalog, shipDataset, storySettlement: settlement(), branchId: 'branch.a' });
assert.equal(opening.total, 75);
assert.equal(opening.band.id, 'ready');
assert.deepEqual(opening.issues.map(({ id }) => id), [
  'cohesion-authored.sensor-calibration',
  'cohesion-authored.systems-integration',
]);
assert.deepEqual(opening.issues.map(({ segmentIds }) => segmentIds), [[0, 1], [2, 3, 4]]);
assert.equal(opening.segments.length, 20);
assert.equal(opening.segments.filter(({ filled }) => !filled).length, 5);
assert.equal(opening.visibleTasks.length, 2);
assert.equal(opening.queuedCount, 0);

const sensorProgress = deriveCohesionState({
  catalog,
  shipDataset,
  storySettlement: settlement([
    milestone('ship-milestone.sensor-controlled-baseline', 1),
  ]),
  branchId: 'branch.a',
});
assert.equal(sensorProgress.issues[0].completedPhaseCount, 1);
assert.equal(sensorProgress.issues[0].currentPhase.id, 'ship-milestone.sensor-live-load-validation');
assert.equal(sensorProgress.total, 75, 'partial progress does not restore a segment');

const authoredRelief = deriveCohesionState({
  catalog,
  shipDataset,
  storySettlement: settlement([createCohesionIssueResolvedEffect({
    id: 'effect.authored.relief',
    issueId: 'cohesion-authored.sensor-calibration',
    cohesionRestored: 10,
    sequence: 1,
    method: 'command-bearing',
    sourceContributionIds: ['contribution.relief'],
  })]),
  branchId: 'branch.a',
});
assert.equal(authoredRelief.total, 85);
assert.equal(authoredRelief.issues.some(({ id }) => id === 'cohesion-authored.sensor-calibration'), false);
assert.equal(authoredRelief.completedHistory[0].method, 'command-bearing');

const createdEffects = Array.from({ length: 7 }, (_, index) => createCohesionIssueCreatedEffect({
  id: `effect.created.${index}`,
  issueId: `issue.generated.${index}`,
  templateId: index === 0 ? 'cohesion.l2.bridge-engineering-lag' : 'cohesion.l1.missed-watch',
  segmentIds: index === 0 ? [5, 6] : [7 + index],
  sequence: index + 10,
  binding: { mode: 'roleOnly', roles: { department: 'operations' } },
  sourceContributionIds: [`contribution.${index}`],
}));
const crowded = deriveCohesionState({
  catalog,
  shipDataset,
  storySettlement: settlement(createdEffects),
  branchId: 'branch.a',
});
assert.equal(crowded.issues.length, 9);
assert.equal(crowded.visibleTasks.length, 5);
assert.equal(crowded.queuedCount, 4);
assert.equal(crowded.queuedCohesion, 20);
assert.equal(crowded.total, 35);
assert.equal(crowded.band.id, 'critical');
assert.equal(crowded.visibleTasks.filter(({ authored }) => !authored).every(({ binding }) => binding != null), true);

const generated = crowded.issues.find(({ id }) => id === 'issue.generated.0');
assert.equal(generated.level, 2);
assert.equal(generated.currentPhase.id, 'trace-directions');

const phase = createCohesionPhaseCompletedEffect({
  id: 'effect.phase.0',
  issueId: generated.id,
  phaseId: generated.currentPhase.id,
  sequence: 30,
  sourceContributionIds: ['contribution.phase.0'],
});
const phased = deriveCohesionState({
  catalog,
  shipDataset,
  storySettlement: settlement([...createdEffects, phase]),
  branchId: 'branch.a',
});
assert.equal(phased.issues.find(({ id }) => id === generated.id).completedPhaseCount, 1);
assert.equal(phased.issues.find(({ id }) => id === generated.id).currentPhase.id, 'set-path');

const resolution = createCohesionIssueResolvedEffect({
  id: 'effect.resolved.0',
  issueId: generated.id,
  cohesionRestored: 10,
  sequence: 31,
  sourceContributionIds: ['contribution.phase.1'],
});
const resolved = deriveCohesionState({
  catalog,
  shipDataset,
  storySettlement: settlement([...createdEffects, phase, resolution]),
  branchId: 'branch.a',
});
assert.equal(resolved.total, 45);
assert.equal(resolved.issues.some(({ id }) => id === generated.id), false);
assert.equal(resolved.completedHistory[0].id, generated.id);
assert.equal(resolved.completedHistory[0].cohesionRestored, 10);

const retired = createCohesionIssueRetiredEffect({
  id: 'effect.retired.1',
  issueId: 'issue.generated.1',
  reason: 'campaign-invalidated',
  sequence: 32,
  sourceContributionIds: ['contribution.retire.1'],
});
const afterRetirement = deriveCohesionState({
  catalog,
  shipDataset,
  storySettlement: settlement([...createdEffects, retired]),
  branchId: 'branch.a',
});
assert.equal(afterRetirement.total, 40);
assert.equal(afterRetirement.issues.some(({ id }) => id === 'issue.generated.1'), false);
assert.equal(afterRetirement.completedHistory.some(({ id }) => id === 'issue.generated.1'), false);

const invalidated = deriveCohesionState({
  catalog,
  shipDataset,
  storySettlement: {
    episodes: [
      { id: 'episode.old', status: 'invalidated', effects: createdEffects.map((effect) => ({ ...effect, status: 'invalidated' })) },
      { id: 'episode.rebuilt', status: 'sealed', effects: [createdEffects[0]] },
    ],
  },
  branchId: 'branch.a',
});
assert.equal(invalidated.issues.some(({ id }) => id === 'issue.generated.1'), false);
assert.equal(invalidated.issues.some(({ id }) => id === 'issue.generated.0'), true);

assert.deepEqual([
  cohesionBandForTotal(100).id,
  cohesionBandForTotal(75).id,
  cohesionBandForTotal(74).id,
  cohesionBandForTotal(40).id,
  cohesionBandForTotal(39).id,
  cohesionBandForTotal(0).id,
], ['ready', 'ready', 'strained', 'strained', 'critical', 'critical']);

assert.throws(
  () => createCohesionIssueCreatedEffect({
    id: 'bad', issueId: 'bad', templateId: 'cohesion.l2.bridge-engineering-lag', segmentIds: [], sequence: 1,
  }),
  /segment/i,
);

console.log('V1 Cohesion state passed.');
