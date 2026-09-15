import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createInitialMissionJourney, validateMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';

import {
  armV1CommandBearingEdge,
  awardV1CommandBearing,
  commitV1CommandBearingEdge,
  createV1CommandBearing,
  rebuildV1CommandBearingForLineage,
  reserveV1CommandBearingEdge
} from '../../src/command/v1-command-bearing.mjs';
import { hashStableJson } from '../../src/runtime/v1-host-message-contracts.mjs';
import { createV1AcceptedPairReceipt } from '../../src/runtime/v1-accepted-pair-receipt.mjs';
import { reconstructV1BranchState } from '../../src/runtime/v1-branch-reconstruction.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { stableHash24, stableSha256Hex } from '../../src/runtime/v1-stable-hash.mjs';
import { createV1StateSpine } from '../../src/runtime/v1-state-spine.mjs';
import { prepareV1AcceptedPairTimeAdvance } from '../../src/runtime/v1-accepted-pair-time.mjs';
import {
  acceptStoryContributions,
  openStoryEpisode,
  recordAcceptedPairReceipt,
  settleInsignificantScene,
} from '../../src/story/story-settlement.mjs';
import {
  materializeContinuityChanges,
  projectContinuityThreads,
} from '../../src/story/continuity-events.mjs';
import {
  createDirectorReceipt,
  createPendingDossier,
} from '../../src/story/continuity-contracts.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const runtimeAssets = loadAshesRuntimeAssets();
const parentState = createAshesInitialState({ saveId: 'save.parent', chatId: 'chat.parent' });
const parentMessages = [
  { id: 'player.1', role: 'user', mes: 'Report to the bridge.' },
  { id: 'assistant.1', role: 'assistant', mes: 'The lift doors open.' },
  { id: 'player.2', role: 'user', mes: 'Ask for the readiness report.' },
  { id: 'assistant.2', role: 'assistant', mes: 'Whitaker passes over the slate.' }
];
parentState.storySettlement = recordAcceptedPairReceipt(
  parentState.storySettlement,
  createV1AcceptedPairReceipt({
    branchId: 'save.parent',
    sourceRangeHash: 'range.discarded-player-2',
    sourcePair: {
      previousAssistant: {
        messageId: 'assistant.1',
        selectedSwipeId: null,
        textHash: hashStableJson({ text: 'The lift doors open.' }),
      },
      currentPlayer: {
        messageId: 'player.2',
        selectedSwipeId: null,
        textHash: hashStableJson({ text: 'Ask for the readiness report.' }),
      },
    },
    assistantAcceptance: 'corrected',
    sourceContributionIds: [],
  }),
);
const original = structuredClone(parentState);
const rebuilt = await reconstructV1BranchState({
  parentState,
  parentMessages,
  childMessages: parentMessages.slice(0, 2),
  lineageHash: 'lineage.1',
  targetSaveId: 'save.child',
  targetChatBinding: {
    kind: 'directive.campaignChatBinding.v1',
    version: 1,
    campaignId: parentState.campaign.id,
    saveId: 'save.child',
    chatId: 'chat.child',
    status: 'bound'
  },
  runtimeAssets,
  now: () => '2026-08-11T12:00:00.000Z'
});

assert.deepEqual(parentState, original, 'parent authority remains immutable');
assert.equal(rebuilt.campaignState.campaignChatBinding.saveId, 'save.child');
assert.equal(rebuilt.campaignState.campaignChatBinding.chatId, 'chat.child');
assert.equal(rebuilt.campaignState.mission.v1.branchId, 'save.child');
assert.equal(rebuilt.campaignState.mission.v1Journey.branchId, 'save.child');
assert.equal(rebuilt.campaignState.storySettlement.branchId, 'save.child');
assert.notEqual(rebuilt.campaignState.mission.v1Journey.activeRunId, parentState.mission.v1Journey.activeRunId);
assert.deepEqual(rebuilt.discardedHostMessageIds, ['player.2', 'assistant.2']);
assert.equal(rebuilt.retainedSourceCount, 2);
assert.equal(rebuilt.lineageHash, 'lineage.1');
assert.equal(rebuilt.modelCallCount, 0);
assert.equal(rebuilt.projection.ok, true);
assert.deepEqual(rebuilt.campaignState.storySettlement.acceptedPairReceipts, []);

const continuityMessages = [
  { id: 'player.c0', role: 'user', mes: 'Request rendezvous orders.' },
  { id: 'assistant.c1', role: 'assistant', mes: 'The rendezvous is set for 1400.' },
  { id: 'player.c2', role: 'user', mes: 'I commit to attend the rendezvous.' },
  { id: 'assistant.c3', role: 'assistant', mes: 'The rendezvous concludes successfully.' },
  { id: 'player.c4', role: 'user', mes: 'I record the completed rendezvous.' },
];
const continuityParent = createAshesInitialState({ saveId: 'save.continuity-parent', chatId: 'chat.continuity-parent' });
let continuitySettlement = openStoryEpisode(continuityParent.storySettlement, {
  episodeId: 'episode.continuity',
  sceneId: 'scene.continuity',
});
continuitySettlement = acceptStoryContributions(continuitySettlement, [
  {
    id: 'contribution.continuity-a', messageId: 'assistant.c1', swipeId: null,
    role: 'assistant', textHash: hashStableJson({ text: continuityMessages[1].mes }), acceptedAtRevision: 1,
  },
  {
    id: 'contribution.continuity-b', messageId: 'player.c2', swipeId: null,
    role: 'user', textHash: hashStableJson({ text: continuityMessages[2].mes }), acceptedAtRevision: 2,
  },
  {
    id: 'contribution.continuity-c', messageId: 'assistant.c3', swipeId: null,
    role: 'assistant', textHash: hashStableJson({ text: continuityMessages[3].mes }), acceptedAtRevision: 3,
  },
]);
const pairA = {
  previousAssistant: {
    messageId: 'assistant.c1', selectedSwipeId: null,
    textHash: hashStableJson({ text: continuityMessages[1].mes }), text: continuityMessages[1].mes,
  },
  currentPlayer: {
    messageId: 'player.c2', selectedSwipeId: null,
    textHash: hashStableJson({ text: continuityMessages[2].mes }), text: continuityMessages[2].mes,
  },
};
let continuityEvents = await materializeContinuityChanges({
  changes: [
    {
      operation: 'open', localRef: 'rendezvous', title: 'Scheduled rendezvous', category: 'schedule',
      sourceSlot: 'previousAssistant', evidenceQuote: 'The rendezvous is set for 1400.',
    },
    {
      operation: 'addFact', threadRef: 'rendezvous', text: 'The rendezvous is scheduled for 1400.',
      claimType: 'narrated-fact', authoredRef: null, supersedesFactId: null,
      sourceSlot: 'previousAssistant', evidenceQuote: 'The rendezvous is set for 1400.',
    },
    {
      operation: 'addFact', threadRef: 'rendezvous', text: 'The player committed to attend the rendezvous.',
      claimType: 'player-commitment', authoredRef: null, supersedesFactId: null,
      sourceSlot: 'currentPlayer', evidenceQuote: 'I commit to attend the rendezvous.',
    },
  ],
  sourcePair: pairA, assistantAccepted: true,
  contributionIds: {
    previousAssistant: 'contribution.continuity-a',
    currentPlayer: 'contribution.continuity-b',
  },
  branchId: 'save.continuity-parent', sourceRangeHash: 'pair.continuity-a',
  existingEvents: [], settledAtRevision: continuitySettlement.revision,
});
const continuityThreadId = projectContinuityThreads(continuityEvents)[0].id;
continuityEvents = await materializeContinuityChanges({
  changes: [{
    operation: 'setStatus', threadRef: continuityThreadId, status: 'resolved',
    sourceSlot: 'previousAssistant', evidenceQuote: 'The rendezvous concludes successfully.',
  }],
  sourcePair: {
    previousAssistant: {
      messageId: 'assistant.c3', selectedSwipeId: null,
      textHash: hashStableJson({ text: continuityMessages[3].mes }), text: continuityMessages[3].mes,
    },
    currentPlayer: {
      messageId: 'player.c4', selectedSwipeId: null,
      textHash: hashStableJson({ text: continuityMessages[4].mes }), text: continuityMessages[4].mes,
    },
  },
  assistantAccepted: true,
  contributionIds: {
    previousAssistant: 'contribution.continuity-c',
    currentPlayer: 'contribution.continuity-player-c',
  },
  branchId: 'save.continuity-parent', sourceRangeHash: 'pair.continuity-c',
  existingEvents: continuityEvents, settledAtRevision: continuitySettlement.revision,
});
const continuityReceipt = await createDirectorReceipt({
  branchId: 'save.continuity-parent',
  packageId: 'package.ashes',
  packageVersion: '1',
  missionId: 'mission.ashes',
  generationType: 'normal',
  generationTargetKey: 'target.continuity',
  requestKey: 'request.continuity',
  reuseKey: 'reuse.continuity',
  sourceRangeHash: 'pair.continuity-a',
  sourceContributionIds: ['contribution.continuity-b'],
  instruction: 'Keep the active rendezvous commitment in view.',
  dependencyIds: [continuityEvents[0].id, continuityEvents[0].threadId, 'contribution.continuity-b'],
  settledAtRevision: continuitySettlement.revision,
});
const continuityDossier = await createPendingDossier({
  personId: 'person.rendezvous-officer',
  introductionSourceContributionIds: ['contribution.continuity-b'],
  publicContext: { displayName: 'Rendezvous Officer', introductionSummary: 'Coordinates the rendezvous.' },
});
continuityParent.storySettlement = {
  ...continuitySettlement,
  continuityEvents,
  directorReceipts: [continuityReceipt],
  pendingDossiers: [continuityDossier],
};
const continuityOriginal = structuredClone(continuityParent);
const continuityChild = await reconstructV1BranchState({
  parentState: continuityParent,
  parentMessages: continuityMessages,
  childMessages: continuityMessages.slice(0, 3),
  lineageHash: 'lineage.continuity',
  targetSaveId: 'save.continuity-child',
  targetChatBinding: {
    kind: 'directive.campaignChatBinding.v1', version: 1,
    campaignId: continuityParent.campaign.id,
    saveId: 'save.continuity-child', chatId: 'chat.continuity-child', status: 'bound',
  },
  runtimeAssets,
  now: () => '2026-08-11T12:00:00.000Z',
});
assert.deepEqual(continuityParent, continuityOriginal);
const childContinuityEvents = continuityChild.campaignState.storySettlement.continuityEvents;
assert.equal(projectContinuityThreads(childContinuityEvents)[0].status, 'active');
assert.equal(childContinuityEvents.every((event) => event.branchId === 'save.continuity-child'), true);
assert.equal(childContinuityEvents.some((event) => event.sourceContributionIds.includes('contribution.continuity-c')), false);
assert.equal(childContinuityEvents.some((event) => continuityEvents.some((parentEvent) => parentEvent.id === event.id)), false);
const childEventIds = new Set(childContinuityEvents.map((event) => event.id));
assert.equal(childContinuityEvents.every((event) => event.dependsOnEventIds.every((id) => childEventIds.has(id))), true);
const [childDirectorReceipt] = continuityChild.campaignState.storySettlement.directorReceipts;
assert.equal(childDirectorReceipt.branchId, 'save.continuity-child');
assert.notEqual(childDirectorReceipt.id, continuityReceipt.id);
assert.equal(childDirectorReceipt.sourceContributionIds[0] === continuityReceipt.sourceContributionIds[0], false);
assert.equal(childDirectorReceipt.dependencyIds.every((id) => (
  childEventIds.has(id)
  || childContinuityEvents.some((event) => event.threadId === id)
  || childDirectorReceipt.sourceContributionIds.includes(id)
)), true);
const [childDossier] = continuityChild.campaignState.storySettlement.pendingDossiers;
assert.notEqual(childDossier.id, continuityDossier.id);
assert.equal(childDossier.introductionSourceContributionIds[0] === continuityDossier.introductionSourceContributionIds[0], false);

// Exercise actual mission reduction, story/receipt custody and accepted time,
// including the synthetic source prefix used by retained time-boundary evidence.
{
  let state = createAshesInitialState({ saveId: 'save.matcher-parent', chatId: 'chat.matcher-parent' });
  const definition = runtimeAssets.missionDefinitions.find(item => item.id === state.mission.v1.definitionId);
  const messages = [
    { id: 'player.matcher-keep', role: 'user', mes: 'Begin the handover.' },
    { id: 'assistant.matcher-keep', role: 'assistant', mes: 'The bridge is ready.' },
    { id: 'player.matcher-accept', role: 'user', mes: 'Continue the handover.' },
    { id: 'assistant.matcher-drop', role: 'assistant', mes: 'Whitaker settles the authority and escalation terms.' },
    { id: 'player.matcher-drop', role: 'user', mes: 'I accept the terms and finish the one-minute briefing.' },
    ...Array.from({ length: 32 }, (_, index) => ({
      id: `unaccepted.matcher-${index}`, role: index % 2 ? 'user' : 'assistant', mes: `Unaccepted draft ${index}`,
    })),
  ];
  const syntheticId = `time-boundary:${stableHash24(messages[4].id)}:accepted-elapsed`;
  const contributions = [messages[1], messages[3], messages[4], {
    id: syntheticId, role: 'runtime', mes: 'The accepted briefing boundary settles the handover terms.',
  }].map((message, index) => ({
    id: `contribution.matcher-${index}`, messageId: message.id, role: message.role,
    swipeId: null, textHash: stableSha256Hex(message.mes), acceptedAtRevision: 0,
  }));
  const runtimeSource = contributions.at(-1);
  const gateway = createStateDeltaGateway({ getState: () => state, setState: next => { state = next; } });
  const spine = createV1StateSpine({
    getState: () => state, stateDeltaGateway: gateway,
    resolveSourceRef: ref => {
      const contribution = contributions.find(item => item.messageId === ref.messageId);
      return contribution ? {
        ...contribution, contributionId: contribution.id, branchId: state.campaignChatBinding.saveId,
        accepted: true, selectedSwipeId: contribution.swipeId,
      } : null;
    },
    now: () => '2026-08-11T12:00:00.000Z',
  });
  const sourcePair = {
    previousAssistant: { messageId: messages[3].id, textHash: contributions[1].textHash, selectedSwipeId: null },
    currentPlayer: { messageId: messages[4].id, textHash: contributions[2].textHash, selectedSwipeId: null },
  };
  const preparedTime = prepareV1AcceptedPairTimeAdvance({
    campaignState: state,
    snapshot: {
      envelope: { campaignId: state.campaign.id, saveId: state.campaignChatBinding.saveId, chatId: state.campaignChatBinding.chatId },
      source: { sourceRangeHash: 'range.matcher',
        previousAssistant: { hostMessageId: messages[3].id, text: messages[3].mes },
        currentPlayer: { hostMessageId: messages[4].id, text: messages[4].mes },
      },
    },
    packageData: runtimeAssets.packageData,
    timeDecision: { decision: 'advance', basis: 'implicitAction', elapsedSeconds: 60,
      sourceSlot: 'currentPlayer', evidenceQuote: messages[4].mes, reason: 'accepted-briefing', confidence: 1 },
    now: () => '2026-08-11T12:00:00.000Z',
  });
  assert.equal(preparedTime.ok, true);
  const settled = await spine.settleAcceptedPair({
    definition, missionDefinitions: runtimeAssets.missionDefinitions,
    proposal: {
      kind: 'directive.missionEvidenceProposal.v1', branchId: state.campaignChatBinding.saveId,
      missionId: definition.id, baseRevision: state.mission.v1.revision,
      claims: [{ claimId: 'claim.matcher-handover', policyId: 'policy.prelude.command-handover-terms-settled',
        claimType: 'eventOccurred', targetId: 'event.prelude.command-handover-terms-settled',
        sourceRef: { messageId: runtimeSource.messageId, swipeId: null, textHash: runtimeSource.textHash } }],
    },
    sourceContributions: contributions,
    sourceObservations: contributions.map(item => ({ contributionId: item.id, role: item.role,
      textHash: item.textHash, text: item.role === 'runtime' ? 'The accepted briefing boundary settles the handover terms.' : messages.find(row => row.id === item.messageId).mes })),
    acceptedPairReceipt: createV1AcceptedPairReceipt({ branchId: state.campaignChatBinding.saveId,
      sourceRangeHash: 'range.matcher', sourcePair, assistantAcceptance: 'accepted',
      sourceContributionIds: contributions.slice(1, 3).map(item => item.id) }),
    authorityPatch: preparedTime.patch, authorityDomains: preparedTime.domains,
    scene: { episodeId: 'episode.matcher', sceneId: 'scene.matcher', summary: 'The handover terms are settled.' },
  });
  assert.equal(settled.evidence.acceptedClaims.length, 1, 'real mission validator/reducer accepts the source-bound claim');
  assert.ok(state.mission.v1.events.includes('event.prelude.command-handover-terms-settled'));
  assert.equal(state.mission.v1.evidenceLog[0].sourceContributionId, runtimeSource.id);
  assert.equal(state.timeLedger.elapsedSeconds, 60);
  const original = structuredClone(state);
  for (const retainedLength of [5, messages.length]) {
    const kept = await reconstructV1BranchState({ parentState: state, parentMessages: messages,
      childMessages: messages.slice(0, retainedLength), targetSaveId: 'save.matcher-retained',
      targetChatBinding: { kind: 'directive.campaignChatBinding.v1', version: 1, campaignId: state.campaign.id,
        saveId: 'save.matcher-retained', chatId: 'chat.matcher-retained', status: 'bound' }, runtimeAssets });
    assert.ok(kept.campaignState.mission.v1.events.includes('event.prelude.command-handover-terms-settled'));
    assert.equal(kept.campaignState.mission.v1.evidenceLog.length, 1);
    assert.equal(kept.campaignState.timeLedger.elapsedSeconds, 60);
    assert.deepEqual(state, original, 'retaining the native boundary preserves authority without mutating parent');
  }
  const discardedIds = new Set(messages.slice(3).map(message => message.id));
  const encodeCounts = new Map();
  const NativeTextEncoder = globalThis.TextEncoder;
  // Observe existing hash inputs without exposing a production test/performance API.
  globalThis.TextEncoder = class extends NativeTextEncoder {
    encode(value) {
      if (discardedIds.has(value)) encodeCounts.set(value, (encodeCounts.get(value) || 0) + 1);
      return super.encode(value);
    }
  };
  let child;
  try {
    child = await reconstructV1BranchState({ parentState: state, parentMessages: messages,
      childMessages: messages.slice(0, 3), targetSaveId: 'save.matcher-child',
      targetChatBinding: { kind: 'directive.campaignChatBinding.v1', version: 1, campaignId: state.campaign.id,
        saveId: 'save.matcher-child', chatId: 'chat.matcher-child', status: 'bound' },
      runtimeAssets, now: () => '2026-08-11T12:00:00.000Z' });
  } finally {
    globalThis.TextEncoder = NativeTextEncoder;
  }
  assert.deepEqual(state, original, 'mission/story/time parent remains immutable');
  assert.equal(child.projection.ok, true);
  assert.equal(child.modelCallCount, 0);
  assert.deepEqual({
    missionEventPresent: child.campaignState.mission.v1.events.includes('event.prelude.command-handover-terms-settled'),
    missionEvidenceCount: child.campaignState.mission.v1.evidenceLog.length,
    activeMissionEffects: child.campaignState.storySettlement.episodes
      .filter(episode => episode.status !== 'invalidated')
      .flatMap(episode => episode.effects).filter(effect => effect.targetId === 'event.prelude.command-handover-terms-settled' && effect.status !== 'invalidated').length,
    syntheticContributions: child.campaignState.storySettlement.episodes
      .filter(episode => episode.status !== 'invalidated')
      .flatMap(episode => episode.contributions).filter(item => item.messageId === syntheticId).length,
    acceptedReceipts: child.campaignState.storySettlement.acceptedPairReceipts.length,
    elapsedSeconds: child.campaignState.timeLedger.elapsedSeconds,
  }, {
    missionEventPresent: false, missionEvidenceCount: 0, activeMissionEffects: 0,
    syntheticContributions: 0, acceptedReceipts: 0, elapsedSeconds: 0,
  }, 'discarded native anchor retracts its real mission evidence/effect and synthetic contribution alongside receipt/time');
  assert.deepEqual(child.campaignState.storySettlement.acceptedPairReceipts, [], 'ordinary discarded accepted pair retracts receipt');
  assert.equal(child.campaignState.timeLedger.elapsedSeconds, 0);
  assert.deepEqual(child.campaignState.timeLedger.entries, []);
  assert.deepEqual(child.campaignState.storySettlement.episodes.flatMap(episode => episode.contributions.map(item => item.messageId)),
    [messages[1].id], 'retained ordinary story evidence survives while discarded ordinary and synthetic evidence retracts');
  assert.ok([...encodeCounts.values()].every(count => count <= 1),
    `discarded host IDs must be hashed at most once per reconstruction: ${JSON.stringify([...encodeCounts])}`);
}


// Exact IDs and hashed prefixes share one matcher. Embedded IDs, malformed
// prefixes and case-changed hashes remain distinct; receipt-only custody works.
{
  const state = createAshesInitialState({ saveId: 'save.matcher-edges', chatId: 'chat.matcher-edges' });
  const discardedId = 'message.matcher-discarded';
  const boundary = `time-boundary:${stableHash24(discardedId)}`;
  const messageIds = [discardedId, `${boundary}:`, `${boundary}:arbitrary:suffix`,
    `embedded-${discardedId}`, `embedded-${boundary}:suffix`, boundary,
    `${boundary}x:suffix`, `time-boundary:${stableHash24(discardedId).toUpperCase()}:suffix`];
  const sources = messageIds.map((messageId, index) => ({ id: `contribution.matcher-edge-${index}`,
    messageId, role: 'runtime', swipeId: null, textHash: stableSha256Hex(messageId), acceptedAtRevision: 0 }));
  state.storySettlement = settleInsignificantScene(state.storySettlement, {
    sceneId: 'scene.matcher-receipt-only', sourceContributions: [{ ...sources[0], id: 'contribution.matcher-receipt-only' }],
  });
  state.storySettlement = acceptStoryContributions(openStoryEpisode(state.storySettlement, {
    episodeId: 'episode.matcher-edges', sceneId: 'scene.matcher-edges',
  }), sources);
  const original = structuredClone(state);
  const messages = [{ id: 'message.matcher-kept', role: 'user', mes: 'Keep this.' },
    { id: discardedId, role: 'assistant', mes: 'Discard this.' }];
  const child = await reconstructV1BranchState({ parentState: state, parentMessages: messages,
    childMessages: messages.slice(0, 1), targetSaveId: 'save.matcher-edges-child',
    targetChatBinding: { kind: 'directive.campaignChatBinding.v1', version: 1, campaignId: state.campaign.id,
      saveId: 'save.matcher-edges-child', chatId: 'chat.matcher-edges-child', status: 'bound' }, runtimeAssets });
  assert.deepEqual(state, original);
  assert.deepEqual(child.campaignState.storySettlement.episodes.flatMap(episode => episode.contributions.map(item => item.messageId)),
    messageIds.slice(3));
  const receipts = child.campaignState.storySettlement.receipts.filter(receipt => receipt.sceneId === 'scene.matcher-receipt-only');
  assert.deepEqual(receipts.map(receipt => receipt.disposition), ['insignificant', 'invalidated'],
    'receipt-only source gains an invalidation receipt while historical custody remains');
}

// A real terminal reduction archives the synthetic source before a second
// source settles in its successor. Cuts must select the earliest affected run.
{
  const reference = JSON.parse(fs.readFileSync('tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json', 'utf8'));
  const definitions = ['a', 'b'].map((suffix) => {
    const definition = structuredClone(reference);
    definition.id = `mission.matcher-${suffix}`;
    definition.packageBinding.sourceId = `matcher-${suffix}`;
    if (suffix === 'a') definition.transitions[0].target = {
      kind: 'mission', id: 'matcher-b', playerSafeSetup: 'Continue to the next rescue.',
    };
    return definition;
  });
  const assets = { ...runtimeAssets, missionDefinitions: definitions,
    missionDefinitionsById: new Map(definitions.map(definition => [definition.id, definition])) };
  let state = createAshesInitialState({ saveId: 'save.matcher-journey', chatId: 'chat.matcher-journey' });
  const initial = createInitialMissionJourney({ definition: definitions[0], branchId: state.campaignChatBinding.saveId });
  state.mission = { activeMissionId: definitions[0].packageBinding.sourceId,
    v1: createMissionState({ definition: definitions[0], branchId: state.campaignChatBinding.saveId }),
    v1Journey: initial.journey, v1History: initial.history };
  const messages = Array.from({ length: 7 }, (_, index) => ({
    id: `message.matcher-journey-${index}`, role: index % 2 ? 'assistant' : 'user', mes: `Rescue source ${index}.`,
  }));
  const sources = [2, 4].map(index => ({
    id: `contribution.matcher-journey-${index}`,
    messageId: `time-boundary:${stableHash24(messages[index].id)}:accepted-elapsed`,
    role: 'runtime', swipeId: null, textHash: stableSha256Hex(messages[index].mes), acceptedAtRevision: 0,
  }));
  const gateway = createStateDeltaGateway({ getState: () => state, setState: next => { state = next; } });
  const spine = createV1StateSpine({ getState: () => state, stateDeltaGateway: gateway,
    resolveSourceRef: ref => {
      const source = sources.find(item => item.messageId === ref.messageId);
      return source ? { ...source, contributionId: source.id, branchId: state.campaignChatBinding.saveId,
        accepted: true, selectedSwipeId: null } : null;
    }, now: () => '2026-08-11T12:00:00.000Z' });
  for (const [index, source] of sources.entries()) {
    const terminal = index === 0;
    const settled = await spine.settleAcceptedPair({
      definition: definitions[index], missionDefinitions: definitions,
      proposal: { kind: 'directive.missionEvidenceProposal.v1', branchId: state.campaignChatBinding.saveId,
        missionId: definitions[index].id, baseRevision: state.mission.v1.revision,
        claims: [{ claimId: `claim.matcher-journey-${index}`,
          policyId: terminal ? 'policy.hesperus-survivors-transferred' : 'policy.hesperus-discrepancy-established',
          claimType: terminal ? 'eventOccurred' : 'worldFactEstablished',
          targetId: terminal ? 'event.hesperus-survivors-transferred' : 'fact.hesperus-discrepancy-known',
          sourceRef: { messageId: source.messageId, swipeId: null, textHash: source.textHash } }] },
      sourceContributions: [source],
      sourceObservations: [{ contributionId: source.id, role: source.role, textHash: source.textHash,
        text: messages[(index + 1) * 2].mes }],
      scene: { episodeId: `episode.matcher-journey-${index}`, sceneId: `scene.matcher-journey-${index}` },
    });
    assert.equal(settled.evidence.acceptedClaims.length, 1);
  }
  assert.equal(state.mission.v1History.length, 1);
  assert.equal(state.mission.v1History[0].state.evidenceLog[0].sourceContributionId, sources[0].id);
  assert.equal(state.mission.v1.evidenceLog[0].sourceContributionId, sources[1].id);
  const original = structuredClone(state);
  for (const [retainedLength, expectedDefinition, historyLength, evidenceCount] of [
    [7, definitions[1].id, 1, 1], // full tail
    [5, definitions[1].id, 1, 1], // both anchors retained; only unaccepted draft removed
    [3, definitions[1].id, 1, 0], // archived source retained, current source discarded
    [1, definitions[0].id, 0, 0], // archived source discarded; successor rolls back causally
  ]) {
    const child = await reconstructV1BranchState({ parentState: state, parentMessages: messages,
      childMessages: messages.slice(0, retainedLength), targetSaveId: 'save.matcher-journey-child',
      targetChatBinding: { kind: 'directive.campaignChatBinding.v1', version: 1, campaignId: state.campaign.id,
        saveId: 'save.matcher-journey-child', chatId: 'chat.matcher-journey-child', status: 'bound' },
      runtimeAssets: assets, now: () => '2026-08-11T12:00:00.000Z' });
    assert.deepEqual(state, original, `archived/current cut ${retainedLength} leaves full parent immutable`);
    assert.equal(child.campaignState.mission.v1.definitionId, expectedDefinition);
    assert.equal(child.campaignState.mission.v1History.length, historyLength);
    assert.equal(child.campaignState.mission.v1.evidenceLog.length, evidenceCount);
    assert.equal(child.campaignState.mission.v1.worldFacts.includes('fact.hesperus-discrepancy-known'), evidenceCount > 0);
    assert.deepEqual(validateMissionJourney({ campaignState: child.campaignState, definitions }), { ok: true, errors: [] });
    const activeEpisodes = child.campaignState.storySettlement.episodes.filter(episode => episode.status !== 'invalidated');
    const keptIds = activeEpisodes.flatMap(episode => episode.contributions.map(source => source.messageId));
    assert.deepEqual(keptIds, retainedLength >= 5 ? sources.map(source => source.messageId)
      : retainedLength === 3 ? [sources[0].messageId] : []);
    assert.equal(activeEpisodes.flatMap(episode => episode.effects).filter(effect => effect.status !== 'invalidated').length,
      retainedLength >= 5 ? 2 : retainedLength === 3 ? 1 : 0);
    assert.equal(child.projection.ok, true);
    assert.equal(child.modelCallCount, 0);
  }
}

let bearing = createV1CommandBearing({ capacity: 3 });
bearing = awardV1CommandBearing(bearing, { awardId: 'award.keep.1', sourceId: 'objective.keep.1', reason: 'Kept one', now: '2026-08-11T01:00:00.000Z' }).commandBearing;
bearing = awardV1CommandBearing(bearing, { awardId: 'award.drop', sourceId: 'objective.drop', reason: 'Discarded', now: '2026-08-11T02:00:00.000Z' }).commandBearing;
bearing = awardV1CommandBearing(bearing, { awardId: 'award.keep.2', sourceId: 'objective.keep.2', reason: 'Kept two', now: '2026-08-11T03:00:00.000Z' }).commandBearing;
bearing = reserveV1CommandBearingEdge(bearing, { spendId: 'spend.safe', reason: 'Safe edge', now: '2026-08-11T04:00:00.000Z' }).commandBearing;
bearing = armV1CommandBearingEdge(bearing, { spendId: 'spend.safe', playerMessageId: 'player.safe', now: '2026-08-11T04:01:00.000Z' }).commandBearing;
bearing = commitV1CommandBearingEdge(bearing, {
  spendId: 'spend.safe',
  assistantMessageId: 'assistant.safe',
  assistantTextHash: hashStableJson({ text: 'Safe response' }),
  acceptedByPlayerMessageId: 'player.accepted',
  now: '2026-08-11T04:02:00.000Z'
}).commandBearing;
bearing = reserveV1CommandBearingEdge(bearing, { spendId: 'spend.unsafe', reason: 'Unsafe edge', now: '2026-08-11T05:00:00.000Z' }).commandBearing;
bearing = armV1CommandBearingEdge(bearing, { spendId: 'spend.unsafe', playerMessageId: 'player.discarded', now: '2026-08-11T05:01:00.000Z' }).commandBearing;

const rebuiltBearing = rebuildV1CommandBearingForLineage(bearing, {
  retainedMessages: [
    { hostMessageId: 'player.safe', text: 'Use the edge' },
    { hostMessageId: 'assistant.safe', text: 'Safe response' },
    { hostMessageId: 'player.accepted', text: 'Continue' }
  ],
  completedObjectiveIds: ['objective.keep.1', 'objective.keep.2'],
  now: '2026-08-11T12:00:00.000Z'
});
assert.deepEqual(Object.keys(rebuiltBearing.awards), ['award.keep.1', 'award.keep.2']);
assert.equal(rebuiltBearing.spends['spend.safe'].status, 'committed');
assert.equal(rebuiltBearing.spends['spend.unsafe'].status, 'refunded');
assert.equal(rebuiltBearing.balance, 1);

const changedHash = rebuildV1CommandBearingForLineage(bearing, {
  retainedMessages: [
    { hostMessageId: 'player.safe', text: 'Use the edge' },
    { hostMessageId: 'assistant.safe', text: 'Changed response' },
    { hostMessageId: 'player.accepted', text: 'Continue' }
  ],
  completedObjectiveIds: ['objective.keep.1', 'objective.keep.2'],
  now: '2026-08-11T12:00:00.000Z'
});
assert.equal(changedHash.spends['spend.safe'].status, 'refunded');

const longParent = Array.from({ length: 10000 }, (_, index) => ({
  id: `scale.${index}`,
  role: index % 2 === 0 ? 'assistant' : 'user',
  mes: `Long campaign message ${index}`
}));
const longRebuild = await reconstructV1BranchState({
  parentState,
  parentMessages: longParent,
  childMessages: longParent.slice(0, 7500),
  lineageHash: 'lineage.scale',
  targetSaveId: 'save.scale-child',
  targetChatBinding: {
    kind: 'directive.campaignChatBinding.v1', version: 1, campaignId: parentState.campaign.id,
    saveId: 'save.scale-child', chatId: 'chat.scale-child', status: 'bound'
  },
  runtimeAssets,
  now: () => '2026-08-11T12:00:00.000Z'
});
assert.equal(longRebuild.retainedSourceCount, 7500);
assert.equal(longRebuild.discardedHostMessageIds.length, 2500);
assert.equal(longRebuild.modelCallCount, 0);
assert.equal(longRebuild.projection.ok, true);

console.log('V1 branch reconstruction tests passed');
