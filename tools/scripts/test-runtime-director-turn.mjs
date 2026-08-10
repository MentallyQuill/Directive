import assert from 'node:assert/strict';

import {
  buildSceneSnapshotFromCampaignState,
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntimeAsync,
} from '../../src/runtime/director-turn-runtime.mjs';
import {
  recordNarrationFailure,
  recordNarrationSuccess,
} from '../../src/campaign/transaction-state.mjs';
import {
  composeNarrationPrompt,
  generateNarrationFromTurn,
} from '../../src/generation/narration.mjs';

const campaignState = {
  campaign: {
    id: 'campaign.ashes',
    runtimeArchitecture: {
      kind: 'directive.gameplayArchitecture.v1',
      semanticAuthority: 'storySettlement',
    },
  },
  player: { id: 'player-commander', name: 'Talia Serrin' },
  captainState: { crewId: 'mara-whitaker' },
  crew: { seniorCrewIds: ['mara-whitaker', 'hadrik-bronn'] },
  mission: { activeMissionId: 'prelude-a-ship-underway' },
  worldState: {
    kind: 'directive.worldState.v1',
    currentLocationId: 'captain-ready-room',
    currentStardate: 53049.2,
  },
  turnLedger: { entries: [], lastCommittedTurnId: null },
};
const original = structuredClone(campaignState);

const snapshot = buildSceneSnapshotFromCampaignState(campaignState, {
  playerInput: 'I ask Whitaker for her readiness concerns.',
  overrides: { presentCharacters: ['player-commander', 'mara-whitaker'] },
});
assert.deepEqual(snapshot, {
  kind: 'directive.v1NarrationSceneSnapshot',
  campaignId: 'campaign.ashes',
  missionId: 'prelude-a-ship-underway',
  locationId: 'captain-ready-room',
  stardate: 53049.2,
  presentCharacters: ['player-commander', 'mara-whitaker'],
  playerInput: 'I ask Whitaker for her readiness concerns.',
});

const provisional = createProvisionalDirectorTurnRuntime({
  campaignState,
  turnId: 'turn.001',
  playerInput: snapshot.playerInput,
  sceneSnapshotOverrides: { presentCharacters: snapshot.presentCharacters },
  arbiterPlan: {
    kind: 'directive.turnArbiterPlan.v1',
    route: 'narration',
    sceneContinuity: { mustPreserve: ['The conversation is already underway.'] },
  },
});
assert.equal(provisional.kind, 'directive.v1ProvisionalNarrationTurn');
assert.equal(provisional.turnPacket.kind, 'directive.v1NarrationTurn');
assert.equal(provisional.turnPacket.semanticAuthority, 'acceptedPairSettlement');
assert.equal(provisional.turnPacket.semanticStateDeltaApplied, false);
assert.equal(provisional.turnPacket.narratorPacket.sourceTurnId, 'turn.001');
assert.equal(provisional.turnPacket.narratorPacket.playerInput, snapshot.playerInput);
for (const forbidden of [
  'outcomePacket',
  'stateDelta',
  'commandLogPacket',
  'provisionalOutcome',
  'finalOutcome',
  'commandBearingPrompt',
  'competencePacket',
]) {
  assert.equal(Object.hasOwn(provisional.turnPacket, forbidden), false, forbidden);
}
assert.deepEqual(campaignState, original, 'provisional narration must not mutate campaign state');

let routerCalls = 0;
const asynchronous = await createProvisionalDirectorTurnRuntimeAsync({
  campaignState,
  turnId: 'turn.002',
  playerInput: 'I ask Bronn to join us.',
  generationRouter: async () => { routerCalls += 1; },
});
assert.equal(routerCalls, 0, 'Director custody does not run a semantic sidecar');
assert.equal(asynchronous.turnPacket.turnId, 'turn.002');

const committed = commitProvisionalDirectorTurnRuntime({
  campaignState,
  turnPacket: provisional.turnPacket,
});
assert.equal(committed.kind, 'directive.v1CommittedNarrationTurn');
assert.equal(committed.campaignState.turnLedger.entries.length, 1);
assert.deepEqual(committed.campaignState.turnLedger.entries[0], {
  turnId: 'turn.001',
  semanticAuthority: 'acceptedPairSettlement',
  semanticStateDeltaApplied: false,
  narrationStatus: 'pending',
  narration: null,
  narrationFailures: [],
});
assert.equal(committed.campaignState.turnLedger.lastCommittedTurnId, 'turn.001');
assert.equal(committed.campaignState.turnLedger.historyLimit, 8);
assert.deepEqual(committed.campaignState.mission, original.mission);
assert.equal(Object.hasOwn(committed.campaignState, 'commandLog'), false);

const narrated = recordNarrationSuccess(committed.campaignState, 'turn.001', {
  providerId: 'test-provider',
  text: 'Whitaker considers the question before answering.',
  generatedAt: '2026-08-09T12:00:00.000Z',
});
assert.equal(narrated.turnLedger.entries[0].narrationStatus, 'complete');
assert.equal(narrated.turnLedger.entries[0].narration.providerId, 'test-provider');
assert.deepEqual(narrated.mission, original.mission);

const failedRetry = recordNarrationFailure(narrated, 'turn.001', {
  providerId: 'offline-provider',
  message: 'provider offline',
  failedAt: '2026-08-09T12:01:00.000Z',
});
assert.equal(failedRetry.turnLedger.entries[0].narrationStatus, 'complete');
assert.equal(failedRetry.turnLedger.entries[0].narrationFailures.length, 1);
assert.equal(failedRetry.turnLedger.pendingNarrationRecovery.turnId, 'turn.001');
assert.deepEqual(failedRetry.mission, original.mission);

const prompt = composeNarrationPrompt({
  campaignState,
  turnPacket: provisional.turnPacket,
  crewDataset: {
    officers: [{ id: 'mara-whitaker', name: 'Mara Whitaker', rank: 'Captain', billet: 'Commanding Officer' }],
    cards: [],
  },
  playerProjection: { kind: 'directive.playerProjection.v1', mission: { title: 'A Ship Underway' } },
  storyPromptProjection: { kind: 'directive.promptStoryProjection.v1', entries: [] },
});
assert.equal(prompt.kind, 'directive.v1NarrationPrompt');
assert.equal(prompt.sourceTurnId, 'turn.001');
assert.match(prompt.systemPrompt, /provisional roleplay response/i);
assert.match(prompt.systemPrompt, /player sends their next message/i);
assert.doesNotMatch(prompt.prompt, /command log|reroll mechanics|sourceOutcomeId/i);

let providerRequest = null;
const generated = await generateNarrationFromTurn({
  campaignState,
  turnPacket: provisional.turnPacket,
  provider: {
    id: 'test-provider',
    async generateNarration(request) {
      providerRequest = request;
      return { text: 'Whitaker folds her hands and begins with the unresolved readiness concern.' };
    },
  },
  now: '2026-08-09T12:02:00.000Z',
});
assert.equal(generated.kind, 'directive.v1NarrationResult');
assert.equal(generated.sourceTurnId, 'turn.001');
assert.equal(providerRequest.sourceTurnId, 'turn.001');
assert.equal(Object.hasOwn(providerRequest, 'outcomePacket'), false);
assert.equal(Object.hasOwn(generated, 'continuityClaims'), false);

console.log('V1 Director custody tests passed: narration-only packet, no semantic sidecar, and infrastructure-only commit.');
