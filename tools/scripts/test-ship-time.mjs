import assert from 'node:assert/strict';

import {
  extractShipTimeFooter,
  formatShipClock,
  formatStardate,
  formatShipTimeFooter,
  stripGeneratedShipTimeFooter,
} from '../../src/time/ship-time.mjs';

assert.equal(formatShipClock({ secondOfDay: 31059 }), '08:37:39');
assert.equal(formatShipClock({ minuteOfDay: 510 }), '08:30:00');
assert.equal(formatStardate(53068.405312), '53068.4');
assert.equal(formatStardate(Number.NaN), '');
assert.equal(formatStardate(null), '');
assert.equal(formatStardate('  '), '');

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

assert.deepEqual(
  stripGeneratedShipTimeFooter('The turbolift doors close.\n\n*Stardate 53068.4 | 08:30:47 hours*\n'),
  {
    text: 'The turbolift doors close.',
    stripped: true,
    footerText: '*Stardate 53068.4 | 08:30:47 hours*'
  }
);
for (const footer of [
  '*Stardate 53068.4 | 0830 hours*',
  '*Stardate 53068.4 | 0846:15 hours*',
  'Stardate 53068.4 | 08:30:47 hours'
]) {
  assert.deepEqual(
    stripGeneratedShipTimeFooter(`The scene continues.\n\n${footer}`),
    { text: 'The scene continues.', stripped: true, footerText: footer },
    `Generated terminal footer ${footer} is removed.`
  );
}
assert.deepEqual(
  stripGeneratedShipTimeFooter('*Stardate 53068.4 | 08:30:47 hours*\n\nThe scene continues.'),
  {
    text: '*Stardate 53068.4 | 08:30:47 hours*\n\nThe scene continues.',
    stripped: false,
    footerText: null
  },
  'A nonterminal time reference is preserved.'
);
assert.equal(
  stripGeneratedShipTimeFooter('    Indented narrative.\n\n*Stardate 53068.4 | 08:30:47 hours*').text,
  '    Indented narrative.',
  'Stripping a footer preserves leading narrative whitespace.'
);

console.log('Ship-time formatting and parsing tests passed.');
