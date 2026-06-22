import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntime
} from '../../src/runtime/director-turn-runtime.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { detectPostChapter1SideMissionOpportunities } from '../../src/side-missions/opportunity-detector.mjs';
import { applySideMissionOpportunityReview } from '../../src/side-missions/opportunity-review.mjs';
import {
  applySideMissionOpportunityResolution,
  applySideMissionOpportunitySceneStart
} from '../../src/side-missions/opportunity-scene.mjs';

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

function assertHiddenTermsAbsent(value) {
  const text = JSON.stringify(value).toLowerCase();
  for (const term of [
    'pale lantern',
    'lantern',
    'no pathogen',
    'nightfall',
    'bioweapon',
    'kestrel',
    'compact recovery team',
    'destroy the transponder',
    'stolen transponder',
    'hull projection',
    'local patrol schedules'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }
}

function previewChapter1({ campaignState, graph, projection, crewDataset, turnId, playerInput }) {
  return createProvisionalDirectorTurnRuntime({
    campaignState,
    graph,
    projection,
    crewDataset,
    graphPath: 'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
    projectionPath: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
    turnId,
    playerInput
  });
}

function commitChapter1Input({ campaignState, graph, projection, crewDataset, turnId, playerInput }) {
  const preview = previewChapter1({ campaignState, graph, projection, crewDataset, turnId, playerInput });
  const committed = commitProvisionalDirectorTurnRuntime({
    campaignState,
    turnPacket: preview.turnPacket,
    confirmWarnings: false,
    confirmedWarningIds: []
  });
  assert.equal(preview.turnPacket.actionClassification.category, 'validWithinMissionBounds');
  assert.equal(
    ['Success', 'Partial Success'].includes(committed.turnPacket.outcomePacket.resultBand),
    true,
    `fresh MVP path step must remain player-safe, got ${committed.turnPacket.outcomePacket.resultBand}`
  );
  assertHiddenTermsAbsent(preview.turnPacket.outcomePacket);
  assertHiddenTermsAbsent(preview.turnPacket.narratorPacket);
  assertHiddenTermsAbsent(preview.turnPacket.commandLogPacket);
  assertHiddenTermsAbsent(committed.turnPacket.outcomePacket);
  assertHiddenTermsAbsent(committed.turnPacket.narratorPacket);
  assertHiddenTermsAbsent(committed.turnPacket.commandLogPacket);
  return committed.campaignState;
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const preludeGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');
const chapter1Graph = readJson('packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json');

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
    missionGraphs: [[{
      path: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
      graph: preludeGraph
    }, {
      path: 'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
      graph: chapter1Graph
    }]]
  }),
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-fresh-mvp-${idSequence}`;
  },
  now: createSequence(Array.from({ length: 80 }, (_, index) => `2026-06-19T18:${String(index).padStart(2, '0')}:00.000Z`))
});

const narrator = {
  id: 'fresh-mvp-narrator',
  async generateNarration(request) {
    return {
      providerId: 'fresh-mvp-narrator',
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

const preludeTurns = [
  ['turn.fresh-mvp.prelude.arrival', 'I report aboard without interrupting the working transfer, ask Priya for live status and Bronn for the acting XO handoff, then report to Captain Whitaker once docking is complete.'],
  ['turn.fresh-mvp.prelude.handover', 'In the ready room I tell Whitaker that no life is expendable and the crew deserves the truth. I ask Bronn for the clean handoff details and define executive authority as clear recommendations, private disagreement, and public support for lawful final decisions.'],
  ['turn.fresh-mvp.prelude.readiness', 'I set the readiness priorities in sequence: Priya owns schedule coordination and exception routing, Imani gets protected repair and documentation time before the combined-load test, Miriam sets medical fatigue restrictions, Rowan defines the sensor threshold for interrupting the schedule, and Kieran gets a bounded flight profile. We accept the remaining combined-load risk explicitly and defer noncritical polish until after the fallback-command drill.'],
  ['turn.fresh-mvp.prelude.fallback', 'Use Bronn\'s failure conditions to standardize one shipwide fallback-command procedure. Run a cross-department walkthrough, have Priya route the command-network certificate exception into accountable remediation, and assign Imani to patch and audit the older auxiliary-control identity before the combined-load test.'],
  ['turn.fresh-mvp.prelude.rhythm', 'I hold focused follow-ups with Priya, Bronn, and Imani instead of another all-hands meeting. Priya owns routine coordination check-ins, Bronn is told to bring failure-condition objections before command closes debate, and Imani gets a standing expectation to escalate technical debt thresholds. I invite pushback, set clear boundaries for dissent, and assign follow-up owners.'],
  ['turn.fresh-mvp.prelude.hesperus', 'Transfer the medically vulnerable passengers first, secure the falsified inspection record, order the Hesperus owner to remain available for formal inquiry, and leave a repair team only for impulse-safe stabilization. Log that the Breckenridge is accepting a minor delay for passenger safety and evidence preservation.'],
  ['turn.fresh-mvp.prelude.aftermath', 'Assign Hesperus follow-up before we resume shakedown: Imani documents the emergency repairs and injector limits, Miriam follows passenger medical needs and crew fatigue, Priya routes the inspection fraud and owner inquiry, Kieran recalculates the arrival plan, and Rowan preserves the escape-pod subspace data as optional science rather than an emergency.'],
  ['turn.fresh-mvp.prelude.combined', 'Run the combined-load test as a staged controlled sequence. Imani owns the command-network certificate watch and may pause the test. Kieran may execute the flight profile only inside explicit abort criteria. If the certificate issue recurs, pause and report the readiness limitation honestly rather than calling the test clean.'],
  ['turn.fresh-mvp.prelude.final', 'In the final review I tell Whitaker the Breckenridge is mission-capable but carries an honest readiness caveat from the incomplete combined-load test and schedule delay. I ask for clear captain support when we disagree privately and support publicly. We formalize Priya\'s coordination routine, affirm Bronn\'s acting-XO service, name unresolved engineering strain, and send department orders before arrival.']
];

let preludeState = null;
for (const [turnId, playerInput] of preludeTurns) {
  await app.previewDirectorTurn({ turnId, playerInput });
  const committed = await app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });
  preludeState = committed.campaignState;
}

assert.equal(preludeState.player.name, 'Talia Serrin');
assert.equal(preludeState.mainCampaign.completedChapters.includes('prelude-a-ship-underway'), true);
assert.equal(preludeState.mission.activeMissionId, 'chapter-1-the-empty-convoy');
assert.equal(preludeState.mission.activePhaseId, 'initial-reception');
assert.equal(preludeState.mission.knownFacts.includes('chapter-1.relief-convoy-distress-packet'), true);
assert.equal((preludeState.commandLog.entries || []).length >= 10, true);
assertHiddenTermsAbsent(preludeState.commandLog.entries);

const chapter1Turns = [
  ['turn.fresh-mvp.chapter1.initial-response', 'convoy-approach', 'Hold range, preserve convoy computer logs and signal records, and run remote scans before anyone boards.'],
  ['turn.fresh-mvp.chapter1.boarding-threshold', 'first-committed-response', 'Take us in for first contact, but no boarding until remote scans verify the threshold, quarantine isolation is ready, security overwatch is staged, rescue teams are prepared, and Imani owns evidence custody for the convoy logs.'],
  ['turn.fresh-mvp.chapter1.first-contact-execution', 'convoy-contact-execution', 'Execute the threshold: launch remote access against the Faraday Bell logs, send a quarantine-capable boarding team with Bronn security overwatch, put Imani on evidence custody, and start Parnell plasma-leak rescue under Miriam isolation rules.'],
  ['turn.fresh-mvp.chapter1.offsite-custody-cargo', 'offsite-custody-cargo-leads', 'Use the Faraday Bell logs and shuttle telemetry to locate the evacuees at Ilyon, have Priya open a lawful channel to Lieutenant Pell over Ivers and the custody claim, keep Bronn on security overwatch, keep Miriam on quarantine triage, and have Imani preserve the secured hold inventory for the missing cargo module.'],
  ['turn.fresh-mvp.chapter1.pell-contact-terms', 'pell-contact-terms', 'Open a channel to Pell, acknowledge Compact emergency concerns, offer a joint medical and cargo inspection, share the Faraday logs and manifest, request Ivers and the detained officers be released for supervised questioning, and set a legal undertaking to recover the missing emergency transponder hardware while Imani preserves evidence.'],
  ['turn.fresh-mvp.chapter1.joint-inspection-release', 'joint-inspection-release-cargo', 'Execute the joint inspection team now: Priya opens a shared inspection record and gives Pell a lawful exit through a Compact official, Bronn secures Ivers and the detained officers for supervised release and questioning, Imani seals the cargo evidence chain around the emergency hardware, and Rowan verifies the manifest without public claims.'],
  ['turn.fresh-mvp.chapter1.cargo-diagnostic-pulse', 'cargo-diagnostic-pulse', 'Trace the diagnostic pulse with Rowan and Imani, keep the emergency hardware under joint seal and shared custody, have Priya preserve Pell\'s lawful exit, and have Bronn hold a non-hostile intercept posture with defensive shields, no targeting solution, and the cargo evidence chain intact.'],
  ['turn.fresh-mvp.chapter1.hardware-recovery', 'hardware-recovery-under-seal', 'Recover the emergency hardware with Imani and Rowan, preserve the diagnostic trace and recovery telemetry for comparison against the warning, keep the hardware under a joint evidence seal pending final custody review, preserve Pell\'s lawful exit, and have Bronn maintain defensive non-hostile security.'],
  ['turn.fresh-mvp.chapter1.resolution-terms', 'chapter-1-resolution-terms', 'Create a joint incident record for Starfleet and Compact access, have Ivers remain a witness because she trusts the record, record Pell as a lawful witness with cooperation terms, preserve joint custody terms for the recovered emergency hardware, publicly acknowledge the Starfleet authentication failure, and document Parnell technical debt for engineering follow-up.'],
  ['turn.fresh-mvp.chapter1.false-colors-transition', 'asterion-arrival-false-colors', 'Bring the joint incident record into the Asterion Station formal briefing, notify Asterion, Starfleet, and Compact authorities, receive the Compact patrol report about an attack by a vessel identifying itself as the U.S.S. Breckenridge, have Rowan begin verification, and have Bronn hold a defensive non-hostile posture.']
];

let state = preludeState;
for (const [turnId, expectedPhase, playerInput] of chapter1Turns) {
  state = commitChapter1Input({
    campaignState: state,
    graph: chapter1Graph,
    projection,
    crewDataset,
    turnId,
    playerInput
  });
  assert.equal(state.mission.activePhaseId, expectedPhase);
}

assert.equal(state.mission.endState, 'chapter-1-transition-to-false-colors');
assert.equal(state.mainCampaign.completedChapters.includes('chapter-1-the-empty-convoy'), true);
assert.equal(state.mainCampaign.availableChapters.includes('chapter-2-false-colors'), true);
assert.equal(state.mainCampaign.chapterCursor, 'chapter-2-false-colors');
assert.equal(state.mission.knownFacts.includes('chapter-1.compact-patrol-false-colors-report'), true);
assert.equal(state.mission.knownFacts.includes('chapter-1.truth.compact-recovery-team'), false);
assert.equal(state.mission.knownFacts.includes('chapter-1.truth.no-pathogen'), false);
assertHiddenTermsAbsent(state.commandLog.entries);

const opportunities = detectPostChapter1SideMissionOpportunities({
  campaignState: state,
  packageData,
  maxCandidates: 4
});
assert.equal(opportunities.packageGuard.eligible, true);
assert.equal(opportunities.modelCallsUsed, false);
assert.equal(opportunities.candidates.some((candidate) => candidate.opportunityId === 'chapter1-missing-hardware-audit'), true);
assert.equal(opportunities.candidates.some((candidate) => candidate.opportunityId === 'chapter1-pell-terms-follow-up'), true);
assertHiddenTermsAbsent(opportunities);

const scheduled = applySideMissionOpportunityReview({
  campaignState: state,
  packageData,
  opportunityId: 'chapter1-missing-hardware-audit',
  decision: 'schedule',
  reviewId: 'opportunity-review.fresh-mvp-hardware',
  reviewedAt: '2026-06-19T19:00:00.000Z',
  maxCandidates: 4
});
const opened = applySideMissionOpportunitySceneStart({
  campaignState: scheduled.campaignState,
  opportunityId: 'chapter1-missing-hardware-audit',
  sceneId: 'side-opportunity-scene.fresh-mvp-hardware',
  sceneStartedAt: '2026-06-19T19:05:00.000Z',
  reason: 'Fresh MVP journey follow-up scene smoke.'
});
const resolved = applySideMissionOpportunityResolution({
  campaignState: opened.campaignState,
  opportunityId: 'chapter1-missing-hardware-audit',
  resolutionId: 'side-opportunity-resolution.fresh-mvp-hardware',
  resolvedAt: '2026-06-19T19:10:00.000Z',
  outcomeBand: 'Success',
  assignmentMode: 'direct',
  reason: 'Fresh MVP journey follow-up resolution smoke.'
});
assert.equal(resolved.resolutionRecord.status, 'completed');
assert.equal(resolved.campaignState.commandLog.entries.some((entry) => entry.type === 'sideMissionOpportunityResolution'), true);
assertHiddenTermsAbsent(resolved.resolutionRecord);

const loadedFinal = cloneJson(resolved.campaignState);
assert.deepEqual(loadedFinal.mission, resolved.campaignState.mission);
assert.deepEqual(loadedFinal.mainCampaign, resolved.campaignState.mainCampaign);
assert.deepEqual(loadedFinal.sideMissions.completedOpportunities, resolved.campaignState.sideMissions.completedOpportunities);

console.log('Fresh MVP runtime journey passed: Character Creator, full Prelude, complete Chapter 1, follow-up side work, save/load clone, and hidden-source safety');
