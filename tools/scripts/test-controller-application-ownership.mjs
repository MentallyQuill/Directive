import assert from 'node:assert/strict';
import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const assets = loadAshesRuntimeAssets();
const saveId = 'save.application-ownership';
const now = '2026-09-15T22:00:00.000Z';
async function rig() {
  const files = new Map();
  let hold = null, writes = 0;
  const adapter = {
    async readJson(key) {
      if (hold && key === storage.V1_STORAGE_PATHS.publicationIntent(saveId)) await hold;
      if (!files.has(key)) throw Object.assign(new Error('not found'), { code: 'ENOENT' });
      return structuredClone(files.get(key));
    },
    async writeJson(key, value) { writes++; files.set(key, structuredClone(value)); },
    async deleteJsonFile(key) { writes++; files.delete(key); },
  };
  const before = createAshesInitialState({ campaignId: 'campaign.application-ownership', saveId, chatId: 'chat.application' });
  await storage.storeV1CampaignSave(adapter, storage.createV1CampaignSave({ id: saveId, state: before, createdAt: now }));
  const controller = createCampaignStartController({ adapter, packages: [assets.packageData],
    missionDefinitions: assets.missionDefinitions, now: () => now });
  await controller.initialize();
  let candidate = structuredClone(before);
  await createStateDeltaGateway({ getState: () => candidate, setState: value => { candidate = value; } })
    .applyProposal({ id: 'application.1', baseRevision: 0, domains: ['mission'], patch: { mission: { v1: { revision: 1 } } } });
  return { controller, adapter, before, candidate, writes: () => writes,
    pause() { let release; hold = new Promise(resolve => { release = resolve; }); return () => { hold = null; release(); }; } };
}

{
  const r = await rig(), expected = structuredClone(r.candidate);
  const release = r.pause();
  const pending = r.controller.persistActiveCampaign({ campaignState: r.candidate });
  r.candidate.mission.v1.revision = 99;
  release();
  await pending;
  assert.deepEqual(r.controller.getActiveCampaignState(), expected, 'candidate belongs to invocation, not later caller mutation');
  assert.deepEqual((await storage.loadV1CampaignSave(r.adapter, saveId)).state, expected);
}

{
  const r = await rig(), start = r.writes();
  const invalid = { kind: 'directive.stateApplicationContext.v1', version: 1,
    before: r.before, after: structuredClone(r.before), proposalId: 'application.1', domains: ['mission'] };
  await assert.rejects(r.controller.persistActiveCampaign({ campaignState: r.candidate, applicationContext: invalid }),
    { code: 'DIRECTIVE_V1_STATE_APPLICATION_MISMATCH' });
  assert.equal(r.writes(), start, 'mismatched application cannot write or quarantine an unstarted publication');
  assert.equal(r.controller.getSavePublicationStatus(), null);
}

{
  const r = await rig();
  for (const applicationContext of [false, 0, '', {}]) {
    await assert.rejects(r.controller.persistActiveCampaign({ campaignState: r.candidate, applicationContext }),
      { code: 'DIRECTIVE_V1_STATE_APPLICATION_MISMATCH' });
  }
}

{
  const r = await rig();
  let state = structuredClone(r.before), observed;
  const gateway = createStateDeltaGateway({ getState: () => state, setState: value => { state = value; },
    persist: (campaignState, _descriptor, options) => {
      observed = options.applicationContext;
      return r.controller.persistActiveCampaign({ campaignState, applicationContext: observed });
    } });
  await gateway.applyProposal({ id: 'integrated.application', baseRevision: 0, domains: ['mission'],
    patch: { mission: { v1: { revision: 2 } } } });
  assert.equal(observed.proposalId, 'integrated.application');
  assert.ok(Object.isFrozen(observed));
  assert.deepEqual(observed.before, r.before);
  assert.deepEqual(observed.after, r.controller.getActiveCampaignState());
}

{
  const r = await rig(), release = r.pause();
  const first = r.controller.persistActiveCampaign({ campaignState: r.candidate });
  const second = r.controller.persistActiveCampaign({ campaignState: r.candidate });
  release();
  const results = await Promise.allSettled([first, second]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, 'one exact application owns publication');
  const rejected = results.find(result => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'DIRECTIVE_V1_STATE_PERSISTENCE_PENDING');
  assert.equal((await storage.loadV1CampaignSave(r.adapter, saveId)).state.stateCustody.revision, 1);
  assert.equal(r.controller.getSavePublicationStatus(), null);
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

for (const lateReadError of [false, true]) {
  const r = await rig();
  const intentPath = storage.V1_STORAGE_PATHS.publicationIntent(saveId);
  const enteredRead = deferred(), releaseRead = deferred(), enteredWrite = deferred(), releaseWrite = deferred();
  const originalRead = r.adapter.readJson, originalWrite = r.adapter.writeJson;
  let holdNextRead = true, holdNextWrite = true, writeActive = false;
  r.adapter.readJson = async key => {
    if (key === intentPath && holdNextRead) {
      holdNextRead = false; enteredRead.resolve(); await releaseRead.promise;
      if (lateReadError) throw Object.assign(new Error('late intent read failed'), { code: 'EIO' });
    }
    return originalRead(key);
  };
  r.adapter.writeJson = async (key, value) => {
    await originalWrite(key, value);
    if (key === intentPath && holdNextWrite) {
      holdNextWrite = false; writeActive = true; enteredWrite.resolve();
      await releaseWrite.promise; writeActive = false;
    }
  };
  const lateRead = r.controller.verifySaveWritable().then(() => null, error => error);
  await enteredRead.promise;
  const publication = r.controller.persistActiveCampaign({ campaignState: r.candidate });
  await enteredWrite.promise;
  const pendingOwner = r.controller.getSavePublicationStatus();
  assert.equal(pendingOwner.phase, 'pending');
  releaseRead.resolve();
  const lateError = await lateRead;
  try {
    assert.equal(lateError?.code, 'DIRECTIVE_V1_STATE_PERSISTENCE_PENDING',
      `late ${lateReadError ? 'failed' : 'successful'} read must not replace the publisher's pending owner`);
    assert.deepEqual(r.controller.getSavePublicationStatus(), pendingOwner);
    const writesBeforeRecovery = r.writes();
    await assert.rejects(r.controller.recoverSavePublication(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_PENDING' });
    assert.equal(r.writes(), writesBeforeRecovery, 'recovery cannot delete a live publisher ticket');
    assert.ok(await originalRead(intentPath));
    assert.equal(writeActive, true);
  } finally {
    releaseWrite.resolve();
    await publication;
  }
  assert.deepEqual((await storage.loadV1CampaignSave(r.adapter, saveId)).state, r.candidate);
  assert.equal(r.controller.getSavePublicationStatus(), null);
}

for (const lateResult of ['intent', 'missing', 'error']) {
  const r = await rig();
  const intentPath = storage.V1_STORAGE_PATHS.publicationIntent(saveId);
  const enteredRead = deferred(), sampledIntent = deferred(), releaseRead = deferred(), enteredWrite = deferred();
  const originalRead = r.adapter.readJson, originalWrite = r.adapter.writeJson;
  let holdNextRead = true, holdNextWrite = true;
  r.adapter.readJson = async key => {
    if (key === intentPath && holdNextRead) {
      holdNextRead = false; enteredRead.resolve(); await enteredWrite.promise;
      const sampled = await originalRead(key);
      sampledIntent.resolve(); await releaseRead.promise;
      if (lateResult === 'error') throw Object.assign(new Error('stale failed read after publication'), { code: 'EIO' });
      return lateResult === 'missing' ? null : sampled;
    }
    return originalRead(key);
  };
  r.adapter.writeJson = async (key, value) => {
    await originalWrite(key, value);
    if (key === intentPath && holdNextWrite) {
      holdNextWrite = false; enteredWrite.resolve(); await sampledIntent.promise;
    }
  };
  const lateRead = r.controller.verifySaveWritable().then(() => null, error => error);
  await enteredRead.promise;
  await r.controller.persistActiveCampaign({ campaignState: r.candidate });
  assert.equal(r.controller.getSavePublicationStatus(), null, 'new publication completed and acknowledged');
  releaseRead.resolve();
  const error = await lateRead;
  assert.equal(error?.code, 'DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT', 'an obsolete read cannot quarantine a newer completed publication');
  assert.equal(r.controller.getSavePublicationStatus(), null);
  assert.deepEqual(r.controller.getActiveCampaignState(), r.candidate);
  await r.controller.verifySaveWritable();
}

for (const lateReadError of [false, true]) {
  const r = await rig(), enteredRead = deferred(), releaseRead = deferred();
  const originalRead = r.adapter.readJson;
  const intentPath = storage.V1_STORAGE_PATHS.publicationIntent(saveId);
  let holdNextRead = true;
  r.adapter.readJson = async key => {
    if (key !== intentPath) return originalRead(key);
    if (holdNextRead) {
      holdNextRead = false; enteredRead.resolve(); await releaseRead.promise;
      if (lateReadError) throw Object.assign(new Error('obsolete second read failure'), { code: 'EIO' });
      return null;
    }
    throw Object.assign(new Error('owned first read failure'), { code: 'EIO' });
  };
  const lateRead = r.controller.verifySaveWritable().then(() => null, error => error);
  await enteredRead.promise;
  await assert.rejects(r.controller.verifySaveWritable(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  const ownedUncertainty = r.controller.getSavePublicationStatus();
  assert.equal(ownedUncertainty.phase, 'uncertain');
  releaseRead.resolve();
  assert.equal((await lateRead)?.code, 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN');
  assert.deepEqual(r.controller.getSavePublicationStatus(), ownedUncertainty, 'late reads preserve another established uncertainty record');
}

console.log('PASS controller application ownership: synchronous detachment, exact context, concurrent admission, late read ownership');
