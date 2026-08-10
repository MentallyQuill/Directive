import assert from 'node:assert/strict';

import {
  awardV1CommandBearing,
  createV1CommandBearing,
  projectV1CommandBearing,
  refundV1CommandBearingSpend,
  spendV1CommandBearing,
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

let spend = spendV1CommandBearing(bearing, {
  spendId: 'spend.turn.42',
  sourceId: 'turn.42',
  effect: 'narrativeEdge',
  reason: 'Create one credible favorable edge without erasing established costs.'
});
assert.equal(spend.applied, true);
assert.equal(spend.commandBearing.balance, 0);
assert.equal(spend.commandBearing.spends['spend.turn.42'].status, 'committed');
bearing = spend.commandBearing;

spend = spendV1CommandBearing(bearing, {
  spendId: 'spend.turn.42',
  sourceId: 'turn.42',
  effect: 'narrativeEdge',
  reason: 'Duplicate retry must not spend again.'
});
assert.equal(spend.applied, false);
assert.equal(spend.reasonCode, 'already-spent');

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
  latestSpend: {
    id: 'spend.turn.42',
    effect: 'narrativeEdge',
    status: 'refunded',
    reason: 'Create one credible favorable edge without erasing established costs.'
  }
});

console.log('V1 Command Bearing tests passed.');
