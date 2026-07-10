import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runMissionDirectorTurn } from '../../src/mission/director.mjs';

const root = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8'));
}

function approvingArbiterPlan(scene) {
  return {
    kind: 'directive.turnArbiterPlan.v1',
    schemaVersion: 1,
    route: 'directiveOutcome',
    confidence: 1,
    ambiguity: 'low',
    playerIntent: {
      speechAct: 'fixture-approved-command',
      action: scene.playerInput,
      target: scene.activePhaseId,
      directObject: '',
      domainSignals: ['mission'],
      riskSignals: []
    },
    sceneContinuity: {
      currentLocation: scene.locationId,
      currentConversation: `Fixture phase ${scene.activePhaseId} is already active.`,
      mustPreserve: ['Use the fixture scene as already established.'],
      mustNotReestablish: ['The campaign intro']
    },
    responsePlan: {
      owner: 'directive',
      strategy: 'directivePosted',
      guidance: 'Resolve the fixture as an approved durable mission outcome.'
    },
    statePlan: {
      commitOutcome: true,
      allowedDomains: ['mission'],
      proposedOperations: [],
      promptDirtyDomains: ['missionQuestThread']
    },
    risk: { requiresPause: false, pauseReason: '', reasons: [] },
    diagnostics: { sourceUse: 'fixture', deterministicFallbackUsed: false }
  };
}

const fixture = readJson('tests/fixtures/mission/prelude-leave-mission-area-counteroffer-director-loop.fixture.json');
const graph = readJson(fixture.graphPath);
const projection = readJson(fixture.projectionPath);
const crewDataset = readJson(fixture.crewDatasetPath);
const scene = fixture.input.sceneSnapshot;

const turn = runMissionDirectorTurn({
  turnId: 'turn.command-authority.director.001',
  graphPath: fixture.graphPath,
  projectionPath: fixture.projectionPath,
  graph,
  projection,
  crewDataset,
  sceneSnapshot: scene,
  campaignState: {
    ...fixture.input.campaignState,
    player: { id: 'player-commander', rank: 'Commander', billet: 'Executive Officer' },
    commandAuthority: {
      playerAgencyTargetId: 'player-commander',
      commandRecipientId: 'player-commander',
      majorDecisionAuthorityId: 'mara-whitaker',
      legalCommanderId: 'mara-whitaker',
      operationalCommanderId: 'player-commander',
      delegationSourceId: 'mara-whitaker',
      playerAuthorityMode: 'delegated-xo',
      delegationScope: 'bounded-decision',
      commanderPresence: 'present',
      commanderStatus: 'active'
    }
  },
  arbiterPlan: approvingArbiterPlan(scene)
});

assert.equal(turn.authorityCapabilityCheck.commandAuthorityContext.playerAuthorityMode, 'delegated-xo');
assert.equal(turn.authorityCapabilityCheck.commandAuthorityContext.delegationScope, 'bounded-decision');
assert.equal(turn.authorityCapabilityCheck.commandAuthorityContext.commandRecipientId, 'player-commander');
assert.equal(turn.authorityCapabilityCheck.commandAuthorityContext.majorDecisionAuthorityId, 'mara-whitaker');
assert.match(
  turn.authorityCapabilityCheck.authority.basis.join('\n'),
  /delegates current execution to the player character/i
);
assert.match(
  turn.authorityCapabilityCheck.authority.basis.join('\n'),
  /major decisions remain with mara-whitaker/i
);

console.log('Command authority Mission Director tests passed.');
