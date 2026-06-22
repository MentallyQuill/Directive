import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntime
} from '../../src/runtime/director-turn-runtime.mjs';
import { selectSideMissionCandidates } from '../../src/pressures/side-mission-candidates.mjs';

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

function pressureIds(state) {
  return (state.pressureLedger?.records || []).map((record) => record.id);
}

function flagValue(state, flagId) {
  return (state.mission?.outcomeFlags || []).find((flag) => flag.id === flagId)?.value;
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
    activeMissionGraphId: 'breckenridge.ashes-of-peace.chapter-1-the-empty-convoy',
    activeMissionGraphPath: 'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
    activePhaseId: 'initial-reception',
    phase: 'initial-reception',
    knownFacts: ['chapter-1.relief-convoy-distress-packet'],
    availableDecisionPointIds: ['decision.initial-convoy-posture']
  };
  state.pressureLedger = {
    records: [],
    candidateReviews: [],
    rawValuesHidden: true
  };
  return state;
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

const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const chapter1Graph = readJson('packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');

const openingState = chapter1State(projection);
const firstResponsePreview = previewChapter1({
  campaignState: openingState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage29.first-response',
  playerInput: 'Hold range, preserve convoy computer logs and signal records, and run remote scans before anyone boards.'
});
const firstResponse = commitProvisionalDirectorTurnRuntime({
  campaignState: openingState,
  turnPacket: firstResponsePreview.turnPacket
});

assert.equal(firstResponse.campaignState.mission.activePhaseId, 'convoy-approach');
assert.equal(flagValue(firstResponse.campaignState, 'chapter-1.convoy-evidence'), 'clean-chain-started');
assert.equal(flagValue(firstResponse.campaignState, 'chapter-1.rescue-urgency'), 'delayed-by-verification');
assert.equal(flagValue(firstResponse.campaignState, 'chapter-1.quarantine-confidence'), 'unresolved');
assert.equal(flagValue(firstResponse.campaignState, 'chapter-1.compact-posture'), 'security-watch');
assert.equal(flagValue(firstResponse.campaignState, 'chapter-1.missing-module-lead'), 'lead-preserved');
assert.equal(pressureIds(firstResponse.campaignState).includes('pressure.obligation.convoy-rescue-delay'), true);
assert.equal(pressureIds(firstResponse.campaignState).includes('pressure.obligation.convoy-evidence-custody'), true);

const regionalPressure = firstResponse.campaignState.pressureLedger.records.find((record) => record.id === 'pressure.regional.convoy-first-impression');
assert.deepEqual(regionalPressure.linkedDecisionPointIds, ['decision.first-boarding-threshold']);
assert.equal(regionalPressure.linkedChapterIds.includes('open-orders-1-work-worth-doing'), true);
assert.equal(regionalPressure.linkedTemplateIds.includes('side-quiet-channels'), true);

const followupPreview = previewChapter1({
  campaignState: firstResponse.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage29.pressure-followup',
  playerInput: 'Before boarding, review rescue delay and evidence custody pressure.'
});
const followupReports = ids(followupPreview.competencePacket.domainReports);
assert.deepEqual(followupReports.slice(0, 2), [
  'report.miriam.rescue-delay-pressure',
  'report.imani.evidence-custody-pressure'
]);
assert.equal(
  ids(followupPreview.competencePacket.commandBrief.operationalPressure).includes('brief.pressure.obligation.convoy-rescue-delay'),
  true
);
assert.equal(
  ids(followupPreview.competencePacket.commandBrief.operationalPressure).includes('brief.pressure.obligation.convoy-evidence-custody'),
  true
);
assertHiddenTermsAbsent(followupPreview.competencePacket);

const openOrdersState = cloneJson(firstResponse.campaignState);
openOrdersState.mainCampaign.completedChapters = ['prelude-a-ship-underway', 'chapter-1-the-empty-convoy', 'chapter-2-false-colors'];
openOrdersState.mainCampaign.availableChapters = ['open-orders-1-work-worth-doing'];
const candidates = selectSideMissionCandidates({
  campaignState: openOrdersState,
  packageData
});
assert.equal(candidates.candidates.some((candidate) => candidate.sideAssignmentId === 'side-quiet-channels'), true);
assertHiddenTermsAbsent(candidates);

console.log('Stage 29-30 pressure handoff tests passed: Chapter 1 flags, pressure links, competence pressure reports, Open Orders candidate, and hidden-truth safety');
