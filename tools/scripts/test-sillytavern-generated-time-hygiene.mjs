import assert from 'node:assert/strict';

import { createSillyTavernChatAdapter } from '../../src/hosts/sillytavern/chat-adapter.mjs';

let saveCount = 0;
const refreshes = [];
const selectedText = 'Whitaker closes the packet.\n\n*Stardate 53068.4 | 0846:15 hours*';
const untouchedSwipe = 'Whitaker waits beside the viewport.';
const swipeInfo = [
  { send_date: '2026-08-16T00:00:00.000Z', extra: { provider: 'first' } },
  { send_date: '2026-08-16T00:00:02.000Z', extra: { provider: 'selected', reasoning: 'preserve' } }
];
const extra = { api: 'claude', runtimeMetadata: { responseId: 'response.before-strip' } };
const context = {
  chat: [
    { is_user: true, is_system: false, mes: 'Continue.' },
    {
      name: 'Directive',
      is_user: false,
      is_system: false,
      mes: selectedText,
      swipes: [untouchedSwipe, selectedText],
      swipe_id: 1,
      swipe_info: structuredClone(swipeInfo),
      extra: structuredClone(extra)
    }
  ],
  async updateMessageBlock(index, message) {
    refreshes.push({ index, message: structuredClone(message) });
  },
  async saveChat() {
    saveCount += 1;
  }
};
const adapter = createSillyTavernChatAdapter({ contextFactory: () => context });

const result = await adapter.stripAssistantTimeFooter({ hostMessageId: '1' });
assert.equal(result.ok, true);
assert.equal(result.stripped, true);
assert.equal(result.hostMessageId, '1');
assert.equal(result.swipeIndex, 1);
assert.equal(result.message.text, 'Whitaker closes the packet.');
assert.equal(context.chat[1].mes, 'Whitaker closes the packet.');
assert.deepEqual(context.chat[1].swipes, [untouchedSwipe, 'Whitaker closes the packet.']);
assert.deepEqual(context.chat[1].swipe_info, swipeInfo);
assert.deepEqual(context.chat[1].extra, extra);
assert.equal(refreshes.length, 1);
assert.equal(refreshes[0].index, 1);
assert.equal(saveCount, 1);

const unchanged = await adapter.stripAssistantTimeFooter({ hostMessageId: '1' });
assert.equal(unchanged.stripped, false);
assert.equal(saveCount, 1, 'An already-clean message must not be saved again.');
assert.equal(refreshes.length, 1, 'An already-clean message must not be rerendered.');

const player = await adapter.stripAssistantTimeFooter({ hostMessageId: '0' });
assert.deepEqual(player, { ok: false, stripped: false, reason: 'assistant-message-required' });
assert.equal(context.chat[0].mes, 'Continue.');

const failingText = 'The ready room doors close.\n\n*Stardate 53068.4 | 08:45:00 hours*';
let failingRefreshCount = 0;
const failingContext = {
  chat: [{
    is_user: false,
    is_system: false,
    mes: failingText,
    swipes: [failingText],
    swipe_id: 0,
    swipe_info: [{ extra: { preserve: true } }],
    extra: { preserve: true }
  }],
  async updateMessageBlock() {
    failingRefreshCount += 1;
  },
  async saveChat() {
    throw new Error('disk unavailable');
  }
};
const failingAdapter = createSillyTavernChatAdapter({ contextFactory: () => failingContext });
await assert.rejects(
  failingAdapter.stripAssistantTimeFooter({ hostMessageId: '0' }),
  /disk unavailable/
);
assert.equal(failingContext.chat[0].mes, failingText, 'a failed save must restore the visible message source');
assert.deepEqual(failingContext.chat[0].swipes, [failingText], 'a failed save must restore the selected swipe');
assert.deepEqual(failingContext.chat[0].swipe_info, [{ extra: { preserve: true } }]);
assert.deepEqual(failingContext.chat[0].extra, { preserve: true });
assert.equal(failingRefreshCount, 0, 'a failed save must not render an unpersisted sanitization');

console.log('SillyTavern generated-time hygiene tests passed.');
