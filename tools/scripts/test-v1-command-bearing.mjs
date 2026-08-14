import assert from 'node:assert/strict';

import {
  armV1CommandBearingEdge,
  awardV1CommandBearing,
  commitV1CommandBearingEdge,
  createV1CommandBearing,
  projectV1CommandBearing,
  rebuildV1CommandBearingForLineage,
  refundV1CommandBearingSpend,
  reserveV1CohesionRelief,
  reserveV1CommandBearingEdge,
  validateV1CommandBearing
} from '../../src/command/v1-command-bearing.mjs';

let bearing = createV1CommandBearing({ capacity: 3 });
assert.deepEqual(validateV1CommandBearing(bearing), { ok: true, errors: [] });
assert.equal(bearing.balance, 0);
assert.equal('tracks' in bearing, false);
assert.equal('inspiration' in bearing, false);
assert.equal('resolve' in bearing, false);
assert.equal('marks' in bearing, false);
assert.equal('rank' in bearing, false);

let award = awardV1CommandBearing(bearing, {
  awardId: 'award.hesperus.proportionate-accountability',
  sourceId: 'outcome.hesperus.accountability-decision',
  reason: 'You acted proportionately after the relevant stakes were disclosed.'
});
assert.equal(award.applied, true);
assert.equal(award.commandBearing.balance, 1);
bearing = award.commandBearing;

award = awardV1CommandBearing(bearing, {
  awardId: 'award.hesperus.proportionate-accountability',
  sourceId: 'outcome.hesperus.accountability-decision',
  reason: 'Duplicate retry must not award again.'
});
assert.equal(award.applied, false);
assert.equal(award.reasonCode, 'already-awarded');
assert.equal(award.commandBearing.balance, 1);

let spend = reserveV1CommandBearingEdge(bearing, {
  spendId: 'spend.turn.42',
  reason: 'Create one credible favorable edge without erasing established costs.'
});
assert.equal(spend.applied, true);
assert.equal(spend.commandBearing.balance, 0);
assert.equal(spend.commandBearing.spends['spend.turn.42'].status, 'reserved');
bearing = spend.commandBearing;

spend = reserveV1CommandBearingEdge(bearing, {
  spendId: 'spend.turn.43',
  reason: 'Only one edge may be pending.'
});
assert.equal(spend.applied, false);
assert.equal(spend.reasonCode, 'edge-already-pending');

let armed = armV1CommandBearingEdge(bearing, {
  spendId: 'spend.turn.42',
  playerMessageId: 'player.42'
});
assert.equal(armed.applied, true);
assert.equal(armed.commandBearing.spends['spend.turn.42'].status, 'armed');
bearing = armed.commandBearing;

armed = armV1CommandBearingEdge(bearing, {
  spendId: 'spend.turn.42',
  playerMessageId: 'player.42'
});
assert.equal(armed.applied, false);
assert.equal(armed.reasonCode, 'already-armed');

const committed = commitV1CommandBearingEdge(bearing, {
  spendId: 'spend.turn.42',
  assistantMessageId: 'assistant.42',
  assistantTextHash: '1234abcd',
  acceptedByPlayerMessageId: 'player.43'
});
assert.equal(committed.applied, true);
assert.equal(committed.commandBearing.spends['spend.turn.42'].status, 'committed');
bearing = committed.commandBearing;

const refunded = refundV1CommandBearingSpend(bearing, {
  spendId: 'spend.turn.42',
  reason: 'The provider failed before a response was delivered.'
});
assert.equal(refunded.applied, true);
assert.equal(refunded.commandBearing.balance, 1);
assert.equal(refunded.commandBearing.spends['spend.turn.42'].status, 'refunded');
assert.equal(refundV1CommandBearingSpend(refunded.commandBearing, {
  spendId: 'spend.turn.42',
  reason: 'Duplicate refund.'
}).applied, false);

const projection = projectV1CommandBearing(refunded.commandBearing);
assert.deepEqual(projection, {
  kind: 'directive.commandBearingPlayerProjection.v1',
  balance: 1,
  capacity: 3,
  latestAwardReason: 'You acted proportionately after the relevant stakes were disclosed.',
  pendingEdge: null,
  pendingCohesionRelief: null,
  latestSpend: {
    id: 'spend.turn.42',
    effect: 'narrativeEdge',
    status: 'refunded',
    reason: 'Create one credible favorable edge without erasing established costs.'
  }
});

let reliefBearing = awardV1CommandBearing(refunded.commandBearing, {
  awardId: 'award.cohesion.relief',
  sourceId: 'outcome.cohesion.relief',
  reason: 'Command follow-through earned another point.'
}).commandBearing;
const relief = reserveV1CohesionRelief(reliefBearing, {
  spendId: 'spend.cohesion.1',
  targetIssueId: 'issue.visible.1',
  cohesion: 20,
  reason: 'Commit command attention to resolving this visible issue.'
});
assert.equal(relief.applied, true);
assert.equal(relief.commandBearing.balance, 1);
assert.deepEqual(projectV1CommandBearing(relief.commandBearing).pendingCohesionRelief, {
  id: 'spend.cohesion.1',
  status: 'reserved',
  reason: 'Commit command attention to resolving this visible issue.',
  targetIssueId: 'issue.visible.1',
  cohesion: 20,
});
assert.equal(projectV1CommandBearing(relief.commandBearing).pendingEdge, null);
assert.equal(reserveV1CommandBearingEdge(relief.commandBearing, {
  spendId: 'spend.blocked.edge', reason: 'Mutual exclusion.'
}).reasonCode, 'edge-already-pending');
assert.throws(() => reserveV1CohesionRelief(reliefBearing, {
  spendId: 'spend.bad.relief', targetIssueId: 'issue.visible.1', cohesion: 21, reason: 'Too much.'
}), /20/);

const armedRelief = armV1CommandBearingEdge(relief.commandBearing, {
  spendId: 'spend.cohesion.1', playerMessageId: 'player.cohesion.1'
});
assert.equal(armedRelief.applied, true);
const committedRelief = commitV1CommandBearingEdge(armedRelief.commandBearing, {
  spendId: 'spend.cohesion.1',
  assistantMessageId: 'assistant.cohesion.1',
  assistantTextHash: 'cohesionhash',
  acceptedByPlayerMessageId: 'player.cohesion.2'
});
assert.equal(committedRelief.applied, true);
assert.equal(committedRelief.commandBearing.spends['spend.cohesion.1'].targetIssueId, 'issue.visible.1');
const rebuiltRelief = rebuildV1CommandBearingForLineage(committedRelief.commandBearing, {
  retainedMessages: [],
  completedObjectiveIds: [
    'outcome.hesperus.accountability-decision',
    'outcome.cohesion.relief',
  ],
  now: '2026-08-13T12:30:00.000Z',
});
assert.equal(rebuiltRelief.spends['spend.cohesion.1'].status, 'refunded');
assert.equal(rebuiltRelief.balance, 2);

assert.deepEqual(validateV1CommandBearing({
  ...refunded.commandBearing,
  extraState: true
}).errors, ['Command Bearing contains unsupported field extraState']);

console.log('V1 Command Bearing tests passed.');
