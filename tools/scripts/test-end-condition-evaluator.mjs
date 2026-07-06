import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyPushOnContinuationFrame,
  detectCampaignEndCondition,
  evaluateEndConditionPredicate
} from '../../src/campaign/end-conditions.mjs';
import { terminalDecisionLedgerView } from '../../src/runtime/terminal-decision-ledger-view.mjs';

const root = process.cwd();
const packageData = JSON.parse(fs.readFileSync(path.resolve(root, 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json'), 'utf8'));
const projection = JSON.parse(fs.readFileSync(path.resolve(root, 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json'), 'utf8'));

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseState() {
  const state = cloneJson(projection.initialState);
  state.flags = {};
  state.settings = { ...(state.settings || {}), simulationMode: 'Command' };
  state.turnLedger = {
    ...(state.turnLedger || {}),
    lastCommittedOutcomeId: 'outcome.end-condition-test',
    entries: [
      ...(state.turnLedger?.entries || []),
      {
        turnId: 'turn.end-condition-test',
        outcomeId: 'outcome.end-condition-test',
        resultBand: 'Failure',
        coreCheckpointRef: {
          kind: 'directive.coreMechanicsCheckpointRef.v1',
          campaignId: state.campaign.id,
          saveId: 'save-end-condition-test',
          checkpointId: 'core-checkpoint-end-condition-test',
          layout: 'core',
          sourceKind: 'coreStoreV2.checkpoint',
          sourceRevision: 1
        },
        snapshotBefore: {
          campaign: { id: state.campaign.id },
          restored: true
        }
      }
    ]
  };
  return state;
}

function detect(state, options = {}) {
  return detectCampaignEndCondition({
    campaignState: state,
    packageContext: packageData,
    outcomeId: 'outcome.end-condition-test',
    turnId: 'turn.end-condition-test',
    now: '2026-06-23T12:00:00.000Z',
    ...options
  });
}

function requireCondition(state, id, expectedBand = null) {
  const result = detect(state);
  assert(result?.matched, `expected ${id} to match`);
  assert.equal(result.conditionId, id);
  assert.equal(result.pendingInteraction.kind, 'terminalOutcomeDecision');
  assert.equal(result.pendingInteraction.metadata.terminalOutcomeId, id);
  assert.equal(result.pendingInteraction.metadata.checkpoint.source, 'coreCheckpoint');
  assert.equal(result.pendingInteraction.metadata.checkpoint.retained, true);
  assert.equal(result.pendingInteraction.metadata.checkpoint.coreCheckpointRef.checkpointId, 'core-checkpoint-end-condition-test');
  assert.equal(JSON.stringify(result.pendingInteraction.metadata.checkpoint.coreCheckpointRef).includes('restored'), false);
  assert(result.pendingInteraction.options.some((option) => option.action === 'replayFromCheckpoint'));
  assert(result.pendingInteraction.options.some((option) => option.action === 'keepEnding'));
  if (expectedBand) assert.equal(result.finalCampaignBand, expectedBand);
  return result;
}

{
  const state = baseState();
  state.flags['ashes-of-peace-complete'] = true;
  requireCondition(state, 'completion.ashes.terms-we-keep-resolved', 'Success');
}

{
  const state = baseState();
  delete state.turnLedger.entries[0].coreCheckpointRef;
  state.runtimeTracking = {
    ...(state.runtimeTracking || {}),
    lastCommittedTurn: {
      outcomeId: 'outcome.end-condition-test',
      coreCheckpointRef: {
        kind: 'directive.coreMechanicsCheckpointRef.v1',
        checkpointId: 'runtime-tracking-last-committed-turn-must-not-authorize'
      }
    }
  };
  state.flags['ashes-of-peace-complete'] = true;
  const result = detect(state);
  assert.equal(result?.matched, true);
  assert.equal(result.pendingInteraction.metadata.checkpoint.source, 'lastStableAutosave');
  assert.equal(result.pendingInteraction.metadata.checkpoint.retained, false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.pendingInteraction.metadata.checkpoint, 'coreCheckpointRef'),
    false,
    'old inline snapshotBefore must not advertise retained replay authority'
  );
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead' };
  requireCondition(state, 'terminal.ashes.player-death-command', 'Great Failure');
}

{
  const state = baseState();
  state.settings.simulationMode = 'Exploration';
  state.player = { ...(state.player || {}), status: 'dead' };
  const result = detect(state);
  assert.equal(result.matched, false);
  assert.equal(result.softened, true);
  assert.equal(result.softenedConditionId, 'terminal.ashes.player-death-command');
}

{
  const state = baseState();
  state.flags['player.command-removal'] = 'permanent';
  requireCondition(state, 'terminal.ashes.permanent-command-removal', 'Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['campaign-objective'] = 'failed';
  requireCondition(state, 'terminal.ashes.breck-destroyed-objective-failed', 'Great Failure');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['campaign-objective'] = 'saved';
  requireCondition(state, 'terminal.ashes.breck-destroyed-objective-saved', 'Partial Success');
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'lost' };
  state.flags['command-continuity'] = 'surviving';
  requireCondition(state, 'terminal.ashes.breck-lost-survivors-continue', 'Partial Failure');
}

{
  const state = baseState();
  state.flags.nightfall = 'catastrophe';
  requireCondition(state, 'terminal.ashes.nightfall-catastrophe', 'Great Failure');
}

{
  const state = baseState();
  state.flags['reach-legitimacy'] = 'collapsed';
  requireCondition(state, 'terminal.ashes.reach-legitimacy-collapse', 'Failure');
}

{
  const state = baseState();
  state.flags['farwatch-accountability'] = 'buried';
  requireCondition(state, 'terminal.ashes.farwatch-buries-accountability', 'Partial Failure');
}

{
  const state = baseState();
  state.flags['compact-civilian-catastrophe'] = true;
  requireCondition(state, 'terminal.ashes.compact-civilian-catastrophe', 'Great Failure');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), commandStatus: 'resigned' };
  requireCondition(state, 'terminal.ashes.player-resignation-or-retirement', 'Partial Success');
}

{
  const state = baseState();
  state.flags['player-choice-conclude'] = true;
  requireCondition(state, 'terminal.ashes.player-choice-conclude', 'Success');
}

{
  const state = baseState();
  state.player = { ...(state.player || {}), status: 'dead', commandStatus: 'brig' };
  const result = requireCondition(state, 'terminal.ashes.player-death-command');
  assert.equal(result.condition.priority > 900, true, 'higher-priority player death should beat command removal');
}

{
  const state = baseState();
  const malformedPackage = cloneJson(packageData);
  malformedPackage.endConditions.conditions = [
    {
      ...malformedPackage.endConditions.conditions[0],
      id: 'terminal.bad-malformed',
      trigger: { type: 'unknownPredicateType', id: 'x' }
    }
  ];
  assert.equal(detect(state, { packageContext: malformedPackage }), null);
  assert.equal(evaluateEndConditionPredicate({ type: 'unknownPredicateType' }, state), false);
}

{
  const state = baseState();
  state.ship = { ...(state.ship || {}), status: 'destroyed' };
  state.flags['campaign-objective'] = 'saved';
  const detection = requireCondition(state, 'terminal.ashes.breck-destroyed-objective-saved', 'Partial Success');
  const continued = applyPushOnContinuationFrame({
    campaignState: state,
    packageContext: packageData,
    frameId: 'survivors-after-breck-loss',
    decisionId: detection.decisionId,
    conditionId: detection.conditionId,
    now: '2026-06-23T12:01:00.000Z'
  });
  assert.equal(continued.campaignState.ship.status, 'lost');
  assert.equal(continued.campaignState.flags['push-on.frame'], 'survivors-after-breck-loss');
  assert.equal(continued.campaignState.runtimeTracking.endConditionLedger.continuationFrames.length, 0);
  assert.equal(terminalDecisionLedgerView(continued.campaignState).continuationFrames.at(-1).frameId, 'survivors-after-breck-loss');
}

console.log('End condition evaluator tests passed: Ashes families, priority, Exploration softening, pending payload, and Push On frame effects.');
