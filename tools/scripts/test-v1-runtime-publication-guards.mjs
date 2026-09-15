import assert from 'node:assert/strict';
import { createDirectiveGenerationRouter } from '../../src/runtime/runtime-app.mjs';
import { createTimelineTransactionService } from '../../src/runtime/timeline-transaction-service.mjs';

let reads = 0;
let effects = 0;
const error = Object.assign(new Error('Resolve the pending publication.'), {
  code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN',
});
const controller = {
  getActiveSave: () => ({ id: 'save.pending', campaignId: 'campaign.pending' }),
  verifySaveWritable: async () => { throw error; },
  loadTimelineOperation: async () => { reads++; return null; },
};
const service = createTimelineTransactionService({
  controller, chat: {}, getState: () => null, setState() {},
});
await assert.rejects(service.runExclusive({ task: () => { effects++; } }), candidate => candidate === error);
assert.equal(effects, 0, 'publication quarantine rejects queued effects');
assert.equal(reads, 0, 'publication guard precedes timeline continuation');
const router = createDirectiveGenerationRouter({ generation: { async generate() { throw error; } } });
await assert.rejects(router.generate('storyDirector', {}), candidate => candidate === error,
  'publication errors retain their identity instead of becoming retryable provider failures');
import { installFakeDom } from './helpers/fake-dom.mjs';
installFakeDom();
const { showSettlementRetryDialog, closeSettlementRetryDialog } = await import('../../src/ui/settlement-retry-dialog.js');
for (const [reasonCode, message] of [
  ['state-publication-pending', /could not verify whether/],
  ['state-publication-acknowledgement', /save was verified/],
  ['state-publication-not-committed-acknowledgement', /game was not changed/],
  ['state-publication-writing', /still being written/],
]) {
  const dialog = showSettlementRetryDialog({ reasonCode });
  assert.match(dialog.dialog.querySelector('.directive-settlement-retry-message').textContent, message);
  assert.equal(dialog.retry.hidden, true, 'uncertain authority must not offer original turn retry');
  assert.match(dialog.dialog.querySelector('.directive-settlement-retry-detail').textContent, reasonCode === 'state-publication-writing' ? /Wait/ : /open Campaign, and choose Continue/);
  closeSettlementRetryDialog();
}

console.log('Runtime publication guard regressions passed.');
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { createFakeJsonStorage, createFakeDirectiveHost, createFakeChatAdapter } from '../../src/hosts/fake/fake-host.mjs';
import { createV1CampaignSave, storeV1CampaignSave, loadV1CampaignSave, V1_STORAGE_PATHS } from '../../src/storage/v1-storage-repository.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

async function runtimeRig({ unbound = false } = {}) {
  const assets = loadAshesRuntimeAssets();
  const saveId = 'save.runtime-publication';
  const path = V1_STORAGE_PATHS.save(saveId);
  const json = createFakeJsonStorage();
  const fault = { write: null, unreadable: false, acknowledgement: false };
  const uploads = [], deletes = [];
  let writes = 0, manifestWrites = 0, generations = 0, tick = 0;
  const adapter = { ...json,
    async readJson(key) {
      if (fault.unreadable && key === path) throw new Error('manifest unreadable');
      return json.readJson(key);
    },
    async writeJson(key, value) {
      writes++;
      if (key === path) manifestWrites++;
      if (key === path && fault.write === 'before') throw new Error('before manifest');
      await json.writeJson(key, value);
      if (key === path && fault.write === 'after') throw new Error('after manifest');
      if (key === path && fault.write === 'unreadable') fault.unreadable = true;
    },
    async deleteJsonFile(key) {
      if (fault.acknowledgement && key === V1_STORAGE_PATHS.publicationIntent(saveId)) throw new Error('acknowledgement unavailable');
      return json.deleteJsonFile(key);
    },
    async writeBase64File(name) { const path = `/user/files/${name}`; uploads.push(path); return { ok: true, path, fileName: name }; },
    async deleteFile(path) { deletes.push(path); return { ok: true, path }; },
  };
  const initial = createAshesInitialState({ campaignId: 'campaign.runtime-publication', saveId, chatId: 'chat.publication' });
  initial.campaignChatBinding = { ...initial.campaignChatBinding, hostId: 'fake', entityType: 'character', entityId: '7', entityName: 'Publication Captain' };
  if (unbound) initial.campaignChatBinding = null;
  await storeV1CampaignSave(adapter, createV1CampaignSave({ id: saveId, state: initial, createdAt: '2026-09-15T12:00:00.000Z' }));
  const chat = createFakeChatAdapter({ chatId: 'chat.publication', entityId: '7', entityName: 'Publication Captain',
    messages: [{ id: 'opening', role: 'assistant', text: 'The captain waits.', isDirectiveOwned: true }] });
  if (!unbound) await chat.updateBindingMetadata(initial.campaignChatBinding);
  const host = createFakeDirectiveHost({ chatNative: true, storage: adapter, chat,
    generation: { async generate() { generations++; throw new Error('Unexpected provider dispatch'); } } });
  const makeApp = () => createDirectiveRuntimeApp({ host, packageLoader: async () => assets,
    now: () => new Date(Date.UTC(2026, 8, 15, 12, 0, tick++)).toISOString() });
  const app = makeApp();
  await app.initialize();
  const upload = (target = app) => target.importCampaignPlayerPortrait({ bytes: new Uint8Array([1,2,3,4]), mimeType: 'image/png', fileName: 'captain.png' });
  return { app, host, makeApp, upload, fault, uploads, deletes, adapter, saveId, writes: () => writes, manifestWrites: () => manifestWrites, generations: () => generations };
}
{
  const r = await runtimeRig();
  r.fault.write = 'after';
  const result = await r.upload();
  assert.equal((await loadV1CampaignSave(r.adapter, r.saveId)).state.player.portrait.asset.path, result.portrait.asset.path);
  assert.deepEqual(r.deletes, [], 'verified write-then-throw retains the committed portrait');
  assert.equal(r.app.getSavePublicationStatus(), null);
}
{
  const r = await runtimeRig();
  r.fault.write = 'before';
  await assert.rejects(r.upload(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_FAILED' });
  assert.deepEqual(r.deletes, r.uploads, 'confirmed non-commitment cleans the unused upload');
  assert.equal((await loadV1CampaignSave(r.adapter, r.saveId)).state.player.portrait ?? null, null);
}
{
  const r = await runtimeRig();
  const prior = await r.upload();
  r.fault.write = 'unreadable';
  await assert.rejects(r.upload(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  assert.equal(r.app.getSavePublicationStatus().phase, 'uncertain');
  assert.equal((await r.app.getCurrentView({ tabId: 'crew' })).campaignState.player.portrait.asset.path, r.uploads[1],
    'runtime retains the uncertain candidate instead of claiming the prior portrait is authoritative');
  assert.equal(r.uploads.length, 2);
  assert.deepEqual(r.deletes, [], 'both candidate portraits survive uncertainty');
  const writes = r.writes();
  const uploads = r.uploads.length;
  for (const intent of ['direct', 'explicit', 'native']) {
    const blocked = await r.app.getChatTurnOrchestrator().interceptGeneration({ recoveryIntent: intent });
    assert.equal(blocked.handled, true);
    assert.equal(blocked.abortDefaultGeneration, true);
    assert.equal(blocked.reasonCode, 'state-publication-pending');
  }
  await r.app.handleHostGenerationStopped();
  assert.equal(r.app.getSavePublicationStatus().phase, 'uncertain', 'Stop cannot clear publication uncertainty');
  await assert.rejects(r.app.retryPendingAcceptedPairSettlement(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  await assert.rejects(r.upload(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  await assert.rejects(r.app.openCampaignChat(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN' });
  assert.equal(r.writes(), writes);
  assert.equal(r.uploads.length, uploads);
  assert.equal(r.generations(), 0);
  const restarted = r.makeApp();
  const startup = await restarted.initialize();
  assert.equal(startup.campaignState, null);
  assert.equal(startup.campaignIndex.campaigns[0].canOpenChat, true);
  const blockedStartup = await restarted.getChatTurnOrchestrator().interceptGeneration();
  assert.equal(blockedStartup.handled, true);
  assert.equal(blockedStartup.abortDefaultGeneration, true);
  r.fault.unreadable = false;
  r.fault.write = null;
  const manifestWrites = r.manifestWrites();
  const candidate = (await loadV1CampaignSave(r.adapter, r.saveId)).state;
  assert.notEqual(candidate.player.portrait.asset.path, prior.portrait.asset.path);
  const opened = await restarted.openCampaignChat({ saveId: r.saveId });
  assert.equal(opened.view.campaignState.player.portrait.asset.path, candidate.player.portrait.asset.path);
  assert.equal(opened.view.campaignState.stateCustody.revision, candidate.stateCustody.revision);
  assert.equal(restarted.getSavePublicationStatus(), null);
  assert.equal(r.manifestWrites(), manifestWrites, 'recovery acknowledges the ticket without replaying the original manifest write');
  assert.deepEqual(r.deletes, []);
}
{
  const r = await runtimeRig();
  r.fault.acknowledgement = true;
  const result = await r.upload();
  assert.equal(r.app.getSavePublicationStatus().phase, 'acknowledgement');
  assert.equal((await loadV1CampaignSave(r.adapter, r.saveId)).state.player.portrait.asset.path, result.portrait.asset.path);
  const blocked = await r.app.getChatTurnOrchestrator().interceptGeneration();
  assert.equal(blocked.abortDefaultGeneration, true);
  assert.equal(blocked.reasonCode, 'state-publication-acknowledgement');
  const manifestWrites = r.manifestWrites();
  r.fault.acknowledgement = false;
  const recovered = await r.app.recoverSavePublication();
  assert.equal(recovered.publication, 'committed');
  assert.equal(r.app.getSavePublicationStatus(), null);
  assert.equal(r.manifestWrites(), manifestWrites);
  assert.deepEqual(r.deletes, []);
}
{
  const r = await runtimeRig();
  r.fault.write = 'before';
  r.fault.acknowledgement = true;
  await assert.rejects(r.upload(), { code: 'DIRECTIVE_V1_STATE_PERSISTENCE_FAILED' });
  const blocked = await r.app.getChatTurnOrchestrator().interceptGeneration();
  assert.equal(blocked.abortDefaultGeneration, true);
  assert.equal(blocked.reasonCode, 'state-publication-not-committed-acknowledgement',
    'verified non-commitment must not claim the game was saved');
  assert.equal((await loadV1CampaignSave(r.adapter, r.saveId)).state.player.portrait ?? null, null);
}
console.log('Integrated runtime publication recovery regressions passed.');


{
  const r = await runtimeRig({ unbound: true });
  let chatDeletes = 0;
  r.host.chat.openCampaignChat = async () => false;
  r.host.chat.deleteCampaignCharacter = async () => { chatDeletes++; return { deleted: true }; };
  r.host.chat.deleteCampaignChat = async () => { chatDeletes++; return { deleted: true }; };
  await assert.rejects(r.app.openCampaignChat(), { code: 'DIRECTIVE_CAMPAIGN_CHAT_OPEN_FAILED' });
  const durable = await loadV1CampaignSave(r.adapter, r.saveId);
  assert(durable.state.campaignChatBinding?.chatId, 'binding was committed before host open failed');
  assert.equal(chatDeletes, 0, 'failed rollback must preserve the durably referenced chat and character');
}
console.log('Campaign binding cleanup protection regression passed.');
