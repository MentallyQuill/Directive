import assert from 'node:assert/strict';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';

const initial = () => createAshesInitialState({ campaignId: 'campaign.capture', saveId: 'save.capture', chatId: 'chat.capture' });
const proposal = (extra = {}) => ({ id: 'capture.change', baseRevision: 0, domains: ['mission'],
  patch: { mission: { v1: { revision: 1 } } }, ...extra });
let current = initial(), persisted, release, observed;
const order = [], evidence = { snapshot: { rows: ['before'] } };
const gateway = createStateDeltaGateway({ getState: () => current,
  beforeCommit: () => order.push('admit'),
  captureApplication: context => {
    order.push('capture'); observed = context;
    assert.equal(current.stateCustody.revision, 0);
    assert.equal(context.before.stateCustody.revision, 0);
    assert.equal(context.after.stateCustody.revision, 1);
    assert(Object.isFrozen(context.after.mission.v1));
    return evidence;
  },
  setState: next => { order.push('apply'); evidence.snapshot.rows[0] = 'after'; current = next; },
  persist: async (_after, _descriptor, options) => {
    order.push('persist'); persisted = options.applicationContext;
    await new Promise(resolve => { release = resolve; });
  },
});
const pending = gateway.applyProposal(proposal(), { applicationContext: { capture: 'spoof' } });
assert.deepEqual(order, ['admit', 'capture', 'apply', 'persist']);
assert.equal(persisted.capture.snapshot.rows[0], 'before');
assert.equal(persisted.before, observed.before);
assert(Object.isFrozen(persisted.capture.snapshot.rows));
assert.throws(() => { persisted.capture.snapshot.rows[0] = 'mutated'; }, TypeError);
release(); await pending;
await gateway.applyProposal(proposal());
await gateway.applyProposal(proposal({ id: 'no-change', baseRevision: 1 }));
assert.equal(order.filter(item => item === 'capture').length, 1, 'duplicate/no-op does not create an observation');

for (const captureApplication of [() => { throw Error('not-finalized'); }, async () => ({}),
  () => Promise.reject(Error('async rejection')), () => undefined, () => ({ bad: new Date() }),
  () => Object.defineProperty({}, 'rows', { enumerable: true, get() { throw Error('getter invoked'); } })]) {
  let state = initial(), sets = 0, writes = 0;
  const blocked = createStateDeltaGateway({ getState: () => state, setState: next => { sets++; state = next; },
    captureApplication, persist: () => writes++ });
  await assert.rejects(blocked.applyProposal(proposal()));
  assert.equal(sets, 0); assert.equal(writes, 0); assert.equal(state.stateCustody.revision, 0);
}
await new Promise(resolve => setTimeout(resolve, 0));
let thenGetterCalls = 0, getterSets = 0;
const getterCapture = createStateDeltaGateway({ getState: initial, setState() { getterSets++; },
  captureApplication: () => Object.defineProperty({}, 'then', { enumerable: true,
    get() { thenGetterCalls++; return undefined; } }) });
await assert.rejects(getterCapture.applyProposal(proposal()), { code: 'DIRECTIVE_V1_STATE_APPLICATION_DATA_INVALID' });
assert.equal(thenGetterCalls, 0, 'capture detachment must never invoke a then accessor');
assert.equal(getterSets, 0);
for (const descriptor of [proposal({ persist: false }), proposal()]) {
  let state = initial(), calls = 0;
  const guarded = createStateDeltaGateway({ getState: () => state, setState: next => { state = next; },
    captureApplication: () => { calls++; throw Error('enrolled-writer-refused'); } });
  await assert.rejects(guarded.applyProposal(descriptor), /enrolled-writer-refused/);
  assert.equal(calls, 1); assert.equal(state.stateCustody.revision, 0);
}
let state = initial(), complete;
const full = createStateDeltaGateway({ getState: () => state, setState: next => { state = next; },
  captureApplication: context => ({ proposalId: context.proposalId }),
  persist: (_after, _descriptor, options) => { complete = options.applicationContext; } });
const next = structuredClone(state); next.mission.v1.revision++;
await full.commit(next, { domains: ['mission'], metadata: { proposalId: 'full.commit' } });
assert.equal(complete.capture.proposalId, 'full.commit');
assert.throws(() => createStateDeltaGateway({ getState: initial, setState() {}, captureApplication: true }), TypeError);
console.log('State application capture: synchronous ownership, immutable evidence, bypass refusal, replay/no-op and full commit passed.');
