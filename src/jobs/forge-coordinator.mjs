import {
  createForgeBatchCommit,
  findForgePathConflict,
  normalizeForgeRunRequest,
  normalizeForgeWorkerResult
} from './forge-contracts.mjs';
import {
  hashStableJson,
  redactExternalDiagnostic
} from '../runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function redacted(payload = {}) {
  const redactions = [];
  const redactedPayload = redactExternalDiagnostic(payload, redactions);
  return { redactedPayload, redactions };
}

function sourceCheckResult(value) {
  if (value === false) return { ok: false, reason: 'source-token-stale' };
  if (value && typeof value === 'object') return { ok: value.ok !== false, reason: value.reason || null };
  return { ok: true, reason: null };
}

async function maybeAppendDiagnostics(coreStore, transactionId, payload = {}) {
  if (!transactionId || typeof coreStore?.appendDiagnostics !== 'function') return null;
  const { redactedPayload } = redacted({
    type: 'forge',
    ...payload
  });
  return coreStore.appendDiagnostics(transactionId, redactedPayload);
}

async function maybeFlushLens(lens, {
  transactionId,
  promptDirtyDomains,
  idempotencyKey,
  binding,
  campaignContext,
  sourceFrame
} = {}) {
  if (!lens || !promptDirtyDomains?.length) return null;
  const markDirty = lens.markDirty || lens.enqueueDirty;
  if (typeof markDirty === 'function') {
    markDirty.call(lens, {
      lane: 'background',
      source: 'forge',
      dirtyDomains: promptDirtyDomains,
      idempotencyKey: `forge-dirty:${idempotencyKey}`
    });
  }
  const flushBackground = lens.flushBackground || lens.flush;
  if (typeof flushBackground !== 'function') return null;
  return flushBackground.call(lens, {
    transactionId,
    lane: 'background',
    binding,
    campaignContext,
    promptFrame: {
      turnSourceHash: sourceFrame?.sourceHash || sourceFrame?.textHash || sourceFrame?.id || null
    },
    reason: 'forge-background-batch',
    idempotencyKey: `forge-lens:${idempotencyKey}`
  });
}

function normalizeProvidedWorkerResult(result = {}) {
  if (result?.kind === 'directive.forgeWorkerResult.v1') return cloneJson(result);
  return normalizeForgeWorkerResult({
    id: result.workerId || result.id,
    workerId: result.workerId || result.id,
    roleId: result.roleId || result.role,
    allowedRoots: result.allowedRoots || []
  }, result);
}

function compactSidecarJobPlan(job = {}) {
  return {
    jobId: job.id || null,
    type: job.type || job.workerKey || null,
    roleId: job.roleId || job.worker?.roleId || null,
    sourceToken: job.sourceIngress?.sourceToken || job.source?.sourceToken || null,
    sourceFrameId: job.sourceIngress?.sourceFrameRef?.id || job.source?.sourceFrameRef?.id || null,
    coreTransactionId: job.sourceIngress?.coreTransactionId || null,
    timeoutMs: Number.isFinite(Number(job.policy?.timeoutMs)) ? Number(job.policy.timeoutMs) : null,
    requestHash: hashStableJson({
      roleId: job.roleId || null,
      systemPrompt: job.request?.systemPrompt || null,
      prompt: job.request?.prompt || null,
      maxTokens: job.request?.maxTokens || null
    })
  };
}

function compactSidecarExecutionResult(result = {}) {
  return {
    jobId: result.jobId || null,
    type: result.type || null,
    roleId: result.roleId || null,
    status: result.status || null,
    completedAt: result.completedAt || null,
    transportOk: result.diagnostics?.transport?.ok === true,
    featureStatus: result.diagnostics?.feature?.status || null,
    providerId: result.diagnostics?.providerId || null,
    providerKind: result.diagnostics?.providerKind || null,
    model: result.diagnostics?.model || null,
    latencyMs: Number.isFinite(Number(result.diagnostics?.latencyMs)) ? Number(result.diagnostics.latencyMs) : null,
    packetHash: result.packet === undefined || result.packet === null ? null : hashStableJson(result.packet),
    errorCode: result.error?.code || null
  };
}

export function createForgeCoordinator({
  coreStore,
  lens = null,
  clock = () => new Date().toISOString(),
  isSourceCurrent = async () => ({ ok: true })
} = {}) {
  if (!coreStore?.commitBackgroundBatch && !coreStore?.appendDiagnostics) {
    throw new Error('createForgeCoordinator requires CORE ports');
  }

  const handled = new Map();

  async function run(input = {}) {
    const request = normalizeForgeRunRequest(input);
    const transactionId = request.transactionId;
    if (handled.has(request.idempotencyKey)) {
      return {
        status: 'replayed',
        replayed: true,
        request: cloneJson(request),
        result: cloneJson(handled.get(request.idempotencyKey))
      };
    }

    const observedAt = input.observedAt || clock();
    const preflight = sourceCheckResult(await isSourceCurrent({
      phase: 'preflight',
      transactionId,
      sourceToken: request.sourceToken,
      sourceFrameRef: request.sourceFrameRef
    }));
    if (input.signal?.aborted || !preflight.ok) {
      const status = input.signal?.aborted ? 'canceledBeforeProvider' : 'staleBeforeProvider';
      const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
        status,
        severity: 'warning',
        observedAt,
        sourceToken: request.sourceToken,
        reason: input.signal?.aborted ? 'abort-signal' : preflight.reason,
        request,
        providerCallAttempted: false
      });
      const result = {
        status,
        applied: false,
        providerCallAttempted: false,
        diagnostic
      };
      handled.set(request.idempotencyKey, result);
      return result;
    }

    const workerResults = await Promise.all((input.workers || []).map(async (worker) => {
      const workerResult = typeof worker.run === 'function'
        ? await worker.run({
          transactionId,
          sourceToken: request.sourceToken,
          sourceFrame: cloneJson(input.sourceFrame || null),
          sourceFrameRef: cloneJson(request.sourceFrameRef || null),
          committedOutcomeId: request.committedOutcomeId || null,
          hostContinuationId: request.hostContinuationId || null,
          baseRevisions: cloneJson(request.baseRevisions || {}),
          signal: input.signal || null
        })
        : { status: 'skipped', diagnostics: { reason: 'worker-runner-missing' } };
      return normalizeForgeWorkerResult(worker, workerResult || {});
    }));

    const recheck = sourceCheckResult(await isSourceCurrent({
      phase: 'beforeApply',
      transactionId,
      sourceToken: request.sourceToken,
      sourceFrameRef: request.sourceFrameRef,
      workerResults: cloneJson(workerResults)
    }));
    if (input.signal?.aborted || !recheck.ok) {
      const status = input.signal?.aborted ? 'canceledAfterProvider' : 'staleAfterProvider';
      const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
        status,
        severity: 'warning',
        observedAt: clock(),
        sourceToken: request.sourceToken,
        reason: input.signal?.aborted ? 'abort-signal' : recheck.reason,
        request,
        workerResults,
        providerCallAttempted: true
      });
      const result = {
        status,
        applied: false,
        providerCallAttempted: true,
        workerResults,
        diagnostic
      };
      handled.set(request.idempotencyKey, result);
      return result;
    }

    const conflict = findForgePathConflict(workerResults);
    if (conflict) {
      const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
        status: 'rejected',
        severity: 'warning',
        observedAt: clock(),
        sourceToken: request.sourceToken,
        reason: 'path-conflict',
        conflict,
        request,
        workerResults,
        providerCallAttempted: true
      });
      const result = {
        status: 'rejected',
        applied: false,
        providerCallAttempted: true,
        conflict,
        workerResults,
        diagnostic
      };
      handled.set(request.idempotencyKey, result);
      return result;
    }

    const batch = createForgeBatchCommit({
      ...request,
      sourceFrame: input.sourceFrame,
      sourceFrameRef: request.sourceFrameRef,
      workerResults,
      batchId: input.batchId,
      idempotencyKey: request.idempotencyKey
    });
    const hasEffects = batch.operations.length > 0 || batch.effectRefs.length > 0;
    const background = hasEffects && typeof coreStore?.commitBackgroundBatch === 'function'
      ? await coreStore.commitBackgroundBatch(transactionId, {
        batchId: batch.batchId,
        idempotencyKey: request.idempotencyKey,
        baseMechanicsRevision: batch.baseMechanicsRevision,
        phaseAfter: input.phaseAfter || 'backgroundSettling',
        promptDirtyDomains: batch.promptDirtyDomains,
        operations: batch.operations,
        workers: batch.workers,
        sourceToken: batch.sourceToken,
        sourceFrameRef: batch.sourceFrameRef,
        effectRefs: batch.effectRefs
      })
      : null;
    const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
      status: hasEffects ? 'applied' : 'noChange',
      severity: 'info',
      observedAt: clock(),
      sourceToken: request.sourceToken,
      providerCallAttempted: true,
      operationCount: batch.operations.length,
      effectCount: batch.effectRefs.length,
      operationBundleHash: batch.operationBundleHash || hashStableJson(batch.operations),
      promptDirtyDomains: batch.promptDirtyDomains,
      workerResults
    });
    const lensResult = await maybeFlushLens(lens, {
      transactionId,
      promptDirtyDomains: batch.promptDirtyDomains,
      idempotencyKey: request.idempotencyKey,
      binding: input.binding || {},
      campaignContext: input.campaignContext || {},
      sourceFrame: input.sourceFrame || null
    });
    const result = {
      status: hasEffects ? 'applied' : 'noChange',
      applied: hasEffects,
      providerCallAttempted: true,
      transactionId,
      request,
      batch,
      background,
      diagnostic,
      lensResult,
      workerResults
    };
    handled.set(request.idempotencyKey, result);
    return result;
  }

  async function runProviderBatch(input = {}) {
    const jobs = Array.isArray(input.jobs) ? input.jobs : [];
    const transactionId = input.transactionId || null;
    const runBatch = typeof input.runProviderBatch === 'function'
      ? input.runProviderBatch
      : input.runBatch;
    if (typeof runBatch !== 'function') {
      throw new Error('FORGE provider batch requires a runProviderBatch callback.');
    }
    const idempotencyKey = input.idempotencyKey || `provider-batch:${transactionId || 'no-transaction'}:${hashStableJson(jobs.map(compactSidecarJobPlan)).slice(0, 16)}`;
    const handledKey = `forge-provider:${idempotencyKey}`;
    if (handled.has(handledKey)) {
      const cached = cloneJson(handled.get(handledKey));
      return {
        ...cached,
        status: 'replayed',
        originalStatus: cached.status || null,
        replayed: true,
      };
    }
    const observedAt = input.observedAt || clock();
    try {
      const batch = await runBatch({
        jobs,
        concurrent: input.concurrent === true,
        onProgress: input.onProgress || null,
        current: input.current || null,
        now: input.now || clock
      });
      if (!batch || !Array.isArray(batch.results)) {
        throw new Error('FORGE provider batch callback must return a batch with results.');
      }
      const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
        status: 'providerBatchComplete',
        severity: 'info',
        observedAt,
        sourceToken: input.sourceToken || null,
        sourceFrameRef: input.sourceFrameRef || null,
        providerCallAttempted: true,
        providerOwner: 'forge',
        upstreamOwner: input.upstreamOwner || null,
        concurrent: batch.concurrent === true,
        jobCount: jobs.length,
        jobs: jobs.map(compactSidecarJobPlan),
        results: batch.results.map(compactSidecarExecutionResult)
      });
      const result = {
        status: 'complete',
        providerCallAttempted: true,
        providerOwner: 'forge',
        upstreamOwner: input.upstreamOwner || null,
        idempotencyKey,
        batch,
        diagnostic
      };
      handled.set(handledKey, result);
      return cloneJson(result);
    } catch (error) {
      const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
        status: 'providerBatchFailed',
        severity: 'warning',
        observedAt: clock(),
        sourceToken: input.sourceToken || null,
        sourceFrameRef: input.sourceFrameRef || null,
        providerCallAttempted: true,
        providerOwner: 'forge',
        upstreamOwner: input.upstreamOwner || null,
        jobCount: jobs.length,
        jobs: jobs.map(compactSidecarJobPlan),
        errorCode: error?.code || 'DIRECTIVE_FORGE_SIDECAR_PROVIDER_FAILED',
        errorMessage: error?.message || String(error)
      });
      const result = {
        status: 'failed',
        providerCallAttempted: true,
        providerOwner: 'forge',
        upstreamOwner: input.upstreamOwner || null,
        idempotencyKey,
        error: {
          code: error?.code || 'DIRECTIVE_FORGE_SIDECAR_PROVIDER_FAILED',
          message: error?.message || String(error)
        },
        diagnostic
      };
      handled.set(handledKey, result);
      throw error;
    }
  }

  async function settleAcceptedBatch(input = {}) {
    const request = normalizeForgeRunRequest({
      ...input,
      workers: Array.isArray(input.workerResults)
        ? input.workerResults.map((result) => ({
          id: result.workerId || result.id,
          workerId: result.workerId || result.id,
          roleId: result.roleId || result.role,
          allowedRoots: result.allowedRoots || []
        }))
        : input.workers
    });
    const transactionId = request.transactionId;
    if (handled.has(request.idempotencyKey)) {
      return {
        status: 'replayed',
        replayed: true,
        request: cloneJson(request),
        result: cloneJson(handled.get(request.idempotencyKey))
      };
    }

    const observedAt = input.observedAt || clock();
    const sourceCheck = sourceCheckResult(await isSourceCurrent({
      phase: 'beforeBackgroundCommit',
      transactionId,
      sourceToken: request.sourceToken,
      sourceFrameRef: request.sourceFrameRef
    }));
    if (!sourceCheck.ok) {
      const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
        status: 'staleBeforeBackgroundCommit',
        severity: 'warning',
        observedAt,
        sourceToken: request.sourceToken,
        reason: sourceCheck.reason,
        request,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null
      });
      const result = {
        status: 'staleBeforeBackgroundCommit',
        applied: false,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null,
        diagnostic
      };
      handled.set(request.idempotencyKey, result);
      return result;
    }

    const workerResults = (Array.isArray(input.workerResults) ? input.workerResults : [])
      .map(normalizeProvidedWorkerResult);
    const conflict = findForgePathConflict(workerResults);
    if (conflict) {
      const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
        status: 'rejected',
        severity: 'warning',
        observedAt: clock(),
        sourceToken: request.sourceToken,
        reason: 'path-conflict',
        conflict,
        request,
        workerResults,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null
      });
      const result = {
        status: 'rejected',
        applied: false,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null,
        conflict,
        workerResults,
        diagnostic
      };
      handled.set(request.idempotencyKey, result);
      return result;
    }

    const batch = createForgeBatchCommit({
      ...request,
      sourceFrame: input.sourceFrame,
      sourceFrameRef: request.sourceFrameRef,
      sourceToken: request.sourceToken,
      promptDirtyDomains: input.promptDirtyDomains || [],
      workerResults,
      batchId: input.batchId,
      idempotencyKey: request.idempotencyKey,
      baseMechanicsRevision: input.baseMechanicsRevision
    });
    const hasEffects = batch.operations.length > 0 || batch.effectRefs.length > 0;
    const background = hasEffects && typeof coreStore?.commitBackgroundBatch === 'function'
      ? await coreStore.commitBackgroundBatch(transactionId, {
        batchId: batch.batchId,
        idempotencyKey: request.idempotencyKey,
        baseMechanicsRevision: batch.baseMechanicsRevision,
        phaseAfter: input.phaseAfter || 'backgroundSettling',
        outcomeId: input.outcomeId || null,
        promptDirtyDomains: batch.promptDirtyDomains,
        operations: batch.operations,
        workers: batch.workers,
        sourceToken: batch.sourceToken,
        sourceFrameRef: batch.sourceFrameRef,
        backgroundEffectRefs: batch.effectRefs,
        forgeBatchRef: {
          kind: 'directive.forgeBatchCommitRef.v1',
          batchId: batch.batchId,
          operationBundleHash: batch.operationBundleHash,
          workerCount: batch.workers.length,
          operationCount: batch.operations.length
        }
      })
      : null;
    const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
      status: hasEffects ? 'settled' : 'noChange',
      severity: 'info',
      observedAt: clock(),
      sourceToken: request.sourceToken,
      providerCallAttempted: false,
      providerOwner: input.providerOwner || null,
      operationCount: batch.operations.length,
      effectCount: batch.effectRefs.length,
      operationBundleHash: batch.operationBundleHash || hashStableJson(batch.operations),
      promptDirtyDomains: batch.promptDirtyDomains,
      workerResults
    });
    const lensResult = input.flushLens === true
      ? await maybeFlushLens(lens, {
        transactionId,
        promptDirtyDomains: batch.promptDirtyDomains,
        idempotencyKey: request.idempotencyKey,
        binding: input.binding || {},
        campaignContext: input.campaignContext || {},
        sourceFrame: input.sourceFrame || null
      })
      : null;
    const result = {
      status: hasEffects ? 'settled' : 'noChange',
      applied: hasEffects,
      providerCallAttempted: false,
      providerOwner: input.providerOwner || null,
      transactionId,
      request,
      batch,
      background,
      diagnostic,
      lensResult,
      workerResults
    };
    handled.set(request.idempotencyKey, result);
    return result;
  }

  return { run, runProviderBatch, settleAcceptedBatch };
}
