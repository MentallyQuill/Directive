import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStoryContextIndex, deriveStoryPositionCandidates } from '../../src/story/story-context-index.mjs';
import { createSourceReconciliationEngine } from '../../src/runtime/source-reconciliation-engine.mjs';
import { composeNarrationPrompt } from '../../src/generation/narration.mjs';

const packageData = JSON.parse(readFileSync(new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json', import.meta.url), 'utf8'));
const missionGraph = JSON.parse(readFileSync(new URL('../../packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json', import.meta.url), 'utf8'));

const campaignState = {
  campaign: { id: 'ashes-of-peace', templateCampaignId: 'ashes-of-peace' },
  mission: {
    activeMissionId: 'prelude-a-ship-underway',
    activeMissionGraphId: missionGraph.manifest.id,
    activePhaseId: 'hesperus-diversion'
  },
  player: { id: 'player-commander', name: 'Commander Vale', rank: 'Commander', billet: 'Executive Officer' },
  crew: { seniorCrewIds: ['mara-whitaker', 'kieran-vale', 'priya-nayar'] },
  storyEventLedger: { events: [] },
  knowledgeLedger: { facts: [
    { id: 'hesperus.passenger-risk', known: true },
    { id: 'hesperus.plasma-injector-failing', known: true }
  ] }
};

const playerInput = 'I found an abandoned cargo ship and the missing crew are hiding aboard it.';
const storyContextIndex = buildStoryContextIndex({
  campaignState,
  packageData,
  missionGraph,
  playerInput,
  recentTranscript: ['The Hesperus is on emergency power.', 'Medical requests a passenger count.']
});
assert.equal(storyContextIndex.current.activePhaseId, 'hesperus-diversion');
assert.equal(storyContextIndex.turn.claimAuthority.disposition, 'verification-required');
assert.equal(storyContextIndex.turn.claimAuthority.accepted, false);

const candidates = deriveStoryPositionCandidates({ storyContextIndex });
const aftermath = candidates.find((candidate) => candidate.nodeId === 'phase.hesperus-aftermath');
assert(aftermath, 'Hesperus aftermath candidate should remain visible');
assert.equal(aftermath.eligibility.ok, false);

const sourceReview = createSourceReconciliationEngine({ now: () => '2026-07-31T00:00:00.000Z' }).reviewHostNativeContinuity({
  text: 'The crew confirms the abandoned cargo ship was carrying the missing crew.',
  campaignState,
  packageData,
  outcomeId: 'outcome.hesperus.1',
  turnId: 'turn.hesperus.1'
});
assert.equal(sourceReview.ok, true, 'unsupported claims should not be mislabeled as continuity contradictions');
assert.equal(sourceReview.claimAuthority.disposition, 'quarantine');
assert.equal(sourceReview.claimAuthority.accepted, false);

const prompt = composeNarrationPrompt({
  campaignState,
  packageData,
  turnPacket: {
    outcomePacket: { id: 'outcome.hesperus.1', resultBand: 'mixed', summary: 'Passengers are transferred under time pressure.' },
    narratorPacket: { sourceOutcomeId: 'outcome.hesperus.1', playerInput, allowedCardIds: [] },
    sceneSnapshot: { playerInput },
    commandLogPacket: { summaryInputs: [playerInput], visibleConsequences: [] }
  }
});
assert.match(prompt.prompt, /Claim Authority for Player Input/);
assert.match(prompt.systemPrompt, /unsupported player assertion/);
assert.equal(prompt.claimAuthority.disposition, 'verification-required');

console.log('Ashes story authority vertical slice passed');
