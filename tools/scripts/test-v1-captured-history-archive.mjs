import assert from 'node:assert/strict';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { sha256Json, canonicalJson } from '../../src/storage/v1-state-delta-codec.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';
import { createFakeJsonStorage } from '../../src/hosts/fake/fake-host.mjs';
const archive = await import('../../src/storage/v1-captured-history-archive.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
});
assert.equal(typeof archive.createV1CapturedHistoryArchive, 'function', 'public immutable archive creator required');
const { createV1CapturedHistoryArchive: create, loadV1CapturedHistoryArchive: load } = archive;
const id = 'save.archive', now = '2026-09-15T12:00:00.000Z';
const manifestPath = storage.V1_STORAGE_PATHS.save(id);
function memory(seed = {}) {
  const files = new Map(Object.entries(structuredClone(seed))), writes = [];
  return { files, writes, async readJson(path) { if (!files.has(path)) throw Object.assign(Error('missing'), { code: 'ENOENT' }); return structuredClone(files.get(path)); },
    async writeJson(path, value) { writes.push(path); files.set(path, structuredClone(value)); },
    async deleteJsonFile(path) { files.delete(path); }, snapshot: () => structuredClone(Object.fromEntries(files)) };
}
const source = memory();
let state = createAshesInitialState({ campaignId: 'campaign.archive', saveId: id, chatId: 'chat.archive' });
state.campaignChatBinding.entityType = 'character'; state.campaignChatBinding.entityId = 'archive.entity';
const save = value => storage.createV1CampaignSave({ id, state: value, createdAt: now, updatedAt: now });
await storage.storeV1CampaignSave(source, save(state));
const states = [structuredClone(state)];
const rows = await Promise.all(['one', 'two', 'three', 'uncaptured'].map(sha256Json));
const vector = async count => ({ projectionVersion: 1, rowCount: count, rowHashes: rows.slice(0,count), vectorHash: await sha256Json(rows.slice(0,count)) });
async function publish(index) {
  const previous = structuredClone(state), expectedManifest = await source.readJson(manifestPath);
  if (index) {
    await createStateDeltaGateway({ getState: () => state, setState: value => { state = value; } })
      .applyProposal({ id: `archive.${index}`, domains: ['mission'], patch: { mission: { v1: { revision: index } } } });
    states.push(structuredClone(state));
  }
  const result = await storage.storeV1CampaignSaveWithCapture(source, save(state), { expectedManifest, previousSave: save(previous), expectedActiveSaveId: id,
    capture: { kind: 'directive.authorityBoundaryCapture.v1', version: 1, mode: index ? 'commit' : 'baseline', operationId: `archive.${index}`, writerKind: 'test',
      origin: { campaignId: state.campaign.id, saveId: id, chatId: state.campaignChatBinding.chatId, entityType: 'character', entityId: 'archive.entity' },
      packageFingerprint: 'a'.repeat(64), before: { revision: previous.stateCustody.revision, stateHash: await sha256Json(previous) },
      after: { revision: state.stateCustody.revision, stateHash: await sha256Json(state) }, transcript: await vector(index+1) } });
  assert.equal(result.publication, 'committed', JSON.stringify(result));
  if (result.intent) assert.equal((await storage.acknowledgeV1CampaignSavePublication(source, { saveId: id, requestHash: result.intent.requestHash })).acknowledged, true);
}
await publish(0); await publish(1); await publish(2);
const expectedManifest = await source.readJson(manifestPath), transcript = await vector(4), baseline = source.snapshot();
const writeStart = source.writes.length;
const result = await create(source, id, { expectedManifest, transcript });
assert.equal(result.capture.selected.rowCount, 3);
assert.equal(result.capture.parent.rowCount, 4, 'uncaptured suffix is not a captured authority boundary');
assert.equal(typeof result.adapter.writeJson, 'undefined');
for (const cut of [1,2,3,4]) {
  const restored = await storage.loadV1CampaignStateAtTranscriptCut(result.adapter, id,
    { expectedManifest: result.expectedManifest, transcript: result.transcript, retainedRowCount: cut });
  assert.deepEqual(restored.state, states[Math.min(cut-1,2)]);
}
assert(source.writes.slice(writeStart).every(path => path.startsWith('v1/history-archives/')));
console.log('PASS immutable captured archive basic roundtrip');

// Live a/b rotation and deletion cannot affect any archived cut.
await publish(3);
for (const path of [...source.files.keys()]) if (!path.startsWith('v1/history-archives/')) source.files.delete(path);
const loaded = await load(source, result.reference);
const historical = await storage.loadV1CampaignStateAtTranscriptCut(loaded.adapter, id,
  { expectedManifest: loaded.expectedManifest, transcript: loaded.transcript, retainedRowCount: 2 });
assert.deepEqual(historical.state, states[1]);
assert.equal(historical.origin.saveId, id);
await assert.rejects(loaded.adapter.readJson(storage.V1_STORAGE_PATHS.index), /unmapped/);
const archivedFiles = source.snapshot();
const originalDescriptor = archivedFiles[result.reference.path];
assert(originalDescriptor.entries.some(entry => entry.path === manifestPath));
async function forgedDescriptor(mutate) {
  const adapter = memory(archivedFiles), descriptor = structuredClone(originalDescriptor);
  mutate(descriptor);
  const contentHash = await sha256Json(descriptor), path = `v1/history-archives/archive-${contentHash}.json`;
  adapter.files.set(path, descriptor);
  await assert.rejects(load(adapter, { path, contentHash }));
  assert.equal(adapter.writes.length, 0);
}
await forgedDescriptor(value => { value.coverage.headRevision++; });
await forgedDescriptor(value => { value.capture.selected.rowCount++; });
await forgedDescriptor(value => { value.source.packageVersion = 'forged'; });
await forgedDescriptor(value => { value.entries.push(value.entries[0]); });
await forgedDescriptor(value => { value.entries[0].path = 'v1/index.json'; });
await forgedDescriptor(value => { value.entries[0].path = 'v1/saves/foreign.base.v1.json'; });
await forgedDescriptor(value => {
  const entry = structuredClone(value.entries.find(item => item.path.includes('.history-vector-')));
  entry.path = `v1/saves/${id}.history-vector-${'f'.repeat(64)}.v1.json`;
  value.entries.push(entry); value.entries.sort((a,b) => a.path.localeCompare(b.path));
});
await forgedDescriptor(value => { value.entries.pop(); });
await forgedDescriptor(value => { value.entries[0].byteLength = 1216 * 1024 * 1024 + 1; });
await forgedDescriptor(value => { value.entries = Array.from({ length: 36643 }, () => value.entries[0]); });
await forgedDescriptor(value => { value.transcript.extra = 'x'.repeat(16 * 1024 * 1024); });
for (const corrupt of [false, true]) {
  const adapter = memory(archivedFiles), entry = originalDescriptor.entries.at(-1), path = `v1/history-archives/object-${entry.contentHash}.json`;
  if (corrupt) adapter.files.set(path, { corrupt: true }); else adapter.files.delete(path);
  await assert.rejects(load(adapter, result.reference));
}
// Addressed destination collisions are never overwritten.
{
  const adapter = memory(baseline), entry = originalDescriptor.entries[0];
  const path = `v1/history-archives/object-${entry.contentHash}.json`;
  adapter.files.set(path, { foreign: true });
  await assert.rejects(create(adapter,id,{expectedManifest,transcript}), error => error.phase === 'copy' && Boolean(error.attemptedReference));
  assert.deepEqual(adapter.files.get(path), { foreign: true });
}
// Source changes in the second pass, including a repeated manifest read, fail closed.
for (const change of ['copy', 'repeated']) {
  const adapter = memory(baseline), read = adapter.readJson.bind(adapter), write = adapter.writeJson.bind(adapter);
  let count = 0, changed = false;
  adapter.writeJson = async (path,value) => {
    await write(path,value);
    if (change === 'copy' && !changed && path.includes('/object-')) {
      changed = true;
      adapter.files.set(manifestPath, { ...expectedManifest, updatedAt: '2099-01-01T00:00:00.000Z' });
    }
  };
  adapter.readJson = async path => {
    if (path === manifestPath && ++count === 2 && change === 'repeated') return { ...await read(path), updatedAt: '2099-01-01T00:00:00.000Z' };
    return read(path);
  };
  await assert.rejects(create(adapter,id,{expectedManifest,transcript}), error => {
    if (change === 'copy') { assert.equal(error.phase, 'copy'); assert(error.attemptedReference); }
    return true;
  });
}
// Once descriptor identity exists, all publication ambiguity exposes it.
for (const failure of ['write-then-throw','final-head']) {
  const adapter = memory(baseline), write = adapter.writeJson.bind(adapter);
  let inject = true, attempted;
  adapter.writeJson = async (path,value) => {
    await write(path,value);
    if (inject && path.includes('/archive-')) {
      inject = false;
      if (failure === 'write-then-throw') throw Error('descriptor acknowledgement lost');
      adapter.files.set(manifestPath, { ...expectedManifest, updatedAt: '2099-01-01T00:00:00.000Z' });
    }
  };
  await assert.rejects(create(adapter,id,{expectedManifest,transcript}), error => {
    attempted = error.attemptedReference;
    assert(attempted); assert.equal(error.phase, failure === 'final-head' ? 'head-check' : 'publish'); return true;
  });
  assert(adapter.files.has(attempted.path), 'failure never implies descriptor absence');
  assert.deepEqual((await load(adapter, attempted)).source, loaded.source);
  adapter.files.set(manifestPath, structuredClone(expectedManifest));
  const writesBefore = adapter.writes.length;
  assert.deepEqual((await create(adapter,id,{expectedManifest,transcript})).reference, attempted);
  assert.equal(adapter.writes.length, writesBefore, 'exact retry reuses all immutable objects');
}
// Caller changes after invocation cannot alter the archive request.
{
  const adapter = memory(baseline), request = structuredClone({ expectedManifest, transcript });
  const pending = create(adapter,id,request);
  request.transcript.rowHashes[0] = '0'.repeat(64); request.expectedManifest.currentRevision = 999;
  assert.deepEqual((await pending).reference, result.reference);
}
console.log('PASS archive adversarial lifetime, bounds, closed graph, source races and ambiguous publication');
{
  let invoked = 0;
  const request = { expectedManifest, transcript };
  Object.defineProperty(request, 'transcript', { enumerable: true, get() { invoked++; return transcript; } });
  const adapter = memory(baseline);
  await assert.rejects(create(adapter,id,request));
  assert.equal(invoked, 0); assert.equal(adapter.writes.length, 0);
}
{
  const adapter = memory(baseline), read = adapter.readJson.bind(adapter), write = adapter.writeJson.bind(adapter);
  let published = false;
  adapter.writeJson = async (path,value) => { await write(path,value); if (path.includes('/archive-')) published = true; };
  adapter.readJson = path => { if (published && path.includes('/archive-')) throw Error('descriptor readback unavailable'); return read(path); };
  await assert.rejects(create(adapter,id,{expectedManifest,transcript}), error => error.phase === 'readback' && Boolean(error.attemptedReference));
}
assert.deepEqual(originalDescriptor.entries.map(entry => entry.path), [...originalDescriptor.entries.map(entry => entry.path)].sort());
assert.deepEqual(await sha256Json(originalDescriptor), result.reference.contentHash);
console.log('PASS archive descriptor-safe inputs and explicit readback uncertainty');
{
  const adapter = createFakeJsonStorage();
  for (const [path,value] of Object.entries(baseline)) await adapter.writeJson(path,value);
  assert.deepEqual((await create(adapter,id,{expectedManifest,transcript})).reference, result.reference);
}
