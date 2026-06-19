import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { deleteCommittedOutcome } from '../../src/campaign/transaction-state.mjs';
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

function chapter1State(projection, { simulationMode = 'Command' } = {}) {
  const state = cloneJson(projection.initialState);
  state.player.name = 'Talia Serrin';
  state.player.creationStatus = 'ready';
  state.campaign.currentStardate = 53076.6;
  state.settings.simulationMode = simulationMode;
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
    graphPath: 'packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json',
    projectionPath: 'packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json',
    turnId,
    playerInput
  });
}

function commitInput({ campaignState, graph, projection, crewDataset, turnId, playerInput, confirmWarnings = false }) {
  const preview = previewChapter1({ campaignState, graph, projection, crewDataset, turnId, playerInput });
  return commitProvisionalDirectorTurnRuntime({
    campaignState,
    turnPacket: preview.turnPacket,
    confirmWarnings,
    confirmedWarningIds: preview.warningConfirmation.warningIds || []
  });
}

const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const chapter1Graph = readJson('packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');

const balanced = commitInput({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage26.balanced',
  playerInput: 'Take us in, prepare quarantine isolation and rescue teams, preserve the raw signal and computer logs, and verify before boarding.'
});
assert.equal(balanced.turnPacket.outcomePacket.resultBand, 'Success');
assert.equal(flagValue(balanced.campaignState, 'chapter-1.initial-response-posture'), 'balanced-rescue-verification');
assert.equal(flagValue(balanced.campaignState, 'chapter-1.convoy-evidence'), 'clean-chain-started');
assert.equal(flagValue(balanced.campaignState, 'chapter-1.rescue-urgency'), 'stabilized-initially');
assert.equal(flagValue(balanced.campaignState, 'chapter-1.quarantine-confidence'), 'procedure-active');
assert.equal(flagValue(balanced.campaignState, 'chapter-1.compact-posture'), 'security-watch');
assert.equal(flagValue(balanced.campaignState, 'chapter-1.missing-module-lead'), 'lead-preserved');
assert.equal(balanced.campaignState.mission.activePhaseId, 'convoy-approach');
assert.equal(balanced.campaignState.commandStyle.inspiration.marks, 1);
assert.equal(balanced.campaignState.commandStyle.resolve.marks, 1);
assert.equal(pressureIds(balanced.campaignState).includes('pressure.ship.imani-technical-debt'), true);
assert.equal(pressureIds(balanced.campaignState).includes('pressure.regional.convoy-first-impression'), true);
assert.equal(pressureIds(balanced.campaignState).includes('pressure.obligation.convoy-evidence-custody'), true);
assert.equal(
  balanced.campaignState.commandLog.entries.at(-1).visibleConsequences.some((item) => item.startsWith('Pressure recorded:')),
  true
);
assertHiddenTermsAbsent(balanced.turnPacket);

const evidenceFirst = commitInput({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage26.evidence',
  playerInput: 'Hold range, take a cautious approach, preserve the convoy computer core and signal records, and run remote scans before anyone boards.'
});
assert.equal(evidenceFirst.turnPacket.outcomePacket.resultBand, 'Partial Success');
assert.equal(flagValue(evidenceFirst.campaignState, 'chapter-1.initial-response-posture'), 'evidence-first-cautious');
assert.equal(flagValue(evidenceFirst.campaignState, 'chapter-1.rescue-urgency'), 'delayed-by-verification');
assert.equal(flagValue(evidenceFirst.campaignState, 'chapter-1.convoy-evidence'), 'clean-chain-started');
assert.equal(clockValue(evidenceFirst.campaignState, 'chapter-1.rescue-window'), 1);
assert.equal(pressureIds(evidenceFirst.campaignState).includes('pressure.obligation.convoy-rescue-delay'), true);

const securityFirst = commitInput({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage26.security',
  playerInput: 'Hold range, raise shields, keep security teams ready, and run remote tactical reconnaissance before closing.'
});
assert.equal(securityFirst.turnPacket.outcomePacket.resultBand, 'Partial Success');
assert.equal(flagValue(securityFirst.campaignState, 'chapter-1.initial-response-posture'), 'security-first-remote-recon');
assert.equal(pressureIds(securityFirst.campaignState).includes('pressure.obligation.convoy-rescue-delay'), true);

const rescueFirst = commitInput({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage26.rescue',
  playerInput: 'Take us in at best speed and prepare rescue teams, sickbay, and medical aid.'
});
assert.equal(rescueFirst.turnPacket.outcomePacket.resultBand, 'Partial Success');
assert.equal(flagValue(rescueFirst.campaignState, 'chapter-1.initial-response-posture'), 'rescue-first-approach');
assert.equal(flagValue(rescueFirst.campaignState, 'chapter-1.rescue-urgency'), 'accelerated-with-risk');
assert.equal(pressureIds(rescueFirst.campaignState).includes('pressure.regional.convoy-first-impression'), true);

const diplomacyFirst = commitInput({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage26.diplomacy',
  playerInput: 'Hold position and coordinate with Asterion civil authority and Compact channels before the Breckinridge commits the ship.'
});
assert.equal(diplomacyFirst.turnPacket.outcomePacket.resultBand, 'Partial Success');
assert.equal(flagValue(diplomacyFirst.campaignState, 'chapter-1.initial-response-posture'), 'diplomacy-coordination-first');
assert.equal(flagValue(diplomacyFirst.campaignState, 'chapter-1.compact-posture'), 'coordinating');
assert.equal(pressureIds(diplomacyFirst.campaignState).includes('pressure.regional.convoy-first-impression'), true);

const noGotchaPreview = previewChapter1({
  campaignState: chapter1State(projection),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage26.no-gotcha',
  playerInput: 'Take us in and prepare medical aid.'
});
assert.equal(noGotchaPreview.warningConfirmation.required, false);
assert.equal(
  noGotchaPreview.turnPacket.competencePacket.routineActions.some((action) => action.id === 'routine.distress.log-auth-preserve'),
  true
);

const warningState = chapter1State(projection);
const quarantinePreview = previewChapter1({
  campaignState: warningState,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage26.quarantine',
  playerInput: 'Beam any survivors directly to unrestricted sickbay and waive isolation if it saves time.'
});
assert.equal(quarantinePreview.warningConfirmation.required, true);
assert.deepEqual(quarantinePreview.warningConfirmation.warningIds, ['warning.waive-quarantine-isolation']);
const quarantineCommit = commitProvisionalDirectorTurnRuntime({
  campaignState: warningState,
  turnPacket: quarantinePreview.turnPacket,
  confirmWarnings: true,
  confirmedWarningIds: quarantinePreview.warningConfirmation.warningIds
});
assert.equal(pressureIds(quarantineCommit.campaignState).includes('pressure.obligation.quarantine-exception-review'), true);
assert.equal(flagValue(quarantineCommit.campaignState, 'chapter-1.quarantine-confidence'), 'exception-logged');

const commandHazard = previewChapter1({
  campaignState: chapter1State(projection, { simulationMode: 'Command' }),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage26.command-hazard',
  playerInput: 'Open fire on the silent convoy before they can spring a trap.'
});
const explorationHazard = previewChapter1({
  campaignState: chapter1State(projection, { simulationMode: 'Exploration' }),
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage26.exploration-hazard',
  playerInput: 'Open fire on the silent convoy before they can spring a trap.'
});
assert.equal(commandHazard.provisionalOutcome.resultBand, 'Great Failure');
assert.equal(explorationHazard.provisionalOutcome.resultBand, 'Partial Failure');
assert.equal(explorationHazard.provisionalOutcome.simulationPolicy.severityCeilingApplied, true);

const replacementPreview = previewChapter1({
  campaignState: quarantineCommit.campaignState.turnLedger.entries.at(-1).snapshotBefore,
  graph: chapter1Graph,
  projection,
  crewDataset,
  turnId: 'turn.stage26.replacement',
  playerInput: 'Take us in, prepare quarantine isolation, preserve evidence, and verify before boarding.'
});
const replacementCommit = commitProvisionalDirectorTurnRuntime({
  campaignState: quarantineCommit.campaignState.turnLedger.entries.at(-1).snapshotBefore,
  turnPacket: replacementPreview.turnPacket
});
assert.equal(pressureIds(replacementCommit.campaignState).includes('pressure.obligation.quarantine-exception-review'), false);
assert.equal(pressureIds(replacementCommit.campaignState).includes('pressure.regional.convoy-first-impression'), true);

const saveLoaded = cloneJson(balanced.campaignState);
assert.deepEqual(pressureIds(saveLoaded), pressureIds(balanced.campaignState), 'pressure survives save/load clone');
const branch = cloneJson(balanced.campaignState);
branch.campaign.id = 'branch-stage26-pressure';
assert.deepEqual(pressureIds(branch), pressureIds(balanced.campaignState), 'pressure survives branch clone');
const deleted = deleteCommittedOutcome(balanced.campaignState, balanced.turnPacket.outcomePacket.id);
assert.deepEqual(pressureIds(deleted), [], 'delete restores pre-outcome pressure state');

console.log('Stage 26-28 runtime tests passed: first-response paths, warnings, no-gotcha support, mode pair, pressure persistence, replacement, and delete rollback');
