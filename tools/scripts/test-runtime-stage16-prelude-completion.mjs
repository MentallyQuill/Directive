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
  return (campaignState.mission.outcomeFlags || []).find((flag) => flag.id === flagId)?.value;
}

function latestCommandLogEntry(campaignState) {
  return campaignState.commandLog?.entries?.at(-1) || null;
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
    return `${prefix}-stage16-${idSequence}`;
  },
  now: createSequence([
    '2026-06-19T06:00:00.000Z',
    '2026-06-19T06:01:00.000Z',
    '2026-06-19T06:02:00.000Z',
    '2026-06-19T06:03:00.000Z',
    '2026-06-19T06:04:00.000Z',
    '2026-06-19T06:05:00.000Z',
    '2026-06-19T06:06:00.000Z',
    '2026-06-19T06:07:00.000Z',
    '2026-06-19T06:08:00.000Z',
    '2026-06-19T06:09:00.000Z',
    '2026-06-19T06:10:00.000Z',
    '2026-06-19T06:11:00.000Z',
    '2026-06-19T06:12:00.000Z',
    '2026-06-19T06:13:00.000Z',
    '2026-06-19T06:14:00.000Z',
    '2026-06-19T06:15:00.000Z',
    '2026-06-19T06:16:00.000Z',
    '2026-06-19T06:17:00.000Z',
    '2026-06-19T06:18:00.000Z',
    '2026-06-19T06:19:00.000Z'
  ])
});

const narrator = {
  id: 'stage16-narrator',
  async generateNarration(request) {
    return {
      providerId: 'stage16-narrator',
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

for (const turn of [
  {
    turnId: 'turn.stage16.arrival.001',
    playerInput: 'I report aboard without interrupting the working transfer, ask Priya for live status and Bronn for the acting XO handoff, then report to Captain Whitaker once docking is complete.'
  },
  {
    turnId: 'turn.stage16.handover.001',
    playerInput: 'In the ready room I tell Whitaker that no life is expendable and the crew deserves the truth. I ask Bronn for the clean handoff details and define executive authority as clear recommendations, private disagreement, and public support for lawful final decisions.'
  },
  {
    turnId: 'turn.stage16.readiness.001',
    playerInput: 'I set the readiness priorities in sequence: Priya owns schedule coordination and exception routing, Imani gets protected repair and documentation time before the combined-load test, Miriam sets medical fatigue restrictions, Rowan defines the sensor threshold for interrupting the schedule, and Kieran gets a bounded flight profile. We accept the remaining combined-load risk explicitly and defer noncritical polish until after the fallback-command drill.'
  },
  {
    turnId: 'turn.stage16.fallback.001',
    playerInput: 'Use Bronn\'s failure conditions to standardize one shipwide fallback-command procedure. Run a cross-department walkthrough, have Priya route the command-network certificate exception into accountable remediation, and assign Imani to patch and audit the older auxiliary-control identity before the combined-load test.'
  },
  {
    turnId: 'turn.stage16.rhythm.001',
    playerInput: 'I hold focused follow-ups with Priya, Bronn, and Imani instead of another all-hands meeting. Priya owns routine coordination check-ins, Bronn is told to bring failure-condition objections before command closes debate, and Imani gets a standing expectation to escalate technical debt thresholds. I invite pushback, set clear boundaries for dissent, and assign follow-up owners.'
  },
  {
    turnId: 'turn.stage16.hesperus.001',
    playerInput: 'Transfer the medically vulnerable passengers first, secure the falsified inspection record, order the Hesperus owner to remain available for formal inquiry, and leave a repair team only for impulse-safe stabilization. Log that the Breckinridge is accepting a minor delay for passenger safety and evidence preservation.'
  },
  {
    turnId: 'turn.stage16.aftermath.001',
    playerInput: 'Assign Hesperus follow-up before we resume shakedown: Imani documents the emergency repairs and injector limits, Miriam follows passenger medical needs and crew fatigue, Priya routes the inspection fraud and owner inquiry, Kieran recalculates the arrival plan, and Rowan preserves the escape-pod subspace data as optional science rather than an emergency.'
  },
  {
    turnId: 'turn.stage16.combined.001',
    playerInput: 'Run the combined-load test as a staged controlled sequence. Imani owns the command-network certificate watch and may pause the test. Kieran may execute the flight profile only inside explicit abort criteria. If the certificate issue recurs, pause and report the readiness limitation honestly rather than calling the test clean.'
  }
]) {
  await app.previewDirectorTurn(turn);
  await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });
}

const finalPreview = await app.previewDirectorTurn({
  turnId: 'turn.stage16.final.001',
  playerInput: 'In the final review I tell Whitaker the Breckinridge is mission-capable but carries an honest readiness caveat from the incomplete combined-load test and schedule delay. I ask for clear captain support when we disagree privately and support publicly. We formalize Priya\'s coordination routine, affirm Bronn\'s acting-XO service, name unresolved engineering strain, and send department orders before arrival.'
});
assert.equal(finalPreview.provisionalOutcome.resultBand, 'Success');
assert.equal(finalPreview.provisionalOutcome.revealedFactIds.includes('chapter-1.relief-convoy-distress-packet'), true);
assert.equal(finalPreview.commandBearingPrompt.eligible, false);
assert.equal(finalPreview.narratorPacket.allowedFactIds.includes('chapter-1.relief-convoy-distress-packet'), true);

const finalCommit = await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});
assert.equal(finalCommit.narrationResult.ok, true);
assert.equal(finalCommit.autosave.ok, true);
assert.equal(finalCommit.campaignState.mission.activeMissionId, 'chapter-1-the-empty-convoy');
assert.equal(finalCommit.campaignState.mission.activeMissionGraphId, 'breckinridge.ashes-of-peace.chapter-1-the-empty-convoy');
assert.equal(finalCommit.campaignState.mission.activeMissionGraphPath, 'packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json');
assert.equal(finalCommit.campaignState.mission.activePhaseId, 'initial-reception');
assert.equal(finalCommit.campaignState.mission.phase, 'initial-reception');
assert.deepEqual(finalCommit.campaignState.mission.availableDecisionPointIds, ['decision.initial-convoy-posture']);
assert.equal(finalCommit.campaignState.mission.endState, 'arrival-with-limitation');
assert.equal(finalCommit.campaignState.mission.arrivalPosture, 'arrival-with-limitation');
assert.equal(finalCommit.campaignState.mission.completedMissionId, 'prelude-a-ship-underway');
assert.equal(finalCommit.campaignState.mission.nextMissionId, 'chapter-1-the-empty-convoy');
assert.equal(finalCommit.campaignState.mission.transitionStatus, 'chapter-1-active');
assert.equal(finalCommit.campaignState.mission.knownFacts.includes('chapter-1.relief-convoy-distress-packet'), true);
assert.equal(outcomeFlagValue(finalCommit.campaignState, 'prelude.whitaker'), 'uncertainty-reported-honestly');
assert.equal(finalCommit.campaignState.mainCampaign.completedChapters.includes('prelude-a-ship-underway'), true);
assert.equal(finalCommit.campaignState.mainCampaign.availableChapters.includes('chapter-1-the-empty-convoy'), true);
assert.equal(finalCommit.campaignState.mainCampaign.lockedChapters.includes('chapter-1-the-empty-convoy'), false);
assert.equal(finalCommit.campaignState.mainCampaign.chapterCursor, 'chapter-1-the-empty-convoy');
assert.equal(
  finalCommit.campaignState.relationships.memoryLedger.some((item) => item.crewId === 'mara-whitaker' && item.sourceOutcomeId === 'outcome.stage16.final.001'),
  true
);
assert.equal(
  finalCommit.campaignState.relationships.memoryLedger.some((item) => item.crewId === 'hadrik-bronn' && item.sourceOutcomeId === 'outcome.stage16.final.001'),
  true
);
assert.equal(
  latestCommandLogEntry(finalCommit.campaignState).visibleConsequences.includes('Relief Convoy Twelve distress packet interrupts formal Asterion reception'),
  true
);

console.log('Stage 16 Prelude completion tests passed: final review, arrival posture, Chapter 1 handoff, autosave, and relationship memory');
