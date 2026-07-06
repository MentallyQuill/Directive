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

const packageData = readJson('packages/bundled/serein/black-current.campaign-package.json');
const projection = readJson('packages/bundled/serein/black-current.campaign-projection.json');

function baseState() {
  const snapshotBefore = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
  snapshotBefore.campaign = {
    ...(snapshotBefore.campaign || {}),
    id: 'black-current-end-condition-test',
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
        turnId: 'turn.black-current-end-condition-test',
        outcomeId: 'outcome.black-current-end-condition-test',
        resultBand: 'Failure',
        tags: ['end-condition-fixture'],
        coreCheckpointRef: {
          kind: 'directive.coreMechanicsCheckpointRef.v1',
          campaignId: 'black-current-end-condition-test',
          saveId: 'save-black-current-end-condition-test',
          checkpointId: 'core-checkpoint-black-current-end-condition-test',
          layout: 'core',
          sourceKind: 'coreStoreV2.checkpoint',
          sourceRevision: 1
        },
        snapshotBefore
      }
    ],
    lastCommittedOutcomeId: 'outcome.black-current-end-condition-test',
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

function detect(state, options = {}) {
  return detectCampaignEndCondition({
    campaignState: state,
    packageContext: packageData,
    outcomeId: 'outcome.black-current-end-condition-test',
    turnId: 'turn.black-current-end-condition-test',
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
  assert.equal(result.pendingInteraction.metadata.checkpoint.coreCheckpointRef.checkpointId, 'core-checkpoint-black-current-end-condition-test');
  assert.ok(result.pendingInteraction.options.some((option) => option.action === 'replayFromCheckpoint'));
  assert.ok(result.pendingInteraction.options.some((option) => option.action === 'keepEnding'));
  if (expectedFinalBand) assert.equal(result.finalCampaignBand, expectedFinalBand);
  return result;
}

assert.equal(packageData.endConditions.conditions.length, 13);
assert.deepEqual(Object.keys(projection.initialState.campaignTracks), ['records']);

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-the-names-returned', 'resolved');
  state.flags['black-tide-contained'] = true;
  state.flags['shared-recovery-compact'] = true;
  setTrack(state, 'current-pressure', 3);
  setTrack(state, 'survivor-load', 4);
  setTrack(state, 'ordnance-hazard', 3);
  setTrack(state, 'claims-legitimacy', 4);
  setTrack(state, 'institutional-secrecy', 3);
  requireCondition(state, 'completion.black-current.names-returned-resolved', 'Great Success');
}

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-the-names-returned', 'resolved');
  setTrack(state, 'institutional-secrecy', 7);
  requireCondition(state, 'completion.black-current.names-returned-resolved', 'Partial Success');
}

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-the-names-returned', 'resolved');
  setTrack(state, 'current-pressure', 8);
  requireCondition(state, 'completion.black-current.names-returned-resolved', 'Great Failure');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead' };
  requireCondition(state, 'terminal.black-current.player-death-command', 'Great Failure');
}

{
  const state = baseState();
  state.settings.simulationMode = 'Exploration';
  state.player = { ...(state.player || {}), status: 'dead' };
  const result = detect(state);
  assert.equal(result.matched, false);
  assert.equal(result.softened, true);
  assert.equal(result.softenedConditionId, 'terminal.black-current.player-death-command');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  requireCondition(state, 'terminal.black-current.serein-destroyed-objective-failed', 'Great Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['black-tide-contained'] = true;
  requireCondition(state, 'terminal.black-current.serein-destroyed-objective-contained', 'Partial Success');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'lost' };
  state.flags['command-continuity'] = 'surviving';
  requireCondition(state, 'terminal.black-current.serein-lost-survivors-continue', 'Partial Failure');
}

{
  const state = baseState();
  state.campaignTracks = cloneJson(state.campaignTracks.records);
  setTrack(state, 'current-pressure', 8);
  requireCondition(state, 'terminal.black-current.black-tide-catastrophe', 'Great Failure');
}

{
  const state = baseState();
  setTrack(state, 'survivor-load', 8);
  requireCondition(state, 'terminal.black-current.survivor-system-collapse', 'Failure');
}

{
  const state = baseState();
  setTrack(state, 'ordnance-hazard', 8);
  requireCondition(state, 'terminal.black-current.ordnance-catastrophe', 'Great Failure');
}

{
  const state = baseState();
  setTrack(state, 'claims-legitimacy', 0);
  requireCondition(state, 'terminal.black-current.custody-legitimacy-collapse', 'Failure');
}

{
  const state = baseState();
  setTrack(state, 'institutional-secrecy', 8);
  requireCondition(state, 'terminal.black-current.mooring-accountability-buried', 'Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['black-tide-contained'] = true;
  const detection = requireCondition(state, 'terminal.black-current.serein-destroyed-objective-contained', 'Partial Success');
  const continued = applyPushOnContinuationFrame({
    campaignState: state,
    packageContext: packageData,
    frameId: 'survivors-after-serein-loss',
    decisionId: detection.decisionId,
    conditionId: detection.conditionId,
    now: '2026-06-24T10:01:00.000Z'
  });
  assert.equal(continued.campaignState.ship.status, 'lost');
  assert.equal(continued.campaignState.campaign.operationalBase, 'survivor-recovery-cell');
  assert.equal(continued.campaignState.flags['push-on.frame'], 'survivors-after-serein-loss');
  assert.equal(continued.campaignState.runtimeTracking.endConditionLedger.continuationFrames.length, 0);
  assert.equal(terminalDecisionLedgerView(continued.campaignState).continuationFrames.at(-1).frameId, 'survivors-after-serein-loss');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead' };
  const detection = requireCondition(state, 'terminal.black-current.player-death-command', 'Great Failure');
  const continued = applyPushOnContinuationFrame({
    campaignState: state,
    packageContext: packageData,
    frameId: 'medical-survival-and-command-gap',
    decisionId: detection.decisionId,
    conditionId: detection.conditionId,
    now: '2026-06-24T10:02:00.000Z'
  });
  assert.equal(continued.campaignState.player.status, 'recovering');
  assert.equal(continued.campaignState.player.commandAuthority, 'interrupted-command');
}

console.log('Black Current end-condition tests passed: epilogue bands, terminal candidates, track predicates, Exploration softening, and Push On frames.');
