import assert from 'node:assert/strict';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';
import { sha256Json } from '../../src/storage/v1-state-delta-codec.mjs';

assert.equal(typeof storage.storeV1ActiveCampaignSaveWithOutcome, 'function');
assert.equal(typeof storage.loadVerifiedV1ActiveCampaignAuthority, 'function');
const id = 'save.active-publication';
const manifestPath = storage.V1_STORAGE_PATHS.save(id);
const ticketPath = storage.V1_STORAGE_PATHS.publicationIntent(id);
function memory(seed = {}) {
  const files = structuredClone(seed);
  return { writes: 0, deletes: 0,
    async readJson(path) { if (!Object.hasOwn(files, path)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' }); return structuredClone(files[path]); },
    async writeJson(path, value) { this.writes++; files[path] = structuredClone(value); },
    async deleteJson(path) { this.deletes++; delete files[path]; },
    snapshot: () => structuredClone(files) };
}
let state = createAshesInitialState({ campaignId: 'campaign.active-publication', saveId: id, chatId: 'chat.active-publication' });
const saveFor = value => storage.createV1CampaignSave({ id, state: value, createdAt: '2026-09-15T12:00:00.000Z' });
const previousSave = saveFor(state), base = memory();
await storage.storeV1CampaignSave(base, previousSave);
const seed = base.snapshot(), expectedManifest = seed[manifestPath];
await createStateDeltaGateway({ getState: () => state, setState: next => { state = next; } }).applyProposal({
  id: 'advance', baseRevision: 0, domains: ['mission'], patch: { mission: { v1: { revision: 1 } } } });
const candidate = saveFor(state);
const options = { expectedManifest, previousSave, expectedActiveSaveId: id };
const publish = reader => storage.storeV1ActiveCampaignSaveWithOutcome(reader, candidate, options);
async function resolve(reader, intent, publication) {
  const counts = [reader.writes, reader.deletes];
  const result = await storage.resolveV1ActiveCampaignSavePublication(reader, { saveId: id, requestHash: intent.requestHash });
  assert.equal(result.publication, publication, JSON.stringify(result));
  assert.deepEqual([reader.writes, reader.deletes], counts, 'resolution is read-only');
  return result;
}
const success = memory(seed), result = await publish(success);
assert.equal(result.publication, 'committed', JSON.stringify(result));
assert.deepEqual(result.save.state, state);
assert.deepEqual(await storage.loadV1ActiveCampaignSavePublication(success, id), result.intent);
await resolve(success, result.intent, 'committed');
const writes = success.writes;
assert.equal((await publish(success)).publication, 'committed');
assert.equal(success.writes, writes, 'identical intent must not replay writes');
const restart = memory(success.snapshot());
await resolve(restart, result.intent, 'committed');
assert.equal((await storage.acknowledgeV1ActiveCampaignSavePublication(restart, { saveId: id, requestHash: result.intent.requestHash })).acknowledged, true);
assert.equal(await storage.loadV1ActiveCampaignSavePublication(restart, id), null);
await resolve(restart, result.intent, 'none');
const noop = memory(seed);
const noChange = await storage.storeV1ActiveCampaignSaveWithOutcome(noop, previousSave, options);
assert.equal(noChange.publication, 'committed'); assert.equal(noChange.intent, null); assert.equal(noop.writes, 0);

for (const failurePath of ['intent', 'segment', 'manifest', 'index']) {
  for (const afterWrite of [false, true]) {
    const reader = memory(seed), write = reader.writeJson.bind(reader);
    let fired = false;
    reader.writeJson = async (path, value) => {
      const matches = failurePath === 'intent' ? path === ticketPath : failurePath === 'segment' ? path.includes('.segment-')
        : failurePath === 'manifest' ? path === manifestPath : path === storage.V1_STORAGE_PATHS.index;
      if (!fired && matches) { fired = true; if (afterWrite) await write(path, value); throw new Error('injected write failure'); }
      return write(path, value);
    };
    const outcome = await publish(reader);
    assert.equal(fired, true, failurePath);
    const committed = failurePath === 'index' || (failurePath === 'manifest' && afterWrite);
    assert.equal(outcome.publication, committed ? 'committed' : 'not-committed', `${failurePath}/${afterWrite}: ${JSON.stringify(outcome)}`);
    if (Object.hasOwn(reader.snapshot(), ticketPath)) await resolve(reader, outcome.intent, outcome.publication);
  }
}
const corrupted = memory({ ...seed, [expectedManifest.base.path]: {} });
assert.equal((await publish(corrupted)).publication, 'uncertain'); assert.equal(corrupted.writes, 0);
const unreadable = memory(success.snapshot());
unreadable.readJson = async () => { throw new Error('offline'); };
await resolve(unreadable, result.intent, 'uncertain');
const wrongPointer = success.snapshot(); wrongPointer[storage.V1_STORAGE_PATHS.index].activeSaveId = null;
await resolve(memory(wrongPointer), result.intent, 'uncertain');
const blocker = memory(success.snapshot());
const blocked = await storage.storeV1ActiveCampaignSaveWithOutcome(blocker, { ...candidate, name: 'Other intent' }, options);
assert.equal(blocked.publication, 'uncertain'); assert.equal(blocker.writes, 0);
const lostAck = memory(success.snapshot()); lostAck.deleteJson = async () => { throw new Error('delete failed'); };
const ack = await storage.acknowledgeV1ActiveCampaignSavePublication(lostAck, { saveId: id, requestHash: result.intent.requestHash });
assert.equal(ack.publication, 'committed'); assert.equal(ack.acknowledged, false);
await resolve(lostAck, result.intent, 'committed');
// All legacy writers refuse to overwrite evidence retained by the ticket.
const legacy = memory(success.snapshot());
await assert.rejects(storage.storeV1CampaignSave(legacy, candidate), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
assert.equal(legacy.writes, 0);
const capturedBlocked = await storage.storeV1CampaignSaveWithCapture(legacy, candidate, { expectedManifest, capture: {}, previousSave });
assert.equal(capturedBlocked.publication, 'uncertain'); assert.equal(legacy.writes, 0);
// Pointer and head changes during verification must prevent a certain outcome.
for (const race of ['pointer', 'head', 'ticket']) {
  const reader = memory(success.snapshot()), read = reader.readJson.bind(reader);
  let indexReads = 0;
  reader.readJson = async path => {
    const value = await read(path);
    if (path === storage.V1_STORAGE_PATHS.index) {
      indexReads++;
      if (race === 'pointer' && indexReads >= 2) value.activeSaveId = null;
    }
    if (race === 'head' && path === manifestPath && indexReads >= 2) return structuredClone(expectedManifest);
    if (race === 'ticket' && path === ticketPath && indexReads >= 2) return { ...value, requestHash: '0'.repeat(64) };
    return value;
  };
  await resolve(reader, result.intent, 'uncertain');
}
// Corrupt, foreign and wrong-hash tickets cannot authorize deletion or writes.
for (const corruptIntent of [null, { ...result.intent, extra: true }, { ...result.intent, requestHash: '0'.repeat(64) },
  { ...result.intent, saveId: 'foreign' }]) {
  const reader = memory({ ...success.snapshot(), [ticketPath]: corruptIntent });
  await resolve(reader, result.intent, 'uncertain');
  const acknowledgement = await storage.acknowledgeV1ActiveCampaignSavePublication(reader, { saveId: id, requestHash: result.intent.requestHash });
  assert.equal(acknowledgement.acknowledged, false); assert.equal(reader.deletes, 0);
  assert.equal((await publish(reader)).publication, 'uncertain'); assert.equal(reader.writes, 0);
}
const wrongRequest = memory(success.snapshot());
await resolve(wrongRequest, { requestHash: '0'.repeat(64) }, 'uncertain');
const forged = structuredClone(result.intent);
forged.expectedManifest.currentStateHash = '0'.repeat(64);
const { requestHash: ignoredHash, ...forgedIdentity } = forged;
forged.requestHash = await sha256Json(forgedIdentity);
await resolve(memory({ ...success.snapshot(), [ticketPath]: forged }), forged, 'uncertain');
// A delete may happen before its acknowledgement is lost; it cannot undo authority.
const deleteThenThrow = memory(success.snapshot()), deleteJson = deleteThenThrow.deleteJson.bind(deleteThenThrow);
deleteThenThrow.deleteJson = async path => { await deleteJson(path); throw new Error('lost delete acknowledgement'); };
const lost = await storage.acknowledgeV1ActiveCampaignSavePublication(deleteThenThrow, { saveId: id, requestHash: result.intent.requestHash });
assert.equal(lost.publication, 'committed');
assert.equal(lost.acknowledged, true, 'a verified removal remains acknowledged after a thrown delete');
await resolve(deleteThenThrow, result.intent, 'none');
// Detached publication inputs cannot be changed during the first storage await.
const detachedReader = memory(seed), detachedOptions = structuredClone(options), detachedSave = structuredClone(candidate);
const detachedRead = detachedReader.readJson.bind(detachedReader);
let mutated = false;
detachedReader.readJson = async path => {
  if (!mutated) { mutated = true; detachedOptions.expectedActiveSaveId = null; detachedSave.name = 'Mutated'; }
  return detachedRead(path);
};
const detachedResult = await storage.storeV1ActiveCampaignSaveWithOutcome(detachedReader, detachedSave, detachedOptions);
assert.equal(detachedResult.publication, 'committed'); assert.equal(detachedResult.save.name, candidate.name);
// Publication followed by unreadable verification is uncertain until restart.
const offlineAfterWrite = memory(seed), offlineWrite = offlineAfterWrite.writeJson.bind(offlineAfterWrite);
const onlineRead = offlineAfterWrite.readJson.bind(offlineAfterWrite);
let offline = false;
offlineAfterWrite.writeJson = async (path, value) => { await offlineWrite(path, value); if (path === manifestPath) offline = true; };
offlineAfterWrite.readJson = async path => { if (offline) throw new Error('storage offline'); return onlineRead(path); };
const unknown = await publish(offlineAfterWrite);
assert.equal(unknown.publication, 'uncertain'); assert.ok(unknown.intent);
await resolve(memory(offlineAfterWrite.snapshot()), unknown.intent, 'committed');
const metadata = memory(seed);
const renamed = await storage.storeV1ActiveCampaignSaveWithOutcome(metadata, { ...previousSave, name: 'Renamed' }, options);
assert.equal(renamed.publication, 'committed'); assert.equal(renamed.save.name, 'Renamed');
assert.equal(renamed.manifest.currentRevision, expectedManifest.currentRevision);
assert.deepEqual(renamed.manifest.segments, expectedManifest.segments);
// A prior outcome remains verifiable and explicitly acknowledgeable.
const priorTicket = memory({ ...seed, [ticketPath]: result.intent });
await resolve(priorTicket, result.intent, 'not-committed');
const priorAck = await storage.acknowledgeV1ActiveCampaignSavePublication(priorTicket, { saveId: id, requestHash: result.intent.requestHash });
assert.equal(priorAck.publication, 'not-committed'); assert.equal(priorAck.acknowledged, true);
// Read-only startup authority checks must never use the ordinary repair loader.
const inspectAuthority = reader => storage.loadVerifiedV1ActiveCampaignAuthority(reader, { saveId: id });
const authorityReader = memory(seed);
assert.deepEqual(await inspectAuthority(authorityReader), { save: previousSave, manifest: expectedManifest });
assert.deepEqual(await storage.loadVerifiedV1ActiveCampaignAuthority(authorityReader, { saveId: id, expectedSave: previousSave, expectedManifest }),
  { save: previousSave, manifest: expectedManifest });
assert.equal(authorityReader.writes, 0); assert.equal(authorityReader.deletes, 0);
await assert.rejects(storage.loadVerifiedV1ActiveCampaignAuthority(authorityReader, { saveId: id, expectedSave: candidate }));
await assert.rejects(storage.loadVerifiedV1ActiveCampaignAuthority(authorityReader, { saveId: id, expectedManifest: result.manifest }));
for (const fault of ['ticket', 'corrupt-base', 'pointer', 'head-race', 'pointer-race', 'ticket-race', 'unreadable']) {
  const reader = memory(fault === 'ticket' ? success.snapshot() : seed), read = reader.readJson.bind(reader);
  let indexReads = 0;
  reader.readJson = async path => {
    if (fault === 'unreadable') throw new Error('offline');
    if (fault === 'corrupt-base' && path === expectedManifest.base.path) return {};
    const value = await read(path).catch(error => {
      if (fault === 'ticket-race' && path === ticketPath && indexReads >= 2) return structuredClone(result.intent);
      throw error;
    });
    if (path === storage.V1_STORAGE_PATHS.index) {
      indexReads++;
      if (fault === 'pointer' || (fault === 'pointer-race' && indexReads >= 2)) value.activeSaveId = null;
    }
    if (fault === 'head-race' && path === manifestPath && indexReads >= 2) return structuredClone(result.manifest);
    return value;
  };
  await assert.rejects(inspectAuthority(reader), undefined, fault);
  assert.equal(reader.writes, 0); assert.equal(reader.deletes, 0);
}
// Only transport failures carry the startup read-failure marker.
const badTransport = memory(seed); badTransport.readJson = async () => { throw new Error('offline'); };
await assert.rejects(storage.loadV1ActiveCampaignSavePublication(badTransport, id), error => error.publicationIntentReadFailed === true);
for (const malformed of [null, {}, { ...result.intent, requestHash: '0'.repeat(64) }]) {
  await assert.rejects(storage.loadV1ActiveCampaignSavePublication(memory({ ...seed, [ticketPath]: malformed }), id),
    error => error.publicationIntentReadFailed !== true);
}
const detachedAuthority = memory(seed), mutableIdentity = { saveId: id, expectedSave: structuredClone(previousSave), expectedManifest: structuredClone(expectedManifest) };
const authorityRead = detachedAuthority.readJson.bind(detachedAuthority);
detachedAuthority.readJson = async path => { mutableIdentity.expectedSave.name = 'Changed'; mutableIdentity.expectedManifest.currentStateHash = '0'.repeat(64); return authorityRead(path); };
assert.deepEqual((await storage.loadVerifiedV1ActiveCampaignAuthority(detachedAuthority, mutableIdentity)).save, previousSave);
assert.equal(detachedAuthority.writes, 0);
console.log('PASS active-save publication outcomes and durable recovery');
