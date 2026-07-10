import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildSceneHandshakeSnapshot,
  sceneHandshakeHash,
  runLatestPairSourceSettlement,
  runSceneHandshakeSettlement as runSceneHandshakeSettlementWithCutoverDefault,
  __sceneHandshakeSettlerTestHooks
} from '../../src/runtime/scene-handshake-settler.mjs';
import {
  getDefaultGenerationRoleDefinitions
} from '../../src/generation/generation-roles.mjs';
import {
  createLatestPairSourceSettlementProvider
} from '../../src/runtime/source-settlement-latest-pair-provider.mjs';
import {
  validateLatestPairSettlement
} from '../../src/runtime/source-settlement-latest-pair-validation.mjs';
import {
  __latestPairSceneAdapterTestHooks
} from '../../src/runtime/source-settlement-latest-pair-scene-adapter.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking
} from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const FULL_SCENE_HANDSHAKE_LOG_INPUT = [
  'Whitaker gave Sam three concrete first-day priorities: Cross in Engineering, Bronn on alpha shift, and a department-head walkaround.',
  'Cross needs the command-network handoff checked against yard certification; Bronn expects a professional introduction while he is on duty;',
  'Sato and Saye need the post-refit walkaround to catch medical and science issues before arrival.',
  'This full scene-handshake command-log tail must persist without being shortened before Log drawer rendering.'
].join(' ');

function runSceneHandshakeSettlement(input = {}) {
  const runLatestPairSettlementProvider = input.runLatestPairSettlementProvider
    || (input.generationRouter
      ? createLatestPairSourceSettlementProvider({
          generationRouter: input.generationRouter,
          now: input.now,
          validateLatestPairSettlement
        })
      : null);
  return runSceneHandshakeSettlementWithCutoverDefault({
    ...input,
    runLatestPairSettlementProvider
  });
}

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

function latestPairSourceFrameFor(harness, assistant = assistantMessage, player = playerMessage, suffix = 'latest-pair') {
  const selectedTextHash = sceneHandshakeHash(assistant.text || '');
  return {
    kind: 'directive.turnSourceFrame.v1',
    schemaVersion: 1,
    id: `frame:test:${suffix}`,
    sourceToken: `turnSourceFrame:test:${suffix}`,
    campaignId: harness.state.campaign.id,
    saveId: harness.state.campaignChatBinding.saveId,
    chatId: harness.state.campaignChatBinding.chatId,
    sourceKind: 'playerMessage',
    selectedAssistantVariantHash: selectedTextHash,
    sourceIntegrity: 'clean',
    previousAssistant: {
      hostMessageId: assistant.hostMessageId,
      chatId: harness.state.campaignChatBinding.chatId,
      role: 'assistant',
      textHash: selectedTextHash,
      selectedAssistantVariantHash: selectedTextHash
    },
    currentPlayer: {
      hostMessageId: player.hostMessageId,
      chatId: harness.state.campaignChatBinding.chatId,
      role: 'player',
      textHash: sceneHandshakeHash(player.text || '')
    }
  };
}

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
        FULL_SCENE_HANDSHAKE_LOG_INPUT
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
acceptedHarness.state = {
  ...acceptedHarness.state,
  runtimeTracking: {
    ...acceptedHarness.state.runtimeTracking,
    recoveryJournal: [{
      id: 'legacy-scene-handshake-recovery',
      status: 'reviewRequired',
      type: 'legacyOldRecoveryRow'
    }]
  }
};
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
assert.equal(generationCalls[0].roleId, 'sourceSettlementLatestPair');
assert.equal(generationCalls[0].request.prompt.includes('timeAndLocation'), true);
assert.equal(generationCalls[0].request.prompt.includes('currentStardate'), true);
assert.equal(generationCalls[0].request.prompt.includes('knownFactSignals'), false);
assert.equal(generationCalls[0].request.prompt.includes('"pendingRecoveryCount": 0'), true);
assert.equal(generationCalls[0].request.metadata.promptBudget.maxPreviousAssistantChars > 0, true);
assert.equal(Array.isArray(generationCalls[0].request.metadata.optionalSlicesIncluded), true);
assert.match(generationCalls[0].request.metadata.sourceTextHashes.previousAssistant, /^[0-9a-f]{8}$/);
assert.equal(acceptedHarness.state.mission.openAssignments.length, 3);
assert.equal(acceptedHarness.state.mission.formalObjectives.length, projection.initialState.mission.formalObjectives.length);
assert.equal(acceptedHarness.state.commandLog.entries.length, 1);
assert.ok(acceptedHarness.state.mission.openAssignments.some((entry) => /command-network/i.test(entry.title) && entry.linkedCrewIds.includes('imani-cross')));
assert.ok(acceptedHarness.state.mission.openAssignments.some((entry) => /Bronn/i.test(entry.title) && entry.linkedCrewIds.includes('hadrik-bronn')));
assert.ok(acceptedHarness.state.mission.openAssignments.some((entry) => /Walk the ship/i.test(entry.title) && entry.linkedCrewIds.includes('miriam-sato') && entry.linkedCrewIds.includes('rowan-saye')));
assert.equal(
  acceptedHarness.state.mission.openAssignments.some((entry) => entry.linkedCrewIds.some((id) => ['commander-cross', 'bronn', 'sato', 'saye'].includes(id))),
  false,
  'Accepted model-proposed assignments should canonicalize obvious crew references into package crew ids.'
);
assert.deepEqual(
  acceptedHarness.state.commandLog.entries[0].linkedAssignmentTitles,
  acceptedHarness.state.mission.openAssignments.map((entry) => entry.title)
);
assert.equal(
  acceptedHarness.state.commandLog.entries[0].summaryInputs[0],
  FULL_SCENE_HANDSHAKE_LOG_INPUT,
  'Scene Handshake command-log inputs should preserve full text for the Log drawer.'
);
assert.doesNotMatch(
  acceptedHarness.state.commandLog.entries[0].summaryInputs[0],
  /\.\.\.$/,
  'Scene Handshake command-log inputs should not be pre-truncated.'
);
assert.ok(acceptedHarness.state.ship.technicalDebt.length >= 1);
assert.ok(acceptedHarness.state.ship.technicalDebt.some((entry) => /command-network/i.test(`${entry.label || ''} ${entry.detail || ''}`)));
assert.equal(acceptedHarness.state.threadLedger.records.length, 3);
assert.deepEqual(
  acceptedHarness.state.sceneHandshake.settled.map((entry) => entry.status),
  ['settled']
);
assert.equal(acceptedHarness.state.sceneHandshake.settled[0].authority, 'sreSceneHandshakeProjection');
assert.equal(acceptedHarness.state.sceneHandshake.settled[0].projectionSource, 'sourceSettlementLatestPair');
assert.equal(
  acceptedHarness.state.sceneHandshake.settled[0].compatibilityMirror.kind,
  'directive.sceneHandshakeLedgerProjectionRef.v1'
);
assert.equal(acceptedHarness.state.sceneHandshake.lastResult.disposition, 'autoCommit');
assert.equal(acceptedHarness.state.sceneHandshake.lastResult.authority, 'sreSceneHandshakeProjection');
assert.equal(acceptedHarness.state.sceneHandshake.lastResult.metadata?.sourceOwner, 'sre');
assert.equal(acceptedHarness.state.sceneHandshake.lastResult.metadata?.sourceSettlementMode, 'latestPair');
assert.ok(acceptedHarness.state.sceneHandshake.lastResult.operationCount >= 8);
assert.equal(
  acceptedHarness.state.sceneHandshake.lastResult.runtimeRevisionBefore,
  null,
  'Latest-pair SRE settlement must not carry old runtimeTracking revision as pre-apply evidence.'
);
assert.equal(result.record.appliedRevision, acceptedHarness.state.runtimeTracking.revision);
assert.ok(acceptedHarness.persisted.some((proposal) => proposal.source === 'sourceSettlement'));

const coreRevisionAcceptedHarness = createHarness('core-revision-accepted');
coreRevisionAcceptedHarness.state = {
  ...coreRevisionAcceptedHarness.state,
  runtimeTracking: {
    ...coreRevisionAcceptedHarness.state.runtimeTracking,
    revision: 99,
    mechanicsRevision: 88
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      kind: 'directive.coreStoreReadProjections.v1',
      runtimeAuthority: 'coreStoreV2',
      revisions: { runtime: 7, mechanics: 3 }
    }
  }
};
const coreRevisionAccepted = await runSceneHandshakeSettlement({
  campaignState: coreRevisionAcceptedHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: coreRevisionAcceptedHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-core-revision-accepted',
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          providerId: 'fake-scene-handshake-core-revision',
          text: JSON.stringify(settlement)
        },
        diagnostics: {
          providerId: 'fake-scene-handshake-core-revision',
          latencyMs: 11
        }
      };
    }
  },
  stateDeltaGateway: coreRevisionAcceptedHarness.gateway,
  now: coreRevisionAcceptedHarness.now
});
coreRevisionAcceptedHarness.state = coreRevisionAccepted.campaignState;
assert.equal(coreRevisionAccepted.ok, true);
assert.equal(
  coreRevisionAcceptedHarness.persisted.some((proposal) => proposal.source === 'sourceSettlement' && proposal.baseRevision === 99),
  false,
  'Latest-pair SRE settlements must not pass stale old runtimeTracking revision as apply base.'
);
assert.equal(coreRevisionAccepted.record.runtimeRevisionBefore, null);

const latestPairGenericLogHarness = createHarness('latest-pair-generic-log');
const latestPairGenericLogSnapshot = __latestPairSceneAdapterTestHooks.buildLatestPairSceneSnapshot({
  campaignState: latestPairGenericLogHarness.state,
  previousAssistantMessage: assistantMessage,
  currentPlayerMessage: playerMessage,
  chatId: latestPairGenericLogHarness.state.campaignChatBinding.chatId,
  recentMessages: [assistantMessage, playerMessage]
});
const latestPairGenericLogValidation = validateLatestPairSettlement({
  ...settlement,
  commandLogProposals: [{
    summaryInputs: ['Sam accepted the assignments.'],
    visibleConsequences: ['Sam accepted the assignments in the next reply.']
  }]
}, {
  campaignState: latestPairGenericLogHarness.state,
  snapshot: latestPairGenericLogSnapshot,
  settlementId: 'settlement:latest-pair-generic-log',
  recordedAt: latestPairGenericLogHarness.now()
});
const latestPairGenericLogCommand = latestPairGenericLogValidation.operations
  .find((operation) => operation.path === 'commandLog.entries')?.value;
assert.match(
  [
    ...(latestPairGenericLogCommand?.summaryInputs || []),
    ...(latestPairGenericLogCommand?.visibleConsequences || [])
  ].join('\n'),
  /Commander Cross[\s\S]*Bronn[\s\S]*department heads/i,
  'Latest-pair SRE command-log text should include accepted order details even when the model returns generic acknowledgement prose.'
);

const connDelegationHarness = createHarness('conn-delegation');
connDelegationHarness.state = {
  ...connDelegationHarness.state,
  player: { id: 'player-commander', rank: 'Commander', billet: 'Executive Officer' }
};
const connDelegationAssistant = {
  hostMessageId: 'assistant-whitaker-gives-conn',
  index: 30,
  role: 'assistant',
  isUser: false,
  text: 'Whitaker rises from the center chair. "Commander, you have the conn. Keep us on this rescue posture and call me before any major deviation."'
};
const connDelegationPlayer = {
  hostMessageId: 'player-accepts-conn',
  index: 31,
  role: 'user',
  isUser: true,
  text: 'Aye, Captain. I have the conn and will hold the rescue posture.'
};
const connDelegationSnapshot = __latestPairSceneAdapterTestHooks.buildLatestPairSceneSnapshot({
  campaignState: connDelegationHarness.state,
  previousAssistantMessage: connDelegationAssistant,
  currentPlayerMessage: connDelegationPlayer,
  chatId: connDelegationHarness.state.campaignChatBinding.chatId,
  recentMessages: [connDelegationAssistant, connDelegationPlayer]
});
const connDelegationValidation = validateLatestPairSettlement({
  ...settlement,
  openAssignmentProposals: [],
  commandLogProposals: [],
  shipReadinessProposals: [],
  threadSignals: []
}, {
  campaignState: connDelegationHarness.state,
  snapshot: connDelegationSnapshot,
  settlementId: 'settlement:conn-delegation',
  recordedAt: connDelegationHarness.now()
});
const commandAuthorityOp = connDelegationValidation.operations.find((operation) => operation.path === 'commandAuthority');
assert.equal(commandAuthorityOp?.op, 'replace');
assert.equal(commandAuthorityOp?.value.commandRecipientId, 'player-commander');
assert.equal(commandAuthorityOp?.value.connHolderId, 'player-commander');
assert.equal(commandAuthorityOp?.value.majorDecisionAuthorityId, 'mara-whitaker');
assert.equal(commandAuthorityOp?.value.delegationScope, 'conn');

const recommendationHarness = createHarness('recommendation-only');
const recommendationAssistant = {
  hostMessageId: 'assistant-whitaker-asks-opinion',
  index: 32,
  role: 'assistant',
  isUser: false,
  text: '"What do you think, Commander?" Whitaker asks, still holding the center chair.'
};
const recommendationPlayer = {
  hostMessageId: 'player-gives-recommendation',
  index: 33,
  role: 'user',
  isUser: true,
  text: 'I recommend we launch a probe and keep the ship on station.'
};
const recommendationSnapshot = __latestPairSceneAdapterTestHooks.buildLatestPairSceneSnapshot({
  campaignState: recommendationHarness.state,
  previousAssistantMessage: recommendationAssistant,
  currentPlayerMessage: recommendationPlayer,
  chatId: recommendationHarness.state.campaignChatBinding.chatId,
  recentMessages: [recommendationAssistant, recommendationPlayer]
});
const recommendationValidation = validateLatestPairSettlement({
  ...settlement,
  openAssignmentProposals: [],
  commandLogProposals: [],
  shipReadinessProposals: [],
  threadSignals: []
}, {
  campaignState: recommendationHarness.state,
  snapshot: recommendationSnapshot,
  settlementId: 'settlement:recommendation-only',
  recordedAt: recommendationHarness.now()
});
assert.equal(
  recommendationValidation.operations.some((operation) => operation.path === 'commandAuthority'),
  false,
  'Recommendation-seeking prose must not become durable command authority.'
);

const coreRecoverySnapshotHarness = createHarness('core-recovery-snapshot');
coreRecoverySnapshotHarness.state = {
  ...coreRecoverySnapshotHarness.state,
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      recoveryJournal: [{
        id: 'core-scene-handshake-recovery',
        status: 'reviewRequired',
        projectionSource: 'coreStoreV2',
        authority: 'compatibilityProjection',
        compatibilityMirror: {
          kind: 'directive.coreRecoveryCompatibilityMirror.v1'
        }
      }]
    }
  },
  runtimeTracking: {
    ...coreRecoverySnapshotHarness.state.runtimeTracking,
    recoveryJournal: [{
      id: 'legacy-scene-handshake-recovery',
      status: 'reviewRequired'
    }]
  }
};
const coreRecoverySnapshot = buildSceneHandshakeSnapshot({
  campaignState: coreRecoverySnapshotHarness.state,
  previousAssistantMessage: assistantMessage,
  currentPlayerMessage: playerMessage,
  chatId: coreRecoverySnapshotHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-core-recovery-snapshot',
  recentMessages: [assistantMessage, playerMessage]
});
assert.equal(
  coreRecoverySnapshot.safety.pendingRecoveryCount,
  1,
  'Scene Handshake pending recovery count must come from CORE projection rows, not raw legacy rows.'
);

const scenePendingSnapshotHarness = createHarness('scene-pending-snapshot');
scenePendingSnapshotHarness.state = {
  ...scenePendingSnapshotHarness.state,
  sceneReconciliation: {
    pending: [{ id: 'top-scene-pending', status: 'pending' }]
  },
  runtimeTracking: {
    ...scenePendingSnapshotHarness.state.runtimeTracking,
    sceneReconciliation: {
      pending: [
        { id: 'nested-scene-pending-1', status: 'pending' },
        { id: 'nested-scene-pending-2', status: 'pending' }
      ]
    }
  }
};
const scenePendingSnapshot = buildSceneHandshakeSnapshot({
  campaignState: scenePendingSnapshotHarness.state,
  previousAssistantMessage: assistantMessage,
  currentPlayerMessage: playerMessage,
  chatId: scenePendingSnapshotHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-sre-pending-snapshot',
  recentMessages: [assistantMessage, playerMessage]
});
assert.equal(
  scenePendingSnapshot.safety.pendingSceneReconciliationCount,
  1,
  'Scene Handshake pending scene count must use top-level SRE state only.'
);
scenePendingSnapshotHarness.state = {
  ...scenePendingSnapshotHarness.state,
  sceneReconciliation: undefined
};
const nestedOnlyScenePendingSnapshot = buildSceneHandshakeSnapshot({
  campaignState: scenePendingSnapshotHarness.state,
  previousAssistantMessage: assistantMessage,
  currentPlayerMessage: playerMessage,
  chatId: scenePendingSnapshotHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-nested-sre-pending-snapshot',
  recentMessages: [assistantMessage, playerMessage]
});
assert.equal(
  nestedOnlyScenePendingSnapshot.safety.pendingSceneReconciliationCount,
  0,
  'Scene Handshake safety must ignore nested runtimeTracking.sceneReconciliation pending rows.'
);

const terminalHarness = createHarness('terminal-sre-latest-pair');
const terminalProviderCalls = [];
let terminalLegacyGenerationCalls = 0;
const terminalResult = await runSceneHandshakeSettlement({
  campaignState: terminalHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: terminalHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-terminal-sre',
  generationRouter: {
    async generate() {
      terminalLegacyGenerationCalls += 1;
      throw new Error('legacy Scene Handshake provider must not run after terminal SRE latest-pair accept');
    }
  },
  stateDeltaGateway: terminalHarness.gateway,
  latestPairSourceFrame: latestPairSourceFrameFor(terminalHarness, assistantMessage, playerMessage, 'terminal-sre-latest-pair'),
  runLatestPairSettlementProvider: async (payload) => {
    terminalProviderCalls.push(cloneJson(payload));
    assert.equal(payload.mode, 'latestPair');
    assert.equal(payload.source.previousAssistant.textHash, payload.source.previousAssistant.selectedAssistantVariant.selectedTextHash);
    return {
      settlement: {
        acceptedPreviousResponse: true,
        playerReplyRelation: 'acts-on',
        confidence: 0.91,
        disposition: 'autoCommit'
      },
      operations: [{
        op: 'upsert',
        path: 'commandLog.entries',
        identityKey: 'id',
        value: {
          id: 'command-log:terminal-sre-latest-pair',
          type: 'scene',
          summaryInputs: ['Terminal SRE accepted the latest assistant/player pair.'],
          visibleConsequences: ['SRE owned latest-pair settlement before the legacy Scene Handshake provider.']
        }
      }],
      promptDirtyDomains: ['commandLog']
    };
  },
  now: terminalHarness.now
});
terminalHarness.state = terminalResult.campaignState;
assert.equal(terminalResult.attempted, true);
assert.equal(terminalResult.ok, true);
assert.equal(terminalLegacyGenerationCalls, 0);
assert.ok(terminalResult.sourceSettlement, 'terminal SRE latest-pair result should expose compact sourceSettlement decision');
assert.equal(terminalResult.sourceSettlement.status, 'accepted');
assert.equal(terminalResult.sourceSettlement.providerCalled, true);
assert.equal(terminalResult.sourceSettlement.applied, true);
assert.equal(terminalProviderCalls.length, 1);
assert.equal(terminalResult.promptDirty, true);
assert.equal(terminalResult.committedRoots.includes('commandLog'), true);
assert.equal(
  terminalHarness.state.commandLog.entries.some((entry) => entry.id === 'command-log:terminal-sre-latest-pair'),
  true,
  'Terminal SRE latest-pair settlement should apply provider operations before legacy Scene Handshake.'
);
assert.equal(
  terminalHarness.state.sceneHandshake.lastResult.metadata?.sourceOwner,
  'sre',
  'Scene Handshake ledger should show SRE terminal ownership for latest-pair settlement.'
);
assert.equal(terminalHarness.state.sceneHandshake.lastResult.authority, 'sreSceneHandshakeProjection');
assert.equal(terminalHarness.state.sceneHandshake.lastResult.projectionSource, 'sourceSettlementLatestPair');
assert.equal(
  terminalHarness.state.sceneHandshake.lastResult.compatibilityMirror.kind,
  'directive.sceneHandshakeLedgerProjectionRef.v1'
);
assert.ok(terminalHarness.persisted.some((proposal) => proposal.source === 'sourceSettlement'));
const terminalDuplicateRevision = terminalHarness.state.runtimeTracking.revision;
const terminalProviderCallsBeforeDuplicate = terminalProviderCalls.length;
const terminalDuplicate = await runSceneHandshakeSettlement({
  campaignState: terminalHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: terminalHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-terminal-sre-latest-pair',
  generationRouter: {
    async generate() {
      throw new Error('legacy Scene Handshake provider must not run for duplicate SRE latest-pair source');
    }
  },
  stateDeltaGateway: terminalHarness.gateway,
  latestPairSourceFrame: latestPairSourceFrameFor(terminalHarness, assistantMessage, playerMessage, 'terminal-sre-latest-pair'),
  runLatestPairSettlementProvider: async () => {
    throw new Error('SRE latest-pair provider must not rerun for duplicate source pair');
  },
  packageData,
  now: terminalHarness.now
});
assert.equal(terminalDuplicate.deduplicated, true);
assert.equal(terminalProviderCalls.length, terminalProviderCallsBeforeDuplicate);
assert.equal(terminalHarness.state.runtimeTracking.revision, terminalDuplicateRevision);

const terminalMisleadingDomainHarness = createHarness('terminal-sre-misleading-domain');
const terminalMisleadingDomainGateway = {
  ...terminalMisleadingDomainHarness.gateway,
  async applyOperations(...args) {
    const applied = await terminalMisleadingDomainHarness.gateway.applyOperations(...args);
    const { domains, ...withoutDomains } = applied || {};
    return withoutDomains;
  }
};
const terminalMisleadingDomain = await runSceneHandshakeSettlement({
  campaignState: terminalMisleadingDomainHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: terminalMisleadingDomainHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-terminal-sre-misleading-domain',
  generationRouter: {
    async generate() {
      throw new Error('legacy Scene Handshake provider must not repair misleading SRE domain metadata');
    }
  },
  stateDeltaGateway: terminalMisleadingDomainGateway,
  latestPairSourceFrame: latestPairSourceFrameFor(terminalMisleadingDomainHarness, assistantMessage, playerMessage, 'terminal-sre-misleading-domain'),
  runLatestPairSettlementProvider: async () => ({
    operations: [{
      domain: 'runtimeTracking',
      op: 'upsert',
      path: 'commandLog.entries',
      identityKey: 'id',
      value: {
        id: 'command-log:terminal-sre-domain-from-path',
        type: 'scene',
        summaryInputs: ['Terminal SRE path root should control prompt dirtiness.']
      }
    }],
    promptDirtyDomains: ['runtimeTracking']
  }),
  now: terminalMisleadingDomainHarness.now
});
terminalMisleadingDomainHarness.state = terminalMisleadingDomain.campaignState;
assert.equal(terminalMisleadingDomain.ok, true);
assert.equal(terminalMisleadingDomain.promptDirty, true);
assert.equal(terminalMisleadingDomain.committedRoots.includes('commandLog'), true);
assert.equal(terminalMisleadingDomain.promptDirtyDomains.includes('commandLog'), true);
assert.equal(
  terminalMisleadingDomainHarness.state.commandLog.entries.some((entry) => entry.id === 'command-log:terminal-sre-domain-from-path'),
  true,
  'Terminal SRE committed roots should derive from applied operation paths, not provider-declared domains.'
);

const terminalThrowHarness = createHarness('terminal-sre-provider-throw');
let terminalThrowLegacyGenerationCalls = 0;
const terminalThrow = await runSceneHandshakeSettlement({
  campaignState: terminalThrowHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: terminalThrowHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-terminal-sre-provider-throw',
  generationRouter: {
    async generate() {
      terminalThrowLegacyGenerationCalls += 1;
      throw new Error('legacy Scene Handshake provider must not run after terminal SRE provider throws');
    }
  },
  stateDeltaGateway: terminalThrowHarness.gateway,
  latestPairSourceFrame: latestPairSourceFrameFor(terminalThrowHarness, assistantMessage, playerMessage, 'terminal-sre-provider-throw'),
  runLatestPairSettlementProvider: async () => {
    throw new Error('terminal SRE provider failed');
  },
  now: terminalThrowHarness.now
});
assert.equal(terminalThrow.attempted, true);
assert.equal(terminalThrow.ok, false);
assert.equal(terminalThrow.sourceSettlement.status, 'repairRequired');
assert.equal(terminalThrow.sourceSettlement.providerCalled, true);
assert.equal(terminalThrow.sourceSettlement.applied, false);
assert.equal(terminalThrow.sourceSettlement.reasons.includes('source-settlement-provider-threw'), true);
assert.equal(terminalThrowLegacyGenerationCalls, 0);
assert.equal(terminalThrowHarness.state.sceneHandshake.settled.length, 0);

const terminalStaleHarness = createHarness('terminal-sre-stale-before-apply');
let terminalStaleLegacyGenerationCalls = 0;
const terminalStale = await runSceneHandshakeSettlement({
  campaignState: terminalStaleHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: terminalStaleHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-terminal-sre-stale',
  generationRouter: {
    async generate() {
      terminalStaleLegacyGenerationCalls += 1;
      throw new Error('legacy Scene Handshake provider must not run after terminal SRE stale-before-apply');
    }
  },
  stateDeltaGateway: terminalStaleHarness.gateway,
  latestPairSourceFrame: latestPairSourceFrameFor(terminalStaleHarness, assistantMessage, playerMessage, 'terminal-sre-stale-before-apply'),
  validateLatestPairSettlementBeforeApply: async () => ({ ok: false, reasons: ['terminal-source-stale-before-apply'] }),
  runLatestPairSettlementProvider: async () => ({
    operations: [{
      op: 'upsert',
      path: 'commandLog.entries',
      identityKey: 'id',
      value: { id: 'command-log:terminal-sre-stale', type: 'scene' }
    }]
  }),
  now: terminalStaleHarness.now
});
assert.equal(terminalStale.ok, false);
assert.equal(terminalStale.sourceSettlement.status, 'staleBeforeApply');
assert.equal(terminalStale.sourceSettlement.applied, false);
assert.equal(terminalStale.sourceSettlement.reasons.includes('terminal-source-stale-before-apply'), true);
assert.equal(terminalStaleLegacyGenerationCalls, 0);
assert.equal(terminalStaleHarness.state.commandLog.entries.some((entry) => entry.id === 'command-log:terminal-sre-stale'), false);
assert.equal(terminalStaleHarness.state.sceneHandshake.settled.length, 0);

const terminalRepairHarness = createHarness('terminal-sre-repair-required');
let terminalRepairLegacyGenerationCalls = 0;
const terminalRepair = await runSceneHandshakeSettlement({
  campaignState: terminalRepairHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: terminalRepairHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-terminal-sre-repair',
  generationRouter: {
    async generate() {
      terminalRepairLegacyGenerationCalls += 1;
      throw new Error('legacy Scene Handshake provider must not run after terminal SRE apply repair');
    }
  },
  stateDeltaGateway: terminalRepairHarness.gateway,
  latestPairSourceFrame: latestPairSourceFrameFor(terminalRepairHarness, assistantMessage, playerMessage, 'terminal-sre-repair-required'),
  runLatestPairSettlementProvider: async () => ({
    operations: [{
      op: 'upsert',
      path: 'crew.records',
      identityKey: 'id',
      value: { id: 'crew-forbidden-terminal-sre' }
    }]
  }),
  now: terminalRepairHarness.now
});
assert.equal(terminalRepair.ok, false);
assert.equal(terminalRepair.sourceSettlement.status, 'repairRequired');
assert.equal(terminalRepair.sourceSettlement.applied, false);
assert.equal(terminalRepair.sourceSettlement.reasons.includes('source-settlement-apply-threw'), true);
assert.equal(terminalRepairLegacyGenerationCalls, 0);
assert.equal(terminalRepairHarness.state.crew.records?.some?.((entry) => entry.id === 'crew-forbidden-terminal-sre') || false, false);
assert.equal(terminalRepairHarness.state.sceneHandshake.settled.length, 0);

const terminalAcceptedEmptyProviderHarness = createHarness('terminal-sre-accepted-empty-provider-output');
let terminalAcceptedEmptyProviderCalls = 0;
const terminalAcceptedEmptyGenerationRouter = {
  async generate(roleId) {
    terminalAcceptedEmptyProviderCalls += 1;
    if (roleId === 'sceneHandshakeSettler') {
      throw new Error('real latest-pair SRE accepted-empty fixture must not call legacy Scene Handshake role');
    }
    assert.equal(roleId, 'sourceSettlementLatestPair');
    return {
      ok: true,
      response: {
        providerId: 'fake-source-settlement-accepted-empty',
        text: JSON.stringify({
          kind: 'directive.sceneHandshakeSettlement.v1',
          acceptedPreviousResponse: true,
          playerReplyRelation: 'acts-on',
          confidence: 0.93,
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
      diagnostics: { providerId: 'fake-source-settlement-accepted-empty' }
    };
  }
};
const terminalAcceptedEmptyProvider = await runSceneHandshakeSettlement({
  campaignState: terminalAcceptedEmptyProviderHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: terminalAcceptedEmptyProviderHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-terminal-sre-accepted-empty-provider',
  generationRouter: terminalAcceptedEmptyGenerationRouter,
  stateDeltaGateway: terminalAcceptedEmptyProviderHarness.gateway,
  latestPairSourceFrame: latestPairSourceFrameFor(
    terminalAcceptedEmptyProviderHarness,
    assistantMessage,
    playerMessage,
    'terminal-sre-accepted-empty-provider-output'
  ),
  runLatestPairSettlementProvider: createLatestPairSourceSettlementProvider({
    generationRouter: terminalAcceptedEmptyGenerationRouter,
    validateLatestPairSettlement,
    now: terminalAcceptedEmptyProviderHarness.now
  }),
  packageData,
  now: terminalAcceptedEmptyProviderHarness.now
});
terminalAcceptedEmptyProviderHarness.state = terminalAcceptedEmptyProvider.campaignState;
assert.equal(terminalAcceptedEmptyProvider.ok, true);
assert.equal(terminalAcceptedEmptyProvider.sourceSettlement.status, 'accepted');
assert.equal(terminalAcceptedEmptyProviderCalls, 1);
assert.equal(terminalAcceptedEmptyProviderHarness.state.mission.openAssignments.length, 3);
assert.equal(terminalAcceptedEmptyProviderHarness.state.commandLog.entries.length, 1);
assert.equal(terminalAcceptedEmptyProviderHarness.state.threadLedger.records.length, 3);
assert.equal(terminalAcceptedEmptyProviderHarness.state.sceneHandshake.settled.length, 1);
assert.equal(terminalAcceptedEmptyProviderHarness.state.sceneHandshake.lastResult.projectionSource, 'sourceSettlementLatestPair');
assert.ok(terminalAcceptedEmptyProviderHarness.state.sceneHandshake.lastResult.operationCount >= 8);

const terminalNoChangeHarness = createHarness('terminal-sre-no-change');
let terminalNoChangeLegacyGenerationCalls = 0;
const terminalNoChange = await runSceneHandshakeSettlement({
  campaignState: terminalNoChangeHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: terminalNoChangeHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-terminal-sre-no-change',
  generationRouter: {
    async generate() {
      terminalNoChangeLegacyGenerationCalls += 1;
      throw new Error('legacy Scene Handshake provider must not run after terminal SRE noChange');
    }
  },
  stateDeltaGateway: terminalNoChangeHarness.gateway,
  latestPairSourceFrame: latestPairSourceFrameFor(terminalNoChangeHarness, assistantMessage, playerMessage, 'terminal-sre-no-change'),
  runLatestPairSettlementProvider: async () => ({ operations: [] }),
  now: terminalNoChangeHarness.now
});
assert.equal(terminalNoChange.ok, true);
assert.equal(terminalNoChange.sourceSettlement.status, 'noChange');
assert.equal(terminalNoChange.sourceSettlement.applied, false);
assert.equal(terminalNoChangeLegacyGenerationCalls, 0);
assert.equal(terminalNoChangeHarness.state.sceneHandshake.settled.length, 0);

const strictLatestPairHarness = createHarness('strict-latest-pair-no-provider');
let strictLatestPairLegacyGenerationCalls = 0;
const strictLatestPairNoProvider = await runLatestPairSourceSettlement({
  campaignState: strictLatestPairHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: strictLatestPairHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-strict-latest-pair-no-provider',
  generationRouter: {
    async generate() {
      strictLatestPairLegacyGenerationCalls += 1;
      throw new Error('strict latest-pair source settlement must not call legacy Scene Handshake provider');
    }
  },
  stateDeltaGateway: strictLatestPairHarness.gateway,
  latestPairSourceFrame: latestPairSourceFrameFor(strictLatestPairHarness, assistantMessage, playerMessage, 'strict-latest-pair-no-provider'),
  now: strictLatestPairHarness.now
});
assert.equal(strictLatestPairNoProvider.attempted, true);
assert.equal(strictLatestPairNoProvider.ok, false);
assert.equal(strictLatestPairNoProvider.sourceSettlement.status, 'repairRequired');
assert.equal(strictLatestPairNoProvider.sourceSettlement.providerCalled, false);
assert.equal(strictLatestPairNoProvider.sourceSettlement.applied, false);
assert.equal(strictLatestPairNoProvider.sourceSettlement.reasons.includes('source-settlement-latest-pair-unavailable'), true);
assert.equal(strictLatestPairLegacyGenerationCalls, 0);
assert.equal(strictLatestPairHarness.state.sceneHandshake.settled.length, 0);

const defaultNoLegacyHarness = createHarness('default-no-legacy-fallback');
let defaultNoLegacyGenerationCalls = 0;
const defaultNoLegacyFallback = await runSceneHandshakeSettlementWithCutoverDefault({
  campaignState: defaultNoLegacyHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: defaultNoLegacyHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-default-no-legacy-fallback',
  generationRouter: {
    async generate() {
      defaultNoLegacyGenerationCalls += 1;
      throw new Error('default Scene Handshake path must fail closed instead of calling the retired legacy provider');
    }
  },
  stateDeltaGateway: defaultNoLegacyHarness.gateway,
  latestPairSourceFrame: latestPairSourceFrameFor(defaultNoLegacyHarness, assistantMessage, playerMessage, 'default-no-legacy-fallback'),
  now: defaultNoLegacyHarness.now
});
assert.equal(defaultNoLegacyFallback.attempted, true);
assert.equal(defaultNoLegacyFallback.ok, false);
assert.equal(defaultNoLegacyFallback.disposition, 'repairRequired');
assert.equal(defaultNoLegacyFallback.sourceSettlement.status, 'repairRequired');
assert.equal(defaultNoLegacyFallback.sourceSettlement.providerCalled, false);
assert.equal(defaultNoLegacyFallback.sourceSettlement.applied, false);
assert.equal(defaultNoLegacyFallback.sourceSettlement.reasons.includes('source-settlement-latest-pair-unavailable'), true);
assert.equal(defaultNoLegacyGenerationCalls, 0, 'default Scene Handshake path must not call retired legacy provider fallback');
assert.equal(defaultNoLegacyHarness.state.sceneHandshake.settled.length, 0);

const latestPairRoleTimeout = getDefaultGenerationRoleDefinitions().sourceSettlementLatestPair.timeoutMs;
assert.equal(latestPairRoleTimeout, 45000, 'sourceSettlementLatestPair needs the same live-provider budget class as other blocking utility owner calls');
let latestPairProviderOptions = null;
const latestPairTimeoutProvider = createLatestPairSourceSettlementProvider({
  generationRouter: {
    async generate(roleId, request, options = {}) {
      latestPairProviderOptions = { roleId, timeoutMs: options.timeoutMs };
      return {
        ok: true,
        text: JSON.stringify({
          kind: 'directive.sceneHandshakeSettlement.v1',
          acceptedPreviousResponse: true,
          playerReplyRelation: 'acknowledges',
          confidence: 0.9,
          disposition: 'autoCommit',
          needsInternalReview: false,
          internalReviewReasons: [],
          deferReason: null,
          operatorRecoveryOnly: false,
          openAssignmentProposals: [],
          commandLogProposals: [],
          shipReadinessProposals: [],
          threadSignals: []
        }),
        diagnostics: { providerId: 'test-provider', latencyMs: 12 },
        response: { providerId: 'test-provider' }
      };
    }
  },
  validateLatestPairSettlement: () => ({
    disposition: 'autoCommit',
    settlement: { acceptedPreviousResponse: true },
    operations: [],
    reasons: []
  })
});
await latestPairTimeoutProvider({
  snapshot: {
    kind: 'directive.sceneHandshakeSnapshot.v1',
    envelope: {
      campaignId: 'campaign-latest-pair-timeout',
      chatId: 'chat-latest-pair-timeout'
    },
    source: {
      previousAssistant: {
        hostMessageId: 'assistant-latest-pair-timeout',
        textHash: 'assistant-hash',
        selectedVariant: null
      },
      currentPlayer: {
        hostMessageId: 'player-latest-pair-timeout',
        textHash: 'player-hash'
      },
      sourceRangeHash: 'range-hash'
    },
    budget: {
      optionalSlicesIncluded: []
    }
  },
  campaignState: strictLatestPairHarness.state,
  settlementId: 'settlement-latest-pair-timeout',
  observedAt: strictLatestPairHarness.now()
});
assert.equal(latestPairProviderOptions?.roleId, 'sourceSettlementLatestPair');
assert.equal(latestPairProviderOptions?.timeoutMs, latestPairRoleTimeout, 'latest-pair provider must use the generation role timeout');

const terminalTimeHarness = createHarness('terminal-sre-time-advance');
const terminalTimeAssistant = {
  hostMessageId: 'assistant-terminal-ready-room',
  index: 30,
  role: 'assistant',
  isUser: false,
  text: 'Whitaker leads Sam out of the shuttlebay, through the corridor, and into the ready room.'
};
const terminalTimePlayer = {
  hostMessageId: 'player-terminal-ready-room',
  index: 31,
  role: 'user',
  isUser: true,
  text: 'Sam steps inside and waits for the captain to begin.'
};
const terminalTime = await runSceneHandshakeSettlement({
  campaignState: terminalTimeHarness.state,
  currentPlayerMessage: terminalTimePlayer,
  recentMessages: [terminalTimeAssistant, terminalTimePlayer],
  chatId: terminalTimeHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-terminal-sre-time',
  generationRouter: {
    async generate() {
      throw new Error('legacy Scene Handshake provider must not run after terminal SRE time advance');
    }
  },
  stateDeltaGateway: terminalTimeHarness.gateway,
  latestPairSourceFrame: latestPairSourceFrameFor(terminalTimeHarness, terminalTimeAssistant, terminalTimePlayer, 'terminal-sre-time-advance'),
  runLatestPairSettlementProvider: async () => ({
    settlement: {
      acceptedPreviousResponse: true,
      playerReplyRelation: 'acts-on',
      confidence: 0.84,
      disposition: 'autoCommit'
    },
    operations: [{
      op: 'upsert',
      path: 'commandLog.entries',
      identityKey: 'id',
      value: { id: 'command-log:terminal-sre-time', type: 'scene' }
    }],
    parse: { ok: true }
  }),
  packageData,
  now: terminalTimeHarness.now
});
terminalTimeHarness.state = terminalTime.campaignState;
assert.equal(terminalTime.ok, true);
assert.equal(terminalTime.timeAdvance.elapsedMinutes, 5);
assert.equal(terminalTimeHarness.state.worldState.elapsedMinutes, 5);
assert.equal(terminalTimeHarness.state.timeLedger.lastBoundary.reason, 'intra-ship-transition');
assert.equal(terminalTime.committedRoots.includes('worldState'), true);
assert.equal(terminalTime.committedRoots.includes('timeLedger'), true);
assert.equal(terminalTimeHarness.state.sceneHandshake.lastResult.parseStatus, 'ok');
assert.ok(terminalTimeHarness.persisted.some((proposal) => proposal.source === 'timeAdvanceAdjudicator'));

const terminalHardSkipHarness = createHarness('terminal-sre-hard-skip');
let terminalHardSkipLegacyGenerationCalls = 0;
const terminalHardSkipAssistant = {
  ...assistantMessage,
  hostMessageId: 'assistant-terminal-sre-hard-skip',
  swipes: [
    'Accepted selected source for hard skip.',
    'Unselected visible source for hard skip.'
  ],
  swipeId: 99
};
const terminalHardSkip = await runSceneHandshakeSettlement({
  campaignState: terminalHardSkipHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [terminalHardSkipAssistant, playerMessage],
  chatId: terminalHardSkipHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-terminal-sre-hard-skip',
  generationRouter: {
    async generate() {
      terminalHardSkipLegacyGenerationCalls += 1;
      throw new Error('legacy Scene Handshake provider must not run after terminal SRE hard skip');
    }
  },
  stateDeltaGateway: terminalHardSkipHarness.gateway,
  runLatestPairSettlementProvider: async () => {
    throw new Error('terminal SRE hard skip must not call provider');
  },
  now: terminalHardSkipHarness.now
});
assert.equal(terminalHardSkip.attempted, true);
assert.equal(terminalHardSkip.ok, false);
assert.equal(terminalHardSkip.sourceSettlement.status, 'hardSkipped');
assert.equal(terminalHardSkip.sourceSettlement.providerCalled, false);
assert.equal(terminalHardSkipLegacyGenerationCalls, 0);
assert.equal(terminalHardSkipHarness.state.sceneHandshake.settled.length, 0);

/*
Retired legacy Scene Handshake provider fixture block.
Production no longer has the direct provider fallback this block exercised; strict latest-pair SRE coverage above owns current settlement behavior.
*/
/*
const menuHarness = createHarness('menu-offramp');
const menuAssistant = {
  hostMessageId: 'assistant-menu-offramp',
  index: 24,
  role: 'assistant',
  isUser: false,
  text: 'Bronn can take Sam down to Engineering, or straight to the bridge, or something else entirely.'
};
const menuPlayer = {
  hostMessageId: 'player-follows-bronn',
  index: 25,
  role: 'user',
  isUser: true,
  text: 'Well then Commander, I am all yours. Lead the way.'
};
const badMenuSettlement = {
  kind: 'directive.sceneHandshakeSettlement.v1',
  acceptedPreviousResponse: true,
  playerReplyRelation: 'acts-on',
  confidence: 0.88,
  disposition: 'autoCommit',
  needsInternalReview: false,
  internalReviewReasons: [],
  deferReason: null,
  operatorRecoveryOnly: false,
  openAssignmentProposals: [{
    title: 'or straight to the bridge, or something else entirely',
    summary: 'or straight to the bridge, or something else entirely',
    assignedByActorId: 'mara-whitaker',
    dueWindow: 'Before arrival at the Reach.'
  }],
  commandLogProposals: [{
    summaryInputs: ['or straight to the bridge, or something else entirely'],
    visibleConsequences: ['or straight to the bridge, or something else entirely']
  }],
  shipReadinessProposals: [],
  threadSignals: [{
    title: 'or straight to the bridge, or something else entirely',
    summary: 'or straight to the bridge, or something else entirely',
    participantIds: ['hadrik-bronn']
  }]
};
const menuResult = await runSceneHandshakeSettlement({
  campaignState: menuHarness.state,
  currentPlayerMessage: menuPlayer,
  recentMessages: [menuAssistant, menuPlayer],
  chatId: menuHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-menu-offramp',
  generationRouter: {
    async generate(roleId) {
      assert.equal(roleId, __sceneHandshakeSettlerTestHooks.ROLE_ID);
      return {
        ok: true,
        response: {
          providerId: 'fake-scene-handshake-menu-offramp',
          text: JSON.stringify(badMenuSettlement)
        },
        diagnostics: { providerId: 'fake-scene-handshake-menu-offramp' }
      };
    }
  },
  stateDeltaGateway: menuHarness.gateway,
  now: menuHarness.now
});
menuHarness.state = menuResult.campaignState;
assert.equal(menuResult.ok, true);
assert.equal(menuHarness.state.mission.openAssignments.length, 0);
assert.equal(menuHarness.state.commandLog.entries.length, 0);
assert.equal(menuHarness.state.threadLedger.records.length, 0);
assert.equal(menuHarness.state.sceneHandshake.lastResult.operationCount, 0);

const delegatedOrdersHarness = createHarness('player-issued-orders');
const delegatedOrdersAssistant = {
  hostMessageId: 'assistant-crew-acknowledges-player-orders',
  index: 26,
  role: 'assistant',
  isUser: false,
  text: [
    'The bridge came alive after Vickers issued the readiness orders.',
    '"Aye, sir." Vale pulled up navigational logs and promised a report on feelings and hunches.',
    'Nayar nodded. "Full sensor diagnostic and power distribution audit. Draft by 0700, sir."',
    'Bronn answered from tactical. "Torpedo magazine sampling inspection starts within the hour, Commander."'
  ].join(' ')
};
const delegatedOrdersPlayer = {
  hostMessageId: 'player-follows-up-after-delegation',
  index: 27,
  role: 'user',
  isUser: true,
  text: 'I will be in Engineering with Commander Cross while those reports come together.'
};
const delegatedOrdersSettlement = {
  kind: 'directive.sceneHandshakeSettlement.v1',
  acceptedPreviousResponse: true,
  playerReplyRelation: 'acknowledges',
  confidence: 0.91,
  disposition: 'autoCommit',
  needsInternalReview: false,
  internalReviewReasons: [],
  deferReason: null,
  operatorRecoveryOnly: false,
  openAssignmentProposals: [
    {
      id: 'open-assignment:vale-nav-logs',
      title: 'Pull navigational logs for pilot observations',
      summary: 'Vale to pull navigational logs and report feelings and hunches.',
      assignedActorIds: ['kieran-vale'],
      dueWindow: 'Immediate'
    },
    {
      id: 'open-assignment:nayar-sensor-power-audit',
      title: 'Full sensor diagnostic and power distribution audit',
      summary: 'Nayar to conduct a full sensor diagnostic and power distribution audit.',
      assignedActorIds: ['priya-nayar'],
      dueWindow: 'Draft by 0700 ship time'
    }
  ],
  commandLogProposals: [{
    summaryInputs: ['Vickers issued readiness work to Vale, Nayar, and Bronn after taking the bridge.'],
    visibleConsequences: ['The crew acknowledged the delegated reports without creating new Current Orders for Vickers.']
  }],
  shipReadinessProposals: [],
  threadSignals: []
};
const delegatedOrdersResult = await runSceneHandshakeSettlement({
  campaignState: delegatedOrdersHarness.state,
  currentPlayerMessage: delegatedOrdersPlayer,
  recentMessages: [delegatedOrdersAssistant, delegatedOrdersPlayer],
  chatId: delegatedOrdersHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-player-issued-orders',
  generationRouter: {
    async generate(roleId) {
      assert.equal(roleId, __sceneHandshakeSettlerTestHooks.ROLE_ID);
      return {
        ok: true,
        response: {
          providerId: 'fake-scene-handshake-player-issued-orders',
          text: JSON.stringify(delegatedOrdersSettlement)
        },
        diagnostics: { providerId: 'fake-scene-handshake-player-issued-orders' }
      };
    }
  },
  stateDeltaGateway: delegatedOrdersHarness.gateway,
  now: delegatedOrdersHarness.now
});
delegatedOrdersHarness.state = delegatedOrdersResult.campaignState;
assert.equal(delegatedOrdersResult.ok, true);
assert.equal(delegatedOrdersHarness.state.mission.openAssignments.length, 0);
assert.equal(delegatedOrdersHarness.state.commandLog.entries.length, 1);
assert.deepEqual(delegatedOrdersHarness.state.commandLog.entries[0].linkedAssignmentTitles, []);

const movementHarness = createHarness('time-advance');
const movementAssistant = {
  hostMessageId: 'assistant-walks-to-ready-room',
  index: 30,
  role: 'assistant',
  isUser: false,
  text: 'Whitaker leads Sam out of the shuttlebay, through the corridor, and into the ready room.'
};
const movementPlayer = {
  hostMessageId: 'player-accepts-ready-room',
  index: 31,
  role: 'user',
  isUser: true,
  text: 'Sam steps inside and waits for the captain to begin.'
};
const movement = await runSceneHandshakeSettlement({
  campaignState: movementHarness.state,
  currentPlayerMessage: movementPlayer,
  recentMessages: [movementAssistant, movementPlayer],
  chatId: movementHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-time-advance',
  generationRouter: {
    async generate(roleId) {
      assert.equal(roleId, __sceneHandshakeSettlerTestHooks.ROLE_ID);
      return {
        ok: true,
        response: {
          providerId: 'fake-scene-handshake-time',
          text: JSON.stringify({
            kind: 'directive.sceneHandshakeSettlement.v1',
            acceptedPreviousResponse: true,
            playerReplyRelation: 'acts-on',
            confidence: 0.84,
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
        diagnostics: { providerId: 'fake-scene-handshake-time' }
      };
    }
  },
  stateDeltaGateway: movementHarness.gateway,
  packageData,
  now: movementHarness.now
});
movementHarness.state = movement.campaignState;
assert.equal(movement.ok, true);
assert.equal(movement.promptDirty, true);
assert.equal(movement.timeAdvance.elapsedMinutes, 5);
assert.equal(movementHarness.state.worldState.elapsedMinutes, 5);
assert.equal(movementHarness.state.timeLedger.lastBoundary.reason, 'intra-ship-transition');
assert.equal(movementHarness.state.timeLedger.lastBoundary.currentShipMinute, 515);
assert.ok(movementHarness.persisted.some((proposal) => proposal.source === 'timeAdvanceAdjudicator'));

const dayCompressionHarness = createHarness('latest-pair-day-compression');
const dayCompressionAssistant = {
  hostMessageId: 'assistant-day-compression',
  index: 40,
  role: 'assistant',
  isUser: false,
  text: 'Cross says the repair work will take time if Sam authorizes a full review.'
};
const dayCompressionPlayer = {
  hostMessageId: 'player-day-compression',
  index: 41,
  role: 'user',
  isUser: true,
  text: 'The week took on its own rhythm. Day One, Engineering traced the EPS misalignments. Day Two, Operations rebuilt the meal-replication schedules. Day Three, the reports were ready for Sam.'
};
const dayCompression = await runSceneHandshakeSettlement({
  campaignState: dayCompressionHarness.state,
  currentPlayerMessage: dayCompressionPlayer,
  recentMessages: [dayCompressionAssistant, dayCompressionPlayer],
  chatId: dayCompressionHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-day-compression',
  stateDeltaGateway: dayCompressionHarness.gateway,
  packageData,
  now: dayCompressionHarness.now,
  runLatestPairSettlementProvider: async () => ({
    settlement: {
      acceptedPreviousResponse: true,
      playerReplyRelation: 'acts-on',
      confidence: 0.9,
      disposition: 'autoCommit'
    },
    operations: [{
      op: 'upsert',
      path: 'commandLog.entries',
      identityKey: 'id',
      value: { id: 'command-log:day-compression', type: 'scene' }
    }],
    parse: { ok: true }
  })
});
dayCompressionHarness.state = dayCompression.campaignState;
assert.equal(dayCompression.ok, true);
assert.equal(dayCompression.timeAdvance.elapsedMinutes, 3 * 24 * 60);
assert.equal(dayCompressionHarness.state.worldState.elapsedMinutes, 3 * 24 * 60);
assert.equal(dayCompressionHarness.state.timeLedger.lastBoundary.reason, 'explicit-duration');
assert.equal(dayCompression.committedRoots.includes('worldState'), true);
assert.equal(dayCompression.committedRoots.includes('timeLedger'), true);
assert.ok(dayCompressionHarness.persisted.some((proposal) => proposal.source === 'timeAdvanceAdjudicator'));

const missingPackageHarness = createHarness('latest-pair-missing-package-time');
const missingPackage = await runSceneHandshakeSettlement({
  campaignState: missingPackageHarness.state,
  currentPlayerMessage: dayCompressionPlayer,
  recentMessages: [dayCompressionAssistant, dayCompressionPlayer],
  chatId: missingPackageHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-missing-package-time',
  stateDeltaGateway: missingPackageHarness.gateway,
  packageData: null,
  now: missingPackageHarness.now,
  runLatestPairSettlementProvider: async () => ({
    settlement: {
      acceptedPreviousResponse: true,
      playerReplyRelation: 'acts-on',
      confidence: 0.9,
      disposition: 'autoCommit'
    },
    operations: [{
      op: 'upsert',
      path: 'commandLog.entries',
      identityKey: 'id',
      value: { id: 'command-log:missing-package-time', type: 'scene' }
    }],
    parse: { ok: true }
  })
});
assert.equal(missingPackage.ok, true);
assert.equal(missingPackage.timeAdvance, null);
assert.equal(missingPackage.timeAdvanceSkipped.reason, 'missing-package-world');
assert.equal(missingPackage.committedRoots.includes('timeLedger'), false);

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
  shipReadinessProposals: [
    {
      kind: 'damage',
      label: 'Overbroad refit damage',
      detail: 'This high-impact damage proposal should be rejected, but deterministic low-risk readiness should still fill the explicit source gap.'
    }
  ],
  threadSignals: [
    {
      title: '',
      summary: ''
    }
  ]
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

const assignmentLinkHarness = createHarness('assignment-link-fallback');
const assignmentLinkSettlement = {
  ...settlement,
  openAssignmentProposals: settlement.openAssignmentProposals.map((proposal) => {
    const {
      linkedCrewIds,
      linkedShipSystemIds,
      dueWindow,
      ...rest
    } = proposal;
    return rest;
  }),
  shipReadinessProposals: [],
  threadSignals: []
};
const assignmentLinkResult = await runSceneHandshakeSettlement({
  campaignState: assignmentLinkHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: assignmentLinkHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-assignment-link-fallback',
  generationRouter: {
    async generate(roleId) {
      assert.equal(roleId, __sceneHandshakeSettlerTestHooks.ROLE_ID);
      return {
        ok: true,
        response: {
          providerId: 'fake-scene-handshake-assignment-link-fallback',
          text: JSON.stringify(assignmentLinkSettlement)
        },
        diagnostics: { providerId: 'fake-scene-handshake-assignment-link-fallback' }
      };
    }
  },
  stateDeltaGateway: assignmentLinkHarness.gateway,
  now: assignmentLinkHarness.now
});
assignmentLinkHarness.state = assignmentLinkResult.campaignState;
assert.equal(assignmentLinkResult.ok, true);
assert.ok(assignmentLinkHarness.state.mission.openAssignments.some((entry) => /command-network/i.test(entry.title) && entry.linkedCrewIds.includes('imani-cross')));
assert.ok(assignmentLinkHarness.state.mission.openAssignments.some((entry) => /Bronn/i.test(entry.title) && entry.linkedCrewIds.includes('hadrik-bronn')));
assert.ok(assignmentLinkHarness.state.mission.openAssignments.some((entry) => /Walk the ship/i.test(entry.title) && entry.linkedCrewIds.includes('miriam-sato') && entry.linkedCrewIds.includes('rowan-saye')));

const bronnThreadBefore = acceptedHarness.state.threadLedger.records.find((entry) => entry.title === 'Bronn first conversation');
assert.ok(bronnThreadBefore, 'accepted settlement should create the initial Bronn thread');
const duplicateThreadAssistant = {
  hostMessageId: 'assistant-bronn-thread-reinforcement',
  index: 22,
  role: 'assistant',
  isUser: false,
  text: 'Bronn watches the new XO settle into the bridge rhythm, still measuring whether the first conversation is professional or merely ceremonial.'
};
const duplicateThreadPlayer = {
  hostMessageId: 'player-bronn-thread-reinforcement',
  index: 23,
  role: 'user',
  isUser: true,
  text: 'Sam acknowledges Bronn and keeps the exchange professional.'
};
const duplicateThreadResult = await runSceneHandshakeSettlement({
  campaignState: acceptedHarness.state,
  currentPlayerMessage: duplicateThreadPlayer,
  recentMessages: [duplicateThreadAssistant, duplicateThreadPlayer],
  chatId: acceptedHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-duplicate-thread',
  generationRouter: {
    async generate(roleId, request) {
      assert.equal(roleId, __sceneHandshakeSettlerTestHooks.ROLE_ID);
      assert.equal(request.prompt.includes('visibleThreads'), true);
      return {
        ok: true,
        response: {
          providerId: 'fake-scene-handshake-duplicate-thread',
          text: JSON.stringify({
            kind: 'directive.sceneHandshakeSettlement.v1',
            acceptedPreviousResponse: true,
            playerReplyRelation: 'acknowledges',
            confidence: 0.9,
            disposition: 'autoCommit',
            needsInternalReview: false,
            internalReviewReasons: [],
            deferReason: null,
            operatorRecoveryOnly: false,
            openAssignmentProposals: [],
            commandLogProposals: [],
            shipReadinessProposals: [],
            threadSignals: [{
              title: 'Bronn first conversation',
              summary: 'A later bridge exchange keeps the Bronn first-conversation concern alive with new evidence.',
              type: 'professional_dilemma',
              linkedCrewIds: ['bronn'],
              directCommitment: true
            }]
          })
        },
        diagnostics: { providerId: 'fake-scene-handshake-duplicate-thread' }
      };
    }
  },
  stateDeltaGateway: acceptedHarness.gateway,
  now: acceptedHarness.now
});
acceptedHarness.state = duplicateThreadResult.campaignState;
assert.equal(duplicateThreadResult.ok, true);
const bronnThreadsAfter = acceptedHarness.state.threadLedger.records.filter((entry) => entry.title === 'Bronn first conversation');
assert.equal(bronnThreadsAfter.length, 1, 'same-title same-participant thread signal should reinforce the existing thread');
assert.equal(bronnThreadsAfter[0].id, bronnThreadBefore.id);
assert.equal(bronnThreadsAfter[0].supportingEvidence.length, bronnThreadBefore.supportingEvidence.length + 1);
assert.equal(bronnThreadsAfter[0].metadata.handshakeReinforced, true);
assert.equal(bronnThreadsAfter[0].metadata.sourceSettlementIds.length, 2);

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
assert.ok(fallbackHarness.state.sceneHandshake.lastResult.operationCount >= 8);

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
assert.equal(providerFailureHarness.state.sceneHandshake.deferred.length, 1);
assert.equal(providerFailureHarness.state.sceneHandshake.deferred[0].authority, 'sreSceneHandshakeProjection');
assert.equal(providerFailureHarness.state.sceneHandshake.deferred[0].projectionSource, 'sourceSettlementLatestPair');
assert.equal(providerFailureHarness.state.sceneHandshake.lastResult.error.code, 'TIMEOUT');

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
assert.equal(providerThrow.ok, false);
assert.equal(providerThrow.disposition, 'defer');
assert.equal(providerThrow.providerFailureFallback, undefined);
assert.equal(providerThrow.promptDirty, false);
assert.equal(providerThrowHarness.state.mission.openAssignments.length, 0);
assert.equal(providerThrowHarness.state.sceneHandshake.settled.length, 0);
assert.equal(providerThrowHarness.state.sceneHandshake.deferred.length, 1);
assert.equal(providerThrowHarness.state.sceneHandshake.deferred[0].authority, 'sreSceneHandshakeProjection');
assert.equal(providerThrowHarness.state.sceneHandshake.deferred[0].projectionSource, 'sourceSettlementLatestPair');
assert.deepEqual(providerThrowHarness.state.sceneHandshake.lastResult.reasons, ['source-settlement-provider-threw']);
assert.equal(providerThrowHarness.state.sceneHandshake.lastResult.error.code, 'TRANSPORT_THROW');

const coreRevisionRecordOnlyHarness = createHarness('core-revision-record-only');
coreRevisionRecordOnlyHarness.state = {
  ...coreRevisionRecordOnlyHarness.state,
  runtimeTracking: {
    ...coreRevisionRecordOnlyHarness.state.runtimeTracking,
    revision: 99,
    mechanicsRevision: 88
  },
  directiveRuntimeEvidence: {
    coreStoreReadProjections: {
      kind: 'directive.coreStoreReadProjections.v1',
      runtimeAuthority: 'coreStoreV2',
      revisions: { runtime: 7, mechanics: 3 }
    }
  }
};
const coreRevisionRecordOnly = await runSceneHandshakeSettlement({
  campaignState: coreRevisionRecordOnlyHarness.state,
  currentPlayerMessage: playerMessage,
  recentMessages: [assistantMessage, playerMessage],
  chatId: coreRevisionRecordOnlyHarness.state.campaignChatBinding.chatId,
  ingressId: 'ingress-scene-handshake-core-revision-record-only',
  generationRouter: {
    async generate() {
      return {
        ok: false,
        error: {
          code: 'CORE_REVISION_RECORD_ONLY_TIMEOUT',
          message: 'Synthetic provider failure.'
        }
      };
    }
  },
  stateDeltaGateway: coreRevisionRecordOnlyHarness.gateway,
  now: coreRevisionRecordOnlyHarness.now
});
coreRevisionRecordOnlyHarness.state = coreRevisionRecordOnly.campaignState;
assert.equal(coreRevisionRecordOnly.attempted, true);
assert.equal(coreRevisionRecordOnly.ok, false);
assert.equal(coreRevisionRecordOnly.disposition, 'defer');
assert.equal(coreRevisionRecordOnlyHarness.state.sceneHandshake.deferred.length, 1);
assert.equal(
  coreRevisionRecordOnlyHarness.persisted.some((proposal) => proposal.baseRevision === 7),
  true,
  'Scene Handshake record-only settlements must use CORE/v2 runtime revision as apply base when old runtimeTracking is stale.'
);
assert.equal(coreRevisionRecordOnlyHarness.state.runtimeTracking.revision, 8);
assert.equal(coreRevisionRecordOnlyHarness.state.runtimeTracking.mechanicsRevision, 3);

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
assert.equal(malformedHarness.state.sceneHandshake.deferred.length, 1);
assert.equal(malformedHarness.state.sceneHandshake.deferred[0].authority, 'sreSceneHandshakeProjection');
assert.equal(malformedHarness.state.sceneHandshake.lastResult.parseStatus, 'failed');

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
assert.equal(rejectionHarness.state.sceneHandshake.pendingInternalReview.length, 1);
assert.equal(rejectionHarness.state.sceneHandshake.pendingInternalReview[0].authority, 'sreSceneHandshakeProjection');
*/

console.log('Scene Handshake settler tests passed: accepted assistant prose commits lean state, provider failures defer, rejects corrections, and deduplicates source pairs');
