import assert from 'node:assert/strict';

import {
  createLumiverseInterceptorHandler,
  registerLumiverseDirectiveInterceptor
} from '../../src/hosts/lumiverse/interceptor-adapter.mjs';

const baseMessages = [
  {
    role: 'user',
    content: 'What is the Breckinridge doing?'
  }
];

const handler = createLumiverseInterceptorHandler({
  attributionLabel: 'Directive Context',
  now: '2026-06-19T15:00:00.000Z',
  async buildPromptBlocks({ context }) {
    assert.equal(context.chatId, 'chat-1');
    return [
      {
        id: 'active-situation',
        title: 'Active Situation',
        audience: 'playerSafe',
        priority: 10,
        source: {
          kind: 'campaignState',
          id: 'campaign-1',
          revision: 4
        },
        content: {
          visiblePhase: 'convoy-handoff',
          visiblePressures: [
            'Relief convoy window is narrowing.'
          ]
        }
      }
    ];
  }
});

const injected = await handler(baseMessages, {
  chatId: 'chat-1',
  generationType: 'normal'
});
assert.equal(injected.messages.length, 2);
assert.equal(injected.messages[0].role, 'system');
assert.match(injected.messages[0].content, /\[Directive Context: Active Situation\]/);
assert.deepEqual(injected.messages[1], baseMessages[0]);
assert.deepEqual(injected.breakdown, [
  {
    messageIndex: 0,
    name: 'Directive Context'
  }
]);

baseMessages[0].content = 'mutated after handler';
assert.equal(injected.messages[1].content, 'What is the Breckinridge doing?');

const emptyHandler = createLumiverseInterceptorHandler({
  async buildPromptBlocks() {
    return [];
  }
});
assert.deepEqual(await emptyHandler(baseMessages, {}), baseMessages);

const warnings = [];
const unsafeHandler = createLumiverseInterceptorHandler({
  loggerSpindle: {
    log: {
      warn(message) {
        warnings.push(message);
      }
    }
  },
  async buildPromptBlocks() {
    return [
      {
        id: 'unsafe',
        title: 'Unsafe',
        audience: 'internalOnly',
        source: {
          kind: 'director',
          id: 'hidden'
        },
        content: 'Do not inject.'
      }
    ];
  }
});
assert.deepEqual(await unsafeHandler(baseMessages, {}), baseMessages);
assert.match(warnings[0], /interceptor skipped/);

const throwingHandler = createLumiverseInterceptorHandler({
  async buildPromptBlocks() {
    throw new Error('context unavailable');
  }
});
assert.deepEqual(await throwingHandler(baseMessages, {}), baseMessages);

let registeredPriority = null;
let registeredHandler = null;
const unsubscribe = () => {};
const registerResult = registerLumiverseDirectiveInterceptor({
  spindle: {
    registerInterceptor(nextHandler, priority) {
      registeredHandler = nextHandler;
      registeredPriority = priority;
      return unsubscribe;
    },
    log: {
      warn() {}
    }
  },
  priority: 42,
  async buildPromptBlocks() {
    return [];
  }
});
assert.equal(registerResult, unsubscribe);
assert.equal(registeredPriority, 42);
assert.equal(typeof registeredHandler, 'function');

console.log('Lumiverse interceptor adapter tests passed.');
