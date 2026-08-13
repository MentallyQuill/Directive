import assert from 'node:assert/strict';

import {
  prepareV1AcceptedPairSnapshot
} from '../../src/runtime/v1-accepted-pair-source.mjs';

const campaignState = {
  campaign: { id: 'campaign.ashes', runtimeArchitecture: { kind: 'directive.runtimeArchitecture.v1' } },
  activeCampaignPackage: { packageId: 'directive.ashes-of-peace', packageVersion: '1.0.0' },
  campaignChatBinding: { saveId: 'save.ashes', chatId: 'chat.ashes' },
  mission: { activeMissionId: 'prelude-a-ship-underway' }
};

const assistant = {
  id: 'assistant.1',
  role: 'assistant',
  text: 'Selected response',
  raw: {
    swipe_id: 1,
    swipes: ['Rejected response', 'Selected response']
  }
};
const player = {
  id: 'player.2',
  role: 'user',
  text: 'I accept that result and continue.',
  chatId: 'chat.ashes',
  saveId: 'save.ashes'
};

const prepared = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: player,
  recentMessages: [assistant, player],
  chatId: 'chat.ashes',
  ingressId: 'ingress.2'
});
assert.equal(prepared.ok, true);
assert.equal(prepared.snapshot.kind, 'directive.acceptedPairSnapshot.v1');
assert.equal(prepared.snapshot.envelope.saveId, 'save.ashes');
assert.equal(prepared.snapshot.envelope.chatId, 'chat.ashes');
assert.equal(prepared.snapshot.source.previousAssistant.text, 'Selected response');
assert.equal(prepared.snapshot.source.previousAssistant.selectedVariant.selectedSwipeIndex, 1);
assert.equal(prepared.snapshot.source.previousAssistant.sourceIntegrity, 'clean');
assert.equal(prepared.snapshot.source.currentPlayer.text, player.text);
assert.equal(typeof prepared.snapshot.source.sourceRangeHash, 'string');
assert.equal(Object.hasOwn(prepared.snapshot, 'safety'), false);
assert.equal(Object.hasOwn(prepared.snapshot, 'threads'), false);
assert.equal(Object.hasOwn(prepared.snapshot, 'quests'), false);

const directiveOwned = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: player,
  previousAssistantMessage: {
    ...assistant,
    raw: {
      ...assistant.raw,
      extra: { directive: { responseId: 'response.1' } }
    }
  },
  chatId: 'chat.ashes'
});
assert.equal(directiveOwned.ok, true, 'Directive-owned narration is still accepted story source.');
assert.equal(directiveOwned.snapshot.source.previousAssistant.selectedVariant.directiveOwned, true);

const noAcceptingPlayer = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: { ...player, text: '' },
  recentMessages: [assistant],
  chatId: 'chat.ashes'
});
assert.equal(noAcceptingPlayer.ok, false);
assert.equal(noAcceptingPlayer.reason, 'missing-state-or-player-message');

const wrongBranch = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: { ...player, saveId: 'save.other' },
  previousAssistantMessage: assistant,
  chatId: 'chat.ashes'
});
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.reason, 'wrong-save');

const staleSwipe = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: player,
  previousAssistantMessage: {
    ...assistant,
    raw: { swipe_id: 9, swipes: ['Only valid response'] }
  },
  chatId: 'chat.ashes'
});
assert.equal(staleSwipe.ok, false);
assert.equal(staleSwipe.reason, 'previous-assistant-selected-swipe-invalid');

const systemBetween = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: player,
  recentMessages: [assistant, { id: 'system.1', role: 'system', text: 'internal' }, player],
  chatId: 'chat.ashes'
});
assert.equal(systemBetween.ok, true);
assert.equal(systemBetween.snapshot.source.previousAssistant.hostMessageId, 'assistant.1');

const generationAnchored = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: { ...player, id: 'player.3' },
  recentMessages: [
    { id: 'player.1', role: 'user', text: 'Give me an opening.' },
    { id: 'assistant.2', role: 'assistant', text: 'A credible opening appears.' },
    { ...player, id: 'player.3' }
  ],
  chatId: 'chat.ashes'
});
assert.equal(generationAnchored.ok, true);
assert.equal(generationAnchored.snapshot.source.previousAssistant.promptingPlayerHostMessageId, 'player.1');

const footerAnchored = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: { ...player, id: 'player.footer' },
  previousAssistantMessage: {
    id: 'assistant.footer',
    role: 'assistant',
    text: 'The turbolift doors close.\n\n*Stardate 53068.4 | 08:30:47 hours*'
  },
  chatId: 'chat.ashes'
});
assert.equal(footerAnchored.ok, true);
assert.equal(footerAnchored.snapshot.source.previousAssistant.text, 'The turbolift doors close.');
assert.deepEqual(footerAnchored.snapshot.source.previousAssistant.timeFooter, {
  kind: 'directive.shipTimeFooter.v1',
  text: '*Stardate 53068.4 | 08:30:47 hours*',
  stardate: 53068.4,
  secondOfDay: 30647,
  minuteOfDay: 510
});
const footerEdited = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: { ...player, id: 'player.footer' },
  previousAssistantMessage: {
    id: 'assistant.footer',
    role: 'assistant',
    text: 'The turbolift doors close.\n\n*Stardate 53068.4 | 08:30:48 hours*'
  },
  chatId: 'chat.ashes'
});
assert.notEqual(
  footerAnchored.snapshot.source.sourceRangeHash,
  footerEdited.snapshot.source.sourceRangeHash,
  'A footer-only edit must invalidate accepted-pair identity.'
);

const longAssistantPrefix = 'A'.repeat(7100);
const longAssistantOne = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: { ...player, id: 'player.long-assistant' },
  previousAssistantMessage: { id: 'assistant.long', role: 'assistant', text: `${longAssistantPrefix} first ending` },
  chatId: 'chat.ashes'
});
const longAssistantTwo = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: { ...player, id: 'player.long-assistant' },
  previousAssistantMessage: { id: 'assistant.long', role: 'assistant', text: `${longAssistantPrefix} second ending` },
  chatId: 'chat.ashes'
});
assert.equal(longAssistantOne.snapshot.source.previousAssistant.text.length, 7000);
assert.notEqual(longAssistantOne.snapshot.source.sourceRangeHash, longAssistantTwo.snapshot.source.sourceRangeHash);

const longPlayerPrefix = 'P'.repeat(2600);
const longPlayerOne = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: { ...player, id: 'player.long', text: `${longPlayerPrefix} first ending` },
  previousAssistantMessage: assistant,
  chatId: 'chat.ashes'
});
const longPlayerTwo = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: { ...player, id: 'player.long', text: `${longPlayerPrefix} second ending` },
  previousAssistantMessage: assistant,
  chatId: 'chat.ashes'
});
assert.equal(longPlayerOne.snapshot.source.currentPlayer.text.length, 2500);
assert.notEqual(longPlayerOne.snapshot.source.sourceRangeHash, longPlayerTwo.snapshot.source.sourceRangeHash);

const lateFooter = prepareV1AcceptedPairSnapshot({
  campaignState,
  currentPlayerMessage: { ...player, id: 'player.late-footer' },
  previousAssistantMessage: {
    id: 'assistant.late-footer',
    role: 'assistant',
    text: `${'N'.repeat(7100)}\n\n*Stardate 53068.4 | 08:31:22 hours*`
  },
  chatId: 'chat.ashes'
});
assert.equal(lateFooter.ok, true);
assert.equal(lateFooter.snapshot.source.previousAssistant.timeFooter.secondOfDay, 30682);

console.log('V1 accepted-pair source tests passed.');
