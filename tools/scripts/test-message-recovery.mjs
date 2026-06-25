import assert from 'node:assert/strict';

import { createMessageReconciler } from '../../src/runtime/message-reconciler.mjs';
import {
  commitTrackedCampaignState,
  initializeCampaignRuntimeTracking,
  recordDirectiveResponse,
  recordTurnIngress,
  updateTurnIngress
} from '../../src/runtime/state-delta-gateway.mjs';

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
let nowIndex = 0;
const now = () => `2026-06-22T03:00:${String(nowIndex++).padStart(2, '0')}.000Z`;
let campaignState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-recovery-test', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  mission: { activePhaseId: 'phase-before', knownFacts: [] },
  commandLog: { entries: [] }
});

campaignState = recordTurnIngress(campaignState, {
  id: 'ingress-uncommitted',
  hostMessageId: 'player-uncommitted',
  status: 'classified',
  textHash: 'hash-uncommitted'
});
campaignState = recordTurnIngress(campaignState, {
  id: 'ingress-uncommitted-delete',
  hostMessageId: 'player-uncommitted-delete',
  status: 'classified',
  textHash: 'hash-uncommitted-delete'
});
campaignState = recordTurnIngress(campaignState, {
  id: 'ingress-committed',
  hostMessageId: 'player-committed',
  status: 'classified',
  textHash: 'hash-committed'
});

const beforeOutcomeRevision = campaignState.runtimeTracking.revision;
const afterOutcomeCandidate = cloneJson(campaignState);
afterOutcomeCandidate.mission.activePhaseId = 'phase-after';
afterOutcomeCandidate.mission.knownFacts.push({ id: 'fact-after', summary: 'A committed fact.' });
afterOutcomeCandidate.commandLog.entries.push({ id: 'log-after', outcomeId: 'outcome-committed' });
campaignState = commitTrackedCampaignState({
  campaignState,
  nextCampaignState: afterOutcomeCandidate,
  delta: {
    source: 'missionDirector',
    reason: 'Committed test outcome.',
    domains: ['mission', 'commandLog'],
    ingressId: 'ingress-committed',
    outcomeId: 'outcome-committed',
    stable: true
  },
  now
});
campaignState = updateTurnIngress(campaignState, 'ingress-committed', {
  status: 'committed',
  outcomeId: 'outcome-committed'
});
campaignState = recordDirectiveResponse(campaignState, {
  id: 'response-committed',
  ingressId: 'ingress-committed',
  turnId: 'turn-committed',
  outcomeId: 'outcome-committed',
  hostMessageId: 'assistant-committed',
  strategy: 'directivePosted',
  responseKind: 'committedOutcome',
  status: 'posted'
});
campaignState = recordDirectiveResponse(campaignState, {
  id: 'response-committed-delete',
  ingressId: 'ingress-committed',
  turnId: 'turn-committed',
  outcomeId: 'outcome-committed',
  hostMessageId: 'assistant-committed-delete',
  strategy: 'directivePosted',
  responseKind: 'committedOutcome',
  status: 'posted'
});

const persisted = [];
const promptSyncs = [];
const reconciler = createMessageReconciler({
  getCampaignState: () => campaignState,
  setCampaignState: (next) => { campaignState = cloneJson(next); },
  persist: async (state, summary) => persisted.push({ summary, state: cloneJson(state) }),
  syncPrompt: async (state) => {
    const next = cloneJson(state);
    next.campaignChatBinding.promptContextRevision += 1;
    promptSyncs.push(next.campaignChatBinding.promptContextRevision);
    return next;
  },
  now
});

const uncommittedEdit = await reconciler.reconcileEdited({
  hostMessageId: 'player-uncommitted',
  replacementText: 'A revised but not yet committed message.'
});
assert.equal(uncommittedEdit.matched, true);
assert.equal(uncommittedEdit.action, 'invalidated');
assert.equal(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted').status, 'invalidated');
assert.equal(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted').replacementText, 'A revised but not yet committed message.');
assert.match(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted').editedAt, /^2026-06-22T03:00:/);
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'playerMessageEdited' && entry.status === 'invalidated' && entry.outcomeId === null), true);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 2);

const uncommittedDelete = await reconciler.reconcileDeleted({
  hostMessageId: 'player-uncommitted-delete'
});
assert.equal(uncommittedDelete.matched, true);
assert.equal(uncommittedDelete.action, 'invalidated');
assert.equal(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted-delete').status, 'invalidated');
assert.match(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-uncommitted-delete').deletedAt, /^2026-06-22T03:00:/);
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'playerMessageDeleted' && entry.status === 'invalidated' && entry.outcomeId === null), true);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 3);

const committedEdit = await reconciler.reconcileEdited({
  hostMessageId: 'player-committed',
  replacementText: 'A materially changed committed order.',
  autoRollback: false
});
assert.equal(committedEdit.matched, true);
assert.equal(committedEdit.action, 'reviewRequired');
assert.equal(committedEdit.preOutcomeRevision, beforeOutcomeRevision);
assert.equal(campaignState.mission.activePhaseId, 'phase-after');
assert.equal(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-committed').status, 'recoveryRequired');
assert.equal(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-committed').replacementText, 'A materially changed committed order.');
assert.match(campaignState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-committed').editedAt, /^2026-06-22T03:00:/);
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'playerMessageEdited' && entry.status === 'reviewRequired'), true);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 4);

const committedResponseEdit = await reconciler.reconcileEdited({
  hostMessageId: 'assistant-committed',
  replacementText: 'A materially changed Directive response.',
  autoRollback: false
});
assert.equal(committedResponseEdit.matched, true);
assert.equal(committedResponseEdit.action, 'reviewRequired');
assert.equal(committedResponseEdit.preOutcomeRevision, beforeOutcomeRevision);
const responseEntry = campaignState.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-committed');
assert.equal(responseEntry.status, 'recoveryRequired');
assert.equal(responseEntry.replacementText, 'A materially changed Directive response.');
assert.match(responseEntry.editedAt, /^2026-06-22T03:00:/);
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'directiveResponseEdited' && entry.status === 'reviewRequired'), true);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 5);

const committedResponseDelete = await reconciler.reconcileDeleted({
  hostMessageId: 'assistant-committed-delete',
  autoRollback: false
});
assert.equal(committedResponseDelete.matched, true);
assert.equal(committedResponseDelete.action, 'reviewRequired');
assert.equal(committedResponseDelete.preOutcomeRevision, beforeOutcomeRevision);
const deletedResponseEntry = campaignState.runtimeTracking.responseLedger.find((entry) => entry.id === 'response-committed-delete');
assert.equal(deletedResponseEntry.status, 'recoveryRequired');
assert.match(deletedResponseEntry.deletedAt, /^2026-06-22T03:00:/);
assert.equal(deletedResponseEntry.invalidationType, 'directiveResponseDeleted');
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'directiveResponseDeleted' && entry.status === 'reviewRequired'), true);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 6);

const rolledBack = await reconciler.reconcileDeleted({
  hostMessageId: 'player-committed',
  autoRollback: true
});
assert.equal(rolledBack.matched, true);
assert.equal(rolledBack.action, 'rolledBack');
assert.equal(rolledBack.preOutcomeRevision, beforeOutcomeRevision);
assert.equal(campaignState.runtimeTracking.revision, beforeOutcomeRevision);
assert.equal(campaignState.mission.activePhaseId, 'phase-before');
assert.equal(campaignState.mission.knownFacts.some((entry) => entry.id === 'fact-after'), false);
assert.equal(campaignState.commandLog.entries.some((entry) => entry.id === 'log-after'), false);
assert.equal(campaignState.runtimeTracking.ingressLedger.some((entry) => entry.id === 'ingress-committed'), true, 'Ingress ledger must survive snapshot restore.');
assert.equal(campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'restoreRevision'), true);
assert.equal(campaignState.campaignChatBinding.promptContextRevision, 2, 'Restored binding revision must be incremented once after prompt rebuild.');
assert.equal(promptSyncs.length, 6);
assert.equal(persisted.length, 12, 'Each recovery and its prompt revision must be persisted.');

const missing = await reconciler.reconcileDeleted({ hostMessageId: 'missing-message' });
assert.equal(missing.matched, false);
assert.equal(missing.action, 'ignored');

let handshakeState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-handshake-recovery', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  mission: {
    openAssignments: [{
      id: 'assignment-cross',
      title: 'Review Cross handoff',
      status: 'open',
      sourceSettlementId: 'settlement-handshake-1'
    }]
  },
  commandLog: {
    entries: [{
      id: 'log-handshake',
      type: 'sceneHandshake',
      sourceSettlementId: 'settlement-handshake-1',
      summaryInputs: ['Whitaker gave current orders.']
    }]
  },
  ship: {
    technicalDebt: [{
      id: 'debt-handshake',
      label: 'Command-network handoff',
      status: 'under-review',
      sourceSettlementId: 'settlement-handshake-1'
    }]
  },
  threadLedger: {
    records: [{
      id: 'thread-handshake',
      title: 'Cross handoff',
      status: 'active',
      source: { id: 'settlement-handshake-1', type: 'sceneHandshake' }
    }]
  },
  runtimeTracking: {
    sceneHandshake: {
      settled: [{
        id: 'settlement-handshake-1',
        idempotencyKey: 'scene-handshake:test',
        status: 'settled',
        disposition: 'autoCommit',
        previousAssistantHostMessageId: 'assistant-whitaker-orders',
        currentPlayerHostMessageId: 'player-accepts-orders'
      }],
      lastResult: {
        id: 'settlement-handshake-1',
        status: 'settled',
        previousAssistantHostMessageId: 'assistant-whitaker-orders',
        currentPlayerHostMessageId: 'player-accepts-orders'
      }
    }
  }
});
const handshakePersisted = [];
const handshakePromptSyncs = [];
const handshakeReconciler = createMessageReconciler({
  getCampaignState: () => handshakeState,
  setCampaignState: (next) => { handshakeState = cloneJson(next); },
  persist: async (state, summary) => handshakePersisted.push({ summary, state: cloneJson(state) }),
  syncPrompt: async (state) => {
    const next = cloneJson(state);
    next.campaignChatBinding.promptContextRevision += 1;
    handshakePromptSyncs.push(next.campaignChatBinding.promptContextRevision);
    return next;
  },
  now
});

const assistantSourceEdit = await handshakeReconciler.reconcileEdited({
  hostMessageId: 'assistant-whitaker-orders',
  replacementText: 'Whitaker gave a different priority list.'
});
assert.equal(assistantSourceEdit.matched, true);
assert.equal(assistantSourceEdit.action, 'sceneHandshakeInvalidated');
assert.equal(assistantSourceEdit.sceneHandshake.invalidatedCount, 1);
assert.equal(handshakeState.runtimeTracking.sceneHandshake.settled[0].status, 'invalidated');
assert.equal(handshakeState.runtimeTracking.sceneHandshake.lastResult.status, 'invalidated');
assert.equal(handshakeState.mission.openAssignments[0].status, 'source-stale');
assert.equal(handshakeState.commandLog.entries[0].sourceStale, true);
assert.equal(handshakeState.ship.technicalDebt[0].sourceStale, true);
assert.equal(handshakeState.threadLedger.records[0].sourceStale, true);
assert.equal(handshakeState.threadLedger.records[0].metadata.stale, true);
assert.equal(handshakeState.threadLedger.records[0].metadata.staleReason, 'scene-handshake-source-invalidated');
assert.equal(handshakeState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'sceneHandshakeSourceInvalidated'), true);
assert.equal(handshakeState.campaignChatBinding.promptContextRevision, 2);

let playerHandshakeState = initializeCampaignRuntimeTracking({
  campaign: { id: 'campaign-handshake-player-recovery', status: 'active' },
  campaignChatBinding: { chatId: 'campaign-chat', promptContextRevision: 1 },
  mission: {
    openAssignments: [{
      id: 'assignment-bronn',
      title: 'Meet Bronn',
      status: 'open',
      sourceSettlementId: 'settlement-handshake-2'
    }]
  },
  commandLog: { entries: [] },
  runtimeTracking: {
    sceneHandshake: {
      settled: [{
        id: 'settlement-handshake-2',
        idempotencyKey: 'scene-handshake:test-2',
        status: 'settled',
        disposition: 'autoCommit',
        previousAssistantHostMessageId: 'assistant-orders-2',
        currentPlayerHostMessageId: 'player-accepts-orders-2'
      }],
      lastResult: {
        id: 'settlement-handshake-2',
        status: 'settled',
        previousAssistantHostMessageId: 'assistant-orders-2',
        currentPlayerHostMessageId: 'player-accepts-orders-2'
      }
    }
  }
});
playerHandshakeState = recordTurnIngress(playerHandshakeState, {
  id: 'ingress-handshake-player',
  hostMessageId: 'player-accepts-orders-2',
  status: 'classified',
  textHash: 'accepts-orders-2'
});
const playerHandshakeReconciler = createMessageReconciler({
  getCampaignState: () => playerHandshakeState,
  setCampaignState: (next) => { playerHandshakeState = cloneJson(next); },
  persist: async () => {},
  syncPrompt: async (state) => {
    const next = cloneJson(state);
    next.campaignChatBinding.promptContextRevision += 1;
    return next;
  },
  now
});
const acceptingPlayerDelete = await playerHandshakeReconciler.reconcileDeleted({
  hostMessageId: 'player-accepts-orders-2'
});
assert.equal(acceptingPlayerDelete.matched, true);
assert.equal(acceptingPlayerDelete.action, 'invalidated');
assert.equal(acceptingPlayerDelete.sceneHandshake.invalidatedCount, 1);
assert.equal(playerHandshakeState.runtimeTracking.ingressLedger.find((entry) => entry.id === 'ingress-handshake-player').status, 'invalidated');
assert.equal(playerHandshakeState.runtimeTracking.sceneHandshake.settled[0].status, 'invalidated');
assert.equal(playerHandshakeState.mission.openAssignments[0].status, 'source-stale');

console.log('Message recovery tests passed: invalidation, review-required edits, tracked rollback, Scene Handshake source invalidation, ledger preservation, and prompt revision persistence');
