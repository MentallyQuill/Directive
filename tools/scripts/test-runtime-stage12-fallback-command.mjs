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

const packageData = readJson('packages/bundled/breckinridge/ashes-of-peace.starship-package.json');
const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json');

let idSequence = 0;
const app = createDirectiveRuntimeApp({
  adapter: createMemoryJsonAdapter(),
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
    return `${prefix}-stage12-${idSequence}`;
  },
  now: createSequence([
    '2026-06-19T02:00:00.000Z',
    '2026-06-19T02:01:00.000Z',
    '2026-06-19T02:02:00.000Z',
    '2026-06-19T02:03:00.000Z',
    '2026-06-19T02:04:00.000Z',
    '2026-06-19T02:05:00.000Z',
    '2026-06-19T02:06:00.000Z',
    '2026-06-19T02:07:00.000Z',
    '2026-06-19T02:08:00.000Z',
    '2026-06-19T02:09:00.000Z',
    '2026-06-19T02:10:00.000Z',
    '2026-06-19T02:11:00.000Z'
  ])
});

const narrator = {
  id: 'stage12-narrator',
  async generateNarration(request) {
    return {
      providerId: 'stage12-narrator',
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
  turnId: 'turn.stage12.arrival.001',
  playerInput: 'I report aboard without interrupting the working transfer, ask Priya for live status and Bronn for the acting XO handoff, then report to Captain Whitaker once docking is complete.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage12.handover.001',
  playerInput: 'In the ready room I tell Whitaker that no life is expendable and the crew deserves the truth. I ask Bronn for the clean handoff details and define executive authority as clear recommendations, private disagreement, and public support for lawful final decisions.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage12.readiness.001',
  playerInput: 'I set the readiness priorities in sequence: Priya owns schedule coordination and exception routing, Imani gets protected repair and documentation time before the combined-load test, Miriam sets medical fatigue restrictions, Rowan defines the sensor threshold for interrupting the schedule, and Kieran gets a bounded flight profile. We accept the remaining combined-load risk explicitly and defer noncritical polish until after the fallback-command drill.'
});
const readinessCommit = await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });
assert.equal(readinessCommit.campaignState.mission.activePhaseId, 'fallback-command-drill');
assert.equal(clockValue(readinessCommit.campaignState, 'technical-debt-pressure'), 2);

const fallbackPreview = await app.previewDirectorTurn({
  turnId: 'turn.stage12.fallback.temporary.001',
  playerInput: 'Set an interim protocol for fallback-command: Bronn lists the failure conditions, Priya logs the command-network certificate limitation and the older auxiliary-control identity, and Imani documents that remediation is deferred until after arrival. Until repaired, this temporary policy is the only authorized bridge-loss procedure.'
});
assert.equal(fallbackPreview.provisionalOutcome.resultBand, 'Success');
assert.equal(fallbackPreview.provisionalOutcome.revealedFactIds.includes('ship.fallback-command-incompatibility'), true);
assert.equal(fallbackPreview.provisionalOutcome.revealedFactIds.includes('ship.command-network-certificate-issue'), true);

const fallbackCommit = await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});
assert.equal(fallbackCommit.narrationResult.ok, true);
assert.equal(fallbackCommit.autosave.ok, true);
assert.equal(fallbackCommit.campaignState.mission.activePhaseId, 'command-rhythm-scenes');
assert.equal(fallbackCommit.campaignState.mission.availableDecisionPointIds.length, 0);
assert.equal(outcomeFlagValue(fallbackCommit.campaignState, 'prelude.crew-integration'), 'unsettled');
assert.equal(outcomeFlagValue(fallbackCommit.campaignState, 'prelude.bronn'), 'failure-conditions-used-well');
assert.equal(outcomeFlagValue(fallbackCommit.campaignState, 'prelude.priya'), 'delegation-boundaries-clear');
assert.equal(outcomeFlagValue(fallbackCommit.campaignState, 'prelude.imani'), 'temporary-workarounds-normalized');
assert.equal(outcomeFlagValue(fallbackCommit.campaignState, 'prelude.ship-state'), 'complete-with-accepted-limitation');
assert.equal(clockValue(fallbackCommit.campaignState, 'crew-integration-strain'), 0);
assert.equal(clockValue(fallbackCommit.campaignState, 'technical-debt-pressure'), 3);
assert.equal(fallbackCommit.campaignState.mission.knownFacts.includes('ship.fallback-command-incompatibility'), true);
assert.equal(fallbackCommit.campaignState.mission.knownFacts.includes('ship.command-network-certificate-issue'), true);
assert.equal(fallbackCommit.commandLogPacket.visibleConsequences.includes('command-network certificate limitation remains active but logged'), true);
assert.equal(
  fallbackCommit.campaignState.relationships.descriptiveLog.some((item) => /accepted technical debt/.test(item)),
  true
);
assert.equal(
  fallbackCommit.campaignState.relationships.memoryLedger.some((item) => item.crewId === 'hadrik-bronn' && item.sourceOutcomeId === 'outcome.stage12.fallback.temporary.001'),
  true
);

console.log('Stage 12 fallback-command tests passed: temporary protocol, known certificate issue, accepted limitation, technical debt, autosave, and relationship memory');
