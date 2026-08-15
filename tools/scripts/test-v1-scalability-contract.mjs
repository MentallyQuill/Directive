import assert from 'node:assert/strict';

import { createAcceptedPairCallBudget } from '../../src/runtime/accepted-pair-recovery-state.mjs';
import { createEpisodeReviewScheduler } from '../../src/runtime/episode-review-scheduler.mjs';
import {
  V1_ACCEPTED_PAIR_SOURCE_WINDOW,
  prepareV1AcceptedPairSnapshot,
} from '../../src/runtime/v1-accepted-pair-source.mjs';
import { buildV1RuntimePlayerProjection } from '../../src/runtime/v1-mission-runtime.mjs';
import {
  V1_STORAGE_PATHS,
  createV1CampaignSave,
  loadV1CampaignSave,
  storeV1CampaignSave,
  verifyV1Storage,
} from '../../src/storage/v1-storage-repository.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

function memoryAdapter() {
  const files = new Map();
  return {
    async readJson(key) {
      if (!files.has(key)) {
        const error = new Error(`not found: ${key}`);
        error.code = 'ENOENT';
        throw error;
      }
      return structuredClone(files.get(key));
    },
    async writeJson(key, value) { files.set(key, structuredClone(value)); },
    async deleteJsonFile(key) { files.delete(key); },
    snapshot: () => Object.fromEntries(files),
  };
}

function sourceMessages(messageCount, chatId, saveId) {
  const fillerCount = Math.max(0, messageCount - 3);
  return [
    ...Array.from({ length: fillerCount }, (_, index) => ({
      id: `historical.${messageCount}.${index}`,
      hostMessageId: `historical.${messageCount}.${index}`,
      index,
      role: index % 2 === 0 ? 'assistant' : 'user',
      isUser: index % 2 === 1,
      text: `Historical message ${index}`,
    })),
    {
      id: `player.prompt.${messageCount}`,
      hostMessageId: `player.prompt.${messageCount}`,
      index: fillerCount,
      role: 'user',
      isUser: true,
      text: 'Give me the current situation.',
    },
    {
      id: `assistant.current.${messageCount}`,
      hostMessageId: `assistant.current.${messageCount}`,
      index: fillerCount + 1,
      role: 'assistant',
      isUser: false,
      text: 'The bridge reports a stable situation.',
    },
    {
      id: `player.current.${messageCount}`,
      hostMessageId: `player.current.${messageCount}`,
      index: fillerCount + 2,
      role: 'user',
      isUser: true,
      text: 'Continue.',
      chatId,
      saveId,
    },
  ];
}

const runtimeAssets = loadAshesRuntimeAssets();
const results = [];

for (const messageCount of [30, 1000, 10000]) {
  const pairCount = Math.floor(messageCount / 2);
  const saveId = `save.scale-${messageCount}`;
  const chatId = `chat.scale-${messageCount}`;
  const campaignState = createAshesInitialState({
    campaignId: `campaign.scale-${messageCount}`,
    saveId,
    chatId,
  });

  const history = sourceMessages(messageCount, chatId, saveId);
  let sourceReadCount = 0;
  let maximumRowsRead = 0;
  const readRecent = ({ limit }) => {
    sourceReadCount += 1;
    const rows = history.slice(-limit);
    maximumRowsRead = Math.max(maximumRowsRead, rows.length);
    return rows;
  };
  const recent = readRecent({ limit: V1_ACCEPTED_PAIR_SOURCE_WINDOW });
  const currentPlayerMessage = history.at(-1);
  const prepared = prepareV1AcceptedPairSnapshot({
    campaignState,
    currentPlayerMessage,
    recentMessages: recent,
    requirePromptingPlayerAnchor: true,
    chatId,
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.snapshot.source.previousAssistant.hostMessageId, `assistant.current.${messageCount}`);
  assert.equal(
    prepared.snapshot.source.previousAssistant.promptingPlayerHostMessageId,
    `player.prompt.${messageCount}`,
  );

  const callBudget = createAcceptedPairCallBudget();
  const fingerprint = prepared.snapshot.source.sourceRangeHash;
  let utilityCalls = 0;
  if (callBudget.reserve(fingerprint, 'automatic')) utilityCalls += 1;
  if (callBudget.reserve(fingerprint, 'automatic')) utilityCalls += 1;
  assert.equal(utilityCalls, 1);

  let evaluatorCalls = 0;
  let pendingReviewToken = {
    kind: 'directive.episodeReviewToken.v1',
    branchId: campaignState.storySettlement.branchId,
    episodeId: `episode.scale-${messageCount}`,
    episodeRevision: campaignState.storySettlement.revision,
    checkpointSequence: 1,
  };
  const episodeScheduler = createEpisodeReviewScheduler({
    getToken: () => pendingReviewToken,
    review: async () => {
      evaluatorCalls += 1;
      pendingReviewToken = null;
      return { ok: true, attempted: true, status: 'continued' };
    },
  });
  assert.equal(evaluatorCalls, 0);

  const adapter = memoryAdapter();
  let logicalSave = createV1CampaignSave({
    id: saveId,
    name: `Scale ${messageCount}`,
    state: campaignState,
    createdAt: '2026-08-15T00:00:00.000Z',
  });
  await storeV1CampaignSave(adapter, logicalSave);
  for (let revision = 1; revision <= pairCount; revision += 1) {
    const nextState = structuredClone(logicalSave.state);
    nextState.worldState.currentLocationId = `scale-location-${revision % 2}`;
    nextState.stateCustody.revision += 1;
    nextState.stateCustody.recentCommitIds = [
      ...nextState.stateCustody.recentCommitIds,
      `scale.commit-${revision}`,
    ].slice(-64);
    const nextSave = createV1CampaignSave({
      id: saveId,
      name: logicalSave.name,
      state: nextState,
      createdAt: logicalSave.createdAt,
      updatedAt: new Date(Date.parse('2026-08-15T00:00:00.000Z') + revision * 1000).toISOString(),
    });
    await storeV1CampaignSave(adapter, nextSave, { previousSave: logicalSave });
    logicalSave = nextSave;
  }

  const hydrated = await loadV1CampaignSave(adapter, saveId);
  assert.deepEqual(hydrated, logicalSave);
  assert.equal((await verifyV1Storage(adapter)).ok, true);
  assert.deepEqual(
    buildV1RuntimePlayerProjection({ campaignState: hydrated.state, runtimeAssets }),
    buildV1RuntimePlayerProjection({ campaignState: logicalSave.state, runtimeAssets }),
  );
  const manifest = adapter.snapshot()[V1_STORAGE_PATHS.save(saveId)];
  assert.equal(Object.hasOwn(manifest, 'state'), false);
  assert.equal(manifest.segments.length, Math.ceil(pairCount / 64));
  assert.ok(manifest.segments.every((segment) => (
    segment.deltaCount <= 64 && segment.byteLength <= 512 * 1024
  )));
  const evaluatorCallsDuringContinue = evaluatorCalls;
  assert.equal((await episodeScheduler.schedule()).attempted, true);
  assert.equal((await episodeScheduler.schedule()).status, 'no-pending-review');

  results.push({
    messageCount,
    pairCount,
    sourceFixtureReads: sourceReadCount,
    sourceFixtureMaximumRows: maximumRowsRead,
    callBudgetFixtureAutomaticReservations: utilityCalls,
    schedulerCallsBeforePostNarration: evaluatorCallsDuringContinue,
    schedulerPostNarrationCalls: evaluatorCalls,
    segmentCount: manifest.segments.length,
  });
}

for (const result of results) {
  assert.equal(result.sourceFixtureReads, 1);
  assert.ok(result.sourceFixtureMaximumRows <= V1_ACCEPTED_PAIR_SOURCE_WINDOW);
  assert.equal(result.callBudgetFixtureAutomaticReservations, 1);
  assert.equal(result.schedulerCallsBeforePostNarration, 0);
  assert.equal(result.schedulerPostNarrationCalls, 1);
}

console.log(`V1 segmented persistence scale contract passed: ${JSON.stringify(results)}`);
