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

function outcomeFlagValue(campaignState, flagId) {
  return (campaignState.mission.outcomeFlags || []).find((flag) => flag.id === flagId)?.value;
}

function latestCommandLogEntry(campaignState) {
  return campaignState.commandLog?.entries?.at(-1) || null;
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.starship-package.json');
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
    return `${prefix}-stage15-${idSequence}`;
  },
  now: createSequence([
    '2026-06-19T05:00:00.000Z',
    '2026-06-19T05:01:00.000Z',
    '2026-06-19T05:02:00.000Z',
    '2026-06-19T05:03:00.000Z',
    '2026-06-19T05:04:00.000Z',
    '2026-06-19T05:05:00.000Z',
    '2026-06-19T05:06:00.000Z',
    '2026-06-19T05:07:00.000Z',
    '2026-06-19T05:08:00.000Z',
    '2026-06-19T05:09:00.000Z',
    '2026-06-19T05:10:00.000Z',
    '2026-06-19T05:11:00.000Z',
    '2026-06-19T05:12:00.000Z',
    '2026-06-19T05:13:00.000Z',
    '2026-06-19T05:14:00.000Z',
    '2026-06-19T05:15:00.000Z',
    '2026-06-19T05:16:00.000Z',
    '2026-06-19T05:17:00.000Z'
  ])
});

const narrator = {
  id: 'stage15-narrator',
  async generateNarration(request) {
    return {
      providerId: 'stage15-narrator',
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
  turnId: 'turn.stage15.arrival.001',
  playerInput: 'I report aboard without interrupting the working transfer, ask Priya for live status and Bronn for the acting XO handoff, then report to Captain Whitaker once docking is complete.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage15.handover.001',
  playerInput: 'In the ready room I tell Whitaker that no life is expendable and the crew deserves the truth. I ask Bronn for the clean handoff details and define executive authority as clear recommendations, private disagreement, and public support for lawful final decisions.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage15.readiness.001',
  playerInput: 'I set the readiness priorities in sequence: Priya owns schedule coordination and exception routing, Imani gets protected repair and documentation time before the combined-load test, Miriam sets medical fatigue restrictions, Rowan defines the sensor threshold for interrupting the schedule, and Kieran gets a bounded flight profile. We accept the remaining combined-load risk explicitly and defer noncritical polish until after the fallback-command drill.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage15.fallback.001',
  playerInput: 'Use Bronn\'s failure conditions to standardize one shipwide fallback-command procedure. Run a cross-department walkthrough, have Priya route the command-network certificate exception into accountable remediation, and assign Imani to patch and audit the older auxiliary-control identity before the combined-load test.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage15.rhythm.001',
  playerInput: 'I hold focused follow-ups with Priya, Bronn, and Imani instead of another all-hands meeting. Priya owns routine coordination check-ins, Bronn is told to bring failure-condition objections before command closes debate, and Imani gets a standing expectation to escalate technical debt thresholds. I invite pushback, set clear boundaries for dissent, and assign follow-up owners.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage15.hesperus.001',
  playerInput: 'Transfer the medically vulnerable passengers first, secure the falsified inspection record, order the Hesperus owner to remain available for formal inquiry, and leave a repair team only for impulse-safe stabilization. Log that the Breckenridge is accepting a minor delay for passenger safety and evidence preservation.'
});
await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });

await app.previewDirectorTurn({
  turnId: 'turn.stage15.aftermath.001',
  playerInput: 'Assign Hesperus follow-up before we resume shakedown: Imani documents the emergency repairs and injector limits, Miriam follows passenger medical needs and crew fatigue, Priya routes the inspection fraud and owner inquiry, Kieran recalculates the arrival plan, and Rowan preserves the escape-pod subspace data as optional science rather than an emergency.'
});
const aftermathCommit = await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });
assert.equal(aftermathCommit.campaignState.mission.activePhaseId, 'combined-load-test');
assert.equal(clockValue(aftermathCommit.campaignState, 'arrival-schedule-margin'), 1);
assert.equal(clockValue(aftermathCommit.campaignState, 'technical-debt-pressure'), 1);

const combinedPreview = await app.previewDirectorTurn({
  turnId: 'turn.stage15.combined.001',
  playerInput: 'Run the combined-load test as a staged controlled sequence. Imani owns the command-network certificate watch and may pause the test. Kieran may execute the flight profile only inside explicit abort criteria. If the certificate issue recurs, pause and report the readiness limitation honestly rather than calling the test clean.'
});
assert.equal(combinedPreview.provisionalOutcome.resultBand, 'Success');
assert.equal(combinedPreview.commandBearingPrompt.eligible, false);
assert.equal(combinedPreview.turnPacket.sceneSnapshot.presentCharacters.includes('kieran-vale'), true);
assert.equal(combinedPreview.turnPacket.sceneSnapshot.presentCharacters.includes('priya-nayar'), true);
assert.equal(combinedPreview.turnPacket.sceneSnapshot.presentCharacters.includes('imani-cross'), true);
assert.equal(combinedPreview.narratorPacket.allowedCardIds.includes('crew.imani.voice.technical-debt'), true);
assert.equal(combinedPreview.narratorPacket.allowedCardIds.includes('crew.priya.voice.dependencies-access'), true);

const combinedCommit = await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});
assert.equal(combinedCommit.narrationResult.ok, true);
assert.equal(combinedCommit.autosave.ok, true);
assert.equal(combinedCommit.campaignState.mission.activePhaseId, 'final-command-review');
assert.deepEqual(combinedCommit.campaignState.mission.availableDecisionPointIds, [
  'decision.final-readiness-report'
]);
assert.equal(outcomeFlagValue(combinedCommit.campaignState, 'prelude.ship-state'), 'incomplete-honestly-reported');
assert.equal(outcomeFlagValue(combinedCommit.campaignState, 'prelude.arrival-delay'), 'moderate');
assert.equal(outcomeFlagValue(combinedCommit.campaignState, 'prelude.kieran'), 'flight-profile-responsibly-approved');
assert.equal(outcomeFlagValue(combinedCommit.campaignState, 'prelude.imani'), 'technical-debt-owned');
assert.equal(clockValue(combinedCommit.campaignState, 'arrival-schedule-margin'), 0);
assert.equal(clockValue(combinedCommit.campaignState, 'technical-debt-pressure'), 0);
assert.equal(
  combinedCommit.campaignState.relationships.memoryLedger.some((item) => item.crewId === 'kieran-vale' && item.sourceOutcomeId === 'outcome.stage15.combined.001'),
  true
);
assert.equal(
  combinedCommit.campaignState.relationships.memoryLedger.some((item) => item.crewId === 'imani-cross' && item.sourceOutcomeId === 'outcome.stage15.combined.001'),
  true
);
assert.equal(
  latestCommandLogEntry(combinedCommit.campaignState).visibleConsequences.includes('Asterion arrival posture must include the readiness caveat'),
  true
);
assert.equal(
  combinedCommit.turnPacket.narratorPacket.constraints.includes('Narrate the combined-load fault as ordinary technical causality, not sabotage.'),
  true
);

console.log('Stage 15 combined-load tests passed: honest limitation, final review transition, autosave, narrator constraints, and relationship memory');
