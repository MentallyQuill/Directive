import assert from 'node:assert/strict';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { createFakeDirectiveHost, createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import { captureV1StorySource } from '../../src/runtime/v1-accepted-pair-source.mjs';
let sequence = 0, calls = 0, directors = 0, legacy = 0, mutateThenFail = true, stopDuringPublish = false, stopBeforeNarration = false, editDuringDirector = false;
const generation = createFakeGenerationClient({ responses: {
 openingSceneDirector: async ({ request }) => { directors++; if (editDuringDirector) { editDuringDirector = false; host.chat.pushPlayerMessage({ text: 'I change the opening source.' }); } const context = JSON.parse(request.messages.at(-1).content); return { text: JSON.stringify({ kind: 'directive.openingDirection.v1', sceneMaterialIds: context.sceneReferences.map(item => item.id).slice(0,1), backgroundIds: context.backgroundReferences.map(item => item.id).slice(0,1), emphasis: 'setting', characterScene: { participants: [], reactions: [], playerContext: [{ sourceSlot: 'previousAssistant', evidenceQuote: context.premise.firstPlayableScene.slice(0, 320) }] } }) }; },
 sceneNarrator: async ({ request, rawOptions }) => { if (stopBeforeNarration) { stopBeforeNarration = false; await app.handleHostGenerationStopped(); } calls++; rawOptions.attemptBudget.claim(); const packet = JSON.parse(request.messages[1].content); assert.ok(!JSON.stringify(packet).includes('PRIVATE_UNSHARED_MEMORY')); return { text: JSON.stringify({ segments: [{ kind: 'prose', id: 'segment.opening', text: 'The arrival deck is quiet.' }] }) }; },
 characterKnowledgeReviewer: async ({ request, rawOptions }) => { calls++; rawOptions.attemptBudget.claim(); const input = JSON.parse(request.messages[1].content); return { text: JSON.stringify({ kind: 'directive.characterKnowledgeReview.v1', candidateDigest: input.candidateDigest, supportDigest: input.supportDigest, verdict: 'pass', findings: [] }) }; },
} });
generation.generateNarration = async () => { legacy++; throw new Error('Unrestricted opening route'); };
const host = createFakeDirectiveHost({ chatNative: true, generation });
const app = createDirectiveRuntimeApp({ host, packageLoader: async () => loadAshesRuntimeAssets(), idFactory: prefix => `${prefix}.${++sequence}`, getCharacterKnowledgeSettings: () => true ? { mode: 'protected' } : null });
await app.initialize(); await app.startCreatorDraft();
await app.saveCreatorDraft({ patch: { activeStep: 'review', input: {
  identity: { name: 'Boundary Tester', pronounsOrAddress: 'they/them', speciesId: 'human', ageBandId: 'mid-career', appearance: 'Attentive.' },
  service: { careerBackgroundId: 'tactical-security', formativeExperienceId: 'dominion-war-fleet-service', assignmentReasonId: 'experienced-outsider-transfer' },
  personality: { traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' }, flawId: 'impatient' },
  dossier: { briefBiography: 'PRIVATE_UNSHARED_MEMORY', publicReputation: 'An attentive command officer.' },
} } });
host.chat.publishProtectedScene = async options => {
  const rows = host.chat.messages();
  const existing = rows.find(row => row.metadata?.idempotencyKey === options.publicationId);
  if (existing) {
    const { text, role, ...source } = captureV1StorySource(existing).value;
    assert.equal(options.assertCurrent({ phase: 'reconcile', publicationId: options.publicationId, source }), true);
    assert.equal(options.assertCurrent({ phase: 'persisted', publicationId: options.publicationId, source, persistedSnapshot: host.chat.captureCurrentTranscriptSnapshot().snapshot }), true);
    return { ok: true, persisted: true, duplicate: true, hostMessageId: existing.id, publicationId: options.publicationId, displayUpdated: true };
  }
  const targetIndex = options.hostMessageId ? rows.findIndex(row => row.id === options.hostMessageId) : -1;
  const priorRow = targetIndex >= 0 ? rows[targetIndex] : null;
  const row = { ...(priorRow || {}), id: priorRow?.id || `protected.output.${rows.length}`,  hostMessageId: priorRow?.id || `protected.output.${rows.length}`, role: 'assistant', isUser: false, isDirectiveOwned: true,
    text: options.text, mes: options.text, swipes: [...(priorRow?.swipes || []), options.text], swipe_id: priorRow?.swipes?.length || 0,
    metadata: { idempotencyKey: options.publicationId, campaignId: options.expectedBinding.campaignId, responseKind: 'protected-scene' } };
  const { text, role, ...source } = captureV1StorySource(row).value;
  row.swipe_info = [...(priorRow?.swipe_info || []), { extra: { runtimeMetadata: { characterScenePublication: options.createMetadata(source) } } }];
  assert.equal(options.assertCurrent({ phase: 'before-mutation', publicationId: options.publicationId, source }), true);
  host.chat.setMessagesForChat(options.expectedBinding.chatId, priorRow ? rows.map((item, index) => index === targetIndex ? row : item) : [...rows, row]);
  const snapshot = host.chat.captureCurrentTranscriptSnapshot().snapshot;
  assert.equal(options.assertCurrent({ phase: 'mutated', publicationId: options.publicationId, source, mutatedRows: snapshot.rows }), true);
  if (stopDuringPublish) { stopDuringPublish = false; await app.handleHostGenerationStopped(); throw Object.assign(new Error('Stopped during save'), { code: 'DIRECTIVE_GENERATION_ABORTED' }); }
  if (mutateThenFail) { mutateThenFail = false; throw Object.assign(new Error('Saved output acknowledgement lost'), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING' }); }
  assert.equal(options.assertCurrent({ phase: 'persisted', publicationId: options.publicationId, source, persistedSnapshot: snapshot }), true);
  return { ok: true, persisted: true, hostMessageId: row.id, publicationId: options.publicationId, displayUpdated: true };
};
const started = await app.acceptCreatorDraftAndStartCampaign();
assert.equal(started.opening.ok, false, JSON.stringify(started.opening));
assert.equal(started.opening.error.code, 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING');
assert.equal(calls, 2);
assert.equal(directors, 1);
assert.equal(host.chat.messages().length, 1);
assert.equal(legacy, 0);
const stateBeforeRetry = started.view.campaignState;
await app.handleHostGenerationStopped();
const recovered = await app.retryOpening();
assert.equal(recovered.ok, true, JSON.stringify(recovered));
assert.equal(recovered.duplicate, true);
assert.equal(host.chat.messages().length, 1);
assert.equal(calls, 2);
assert.equal(directors, 1);
assert.equal(legacy, 0);
assert.deepEqual(recovered.view.campaignState, stateBeforeRetry, 'opening publication never commits campaign outcomes');
assert.equal(recovered.view.openingGeneration.status, 'ready');
console.log('PASS protected runtime opening, private context containment, and Stop save-only recovery');

host.chat.setMessagesForChat(host.chat.getCurrentChatId(), []);
stopBeforeNarration = true;
const stopped = await app.retryOpening();
assert.equal(stopped.ok, false);
assert.equal(host.chat.messages().length, 0, 'Stop before review never publishes an opening');
const retryStopped = await app.retryOpening();
assert.equal(retryStopped.ok, true, JSON.stringify(retryStopped));
assert.equal(host.chat.messages().length, 1);
assert.equal(legacy, 0);
console.log('PASS protected opening Stop before narration and fresh-gesture retry');

host.chat.setMessagesForChat(host.chat.getCurrentChatId(), []);
await host.chat.setOpeningRecord(null);
editDuringDirector = true;
const callsBeforeEdit = calls;
const changedOpening = await app.retryOpening();
assert.equal(changedOpening.ok, false);
assert.equal(changedOpening.error.code, 'DIRECTIVE_CHARACTER_SCENE_STALE');
assert.equal(calls, callsBeforeEdit, 'source change blocks the protected narrator and reviewer');
assert.equal(host.chat.messages().length, 1);
assert.equal(host.chat.messages()[0].isUser, true);
console.log('PASS transcript mutation during opening direction prevents protected publication');
