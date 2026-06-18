import fs from 'node:fs';
import path from 'node:path';
import {
  acceptCharacterCreatorDraftRecord,
  createCharacterCreatorDraftRecord,
  saveCharacterCreatorDraftRecord
} from '../../src/creators/character-creator-draft.mjs';
import { createInitialCampaignStateFromCreatorReview } from '../../src/campaign/campaign-start.mjs';
import {
  createCampaignSaveAsRecord,
  createFirstCampaignSaveRecord,
  overwriteCampaignSaveRecord
} from '../../src/storage/save-records.mjs';
import {
  campaignSavePath,
  characterCreatorDraftPath,
  DIRECTIVE_STORAGE_PATHS,
  getDirectiveStorageIndexes,
  initializeDirectiveStorage,
  listCampaignSaves,
  listCharacterCreatorDrafts,
  loadCampaignSaveFromStorage,
  loadCharacterCreatorDraftFromStorage,
  storeCampaignSave,
  storeCharacterCreatorDraft
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
  const readLog = [];
  const writeLog = [];

  return {
    readLog,
    writeLog,
    resetLog() {
      readLog.length = 0;
      writeLog.length = 0;
    },
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([key, value]) => [key, cloneJson(value)]));
    },
    async readJson(filePath) {
      readLog.push(filePath);
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      writeLog.push(filePath);
      files.set(filePath, cloneJson(value));
    }
  };
}

const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const adapter = createMemoryJsonAdapter();

await initializeDirectiveStorage(adapter, { now: '2026-06-18T19:00:00.000Z' });
let indexes = await getDirectiveStorageIndexes(adapter);
requireEqual(indexes.storageIndex.kind, 'directive.storageIndex', 'init storage index kind');
requireEqual(indexes.creatorDraftIndex.kind, 'directive.characterCreatorDraftIndex', 'init draft index kind');
requireEqual(indexes.saveIndex.kind, 'directive.saveIndex', 'init save index kind');

let draft = createCharacterCreatorDraftRecord({
  packageData,
  draftId: 'creator-draft-storage',
  createdAt: '2026-06-18T19:01:00.000Z'
});
draft = saveCharacterCreatorDraftRecord(draft, {
  activeStep: 'service',
  input: {
    identity: {
      name: 'Talia Renn',
      pronounsOrAddress: 'she/her',
      speciesId: 'human',
      ageBandId: 'experienced',
      appearance: 'Sharp-eyed and formal, with a habit of pausing before difficult answers.'
    }
  }
}, {
  savedAt: '2026-06-18T19:03:00.000Z',
  reason: 'manualSave'
});

await storeCharacterCreatorDraft(adapter, draft);
const draftPath = characterCreatorDraftPath(draft.id);
let snapshot = adapter.snapshot();
requireEqual(snapshot[draftPath].input.identity.name, 'Talia Renn', 'stored draft payload');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.creatorDraftIndex].drafts[draft.id].activeStep, 'service', 'stored draft index activeStep');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.storageIndex].files[draftPath].kind, 'directive.characterCreatorDraft', 'storage index draft file');

adapter.resetLog();
const draftList = await listCharacterCreatorDrafts(adapter);
requireEqual(draftList.length, 1, 'list drafts length');
requireEqual(draftList[0].id, draft.id, 'list drafts id');
requireEqual(adapter.readLog, [DIRECTIVE_STORAGE_PATHS.creatorDraftIndex], 'list drafts reads only index');

const loadedDraft = await loadCharacterCreatorDraftFromStorage(adapter, draft.id);
loadedDraft.input.identity.name = 'Changed';
snapshot = adapter.snapshot();
requireEqual(snapshot[draftPath].input.identity.name, 'Talia Renn', 'loaded draft clone isolation');

draft = saveCharacterCreatorDraftRecord(draft, {
  activeStep: 'review',
  input: {
    service: {
      careerBackgroundId: 'diplomacy-first-contact',
      formativeExperienceId: 'frontier-border-service',
      assignmentReasonId: 'requested-by-captain'
    },
    personality: {
      traits: {
        insight: 'perceptive',
        connection: 'diplomatic',
        execution: 'patient'
      },
      flawId: 'stubborn'
    },
    dossier: {
      detailLevel: 'Standard',
      briefBiography: 'Talia Renn made her career in patient frontier diplomacy, where the right answer often arrived only after listening to local authorities, junior officers, and frightened civilians long enough to understand the real problem. She is experienced enough to command a room without raising her voice, but stubborn enough to keep pressing when a process feels unjust or incomplete. The Breckinridge assignment gives her a chance to turn that patience into practical command under Captain Whitaker.',
      publicReputation: 'Talia Renn is known as a patient frontier diplomat with a stubborn streak and a steady hand in tense negotiations.'
    }
  }
}, {
  savedAt: '2026-06-18T19:10:00.000Z',
  reason: 'autosave'
});
draft = acceptCharacterCreatorDraftRecord(draft, {
  acceptedAt: '2026-06-18T19:12:00.000Z'
});
await storeCharacterCreatorDraft(adapter, draft);

const campaignState = createInitialCampaignStateFromCreatorReview({
  packageData,
  projection,
  creatorReview: draft.acceptedReview,
  campaignId: 'campaign-storage-test',
  createdAt: '2026-06-18T19:15:00.000Z',
  simulationMode: 'Command',
  creatorDraftId: draft.id
});

let firstSave = createFirstCampaignSaveRecord({
  campaignState,
  packageData,
  saveId: 'save-storage-first',
  savedAt: '2026-06-18T19:16:00.000Z'
});
await storeCampaignSave(adapter, firstSave);
const firstSavePath = campaignSavePath(firstSave.id);
snapshot = adapter.snapshot();
requireEqual(snapshot[firstSavePath].payload.campaignState.player.name, 'Talia Renn', 'stored first save payload');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].activeSaveId, firstSave.id, 'save index active first save');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[firstSave.id].metadata.playerName, 'Talia Renn', 'save index metadata');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.storageIndex].files[firstSavePath].campaignId, 'campaign-storage-test', 'storage index save campaign id');

adapter.resetLog();
let saveList = await listCampaignSaves(adapter);
requireEqual(saveList.length, 1, 'list saves length');
requireEqual(saveList[0].id, firstSave.id, 'list saves id');
requireEqual(adapter.readLog, [DIRECTIVE_STORAGE_PATHS.saveIndex], 'list saves reads only index');

const branchSave = createCampaignSaveAsRecord(firstSave, {
  newSaveId: 'save-storage-branch',
  name: 'Talia Renn - Branch',
  savedAt: '2026-06-18T19:20:00.000Z'
});
await storeCampaignSave(adapter, branchSave);
snapshot = adapter.snapshot();
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].activeSaveId, branchSave.id, 'save as becomes active');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[firstSave.id].current, false, 'first save index not current after save as');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[branchSave.id].current, true, 'branch save index current');

const loadedCampaignState = await loadCampaignSaveFromStorage(adapter, firstSave.id, {
  now: '2026-06-18T19:25:00.000Z'
});
requireEqual(loadedCampaignState.player.name, 'Talia Renn', 'load campaign save state');
loadedCampaignState.player.name = 'Changed';
snapshot = adapter.snapshot();
requireEqual(snapshot[firstSavePath].payload.campaignState.player.name, 'Talia Renn', 'loaded campaign save clone isolation');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].activeSaveId, firstSave.id, 'load game marks active save');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[firstSave.id].current, true, 'loaded first save current');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[branchSave.id].current, false, 'branch save not current after load first');

firstSave = overwriteCampaignSaveRecord(firstSave, {
  campaignState: {
    ...campaignState,
    campaign: {
      ...campaignState.campaign,
      currentStardate: 53050.4
    }
  },
  packageData,
  savedAt: '2026-06-18T19:30:00.000Z',
  summary: 'Overwritten test save.'
});
await storeCampaignSave(adapter, firstSave);
snapshot = adapter.snapshot();
requireEqual(snapshot[firstSavePath].revision, 2, 'overwritten save payload revision');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[firstSave.id].metadata.stardate, 53050.4, 'overwritten save index stardate');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[firstSave.id].metadata.summary, 'Overwritten test save.', 'overwritten save index summary');

saveList = await listCampaignSaves(adapter);
requireIncludes(saveList.map((entry) => entry.id), firstSave.id, 'save list includes first');
requireIncludes(saveList.map((entry) => entry.id), branchSave.id, 'save list includes branch');

indexes = await getDirectiveStorageIndexes(adapter);
requireEqual(Object.keys(indexes.creatorDraftIndex.drafts).length, 1, 'final draft index count');
requireEqual(Object.keys(indexes.saveIndex.saves).length, 2, 'final save index count');

if (errors.length > 0) {
  console.error('Directive storage repository test failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Directive storage repository tests passed: indexed creator drafts and campaign saves');
