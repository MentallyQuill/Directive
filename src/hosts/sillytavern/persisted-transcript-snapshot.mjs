import { captureHostTranscriptSnapshot, readTranscriptSnapshotDataProperty as read,
  HOST_TRANSCRIPT_SNAPSHOT_LIMITS } from '../transcript-snapshot-contract.mjs';

const PREFIX = 'DIRECTIVE_HOST_PERSISTED_TRANSCRIPT_';
const identityFields = ['hostId', 'campaignId', 'saveId', 'chatId', 'entityType', 'entityId', 'entityName'];
const validText = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value;
function fail(suffix) { throw Object.assign(new Error('Saved transcript readback is unavailable.'), { reasonCode: PREFIX + suffix }); }
function required(ok) { if (!ok) fail('INVALID'); }
function snapshotFailure(result) {
  return Object.freeze({ status: 'unsupported', reasonCode: result.reasonCode === 'DIRECTIVE_HOST_TRANSCRIPT_LIMIT_EXCEEDED'
    ? result.reasonCode : PREFIX + 'INVALID', detail: 'Saved transcript data cannot be represented safely.' });
}
function ownArrayItem(array, index) {
  required(Array.isArray(array) && Object.getPrototypeOf(array) === Array.prototype);
  const item = Object.getOwnPropertyDescriptor(array, String(index));
  required(item?.enumerable && Object.hasOwn(item, 'value'));
  return item.value;
}

// Read-only endpoint observation. Never substitute selected chat memory, save,
// repair metadata or claim that later native writes cannot change these bytes.
// Returns the snapshot contract's captured union; failures are unsupported with
// PERSISTED_TRANSCRIPT_{INVALID,UNAVAILABLE,READ_FAILED,ABORTED} or copier limits.
export async function readPersistedTranscriptSnapshot(contextFactory, requestedBinding, options = {}) {
  let phase = 'INVALID';
  try {
    const identity = Object.fromEntries(identityFields.map(key => [key, read(requestedBinding, key)]));
    required(identityFields.every(key => validText(identity[key])) && identity.hostId === 'sillytavern'
      && ['character', 'group'].includes(identity.entityType));
    const nativeIdentity = { entityType: identity.entityType, entityId: identity.entityId, chatId: identity.chatId };
    const detached = captureHostTranscriptSnapshot({ hostId: identity.hostId, nativeIdentity, directiveBinding: requestedBinding, rows: [] });
    if (detached.status !== 'captured') return snapshotFailure(detached);
    const binding = detached.snapshot.directiveBinding;
    required((binding.kind === undefined || binding.kind === 'directive.campaignChatBinding.v1')
      && (binding.version === undefined || binding.version === 1));
    const signal = read(options, 'signal');
    required(signal === undefined || (typeof AbortSignal !== 'undefined' && signal instanceof AbortSignal));
    const checkAbort = () => { if (signal?.aborted) fail('ABORTED'); };
    checkAbort();
    const ctx = contextFactory();
    if (!ctx) fail('UNAVAILABLE');
    let endpoint, body;
    if (identity.entityType === 'character') {
      required(/^(0|[1-9][0-9]*)$/.test(identity.entityId));
      const characters = read(ctx, 'characters');
      const index = Number(identity.entityId);
      required(Number.isSafeInteger(index) && Array.isArray(characters) && index < characters.length);
      const character = ownArrayItem(characters, index);
      const name = read(character, 'name'), avatar = read(character, 'avatar');
      required(name === identity.entityName && validText(avatar)
        && (binding.entityAvatar === undefined || binding.entityAvatar === null || binding.entityAvatar === avatar));
      endpoint = '/api/chats/get';
      body = { ch_name: name, file_name: identity.chatId.replace(/\.jsonl$/i, ''), avatar_url: avatar };
    } else {
      const groups = read(ctx, 'groups');
      required(Array.isArray(groups) && groups.length <= HOST_TRANSCRIPT_SNAPSHOT_LIMITS.rows);
      let matches = 0;
      for (let index = 0; index < groups.length; index++) {
        const group = ownArrayItem(groups, index), id = read(group, 'id');
        if ((typeof id === 'string' || Number.isSafeInteger(id)) && String(id) === identity.entityId) {
          required(read(group, 'name') === identity.entityName); matches++;
        }
      }
      required(matches === 1);
      endpoint = '/api/chats/group/get'; body = { id: identity.chatId };
    }
    const fetchFn = read(ctx, 'fetch') ?? globalThis.fetch;
    const getHeaders = read(ctx, 'getRequestHeaders');
    if (typeof fetchFn !== 'function' || typeof getHeaders !== 'function') fail('UNAVAILABLE');
    const headers = getHeaders.call(ctx);
    phase = 'READ_FAILED';
    const response = await fetchFn.call(ctx, endpoint, { method: 'POST', cache: 'no-cache', headers,
      body: JSON.stringify(body), ...(signal ? { signal } : {}) });
    checkAbort();
    if (!response?.ok || typeof response.json !== 'function') fail('READ_FAILED');
    const data = await response.json();
    checkAbort(); phase = 'INVALID';
    required(Array.isArray(data) && Object.getPrototypeOf(data) === Array.prototype && data.length > 0
      && Reflect.ownKeys(data).length === data.length + 1);
    if (data.length - 1 > HOST_TRANSCRIPT_SNAPSHOT_LIMITS.rows) {
      return Object.freeze({ status: 'unsupported', reasonCode: 'DIRECTIVE_HOST_TRANSCRIPT_LIMIT_EXCEEDED', detail: 'Saved transcript row limit exceeded.' });
    }
    const header = ownArrayItem(data, 0), rows = [];
    for (let index = 1; index < data.length; index++) rows.push(ownArrayItem(data, index));
    // Copy the entire header together with all rows, sharing the same byte and
    // traversal budget. The temporary binding position is only a safe copier.
    const copied = captureHostTranscriptSnapshot({ hostId: identity.hostId, nativeIdentity, directiveBinding: header, rows });
    if (copied.status !== 'captured') return snapshotFailure(copied);
    const stored = read(read(copied.snapshot.directiveBinding, 'chat_metadata'), 'directiveCampaignBinding');
    required(stored && identityFields.every(key => read(stored, key) === identity[key])
      && (read(stored, 'kind') === undefined || read(stored, 'kind') === 'directive.campaignChatBinding.v1')
      && (read(stored, 'version') === undefined || read(stored, 'version') === 1)
      && (identity.entityType !== 'character' || read(stored, 'entityAvatar') === undefined
        || read(stored, 'entityAvatar') === null || read(stored, 'entityAvatar') === body.avatar_url)
      && (binding.entityAvatar === undefined || binding.entityAvatar === null || read(stored, 'entityAvatar') === binding.entityAvatar));
    return captureHostTranscriptSnapshot({ hostId: identity.hostId, nativeIdentity, directiveBinding: stored, rows: copied.snapshot.rows });
  } catch (error) {
    return Object.freeze({ status: 'unsupported', reasonCode: error?.reasonCode?.startsWith(PREFIX) ? error.reasonCode
      : error?.reasonCode === 'DIRECTIVE_HOST_TRANSCRIPT_LIMIT_EXCEEDED' ? error.reasonCode
        : error?.name === 'AbortError' ? PREFIX + 'ABORTED' : PREFIX + phase,
      detail: 'The exact saved transcript could not be verified.' });
  }
}
