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

const packageData = readJson('packages/bundled/eudora-vale/broken-accord.campaign-package.json');
const projection = readJson('packages/bundled/eudora-vale/broken-accord.campaign-projection.json');

function baseState() {
  const snapshotBefore = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
  snapshotBefore.campaign = {
    ...(snapshotBefore.campaign || {}),
    id: 'broken-accord-end-condition-test',
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
        turnId: 'turn.broken-accord-end-condition-test',
        outcomeId: 'outcome.broken-accord-end-condition-test',
        resultBand: 'Failure',
        tags: ['end-condition-fixture'],
        coreCheckpointRef: {
          kind: 'directive.coreMechanicsCheckpointRef.v1',
          campaignId: 'broken-accord-end-condition-test',
          saveId: 'save-broken-accord-end-condition-test',
          checkpointId: 'core-checkpoint-broken-accord-end-condition-test',
          layout: 'core',
          sourceKind: 'coreStoreV2.checkpoint',
          sourceRevision: 1
        },
        snapshotBefore
      }
    ],
    lastCommittedOutcomeId: 'outcome.broken-accord-end-condition-test',
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
    outcomeId: 'outcome.broken-accord-end-condition-test',
    turnId: 'turn.broken-accord-end-condition-test',
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
  assert.equal(result.pendingInteraction.metadata.checkpoint.coreCheckpointRef.checkpointId, 'core-checkpoint-broken-accord-end-condition-test');
  assert.ok(result.pendingInteraction.options.some((option) => option.action === 'replayFromCheckpoint'));
  assert.ok(result.pendingInteraction.options.some((option) => option.action === 'keepEnding'));
  if (expectedFinalBand) assert.equal(result.finalCampaignBand, expectedFinalBand);
  return result;
}

assert.equal(packageData.endConditions.conditions.length, 13);
assert.deepEqual(Object.keys(projection.initialState.campaignTracks), ['records']);

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-weather-we-share', 'resolved');
  state.flags['lattice-stabilized'] = true;
  state.flags['nacre-burden-ended'] = true;
  state.flags['shared-authority-lawful'] = true;
  state.flags['independent-telemetry'] = true;
  setTrack(state, 'lattice-integrity', 7);
  setTrack(state, 'distribution-equity', 7);
  setTrack(state, 'public-legitimacy', 6);
  setTrack(state, 'resource-reserves', 4);
  setTrack(state, 'ecological-continuity', 7);
  requireCondition(state, 'completion.broken-accord.weather-we-share-resolved', 'Great Success');
}

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-weather-we-share', 'resolved');
  setTrack(state, 'starfleet-scrutiny', 7);
  requireCondition(state, 'completion.broken-accord.weather-we-share-resolved', 'Partial Failure');
}

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-weather-we-share', 'resolved');
  setTrack(state, 'lattice-integrity', 1);
  requireCondition(state, 'completion.broken-accord.weather-we-share-resolved', 'Great Failure');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead' };
  requireCondition(state, 'terminal.broken-accord.player-death-command', 'Great Failure');
}

{
  const state = baseState();
  state.settings.simulationMode = 'Exploration';
  state.player = { ...(state.player || {}), status: 'dead' };
  const result = detect(state);
  assert.equal(result.matched, false);
  assert.equal(result.softened, true);
  assert.equal(result.softenedConditionId, 'terminal.broken-accord.player-death-command');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), commandAuthority: 'removed' };
  requireCondition(state, 'terminal.broken-accord.permanent-command-removal', 'Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  requireCondition(state, 'terminal.broken-accord.eudora-vale-destroyed-objective-failed', 'Great Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['lattice-cascade-contained'] = true;
  requireCondition(state, 'terminal.broken-accord.eudora-vale-destroyed-objective-contained', 'Partial Success');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'lost' };
  state.flags['command-continuity'] = 'surviving';
  requireCondition(state, 'terminal.broken-accord.eudora-vale-lost-survivors-continue', 'Partial Failure');
}

{
  const state = baseState();
  state.campaignTracks = cloneJson(state.campaignTracks.records);
  setTrack(state, 'lattice-integrity', 0);
  requireCondition(state, 'terminal.broken-accord.lattice-collapse-catastrophe', 'Great Failure');
}

{
  const state = baseState();
  setTrack(state, 'nacre-secession-pressure', 8);
  requireCondition(state, 'terminal.broken-accord.nacre-collapse', 'Failure');
}

{
  const state = baseState();
  setTrack(state, 'resource-reserves', 0);
  requireCondition(state, 'terminal.broken-accord.resource-collapse', 'Failure');
}

{
  const state = baseState();
  setTrack(state, 'public-legitimacy', 0);
  requireCondition(state, 'terminal.broken-accord.public-legitimacy-collapse', 'Failure');
}

{
  const state = baseState();
  setTrack(state, 'ecological-continuity', 0);
  requireCondition(state, 'terminal.broken-accord.ecological-continuity-collapse', 'Failure');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'retired' };
  requireCondition(state, 'terminal.broken-accord.player-resignation-or-transfer', 'Partial Success');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['lattice-cascade-contained'] = true;
  const detection = requireCondition(state, 'terminal.broken-accord.eudora-vale-destroyed-objective-contained', 'Partial Success');
  const continued = applyPushOnContinuationFrame({
    campaignState: state,
    packageContext: packageData,
    frameId: 'survivors-after-eudora-vale-loss',
    decisionId: detection.decisionId,
    conditionId: detection.conditionId,
    now: '2026-06-24T10:01:00.000Z'
  });
  assert.equal(continued.campaignState.ship.status, 'lost');
  assert.equal(continued.campaignState.campaign.operationalBase, 'survivor-system-command-cell');
  assert.equal(continued.campaignState.flags['push-on.frame'], 'survivors-after-eudora-vale-loss');
  assert.equal(continued.campaignState.runtimeTracking.endConditionLedger.continuationFrames.length, 0);
  assert.equal(terminalDecisionLedgerView(continued.campaignState).continuationFrames.at(-1).frameId, 'survivors-after-eudora-vale-loss');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead' };
  const detection = requireCondition(state, 'terminal.broken-accord.player-death-command', 'Great Failure');
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

console.log('Broken Accord end-condition tests passed: finale bands, terminal candidates, track predicates, Exploration softening, and Push On frames.');
