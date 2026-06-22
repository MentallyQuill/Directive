import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { listCampaignSaves } from '../../src/storage/directive-storage-repository.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.starship-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const graphPaths = [
  'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
  'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
  'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json'
];
const missionGraphs = graphPaths.map((filePath) => ({ path: filePath, graph: readJson(filePath) }));

const noChangeProposal = { text: JSON.stringify({ id: 'no-change', operations: [], summary: 'No durable sidecar change.' }) };
const host = createFakeDirectiveHost({
  chatNative: true,
  chatOptions: { chatId: 'pre-campaign-chat', entityName: 'Captain Whitaker' },
  generationOptions: {
    responses: {
      campaignIntro: {
        providerId: 'fake-reasoning',
        text: 'The U.S.S. Breckenridge holds steady at the edge of the assignment zone. Captain Whitaker yields the deck to Commander Serrin as the first operational report reaches the bridge.'
      },
      narration: {
        providerId: 'fake-reasoning',
        text: 'The bridge answers in practiced sequence. Helm adjusts the Breckenridge posture while Operations records the command and the senior staff waits for the next decision.'
      },
      campaignConclusion: {
        providerId: 'fake-reasoning',
        text: 'The Breckenridge closes the final watch with her crew intact and the campaign entered into Starfleet record.'
      },
      utilityTurnClassifier: {
        providerId: 'fake-utility',
        text: JSON.stringify({ classification: 'noDirectiveAction', confidence: 0.6, reasons: ['Fallback utility response.'], workerPlan: {}, responseStrategy: 'injectAndContinue' })
      },
      continuityTracker: noChangeProposal,
      relationshipEvaluator: noChangeProposal,
      crewDirector: noChangeProposal,
      shipDirector: noChangeProposal,
      commandBearingEvaluator: noChangeProposal,
      sideMissionSignalDetector: noChangeProposal,
      commandLogSummarizer: {
        providerId: 'fake-utility',
        text: JSON.stringify({ summary: 'The bridge committed the commander\'s order.', visibleConsequences: ['Operational posture changed.'] })
      }
    }
  }
});

let idSequence = 0;
let clock = Date.parse('2026-06-22T04:00:00.000Z');
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => ({
    packages: [packageData],
    projections: [projection],
    crewDatasets: [{
      path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs
  }),
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-chat-native-${idSequence}`;
  },
  now() {
    const value = new Date(clock).toISOString();
    clock += 1000;
    return value;
  }
});

let view = await app.initialize();
assert.equal(view.campaign.packages[0].actions.startNewCampaign, true);
assert.equal(host.prompt.inspect().blockCount, 0, 'Install and package browsing must not inject campaign context.');
assert.equal(host.chat.calls().length, 0, 'Install and package browsing must not create a campaign chat.');

view = await app.startCreatorDraft({ packageId: packageData.manifest.id });
assert.equal(view.activeScreen, 'creator');
view = await app.saveCreatorDraft({
  reason: 'testCompleteDraft',
  patch: {
    activeStep: 'review',
    input: {
      identity: {
        name: 'Talia Serrin',
        pronounsOrAddress: 'she/her',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'A composed officer who watches the room before speaking.'
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
        detailLevel: 'Standard',
        briefBiography: 'Talia Serrin is a tactical-minded Starfleet Commander whose war service taught her to make timely decisions without treating lives as expendable. Her transfer gives the Breckenridge a disciplined executive officer with a measured command presence.',
        publicReputation: 'A decisive and observant officer known for increasingly measured restraint.'
      }
    }
  }
});
assert.equal(view.creator.canBeginCampaign, true);

view = await app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
assert.equal(view.campaignState.campaign.status, 'active');
assert.equal(view.chatNative.activation.status, 'complete');
assert.ok(view.chatNative.binding.chatId);
assert.equal(host.chat.getCurrentChatId(), view.chatNative.binding.chatId);
assert.equal(host.chat.calls().filter((entry) => entry.type === 'createOrBindCampaignChat').length, 1);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'campaignIntro').length, 1);
assert.equal(host.prompt.inspect().status, 'installed');
assert.equal(host.prompt.inspect().blockCount, 9);
assert.equal(view.promptInspection.blockCount, 9);
assert.equal(view.chatNative.binding.promptContextRevision > 0, true);

const colorMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-color',
  text: '*I nod once to the operations officer.*'
});
const colorResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: colorMessage
});
assert.equal(colorResult.decision.classification, 'sceneColor');
assert.equal(colorResult.abortDefaultGeneration, false);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 0);

const routineMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-routine',
  text: 'Log the distress call, preserve the telemetry, and keep the Captain informed.'
});
const routineResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: routineMessage
});
assert.equal(routineResult.decision.classification, 'routineCommand');
assert.equal(routineResult.abortDefaultGeneration, false);

const consequentialMessage = host.chat.pushPlayerMessage({
  hostMessageId: 'runtime-player-consequential',
  text: 'I order helm to change course and pursue the freighter.'
});
let consequentialResult = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: consequentialMessage
});
assert.equal(['consequentialCommand', 'riskConfirmationNeeded', 'directorResponseNeeded'].includes(consequentialResult.decision.classification), true);
assert.equal(consequentialResult.abortDefaultGeneration, true);
if (consequentialResult.responseStrategy === 'pause') {
  view = await app.getCurrentView({ tabId: 'mission' });
  const pending = view.chatNative.pendingInteractions.find((entry) => entry.status === 'pending');
  assert.ok(pending, 'A paused consequential turn must expose a resolvable interaction.');
  consequentialResult = (await app.resolvePendingChatInteraction({
    interactionId: pending.id,
    action: pending.kind === 'riskConfirmationNeeded' ? 'confirm' : 'accept'
  })).result;
  assert.equal(consequentialResult.ok, true);
}

view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.chatNative.tracking.ingressCount, 3);
assert.equal(view.chatNative.tracking.responseCount >= 3, true);
assert.ok(view.chatNative.tracking.lastCommittedTurn?.outcomeId);
assert.equal(view.chatNative.tracking.lastCommittedTurn.narrationStatus, 'complete');
assert.equal(view.chatNative.tracking.lastCommittedTurn.responseStatus, 'complete');
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);
assert.equal(view.campaignState.commandLog.entries.some((entry) => entry.type === 'routineCommand'), true);
assert.equal(view.campaignState.turnLedger.entries.length >= 1, true);
assert.equal(view.chatNative.binding.promptContextRevision > 1, true);

const duplicate = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: consequentialMessage
});
assert.equal(duplicate.deduplicated, true);
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'committedOutcome').length, 1);

const saves = await listCampaignSaves(host.storage);
const activeSave = saves.find((entry) => entry.id === view.activeSaveId);
assert.ok(activeSave);
assert.equal(activeSave.revision > 1, true);

const completed = await app.concludeCampaign({ reason: 'Runtime target-flow test completed.', type: 'playerChoice' });
assert.equal(completed.campaignState.campaign.status, 'complete');
assert.equal(completed.campaignState.conclusion.recapStatus, 'complete');
assert.equal(host.chat.messages().filter((entry) => entry.metadata?.responseKind === 'campaignConclusion').length, 1);
assert.equal(host.prompt.inspect().blockCount, 0);

const archived = await app.archiveCompletedCampaign();
assert.equal(archived.campaignState.campaign.status, 'archived');
assert.ok(archived.campaignState.campaign.archivedAt);
assert.equal(host.prompt.inspect().blockCount, 0);

console.log('Chat-native runtime flow tests passed: no pre-activation injection, creator activation, automatic chat/intro, utility loop, committed outcome, autosave, conclusion, and archive');
