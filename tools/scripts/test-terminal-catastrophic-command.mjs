import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { detectCampaignEndCondition } from '../../src/campaign/end-conditions.mjs';
import { commitDirectorTurn } from '../../src/campaign/transaction-state.mjs';
import { createDirectorCoordinatorTurn } from '../../src/directors/open-world-turn-coordinator.mjs';
import { runMissionDirectorTurn } from '../../src/mission/director.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const graphPath = 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json';
const projectionPath = 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json';
const crewDatasetPath = 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json';
const graph = readJson(graphPath);
const crewDataset = readJson(crewDatasetPath);

function baseState() {
  const state = cloneJson(projection.initialState);
  state.flags = {};
  state.settings = {
    ...(state.settings || {}),
    simulationMode: 'Command',
    allowedSimulationModes: ['Exploration', 'Command']
  };
  return state;
}

function sceneFor(state, playerInput) {
  return {
    missionId: state.mission?.activeMissionId || graph.missionFrame?.id || 'prelude-a-ship-underway',
    activeMissionGraphId: state.mission?.activeMissionGraphId || graph.manifest?.id,
    activePhaseId: state.mission?.activePhaseId || 'initial-reception',
    stardate: state.worldState?.stardate || 48123.1,
    locationId: state.worldState?.currentLocationId || 'breckenridge-in-transit',
    presentCharacters: ['mara-whitaker', 'talia-serrin'],
    knownFactIds: state.mission?.knownFacts || [],
    activeDecisionPointIds: state.mission?.availableDecisionPointIds || [],
    simulationMode: 'Command',
    playerInput
  };
}

function terminalTurn({ turnId, playerInput }) {
  const campaignState = baseState();
  return {
    campaignState,
    turn: runMissionDirectorTurn({
      turnId,
      graphPath,
      projectionPath,
      graph,
      projection,
      crewDataset,
      sceneSnapshot: sceneFor(campaignState, playerInput),
      campaignState
    })
  };
}

function detect(state, turn) {
  return detectCampaignEndCondition({
    campaignState: state,
    packageContext: packageData,
    outcomeId: turn.outcomePacket.id,
    turnId: turn.turnId,
    now: '2026-06-23T13:00:00.000Z'
  });
}

{
  const { campaignState, turn } = terminalTurn({
    turnId: 'turn.terminal.ship-loss',
    playerInput: 'Evacuate the crew into escape pods, abandon ship, and set the Breckenridge to auto-destruct. The campaign objective fails on this timeline.'
  });
  assert.equal(turn.outcomePacket.resultBand, 'Great Failure');
  assert.equal(turn.stateDelta.terminalState.shipPatch.status, 'destroyed');
  assert.deepEqual(turn.stateDelta.terminalState.flagsSet.find((flag) => flag.id === 'campaign-objective'), {
    id: 'campaign-objective',
    value: 'failed'
  });
  const committed = commitDirectorTurn(campaignState, turn);
  assert.equal(committed.ship.status, 'destroyed');
  assert.equal(committed.flags['campaign-objective'], 'failed');
  const terminal = detect(committed, turn);
  assert.equal(terminal.matched, true);
  assert.equal(terminal.conditionId, 'terminal.ashes.breck-destroyed-objective-failed');
  assert.equal(terminal.pendingInteraction.kind, 'terminalOutcomeDecision');
}

{
  const campaignState = baseState();
  delete campaignState.attentionState?.foregroundQuestId;
  if (campaignState.questLedger) campaignState.questLedger.foregroundQuestId = null;
  const coordinated = createDirectorCoordinatorTurn({
    campaignState,
    packageData,
    graph,
    projection,
    crewDataset,
    graphPath,
    projectionPath,
    turnId: 'turn.terminal.open-world-no-foreground',
    playerInput: 'Evacuate the crew into escape pods, abandon ship, and set the Breckenridge to auto-destruct. The campaign objective fails on this timeline.'
  });
  assert.equal(coordinated.diagnostics.usedTacticalGraph, true);
  assert.equal(coordinated.turnPacket.intentParse.primaryIntent, 'terminal-catastrophic-command');
  assert.equal(coordinated.turnPacket.stateDelta.terminalState.shipPatch.status, 'destroyed');
  assert.equal(coordinated.projectedState.ship.status, 'destroyed');
  assert.equal(coordinated.projectedState.flags['campaign-objective'], 'failed');
  const committed = commitDirectorTurn(campaignState, coordinated.turnPacket);
  assert.equal(committed.ship.status, 'destroyed');
  const terminal = detect(committed, coordinated.turnPacket);
  assert.equal(terminal.matched, true);
  assert.equal(terminal.conditionId, 'terminal.ashes.breck-destroyed-objective-failed');
}

{
  const { campaignState, turn } = terminalTurn({
    turnId: 'turn.terminal.command-removal',
    playerInput: 'Order security to execute civilians and prisoners, then put me in the brig for the atrocity.'
  });
  assert.equal(turn.outcomePacket.resultBand, 'Failure');
  assert.equal(turn.stateDelta.terminalState.playerPatch.commandStatus, 'brig');
  const committed = commitDirectorTurn(campaignState, turn);
  assert.equal(committed.player.commandStatus, 'brig');
  assert.equal(committed.flags['player.command-removal'], 'permanent');
  assert.equal(committed.flags['compact-civilian-catastrophe'], true);
  const terminal = detect(committed, turn);
  assert.equal(terminal.matched, true);
  assert.equal(terminal.conditionId, 'terminal.ashes.permanent-command-removal');
}

console.log('Terminal catastrophic command tests passed: committed ship loss and command removal trigger authored end-condition checkpoints');
