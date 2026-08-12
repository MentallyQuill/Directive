import assert from 'node:assert/strict';

import { extractShipTimeFooter, formatShipTimeFooter } from '../../src/time/ship-time.mjs';

assert.equal(
  formatShipTimeFooter({ stardate: 53068.4, secondOfDay: 0 }),
  '*Stardate 53068.4 | 00:00:00 hours*'
);

assert.deepEqual(
  extractShipTimeFooter('The turbolift doors close.\n\n*Stardate 53068.4 | 08:30:47 hours*\n'),
  {
    narrativeText: 'The turbolift doors close.',
    footer: {
      kind: 'directive.shipTimeFooter.v1',
      text: '*Stardate 53068.4 | 08:30:47 hours*',
      stardate: 53068.4,
      secondOfDay: 30647,
      minuteOfDay: 510
    }
  }
);
assert.equal(
  extractShipTimeFooter('*Stardate 53068.4 | 08:30:47 hours*\n\nThe scene continues.').footer,
  null,
  'Only a final nonblank footer is extracted.'
);
assert.equal(
  extractShipTimeFooter('*Stardate 53068.4 | 24:00:00 hours*').footer,
  null,
  '24:00:00 is not a valid ship time.'
);

console.log('Ship-time formatting and parsing tests passed.');
