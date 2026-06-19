import fs from 'node:fs';
import path from 'node:path';
import {
  acceptCharacterCreatorDraftRecord,
  createCharacterCreatorDraftRecord,
  saveCharacterCreatorDraftRecord
} from '../../src/creators/character-creator-draft.mjs';
import { createInitialCampaignStateFromCreatorReview } from '../../src/campaign/campaign-start.mjs';
import {
  createAutosaveCampaignSaveRecord,
  createCampaignSaveAsRecord,
  createFirstCampaignSaveRecord,
  overwriteCampaignSaveRecord
} from '../../src/storage/save-records.mjs';
import {
  campaignSavePath,
  characterCreatorDraftPath,
  cleanMissingStorageIndexRecords,
  DIRECTIVE_STORAGE_PATHS,
  diagnoseDirectiveStorage,
  getDirectiveStorageIndexes,
  initializeDirectiveStorage,
  listCampaignSaves,
  listCharacterCreatorDrafts,
  listImportedStarshipPackageRecords,
  loadCampaignSaveFromStorage,
  loadCharacterCreatorDraftFromStorage,
  loadImportedStarshipPackageRecord,
  pruneCampaignAutosaves,
  recoverActiveCampaignSave,
  storeCampaignSave,
  storeCharacterCreatorDraft,
  storeImportedStarshipPackageRecord,
  starshipPackageImportPath
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
  const corruptPaths = new Set();
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
    deleteJson(filePath) {
      files.delete(filePath);
    },
    markCorrupt(filePath) {
      corruptPaths.add(filePath);
    },
    clearCorrupt(filePath) {
      corruptPaths.delete(filePath);
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    },
    async readJson(filePath) {
      readLog.push(filePath);
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      if (corruptPaths.has(filePath)) {
        throw new Error(`Unexpected token in JSON at ${filePath}`);
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

requireEqual(DIRECTIVE_STORAGE_PATHS.storageIndex, 'system/storage-index.v1.json', 'storage index uses logical key');
requireEqual(DIRECTIVE_STORAGE_PATHS.creatorDraftIndex, 'indexes/character-creator-drafts.v1.json', 'draft index uses logical key');
requireEqual(DIRECTIVE_STORAGE_PATHS.starshipPackageImportIndex, 'indexes/starship-package-imports.v1.json', 'package import index uses logical key');
requireEqual(DIRECTIVE_STORAGE_PATHS.saveIndex, 'indexes/saves.v1.json', 'save index uses logical key');
requireEqual(characterCreatorDraftPath('creator-draft-storage'), 'drafts/character-creator/creator-draft-storage.v1.json', 'draft payload uses logical key');
requireEqual(starshipPackageImportPath('package-import-storage'), 'packages/imports/package-import-storage.v1.json', 'package import payload uses logical key');
requireEqual(campaignSavePath('save-storage-first'), 'saves/save-storage-first.v1.json', 'save payload uses logical key');

await initializeDirectiveStorage(adapter, { now: '2026-06-18T19:00:00.000Z' });
let indexes = await getDirectiveStorageIndexes(adapter);
requireEqual(indexes.storageIndex.kind, 'directive.storageIndex', 'init storage index kind');
requireEqual(indexes.creatorDraftIndex.kind, 'directive.characterCreatorDraftIndex', 'init draft index kind');
requireEqual(indexes.starshipPackageImportIndex.kind, 'directive.starshipPackageImportIndex', 'init package import index kind');
requireEqual(indexes.saveIndex.kind, 'directive.saveIndex', 'init save index kind');

const importedPackage = await storeImportedStarshipPackageRecord(adapter, {
  kind: 'directive.importedStarshipPackageRecord',
  id: 'package-import-storage',
  sourceFileName: 'ashes-of-peace.directive-starship.zip',
  importedAt: '2026-06-18T19:00:30.000Z',
  packagePath: 'package/ashes-of-peace.starship-package.json',
  packageId: packageData.manifest.id,
  packageVersion: packageData.manifest.version,
  packageData,
  jsonPayloads: {
    'package/ashes-of-peace.starship-package.json': packageData,
    'package/ashes-of-peace.campaign-projection.json': projection
  },
  assetPaths: [],
  diagnostics: {
    kind: 'directive.starshipPackageImportDiagnostics',
    sourceFileName: 'ashes-of-peace.directive-starship.zip',
    status: 'ok',
    issues: []
  }
});
const packageImportPath = starshipPackageImportPath(importedPackage.id);
let snapshot = adapter.snapshot();
requireEqual(snapshot[packageImportPath].packageData.ship.name, 'U.S.S. Breckinridge', 'stored package import payload');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.starshipPackageImportIndex].imports[importedPackage.id].packageId, packageData.manifest.id, 'stored package import index package id');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.storageIndex].files[packageImportPath].kind, 'directive.importedStarshipPackageRecord', 'storage index package import file');

adapter.resetLog();
const importedPackages = await listImportedStarshipPackageRecords(adapter);
requireEqual(importedPackages.length, 1, 'list package imports length');
requireEqual(importedPackages[0].packageId, packageData.manifest.id, 'list package imports id');
requireEqual(adapter.readLog, [DIRECTIVE_STORAGE_PATHS.starshipPackageImportIndex, packageImportPath], 'list package imports reads index and payload');

const loadedPackageImport = await loadImportedStarshipPackageRecord(adapter, importedPackage.id);
loadedPackageImport.packageData.ship.name = 'Changed';
snapshot = adapter.snapshot();
requireEqual(snapshot[packageImportPath].packageData.ship.name, 'U.S.S. Breckinridge', 'loaded package import clone isolation');

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
snapshot = adapter.snapshot();
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

const autosaves = [];
for (let index = 0; index < 4; index += 1) {
  const autosaveState = {
    ...campaignState,
    campaign: {
      ...campaignState.campaign,
      currentStardate: 53051 + index
    }
  };
  const autosave = createAutosaveCampaignSaveRecord({
    campaignState: autosaveState,
    packageData,
    saveId: `save-storage-autosave-${index + 1}`,
    savedAt: `2026-06-18T19:3${index + 1}:00.000Z`,
    summary: `Autosave ${index + 1}.`
  });
  autosaves.push(autosave);
  await storeCampaignSave(adapter, autosave);
}
snapshot = adapter.snapshot();
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[autosaves[0].id].current, false, 'autosave is not current');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].activeSaveId, firstSave.id, 'autosaves do not change active save');
const pruned = await pruneCampaignAutosaves(adapter, {
  campaignId: campaignState.campaign.id,
  keep: 3,
  now: '2026-06-18T19:35:30.000Z'
});
requireIncludes(pruned.removed.map((entry) => entry.id), autosaves[0].id, 'oldest autosave pruned');
snapshot = adapter.snapshot();
requireEqual(Boolean(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[autosaves[0].id]), false, 'oldest autosave removed from save index');
requireEqual(Boolean(snapshot[campaignSavePath(autosaves[0].id)]), false, 'oldest autosave payload deleted');

saveList = await listCampaignSaves(adapter);
requireIncludes(saveList.map((entry) => entry.id), firstSave.id, 'save list includes first');
requireIncludes(saveList.map((entry) => entry.id), branchSave.id, 'save list includes branch');

adapter.deleteJson(firstSavePath);
const recovered = await recoverActiveCampaignSave(adapter, {
  now: '2026-06-18T19:35:00.000Z'
});
requireEqual(recovered.activeSaveId, autosaves[3].id, 'active save recovery falls back to latest readable save');
requireEqual(recovered.campaignState.player.name, 'Talia Renn', 'active save recovery campaign state');
requireEqual(recovered.recovered, true, 'active save recovery reports repair');
snapshot = adapter.snapshot();
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].activeSaveId, autosaves[3].id, 'active save recovery repairs index pointer');

let diagnostics = await diagnoseDirectiveStorage(adapter, {
  now: '2026-06-18T19:36:00.000Z'
});
requireIncludes(diagnostics.issues.map((issue) => issue.code), 'payload-missing', 'diagnostics reports missing indexed payload');
requireEqual(diagnostics.counts.saves, 5, 'diagnostics save count');
requireEqual(diagnostics.counts.starshipPackageImports, 1, 'diagnostics package import count');

adapter.markCorrupt(draftPath);
diagnostics = await diagnoseDirectiveStorage(adapter, {
  now: '2026-06-18T19:37:00.000Z'
});
requireIncludes(diagnostics.issues.map((issue) => issue.code), 'payload-unreadable', 'diagnostics reports corrupt indexed payload');
requireEqual(diagnostics.status, 'error', 'diagnostics corrupt payload status');

const cleanup = await cleanMissingStorageIndexRecords(adapter, {
  now: '2026-06-18T19:37:30.000Z'
});
requireIncludes(cleanup.removed.map((entry) => entry.id), firstSave.id, 'cleanup removes missing first save index record');
requireIncludes(cleanup.retainedIssues.map((issue) => issue.code), 'payload-unreadable', 'cleanup retains corrupt payload issue');
snapshot = adapter.snapshot();
requireEqual(Boolean(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[firstSave.id]), false, 'cleanup removes missing save from save index');
requireEqual(Boolean(snapshot[DIRECTIVE_STORAGE_PATHS.storageIndex].files[firstSavePath]), false, 'cleanup removes missing save from storage index');
requireEqual(Boolean(snapshot[DIRECTIVE_STORAGE_PATHS.creatorDraftIndex].drafts[draft.id]), true, 'cleanup keeps corrupt draft indexed for diagnostics');
adapter.clearCorrupt(draftPath);

indexes = await getDirectiveStorageIndexes(adapter);
requireEqual(Object.keys(indexes.creatorDraftIndex.drafts).length, 1, 'final draft index count');
requireEqual(Object.keys(indexes.starshipPackageImportIndex.imports).length, 1, 'final package import index count');
requireEqual(Object.keys(indexes.saveIndex.saves).length, 4, 'final save index count');

if (errors.length > 0) {
  console.error('Directive storage repository test failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Directive storage repository tests passed: indexed creator drafts, campaign saves, autosave pruning, and diagnostics');
