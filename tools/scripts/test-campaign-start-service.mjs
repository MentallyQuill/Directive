import fs from 'node:fs';
import path from 'node:path';
import {
  acceptCreatorDraftAndCreateFirstSave,
  autosaveGame,
  loadGame,
  resumeCharacterCreatorDraft,
  saveCharacterCreatorDraftProgress,
  saveGame,
  startCharacterCreatorDraft
} from '../../src/campaign/campaign-start-service.mjs';
import {
  DIRECTIVE_STORAGE_PATHS,
  getDirectiveStorageIndexes,
  listCampaignSaves,
  listCharacterCreatorDrafts
} from '../../src/storage/directive-storage-repository.mjs';

const root = process.cwd();
const errors = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function stable(value) {
  return JSON.stringify(value);
}

function at(location, message) {
  errors.push(`${location}: ${message}`);
}

function requireEqual(actual, expected, location) {
  if (stable(actual) !== stable(expected)) {
    at(location, `got ${stable(actual)}, expected ${stable(expected)}`);
  }
}

function requireIncludes(values, expected, location) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    at(location, `missing "${expected}"`);
  }
}

function createMemoryJsonAdapter() {
  const files = new Map();
  return {
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
    },
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([key, value]) => [key, cloneJson(value)]));
    }
  };
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const adapter = createMemoryJsonAdapter();

const draft = await startCharacterCreatorDraft({
  adapter,
  packageData,
  draftId: 'creator-draft-service',
  now: '2026-06-18T20:00:00.000Z'
});
requireEqual(draft.status, 'inProgress', 'new draft status');
requireEqual(draft.activeStep, 'identity', 'new draft activeStep');

await saveCharacterCreatorDraftProgress({
  adapter,
  draftId: draft.id,
  now: '2026-06-18T20:03:00.000Z',
  reason: 'manualSave',
  patch: {
    activeStep: 'service',
    input: {
      identity: {
        name: 'Ren Okada',
        pronounsOrAddress: 'he/him',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'Rested, deliberate, and visibly attentive to junior officers.'
      }
    }
  }
});

let resumed = await resumeCharacterCreatorDraft({ adapter, draftId: draft.id });
requireEqual(resumed.input.identity.name, 'Ren Okada', 'resume partial draft name');
requireEqual(resumed.progress.identityComplete, true, 'resume partial draft identityComplete');
requireEqual(resumed.progress.readyForCampaignStart, false, 'resume partial draft not ready');
requireEqual((await listCharacterCreatorDrafts(adapter))[0].activeStep, 'service', 'draft list activeStep');

await saveCharacterCreatorDraftProgress({
  adapter,
  draftId: draft.id,
  now: '2026-06-18T20:11:00.000Z',
  reason: 'autosave',
  patch: {
    activeStep: 'review',
    input: {
      service: {
        careerBackgroundId: 'tactical-security',
        formativeExperienceId: 'dominion-war-fleet-service',
        assignmentReasonId: 'experienced-outsider-transfer'
      },
      personality: {
        traits: {
          insight: 'perceptive',
          connection: 'candid',
          execution: 'decisive'
        },
        flawId: 'impatient'
      },
      dossier: {
        detailLevel: 'Standard',
        briefBiography: 'Ren Okada is a tactical-minded Starfleet Commander whose Dominion War service left him intolerant of vague orders and avoidable risk. He learned to read rooms quickly, speak plainly, and make decisions before hesitation became its own casualty. The same qualities that make him useful aboard the Breckenridge can make him impatient when reconstruction politics slow urgent work. His transfer gives the ship an executive officer with hard-earned operational discipline and a need to prove that decisiveness can serve peace rather than only survival.',
        publicReputation: 'Ren Okada is regarded as a decisive wartime officer still learning how his instincts fit the demands of postwar reconstruction.'
      }
    }
  }
});

resumed = await resumeCharacterCreatorDraft({ adapter, draftId: draft.id });
requireEqual(resumed.progress.readyForCampaignStart, true, 'resume complete draft ready');

const started = await acceptCreatorDraftAndCreateFirstSave({
  adapter,
  packageData,
  projection,
  draftId: draft.id,
  campaignId: 'campaign-service-test',
  saveId: 'save-service-first',
  now: '2026-06-18T20:15:00.000Z',
  simulationMode: 'Command'
});

requireEqual(started.acceptedDraft.status, 'accepted', 'accepted draft status');
requireEqual(started.campaignState.player.name, 'Ren Okada', 'started campaign player');
requireEqual(started.campaignState.settings.simulationMode, 'Command', 'started campaign simulationMode');
requireEqual(started.firstSave.slotType, 'active', 'started first save slotType');
requireEqual(started.firstSave.storageFormat, 'v2', 'started first save storage format');
requireEqual(started.firstSave.payloadKind, 'directive.saveManifest.v2', 'started first save payload kind');
requireEqual(started.firstSave.metadata.playerName, 'Ren Okada', 'started first save metadata playerName');

const mutatedState = cloneJson(started.campaignState);
mutatedState.campaign.currentStardate = 53051.7;
mutatedState.campaignChatBinding = {
  hostId: 'sillytavern',
  chatId: 'Directive - Ashes Service Test',
  campaignId: mutatedState.campaign.id,
  saveId: started.firstSave.id,
  status: 'bound'
};
mutatedState.commandLog.entries.push({
  id: 'manual.test-entry',
  summaryInputs: ['Ren Okada reviewed the first mission plan.'],
  visibleConsequences: ['Manual test save point.']
});

const saved = await saveGame({
  adapter,
  packageData,
  saveId: started.firstSave.id,
  campaignState: mutatedState,
  now: '2026-06-18T20:20:00.000Z',
  summary: 'Manual command review save.'
});
requireEqual(saved.kind, 'directive.activeCampaignStatePersist.v2', 'saveGame v2 persist kind');
requireEqual(saved.storageFormat, 'v2', 'saveGame storage format');
requireEqual(saved.wroteV1Payload, false, 'saveGame avoids v1 payload');

const runtimeOnlyState = cloneJson(mutatedState);
runtimeOnlyState.campaign.currentStardate = 53051.9;
runtimeOnlyState.commandLog.entries.push({
  id: 'runtime.only-entry',
  summaryInputs: ['Runtime-only v2 state advanced beyond the stale checkpoint payload.'],
  visibleConsequences: ['Branching must use v2 runtime authority.']
});
await saveGame({
  adapter,
  packageData,
  saveId: started.firstSave.id,
  campaignState: runtimeOnlyState,
  now: '2026-06-18T20:22:00.000Z',
  summary: 'Runtime-only v2 advance.',
});

const autosaveIds = [];
for (let index = 0; index < 4; index += 1) {
  const autosaveState = cloneJson(mutatedState);
  autosaveState.campaign.currentStardate = 53052 + index;
  const autosave = await autosaveGame({
    adapter,
    packageData,
    saveId: `save-service-autosave-${index + 1}`,
    campaignState: autosaveState,
    now: `2026-06-18T20:2${index + 6}:00.000Z`,
    summary: `Service autosave ${index + 1}.`
  });
  autosaveIds.push(autosave.save.id);
}

let saveList = await listCampaignSaves(adapter);
requireEqual(saveList.length, 4, 'service save list length');
requireIncludes(saveList.map((entry) => entry.id), started.firstSave.id, 'service save list active timeline');
requireEqual(saveList.filter((entry) => entry.slotType === 'autosave').length, 3, 'service autosave rolling cap');
requireEqual(saveList.some((entry) => entry.id === autosaveIds[0]), false, 'service prunes oldest autosave');

const loaded = await loadGame({
  adapter,
  saveId: started.firstSave.id,
  now: '2026-06-18T20:30:00.000Z'
});
requireEqual(loaded.player.name, 'Ren Okada', 'loadGame player');
requireEqual(loaded.campaign.currentStardate, 53051.9, 'loadGame stardate');
loaded.player.name = 'Changed';

const indexes = await getDirectiveStorageIndexes(adapter);
requireEqual(indexes.saveIndex.activeSaveId, started.firstSave.id, 'loadGame active save id');
requireEqual(indexes.saveIndex.saves[started.firstSave.id].current, true, 'loadGame current save');
requireEqual(Object.values(indexes.saveIndex.saves).filter((entry) => entry.slotType === 'autosave').every((entry) => entry.current === false), true, 'autosaves remain non-current after loadGame');

const snapshot = adapter.snapshot();
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[started.firstSave.id].metadata.playerName, 'Ren Okada', 'save index persisted playerName');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.creatorDraftIndex].drafts[draft.id].status, 'accepted', 'draft index accepted status');
requireEqual(indexes.saveIndex.saves[started.firstSave.id].storageFormat, 'v2', 'active timeline remains v2-native');

saveList = await listCampaignSaves(adapter);
requireEqual(saveList[0].metadata.playerName, 'Ren Okada', 'service save list metadata retained');

if (errors.length > 0) {
  console.error('Campaign start service test failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Campaign start service tests passed: draft resume, v2-native first timeline, persistence, autosave, and load');
