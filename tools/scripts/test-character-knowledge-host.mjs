import assert from 'node:assert/strict';
import { createDirectiveProviderClient } from '../../src/hosts/sillytavern/provider-client.mjs';
import { createSillyTavernProviderSettingsStore } from '../../src/providers/directive-provider-settings.mjs';
import { createSillyTavernChatAdapter } from '../../src/hosts/sillytavern/chat-adapter.mjs';
import { prepareProtectedCharacterTurn } from '../../src/runtime/protected-character-turn.mjs';
import { createCharacterSceneAdmission } from '../../src/story/character-scene-admission.mjs';
import { createCharacterPublicationGuard } from '../../src/runtime/character-publication-guard.mjs';
import { captureV1StorySource } from '../../src/runtime/v1-accepted-pair-source.mjs';
import { readCharacterScenePublication } from '../../src/story/character-scene-publication.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

// Real Directive host/provider adapters against an isolated synthetic host.
// This is deliberately not represented as an installed SillyTavern smoke test.
const assets = loadAshesRuntimeAssets();
const actorId = assets.crewDataset.officers[0].id;
const binding = { kind: 'directive.campaignChatBinding.v1', version: 1, hostId: 'sillytavern', campaignId: 'campaign.test', saveId: 'save.test', chatId: 'test.chat', entityType: 'character', entityId: '0', entityName: 'Narrator', entityAvatar: 'Narrator.png', status: 'bound' };
async function run({ stopAt = null, mutateAt = null, reject = false, emptyFirst = false, failSave = false } = {}) {
  const stop = new AbortController(), calls = [], traces = [];
  let reviews = 0, saved = [], turn, first = true;
  let identity = { bindingKey: 'test.chat', branchId: 'save.test', sourceDigest: 'a'.repeat(64), settingsDigest: 'b'.repeat(64), epoch: 1 };
  const profiles = ['actor', 'narrator', 'reviewer'].map(id => ({ id, api: 'openai', model: 'synthetic', preset: 'CANARY_PRESET' }));
  const context = {
    chat: [{ mes: 'An officer stands beside the captain.', is_user: false, swipe_id: 0, swipes: ['An officer stands beside the captain.'] }, { mes: 'Report.', is_user: true }],
    extensionSettings: {}, saveSettingsDebounced() {}, characterId: 0, groupId: null, chatId: binding.chatId,
    characters: [{ name: 'Narrator', avatar: 'Narrator.png', chat: binding.chatId, description: 'CANARY_CARD' }],
    chatMetadata: { directiveCampaignBinding: structuredClone(binding) }, worldInfo: 'CANARY_WORLD', authorNote: 'CANARY_NOTE', history: 'CANARY_HISTORY', cache: 'CANARY_CACHE',
    getRequestHeaders: () => ({ 'Content-Type': 'application/json' }), addOneMessage: async () => {}, updateMessage: async () => {},
    saveChat: async () => { saved = structuredClone(context.chat); if (failSave) { failSave = false; throw new Error('uncertain save'); } },
    fetch: async () => ({ ok: true, json: async () => [{ chat_metadata: { directiveCampaignBinding: structuredClone(binding) } }, ...structuredClone(saved)] }),
    getPresetManager: () => ({ getCompletionPresetByName: () => ({ messages: ['CANARY_PRESET'], openai_max_context: 131072 }) }),
    ChatCompletionService: { TYPE: 'openai', presetToGeneratePayload() { throw new Error('Preset projection is forbidden'); } },
    generateRaw() { throw new Error('Native fallback is forbidden'); },
    ConnectionManagerRequestService: {
      getSupportedProfiles: () => profiles, getProfile: id => profiles.find(p => p.id === id), validateProfile: () => ({ selected: 'openai', source: 'nanogpt' }),
      async sendRequest(profileId, messages, maxTokens, options, payload) {
        calls.push({ profileId, messages, maxTokens, options: { includePreset: options.includePreset, includeInstruct: options.includeInstruct, stream: options.stream }, payload });
        assert.equal(options.includePreset, false); assert.equal(options.includeInstruct, false); assert.equal(options.stream, false);
        assert.ok(!JSON.stringify(calls.at(-1)).includes('CANARY_'));
        const input = JSON.parse(messages[1].content);
        const phase = input.manifest ? 'audience' : profileId === 'narrator' && reviews > 0 ? 'repair' : profileId;
        if (phase === stopAt) stop.abort();
        if (phase === mutateAt) identity = { ...identity, settingsDigest: 'c'.repeat(64) };
        if (!input.manifest && emptyFirst && first) { first = false; return { choices: [{ message: { content: '', reasoning_content: 'private reasoning' }, finish_reason: 'stop' }] }; }
        let result;
        if (input.manifest) {
          result = { kind: 'directive.characterAudienceReview.v1', manifestDigest: input.manifestDigest, evidenceDigest: input.evidenceDigest, identityDigest: input.identityDigest, verdict: 'pass', checkedEntryIds: input.manifest.entries.map(e=>e.id), findings: [] };
        } else if (profileId === 'actor') {
          assert.equal(input.packet.personId, actorId);
          const p = input.schema.properties;
          result = { id: p.id.const, personId: actorId, kind: 'speech', mode: 'ordinary', text: 'Ready.', basisIds: [], recipientIds: p.recipientIds.items.enum, dependsOnIds: [] };
        } else if (profileId === 'narrator') {
          result = { segments: [{ kind: 'prose', id: 'segment.context', text: 'The officer addresses the captain.' }, ...input.contributions.map(item => ({ kind: 'character', id: item.id }))] };
        } else {
          reviews++;
          result = { kind: 'directive.characterKnowledgeReview.v1', candidateDigest: input.candidateDigest, supportDigest: input.supportDigest,
            verdict: reject ? 'reject' : 'pass', findings: reject ? [{ id: 'finding.context', segmentId: 'segment.context', subjectId: actorId, type: 'unsupported-knowledge', explanation: 'PRIVATE_REVIEW_FINDING', supportIds: [] }] : [] };
        }
        return { choices: [{ message: { content: JSON.stringify(result) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
      },
    },
  };
  const adapter = createSillyTavernChatAdapter({ contextFactory: () => context });
  const store = createSillyTavernProviderSettingsStore({ context });
  for (const [kind, profileId] of [['reasoning', 'actor'], ['narration', 'narrator'], ['utility', 'reviewer']]) store.update(kind, { provider: 'profile', profileId, presetMode: 'isolated' });
  const generation = createDirectiveProviderClient({ contextFactory: () => context, settingsStore: store });
  const source = (row, index) => { const { role, ...value } = captureV1StorySource({ ...row, id: String(index) }).value; return value; };
  const sourcePair = { previousAssistant: source(context.chat[0], 0), currentPlayer: source(context.chat[1], 1) };
  const evidence = { sourceSlot: 'previousAssistant', evidenceQuote: sourcePair.previousAssistant.text };
  const admission = createCharacterSceneAdmission({ sourcePair, playerId: 'person.player', knownPersonIds: new Set([actorId]), proposal: {
    participants: [{ personId: actorId, presence: 'present', perception: [], evidence: [evidence], audience: [{ personId: 'person.player', acquisition: 'heard', evidence: [evidence] }] }],
    reactions: [{ personId: actorId, after: [] }], playerContext: [{ sourceSlot: 'currentPlayer', evidenceQuote: 'Report.' }],
  } });
  const state = { player: { name: 'Test Captain' }, storySettlement: { branchId: 'save.test', revision: 1, episodes: [], continuityEvents: [] }, privateDirectorPlan: 'CANARY_DIRECTOR' };
  const beforeState = structuredClone(state), beforeRows = structuredClone(context.chat);
  const publicationId = 'publication.host';
  const guard = createCharacterPublicationGuard({ publicationId, identity, baselineRows: context.chat, readIdentity: () => identity, readRows: () => context.chat });
  let failure;
  try {
    turn = await prepareProtectedCharacterTurn({ generation, campaignState: state, crewDataset: assets.crewDataset, messages: context.chat.map((row, index) => ({ ...row, id: String(index) })), sourcePair, admission, identity, guard, publicationId, expectedBinding: binding, signal: stop.signal, onDiagnostics: value => traces.push(value) });
    await turn.publish(options => adapter.publishProtectedScene(options));
  } catch (error) { failure = error; }
  assert.deepEqual(state, beforeState);
  assert.ok(calls.length <= 10);
  assert.equal(traces.at(-1).attempts, calls.length, 'transport attempts and diagnostics agree, including retries');
  assert.ok(!JSON.stringify(traces).includes('PRIVATE_REVIEW_FINDING'));
  assert.ok(calls.filter(call => call.profileId !== 'reviewer').every(call => !JSON.stringify(call).includes('PRIVATE_REVIEW_FINDING')));
  if (stopAt || mutateAt || reject) {
    assert.ok(failure, 'fault must block publication');
    assert.deepEqual(context.chat, beforeRows);
  } else if (failure?.code === 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING') {
    const priorCalls = calls.length;
    assert.equal((await turn.publish(options => adapter.publishProtectedScene(options))).persisted, true);
    assert.equal(calls.length, priorCalls, 'save retry never regenerates');
    assert.equal(context.chat.length, beforeRows.length + 1);
  } else {
    assert.equal(failure, undefined);
    assert.equal(context.chat.length, beforeRows.length + 1);
    const reloaded = structuredClone(saved.at(-1));
    assert.equal(readCharacterScenePublication({ ...reloaded, id: String(saved.length - 1) }).status, 'valid');
  }
  return { calls, failure, traces };
}
assert.equal((await run()).calls.length, 4);
assert.equal((await run({ emptyFirst: true })).calls.length, 5);
for (const stopAt of ['audience', 'actor', 'narrator', 'reviewer', 'repair']) await run({ stopAt, reject: stopAt === 'repair' });
for (const mutateAt of ['actor', 'narrator', 'reviewer']) await run({ mutateAt });
assert.equal((await run({ reject: true })).calls.length, 6, 'one repair and whole-candidate re-review');
await run({ failSave: true });
console.log('PASS real host adapters: sealed outbound requests, retries, phase cancellation, stale settings, rejection, saved recovery and reload');
