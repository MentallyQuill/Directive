import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';

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
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

function createSequence(values) {
  let index = 0;
  return () => values[index++] || values.at(-1);
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.starship-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');
const fixture = readJson('tests/fixtures/mission/prelude-hesperus-fraud-director-loop.fixture.json');

function createApp(label) {
  let idSequence = 0;
  return createDirectiveRuntimeApp({
    adapter: createMemoryJsonAdapter(),
    packageLoader: async () => ({
      packages: [packageData],
      projections: [{
        path: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
        projection
      }],
      crewDatasets: [{
        path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
        dataset: crewDataset
      }],
      missionGraphs: [{
        path: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
        graph: missionGraph
      }]
    }),
    idFactory(prefix) {
      idSequence += 1;
      return `${prefix}-${label}-${idSequence}`;
    },
    now: createSequence([
      '2026-06-18T23:30:00.000Z',
      '2026-06-18T23:31:00.000Z',
      '2026-06-18T23:32:00.000Z',
      '2026-06-18T23:33:00.000Z',
      '2026-06-18T23:34:00.000Z',
      '2026-06-18T23:35:00.000Z',
      '2026-06-18T23:36:00.000Z'
    ])
  });
}

async function startCampaign(app) {
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
}

function hesperusOverrides() {
  const sceneSnapshot = fixture.input.sceneSnapshot;
  return {
    playerInput: sceneSnapshot.playerInput,
    sceneSnapshotOverrides: {
      activePhaseId: sceneSnapshot.activePhaseId,
      stardate: sceneSnapshot.stardate,
      locationId: sceneSnapshot.locationId,
      presentCharacters: sceneSnapshot.presentCharacters,
      knownFactIds: sceneSnapshot.knownFactIds,
      activeDecisionPointIds: sceneSnapshot.activeDecisionPointIds
    }
  };
}

const narrationProvider = {
  id: 'stage9-narrator',
  async generateNarration() {
    return {
      providerId: 'stage9-narrator',
      text: 'The Breckenridge protects the passengers, preserves the falsified inspection record, and logs the owner for formal inquiry.'
    };
  }
};

const app = createApp('stage9-spend');
await startCampaign(app);
await app.recoverCommandBearingPoint({
  recoveryId: 'stage9.resolve.recovery',
  track: 'Resolve'
});

const preview = await app.previewDirectorTurn({
  turnId: 'turn.stage9.hesperus.001',
  ...hesperusOverrides()
});
assert.equal(preview.provisionalOutcome.resultBand, 'Partial Success');
assert.equal(preview.commandBearingPrompt.eligible, true);
assert.equal(preview.commandBearingPrompt.actions.some((action) => action.track === 'resolve'), true);
assert.equal(preview.campaignState.mission.activePhaseId, 'shuttle-rendezvous');
assert.equal(preview.view.pendingDirectorTurn.outcomePacket.id, 'outcome.stage9.hesperus.001');

const committed = await app.commitProvisionalDirectorTurn({
  spendTrack: 'resolve',
  generateNarration: true,
  provider: narrationProvider
});
assert.equal(committed.turnPacket.provisionalOutcome.resultBand, 'Partial Success');
assert.equal(committed.turnPacket.finalOutcome.resultBand, 'Great Success');
assert.equal(committed.turnPacket.outcomePacket.resultBand, 'Great Success');
assert.equal(committed.turnPacket.narratorPacket.constraints.some((constraint) => /anchored consequences/.test(constraint)), true);
assert.equal(committed.commandBearingSpend.track, 'resolve');
assert.equal(committed.commandBearingSpend.from, 'Partial Success');
assert.equal(committed.commandBearingSpend.to, 'Great Success');
assert.equal(committed.narrationResult.ok, true);
assert.equal(committed.view.pendingDirectorTurn, null);
assert.equal(committed.campaignState.mission.activePhaseId, 'hesperus-aftermath');
assert.equal(committed.campaignState.commandStyle.resolve.points, 0);
assert.equal(committed.campaignState.commandStyle.resolve.marks, 1);
assert.deepEqual(committed.campaignState.commandStyle.spendLedger['outcome.stage9.hesperus.001'], {
  track: 'resolve',
  from: 'Partial Success',
  to: 'Great Success',
  rationale: 'The player used lawful authority, evidence custody, deadlines, and clear consequences proportionately while prioritizing passenger safety.'
});
const spentLedgerEntry = committed.campaignState.turnLedger.entries.at(-1);
assert.equal(spentLedgerEntry.resultBand, 'Great Success');
assert.equal(spentLedgerEntry.provisionalResultBand, 'Partial Success');
assert.equal(spentLedgerEntry.finalResultBand, 'Great Success');
assert.equal(spentLedgerEntry.commandBearingSpend.track, 'resolve');
assert.equal(spentLedgerEntry.narrationStatus, 'complete');

const retryApp = createApp('stage9-retry');
await startCampaign(retryApp);
await retryApp.previewDirectorTurn({
  turnId: 'turn.stage9.hesperus.retry',
  ...hesperusOverrides()
});
const failedCommit = await retryApp.commitProvisionalDirectorTurn({
  generateNarration: true,
  provider: {
    id: 'stage9-failing-narrator',
    async generateNarration() {
      throw new Error('provider unavailable');
    }
  }
});
assert.equal(failedCommit.narrationResult.ok, false);
assert.equal(failedCommit.campaignState.turnLedger.pendingNarrationRecovery.outcomeId, 'outcome.stage9.hesperus.retry');
assert.equal(failedCommit.campaignState.turnLedger.entries.at(-1).narrationStatus, 'failed');
const mechanicalBeforeRetry = JSON.stringify({
  mission: failedCommit.campaignState.mission,
  clocks: failedCommit.campaignState.clocks,
  commandStyle: failedCommit.campaignState.commandStyle,
  relationships: failedCommit.campaignState.relationships,
  commandLog: failedCommit.campaignState.commandLog
});
const retry = await retryApp.retryNarrationForLastTurn({ provider: narrationProvider });
assert.equal(retry.ok, true);
assert.equal(retry.campaignState.turnLedger.entries.length, failedCommit.campaignState.turnLedger.entries.length);
assert.equal(retry.campaignState.turnLedger.entries.at(-1).outcomeId, 'outcome.stage9.hesperus.retry');
assert.equal(retry.campaignState.turnLedger.pendingNarrationRecovery, null);
assert.equal(JSON.stringify({
  mission: retry.campaignState.mission,
  clocks: retry.campaignState.clocks,
  commandStyle: retry.campaignState.commandStyle,
  relationships: retry.campaignState.relationships,
  commandLog: retry.campaignState.commandLog
}), mechanicalBeforeRetry);

console.log('Stage 9 runtime turn loop tests passed: provisional outcome, Command Bearing spend, final commit, narration failure retry');
