import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { captureHostTranscriptSnapshot, HOST_TRANSCRIPT_SNAPSHOT_LIMITS } from '../../src/hosts/transcript-snapshot-contract.mjs';
import { assertAuthorityCapture } from '../../src/storage/v1-branch-history-contracts.mjs';
import { sha256Json } from '../../src/storage/v1-state-delta-codec.mjs';
import { createSillyTavernChatAdapter } from '../../src/hosts/sillytavern/chat-adapter.mjs';

const module = await import('../../src/runtime/v1-branch-history-transcript.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
assert.equal(typeof module.projectBranchHistoryTranscriptV1, 'function',
  'complete captured rows need a disabled canonical projection that preserves source custody');
const { projectBranchHistoryTranscriptV1: project } = module;
const clone = value => structuredClone(value);
const footer = '\n*Stardate 48200.1 | 12:34:56 hours*';
const narrative = 'A'.repeat(9217) + '\nMedical confirms the decisive tail.';
const runtimeMetadata = {
  responseId: 'response.2', promptingPlayerHostMessageId: 'player.1',
  dutyReportManifest: { contractVersion: 2, reportId: 'report.distress', factIds: ['fact.distress'] },
};
const rows = [
  { mes: '', is_system: true, extra: {} },
  { id: 'player.1', mes: 'Please assess readiness.', is_user: true, extra: {} },
  { id: 'assistant.2', mes: narrative + footer, is_user: false, swipe_id: 0,
    swipes: [narrative + footer, 'Unselected account'],
    swipe_info: [{ extra: { runtimeMetadata } }, { extra: { directive: { responseId: 'alternate.2' } } }],
    gen_started: new Date(1789449434311), gen_finished: new Date(1789449479534),
    extra: { runtimeMetadata, directive: { responseId: 'response.2', selectedSwipeAt: 'now' },
      files: [{ name: 'orders.txt', text: 'Complete orders' }], media: [{ url: '/image/chart' }],
      branches: ['child.chat'], token_count: 42, unknownExtension: { futureAuthority: true } } },
  { mes: 'Hidden source', is_hidden: true, extra: {} },
  { mes: 'Unaccepted draft', is_user: true, extra: {} },
];
let invoked = 0;
for (const key of ['file', 'image', 'video']) Object.defineProperty(rows[2].extra, key, {
  enumerable: false, configurable: false,
  get() { invoked++; throw new Error('native alias invoked'); }, set() { invoked++; },
});
const captured = captureHostTranscriptSnapshot({ hostId: 'sillytavern',
  nativeIdentity: { entityType: 'character', entityId: '0', chatId: 'parent.chat' },
  directiveBinding: { hostId: 'sillytavern', entityType: 'character', entityId: '0',
    chatId: 'parent.chat', campaignId: 'campaign.1', saveId: 'save.1' }, rows });
assert.equal(captured.status, 'captured');
const snapshot = captured.snapshot;
const before = JSON.stringify(snapshot);
const result = await project(snapshot);
assert.equal(result.status, 'projected', JSON.stringify(result));
assert.equal(result.transcript.rowCount, rows.length, 'hidden/system/draft rows are retained');
assert.equal(result.transcript.projectionVersion, 1);

// Independent canonical JSON and Node crypto oracle, not the production hash helper.
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}
const hash = value => createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows = snapshot.rows.map((row, index) => hash({
  kind: 'directive.branchHistoryTranscriptRow.v1', version: 1,
  representation: snapshot.representation, index, row,
}));
assert.deepEqual(result.transcript.rowHashes, expectedRows);
assert.equal(result.transcript.vectorHash, hash(expectedRows));
assert.equal(result.transcript.vectorHash, await sha256Json(expectedRows), 'storage uses the same vector encoding');
assert.equal(result.provenance.snapshotHash, hash(snapshot));
assert.deepEqual(result.provenance.nativeIdentity, snapshot.nativeIdentity);
assert.deepEqual(result.provenance.directiveBinding, snapshot.directiveBinding);
assert.equal(JSON.stringify(snapshot), before);
assert.equal(invoked, 0);
assert.ok(Object.isFrozen(result) && Object.isFrozen(result.transcript) && Object.isFrozen(result.transcript.rowHashes));
assert.ok(Object.isFrozen(result.provenance) && Object.isFrozen(result.provenance.directiveBinding));
assert.notEqual(result.provenance.nativeIdentity, snapshot.nativeIdentity, 'provenance is detached');
assertAuthorityCapture({ kind: 'directive.authorityBoundaryCapture.v1', version: 1, mode: 'baseline',
  operationId: 'baseline.1', writerKind: 'test.baseline',
  origin: { campaignId: 'campaign.1', saveId: 'save.1', chatId: 'parent.chat', entityType: 'character', entityId: '0' },
  packageFingerprint: 'a'.repeat(64), before: { revision: 0, stateHash: 'b'.repeat(64) },
  after: { revision: 0, stateHash: 'b'.repeat(64) }, transcript: result.transcript });

const reorderedKeys = JSON.parse(JSON.stringify(snapshot), (_key, value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).reverse());
  return value;
});
assert.deepEqual(await project(reorderedKeys), result, 'JSON roundtrip/key order does not change projection');
const freshDates = clone(snapshot);
freshDates.rows[2].gen_started = new Date(snapshot.rows[2].gen_started);
freshDates.rows[2].gen_finished = new Date(snapshot.rows[2].gen_finished);
assert.deepEqual(await project(freshDates), result, 'trusted native Date paths normalize to persisted ISO');

const mutations = [
  s => { s.rows[1].mes += ' edit'; },
  s => { s.rows[2].mes += ' suffix edit'; },
  s => { s.rows[2].mes = narrative; s.rows[2].swipes[0] = narrative; },
  s => { s.rows[2].swipe_id = 1; s.rows[2].mes = s.rows[2].swipes[1]; },
  s => { s.rows[2].swipes[1] += ' edited alternate'; },
  s => { s.rows[2].id = 'different.id'; },
  s => { s.rows[2].extra.messageId = 'another.id.alias'; },
  s => { s.rows[3].is_hidden = false; },
  s => { s.rows[2].deleted = true; },
  s => { s.rows[2].extra.directive.deleted = true; },
  s => { s.rows[2].extra.runtimeMetadata.responseId = 'changed'; },
  s => { s.rows[2].swipe_info[0].extra.runtimeMetadata.promptingPlayerHostMessageId = 'other.player'; },
  s => { s.rows[2].swipe_info[0].extra.runtimeMetadata.dutyReportManifest.factIds.push('fact.other'); },
  s => { s.rows[2].swipe_info[0].extra.runtimeMetadata.dutyReportManifest = { contractVersion: 999, malformed: 'one' }; },
  s => { s.rows[2].extra.unknownExtension.futureAuthority = false; },
  s => { s.rows[2].extra.files[0].text += ' changed'; },
  s => { s.rows[2].extra.token_count++; },
  s => { s.rows[2].extra.branches.push('new.child'); },
  s => { s.rows[2].extra.directive.selectedSwipeAt = 'later'; },
  s => { [s.rows[0], s.rows[3]] = [s.rows[3], s.rows[0]]; },
  s => { s.rows.splice(2, 1); s.rowCount--; },
];
for (const mutate of mutations) {
  const changed = clone(snapshot); mutate(changed);
  const projected = await project(changed);
  assert.equal(projected.status, 'projected');
  assert.notEqual(projected.transcript.vectorHash, result.transcript.vectorHash, String(mutate));
}
const malformed = clone(snapshot); malformed.rows[2].swipe_id = 999;
const malformedResult = await project(malformed);
assert.equal(malformedResult.status, 'projected', 'projection preserves data, does not assert selected-source validity');
assert.equal(malformedResult.transcript.rowHashes[2], hash({ kind: 'directive.branchHistoryTranscriptRow.v1', version: 1,
  representation: snapshot.representation, index: 2, row: malformed.rows[2] }));
const child = clone(snapshot); child.nativeIdentity.chatId = 'child.chat'; child.directiveBinding.chatId = 'child.chat';
const childResult = await project(child);
assert.deepEqual(childResult.transcript, result.transcript, 'origin is separate from comparable row hashes');
assert.notEqual(childResult.provenance.snapshotHash, result.provenance.snapshotHash);
const appended = clone(snapshot); appended.rows.push({ mes: 'New native reply', is_user: false }); appended.rowCount++;
const appendedResult = await project(appended);
assert.deepEqual(appendedResult.transcript.rowHashes.slice(0, snapshot.rowCount), result.transcript.rowHashes,
  'appending preserves every previously captured row hash');
assert.notEqual(appendedResult.transcript.vectorHash, result.transcript.vectorHash);

// Actual production adapter housekeeping must not become invisible in the hash.
// These are local native-shaped fixtures; save/display functions perform no I/O.
let saved = 0;
const nativeContext = { chat: clone(snapshot.rows), characterId: 0, groupId: null, chatId: 'parent.chat',
  characters: [{ name: 'Narrator', chat: 'parent.chat' }], groups: [],
  chatMetadata: { directiveCampaignBinding: clone(snapshot.directiveBinding) },
  async saveChat() { saved++; }, async updateMessageBlock() {},
};
const adapter = createSillyTavernChatAdapter({ contextFactory: () => nativeContext });
const beforeStrip = await project(adapter.captureCurrentTranscriptSnapshot().snapshot);
assert.deepEqual(beforeStrip, result);
assert.equal((await adapter.stripAssistantTimeFooter({ hostMessageId: 'assistant.2' })).stripped, true);
const afterStrip = await project(adapter.captureCurrentTranscriptSnapshot().snapshot);
assert.notEqual(afterStrip.transcript.rowHashes[2], beforeStrip.transcript.rowHashes[2]);
assert.equal(nativeContext.chat[2].mes, narrative);
await adapter.attachAssistantRuntimeMetadata({ hostMessageId: 'assistant.2', runtimeMetadata: {
  responseId: 'response.attached', promptingPlayerHostMessageId: 'player.1',
  dutyReportManifest: { contractVersion: 2, reportId: 'report.attached', factIds: ['fact.attached'] },
} });
const afterAttachment = await project(adapter.captureCurrentTranscriptSnapshot().snapshot);
assert.notEqual(afterAttachment.transcript.rowHashes[2], afterStrip.transcript.rowHashes[2]);
assert.equal(nativeContext.chat[2].swipe_info[0].extra.runtimeMetadata.responseId, 'response.attached');
assert.equal(saved, 2);
assert.equal(JSON.stringify(snapshot), before, 'adapter probes leave original capture unchanged');

async function unsupported(value, reason = null) {
  const output = await project(value);
  assert.equal(output.status, 'unsupported');
  if (reason) assert.equal(output.reasonCode, reason);
  assert.equal(Object.hasOwn(output, 'transcript'), false, 'no partial hashes');
  assert.ok(Object.isFrozen(output));
}
for (const key of ['kind', 'version', 'representation', 'rowCount', 'hostId']) {
  const invalid = clone(snapshot); invalid[key] = 'invalid'; await unsupported(invalid);
}
const extraHeader = clone(snapshot); extraHeader.unknown = true; await unsupported(extraHeader);
const missing = clone(snapshot); delete missing.directiveBinding; await unsupported(missing);
const undefinedBinding = clone(snapshot); undefinedBinding.directiveBinding = undefined; await unsupported(undefinedBinding);
const wrongBinding = clone(snapshot); wrongBinding.directiveBinding.entityId = 'wrong'; await unsupported(wrongBinding);
for (const path of ['envelope', 'row']) {
  const invalid = clone(snapshot);
  Object.defineProperty(path === 'envelope' ? invalid : invalid.rows[2], path === 'envelope' ? 'rowCount' : 'mes',
    { enumerable: true, get() { invoked++; throw new Error('getter invoked'); } });
  await unsupported(invalid);
}
for (const value of [undefined, NaN, Infinity, 1n, () => 'not JSON', new Date()]) {
  const invalid = clone(snapshot); invalid.rows[2].extra.unknown = value; await unsupported(invalid);
}
const toJSON = clone(snapshot); toJSON.rows[2].toJSON = () => { invoked++; return {}; }; await unsupported(toJSON);
const symbol = clone(snapshot); symbol.rows[2][Symbol('hidden')] = 1; await unsupported(symbol);
const cyclic = clone(snapshot); cyclic.rows[2].extra.loop = cyclic.rows[2]; await unsupported(cyclic);
const sparse = clone(snapshot); delete sparse.rows[1]; await unsupported(sparse);
assert.equal(invoked, 0);

const empty = clone(snapshot); empty.rows = []; empty.rowCount = 0;
assert.equal((await project(empty)).transcript.vectorHash, hash([]));
const large = clone(empty); large.rows = Array.from({ length: HOST_TRANSCRIPT_SNAPSHOT_LIMITS.rows }, () => ({ mes: '' }));
large.rowCount = large.rows.length;
assert.equal((await project(large)).transcript.rowCount, 20000, 'all supported rows, including beyond 10,000');
large.rows.push({ mes: '' }); large.rowCount++;
await unsupported(large, 'DIRECTIVE_HOST_TRANSCRIPT_LIMIT_EXCEEDED');
const oversized = clone(empty); oversized.rows = [{ mes: 'x'.repeat(HOST_TRANSCRIPT_SNAPSHOT_LIMITS.rowBytes) }]; oversized.rowCount = 1;
await unsupported(oversized, 'DIRECTIVE_HOST_TRANSCRIPT_LIMIT_EXCEEDED');
const deep = clone(empty); deep.rows = [{ extra: {} }]; deep.rowCount = 1;
let cursor = deep.rows[0].extra;
for (let i = 0; i < HOST_TRANSCRIPT_SNAPSHOT_LIMITS.depth; i++) { cursor.next = {}; cursor = cursor.next; }
await unsupported(deep, 'DIRECTIVE_HOST_TRANSCRIPT_LIMIT_EXCEEDED');

const mutable = clone(snapshot);
const pending = project(mutable);
mutable.rows[2].mes = 'Edit after projection call'; mutable.nativeIdentity.chatId = 'later.chat';
assert.deepEqual(await pending, result, 'all source/provenance detached before first hash await');
console.log('PASS branch history transcript projection: complete rows, custody mutations, strict bounds, immutable provenance, storage hashes');
