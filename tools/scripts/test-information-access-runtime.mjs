import assert from 'node:assert/strict';
import { createFakeDirectiveHost, createFakeGenerationClient, createFakePromptAdapter } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const defaults = createFakeGenerationClient();
const prompt = createFakePromptAdapter();
let continuityCalls = 0;
let recipientId;
const generation = createFakeGenerationClient({ responses: {
  continuityAnalyst: async ({ request }) => {
    continuityCalls++;
    const context = JSON.parse(request.messages.find(m => m.role === 'user').content);
    recipientId = context.authoredContext.references.find(ref => /Nayar/i.test(ref.name))?.id;
    assert.ok(recipientId, 'authored officer is available to the existing analyst');
    return { text: JSON.stringify({ kind: 'directive.continuityAnalystProposal.v1', envelope: context.envelope,
      coverage: 'complete', lookupRequests: [], threadChanges: [
        { operation: 'open', localRef: 'shuttle-briefing', title: 'Shuttle fallback briefing', category: 'information', sourceSlot: 'currentPlayer', evidenceQuote: 'Sam tells Nayar,' },
        { operation: 'addFact', threadRef: 'shuttle-briefing', text: 'Sam says two Type-9s are standing by as a cargo fallback.', claimType: 'character-claim', authoredRef: null, supersedesFactId: null,
          sourceSlot: 'currentPlayer', evidenceQuote: 'Two Type-9s are standing by as our cargo fallback.',
          informationAccess: { recipientIds: [recipientId], acquisition: 'heard', audienceEvidence: [{ sourceSlot: 'currentPlayer', evidenceQuote: 'Sam tells Nayar,' }] } },
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
host.chat.pushAssistantMessage({ text: 'Priya Nayar stands by the cargo console and turns to greet Sam.' });
host.chat.pushPlayerMessage({ text: 'Sam tells Nayar, "Two Type-9s are standing by as our cargo fallback."' });
const before = (await app.getCurrentView({ tabId: 'mission' })).campaignState;
const result = await app.getChatTurnOrchestrator().interceptGeneration({ type: 'normal' });
assert.equal(result.abortDefaultGeneration, false, JSON.stringify(result));
const state = (await app.getCurrentView({ tabId: 'mission' })).campaignState;
assert.equal(state.stateCustody.revision, before.stateCustody.revision + 1, 'access shares the accepted-pair transaction');
const fact = state.storySettlement.continuityEvents.find(e => e.payload?.informationAccess);
assert.deepEqual(fact.payload.informationAccess.recipientIds, [recipientId]);
assert.equal(fact.payload.claimType, 'character-claim');
const installed = prompt.calls().filter(call => call.type === 'sync').at(-1).options.packet;
assert.match(installed.text, /"characterInformation"/);
assert.match(installed.text, /Sam says two Type-9s/);
assert.match(installed.text, new RegExp(recipientId));
assert.equal(continuityCalls, 1);
await app.getChatTurnOrchestrator().interceptGeneration({ type: 'normal' });
assert.equal(continuityCalls, 1, 'unchanged Generate reuses accepted analysis');
assert.equal((await app.getCurrentView({ tabId: 'mission' })).campaignState.storySettlement.continuityEvents.length, state.storySettlement.continuityEvents.length);
console.log('PASS accepted briefing -> atomic continuity -> narrator packet with unchanged call count and retry reuse');
