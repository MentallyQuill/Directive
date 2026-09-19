import assert from 'node:assert/strict';
import { createSillyTavernChatAdapter } from '../../src/hosts/sillytavern/chat-adapter.mjs';
import { captureHostTranscriptSnapshot } from '../../src/hosts/transcript-snapshot-contract.mjs';

const binding = { kind: 'directive.campaignChatBinding.v1', version: 1, hostId: 'sillytavern',
  campaignId: 'campaign.saved', saveId: 'save.saved', chatId: 'saved.chat', entityType: 'character',
  entityId: '0', entityName: 'Narrator', entityAvatar: 'Narrator.png', status: 'bound' };
const rows = [{ mes: '', is_system: true, extra: {} }, { mes: 'Saved hidden source', is_hidden: true },
  { mes: 'Saved assistant', is_user: false, swipe_id: 0, swipes: ['Saved assistant', 'Other variant'],
    swipe_info: [{ extra: { runtimeMetadata: { responseId: 'saved', dutyReportManifest: { reportId: 'report.saved' } } } }],
    extra: { files: [{ name: 'orders.txt', text: 'Complete orders' }] } }, { mes: 'Unaccepted saved draft', is_user: true }];
function rig(target = binding) {
  const calls = [], mutations = [];
  let data = [{ user_name: 'unused', character_name: 'unused', chat_metadata: {
    directiveCampaignBinding: structuredClone(target), unknownHeader: { preserved: true } } }, ...structuredClone(rows)];
  const ctx = { characterId: 0, groupId: null, chatId: 'saved.chat', chat: [{ mes: 'DIFFERENT LIVE MEMORY' }],
    characters: [{ name: 'Narrator', avatar: 'Narrator.png', chat: 'another.chat' }],
    groups: [{ id: 'group.1', name: 'Bridge', chat_id: 'another.group.chat' }],
    getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF': 'test' }),
    saveChat: () => mutations.push('save'), updateMessage: () => mutations.push('update'),
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => data }; } };
  let contexts = 0;
  const adapter = createSillyTavernChatAdapter({ contextFactory() { contexts++; return ctx; } });
  return { adapter, ctx, calls, mutations, data: () => data, setData: value => { data = value; }, contexts: () => contexts };
}
const first = rig();
assert.equal(typeof first.adapter.readPersistedTranscriptSnapshot, 'function', 'public saved readback must not substitute selected memory');
const actual = await first.adapter.readPersistedTranscriptSnapshot(binding);
const oracle = captureHostTranscriptSnapshot({ hostId: 'sillytavern', nativeIdentity: {
  entityType: 'character', entityId: '0', chatId: binding.chatId }, directiveBinding: binding, rows });
assert.deepEqual(actual, oracle);
assert.equal(first.contexts(), 1);
assert.equal(first.calls[0].url, '/api/chats/get');
assert.deepEqual(JSON.parse(first.calls[0].options.body), { ch_name: 'Narrator', file_name: 'saved.chat', avatar_url: 'Narrator.png' });
assert.equal(first.calls[0].options.cache, 'no-cache');
assert.equal(first.calls[0].options.method, 'POST');
assert.equal(first.calls[0].options.headers['X-CSRF'], 'test');
assert.deepEqual(first.mutations, []);
assert(Object.isFrozen(actual.snapshot.rows[2].swipe_info[0].extra.runtimeMetadata));
assert.deepEqual(first.ctx.chat, [{ mes: 'DIFFERENT LIVE MEMORY' }]);

const group = { ...binding, entityType: 'group', entityId: 'group.1', entityName: 'Bridge', chatId: 'saved.group' };
delete group.entityAvatar;
const groupRig = rig(group);
const groupResult = await groupRig.adapter.readPersistedTranscriptSnapshot(group);
assert.equal(groupResult.status, 'captured', JSON.stringify(groupResult));
assert.deepEqual(groupResult.snapshot.rows, rows);
assert.equal(groupRig.calls[0].url, '/api/chats/group/get');
assert.deepEqual(JSON.parse(groupRig.calls[0].options.body), { id: 'saved.group' });

async function refuses(value, target = binding, expected) {
  const r = rig(target); value(r);
  const result = await r.adapter.readPersistedTranscriptSnapshot(target);
  assert.equal(result.status, 'unsupported', JSON.stringify(result));
  assert.equal(Object.hasOwn(result, 'snapshot'), false);
  if (expected) assert.equal(result.reasonCode, expected);
  assert.deepEqual(r.mutations, []);
  return r;
}
for (const field of ['hostId', 'campaignId', 'saveId', 'chatId', 'entityType', 'entityId', 'entityName']) {
  await refuses(r => { r.data()[0].chat_metadata.directiveCampaignBinding[field] = 'wrong'; });
}
for (const data of [[], {}, [null], [{ chat_metadata: {} }], [{ chat_metadata: null }],
  [{ chat_metadata: { directiveCampaignBinding: binding } }, null]]) await refuses(r => r.setData(data));
await refuses(r => { r.ctx.characters[0].name = 'Different'; });
await refuses(r => { r.ctx.characters[0].avatar = 'Different.png'; });
await refuses(r => { r.data()[0].chat_metadata.directiveCampaignBinding.kind = 'wrong'; });
await refuses(r => { r.data()[0].chat_metadata.directiveCampaignBinding.entityAvatar = 'wrong.png'; });
await refuses(r => { r.data()[0].chat_metadata.directiveCampaignBinding.entityAvatar = 'wrong.png'; },
  Object.fromEntries(Object.entries(binding).filter(([key]) => key !== 'entityAvatar')));
await refuses(r => { r.ctx.groups.push({ ...r.ctx.groups[0] }); }, group);
await refuses(r => { delete r.ctx.getRequestHeaders; }, binding, 'DIRECTIVE_HOST_PERSISTED_TRANSCRIPT_UNAVAILABLE');
await refuses(r => { r.ctx.fetch = async () => ({ ok: false }); }, binding, 'DIRECTIVE_HOST_PERSISTED_TRANSCRIPT_READ_FAILED');
await refuses(r => { r.ctx.fetch = async () => { throw Error('network'); }; });
await refuses(r => { r.ctx.fetch = async () => { throw Object.assign(Error('aborted'), { name: 'AbortError' }); }; },
  binding, 'DIRECTIVE_HOST_PERSISTED_TRANSCRIPT_ABORTED');
await refuses(r => { r.ctx.fetch = async () => ({ ok: true, json: async () => { throw Error('JSON'); } }); });
let getters = 0;
const accessor = { ...binding };
Object.defineProperty(accessor, 'chatId', { enumerable: true, get() { getters++; return 'saved.chat'; } });
assert.equal((await rig().adapter.readPersistedTranscriptSnapshot(accessor)).status, 'unsupported');
await refuses(r => { Object.defineProperty(r.data()[1], 'mes', { enumerable: true, get() { getters++; return 'unsafe'; } }); });
await refuses(r => { Object.defineProperty(r.data()[0], 'unknown', { enumerable: true, get() { getters++; return 'unsafe'; } }); });
await refuses(r => { Object.defineProperty(r.ctx.characters[0], 'name', { enumerable: true, get() { getters++; return 'unsafe'; } }); });
assert.equal(getters, 0);
await refuses(r => { delete r.data()[1]; });
await refuses(r => { r.data().extra = 'not saved array data'; });
await refuses(r => r.data().push(...Array.from({ length: 20001 }, () => ({ mes: '' }))), binding, 'DIRECTIVE_HOST_TRANSCRIPT_LIMIT_EXCEEDED');
await refuses(r => { r.data()[1].mes = 'x'.repeat(1024 * 1024); }, binding, 'DIRECTIVE_HOST_TRANSCRIPT_LIMIT_EXCEEDED');

{
  const r = rig(), target = structuredClone(binding), controller = new AbortController();
  controller.abort();
  const result = await r.adapter.readPersistedTranscriptSnapshot(target, { signal: controller.signal });
  assert.equal(result.reasonCode, 'DIRECTIVE_HOST_PERSISTED_TRANSCRIPT_ABORTED');
  assert.equal(r.calls.length, 0);
}
{
  const r = rig(), target = structuredClone(binding), controller = new AbortController();
  let release;
  r.ctx.fetch = async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    await new Promise(resolve => { release = resolve; });
    return { ok: true, json: async () => r.data() };
  };
  const pending = r.adapter.readPersistedTranscriptSnapshot(target, { signal: controller.signal });
  target.chatId = 'caller.changed'; target.entityId = '99'; r.ctx.characters[0].avatar = 'later.png';
  release();
  assert.deepEqual(await pending, oracle, 'request/endpoint identity detached before fetch awaits');
}
{
  const r = rig(), controller = new AbortController();
  r.ctx.fetch = async () => { controller.abort(); return { ok: true, json: async () => r.data() }; };
  assert.equal((await r.adapter.readPersistedTranscriptSnapshot(binding, { signal: controller.signal })).reasonCode,
    'DIRECTIVE_HOST_PERSISTED_TRANSCRIPT_ABORTED');
}
{
  const r = rig(), controller = new AbortController();
  r.ctx.fetch = async () => ({ ok: true, json: async () => { controller.abort(); return r.data(); } });
  assert.equal((await r.adapter.readPersistedTranscriptSnapshot(binding, { signal: controller.signal })).reasonCode,
    'DIRECTIVE_HOST_PERSISTED_TRANSCRIPT_ABORTED');
}
{
  const r = rig();
  r.data()[0].chat_metadata.directiveCampaignBinding.persistedOnly = 'Keep server binding';
  const result = await r.adapter.readPersistedTranscriptSnapshot(binding);
  assert.equal(result.snapshot.directiveBinding.persistedOnly, 'Keep server binding');
  r.data()[1].mes = 'Changed after result';
  assert.equal(result.snapshot.rows[0].mes, '');
}
{
  const r = rig();
  r.setData([r.data()[0], ...Array.from({ length: 20000 }, () => ({ mes: '' }))]);
  const result = await r.adapter.readPersistedTranscriptSnapshot(binding);
  assert.equal(result.status, 'captured', JSON.stringify(result));
  assert.equal(result.snapshot.rowCount, 20000);
  r.setData([r.data()[0]]);
  assert.equal((await r.adapter.readPersistedTranscriptSnapshot(binding)).snapshot.rowCount, 0,
    'empty saved history needs an actual verified header');
}
console.log('Persisted transcript readback: character/group, exact identity, full saved data, no memory fallback or writes, safe failures passed.');
