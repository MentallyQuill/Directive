import assert from 'node:assert/strict';
import { characterNarrativeDigest } from '../../src/narration/character-scene-narrator.mjs';
import { createSillyTavernChatAdapter } from '../../src/hosts/sillytavern/chat-adapter.mjs';
const binding = { kind: 'directive.campaignChatBinding.v1', version: 1, hostId: 'sillytavern', campaignId: 'campaign.test', saveId: 'save.test', chatId: 'test.chat', entityType: 'character', entityId: '0', entityName: 'Narrator', entityAvatar: 'Narrator.png', status: 'bound' };
function rig() {
  let saved = [], failSave = false, writes = 0;
  const context = { chat: [], characterId: 0, groupId: null, chatId: binding.chatId, characters: [{ name: 'Narrator', avatar: 'Narrator.png', chat: binding.chatId }], chatMetadata: { directiveCampaignBinding: structuredClone(binding) },
    getRequestHeaders: () => ({ 'Content-Type': 'application/json' }), addOneMessage: async () => {}, updateMessage: async () => {},
    saveChat: async () => { writes++; saved = structuredClone(context.chat); if (failSave) { failSave = false; throw new Error('uncertain save'); } },
    fetch: async () => ({ ok: true, json: async () => [{ chat_metadata: { directiveCampaignBinding: structuredClone(binding) } }, ...structuredClone(saved)] }),
  };
  const adapter = createSillyTavernChatAdapter({ contextFactory: () => context });
  return { adapter, context, writes: () => writes, failNextSave() { failSave = true; } };
}
function request(id, extra = {}) {
  return { publicationId: id, text: 'A reviewed scene.', expectedBinding: binding, assertCurrent: () => true,
    createMetadata: source => {
      const segments = [{ kind: 'prose', id: 'segment.1', text: 'A reviewed scene.' }];
      const candidateDigest = characterNarrativeDigest({ segments, text: 'A reviewed scene.' });
      const supportDigest = 'b'.repeat(64);
      return { kind: 'directive.characterScenePublication.v1', publicationId: id, source, segments, contributions: [],
        receipt: { kind: 'directive.characterSceneReceipt.v1', publicationId: id, flightDigest: 'a'.repeat(64), source, candidateDigest, supportDigest,
          packetDigests: [], contributionDigests: [], disclosures: [], review: { kind: 'directive.characterKnowledgeReview.v1', candidateDigest, supportDigest, verdict: 'pass', findings: [] } } };
    }, ...extra };
}
const a = rig();
assert.equal(typeof a.adapter.publishProtectedScene, 'function');
const first = await a.adapter.publishProtectedScene(request('publication.1'));
assert.equal(first.ok, true); assert.equal(first.persisted, true); assert.equal(a.context.chat.length, 1);
const repeated = await a.adapter.publishProtectedScene(request('publication.1'));
assert.equal(repeated.duplicate, true); assert.equal(a.context.chat.length, 1);
assert.equal(a.context.chat[0].swipe_info[0].extra.runtimeMetadata.characterScenePublication.publicationId, 'publication.1');
await assert.rejects(a.adapter.publishProtectedScene(request('publication.2', { assertCurrent: () => false })), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_STALE' });
assert.equal(a.context.chat.length, 1);
const stop = new AbortController(); stop.abort();
await assert.rejects(a.adapter.publishProtectedScene(request('publication.stop', { signal: stop.signal })), { code: 'DIRECTIVE_GENERATION_ABORTED' });
const b = rig(); b.failNextSave();
await assert.rejects(b.adapter.publishProtectedScene(request('publication.saved')), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING' });
assert.equal(b.context.chat.length, 1);
const recovered = await b.adapter.publishProtectedScene(request('publication.saved'));
assert.equal(recovered.duplicate, true); assert.equal(recovered.persisted, true); assert.equal(b.context.chat.length, 1);
const oldInfo = structuredClone(a.context.chat[0].swipe_info[0]);
const swipe = await a.adapter.publishProtectedScene(request('publication.swipe', { hostMessageId: '0' }));
assert.equal(swipe.swipeIndex, 1, 'identical prose from a different publication gets separate provenance');
assert.deepEqual(a.context.chat[0].swipe_info[0], oldInfo);
assert.equal(a.context.chat[0].swipe_info[1].extra.runtimeMetadata.characterScenePublication.publicationId, 'publication.swipe');
assert.equal((await a.adapter.publishProtectedScene(request('publication.swipe', { hostMessageId: '0' }))).duplicate, true);
assert.equal(a.context.chat[0].swipes.length, 2);
console.log('PASS guarded publication, saved readback, uncertain-save reconciliation and distinct swipe provenance');
const lastMoment = rig(), lateStop = new AbortController();
await assert.rejects(lastMoment.adapter.publishProtectedScene(request('publication.last-stop', { signal: lateStop.signal, assertCurrent({ phase, source }) { if (phase === 'before-mutation' && source) lateStop.abort(); return true; } })), { code: 'DIRECTIVE_GENERATION_ABORTED' });
assert.equal(lastMoment.context.chat.length, 0, 'Stop at the last guard must prevent the append');
const bindingChanged = rig();
await assert.rejects(bindingChanged.adapter.publishProtectedScene(request('publication.binding', { assertCurrent({ source }) { if (source) bindingChanged.context.chatId = 'other.chat'; return true; } })), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_STALE' });
assert.equal(bindingChanged.context.chat.length, 0);
const savedGuard = rig(); let checkedPersisted = false;
await savedGuard.adapter.publishProtectedScene(request('publication.readback', { assertCurrent({ phase, persistedSnapshot }) { if (phase === 'persisted') { checkedPersisted = true; assert.equal(persistedSnapshot.rows.length, 1); } return true; } }));
assert.equal(checkedPersisted, true, 'flight ownership must be checked against the actual saved transcript');
console.log('PASS final synchronous Stop/binding guard and persisted-source custody');
const queued = rig(); let releaseSave, firstSaveStarted;
const saveStarted = new Promise(resolve => { firstSaveStarted = resolve; });
const save = queued.context.saveChat;
let heldSave = true;
queued.context.saveChat = async () => { if (heldSave) { heldSave = false; firstSaveStarted(); await new Promise(resolve => { releaseSave = resolve; }); } return save(); };
const queuedFirst = queued.adapter.publishProtectedScene(request('publication.queue'));
await saveStarted;
const queuedDuplicate = queued.adapter.publishProtectedScene(request('publication.queue'));
const staleQueued = queued.adapter.publishProtectedScene(request('publication.queue-other', { assertCurrent: () => queued.context.chat.length === 0 }));
releaseSave();
assert.equal((await queuedFirst).persisted, true);
assert.equal((await queuedDuplicate).duplicate, true);
await assert.rejects(staleQueued, { code: 'DIRECTIVE_CHARACTER_PUBLICATION_STALE' });
assert.equal(queued.context.chat.length, 1);
const wrongDisk = rig();
wrongDisk.context.fetch = async () => ({ ok: true, json: async () => [{ chat_metadata: { directiveCampaignBinding: binding } }] });
await assert.rejects(wrongDisk.adapter.publishProtectedScene(request('publication.missing-disk')), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING' });
assert.equal(wrongDisk.context.chat.length, 1);
const hiddenDisplay = rig();
hiddenDisplay.context.updateMessage = async () => { throw new Error('display unavailable'); };
assert.equal((await hiddenDisplay.adapter.publishProtectedScene(request('publication.display'))).displayUpdated, false);
console.log('PASS serialized publication, stale queued owner, saved-row verification and truthful display status');

const badReceipt = rig();
await assert.rejects(badReceipt.adapter.publishProtectedScene(request('publication.bad-receipt', { createMetadata: source => ({ kind: 'directive.characterScenePublication.v1', publicationId: 'publication.bad-receipt', source }) })), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_INVALID' });
assert.equal(badReceipt.context.chat.length, 0);
console.log('PASS final host boundary requires a complete valid review receipt');
import { createCharacterPublicationGuard } from '../../src/runtime/character-publication-guard.mjs';
const guarded = rig();
let currentIdentity = { binding: 'chat.test', state: 'unchanged', settings: 'unchanged', epoch: 1 };
const guard = createCharacterPublicationGuard({ publicationId: 'publication.guarded', identity: currentIdentity, baselineRows: [], readIdentity: () => currentIdentity, readRows: () => guarded.context.chat });
assert.equal(guard.isCurrent(), true);
const guardedRequest = request('publication.guarded', { assertCurrent: guard.assertPublication });
const guardedResult = await guarded.adapter.publishProtectedScene(guardedRequest);
assert.equal(guardedResult.persisted, true);
assert.equal(guard.isCurrent(), true, 'the owned appended scene is allowed');
assert.equal((await guarded.adapter.publishProtectedScene(guardedRequest)).duplicate, true);
currentIdentity = { ...currentIdentity, settings: 'changed' };
assert.equal(guard.isCurrent(), false);
currentIdentity.settings = 'unchanged';
guarded.context.chat[0].name = 'Unrelated edit';
assert.equal(guard.isCurrent(), false, 'an unrelated post-review transcript edit is rejected');
const pendingGuarded = rig(); pendingGuarded.failNextSave();
const pendingGuard = createCharacterPublicationGuard({ publicationId: 'publication.guard-pending', identity: currentIdentity, baselineRows: [], readIdentity: () => currentIdentity, readRows: () => pendingGuarded.context.chat });
const pendingRequest = request('publication.guard-pending', { assertCurrent: pendingGuard.assertPublication });
await assert.rejects(pendingGuarded.adapter.publishProtectedScene(pendingRequest), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING' });
assert.equal(pendingGuard.isCurrent(), true);
assert.equal((await pendingGuarded.adapter.publishProtectedScene(pendingRequest)).persisted, true);
console.log('PASS full-flight guard accepts only its synchronous owned mutation and unchanged persisted transcript');
currentIdentity = { ...currentIdentity, epoch: 2 };
assert.equal(pendingGuard.reauthorizePublished(), true, 'a new gesture may recover the same already-mutated transcript');
assert.equal(pendingGuard.isCurrent(), true);
currentIdentity = { ...currentIdentity, state: 'changed' };
assert.equal(pendingGuard.reauthorizePublished(), false, 'a new gesture cannot waive state changes');
currentIdentity = { ...currentIdentity, state: 'unchanged', settings: 'changed' };
assert.equal(pendingGuard.reauthorizePublished(), false, 'a new gesture cannot waive provider changes');
assert.equal(guard.reauthorizePublished(), false, 'an edited row cannot be recovered as the reviewed publication');
const neverWritten = createCharacterPublicationGuard({ publicationId: 'publication.unposted', identity: currentIdentity, baselineRows: [], readRows: () => [], readIdentity: () => currentIdentity });
assert.equal(neverWritten.reauthorizePublished(), false, 'a canceled unposted draft cannot be resurrected');
console.log('PASS save-only reauthorization preserves source, state and settings boundaries');
const reserved = rig();
await reserved.adapter.publishProtectedScene(request('publication.reserved-original'));
await reserved.adapter.publishProtectedScene(request('publication.reserved-selected', { hostMessageId: '0' }));
const reservedRow = reserved.context.chat[0];
const beforeReservation = structuredClone(reservedRow);
reservedRow.swipe_id = reservedRow.swipes.length;
assert.equal(reserved.adapter.prepareProtectedGeneration({ type: 'swipe', expectedBinding: binding, assertCurrent: () => true }).changed, true);
assert.deepEqual(reservedRow, beforeReservation, 'only the temporary reserved index is restored');
const legacyReservation = rig();
legacyReservation.context.chat.push({ mes: 'Selected.', is_user: false, swipes: ['First.', 'Selected.'], swipe_id: 2, swipe_info: [{ extra: { original: true } }, { extra: { selected: true } }] });
assert.equal(legacyReservation.adapter.prepareProtectedGeneration({ type: 'regenerate', expectedBinding: binding, assertCurrent: () => true }).changed, true);
assert.equal(legacyReservation.context.chat[0].swipe_id, 1);
legacyReservation.context.chat[0].swipes = ['Selected.', 'Selected.']; legacyReservation.context.chat[0].swipe_id = 2;
assert.throws(() => legacyReservation.adapter.prepareProtectedGeneration({ type: 'swipe', expectedBinding: binding, assertCurrent: () => true }), { code: 'DIRECTIVE_CHARACTER_SWIPE_RESERVATION_INVALID' });
assert.equal(legacyReservation.context.chat[0].swipe_id, 2);
reservedRow.swipe_id = reservedRow.swipes.length;
assert.throws(() => reserved.adapter.prepareProtectedGeneration({ type: 'swipe', expectedBinding: binding, assertCurrent: () => false }), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_STALE' });
assert.equal(reservedRow.swipe_id, reservedRow.swipes.length);
console.log('PASS native reserved swipe recovery preserves all prior text and receipt metadata');

const nativeRegenerate = rig();
await nativeRegenerate.adapter.publishProtectedScene(request('publication.native-regenerate-original'));
const regenerateRows = structuredClone(nativeRegenerate.context.chat);
const regenerateSource = { rows: regenerateRows, hostMessageId: '0' };
nativeRegenerate.context.chat.pop(); // Native Generate removes this row before interception.
let restoredDisplays = 0, restoredSourceAcknowledged = false;
nativeRegenerate.context.addOneMessage = async () => { assert.equal(restoredSourceAcknowledged, true, 'source ownership advances before native display can yield'); restoredDisplays++; };
const restored = await nativeRegenerate.adapter.prepareProtectedGeneration({ type: 'regenerate', expectedBinding: binding,
  assertCurrent: ({ phase }) => { if (phase === 'restored') restoredSourceAcknowledged = true; return true; }, regenerateSource });
assert.equal(restored.restored, true);
assert.deepEqual(nativeRegenerate.context.chat, regenerateRows, 'native regeneration restores only its owned removed row including all prior receipts');
assert.equal(restoredDisplays, 1, 'restore the removed native message display before generation');
await nativeRegenerate.adapter.publishProtectedScene(request('publication.native-regenerate-new', { hostMessageId: '0' }));
assert.equal(nativeRegenerate.context.chat[0].swipes.length, 2);
assert.deepEqual(nativeRegenerate.context.chat[0].swipe_info[0], regenerateRows[0].swipe_info[0]);
console.log('PASS native Regenerate exact removed-row restoration and preserved swipe provenance');for (const change of ['prefix', 'source-id', 'binding', 'canceled', 'owner']) {
  const rejected = rig();
  rejected.context.chat.push({ is_user: true, mes: 'Original player source.' });
  await rejected.adapter.publishProtectedScene(request(`publication.regenerate-${change}`));
  const rows = structuredClone(rejected.context.chat);
  rejected.context.chat.pop();
  const source = { rows, hostMessageId: '1' };
  const signal = new AbortController();
  if (change === 'prefix') rejected.context.chat[0].mes = 'Edited player source.';
  if (change === 'source-id') source.hostMessageId = '0';
  if (change === 'binding') rejected.context.chatId = 'different.chat';
  if (change === 'canceled') signal.abort();
  const before = structuredClone(rejected.context.chat);
  assert.throws(() => rejected.adapter.prepareProtectedGeneration({ type: 'regenerate', expectedBinding: binding,
    regenerateSource: source, signal: signal.signal, assertCurrent: () => change !== 'owner' }));
  assert.deepEqual(rejected.context.chat, before, `${change} cannot restore an old assistant over a changed source`);
}
console.log('PASS native Regenerate rejects changed prefix, source identity, binding, Stop and owner');