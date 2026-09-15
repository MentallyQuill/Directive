import assert from 'node:assert/strict';
import { createSillyTavernChatAdapter } from '../../src/hosts/sillytavern/chat-adapter.mjs';
import { createFakeChatAdapter } from '../../src/hosts/fake/fake-host.mjs';
import { assertDirectiveChatAdapter } from '../../src/hosts/host-contract.mjs';

let active = false, loads = 0;
const adapter = createSillyTavernChatAdapter({
  contextFactory: () => ({ streamingProcessor: null }),
  importScript: async () => { loads++; return { isGenerating: () => active }; },
});
assert.equal(typeof adapter.getGenerationActivity, 'function', 'synchronous native generation activity seam');
assert.deepEqual(adapter.getGenerationActivity(), { status: 'unsupported', replyStatus: 'unsupported' });
await Promise.all([adapter.prepareGenerationActivity(), adapter.prepareGenerationActivity()]);
assert.equal(loads, 1);
assert.deepEqual(adapter.getGenerationActivity(), { status: 'idle', replyStatus: 'unsupported' });
active = true;
assert.deepEqual(adapter.getGenerationActivity(), { status: 'active', replyStatus: 'unsupported' }, 'non-streaming native generation is active');
active = false;
assert.equal(adapter.getGenerationActivity().status, 'idle');
assert(Object.isFrozen(adapter.getGenerationActivity()));
await adapter.prepareGenerationActivity(); assert.equal(loads, 1);
for (const isGenerating of [undefined, () => undefined, () => 0, () => 'false', async () => false,
  () => Promise.reject(Error('failed async read')), () => { throw Error('native unavailable'); }]) {
  const chat = createSillyTavernChatAdapter({ scriptModule: { isGenerating } });
  await chat.prepareGenerationActivity();
  assert.deepEqual(chat.getGenerationActivity(), { status: 'unsupported', replyStatus: 'unsupported' });
}
let fail = true;
const retry = createSillyTavernChatAdapter({ importScript: async () => {
  if (fail) throw Error('module not ready'); return { isGenerating: () => false };
} });
assert.equal((await retry.prepareGenerationActivity()).status, 'unsupported');
fail = false;
assert.equal((await retry.prepareGenerationActivity()).status, 'idle');
const fake = createFakeChatAdapter();
assert.deepEqual(fake.getGenerationActivity(), { status: 'idle', replyStatus: 'idle' });
assert.deepEqual(await fake.prepareGenerationActivity(), { status: 'idle', replyStatus: 'idle' });
const controlled = createFakeChatAdapter({ isGenerating: () => active });
active = true; assert.equal(controlled.getGenerationActivity().status, 'active');
active = false; assert.equal(controlled.getGenerationActivity().status, 'idle');
assert.equal(createFakeChatAdapter({ isGenerating: async () => false }).getGenerationActivity().status, 'unsupported');
assert.throws(() => assertDirectiveChatAdapter({ getGenerationActivity: false }));
assert.throws(() => assertDirectiveChatAdapter({ prepareGenerationActivity: false }));
await new Promise(resolve => setTimeout(resolve, 0));
console.log('PASS host generation activity: native sync state, cached preparation, unsupported async reads, fake controls');

const nativeModule = { isGenerating: () => true, is_send_press: true };
const group = createSillyTavernChatAdapter({ scriptModule: nativeModule });
await group.prepareGenerationActivity();
assert.deepEqual(group.getGenerationActivity(), { status: 'active', replyStatus: 'active' });
nativeModule.is_send_press = false;
assert.deepEqual(group.getGenerationActivity(), { status: 'active', replyStatus: 'idle' }, 'live member gap independent of group flag');
for (const value of [undefined, null, 0, 'false', Promise.resolve(false)]) {
  nativeModule.is_send_press = value;
  assert.equal(group.getGenerationActivity().replyStatus, 'unsupported');
}
const groupFake = createFakeChatAdapter({ isGenerating: () => true, isReplyGenerating: () => false });
assert.deepEqual(groupFake.getGenerationActivity(), { status: 'active', replyStatus: 'idle' });
assert.equal(createFakeChatAdapter({ isReplyGenerating: async () => false }).getGenerationActivity().replyStatus, 'unsupported');
console.log('PASS independent native reply activity');

Object.defineProperty(nativeModule, 'is_send_press', { configurable: true, get() { throw Error('reply getter failed'); } });
assert.deepEqual(group.getGenerationActivity(), { status: 'active', replyStatus: 'unsupported' });
Object.defineProperty(nativeModule, 'is_send_press', { configurable: true, get() { return Promise.reject(Error('async reply getter failed')); } });
assert.equal(group.getGenerationActivity().replyStatus, 'unsupported');
await new Promise(resolve => setTimeout(resolve, 0));
