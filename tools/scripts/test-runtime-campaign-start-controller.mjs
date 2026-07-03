import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import {
  campaignSavePath,
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
    async deleteJsonFile(filePath) {
      files.delete(filePath);
      return { deleted: true, path: filePath };
    },
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([key, value]) => [key, cloneJson(value)]));
    }
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
assert.equal(saved.kind, 'directive.campaignSave');
assert.equal(saved.schemaVersion, 1);
assert.equal(saved.id, startedCampaign.firstSave.id);
assert.equal(saved.revision, 2);
assert.equal(saved.metadata.stardate, 53052.4);

let indexes = await getDirectiveStorageIndexes(adapter);
const savedPayloadPath = indexes.saveIndex.saves[saved.id].path;
const runtimeState = cloneJson(controller.activeCampaignState);
runtimeState.campaign.currentStardate = 53052.8;
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
let snapshot = adapter.snapshot();
assert.equal(snapshot[savedPayloadPath].revision, 2, 'runtime persist does not rewrite v1 checkpoint payload');
assert.equal(snapshot[savedPayloadPath].payload.campaignState.campaign.currentStardate, 53052.4, 'v1 checkpoint remains the explicit manual save');
indexes = await getDirectiveStorageIndexes(adapter);
assert.equal(indexes.saveIndex.saves[saved.id].path, savedPayloadPath, 'runtime v2 persist preserves v1 save index path');
assert.equal(indexes.saveIndex.saves[saved.id].runtimeStorageFormat, 'v2', 'runtime v2 persist marks runtime storage format');
assert.equal(Boolean(indexes.saveIndex.saves[saved.id].v2ManifestRef?.logicalKey), true, 'runtime v2 persist attaches manifest ref');
assert.equal(Boolean(indexes.saveIndex.saves[saved.id].v2RuntimePersistedAt), true, 'runtime v2 persist records a runtime persistence timestamp');

const autosaveAfterRuntimePersist = await controller.autosaveCurrentGame({
  saveId: 'save-runtime-autosave-proof',
  campaignState: controller.activeCampaignState,
  summary: 'Runtime controller autosave after v2 persist.',
  keep: 3
});
assert.equal(autosaveAfterRuntimePersist.save.kind, 'directive.activeCampaignStatePersist.v2', 'runtime autosave after v2 takeover writes a v2 autosave');
assert.equal(autosaveAfterRuntimePersist.save.storageFormat, 'v2');
assert.equal(autosaveAfterRuntimePersist.save.wroteV1Payload, false, 'runtime autosave after v2 takeover does not write a v1 payload');
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
assert.equal(Boolean(snapshot[campaignSavePath(autosaveAfterRuntimePersist.save.id)]), false, 'runtime autosave after v2 takeover does not create a v1 campaign save payload');
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
assert.equal(runtimeLoadedController.activeCampaignState.campaign.currentStardate, 53052.8, 'active recovery must use v2 runtime-current state when the save index has a v2 runtime bridge');
assert.equal(runtimeLoadedController.activeCampaignState.runtimeTracking.schemaVersion, 2, 'active recovery must rehydrate compact runtime resume state from the v2 runtime bridge');
assert.equal(runtimeLoadedController.activeCampaignState.runtimeTracking.ingressLedger.length, 0, 'active recovery must not rehydrate no-transaction ingress projections into old runtimeTracking');
assert.equal(runtimeLoadedController.activeCampaignState.directiveRuntimeEvidence?.coreStoreReadProjections?.ingressLedger, undefined, 'active recovery must not promote no-transaction ingress projections to CORE read evidence');
const runtimeLoaded = await runtimeLoadedController.loadGame({ saveId: saved.id });
assert.equal(runtimeLoaded.campaign.currentStardate, 53052.8, 'default load must use v2 runtime-current state when the save index has a v2 runtime bridge');
assert.equal(runtimeLoaded.runtimeTracking.schemaVersion, 2, 'default load must rehydrate compact runtime resume state from the active-save v2 bridge');
assert.equal(runtimeLoaded.runtimeTracking.ingressLedger.length, 0, 'default load must keep no-transaction ingress projections out of old runtimeTracking');
assert.equal(runtimeLoaded.directiveRuntimeEvidence?.coreStoreReadProjections?.ingressLedger, undefined, 'default load must not promote runtimeBridge-only ingress to CORE read evidence');
assert.equal(runtimeLoaded.runtimeTracking.history, undefined, 'default load must not restore raw runtime history snapshots from the stale v1 checkpoint');

const savedAfterRuntimePersist = await controller.saveCurrentGame({
  campaignState: controller.activeCampaignState,
  summary: 'Runtime controller manual checkpoint after v2 persist.'
});
assert.equal(savedAfterRuntimePersist.kind, 'directive.activeCampaignStatePersist.v2', 'manual save after v2 runtime persist keeps v2 authority');
assert.equal(savedAfterRuntimePersist.storageFormat, 'v2');
assert.equal(savedAfterRuntimePersist.wroteV1Payload, false, 'manual save after v2 runtime persist must not rewrite the v1 checkpoint payload');
snapshot = adapter.snapshot();
assert.equal(snapshot[savedPayloadPath].payload.campaignState.campaign.currentStardate, 53052.4, 'manual save after v2 runtime persist leaves the stale v1 checkpoint untouched');
indexes = await getDirectiveStorageIndexes(adapter);
assert.equal(indexes.saveIndex.saves[saved.id].runtimeStorageFormat, 'v2', 'manual save after v2 runtime persist preserves the runtime v2 marker');
assert.equal(Boolean(indexes.saveIndex.saves[saved.id].v2ManifestRef?.logicalKey), true, 'manual save after v2 runtime persist preserves the runtime v2 manifest ref');
assert.equal(Boolean(indexes.saveIndex.saves[saved.id].v2RuntimePersistedAt), true, 'manual save after v2 runtime persist keeps a runtime v2 timestamp');

const branch = await controller.saveCurrentGameAs({
  name: 'Talia Serrin - alternate first watch'
});
assert.equal(branch.kind, 'directive.activeCampaignStatePersist.v2', 'Save As after v2 runtime persist creates a v2-owned branch');
assert.equal(branch.storageFormat, 'v2');
assert.equal(branch.wroteV1Payload, false, 'Save As after v2 runtime persist must not create a v1 save payload');
assert.equal(branch.saveId, 'save-runtime-4');
assert.equal(branch.id, 'save-runtime-4');
assert.equal(branch.name, 'Talia Serrin - alternate first watch');
snapshot = adapter.snapshot();
indexes = await getDirectiveStorageIndexes(adapter);
assert.equal(indexes.saveIndex.saves[branch.saveId].storageFormat, 'v2', 'Save As branch index entry is v2-owned');
assert.equal(indexes.saveIndex.saves[branch.saveId].payloadKind, 'directive.saveManifest.v2', 'Save As branch index entry points at a v2 save manifest');
assert.equal(indexes.saveIndex.saves[branch.saveId].path, branch.saveManifestRef.logicalKey, 'Save As branch path is the v2 manifest');
assert.equal(Boolean(snapshot[savedPayloadPath.replace(saved.id, branch.saveId)]), false, 'Save As branch does not create a v1 campaign save payload');

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
assert.equal(recoveredController.storageDiagnostics.counts.saves, 3);
assert.equal(
  recoveredCampaign.saves.filter((entry) => entry.slotType === 'autosave').length,
  1,
  'recovered campaign view should include the explicit v2 autosave without treating it as active'
);
assert.equal(recoveredCampaign.activeSaveId, saved.id);

snapshot = adapter.snapshot();
assert.equal(
  snapshot[indexes.saveIndex.saves[saved.id].path].payload.campaignState.player.name,
  'Talia Serrin'
);
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

console.log('Runtime campaign start controller tests passed: Campaign view, creator draft, first save, save as, load, delete');
