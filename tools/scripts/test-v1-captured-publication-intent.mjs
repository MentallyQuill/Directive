import assert from 'node:assert/strict';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { sha256Json } from '../../src/storage/v1-state-delta-codec.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';

assert.equal(typeof storage.resolveV1CampaignSavePublication, 'function', 'tagged publication recovery dispatch exists');
const saveId = 'save.captured-intent', manifestPath = storage.V1_STORAGE_PATHS.save(saveId);
const intentPath = storage.V1_STORAGE_PATHS.publicationIntent(saveId);
function memory(seed = {}) {
  const files = structuredClone(seed);
  return { writes: [], deletes: [],
    async readJson(path) { if (!Object.hasOwn(files, path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return structuredClone(files[path]); },
    async writeJson(path, value) { this.writes.push(path); files[path] = structuredClone(value); },
    async deleteJson(path) { this.deletes.push(path); delete files[path]; },
    snapshot: () => structuredClone(files) };
}
let state = createAshesInitialState({ campaignId: 'campaign.captured-intent', saveId, chatId: 'chat.captured-intent' });
const saveFor = value => storage.createV1CampaignSave({ id: saveId, state: value, createdAt: '2026-09-15T12:00:00.000Z' });
const initial = structuredClone(state), adapter = memory();
await storage.storeV1CampaignSave(adapter, saveFor(state));
const initialFiles = adapter.snapshot(), initialManifest = initialFiles[manifestPath];
async function capture(before, after, operationId, mode) {
  const rowHashes = [await sha256Json({ text: 'captured source' })];
  return { kind: 'directive.authorityBoundaryCapture.v1', version: 1, mode, operationId, writerKind: 'test.captured-intent',
    origin: { campaignId: state.campaign.id, saveId, chatId: 'chat.captured-intent', entityType: 'character', entityId: 'character.intent' },
    packageFingerprint: await sha256Json(state.activeCampaignPackage),
    before: { revision: before.stateCustody.revision, stateHash: await sha256Json(before) },
    after: { revision: after.stateCustody.revision, stateHash: await sha256Json(after) },
    transcript: { projectionVersion: 1, rowCount: 1, rowHashes, vectorHash: await sha256Json(rowHashes) } };
}
const baselineInput = { expectedManifest: initialManifest, previousSave: saveFor(initial),
  capture: await capture(initial, initial, 'baseline.intent', 'baseline') };
const publish = (reader, value, input) => storage.storeV1CampaignSaveWithCapture(reader, saveFor(value), input);
async function resolve(reader, intent, expected) {
  const before = [reader.writes.length, reader.deletes.length];
  const result = await storage.resolveV1CampaignSavePublication(reader, { saveId, requestHash: intent.requestHash });
  assert.equal(result.publication, expected, JSON.stringify(result));
  assert.deepEqual([reader.writes.length, reader.deletes.length], before, 'recovery is read-only');
  return result;
}
const baseline = await publish(adapter, initial, baselineInput);
assert.equal(baseline.publication, 'committed', JSON.stringify(baseline));
assert.equal(baseline.intent.kind, 'directive.capturedSavePublication.v1');
assert.deepEqual(await storage.loadV1CampaignSavePublication(adapter, saveId), baseline.intent);
await resolve(memory(adapter.snapshot()), baseline.intent, 'committed');
const beforeRetry = adapter.writes.length;
assert.equal((await publish(adapter, initial, baselineInput)).publication, 'committed');
assert.equal(adapter.writes.length, beforeRetry);
assert.equal((await storage.acknowledgeV1CampaignSavePublication(adapter, { saveId, requestHash: baseline.intent.requestHash })).acknowledged, true);
const priorFiles = adapter.snapshot();
await createStateDeltaGateway({ getState: () => state, setState: next => { state = next; } }).applyProposal({
  id: 'advance', baseRevision: 0, domains: ['mission'], patch: { mission: { v1: { revision: 1 } } } });
const commitInput = { expectedManifest: baseline.manifest, previousSave: saveFor(initial), capture: await capture(initial, state, 'commit.intent', 'commit') };
const committed = await publish(adapter, state, commitInput);
assert.equal(committed.publication, 'committed', JSON.stringify(committed));
const committedFiles = adapter.snapshot();
assert.deepEqual((await resolve(memory(committedFiles), committed.intent, 'committed')).save.state, state);
for (const [seed, value, input] of [[initialFiles, initial, baselineInput], [priorFiles, state, commitInput]]) {
  for (const stage of ['intent', 'history', ...(value === state ? ['segment'] : []), 'manifest']) for (const after of [false, true]) {
    const reader = memory(seed), write = reader.writeJson.bind(reader); let fired = false;
    reader.writeJson = async (path, content) => {
      const matches = stage === 'intent' ? path === intentPath : stage === 'history' ? path.includes('.history-')
        : stage === 'segment' ? path.includes('.segment-') : path === manifestPath;
      if (!fired && matches) { fired = true; if (after) await write(path, content); throw new Error('injected write failure'); }
      return write(path, content);
    };
    const result = await publish(reader, value, input);
    assert.equal(fired, true); assert.equal(result.publication, stage === 'manifest' && after ? 'committed' : 'not-committed', JSON.stringify(result));
    if (reader.snapshot()[intentPath]) {
      await resolve(memory(reader.snapshot()), result.intent, result.publication);
      const count = reader.writes.length;
      assert.equal((await publish(reader, value, input)).publication, result.publication);
      assert.equal(reader.writes.length, count, 'settled retry never replays writes');
    }
    const authorityWrites = reader.writes.filter(path => path !== intentPath);
    if (stage === 'intent') assert.equal(authorityWrites.length, 0);
    else assert.equal(reader.writes[0], intentPath, 'intent precedes all authority writes');
  }
}
// Missing, corrupt, unreadable and unrelated durable evidence never permits cleanup.
for (const missingPath of [manifestPath, committed.manifest.base.path, committed.manifest.branchHistory.page.path,
  baseline.manifest.branchHistory.page.path, committed.manifest.segments[0].path]) {
  const files = structuredClone(committedFiles); delete files[missingPath];
  const reader = memory(files);
  await resolve(reader, committed.intent, 'uncertain');
  const ack = await storage.acknowledgeV1CampaignSavePublication(reader, { saveId, requestHash: committed.intent.requestHash });
  assert.equal(ack.acknowledged, false); assert.equal(reader.deletes.length, 0);
}
const corruptHistory = structuredClone(committedFiles);
corruptHistory[committed.manifest.branchHistory.page.path].records.at(-1).capture.writerKind = 'tampered';
await resolve(memory(corruptHistory), committed.intent, 'uncertain');
const unreadable = memory(committedFiles); unreadable.readJson = async () => { throw new Error('offline'); };
await resolve(unreadable, committed.intent, 'uncertain');
async function rehash(intent) { const { requestHash, ...identity } = intent; return { ...identity, requestHash: await sha256Json(identity) }; }
for (const change of [
  intent => { intent.operationId = 'wrong'; },
  intent => { intent.capturedRequestHash = '0'.repeat(64); },
  intent => { intent.expectedManifest.currentStateHash = '0'.repeat(64); },
  intent => { intent.attemptedManifest = structuredClone(intent.expectedManifest); },
  intent => { intent.attemptedManifest.saveId = 'foreign'; },
  intent => { intent.expectedActiveSaveId = null; },
  intent => { intent.extra = true; },
]) {
  const intent = structuredClone(committed.intent); change(intent);
  const forged = await rehash(intent), reader = memory({ ...committedFiles, [intentPath]: forged });
  await resolve(reader, forged, 'uncertain');
  assert.equal((await storage.acknowledgeV1CampaignSavePublication(reader, { saveId, requestHash: forged.requestHash })).acknowledged, false);
  assert.equal(reader.deletes.length, 0);
}
for (const race of ['pointer', 'ticket', 'manifest']) {
  const reader = memory(committedFiles), read = reader.readJson.bind(reader); let reads = 0;
  reader.readJson = async path => {
    const value = await read(path);
    if (path === storage.V1_STORAGE_PATHS.index) reads++;
    if (reads >= 2 && race === 'pointer' && path === storage.V1_STORAGE_PATHS.index) value.activeSaveId = null;
    if (reads >= 2 && race === 'ticket' && path === intentPath) value.operationId = 'raced';
    if (reads >= 2 && race === 'manifest' && path === manifestPath) return structuredClone(baseline.manifest);
    return value;
  };
  await resolve(reader, committed.intent, 'uncertain');
  reads = 0;
  assert.equal((await storage.acknowledgeV1CampaignSavePublication(reader, { saveId, requestHash: committed.intent.requestHash })).acknowledged, false);
  assert.equal(reader.deletes.length, 0);
}
// Exact acknowledgement tolerates a lost response only after verifying removal.
for (const afterDelete of [false, true]) {
  const reader = memory(committedFiles), remove = reader.deleteJson.bind(reader);
  reader.deleteJson = async path => { if (afterDelete) await remove(path); throw new Error('acknowledgement lost'); };
  const ack = await storage.acknowledgeV1CampaignSavePublication(reader, { saveId, requestHash: committed.intent.requestHash });
  assert.equal(ack.publication, 'committed'); assert.equal(ack.acknowledged, afterDelete);
  await resolve(memory(reader.snapshot()), committed.intent, afterDelete ? 'none' : 'committed');
}
// Pointer identity supports existing nonactive ownership, but a supplied stale pointer writes nothing.
for (const pointer of [null, 'save.other']) {
  const files = structuredClone(initialFiles); files[storage.V1_STORAGE_PATHS.index].activeSaveId = pointer;
  const reader = memory(files), result = await publish(reader, initial, { ...baselineInput, expectedActiveSaveId: pointer });
  assert.equal(result.publication, 'committed'); assert.equal(result.intent.expectedActiveSaveId, pointer);
  await resolve(memory(reader.snapshot()), result.intent, 'committed');
}
const stale = memory(initialFiles);
assert.notEqual((await publish(stale, initial, { ...baselineInput, expectedActiveSaveId: null })).publication, 'committed');
assert.equal(stale.writes.length, 0);
// Both protocols own the same path; neither may replace the other's ticket.
const capturedPending = memory({ ...initialFiles, [intentPath]: baseline.intent });
const ordinaryBlocked = await storage.storeV1ActiveCampaignSaveWithOutcome(capturedPending, saveFor(state), {
  expectedManifest: initialManifest, previousSave: saveFor(initial), expectedActiveSaveId: saveId });
assert.equal(ordinaryBlocked.publication, 'uncertain'); assert.equal(capturedPending.writes.length, 0);
const ordinary = memory(initialFiles);
const ordinaryResult = await storage.storeV1ActiveCampaignSaveWithOutcome(ordinary, saveFor(state), {
  expectedManifest: initialManifest, previousSave: saveFor(initial), expectedActiveSaveId: saveId });
assert.equal(ordinaryResult.publication, 'committed');
await resolve(memory(ordinary.snapshot()), ordinaryResult.intent, 'committed');
const ordinaryCount = ordinary.writes.length;
assert.equal((await publish(ordinary, initial, baselineInput)).publication, 'uncertain');
assert.equal(ordinary.writes.length, ordinaryCount);
assert.equal((await storage.acknowledgeV1CampaignSavePublication(ordinary, { saveId, requestHash: ordinaryResult.intent.requestHash })).acknowledged, true);
// Ticket races after intent persistence stop further authority publication.
const racingWrite = memory(priorFiles), write = racingWrite.writeJson.bind(racingWrite);
racingWrite.writeJson = async (path, value) => {
  await write(path, path === intentPath ? { ...value, operationId: 'other owner' } : value);
};
assert.equal((await publish(racingWrite, state, commitInput)).publication, 'uncertain');
assert.deepEqual(racingWrite.writes, [intentPath]);
// Caller mutation during the first read cannot replace the captured anchor or pointer.
const detached = memory(priorFiles), read = detached.readJson.bind(detached), mutable = structuredClone(commitInput);
mutable.expectedActiveSaveId = saveId;
detached.readJson = async path => { mutable.capture.operationId = 'changed'; mutable.expectedActiveSaveId = null; return read(path); };
const detachedResult = await publish(detached, state, mutable);
assert.equal(detachedResult.publication, 'committed'); assert.equal(detachedResult.intent.operationId, 'commit.intent');
console.log('PASS captured publication durable intent recovery');
