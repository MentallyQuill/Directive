import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { createGenerationCancellation } from '../../src/runtime/generation-cancellation.mjs';
import { createSillyTavernGenerationClient, isDirectiveOwnedHostGeneration, isDirectiveOwnedGeneration } from '../../src/hosts/sillytavern/generation-client.mjs';
installFakeDom();
const bridge = await import('../../src/hosts/sillytavern/runtime-bridge.mjs');
const { __settlementRetryDialogTestHooks: dialogs } = await import('../../src/ui/settlement-retry-dialog.js');
const { handleGenerationEnded, handleGenerationStopped } = await import('../../src/hosts/sillytavern/shell-events.js');
const blocked = { handled: true, abortDefaultGeneration: true };
const prepared = { handled: true, abortDefaultGeneration: false };
const click = dialog => dialog.retry.listeners.get('click')[0]({});
function fixture() {
  let chatId = 'chat-A';
  let binding = { campaignId: 'campaign-A', saveId: 'save-A', chatId };
  let preparations = 0;
  const starts = [];
  let prepare = async () => ++preparations === 1 ? blocked : prepared;
  bridge.setSillyTavernDirectiveRuntimeBridge({
    app: { isCurrentChatBound: () => true, getCurrentChatBinding: () => structuredClone(binding) },
    turnOrchestrator: { interceptGeneration: () => prepare() },
    directiveHost: { chat: {
      getCurrentChatId: () => chatId,
      async continueHostGeneration() { starts.push(chatId); return { ok: true }; },
    } },
  });
  return { starts, get preparations() { return preparations; },
    changeChat() { chatId = 'chat-B'; binding = { campaignId: 'campaign-B', saveId: 'save-B', chatId }; },
    changeSave() { binding.saveId = 'save-new'; },
    setPrepare(fn) { prepare = fn; },
    open: () => bridge.directiveGenerationInterceptor([], 100, () => {}, 'normal'),
  };
}

test('Retry from chat A cannot prepare or generate after switching to bound chat B', async () => {
  const f = fixture();
  try {
    await f.open();
    const old = dialogs.active();
    f.changeChat();
    bridge.resetDirectiveTurnProgress();
    await click(old);
    assert.deepEqual(f.starts, []);
    assert.equal(f.preparations, 1);
    assert.equal(old.overlay.isConnected, false);
    f.setPrepare(async () => blocked);
    await f.open();
    f.setPrepare(async () => prepared);
    await click(dialogs.active());
    assert.deepEqual(f.starts, ['chat-B'], 'a fresh recovery belongs to the new chat');
  } finally { bridge.clearSillyTavernDirectiveRuntimeBridge(); }
});

test('Retry rejects a different saved timeline even when host chat id is unchanged', async () => {
  const f = fixture();
  try {
    await f.open();
    const old = dialogs.active();
    f.changeSave();
    await click(old);
    assert.deepEqual(f.starts, []);
    assert.equal(f.preparations, 1);
    assert.equal(old.overlay.isConnected, false);
  } finally { bridge.clearSillyTavernDirectiveRuntimeBridge(); }
});

for (const change of ['chat', 'save', 'stop']) {
  test(`Retry cannot hand off after ${change} changes during awaited preparation`, async () => {
    const f = fixture();
    try {
      await f.open();
      let finish;
      f.setPrepare(() => new Promise(resolve => { finish = resolve; }));
      const old = dialogs.active();
      const pending = click(old);
      if (change === 'chat') { f.changeChat(); bridge.resetDirectiveTurnProgress(); }
      else if (change === 'save') f.changeSave();
      else await handleGenerationStopped();
      finish(prepared);
      await pending;
      assert.deepEqual(f.starts, []);
      assert.equal(old.overlay.isConnected, false);
    } finally { bridge.clearSillyTavernDirectiveRuntimeBridge(); }
  });
}

test('a stale initial preparation cannot open recovery in the replacement chat', async () => {
  const f = fixture();
  try {
    let finish;
    f.setPrepare(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.open();
    f.changeChat();
    bridge.resetDirectiveTurnProgress();
    finish(blocked);
    await pending;
    assert.equal(dialogs.active() === null, true);
  } finally { bridge.clearSillyTavernDirectiveRuntimeBridge(); }
});

for (const method of ['generateNarration', 'generate']) {
  test(`Stop releases ${method} ownership before an abort-ignoring native transport settles`, async () => {
    const requests = [];
    const session = createGenerationCancellation(createSillyTavernGenerationClient({
      contextFactory: () => ({ generateRaw: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) }),
    }));
    let endedEvents = 0;
    bridge.setSillyTavernDirectiveRuntimeBridge({ app: {
      handleHostGenerationStopped: () => session.stop(),
      handleHostGenerationEnded: () => { endedEvents++; },
    } });
    const generate = () => method === 'generateNarration'
      ? session.generation.generateNarration({ prompt: 'opening' })
      : session.generation.generate('utilityJson', { prompt: 'settlement' });
    const old = generate().catch(error => error.code);
    try {
      await handleGenerationStopped();
      assert.equal(await old, 'DIRECTIVE_GENERATION_ABORTED');
      assert.equal(isDirectiveOwnedHostGeneration(), false);
      assert.equal(isDirectiveOwnedGeneration(), false);
      session.resume();
      assert.equal(handleGenerationEnded({}).handled, true);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(endedEvents, 1, 'a fresh host end event reaches the runtime after Stop');
      const fresh = generate();
      assert.equal(isDirectiveOwnedHostGeneration(), true);
      requests[0].resolve('late old result');
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(isDirectiveOwnedHostGeneration(), true, 'late old cleanup cannot release the new operation');
      assert.equal(isDirectiveOwnedGeneration(), true);
      requests[1].resolve('fresh result');
      assert.equal((await fresh).text, 'fresh result');
      assert.equal(isDirectiveOwnedHostGeneration(), false);
      assert.equal(isDirectiveOwnedGeneration(), false);
    } finally {
      session.stop();
      bridge.clearSillyTavernDirectiveRuntimeBridge();
      requests.forEach(request => request.resolve('cleanup'));
      await new Promise(resolve => setImmediate(resolve));
    }
  });
}

for (const importChange of ['save', 'new generation']) {
  test(`Retry rejects ${importChange} changes during the native module import`, async () => {
  const { createSillyTavernChatAdapter } = await import('../../src/hosts/sillytavern/chat-adapter.mjs');
  let binding = { campaignId: 'campaign-A', saveId: 'save-A', chatId: 'chat-A' };
  let starts = 0;
  let preparations = 0;
  let releaseImport;
  let markImportStarted;
  const imported = new Promise(resolve => { markImportStarted = resolve; });
  const chat = createSillyTavernChatAdapter({
    contextFactory: () => ({ chat: [], chatId: 'chat-A' }),
    importScript: () => { markImportStarted(); return new Promise(resolve => { releaseImport = resolve; }); },
  });
  bridge.setSillyTavernDirectiveRuntimeBridge({
    app: { isCurrentChatBound: () => true, getCurrentChatBinding: () => structuredClone(binding) },
    turnOrchestrator: { async interceptGeneration() { return ++preparations === 1 ? blocked : prepared; } },
    directiveHost: { chat },
  });
  try {
    await bridge.directiveGenerationInterceptor([], 100, () => {}, 'normal');
    const old = dialogs.active();
    const retry = click(old);
    await imported;
    if (importChange === 'save') binding.saveId = 'save-new';
    else await bridge.directiveGenerationInterceptor([], 100, () => {}, 'normal');
    releaseImport({ isGenerating: () => false, Generate() { starts++; } });
    await retry;
    assert.equal(starts, 0);
    assert.equal(old.overlay.isConnected, false);
  } finally { bridge.clearSillyTavernDirectiveRuntimeBridge(); }
});
}

test('canceling one native request preserves concurrent ownership through late rejection', async () => {
  const requests = [];
  const client = createSillyTavernGenerationClient({ contextFactory: () => ({
    generateRaw: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  }) });
  const canceled = new AbortController();
  const first = client.generate('utilityJson', {prompt: 'first'}, {signal: canceled.signal}).catch(error => error.message);
  const second = client.generate('utilityJson', {prompt: 'second'});
  canceled.abort();
  assert.equal(isDirectiveOwnedHostGeneration(), true);
  requests[0].reject(new Error('late cleanup'));
  await first;
  assert.equal(isDirectiveOwnedHostGeneration(), true);
  requests[1].resolve('current request');
  await second;
  assert.equal(isDirectiveOwnedHostGeneration(), false);
  assert.equal(isDirectiveOwnedGeneration(), false);
  const failing = client.generate('utilityJson', {prompt: 'provider error'});
  requests[2].reject(new Error('provider failure'));
  await assert.rejects(failing, /provider failure/);
  assert.equal(isDirectiveOwnedHostGeneration(), false);
  assert.equal(isDirectiveOwnedGeneration(), false);
});

test('a late Retry from a replaced runtime cannot close its new recovery dialog', async () => {
  const original = fixture();
  try {
    await original.open();
    let finish;
    original.setPrepare(() => new Promise(resolve => { finish = resolve; }));
    const old = dialogs.active();
    const pending = click(old);
    const replacement = fixture();
    await replacement.open();
    const current = dialogs.active();
    finish(prepared);
    await pending;
    assert.deepEqual(original.starts, []);
    assert.equal(current.overlay.isConnected, true);
    assert.equal(dialogs.active() === current, true);
    await click(current);
    assert.deepEqual(replacement.starts, ['chat-A']);
  } finally { bridge.clearSillyTavernDirectiveRuntimeBridge(); }
});

for (const newTurnBlocked of [false, true]) {
  test(`late failure from an older same-chat Retry cannot ${newTurnBlocked ? 'replace newer recovery' : 'reopen recovery after newer generation'}`, async () => {
    let allow = false;
    let oldFailure;
    bridge.setSillyTavernDirectiveRuntimeBridge({
      app: { isCurrentChatBound: () => true, getCurrentChatBinding: () => ({campaignId:'c',saveId:'s',chatId:'a'}) },
      turnOrchestrator: { async interceptGeneration() { return allow ? prepared : blocked; } },
      directiveHost: { chat: {
        getCurrentChatId: () => 'a',
        async continueHostGeneration({onGenerationFailed}) { oldFailure = onGenerationFailed; return {ok:true}; },
      } },
    });
    try {
      await bridge.directiveGenerationInterceptor([], 100, () => {}, 'normal');
      allow = true;
      await click(dialogs.active());
      assert.equal(dialogs.active() === null, true);
      allow = !newTurnBlocked;
      await bridge.directiveGenerationInterceptor([], 100, () => {}, 'normal');
      const current = dialogs.active();
      oldFailure();
      assert.equal(dialogs.active() === current, true, 'older native failure has lost generation ownership');
    } finally { bridge.clearSillyTavernDirectiveRuntimeBridge(); }
  });
}

test('a Retry keeps failure ownership when its own native interceptor runs after the dialog closes', async () => {
  const { createSillyTavernChatAdapter } = await import('../../src/hosts/sillytavern/chat-adapter.mjs');
  let allow = false;
  let enterNative;
  let rejectNative;
  let reentered;
  const entryGate = new Promise(resolve => { enterNative = resolve; });
  const nativeEntered = new Promise(resolve => { reentered = resolve; });
  const chat = createSillyTavernChatAdapter({
    contextFactory: () => ({chat:[],chatId:'owned-retry'}),
    scriptModule: { isGenerating: () => false, async Generate() {
      await entryGate;
      await bridge.directiveGenerationInterceptor([], 100, () => {}, 'normal');
      reentered();
      return new Promise((_, reject) => { rejectNative = reject; });
    } },
  });
  bridge.setSillyTavernDirectiveRuntimeBridge({
    app: {isCurrentChatBound:()=>true},
    turnOrchestrator:{async interceptGeneration(){return allow ? prepared : blocked;}},
    directiveHost:{chat},
  });
  try {
    await bridge.directiveGenerationInterceptor([], 100, () => {}, 'normal');
    allow = true;
    await click(dialogs.active());
    assert.equal(dialogs.active() === null, true);
    enterNative();
    await nativeEntered;
    rejectNative(new Error('owned narration failed'));
    for(let i=0;i<30 && !dialogs.active();i++) await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(Boolean(dialogs.active()), true, 'owned native failure still offers Retry after asynchronous reentry');
  } finally { bridge.clearSillyTavernDirectiveRuntimeBridge(); }
});

test('a superseded Retry attempt cannot replace recovery for the latest attempt', async () => {
  let allow = false;
  const failures = [];
  bridge.setSillyTavernDirectiveRuntimeBridge({
    app:{isCurrentChatBound:()=>true},
    turnOrchestrator:{async interceptGeneration(){return allow ? prepared : blocked;}},
    directiveHost:{chat:{async continueHostGeneration({onGenerationFailed}){
      failures.push(onGenerationFailed);
      return failures.length === 1 ? {ok:true,skipped:true,alreadyGenerating:true} : {ok:true};
    }}},
  });
  try {
    await bridge.directiveGenerationInterceptor([],100,()=>{},'normal');
    allow = true;
    const first = dialogs.active();
    await click(first);
    await click(first);
    failures[1]();
    const current = dialogs.active();
    assert.equal(Boolean(current),true);
    failures[0]();
    assert.equal(dialogs.active() === current,true);
  } finally { bridge.clearSillyTavernDirectiveRuntimeBridge(); }
});

for (const completion of ['resolved', 'thrown']) {
  test(`a native Generate that ${completion} before interceptor entry cannot lend ownership to the next turn`, async () => {
    const { createSillyTavernChatAdapter } = await import('../../src/hosts/sillytavern/chat-adapter.mjs');
    let allow = false;
    let oldFailure;
    const native = createSillyTavernChatAdapter({
      contextFactory:()=>({chat:[],chatId:'unused-handoff'}),
      scriptModule:{isGenerating:()=>false,Generate(){
        if(completion === 'thrown') throw new Error('early failure');
        return Promise.resolve();
      }},
    });
    bridge.setSillyTavernDirectiveRuntimeBridge({
      app:{isCurrentChatBound:()=>true},
      turnOrchestrator:{async interceptGeneration(){return allow ? prepared : blocked;}},
      directiveHost:{chat:{getCurrentChatId:native.getCurrentChatId,async continueHostGeneration(options){
        oldFailure = options.onGenerationFailed;
        return native.continueHostGeneration(options);
      }}},
    });
    try {
      await bridge.directiveGenerationInterceptor([],100,()=>{},'normal');
      allow = true;
      await click(dialogs.active());
      allow = false;
      await bridge.directiveGenerationInterceptor([],100,()=>{},'normal');
      const current = dialogs.active();
      oldFailure();
      assert.equal(dialogs.active() === current,true);
    } finally { bridge.clearSillyTavernDirectiveRuntimeBridge(); }
  });
}
