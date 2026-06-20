import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function createSequence(values) {
  let index = 0;
  return () => values[index++] || values.at(-1);
}

const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json');
const fixture = readJson('tests/fixtures/mission/prelude-hesperus-fraud-director-loop.fixture.json');

async function loadRuntimeAssets() {
  return {
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
  };
}

const host = createFakeDirectiveHost({
  generationOptions: {
    responses: {
      commandLogSummarizer: {
        providerId: 'fake-host-summary',
        model: 'fake-low-cost-utility',
        text: JSON.stringify({
          sourceOutcomeId: 'outcome.host-injection.hesperus.001',
          title: 'Hesperus protected',
          summary: 'The Breckinridge protected the Hesperus passengers while preserving the falsified record for formal inquiry.'
        })
      },
      narration: {
        providerId: 'fake-host-narrator',
        text: 'The Breckinridge accepts the delay, protects the passengers, and preserves the falsified record for formal inquiry.'
      }
    }
  }
});

let idSequence = 0;
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: loadRuntimeAssets,
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-host-injection-${idSequence}`;
  },
  now: createSequence([
    '2026-06-19T16:00:00.000Z',
    '2026-06-19T16:01:00.000Z',
    '2026-06-19T16:02:00.000Z',
    '2026-06-19T16:03:00.000Z',
    '2026-06-19T16:04:00.000Z'
  ])
});

const initialView = await app.initialize();
assert.equal(initialView.host.id, 'fake');
assert.equal(initialView.host.capabilities.generation.batchConcurrent, true);

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

const sceneSnapshot = fixture.input.sceneSnapshot;
const turn = await app.runDirectorTurn({
  turnId: 'turn.host-injection.hesperus.001',
  playerInput: sceneSnapshot.playerInput,
  sceneSnapshotOverrides: {
    activePhaseId: sceneSnapshot.activePhaseId,
    stardate: sceneSnapshot.stardate,
    locationId: sceneSnapshot.locationId,
    presentCharacters: sceneSnapshot.presentCharacters,
    knownFactIds: sceneSnapshot.knownFactIds,
    activeDecisionPointIds: sceneSnapshot.activeDecisionPointIds
  }
});
assert.equal(turn.view.host.id, 'fake');
assert.equal(turn.turnPacket.outcomePacket.resultBand, 'Partial Success');
assert.equal(turn.commandLogSummaryResult.ok, true);
assert.equal(
  turn.campaignState.commandLog.entries.at(-1).assistedSummary.summary,
  'The Breckinridge protected the Hesperus passengers while preserving the falsified record for formal inquiry.'
);

const narration = await app.generateNarrationForLastTurn();
assert.equal(narration.ok, true);
assert.equal(narration.narration.providerId, 'fake-host-narrator');
assert.equal(host.generation.calls()[0].role, 'commandLogSummarizer');
assert.equal(host.generation.calls()[0].request.role.id, 'commandLogSummarizer');
assert.equal(host.generation.calls()[0].request.modelPreferences.cost, 'low');
assert.equal(host.generation.calls()[1].role, 'narration');
assert.equal(host.generation.calls()[1].request.role.id, 'narration');
assert.equal(narration.view.host.id, 'fake');

const noSummaryHost = createFakeDirectiveHost({
  generationOptions: {
    responses: {
      narration: {
        providerId: 'fake-host-narrator',
        text: 'The Breckinridge accepts the delay without running a command-log summary sidecar.'
      }
    }
  }
});
let noSummaryIdSequence = 0;
const noSummaryApp = createDirectiveRuntimeApp({
  host: noSummaryHost,
  packageLoader: loadRuntimeAssets,
  idFactory(prefix) {
    noSummaryIdSequence += 1;
    return `${prefix}-no-summary-${noSummaryIdSequence}`;
  },
  now: createSequence([
    '2026-06-19T17:00:00.000Z',
    '2026-06-19T17:01:00.000Z',
    '2026-06-19T17:02:00.000Z',
    '2026-06-19T17:03:00.000Z',
    '2026-06-19T17:04:00.000Z'
  ])
});
await noSummaryApp.initialize();
await noSummaryApp.startCreatorDraft({ packageId: packageData.manifest.id });
await noSummaryApp.saveCreatorDraft({
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
await noSummaryApp.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
const noSummaryTurn = await noSummaryApp.runDirectorTurn({
  turnId: 'turn.host-injection.no-summary.001',
  playerInput: sceneSnapshot.playerInput,
  generateCommandLogSummary: false,
  sceneSnapshotOverrides: {
    activePhaseId: sceneSnapshot.activePhaseId,
    stardate: sceneSnapshot.stardate,
    locationId: sceneSnapshot.locationId,
    presentCharacters: sceneSnapshot.presentCharacters,
    knownFactIds: sceneSnapshot.knownFactIds,
    activeDecisionPointIds: sceneSnapshot.activeDecisionPointIds
  }
});
assert.equal(noSummaryTurn.commandLogSummaryResult, null);
assert.equal(noSummaryHost.generation.calls().length, 0);
assert.equal(noSummaryTurn.campaignState.commandLog.entries.at(-1).assistedSummary, undefined);
const noSummaryNarration = await noSummaryApp.generateNarrationForLastTurn();
assert.equal(noSummaryNarration.ok, true);
assert.equal(noSummaryHost.generation.calls().length, 1);
assert.equal(noSummaryHost.generation.calls()[0].role, 'narration');

console.log('Runtime host injection tests passed: host metadata, Command Log summary sidecar, no-generation summary suppression, and narration');
