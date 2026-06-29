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
  deleteCampaignSaveFromStorage,
  deleteCharacterCreatorDraftFromStorage,
  DIRECTIVE_STORAGE_PATHS,
  diagnoseDirectiveStorage,
  getDirectiveStorageIndexes,
  initializeDirectiveStorage,
  listCampaignSaves,
  listCharacterCreatorDrafts,
  listImportedCampaignPackageRecords,
  loadCampaignSaveFromStorage,
  loadCharacterCreatorDraftFromStorage,
  loadImportedCampaignPackageRecord,
  pruneCampaignAutosaves,
  recoverActiveCampaignSave,
  storeCampaignSave,
  storeCampaignV2SaveManifestIndexEntry,
  storeCharacterCreatorDraft,
  storeImportedCampaignPackageRecord,
  campaignPackageImportPath
} from '../../src/storage/directive-storage-repository.mjs';
import {
  commitV2SaveLayout
} from '../../src/storage/transaction-store-v2.mjs';

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

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const adapter = createMemoryJsonAdapter();

requireEqual(DIRECTIVE_STORAGE_PATHS.storageIndex, 'system/storage-index.v1.json', 'storage index uses logical key');
requireEqual(DIRECTIVE_STORAGE_PATHS.creatorDraftIndex, 'indexes/character-creator-drafts.v1.json', 'draft index uses logical key');
requireEqual(DIRECTIVE_STORAGE_PATHS.campaignPackageImportIndex, 'indexes/campaign-package-imports.v1.json', 'package import index uses logical key');
requireEqual(DIRECTIVE_STORAGE_PATHS.saveIndex, 'indexes/saves.v1.json', 'save index uses logical key');
requireEqual(characterCreatorDraftPath('creator-draft-storage'), 'drafts/character-creator/creator-draft-storage.v1.json', 'draft payload uses logical key');
requireEqual(campaignPackageImportPath('package-import-storage'), 'packages/imports/package-import-storage.v1.json', 'package import payload uses logical key');
requireEqual(campaignSavePath('save-storage-first'), 'saves/save-storage-first.v1.json', 'save payload uses logical key');

await initializeDirectiveStorage(adapter, { now: '2026-06-18T19:00:00.000Z' });
let indexes = await getDirectiveStorageIndexes(adapter);
requireEqual(indexes.storageIndex.kind, 'directive.storageIndex', 'init storage index kind');
requireEqual(indexes.creatorDraftIndex.kind, 'directive.characterCreatorDraftIndex', 'init draft index kind');
requireEqual(indexes.campaignPackageImportIndex.kind, 'directive.campaignPackageImportIndex', 'init package import index kind');
requireEqual(indexes.saveIndex.kind, 'directive.saveIndex', 'init save index kind');

const importedPackage = await storeImportedCampaignPackageRecord(adapter, {
  kind: 'directive.importedCampaignPackageRecord',
  id: 'package-import-storage',
  sourceFileName: 'ashes-of-peace.directive-campaign.zip',
  importedAt: '2026-06-18T19:00:30.000Z',
  packagePath: 'package/ashes-of-peace.campaign-package.json',
  packageId: packageData.manifest.id,
  packageVersion: packageData.manifest.version,
  packageData,
  jsonPayloads: {
    'package/ashes-of-peace.campaign-package.json': packageData,
    'package/ashes-of-peace.campaign-projection.json': projection
  },
  assetPaths: [],
  diagnostics: {
    kind: 'directive.campaignPackageImportDiagnostics',
    sourceFileName: 'ashes-of-peace.directive-campaign.zip',
    status: 'ok',
    issues: []
  }
});
const packageImportPath = campaignPackageImportPath(importedPackage.id);
let snapshot = adapter.snapshot();
requireEqual(snapshot[packageImportPath].packageData.ship.name, 'U.S.S. Breckenridge', 'stored package import payload');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.campaignPackageImportIndex].imports[importedPackage.id].packageId, packageData.manifest.id, 'stored package import index package id');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.storageIndex].files[packageImportPath].kind, 'directive.importedCampaignPackageRecord', 'storage index package import file');

adapter.resetLog();
const importedPackages = await listImportedCampaignPackageRecords(adapter);
requireEqual(importedPackages.length, 1, 'list package imports length');
requireEqual(importedPackages[0].packageId, packageData.manifest.id, 'list package imports id');
requireEqual(adapter.readLog, [DIRECTIVE_STORAGE_PATHS.campaignPackageImportIndex, packageImportPath], 'list package imports reads index and payload');

const loadedPackageImport = await loadImportedCampaignPackageRecord(adapter, importedPackage.id);
loadedPackageImport.packageData.ship.name = 'Changed';
snapshot = adapter.snapshot();
requireEqual(snapshot[packageImportPath].packageData.ship.name, 'U.S.S. Breckenridge', 'loaded package import clone isolation');

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

const disposableDraft = createCharacterCreatorDraftRecord({
  packageData,
  draftId: 'creator-draft-discard-storage',
  createdAt: '2026-06-18T19:04:00.000Z'
});
await storeCharacterCreatorDraft(adapter, disposableDraft);
const disposableDraftPath = characterCreatorDraftPath(disposableDraft.id);
let discardDraftResult = await deleteCharacterCreatorDraftFromStorage(adapter, disposableDraft.id, {
  now: '2026-06-18T19:04:30.000Z'
});
snapshot = adapter.snapshot();
requireEqual(discardDraftResult.draftId, disposableDraft.id, 'discard draft result id');
requireEqual(discardDraftResult.path, disposableDraftPath, 'discard draft result path');
requireEqual(discardDraftResult.deleted, true, 'discard draft deletes payload when adapter supports delete');
requireEqual(Boolean(snapshot[DIRECTIVE_STORAGE_PATHS.creatorDraftIndex].drafts[disposableDraft.id]), false, 'discard draft removes draft index entry');
requireEqual(Boolean(snapshot[DIRECTIVE_STORAGE_PATHS.storageIndex].files[disposableDraftPath]), false, 'discard draft removes storage index entry');
requireEqual(Boolean(snapshot[disposableDraftPath]), false, 'discard draft removes payload');

discardDraftResult = await deleteCharacterCreatorDraftFromStorage(adapter, disposableDraft.id, {
  now: '2026-06-18T19:04:45.000Z'
});
requireEqual(discardDraftResult.indexed, false, 'discard missing draft reports not indexed');

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
      briefBiography: 'Talia Renn made her career in patient frontier diplomacy, where the right answer often arrived only after listening to local authorities, junior officers, and frightened civilians long enough to understand the real problem. She is experienced enough to command a room without raising her voice, but stubborn enough to keep pressing when a process feels unjust or incomplete. The Breckenridge assignment gives her a chance to turn that patience into practical command under Captain Whitaker.',
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
adapter.resetLog();
await storeCampaignSave(adapter, firstSave);
snapshot = adapter.snapshot();
requireEqual(snapshot[firstSavePath].revision, 2, 'overwritten save payload revision');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[firstSave.id].metadata.stardate, 53050.4, 'overwritten save index stardate');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[firstSave.id].metadata.summary, 'Overwritten test save.', 'overwritten save index summary');
requireEqual(adapter.writeLog, [
  firstSavePath,
  DIRECTIVE_STORAGE_PATHS.saveIndex
], 'overwriting an indexed save avoids redundant storage index upload');

const v2CampaignState = {
  ...campaignState,
  campaign: {
    ...campaignState.campaign,
    currentStardate: 53050.8
  },
  runtimeTracking: {
    history: [{ snapshot: { shouldNotBeInHead: true } }]
  }
};
const v2SaveId = 'save-storage-v2-active';
const v2Commit = await commitV2SaveLayout(adapter, {
  campaignId: v2CampaignState.campaign.id,
  saveId: v2SaveId,
  branchId: 'main',
  now: '2026-06-18T19:30:30.000Z',
  current: true,
  metadata: {
    campaignId: v2CampaignState.campaign.id,
    campaignTitle: v2CampaignState.campaign.title,
    packageId: packageData.manifest.id,
    packageTitle: packageData.manifest.title,
    packageVersion: packageData.manifest.version,
    playerName: v2CampaignState.player.name,
    stardate: v2CampaignState.campaign.currentStardate,
    lastUpdatedAt: '2026-06-18T19:30:30.000Z',
    summary: 'V2 active-save bridge test.'
  },
  head: {
    state: {
      campaign: v2CampaignState.campaign,
      player: v2CampaignState.player,
      activeCampaignPackage: v2CampaignState.activeCampaignPackage,
      campaignChatBinding: v2CampaignState.campaignChatBinding || null
    },
    excludesRuntimeJournals: true
  },
  hostMap: {
    excludesRawChatText: true,
    rows: [{ hostMessageId: '33', role: 'player', textHash: 'hash-33' }]
  },
  promptCache: {
    directiveOwnedRevision: 1,
    blocks: []
  },
  eventSegments: [[{
    id: 'v2-event-1',
    type: 'activeSaveBridge',
    summary: 'v2 manifest indexed without v1 save payload'
  }]],
  diagnosticsSegments: [[{
    id: 'v2-diagnostic-1',
    type: 'storageBridge',
    status: 'ok'
  }]]
});
const v2IndexEntry = await storeCampaignV2SaveManifestIndexEntry(adapter, {
  saveManifest: v2Commit.saveManifest,
  saveManifestRef: v2Commit.saveManifestRef,
  campaignState: v2CampaignState,
  packageData,
  name: 'Talia Renn - V2 Active',
  slotType: 'manual',
  summary: 'V2 active-save bridge test.',
  now: '2026-06-18T19:30:31.000Z'
});
snapshot = adapter.snapshot();
requireEqual(v2IndexEntry.storageFormat, 'v2', 'v2 save index storage format');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].activeSaveId, v2SaveId, 'v2 save index active save');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[firstSave.id].current, false, 'v1 first save no longer current after v2 active entry');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[v2SaveId].payloadKind, 'directive.saveManifest.v2', 'v2 save index payload kind');
requireEqual(Boolean(snapshot[campaignSavePath(v2SaveId)]), false, 'v2 save bridge does not create v1 save payload');
requireEqual(snapshot[v2IndexEntry.path].kind, 'directive.saveManifest.v2', 'v2 save index points to save manifest');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.storageIndex].files[v2IndexEntry.path].kind, 'directive.saveManifest.v2', 'storage index tracks v2 save manifest');

const v2Diagnostics = await diagnoseDirectiveStorage(adapter, {
  now: '2026-06-18T19:30:32.000Z',
  deepPayloadCheck: true
});
requireEqual(v2Diagnostics.status, 'ok', 'deep diagnostics accepts v2 indexed save manifest');
const loadedV2State = await loadCampaignSaveFromStorage(adapter, v2SaveId, {
  now: '2026-06-18T19:30:33.000Z'
});
requireEqual(loadedV2State.player.name, 'Talia Renn', 'load v2 save materialized head state');
requireEqual(loadedV2State.campaign.currentStardate, 53050.8, 'load v2 save materialized head stardate');
const recoveredV2 = await recoverActiveCampaignSave(adapter, {
  now: '2026-06-18T19:30:34.000Z'
});
requireEqual(recoveredV2.activeSaveId, v2SaveId, 'recover active v2 save id');
requireEqual(recoveredV2.storageFormat, 'v2', 'recover active v2 storage format');
requireEqual(recoveredV2.campaignState.player.name, 'Talia Renn', 'recover active v2 materialized state');
await loadCampaignSaveFromStorage(adapter, firstSave.id, {
  now: '2026-06-18T19:30:35.000Z'
});
snapshot = adapter.snapshot();
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].activeSaveId, firstSave.id, 'restore v1 first save active after v2 bridge test');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[v2SaveId].current, false, 'v2 save no longer current after restoring first save');

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

const branchSavePath = campaignSavePath(branchSave.id);
const deletedBranch = await deleteCampaignSaveFromStorage(adapter, branchSave.id, {
  now: '2026-06-18T19:35:45.000Z'
});
snapshot = adapter.snapshot();
requireEqual(deletedBranch.saveId, branchSave.id, 'delete save result id');
requireEqual(deletedBranch.path, branchSavePath, 'delete save result path');
requireEqual(deletedBranch.deleted, true, 'delete save removes payload when adapter supports delete');
requireEqual(deletedBranch.deletedActive, false, 'delete save leaves active save when deleting stored branch');
requireEqual(Boolean(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[branchSave.id]), false, 'delete save removes save index entry');
requireEqual(Boolean(snapshot[DIRECTIVE_STORAGE_PATHS.storageIndex].files[branchSavePath]), false, 'delete save removes storage index entry');
requireEqual(Boolean(snapshot[branchSavePath]), false, 'delete save removes payload');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].activeSaveId, firstSave.id, 'delete save preserves active save pointer');

adapter.deleteJson(firstSavePath);
const recovered = await recoverActiveCampaignSave(adapter, {
  now: '2026-06-18T19:35:50.000Z'
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
requireEqual(diagnostics.counts.saves, 5, 'diagnostics save count includes v2 indexed save');
requireEqual(diagnostics.counts.campaignPackageImports, 1, 'diagnostics package import count');
requireEqual(diagnostics.counts.payloadsChecked, 0, 'diagnostics avoids deep payload reads by default');
requireEqual(diagnostics.counts.payloadPathsVerified > 0, true, 'diagnostics verifies payload paths by default');

adapter.markCorrupt(draftPath);
adapter.resetLog();
diagnostics = await diagnoseDirectiveStorage(adapter, {
  now: '2026-06-18T19:37:00.000Z'
});
requireEqual(diagnostics.status, 'warning', 'default diagnostics does not parse corrupt payloads');
requireEqual(adapter.readLog.includes(draftPath), false, 'default diagnostics does not read draft payload');
requireEqual(adapter.readLog.some((entry) => entry.startsWith('saves/')), false, 'default diagnostics does not read save payloads');

diagnostics = await diagnoseDirectiveStorage(adapter, {
  now: '2026-06-18T19:37:05.000Z',
  deepPayloadCheck: true
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
requireEqual(Object.keys(indexes.campaignPackageImportIndex.imports).length, 1, 'final package import index count');
requireEqual(Object.keys(indexes.saveIndex.saves).length, 4, 'final save index count includes v2 indexed save');

if (errors.length > 0) {
  console.error('Directive storage repository test failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Directive storage repository tests passed: indexed creator drafts, campaign saves, autosave pruning, and diagnostics');
