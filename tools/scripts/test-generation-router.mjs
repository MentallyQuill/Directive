import assert from 'node:assert/strict';

import {
  createGenerationRoleRegistry,
  GENERATION_ROLE_IDS
} from '../../src/generation/generation-roles.mjs';
import { createGenerationRouter } from '../../src/generation/generation-router.mjs';
import { createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';

const registry = createGenerationRoleRegistry({
  narration: {
    timeoutMs: 5000
  }
});

assert.equal(registry.list().length, GENERATION_ROLE_IDS.length);
assert.equal(registry.get('narration').blocking, true);
assert.equal(registry.get('continuityTracker').mayProposeState, true);
assert.equal(registry.get('commandLogSummarizer').modelPreferences.cost, 'low');
assert.equal(registry.get('commandLogSummarizer').timeoutMs, 8000);
assert.equal(registry.get('sideMissionSignalDetector').timeoutMs, 45000);
assert.equal(registry.get('sideMissionCandidateBuilder').timeoutMs, 90000);
assert.equal(registry.get('sideMissionSceneFramer').timeoutMs, 90000);
assert.equal(registry.get('directiveAssist').modelPreferences.latency, 'fast');
assert.equal(registry.get('directiveAssist').mayProposeState, false);
assert.equal(registry.get('directiveAssist').timeoutMs, 45000);
assert.equal(registry.get('narration').timeoutMs, 5000);
assert.throws(() => registry.get('missing'), /Unknown generation role/);
assert.throws(
  () => createGenerationRoleRegistry({
    missingRole: {
      timeoutMs: 1
    }
  }),
  /Unknown generation role override/
);

const generationClient = createFakeGenerationClient({
  responses: {
    narration: {
      providerId: 'fake-narrator',
      model: 'fake-model',
      text: 'Narrated result.',
      usage: {
        total_tokens: 12
      }
    },
    continuityTracker: {
      providerId: 'fake-continuity',
      content: {
        deltas: []
      }
    }
  }
});

const router = createGenerationRouter({
  generationClient,
  roles: registry,
  now: () => '2026-06-19T12:00:00.000Z'
});

const narration = await router.generate('narration', {
  sourceOutcomeId: 'outcome.test'
});
assert.equal(narration.ok, true);
assert.equal(narration.roleId, 'narration');
assert.equal(narration.response.text, 'Narrated result.');
assert.equal(narration.diagnostics.providerId, 'fake-narrator');
assert.equal(narration.diagnostics.usage.total_tokens, 12);
assert.equal(generationClient.calls()[0].role, 'narration');
assert.equal(generationClient.calls()[0].request.role.id, 'narration');

const provider = router.providerForRole('narration');
const providerResult = await provider.generateNarration({
  sourceOutcomeId: 'outcome.provider'
});
assert.equal(provider.id, 'directive-generation-role:narration');
assert.equal(providerResult.text, 'Narrated result.');

const continuity = await router.generate('continuityTracker', {
  turnId: 'turn.test'
});
assert.equal(continuity.ok, true);
assert.deepEqual(continuity.response.content, { deltas: [] });

const failingRouter = createGenerationRouter({
  generationClient: {
    async generate() {
      throw Object.assign(new Error('provider offline'), {
        code: 'PROVIDER_OFFLINE'
      });
    }
  },
  now: () => '2026-06-19T12:00:00.000Z'
});
const failure = await failingRouter.generate('missionDirectorAdvisor', {});
assert.equal(failure.ok, false);
assert.equal(failure.error.code, 'PROVIDER_OFFLINE');
assert.equal(failure.error.retryable, false);

const timeoutRouter = createGenerationRouter({
  generationClient: {
    async generate() {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { text: 'late' };
    }
  },
  roles: createGenerationRoleRegistry({
    utilityJson: {
      timeoutMs: 1
    }
  })
});
const timeout = await timeoutRouter.generate('utilityJson', {});
assert.equal(timeout.ok, false);
assert.equal(timeout.error.code, 'DIRECTIVE_GENERATION_TIMEOUT');
assert.match(timeout.error.message, /timed out/);

console.log('Generation router tests passed.');
