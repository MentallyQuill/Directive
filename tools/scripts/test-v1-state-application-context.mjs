import assert from 'node:assert/strict';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';
const initial = () => createAshesInitialState({ campaignId: 'campaign.context', saveId: 'save.context', chatId: 'chat.context' });
const proposal = () => ({ baseRevision: 0, domains: [' mission ', 'mission'], patch: { mission: { v1: { revision: 1 } } },
  source: 'context-test', metadata: { nested: { value: 'original' } } });
let current = initial(), captured, release;
const source = { kind: 'directive.acceptedPairSourcePrecondition.v1', binding: { chatId: 'chat.context' }, snapshot: { rows: ['original'] } };
const signal = new AbortController().signal;
const service = { call() {} }; service.self = service;
const options = { acceptedPairSourcePrecondition: source, signal, service, custom: 'forwarded' };
let checked = false;
const gateway = createStateDeltaGateway({ getState: () => current, setState: next => { assert(checked); current = next; },
  beforeCommit({ options: actual }) { assert.equal(actual, options); checked = true; },
  persist: async (after, descriptor, actual) => { captured = { after, descriptor, options: actual }; await new Promise(resolve => { release = resolve; }); } });
const input = proposal();
const pending = gateway.applyProposal(input, options);
assert.ok(captured.options?.applicationContext, 'persist receives application context even without progressScope');
const context = captured.options.applicationContext;
assert.equal(context.proposalId, current.stateCustody.recentCommitIds.at(-1));
assert.deepEqual(context.domains, ['mission']);
assert.equal(context.descriptor.id, context.proposalId);
assert.equal(captured.descriptor, input, 'original descriptor contract retained');
assert.equal(captured.options.service, service);
assert.equal(captured.options.signal, signal);
assert.equal(captured.options.custom, 'forwarded');
assert.equal(context.before.stateCustody.revision, 0);
assert.equal(context.after.stateCustody.revision, 1);
input.metadata.nested.value = 'changed'; source.snapshot.rows[0] = 'changed';
assert.equal(context.descriptor.metadata.nested.value, 'original');
assert.equal(context.acceptedPairSourcePrecondition.snapshot.rows[0], 'original');
assert.notEqual(context.after, captured.after);
assert(Object.isFrozen(context.after.mission.v1));
assert.throws(() => { context.after.mission.v1.revision = 90; }, TypeError);
assert.equal(Object.hasOwn(context, 'service'), false);
release(); await pending;
let writes = 0;
const noChange = createStateDeltaGateway({ getState: () => current, setState: next => { current = next; }, persist: () => { writes++; }, beforeCommit: () => { throw Error('must not run'); } });
await noChange.applyProposal({ ...proposal(), id: context.proposalId });
await noChange.applyProposal({ ...proposal(), baseRevision: 1 });
assert.equal(writes, 0);
for (const asyncCheck of [false, true]) {
  let state = initial(), sets = 0;
  const blocked = createStateDeltaGateway({ getState: () => state, setState: next => { state = next; sets++; },
    beforeCommit: asyncCheck ? async () => {} : () => { throw Error('blocked'); }, persist: () => { writes++; } });
  await assert.rejects(blocked.applyProposal(proposal()), asyncCheck ? { code: 'DIRECTIVE_V1_STATE_PRECONDITION_ASYNC' } : /blocked/);
  assert.equal(sets, 0);
}
current = initial(); let committed;
const full = createStateDeltaGateway({ getState: () => current, setState: next => { current = next; },
  persist: (_state, _delta, options) => { committed = options.applicationContext; } });
const next = structuredClone(current); next.mission.v1.revision++;
await full.commit(next, { domains: ['mission'], metadata: { proposalId: 'metadata.id' } }, { custom: true });
assert.equal(committed.proposalId, 'metadata.id');
assert.equal(committed.after.stateCustody.recentCommitIds.at(-1), 'metadata.id');
assert.equal(committed.before.stateCustody.revision, 0);
for (const bad of [undefined, () => {}, NaN, new Date(), service]) {
  current = initial(); let sets = 0;
  const invalid = createStateDeltaGateway({ getState: () => current, setState: next => { sets++; current = next; } });
  await assert.rejects(invalid.applyProposal({ ...proposal(), metadata: { evidence: bad } }),
    { code: 'DIRECTIVE_V1_STATE_APPLICATION_DATA_INVALID' });
  assert.equal(sets, 0, 'invalid evidence fails before applying state');
}
for (const code of ['disk-failed', 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN']) {
  current = initial();
  const failing = createStateDeltaGateway({ getState: () => current, setState: next => { current = next; },
    persist: () => { throw Object.assign(Error(code), { code }); } });
  await assert.rejects(failing.applyProposal(proposal()), { code: code === 'disk-failed'
    ? 'DIRECTIVE_V1_STATE_PERSISTENCE_FAILED' : code });
  assert.equal(current.stateCustody.revision, code === 'disk-failed' ? 0 : 1);
}
console.log('PASS immutable state application context');
