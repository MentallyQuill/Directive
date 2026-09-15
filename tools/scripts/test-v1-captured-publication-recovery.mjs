import assert from 'node:assert/strict';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { sha256Json } from '../../src/storage/v1-state-delta-codec.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createAshesInitialState } from './v1-test-fixtures.mjs';

assert.equal(typeof storage.resolveV1CapturedPublication, 'function', 'captured publication has a read-only resolver');
const saveId = 'save.publication-recovery';
const manifestPath = storage.V1_STORAGE_PATHS.save(saveId);
const indexPath = storage.V1_STORAGE_PATHS.index;
const now = '2026-09-15T12:00:00.000Z';
function memory(seed = {}) {
  const files = structuredClone(seed);
  return {
    writes: 0,
    async readJson(path) {
      if (!Object.hasOwn(files, path)) throw Object.assign(new Error('Missing file'), { code: 'ENOENT' });
      return structuredClone(files[path]);
    },
    async writeJson(path, value) { this.writes++; files[path] = structuredClone(value); },
    async deleteJson(path) { this.writes++; delete files[path]; },
    snapshot: () => structuredClone(files),
  };
}
let state = createAshesInitialState({ campaignId: 'campaign.publication-recovery', saveId, chatId: 'chat.recovery' });
state.campaignChatBinding.entityType = 'character';
state.campaignChatBinding.entityId = 'character.recovery';
const previousState = structuredClone(state);
const saveFor = value => storage.createV1CampaignSave({ id: saveId, state: value, createdAt: now });
const adapter = memory();
await storage.storeV1CampaignSave(adapter, saveFor(state));
const uncapturedFiles = adapter.snapshot();
const uncapturedManifest = await adapter.readJson(manifestPath);
const rows = [await sha256Json({ mes: 'Opening' })];
async function capture(before, after, operationId, mode) {
  return { kind: 'directive.authorityBoundaryCapture.v1', version: 1, mode, operationId,
    writerKind: 'test.publication-recovery',
    origin: { campaignId: state.campaign.id, saveId, chatId: 'chat.recovery', entityType: 'character', entityId: 'character.recovery' },
    packageFingerprint: await sha256Json(state.activeCampaignPackage),
    before: { revision: before.stateCustody.revision, stateHash: await sha256Json(before) },
    after: { revision: after.stateCustody.revision, stateHash: await sha256Json(after) },
    transcript: { projectionVersion: 1, rowCount: rows.length, rowHashes: rows, vectorHash: await sha256Json(rows) } };
}
const baseline = await storage.storeV1CampaignSaveWithCapture(adapter, saveFor(state), {
  expectedManifest: uncapturedManifest, previousSave: saveFor(state),
  capture: await capture(state, state, 'operation.baseline', 'baseline'),
});
assert.equal(baseline.publication, 'committed');
const priorFiles = adapter.snapshot();
const gateway = createStateDeltaGateway({ getState: () => state, setState: next => { state = next; } });
await gateway.applyProposal({ id: 'operation.recovery', baseRevision: 0, domains: ['mission'],
  patch: { mission: { v1: { revision: 1 } } } });
const candidateState = structuredClone(state);
const committed = await storage.storeV1CampaignSaveWithCapture(adapter, saveFor(state), {
  expectedManifest: baseline.manifest, previousSave: saveFor(previousState),
  capture: await capture(previousState, state, 'operation.recovery', 'commit'),
});
assert.equal(committed.publication, 'committed');
const committedFiles = adapter.snapshot();
const request = { expectedManifest: baseline.manifest, attemptedManifest: committed.manifest,
  expectedActiveSaveId: saveId, operationId: 'operation.recovery' };
let cases = 0;
async function check(files, options, expected, mutateReader = null) {
  const reader = memory(files);
  if (mutateReader) mutateReader(reader);
  const before = reader.snapshot();
  const input = structuredClone(options);
  const result = await storage.resolveV1CapturedPublication(reader, input);
  assert.equal(result.publication, expected, JSON.stringify(result));
  assert.equal(reader.writes, 0, 'resolution must never publish, repair or delete');
  assert.deepEqual(reader.snapshot(), before, 'resolution leaves stored bytes unchanged');
  assert.deepEqual(input, options, 'resolution leaves input evidence unchanged');
  cases++;
  return result;
}
const recovered = await check(committedFiles, request, 'committed');
assert.deepEqual(recovered.save.state, candidateState);
assert.equal(recovered.operationId, request.operationId);
assert.deepEqual(recovered.manifest, committed.manifest);
assert.deepEqual(await check(committedFiles, request, 'committed'), recovered, 'repeat resolution does not reapply the operation');
const prior = await check(priorFiles, request, 'not-committed');
assert.deepEqual(prior.save.state, previousState);
assert.deepEqual(prior.manifest, baseline.manifest);
await check(priorFiles, { ...request, attemptedManifest: null }, 'not-committed');
await check(committedFiles, { ...request, attemptedManifest: null }, 'uncertain');
const baselineRequest = { expectedManifest: uncapturedManifest, attemptedManifest: baseline.manifest,
  expectedActiveSaveId: saveId, operationId: 'operation.baseline' };
await check(uncapturedFiles, baselineRequest, 'not-committed');
await check(priorFiles, baselineRequest, 'committed');
await check(committedFiles, { ...request, operationId: 'operation.other' }, 'uncertain');
await check(committedFiles, { ...request, expectedManifest: uncapturedManifest }, 'uncertain');
await check(committedFiles, { ...request, expectedManifest: committed.manifest }, 'uncertain');
await check(committedFiles, { ...request, expectedActiveSaveId: 'save.other' }, 'uncertain');
await check(committedFiles, { ...request, expectedActiveSaveId: undefined }, 'uncertain');
await check(committedFiles, { ...request, operationId: '' }, 'uncertain');
const foreign = structuredClone(request);
foreign.attemptedManifest.saveId = 'save.other';
await check(committedFiles, foreign, 'uncertain');
await check({}, request, 'uncertain');
await check(committedFiles, request, 'uncertain', reader => {
  reader.readJson = async () => { throw new Error('storage unreadable'); };
});
const corruptPrior = structuredClone(priorFiles);
delete corruptPrior[baseline.manifest.base.path];
await check(corruptPrior, request, 'uncertain');
const corruptAttempt = structuredClone(committedFiles);
delete corruptAttempt[committed.manifest.branchHistory.page.path];
await check(corruptAttempt, request, 'uncertain');
const corruptDelta = structuredClone(committedFiles);
corruptDelta[committed.manifest.segments[0].path].deltas[0].source = 'tampered.source';
await check(corruptDelta, request, 'uncertain');
const unindexed = structuredClone(committedFiles);
delete unindexed[indexPath].saves[saveId];
await check(unindexed, request, 'uncertain');
// A different valid later metadata head is not the exact attempted publication.
const later = memory(committedFiles);
await storage.storeV1CampaignSave(later, { ...committed.save, name: 'Renamed later' }, { previousSave: committed.save });
await check(later.snapshot(), request, 'uncertain');
const noActive = structuredClone(committedFiles);
noActive[indexPath].activeSaveId = null;
await check(noActive, { ...request, expectedActiveSaveId: null }, 'committed');
await check(noActive, { ...request, expectedActiveSaveId: null }, 'uncertain', reader => {
  const read = reader.readJson.bind(reader);
  let indexReads = 0;
  reader.readJson = async path => {
    const value = await read(path);
    if (path === indexPath && ++indexReads >= 2) value.activeSaveId = saveId;
    return value;
  };
});
await check(committedFiles, request, 'uncertain', reader => {
  const read = reader.readJson.bind(reader);
  let indexReads = 0;
  reader.readJson = async path => {
    const value = await read(path);
    if (path === indexPath && ++indexReads >= 2) delete value.saves[saveId];
    return value;
  };
});
// Pointer changes during the asynchronous verifier must be observed before success.
await check(committedFiles, request, 'uncertain', reader => {
  const read = reader.readJson.bind(reader);
  let indexReads = 0;
  reader.readJson = async path => {
    const value = await read(path);
    if (path === indexPath && ++indexReads >= 2) value.activeSaveId = null;
    return value;
  };
});
// The manifest can change while the final pointer read is pending.
await check(committedFiles, request, 'uncertain', reader => {
  const read = reader.readJson.bind(reader);
  let indexReads = 0;
  reader.readJson = async path => {
    if (path === manifestPath && indexReads >= 2) return structuredClone(baseline.manifest);
    const value = await read(path);
    if (path === indexPath) indexReads++;
    return value;
  };
});
// Detach all caller-owned identities before any storage await.
{
  const reader = memory(committedFiles), mutable = structuredClone(request);
  const read = reader.readJson.bind(reader);
  let mutated = false;
  reader.readJson = async path => {
    if (!mutated) {
      mutated = true;
      mutable.operationId = 'operation.changed';
      mutable.expectedActiveSaveId = null;
      mutable.attemptedManifest.currentStateHash = '0'.repeat(64);
    }
    return read(path);
  };
  const result = await storage.resolveV1CapturedPublication(reader, mutable);
  assert.equal(result.publication, 'committed');
  assert.equal(result.operationId, request.operationId);
  assert.equal(reader.writes, 0);
  cases++;
}
{
  const reader = memory({}), mutable = structuredClone(request);
  const result = await storage.resolveV1CapturedPublication(reader, mutable);
  assert.equal(result.publication, 'uncertain');
  const evidence = structuredClone(result);
  mutable.expectedManifest.saveMetadata.name = 'Changed by caller';
  mutable.attemptedManifest.branchHistory.page.contentHash = '0'.repeat(64);
  assert.deepEqual(result, evidence, 'uncertain recovery evidence must not retain caller-owned objects');
  assert.deepEqual(result.expectedManifest, request.expectedManifest);
  assert.deepEqual(result.attemptedManifest, request.attemptedManifest);
  assert.equal(reader.writes, 0);
  cases++;
}
console.log(`PASS captured publication read-only recovery (${cases} cases)`);
