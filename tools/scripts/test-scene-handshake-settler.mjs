import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  runSceneHandshakeSettlement,
  __sceneHandshakeSettlerTestHooks
} from '../../src/runtime/scene-handshake-settler.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking
} from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

function createHarness(suffix = 'accepted') {
  let state = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
  state.campaign = {
    ...state.campaign,
    id: `campaign-scene-handshake-${suffix}`,
    title: 'Ashes of Peace',
    status: 'active'
  };
  state.campaignChatBinding = {
    hostId: 'fake',
    chatId: `chat-scene-handshake-${suffix}`,
    campaignId: state.campaign.id,
    saveId: `save-scene-handshake-${suffix}`,
    promptContextRevision: 7
  };
  state.mission.openAssignments = [];
  state.commandLog.entries = [];
  state.ship.technicalDebt = [];
  state.threadLedger.records = [];
  const persisted = [];
  let tick = 0;
  const now = () => `2026-06-25T13:22:${String(tick++).padStart(2, '0')}.000Z`;
  const gateway = createStateDeltaGateway({
    getState: () => state,
    setState: (next) => { state = cloneJson(next); },
    persist: async (next, proposal) => {
      state = cloneJson(next);
      persisted.push(cloneJson(proposal));
    },
    now
  });
  return {
    now,
    persisted,
    gateway,
    get state() {
      return state;
    },
    set state(next) {
      state = cloneJson(next);
    }
  };
}

const assistantText = [
  'Whitaker considered the question for a moment, then gave a small shake of her head.',
  '"Three things I would put in front of you. First, Commander Cross has been wrestling with that command-network handoff issue. Get down to Engineering and let her walk you through it."',
  '"Second, meet Bronn. He is on alpha shift, and I will be watching how that first conversation goes."',
  '"Third, walk the ship. Talk to the department heads, including Sato in Medical and Saye in Science, and find out what is not quite right yet."'
].join('\n\n');

const assistantMessage = {
  hostMessageId: 'assistant-whitaker-orders',
  index: 20,
  role: 'assistant',
  isUser: false,
  text: assistantText
};

const playerMessage = {
  hostMessageId: 'player-accepts-whitaker-orders',
  index: 21,
  role: 'user',
  isUser: true,
  text: 'Understood, Captain. I will start with Cross, meet Bronn, and walk the ship before we reach the Reach.'
};

const settlement = {
  kind: 'directive.sceneHandshakeSettlement.v1',
  acceptedPreviousResponse: true,
  playerReplyRelation: 'acts-on',
  confidence: 0.93,
  disposition: 'autoCommit',
  needsInternalReview: false,
  internalReviewReasons: [],
  deferReason: null,
  operatorRecoveryOnly: false,
  openAssignmentProposals: [
    {
      title: 'Review the command-network handoff',
      summary: 'Meet Commander Cross in Engineering and inspect the command-network handoff risk.',
      assignedByActorId: 'mara-whitaker',
      linkedCrewIds: ['commander-cross'],
      linkedShipSystemIds: ['command-network'],
      dueWindow: 'Within the twelve-hour window before arrival.'
    },
    {
      title: 'Meet Bronn on alpha shift',
      summary: 'Introduce yourself to Bronn professionally while he is on duty.',
      assignedByActorId: 'mara-whitaker',
      linkedCrewIds: ['bronn'],
      dueWindow: 'Today during alpha shift.'
    },
    {
      title: 'Walk the ship',
      summary: 'Talk to department heads and look for refit issues the yard missed, including Medical and Science.',
      assignedByActorId: 'mara-whitaker',
      linkedCrewIds: ['sato', 'saye'],
      dueWindow: 'Before arrival at the Reach.'
    }
  ],
  commandLogProposals: [
    {
      summaryInputs: [
        'Whitaker gave Sam three concrete first-day priorities: Cross in Engineering, Bronn on alpha shift, and a department-head walkaround.'
      ],
      visibleConsequences: [
        'Sam accepted the captain-issued working window before arrival at the Reach.'
      ]
    }
  ],
  shipReadinessProposals: [
    {
      kind: 'technicalDebt',
      label: 'Command-network handoff issue',
      detail: 'Commander Cross has been wrestling with a command-network handoff issue since yard certification.',
      owner: 'Commander Cross',
      status: 'under-review'
    }
  ],
  threadSignals: [
    {
      title: 'Cross command-network handoff',
      summary: 'Engineering may have an unresolved command-network handoff risk.',
      type: 'shipboard_maintenance',
      linkedCrewIds: ['commander-cross'],
      directCommitment: true
    },
    {
      title: 'Bronn first conversation',
      summary: 'The captain will watch how Sam handles the first conversation with Bronn.',
      type: 'professional_dilemma',
      linkedCrewIds: ['bronn'],
      directCommitment: true
    },
    {
      title: 'Department-head walkaround',
      summary: 'Medical and Science may reveal refit issues the yard did not catch.',
      type: 'shipboard_maintenance',
      linkedCrewIds: ['sato', 'saye'],
      directCommitment: true
    }
  ]
};

const acceptedHarness = createHarness('accepted');
const generationCalls = [];
const acceptedRouter = {
  async generate(roleId, request) {
    generationCalls.push({ roleId, request: cloneJson(request) });
    return {
      ok: true,
      response: {
        providerId: 'fake-scene-handshake',
        text: JSON.stringify(settlement)
      },
      diagnostics: {
        providerId: 'fake-scene-handshake',
        latencyMs: 11
      }
    };
  }
};

const result = await runSceneHandshakeSettlement({
  campaignState: acceptedHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: acceptedHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-accepted',
  generationRouter: acceptedRouter,
  stateDeltaGateway: acceptedHarness.gateway,
  now: acceptedHarness.now
});
acceptedHarness.state = result.campaignState;

assert.equal(result.attempted, true);
assert.equal(result.ok, true);
assert.equal(result.disposition, 'autoCommit');
assert.equal(result.promptDirty, true);
assert.equal(generationCalls.length, 1);
assert.equal(generationCalls[0].roleId, 'sceneHandshakeSettler');
assert.equal(generationCalls[0].request.prompt.includes('timeAndLocation'), true);
assert.equal(generationCalls[0].request.prompt.includes('currentStardate'), true);
assert.equal(generationCalls[0].request.prompt.includes('knownFactSignals'), false);
assert.equal(generationCalls[0].request.metadata.promptBudget.maxPreviousAssistantChars > 0, true);
assert.equal(Array.isArray(generationCalls[0].request.metadata.optionalSlicesIncluded), true);
assert.match(generationCalls[0].request.metadata.sourceTextHashes.previousAssistant, /^[0-9a-f]{8}$/);
assert.equal(acceptedHarness.state.mission.openAssignments.length, 3);
assert.equal(acceptedHarness.state.mission.formalObjectives.length, projection.initialState.mission.formalObjectives.length);
assert.equal(acceptedHarness.state.commandLog.entries.length, 1);
assert.ok(acceptedHarness.state.ship.technicalDebt.length >= 1);
assert.ok(acceptedHarness.state.ship.technicalDebt.some((entry) => /command-network/i.test(`${entry.label || ''} ${entry.detail || ''}`)));
assert.equal(acceptedHarness.state.threadLedger.records.length, 3);
assert.deepEqual(
  acceptedHarness.state.runtimeTracking.sceneHandshake.settled.map((entry) => entry.status),
  ['settled']
);
assert.equal(acceptedHarness.state.runtimeTracking.sceneHandshake.lastResult.disposition, 'autoCommit');
assert.ok(acceptedHarness.state.runtimeTracking.sceneHandshake.lastResult.operationCount >= 8);
assert.equal(acceptedHarness.state.runtimeTracking.sceneHandshake.lastResult.appliedRevision, acceptedHarness.state.runtimeTracking.revision);
assert.ok(acceptedHarness.persisted.some((proposal) => proposal.source === 'sceneHandshake'));

const partialHarness = createHarness('partial-model-output');
partialHarness.state = {
  ...partialHarness.state,
  ship: {
    ...partialHarness.state.ship,
    technicalDebt: cloneJson(projection.initialState.ship.technicalDebt)
  }
};
const partialSettlement = {
  ...settlement,
  shipReadinessProposals: [],
  threadSignals: []
};
const partial = await runSceneHandshakeSettlement({
  campaignState: partialHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: partialHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-partial-model-output',
  generationRouter: {
    async generate(roleId) {
      assert.equal(roleId, __sceneHandshakeSettlerTestHooks.ROLE_ID);
      return {
        ok: true,
        response: {
          providerId: 'fake-scene-handshake-partial',
          text: JSON.stringify(partialSettlement)
        },
        diagnostics: { providerId: 'fake-scene-handshake-partial' }
      };
    }
  },
  stateDeltaGateway: partialHarness.gateway,
  now: partialHarness.now
});
partialHarness.state = partial.campaignState;
assert.equal(partial.ok, true);
assert.deepEqual(
  ['mission', 'commandLog', 'ship', 'threadLedger'].filter((root) => partial.committedRoots.includes(root)),
  ['mission', 'commandLog', 'ship', 'threadLedger']
);
const reinforcedCommandNetwork = partialHarness.state.ship.technicalDebt.find((entry) => entry.id === 'ship.command-network-certificate-compatibility');
assert.equal(reinforcedCommandNetwork.handshakeReinforced, true);
assert.equal(reinforcedCommandNetwork.sourceSettlementIds.length, 1);
assert.match(`${reinforcedCommandNetwork.label || ''} ${reinforcedCommandNetwork.playerSafeSummary || ''}`, /command-network/i);
assert.equal(partialHarness.state.threadLedger.records.length, 3);

const duplicateRevision = acceptedHarness.state.runtimeTracking.revision;
const duplicate = await runSceneHandshakeSettlement({
  campaignState: acceptedHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: acceptedHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-accepted',
  generationRouter: acceptedRouter,
  stateDeltaGateway: acceptedHarness.gateway,
  now: acceptedHarness.now
});
assert.equal(duplicate.deduplicated, true);
assert.equal(generationCalls.length, 1);
assert.equal(acceptedHarness.state.runtimeTracking.revision, duplicateRevision);
assert.equal(acceptedHarness.state.mission.openAssignments.length, 3);

const laterPlayerMessage = {
  ...playerMessage,
  hostMessageId: 'player-later-unrelated',
  index: 22,
  text: 'Continue the scene.'
};
const skippedLaterReply = await runSceneHandshakeSettlement({
  campaignState: acceptedHarness.state,
  currentPlayerMessage: laterPlayerMessage,
  recentMessages: [assistantMessage, playerMessage, laterPlayerMessage],
  chatId: acceptedHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-later',
  generationRouter: acceptedRouter,
  stateDeltaGateway: acceptedHarness.gateway,
  now: acceptedHarness.now
});
assert.equal(skippedLaterReply.attempted, false);
assert.equal(skippedLaterReply.reason, 'previous-message-not-assistant');
assert.equal(generationCalls.length, 1);

const wrongChat = await runSceneHandshakeSettlement({
  campaignState: acceptedHarness.state,
  currentPlayerMessage: {
    ...playerMessage,
    chatId: 'different-chat'
  },
  recentMessages: [assistantMessage, playerMessage],
  chatId: 'different-chat',
  ingressId: 'ingress-scene-handshake-wrong-chat',
  generationRouter: acceptedRouter,
  stateDeltaGateway: acceptedHarness.gateway,
  now: acceptedHarness.now
});
assert.equal(wrongChat.attempted, false);
assert.equal(wrongChat.reason, 'wrong-chat');
assert.equal(generationCalls.length, 1);

const wrongSave = await runSceneHandshakeSettlement({
  campaignState: acceptedHarness.state,
  currentPlayerMessage: {
    ...playerMessage,
    saveId: 'different-save'
  },
  recentMessages: [assistantMessage, playerMessage],
  chatId: acceptedHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-wrong-save',
  generationRouter: acceptedRouter,
  stateDeltaGateway: acceptedHarness.gateway,
  now: acceptedHarness.now
});
assert.equal(wrongSave.attempted, false);
assert.equal(wrongSave.reason, 'wrong-save');
assert.equal(generationCalls.length, 1);

const deletedAssistantSkip = await runSceneHandshakeSettlement({
  campaignState: acceptedHarness.state,
  currentPlayerMessage: {
    ...playerMessage,
    hostMessageId: 'player-after-deleted-assistant'
  },
  recentMessages: [
    {
      ...assistantMessage,
      hostMessageId: 'assistant-deleted-source',
      status: 'deleted'
    },
    {
      ...playerMessage,
      hostMessageId: 'player-after-deleted-assistant'
    }
  ],
  chatId: acceptedHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-deleted-assistant',
  generationRouter: acceptedRouter,
  stateDeltaGateway: acceptedHarness.gateway,
  now: acceptedHarness.now
});
assert.equal(deletedAssistantSkip.attempted, false);
assert.equal(deletedAssistantSkip.reason, 'previous-assistant-deleted');
assert.equal(generationCalls.length, 1);

const directDirectiveOwnedSkipHarness = createHarness('direct-directive-owned-source');
let directDirectiveOwnedGenerationCalls = 0;
const directDirectiveOwnedSkip = await runSceneHandshakeSettlement({
  campaignState: directDirectiveOwnedSkipHarness.state,
  previousAssistantMessage: {
    ...assistantMessage,
    hostMessageId: 'assistant-directive-owned-source',
    isDirectiveOwned: true
  },
  currentPlayerMessage: {
    ...playerMessage,
    hostMessageId: 'player-after-directive-owned-source'
  },
  chatId: directDirectiveOwnedSkipHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-direct-directive-owned-source',
  generationRouter: {
    async generate() {
      directDirectiveOwnedGenerationCalls += 1;
      throw new Error('Directive-owned sources must not invoke the Utility model.');
    }
  },
  stateDeltaGateway: directDirectiveOwnedSkipHarness.gateway,
  now: directDirectiveOwnedSkipHarness.now
});
assert.equal(directDirectiveOwnedSkip.attempted, false);
assert.equal(directDirectiveOwnedSkip.reason, 'previous-assistant-directive-owned');
assert.equal(directDirectiveOwnedGenerationCalls, 0);

const fallbackHarness = createHarness('accepted-empty-model-output');
let fallbackCallCount = 0;
const fallbackRouter = {
  async generate(roleId) {
    fallbackCallCount += 1;
    assert.equal(roleId, __sceneHandshakeSettlerTestHooks.ROLE_ID);
    return {
      ok: true,
      response: {
        providerId: 'fake-scene-handshake-empty',
        text: JSON.stringify({
          kind: 'directive.sceneHandshakeSettlement.v1',
          acceptedPreviousResponse: true,
          playerReplyRelation: 'acknowledges',
          confidence: 0.95,
          disposition: 'autoCommit',
          needsInternalReview: false,
          internalReviewReasons: [],
          deferReason: null,
          operatorRecoveryOnly: false,
          openAssignmentProposals: [],
          commandLogProposals: [],
          shipReadinessProposals: [],
          threadSignals: []
        })
      },
      diagnostics: {
        providerId: 'fake-scene-handshake-empty',
        latencyMs: 7
      }
    };
  }
};

const fallback = await runSceneHandshakeSettlement({
  campaignState: fallbackHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: fallbackHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-fallback',
  generationRouter: fallbackRouter,
  stateDeltaGateway: fallbackHarness.gateway,
  now: fallbackHarness.now
});
fallbackHarness.state = fallback.campaignState;

assert.equal(fallback.attempted, true);
assert.equal(fallback.ok, true);
assert.equal(fallback.disposition, 'autoCommit');
assert.equal(fallbackCallCount, 1);
assert.equal(fallbackHarness.state.mission.openAssignments.length, 3);
assert.match(fallbackHarness.state.mission.openAssignments.map((entry) => entry.title).join('\n'), /command-network/i);
assert.match(fallbackHarness.state.mission.openAssignments.map((entry) => entry.title).join('\n'), /Bronn/i);
assert.match(fallbackHarness.state.mission.openAssignments.map((entry) => entry.title).join('\n'), /Walk the ship/i);
assert.equal(fallbackHarness.state.commandLog.entries.length, 1);
assert.ok(fallbackHarness.state.ship.technicalDebt.some((entry) => /command-network/i.test(`${entry.label || ''} ${entry.detail || ''}`)));
assert.equal(fallbackHarness.state.threadLedger.records.length, 3);
assert.ok(fallbackHarness.state.runtimeTracking.sceneHandshake.lastResult.operationCount >= 8);

const providerFailureHarness = createHarness('provider-failure');
const providerFailure = await runSceneHandshakeSettlement({
  campaignState: providerFailureHarness.state,
  currentPlayerMessage: {
    ...playerMessage,
    hostMessageId: 'player-provider-failure-no-cue',
    text: 'Continue.'
  },
  recentMessages: [
    assistantMessage,
    {
      ...playerMessage,
      hostMessageId: 'player-provider-failure-no-cue',
      text: 'Continue.'
    }
  ],
  chatId: providerFailureHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-provider-failure',
  generationRouter: {
    async generate() {
      return {
        ok: false,
        error: {
          code: 'TIMEOUT',
          message: 'Timed out.'
        },
        diagnostics: {
          providerId: 'fake-timeout',
          latencyMs: 18000
        }
      };
    }
  },
  stateDeltaGateway: providerFailureHarness.gateway,
  now: providerFailureHarness.now
});
providerFailureHarness.state = providerFailure.campaignState;
assert.equal(providerFailure.attempted, true);
assert.equal(providerFailure.ok, false);
assert.equal(providerFailure.disposition, 'defer');
assert.equal(providerFailure.promptDirty, false);
assert.equal(providerFailureHarness.state.mission.openAssignments.length, 0);
assert.equal(providerFailureHarness.state.runtimeTracking.sceneHandshake.deferred.length, 1);
assert.equal(providerFailureHarness.state.runtimeTracking.sceneHandshake.lastResult.error.code, 'TIMEOUT');

const providerThrowHarness = createHarness('provider-throw');
const providerThrow = await runSceneHandshakeSettlement({
  campaignState: providerThrowHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: providerThrowHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-provider-throw',
  generationRouter: {
    async generate() {
      const error = new Error('Provider transport threw.');
      error.code = 'TRANSPORT_THROW';
      throw error;
    }
  },
  stateDeltaGateway: providerThrowHarness.gateway,
  now: providerThrowHarness.now
});
providerThrowHarness.state = providerThrow.campaignState;
assert.equal(providerThrow.attempted, true);
assert.equal(providerThrow.ok, true);
assert.equal(providerThrow.disposition, 'autoCommit');
assert.equal(providerThrow.providerFailureFallback, true);
assert.equal(providerThrowHarness.state.mission.openAssignments.length, 3);
assert.equal(providerThrowHarness.state.runtimeTracking.sceneHandshake.settled.length, 1);
assert.deepEqual(providerThrowHarness.state.runtimeTracking.sceneHandshake.lastResult.reasons, ['provider-failed-deterministic-fallback']);

const malformedHarness = createHarness('malformed');
const malformed = await runSceneHandshakeSettlement({
  campaignState: malformedHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: malformedHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-malformed',
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          providerId: 'fake-malformed',
          text: 'not json'
        },
        diagnostics: {
          providerId: 'fake-malformed',
          latencyMs: 4
        }
      };
    }
  },
  stateDeltaGateway: malformedHarness.gateway,
  now: malformedHarness.now
});
malformedHarness.state = malformed.campaignState;
assert.equal(malformed.attempted, true);
assert.equal(malformed.ok, false);
assert.equal(malformed.disposition, 'defer');
assert.equal(malformedHarness.state.mission.openAssignments.length, 0);
assert.equal(malformedHarness.state.runtimeTracking.sceneHandshake.deferred.length, 1);
assert.equal(malformedHarness.state.runtimeTracking.sceneHandshake.lastResult.parseStatus, 'failed');

const rejectionHarness = createHarness('rejected');
const rejectingRouter = {
  async generate(roleId) {
    assert.equal(roleId, __sceneHandshakeSettlerTestHooks.ROLE_ID);
    return {
      ok: true,
      response: {
        providerId: 'fake-scene-handshake',
        text: JSON.stringify({
          kind: 'directive.sceneHandshakeSettlement.v1',
          acceptedPreviousResponse: false,
          playerReplyRelation: 'corrects',
          confidence: 0.82,
          disposition: 'defer',
          needsInternalReview: false,
          internalReviewReasons: [],
          deferReason: 'The player corrected the previous assistant response.'
        })
      },
      diagnostics: { providerId: 'fake-scene-handshake' }
    };
  }
};

const rejection = await runSceneHandshakeSettlement({
  campaignState: rejectionHarness.state,
  currentPlayerMessage: {
    ...playerMessage,
    hostMessageId: 'player-corrects-whitaker-orders',
    text: 'No, Captain, Cross already signed that off. I need a different priority list.'
  },
  recentMessages: [
    assistantMessage,
    {
      ...playerMessage,
      hostMessageId: 'player-corrects-whitaker-orders',
      text: 'No, Captain, Cross already signed that off. I need a different priority list.'
    }
  ],
  chatId: rejectionHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-rejected',
  generationRouter: rejectingRouter,
  stateDeltaGateway: rejectionHarness.gateway,
  now: rejectionHarness.now
});
rejectionHarness.state = rejection.campaignState;

assert.equal(rejection.attempted, true);
assert.equal(rejection.ok, false);
assert.equal(rejection.disposition, 'internalReview');
assert.equal(rejection.promptDirty, false);
assert.equal(rejectionHarness.state.mission.openAssignments.length, 0);
assert.equal(rejectionHarness.state.runtimeTracking.sceneHandshake.pendingInternalReview.length, 1);

console.log('Scene Handshake settler tests passed: accepted assistant prose commits lean state, deterministic fallback prevents empty accepted settlements, rejects corrections, and deduplicates source pairs');
