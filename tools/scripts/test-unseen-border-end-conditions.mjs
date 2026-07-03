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

const packageData = readJson('packages/bundled/aster-vale/unseen-border.campaign-package.json');
const projection = readJson('packages/bundled/aster-vale/unseen-border.campaign-projection.json');

function baseState() {
  const snapshotBefore = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
  snapshotBefore.campaign = {
    ...(snapshotBefore.campaign || {}),
    id: 'unseen-border-end-condition-test',
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
        turnId: 'turn.unseen-border-end-condition-test',
        outcomeId: 'outcome.unseen-border-end-condition-test',
        resultBand: 'Failure',
        tags: ['end-condition-fixture'],
        coreCheckpointRef: {
          kind: 'directive.coreMechanicsCheckpointRef.v1',
          campaignId: 'unseen-border-end-condition-test',
          saveId: 'save-unseen-border-end-condition-test',
          checkpointId: 'core-checkpoint-unseen-border-end-condition-test',
          layout: 'core',
          sourceKind: 'coreStoreV2.checkpoint',
          sourceRevision: 1
        },
        snapshotBefore
      }
    ],
    lastCommittedOutcomeId: 'outcome.unseen-border-end-condition-test',
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
    outcomeId: 'outcome.unseen-border-end-condition-test',
    turnId: 'turn.unseen-border-end-condition-test',
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
  assert.equal(result.pendingInteraction.metadata.checkpoint.coreCheckpointRef.checkpointId, 'core-checkpoint-unseen-border-end-condition-test');
  assert.ok(result.pendingInteraction.options.some((option) => option.action === 'replayFromCheckpoint'));
  assert.ok(result.pendingInteraction.options.some((option) => option.action === 'keepEnding'));
  if (expectedFinalBand) assert.equal(result.finalCampaignBand, expectedFinalBand);
  return result;
}

assert.equal(packageData.endConditions.conditions.length, 13);
assert.equal(Array.isArray(projection.initialState.campaignTracks), false);
assert.ok(Array.isArray(projection.initialState.campaignTracks.records));

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-the-lines-we-keep', 'resolved');
  state.flags['ending-border-seen-clearly'] = true;
  setTrack(state, 'regional-legitimacy', 7);
  setTrack(state, 'criminal-exploitation', 3);
  setTrack(state, 'civil-war-spillover', 3);
  requireCondition(state, 'completion.unseen-border.lines-we-keep-resolved', 'Great Success');
}

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-the-lines-we-keep', 'resolved');
  state.flags['ending-protected-march'] = true;
  requireCondition(state, 'completion.unseen-border.lines-we-keep-resolved', 'Partial Success');
}

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-the-lines-we-keep', 'resolved');
  state.flags['ending-restored-border'] = true;
  requireCondition(state, 'completion.unseen-border.lines-we-keep-resolved', 'Partial Failure');
}

{
  const state = baseState();
  setQuestStatus(state, 'epilogue-the-lines-we-keep', 'resolved');
  state.flags['ending-unseen-border'] = true;
  requireCondition(state, 'completion.unseen-border.lines-we-keep-resolved', 'Great Failure');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead' };
  requireCondition(state, 'terminal.unseen-border.player-death-command', 'Failure');
}

{
  const state = baseState();
  state.settings.simulationMode = 'Exploration';
  state.player = { ...(state.player || {}), status: 'dead' };
  const result = detect(state);
  assert.equal(result.matched, false);
  assert.equal(result.softened, true);
  assert.equal(result.softenedConditionId, 'terminal.unseen-border.player-death-command');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'permanently-relieved' };
  requireCondition(state, 'terminal.unseen-border.permanent-command-removal', 'Partial Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['primary-objective-saved'] = false;
  requireCondition(state, 'terminal.unseen-border.aster-vale-destroyed-objective-failed', 'Great Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['primary-objective-saved'] = true;
  requireCondition(state, 'terminal.unseen-border.aster-vale-destroyed-objective-saved', 'Partial Success');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'lost' };
  requireCondition(state, 'terminal.unseen-border.aster-vale-lost-survivors-continue', 'Partial Failure');
}

{
  const state = baseState();
  state.campaignTracks = cloneJson(state.campaignTracks.records);
  setTrack(state, 'civil-war-spillover', 10);
  requireCondition(state, 'terminal.unseen-border.line-of-fire-catastrophe', 'Failure');
}

{
  const state = baseState();
  setTrack(state, 'refugee-pressure', 10);
  setTrack(state, 'regional-legitimacy', 1);
  requireCondition(state, 'terminal.unseen-border.sanctuary-collapse', 'Great Failure');
}

{
  const state = baseState();
  state.flags['protocol-buried'] = true;
  setTrack(state, 'institutional-scrutiny', 1);
  requireCondition(state, 'terminal.unseen-border.protocol-buried-accountability', 'Partial Failure');
}

{
  const state = baseState();
  state.flags['black-ledger-purge-triggered'] = true;
  setTrack(state, 'criminal-exploitation', 10);
  requireCondition(state, 'terminal.unseen-border.black-ledger-mass-disappearance', 'Failure');
}

{
  const state = baseState();
  setTrack(state, 'chart-restoration', 0);
  setTrack(state, 'regional-legitimacy', 0);
  requireCondition(state, 'terminal.unseen-border.border-regime-collapse', 'Great Failure');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'resigned' };
  requireCondition(state, 'terminal.unseen-border.player-resignation-or-transfer', 'Partial Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['primary-objective-saved'] = true;
  const detection = requireCondition(state, 'terminal.unseen-border.aster-vale-destroyed-objective-saved', 'Partial Success');
  const continued = applyPushOnContinuationFrame({
    campaignState: state,
    packageContext: packageData,
    frameId: 'survivors-after-aster-vale-loss',
    decisionId: detection.decisionId,
    conditionId: detection.conditionId,
    now: '2026-06-24T10:01:00.000Z'
  });
  assert.equal(continued.campaignState.ship.status, 'lost');
  assert.equal(continued.campaignState.flags['push-on.frame'], 'survivors-after-aster-vale-loss');
  assert.equal(continued.campaignState.runtimeTracking.endConditionLedger.continuationFrames.at(-1).frameId, 'survivors-after-aster-vale-loss');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead' };
  const detection = requireCondition(state, 'terminal.unseen-border.player-death-command', 'Failure');
  const continued = applyPushOnContinuationFrame({
    campaignState: state,
    packageContext: packageData,
    frameId: 'medical-survival-and-command-gap',
    decisionId: detection.decisionId,
    conditionId: detection.conditionId,
    now: '2026-06-24T10:02:00.000Z'
  });
  assert.equal(continued.campaignState.player.status, 'medically-limited');
}

console.log('Unseen Border end-condition tests passed: finale bands, terminal candidates, track predicates, Exploration softening, and Push On frames.');
