import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntime
} from '../../src/runtime/director-turn-runtime.mjs';

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

function clockValue(state, clockId) {
  return (state.clocks || []).find((clock) => clock.id === clockId)?.value;
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

function commitInput({ campaignState, graph, projection, crewDataset, turnId, playerInput, confirmWarnings = false }) {
  const preview = previewChapter1({ campaignState, graph, projection, crewDataset, turnId, playerInput });
  return {
    preview,
    commit: commitProvisionalDirectorTurnRuntime({
      campaignState,
      turnPacket: preview.turnPacket,
      confirmWarnings,
      confirmedWarningIds: preview.warningConfirmation.warningIds || []
    })
  };
}

const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const chapter1Graph = readJson('packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');

const opening = commitInput({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage31.initial-response',
  playerInput: 'Hold range, preserve convoy computer logs and signal records, and run remote scans before anyone boards.'
}).commit;

assert.equal(opening.campaignState.mission.activePhaseId, 'convoy-approach');
assert.deepEqual(opening.campaignState.mission.availableDecisionPointIds, ['decision.first-boarding-threshold']);
assert.equal(pressureIds(opening.campaignState).includes('pressure.obligation.convoy-rescue-delay'), true);
assert.equal(pressureIds(opening.campaignState).includes('pressure.obligation.convoy-evidence-custody'), true);

const threshold = commitInput({
  campaignState: opening.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage31.boarding-threshold',
  playerInput: 'Take us in for first contact, but no boarding until remote scans verify the threshold, quarantine isolation is ready, security overwatch is staged, rescue teams are prepared, and Imani owns evidence custody for the convoy logs.'
});

assert.equal(threshold.preview.turnPacket.intentParse.primaryIntent, 'set-first-boarding-threshold');
assert.equal(threshold.preview.turnPacket.actionClassification.category, 'validWithinMissionBounds');
assert.equal(threshold.preview.turnPacket.authorityCapabilityCheck.result, 'authorizedAndFeasibleWithOperationalRisk');
const thresholdReports = ids(threshold.preview.competencePacket.domainReports);
assert.equal(thresholdReports.includes('report.miriam.rescue-delay-pressure'), true);
assert.equal(thresholdReports.includes('report.imani.evidence-custody-pressure'), true);
assert.equal(threshold.commit.turnPacket.outcomePacket.resultBand, 'Success');
assert.equal(threshold.commit.campaignState.mission.activePhaseId, 'first-committed-response');
assert.deepEqual(threshold.commit.campaignState.mission.availableDecisionPointIds, ['decision.first-contact-execution']);
assert.equal(flagValue(threshold.commit.campaignState, 'chapter-1.quarantine-posture'), 'active');
assert.equal(flagValue(threshold.commit.campaignState, 'chapter-1.quarantine-confidence'), 'procedure-active');
assert.equal(flagValue(threshold.commit.campaignState, 'chapter-1.evidence-custody'), 'preserved-initially');
assert.equal(flagValue(threshold.commit.campaignState, 'chapter-1.convoy-evidence'), 'clean-chain-started');
assert.equal(flagValue(threshold.commit.campaignState, 'chapter-1.rescue-urgency'), 'stabilized-initially');
assert.equal(flagValue(threshold.commit.campaignState, 'chapter-1.missing-module-lead'), 'lead-preserved');
assert.equal(threshold.commit.campaignState.mission.knownFacts.includes('chapter-1.no-biosignature-at-range'), true);
assert.equal(clockValue(threshold.commit.campaignState, 'chapter-1.rescue-window'), 0);
assert.equal(clockValue(threshold.commit.campaignState, 'chapter-1.security-exposure'), 0);
assert.equal(clockValue(threshold.commit.campaignState, 'chapter-1.evidence-volatility'), 0);
assert.equal(pressureIds(threshold.commit.campaignState).includes('pressure.obligation.convoy-rescue-delay'), true);
assert.match(
  threshold.commit.campaignState.commandLog.entries.at(-1).summaryInputs.join(' '),
  /first Relief Convoy Twelve boarding/
);
assertHiddenTermsAbsent(threshold.preview.turnPacket);
assertHiddenTermsAbsent(threshold.commit.turnPacket);

const hazard = commitInput({
  campaignState: opening.campaignState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage31.quarantine-exception',
  playerInput: 'Beam any survivors directly to unrestricted sickbay and waive isolation if it saves time.',
  confirmWarnings: true
});

assert.equal(hazard.preview.turnPacket.intentParse.primaryIntent, 'set-first-boarding-threshold');
assert.equal(hazard.preview.warningConfirmation.required, true);
assert.deepEqual(hazard.preview.warningConfirmation.warningIds, ['warning.waive-quarantine-isolation']);
assert.equal(hazard.commit.turnPacket.outcomePacket.resultBand, 'Partial Failure');
assert.equal(hazard.commit.campaignState.mission.activePhaseId, 'convoy-approach');
assert.equal(flagValue(hazard.commit.campaignState, 'chapter-1.quarantine-posture'), 'bypassed');
assert.equal(flagValue(hazard.commit.campaignState, 'chapter-1.quarantine-confidence'), 'exception-logged');
assert.equal(clockValue(hazard.commit.campaignState, 'chapter-1.security-exposure'), 2);
assertHiddenTermsAbsent(hazard.preview.turnPacket);
assertHiddenTermsAbsent(hazard.commit.turnPacket);

console.log('Stage 31 Chapter 1 boarding-threshold tests passed: first-contact threshold, pressure-aware reports, warnings, phase advance, and hidden-truth safety');
