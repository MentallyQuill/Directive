import assert from 'node:assert/strict';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { createFakeDirectiveHost, createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
const defaults = createFakeGenerationClient();
let enabled = false, sequence = 0, protectedCalls = 0, published = 0;
const generation = createFakeGenerationClient({ responses: {
  acceptedPairMissionEvidence: async () => ({ text: JSON.stringify({ kind: 'directive.missionEvidenceInterpretation.v1', assistantAcceptance: 'accepted', claims: [], abstained: true, time: { decision: 'unchanged', basis: 'noPassage', elapsedSeconds: 0, reason: 'same-second', confidence: 0.9 } }) }),
  continuityAnalyst: async ({ request }) => {
    const context = JSON.parse(request.messages[1].content);
    if (!context.currentScene?.characterKnowledge) return defaults.generate('continuityAnalyst', request);
    return { text: JSON.stringify({ kind: 'directive.continuityAnalystProposal.v1', envelope: context.envelope, coverage: 'complete', lookupRequests: [], threadChanges: [], characterScene: { participants: [], reactions: [], playerContext: [{ sourceSlot: 'currentPlayer', evidenceQuote: context.pendingPair.currentPlayer.text }] } }) };
  },
  sceneNarrator: async ({ rawOptions }) => { protectedCalls++; rawOptions.attemptBudget.claim(); return { text: JSON.stringify({ segments: [{ kind: 'prose', id: 'segment.1', text: 'The console remains quiet.' }] }) }; },
  characterKnowledgeReviewer: async ({ request, rawOptions }) => { protectedCalls++; rawOptions.attemptBudget.claim(); const input = JSON.parse(request.messages[1].content); return { text: JSON.stringify({ kind: 'directive.characterKnowledgeReview.v1', candidateDigest: input.candidateDigest, supportDigest: input.supportDigest, verdict: 'pass', findings: [] }) }; },
} });
const host = createFakeDirectiveHost({ chatNative: true, generation });
host.chat.publishProtectedScene = async () => { published++; throw Object.assign(new Error('Synthetic save failure before mutation'), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING' }); };
const app = createDirectiveRuntimeApp({ host, packageLoader: async () => loadAshesRuntimeAssets(), idFactory: prefix => `${prefix}.${++sequence}`, getCharacterKnowledgeSettings: () => enabled ? { mode: 'protected' } : null });
await app.initialize(); await app.startCreatorDraft();
await app.saveCreatorDraft({ patch: { activeStep: 'review', input: {
  identity: { name: 'Boundary Tester', pronounsOrAddress: 'they/them', speciesId: 'human', ageBandId: 'mid-career', appearance: 'Attentive.' },
  service: { careerBackgroundId: 'tactical-security', formativeExperienceId: 'dominion-war-fleet-service', assignmentReasonId: 'experienced-outsider-transfer' },
  personality: { traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' }, flawId: 'impatient' },
  dossier: { briefBiography: 'A command officer committed to reconstruction.', publicReputation: 'An attentive command officer.' },
} } });
await app.acceptCreatorDraftAndStartCampaign();
host.chat.pushPlayerMessage({ text: 'I enter the bridge.' });
host.chat.pushAssistantMessage({ text: 'The bridge console is quiet.' });
host.chat.pushPlayerMessage({ text: 'I wait by the console.' });
enabled = true;
const orchestrator = app.getChatTurnOrchestrator();
const first = await orchestrator.interceptGeneration({ type: 'normal' });
assert.equal(first.abortDefaultGeneration, true);
assert.equal(first.responseStrategy, 'blockAndRetry');
assert.equal(first.settlementError.reasonCode, 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING');
assert.equal(protectedCalls, 2);
assert.equal(published, 1);
const second = await orchestrator.interceptGeneration({ type: 'normal' });
assert.equal(second.abortDefaultGeneration, true);
assert.equal(published, 2);
assert.equal(protectedCalls, 2, 'pending save retries reuse the exact reviewed candidate');
console.log('PASS native protected interception suppresses default output and retains publication-only recovery');
import { captureV1StorySource } from '../../src/runtime/v1-accepted-pair-source.mjs';
const beforeRows = host.chat.messages().length;
let mutateThenFail = false;
host.chat.publishProtectedScene = async options => {
  const rows = host.chat.messages();
  const existing = rows.find(row => row.metadata?.idempotencyKey === options.publicationId);
  if (existing) {
    const { text, role, ...source } = captureV1StorySource(existing).value;
    assert.equal(options.assertCurrent({ phase: 'reconcile', publicationId: options.publicationId, source }), true);
    assert.equal(options.assertCurrent({ phase: 'persisted', publicationId: options.publicationId, source, persistedSnapshot: host.chat.captureCurrentTranscriptSnapshot().snapshot }), true);
    return { ok: true, persisted: true, duplicate: true, hostMessageId: existing.id, publicationId: options.publicationId, displayUpdated: true };
  }
  const row = { id: `protected.output.${rows.length}`, hostMessageId: `protected.output.${rows.length}`, role: 'assistant', isUser: false, isDirectiveOwned: true,
    text: options.text, mes: options.text, swipes: [options.text], swipe_id: 0,
    metadata: { idempotencyKey: options.publicationId, campaignId: options.expectedBinding.campaignId, responseKind: 'protected-scene' } };
  const { text, role, ...source } = captureV1StorySource(row).value;
  row.swipe_info = [{ extra: { runtimeMetadata: { characterScenePublication: options.createMetadata(source) } } }];
  assert.equal(options.assertCurrent({ phase: 'before-mutation', publicationId: options.publicationId, source }), true);
  host.chat.setMessagesForChat(options.expectedBinding.chatId, [...rows, row]);
  const snapshot = host.chat.captureCurrentTranscriptSnapshot().snapshot;
  assert.equal(options.assertCurrent({ phase: 'mutated', publicationId: options.publicationId, source, mutatedRows: snapshot.rows }), true);
  if (mutateThenFail) { mutateThenFail = false; throw Object.assign(new Error('Saved output acknowledgement lost'), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING' }); }
  assert.equal(options.assertCurrent({ phase: 'persisted', publicationId: options.publicationId, source, persistedSnapshot: snapshot }), true);
  return { ok: true, persisted: true, hostMessageId: row.id, publicationId: options.publicationId, displayUpdated: true };
};
const completed = await orchestrator.interceptGeneration({ type: 'normal' });
assert.equal(completed.responseStrategy, 'protectedScenePublished', JSON.stringify(completed));
assert.equal(completed.abortDefaultGeneration, true);
assert.equal(host.chat.messages().length, beforeRows + 1);
assert.equal(protectedCalls, 2);
assert.equal(completed.finalization.status, 'generation-ended-reviewed');
console.log('PASS native protected completion finalizes one owned response through the existing transcript lane');

mutateThenFail = true;
const uncertain = await orchestrator.interceptGeneration({ type: 'normal' });
assert.equal(uncertain.responseStrategy, 'blockAndRetry', JSON.stringify(uncertain));
assert.equal(uncertain.settlementError.reasonCode, 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING');
assert.equal(host.chat.messages().length, beforeRows + 2);
const recovered = await orchestrator.interceptGeneration({ type: 'normal' });
assert.equal(recovered.responseStrategy, 'protectedScenePublished', JSON.stringify(recovered));
assert.equal(recovered.publication.duplicate, true);
assert.equal(host.chat.messages().length, beforeRows + 2);
assert.equal(protectedCalls, 4);
console.log('PASS native retry after owned mutation preserves the reviewed output and does not call models again');
const originalAttach = host.chat.attachAssistantRuntimeMetadata;
let failAttach = true;
host.chat.attachAssistantRuntimeMetadata = async options => { if (failAttach) { failAttach = false; throw new Error('Synthetic metadata save failure'); } return originalAttach.call(host.chat, options); };
const pendingFinalization = await orchestrator.interceptGeneration({ type: 'normal' });
assert.equal(pendingFinalization.responseStrategy, 'blockAndRetry');
assert.equal(pendingFinalization.settlementError.reasonCode, 'DIRECTIVE_CHARACTER_FINALIZATION_PENDING');
const callsBeforeFinalizationRetry = protectedCalls;
const rowsBeforeFinalizationRetry = host.chat.messages().length;
const finalized = await orchestrator.interceptGeneration({ type: 'normal' });
assert.equal(finalized.responseStrategy, 'protectedScenePublished', JSON.stringify(finalized));
assert.equal(protectedCalls, callsBeforeFinalizationRetry);
assert.equal(host.chat.messages().length, rowsBeforeFinalizationRetry);
console.log('PASS metadata finalization retry completes the existing protected publication without regeneration');
const beforeQuietCalls = protectedCalls;
assert.equal((await orchestrator.interceptGeneration({ type: 'quiet' })).handled, false);
assert.equal((await orchestrator.interceptGeneration({ type: 'impersonate' })).handled, false);
assert.equal(protectedCalls, beforeQuietCalls);
console.log('PASS quiet and impersonation requests bypass protected story generation');
