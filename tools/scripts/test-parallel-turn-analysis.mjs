import assert from 'node:assert/strict';
import { createParallelTurnAnalysis } from '../../src/runtime/parallel-turn-analysis.mjs';
import { createTurnAnalysisKey } from '../../src/runtime/turn-analysis-key.mjs';
const deferred = () => { let resolve; return { promise: new Promise(r => { resolve = r; }), resolve: v => resolve(v) }; };
const i = deferred(); const d = deferred(); const started = [];
let ic = 0; let dc = 0;
const analysis = createParallelTurnAnalysis({
  interpret: async () => { started.push('i'); ic++; return i.promise; },
  direct: async () => { started.push('d'); return ++dc === 1 ? d.promise : { ok: true, proposal: {} }; },
});
const args = { key: 'one', interpreterRequest: { a: 1 }, directorRequest: { b: 2 } };
const original = structuredClone(args);
const pending = analysis.run(args);
assert.throws(()=>analysis.clear(),/flight-active/);
assert.deepEqual(started, ['i', 'd']);
assert.equal(analysis.run(args), pending);
i.resolve({ ok: true }); d.resolve({ ok: false, reasonCode: 'director-timeout' });
assert.equal((await pending).ok, false);
assert.equal((await analysis.run(args)).ok, true);
assert.equal(ic, 1); assert.equal(dc, 2); assert.deepEqual(args, original);
await analysis.run({ ...args, key: 'two' }); assert.equal(ic, 2);
const abort = new AbortController(); abort.abort();
assert.equal((await analysis.run({ ...args, key: 'three', signal: abort.signal })).reasonCode, 'aborted');
assert.equal(ic, 2);
const slow = deferred(); const active = new AbortController();
const aborted = createParallelTurnAnalysis({ interpret: () => slow.promise, direct: () => slow.promise });
const flight = aborted.run({ ...args, signal: active.signal }); active.abort(); slow.resolve({ ok: true });
assert.equal((await flight).ok, false);
let calls = 0;
const inverse = createParallelTurnAnalysis({ interpret: async () => (++calls === 1 ? {ok:false} : {ok:true}), direct: async () => ({ok:true}) });
assert.equal((await inverse.run(args)).ok, false); assert.equal((await inverse.run(args)).ok, true);
const malformed = createParallelTurnAnalysis({ interpret: async () => undefined, direct: async () => ({ok:true}) });
assert.equal((await malformed.run(args)).ok, false);
const mutating = createParallelTurnAnalysis({ interpret: async ({request}) => {request.a=99;return {ok:true};}, direct: async ({request}) => {request.b=99;return {ok:true};} });
await mutating.run(args); assert.deepEqual(args,original);
const keyInput = { envelope: {revision: 1}, interpreterRequest: {a:1}, directorRequest:{b:2}, providerFingerprints:{model:'x'} };
const key = await createTurnAnalysisKey(keyInput);
assert.equal(key, await createTurnAnalysisKey(structuredClone(keyInput)));
for (const field of Object.keys(keyInput)) assert.notEqual(key, await createTurnAnalysisKey({...keyInput, [field]: {changed:true}}));
console.log('Parallel turn analysis tests passed.');

const fourGate = deferred(); const fourStarted = [];
const four = createParallelTurnAnalysis({
  interpret: async () => { fourStarted.push('interpreter'); return fourGate.promise; },
  direct: async () => { fourStarted.push('director'); return fourGate.promise; },
  continuity: async () => { fourStarted.push('continuity'); return fourGate.promise; },
  review: async () => { fourStarted.push('episode'); return fourGate.promise; },
});
const fourPending = four.run({ ...args, episodeRequest: { due: true } });
assert.equal(fourStarted.length, 4);
fourGate.resolve({ ok: true });
assert.equal((await fourPending).ok, true);
fourStarted.length = 0;
await four.run({ ...args, key: 'not-due', episodeRequest: null });
assert.deepEqual(fourStarted, ['interpreter', 'director', 'continuity']);
let attempts = 0; let successes = 0;
const bounded = createParallelTurnAnalysis({
  maxAttempts: 2,
  interpret: async () => { successes++; return { ok: true }; },
  direct: async () => { attempts++; return { ok: false }; },
});
assert.equal((await bounded.run(args)).ok, false);
assert.equal(attempts, 2);
assert.equal(successes, 1);
assert.equal((await bounded.run(args)).ok, false);
assert.equal(attempts, 4);
assert.equal(successes, 1);
console.log('Focused coordinator concurrency, due gating, and retry tests passed.');
