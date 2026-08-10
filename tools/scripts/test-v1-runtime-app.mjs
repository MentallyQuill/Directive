import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createFakeChatAdapter,
  createFakeDirectiveHost,
  createFakeGenerationClient
} from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { V1_CAMPAIGN_LIBRARY_TEASERS } from '../../src/packages/bundled-package-registry.mjs';

function json(relative) {
  return JSON.parse(fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8'));
}

const definitionNames = [
  'prelude-a-ship-underway', 'chapter-1-the-empty-convoy', 'chapter-2-false-colors',
  'open-orders-1-work-worth-doing', 'chapter-3-dead-letters', 'chapter-4-the-colony-that-stayed',
  'chapter-5-old-lessons', 'open-orders-2-what-survives', 'chapter-6-the-cost-of-knowing',
  'chapter-7-a-peace-of-their-own', 'open-orders-3-before-the-lamps-go-out',
  'chapter-8-the-last-directive', 'epilogue-the-terms-we-keep'
];
const records = {
  packageData: json('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json'),
  crewDataset: json('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json'),
  shipDataset: json('packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json'),
  missionDefinitions: definitionNames.map((name) => json(`packages/bundled/breckenridge/v1/${name}.mission-v1.json`)),
  campaignLibrary: V1_CAMPAIGN_LIBRARY_TEASERS
};

const chat = createFakeChatAdapter({ chatId: 'unbound-chat' });
const generation = createFakeGenerationClient({
  responses: {
    narration: { text: 'Captain Whitaker waits in the ready room. “Come in, Commander.”', providerId: 'fake-narrator' },
    sourceSettlementLatestPair: {
      text: JSON.stringify({
        kind: 'directive.missionEvidenceInterpretation.v1',
        assistantAcceptance: 'accepted',
        claims: [],
        abstained: true
      }),
      providerId: 'fake-utility'
    }
  }
});
const host = createFakeDirectiveHost({ chatNative: true, chat, generation });
let nextId = 0;
let nextMinute = 0;
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => structuredClone(records),
  idFactory: (prefix) => `${prefix}.${++nextId}`,
  now: () => `2026-08-10T03:${String(nextMinute++).padStart(2, '0')}:00.000Z`
});

const initial = await app.initialize();
assert.equal(initial.kind, 'directive.runtimeView.v1');
assert.equal(initial.campaignState, null);
assert.equal(app.getChatTurnOrchestrator() != null, true);

await app.startCreatorDraft();
await app.saveCreatorDraft({
  patch: {
    activeStep: 'review',
    input: {
      identity: {
        name: 'Ren Okada', pronounsOrAddress: 'he/him', speciesId: 'human',
        ageBandId: 'mid-career', appearance: 'Attentive and deliberate.'
      },
      service: {
        careerBackgroundId: 'tactical-security',
        formativeExperienceId: 'dominion-war-fleet-service',
        assignmentReasonId: 'experienced-outsider-transfer'
      },
      personality: {
        traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' },
        flawId: 'impatient'
      },
      dossier: {
        briefBiography: 'Ren Okada is a command officer shaped by wartime service and committed to reconstruction.',
        publicReputation: 'A decisive officer learning how to turn wartime instincts toward peace.'
      }
    }
  }
});
await app.acceptCreatorDraftAndStartCampaign();
const missionView = await app.getCurrentView({ tabId: 'mission' });
assert.equal(missionView.campaignState.campaign.status, 'active');
assert.equal(missionView.campaignState.campaignChatBinding.kind, 'directive.campaignChatBinding.v1');
assert.equal(missionView.v1PlayerProjection.kind, 'directive.playerProjection.v1');
assert.equal(chat.messages().filter((message) => !message.isUser).length, 1);

const opening = chat.messages()[0];
const player = chat.pushPlayerMessage({ text: 'I take the chair opposite Whitaker and open the handover packet.' });
const settled = await app.observeHostPlayerMessage({ message: player });
assert.equal(settled.handled, true);
const acceptedRevision = (await app.getCurrentView({ tabId: 'mission' })).campaignState.stateCustody.revision;
assert.ok(acceptedRevision > 1);

const provisional = chat.pushAssistantMessage({
  text: 'Whitaker closes the packet.',
  hostMessageId: 'assistant.provisional',
  swipes: ['Whitaker closes the packet.', 'Whitaker leaves it open.'],
  swipeId: 1
});
await app.handleHostMessageSelectedSwipeChanged({ message: provisional });
const afterSwipeRevision = (await app.getCurrentView({ tabId: 'mission' })).campaignState.stateCustody.revision;
assert.equal(afterSwipeRevision, acceptedRevision);

const nextPlayer = chat.pushPlayerMessage({ text: '“Let us start with where you need me most.”' });
await app.observeHostPlayerMessage({ message: nextPlayer });
const finalRevision = (await app.getCurrentView({ tabId: 'mission' })).campaignState.stateCustody.revision;
assert.ok(finalRevision > afterSwipeRevision);
assert.equal(opening.text.startsWith('*Stardate'), true);

console.log('PASS V1 runtime app');
