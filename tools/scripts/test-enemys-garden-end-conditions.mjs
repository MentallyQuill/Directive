import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyPushOnContinuationFrame,
  detectCampaignEndCondition
} from '../../src/campaign/end-conditions.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';
import { terminalDecisionLedgerView } from '../../src/runtime/terminal-decision-ledger-view.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const packageData = readJson('packages/bundled/celandine/enemys-garden.campaign-package.json');
const projection = readJson('packages/bundled/celandine/enemys-garden.campaign-projection.json');

function baseState() {
  const snapshotBefore = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
  snapshotBefore.campaign = {
    ...(snapshotBefore.campaign || {}),
    id: 'enemys-garden-end-condition-test',
    status: 'active',
    checkpointMarker: 'before-terminal-outcome'
  };
  snapshotBefore.settings = { ...(snapshotBefore.settings || {}), simulationMode: 'Command' };
  snapshotBefore.ship = { ...(snapshotBefore.ship || {}), status: 'operational' };

  const state = initializeCampaignRuntimeTracking(cloneJson(snapshotBefore));
  state.flags = {};
  state.settings = { ...(state.settings || {}), simulationMode: 'Command' };
  state.turnLedger = {
    entries: [
      {
        turnId: 'turn.enemys-garden-end-condition-test',
        outcomeId: 'outcome.enemys-garden-end-condition-test',
        resultBand: 'Failure',
        tags: ['end-condition-fixture'],
        coreCheckpointRef: {
          kind: 'directive.coreMechanicsCheckpointRef.v1',
          campaignId: 'enemys-garden-end-condition-test',
          saveId: 'save-enemys-garden-end-condition-test',
          checkpointId: 'core-checkpoint-enemys-garden-end-condition-test',
          layout: 'core',
          sourceKind: 'coreStoreV2.checkpoint',
          sourceRevision: 1
        },
        snapshotBefore
      }
    ],
    lastCommittedOutcomeId: 'outcome.enemys-garden-end-condition-test',
    swipeRerollForbidden: true
  };
  return state;
}

function trackRecords(state) {
  return state.campaignTracks?.records || state.campaignTracks || [];
}

function setTrack(state, trackId, value) {
  const record = trackRecords(state).find((item) => item.id === trackId);
  assert.ok(record, `missing track ${trackId}`);
  record.value = value;
  return state;
}

function setQuestStatus(state, questId, status) {
  const quest = state.questLedger.instances.find((item) => item.id === questId || item.templateId === questId);
  assert.ok(quest, `missing quest ${questId}`);
  quest.status = status;
  return state;
}

function observeEvent(state, eventId) {
  state.eventLedger = {
    ...(state.eventLedger || {}),
    committedEvents: [
      ...(state.eventLedger?.committedEvents || []),
      { id: eventId, type: eventId }
    ]
  };
  return state;
}

function detect(state, options = {}) {
  return detectCampaignEndCondition({
    campaignState: state,
    packageContext: packageData,
    outcomeId: 'outcome.enemys-garden-end-condition-test',
    turnId: 'turn.enemys-garden-end-condition-test',
    now: '2026-06-24T10:00:00.000Z',
    ...options
  });
}

function requireCondition(state, conditionId, expectedFinalBand = null) {
  const result = detect(state);
  assert.equal(result?.matched, true, `expected ${conditionId} to match`);
  assert.equal(result.conditionId, conditionId);
  assert.equal(result.pendingInteraction.kind, 'terminalOutcomeDecision');
  assert.equal(result.pendingInteraction.metadata.terminalOutcomeId, conditionId);
  assert.equal(result.pendingInteraction.metadata.checkpoint.source, 'coreCheckpoint');
  assert.equal(result.pendingInteraction.metadata.checkpoint.coreCheckpointRef.checkpointId, 'core-checkpoint-enemys-garden-end-condition-test');
  assert.ok(result.pendingInteraction.options.some((option) => option.action === 'replayFromCheckpoint'));
  assert.ok(result.pendingInteraction.options.some((option) => option.action === 'keepEnding'));
  if (expectedFinalBand) assert.equal(result.finalCampaignBand, expectedFinalBand);
  return result;
}

assert.equal(packageData.endConditions.conditions.length, 13);
assert.deepEqual(Object.keys(projection.initialState.campaignTracks), ['records']);

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-what-we-plant-next', 'resolved');
  state.flags['ending-free-harvest'] = true;
  requireCondition(state, 'completion.enemys-garden.what-we-plant-next-resolved', 'Great Success');
}

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-what-we-plant-next', 'resolved');
  state.flags['ending-clean-fields-empty-stores'] = true;
  requireCondition(state, 'completion.enemys-garden.what-we-plant-next-resolved', 'Failure');
}

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-what-we-plant-next', 'resolved');
  setTrack(state, 'famine-pressure', 9);
  requireCondition(state, 'completion.enemys-garden.what-we-plant-next-resolved', 'Great Failure');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead' };
  requireCondition(state, 'terminal.enemys-garden.player-death-command', 'Great Failure');
}

{
  const state = baseState();
  state.settings.simulationMode = 'Exploration';
  state.player = { ...(state.player || {}), status: 'dead' };
  const result = detect(state);
  assert.equal(result.matched, false);
  assert.equal(result.softened, true);
  assert.equal(result.softenedConditionId, 'terminal.enemys-garden.player-death-command');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), commandStatus: 'permanently-relieved' };
  requireCondition(state, 'terminal.enemys-garden.permanent-command-removal', 'Partial Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  requireCondition(state, 'terminal.enemys-garden.celandine-destroyed-objective-failed', 'Great Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['regional-food-objective-preserved'] = true;
  requireCondition(state, 'terminal.enemys-garden.celandine-destroyed-objective-contained', 'Partial Success');
}

{
  const state = baseState();
  setTrack(state, 'famine-pressure', 10);
  requireCondition(state, 'terminal.enemys-garden.mass-famine', 'Great Failure');
}

{
  const state = baseState();
  setTrack(state, 'biomarker-spread', 9);
  observeEvent(state, 'clock.control-bloom.threshold.6');
  requireCondition(state, 'terminal.enemys-garden.control-bloom-catastrophe', 'Great Failure');
}

{
  const state = baseState();
  state.campaignTracks = cloneJson(state.campaignTracks.records);
  setTrack(state, 'ecological-health', 0);
  requireCondition(state, 'terminal.enemys-garden.ecological-collapse', 'Failure');
}

{
  const state = baseState();
  setTrack(state, 'alternative-readiness', 0);
  setTrack(state, 'famine-pressure', 8);
  requireCondition(state, 'terminal.enemys-garden.transition-capacity-collapse', 'Failure');
}

{
  const state = baseState();
  setTrack(state, 'public-trust', 0);
  setTrack(state, 'sabotage-retaliation', 8);
  requireCondition(state, 'terminal.enemys-garden.public-legitimacy-collapse', 'Partial Failure');
}

{
  const state = baseState();
  setTrack(state, 'seed-sovereignty', 0);
  state.flags['briar-unaccountable-custody'] = true;
  requireCondition(state, 'terminal.enemys-garden.seed-authority-captured', 'Partial Failure');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), commandStatus: 'resigned' };
  requireCondition(state, 'terminal.enemys-garden.player-resignation-or-transfer', 'Partial Success');
}

{
  const state = baseState();
  state.flags['player.choice.conclude-campaign'] = true;
  requireCondition(state, 'terminal.enemys-garden.player-choice-conclude', 'Success');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['regional-food-objective-preserved'] = true;
  const detection = requireCondition(state, 'terminal.enemys-garden.celandine-destroyed-objective-contained', 'Partial Success');
  const continued = applyPushOnContinuationFrame({
    campaignState: state,
    packageContext: packageData,
    frameId: 'survivors-after-celandine-loss',
    decisionId: detection.decisionId,
    conditionId: detection.conditionId,
    now: '2026-06-24T10:01:00.000Z'
  });
  assert.equal(continued.campaignState.flags['push-on.frame'], 'survivors-after-celandine-loss');
  assert.equal(continued.campaignState.player.commandAuthority, 'survivor-command');
  assert.equal(continued.campaignState.runtimeTracking.endConditionLedger.continuationFrames.length, 0);
  assert.equal(terminalDecisionLedgerView(continued.campaignState).continuationFrames.at(-1).frameId, 'survivors-after-celandine-loss');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead' };
  const detection = requireCondition(state, 'terminal.enemys-garden.player-death-command', 'Great Failure');
  const continued = applyPushOnContinuationFrame({
    campaignState: state,
    packageContext: packageData,
    frameId: 'medical-survival-and-command-gap',
    decisionId: detection.decisionId,
    conditionId: detection.conditionId,
    now: '2026-06-24T10:02:00.000Z'
  });
  assert.equal(continued.campaignState.player.commandAuthority, 'medically-limited');
  assert.equal(continued.campaignState.player.authority, 'medically-limited');
}

console.log("Enemy's Garden end-condition tests passed: finale bands, terminal candidates, event predicates, Exploration softening, and Push On frames.");
