import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const blob = execFileSync('git', [
  'hash-object',
  'docs/design/mockups/directive-expanded-interface.html'
], { encoding: 'utf8' }).trim();

assert.equal(blob, 'e27af8cf19e3d886618e1aee54a9846082301ab7');

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
