import assert from 'node:assert/strict';
import { createSillyTavernChatAdapter } from '../../src/hosts/sillytavern/chat-adapter.mjs';
import { createFakeChatAdapter } from '../../src/hosts/fake/fake-host.mjs';
import { assertDirectiveChatAdapter } from '../../src/hosts/host-contract.mjs';
import { captureHostTranscriptSnapshot } from '../../src/hosts/transcript-snapshot-contract.mjs';

const MiB = 1024 * 1024;
let getterCalls = 0;
function nativeAliases(extra) {
  for (const key of ['file', 'image', 'video']) Object.defineProperty(extra, key, {
    enumerable: false, configurable: false,
    get() { getterCalls++; throw new Error('native compatibility getter must not execute'); },
    set() { getterCalls++; throw new Error('native compatibility setter must not execute'); },
  });
  return extra;
}
function nativeRows() {
  const start = new Date(1789449434311), finish = new Date(1789449479534);
  const runtimeMetadata = { responseId: 'response.48', dutyReportManifest: {
    kind: 'directive.dutyReportManifest.v1', reportId: 'report.actual-source', factIds: ['fact.distress'],
  } };
  return [
    { mes: '', is_system: true, extra: nativeAliases({}) },
    { mes: 'Hidden source', is_hidden: true, extra: nativeAliases({}) },
    {
      mes: 'A'.repeat(9217) + '\nDecisive Medical tail.', is_user: false,
      gen_started: start, gen_finished: finish, swipe_id: 0,
      swipes: ['A'.repeat(9217) + '\nDecisive Medical tail.', 'Unselected alternate'],
      swipe_info: [{ gen_started: start, gen_finished: finish, extra: { runtimeMetadata } }],
      extra: nativeAliases({ directive: { responseId: 'response.48', idempotencyKey: 'turn.48' },
        files: [{ name: 'orders.txt', url: '/file/orders', text: 'Complete orders' }],
        media: [{ type: 'image', url: '/image/chart' }, { type: 'video', url: '/video/report' }],
        media_index: 1, media_display: 'gallery', runtimeMetadata,
      }),
    },
    { mes: 'Unaccepted draft', is_user: true, extra: nativeAliases({}) },
  ];
}
function context(rows = nativeRows()) {
  return { chat: rows, characterId: 0, groupId: null, chatId: 'native.chat',
    characters: [{ name: 'Native Narrator', chat: 'native.chat' }], groups: [],
    chatMetadata: { directiveCampaignBinding: {
      hostId: 'sillytavern', campaignId: 'campaign.owner', saveId: 'save.owner',
      chatId: 'native.chat', entityType: 'character', entityId: '0',
    } },
  };
}
function capture(ctx) {
  return createSillyTavernChatAdapter({ contextFactory: () => ctx }).captureCurrentTranscriptSnapshot();
}
function supported(ctx) {
  const result = capture(ctx);
  assert.equal(result?.then, undefined, 'snapshot is synchronous');
  assert.equal(result.status, 'captured', JSON.stringify(result));
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.snapshot));
  return result.snapshot;
}
function unsupported(ctx, code = 'DIRECTIVE_HOST_TRANSCRIPT_UNSUPPORTED') {
  const result = capture(ctx);
  assert.equal(result.status, 'unsupported', 'never return a partial snapshot');
  assert.equal(result.reasonCode, code);
  assert.ok(Object.isFrozen(result));
  assert.equal(Object.hasOwn(result, 'snapshot'), false);
}

// Meaningful native-shaped RED: the new API must capture all native persisted
// row data, despite compatibility accessors and fresh generation Date fields.
const ctx = context();
const sourceDescriptors = ctx.chat.map(row => Object.getOwnPropertyDescriptors(row.extra));
const oracle = JSON.parse(JSON.stringify(ctx.chat)); // Controlled native-shaped fixture only.
let contextsRead = 0;
const adapter = createSillyTavernChatAdapter({ contextFactory() { contextsRead++; return ctx; } });
assert.equal(typeof adapter.captureCurrentTranscriptSnapshot, 'function',
  'a complete synchronous native snapshot must be available independently of recent-message normalization');
const snapshot = adapter.captureCurrentTranscriptSnapshot().snapshot;
assert.equal(contextsRead, 1, 'one native context per complete capture');
assert.equal(snapshot.kind, 'directive.hostTranscriptSnapshot.v1');
assert.equal(snapshot.representation, 'sillytavern.persistable-row-data.v1');
assert.deepEqual(snapshot.nativeIdentity, { chatId: 'native.chat', entityType: 'character', entityId: '0' });
assert.deepEqual(snapshot.rows, oracle, 'full native persistence-shaped oracle, including selected source authority');
assert.equal(snapshot.rowCount, ctx.chat.length);
assert.equal(getterCalls, 0);
assert.deepEqual(ctx.chat.map(row => Object.getOwnPropertyDescriptors(row.extra)), sourceDescriptors);
assert.ok(ctx.chat[2].gen_started instanceof Date, 'capture never replaces live Date fields');
assert.ok(Object.isFrozen(snapshot.rows[2].swipe_info[0].extra.runtimeMetadata.dutyReportManifest));
ctx.chat[2].mes = 'Edited after capture';
ctx.chat[2].extra.files[0].text = 'Later file content';
ctx.chat[2].gen_started.setTime(0);
ctx.chatMetadata.directiveCampaignBinding.saveId = 'later-save';
assert.deepEqual(snapshot.rows, oracle, 'detached snapshot cannot follow later native edits');
assert.equal(snapshot.directiveBinding.saveId, 'save.owner');
assert.deepEqual(supported(context(oracle)).rows, snapshot.rows, 'native save/reload Date conversion preserves snapshot data');

// Native Continue subtracts Number(ISO-string) timestamps after reload, making
// its generation timer an invalid Date. Native JSON persistence writes null.
{
  const rows = JSON.parse(JSON.stringify(nativeRows()));
  const reply = rows[2];
  const invalidStart = new Date(Date.now() - (Number(reply.gen_finished) - Number(reply.gen_started)));
  assert.ok(Number.isNaN(invalidStart.getTime()));
  reply.gen_started = invalidStart;
  reply.swipe_info[0].gen_started = invalidStart;
  reply.swipe_info[0].gen_finished = new Date(Number.NaN);
  const persisted = JSON.parse(JSON.stringify(rows));
  assert.equal(persisted[2].gen_started, null);
  assert.deepEqual(supported(context(rows)).rows, persisted,
    'Continue timer failure must not prevent an exact persisted-row snapshot');
  assert.equal(reply.gen_started, invalidStart, 'sampling does not mutate the native timer');
}

const previousGlobalChat = globalThis.chat;
try {
  globalThis.chat = Array.from({ length: 20 }, () => ({ mes: 'stale global source' }));
  assert.equal(supported(context([{ mes: 'only live native row' }])).rowCount, 1);
  unsupported({ ...context(), chat: undefined });
} finally { if (previousGlobalChat === undefined) delete globalThis.chat; else globalThis.chat = previousGlobalChat; }
assert.equal(supported(context([])).rowCount, 0);
const unbound = context([{ mes: 'ordinary chat' }]);
delete unbound.chatMetadata.directiveCampaignBinding;
assert.equal(supported(unbound).directiveBinding, null);
unsupported({ ...context(), characterId: null });
unsupported({ ...context(), chatId: 'other.chat' });
unsupported({ ...context(), characters: [] });
unsupported({ ...context(), chat: Promise.resolve([]) });
unsupported(Promise.resolve(context()));
unsupported(null);
const staleBinding = context();
staleBinding.chatMetadata.directiveCampaignBinding.entityId = 'other';
unsupported(staleBinding);
const group = context([{ mes: 'group source' }]);
Object.assign(group, { groupId: 'group.0', characterId: null, chatId: 'group.chat',
  groups: [{ id: 'group.0', chat_id: 'group.chat' }], chatMetadata: {} });
assert.deepEqual(supported(group).nativeIdentity, { entityType: 'group', entityId: 'group.0', chatId: 'group.chat' });
unsupported({ ...group, groups: [{ id: 'group.0', chat_id: 'wrong' }] });
unsupported({ ...group, groups: [group.groups[0], group.groups[0]] });
const badContext = context();
Object.defineProperty(badContext, 'chat', { get() { getterCalls++; throw new Error('context getter'); } });
unsupported(badContext);

// Native exceptions are path/descriptor scoped, never generic getter evaluation.
for (const build of [
  () => ({ get mes() { getterCalls++; return 'unsafe'; } }),
  () => ({ mes: 'x', extra: { get image() { getterCalls++; return 'unsafe'; } } }),
  () => ({ mes: 'x', extra: { directive: nativeAliases({}) } }),
  () => ({ mes: 'x', get toJSON() { getterCalls++; return () => ({}); } }),
  () => ({ mes: 'x', toJSON() { getterCalls++; return {}; } }),
  () => ({ mes: 'x', extra: { runtimeMetadata: { get dutyReportManifest() { getterCalls++; return {}; } } } }),
  () => Object.defineProperty({ mes: 'x' }, 'hiddenValue', { value: 'unserialized authority' }),
  () => ({ mes: 'x', [Symbol('private')]: true }),
  () => ({ mes: 'x', unsupported: undefined }),
  () => ({ mes: 'x', unsupported: Number.NaN }),
  () => ({ mes: 'x', unsupported: 1n }),
  () => ({ mes: 'x', unsupported: new Map() }),
  () => ({ mes: 'x', unsupported: new Date(0) }),
  () => ({ mes: 'x', unsupported: new Date(Number.NaN) }),
  () => ({ mes: 'x', extra: { gen_started: new Date(Number.NaN) } }),
  () => ({ mes: 'x', gen_started: Object.assign(new Date(0), { toJSON() { getterCalls++; return 'fake'; } }) }),
  () => ({ mes: 'x', gen_started: new (class extends Date {})(0) }),
]) unsupported(context([build()]));
const cyclic = { mes: 'x' }; cyclic.self = cyclic;
unsupported(context([cyclic]));
unsupported(context(new Array(2)));
unsupported(context([null]));
unsupported(context([{ mes: 'x', swipes: new Array(1) }]));
const aliased = { text: 'same object used twice, not a cycle' };
assert.deepEqual(supported(context([{ mes: 'x', left: aliased, right: aliased }])).rows[0].left, aliased);
assert.deepEqual(supported(context([{ mes: 'x', extra: { image: 'legacy.png', file: { url: 'legacy.txt' } } }])).rows[0].extra,
  { image: 'legacy.png', file: { url: 'legacy.txt' } });
assert.equal(getterCalls, 0, 'no native or untrusted getter/toJSON may execute');
const getterInput = captureHostTranscriptSnapshot({ get rows() { getterCalls++; return []; } });
assert.equal(getterInput.status, 'unsupported');
assert.equal(getterCalls, 0, 'the shared capture helper must also read input descriptors without invoking getters');

const changedManifest = context(oracle);
changedManifest.chat[2].swipe_info[0].extra.runtimeMetadata.dutyReportManifest.factIds.push('fact.changed');
assert.notDeepEqual(supported(changedManifest).rows, snapshot.rows, 'same prose with changed source authority must remain distinguishable');
assert.equal(supported(context(Array.from({ length: 10001 }, (_, i) => ({ mes: `row ${i}` })))).rowCount, 10001);
assert.equal(supported(context(Array.from({ length: 20000 }, () => ({})))).rowCount, 20000);
const limitCode = 'DIRECTIVE_HOST_TRANSCRIPT_LIMIT_EXCEEDED';
unsupported(context(Array.from({ length: 20001 }, () => ({}))), limitCode);
assert.equal(new TextEncoder().encode(JSON.stringify({ mes: 'x'.repeat(MiB - 10) })).byteLength, MiB);
assert.equal(supported(context([{ mes: 'x'.repeat(MiB - 10) }])).rows[0].mes.length, MiB - 10);
unsupported(context([{ mes: 'x'.repeat(MiB - 9) }]), limitCode);
const unicodeAtLimit = 'é'.repeat((MiB - 10) / 2);
assert.equal(supported(context([{ mes: unicodeAtLimit }])).rows[0].mes, unicodeAtLimit);
unsupported(context([{ mes: unicodeAtLimit + 'x' }]), limitCode);
// Exact aggregate boundary includes identity/binding/envelope punctuation.
const base = supported(context([]));
const overhead = new TextEncoder().encode(JSON.stringify({ ...base, rowCount: 64, rows: [] })).byteLength;
const largeRows = Array.from({ length: 63 }, () => ({ mes: 'x'.repeat(MiB - 10) }));
const finalBytes = 64 * MiB - overhead - 63 * MiB - 63;
largeRows.push({ mes: 'x'.repeat(finalBytes - 10) });
assert.equal(new TextEncoder().encode(JSON.stringify({ ...base, rowCount: 64, rows: largeRows })).byteLength, 64 * MiB);
assert.equal(supported(context(largeRows)).rowCount, 64);
largeRows[63].mes += 'x';
unsupported(context(largeRows), limitCode);
function nested(depth) { let value = 'leaf'; for (let i = 0; i < depth; i++) value = { child: value }; return value; }
supported(context([{ mes: 'x', nested: nested(61) }]));
unsupported(context([{ mes: 'x', nested: nested(62) }]), limitCode);
// Slot budget is independent of byte/depth/row budgets: many small properties.
unsupported(context(Array.from({ length: 20000 }, () => ({ values: Array(100).fill(0) }))), limitCode);
function jsonSlots(value) {
  return 1 + (value && typeof value === 'object'
    ? Object.keys(value).reduce((total, key) => total + 1 + jsonSlots(value[key]), 0) : 0);
}
const exactSlotRows = [{ values: [], extra: nativeAliases({}) }, { values: [] }, { values: [] }];
const baseSlots = jsonSlots({ ...base, rowCount: 3, rows: exactSlotRows }) + 3; // excluded alias descriptors still cost slots
const numericSlots = (2000000 - baseSlots) / 2;
assert.ok(Number.isInteger(numericSlots));
exactSlotRows[0].values = Array(333000).fill(0);
exactSlotRows[1].values = Array(333000).fill(0);
exactSlotRows[2].values = Array(numericSlots - 666000).fill(0);
assert.equal(supported(context(exactSlotRows)).rowCount, 3, 'inclusive two-million traversal-slot boundary');
exactSlotRows[2].values.push(0);
unsupported(context(exactSlotRows), limitCode);

assert.doesNotThrow(() => assertDirectiveChatAdapter({}));
assert.throws(() => assertDirectiveChatAdapter({ captureCurrentTranscriptSnapshot: 1 }));
const fake = createFakeChatAdapter({ messages: [{ id: '0', text: 'Complete fake source' }] });
const fakeSnapshot = fake.captureCurrentTranscriptSnapshot();
assert.equal(fakeSnapshot.status, 'captured');
assert.equal(fakeSnapshot.snapshot.rowCount, 1);
assert.equal(fakeSnapshot.snapshot.rows[0].text, 'Complete fake source');
assert.equal(fakeSnapshot.snapshot.hostId, 'fake');
console.log('Host transcript snapshot tests passed: native media/Date oracle, identity, source metadata, immutable full rows and exact bounds.');
