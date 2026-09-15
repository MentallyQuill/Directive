import assert from 'node:assert/strict';
import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const assets = loadAshesRuntimeAssets();
const saveId = 'save.controller-publication';
const path = storage.V1_STORAGE_PATHS.save(saveId);
const now = '2026-09-15T12:00:00.000Z';
async function rig() {
  const files = new Map();
  const fault = { write: null, unreadable: false };
  let writes = 0;
  const adapter = {
    async readJson(key) {
      if (fault.intentUnreadable && key === storage.V1_STORAGE_PATHS.publicationIntent(saveId)) throw new Error('intent temporarily unreadable');
      if (fault.unreadable && key === path) throw new Error('manifest unreadable');
      if (!files.has(key)) throw Object.assign(new Error('not found'), { code: 'ENOENT' });
      return structuredClone(files.get(key));
    },
    async writeJson(key, value) {
      writes++;
      if (key === path && fault.block) { fault.entered(); await fault.block; }
      if (key === path && fault.write === 'before') throw new Error('failed before write');
      files.set(key, structuredClone(value));
      if (key === path && fault.write === 'after') throw new Error('lost acknowledgement');
      if (key === path && fault.write === 'unreadable') fault.unreadable = true;
    },
    async deleteJsonFile(key) { writes++; files.delete(key); },
  };
  let state = createAshesInitialState({ campaignId: 'campaign.controller-publication', saveId, chatId: 'chat.publication' });
  const before = structuredClone(state);
  await storage.storeV1CampaignSave(adapter, storage.createV1CampaignSave({ id: saveId, state, createdAt: now }));
  const createController = () => createCampaignStartController({ adapter, packages: [assets.packageData],
    missionDefinitions: assets.missionDefinitions, now: () => now });
  const controller = createController();
  await controller.initialize();
  assert.equal(typeof controller.recoverSavePublication, 'function', 'controller owns persistent save recovery');
  const makeGateway = () => createStateDeltaGateway({
    getState: () => state, setState: next => { state = next; },
    beforeCommit: () => controller.assertSaveWritable(),
    persist: next => controller.persistActiveCampaign({ campaignState: next }),
  });
  const proposal = (id = 'operation.controller-publication', revision = 0) => ({ id, baseRevision: revision,
    domains: ['mission'], patch: { mission: { v1: { revision: revision + 1 } } } });
  return { adapter, controller, createController, makeGateway, proposal, fault, before, files,
    state: () => structuredClone(state), writes: () => writes };
}
{
  const r = await rig();
  r.fault.write = 'after';
  await r.makeGateway().applyProposal(r.proposal());
  assert.equal(r.state().stateCustody.revision, 1);
  assert.deepEqual(r.controller.getActiveCampaignState(), r.state());
  assert.deepEqual((await storage.loadV1CampaignSave(r.adapter, saveId)).state, r.state());
  assert.equal(r.controller.getSavePublicationStatus(), null);
}
{
  const r = await rig();
  r.fault.write = 'before';
  await assert.rejects(r.makeGateway().applyProposal(r.proposal()), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_FAILED' });
  assert.deepEqual(r.state(), r.before);
  assert.deepEqual(r.controller.getActiveCampaignState(), r.before);
}
{
  const r = await rig();
  r.fault.write = 'unreadable';
  await assert.rejects(r.makeGateway().applyProposal(r.proposal()), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  assert.equal(r.state().stateCustody.revision, 1, 'uncertainty must not roll the candidate back');
  assert.equal(r.controller.getSavePublicationStatus().phase, 'uncertain');
  const writes = r.writes();
  await assert.rejects(r.makeGateway().applyProposal(r.proposal('later', 1)), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  for (const action of [
    () => r.controller.persistActiveCampaign({ campaignState: r.state() }),
    () => r.controller.createCheckpoint({ name: 'Blocked' }),
    () => r.controller.prepareTimelineCheckpoint({ name: 'Blocked' }),
    () => r.controller.loadGame({ saveId }),
    () => r.controller.loadCheckpoint({ checkpointId: 'checkpoint.blocked' }),
    () => r.controller.bindCheckpointChat({ checkpointId: saveId, binding: {} }),
    () => r.controller.renameSavedGame({ savedGameId: saveId, name: 'Blocked' }),
    () => r.controller.retireSupersededTimeline({ saveId }),
    () => r.controller.deleteSave({ saveId }),
    () => r.controller.persistInactiveTimeline({ save: { id: 'save.child' } }),
    () => r.controller.activatePersistedTimeline({ expectedSaveId: saveId, nextSaveId: 'save.child' }),
    () => r.controller.storeTimelineOperation({}),
    () => r.controller.deleteTimelineOperation({ campaignId: r.before.campaign.id }),
    () => r.controller.acceptCreatorDraftAndStartCampaign({}),
    () => r.controller.resumeCampaignDeletion({ campaignId: r.before.campaign.id, deleteHostEntity: () => assert.fail('must not delete host') }),
    () => r.controller.prepareCampaignDeletion({ campaignId: r.before.campaign.id, saveId }),
  ]) await assert.rejects(action(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  assert.equal(r.writes(), writes, 'blocked actions perform no writes');
  await assert.rejects(r.controller.recoverSavePublication({ saveId }), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  const restarted = r.createController();
  const restart = await restarted.initialize();
  assert.equal(restart.campaignState, null, 'startup must not select unverified candidate authority');
  assert.equal(restarted.getSavePublicationStatus().phase, 'uncertain');
  assert.throws(() => restarted.assertSaveWritable(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  const view = await restarted.getCampaignView();
  assert.equal(view.campaigns[0].canOpenChat, true, 'startup retains the Continue recovery action');
  assert.equal(view.campaigns[0].canSaveGame, false, 'unverified authority cannot create another saved game');
  r.fault.unreadable = false;
  r.fault.write = null;
  const recovered = await restarted.recoverSavePublication({ saveId });
  assert.equal(recovered.publication, 'committed');
  assert.equal(restarted.getActiveCampaignState().stateCustody.revision, 1);
  assert.equal(restarted.getSavePublicationStatus(), null);
  assert.equal((await storage.loadV1CampaignSave(r.adapter, saveId)).state.stateCustody.revision, 1, 'recovery does not reapply');
  // A different controller already cleared the ticket: lost evidence cannot clear this controller's quarantine.
  await assert.rejects(r.controller.recoverSavePublication({ saveId }), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
}
{
  const r = await rig();
  let release;
  const entered = new Promise(resolve => { r.fault.entered = resolve; });
  r.fault.block = new Promise(resolve => { release = resolve; });
  const operation = r.makeGateway().applyProposal(r.proposal());
  await entered;
  assert.equal(r.controller.getSavePublicationStatus().phase, 'pending');
  await assert.rejects(r.controller.initialize(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_PENDING' });
  await assert.rejects(r.controller.recoverSavePublication(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_PENDING' });
  await assert.rejects(r.controller.loadGame({ saveId: 'save.other' }), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_PENDING' });
  release();
  await operation;
  assert.equal(r.controller.getSavePublicationStatus(), null);
}
{
  const r = await rig();
  r.fault.unreadable = true;
  await assert.rejects(r.makeGateway().applyProposal(r.proposal()), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  r.fault.unreadable = false;
  const index = r.files.get(storage.V1_STORAGE_PATHS.index);
  index.saves[saveId].name = 'Stale summary acknowledgement';
  const writes = r.writes();
  const recovered = await r.controller.recoverSavePublication();
  assert.equal(recovered.publication, 'not-committed');
  assert.deepEqual(r.controller.getActiveCampaignState(), r.before);
  assert.equal(r.writes(), writes, 'retained-proof recovery must not repair index metadata');
}
{
  const r = await rig();
  r.fault.intentUnreadable = true;
  const restarted = r.createController();
  assert.equal((await restarted.initialize()).campaignState, null);
  r.fault.intentUnreadable = false;
  const writes = r.writes();
  const recovered = await restarted.recoverSavePublication();
  assert.equal(recovered.publication, 'authority-loaded', 'startup verifies authority without inventing an interrupted operation outcome');
  assert.deepEqual(restarted.getActiveCampaignState(), r.before);
  assert.equal(r.writes(), writes);
}
{
  const r = await rig();
  r.fault.write = 'unreadable';
  await assert.rejects(r.makeGateway().applyProposal(r.proposal()), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  r.fault.intentUnreadable = true;
  const restarted = r.createController();
  await restarted.initialize();
  r.fault.intentUnreadable = false;
  await assert.rejects(restarted.recoverSavePublication(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  assert.equal(restarted.getSavePublicationStatus().readBarrier, false, 'observing an intent ends read-barrier-only recovery');
  r.files.delete(storage.V1_STORAGE_PATHS.publicationIntent(saveId));
  r.fault.unreadable = false;
  await assert.rejects(restarted.recoverSavePublication(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  assert.equal(restarted.getActiveCampaignState(), null, 'a disappeared observed intent cannot become an authority-only reload');
}
console.log('PASS controller publication outcome and restart recovery');
