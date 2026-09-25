import assert from 'node:assert/strict';
import { createFakeDirectiveHost, createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

async function createHarness({ beforeDirection = () => {}, failDirection = () => false } = {}) {
  let sequence = 0;
  const defaults = createFakeGenerationClient();
  const generation = createFakeGenerationClient({ responses: {
    storyDirectionAnalyst: async ({ request }) => {
      await beforeDirection(host);
      return failDirection() ? { text: '{}' } : defaults.generate('storyDirectionAnalyst', request);
    },
    acceptedPairMissionEvidence: async () => ({ text: JSON.stringify({
      kind: 'directive.missionEvidenceInterpretation.v1', assistantAcceptance: 'accepted',
      claims: [], abstained: true,
      time: { decision: 'unchanged', basis: 'noPassage', elapsedSeconds: 0, reason: 'same-second', confidence: 0.9 },
    }) }),
  } });
  const host = createFakeDirectiveHost({ chatNative: true, generation });
  const app = createDirectiveRuntimeApp({
    host, packageLoader: async () => loadAshesRuntimeAssets(),
    idFactory: prefix => `${prefix}.${++sequence}`,
    getCharacterKnowledgeSettings: () => ({ mode: 'legacy' }),
  });
  await app.initialize();
  await app.startCreatorDraft();
  await app.saveCreatorDraft({ patch: { activeStep: 'review', input: {
    identity: { name: 'Replacement Tester', pronounsOrAddress: 'they/them', speciesId: 'human', ageBandId: 'mid-career', appearance: 'Attentive.' },
    service: { careerBackgroundId: 'tactical-security', formativeExperienceId: 'dominion-war-fleet-service', assignmentReasonId: 'experienced-outsider-transfer' },
    personality: { traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' }, flawId: 'impatient' },
    dossier: { briefBiography: 'A command officer committed to reconstruction.', publicReputation: 'An attentive command officer.' },
  } } });
  await app.acceptCreatorDraftAndStartCampaign();
  const promptingPlayer = host.chat.pushPlayerMessage({ text: 'I ask about the transfer schedule.' });
  host.chat.pushAssistantMessage({ text: 'The Ravenna transfer is scheduled for fourteen hundred.', metadata: { promptingPlayerHostMessageId: promptingPlayer.hostMessageId } });
  const player = host.chat.pushPlayerMessage({ text: 'What flexibility do we have?' });
  const state = async () => (await app.getCurrentView({ tabId: 'mission' })).campaignState;
  return { app, host, player, state };
}

// Native Continue appends to the actual tail, not the latest assistant anywhere
// in history. A player tail must be refused before settlement or model work.
for (const prior of ['fresh', 'settled', 'failed', 'stopped']) {
  let fail = prior === 'failed';
  let stop = prior === 'stopped';
  const { app, host, state } = await createHarness({ failDirection: () => fail,
    beforeDirection: async () => {
      if (stop) { stop = false; await app.handleHostGenerationStopped(); }
    },
  });
  if (prior !== 'fresh') {
    const preparation = await app.getChatTurnOrchestrator().interceptGeneration({ type: 'normal' });
    assert.equal(preparation.abortDefaultGeneration, prior !== 'settled', prior);
    if (prior === 'settled') await app.handleHostGenerationEnded();
    fail = false;
  }
  const before = await state();
  const transcript = host.chat.messages();
  const calls = host.generation.calls().length;
  const result = await app.getChatTurnOrchestrator().interceptGeneration({ type: 'continue' });
  assert.equal(result.abortDefaultGeneration, true, 'Continue must not append narrator prose to a player row');
  assert.equal(result.settlementError?.reasonCode, 'continue-requires-assistant');
  assert.equal(host.generation.calls().length, calls, prior + ': no model calls');
  assert.deepEqual(await state(), before);
  assert.deepEqual(host.chat.messages(), transcript);
  assert.equal((await app.getChatTurnOrchestrator().interceptGeneration({ type: 'normal' })).abortDefaultGeneration, false);
  assert.equal((await state()).storySettlement.acceptedPairReceipts.length, 1);
  await app.handleHostGenerationEnded();
}
console.log('PASS player-tail Continue is refused without settlement and normal Generate remains available');

// Native replacement generations retain their target row while analysis runs.
for (const type of ['swipe', 'continue', 'regenerate']) {
  for (const text of ['', 'An existing assistant draft.']) {
    for (const alreadySettled of [false, true]) {
      const { app, host, player, state } = await createHarness();
      if (alreadySettled) {
        assert.equal((await app.getChatTurnOrchestrator().interceptGeneration({ type: 'normal' })).abortDefaultGeneration, false);
        await app.handleHostGenerationEnded();
      }
      host.chat.pushAssistantMessage({ text, metadata: { promptingPlayerHostMessageId: player.hostMessageId } });
      const before = await state();
      const result = await app.getChatTurnOrchestrator().interceptGeneration({ type });
      assert.equal(result.abortDefaultGeneration, false, JSON.stringify(result));
      const after = await state();
      assert.equal(after.stateCustody.revision, before.stateCustody.revision + 1);
      assert.equal(after.storySettlement.acceptedPairReceipts.length, 1);
      assert.equal(after.storySettlement.directorReceipts.length, before.storySettlement.directorReceipts.length + 1);
      await app.handleHostGenerationEnded();
    }
  }
}
console.log('PASS legacy swipe, continue and regenerate preserve empty/full replacements and settle each source only once');

// Retry must retain the replacement generation type after a failed model response.
{
  let failed = true;
  const { app, host, player, state } = await createHarness({ failDirection: () => failed });
  host.chat.pushAssistantMessage({ text: '', metadata: { promptingPlayerHostMessageId: player.hostMessageId } });
  const before = await state();
  assert.equal((await app.getChatTurnOrchestrator().interceptGeneration({ type: 'swipe' })).abortDefaultGeneration, true);
  assert.deepEqual(await state(), before);
  failed = false;
  const retried = await app.retryPendingAcceptedPairSettlement();
  assert.equal(retried.ok, true, JSON.stringify(retried));
  assert.equal(retried.settlementBlocked, false);
  assert.equal((await state()).stateCustody.revision, before.stateCustody.revision + 1);
  assert.equal((await state()).storySettlement.acceptedPairReceipts.length, 1);
  await app.handleHostGenerationEnded();
}
console.log('PASS manual Retry preserves legacy swipe ownership without duplicate settlement');

// The replacement allowance must not authorize a changed source or a later turn.
for (const mutation of ['player-edit', 'assistant-edit', 'later-player']) {
  let changed = false;
  const { app, host, player, state } = await createHarness({ beforeDirection: activeHost => {
    if (changed) return;
    changed = true;
    const rows = activeHost.chat.messages();
    if (mutation === 'later-player') {
      activeHost.chat.pushPlayerMessage({ text: 'A later independent player turn.' });
    } else {
      const row = mutation === 'player-edit' ? rows.at(-2) : rows.at(-1);
      row.text = row.mes = 'Edited while analysis was running.';
      if (row.swipes) row.swipes[row.swipe_id ?? 0] = row.text;
      activeHost.chat.setMessagesForChat(activeHost.chat.getCurrentChatId(), rows);
    }
  } });
  host.chat.pushAssistantMessage({ text: '', metadata: { promptingPlayerHostMessageId: player.hostMessageId } });
  const before = await state();
  const result = await app.getChatTurnOrchestrator().interceptGeneration({ type: 'swipe' });
  assert.equal(result.abortDefaultGeneration, true, mutation);
  assert.equal(result.settlementError.reasonCode, 'accepted-pair-source-stale', mutation);
  assert.deepEqual(await state(), before, mutation + ' must not commit');
}
console.log('PASS player edits, assistant edits and later player turns remain blocked without a commit');


// A normal send must not gain permission to overwrite an existing reply.
{
  const { app, host, player, state } = await createHarness();
  host.chat.pushAssistantMessage({ text: 'An existing assistant draft.', metadata: { promptingPlayerHostMessageId: player.hostMessageId } });
  const before = await state();
  const result = await app.getChatTurnOrchestrator().interceptGeneration({ type: 'normal' });
  assert.equal(result.abortDefaultGeneration, true, JSON.stringify(result));
  assert.equal(result.settlementError.reasonCode, 'accepted-pair-source-stale');
  assert.deepEqual(await state(), before);
}
console.log('PASS normal generation retains its stricter current-player precondition');
