import assert from 'node:assert/strict';

import {
  applyV1StateDelta,
  canonicalJson,
  encodeV1StateDelta,
  sha256Json,
} from '../../src/storage/v1-state-delta-codec.mjs';

const before = {
  stateCustody: { revision: 7 },
  campaign: { title: 'Ashes', flags: { ready: false, obsolete: true } },
  storySettlement: {
    episodes: [{ id: 'episode.one', status: 'open' }],
    receipts: [],
  },
};
const after = {
  stateCustody: { revision: 8 },
  campaign: { title: 'Ashes of Peace', flags: { ready: true } },
  storySettlement: {
    episodes: [{ id: 'episode.one', status: 'sealed' }],
    receipts: [{ id: 'receipt.one' }],
  },
};

assert.equal(
  canonicalJson({ z: 1, nested: { b: 2, a: 1 } }),
  canonicalJson({ nested: { a: 1, b: 2 }, z: 1 }),
);
assert.equal(
  await sha256Json({ z: 1, nested: { b: 2, a: 1 } }),
  await sha256Json({ nested: { a: 1, b: 2 }, z: 1 }),
);

const delta = await encodeV1StateDelta({
  saveId: 'save.alpha',
  before,
  after,
  changedRoots: ['campaign', 'storySettlement', 'stateCustody'],
  createdAt: '2026-08-15T12:00:00.000Z',
  source: 'test',
});

assert.equal(delta.kind, 'directive.campaignStateDelta.v1');
assert.equal(delta.beforeRevision, 7);
assert.equal(delta.afterRevision, 8);
assert.deepEqual(delta.changedRoots, ['campaign', 'stateCustody', 'storySettlement']);
assert.ok(delta.operations.some((operation) => operation.op === 'splice'
  && operation.path.join('.') === 'storySettlement.receipts'));
assert.ok(delta.operations.some((operation) => operation.op === 'delete'
  && operation.path.join('.') === 'campaign.flags.obsolete'));
assert.equal(
  delta.operations.some((operation) => operation.op === 'set' && operation.path.length === 1),
  false,
  'ordinary nested changes must not replace a complete state root',
);

assert.deepEqual(
  await applyV1StateDelta({ saveId: 'save.alpha', state: before, delta }),
  after,
);

await assert.rejects(
  applyV1StateDelta({ saveId: 'save.beta', state: before, delta }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_DELTA_SAVE_MISMATCH',
);

await assert.rejects(
  applyV1StateDelta({
    saveId: 'save.alpha',
    state: before,
    delta: { ...structuredClone(delta), unexpected: true },
  }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_DELTA_REJECTED',
  'unknown top-level fields must be rejected before replay',
);

console.log('V1 state delta codec passed.');
