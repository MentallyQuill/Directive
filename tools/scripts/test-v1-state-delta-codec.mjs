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

const beforeRing = structuredClone(before);
beforeRing.stateCustody.recentCommitIds = Array.from({ length: 64 }, (_, index) => `commit.${index}`);
const afterRing = structuredClone(beforeRing);
afterRing.stateCustody.revision = 8;
afterRing.stateCustody.recentCommitIds = [
  ...beforeRing.stateCustody.recentCommitIds.slice(1),
  'commit.64',
];
const ringDelta = await encodeV1StateDelta({
  saveId: 'save.alpha',
  before: beforeRing,
  after: afterRing,
  changedRoots: ['stateCustody'],
  createdAt: '2026-08-15T12:01:00.000Z',
  source: 'test-ring',
});
assert.ok(ringDelta.operations.length <= 3, 'a bounded custody ring shift must not emit one operation per item');
assert.deepEqual(await applyV1StateDelta({ saveId: 'save.alpha', state: beforeRing, delta: ringDelta }), afterRing);

const missingMetadataDelta = structuredClone(ringDelta);
delete missingMetadataDelta.source;
await assert.rejects(
  applyV1StateDelta({ saveId: 'save.alpha', state: beforeRing, delta: missingMetadataDelta }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_DELTA_REJECTED',
  'persisted deltas must contain every required top-level field',
);

const hiddenArrayPropertyDelta = structuredClone(ringDelta);
hiddenArrayPropertyDelta.operations.unshift({
  op: 'set',
  path: ['stateCustody', 'recentCommitIds', 'hidden'],
  value: 'not-json-visible',
});
await assert.rejects(
  applyV1StateDelta({ saveId: 'save.alpha', state: beforeRing, delta: hiddenArrayPropertyDelta }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_DELTA_SET_INVALID',
  'array mutations must use existing numeric indexes or splice operations',
);

console.log('V1 state delta codec passed.');
