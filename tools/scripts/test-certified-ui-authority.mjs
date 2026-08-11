import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const blob = execFileSync('git', [
  'hash-object',
  'docs/design/mockups/directive-expanded-interface.html'
], { encoding: 'utf8' }).trim();

assert.equal(blob, '527bd228a7d7f5839ef543d4c09bb2ce9832b2de');

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
