import assert from 'node:assert/strict';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { sha256Json } from '../../src/storage/v1-state-delta-codec.mjs';
import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const assets = loadAshesRuntimeAssets();
const id = 'save.controller-captured-intent';
const now = '2026-09-15T21:00:00.000Z';
const headPath = storage.V1_STORAGE_PATHS.save(id);
const ticketPath = storage.V1_STORAGE_PATHS.publicationIntent(id);
async function rig({ baselineFault = null } = {}) {
  const files = new Map();
  const faults = { mode: null, unreadable: false, delete: false };
  let headWrites = 0, deletes = 0;
  const adapter = {
    async readJson(path) {
      if (path === headPath && faults.unreadable) throw new Error('head unavailable');
      if (!files.has(path)) throw Object.assign(new Error('not found'), { code: 'ENOENT' });
      return structuredClone(files.get(path));
    },
    async writeJson(path, value) {
      if (path === headPath) {
        headWrites++;
        if (faults.mode === 'before') throw new Error('head not written');
      }
      files.set(path, structuredClone(value));
      if (path === headPath && faults.mode === 'unreadable') faults.unreadable = true;
      if (path === headPath && faults.mode === 'after') throw new Error('head acknowledgement lost');
    },
    async deleteJsonFile(path) {
      if (faults.delete) throw new Error('ack deletion unavailable');
      deletes++; files.delete(path);
    },
  };
  let state = createAshesInitialState({ campaignId: 'campaign.controller-captured-intent', saveId: id, chatId: 'chat.captured-intent' });
  state.campaignChatBinding.entityType = 'character';
  state.campaignChatBinding.entityId = 'character.captured-intent';
  const saveFor = value => storage.createV1CampaignSave({ id, state: value, createdAt: now });
  const before = structuredClone(state);
  await storage.storeV1CampaignSave(adapter, saveFor(state));
  const firstManifest = structuredClone(files.get(headPath));
  async function capture(previous, next, operationId, mode) {
    const rows = [await sha256Json({ mes: 'Opening' })];
    return { kind: 'directive.authorityBoundaryCapture.v1', version: 1, mode, operationId,
      writerKind: 'test.controller-captured-intent',
      origin: { campaignId: state.campaign.id, saveId: id, chatId: 'chat.captured-intent', entityType: 'character', entityId: 'character.captured-intent' },
      packageFingerprint: await sha256Json(state.activeCampaignPackage),
      before: { revision: previous.stateCustody.revision, stateHash: await sha256Json(previous) },
      after: { revision: next.stateCustody.revision, stateHash: await sha256Json(next) },
      transcript: { projectionVersion: 1, rowCount: rows.length, rowHashes: rows, vectorHash: await sha256Json(rows) } };
  }
  faults.mode = baselineFault;
  const baseline = await storage.storeV1CampaignSaveWithCapture(adapter, saveFor(state), {
    expectedManifest: firstManifest, previousSave: saveFor(state), capture: await capture(state, state, 'operation.baseline', 'baseline'),
  });
  assert.ok(files.has(ticketPath), 'captured publication must retain durable restart evidence');
  const controller = () => createCampaignStartController({ adapter, packages: [assets.packageData], missionDefinitions: assets.missionDefinitions, now: () => now });
  async function publish(mode) {
    assert.equal((await storage.acknowledgeV1CampaignSavePublication(adapter, { saveId: id, requestHash: baseline.intent.requestHash })).acknowledged, true);
    const prior = structuredClone(state);
    const gateway = createStateDeltaGateway({ getState: () => state, setState: next => { state = next; } });
    await gateway.applyProposal({ id: 'operation.next', baseRevision: 0, domains: ['mission'], patch: { mission: { v1: { revision: 1 } } } });
    const candidate = structuredClone(state);
    faults.mode = mode;
    const result = await storage.storeV1CampaignSaveWithCapture(adapter, saveFor(state), {
      expectedManifest: baseline.manifest, previousSave: saveFor(prior), capture: await capture(prior, state, 'operation.next', 'commit'),
    });
    return { result, candidate, prior };
  }
  return { adapter, files, faults, baseline, before, controller, publish, headWrites: () => headWrites, deletes: () => deletes };
}
{
  const r = await rig();
  const writes = r.headWrites();
  const c = r.controller();
  const initialized = await c.initialize();
  assert.deepEqual(initialized.campaignState, r.before);
  assert.equal(c.getSavePublicationStatus(), null);
  assert.equal(r.files.has(ticketPath), false);
  assert.equal(r.headWrites(), writes, 'startup must not republish captured baseline');
}
{
  const r = await rig({ baselineFault: 'unreadable' });
  assert.equal(r.baseline.publication, 'uncertain');
  const c = r.controller();
  assert.equal((await c.initialize()).campaignState, null);
  assert.ok(c.getSavePublicationStatus());
  r.faults.unreadable = false; r.faults.mode = null;
  const writes = r.headWrites();
  assert.equal((await c.recoverSavePublication()).publication, 'committed');
  assert.deepEqual(c.getActiveCampaignState(), r.before);
  assert.equal(r.headWrites(), writes);
}
for (const mode of ['before', 'after', 'unreadable']) {
  const r = await rig();
  const { result, candidate, prior } = await r.publish(mode);
  const writes = r.headWrites();
  const c = r.controller();
  const initialized = await c.initialize();
  if (mode === 'unreadable') {
    assert.equal(result.publication, 'uncertain');
    assert.equal(initialized.campaignState, null);
    await assert.rejects(c.verifySaveWritable(), error => error.code === 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN');
    await assert.rejects(c.createCheckpoint({ name: 'Must not save' }), error => error.code === 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN');
    r.faults.unreadable = false; r.faults.mode = null;
    assert.equal((await c.recoverSavePublication()).publication, 'committed');
  }
  assert.deepEqual(c.getActiveCampaignState(), mode === 'before' ? prior : candidate);
  assert.equal(c.getSavePublicationStatus(), null);
  assert.equal(r.files.has(ticketPath), false);
  assert.equal(r.headWrites(), writes, 'restart/recovery must not repeat the authority write');
}
{
  const r = await rig();
  const { candidate } = await r.publish('after');
  r.faults.delete = true;
  const c = r.controller();
  assert.equal((await c.initialize()).campaignState, null);
  assert.equal(c.getSavePublicationStatus().phase, 'acknowledgement');
  const writes = r.headWrites();
  r.faults.delete = false;
  assert.equal((await c.recoverSavePublication()).publication, 'committed');
  assert.deepEqual(c.getActiveCampaignState(), candidate);
  assert.equal(r.headWrites(), writes);
}
{
  const r = await rig();
  await r.publish('unreadable');
  const c = r.controller();
  assert.equal((await c.initialize()).campaignState, null);
  r.faults.unreadable = false;
  r.files.delete(ticketPath);
  await assert.rejects(c.recoverSavePublication(), error => error.code === 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN');
  assert.equal(c.getActiveCampaignState(), null, 'disappeared observed intent is not proof of either outcome');
}
{
  const r = await rig();
  const { candidate } = await r.publish('after');
  const cataloguePath = r.files.get(headPath).branchHistory.page.path;
  const savedCatalogue = structuredClone(r.files.get(cataloguePath));
  r.files.set(cataloguePath, { corrupt: true });
  const c = r.controller();
  const deletes = r.deletes(), writes = r.headWrites();
  assert.equal((await c.initialize()).campaignState, null);
  assert.ok(r.files.has(ticketPath), 'corrupt history cannot acknowledge a publication');
  assert.equal(r.deletes(), deletes);
  r.files.set(cataloguePath, savedCatalogue);
  assert.equal((await c.recoverSavePublication()).publication, 'committed');
  assert.deepEqual(c.getActiveCampaignState(), candidate);
  assert.equal(r.headWrites(), writes);
}
{
  const r = await rig();
  const { candidate } = await r.publish('after');
  r.faults.delete = true;
  const c = r.controller();
  assert.equal((await c.initialize()).campaignState, null);
  assert.equal(c.getSavePublicationStatus().phase, 'acknowledgement');
  r.files.delete(ticketPath); // Simulate lost cleanup observation after the exact result was retained.
  r.faults.delete = false;
  const writes = r.headWrites();
  assert.equal((await c.recoverSavePublication()).publication, 'committed');
  assert.deepEqual(c.getActiveCampaignState(), candidate);
  assert.equal(r.headWrites(), writes);
}
console.log('Controller captured-publication restart and recovery passed.');
