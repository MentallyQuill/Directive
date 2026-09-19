import assert from 'node:assert/strict';
import { createFakeChatAdapter, createFakeDirectiveHost, createFakeJsonStorage } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { createV1CampaignSave, storeV1CampaignSave, loadV1CampaignSave } from '../../src/storage/v1-storage-repository.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import { withCampaignTimelineLease } from '../../src/runtime/timeline-transaction-service.mjs';

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
  const host = createFakeDirectiveHost({ chat, storage });
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
  return { app, host, chat, storage, saveId, before: await state(), state, control,
    setNativeActive(value) { nativeActive = value; }, setReplyActive(value) { replyActive = value; } };
}

for (const heldMethod of ['stripAssistantTimeFooter', 'attachAssistantRuntimeMetadata']) {
  const r = await rig();
  const entered = deferred(), release = deferred();
  const actual = r.host.chat[heldMethod].bind(r.host.chat);
  r.host.chat[heldMethod] = async options => { entered.resolve(); await release.promise; return actual(options); };
  const assistant = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.finalization',
    text: 'The bridge report is ready.\n*Stardate 48200.1 | 12:34:56 hours*' });
  const ended = r.app.handleHostGenerationEnded({ message: assistant });
  await entered.promise;
  try {
    await assert.rejects(r.app.adjustObjectiveProgress(await r.control()),
      { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' }, `${heldMethod}: manual authority must not see an unfinished row`);
    await assert.rejects(r.app.retryPendingPeopleDossiers(), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
    assert.deepEqual(await r.state(), r.before);
    assert.deepEqual((await loadV1CampaignSave(r.storage, r.saveId)).state, r.before);
  } finally { release.resolve(); await ended; }
  const applied = await r.app.adjustObjectiveProgress(await r.control());
  assert.equal(applied.ok, true, 'verified finalization releases authority writers');
}

console.log('PASS public runtime transcript finalization admission');

for (const variant of ['missing-extra', 'empty-extra', 'native-extra', 'null-extra', 'null-reasoning', 'false-reasoning', 'text-change', 'metadata-change', 'reasoning-change', 'reasoning-erased', 'earlier-row', 'assistant-before', 'user-tail', 'no-output', 'unchanged-no-output']) {
  const r = await rig();
  r.chat.pushPlayerMessage({hostMessageId:'player.earlier',text:'Earlier instruction.'});
  r.chat.pushPlayerMessage({hostMessageId:'player.native',text:'Keep the current course.'});
  const before = r.chat.messages();
  if (variant !== 'missing-extra') before[1].extra = variant === 'null-reasoning' ? {reasoning:null} : {};
  if (variant === 'null-extra') before[1].extra = null;
  if (variant === 'native-extra') before[1].extra = {isSmallSys:false};
  if (variant === 'false-reasoning') before[1].extra.reasoning = false;
  if (variant === 'reasoning-erased') before[1].extra.reasoning = 'Meaningful reasoning';
  if (variant === 'assistant-before') { before[1].isUser = false; before[1].role = 'assistant'; }
  r.chat.setMessagesForChat(r.chat.getCurrentChatId(), before);
  r.app.handleHostGenerationStarted();
  r.app.handleHostStreamTokenReceived();
  const changed = r.chat.messages();
  if (variant !== 'unchanged-no-output') changed[1].extra = {...changed[1].extra, reasoning:''};
  if (variant === 'text-change') changed[1].text = 'Different instruction.';
  if (variant === 'metadata-change') changed[1].extra.authority = 'changed';
  if (variant === 'reasoning-change') changed[1].extra.reasoning = 'Meaningful reasoning';
  if (variant === 'earlier-row') changed[0].extra = {reasoning:''};
  r.chat.setMessagesForChat(r.chat.getCurrentChatId(), changed);
  if (variant === 'user-tail') r.chat.pushPlayerMessage({hostMessageId:'player.wrong-tail',text:'Another instruction.'});
  else if (!['no-output','unchanged-no-output'].includes(variant)) r.chat.pushAssistantMessage({hostMessageId:'assistant.native',text:'Course maintained.'});
  const result = await r.app.handleHostGenerationEnded();
  const allowed = ['missing-extra','empty-extra','native-extra','null-extra','null-reasoning','false-reasoning'].includes(variant);
  assert.equal(r.app.getTranscriptFinalizationStatus() === null, allowed || variant === 'unchanged-no-output', `${variant}: only native empty reasoning normalization admits finalization`);
  if (!allowed) assert.equal(result.reason, 'no-owned-assistant-output');
}

{
  const r = await rig();
  r.app.handleHostGenerationStarted();
  assert.equal(r.app.getTranscriptFinalizationStatus().phase, 'preparing', 'start reserves synchronously');
  await assert.rejects(r.app.adjustObjectiveProgress(await r.control()), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
  r.setNativeActive(true);
  const prepared = await r.app.getChatTurnOrchestrator().interceptGeneration({ recoveryIntent: 'native' });
  assert.equal(prepared.abortDefaultGeneration, false, 'owned preparation can drain queue without deadlock');
  assert.equal(r.app.getTranscriptFinalizationStatus().phase, 'producing');
  r.app.handleHostGenerationStarted();
  const repeated = await r.app.getChatTurnOrchestrator().interceptGeneration({ recoveryIntent: 'native' });
  assert.equal(repeated.abortDefaultGeneration, true, 'a second start cannot replace unfinished output owner');
  await assert.rejects(r.app.retryPendingPeopleDossiers(), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
  const assistant = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.started', text: 'Ready for orders.',
    swipes: ['Earlier variant.', 'Ready for orders.'], swipeId: 1 });
  r.setReplyActive(false);
  await r.app.handleHostGenerationEnded({ message: assistant });
  assert.equal(r.app.getTranscriptFinalizationStatus(), null);
  await assert.rejects(r.app.retryPendingPeopleDossiers(), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' }, 'group/member end does not admit writes while native generation remains active');
  r.setNativeActive(false);
}

{
  const r = await rig();
  for (const type of ['quiet', 'impersonate']) {
    assert.equal(r.app.handleHostGenerationStarted({ type }).handled, false);
    assert.equal(r.app.getTranscriptFinalizationStatus(), null);
  }
  r.app.handleHostGenerationStarted();
  await r.app.handleHostGenerationStopped();
  assert.equal(r.app.getTranscriptFinalizationStatus().phase, 'failed');
  r.app.handleHostGenerationStarted();
  const resumed = await r.app.getChatTurnOrchestrator().interceptGeneration({ recoveryIntent: 'native' });
  assert.equal(resumed.abortDefaultGeneration, false, 'no-output cancellation recovers only after exact unchanged transcript proof');
  assert.equal(r.chat.calls().filter(call => call.type === 'attachAssistantRuntimeMetadata').length, 0,
    'pre-output Stop must never annotate an earlier assistant');
}

{
  const r = await rig(), entered = deferred(), release = deferred();
  const strip = r.host.chat.stripAssistantTimeFooter.bind(r.host.chat);
  r.host.chat.stripAssistantTimeFooter = async options => { const result = await strip(options); entered.resolve(); await release.promise; return result; };
  const assistant = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.stop', text: 'Ready.\n*Stardate 48200.1 | 12:34:56 hours*' });
  const ended = r.app.handleHostGenerationEnded({ message: assistant }).then(result => result, error => ({ error }));
  await entered.promise;
  await r.app.handleHostGenerationStopped();
  assert.equal(r.app.getTranscriptFinalizationStatus().running, true, 'Stop cannot discard an unresolved host mutation');
  r.app.handleHostGenerationStarted();
  const tooSoon = await r.app.getChatTurnOrchestrator().interceptGeneration({ recoveryIntent: 'native' });
  assert.equal(tooSoon.abortDefaultGeneration, true);
  release.resolve(); await ended;
  assert.equal(r.chat.calls().filter(call => call.type === 'attachAssistantRuntimeMetadata').length, 0,
    'no metadata operation follows Stop during footer save');
  assert.equal(r.app.getTranscriptFinalizationStatus().phase, 'failed');
  assert.deepEqual(await r.state(), r.before);
}

for (const drained of [false, true]) {
  const r = await rig(), entered = deferred(), release = deferred();
  const install = r.host.prompt.install.bind(r.host.prompt);
  r.host.prompt.install = async (...args) => { entered.resolve(); await release.promise; return install(...args); };
  r.app.handleHostGenerationStarted();
  const preparing = r.app.getChatTurnOrchestrator().interceptGeneration({recoveryIntent:'native'});
  await entered.promise;
  await r.app.handleHostGenerationStopped();
  if (drained) { release.resolve(); await preparing; }
  r.setNativeActive(true);
  r.app.handleHostGenerationStarted({type:'regenerate'});
  const retry = await r.app.getChatTurnOrchestrator().interceptGeneration({type:'regenerate',recoveryIntent:'native'});
  assert.equal(retry.abortDefaultGeneration, !drained, 'fresh Regenerate waits for canceled preparation to settle');
  if (!drained) { release.resolve(); await preparing; }
}

for (const variant of ['unchanged', 'changed', 'assistant-output', 'output-before-stop', 'automatic', 'dry-run', 'unsupported']) {
  const r = await rig();
  r.app.handleHostGenerationStarted();
  if (variant === 'output-before-stop') {
    r.app.handleHostStreamTokenReceived();
    r.chat.pushAssistantMessage({text:'Output before Stop.',hostMessageId:'assistant.before-stop'});
  }
  await r.app.handleHostGenerationStopped();
  if (variant === 'changed') r.chat.pushPlayerMessage({text:'Changed source.',hostMessageId:'player.changed'});
  if (variant === 'assistant-output') r.chat.pushAssistantMessage({text:'Unfinalized output.',hostMessageId:'assistant.changed'});
  // Native menu Regenerate marks itself busy before GENERATION_STARTED.
  r.setNativeActive(true);
  if (variant === 'unsupported') r.host.chat.getGenerationActivity = () => ({status:'unsupported',replyStatus:'unsupported'});
  r.app.handleHostGenerationStarted({type:'regenerate',automaticTrigger:variant==='automatic',dryRun:variant==='dry-run'});
  const result = await r.app.getChatTurnOrchestrator().interceptGeneration({type:'regenerate',recoveryIntent:'native'});
  assert.equal(result.abortDefaultGeneration, variant !== 'unchanged', `${variant}: fresh stopped gesture admits only exact unchanged transcript`);
  assert.equal(r.chat.calls().filter(call=>call.type==='attachAssistantRuntimeMetadata').length,0);
}

for (const heldMethod of ['verifyCampaignChatSnapshot', 'cloneCampaignChat']) {
  const r = await rig();
  const saved = await r.app.saveGame({ name: 'Load async boundary' });
  const entered = deferred(), release = deferred(), before = r.storage.snapshot();
  const original = r.chat[heldMethod].bind(r.chat);
  let held = false;
  r.chat[heldMethod] = async (...args) => {
    const result = await original(...args);
    if (!held) { held = true; entered.resolve(); await release.promise; }
    return result;
  };
  const loading = r.app.loadGame({ savedGameId: saved.checkpoint.id });
  await entered.promise;
  assert.equal(r.app.getTranscriptFinalizationStatus().phase, 'loading');
  r.setNativeActive(true);
  r.app.handleHostGenerationStarted();
  assert.equal((await r.app.getChatTurnOrchestrator().interceptGeneration({ recoveryIntent: 'native' })).abortDefaultGeneration, true);
  release.resolve();
  let failure;
  await assert.rejects(loading, error => { failure = error; return error.code === 'DIRECTIVE_TRANSCRIPT_NOT_READY'; });
  assert.deepEqual(await r.state(), r.before);
  assert.deepEqual((await loadV1CampaignSave(r.storage, r.saveId)).state, r.before);
  if (heldMethod === 'verifyCampaignChatSnapshot') assert.deepEqual(r.storage.snapshot(), before, 'asynchronous preflight conflict writes no authority or journal');
  else {
    assert.equal(failure.details?.timelineRecoveryRequired, true, 'postwrite interruption identifies preserved journal recovery');
    assert.ok(Object.values(r.storage.snapshot()).some(value => value?.operationType === 'load-game' && value.stage !== 'completed'));
  }
  r.setNativeActive(false);
  const recovered = await r.app.loadGame({ savedGameId: saved.checkpoint.id });
  assert.equal(recovered.transaction.status, 'activated', 'exact Load Game retry recovers planned clones without deleting custody');
}

{
  const r = await rig();
  const attach = r.host.chat.attachAssistantRuntimeMetadata.bind(r.host.chat);
  r.host.chat.attachAssistantRuntimeMetadata = async () => { throw new Error('metadata write failed'); };
  const assistant = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.failed', text: 'Orders are ready.' });
  const failed = await r.app.handleHostGenerationEnded({ message: assistant });
  assert.equal(failed.metadataAttachment.attached, false);
  await assert.rejects(r.app.adjustObjectiveProgress(await r.control()), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
  r.host.chat.attachAssistantRuntimeMetadata = attach;
  await r.app.handleHostGenerationEnded({ message: assistant });
  assert.equal(r.app.getTranscriptFinalizationStatus(), null, 'exact failed-source retry releases only after readback');
}

{
  const r = await rig(), entered = deferred(), release = deferred();
  const strip = r.host.chat.stripAssistantTimeFooter.bind(r.host.chat);
  r.host.chat.stripAssistantTimeFooter = async options => { const result = await strip(options); entered.resolve(); await release.promise; return result; };
  const assistant = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.switch', text: 'Ready.' });
  const ended = r.app.handleHostGenerationEnded({ message: assistant }).then(result => result, error => ({ error }));
  await entered.promise;
  r.chat.setCurrentChatId('unrelated.chat', null);
  const switched = r.app.handleHostChatChanged();
  release.resolve(); await ended; await switched;
  assert.equal(r.app.getTranscriptFinalizationStatus(), null, 'old failure never owns another chat');
  assert.equal(r.chat.calls().filter(call => call.type === 'attachAssistantRuntimeMetadata').length, 0);
  assert.deepEqual(r.chat.messages(), []);
}

console.log('PASS generation preparation, repeated start, Stop, failed finalization and chat identity');

{
  const r = await rig();
  const old = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.duplicate-old', text: 'Prior reply.' });
  await r.app.handleHostGenerationEnded({ message: old });
  r.app.handleHostGenerationStarted();
  const status = r.app.getTranscriptFinalizationStatus();
  const ignored = await r.app.handleHostGenerationEnded({ message: old });
  assert.equal(ignored.handled, false);
  assert.deepEqual(r.app.getTranscriptFinalizationStatus(), status, 'old explicit duplicate cannot release a newer preparing owner');
  await r.app.handleHostGenerationEnded();
  assert.equal(r.app.getTranscriptFinalizationStatus(), null, 'only the no-output completion path releases unchanged ownership');
}

{
  const r = await rig();
  r.app.handleHostGenerationStarted();
  r.chat.pushPlayerMessage({ hostMessageId: 'player.no-output-stop', text: 'A draft remains after Stop.' });
  await r.app.handleHostGenerationStopped();
  const applied = await r.app.adjustObjectiveProgress(await r.control());
  assert.equal(applied.ok, true, 'an idle Stop after only a new player draft creates no assistant annotation obligation');
  assert.equal(r.app.getTranscriptFinalizationStatus(), null);
}

{
  const r = await rig();
  r.app.handleHostGenerationStarted();
  const player = r.chat.pushPlayerMessage({ hostMessageId: 'player.native-send', text: 'Ready for the report.' });
  const observed = await r.app.observeHostPlayerMessage({ message: player });
  assert.equal(observed.reason, 'generation-preparation-pending');
  const prepared = await r.app.getChatTurnOrchestrator().interceptGeneration({ recoveryIntent: 'native' });
  assert.equal(prepared.abortDefaultGeneration, false);
  const assistant = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.native-send', text: 'The report is ready.' });
  await r.app.handleHostGenerationEnded({ message: assistant });
  assert.equal(r.app.getTranscriptFinalizationStatus(), null, 'native START precedes player append; output baseline belongs to completed preparation');
}

{
  const r = await rig();
  r.chat.pushAssistantMessage({ hostMessageId: 'assistant.regenerate', text: 'Previous reply.' });
  r.app.handleHostGenerationStarted({ type: 'regenerate' });
  r.chat.setMessagesForChat(r.chat.getCurrentChatId(), []);
  const invalidated = await r.app.handleHostMessageDeleted({ hostMessageId: 'assistant.regenerate' });
  assert.equal(invalidated.handled, true, 'native regenerate deletion reconciles under its existing preparation owner');
  const prepared = await r.app.getChatTurnOrchestrator().interceptGeneration({ type: 'regenerate', recoveryIntent: 'native' });
  assert.equal(prepared.abortDefaultGeneration, false);
  const assistant = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.regenerated', text: 'Fresh reply.' });
  await r.app.handleHostGenerationEnded({ message: assistant });
  assert.equal(r.app.getTranscriptFinalizationStatus(), null);
}

{
  const r = await rig();
  r.app.handleHostGenerationStarted();
  r.setNativeActive(true);
  r.app.handleHostGenerationStarted({ automaticTrigger: true });
  const first = r.app.getChatTurnOrchestrator().interceptGeneration({ recoveryIntent: 'native' });
  const second = r.app.getChatTurnOrchestrator().interceptGeneration({ recoveryIntent: 'native' });
  assert.equal((await second).abortDefaultGeneration, true, 'nested starts cannot authorize concurrent interceptors');
  assert.equal((await first).abortDefaultGeneration, false, 'group wrapper/member starts share only unclaimed preparation');
  assert.equal(r.app.getTranscriptFinalizationStatus().phase, 'producing');
}

for (const mode of ['no-op-footer', 'missing-result', 'wrong-text', 'metadata-no-op']) {
  const r = await rig();
  const assistant = r.chat.pushAssistantMessage({ hostMessageId: `assistant.${mode}`, text: 'Ready.\n*Stardate 48200.1 | 12:34:56 hours*' });
  if (mode === 'metadata-no-op') r.host.chat.attachAssistantRuntimeMetadata = async () => ({ ok: true });
  else r.host.chat.stripAssistantTimeFooter = async () => {
    if (mode === 'missing-result') return undefined;
    if (mode === 'wrong-text') {
      r.chat.setMessagesForChat(r.chat.getCurrentChatId(), [{ ...assistant, text: 'Different source.' }]);
    }
    return { ok: true, stripped: false, message: r.chat.getMessage(assistant.hostMessageId) };
  };
  await r.app.handleHostGenerationEnded({ message: assistant });
  assert.equal(r.app.getTranscriptFinalizationStatus()?.phase, 'failed', `${mode} never grants write readiness`);
  await assert.rejects(r.app.adjustObjectiveProgress(await r.control()), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
  assert.deepEqual(await r.state(), r.before);
}

{
  const r = await rig();
  const old = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.reused', text: 'Old source.' });
  r.chat.setMessagesForChat(r.chat.getCurrentChatId(), [{ ...old, text: 'New source.\n*Stardate 48200.1 | 12:34:56 hours*' }]);
  let mutations = 0;
  r.host.chat.stripAssistantTimeFooter = async () => { mutations++; return { ok: true }; };
  assert.equal((await r.app.handleHostGenerationEnded({ message: old })).reason, 'stale-generation-ended');
  assert.equal(r.app.getTranscriptFinalizationStatus(), null, 'stale event cannot manufacture a failed owner');
  assert.equal(mutations, 0, 'late explicit same-ID payload cannot touch the new selected source');
}

{
  const r = await rig();
  const options = await r.control(), entered = deferred(), release = deferred();
  const read = r.storage.readJson.bind(r.storage);
  let held = false;
  r.storage.readJson = async path => {
    if (!held) { held = true; entered.resolve(); await release.promise; }
    return read(path);
  };
  const mutation = r.app.adjustObjectiveProgress(options);
  await entered.promise;
  r.app.handleHostGenerationStarted();
  release.resolve();
  await assert.rejects(mutation, { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' }, 'queue admission rechecks after storage awaits');
  assert.deepEqual(await r.state(), r.before);
  assert.deepEqual((await loadV1CampaignSave(r.storage, r.saveId)).state, r.before);
}

{
  const r = await rig();
  r.app.handleHostGenerationStarted();
  let reads = 0;
  const file = { type: 'image/png', name: 'portrait.png', async arrayBuffer() { reads++; return new ArrayBuffer(4); } };
  await assert.rejects(r.app.importCampaignPlayerPortrait({ file }), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
  assert.equal(reads, 0, 'busy admission occurs before portrait input conversion or storage');
}

{
  const r = await rig();
  const saved = await r.app.saveGame({ name: 'Before unfinished reply' });
  r.host.chat.attachAssistantRuntimeMetadata = async () => ({ ok: false });
  const assistant = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.load-recovery', text: 'Unfinished reply.' });
  await r.app.handleHostGenerationEnded({ message: assistant });
  assert.equal(r.app.getTranscriptFinalizationStatus().phase, 'failed');
  const recovered = await r.app.loadGame({ savedGameId: saved.checkpoint.id });
  assert.ok(recovered.transaction.childSaveId);
  assert.equal(r.app.getTranscriptFinalizationStatus(), null, 'Load Game changes ownership only after the old mutation settled');
}

for (const activity of ['active', 'unsupported', 'idle']) {
  const r = await rig();
  const assistant = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.edited-failure', text: 'Before edit.' });
  r.host.chat.attachAssistantRuntimeMetadata = async () => ({ ok: false });
  await r.app.handleHostGenerationEnded({ message: assistant });
  r.chat.setMessagesForChat(r.chat.getCurrentChatId(), [{ ...assistant, text: 'Edited source.' }]);
  r.host.chat.getGenerationActivity = () => ({ status: activity, replyStatus: activity });
  if (activity === 'idle') {
    assert.equal((await r.app.handleHostMessageEdited({ hostMessageId: assistant.hostMessageId })).handled, true);
    assert.equal(r.app.getTranscriptFinalizationStatus(), null);
    assert.equal((await r.app.handleHostGenerationEnded({ message: assistant })).reason, 'stale-generation-ended');
    assert.equal(r.chat.getMessage(assistant.hostMessageId).text, 'Edited source.');
  } else {
    await assert.rejects(r.app.handleHostMessageEdited({ hostMessageId: assistant.hostMessageId }), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
    assert.equal(r.app.getTranscriptFinalizationStatus().phase, 'failed');
  }
}

{
  const r = await rig();
  const assistant = r.chat.pushAssistantMessage({ hostMessageId: 'assistant.async-gap', text: 'Original reply.' });
  const read = r.storage.readJson.bind(r.storage);
  let reads = 0, mutations = 0;
  r.storage.readJson = async path => {
    const result = await read(path);
    if (++reads === 2) r.chat.setMessagesForChat(r.chat.getCurrentChatId(), [{ ...assistant, text: 'Source edited during barrier.' }]);
    return result;
  };
  r.host.chat.stripAssistantTimeFooter = async () => { mutations++; return { ok: true }; };
  await assert.rejects(r.app.handleHostGenerationEnded({ message: assistant }), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
  assert.equal(mutations, 0, 'source is checked synchronously after awaited save barrier before first mutation');
}

{
  const r = await rig();
  r.chat.pushAssistantMessage({ hostMessageId: 'assistant.unowned', text: 'Existing reply.' });
  const before = r.chat.messages();
  assert.equal((await r.app.handleHostGenerationEnded()).reason, 'unowned-generation-ended');
  assert.equal((await r.app.handleHostGenerationEnded(0)).reason, 'unowned-generation-ended');
  assert.deepEqual(r.chat.messages(), before);
  r.host.chat.getGenerationActivity = () => ({ status: 'unsupported', replyStatus: 'unsupported' });
  await assert.rejects(r.app.adjustObjectiveProgress(await r.control()), { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
}

console.log('PASS native event ordering, no-op failures, precommit/source races, idle recovery and explicit-event custody');

{
  const r = await rig();
  const saved = await r.app.saveGame({ name: 'Load race baseline' });
  const acquired = deferred(), release = deferred();
  const held = withCampaignTimelineLease(r.before.campaign.id, async () => { acquired.resolve(); await release.promise; });
  await acquired.promise;
  const before = r.storage.snapshot();
  const loading = r.app.loadGame({ savedGameId: saved.checkpoint.id });
  await new Promise(resolve => setTimeout(resolve, 25));
  const queuedControl = r.app.adjustObjectiveProgress(await r.control());
  let fileReads = 0;
  const queuedPortrait = r.app.importCampaignPlayerPortrait({ file: { name: 'queued.png', type: 'image/png',
    async arrayBuffer() { fileReads++; return new ArrayBuffer(4); } } });
  r.setNativeActive(true);
  r.app.handleHostGenerationStarted();
  const intercepted = r.app.getChatTurnOrchestrator().interceptGeneration({ recoveryIntent: 'native' });
  r.setNativeActive(false); // The refused native attempt settles before the queued load acquires its lease.
  release.resolve(); await held;
  await assert.rejects(loading, { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' }, 'load rechecks after waiting for timeline lease');
  await assert.rejects(queuedControl, { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
  await assert.rejects(queuedPortrait, { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY' });
  assert.equal(fileReads, 0, 'failed load propagates before queued portrait input/upload');
  assert.equal((await intercepted).abortDefaultGeneration, true);
  assert.deepEqual(r.storage.snapshot(), before, 'prewrite load race creates no journal/checkpoint/child writes');
  assert.deepEqual(await r.state(), r.before);
}
