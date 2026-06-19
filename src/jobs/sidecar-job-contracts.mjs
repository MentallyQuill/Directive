export const SIDECAR_JOB_STATUSES = Object.freeze([
  'queued',
  'running',
  'complete',
  'timeout',
  'cancelled',
  'failed',
  'stale'
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizePolicy(policy = {}) {
  return {
    blocking: policy.blocking === true,
    timeoutMs: Math.max(1, Number(policy.timeoutMs || 30000)),
    cancelOnChatSwitch: policy.cancelOnChatSwitch !== false,
    mayProposeState: policy.mayProposeState === true,
    mayInjectPrompt: policy.mayInjectPrompt === true
  };
}

export function normalizeSidecarJob(job = {}) {
  requireObject(job, 'sidecar job');
  const id = requireNonEmptyString(job.id, 'sidecar job id');
  const type = requireNonEmptyString(job.type, 'sidecar job type');
  const roleId = requireNonEmptyString(job.roleId || type, 'sidecar job roleId');
  requireObject(job.source || {}, 'sidecar job source');
  requireObject(job.snapshot || {}, 'sidecar job snapshot');
  return {
    id,
    type,
    roleId,
    source: cloneJson(job.source || {}),
    snapshot: cloneJson(job.snapshot || {}),
    request: cloneJson(job.request || {}),
    policy: normalizePolicy(job.policy || {})
  };
}

export function createSidecarResult({
  job,
  status,
  packet = null,
  proposedStateDelta = null,
  playerVisibleSummary = null,
  diagnostics = {},
  error = null,
  completedAt = null
}) {
  const normalizedJob = normalizeSidecarJob(job);
  if (!SIDECAR_JOB_STATUSES.includes(status)) {
    throw new Error(`Unknown sidecar job status "${status}"`);
  }
  return {
    kind: 'directive.sidecarResult',
    jobId: normalizedJob.id,
    type: normalizedJob.type,
    roleId: normalizedJob.roleId,
    status,
    source: cloneJson(normalizedJob.source),
    completedAt,
    diagnostics: cloneJson(diagnostics || {}),
    packet: cloneJson(packet),
    proposedStateDelta: cloneJson(proposedStateDelta),
    playerVisibleSummary,
    error: error ? {
      code: error.code || 'DIRECTIVE_SIDECAR_FAILED',
      message: error.message || String(error)
    } : null
  };
}

export function isSidecarResultStale(result, current = {}) {
  if (!isObject(result?.source)) {
    return true;
  }
  if (current.campaignId && result.source.campaignId && current.campaignId !== result.source.campaignId) {
    return true;
  }
  if (current.saveId && result.source.saveId && current.saveId !== result.source.saveId) {
    return true;
  }
  if (current.turnId && result.source.turnId && current.turnId !== result.source.turnId) {
    return true;
  }
  if (current.revision !== undefined && result.source.revision !== undefined && current.revision !== result.source.revision) {
    return true;
  }
  return false;
}
