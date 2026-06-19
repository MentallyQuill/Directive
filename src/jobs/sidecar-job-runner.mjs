import {
  createSidecarResult,
  isSidecarResultStale,
  normalizeSidecarJob
} from './sidecar-job-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function sidecarRequest(job) {
  return {
    ...cloneJson(job.request || {}),
    source: cloneJson(job.source),
    snapshot: cloneJson(job.snapshot),
    policy: cloneJson(job.policy)
  };
}

function packetFromGenerationResult(result) {
  if (!result?.ok) {
    return null;
  }
  const response = result.response || {};
  return response.packet ?? response.content ?? response.text ?? response;
}

function resultFromGeneration({
  job,
  generation,
  current = null,
  now = null,
  onProgress = null
}) {
  const normalizedJob = normalizeSidecarJob(job);
  if (!generation?.ok) {
    const status = generation?.error?.code === 'DIRECTIVE_GENERATION_TIMEOUT' ? 'timeout' : 'failed';
    const result = createSidecarResult({
      job: normalizedJob,
      status,
      diagnostics: generation?.diagnostics || {},
      error: generation?.error || {
        code: 'DIRECTIVE_SIDECAR_FAILED',
        message: 'Sidecar generation failed'
      },
      completedAt: timestamp(now)
    });
    onProgress?.({
      jobId: normalizedJob.id,
      type: normalizedJob.type,
      status
    });
    return result;
  }

  const result = createSidecarResult({
    job: normalizedJob,
    status: 'complete',
    packet: packetFromGenerationResult(generation),
    proposedStateDelta: generation.response?.proposedStateDelta || null,
    playerVisibleSummary: generation.response?.playerVisibleSummary || null,
    diagnostics: generation.diagnostics,
    completedAt: timestamp(now)
  });
  if (current && isSidecarResultStale(result, current)) {
    const stale = {
      ...result,
      status: 'stale'
    };
    onProgress?.({
      jobId: normalizedJob.id,
      type: normalizedJob.type,
      status: 'stale'
    });
    return stale;
  }
  onProgress?.({
    jobId: normalizedJob.id,
    type: normalizedJob.type,
    status: 'complete'
  });
  return result;
}

async function runOneSidecarJob({
  job,
  generationRouter,
  onProgress = null,
  current = null,
  now = null
}) {
  const normalizedJob = normalizeSidecarJob(job);
  onProgress?.({
    jobId: normalizedJob.id,
    type: normalizedJob.type,
    status: 'running'
  });
  let generation = null;
  try {
    generation = await generationRouter.generate(normalizedJob.roleId, sidecarRequest(normalizedJob), {
      timeoutMs: normalizedJob.policy.timeoutMs
    });
  } catch (error) {
    const result = createSidecarResult({
      job: normalizedJob,
      status: 'failed',
      error: {
        code: error?.code || 'DIRECTIVE_SIDECAR_FAILED',
        message: error?.message || String(error)
      },
      completedAt: timestamp(now)
    });
    onProgress?.({
      jobId: normalizedJob.id,
      type: normalizedJob.type,
      status: 'failed'
    });
    return result;
  }
  return resultFromGeneration({
    job: normalizedJob,
    generation,
    current,
    now,
    onProgress
  });
}

async function runSequential(options) {
  const results = [];
  for (const job of options.jobs) {
    results.push(await runOneSidecarJob({
      ...options,
      job
    }));
  }
  return results;
}

async function runConcurrent(options) {
  if (typeof options.generationRouter.batch !== 'function') {
    return Promise.all(options.jobs.map((job) => runOneSidecarJob({ ...options, job })));
  }
  for (const job of options.jobs) {
    options.onProgress?.({
      jobId: job.id,
      type: job.type,
      status: 'running'
    });
  }
  const generations = await options.generationRouter.batch(options.jobs.map((job) => ({
    roleId: job.roleId,
    request: sidecarRequest(job),
    timeoutMs: job.policy.timeoutMs
  })), {
    concurrent: true
  });
  return options.jobs.map((job, index) => resultFromGeneration({
    job,
    generation: generations[index],
    current: options.current,
    now: options.now,
    onProgress: options.onProgress
  }));
}

export async function runSidecarJobs({
  jobs = [],
  generationRouter,
  concurrent = false,
  onProgress = null,
  current = null,
  now = null
} = {}) {
  requireObject(generationRouter, 'generationRouter');
  if (typeof generationRouter.generate !== 'function') {
    throw new Error('generationRouter.generate must be a function');
  }
  const normalizedJobs = jobs.map(normalizeSidecarJob);
  onProgress?.({
    status: 'batch-started',
    jobCount: normalizedJobs.length,
    concurrent: concurrent === true
  });
  const options = {
    jobs: normalizedJobs,
    generationRouter,
    onProgress,
    current,
    now
  };
  const results = concurrent
    ? await runConcurrent(options)
    : await runSequential(options);
  onProgress?.({
    status: 'batch-complete',
    jobCount: normalizedJobs.length,
    concurrent: concurrent === true
  });
  return {
    kind: 'directive.sidecarBatchResult',
    concurrent: concurrent === true,
    results
  };
}
