import assert from 'node:assert/strict';

import { createGenerationRoleRegistry } from '../../src/generation/generation-roles.mjs';
import { createGenerationRouter } from '../../src/generation/generation-router.mjs';
import {
  isSidecarResultStale,
  normalizeSidecarJob
} from '../../src/jobs/sidecar-job-contracts.mjs';
import { runSidecarJobs } from '../../src/jobs/sidecar-job-runner.mjs';

const roleRegistry = createGenerationRoleRegistry({
  continuityTracker: {
    timeoutMs: 5000
  },
  crewDirector: {
    timeoutMs: 5000
  },
  shipDirector: {
    timeoutMs: 5000
  }
});

const calls = [];
const router = createGenerationRouter({
  roles: roleRegistry,
  generationClient: {
    async generate(roleId, request) {
      calls.push({ roleId, request });
      return {
        providerId: `provider-${roleId}`,
        packet: {
          roleId,
          observedTurn: request.source.turnId,
          snapshotRevision: request.source.revision
        },
        playerVisibleSummary: `${roleId} complete`
      };
    }
  },
  now: () => '2026-06-19T13:00:00.000Z'
});

const baseSource = {
  hostId: 'fake',
  campaignId: 'campaign-1',
  saveId: 'save-1',
  turnId: 'turn-1',
  revision: 3
};
const jobs = [
  {
    id: 'job-continuity',
    type: 'continuityTracker',
    source: baseSource,
    snapshot: {
      campaignState: {
        revision: 3
      }
    },
    policy: {
      timeoutMs: 5000,
      mayProposeState: true
    }
  },
  {
    id: 'job-crew',
    type: 'crewDirector',
    source: baseSource,
    snapshot: {
      campaignState: {
        revision: 3
      }
    }
  }
];

const normalized = normalizeSidecarJob(jobs[0]);
assert.equal(normalized.roleId, 'continuityTracker');
assert.equal(normalized.policy.mayProposeState, true);
assert.equal(normalized.policy.cancelOnChatSwitch, true);

const progress = [];
const sequential = await runSidecarJobs({
  jobs,
  generationRouter: router,
  concurrent: false,
  current: baseSource,
  onProgress: (event) => progress.push(event),
  now: () => '2026-06-19T13:00:01.000Z'
});

assert.equal(sequential.concurrent, false);
assert.equal(sequential.results.length, 2);
assert.equal(sequential.results[0].status, 'complete');
assert.equal(sequential.results[0].packet.roleId, 'continuityTracker');
assert.equal(sequential.results[0].playerVisibleSummary, 'continuityTracker complete');
assert.equal(sequential.results[0].diagnostics.providerId, 'provider-continuityTracker');
assert.deepEqual(progress.map((event) => event.status), [
  'batch-started',
  'running',
  'complete',
  'running',
  'complete',
  'batch-complete'
]);
assert.equal(calls[0].request.snapshot.campaignState.revision, 3);

const stale = await runSidecarJobs({
  jobs: [jobs[0]],
  generationRouter: router,
  concurrent: false,
  current: {
    ...baseSource,
    revision: 4
  }
});
assert.equal(stale.results[0].status, 'stale');
assert.equal(isSidecarResultStale(stale.results[0], { ...baseSource, revision: 4 }), true);

const concurrentStart = Date.now();
const slowRouter = createGenerationRouter({
  roles: roleRegistry,
  generationClient: {
    async generate(roleId) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        providerId: `slow-${roleId}`,
        packet: {
          roleId
        }
      };
    }
  }
});
const concurrent = await runSidecarJobs({
  jobs: [
    {
      id: 'job-ship',
      type: 'shipDirector',
      source: baseSource,
      snapshot: {}
    },
    {
      id: 'job-crew-2',
      type: 'crewDirector',
      source: baseSource,
      snapshot: {}
    }
  ],
  generationRouter: slowRouter,
  concurrent: true
});
assert.equal(concurrent.concurrent, true);
assert.equal(concurrent.results.every((result) => result.status === 'complete'), true);
assert.ok(Date.now() - concurrentStart < 45, 'concurrent sidecars should overlap');

const timeoutRouter = createGenerationRouter({
  roles: createGenerationRoleRegistry({
    continuityTracker: {
      timeoutMs: 1
    }
  }),
  generationClient: {
    async generate() {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { packet: {} };
    }
  }
});
const timeout = await runSidecarJobs({
  jobs: [{
    ...jobs[0],
    policy: {
      timeoutMs: 1
    }
  }],
  generationRouter: timeoutRouter
});
assert.equal(timeout.results[0].status, 'timeout');
assert.equal(timeout.results[0].error.code, 'DIRECTIVE_GENERATION_TIMEOUT');

const failureRouter = createGenerationRouter({
  generationClient: {
    async generate() {
      throw Object.assign(new Error('sidecar provider failed'), {
        code: 'SIDECAR_PROVIDER_FAILED'
      });
    }
  }
});
const failure = await runSidecarJobs({
  jobs: [jobs[0]],
  generationRouter: failureRouter
});
assert.equal(failure.results[0].status, 'failed');
assert.equal(failure.results[0].error.code, 'SIDECAR_PROVIDER_FAILED');

const throwing = await runSidecarJobs({
  jobs: [jobs[0]],
  generationRouter: {
    async generate() {
      throw Object.assign(new Error('router crashed'), {
        code: 'SIDECAR_ROUTER_CRASH'
      });
    }
  }
});
assert.equal(throwing.results[0].status, 'failed');
assert.equal(throwing.results[0].error.code, 'SIDECAR_ROUTER_CRASH');

console.log('Sidecar job runner tests passed.');
