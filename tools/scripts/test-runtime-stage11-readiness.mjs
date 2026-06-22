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

function outcomeFlagValue(campaignState, flagId) {
  return (campaignState.mission?.outcomeFlags || []).find((flag) => flag.id === flagId)?.value;
}

function clockValue(campaignState, clockId) {
  return (campaignState.clocks || []).find((clock) => clock.id === clockId)?.value;
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
    return `${prefix}-stage11-${idSequence}`;
  },
  now: createSequence([
    '2026-06-19T01:00:00.000Z',
    '2026-06-19T01:01:00.000Z',
    '2026-06-19T01:02:00.000Z',
    '2026-06-19T01:03:00.000Z',
    '2026-06-19T01:04:00.000Z',
    '2026-06-19T01:05:00.000Z',
    '2026-06-19T01:06:00.000Z',
    '2026-06-19T01:07:00.000Z',
    '2026-06-19T01:08:00.000Z',
    '2026-06-19T01:09:00.000Z'
  ])
});

const narrator = {
  id: 'stage11-narrator',
  async generateNarration(request) {
    return {
      providerId: 'stage11-narrator',
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
  turnId: 'turn.stage11.arrival.001',
  playerInput: 'I report aboard without interrupting the working transfer, ask Priya for live status and Bronn for the acting XO handoff, then report to Captain Whitaker once docking is complete.'
});
await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});

await app.previewDirectorTurn({
  turnId: 'turn.stage11.handover.001',
  playerInput: 'In the ready room I tell Whitaker that no life is expendable and the crew deserves the truth. I ask Bronn for the clean handoff details and define executive authority as clear recommendations, private disagreement, and public support for lawful final decisions.'
});
const handoverCommit = await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});
assert.equal(handoverCommit.campaignState.mission.activePhaseId, 'senior-readiness-conference');
assert.equal(clockValue(handoverCommit.campaignState, 'crew-integration-strain'), 0);

const readinessPreview = await app.previewDirectorTurn({
  turnId: 'turn.stage11.readiness.001',
  playerInput: 'I set the readiness priorities in sequence: Priya owns schedule coordination and exception routing, Imani gets protected repair and documentation time before the combined-load test, Miriam sets medical fatigue restrictions, Rowan defines the sensor threshold for interrupting the schedule, and Kieran gets a bounded flight profile. We accept the remaining combined-load risk explicitly and defer noncritical polish until after the fallback-command drill.'
});
assert.equal(readinessPreview.provisionalOutcome.resultBand, 'Success');
assert.equal(readinessPreview.provisionalOutcome.revealedFactIds.includes('ship.combined-load-risk'), true);
assert.equal(readinessPreview.campaignState.mission.activePhaseId, 'senior-readiness-conference');
assert.equal(readinessPreview.commandBearingPrompt.eligible, false);

const readinessCommit = await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});
assert.equal(readinessCommit.narrationResult.ok, true);
assert.equal(readinessCommit.autosave.ok, true);
assert.equal(readinessCommit.campaignState.mission.activePhaseId, 'fallback-command-drill');
assert.equal(readinessCommit.campaignState.mission.availableDecisionPointIds[0], 'decision.fallback-procedure');
assert.equal(outcomeFlagValue(readinessCommit.campaignState, 'prelude.kieran'), 'flight-profile-responsibly-approved');
assert.equal(outcomeFlagValue(readinessCommit.campaignState, 'prelude.priya'), 'coordination-formalized');
assert.equal(outcomeFlagValue(readinessCommit.campaignState, 'prelude.rowan'), 'investigation-threshold-defined');
assert.equal(outcomeFlagValue(readinessCommit.campaignState, 'prelude.miriam'), 'medical-restrictions-respected');
assert.equal(outcomeFlagValue(readinessCommit.campaignState, 'prelude.imani'), 'documentation-and-repair-time-protected');
assert.equal(outcomeFlagValue(readinessCommit.campaignState, 'prelude.ship-state'), 'incomplete-honestly-reported');
assert.equal(clockValue(readinessCommit.campaignState, 'crew-integration-strain'), 0);
assert.equal(clockValue(readinessCommit.campaignState, 'technical-debt-pressure'), 2);
assert.equal(readinessCommit.campaignState.mission.knownFacts.includes('ship.combined-load-risk'), true);
assert.equal(readinessCommit.commandLogPacket.visibleConsequences.includes('combined-load risk remains visible until tested'), true);
assert.equal(
  readinessCommit.campaignState.relationships.descriptiveLog.some((item) => /readiness work has named ownership/.test(item)),
  true
);
assert.equal(
  readinessCommit.campaignState.relationships.memoryLedger.some((item) => item.crewId === 'imani-cross' && item.sourceOutcomeId === 'outcome.stage11.readiness.001'),
  true
);

console.log('Stage 11 readiness tests passed: senior staff priorities, hidden flags, phase advancement, autosave, and relationship memory');
