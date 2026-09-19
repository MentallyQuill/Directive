import assert from 'node:assert/strict';
import { sha256Json } from '../../src/storage/v1-state-delta-codec.mjs';
import * as contracts from '../../src/storage/v2-branch-history-contracts.mjs';
import { prepareV2BranchHistoryVector } from '../../src/storage/v2-branch-history-storage.mjs';

const rows = await Promise.all(Array.from({ length: 600 }, (_, i) => sha256Json({ i })));
const vector = async rowHashes => ({ projectionVersion: 1, rowCount: rowHashes.length, rowHashes, vectorHash: await sha256Json(rowHashes) });
const boundary = { revision: 7, stateHash: 'a'.repeat(64) };
const request = { kind: 'directive.historyTransition.v2', version: 2, sequence: 1, mode: 'transcript', operationId: 'edit.1', writerKind: 'native-edit',
  origin: { campaignId: 'campaign.1', saveId: 'save.1', chatId: 'chat.1', entityType: 'character', entityId: '1' }, packageFingerprint: 'b'.repeat(64),
  cause: { type: 'edit', proof: { path: 'v1/operations/edit.1.json', contentHash: 'c'.repeat(64) } },
  before: boundary, after: {...boundary}, beforeTranscript: await vector(rows), afterTranscript: await vector([...rows.slice(0,300), 'd'.repeat(64), ...rows.slice(301)]) };
assert.equal(contracts.assertV2BranchHistoryTransition(request), request);
assert.throws(() => contracts.assertV2BranchHistoryTransition({...request, after:{...boundary,revision:8}}));
assert.throws(() => contracts.assertV2BranchHistoryTransition({...request,mode:'authority'}));
assert.equal(contracts.assertV2BranchHistoryTransition({...request,mode:'authority',after:{revision:8,stateHash:'e'.repeat(64)}}).mode,'authority');
assert.throws(() => contracts.assertV2BranchHistoryTransition({...request,mode:'upgrade'}));
const upgrade = {...request,sequence:0,mode:'upgrade',cause:{...request.cause,type:'format-upgrade'},afterTranscript:request.beforeTranscript};
assert.equal(contracts.assertV2BranchHistoryTransition(upgrade),upgrade);
const initial = await prepareV2BranchHistoryVector({ownerSaveId:'save.1',rowHashes:rows});
assert.equal(initial.writes.length,3);
const previous = {rowHashes:rows,head:initial.head,objects:initial.writes};
const snapshot = structuredClone(previous);
const edited = await prepareV2BranchHistoryVector({ownerSaveId:'save.1',rowHashes:request.afterTranscript.rowHashes,previous,budget:initial.budget});
assert.equal(edited.commonPrefixLength,300);
assert.equal(edited.reusedRowCount,256);
assert.deepEqual(edited.writes[0].value.previous,initial.writes[0].ref);
assert.equal(edited.writes.length,2);
assert.deepEqual(previous,snapshot);
const same = await prepareV2BranchHistoryVector({ownerSaveId:'save.1',rowHashes:rows,previous,budget:initial.budget});
assert.equal(same.writes.length,0);
assert.deepEqual(same.head,initial.head);
const removed = await prepareV2BranchHistoryVector({ownerSaveId:'save.1',rowHashes:rows.slice(0,256),previous,budget:initial.budget});
assert.equal(removed.writes.length,0);
assert.deepEqual(removed.head,initial.writes[0].ref);
const empty = await prepareV2BranchHistoryVector({ownerSaveId:'save.1',rowHashes:[],previous,budget:initial.budget});
assert.equal(empty.head,null);
assert.equal(empty.writes.length,0);
await assert.rejects(prepareV2BranchHistoryVector({ownerSaveId:'foreign',rowHashes:rows,previous,budget:initial.budget}));
const corrupt = structuredClone(previous);
corrupt.objects[0].value.rows[0]='f'.repeat(64);
await assert.rejects(prepareV2BranchHistoryVector({ownerSaveId:'save.1',rowHashes:rows,previous:corrupt,budget:initial.budget}));
await assert.rejects(prepareV2BranchHistoryVector({ownerSaveId:'save.1',rowHashes:rows, budget:{records:16385,pages:0,chunks:0,historyBytes:0}}));
await assert.rejects(prepareV2BranchHistoryVector({ownerSaveId:'save.1',rowHashes:rows,budget:{records:0,pages:0,chunks:20000,historyBytes:0}}));


assert.equal(typeof contracts.assertV2BranchHistoryHead, 'function');
assert.equal(typeof contracts.assertV2HistoryTransitionLink, 'function');
assert.equal(typeof contracts.assertV2HistoryRecord, 'function');
const linked = { ...request, sequence: 2, operationId: 'edit.2', beforeTranscript: request.afterTranscript };
contracts.assertV2HistoryTransitionLink(request, linked);
assert.throws(() => contracts.assertV2HistoryTransitionLink(request, { ...linked, sequence: 3 }));
assert.throws(() => contracts.assertV2HistoryTransitionLink(request, { ...linked, operationId: request.operationId }));
assert.throws(() => contracts.assertV2HistoryTransitionLink(request, { ...linked, before: { ...boundary, stateHash: 'f'.repeat(64) } }));
const head = { kind: 'directive.branchHistoryHead.v2', version: 2, ownerSaveId: 'save.1',
  predecessor: { path: `v1/history-archives/archive-${'a'.repeat(64)}.json`, contentHash: 'a'.repeat(64) },
  floor: { revision: 5, stateHash: 'b'.repeat(64) }, head: boundary, sequence: 2, recordCount: 3,
  page: { path: contracts.v2HistoryObjectPath('save.1', 'page', 'c'.repeat(64)), contentHash: 'c'.repeat(64) } };
contracts.assertV2BranchHistoryHead(head);
assert.throws(() => contracts.assertV2BranchHistoryHead({ ...head, recordCount: 4 }));
assert.throws(() => contracts.assertV2BranchHistoryHead({ ...head, predecessor: null }));
let invoked = 0;
const accessor = { ...request };
Object.defineProperty(accessor, 'origin', { enumerable: true, get() { invoked++; return request.origin; } });
assert.throws(() => contracts.assertV2BranchHistoryTransition(accessor));
const arrayAccessor = [...rows];
Object.defineProperty(arrayAccessor, '0', { enumerable: true, get() { invoked++; return rows[0]; } });
assert.throws(() => contracts.assertV2BranchHistoryTransition({ ...request, beforeTranscript: { ...request.beforeTranscript, rowHashes: arrayAccessor } }));
assert.equal(invoked, 0);
for (const bad of [null, false, [], { ownerSaveId: 'save.1', rowHashes: [], previous: false }]) {
  await assert.rejects(prepareV2BranchHistoryVector(bad), { code: 'DIRECTIVE_V2_HISTORY_INVALID' });
}

// Reverting reuses an earlier immutable branch without charging it twice.
const reverted = await prepareV2BranchHistoryVector({
  ownerSaveId: 'save.1', rowHashes: rows,
  previous: { rowHashes: request.afterTranscript.rowHashes, head: edited.head,
    objects: [...initial.writes, ...edited.writes] }, budget: edited.budget,
});
assert.equal(reverted.writes.length, 0);
assert.deepEqual(reverted.head, initial.head);
assert.deepEqual(reverted.budget, edited.budget);
const partial = await prepareV2BranchHistoryVector({
  ownerSaveId: 'save.1', rowHashes: rows.slice(0, 300), previous, budget: initial.budget,
});
assert.equal(partial.reusedRowCount, 256);
assert.equal(partial.writes.length, 1);
const appended = await prepareV2BranchHistoryVector({
  ownerSaveId: 'save.1', rowHashes: [...rows, rows[0]], previous, budget: initial.budget,
});
assert.equal(appended.reusedRowCount, 600);
assert.equal(appended.writes.length, 1);

const orphanValue = { ...initial.writes[0].value, previous: initial.head, rowCount: 257 };
const orphanHash = await sha256Json(orphanValue);
const orphan = { ref: { path: contracts.v2HistoryObjectPath('save.1', 'vector', orphanHash),
  contentHash: orphanHash }, value: orphanValue };
await assert.rejects(prepareV2BranchHistoryVector({
  ownerSaveId: 'save.1', rowHashes: rows,
  previous: { ...previous, objects: [...previous.objects, orphan] },
  budget: { ...initial.budget, chunks: 4, historyBytes: initial.budget.historyBytes + contracts.v2Bytes(orphanValue) },
}), /graph counts/);
await assert.rejects(prepareV2BranchHistoryVector({
  ownerSaveId: 'save.1', rowHashes: rows, previous: { ...previous, objects: previous.objects.slice(1) },
  budget: initial.budget,
}), /Unclosed/);
await assert.rejects(prepareV2BranchHistoryVector({ ownerSaveId: 'save.1', rowHashes: [], budget: null }));
await assert.rejects(prepareV2BranchHistoryVector({ ownerSaveId: 'save.1', rowHashes: rows, previous,
  budget: { ...initial.budget, historyBytes: initial.budget.historyBytes - 1 } }), /undercounts/);
const mutable = structuredClone({ ownerSaveId: 'save.1', rowHashes: rows, previous, budget: initial.budget });
const pending = prepareV2BranchHistoryVector(mutable);
mutable.rowHashes[0] = '0'.repeat(64);
mutable.previous.objects[0].value.rows[0] = '1'.repeat(64);
mutable.budget.chunks = 20000;
assert.deepEqual((await pending).head, initial.head);
const maxRows = Array(20000).fill(rows[0]);
const maximum = await prepareV2BranchHistoryVector({ ownerSaveId: 'save.1', rowHashes: maxRows });
assert.equal(maximum.transcript.rowCount, 20000);
assert.equal(maximum.writes.length, 79);
await assert.rejects(prepareV2BranchHistoryVector({ ownerSaveId: 'save.1', rowHashes: [...maxRows, rows[0]] }));
for (const [key, limit] of Object.entries({ records: 16384, pages: 256, chunks: 20000, historyBytes: 64 * 1024 * 1024 })) {
  assert.throws(() => contracts.assertV2HistoryBudget({ records: 0, pages: 0, chunks: 0, historyBytes: 0, [key]: limit + 1 }));
}
for (const path of ['../escape', '/absolute', 'https://example/file', 'v1/../escape', 'v1\\escape']) {
  assert.throws(() => contracts.assertV2BranchHistoryTransition({ ...request,
    cause: { ...request.cause, proof: { ...request.cause.proof, path } } }));
}
assert.throws(() => contracts.assertV2BranchHistoryHead({ ...head, floor: { ...boundary, revision: 0 } }));
assert.throws(() => contracts.assertV2BranchHistoryHead({ ...head, sequence: 0, recordCount: 1 }));
contracts.assertV2BranchHistoryHead({ ...head, floor: boundary, sequence: 0, recordCount: 1 });
const persistedUpgrade = { ...upgrade, beforeTranscript: initial.transcript, afterTranscript: initial.transcript };
const record = { requestHash: 'a'.repeat(64), expectedManifestHash: 'b'.repeat(64),
  saveMetadataHash: 'c'.repeat(64), transition: persistedUpgrade };
contracts.assertV2HistoryRecord(record, 'save.1');
assert.throws(() => contracts.assertV2HistoryRecord(record, 'foreign'));
const page = { kind: 'directive.branchHistoryPage.v2', version: 2, ownerSaveId: 'save.1',
  previous: null, records: [record] };
contracts.assertV2HistoryObject(page, 'save.1', 'page');
assert.throws(() => contracts.assertV2HistoryObject({ ...page, records: [...page.records, record] }, 'save.1', 'page'));
const cyclic = {}; cyclic.self = cyclic;
assert.throws(() => contracts.detachV2History(cyclic));
const sparse = Array(1);
assert.throws(() => contracts.detachV2History(sparse));
const hidden = {}; Object.defineProperty(hidden, 'hidden', { value: 1 });
assert.throws(() => contracts.detachV2History(hidden));
console.log('PASS V2 graph closure, unique budgets, detached inputs, exact limits, head/page/record contracts');
