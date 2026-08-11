import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const blob = execFileSync('git', [
  'hash-object',
  'docs/design/mockups/directive-expanded-interface.html'
], { encoding: 'utf8' }).trim();

assert.equal(blob, 'ef26440203a59a8e9b07c2a19cad67a2260350f7');

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
