import assert from 'node:assert/strict';

import { assertDirectiveHost } from '../../src/hosts/host-contract.mjs';
import {
  createLumiverseDirectiveHost,
  __lumiverseHostFactoryTestHooks
} from '../../src/hosts/lumiverse/host-factory.mjs';

function createFakeSpindle() {
  const files = new Map();
  const eventHandlers = new Map();
  return {
    logMessages: [],
    registeredTools: [],
    unregisteredTools: [],
    log: {
      debug: (...args) => {
        // Keep debug available without printing during tests.
        void args;
      },
      info(...args) {
        this.logMessages?.push(args);
      },
      warn(...args) {
        this.logMessages?.push(args);
      },
      error(...args) {
        this.logMessages?.push(args);
      }
    },
    userStorage: {
      async getJson(filePath, options = {}) {
        return files.has(filePath) ? JSON.parse(JSON.stringify(files.get(filePath))) : options.fallback;
      },
      async setJson(filePath, value) {
        files.set(filePath, JSON.parse(JSON.stringify(value)));
      },
      async exists(filePath) {
        return files.has(filePath);
      },
      async list(prefix = '') {
        return [...files.keys()].filter((filePath) => filePath.startsWith(prefix));
      },
      async delete(filePath) {
        files.delete(filePath);
      }
    },
    generate: {
      async quiet(input) {
        return {
          content: `quiet:${input.messages[0].content}`
        };
      },
      async raw(input) {
        return {
          content: `raw:${input.messages[0].content}`
        };
      },
      async batch(input) {
        return input.requests.map((request, index) => ({
          index,
          success: true,
          content: request.messages[0].content
        }));
      },
      observe(chatId) {
        return {
          chatId,
          dispose() {}
        };
      }
    },
    ui: {
      requestTabLocation() {},
      automation: {
        openConnections() {}
      },
      components: {
        Button() {}
      },
      domRegistry: {
        resolveMessage() {}
      }
    },
    chat: {
      setStyleMode() {},
      resolveCharacterDisplay() {},
      regex: {
        resolve() {}
      },
      macros: {
        resolve() {}
      }
    },
    worldBooks: {
      attachToChat() {}
    },
    presets: {
      variables: {
        list() {}
      }
    },
    lumiHub: {
      install() {}
    },
    on(eventName, handler) {
      eventHandlers.set(eventName, handler);
      return () => eventHandlers.delete(eventName);
    },
    emit(eventName, payload) {
      return eventHandlers.get(eventName)?.(payload);
    },
    registerTool(tool) {
      this.registeredTools.push(tool);
    },
    unregisterTool(name) {
      this.unregisteredTools.push(name);
    },
    registerInterceptor(handler, priority) {
      this.interceptor = {
        handler,
        priority
      };
      return () => {
        this.interceptor = null;
      };
    }
  };
}

const spindle = createFakeSpindle();
const frontendMessages = [];
const host = createLumiverseDirectiveHost({
  spindle,
  userId: 'user-1',
  frontend: {
    send(message) {
      frontendMessages.push(message);
    }
  }
});

assert.equal(assertDirectiveHost(host), host);
assert.equal(host.id, 'lumiverse');
assert.equal(host.capabilities.storage.userScoped, true);
assert.equal(host.capabilities.generation.batchConcurrent, true);
assert.equal(host.capabilities.generation.observeMainGeneration, true);
assert.equal(host.capabilities.prompt.interceptors, true);
assert.equal(host.capabilities.prompt.promptBreakdownAttribution, true);
assert.equal(host.capabilities.tools.councilEligibleTools, true);
assert.equal(host.capabilities.ui.backendToFrontendMessages, true);
assert.equal(host.capabilities.ui.tabLocation, true);
assert.equal(host.capabilities.ui.styleMode, true);
assert.equal(host.capabilities.ui.automation, true);
assert.equal(host.capabilities.ui.sharedComponents, true);
assert.equal(host.capabilities.chat.domRegistry, true);
assert.equal(host.capabilities.chat.characterDisplay, true);
assert.equal(host.capabilities.chat.regexMacros, true);
assert.equal(host.capabilities.worldBooks.attachments, true);
assert.equal(host.capabilities.presets.variables, true);
assert.equal(host.capabilities.installer.unifiedHubInstall, true);

await host.storage.writeJson('saves/save-1.v1.json', {
  ok: true
});
assert.deepEqual(await host.storage.readJson('saves/save-1.v1.json'), {
  ok: true
});
assert.equal((await host.storage.verifyJsonFiles(['saves/save-1.v1.json']))['saves/save-1.v1.json'], true);

const generated = await host.generation.generate('narration', {
  prompt: 'Narrate.'
});
assert.equal(generated.text, 'quiet:Narrate.');
assert.equal(host.generation.observe('chat-1').chatId, 'chat-1');

let chatChanged = null;
const unsubscribe = host.events.on('chatChanged', (payload) => {
  chatChanged = payload;
});
spindle.emit('CHAT_CHANGED', {
  chatId: 'chat-1'
});
assert.deepEqual(chatChanged, {
  chatId: 'chat-1'
});
unsubscribe();

await host.ui.mount();
host.ui.reportProgress({
  jobId: 'job-1',
  status: 'running'
});
assert.equal(frontendMessages[0].type, 'directive.ui.mount');
assert.equal(frontendMessages[1].type, 'directive.job.progress');
assert.equal(frontendMessages[1].payload.jobId, 'job-1');

host.tools.registerTool({
  name: 'directive_get_ship_status',
  display_name: 'Ship Status',
  description: 'Return player-safe ship status.'
}, async () => 'Ship stable.');
assert.equal(spindle.registeredTools[0].name, 'directive_get_ship_status');
host.jobs.disposeAll();
assert.equal(spindle.unregisteredTools.includes('directive_get_ship_status'), true);

const quietHost = createLumiverseDirectiveHost({
  spindle: {
    userStorage: spindle.userStorage,
    generate: {
      async quiet() {
        return {
          content: 'quiet'
        };
      }
    },
    on: spindle.on.bind(spindle)
  },
  tools: false
});
assert.equal(quietHost.capabilities.tools.registerTools, false);
assert.equal(quietHost.capabilities.generation.raw, false);
assert.equal(quietHost.capabilities.generation.batchConcurrent, false);
assert.equal(quietHost.capabilities.prompt.interceptors, false);
assert.equal(quietHost.capabilities.ui.backendToFrontendMessages, false);
assert.equal(quietHost.capabilities.ui.tabLocation, false);
assert.equal(quietHost.capabilities.chat.domRegistry, false);
assert.equal(quietHost.capabilities.worldBooks.attachments, false);

const ui = __lumiverseHostFactoryTestHooks.createLumiverseUiAdapter();
ui.reportProgress({
  ok: true
});
assert.equal(ui.messages()[0].type, 'directive.job.progress');

console.log('Lumiverse host factory tests passed.');
