import assert from 'node:assert/strict';

import { extractShipTimeFooter, formatShipTimeFooter } from '../../src/time/ship-time.mjs';

assert.equal(
  formatShipTimeFooter({ stardate: 53068.4, minuteOfDay: 0 }),
  '*Stardate 53068.4 | 0000 hours*'
);

assert.deepEqual(
  extractShipTimeFooter('The turbolift doors close.\n\n*Stardate 53068.4 | 0830 hours*\n'),
  {
    narrativeText: 'The turbolift doors close.',
    footer: {
      kind: 'directive.shipTimeFooter.v1',
      text: '*Stardate 53068.4 | 0830 hours*',
      stardate: 53068.4,
      minuteOfDay: 510
    }
  }
);
assert.equal(
  extractShipTimeFooter('*Stardate 53068.4 | 0830 hours*\n\nThe scene continues.').footer,
  null,
  'Only a final nonblank footer is extracted.'
);

console.log('Ship-time formatting and parsing tests passed.');
