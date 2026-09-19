import assert from 'node:assert/strict';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { createFakeDirectiveHost, createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
const defaults = createFakeGenerationClient();
let enabled = false, sequence = 0, protectedCalls = 0, published = 0;
const sceneOnlySources = [];
let mutateSceneSource = false, mutateRoute = false, routeFingerprint = 'route.original';
const generation = createFakeGenerationClient({ responses: {
  acceptedPairMissionEvidence: async () => ({ text: JSON.stringify({ kind: 'directive.missionEvidenceInterpretation.v1', assistantAcceptance: 'accepted', claims: [], abstained: true, time: { decision: 'unchanged', basis: 'noPassage', elapsedSeconds: 0, reason: 'same-second', confidence: 0.9 } }) }),
  continuityAnalyst: async ({ request }) => {
    const context = JSON.parse(request.messages[1].content);
    if (context.currentScene?.sceneOnly) {
      sceneOnlySources.push(context.pendingPair.previousAssistant.text);
      if (mutateSceneSource) {
        mutateSceneSource = false;
        const rows = host.chat.messages();
        const last = rows.at(-1);
        last.text = last.mes = 'Edited while preparing continuation.';
        last.swipes[last.swipe_id] = last.text;
        host.chat.setMessagesForChat(host.chat.getCurrentChatId(), rows);
      }
    }
    if (!context.currentScene?.characterKnowledge) return defaults.generate('continuityAnalyst', request);
    return { text: JSON.stringify({ kind: 'directive.continuityAnalystProposal.v1', envelope: context.envelope, coverage: 'complete', lookupRequests: [], threadChanges: [], characterScene: { participants: [], reactions: [], playerContext: [{ sourceSlot: 'currentPlayer', evidenceQuote: context.pendingPair.currentPlayer.text }] } }) };
  },
  sceneNarrator: async ({ rawOptions }) => { if (mutateRoute) { mutateRoute = false; routeFingerprint = 'route.changed'; } protectedCalls++; rawOptions.attemptBudget.claim(); return { text: JSON.stringify({ segments: [{ kind: 'prose', id: 'segment.1', text: 'The console remains quiet.' }] }) }; },
  characterKnowledgeReviewer: async ({ request, rawOptions }) => { protectedCalls++; rawOptions.attemptBudget.claim(); const input = JSON.parse(request.messages[1].content); return { text: JSON.stringify({ kind: 'directive.characterKnowledgeReview.v1', candidateDigest: input.candidateDigest, supportDigest: input.supportDigest, verdict: 'pass', findings: [] }) }; },
} });
const host = createFakeDirectiveHost({ chatNative: true, generation });
host.chat.publishProtectedScene = async () => { published++; throw Object.assign(new Error('Synthetic save failure before mutation'), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING' }); };
host.providers.configurationFingerprint = () => routeFingerprint;
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
let mutateThenFail = false, stopDuringPublish = false;
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
mutateThenFail = true;
const interruptedSave = await orchestrator.interceptGeneration({ type: 'normal' });
assert.equal(interruptedSave.settlementError.reasonCode, 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING');
const callsAtStop = protectedCalls;
const rowsAtStop = host.chat.messages().length;
await app.handleHostGenerationStopped();
const afterStop = await orchestrator.interceptGeneration({ type: 'normal', recoveryIntent: 'explicit' });
assert.equal(afterStop.responseStrategy, 'protectedScenePublished', JSON.stringify(afterStop));
assert.equal(afterStop.publication.duplicate, true);
assert.equal(protectedCalls, callsAtStop);
assert.equal(host.chat.messages().length, rowsAtStop);
console.log('PASS explicit recovery after Stop saves only the already-published reviewed response');

stopDuringPublish = true;
const stoppedInSave = await orchestrator.interceptGeneration({ type: 'normal' });
assert.equal(stoppedInSave.responseStrategy, 'cancelStaleTurn', JSON.stringify(stoppedInSave));
const callsAfterInterruptedSave = protectedCalls, rowsAfterInterruptedSave = host.chat.messages().length;
const savedAfterStop = await orchestrator.interceptGeneration({ type: 'normal', recoveryIntent: 'explicit' });
assert.equal(savedAfterStop.responseStrategy, 'protectedScenePublished', JSON.stringify(savedAfterStop));
assert.equal(savedAfterStop.publication.duplicate, true);
assert.equal(protectedCalls, callsAfterInterruptedSave);
assert.equal(host.chat.messages().length, rowsAfterInterruptedSave);
console.log('PASS Stop during the host save drains ownership and requires a fresh recovery gesture');

const beforeContinue = host.chat.messages();
const continuedSource = beforeContinue.at(-1);
const continued = await orchestrator.interceptGeneration({ type: 'continue' });
assert.equal(continued.responseStrategy, 'protectedScenePublished', JSON.stringify(continued));
assert.equal(host.chat.messages().length, beforeContinue.length);
const afterContinue = host.chat.messages().at(-1);
assert.equal(afterContinue.id, continuedSource.id);
assert.equal(afterContinue.swipes.length, continuedSource.swipes.length + 1);
assert.equal(afterContinue.swipes[0], continuedSource.swipes[0]);
assert.ok(afterContinue.text.startsWith(continuedSource.text + '\n\n'));
assert.equal(sceneOnlySources.at(-1), continuedSource.text, 'Continue analyzes the selected response, not the old pre-player source');
console.log('PASS native Continue extends the selected response with source-bound scene analysis');

const beforeRegenerate = host.chat.messages();
const regenerated = await orchestrator.interceptGeneration({ type: 'regenerate' });
assert.equal(regenerated.responseStrategy, 'protectedScenePublished', JSON.stringify(regenerated));
assert.equal(host.chat.messages().length, beforeRegenerate.length);
const afterRegenerate = host.chat.messages().at(-1);
assert.equal(afterRegenerate.id, beforeRegenerate.at(-1).id);
assert.equal(afterRegenerate.swipes.length, beforeRegenerate.at(-1).swipes.length + 1);
assert.deepEqual(afterRegenerate.swipe_info.slice(0, -1), beforeRegenerate.at(-1).swipe_info);
assert.equal(afterRegenerate.text, 'The console remains quiet.', 'Regenerate replaces rather than extends the selected response');
console.log('PASS native Regenerate retains prior swipes and their publication provenance');

const callsBeforeEdit = protectedCalls;
const rowsBeforeEdit = host.chat.messages();
mutateSceneSource = true;
const editedContinuation = await orchestrator.interceptGeneration({ type: 'continue' });
assert.equal(editedContinuation.abortDefaultGeneration, true);
assert.equal(editedContinuation.responseStrategy, 'blockAndRetry');
assert.equal(protectedCalls, callsBeforeEdit, 'source changes prevent responder/narrator/reviewer work');
assert.equal(host.chat.messages().length, rowsBeforeEdit.length);
assert.equal(host.chat.messages().at(-1).swipes.length, rowsBeforeEdit.at(-1).swipes.length);
console.log('PASS edited Continue source blocks publication before protected generation');

const beforeRouteRows = host.chat.messages();
mutateRoute = true;
const changedRoute = await orchestrator.interceptGeneration({ type: 'regenerate' });
assert.notEqual(changedRoute.responseStrategy, 'protectedScenePublished', 'native source changes must invalidate the reviewed flight');
assert.deepEqual(host.chat.messages(), beforeRouteRows);
console.log('PASS changed native route fingerprint blocks stale protected publication');
