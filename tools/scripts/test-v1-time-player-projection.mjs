import assert from 'node:assert/strict';

import { createTimePlayerProjection } from '../../src/projection/v1/time-projection.mjs';

const projection = createTimePlayerProjection({
  campaignState: {
    campaign: { currentStardate: 53068.405312 },
    timeLedger: {
      kind: 'directive.timeLedger.v1',
      stardate: 53068.405312,
      shipClock: {
        secondOfDay: 31059,
        minuteOfDay: 517,
        display: '08:37:39 hours',
      },
    },
  },
});

assert.deepEqual(projection, {
  kind: 'directive.timePlayerProjection.v1',
  stardate: 53068.405312,
  secondOfDay: 31059,
  clockDisplay: '08:37:39',
  stardateDisplay: '53068.4',
});

assert.throws(
  () => createTimePlayerProjection({ campaignState: {} }),
  (error) => error.code === 'DIRECTIVE_V1_TIME_PROJECTION_INVALID',
);

assert.throws(
  () => createTimePlayerProjection({
    campaignState: {
      timeLedger: {
        kind: 'directive.timeLedger.v1',
        stardate: 53068.4,
        shipClock: { secondOfDay: -1, minuteOfDay: -1 },
      },
    },
  }),
  (error) => error.code === 'DIRECTIVE_V1_TIME_PROJECTION_INVALID',
);

console.log('V1 time player projection tests passed.');
