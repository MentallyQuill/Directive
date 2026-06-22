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
    async deleteJsonFile(filePath) {
      files.delete(filePath);
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

function clockValue(campaignState, clockId) {
  return (campaignState.clocks || []).find((clock) => clock.id === clockId)?.value;
}

function latestCommandCulture(campaignState) {
  return campaignState.commandCulture?.tendencies?.at(-1) || null;
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');

let idSequence = 0;
const app = createDirectiveRuntimeApp({
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
    return `${prefix}-stage13-${idSequence}`;
  },
  now: createSequence([
    '2026-06-19T03:00:00.000Z',
    '2026-06-19T03:01:00.000Z',
    '2026-06-19T03:02:00.000Z',
    '2026-06-19T03:03:00.000Z',
    '2026-06-19T03:04:00.000Z',
    '2026-06-19T03:05:00.000Z',
    '2026-06-19T03:06:00.000Z',
    '2026-06-19T03:07:00.000Z',
    '2026-06-19T03:08:00.000Z',
    '2026-06-19T03:09:00.000Z',
    '2026-06-19T03:10:00.000Z',
    '2026-06-19T03:11:00.000Z',
    '2026-06-19T03:12:00.000Z',
    '2026-06-19T03:13:00.000Z'
  ])
});

const narrator = {
  id: 'stage13-narrator',
  async generateNarration(request) {
    return {
      providerId: 'stage13-narrator',
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

await app.previewDirectorTurn({
  turnId: 'turn.stage13.arrival.001',
  playerInput: 'I report aboard without interrupting the working transfer, ask Priya for live status and Bronn for the acting XO handoff, then report to Captain Whitaker once docking is complete.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage13.handover.001',
  playerInput: 'In the ready room I tell Whitaker that no life is expendable and the crew deserves the truth. I ask Bronn for the clean handoff details and define executive authority as clear recommendations, private disagreement, and public support for lawful final decisions.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage13.readiness.001',
  playerInput: 'I set the readiness priorities in sequence: Priya owns schedule coordination and exception routing, Imani gets protected repair and documentation time before the combined-load test, Miriam sets medical fatigue restrictions, Rowan defines the sensor threshold for interrupting the schedule, and Kieran gets a bounded flight profile. We accept the remaining combined-load risk explicitly and defer noncritical polish until after the fallback-command drill.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage13.fallback.001',
  playerInput: 'Use Bronn\'s failure conditions to standardize one shipwide fallback-command procedure. Run a cross-department walkthrough, have Priya route the command-network certificate exception into accountable remediation, and assign Imani to patch and audit the older auxiliary-control identity before the combined-load test.'
});
const fallbackCommit = await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });
assert.equal(fallbackCommit.campaignState.mission.activePhaseId, 'command-rhythm-scenes');
assert.equal(clockValue(fallbackCommit.campaignState, 'crew-integration-strain'), 0);

const rhythmPreview = await app.previewDirectorTurn({
  turnId: 'turn.stage13.rhythm.001',
  playerInput: 'I hold focused follow-ups with Priya, Bronn, and Imani instead of another all-hands meeting. Priya owns routine coordination check-ins, Bronn is told to bring failure-condition objections before command closes debate, and Imani gets a standing expectation to escalate technical debt thresholds. I invite pushback, set clear boundaries for dissent, and assign follow-up owners.'
});
assert.equal(rhythmPreview.provisionalOutcome.resultBand, 'Success');
assert.equal(rhythmPreview.commandBearingPrompt.eligible, false);

const rhythmCommit = await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});
assert.equal(rhythmCommit.narrationResult.ok, true);
assert.equal(rhythmCommit.autosave.ok, true);
assert.equal(rhythmCommit.campaignState.mission.activePhaseId, 'hesperus-diversion');
assert.deepEqual(rhythmCommit.campaignState.mission.availableDecisionPointIds, [
  'decision.hesperus-response',
  'decision.inspection-fraud-accountability'
]);
assert.equal(clockValue(rhythmCommit.campaignState, 'crew-integration-strain'), 0);
assert.equal(latestCommandCulture(rhythmCommit.campaignState).tendency, 'bounded-dissent');
assert.deepEqual(latestCommandCulture(rhythmCommit.campaignState).contactedOfficerIds, [
  'priya-nayar',
  'hadrik-bronn',
  'imani-cross'
]);
assert.equal(rhythmCommit.campaignState.commandCulture.rawValuesHidden, true);
assert.equal(
  rhythmCommit.campaignState.relationships.descriptiveLog.some((item) => /defined lane/.test(item)),
  true
);
assert.equal(
  rhythmCommit.campaignState.relationships.memoryLedger.some((item) => item.crewId === 'priya-nayar' && item.sourceOutcomeId === 'outcome.stage13.rhythm.001'),
  true
);

console.log('Stage 13 command-rhythm tests passed: freeform interval, command-culture tendency, Hesperus transition, autosave, and relationship memory');
