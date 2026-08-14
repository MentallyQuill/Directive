import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
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

console.log('V1 Cohesion state spine passed.');
