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

assert.deepEqual(
  createTimePlayerProjection({
    campaignState: {
      timeLedger: {
        kind: 'directive.timeLedger.v1',
        stardate: 53068.4,
        shipClock: { minuteOfDay: 510, display: '08:30 hours' },
      },
    },
  }),
  {
    kind: 'directive.timePlayerProjection.v1',
    stardate: 53068.4,
    secondOfDay: 30600,
    clockDisplay: '08:30:00',
    stardateDisplay: '53068.4',
  },
  'Validated minute-only V1 saves project their canonical minute at second zero.',
);

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
