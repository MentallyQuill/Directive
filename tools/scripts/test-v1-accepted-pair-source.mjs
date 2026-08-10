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
assert.equal(JSON.stringify(prepared.snapshot).includes('sceneHandshake'), false);

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

console.log('V1 accepted-pair source tests passed.');
