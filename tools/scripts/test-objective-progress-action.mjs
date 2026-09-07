import assert from 'node:assert/strict';
import { configureRuntimeActions, configureRuntimeApp } from '../../src/extension/runtime-mount.js';
import { runRuntimeAction } from '../../src/runtime/runtime-actions.js';

configureRuntimeActions();
const calls = [];
configureRuntimeApp({ adjustObjectiveProgress: async (payload) => {
  calls.push(payload);
  return { ok: true, status: 'committed' };
} });
const payload = { missionId: 'mission.other', objectiveId: 'objective.other', action: 'reopen', expectedRevision: 12, expectedRunId: 'run.other' };
assert.deepEqual(await runRuntimeAction('runtime.adjustObjectiveProgress', payload), { ok: true, status: 'committed' });
assert.deepEqual(calls, [payload]);
configureRuntimeApp(null);
const unavailable = await runRuntimeAction('runtime.adjustObjectiveProgress', payload);
assert.equal(unavailable.ok, false);
assert.match(unavailable.message, /unavailable/i);
assert.equal(calls.length, 1, 'unmount must not retain an old app');
console.log('Objective progress runtime action dispatch passed.');
