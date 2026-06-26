import assert from 'node:assert/strict';

import { createHostCapabilities, normalizeDirectiveHost } from '../../src/hosts/host-contract.mjs';
import { createFakeEventAdapter, createFakeJsonStorage, createFakeUiAdapter } from '../../src/hosts/fake/fake-host.mjs';
import { runHostSidecarJobs } from '../../src/jobs/host-sidecar-orchestrator.mjs';

function createHost({ id, batchConcurrent }) {
  let active = 0;
  let maxActive = 0;
  const calls = [];
  const ui = createFakeUiAdapter();
  const host = normalizeDirectiveHost({
    id,
    displayName: id === 'fake' ? 'Fake Batch Host' : 'SillyTavern',
    capabilities: createHostCapabilities({
      storage: {
        json: true
      },
      generation: {
        quiet: true,
        batch: batchConcurrent,
        batchConcurrent
      }
    }),
    storage: createFakeJsonStorage(),
    generation: {
      async generate(roleId, request) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        calls.push({
          roleId,
          turnId: request.source.turnId
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return {
          providerId: `${id}-provider`,
          packet: {
            roleId,
            turnId: request.source.turnId
          }
        };
      }
    },
    events: createFakeEventAdapter(),
    ui
  });
  return {
    host,
    calls,
    ui,
    maxActive: () => maxActive
  };
}

const jobs = [
  {
    id: 'job-continuity',
    type: 'continuityTracker',
    source: {
      hostId: 'test',
      campaignId: 'campaign-1',
      saveId: 'save-1',
      turnId: 'turn-1',
      revision: 1
    },
    snapshot: {}
  },
  {
    id: 'job-crew',
    type: 'crewDirector',
    source: {
      hostId: 'test',
      campaignId: 'campaign-1',
      saveId: 'save-1',
      turnId: 'turn-1',
      revision: 1
    },
    snapshot: {}
  }
];

const batchHost = createHost({
  id: 'fake',
  batchConcurrent: true
});
const progress = [];
const concurrent = await runHostSidecarJobs({
  host: batchHost.host,
  jobs,
  current: {
    campaignId: 'campaign-1',
    saveId: 'save-1',
    turnId: 'turn-1',
    revision: 1
  },
  onProgress: (event) => progress.push(event)
});
assert.equal(concurrent.strategy, 'concurrent');
assert.equal(concurrent.hostId, 'fake');
assert.equal(concurrent.results.every((result) => result.status === 'complete'), true);
assert.ok(batchHost.maxActive() > 1, 'batch-capable fake host should run sidecars concurrently');
assert.equal(progress[0].hostId, 'fake');
assert.equal(batchHost.ui.messages()[0].type, 'progress');
assert.equal(batchHost.ui.messages()[0].payload.hostId, 'fake');

const sillytavern = createHost({
  id: 'sillytavern',
  batchConcurrent: false
});
const sequential = await runHostSidecarJobs({
  host: sillytavern.host,
  jobs
});
assert.equal(sequential.strategy, 'sequential');
assert.equal(sequential.hostId, 'sillytavern');
assert.equal(sillytavern.maxActive(), 1);

const forced = await runHostSidecarJobs({
  host: sillytavern.host,
  jobs,
  forceConcurrent: true
});
assert.equal(forced.strategy, 'concurrent');
assert.ok(sillytavern.maxActive() > 1);

await assert.rejects(
  () => runHostSidecarJobs({
    host: {
      id: 'fake'
    },
    jobs
  }),
  /host.displayName/
);

console.log('Host sidecar orchestrator tests passed.');
