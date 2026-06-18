import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCampaignStartController } from '../../src/runtime/campaign-start-controller.mjs';
import { getDirectiveStorageIndexes } from '../../src/storage/directive-storage-repository.mjs';

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
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([key, value]) => [key, cloneJson(value)]));
    }
  };
}

function createSequence(values) {
  let index = 0;
  return () => values[index++] || values.at(-1);
}

const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
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
    '2026-06-18T21:10:00.000Z'
  ])
});

let starships = await controller.initialize();
assert.equal(starships.kind, 'directive.starshipsView');
assert.equal(starships.packages.length, 1);
assert.equal(starships.packages[0].packageId, packageData.manifest.id);
assert.equal(starships.packages[0].title, packageData.manifest.title);
assert.equal(starships.packages[0].actions.startNewCampaign, true);
assert.equal(starships.emptyState.noDrafts, true);
assert.equal(starships.emptyState.noSaves, true);

const startedDraft = await controller.startCreatorDraft();
assert.equal(startedDraft.draft.id, 'creator-draft-runtime-1');
assert.equal(startedDraft.view.kind, 'directive.characterCreatorView');
assert.equal(startedDraft.view.role.lockedRole.rank, 'Commander');
assert.equal(startedDraft.view.role.lockedRole.billet, 'Executive Officer');
assert.deepEqual(startedDraft.view.steps.map((step) => step.id), ['identity', 'service', 'personality', 'review']);
assert.equal(startedDraft.view.canBeginCampaign, false);
assert.ok(startedDraft.view.options.allowedSpecies.some((option) => option.id === 'human'));

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
assert.equal(savedDraft.view.canBeginCampaign, false);

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
        briefBiography: 'Talia Serrin is a tactical-minded Starfleet Commander whose Dominion War service taught her to weigh danger quickly without treating people as expendable. Her transfer to the Breckinridge gives the ship an executive officer who can translate urgency into discipline, but her impatience with vague political delays may strain postwar reconstruction work.',
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

starships = await controller.getStarshipsView();
assert.equal(starships.emptyState.noDrafts, false);
assert.equal(starships.emptyState.noSaves, false);
assert.equal(starships.packages[0].counts.drafts, 1);
assert.equal(starships.packages[0].counts.saves, 1);
assert.equal(starships.packages[0].actions.resumeDraft, null);
assert.equal(starships.packages[0].actions.loadLatestSave, startedCampaign.firstSave.id);

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
assert.equal(saved.id, startedCampaign.firstSave.id);
assert.equal(saved.revision, 2);
assert.equal(saved.metadata.stardate, 53052.4);

const branch = await controller.saveCurrentGameAs({
  name: 'Talia Serrin - alternate first watch'
});
assert.equal(branch.id, 'save-runtime-4');
assert.equal(branch.name, 'Talia Serrin - alternate first watch');

const loaded = await controller.loadGame({ saveId: saved.id });
assert.equal(loaded.player.name, 'Talia Serrin');
assert.equal(loaded.campaign.currentStardate, 53052.4);
loaded.player.name = 'Changed';
assert.equal(controller.activeCampaignState.player.name, 'Talia Serrin');

const indexes = await getDirectiveStorageIndexes(adapter);
assert.equal(indexes.saveIndex.activeSaveId, saved.id);
assert.equal(indexes.creatorDraftIndex.drafts[startedDraft.draft.id].status, 'accepted');

const snapshot = adapter.snapshot();
assert.equal(
  snapshot[indexes.saveIndex.saves[saved.id].path].payload.campaignState.player.name,
  'Talia Serrin'
);
assert.deepEqual(packageData, packageBefore, 'controller must not mutate bundled package data');

console.log('Runtime campaign start controller tests passed: Starships view, creator draft, first save, save as, load');
