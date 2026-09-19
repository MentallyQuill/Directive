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
