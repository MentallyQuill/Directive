import { withCampaignTimelineLease } from '../../src/runtime/timeline-transaction-service.mjs';
import assert from 'node:assert/strict';
import { createFakeChatAdapter, createFakeDirectiveHost, createFakeJsonStorage, createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { createV1CampaignSave, storeV1CampaignSave, loadV1CampaignSave } from '../../src/storage/v1-storage-repository.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const assets = loadAshesRuntimeAssets();
const now = '2026-09-16T12:00:00.000Z';
let sequence = 0;
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function rig() {
  const suffix = ++sequence, saveId = `save.finalization.${suffix}`, chatId = `chat.finalization.${suffix}`;
  const before = createAshesInitialState({ campaignId: `campaign.finalization.${suffix}`, saveId, chatId });
  before.campaignChatBinding = { ...before.campaignChatBinding, hostId: 'fake', entityType: 'character', entityId: '7', entityName: 'Narrator' };
  const storage = createFakeJsonStorage();
  await storeV1CampaignSave(storage, createV1CampaignSave({ id: saveId, state: before, createdAt: now }));
  let nativeActive = false;
  let replyActive = null;
  const chat = createFakeChatAdapter({ chatId, entityId: '7', entityName: 'Narrator', messages: [],
    isGenerating: () => nativeActive, isReplyGenerating: () => replyActive ?? nativeActive });
  await chat.updateBindingMetadata(before.campaignChatBinding);
  const host = createFakeDirectiveHost({ chat, storage, chatNative: true, generation: createFakeGenerationClient({ responses: {
    narration: { text: 'The bridge is ready for your orders.' },
  } }) });
  const app = createDirectiveRuntimeApp({ host, packageLoader: async () => assets, now: () => now });
  await app.initialize();
  async function state() { return (await app.getCurrentView({ tabId: 'mission' })).campaignState; }
  async function control() {
    const view = await app.getCurrentView({ tabId: 'mission' });
    const mission = view.v1PlayerProjection?.mission;
    // The public mission projection supplies the exact control revision/run.
    const projected = mission || view.view?.mission;
    const objective = projected?.objectives?.find(item => item.progressControl);
    assert.ok(objective, `mission control missing: ${Object.keys(view)}`);
    return { missionId: projected.missionId, objectiveId: objective.id,
      expectedRunId: projected.runId, expectedRevision: objective.progressControl.expectedRevision,
      action: 'resolve', disposition: 'completed' };
  }
  return { app, host, chat, storage, saveId, chatId, campaignId: before.campaign.id, before: await state(), state, control,
    setNativeActive(value) { nativeActive = value; }, setReplyActive(value) { replyActive = value; } };
}


async function rejectedOpening(app) {
  let value;
  try { value = await app.retryOpening(); } catch (error) { return error; }
  assert.equal(value.ok, false, 'Opening retry must remain blocked');
  return value;
}
async function waitFor(test) {
  const deadline = Date.now() + 4000;
  while (!test()) { assert(Date.now() < deadline, 'Expected opening stage timed out'); await new Promise(resolve => setImmediate(resolve)); }
}
// Actual post is held both before append and after append, modeling native save.
for (const appendBeforeHold of [false, true]) {
  const r = await rig(), entered = deferred(), release = deferred();
  const post = r.chat.postAssistantMessage.bind(r.chat);
  let calls = 0;
  r.chat.postAssistantMessage = async options => {
    calls++; const result = appendBeforeHold ? await post(options) : null;
    entered.resolve(); await release.promise;
    return result || post(options);
  };
  const opening = r.app.retryOpening();
  await Promise.race([entered.promise, opening.then(value => { throw Error(`Opening ended before post: ${JSON.stringify(value.error || value.reason)}`); })]);
  try {
    await assert.rejects(r.app.adjustObjectiveProgress(await r.control()), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
    await assert.rejects(r.app.removeCampaignPlayerPortrait(), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
    await r.app.handleHostGenerationStopped();
    assert(r.app.getTranscriptFinalizationStatus(), 'Stop does not discard running opening owner');
    await assert.rejects(r.app.retryPendingPeopleDossiers(), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
    assert.equal(calls, 1);
    assert.deepEqual(await r.state(), r.before);
  } finally { release.resolve(); await opening; }
  assert.equal(r.chat.messages().length, 1, 'native post settles once even after Stop');
  await r.app.retryOpening();
  assert.equal(calls, 1, 'verified appended opening retry does not post twice');
}
{
  const r = await rig(), locked = deferred(), release = deferred();
  const lease = withCampaignTimelineLease(r.campaignId, async () => { locked.resolve(); await release.promise; });
  await locked.promise;
  let posts = 0; const original = r.chat.postAssistantMessage.bind(r.chat);
  r.chat.postAssistantMessage = async options => { posts++; return original(options); };
  const opening = r.app.retryOpening();
  await waitFor(() => r.app.getTranscriptFinalizationStatus()?.phase === 'finalizing');
  await r.app.handleHostGenerationStopped();
  release.resolve(); await lease; await opening;
  assert.equal(posts, 0, 'Stop before queued opening dispatch prevents append');
  assert.equal(r.chat.messages().length, 0);
  const retried = await r.app.retryOpening();
  assert.equal(retried.ok, true, JSON.stringify(retried));
  assert.equal(posts, 1);
}
{
  const r = await rig();
  const post = r.chat.postAssistantMessage.bind(r.chat); let attempts = 0, fail = true;
  r.chat.postAssistantMessage = async options => { attempts++; if (fail) throw Error('pre-append failure'); return post(options); };
  await rejectedOpening(r.app);
  assert.equal(attempts, 1);
  fail = false; r.setNativeActive(true);
  await rejectedOpening(r.app);
  assert.equal(attempts, 1, 'native activity blocks failed opening retry');
  r.setNativeActive(false);
  r.chat.pushAssistantMessage({ hostMessageId: 'foreign', text: 'Unrelated source.' });
  await rejectedOpening(r.app);
  assert.equal(attempts, 1, 'changed baseline cannot release no-append failure');
  r.chat.setMessagesForChat(r.chatId, []);
  assert.equal((await r.app.retryOpening()).ok, true);
  assert.equal(attempts, 2);
}
for (const tamper of ['text', 'idempotencyKey']) {
  const r = await rig();
  const get = r.chat.getMessage.bind(r.chat), post = r.chat.postAssistantMessage.bind(r.chat);
  let fail = true, posts = 0;
  r.chat.postAssistantMessage = async options => { posts++; return post(options); };
  r.chat.getMessage = id => { if (fail) throw Error('readback unavailable after append'); return get(id); };
  await rejectedOpening(r.app);
  const exact = r.chat.messages(); assert.equal(exact.length, 1);
  fail = false;
  const changed = structuredClone(exact);
  if (tamper === 'text') changed[0].text += ' changed'; else changed[0].metadata.idempotencyKey = 'foreign';
  r.chat.setMessagesForChat(r.chatId, changed);
  await rejectedOpening(r.app);
  assert(r.app.getTranscriptFinalizationStatus(), 'unverified appended opening retains barrier');
  assert.equal(posts, 1);
  r.chat.setMessagesForChat(r.chatId, exact);
  r.setNativeActive(true); await rejectedOpening(r.app);
  assert(r.app.getTranscriptFinalizationStatus(), 'native active retains appended failure barrier');
  r.setNativeActive(false);
  assert.equal((await r.app.retryOpening()).ok, true);
  assert.equal(posts, 1, 'read-verified retry handles existing opening without double post');
  assert.deepEqual(r.chat.messages(), exact);
  assert.deepEqual((await loadV1CampaignSave(r.storage, r.saveId)).state, r.before);
}
console.log('PASS public opening finalization: queued Stop, running ownership, exact failed recovery, no double post');

for (const corruptText of [false, true]) {
  const r = await rig(), post = r.chat.postAssistantMessage.bind(r.chat);
  r.chat.postAssistantMessage = async options => {
    const result = await post(options);
    if (corruptText) { const rows = r.chat.messages(); rows[0].text = 'Unrelated duplicate prose'; r.chat.setMessagesForChat(r.chatId, rows); }
    return { ...result, posted: false, duplicate: true };
  };
  const outcome = await r.app.retryOpening();
  assert.equal(outcome.ok, !corruptText, 'Duplicate result still requires exact expected opening text');
  assert.equal(r.chat.messages().length, 1);
}

{
  const host = createFakeDirectiveHost({ chatNative: true, generation: createFakeGenerationClient({ responses: {
    narration: { text: 'The bridge is ready for your orders.' },
  } }) });
  let ids = 0;
  const app = createDirectiveRuntimeApp({ host, packageLoader: async () => assets,
    idFactory: prefix => `${prefix}.opening-start.${++ids}`, now: () => now });
  await app.initialize();
await app.startCreatorDraft();
await app.saveCreatorDraft({patch:{activeStep:'review',input:{identity:{name:'Opening Tester',pronounsOrAddress:'they/them',speciesId:'human',ageBandId:'mid-career',appearance:'Attentive.'},service:{careerBackgroundId:'tactical-security',formativeExperienceId:'dominion-war-fleet-service',assignmentReasonId:'experienced-outsider-transfer'},personality:{traits:{insight:'perceptive',connection:'candid',execution:'decisive'},flawId:'impatient'},dossier:{briefBiography:'A command officer who coordinated refugee transports.',publicReputation:'An attentive command officer.'}}}});

  const entered = deferred(), release = deferred(), post = host.chat.postAssistantMessage.bind(host.chat);
  host.chat.postAssistantMessage = async options => { entered.resolve(); await release.promise; return post(options); };
  const started = app.acceptCreatorDraftAndStartCampaign();
  await Promise.race([entered.promise, started.then(value => { throw Error(`Start did not reach opening: ${value.opening?.error?.message}`); })]);
  try { await assert.rejects(app.removeCampaignPlayerPortrait(), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' }); }
  finally { release.resolve(); }
  assert.equal((await started).opening.ok, true);
  assert.equal(host.chat.messages().length, 1);
}
console.log('PASS opening duplicate readback and public campaign start ownership');
