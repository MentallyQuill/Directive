import assert from 'node:assert/strict';
import { createFakeDirectiveHost, createFakeGenerationClient, createFakePromptAdapter } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const defaults = createFakeGenerationClient();
const prompt = createFakePromptAdapter();
let continuityCalls = 0;
let recipientId;
let receivedProposals = null;
const assets = loadAshesRuntimeAssets();
const speakerId = assets.crewDataset.officers.find(person => !/Nayar/i.test(person.name)).id;
const nayarId = assets.crewDataset.officers.find(person => /Nayar/i.test(person.name)).id;
const generation = createFakeGenerationClient({ responses: {
  continuityAnalyst: async ({ request }) => {
    continuityCalls++;
    const context = JSON.parse(request.messages.find(m => m.role === 'user').content);
    receivedProposals = context.currentScene?.publicationDisclosures || null;
    recipientId = context.authoredContext.references.find(ref => /Nayar/i.test(ref.name))?.id;
    assert.ok(recipientId, 'authored officer is available to the existing analyst');
    return { text: JSON.stringify({ kind: 'directive.continuityAnalystProposal.v1', envelope: context.envelope,
      coverage: 'complete', lookupRequests: [], threadChanges: [
        { operation: 'open', localRef: 'shuttle-briefing', title: 'Shuttle fallback briefing', category: 'information', sourceSlot: 'previousAssistant', evidenceQuote: 'An officer tells Nayar,' },
        { operation: 'addFact', threadRef: 'shuttle-briefing', text: 'An officer says two Type-9s are standing by as a cargo fallback.', claimType: 'character-claim', authoredRef: null, supersedesFactId: null,
          sourceSlot: 'previousAssistant', evidenceQuote: 'Two Type-9s are standing by as our cargo fallback.',
          informationAccess: { recipientIds: [recipientId], acquisition: 'heard', audienceEvidence: [{ sourceSlot: 'previousAssistant', evidenceQuote: 'An officer tells Nayar,' }] } },
      ] }) };
  },
  storyDirectionAnalyst: ({ request }) => defaults.generate('storyDirectionAnalyst', request),
  acceptedPairMissionEvidence: async () => ({ text: JSON.stringify({ kind: 'directive.missionEvidenceInterpretation.v1', assistantAcceptance: 'accepted', claims: [], abstained: true, time: { decision: 'unchanged', basis: 'noPassage', elapsedSeconds: 0, reason: 'same-second', confidence: 0.9 } }) }),
} });
let sequence = 0;
const host = createFakeDirectiveHost({ chatNative: true, generation, prompt });
const app = createDirectiveRuntimeApp({ host, packageLoader: async () => loadAshesRuntimeAssets(), idFactory: prefix => `${prefix}.${++sequence}`, now: () => '2026-09-09T21:00:00.000Z' });
await app.initialize(); await app.startCreatorDraft();
await app.saveCreatorDraft({ patch: { activeStep: 'review', input: {
  identity: { name: 'Sam Vickers', pronounsOrAddress: 'he/him', speciesId: 'human', ageBandId: 'mid-career', appearance: 'Attentive.' },
  service: { careerBackgroundId: 'tactical-security', formativeExperienceId: 'dominion-war-fleet-service', assignmentReasonId: 'experienced-outsider-transfer' },
  personality: { traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' }, flawId: 'impatient' },
  dossier: { briefBiography: 'A command officer committed to reconstruction.', publicReputation: 'An attentive command officer.' },
} } });
await app.acceptCreatorDraftAndStartCampaign();
host.chat.pushPlayerMessage({ text: 'I visit the cargo bay.' });
const { createCharacterScenePublicationMetadata } = await import('../../src/story/character-scene-publication.mjs');
const { createCharacterReviewInput } = await import('../../src/story/character-knowledge-reviewer.mjs');
const { characterNarrativeDigest } = await import('../../src/narration/character-scene-narrator.mjs');
const { captureV1AssistantSourceVariant } = await import('../../src/runtime/v1-accepted-pair-source.mjs');
const { canonicalJson } = await import('../../src/storage/v1-state-delta-codec.mjs');
const { stableSha256Hex } = await import('../../src/runtime/v1-stable-hash.mjs');
const digest = value => stableSha256Hex(canonicalJson(value));
const speech = 'Two Type-9s are standing by as our cargo fallback.';
const contribution = { id: 'line.briefing', personId: speakerId, kind: 'speech', mode: 'ordinary', text: speech, basisIds: [], recipientIds: [nayarId, 'person.directive-player'], dependsOnIds: [] };
const packet = { kind: 'directive.characterPacket.v1', personId: speakerId, identity: { name: 'Officer', role: 'Officer' }, situation: 'Briefing Nayar.', information: [] };
const scene = { kind: 'directive.playerScenePacket.v1', player: { personId: 'person.directive-player', name: 'Sam' }, situation: 'At the briefing.', information: [], constraints: [], visiblePersonIds: [speakerId, nayarId, 'person.directive-player'] };
const candidate = { segments: [{ kind: 'prose', id: 'segment.audience', text: 'An officer tells Nayar,' }, { kind: 'character', id: contribution.id }], text: 'An officer tells Nayar,\n\n' + speech };
candidate.candidateDigest = characterNarrativeDigest(candidate);
const disclosures = contribution.recipientIds.map((recipient, order) => ({ order, contributionDigest: digest(contribution), exposure: { kind: 'directive.characterExposure.v1', id: `disclosure.briefing.${order}`, speakerId, recipientIds: [recipient], acquisition: 'heard', text: speech, claimType: 'character-claim', source: { type: 'contribution', contributionId: contribution.id }, dependsOnIds: [] } }));
const draft = { flightDigest: 'a'.repeat(64), contributions: [contribution], packets: [{ personId: speakerId, contributionId: contribution.id, packet, digest: digest(packet) }], disclosures };
const { context } = createCharacterReviewInput({ candidate, draft, scenePacket: scene });
const approved = { draft, candidate, review: { kind: 'directive.characterKnowledgeReview.v1', candidateDigest: context.candidateDigest, supportDigest: context.supportDigest, verdict: 'pass', findings: [] } };
const assistant = host.chat.pushAssistantMessage({ text: candidate.text });
const rows = host.chat.messages();
const raw = rows.at(-1);
raw.mes = raw.text; raw.swipes = [raw.text]; raw.swipe_id = 0;
const selected = captureV1AssistantSourceVariant(raw).value;
const source = { messageId: selected.hostMessageId, selectedSwipeId: selected.selectedVariantId, textHash: selected.selectedTextHash };
raw.swipe_info = [{ extra: { runtimeMetadata: { characterScenePublication: createCharacterScenePublicationMetadata({ approved, scenePacket: scene, publicationId: 'publication.briefing', source }) } } }];
host.chat.setMessagesForChat(host.chat.getCurrentChatId(), rows);
host.chat.pushPlayerMessage({ text: 'I acknowledge the briefing.' });
const before = (await app.getCurrentView({ tabId: 'mission' })).campaignState;
const result = await app.getChatTurnOrchestrator().interceptGeneration({ type: 'normal' });
assert.equal(result.abortDefaultGeneration, false, JSON.stringify(result));
const state = (await app.getCurrentView({ tabId: 'mission' })).campaignState;
assert.equal(state.stateCustody.revision, before.stateCustody.revision + 1, 'access shares the accepted-pair transaction');
const fact = state.storySettlement.continuityEvents.find(e => e.payload?.informationAccess);
assert.deepEqual(fact.payload.informationAccess.recipientIds, [recipientId]);
assert.equal(fact.payload.claimType, 'character-claim');
const installed = prompt.calls().filter(call => call.type === 'sync').at(-1).options.packet;
const payloadStart = installed.text.lastIndexOf('\n\n{\n');
assert.ok(payloadStart >= 0, 'the installed prompt includes its structured state payload');
const payload = JSON.parse(installed.text.slice(payloadStart + 2));
assert.equal(payload.characterInformation.kind, 'directive.characterInformationProjection.v1');
const recipient = payload.characterInformation.characters.find(character => character.personId === recipientId);
assert.ok(recipient, 'the named recipient receives an explicit characterInformation entry');
assert.deepEqual(recipient.statements.map(statement => ({ id: statement.id, text: statement.text, acquisition: statement.acquisition })), [
  { id: fact.id, text: fact.payload.text, acquisition: 'heard' },
]);
assert.ok(payload.characterInformation.characters.every(character => character.personId === recipientId), 'shared narrator context does not grant other characters access');
assert.equal(continuityCalls, 1);
await app.getChatTurnOrchestrator().interceptGeneration({ type: 'normal' });
assert.equal(continuityCalls, 1, 'unchanged Generate reuses accepted analysis');
assert.equal((await app.getCurrentView({ tabId: 'mission' })).campaignState.storySettlement.continuityEvents.length, state.storySettlement.continuityEvents.length);
console.log('PASS accepted briefing -> atomic continuity -> narrator packet with unchanged call count and retry reuse');

assert.ok(receivedProposals, 'selected publication suggestions reached continuity');
assert.equal(receivedProposals.disclosures[0].text, speech);
assert.ok(fact.sourceContributionIds.length > 0);
const { loadV1CampaignSave } = await import('../../src/storage/v1-storage-repository.mjs');
const currentView = await app.getCurrentView({ tabId: 'mission' });
const saved = await loadV1CampaignSave(host.storage, currentView.activeSaveId);
assert.deepEqual(saved.state.storySettlement.continuityEvents, state.storySettlement.continuityEvents, 'saved replay retains the same accepted knowledge');
await app.handleHostGenerationStopped();
const editedRows = host.chat.messages();
const editedAssistant = editedRows.find(row => row.id === assistant.id);
editedAssistant.text = editedAssistant.mes = editedAssistant.swipes[0] = 'The console is silent.';
host.chat.setMessagesForChat(host.chat.getCurrentChatId(), editedRows);
await app.handleHostMessageEdited({ hostMessageId: assistant.id, chatId: host.chat.getCurrentChatId() });
const afterEdit = (await app.getCurrentView({ tabId: 'mission' })).campaignState;
const { createCharacterRuntimeSnapshot } = await import('../../src/runtime/character-runtime-snapshot.mjs');
const snapshot = createCharacterRuntimeSnapshot({ campaignState: afterEdit, crewDataset: assets.crewDataset, messages: host.chat.getRecentMessages({ limit: 100, playerSafeOnly: false }) });
assert.ok(fact.sourceContributionIds.some(id => !snapshot.sourceIdentities.has(id)), 'edited source cannot vouch for acquired information');
console.log('PASS publication suggestions settle atomically, persist for replay and lose edited-source authority');

const { createCharacterInformationProjection } = await import('../../src/story/character-information.mjs');
const afterProjection = createCharacterInformationProjection({ events: afterEdit.storySettlement.continuityEvents, personIds: [recipientId], invalidSourceIds: snapshot.invalidSourceIds });
assert.ok(!afterProjection.characters.some(person => person.statements.some(statement => statement.id === fact.id)), 'edited publication knowledge is absent from the actor projection');
