import assert from 'node:assert/strict';

import {
  createGenerationRoleRegistry,
  GENERATION_PROVIDER_KINDS,
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
for (const role of registry.list()) {
  assert.equal(GENERATION_PROVIDER_KINDS.includes(role.providerKind), true, `${role.id} should declare an explicit providerKind`);
}
assert.equal(registry.get('narration').blocking, true);
assert.equal(registry.get('narration').providerKind, 'reasoning');
assert.equal(registry.get('continuityTracker').mayProposeState, true);
assert.equal(registry.get('continuityTracker').providerKind, 'utility');
assert.equal(registry.get('continuityTracker').timeoutMs, 45000);
for (const roleId of [
  'continuityContradictionReviewer',
  'continuityClaimExtractor',
  'continuityProjectionCompressor'
]) {
  assert.equal(registry.get(roleId).providerKind, 'utility');
  assert.equal(registry.get(roleId).mayProposeState, false);
  assert.equal(registry.get(roleId).mayInjectPrompt, false);
  assert.equal(registry.get(roleId).timeoutMs, 30000);
}
assert.equal(registry.get('continuityProjectionPlanner').providerKind, 'utility');
assert.equal(registry.get('continuityProjectionPlanner').mayProposeState, false);
assert.equal(registry.get('continuityProjectionPlanner').mayInjectPrompt, false);
assert.equal(registry.get('continuityProjectionPlanner').blocking, true);
assert.equal(registry.get('continuityProjectionPlanner').mayRunDuringMainGeneration, false);
assert.equal(registry.get('continuityProjectionPlanner').timeoutMs, 15000);
assert.equal(registry.get('continuityProjectionPlanner').fallback, 'last-good-then-deterministic');
assert.equal(registry.get('continuityContradictionReviewer').blocking, true);
assert.equal(registry.get('continuityContradictionReviewer').fallback, 'fail-closed');
assert.equal(registry.get('relationshipEvaluator').providerKind, 'utility');
assert.equal(registry.get('relationshipEvaluator').timeoutMs, 45000);
assert.equal(registry.get('commandBearingFitChecker').providerKind, 'utility');
assert.equal(registry.get('commandBearingFitChecker').timeoutMs, 30000);
assert.equal(registry.get('commandBearingFitChecker').mayProposeState, false);
assert.equal(registry.get('commandBearingSpendValidator').providerKind, 'utility');
assert.equal(registry.get('commandBearingSpendValidator').timeoutMs, 30000);
assert.equal(registry.get('commandBearingSpendValidator').fallback, 'fail-closed');
assert.equal(registry.get('commandBearingEvaluator').providerKind, 'utility');
assert.equal(registry.get('commandBearingEvaluator').timeoutMs, 45000);
assert.equal(registry.get('outcomeIntegrityReview').providerKind, 'utility');
assert.equal(registry.get('outcomeIntegrityReview').timeoutMs, 45000);
assert.equal(registry.get('crewDirector').providerKind, 'utility');
assert.equal(registry.get('crewDirector').timeoutMs, 45000);
assert.equal(registry.get('shipDirector').providerKind, 'utility');
assert.equal(registry.get('shipDirector').timeoutMs, 45000);
assert.equal(registry.get('commandLogSummarizer').modelPreferences.cost, 'low');
assert.equal(registry.get('commandLogSummarizer').providerKind, 'utility');
assert.equal(registry.get('commandLogSummarizer').timeoutMs, 8000);
assert.equal(registry.get('factualGroundingReviewer').providerKind, 'utility');
assert.equal(registry.get('factualGroundingReviewer').timeoutMs, 60000);
assert.equal(registry.get('factualGroundingReviewer').mayProposeState, false);
assert.equal(registry.get('factualGroundingReviewer').mayInjectPrompt, false);
assert.equal(registry.get('factualGroundingReviewer').fallback, 'skip');
assert.equal(registry.get('storyQualityReviewer').providerKind, 'utility');
assert.equal(registry.get('storyQualityReviewer').timeoutMs, 60000);
assert.equal(registry.get('storyQualityReviewer').mayProposeState, false);
assert.equal(registry.get('storyQualityReviewer').mayInjectPrompt, false);
assert.equal(registry.get('storyQualityReviewer').fallback, 'skip');
assert.equal(registry.get('utilityTurnClassifier').timeoutMs, 45000);
assert.equal(registry.get('questActionInterpreter').timeoutMs, 45000);
assert.equal(registry.get('questActionInterpreter').providerKind, 'utility');
assert.equal(registry.get('questActionInterpreter').mayProposeState, false);
assert.equal(registry.get('questArchitect').timeoutMs, 45000);
assert.equal(registry.get('questArchitect').providerKind, 'reasoning');
assert.equal(registry.get('questArchitect').mayProposeState, false);
assert.equal(registry.get('missionDirectorAdvisor').timeoutMs, 60000);
assert.equal(registry.get('sceneDeltaExtractor').timeoutMs, 20000);
assert.equal(registry.get('sceneDeltaExtractor').providerKind, 'utility');
assert.equal(registry.get('sceneReconciliationExtractor').timeoutMs, 30000);
assert.equal(registry.get('sceneReconciliationExtractor').providerKind, 'utility');
assert.equal(registry.get('directiveAssist').modelPreferences.latency, 'medium');
assert.equal(registry.get('directiveAssist').modelPreferences.capability, 'authoring-assist');
assert.equal(registry.get('directiveAssist').mayProposeState, false);
assert.equal(registry.get('directiveAssist').providerKind, 'reasoning');
assert.equal(registry.get('directiveAssist').timeoutMs, 90000);
assert.equal(registry.get('characterCreatorSectionDraft').timeoutMs, 45000);
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
assert.throws(
  () => createGenerationRoleRegistry({
    narration: {
      providerKind: 'ambient'
    }
  }),
  /providerKind must be one of/
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

const modelCallEvents = [];
const router = createGenerationRouter({
  generationClient,
  roles: registry,
  now: () => '2026-06-19T12:00:00.000Z',
  onModelCall: (event) => modelCallEvents.push(event)
});

const narration = await router.generate('narration', {
  sourceOutcomeId: 'outcome.test'
});
assert.equal(narration.ok, true);
assert.equal(narration.roleId, 'narration');
assert.equal(narration.response.text, 'Narrated result.');
assert.equal(narration.diagnostics.providerId, 'fake-narrator');
assert.equal(narration.diagnostics.usage.total_tokens, 12);
assert.equal(typeof narration.diagnostics.requestHash, 'string');
assert.equal(generationClient.calls()[0].role, 'narration');
assert.equal(generationClient.calls()[0].request.role.id, 'narration');
assert.equal(modelCallEvents[0].roleId, 'narration');
assert.equal(modelCallEvents[0].providerKind, 'reasoning');
assert.equal(modelCallEvents[0].status, 'ok');
assert.equal(modelCallEvents[0].requestHash, narration.diagnostics.requestHash);

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
assert.equal(modelCallEvents.some((event) => event.roleId === 'continuityTracker' && event.providerKind === 'utility'), true);

const overrideEvents = [];
const effectiveLaneRouter = createGenerationRouter({
  generationClient: {
    async generate(roleId) {
      return {
        roleId,
        text: 'Relationship route override.',
        providerKind: 'reasoning',
        providerId: 'fake-reasoning-override'
      };
    }
  },
  now: () => '2026-06-19T12:01:00.000Z',
  onModelCall: (event) => overrideEvents.push(event)
});
const overriddenRelationship = await effectiveLaneRouter.generate('relationshipEvaluator', {});
assert.equal(overriddenRelationship.ok, true);
assert.equal(overriddenRelationship.role.providerKind, 'reasoning');
assert.equal(overrideEvents[0].providerKind, 'reasoning');

const callOverrideClient = createFakeGenerationClient({
  responses: {
    outcomeIntegrityReview: {
      text: '{"schema":"directive.outcomeIntegrityReview.v1","verdict":"accept","categories":[],"reason":"ok","safeSummary":"ok"}',
      providerKind: 'reasoning'
    }
  }
});
const callOverrideRouter = createGenerationRouter({
  generationClient: callOverrideClient,
  now: () => '2026-06-19T12:02:00.000Z'
});
const callOverride = await callOverrideRouter.generate('outcomeIntegrityReview', {}, { providerKind: 'reasoning' });
assert.equal(callOverride.ok, true);
assert.equal(callOverride.role.providerKind, 'reasoning');
assert.equal(callOverrideClient.calls()[0].request.role.providerKind, 'reasoning');

let observedProviderSignal = null;
const signalRouter = createGenerationRouter({
  generationClient: {
    async generate() {
      return { text: 'signal ok' };
    }
  }
});
const signalController = new AbortController();
const signalResult = await signalRouter.generate('utilityJson', {}, { signal: signalController.signal });
assert.equal(signalResult.ok, true);

const abortRouter = createGenerationRouter({
  generationClient: {
    async generate(roleId, request) {
      observedProviderSignal = request.signal;
      return new Promise((resolve, reject) => {
        request.signal.addEventListener('abort', () => {
          const error = new Error('aborted by test');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }
  }
});
const abortController = new AbortController();
const abortPromise = abortRouter.generate('utilityJson', {}, {
  signal: abortController.signal,
  timeoutMs: 100
});
abortController.abort();
const aborted = await abortPromise;
assert.equal(observedProviderSignal instanceof AbortSignal, true);
assert.equal(aborted.ok, false);
assert.equal(aborted.error.code, 'DIRECTIVE_GENERATION_ABORTED');
assert.equal(aborted.error.retryable, false);

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

const transportFailureRouter = createGenerationRouter({
  generationClient: {
    async generate() {
      const error = new Error('Provider reasoning connection failed (ECONNRESET).');
      error.code = 'DIRECTIVE_PROVIDER_TRANSPORT_ERROR';
      error.providerKind = 'reasoning';
      error.retryable = true;
      error.details = { transportCode: 'ECONNRESET', providerKind: 'reasoning' };
      throw error;
    }
  },
  now: () => '2026-06-19T12:03:00.000Z'
});
const transportFailure = await transportFailureRouter.generate('characterCreatorSectionDraft', {});
assert.equal(transportFailure.ok, false);
assert.equal(transportFailure.role.providerKind, 'reasoning');
assert.equal(transportFailure.error.code, 'DIRECTIVE_PROVIDER_TRANSPORT_ERROR');
assert.equal(transportFailure.error.retryable, true);
assert.equal(transportFailure.error.details.transportCode, 'ECONNRESET');
assert.equal(transportFailure.diagnostics.transportCode, 'ECONNRESET');

let timeoutProviderSignalAborted = false;
const timeoutRouter = createGenerationRouter({
  generationClient: {
    async generate(roleId, request) {
      request.signal?.addEventListener('abort', () => {
        timeoutProviderSignalAborted = true;
      }, { once: true });
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
assert.equal(timeoutProviderSignalAborted, true, 'router timeout should abort the provider request signal when possible');

const batchTimeoutRouter = createGenerationRouter({
  generationClient: {
    async generate(roleId) {
      return {
        roleId,
        text: `single:${roleId}`
      };
    },
    async batch(requests) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return requests.map((request) => ({
        roleId: request.roleId,
        text: `batch:${request.roleId}`
      }));
    }
  },
  roles: createGenerationRoleRegistry({
    utilityJson: {
      timeoutMs: 20
    },
    promptContextBuilder: {
      timeoutMs: 20
    }
  })
});
const batchWithinAggregateBudget = await batchTimeoutRouter.batch([
  { roleId: 'utilityJson', request: {} },
  { roleId: 'promptContextBuilder', request: {} }
], {
  concurrent: true
});
assert.equal(batchWithinAggregateBudget.length, 2);
assert.equal(batchWithinAggregateBudget.every((entry) => entry.ok), true);

console.log('Generation router tests passed.');
