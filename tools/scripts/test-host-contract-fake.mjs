import assert from 'node:assert/strict';

import {
  assertDirectiveHost,
  createHostCapabilities,
  normalizeDirectiveHost
} from '../../src/hosts/host-contract.mjs';
import {
  createFakeDirectiveHost,
  createFakeJsonStorage
} from '../../src/hosts/fake/fake-host.mjs';

const host = createFakeDirectiveHost({
  generationOptions: {
    responses: {
      narration: {
        providerId: 'fake-narrator',
        text: 'The Breckinridge holds station.'
      }
    }
  }
});

assert.equal(host.id, 'fake');
assert.equal(host.displayName, 'Fake Host');
assert.equal(host.capabilities.storage.json, true);
assert.equal(host.capabilities.storage.verify, true);
assert.equal(host.capabilities.generation.batchConcurrent, true);
assert.equal(assertDirectiveHost(host), host);

await host.storage.writeJson('saves/example.v1.json', { ok: true, nested: { count: 1 } });
const saved = await host.storage.readJson('saves/example.v1.json');
assert.deepEqual(saved, { ok: true, nested: { count: 1 } });
saved.nested.count = 99;
assert.equal((await host.storage.readJson('saves/example.v1.json')).nested.count, 1);

const verification = await host.storage.verifyJsonFiles([
  'saves/example.v1.json',
  'saves/missing.v1.json'
]);
assert.deepEqual(verification, {
  'saves/example.v1.json': true,
  'saves/missing.v1.json': false
});

const listed = await host.storage.listJsonFiles('saves/');
assert.deepEqual(listed, ['saves/example.v1.json']);

const narrationProvider = host.generation.role('narration');
const narration = await narrationProvider.generateNarration({
  sourceOutcomeId: 'outcome.test'
});
assert.deepEqual(narration, {
  providerId: 'fake-narrator',
  text: 'The Breckinridge holds station.'
});
assert.equal(host.generation.calls()[0].role, 'narration');

let eventPayload = null;
const unsubscribe = host.events.on('TEST_EVENT', (payload) => {
  eventPayload = payload;
});
assert.equal(host.events.listenerCount('TEST_EVENT'), 1);
host.events.emit('TEST_EVENT', { ok: true });
assert.deepEqual(eventPayload, { ok: true });
unsubscribe();
assert.equal(host.events.listenerCount('TEST_EVENT'), 0);

host.ui.reportProgress({ jobId: 'job.test', status: 'running' });
assert.deepEqual(host.ui.messages(), [
  {
    type: 'progress',
    payload: {
      jobId: 'job.test',
      status: 'running'
    }
  }
]);

assert.throws(
  () => normalizeDirectiveHost({
    ...host,
    id: 'unknown'
  }),
  /host\.id must be one of/
);

assert.throws(
  () => normalizeDirectiveHost({
    ...host,
    storage: createFakeJsonStorage(),
    generation: {}
  }),
  /host\.generation\.generate must be a function/
);

const capabilities = createHostCapabilities({
  generation: {
    quiet: true
  }
});
assert.equal(capabilities.generation.quiet, true);
assert.equal(capabilities.generation.batch, false);
assert.equal(capabilities.storage.json, true);
assert.equal(capabilities.ui.automation, false);
assert.equal(capabilities.chat.domRegistry, false);
assert.equal(capabilities.worldBooks.attachments, false);
assert.equal(capabilities.presets.variables, false);
assert.equal(capabilities.installer.unifiedHubInstall, false);

console.log('Host contract fake tests passed.');
