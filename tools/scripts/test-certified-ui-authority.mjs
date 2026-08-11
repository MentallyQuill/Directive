import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const blob = execFileSync('git', [
  'hash-object',
  'docs/design/mockups/directive-expanded-interface.html'
], { encoding: 'utf8' }).trim();

assert.equal(blob, 'd92020a2220d364dd14c407974f70f1a10a35f24');

const variances = JSON.parse(readFileSync(
  'tools/fixtures/certified-v1-ui-variances.json',
  'utf8'
));

assert.deepEqual(variances.map(({ id }) => id), [
  'campaign-coming-later',
  'campaign-current-descriptions',
  'creator-wand-modal',
  'bounded-scroll-ownership',
  'people-restored-collections'
]);
assert.equal(new Set(variances.map(({ selector }) => selector)).size, 5);

console.log('PASS certified UI authority');
