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

function stableMechanics(campaignState) {
  return JSON.stringify({
    mission: campaignState.mission,
    clocks: campaignState.clocks,
    commandStyle: campaignState.commandStyle,
    relationships: campaignState.relationships,
    commandLog: campaignState.commandLog
  });
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
    return `${prefix}-stage18-${idSequence}`;
  },
  now: createSequence([
    '2026-06-19T07:00:00.000Z',
    '2026-06-19T07:01:00.000Z',
    '2026-06-19T07:02:00.000Z',
    '2026-06-19T07:03:00.000Z',
    '2026-06-19T07:04:00.000Z',
    '2026-06-19T07:05:00.000Z',
    '2026-06-19T07:06:00.000Z',
    '2026-06-19T07:07:00.000Z',
    '2026-06-19T07:08:00.000Z',
    '2026-06-19T07:09:00.000Z',
    '2026-06-19T07:10:00.000Z',
    '2026-06-19T07:11:00.000Z',
    '2026-06-19T07:12:00.000Z',
    '2026-06-19T07:13:00.000Z',
    '2026-06-19T07:14:00.000Z',
    '2026-06-19T07:15:00.000Z',
    '2026-06-19T07:16:00.000Z',
    '2026-06-19T07:17:00.000Z'
  ])
});

const narrator = {
  id: 'stage18-narrator',
  async generateNarration(request) {
    return {
      providerId: 'stage18-narrator',
      text: `Narrated ${request.sourceOutcomeId}.`
    };
  }
};

async function previewCommit(turnId, playerInput) {
  await app.previewDirectorTurn({ turnId, playerInput });
  return app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });
}

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

await previewCommit('turn.stage18.arrival.001', 'I report aboard without interrupting the working transfer, ask Priya for live status and Bronn for the acting XO handoff, then report to Captain Whitaker once docking is complete.');
await previewCommit('turn.stage18.handover.001', 'In the ready room I tell Whitaker that no life is expendable and the crew deserves the truth. I ask Bronn for the clean handoff details and define executive authority as clear recommendations, private disagreement, and public support for lawful final decisions.');
await previewCommit('turn.stage18.readiness.001', 'I set the readiness priorities in sequence: Priya owns schedule coordination and exception routing, Imani gets protected repair and documentation time before the combined-load test, Miriam sets medical fatigue restrictions, Rowan defines the sensor threshold for interrupting the schedule, and Kieran gets a bounded flight profile. We accept the remaining combined-load risk explicitly and defer noncritical polish until after the fallback-command drill.');
await previewCommit('turn.stage18.fallback.001', 'Use Bronn\'s failure conditions to standardize one shipwide fallback-command procedure. Run a cross-department walkthrough, have Priya route the command-network certificate exception into accountable remediation, and assign Imani to patch and audit the older auxiliary-control identity before the combined-load test.');
await previewCommit('turn.stage18.rhythm.001', 'I hold focused follow-ups with Priya, Bronn, and Imani instead of another all-hands meeting. Priya owns routine coordination check-ins, Bronn is told to bring failure-condition objections before command closes debate, and Imani gets a standing expectation to escalate technical debt thresholds. I invite pushback, set clear boundaries for dissent, and assign follow-up owners.');

await app.recoverCommandBearingPoint({
  recoveryId: 'stage18.resolve.recovery',
  track: 'Resolve'
});

const originalPreview = await app.previewDirectorTurn({
  turnId: 'turn.stage18.hesperus.001',
  playerInput: 'Transfer the medically vulnerable passengers first, secure the falsified inspection record, order the Hesperus owner to remain available for formal inquiry, and leave a repair team only for impulse-safe stabilization. Log that the Breckenridge is accepting a minor delay for passenger safety and evidence preservation.'
});
assert.equal(originalPreview.commandBearingPrompt.eligible, true);
const originalCommit = await app.commitProvisionalDirectorTurn({
  spendTrack: 'resolve',
  provider: narrator,
  generateNarration: true
});
const originalOutcomeId = originalCommit.turnPacket.outcomePacket.id;
assert.equal(originalOutcomeId, 'outcome.stage18.hesperus.001');
assert.equal(originalCommit.campaignState.mission.activePhaseId, 'hesperus-aftermath');
assert.equal(originalCommit.campaignState.commandStyle.resolve.points, 0);
assert.equal(originalCommit.campaignState.commandStyle.resolve.marks, 1);
assert.equal(originalCommit.campaignState.commandStyle.spendLedger[originalOutcomeId].track, 'resolve');

const beforeRewrite = stableMechanics(originalCommit.campaignState);
const rewrite = await app.retryNarrationForLastTurn({ provider: narrator });
assert.equal(rewrite.ok, true);
assert.equal(stableMechanics(rewrite.campaignState), beforeRewrite);

const replacementPreview = await app.previewOutcomeReplacement({
  outcomeId: originalOutcomeId,
  turnId: 'turn.stage18.hesperus.replacement',
  playerInput: 'I order the Breckenridge to leave the mission area because I want distance from the Hesperus.'
});
assert.equal(replacementPreview.provisionalOutcome.resultBand, 'Partial Failure');
assert.equal(replacementPreview.campaignState.mission.activePhaseId, 'hesperus-aftermath');
assert.equal(replacementPreview.view.pendingOutcomeReplacement.outcomeId, originalOutcomeId);
assert.equal(replacementPreview.view.pendingDirectorTurn.replacementForOutcomeId, originalOutcomeId);

const replacementCommit = await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});
const replacementOutcomeId = replacementCommit.turnPacket.outcomePacket.id;
assert.equal(replacementOutcomeId, 'outcome.stage18.hesperus.replacement');
assert.equal(replacementCommit.campaignState.mission.activePhaseId, 'hesperus-diversion');
assert.equal(replacementCommit.campaignState.commandStyle.resolve.points, 1);
assert.equal(replacementCommit.campaignState.commandStyle.resolve.marks || 0, 0);
assert.equal(replacementCommit.campaignState.commandStyle.spendLedger?.[originalOutcomeId], undefined);
assert.equal(replacementCommit.campaignState.turnLedger.lastReplacedOutcomeId, originalOutcomeId);
const replacementHistory = replacementCommit.campaignState.turnLedger.replacementHistory.at(-1);
assert.equal(replacementHistory.type, 'rerunOutcome');
assert.equal(replacementHistory.replacedOutcomeId, originalOutcomeId);
assert.equal(replacementHistory.replacementOutcomeId, replacementOutcomeId);
assert.equal(replacementHistory.replacedTurnId, 'turn.stage18.hesperus.001');
assert.match(replacementHistory.acceptedAt, /^2026-06-19T07:/);

const branch = await app.saveCurrentGameAs({ name: 'Stage 18 Replacement Branch' });
assert.equal(branch.save.metadata.branch.parentSaveId, 'save-stage18-3');
assert.equal(branch.save.metadata.branch.divergenceOutcomeId, replacementOutcomeId);
assert.equal(branch.save.payload.campaignState.turnLedger.lastCommittedOutcomeId, replacementOutcomeId);

const deleted = await app.deleteCommittedOutcome({ outcomeId: replacementOutcomeId });
assert.equal(deleted.deletedOutcomeId, replacementOutcomeId);
assert.equal(deleted.campaignState.mission.activePhaseId, 'hesperus-diversion');
assert.equal(deleted.campaignState.commandStyle.resolve.points, 1);
assert.equal(deleted.campaignState.commandStyle.resolve.marks || 0, 0);
assert.equal(deleted.campaignState.turnLedger.lastCommittedOutcomeId, 'outcome.stage18.rhythm.001');

console.log('Stage 18 rerun/branch/recovery tests passed: narration rewrite, outcome rerun, rollback, branch metadata, and delete restore');
