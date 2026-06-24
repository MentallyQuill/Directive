import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import {
  __directiveRuntimeAppTestHooks,
  createDirectiveRuntimeApp
} from '../../src/runtime/runtime-app.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraphs = [
  'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
  'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
  'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json'
].map((filePath) => ({ path: filePath, graph: readJson(filePath) }));

{
  const staleScopedState = {
    campaign: { id: 'campaign.scope-freshness' },
    campaignChatBinding: {
      hostId: 'fake',
      chatId: 'scope-freshness-chat',
      campaignId: 'campaign.scope-freshness',
      saveId: 'save.scope-freshness'
    },
    commandLog: { entries: [{ id: 'old-log' }] },
    turnLedger: { entries: [{ turnId: 'old-turn' }] },
    runtimeTracking: {
      revision: 12,
      mechanicsRevision: 7,
      modelCallJournal: [{ id: 'model-call.old' }]
    }
  };
  const richerInMemoryState = {
    ...JSON.parse(JSON.stringify(staleScopedState)),
    commandLog: {
      entries: [
        { id: 'old-log' },
        { id: 'new-log' }
      ]
    },
    runtimeTracking: {
      ...staleScopedState.runtimeTracking,
      modelCallJournal: [
        { id: 'model-call.old' },
        { id: 'model-call.new' }
      ]
    }
  };
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(staleScopedState, richerInMemoryState, {
      chatId: 'scope-freshness-chat'
    }),
    true,
    'Same-chat view should prefer richer in-memory state when revision is equal and Command Log is fresher.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      {
        ...staleScopedState,
        campaignChatBinding: {
          ...staleScopedState.campaignChatBinding,
          chatId: ''
        }
      },
      richerInMemoryState,
      { chatId: 'scope-freshness-chat' }
    ),
    true,
    'Current-chat metadata should allow a richer in-memory state to win when the loaded save lacks a chat binding.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      {
        ...staleScopedState,
        commandLog: { entries: [{ id: 'old-log' }] },
        runtimeTracking: {
          ...staleScopedState.runtimeTracking,
          revision: 13
        }
      },
      richerInMemoryState,
      { chatId: 'scope-freshness-chat' }
    ),
    true,
    'A same-chat loaded save with a higher revision must not replace richer in-memory Command Log state.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      staleScopedState,
      {
        ...richerInMemoryState,
        campaignChatBinding: {
          ...richerInMemoryState.campaignChatBinding,
          saveId: 'different-save'
        }
      },
      { chatId: 'scope-freshness-chat' }
    ),
    false,
    'Freshness comparison must not cross save branches.'
  );
  assert.equal(
    __directiveRuntimeAppTestHooks.shouldPreferInMemoryCampaignState(
      {
        ...staleScopedState,
        commandLog: {
          entries: [
            { id: 'old-log' },
            { id: 'new-log' },
            { id: 'newer-log' }
          ]
        },
        turnLedger: {
          entries: [
            { turnId: 'old-turn' },
            { turnId: 'newer-turn' }
          ]
        },
        runtimeTracking: {
          ...staleScopedState.runtimeTracking,
          revision: 13
        }
      },
      richerInMemoryState,
      { chatId: 'scope-freshness-chat' }
    ),
    false,
    'A newer loaded/scoped revision must not be replaced by an older in-memory state.'
  );
}

const host = createFakeDirectiveHost({
  chatNative: true,
  chatOptions: { chatId: 'pre-campaign-chat', entityName: 'Captain Whitaker' },
  generationOptions: {
    responses: {
      campaignIntro: {
        providerId: 'fake-reasoning',
        text: 'The Breckenridge opens a fresh campaign chat and hands the deck to the player officer.'
      }
    }
  }
});

let idSequence = 0;
let clock = Date.parse('2026-06-22T08:00:00.000Z');
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
    return `${prefix}-scope-${idSequence}`;
  },
  now() {
    const value = new Date(clock).toISOString();
    clock += 1000;
    return value;
  }
});

function draftPatch(name) {
  return {
    activeStep: 'review',
    input: {
      identity: {
        name,
        pronounsOrAddress: 'they/them',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: `${name} keeps a composed command posture.`
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
        briefBiography: `${name} is a Starfleet officer assigned to Directive current-chat scope testing.`,
        publicReputation: 'Known for steady judgment during uncertain operations.'
      }
    }
  };
}

async function startCampaign(name) {
  await app.startCreatorDraft({ packageId: packageData.manifest.id });
  let view = await app.saveCreatorDraft({
    reason: `testCompleteDraft:${name}`,
    patch: draftPatch(name)
  });
  assert.equal(view.creator.canBeginCampaign, true);
  view = await app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
  assert.equal(view.currentChat.status, 'matching-campaign');
  assert.equal(view.campaignState.player.name, name);
  assert.ok(view.chatNative.binding.chatId);
  assert.ok(view.chatNative.binding.saveId);
  return {
    name,
    binding: view.chatNative.binding,
    saveId: view.chatNative.binding.saveId,
    campaignId: view.chatNative.binding.campaignId
  };
}

await app.initialize();
const campaignA = await startCampaign('Asha Ren');
const campaignB = await startCampaign('Bren Tal');

let view = await app.getCurrentView({ tabId: 'campaign' });
assert.equal(view.campaignIndex.sessions.length >= 2, true, 'Command should index multiple campaign sessions.');
assert.equal(view.campaignIndex.visibleSessions.some((session) => session.saveId === campaignA.saveId), true);
assert.equal(view.campaignIndex.visibleSessions.some((session) => session.saveId === campaignB.saveId), true);

const sessionA = view.campaignIndex.sessions.find((session) => session.saveId === campaignA.saveId);
assert.ok(sessionA?.key, 'Campaign sessions should expose a stable hide/show key.');
assert.equal(sessionA?.simulationMode, 'Command', 'Campaign sessions should expose saved Campaign Difficulty metadata.');
view = await app.hideCampaignSession({ key: sessionA.key });
assert.equal(view.campaignIndex.visibleSessions.some((session) => session.saveId === campaignA.saveId), false);
assert.equal(view.campaignIndex.sessions.find((session) => session.saveId === campaignA.saveId)?.hidden, true);
assert.equal(view.campaignIndex.counts.hidden >= 1, true);
let preferences = await host.storage.readJson('system/ui-preferences.v1.json');
assert.equal(preferences.hiddenCampaignSessionKeys.includes(sessionA.key), true);
view = await app.showCampaignSession({ key: sessionA.key });
assert.equal(view.campaignIndex.visibleSessions.some((session) => session.saveId === campaignA.saveId), true);
preferences = await host.storage.readJson('system/ui-preferences.v1.json');
assert.equal(preferences.hiddenCampaignSessionKeys.includes(sessionA.key), false);

host.chat.setCurrentChatId('');
view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.currentChat.status, 'none-selected');
assert.equal(view.campaignState, null);
assert.equal(view.currentChatCampaignState, null);
assert.equal(view.chatNative, null);
assert.equal(view.currentChatCampaignGuard.reason, 'no-active-chat-selected');
assert.match(view.currentChatCampaignGuard.summary, /Choose the campaign chat/);
assert.ok(view.loadedCampaignState, 'Loaded saves remain available for Campaign and Records.');
assert.equal(view.loadedCampaignState.player.name, campaignB.name);
assert.equal(view.loadedChatNative.manualSaveGuard.reason, 'no-active-chat-selected');
assert.equal(view.loadedSave.status, 'loaded-not-current-chat');

host.chat.setCurrentChatId('ordinary-host-chat');
view = await app.getCurrentView({ tabId: 'crew' });
assert.equal(view.currentChat.status, 'non-directive');
assert.equal(view.campaignState, null);
assert.equal(view.currentChatCampaignState, null);
assert.equal(view.chatNative, null);
assert.equal(view.currentChatCampaignGuard.reason, 'unbound-chat');
assert.equal(view.loadedCampaignState.player.name, campaignB.name);
assert.equal(view.loadedChatNative.manualSaveGuard.reason, 'unbound-chat');
const ordinaryChatSessionB = view.campaignIndex.sessions.find((session) => session.saveId === campaignB.saveId);
assert.equal(ordinaryChatSessionB?.currentChat, false, 'A campaign row should not claim Current Chat while an unrelated host chat is selected.');
assert.equal(ordinaryChatSessionB?.binding?.chatId, campaignB.binding.chatId, 'Campaign rows should retain the bound SillyTavern chat identity for display.');

await host.chat.open(campaignA.binding);
view = await app.getCurrentView({ tabId: 'ship' });
assert.equal(view.currentChat.status, 'matching-campaign');
assert.equal(view.campaignState.player.name, campaignA.name);
assert.equal(view.chatNative.binding.saveId, campaignA.saveId);
assert.equal(view.loadedSave.saveId, campaignA.saveId);
assert.equal(view.campaignIndex.sessions.find((session) => session.saveId === campaignA.saveId)?.currentChat, true);
assert.equal(view.campaignIndex.sessions.find((session) => session.saveId === campaignB.saveId)?.currentChat, false);

await app.hideCampaignSession({ key: sessionA.key });
view = await app.getCurrentView({ tabId: 'log' });
assert.equal(view.campaignState.player.name, campaignA.name, 'Hiding a Command row must not block live routes for the selected chat.');
assert.equal(view.campaignIndex.visibleSessions.some((session) => session.saveId === campaignA.saveId), false);
preferences = await host.storage.readJson('system/ui-preferences.v1.json');
assert.equal(preferences.hiddenCampaignSessionKeys.includes(sessionA.key), true);

await host.chat.open(campaignB.binding);
view = await app.getCurrentView({ tabId: 'mission' });
assert.equal(view.currentChat.status, 'matching-campaign');
assert.equal(view.campaignState.player.name, campaignB.name);
assert.equal(view.chatNative.binding.saveId, campaignB.saveId);
assert.equal(view.loadedSave.saveId, campaignB.saveId);

console.log('Current chat campaign scope tests passed: Command index, hide/show, no-chat gating, non-Directive gating, and chat-selected hydration');
