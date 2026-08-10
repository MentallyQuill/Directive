import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createFakeChatAdapter,
  createFakeDirectiveHost,
  createFakeGenerationClient,
  createFakeJsonStorage
} from '../../src/hosts/fake/fake-host.mjs';
import { awardV1CommandBearing } from '../../src/command/v1-command-bearing.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { V1_CAMPAIGN_LIBRARY_TEASERS } from '../../src/packages/bundled-package-registry.mjs';
import { V1_STORAGE_PATHS } from '../../src/storage/v1-storage-repository.mjs';

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
const jsonStorage = createFakeJsonStorage();
const storage = {
  ...jsonStorage,
  async writeBase64File(fileName) {
    return { ok: true, fileName, path: `/user/files/${fileName}` };
  },
  async deleteFile(path) {
    return { ok: true, path };
  }
};
let missionInterpretationCalls = 0;
const generation = createFakeGenerationClient({
  responses: {
    narration: { text: 'Captain Whitaker waits in the ready room. “Come in, Commander.”', providerId: 'fake-narrator' },
    acceptedPairMissionEvidence: () => {
      missionInterpretationCalls += 1;
      if (missionInterpretationCalls === 1) throw new Error('transient fake provider failure');
      return {
        text: JSON.stringify({
          kind: 'directive.missionEvidenceInterpretation.v1',
          assistantAcceptance: 'accepted',
          claims: [],
          abstained: true
        }),
        providerId: 'fake-utility'
      };
    }
  }
});
const host = createFakeDirectiveHost({ chatNative: true, chat, generation, storage });
let nextId = 0;
let nextMinute = 0;
let app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => structuredClone(records),
  idFactory: (prefix) => `${prefix}.${++nextId}`,
  now: () => `2026-08-10T03:${String(nextMinute++).padStart(2, '0')}:00.000Z`
});

const initial = await app.initialize();
assert.equal(initial.kind, 'directive.runtimeView.v1');
assert.equal(initial.campaignState, null);
assert.deepEqual(initial.media, { playerPortraitImportSupported: true });
assert.equal(app.getChatTurnOrchestrator() != null, true);

const incompleteStorageView = await createDirectiveRuntimeApp({
  host: createFakeDirectiveHost(),
  packageLoader: async () => structuredClone(records),
  idFactory: (prefix) => `${prefix}.incomplete-storage`,
  now: () => '2026-08-10T03:00:00.000Z'
}).initialize();
assert.deepEqual(incompleteStorageView.media, { playerPortraitImportSupported: false });

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
const installedPrompt = host.prompt.inspect().blocks[0]?.text || '';
assert.match(installedPrompt, /"simulationMode": "Command"/);
assert.match(installedPrompt, /Command mode: preserve full causal consequence severity/);

const activeSavePath = V1_STORAGE_PATHS.save(missionView.activeSaveId);
const creditedSave = await host.storage.readJson(activeSavePath);
creditedSave.state.commandBearing = awardV1CommandBearing(creditedSave.state.commandBearing, {
  awardId: 'award.test.command-bearing',
  sourceId: 'objective.test.optional-command-choice',
  reason: 'You made a meaningful optional command decision.'
}).commandBearing;
await host.storage.writeJson(activeSavePath, creditedSave);
app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => structuredClone(records),
  idFactory: (prefix) => `${prefix}.${++nextId}`,
  now: () => `2026-08-10T03:${String(nextMinute++).padStart(2, '0')}:00.000Z`
});
await app.initialize();

const reserved = await app.reserveCommandBearingEdge();
assert.equal(reserved.applied, true);
assert.equal(reserved.commandBearing.balance, 0);
assert.equal(reserved.commandBearing.spends[reserved.spendId].status, 'reserved');
assert.doesNotMatch(host.prompt.inspect().blocks[0]?.text || '', /COMMAND BEARING EDGE IS ARMED/);

const opening = chat.messages()[0];
const player = chat.pushPlayerMessage({ text: 'I take the chair opposite Whitaker and open the handover packet.' });
const settled = await app.observeHostPlayerMessage({ message: player });
assert.equal(settled.handled, true);
assert.equal(settled.mission.ok, false);
assert.equal(settled.mission.reasonCode, 'provider-empty');
assert.equal((await app.getCurrentView({ tabId: 'mission' })).campaignState.storySettlement.revision, 0);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'reserved');
const intercepted = await app.getChatTurnOrchestrator().interceptGeneration();
assert.equal(intercepted.acceptedPairReplay.replayed, 1);
assert.equal(intercepted.acceptedPairReplay.retryPending, false);
assert.equal(missionInterpretationCalls, 2);
assert.ok((await app.getCurrentView({ tabId: 'mission' })).campaignState.storySettlement.revision > 0);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'armed');
assert.match(host.prompt.inspect().blocks[0]?.text || '', /COMMAND BEARING EDGE IS ARMED/);
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
assert.ok(afterSwipeRevision >= acceptedRevision);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'armed');

const nextPlayer = chat.pushPlayerMessage({ text: '“Let us start with where you need me most.”' });
await app.observeHostPlayerMessage({ message: nextPlayer });
const finalRevision = (await app.getCurrentView({ tabId: 'mission' })).campaignState.stateCustody.revision;
assert.ok(finalRevision > afterSwipeRevision);
assert.equal((await app.getCurrentView({ tabId: 'people' })).campaignState.commandBearing.spends[reserved.spendId].status, 'committed');
assert.doesNotMatch(host.prompt.inspect().blocks[0]?.text || '', /COMMAND BEARING EDGE IS ARMED/);
assert.equal(opening.text.startsWith('*Stardate'), true);

await app.handleHostMessageSelectedSwipeChanged({ message: provisional });
const afterInvalidation = await app.getCurrentView({ tabId: 'people' });
assert.equal(afterInvalidation.campaignState.commandBearing.balance, 1);
assert.equal(afterInvalidation.campaignState.commandBearing.spends[reserved.spendId].status, 'refunded');

const cancelCandidate = await app.reserveCommandBearingEdge();
assert.equal(cancelCandidate.applied, true);
const cancelled = await app.cancelCommandBearingEdge();
assert.equal(cancelled.applied, true);
assert.equal(cancelled.commandBearing.balance, 1);
assert.equal(cancelled.commandBearing.spends[cancelCandidate.spendId].status, 'refunded');

console.log('PASS V1 runtime app');
