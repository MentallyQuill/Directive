import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import { createFakeDirectiveHost, createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { prepareV1AcceptedPairSnapshot } from '../../src/runtime/v1-accepted-pair-source.mjs';
import { loadV1CampaignSave } from '../../src/storage/v1-storage-repository.mjs';
import { disableScenePacingForFixture } from './unpaced-mission-fixture.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const playerInput = {
  identity: { name: 'Source Commit Tester', pronounsOrAddress: 'they/them', speciesId: 'human', ageBandId: 'mid-career', appearance: 'Attentive.' },
  service: { careerBackgroundId: 'tactical-security', formativeExperienceId: 'dominion-war-fleet-service', assignmentReasonId: 'experienced-outsider-transfer' },
  personality: { traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' }, flawId: 'impatient' },
  dossier: { briefBiography: 'A command officer committed to reconstruction.', publicReputation: 'An attentive command officer.' },
};

function assets() {
  const value = loadAshesRuntimeAssets();
  disableScenePacingForFixture(value.missionDefinitions[0]);
  return value;
}

async function runCase({
  name,
  mutateRows = null,
  mutateChat = null,
  mutateAdapter = null,
  expected = 'stale',
  recover = false,
  nativeRecovery = false,
  mutateBeforeObserve = false,
  sameRangeHash = false,
} = {}) {
  let releaseFirstInterpretation;
  let reportFirstInterpretationStarted;
  let interpretationCalls = 0;
  const firstInterpretationStarted = new Promise((resolve) => { reportFirstInterpretationStarted = resolve; });
  const generation = createFakeGenerationClient({ responses: {
    acceptedPairMissionEvidence: async ({ request }) => {
      interpretationCalls += 1;
      if (interpretationCalls === 1) {
        reportFirstInterpretationStarted();
        await new Promise((resolve) => { releaseFirstInterpretation = resolve; });
      }
      const content = request.messages.at(-1).content;
      const packet = JSON.parse(content.slice(content.indexOf('\n') + 1));
      return {
        text: JSON.stringify({
          kind: 'directive.missionEvidenceInterpretation.v1', assistantAcceptance: 'accepted', claims: [], peopleEvents: [], abstained: true,
          time: { decision: 'advance', basis: 'implicitAction', sourceSlot: 'currentPlayer', evidenceQuote: packet.sourcePair.currentPlayer.text, elapsedSeconds: 10, reason: 'brief-acknowledgement', confidence: 0.9 },
        }),
        providerId: 'fake-utility',
      };
    },
  } });
  const host = createFakeDirectiveHost({ chatNative: true, generation, logger: { warn() {}, info() {}, error() {} } });
  let sequence = 0;
  const app = createDirectiveRuntimeApp({
    host,
    packageLoader: async () => assets(),
    idFactory: (prefix) => `${prefix}.${name}.${++sequence}`,
    now: () => '2026-09-15T03:00:00.000Z',
  });
  await app.initialize();
  await app.startCreatorDraft();
  await app.saveCreatorDraft({ patch: { activeStep: 'review', input: playerInput } });
  await app.acceptCreatorDraftAndStartCampaign();

  const alternatePrompt = host.chat.pushPlayerMessage({ text: 'Record this alternate prompt context.', hostMessageId: `${name}.alternate-prompt` });
  const prompting = host.chat.pushPlayerMessage({ text: 'Please state the next handover item.', hostMessageId: `${name}.prompt` });
  const originalAssistantText = 'Whitaker presents the current handover item and asks for acknowledgement.';
  const alternateAssistantText = 'Whitaker withdraws that handover item and replaces it with a different answer.';
  host.chat.pushAssistantMessage({
    text: originalAssistantText,
    hostMessageId: `${name}.assistant`,
    metadata: { promptingPlayerHostMessageId: prompting.hostMessageId },
    swipes: [originalAssistantText, alternateAssistantText],
    swipeId: 0,
  });
  const player = host.chat.pushPlayerMessage({ text: 'I acknowledge this exact handover item.', hostMessageId: `${name}.player` });
  const originalChatId = host.chat.getCurrentChatId();
  const originalGetRecentMessages = host.chat.getRecentMessages;
  const originalGetCurrentBinding = host.chat.getCurrentBinding;
  const beforeView = await app.getCurrentView({ tabId: 'mission' });
  const beforeState = beforeView.campaignState;
  const beforeSave = await loadV1CampaignSave(host.storage, beforeView.activeSaveId);
  const capturedSource = sameRangeHash ? prepareV1AcceptedPairSnapshot({
    campaignState: beforeState,
    currentPlayerMessage: player,
    recentMessages: host.chat.getRecentMessages({ limit: 8, playerSafeOnly: false }),
    requirePromptingPlayerAnchor: true,
    chatId: originalChatId,
  }) : null;
  const context = { alternatePromptId: alternatePrompt.hostMessageId, assistantId: `${name}.assistant`, playerId: player.hostMessageId, alternateAssistantText };
  if (mutateBeforeObserve && mutateRows) {
    host.chat.setMessagesForChat(host.chat.getCurrentChatId(), mutateRows(host.chat.messages(), context));
  }
  const observedPlayer = mutateBeforeObserve
    ? host.chat.messages().find((row) => row.hostMessageId === player.hostMessageId)
    : player;
  if (nativeRecovery) app.handleHostGenerationStarted({ type: 'normal', automaticTrigger: false });
  const pending = app.observeHostPlayerMessage({ message: observedPlayer });
  if (mutateBeforeObserve) {
    await new Promise((resolve) => setImmediate(resolve));
    if (interpretationCalls > 0) releaseFirstInterpretation();
  } else await firstInterpretationStarted;

  if (!mutateBeforeObserve && mutateRows) host.chat.setMessagesForChat(host.chat.getCurrentChatId(), mutateRows(host.chat.messages(), context));
  if (mutateChat) mutateChat(host.chat, context);
  if (sameRangeHash) {
    const currentRows = host.chat.getRecentMessages({ limit: 8, playerSafeOnly: false });
    const currentPlayer = currentRows.find((row) => row.hostMessageId === player.hostMessageId);
    const freshSource = prepareV1AcceptedPairSnapshot({
      campaignState: beforeState,
      currentPlayerMessage: currentPlayer,
      recentMessages: currentRows,
      requirePromptingPlayerAnchor: true,
      chatId: originalChatId,
    });
    assert.equal(capturedSource.ok, true);
    assert.equal(freshSource.ok, true);
    assert.equal(freshSource.snapshot.source.sourceRangeHash, capturedSource.snapshot.source.sourceRangeHash, `${name}: prose range hash is unchanged`);
    assert.equal(isDeepStrictEqual(freshSource.snapshot.source, capturedSource.snapshot.source), false, `${name}: normalized source metadata changed`);
  }
  if (mutateAdapter) mutateAdapter(host.chat, context);

  let reconciliation = null;
  if (expected === 'signaled') {
    reconciliation = app.handleHostMessageEdited({ hostMessageId: player.hostMessageId, chatId: host.chat.getCurrentChatId() });
  }
  if (!mutateBeforeObserve) releaseFirstInterpretation();
  const settlement = await pending;
  if (reconciliation) await reconciliation;
  const chatIdAtSettlement = host.chat.getCurrentChatId();
  host.chat.getRecentMessages = originalGetRecentMessages;
  host.chat.getCurrentBinding = originalGetCurrentBinding;
  if (chatIdAtSettlement !== originalChatId) host.chat.setCurrentChatId(originalChatId);

  const afterView = await app.getCurrentView({ tabId: 'mission' });
  const afterState = afterView.campaignState;
  const afterSave = await loadV1CampaignSave(host.storage, afterView.activeSaveId);
  const beforeReceipts = beforeState.storySettlement.acceptedPairReceipts || [];
  const afterReceipts = afterState.storySettlement.acceptedPairReceipts || [];

  assert.equal(isDeepStrictEqual(beforeState, beforeSave.state), true, `${name}: baseline memory equals storage`);
  assert.equal(isDeepStrictEqual(afterState, afterSave.state), true, `${name}: final memory equals storage`);
  assert.equal(interpretationCalls, expected === 'inactive' ? 0 : 1,
    `${name}: rejection does not automatically call the provider again`);

  if (expected === 'accepted') {
    assert.equal(settlement.mission.ok, true, `${name}: unchanged source commits`);
    assert.equal(afterState.stateCustody.revision, beforeState.stateCustody.revision + 1);
    assert.equal(afterState.timeLedger.elapsedSeconds, beforeState.timeLedger.elapsedSeconds + 10);
    assert.equal(afterReceipts.length, beforeReceipts.length + 1);
  } else if (expected === 'inactive') {
    assert.equal(settlement.handled, false, `${name}: inactive player source is not observed`);
    assert.equal(settlement.reason, 'player-source-inactive', `${name}: inactive source rejection is typed`);
    assert.deepEqual(afterState, beforeState, `${name}: in-memory authority remains unchanged`);
    assert.deepEqual(afterSave.state, beforeSave.state, `${name}: stored authority remains unchanged`);
  } else {
    assert.equal(settlement.mission.ok, false, `${name}: changed source rejects settlement`);
    assert.equal(settlement.mission.reasonCode, expected === 'signaled' ? 'provider-aborted' : 'accepted-pair-source-stale', `${name}: rejection is typed`);
    assert.equal(settlement.settlementBlocked, true, `${name}: narration remains blocked`);
    assert.deepEqual(afterState, beforeState, `${name}: in-memory authority remains unchanged`);
    assert.deepEqual(afterSave.state, beforeSave.state, `${name}: stored authority remains unchanged`);
  }

  if (recover) {
    const resumed = await app.getChatTurnOrchestrator().interceptGeneration();
    assert.equal(resumed.abortDefaultGeneration, false, `${name}: fresh gesture uses current source`);
    assert.equal(interpretationCalls, 2, `${name}: recovery analyzes the current pair once`);
    const recoveredView = await app.getCurrentView({ tabId: 'mission' });
    const recoveredSave = await loadV1CampaignSave(host.storage, recoveredView.activeSaveId);
    assert.equal(recoveredView.campaignState.stateCustody.revision, beforeState.stateCustody.revision + 1);
    assert.equal(recoveredView.campaignState.timeLedger.elapsedSeconds, beforeState.timeLedger.elapsedSeconds + 10);
    assert.equal(recoveredView.campaignState.storySettlement.acceptedPairReceipts.length, beforeReceipts.length + 1);
    assert.equal(isDeepStrictEqual(recoveredView.campaignState, recoveredSave.state), true);
  }

  if (nativeRecovery) {
    const repeatedObservation = await app.observeHostPlayerMessage({ message: player });
    assert.equal(repeatedObservation.abortDefaultGeneration, true,
      `${name}: a repeated observation in the stale gesture remains blocked`);
    assert.equal(interpretationCalls, 1, `${name}: repeated observation cannot start another analysis pass`);
    const sameGesture = await app.getChatTurnOrchestrator().interceptGeneration({
      type: 'normal',
      recoveryIntent: 'native',
    });
    assert.equal(sameGesture.abortDefaultGeneration, true, `${name}: the stale source gesture remains blocked`);
    assert.equal(interpretationCalls, 1, `${name}: the stale source gesture cannot start a second analysis pass`);

    app.handleHostGenerationStarted({ type: 'normal', automaticTrigger: true });
    const automaticGesture = await app.getChatTurnOrchestrator().interceptGeneration({
      type: 'normal',
      recoveryIntent: 'native',
    });
    assert.equal(automaticGesture.abortDefaultGeneration, true,
      `${name}: an automatic host gesture cannot claim stale-source recovery`);
    assert.equal(interpretationCalls, 1, `${name}: automatic host recovery cannot start model work`);

    await app.handleHostGenerationEnded();
    const missingGesture = await app.getChatTurnOrchestrator().interceptGeneration({
      type: 'normal',
      recoveryIntent: 'native',
    });
    assert.equal(missingGesture.abortDefaultGeneration, true,
      `${name}: missing gesture ownership cannot claim unresolved stale-source recovery`);
    assert.equal(interpretationCalls, 1, `${name}: missing gesture ownership cannot start model work`);

    host.chat.setMessagesForChat(originalChatId, host.chat.messages().map((row) => (
      row.hostMessageId === player.hostMessageId ? { ...row, is_system: false } : row
    )));
    app.handleHostGenerationStarted({ type: 'normal', automaticTrigger: false });
    const freshGesture = await app.getChatTurnOrchestrator().interceptGeneration({
      type: 'normal',
      recoveryIntent: 'native',
    });
    assert.equal(freshGesture.abortDefaultGeneration, false, `${name}: a fresh gesture reconciles the restored current source`);
    assert.equal(interpretationCalls, 2, `${name}: the fresh gesture analyzes the restored pair once`);
    const recoveredView = await app.getCurrentView({ tabId: 'mission' });
    const recoveredSave = await loadV1CampaignSave(host.storage, recoveredView.activeSaveId);
    assert.equal(recoveredView.campaignState.stateCustody.revision, beforeState.stateCustody.revision + 1);
    assert.equal(recoveredView.campaignState.storySettlement.acceptedPairReceipts.length, beforeReceipts.length + 1);
    assert.equal(isDeepStrictEqual(recoveredView.campaignState, recoveredSave.state), true);
  }
}

await runCase({ name: 'unchanged', expected: 'accepted' });
await runCase({
  name: 'trailing-player-retry',
  mutateRows: (rows) => [...rows, { hostMessageId: 'trailing-player-retry.continue', id: 'trailing-player-retry.continue', role: 'user', isUser: true, text: 'Continue.' }],
  expected: 'accepted',
});
await runCase({
  name: 'trailing-player-retries-outside-window',
  mutateRows: (rows) => [...rows, ...Array.from({ length: 10 }, (_, index) => ({
    hostMessageId: `trailing-player-retries-outside-window.continue.${index}`,
    id: `trailing-player-retries-outside-window.continue.${index}`,
    role: 'user',
    isUser: true,
    text: 'Continue.',
  }))],
  expected: 'accepted',
});
await runCase({ name: 'selected-swipe', mutateRows: (rows, context) => rows.map((row) => row.hostMessageId === context.assistantId ? { ...row, text: context.alternateAssistantText, swipe_id: 1 } : row) });
await runCase({ name: 'assistant-text', mutateRows: (rows, context) => rows.map((row) => row.hostMessageId === context.assistantId ? { ...row, text: context.alternateAssistantText, swipes: null, swipe_id: null } : row) });
await runCase({ name: 'player-text', mutateRows: (rows, context) => rows.map((row) => row.hostMessageId === context.playerId ? { ...row, text: 'I reject and replace that acknowledgement.' } : row) });
await runCase({ name: 'player-hidden', mutateRows: (rows, context) => rows.map((row) => row.hostMessageId === context.playerId ? { ...row, is_system: true } : row) });
await runCase({
  name: 'player-hidden-before-ingress',
  mutateRows: (rows, context) => rows.map((row) => row.hostMessageId === context.playerId ? { ...row, is_system: true } : row),
  mutateBeforeObserve: true,
  expected: 'inactive',
});
await runCase({
  name: 'player-deleted-before-ingress',
  mutateRows: (rows, context) => rows.map((row) => row.hostMessageId === context.playerId ? { ...row, deleted: true } : row),
  mutateBeforeObserve: true,
  expected: 'inactive',
});
await runCase({
  name: 'player-hidden-native-gesture',
  mutateRows: (rows, context) => rows.map((row) => row.hostMessageId === context.playerId ? { ...row, is_system: true } : row),
  nativeRecovery: true,
});
await runCase({
  name: 'row-position',
  mutateRows: (rows, context) => {
    const assistantIndex = rows.findIndex((row) => row.hostMessageId === context.assistantId);
    const playerIndex = rows.findIndex((row) => row.hostMessageId === context.playerId);
    const next = [...rows];
    [next[assistantIndex], next[playerIndex]] = [next[playerIndex], next[assistantIndex]];
    return next;
  },
});
await runCase({ name: 'chat-binding', mutateChat: (chat) => chat.setCurrentChatId('silent-unrelated-chat') });
await runCase({ name: 'signaled-player-edit', mutateRows: (rows, context) => rows.map((row) => row.hostMessageId === context.playerId ? { ...row, text: 'I explicitly correct that acknowledgement.' } : row), expected: 'signaled' });
await runCase({
  name: 'silent-append',
  mutateRows: (rows) => [...rows, { hostMessageId: 'silent-append.later-assistant', id: 'silent-append.later-assistant', role: 'assistant', isUser: false, text: 'A later source row silently arrives.' }],
});
await runCase({
  name: 'same-hash-prompting-metadata',
  mutateRows: (rows, context) => rows.map((row) => row.hostMessageId === context.assistantId ? { ...row, metadata: { promptingPlayerHostMessageId: context.alternatePromptId } } : row),
  recover: true,
  sameRangeHash: true,
});
await runCase({
  name: 'async-read',
  mutateAdapter: (chat) => {
    const rows = chat.getRecentMessages({ limit: 8, playerSafeOnly: false });
    chat.getRecentMessages = () => Promise.resolve(rows);
  },
});
await runCase({
  name: 'async-binding',
  mutateAdapter: (chat) => {
    chat.getCurrentBinding = () => Promise.reject(new Error('async binding must not escape as an unhandled rejection'));
  },
});
await runCase({ name: 'nonarray-read', mutateAdapter: (chat) => { chat.getRecentMessages = () => ({ rows: [] }); } });
await runCase({ name: 'missing-read', mutateAdapter: (chat) => { chat.getRecentMessages = undefined; } });

console.log('PASS accepted-pair source precondition at runtime commit');
