import assert from 'node:assert/strict';
import { createSillyTavernGenerationClient } from '../../src/hosts/sillytavern/generation-client.mjs';
import { createGenerationCancellation } from '../../src/runtime/generation-cancellation.mjs';

let calls = 0;
const controller = new AbortController();
const client = createSillyTavernGenerationClient({ contextFactory: () => ({
  async generateQuietPrompt() {
    calls++;
    controller.abort();
    throw new Error('Host stopped');
  },
}) });
await assert.rejects(client.generate('utilityJson', {}, { signal: controller.signal }));
assert.equal(calls, 1, 'Stop must prevent compatibility retries even when the host throws a generic error');

let lateCalls = 0;
const lateController = new AbortController();
const lateClient = createSillyTavernGenerationClient({ providerClient: {
  async generate() {
    lateCalls++;
    lateController.abort();
    return { text: '<think>late reasoning</think>' };
  },
} });
await assert.rejects(lateClient.generate('utilityJson', {}, { signal: lateController.signal }));
assert.equal(lateCalls, 1, 'a late canceled response must never trigger visible-output retry');

const requests = [];
const cancellation = createGenerationCancellation({
  generate(role, request, options) {
    return new Promise(resolve => requests.push({ role, signal: options.signal, resolve }));
  },
  generateNarration(request) {
    return new Promise(resolve => requests.push({ role: 'narration', signal: request.signal, resolve }));
  },
});
const pending = [cancellation.generation.generate('utility', {}),
  cancellation.generation.generate('reasoning', {}), cancellation.generation.generateNarration({})];
const rejected = pending.map(promise => assert.rejects(promise, { code: 'DIRECTIVE_GENERATION_ABORTED' }));
cancellation.stop();
assert.ok(requests.every(request => request.signal.aborted), 'all active transports abort synchronously');
await Promise.all(rejected);
await assert.rejects(cancellation.generation.generate('background', {}), { code: 'DIRECTIVE_GENERATION_ABORTED' });
assert.equal(requests.length, 3, 'stopped work cannot start another request');
cancellation.resume();
const fresh = cancellation.generation.generate('utility', {});
requests.slice(0, 3).forEach(request => request.resolve({ text: 'late response' }));
assert.equal(requests[3].signal.aborted, false, 'a fresh explicit operation owns a new signal');
requests[3].resolve({ text: 'fresh response' });
assert.equal((await fresh).text, 'fresh response');
console.log('Generation cancellation tests passed.');
