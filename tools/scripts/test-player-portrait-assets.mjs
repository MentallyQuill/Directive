import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import { createPlayerPortraitUpload } from '../../src/media/player-portrait-assets.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import {
  deletePlayerPortraitAsset,
  getDirectiveStorageIndexes,
  listCharacterCreatorDrafts,
  storePlayerPortraitAsset
} from '../../src/storage/directive-storage-repository.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createSequence(values) {
  let index = 0;
  return () => values[index++] || values.at(-1);
}

function createMediaMemoryAdapter() {
  const jsonFiles = new Map();
  const mediaFiles = new Map();
  return {
    async readJson(filePath) {
      if (!jsonFiles.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(jsonFiles.get(filePath));
    },
    async writeJson(filePath, value) {
      jsonFiles.set(filePath, cloneJson(value));
    },
    async verifyJsonFiles(paths = []) {
      return Object.fromEntries(paths.map((filePath) => [filePath, jsonFiles.has(filePath)]));
    },
    async deleteJsonFile(filePath) {
      return { ok: jsonFiles.delete(filePath), path: filePath };
    },
    async writeBase64File(fileName, base64Data) {
      const pathName = `/user/files/${fileName}`;
      mediaFiles.set(pathName, String(base64Data || ''));
      return { path: pathName, fileName };
    },
    async verifyFiles(paths = []) {
      return Object.fromEntries(paths.map((filePath) => [filePath, mediaFiles.has(filePath)]));
    },
    async deleteFile(filePath) {
      return { ok: mediaFiles.delete(filePath), path: filePath };
    },
    mediaSnapshot() {
      return new Map(mediaFiles);
    }
  };
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');
const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

const adapter = createMediaMemoryAdapter();
const upload = await createPlayerPortraitUpload({
  bytes: pngBytes,
  mimeType: 'image/png',
  fileName: 'portrait.png',
  ownerKind: 'creatorDraft',
  ownerId: 'draft-portrait-test',
  now: '2026-06-22T12:00:00.000Z'
});
assert.equal(upload.kind, 'directive.playerPortraitUpload');
assert.match(upload.fileName, /^directive-player-portrait-creatordraft-draft-portrait-test-/);
assert.equal(upload.descriptor.asset.mimeType, 'image/png');
assert.equal(upload.descriptor.asset.fit, 'cover');

const stored = await storePlayerPortraitAsset(adapter, upload, {
  ownerKind: 'creatorDraft',
  ownerId: 'draft-portrait-test',
  now: '2026-06-22T12:00:01.000Z'
});
assert.match(stored.asset.path, /^\/user\/files\/directive-player-portrait-/);
let indexes = await getDirectiveStorageIndexes(adapter);
assert.equal(indexes.storageIndex.files[stored.asset.path].kind, 'directive.playerPortraitAsset');
assert.equal(indexes.storageIndex.files[stored.asset.path].ownerId, 'draft-portrait-test');
const deleted = await deletePlayerPortraitAsset(adapter, stored, {
  now: '2026-06-22T12:00:02.000Z'
});
assert.equal(deleted.indexed, true);
assert.equal(adapter.mediaSnapshot().has(stored.asset.path), false);

let idSequence = 0;
const host = createFakeDirectiveHost({
  chatNative: true,
  storage: adapter,
  chatOptions: {
    chatId: 'portrait-pre-campaign-chat',
    entityName: 'Captain Whitaker'
  }
});
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => ({
    packages: [packageData],
    projections: [{ path: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json', projection }],
    crewDatasets: [{ path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json', dataset: crewDataset }],
    missionGraphs: [{ path: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json', graph: missionGraph }]
  }),
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-portrait-${idSequence}`;
  },
  now: createSequence([
    '2026-06-22T12:01:00.000Z',
    '2026-06-22T12:01:01.000Z',
    '2026-06-22T12:01:02.000Z',
    '2026-06-22T12:01:03.000Z',
    '2026-06-22T12:01:04.000Z',
    '2026-06-22T12:01:05.000Z',
    '2026-06-22T12:01:06.000Z',
    '2026-06-22T12:01:07.000Z',
    '2026-06-22T12:01:08.000Z',
    '2026-06-22T12:01:09.000Z',
    '2026-06-22T12:01:10.000Z'
  ])
});

await app.initialize();
let view = await app.startCreatorDraft({ packageId: packageData.manifest.id });
assert.equal(view.media.playerPortraitImportSupported, true);
const creatorImport = await app.importCreatorPortrait({
  bytes: pngBytes,
  mimeType: 'image/png',
  fileName: 'creator.png'
});
assert.equal(creatorImport.portrait.owner.kind, 'creatorDraft');
assert.match(creatorImport.portrait.asset.path, /^\/user\/files\//);
let drafts = await listCharacterCreatorDrafts(adapter);
assert.equal(drafts[0].progress.hasMeaningfulInput, true);

const removedCreator = await app.removeCreatorPortrait();
assert.equal(removedCreator.portrait, null);
assert.equal(adapter.mediaSnapshot().has(creatorImport.portrait.asset.path), false);

const secondImport = await app.importCreatorPortrait({
  bytes: pngBytes,
  mimeType: 'image/png',
  fileName: 'creator-again.png'
});
await app.saveCreatorDraft({
  reason: 'portraitAcceptanceSetup',
  patch: {
    activeStep: 'review',
    input: {
      identity: {
        name: 'Talia Serrin',
        pronounsOrAddress: 'she/her',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'A composed officer with a quiet voice.'
      },
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
      }
    }
  }
});
view = await app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
assert.equal(view.campaignState.player.portrait.owner.kind, 'campaign');
assert.equal(view.campaignState.player.portrait.owner.subjectId, 'player-commander');
assert.equal(view.campaignState.player.portrait.asset.path, secondImport.portrait.asset.path);

const campaignImport = await app.importPlayerPortrait({
  bytes: pngBytes,
  mimeType: 'image/png',
  fileName: 'campaign.png'
});
assert.equal(campaignImport.portrait.owner.kind, 'campaign');
assert.notEqual(campaignImport.portrait.asset.path, secondImport.portrait.asset.path);
assert.equal(adapter.mediaSnapshot().has(secondImport.portrait.asset.path), false);

const campaignRemove = await app.removePlayerPortrait();
assert.equal(campaignRemove.portrait, null);
assert.equal(adapter.mediaSnapshot().has(campaignImport.portrait.asset.path), false);

indexes = await getDirectiveStorageIndexes(adapter);
const portraitEntries = Object.values(indexes.storageIndex.files).filter((entry) => entry.kind === 'directive.playerPortraitAsset');
assert.equal(portraitEntries.length, 0);

console.log('Player portrait asset tests passed: upload validation, storage indexing, creator import, campaign carry-forward, and crew-time updates');
