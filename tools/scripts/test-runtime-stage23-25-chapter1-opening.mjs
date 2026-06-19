import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { planCommandCompetence } from '../../src/competence/competence-planner.mjs';
import {
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntime
} from '../../src/runtime/director-turn-runtime.mjs';
import { recordNarrationSuccess } from '../../src/campaign/transaction-state.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function ids(records = []) {
  return records.map((record) => record.id);
}

function assertHiddenTermsAbsent(value) {
  const text = JSON.stringify(value).toLowerCase();
  for (const term of [
    'lantern',
    'compact recovery team',
    'no pathogen',
    'false quarantine order',
    'transponder modules'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }
}

function chapter1State(projection) {
  const state = cloneJson(projection.initialState);
  state.player.name = 'Talia Serrin';
  state.player.creationStatus = 'ready';
  state.campaign.currentStardate = 53076.6;
  state.mission = {
    ...state.mission,
    activeMissionId: 'chapter-1-the-empty-convoy',
    activeMissionGraphId: 'breckinridge.ashes-of-peace.chapter-1-the-empty-convoy',
    activeMissionGraphPath: 'packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json',
    activePhaseId: 'initial-reception',
    phase: 'initial-reception',
    knownFacts: ['chapter-1.relief-convoy-distress-packet'],
    availableDecisionPointIds: ['decision.initial-convoy-posture']
  };
  return state;
}

function previewChapter1({ campaignState, graph, projection, crewDataset, turnId, playerInput }) {
  return createProvisionalDirectorTurnRuntime({
    campaignState,
    graph,
    projection,
    crewDataset,
    graphPath: 'packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json',
    projectionPath: 'packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json',
    turnId,
    playerInput
  });
}

const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const preludeGraph = readJson('packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json');
const chapter1Graph = readJson('packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');

const baseScene = {
  campaignId: 'ashes-of-peace',
  missionId: 'chapter-1-the-empty-convoy',
  activeMissionGraphId: 'breckinridge.ashes-of-peace.chapter-1-the-empty-convoy',
  activePhaseId: 'initial-reception',
  stardate: 53076.6,
  presentCharacters: ['player-commander', 'mara-whitaker', 'priya-nayar', 'hadrik-bronn', 'rowan-saye', 'miriam-sato', 'imani-cross'],
  knownFactIds: ['chapter-1.relief-convoy-distress-packet'],
  conditionIds: ['chapter-1.relief-convoy-distress-packet'],
  activeDecisionPointIds: ['decision.initial-convoy-posture']
};

const defaultPacket = planCommandCompetence({
  policy: chapter1Graph.competencePolicy,
  sceneSnapshot: {
    ...baseScene,
    playerInput: 'Take us in and prepare to help. Start verifying the signal while we assess rescue posture.'
  },
  campaignState: chapter1State(projection),
  sourceTurnId: 'turn.stage23.default'
});
assert.deepEqual(ids(defaultPacket.domainReports), [
  'report.priya.quarantine-code-impossible',
  'report.bronn.silent-convoy-trap-risk'
]);
assert.equal(defaultPacket.requestCounsel.requested, false);
assert.equal(defaultPacket.domainReports.every((report) => report.recommendation === null), true);
assertHiddenTermsAbsent(defaultPacket);

const broadCounselPacket = planCommandCompetence({
  policy: chapter1Graph.competencePolicy,
  sceneSnapshot: {
    ...baseScene,
    playerInput: 'Recommendations? What am I overlooking before I decide?'
  },
  campaignState: chapter1State(projection),
  sourceTurnId: 'turn.stage23.broad'
});
assert.equal(broadCounselPacket.requestCounsel.requested, true);
assert.equal(broadCounselPacket.requestCounsel.scope, 'broad');
assert.equal(broadCounselPacket.domainReports.length, 4);
assert.equal(broadCounselPacket.domainReports.every((report) => report.recommendation), true);
assertHiddenTermsAbsent(broadCounselPacket);

const medicalCounselPacket = planCommandCompetence({
  policy: chapter1Graph.competencePolicy,
  sceneSnapshot: {
    ...baseScene,
    playerInput: 'Doctor, what is the medical risk?'
  },
  campaignState: chapter1State(projection),
  sourceTurnId: 'turn.stage23.medical'
});
assert.equal(medicalCounselPacket.requestCounsel.scope, 'domain');
assert.deepEqual(medicalCounselPacket.requestCounsel.domains, ['medical']);
assert.deepEqual(ids(medicalCounselPacket.domainReports), ['report.miriam.quarantine-until-cleared']);
assert.equal(medicalCounselPacket.domainReports[0].recommendation.includes('isolation'), true);

const warningState = chapter1State(projection);
const warningPreview = previewChapter1({
  campaignState: warningState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage24.quarantine.001',
  playerInput: 'Beam any survivors directly to unrestricted sickbay and waive isolation if it saves time.'
});
assert.equal(warningPreview.warningConfirmation.required, true);
assert.deepEqual(warningPreview.warningConfirmation.warningIds, ['warning.waive-quarantine-isolation']);
assert.throws(
  () => commitProvisionalDirectorTurnRuntime({
    campaignState: warningState,
    turnPacket: warningPreview.turnPacket
  }),
  /Procedural warning confirmation required/
);

const revisedPreview = previewChapter1({
  campaignState: warningState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage24.revised.001',
  playerInput: 'Take us in, preserve the raw signal, prepare quarantine isolation, and verify before boarding.'
});
assert.equal(revisedPreview.warningConfirmation.required, false);
assert.deepEqual(ids(revisedPreview.turnPacket.competencePacket.proceduralWarnings), []);

const confirmed = commitProvisionalDirectorTurnRuntime({
  campaignState: warningState,
  turnPacket: warningPreview.turnPacket,
  confirmWarnings: true,
  confirmedWarningIds: warningPreview.warningConfirmation.warningIds
});
assert.equal(confirmed.campaignState.commandCompetence.warningLedger.at(-1).confirmed, true);
assert.equal(confirmed.campaignState.commandCompetence.acceptedRiskLedger.at(-1).sourceWarningId, 'warning.waive-quarantine-isolation');
const repeatedWarningPreview = previewChapter1({
  campaignState: confirmed.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage24.quarantine-repeat.001',
  playerInput: 'Beam any survivors directly to unrestricted sickbay and waive isolation if it saves time.'
});
assert.equal(repeatedWarningPreview.warningConfirmation.required, false);
assert.deepEqual(ids(repeatedWarningPreview.turnPacket.competencePacket.proceduralWarnings), []);
const narrated = recordNarrationSuccess(confirmed.campaignState, confirmed.turnPacket.outcomePacket.id, {
  providerId: 'test',
  text: 'Narration rewrite.',
  generatedAt: '2376-01-01T00:00:00.000Z'
});
assert.equal(narrated.commandCompetence.acceptedRiskLedger.length, confirmed.campaignState.commandCompetence.acceptedRiskLedger.length);

const replacementPreview = previewChapter1({
  campaignState: confirmed.campaignState.turnLedger.entries.at(-1).snapshotBefore,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage24.replacement.001',
  playerInput: 'Take us in, prepare quarantine isolation, preserve evidence, and verify before boarding.'
});
const replacement = commitProvisionalDirectorTurnRuntime({
  campaignState: confirmed.campaignState.turnLedger.entries.at(-1).snapshotBefore,
  turnPacket: replacementPreview.turnPacket
});
assert.equal(replacement.campaignState.commandCompetence.warningLedger.length, 0);
assert.equal(replacement.campaignState.commandCompetence.acceptedRiskLedger.length, 0);

const criticalPreview = previewChapter1({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage24.weapons.001',
  playerInput: 'Open fire on the silent convoy before they can spring a trap.'
});
assert.equal(criticalPreview.warningConfirmation.severity, 'critical');
assert.deepEqual(criticalPreview.warningConfirmation.criticalWarningIds, ['warning.open-fire-without-hostile-act']);

const authorityPreview = previewChapter1({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage24.compact-authority.001',
  playerInput: 'Prepare to detain Compact personnel if they are aboard, but ask Whitaker where my authority ends.'
});
assert.equal(
  ids(authorityPreview.turnPacket.competencePacket.authorityNotes).includes('authority.compact-jurisdiction-dispute'),
  true
);

const finalReviewState = cloneJson(projection.initialState);
finalReviewState.player.name = 'Talia Serrin';
finalReviewState.player.creationStatus = 'ready';
finalReviewState.mission.activePhaseId = 'final-command-review';
finalReviewState.mission.phase = 'final-command-review';
finalReviewState.mission.availableDecisionPointIds = ['decision.final-readiness-report'];
finalReviewState.mission.knownFacts = [
  'ship.post-refit-shakedown-underway',
  'crew.acting-xo-handoff',
  'ship.combined-load-risk'
];
const finalPreview = createProvisionalDirectorTurnRuntime({
  campaignState: finalReviewState,
  graph: preludeGraph,
  projection,
  crewDataset,
  graphPath: 'packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json',
  projectionPath: 'packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json',
  turnId: 'turn.stage25.final-review.001',
  playerInput: 'I give Whitaker an honest readiness report, name unresolved engineering strain, ask for clear captain support, and send department orders before arrival.'
});
const finalCommit = commitProvisionalDirectorTurnRuntime({
  campaignState: finalReviewState,
  turnPacket: finalPreview.turnPacket
});
assert.equal(finalCommit.campaignState.mission.activeMissionId, 'chapter-1-the-empty-convoy');
assert.equal(finalCommit.campaignState.mission.activeMissionGraphId, 'breckinridge.ashes-of-peace.chapter-1-the-empty-convoy');
assert.equal(finalCommit.campaignState.mission.activeMissionGraphPath, 'packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json');
assert.equal(finalCommit.campaignState.mission.activePhaseId, 'initial-reception');
assert.deepEqual(finalCommit.campaignState.mission.availableDecisionPointIds, ['decision.initial-convoy-posture']);

const openingPreview = previewChapter1({
  campaignState: finalCommit.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage25.opening.001',
  playerInput: 'Take us in, prepare to help, preserve the raw signal and computer evidence, maintain quarantine isolation, and verify before boarding.'
});
assert.equal(openingPreview.turnPacket.intentParse.primaryIntent, 'set-initial-convoy-posture');
assert.equal(openingPreview.provisionalOutcome.resultBand, 'Success');
assert.equal(openingPreview.turnPacket.competencePacket.commandBrief.commandQuestion.id, 'question.initial-convoy-posture');
assert.deepEqual(ids(openingPreview.turnPacket.competencePacket.routineActions), [
  'routine.distress.log-auth-preserve',
  'routine.distress.medical-engineering-ready'
]);
assertHiddenTermsAbsent(openingPreview.turnPacket);

const openingCommit = commitProvisionalDirectorTurnRuntime({
  campaignState: finalCommit.campaignState,
  turnPacket: openingPreview.turnPacket
});
assert.equal(
  openingCommit.campaignState.mission.outcomeFlags.find((flag) => flag.id === 'chapter-1.initial-response-posture').value,
  'balanced-rescue-verification'
);
assert.equal(openingCommit.campaignState.mission.activePhaseId, 'convoy-approach');

console.log('Stage 23-25 Chapter 1 runtime tests passed: counsel, warnings, accepted risks, transition, opening posture');
