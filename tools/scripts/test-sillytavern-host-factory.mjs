import assert from 'node:assert/strict';

import { assertDirectiveHost } from '../../src/hosts/host-contract.mjs';
import {
  createSillyTavernEventAdapter
} from '../../src/hosts/sillytavern/events-adapter.mjs';
import {
  createSillyTavernDirectiveHost,
  __sillyTavernHostFactoryTestHooks
} from '../../src/hosts/sillytavern/host-factory.mjs';
import { createSillyTavernStorageAdapter } from '../../src/hosts/sillytavern/storage-adapter.mjs';

function createFakeSource() {
  const handlers = new Map();
  return {
    on(eventName, handler) {
      if (!handlers.has(eventName)) {
        handlers.set(eventName, new Set());
      }
      handlers.get(eventName).add(handler);
    },
    off(eventName, handler) {
      handlers.get(eventName)?.delete(handler);
    },
    emit(eventName, payload) {
      for (const handler of handlers.get(eventName) || []) {
        handler(payload);
      }
    },
    count(eventName) {
      return handlers.get(eventName)?.size || 0;
    }
  };
}

function createPhysicalStorage() {
  const files = new Map();
  return {
    files,
    async readJson(filePath) {
      return JSON.parse(JSON.stringify(files.get(filePath)));
    },
    async writeJson(filePath, value) {
      files.set(filePath, JSON.parse(JSON.stringify(value)));
      return {
        ok: true,
        path: filePath
      };
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    },
    async deleteJsonFile(filePath) {
      files.delete(filePath);
      return {
        ok: true,
        path: filePath
      };
    }
  };
}

const physicalStorage = createPhysicalStorage();
const storage = createSillyTavernStorageAdapter({
  storage: physicalStorage
});
await storage.writeJson('saves/save-1.v1.json', {
  ok: true
});
assert.deepEqual(physicalStorage.files.get('/user/files/directive-saves-save-1.v1.json'), {
  ok: true
});
assert.equal((await storage.verifyJsonFiles(['saves/save-1.v1.json']))['saves/save-1.v1.json'], true);

const source = createFakeSource();
const context = {
  eventSource: source,
  event_types: {
    CHAT_CHANGED: 'chat:changed'
  },
  async generateRaw(request) {
    return {
      text: `generated:${request.prompt}`
    };
  }
};

const events = createSillyTavernEventAdapter({ context });
let chatPayload = null;
const unsubscribe = events.on('chatChanged', (payload) => {
  chatPayload = payload;
});
source.emit('chat:changed', {
  chatId: 'chat-1'
});
assert.deepEqual(chatPayload, {
  chatId: 'chat-1'
});
assert.equal(events.listenerCount(), 1);
unsubscribe();
assert.equal(source.count('chat:changed'), 0);

const forwardedUiMessages = [];
const host = createSillyTavernDirectiveHost({
  context,
  storage,
  ui: {
    mount: async () => ({
      ok: true,
      mounted: true
    }),
    send(message) {
      forwardedUiMessages.push(message);
    }
  }
});
assert.equal(assertDirectiveHost(host), host);
assert.equal(host.id, 'sillytavern');
assert.equal(host.capabilities.generation.currentChatModel, true);
assert.equal(host.capabilities.generation.raw, true);
assert.equal(host.capabilities.generation.batchConcurrent, false);
assert.equal(host.capabilities.ui.panelMount, true);

const defaultStorageHost = createSillyTavernDirectiveHost({
  context
});
assert.equal(defaultStorageHost.storage.hostId, 'sillytavern');
assert.equal(defaultStorageHost.storage.toPath('indexes/saves.v1.json'), '/user/files/directive-indexes-saves.v1.json');

const generated = await host.generation.generate('narration', {
  prompt: 'Narrate.'
});
assert.equal(generated.text, 'generated:Narrate.');

assert.deepEqual(await host.ui.mount(), {
  ok: true,
  mounted: true
});
host.ui.reportProgress({
  jobId: 'job-1',
  status: 'running'
});
assert.equal(forwardedUiMessages[0].type, 'directive.job.progress');

host.events.on('extensionDisabled', () => {});
assert.equal(host.events.listenerCount(), 1);
host.jobs.disposeAll();
assert.equal(host.events.listenerCount(), 0);

const ui = __sillyTavernHostFactoryTestHooks.createSillyTavernUiAdapter();
ui.reportProgress({
  ok: true
});
assert.equal(ui.messages()[0].type, 'directive.job.progress');

assert.throws(
  () => createSillyTavernEventAdapter({ context: {} }),
  /does not expose an event source/
);
assert.throws(
  () => createSillyTavernDirectiveHost({ context: null }),
  /SillyTavern context must be an object/
);

console.log('SillyTavern host factory tests passed.');
