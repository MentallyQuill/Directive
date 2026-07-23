import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import {
  DIRECTIVE_STORAGE_PATHS,
  getDirectiveStorageIndexes
} from '../../src/storage/directive-storage-repository.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryJsonAdapter() {
  const files = new Map();
  const writeLog = [];
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
      writeLog.push(filePath);
      files.set(filePath, cloneJson(value));
    },
    async deleteJsonFile(filePath) {
      files.delete(filePath);
      return { deleted: true, path: filePath };
    },
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([key, value]) => [key, cloneJson(value)]));
    },
    writeLog
  };
}

function createSequence(values) {
  let index = 0;
  return () => values[index++] || values.at(-1);
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const packageBefore = cloneJson(packageData);
const adapter = createMemoryJsonAdapter();
const ids = [];
const controller = createCampaignStartController({
  adapter,
  packages: [packageData],
  projections: [projection],
  idFactory(prefix) {
    const id = `${prefix}-runtime-${ids.length + 1}`;
    ids.push(id);
    return id;
  },
  now: createSequence([
    '2026-06-18T21:00:00.000Z',
    '2026-06-18T21:01:00.000Z',
    '2026-06-18T21:02:00.000Z',
    '2026-06-18T21:03:00.000Z',
    '2026-06-18T21:04:00.000Z',
    '2026-06-18T21:05:00.000Z',
    '2026-06-18T21:06:00.000Z',
    '2026-06-18T21:07:00.000Z',
    '2026-06-18T21:08:00.000Z',
    '2026-06-18T21:09:00.000Z',
    '2026-06-18T21:10:00.000Z',
    '2026-06-18T21:11:00.000Z',
    '2026-06-18T21:12:00.000Z',
    '2026-06-18T21:13:00.000Z'
  ])
});

let campaign = await controller.initialize();
assert.equal(campaign.kind, 'directive.campaignView');
assert.equal(campaign.packages.length, 1);
assert.equal(campaign.packages[0].packageId, packageData.manifest.id);
assert.equal(campaign.packages[0].title, packageData.manifest.title);
assert.ok(campaign.packages[0].assets.images.some((image) => (
  image.kind === 'ship.hero'
  && image.subjectId === packageData.ship.id
  && image.variants?.card === 'assets/packages/breckenridge/images/ship/uss-breckenridge.card.webp'
)), 'Campaign Library package summaries should carry passive ship image metadata');
assert.equal(campaign.packages[0].actions.startNewCampaign, true);
assert.equal(campaign.emptyState.noDrafts, true);
assert.equal(campaign.emptyState.noSaves, true);

const startedDraft = await controller.startCreatorDraft();
assert.equal(startedDraft.draft.id, 'creator-draft-runtime-1');
assert.equal(startedDraft.view.kind, 'directive.characterCreatorView');
assert.equal(startedDraft.view.role.lockedRole.rank, 'Commander');
assert.equal(startedDraft.view.role.lockedRole.billet, 'Executive Officer');
assert.deepEqual(startedDraft.view.steps.map((step) => step.id), ['identity', 'service', 'personality', 'review']);
assert.deepEqual(startedDraft.view.steps.map((step) => step.state), ['active', 'locked', 'locked', 'locked']);
assert.equal(startedDraft.view.canBeginCampaign, false);
assert.ok(startedDraft.view.options.allowedSpecies.some((option) => option.id === 'human'));

campaign = await controller.getCampaignView();
assert.equal(campaign.packages[0].actions.resumeDraft, null, 'empty in-progress draft should not be resumable');

let savedDraft = await controller.saveCreatorDraft({
  draftId: startedDraft.draft.id,
  reason: 'manualSave',
  patch: {
    activeStep: 'service',
    input: {
      identity: {
        name: 'Talia Serrin',
        pronounsOrAddress: 'she/her',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'A composed officer with a quiet voice and a habit of watching the room before speaking.'
      }
    }
  }
});
assert.equal(savedDraft.view.activeStep, 'service');
assert.equal(savedDraft.view.progress.identityComplete, true);
assert.equal(savedDraft.view.progress.hasMeaningfulInput, true);
assert.deepEqual(savedDraft.view.steps.map((step) => step.state), ['complete', 'active', 'locked', 'locked']);
assert.equal(savedDraft.view.canBeginCampaign, false);

campaign = await controller.getCampaignView();
assert.equal(campaign.packages[0].actions.resumeDraft, startedDraft.draft.id, 'meaningful in-progress draft should be resumable');

const resumedDraft = await controller.resumeCreatorDraft({ draftId: startedDraft.draft.id });
assert.equal(resumedDraft.view.input.identity.name, 'Talia Serrin');
assert.equal(resumedDraft.view.draft.revision, savedDraft.draft.revision);

savedDraft = await controller.saveCreatorDraft({
  draftId: startedDraft.draft.id,
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
        briefBiography: 'Talia Serrin is a tactical-minded Starfleet Commander whose Dominion War service taught her to weigh danger quickly without treating people as expendable. Her transfer to the Breckenridge gives the ship an executive officer who can translate urgency into discipline, but her impatience with vague political delays may strain postwar reconstruction work.',
        publicReputation: 'Talia Serrin is known as a decisive and observant officer whose restraint has improved since the war.'
      }
    }
  }
});
assert.equal(savedDraft.view.progress.readyForCampaignStart, true);
assert.equal(savedDraft.view.canBeginCampaign, true);

const startedCampaign = await controller.acceptCreatorDraftAndStartCampaign({
  draftId: startedDraft.draft.id,
  simulationMode: 'Exploration'
});
assert.equal(startedCampaign.acceptedDraft.status, 'accepted');
assert.equal(startedCampaign.campaignState.player.name, 'Talia Serrin');
assert.equal(startedCampaign.campaignState.settings.simulationMode, 'Exploration');
assert.equal(startedCampaign.firstSave.id, 'save-runtime-3');
assert.equal(controller.activeSaveId, startedCampaign.firstSave.id);
assert.equal(controller.activePackageId, packageData.manifest.id);

campaign = await controller.getCampaignView();
assert.equal(campaign.emptyState.noDrafts, false);
assert.equal(campaign.emptyState.noSaves, false);
assert.equal(campaign.packages[0].counts.drafts, 1);
assert.equal(campaign.packages[0].counts.saves, 1);
assert.equal(campaign.packages[0].actions.resumeDraft, null);
assert.equal(campaign.packages[0].actions.loadLatestSave, startedCampaign.firstSave.id);

const activeState = controller.activeCampaignState;
activeState.campaign.currentStardate = 53052.4;
activeState.commandLog.entries.push({
  id: 'runtime.test-entry',
  type: 'manualTest',
  summaryInputs: ['Talia Serrin reviewed the standing orders before the first watch.'],
  visibleConsequences: ['Runtime controller save point.']
});

const saved = await controller.saveCurrentGame({
  campaignState: activeState,
  summary: 'Runtime controller manual save.'
});
assert.equal(saved.kind, 'directive.activeCampaignStatePersist.v2', 'manual save after first-save v2 takeover keeps CORE/v2 authority');
assert.equal(saved.storageFormat, 'v2');
assert.equal(saved.wroteV1Payload, false, 'manual save is V2-native');
assert.equal(saved.id, startedCampaign.firstSave.id);
assert.equal(saved.saveId, startedCampaign.firstSave.id);

let indexes = await getDirectiveStorageIndexes(adapter);
const savedPayloadPath = indexes.saveIndex.saves[saved.id].path;
assert.equal(indexes.saveIndex.saves[saved.id].runtimeStorageFormat, 'v2', 'manual save keeps the active save on runtime v2 authority');
assert.equal(Boolean(indexes.saveIndex.saves[saved.id].v2ManifestRef?.logicalKey), true, 'manual save records the v2 manifest authority');
let snapshot = adapter.snapshot();
const manifestBeforeRuntime = cloneJson(snapshot[savedPayloadPath] || null);
const runtimeState = cloneJson(controller.activeCampaignState);
runtimeState.campaign.currentStardate = 53052.8;
runtimeState.campaignChatBinding = {
  hostId: 'fake-host',
  chatId: 'runtime-controller-chat',
  campaignId: runtimeState.campaign.id,
  saveId: saved.id,
  status: 'bound'
};
runtimeState.runtimeTracking = {
  ingressLedger: [{
    id: 'runtime-controller-ingress',
    hostMessageId: '12',
    textHash: 'hash-12',
    status: 'classified'
  }],
  responseLedger: [],
  recoveryJournal: [],
  history: [{
    snapshot: { rawRuntimeSnapshot: true }
  }]
};
const runtimePersist = await controller.persistRuntimeCampaignState({
  campaignState: runtimeState,
  summary: 'Runtime controller v2 persist.',
  reason: 'controller-test'
});
assert.equal(runtimePersist.storageFormat, 'v2');
assert.equal(runtimePersist.wroteV1Payload, false);
snapshot = adapter.snapshot();
assert.notDeepEqual(snapshot[savedPayloadPath] || null, manifestBeforeRuntime, 'runtime persist advances the active V2 manifest');
assert.equal(snapshot[savedPayloadPath].metadata.stardate, 53052.8, 'runtime persist updates the V2 manifest metadata');
indexes = await getDirectiveStorageIndexes(adapter);
assert.equal(indexes.saveIndex.saves[saved.id].path, savedPayloadPath, 'runtime V2 persist preserves the active manifest path');
assert.equal(indexes.saveIndex.saves[saved.id].runtimeStorageFormat, 'v2', 'runtime v2 persist marks runtime storage format');
assert.equal(Boolean(indexes.saveIndex.saves[saved.id].v2ManifestRef?.logicalKey), true, 'runtime v2 persist attaches manifest ref');
assert.equal(Boolean(indexes.saveIndex.saves[saved.id].v2RuntimePersistedAt), true, 'runtime v2 persist records a runtime persistence timestamp');

const hotRuntimePersistWriteStart = adapter.writeLog.length;
const hotRuntimeState = cloneJson(runtimeState);
hotRuntimeState.campaign.currentStardate = 53052.9;
const hotRuntimePersist = await controller.persistRuntimeCampaignState({
  campaignState: hotRuntimeState,
  summary: 'Runtime controller hot v2 persist without index rewrite.',
  reason: 'runtimePersist:background-save',
  markActive: false
});
assert.equal(hotRuntimePersist.storageFormat, 'v2');
assert.equal(hotRuntimePersist.saveIndexEntry.indexWriteSkipped, true, 'hot runtime persist should report deferred save-index update');
const hotRuntimePersistWrites = adapter.writeLog.slice(hotRuntimePersistWriteStart);
assert.equal(
  hotRuntimePersistWrites.includes(DIRECTIVE_STORAGE_PATHS.saveIndex),
  false,
  'hot runtime persist on an already-v2 save must not rewrite the full save index'
);
indexes = await getDirectiveStorageIndexes(adapter);
assert.equal(indexes.saveIndex.saves[saved.id].runtimeStorageFormat, 'v2', 'deferred hot persist keeps existing v2 marker in save index');

const autosaveAfterRuntimePersist = await controller.autosaveCurrentGame({
  saveId: 'save-runtime-autosave-proof',
  campaignState: controller.activeCampaignState,
  summary: 'Runtime controller autosave after v2 persist.',
  keep: 3
});
assert.equal(autosaveAfterRuntimePersist.save.kind, 'directive.activeCampaignStatePersist.v2', 'runtime autosave after v2 takeover writes a v2 autosave');
assert.equal(autosaveAfterRuntimePersist.save.storageFormat, 'v2');
assert.equal(autosaveAfterRuntimePersist.save.wroteV1Payload, false, 'runtime autosave is V2-native');
assert.equal(autosaveAfterRuntimePersist.save.saveIndexEntry.slotType, 'autosave');
indexes = await getDirectiveStorageIndexes(adapter);
const autosaveEntry = indexes.saveIndex.saves[autosaveAfterRuntimePersist.save.id];
assert.equal(autosaveEntry.slotType, 'autosave', 'autosave index entry remains on the autosave lane');
assert.equal(autosaveEntry.current, false, 'runtime autosave does not become the active save');
assert.equal(autosaveEntry.storageFormat, 'v2', 'autosave index entry is v2-owned after runtime takeover');
assert.equal(autosaveEntry.payloadKind, 'directive.saveManifest.v2', 'autosave index entry points at a v2 save manifest');
assert.equal(Boolean(autosaveEntry.manifestRef?.logicalKey), true, 'autosave index entry carries a v2 manifest ref');
assert.equal(indexes.saveIndex.activeSaveId, saved.id, 'runtime autosave does not move the active save pointer');
assert.equal(indexes.saveIndex.saves[saved.id].runtimeStorageFormat, 'v2', 'runtime autosave does not clear the active manual save v2 marker');
snapshot = adapter.snapshot();
assert.equal(snapshot[autosaveEntry.path].kind, 'directive.saveManifest.v2', 'autosave payload is a v2 save manifest');
const secondAutosaveAfterRuntimePersist = await controller.autosaveCurrentGame({
  saveId: 'save-runtime-autosave-prune-proof',
  campaignState: controller.activeCampaignState,
  summary: 'Runtime controller second v2 autosave.',
  keep: 1
});
indexes = await getDirectiveStorageIndexes(adapter);
snapshot = adapter.snapshot();
assert.equal(secondAutosaveAfterRuntimePersist.save.kind, 'directive.activeCampaignStatePersist.v2', 'second runtime autosave after v2 takeover writes a v2 autosave');
assert.equal(indexes.saveIndex.activeSaveId, saved.id, 'v2 autosave pruning does not move the active save pointer');
assert.equal(Boolean(indexes.saveIndex.saves[autosaveAfterRuntimePersist.save.id]), false, 'v2 autosave pruning removes the older autosave index entry');
assert.equal(Boolean(snapshot[autosaveEntry.path]), false, 'v2 autosave pruning deletes the older autosave manifest payload');
assert.equal(indexes.saveIndex.saves[secondAutosaveAfterRuntimePersist.save.id].slotType, 'autosave', 'v2 autosave pruning keeps the newest autosave');
assert.equal(indexes.saveIndex.saves[secondAutosaveAfterRuntimePersist.save.id].storageFormat, 'v2', 'newest autosave remains v2-owned after pruning');

const runtimeLoadedController = createCampaignStartController({
  adapter,
  packages: [packageData],
  projections: [projection],
  idFactory(prefix) {
    return `${prefix}-runtime-loaded`;
  },
  now: () => '2026-06-28T09:10:00.000Z'
});
await runtimeLoadedController.initialize();
assert.equal(runtimeLoadedController.activeCampaignState.campaign.currentStardate, 53052.9, 'active recovery must use latest v2 runtime-current state even when save-index manifest hash is stale');
assert.equal(runtimeLoadedController.activeCampaignState.runtimeTracking, undefined, 'active recovery must not restore transient runtime tracking');
assert.equal(runtimeLoadedController.activeCampaignState.directiveRuntimeEvidence?.coreStoreReadProjections?.ingressLedger, undefined, 'active recovery must not promote no-transaction ingress projections to CORE read evidence');
const runtimeLoaded = await runtimeLoadedController.loadGame({ saveId: saved.id });
assert.equal(runtimeLoaded.campaign.currentStardate, 53052.9, 'default load must use latest v2 runtime-current state even when save-index manifest hash is stale');
assert.equal(runtimeLoaded.runtimeTracking, undefined, 'default load must omit transient runtime tracking');
assert.equal(runtimeLoaded.directiveRuntimeEvidence?.coreStoreReadProjections?.ingressLedger, undefined, 'default load must not promote runtimeBridge-only ingress to CORE read evidence');

const savedAfterRuntimePersist = await controller.saveCurrentGame({
  campaignState: controller.activeCampaignState,
  summary: 'Runtime controller manual checkpoint after v2 persist.'
});
assert.equal(savedAfterRuntimePersist.kind, 'directive.activeCampaignStatePersist.v2', 'manual save after v2 runtime persist keeps v2 authority');
assert.equal(savedAfterRuntimePersist.storageFormat, 'v2');
assert.equal(savedAfterRuntimePersist.wroteV1Payload, false, 'manual save remains V2-native');
snapshot = adapter.snapshot();
assert.equal(snapshot[savedPayloadPath].metadata.stardate, 53052.8, 'manual save advances the active V2 manifest from controller state');
indexes = await getDirectiveStorageIndexes(adapter);
assert.equal(indexes.saveIndex.saves[saved.id].runtimeStorageFormat, 'v2', 'manual save after v2 runtime persist preserves the runtime v2 marker');
assert.equal(Boolean(indexes.saveIndex.saves[saved.id].v2ManifestRef?.logicalKey), true, 'manual save after v2 runtime persist preserves the runtime v2 manifest ref');
assert.equal(Boolean(indexes.saveIndex.saves[saved.id].v2RuntimePersistedAt), true, 'manual save after v2 runtime persist keeps a runtime v2 timestamp');

const loaded = await controller.loadGame({ saveId: saved.id });
assert.equal(loaded.player.name, 'Talia Serrin');
assert.equal(loaded.campaign.currentStardate, 53052.8);
loaded.player.name = 'Changed';
assert.equal(controller.activeCampaignState.player.name, 'Talia Serrin');

indexes = await getDirectiveStorageIndexes(adapter);
assert.equal(indexes.saveIndex.activeSaveId, saved.id);
assert.equal(indexes.creatorDraftIndex.drafts[startedDraft.draft.id].status, 'accepted');

const disposableDraft = await controller.startCreatorDraft();
const discardResult = await controller.discardCreatorDraft({ draftId: disposableDraft.draft.id });
assert.equal(discardResult.draftId, disposableDraft.draft.id);
indexes = await getDirectiveStorageIndexes(adapter);
assert.equal(Boolean(indexes.creatorDraftIndex.drafts[disposableDraft.draft.id]), false, 'discarded draft should leave the draft index');

const recoveredController = createCampaignStartController({
  adapter,
  packages: [packageData],
  projections: [projection],
  idFactory(prefix) {
    return `${prefix}-recovered-runtime`;
  },
  now: createSequence([
    '2026-06-18T21:20:00.000Z',
    '2026-06-18T21:21:00.000Z',
    '2026-06-18T21:22:00.000Z'
  ])
});
const recoveredCampaign = await recoveredController.initialize();
assert.equal(recoveredController.activeSaveId, saved.id);
assert.equal(recoveredController.activeCampaignState.player.name, 'Talia Serrin');
assert.equal(recoveredController.activeCampaignState.campaign.currentStardate, 53052.8);
assert.equal(recoveredController.storageDiagnostics.status, 'ok');
assert.equal(recoveredController.storageDiagnostics.counts.saves, 2);
assert.equal(
  recoveredCampaign.saves.filter((entry) => entry.slotType === 'autosave').length,
  1,
  'recovered campaign view should include the explicit v2 autosave without treating it as active'
);
assert.equal(recoveredCampaign.activeSaveId, saved.id);

assert.deepEqual(packageData, packageBefore, 'controller must not mutate bundled package data');

indexes = await getDirectiveStorageIndexes(adapter);
const activeSavePath = indexes.saveIndex.saves[saved.id].path;
const deletedActiveSave = await controller.deleteCampaignSave({ saveId: saved.id });
assert.equal(deletedActiveSave.saveId, saved.id);
assert.equal(deletedActiveSave.deleted, true);
assert.equal(deletedActiveSave.deletedActive, true);
assert.equal(controller.activeSaveId, null);
assert.equal(controller.activeCampaignState, null);
indexes = await getDirectiveStorageIndexes(adapter);
assert.equal(Boolean(indexes.saveIndex.saves[saved.id]), false, 'deleted active save leaves save index');
assert.equal(adapter.snapshot()[activeSavePath], undefined, 'deleted active save removes payload');

console.log('Runtime campaign start controller tests passed: Campaign view, creator draft, first save, v2 persistence, load, and delete');
