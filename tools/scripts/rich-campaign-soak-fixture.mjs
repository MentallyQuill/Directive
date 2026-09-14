// Controlled synthetic accepted evidence, never a claim of real model acceptance.
import assert from 'node:assert/strict';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';
import { prepareV1AcceptedPairSnapshot, V1_ACCEPTED_PAIR_SOURCE_WINDOW } from '../../src/runtime/v1-accepted-pair-source.mjs';
import { assertV1CampaignState } from '../../src/runtime/v1-campaign-state.mjs';
import { createV1AcceptedPairReceipt } from '../../src/runtime/v1-accepted-pair-receipt.mjs';
import { materializeContinuityChanges, projectContinuityThreads } from '../../src/story/continuity-events.mjs';
import { openStoryEpisode, acceptStoryContributions, recordAcceptedPairReceipt, appendStoryPeopleEvents, appendStoryEffects, sealStoryEpisode, selectCurrentStoryEpisodes, observeStoryWorkingEvidence, replaceStoryWorkingCapsule } from '../../src/story/story-settlement.mjs';
import { createPeoplePlayerProjection } from '../../src/projection/v1/people-projection.mjs';

export const RICH_CAMPAIGN_SIZES = Object.freeze({
  small: { pairs: 15, threads: 5, sealedEpisodes: 2, people: 4 },
  medium: { pairs: 500, threads: 100, sealedEpisodes: 50, people: 20 },
  long: { pairs: 5000, threads: 1000, sealedEpisodes: 500, people: 40 },
});
const personId = i => `person.emergent.soak-${i}`;
const initialFact = i => `Cargo agreement ${i}: deliver cobalt containers to station ${i}.`;
const revisedFact = i => `Cargo agreement ${i}: deliver medical supplies to station ${i}; cobalt delivery is canceled.`;
const posture = (i, peopleCount) => `Following review ${i}, the officer ${Math.floor(i / peopleCount) % 2 ? 'requests a witnessed check before trusting the manifest' : 'trusts the commander to verify the manifest'}.`;
const statusFor = i => ['active', 'dormant', 'resolved'][i % 3];
const contributionId = (i, role) => `contribution.soak-${i}-${role}`;

export async function buildRichCampaignFixture({ size = 'small', onCheckpoint = async () => {} } = {}) {
  const dimensions = RICH_CAMPAIGN_SIZES[size];
  if (!dimensions) throw new TypeError(`Unknown rich campaign size: ${size}`);
  const runtimeAssets = loadAshesRuntimeAssets();
  const state = createAshesInitialState({ saveId: `save.rich-${size}`, chatId: `chat.rich-${size}` });
  const branchId = state.storySettlement.branchId;
  const messages = [{ id: 'player.soak-anchor', role: 'user', mes: 'Begin the cargo review.' }];
  // Expectations are authored from the recipe, separately from production projection.
  // Only generated thread/fact identities are resolved from materializer output.
  const oracle = { threads: [], sourceHashes: {}, pairCount: dimensions.pairs, peopleCount: dimensions.people };
  const threadIds = [], originalFactIds = [];
  const episodeEnds = new Set(Array.from({ length: dimensions.sealedEpisodes }, (_, i) =>
    Math.floor((i + 1) * dimensions.pairs / (dimensions.sealedEpisodes + 1))));
  let episodeNumber = 0;
  const open = () => {
    state.storySettlement = openStoryEpisode(state.storySettlement, {
      episodeId: `episode.soak-${episodeNumber}`, sceneId: `scene.soak-${episodeNumber++}`,
    });
  };
  open();
  for (let i = 0; i < dimensions.pairs; i++) {
    const n = dimensions.threads;
    const target = i % n;
    const stage = Math.floor(i / n);
    const person = personId(i % dimensions.people);
    const narrative = stage === 0 ? initialFact(target) : stage === 1 ? revisedFact(target)
      : stage === 2 ? `Cargo agreement ${target} is ${statusFor(target)}${statusFor(target) === 'resolved' ? ' after delivery' : ' pending inspection'}.`
        : `Review ${i} confirms the recorded medical supply agreement remains unchanged.`;
    const assistantText = `${narrative} Officer Soak ${i % dimensions.people} reviews the manifest. ${posture(i, dimensions.people)}`;
    const playerText = `I acknowledge review ${i} and preserve the recorded delivery terms.`;
    const assistant = { id: `assistant.soak-${i}`, role: 'assistant', mes: assistantText };
    const player = { id: `player.soak-${i}`, role: 'user', mes: playerText };
    messages.push(assistant, player);
    const prepared = prepareV1AcceptedPairSnapshot({ campaignState: state, currentPlayerMessage: player,
      recentMessages: messages.slice(-V1_ACCEPTED_PAIR_SOURCE_WINDOW), requirePromptingPlayerAnchor: true,
      chatId: state.campaignChatBinding.chatId });
    assert.equal(prepared.ok, true, `synthetic native source preparation: ${prepared.reason}`);
    const sourcePair = Object.fromEntries(['previousAssistant', 'currentPlayer'].map(slot => {
      const source = prepared.snapshot.source[slot];
      oracle.sourceHashes[source.hostMessageId] = source.textHash;
      return [slot, { messageId: source.hostMessageId, selectedSwipeId: source.selectedSwipeId, textHash: source.textHash, text: source.text }];
    }));
    const contributionIds = { previousAssistant: contributionId(i, 'assistant'), currentPlayer: contributionId(i, 'user') };
    state.storySettlement = acceptStoryContributions(state.storySettlement, [assistant, player].map(row => ({
      id: contributionId(i, row.role), messageId: row.id, swipeId: null, role: row.role,
      textHash: oracle.sourceHashes[row.id], acceptedAtRevision: state.storySettlement.revision,
    })));
    const sourceRangeHash = prepared.snapshot.source.sourceRangeHash;
    state.storySettlement = recordAcceptedPairReceipt(state.storySettlement, createV1AcceptedPairReceipt({
      branchId, sourceRangeHash, sourcePair, assistantAcceptance: 'accepted', sourceContributionIds: Object.values(contributionIds),
    }));
    const source = { sourceSlot: 'previousAssistant', evidenceQuote: narrative };
    let changes = [];
    if (stage === 0) changes = [
      { operation: 'open', localRef: `cargo-${target}`, title: `Cargo agreement ${target}`, category: 'obligation', ...source },
      { operation: 'addFact', threadRef: `cargo-${target}`, text: initialFact(target), claimType: 'narrated-fact', authoredRef: null, supersedesFactId: null, ...source },
    ];
    if (stage === 1) changes = [{ operation: 'addFact', threadRef: threadIds[target], text: revisedFact(target), claimType: 'narrated-fact', authoredRef: null, supersedesFactId: originalFactIds[target], ...source }];
    if (stage === 2) changes = [{ operation: 'setStatus', threadRef: threadIds[target], status: statusFor(target), ...source }];
    if (changes.length) {
      state.storySettlement.continuityEvents = await materializeContinuityChanges({
        changes, sourcePair, assistantAccepted: true, contributionIds, branchId, sourceRangeHash,
        existingEvents: state.storySettlement.continuityEvents, settledAtRevision: state.storySettlement.revision,
      });
      if (stage === 0) {
        const thread = projectContinuityThreads(state.storySettlement.continuityEvents).find(t => t.title === `Cargo agreement ${target}`);
        threadIds.push(thread.id); originalFactIds.push(thread.facts[0].id);
        oracle.threads.push({ title: `Cargo agreement ${target}`, id: thread.id, initial: initialFact(target), revised: revisedFact(target),
          createdPair: i + 1, correctedPair: n + i + 1, statusPair: 2 * n + i + 1, finalStatus: statusFor(i) });
      }
    }
    if (i < dimensions.people) state.storySettlement = appendStoryPeopleEvents(state.storySettlement, [{
      id: `people.soak-intro-${i}`, type: 'personIntroduced', personId: person, name: `Officer Soak ${i}`,
      introductionSummary: `Officer Soak ${i} reviews the cargo manifest.`, publicFacts: { role: 'Cargo officer' },
      sourceContributionIds: [contributionIds.previousAssistant],
    }]);
    state.storySettlement = appendStoryEffects(state.storySettlement, [{
      id: `effect.soak-relationship-${i}`, type: 'character.relationshipPosture', targetId: person, value: posture(i, dimensions.people),
      sourceContributionIds: [contributionIds.previousAssistant], playerVisibility: 'visible', status: 'active',
    }]);
    state.storySettlement = observeStoryWorkingEvidence(state.storySettlement, {
      branchId, observations: [assistant, player].map(row => ({
        contributionId: contributionId(i, row.role), role: row.role,
        textHash: oracle.sourceHashes[row.id], text: row.mes,
      })),
    });
    state.storySettlement = replaceStoryWorkingCapsule(state.storySettlement, {
      summary: narrative, foregroundQuestion: 'What inspection should follow this cargo review?',
      sourceContributionIds: [contributionIds.previousAssistant], effectIds: [`effect.soak-relationship-${i}`],
    });
    state.stateCustody.revision += 1;
    state.stateCustody.recentCommitIds = [...state.stateCustody.recentCommitIds, `soak.commit-${i}`].slice(-64);
    if (episodeEnds.has(i + 1)) {
      state.storySettlement = sealStoryEpisode(state.storySettlement, {
        boundaryReason: 'scene-change', summary: `Cargo review watch ${episodeNumber} ended after review ${i}.`,
        significance: { lastingChange: true },
      });
      open();
    }
    assertV1CampaignState(state);
    await onCheckpoint(state, i + 1);
  }
  assertV1CampaignState(state);
  return { size, dimensions, state, messages, runtimeAssets, oracle };
}

export function assertRichCampaignOracle(fixture, { state = fixture.state, retainedPairs = fixture.dimensions.pairs } = {}) {
  assertV1CampaignState(state);
  const threads = projectContinuityThreads(state.storySettlement.continuityEvents);
  const expectedThreads = fixture.oracle.threads.filter(t => t.createdPair <= retainedPairs);
  assert.equal(threads.length, expectedThreads.length, 'exact retained thread count');
  for (const expected of expectedThreads) {
    const actual = threads.find(t => t.title === expected.title);
    assert.ok(actual, `retained thread ${expected.title}`);
    assert.deepEqual(actual.facts.map(f => f.text), [retainedPairs >= expected.correctedPair ? expected.revised : expected.initial], 'correction custody');
    assert.equal(actual.status, retainedPairs >= expected.statusPair ? expected.finalStatus : 'active', 'status custody');
  }
  const messages = new Map(fixture.messages.slice(0, retainedPairs * 2 + 1).map(row => [row.id, row]));
  const episodes = [...selectCurrentStoryEpisodes(state.storySettlement), ...state.storySettlement.episodes.filter(e => e.status === 'open' && e.id === state.storySettlement.activeEpisode)];
  const contributions = episodes.flatMap(e => e.contributions);
  // Recovery can omit an unreferenced acknowledgement from a replacement sealed
  // episode. Its accepted receipt/archive survives; all substantive assistant
  // evidence in this recipe must remain current, and discarded evidence must not.
  assert.equal(contributions.filter(c => c.role === 'assistant').length, retainedPairs, 'exact retained substantive contributions');
  assert.deepEqual(contributions.filter(c => c.role === 'assistant').map(c => c.messageId).sort(),
    Array.from({ length: retainedPairs }, (_, i) => `assistant.soak-${i}`).sort(), 'exact current assistant source set');
  for (const contribution of contributions) {
    assert.ok(messages.has(contribution.messageId), 'contribution belongs to retained transcript');
    assert.equal(contribution.textHash, fixture.oracle.sourceHashes[contribution.messageId], 'contribution source hash');
  }
  const receipts = state.storySettlement.acceptedPairReceipts;
  assert.equal(receipts.length, retainedPairs, 'one actual source-bound receipt per retained pair');
  const archivedContributions = new Map(state.storySettlement.episodes.flatMap(e => e.contributions).map(c => [c.id, c]));
  for (const receipt of receipts) {
    assert.equal(receipt.branchId, state.storySettlement.branchId, 'receipt branch custody');
    assert.equal(receipt.sourceContributionIds.length, 2, 'receipt retains both source contributions');
    for (const source of [receipt.previousAssistant, receipt.currentPlayer]) {
      assert.ok(messages.has(source.messageId), 'receipt belongs to retained transcript');
      assert.equal(source.textHash, fixture.oracle.sourceHashes[source.messageId], 'receipt source hash');
      assert.ok(receipt.sourceContributionIds.some(id => archivedContributions.get(id)?.messageId === source.messageId), 'receipt has exact archived source evidence');
    }
  }
  const people = createPeoplePlayerProjection({ runtimeAssets: fixture.runtimeAssets, storySettlement: state.storySettlement }).people;
  for (let p = 0; p < Math.min(fixture.dimensions.people, retainedPairs); p++) {
    const last = p + Math.floor((retainedPairs - 1 - p) / fixture.dimensions.people) * fixture.dimensions.people;
    assert.equal(people.find(person => person.id === personId(p))?.relationshipPosture, posture(last, fixture.dimensions.people), 'latest retained relationship evidence');
  }
  assert.equal(episodes.flatMap(e => e.effects).length, retainedPairs, 'exact retained relationship effects');
  return { threads: threads.length, currentContributions: contributions.length, substantiveContributions: retainedPairs, receipts: receipts.length };
}
