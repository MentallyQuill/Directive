import assert from 'node:assert/strict';
import * as menu from '../../src/hosts/sillytavern/turn-progress-menu.mjs';
import * as activity from '../../src/hosts/sillytavern/turn-activity-indicator.js';

assert.equal(typeof menu.partitionProgressRows, 'function', 'compact history needs a bounded recent view');
const rows = Array.from({length: 8}, (_, i) => ({id: String(i), state: 'complete'}));
rows[0].state = 'failed';
rows[1].failures = 1;
rows.push({id: 'a', state: 'active'}, {id: 'b', state: 'active'});
const compact = menu.partitionProgressRows(rows);
assert.deepEqual(compact.active.map(row => row.id), ['a', 'b']);
assert.deepEqual(compact.recent.map(row => row.id), ['0', '1', '4', '5', '6', '7'], 'failures remain visible beyond four recent rows');
assert.deepEqual(compact.earlier.map(row => row.id), ['2', '3']);

const token = activity.markDirectiveTurnActivity();
for (let i = 0; i < 45; i++) {
  activity.recordDirectiveTurnProgress({type: 'start', operationId: `op-${i}`, stage: 'directing-story', startedAt: performance.now()});
  activity.recordDirectiveTurnProgress({type: 'finish', operationId: `op-${i}`, outcome: i === 0 ? 'failed' : 'complete', endedAt: performance.now() + 1000});
}
activity.finishDirectiveTurnActivity(token);
const log = activity.__directiveTurnActivityTestHooks.progress().lastLog;
assert.equal(log.rows.length, 45, 'full log retains all model operations, including early failure');
assert.equal(log.rows[0].state, 'failed');
assert.ok(log.rows.every(row => row.state !== 'active'));
assert.equal(activity.__directiveTurnActivityTestHooks.progress().presentation, null, 'retained log does not pretend work is active');
activity.recordDirectiveTurnProgress({type: 'reset'});
assert.equal(activity.__directiveTurnActivityTestHooks.progress().lastLog, null, 'reset clears retained activity');
console.log('PASS compact progress partition and retained log lifecycle');
