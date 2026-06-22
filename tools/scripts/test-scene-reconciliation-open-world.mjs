import assert from 'node:assert/strict';
import fs from 'node:fs';

import { initializeOpenWorldCampaignState } from '../../src/directors/director-coordinator.mjs';
import { createThreadLedger } from '../../src/threads/thread-ledger.mjs';
import {
  anchorRangeForMessages,
  createSceneReconciliationService,
  normalizeReconciliationMessages,
  resolveAnchorRange
} from '../../src/runtime/scene-reconciliation.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';

const cloneJson = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const packageData = read('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = read('../../packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
let clock = 0;
const now = () => `2026-06-22T15:${String(clock++).padStart(2, '0')}:00.000Z`;
let state = initializeOpenWorldCampaignState({ packageData, baseState: projection.initialState, now });
state.campaignChatBinding = { chatId: 'chat-open-world-reconciliation' };

const messages = [
  { hostMessageId: 'm1', id: 'm1', index: 1, chatId: 'chat-open-world-reconciliation', role: 'user', text: 'Log: Priya began a calibration review.' },
  { hostMessageId: 'm2', id: 'm2', index: 2, chatId: 'chat-open-world-reconciliation', role: 'assistant', text: 'Ship status: Sensor calibration degraded.' }
];
const originalNormalized = normalizeReconciliationMessages(messages);
const originalRange = anchorRangeForMessages(originalNormalized, { state, now });

state.runtimeTracking.ingressLedger = [
  { id: 'ingress.m1', hostMessageId: 'm1', chatId: state.campaignChatBinding.chatId, textHash: originalNormalized[0].textHash, turnId: 'turn.one', outcomeId: 'outcome.one' },
  { id: 'ingress.m2', hostMessageId: 'm2', chatId: state.campaignChatBinding.chatId, textHash: originalNormalized[1].textHash, turnId: 'turn.two', outcomeId: 'outcome.two' }
];
state.runtimeTracking.responseLedger = [{ id: 'response.m2', hostMessageId: 'm2', outcomeId: 'outcome.two', sourceAnchorRange: originalRange }];
state.turnLedger.entries = [
  { turnId: 'turn.one', outcomeId: 'outcome.one', snapshotBefore: cloneJson({ ...state, turnLedger: { entries: [] } }) },
  { turnId: 'turn.two', outcomeId: 'outcome.two', snapshotBefore: cloneJson({ ...state, turnLedger: { entries: [] } }) }
];
state.turnLedger.lastCommittedOutcomeId = 'outcome.two';
state.eventLedger.committedEvents.push({
  id: 'event.anchored.one', sequence: state.eventLedger.nextSequence++, type: 'test.anchored', status: 'committed', invalidated: false,
  sourceOutcomeId: 'outcome.one', sourceAnchorRange: cloneJson(originalRange), causalParentIds: [], actorIds: [], factionIds: [], locationIds: [], tags: [], payload: {}
});
state.threadLedger = createThreadLedger({ records: [{
  id: 'thread.anchored.one', status: 'available', shape: 'side_assignment', type: 'shipboard_maintenance',
  title: 'Calibration review', playerSummary: 'Priya needs help with a calibration problem.',
  observableSeed: 'Priya reported a calibration problem.', storyQuestion: 'Can the calibration problem be resolved?',
  participantIds: ['priya-nayar'], source: { id: 'source.thread.anchored', type: 'conversation', messageIds: ['m1', 'm2'], anchorRange: originalRange, rangeHash: originalRange.rangeHash },
  supportingEvidence: [{ id: 'evidence.anchored', summary: 'Priya began a calibration review.', sourceMessageIds: ['m1'], anchorRange: originalRange }]
}] });
state.dynamicQuestCatalog.templates.push({
  id: 'quest.emergent.anchored', schemaVersion: 2, kind: 'emergent', title: 'Calibration Review', playerSummary: 'Help Priya review calibration drift.',
  anchors: { locationIds: [], actorIds: ['priya-nayar'], factionIds: [] }, availability: {}, objectives: [{ id: 'objective.review', label: 'Review the calibration data', required: true }],
  approaches: [{ id: 'approach.review', label: 'Review the data', tags: ['analyze'] }], systemicResolution: { failureForward: true }, outcomes: [],
  provenance: { sourceThreadId: 'thread.anchored.one', anchorRange: originalRange }
});
state.questLedger.instances.push({
  id: 'quest.emergent.anchored', templateId: 'quest.emergent.anchored', kind: 'emergent', status: 'available', foreground: false,
  objectiveStates: [{ id: 'objective.review', status: 'pending', progress: 0 }], sourceEventIds: ['event.anchored.one'], sourceAnchorRange: originalRange, metadata: {}
});

let persistCount = 0;
const gateway = createStateDeltaGateway({
  getState: () => state,
  setState: (next) => { state = cloneJson(next); },
  persist: async () => { persistCount += 1; },
  now
});
let idCounter = 0;
let reconciledConversation = null;
const service = createSceneReconciliationService({
  getCampaignState: () => state,
  stateDeltaGateway: gateway,
  getPackageData: () => packageData,
  processReconciledConversation: async (conversation) => { reconciledConversation = cloneJson(conversation); },
  replayDirector: async ({ snapshotBefore, ledgerEntry }) => ({
    kind: 'directive.replayPreview',
    sourceOutcomeId: ledgerEntry.outcomeId,
    snapshotMissionPhase: snapshotBefore.mission?.phase || null,
    liveStateChanged: false
  }),
  host: { chat: {
    getMessage(id) { return messages.find((item) => item.hostMessageId === String(id)) || null; },
    getRecentMessages() { return messages; },
    normalizeMessagePayload(payload = {}) { return payload.message || payload; }
  } },
  idFactory(prefix) { idCounter += 1; return `${prefix}.${idCounter}`; },
  now
});

const first = await service.reconcileFromHere({ message: { hostMessageId: 'm1' } });
assert.equal(first.ok, true);
assert.equal(first.applied.length, 1, 'Low-risk command-log evidence should auto-apply.');
assert.equal(first.pending.length, 1, 'Consequential ship condition must wait for explicit review.');
assert.equal(state.ship.condition, projection.initialState.ship.condition, 'Pending mechanics must not alter live state.');
assert(state.eventLedger.committedEvents.find((item) => item.id === 'event.anchored.one').invalidated, 'Anchored world event must be invalidated, not deleted.');
assert(state.threadLedger.records.find((item) => item.id === 'thread.anchored.one').supportingEvidence[0].invalidated, 'Anchored thread evidence must be marked stale.');
assert.equal(state.dynamicQuestCatalog.templates.find((item) => item.id === 'quest.emergent.anchored').stale, true);
assert.equal(state.questLedger.instances.find((item) => item.id === 'quest.emergent.anchored').metadata.stale, true);
assert.equal(reconciledConversation.reconciliation, true);
assert.equal(reconciledConversation.anchorRange.rangeHash, originalRange.rangeHash);

const unchanged = await service.reconcileFromHere({ message: { hostMessageId: 'm1' } });
assert.equal(unchanged.ok, true);
assert.equal(unchanged.skippedUnchanged, 1, 'Unchanged passage chunks must be skipped from repeated model work.');

const oldPendingId = first.pending[0].id;
messages[1].text = 'Ship status: Sensor calibration nominal after correction.';
const changedNormalized = normalizeReconciliationMessages(messages);
const resolvedOld = resolveAnchorRange(changedNormalized, originalRange);
assert.equal(resolvedOld.stale, true);
assert(resolvedOld.reasons.includes('range-hash-changed'));
const staleApply = await service.applyPending({ proposalId: oldPendingId });
assert.equal(staleApply.ok, false);
assert.equal(staleApply.reason, 'stale-proposal');
assert(state.runtimeTracking.sceneReconciliation.pending.find((item) => item.id === oldPendingId).status === 'stale');

const rerun = await service.reconcileFromHere({ message: { hostMessageId: 'm1' } });
assert.equal(rerun.ok, true);
assert.equal(rerun.run.changedChunkCount, 1);
assert.equal(rerun.pending.length, 1);
const currentPending = rerun.pending[0];
const applied = await service.applyPending({ proposalId: currentPending.id });
assert.equal(applied.ok, true);
assert.equal(state.ship.condition, 'Sensor calibration nominal after correction');
assert(state.eventLedger.committedEvents.some((event) => event.type === 'reconciliation.accepted'));

const stateBeforePreview = cloneJson(state);
const preview = await service.recalculateFromHere({ message: { hostMessageId: 'm1' }, maxTurns: 3 });
assert.equal(preview.ok, true);
assert.equal(preview.hasSnapshotBefore, true);
assert.equal(preview.outcomeId, 'outcome.one');
assert.deepEqual(state.mission, stateBeforePreview.mission, 'Scratch replay preview must not mutate live mechanics.');
assert.equal(preview.replayPreview.liveStateChanged, false);
const enriched = await service.recordRecalculationPreview({ previewId: preview.previewId, preview: { kind: 'director-preview', outcome: 'recalculated' } });
assert.equal(enriched.ok, true);
const accepted = await service.acceptRecalculationPreview({
  previewId: preview.previewId,
  replacedOutcomeId: 'outcome.one',
  replacementOutcomeId: 'outcome.one.replacement',
  droppedOutcomeIds: ['outcome.two'],
  sourceAnchorRange: preview.sceneReconciliation.recalculationPreviews.find((item) => item.id === preview.previewId).anchorRange,
  replacementHistoryEntry: { type: 'scene-reconciliation-replacement' }
});
assert.equal(accepted.ok, true);
assert.equal(accepted.preview.status, 'accepted');
assert.deepEqual(accepted.preview.droppedOutcomeIds, ['outcome.two']);
assert(state.runtimeTracking.sceneReconciliation.invalidations.some((item) => item.type === 'recalculation-accepted'));

const secondPreview = await service.recalculateFromHere({ message: { hostMessageId: 'm2' } });
assert.equal(secondPreview.ok, true);
const cancelled = await service.cancelRecalculationPreview({ previewId: secondPreview.previewId, reason: 'operator-declined' });
assert.equal(cancelled.ok, true);
assert.equal(cancelled.preview.status, 'cancelled');
assert(persistCount > 0);

console.log('test-scene-reconciliation-open-world: ok');
