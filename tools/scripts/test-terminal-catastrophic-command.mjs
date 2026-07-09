import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { detectCampaignEndCondition } from '../../src/campaign/end-conditions.mjs';
import { commitDirectorTurn } from '../../src/campaign/transaction-state.mjs';
import { createDirectorCoordinatorTurn } from '../../src/directors/open-world-turn-coordinator.mjs';
import { classifyChatTurn } from '../../src/adjudication/utility-turn-classifier.mjs';
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

{
  const conductInputs = [
    [
      'public captain fight',
      'On the bridge, in front of the watch, I turn from the tactical display and say, "Captain, with respect, that is an abdication dressed up as caution. If you will not make the call, I will." I keep my hands visible, but I do not soften my voice.'
    ],
    [
      'impaired bridge duty',
      'Before the next watch I take an unlogged stimulant from a private medkit, enough to make my hands too steady and my thoughts too bright. I report to the bridge anyway and start giving course and sensor orders as if no one can tell.'
    ],
    [
      'assault officer',
      'When the operations officer challenges the order, I close the distance too fast and shove him back against the console hard enough to stop the objection. "You will execute the order," I say, loud enough for the bridge to hear.'
    ]
  ];
  for (const [label, text] of conductInputs) {
    const decision = await classifyChatTurn({ text });
    assert.equal(decision.classification, 'consequentialCommand', `${label} should route through Directive`);
    assert.equal(decision.responseStrategy, 'directivePosted', `${label} should post a Directive-owned response`);
    assert.equal(decision.workerPlan.missionDirector, true, `${label} should invoke the mission director`);
    assert.equal(decision.workerPlan.commandBearing, true, `${label} should invoke command-bearing evaluation`);
  }
}

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

function commitInput(campaignState, turnId, playerInput) {
  const turn = runMissionDirectorTurn({
    turnId,
    graphPath,
    projectionPath,
    graph,
    projection,
    crewDataset,
    sceneSnapshot: sceneFor(campaignState, playerInput),
    campaignState
  });
  const committed = commitDirectorTurn(campaignState, turn);
  return {
    turn,
    committed,
    terminal: detect(committed, turn)
  };
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
  assert.equal(coordinated.diagnostics.usedTacticalGraph, false);
  assert.equal(coordinated.turnPacket.intentParse.primaryIntent, 'open-operations');
  assert.equal(coordinated.turnPacket.stateDelta.terminalState?.shipPatch, undefined);
  assert.notEqual(coordinated.projectedState.ship.status, 'destroyed');
  assert.notEqual(coordinated.projectedState.flags?.['campaign-objective'], 'failed');
  const committed = commitDirectorTurn(campaignState, coordinated.turnPacket);
  assert.notEqual(committed.ship.status, 'destroyed');
  const terminal = detect(committed, coordinated.turnPacket);
  assert.equal(terminal?.matched === true, false);
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

{
  let state = baseState();
  const publicFight = commitInput(
    state,
    'turn.conduct.public-captain-fight',
    'On the bridge, in front of the watch, I turn from the tactical display and say, "Captain, with respect, that is an abdication dressed up as caution. If you will not make the call, I will." I keep my hands visible, but I do not soften my voice.'
  );
  assert.equal(publicFight.turn.intentParse.primaryIntent, 'command-conduct-misconduct');
  assert.equal(publicFight.turn.outcomePacket.resultBand, 'Partial Success');
  assert.equal(publicFight.committed.flags['command-conduct.public-insubordination'], true);
  assert.equal(publicFight.terminal?.matched === true, false);
  assert.match(publicFight.turn.commandLogPacket.summaryInputs.join(' '), /publicly challenged Captain Whitaker/i);
  state = publicFight.committed;

  const impairedDuty = commitInput(
    state,
    'turn.conduct.impaired-duty',
    'Before the next watch I take an unlogged stimulant from a private medkit, enough to make my hands too steady and my thoughts too bright. I report to the bridge anyway and start giving course and sensor orders as if no one can tell.'
  );
  assert.equal(impairedDuty.turn.intentParse.primaryIntent, 'command-conduct-misconduct');
  assert.equal(impairedDuty.turn.outcomePacket.resultBand, 'Partial Failure');
  assert.equal(impairedDuty.committed.flags['command-conduct.impaired-duty'], true);
  assert.equal(impairedDuty.terminal?.matched === true, false);
  state = impairedDuty.committed;

  const assault = commitInput(
    state,
    'turn.conduct.assault-officer',
    'When the operations officer challenges the order, I close the distance too fast and shove him back against the console hard enough to stop the objection. "You will execute the order," I say, loud enough for the bridge to hear.'
  );
  assert.equal(assault.turn.intentParse.primaryIntent, 'command-conduct-misconduct');
  assert.equal(assault.turn.outcomePacket.resultBand, 'Partial Failure');
  assert.equal(assault.committed.flags['command-conduct.assaulted-officer'], true);
  assert.equal(assault.terminal?.matched === true, false);
  state = assault.committed;

  const usurpation = commitInput(
    state,
    'turn.conduct.unhinged-command-pattern',
    'I order security to confine any officer who questions my command judgment, tell helm to ignore the captain unless I personally confirm her orders, and demand tactical prepare a firing solution on any vessel that approaches without my clearance.'
  );
  assert.equal(usurpation.turn.intentParse.primaryIntent, 'command-conduct-misconduct');
  assert.equal(usurpation.turn.outcomePacket.resultBand, 'Failure');
  assert.equal(usurpation.committed.flags['command-conduct.unlawful-command-usurpation'], true);
  assert.equal(usurpation.committed.flags['player.command-removal'], 'permanent');
  assert.equal(usurpation.committed.player.commandStatus, 'brig');
  assert.equal(usurpation.terminal?.matched, true);
  assert.equal(usurpation.terminal.conditionId, 'terminal.ashes.permanent-command-removal');
  assert.match(usurpation.turn.commandLogPacket.visibleConsequences.join(' '), /removed from ordinary command/i);
}

console.log('Terminal catastrophic command tests passed: committed ship loss and command removal trigger authored end-condition checkpoints');
