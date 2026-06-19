import { createGenerationRouter } from '../generation/generation-router.mjs';
import { assertDirectiveHost } from '../hosts/host-contract.mjs';
import { runSidecarJobs } from './sidecar-job-runner.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createProgressReporter({ host, onProgress }) {
  return (event) => {
    const payload = {
      ...cloneJson(event),
      hostId: host.id
    };
    host.ui.reportProgress?.(payload);
    onProgress?.(payload);
  };
}

export async function runHostSidecarJobs({
  host,
  jobs = [],
  roles = null,
  current = null,
  now = null,
  onProgress = null,
  forceConcurrent = null
} = {}) {
  assertDirectiveHost(host);
  const generationRouter = createGenerationRouter({
    generationClient: host.generation,
    roles,
    now
  });
  const concurrent = forceConcurrent === null
    ? host.capabilities.generation.batchConcurrent === true
    : forceConcurrent === true;
  const result = await runSidecarJobs({
    jobs,
    generationRouter,
    concurrent,
    current,
    now,
    onProgress: createProgressReporter({
      host,
      onProgress
    })
  });
  return {
    ...result,
    hostId: host.id,
    strategy: concurrent ? 'concurrent' : 'sequential'
  };
}
