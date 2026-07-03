import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyPushOnContinuationFrame,
  detectCampaignEndCondition
} from '../../src/campaign/end-conditions.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const packageData = readJson('packages/bundled/glass-harbor/drowned-constellation.campaign-package.json');
const projection = readJson('packages/bundled/glass-harbor/drowned-constellation.campaign-projection.json');

function baseState() {
  const snapshotBefore = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
  snapshotBefore.campaign = {
    ...(snapshotBefore.campaign || {}),
    id: 'drowned-end-condition-test',
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
        turnId: 'turn.drowned-end-condition-test',
        outcomeId: 'outcome.drowned-end-condition-test',
        resultBand: 'Failure',
        tags: ['end-condition-fixture'],
        coreCheckpointRef: {
          kind: 'directive.coreMechanicsCheckpointRef.v1',
          campaignId: 'drowned-constellation-end-condition-test',
          saveId: 'save-drowned-constellation-end-condition-test',
          checkpointId: 'core-checkpoint-drowned-constellation-end-condition-test',
          layout: 'core',
          sourceKind: 'coreStoreV2.checkpoint',
          sourceRevision: 1
        },
        snapshotBefore
      }
    ],
    lastCommittedOutcomeId: 'outcome.drowned-end-condition-test',
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
    outcomeId: 'outcome.drowned-end-condition-test',
    turnId: 'turn.drowned-end-condition-test',
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
  assert.equal(result.pendingInteraction.metadata.checkpoint.coreCheckpointRef.checkpointId, 'core-checkpoint-drowned-constellation-end-condition-test');
  assert.ok(result.pendingInteraction.options.some((option) => option.action === 'replayFromCheckpoint'));
  assert.ok(result.pendingInteraction.options.some((option) => option.action === 'keepEnding'));
  if (expectedFinalBand) assert.equal(result.finalCampaignBand, expectedFinalBand);
  return result;
}

assert.equal(packageData.endConditions.conditions.length, 12);
assert.deepEqual(Object.keys(projection.initialState.campaignTracks), ['records']);

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-what-the-map-remembers', 'resolved');
  state.flags['deep-tide-contained'] = true;
  state.flags['shared-chart-charter'] = true;
  setTrack(state, 'reef-instability', 3);
  setTrack(state, 'raider-consolidation', 3);
  setTrack(state, 'chart-exposure', 4);
  requireCondition(state, 'completion.drowned-constellation.epilogue-resolved', 'Great Success');
}

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-what-the-map-remembers', 'resolved');
  setTrack(state, 'chart-exposure', 7);
  requireCondition(state, 'completion.drowned-constellation.epilogue-resolved', 'Partial Success');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead' };
  requireCondition(state, 'terminal.drowned-constellation.player-death-command', 'Great Failure');
}

{
  const state = baseState();
  state.settings.simulationMode = 'Exploration';
  state.player = { ...(state.player || {}), status: 'dead' };
  const result = detect(state);
  assert.equal(result.matched, false);
  assert.equal(result.softened, true);
  assert.equal(result.softenedConditionId, 'terminal.drowned-constellation.player-death-command');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  requireCondition(state, 'terminal.drowned-constellation.glass-harbor-lost-objective-failed', 'Great Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['deep-tide-contained'] = true;
  requireCondition(state, 'terminal.drowned-constellation.glass-harbor-lost-objective-saved', 'Partial Success');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'lost' };
  state.flags['command-continuity'] = 'surviving';
  requireCondition(state, 'terminal.drowned-constellation.glass-harbor-lost-survivors-continue', 'Partial Failure');
}

{
  const state = baseState();
  state.campaignTracks = cloneJson(state.campaignTracks.records);
  setTrack(state, 'reef-instability', 7);
  requireCondition(state, 'terminal.drowned-constellation.deep-tide-catastrophe', 'Great Failure');
}

{
  const state = baseState();
  setTrack(state, 'civilian-strain', 7);
  requireCondition(state, 'terminal.drowned-constellation.civilian-cascade', 'Failure');
}

{
  const state = baseState();
  setTrack(state, 'raider-consolidation', 7);
  requireCondition(state, 'terminal.drowned-constellation.coercive-chart-control', 'Partial Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['deep-tide-contained'] = true;
  const detection = requireCondition(state, 'terminal.drowned-constellation.glass-harbor-lost-objective-saved', 'Partial Success');
  const continued = applyPushOnContinuationFrame({
    campaignState: state,
    packageContext: packageData,
    frameId: 'survivors-after-glass-harbor-loss',
    decisionId: detection.decisionId,
    conditionId: detection.conditionId,
    now: '2026-06-24T10:01:00.000Z'
  });
  assert.equal(continued.campaignState.ship.status, 'lost');
  assert.equal(continued.campaignState.campaign.operationalBase, 'survivor-command-frame');
  assert.equal(continued.campaignState.flags['push-on.frame'], 'survivors-after-glass-harbor-loss');
  assert.equal(continued.campaignState.runtimeTracking.endConditionLedger.continuationFrames.at(-1).frameId, 'survivors-after-glass-harbor-loss');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead' };
  const detection = requireCondition(state, 'terminal.drowned-constellation.player-death-command', 'Great Failure');
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

console.log('Drowned Constellation end-condition tests passed: named finales, terminal candidates, track predicates, Exploration softening, and Push On frames.');
