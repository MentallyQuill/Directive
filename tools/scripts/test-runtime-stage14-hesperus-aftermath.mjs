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

function followUpDomains(campaignState) {
  return (campaignState.mission.followUps || []).map((item) => item.domain).sort();
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
    return `${prefix}-stage14-${idSequence}`;
  },
  now: createSequence([
    '2026-06-19T04:00:00.000Z',
    '2026-06-19T04:01:00.000Z',
    '2026-06-19T04:02:00.000Z',
    '2026-06-19T04:03:00.000Z',
    '2026-06-19T04:04:00.000Z',
    '2026-06-19T04:05:00.000Z',
    '2026-06-19T04:06:00.000Z',
    '2026-06-19T04:07:00.000Z',
    '2026-06-19T04:08:00.000Z',
    '2026-06-19T04:09:00.000Z',
    '2026-06-19T04:10:00.000Z',
    '2026-06-19T04:11:00.000Z',
    '2026-06-19T04:12:00.000Z',
    '2026-06-19T04:13:00.000Z',
    '2026-06-19T04:14:00.000Z',
    '2026-06-19T04:15:00.000Z'
  ])
});

const narrator = {
  id: 'stage14-narrator',
  async generateNarration(request) {
    return {
      providerId: 'stage14-narrator',
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
  turnId: 'turn.stage14.arrival.001',
  playerInput: 'I report aboard without interrupting the working transfer, ask Priya for live status and Bronn for the acting XO handoff, then report to Captain Whitaker once docking is complete.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage14.handover.001',
  playerInput: 'In the ready room I tell Whitaker that no life is expendable and the crew deserves the truth. I ask Bronn for the clean handoff details and define executive authority as clear recommendations, private disagreement, and public support for lawful final decisions.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage14.readiness.001',
  playerInput: 'I set the readiness priorities in sequence: Priya owns schedule coordination and exception routing, Imani gets protected repair and documentation time before the combined-load test, Miriam sets medical fatigue restrictions, Rowan defines the sensor threshold for interrupting the schedule, and Kieran gets a bounded flight profile. We accept the remaining combined-load risk explicitly and defer noncritical polish until after the fallback-command drill.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage14.fallback.001',
  playerInput: 'Use Bronn\'s failure conditions to standardize one shipwide fallback-command procedure. Run a cross-department walkthrough, have Priya route the command-network certificate exception into accountable remediation, and assign Imani to patch and audit the older auxiliary-control identity before the combined-load test.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage14.rhythm.001',
  playerInput: 'I hold focused follow-ups with Priya, Bronn, and Imani instead of another all-hands meeting. Priya owns routine coordination check-ins, Bronn is told to bring failure-condition objections before command closes debate, and Imani gets a standing expectation to escalate technical debt thresholds. I invite pushback, set clear boundaries for dissent, and assign follow-up owners.'
});
const rhythmCommit = await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });
assert.equal(rhythmCommit.campaignState.mission.activePhaseId, 'hesperus-diversion');

await app.previewDirectorTurn({
  turnId: 'turn.stage14.hesperus.001',
  playerInput: 'Transfer the medically vulnerable passengers first, secure the falsified inspection record, order the Hesperus owner to remain available for formal inquiry, and leave a repair team only for impulse-safe stabilization. Log that the Breckenridge is accepting a minor delay for passenger safety and evidence preservation.'
});
const hesperusCommit = await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });
assert.equal(hesperusCommit.campaignState.mission.activePhaseId, 'hesperus-aftermath');
assert.equal(clockValue(hesperusCommit.campaignState, 'arrival-schedule-margin'), 1);

const aftermathPreview = await app.previewDirectorTurn({
  turnId: 'turn.stage14.aftermath.001',
  playerInput: 'Assign Hesperus follow-up before we resume shakedown: Imani documents the emergency repairs and injector limits, Miriam follows passenger medical needs and crew fatigue, Priya routes the inspection fraud and owner inquiry, Kieran recalculates the arrival plan, and Rowan preserves the escape-pod subspace data as optional science rather than an emergency.'
});
assert.equal(aftermathPreview.provisionalOutcome.resultBand, 'Success');
assert.equal(aftermathPreview.provisionalOutcome.revealedFactIds.includes('hesperus.escape-pod-subspace-data'), true);

const aftermathCommit = await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});
assert.equal(aftermathCommit.narrationResult.ok, true);
assert.equal(aftermathCommit.autosave.ok, true);
assert.equal(aftermathCommit.campaignState.mission.activePhaseId, 'combined-load-test');
assert.equal(aftermathCommit.campaignState.mission.availableDecisionPointIds[0], 'decision.combined-load-risk');
assert.deepEqual(followUpDomains(aftermathCommit.campaignState), [
  'engineering',
  'flight-planning',
  'legal-admin',
  'medical',
  'science'
]);
assert.equal(aftermathCommit.campaignState.mission.knownFacts.includes('hesperus.escape-pod-subspace-data'), true);
assert.equal(clockValue(aftermathCommit.campaignState, 'arrival-schedule-margin'), 1);
assert.equal(clockValue(aftermathCommit.campaignState, 'technical-debt-pressure'), 1);
assert.equal(
  aftermathCommit.campaignState.relationships.memoryLedger.some((item) => item.crewId === 'rowan-saye' && item.sourceOutcomeId === 'outcome.stage14.aftermath.001'),
  true
);
assert.equal(
  aftermathCommit.commandLogPacket.visibleConsequences.includes('Hesperus follow-up obligations remain active after the ship resumes course'),
  true
);

console.log('Stage 14 Hesperus aftermath tests passed: follow-up persistence, optional data reveal, phase advance, autosave, and relationship memory');
