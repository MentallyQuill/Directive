import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../docs/design/mockups/directive-expanded-interface.html', import.meta.url),
  'utf8',
);

assert.doesNotMatch(source, /Campaign settings/);
assert.match(source, /grid-template-columns:240px minmax\(0,1fr\)/);
assert.match(source, /const VOYAGER_DIVISION_BY_DEPARTMENT/);
assert.match(source, /const VOYAGER_RANK_PIPS/);
assert.match(source, /function starfleetPips\(person\)/);
assert.match(source, /service:\{organization:'starfleet'/);
assert.match(source, /crew-service-marks/);
assert.match(source, /crew-name-row/);
assert.match(source, /crew-list-pips/);
assert.doesNotMatch(source, /crew-division-bar/);
assert.doesNotMatch(source, /crew-rank-label/);
assert.doesNotMatch(source, /VOYAGER_RANK_SHORT_LABELS/);

console.log('expanded interface mockup contract: PASS');
