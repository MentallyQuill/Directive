import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import {
  armV1CommandBearingEdge,
  awardV1CommandBearing,
  reserveV1CohesionRelief,
} from '../../src/command/v1-command-bearing.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { prepareV1AcceptedPairTimeAdvance } from '../../src/runtime/v1-accepted-pair-time.mjs';
import { createV1StateSpine } from '../../src/runtime/v1-state-spine.mjs';
import { deriveCohesionState } from '../../src/ship/v1/cohesion-state.mjs';
import { COHESION_EVIDENCE_PROPOSAL_KIND } from '../../src/ship/v1/cohesion-evidence.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const definition = JSON.parse(fs.readFileSync('tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json', 'utf8'));
const assets = loadAshesRuntimeAssets();
const branchId = 'save.cohesion-spine';
let campaignState = createAshesInitialState({
  campaignId: 'campaign.cohesion-spine',
  saveId: branchId,
  chatId: 'chat.cohesion-spine',
});
const initialJourney = createInitialMissionJourney({ definition, branchId });
campaignState.mission = {
  activeMissionId: definition.packageBinding.sourceId,
  v1: createMissionState({ definition, branchId }),
  v1Journey: initialJourney.journey,
  v1History: initialJourney.history,
};

const snapshot = {
  source: {
    previousAssistant: { hostMessageId: 'message.assistant.cohesion' },
    currentPlayer: { hostMessageId: 'message.player.cohesion' },
    sourceRangeHash: 'range.cohesion',
  },
};
const time = prepareV1AcceptedPairTimeAdvance({
  campaignState,
  snapshot,
  packageData: assets.packageData,
  timeDecision: {
    decision: 'advance',
    elapsedSeconds: 4 * 60 * 60,
    reason: 'A four-hour watch visibly passed.',
    confidence: 1,
  },
  now: '2026-08-13T12:00:00.000Z',
});
assert.equal(time.ok, true);

const gateway = createStateDeltaGateway({
  getState: () => campaignState,
  setState: (next) => { campaignState = next; },
  persist: async () => {},
  now: () => '2026-08-13T12:00:00.000Z',
});
const spine = createV1StateSpine({
  getState: () => campaignState,
  stateDeltaGateway: gateway,
  resolveSourceRef: () => null,
  now: () => '2026-08-13T12:00:00.000Z',
});
const contribution = {
  id: 'contribution.player.cohesion',
  messageId: 'message.player.cohesion',
  swipeId: null,
  role: 'user',
  textHash: 'c'.repeat(64),
  acceptedAtRevision: 0,
};
const settled = await spine.settleAcceptedPair({
  definition,
  missionDefinitions: [definition],
  proposal: {
    kind: 'directive.missionEvidenceProposal.v1',
    branchId,
    missionId: definition.id,
    baseRevision: 0,
    claims: [],
  },
  sourceContribution: contribution,
  sourceObservations: [{
    contributionId: contribution.id,
    role: contribution.role,
    textHash: contribution.textHash,
    text: 'Four hours later, the commander checks the ship.',
  }],
  gatewayBaseRevision: 0,
  scene: { episodeId: 'episode.cohesion', sceneId: 'scene.cohesion' },
  authorityPatch: time.patch,
  authorityDomains: time.domains,
  shipDataset: assets.shipDataset,
  shipProposal: { kind: 'directive.shipWorkEvidenceProposal.v1', branchId, claims: [] },
  cohesionCatalog: assets.cohesionCatalog,
  cohesionProposal: { kind: COHESION_EVIDENCE_PROPOSAL_KIND, branchId, claims: [] },
});

assert.equal(settled.cohesionOpportunity.due, true);
assert.equal(settled.cohesionOpportunity.opportunityEffect.outcome, 'created');
const effectTypes = campaignState.storySettlement.episodes.flatMap(({ effects }) => effects.map(({ type }) => type));
assert.equal(effectTypes.includes('ship.cohesionOpportunityChecked'), true);
assert.equal(effectTypes.includes('ship.cohesionIssueCreated'), true);
assert.equal(campaignState.timeLedger.elapsedSeconds, 4 * 60 * 60);
const cohesion = deriveCohesionState({
  catalog: assets.cohesionCatalog,
  shipDataset: assets.shipDataset,
  storySettlement: campaignState.storySettlement,
  branchId,
});
assert.equal(cohesion.issues.length, 3);
assert.equal(cohesion.total < 75, true);
assert.equal(gateway.revision(), 1, 'time, story settlement, and Cohesion commit atomically');

const beforeRelief = cohesion.total;
campaignState.commandBearing = awardV1CommandBearing(campaignState.commandBearing, {
  awardId: 'award.relief.test',
  sourceId: 'outcome.relief.test',
  reason: 'Test Cohesion relief credit.',
  now: '2026-08-13T12:01:00.000Z',
}).commandBearing;
campaignState.commandBearing = reserveV1CohesionRelief(campaignState.commandBearing, {
  spendId: 'spend.relief.test',
  targetIssueId: 'cohesion-authored.sensor-calibration',
  cohesion: 10,
  reason: 'Resolve Sensor Calibration through command attention.',
  now: '2026-08-13T12:02:00.000Z',
}).commandBearing;
campaignState.commandBearing = armV1CommandBearingEdge(campaignState.commandBearing, {
  spendId: 'spend.relief.test',
  playerMessageId: 'message.player.relief',
  now: '2026-08-13T12:03:00.000Z',
}).commandBearing;
const assistantRelief = {
  id: 'contribution.assistant.relief', messageId: 'message.assistant.relief', swipeId: 'swipe.relief',
  role: 'assistant', textHash: 'a'.repeat(64), acceptedAtRevision: 0,
};
const playerRelief = {
  id: 'contribution.player.relief', messageId: 'message.player.accepts-relief', swipeId: null,
  role: 'user', textHash: 'b'.repeat(64), acceptedAtRevision: 0,
};
const reliefSettlement = await spine.settleAcceptedPair({
  definition,
  missionDefinitions: [definition],
  proposal: {
    kind: 'directive.missionEvidenceProposal.v1', branchId, missionId: definition.id,
    baseRevision: campaignState.mission.v1.revision, claims: [],
  },
  sourceContribution: playerRelief,
  sourceContributions: [assistantRelief, playerRelief],
  sourceObservations: [
    { contributionId: assistantRelief.id, role: assistantRelief.role, textHash: assistantRelief.textHash, text: 'The coordinated effort resolves the task.' },
    { contributionId: playerRelief.id, role: playerRelief.role, textHash: playerRelief.textHash, text: 'Good. Continue.' },
  ],
  gatewayBaseRevision: gateway.revision(),
  scene: { episodeId: 'episode.cohesion.relief', sceneId: 'scene.cohesion.relief' },
  acceptedCommandBearingEdge: {
    spendId: 'spend.relief.test',
    assistantMessageId: assistantRelief.messageId,
    assistantTextHash: assistantRelief.textHash,
    acceptedByPlayerMessageId: playerRelief.messageId,
  },
  shipDataset: assets.shipDataset,
  shipProposal: { kind: 'directive.shipWorkEvidenceProposal.v1', branchId, claims: [] },
  cohesionCatalog: assets.cohesionCatalog,
  cohesionProposal: { kind: COHESION_EVIDENCE_PROPOSAL_KIND, branchId, claims: [] },
});
assert.equal(reliefSettlement.acceptedCommandBearingEdge.applied, true);
assert.equal(campaignState.commandBearing.spends['spend.relief.test'].status, 'committed');
const afterRelief = deriveCohesionState({
  catalog: assets.cohesionCatalog, shipDataset: assets.shipDataset,
  storySettlement: campaignState.storySettlement, branchId,
});
assert.equal(afterRelief.total, beforeRelief + 10);
assert.equal(afterRelief.completedHistory.some(({ id, method }) => (
  id === 'cohesion-authored.sensor-calibration' && method === 'command-bearing'
)), true);

console.log('V1 Cohesion state spine passed.');
