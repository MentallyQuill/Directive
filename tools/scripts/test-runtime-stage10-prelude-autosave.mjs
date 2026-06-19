import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { listCampaignSaves } from '../../src/storage/directive-storage-repository.mjs';

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
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
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

function outcomeFlagValue(campaignState, flagId) {
  return (campaignState.mission?.outcomeFlags || []).find((flag) => flag.id === flagId)?.value;
}

function clockValue(campaignState, clockId) {
  return (campaignState.clocks || []).find((clock) => clock.id === clockId)?.value;
}

function saveCounts(saves) {
  return {
    firstSave: saves.filter((save) => save.slotType === 'firstSave').length,
    autosave: saves.filter((save) => save.slotType === 'autosave').length,
    current: saves.filter((save) => save.current === true).length
  };
}

const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json');

const adapter = createMemoryJsonAdapter();
let idSequence = 0;
const app = createDirectiveRuntimeApp({
  adapter,
  packageLoader: async () => ({
    packages: [packageData],
    projections: [{
      path: 'packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json',
      projection
    }],
    crewDatasets: [{
      path: 'packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs: [{
      path: 'packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json',
      graph: missionGraph
    }]
  }),
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-stage10-${idSequence}`;
  },
  now: createSequence([
    '2026-06-19T00:00:00.000Z',
    '2026-06-19T00:01:00.000Z',
    '2026-06-19T00:02:00.000Z',
    '2026-06-19T00:03:00.000Z',
    '2026-06-19T00:04:00.000Z',
    '2026-06-19T00:05:00.000Z',
    '2026-06-19T00:06:00.000Z',
    '2026-06-19T00:07:00.000Z',
    '2026-06-19T00:08:00.000Z',
    '2026-06-19T00:09:00.000Z',
    '2026-06-19T00:10:00.000Z',
    '2026-06-19T00:11:00.000Z',
    '2026-06-19T00:12:00.000Z',
    '2026-06-19T00:13:00.000Z',
    '2026-06-19T00:14:00.000Z',
    '2026-06-19T00:15:00.000Z'
  ])
});

const narrator = {
  id: 'stage10-narrator',
  async generateNarration(request) {
    return {
      providerId: 'stage10-narrator',
      text: `Narrated ${request.sourceOutcomeId}.`
    };
  }
};

await app.initialize();
await app.startCreatorDraft({ packageId: packageData.manifest.id });
await app.saveCreatorDraft({
  reason: 'manualSave',
  patch: {
    activeStep: 'review',
    input: {
      identity: {
        name: 'Talia Serrin',
        pronounsOrAddress: 'she/her',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'A composed officer with a quiet voice and a habit of watching the room before speaking.'
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
      },
      dossier: {
        detailLevel: 'Standard',
        briefBiography: 'Talia Serrin is a tactical-minded Starfleet Commander whose Dominion War service taught her to make quick decisions without treating lives as expendable.',
        publicReputation: 'Talia Serrin is known as a decisive and observant officer whose restraint has improved since the war.'
      }
    }
  }
});
await app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });

let saves = await listCampaignSaves(adapter);
assert.deepEqual(saveCounts(saves), { firstSave: 1, autosave: 0, current: 1 });

const arrivalPreview = await app.previewDirectorTurn({
  turnId: 'turn.stage10.arrival.001',
  playerInput: 'I report aboard without interrupting the working transfer, ask Priya for live status and Bronn for the acting XO handoff, then report to Captain Whitaker once docking is complete.'
});
assert.equal(arrivalPreview.provisionalOutcome.resultBand, 'Success');
assert.equal(arrivalPreview.commandBearingPrompt.eligible, false);
assert.equal(arrivalPreview.campaignState.mission.activePhaseId, 'shuttle-rendezvous');

const arrivalCommit = await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});
assert.equal(arrivalCommit.narrationResult.ok, true);
assert.equal(arrivalCommit.autosave.ok, true);
assert.equal(arrivalCommit.campaignState.mission.activePhaseId, 'ready-room-handover');
assert.equal(arrivalCommit.campaignState.mission.availableDecisionPointIds[0], 'decision.handover-value');
assert.equal(outcomeFlagValue(arrivalCommit.campaignState, 'prelude.crew-integration'), 'deliberately-blended');
assert.equal(clockValue(arrivalCommit.campaignState, 'crew-integration-strain'), 1);
assert.equal(arrivalCommit.campaignState.mission.knownFacts.includes('ship.provisional-routines'), true);
assert.equal(arrivalCommit.campaignState.commandLog.entries.at(-1).summaryInputs.some((item) => /working transfer/.test(item)), true);

saves = await listCampaignSaves(adapter);
assert.deepEqual(saveCounts(saves), { firstSave: 1, autosave: 1, current: 1 });
assert.equal(saves.find((save) => save.slotType === 'autosave').current, false);
assert.equal(saves.find((save) => save.slotType === 'firstSave').current, true);

const handoverPreview = await app.previewDirectorTurn({
  turnId: 'turn.stage10.handover.001',
  playerInput: 'In the ready room I tell Whitaker that no life is expendable and the crew deserves the truth. I ask Bronn for the clean handoff details and define executive authority as clear recommendations, private disagreement, and public support for lawful final decisions.'
});
assert.equal(handoverPreview.provisionalOutcome.resultBand, 'Success');
assert.equal(handoverPreview.provisionalOutcome.revealedFactIds.includes('crew.transfer-cohort-tension'), true);

const handoverCommit = await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});
assert.equal(handoverCommit.campaignState.mission.activePhaseId, 'senior-readiness-conference');
assert.equal(handoverCommit.campaignState.mission.availableDecisionPointIds[0], 'decision.readiness-priorities');
assert.equal(outcomeFlagValue(handoverCommit.campaignState, 'prelude.whitaker'), 'delegation-confidence-improved');
assert.equal(outcomeFlagValue(handoverCommit.campaignState, 'prelude.bronn'), 'acting-service-respected');
assert.equal(clockValue(handoverCommit.campaignState, 'crew-integration-strain'), 0);

saves = await listCampaignSaves(adapter);
assert.deepEqual(saveCounts(saves), { firstSave: 1, autosave: 2, current: 1 });

for (let index = 0; index < 3; index += 1) {
  await app.previewDirectorTurn({
    turnId: `turn.stage10.readiness.${index + 1}`,
    playerInput: `I set readiness priority ${index + 1} with named owners, delegated follow-up, and an explicit accepted risk.`
  });
  await app.commitProvisionalDirectorTurn({
    provider: narrator,
    generateNarration: true
  });
}

saves = await listCampaignSaves(adapter);
const autosaves = saves.filter((save) => save.slotType === 'autosave');
assert.equal(autosaves.length, 3);
assert.equal(saves.find((save) => save.slotType === 'firstSave').current, true);
assert.equal(autosaves.every((save) => save.current === false), true);
assert.equal(autosaves.some((save) => save.id === arrivalCommit.autosave.save.id), false);
const snapshot = adapter.snapshot();
assert.equal(Object.values(snapshot).some((record) => record?.id === arrivalCommit.autosave.save.id), false);

console.log('Stage 10 Prelude/autosave tests passed: arrival and handover scenarios, phase advancement, stable autosaves, rolling cap');
