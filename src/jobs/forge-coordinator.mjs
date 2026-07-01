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
import {
  createScenePhaseSealWorkerResult
} from './forge-scene-phase-seal.mjs';
import {
  createPressureArcDigestWorkerResult
} from './forge-pressure-arc-digest.mjs';
import {
  createOpenWorldBoundarySettlementWorkerResult
} from './forge-open-world-boundary-settlement.mjs';

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

function promptInstallGuardFromInput(input = {}) {
  if (typeof input.beforeInstallPrompt === 'function') return input.beforeInstallPrompt;
  if (typeof input.beforePromptInstall === 'function') return input.beforePromptInstall;
  return null;
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
  sourceFrame,
  cacheInputs = {}
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
    cacheInputs,
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
    errorCode: compactProviderErrorCode(result.error?.code, null)
  };
}

function compactProviderErrorCode(value, fallback = 'DIRECTIVE_FORGE_SIDECAR_PROVIDER_FAILED') {
  const code = String(value || '');
  if (
    /^DIRECTIVE_[A-Z0-9_:-]{1,80}$/.test(code)
    && !/(RAW|PROMPT|MESSAGE|TEXT|SECRET|PRIVATE)/.test(code)
  ) {
    return code;
  }
  return fallback;
}

function compactProviderWorkerError(error = null) {
  const code = compactProviderErrorCode(error?.code, 'DIRECTIVE_FORGE_SIDECAR_WORKER_FAILED');
  return {
    code,
    message: `FORGE provider worker failed (${code}).`
  };
}

function sanitizeProviderBatchResult(result = {}) {
  const safe = cloneJson(result || {});
  if (safe.error) {
    safe.error = compactProviderWorkerError(safe.error);
  }
  const diagnostics = result.diagnostics || {};
  safe.diagnostics = {
    transport: {
      ok: diagnostics.transport?.ok === true,
      status: diagnostics.transport?.status || null
    },
    feature: {
      status: diagnostics.feature?.status || null
    },
    providerId: diagnostics.providerId || null,
    providerKind: diagnostics.providerKind || null,
    model: diagnostics.model || null,
    latencyMs: Number.isFinite(Number(diagnostics.latencyMs)) ? Number(diagnostics.latencyMs) : null,
    packetHash: result.packet === undefined || result.packet === null ? null : hashStableJson(result.packet),
    errorCode: safe.error?.code || null
  };
  return safe;
}

function sanitizeProviderBatch(batch = {}) {
  return {
    ...cloneJson(batch),
    results: Array.isArray(batch.results)
      ? batch.results.map(sanitizeProviderBatchResult)
      : []
  };
}

function compactNonCriticalSettlementError(stage, error) {
  return {
    stage,
    code: error?.code || 'DIRECTIVE_FORGE_SETTLEMENT_NONCRITICAL_FAILED'
  };
}

function acceptedBatchEvidenceForInput(input = {}, workerResults = []) {
  const computedAcceptedBatchHash = Array.isArray(workerResults) && workerResults.length
    ? hashStableJson(workerResults)
    : null;
  const suppliedAcceptedBatchHash = input.acceptedBatchHash || input.workerResultsHash || null;
  return {
    acceptedBatchHash: computedAcceptedBatchHash || suppliedAcceptedBatchHash || null,
    computedAcceptedBatchHash,
    suppliedAcceptedBatchHash,
    mismatch: Boolean(
      computedAcceptedBatchHash
      && suppliedAcceptedBatchHash
      && computedAcceptedBatchHash !== suppliedAcceptedBatchHash
    )
  };
}

function cachedAcceptedBatchRequiresEvidence(cached = {}) {
  return Boolean(
    cached.acceptedBatchHash
    || cached.batch?.acceptedBatchHash
    || cached.applied === true
    || cached.background
    || (Array.isArray(cached.batch?.operations) && cached.batch.operations.length > 0)
    || (Array.isArray(cached.batch?.effectRefs) && cached.batch.effectRefs.length > 0)
  );
}

function cachedAcceptedBatchHash(cached = {}) {
  if (!cached || typeof cached !== 'object') return null;
  return [
    cached.acceptedBatchHash,
    cached.batch?.acceptedBatchHash,
    cached.background?.acceptedBatchHash,
    cached.background?.forgeBatchRef?.acceptedBatchHash,
    ...(Array.isArray(cached.background?.backgroundBatches)
      ? cached.background.backgroundBatches.flatMap((batch) => [
          batch?.acceptedBatchHash,
          batch?.forgeBatchRef?.acceptedBatchHash,
          batch?.batchRef?.acceptedBatchHash
        ])
      : [])
  ].find(Boolean) || null;
}

function acceptedBatchReplayMismatchResult({
  request,
  cached,
  acceptedBatchHash,
  providerOwner,
  diagnostic = null,
  reason = 'accepted-batch-replay-mismatch',
  replayed = true,
  suppliedAcceptedBatchHash = null,
  computedAcceptedBatchHash = null
} = {}) {
  return {
    status: 'rejected',
    applied: false,
    providerCallAttempted: false,
    providerOwner: providerOwner || null,
    reason,
    replayed,
    acceptedBatchHash,
    suppliedAcceptedBatchHash,
    computedAcceptedBatchHash,
    cachedAcceptedBatchHash: cachedAcceptedBatchHash(cached),
    cachedStatus: cached?.status || null,
    request: cloneJson(request || null),
    diagnostic
  };
}

function bundleEffectCount(bundle = {}) {
  return [
    bundle.backgroundEffectRefs,
    bundle.effectRefs,
    bundle.scenePhaseSealRefs,
    bundle.pressureArcDigestRefs,
    bundle.recallEntryRefs,
    bundle.rejectedRefs,
    bundle.staleResultRefs
  ].reduce((count, refs) => count + (Array.isArray(refs) ? refs.length : 0), 0);
}

function bundleOperationCount(bundle = {}) {
  return Array.isArray(bundle.operations) ? bundle.operations.length : 0;
}

function normalizeInternalBackgroundBundle(input = {}) {
  const bundle = cloneJson(input.bundle || input.operationBundle || {});
  const batchId = input.batchId || bundle.batchId || `forge-internal:${input.transactionId || 'no-transaction'}`;
  const idempotencyKey = input.idempotencyKey || bundle.idempotencyKey || batchId;
  const promptDirtyDomains = Array.isArray(input.promptDirtyDomains)
    ? input.promptDirtyDomains
    : (Array.isArray(bundle.promptDirtyDomains) ? bundle.promptDirtyDomains : []);
  return {
    ...bundle,
    batchId,
    idempotencyKey,
    phaseAfter: input.phaseAfter || bundle.phaseAfter || 'backgroundSettling',
    outcomeId: input.outcomeId || bundle.outcomeId || null,
    promptDirtyDomains,
    sourceToken: input.sourceToken || bundle.sourceToken || null,
    sourceFrameRef: input.sourceFrameRef || bundle.sourceFrameRef || null
  };
}

export function createForgeCoordinator({
  coreStore,
  lens = null,
  acceptedBatchPromptFlusher = null,
  commandBearingReviewPromptFlusher = null,
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
        backgroundEffectRefs: batch.backgroundEffectRefs || batch.effectRefs,
        scenePhaseSealRefs: batch.scenePhaseSealRefs,
        pressureArcDigestRefs: batch.pressureArcDigestRefs,
        recallEntryRefs: batch.recallIndexEntryRefs,
        recallRevisions: batch.recallRevisions,
        forgeBatchRef: {
          kind: 'directive.forgeBatchCommitRef.v1',
          batchId: batch.batchId,
          operationBundleHash: batch.operationBundleHash,
          acceptedBatchHash: batch.acceptedBatchHash,
          workerCount: batch.workers.length,
          operationCount: batch.operations.length
        }
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
      sourceFrame: input.sourceFrame || null,
      cacheInputs: batch.recallRevisions
    });
    const result = {
      status: hasEffects ? 'applied' : 'noChange',
      applied: hasEffects,
      providerCallAttempted: true,
      transactionId,
      acceptedBatchHash: batch.acceptedBatchHash || null,
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
      const rawBatch = await runBatch({
        jobs,
        concurrent: input.concurrent === true,
        onProgress: input.onProgress || null,
        current: input.current || null,
        now: input.now || clock
      });
      if (!rawBatch || !Array.isArray(rawBatch.results)) {
        throw new Error('FORGE provider batch callback must return a batch with results.');
      }
      const batch = sanitizeProviderBatch(rawBatch);
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
        errorCode: compactProviderErrorCode(error?.code, 'DIRECTIVE_FORGE_SIDECAR_PROVIDER_FAILED')
      });
      const errorCode = compactProviderErrorCode(error?.code, 'DIRECTIVE_FORGE_SIDECAR_PROVIDER_FAILED');
      const result = {
        status: 'failed',
        providerCallAttempted: true,
        providerOwner: 'forge',
        upstreamOwner: input.upstreamOwner || null,
        idempotencyKey,
        error: {
          code: errorCode
        },
        diagnostic
      };
      handled.set(handledKey, result);
      const sanitized = new Error(`FORGE provider batch failed (${result.error.code}).`);
      sanitized.code = result.error.code;
      sanitized.details = {
        status: result.status,
        providerOwner: result.providerOwner,
        upstreamOwner: result.upstreamOwner,
        diagnosticId: diagnostic?.id || null
      };
      throw sanitized;
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
    const workerResults = (Array.isArray(input.workerResults) ? input.workerResults : [])
      .map(normalizeProvidedWorkerResult);
    const acceptedEvidence = acceptedBatchEvidenceForInput(input, workerResults);
    const acceptedBatchHash = acceptedEvidence.acceptedBatchHash;
    if (acceptedEvidence.mismatch) {
      const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
        status: 'rejected',
        severity: 'warning',
        observedAt: input.observedAt || clock(),
        sourceToken: request.sourceToken,
        reason: 'accepted-batch-hash-mismatch',
        request,
        acceptedBatchHash,
        suppliedAcceptedBatchHash: acceptedEvidence.suppliedAcceptedBatchHash,
        computedAcceptedBatchHash: acceptedEvidence.computedAcceptedBatchHash,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null
      });
      return acceptedBatchReplayMismatchResult({
        request,
        cached: null,
        acceptedBatchHash,
        providerOwner: input.providerOwner,
        diagnostic,
        reason: 'accepted-batch-hash-mismatch',
        replayed: false,
        suppliedAcceptedBatchHash: acceptedEvidence.suppliedAcceptedBatchHash,
        computedAcceptedBatchHash: acceptedEvidence.computedAcceptedBatchHash
      });
    }
    if (handled.has(request.idempotencyKey)) {
      const cached = cloneJson(handled.get(request.idempotencyKey));
      const cachedHash = cachedAcceptedBatchHash(cached);
      if (
        (cachedAcceptedBatchRequiresEvidence(cached) && (!acceptedBatchHash || !cachedHash || cachedHash !== acceptedBatchHash))
      ) {
        const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
          status: 'rejected',
          severity: 'warning',
          observedAt: input.observedAt || clock(),
          sourceToken: request.sourceToken,
          reason: 'accepted-batch-replay-mismatch',
          request,
          acceptedBatchHash,
          suppliedAcceptedBatchHash: acceptedEvidence.suppliedAcceptedBatchHash,
          computedAcceptedBatchHash: acceptedEvidence.computedAcceptedBatchHash,
          cachedAcceptedBatchHash: cachedHash,
          cachedStatus: cached.status || null,
          providerCallAttempted: false,
          providerOwner: input.providerOwner || null
        });
        return acceptedBatchReplayMismatchResult({
          request,
          cached,
          acceptedBatchHash,
          providerOwner: input.providerOwner,
          diagnostic,
          suppliedAcceptedBatchHash: acceptedEvidence.suppliedAcceptedBatchHash,
          computedAcceptedBatchHash: acceptedEvidence.computedAcceptedBatchHash
        });
      }
      return {
        status: 'replayed',
        replayed: true,
        request: cloneJson(request),
        result: cached
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
        acceptedBatchHash,
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
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null
      });
      const result = {
        status: 'rejected',
        applied: false,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null,
        acceptedBatchHash,
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
      acceptedBatchHash,
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
        backgroundEffectRefs: batch.backgroundEffectRefs || batch.effectRefs,
        scenePhaseSealRefs: batch.scenePhaseSealRefs,
        pressureArcDigestRefs: batch.pressureArcDigestRefs,
        recallEntryRefs: batch.recallIndexEntryRefs,
        recallRevisions: batch.recallRevisions,
        forgeBatchRef: {
          kind: 'directive.forgeBatchCommitRef.v1',
          batchId: batch.batchId,
          operationBundleHash: batch.operationBundleHash,
          acceptedBatchHash,
          workerCount: batch.workers.length,
          operationCount: batch.operations.length
        }
      })
      : null;
    let diagnostic = null;
    let lensResult = null;
    const warnings = [];
    try {
      diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
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
    } catch (error) {
      if (!background) throw error;
      warnings.push(compactNonCriticalSettlementError('diagnostics', error));
    }
    if (input.flushLens === true) {
      try {
        lensResult = await maybeFlushLens(lens, {
          transactionId,
          promptDirtyDomains: batch.promptDirtyDomains,
          idempotencyKey: request.idempotencyKey,
          binding: input.binding || {},
          campaignContext: input.campaignContext || {},
          sourceFrame: input.sourceFrame || null,
          cacheInputs: batch.recallRevisions
        });
      } catch (error) {
        if (!background) throw error;
        warnings.push(compactNonCriticalSettlementError('lens', error));
      }
    }
    const result = {
      status: hasEffects ? 'settled' : 'noChange',
      applied: hasEffects,
      providerCallAttempted: false,
      providerOwner: input.providerOwner || null,
      transactionId,
      acceptedBatchHash,
      request,
      batch,
      background,
      diagnostic,
      lensResult,
      workerResults,
      warnings,
      warning: warnings[0] || null
    };
    handled.set(request.idempotencyKey, result);
    return result;
  }

  async function prepareAcceptedBatch(input = {}) {
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
    const workerResults = (Array.isArray(input.workerResults) ? input.workerResults : [])
      .map(normalizeProvidedWorkerResult);
    const acceptedEvidence = acceptedBatchEvidenceForInput(input, workerResults);
    const acceptedBatchHash = acceptedEvidence.acceptedBatchHash;
    if (acceptedEvidence.mismatch) {
      const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
        status: 'rejected',
        severity: 'warning',
        observedAt: input.observedAt || clock(),
        sourceToken: request.sourceToken,
        reason: 'accepted-batch-hash-mismatch',
        request,
        acceptedBatchHash,
        suppliedAcceptedBatchHash: acceptedEvidence.suppliedAcceptedBatchHash,
        computedAcceptedBatchHash: acceptedEvidence.computedAcceptedBatchHash,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null
      });
      return acceptedBatchReplayMismatchResult({
        request,
        cached: null,
        acceptedBatchHash,
        providerOwner: input.providerOwner,
        diagnostic,
        reason: 'accepted-batch-hash-mismatch',
        replayed: false,
        suppliedAcceptedBatchHash: acceptedEvidence.suppliedAcceptedBatchHash,
        computedAcceptedBatchHash: acceptedEvidence.computedAcceptedBatchHash
      });
    }
    if (handled.has(request.idempotencyKey)) {
      const cached = cloneJson(handled.get(request.idempotencyKey));
      const cachedHash = cachedAcceptedBatchHash(cached);
      if (
        (cachedAcceptedBatchRequiresEvidence(cached) && (!acceptedBatchHash || !cachedHash || cachedHash !== acceptedBatchHash))
      ) {
        const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
          status: 'rejected',
          severity: 'warning',
          observedAt: input.observedAt || clock(),
          sourceToken: request.sourceToken,
          reason: 'accepted-batch-replay-mismatch',
          request,
          acceptedBatchHash,
          suppliedAcceptedBatchHash: acceptedEvidence.suppliedAcceptedBatchHash,
          computedAcceptedBatchHash: acceptedEvidence.computedAcceptedBatchHash,
          cachedAcceptedBatchHash: cachedHash,
          cachedStatus: cached.status || null,
          providerCallAttempted: false,
          providerOwner: input.providerOwner || null
        });
        return acceptedBatchReplayMismatchResult({
          request,
          cached,
          acceptedBatchHash,
          providerOwner: input.providerOwner,
          diagnostic,
          suppliedAcceptedBatchHash: acceptedEvidence.suppliedAcceptedBatchHash,
          computedAcceptedBatchHash: acceptedEvidence.computedAcceptedBatchHash
        });
      }
      return {
        status: 'replayed',
        replayed: true,
        request: cloneJson(request),
        result: cached
      };
    }

    const observedAt = input.observedAt || clock();
    const sourceCheck = sourceCheckResult(await isSourceCurrent({
      phase: 'beforeAcceptedBridgeMutation',
      transactionId,
      sourceToken: request.sourceToken,
      sourceFrameRef: request.sourceFrameRef
    }));
    if (!sourceCheck.ok) {
      const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
        status: 'staleBeforeAcceptedBridgeMutation',
        severity: 'warning',
        observedAt,
        sourceToken: request.sourceToken,
        reason: sourceCheck.reason,
        request,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null
      });
      const result = {
        status: 'staleBeforeAcceptedBridgeMutation',
        applied: false,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null,
        acceptedBatchHash,
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
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null
      });
      const result = {
        status: 'rejected',
        applied: false,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || null,
        acceptedBatchHash,
        conflict,
        workerResults,
        diagnostic
      };
      handled.set(request.idempotencyKey, result);
      return result;
    }

    return {
      status: 'prepared',
      durable: false,
      applied: false,
      providerCallAttempted: false,
      providerOwner: input.providerOwner || null,
      transactionId,
      acceptedBatchHash,
      request,
      workerResults
    };
  }

  async function settleInternalBackgroundBatch(input = {}) {
    const transactionId = input.transactionId || input.bundle?.transactionId || input.operationBundle?.transactionId || null;
    const operationBundle = normalizeInternalBackgroundBundle({
      ...input,
      transactionId
    });
    const idempotencyKey = operationBundle.idempotencyKey;
    const handledKey = `forge-internal:${idempotencyKey}`;
    if (handled.has(handledKey)) {
      return {
        status: 'replayed',
        replayed: true,
        result: cloneJson(handled.get(handledKey))
      };
    }

    const observedAt = input.observedAt || clock();
    const sourceCheck = sourceCheckResult(await isSourceCurrent({
      phase: 'beforeInternalBackgroundCommit',
      transactionId,
      sourceToken: operationBundle.sourceToken,
      sourceFrameRef: operationBundle.sourceFrameRef,
      workerResults: cloneJson(operationBundle.workers || [])
    }));
    if (!sourceCheck.ok) {
      const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
        status: 'staleBeforeInternalBackgroundCommit',
        severity: 'warning',
        observedAt,
        sourceToken: operationBundle.sourceToken,
        sourceFrameRef: operationBundle.sourceFrameRef,
        reason: sourceCheck.reason,
        batchId: operationBundle.batchId,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || 'forge-internal',
        internalOwner: input.internalOwner || input.workerId || null
      });
      const result = {
        status: 'staleBeforeInternalBackgroundCommit',
        applied: false,
        providerCallAttempted: false,
        providerOwner: input.providerOwner || 'forge-internal',
        internalOwner: input.internalOwner || input.workerId || null,
        diagnostic
      };
      handled.set(handledKey, result);
      return result;
    }

    const operationCount = bundleOperationCount(operationBundle);
    const effectCount = bundleEffectCount(operationBundle);
    const workerCount = Array.isArray(operationBundle.workers) ? operationBundle.workers.length : 0;
    const hasEffects = operationCount > 0 || effectCount > 0;
    const background = hasEffects && typeof coreStore?.commitBackgroundBatch === 'function'
      ? await coreStore.commitBackgroundBatch(transactionId, operationBundle)
      : null;
    const diagnostic = await maybeAppendDiagnostics(coreStore, transactionId, {
      status: hasEffects ? 'internalSettled' : 'internalNoChange',
      severity: 'info',
      observedAt: clock(),
      sourceToken: operationBundle.sourceToken,
      sourceFrameRef: operationBundle.sourceFrameRef,
      providerCallAttempted: false,
      providerOwner: input.providerOwner || 'forge-internal',
      internalOwner: input.internalOwner || input.workerId || null,
      batchId: operationBundle.batchId,
      operationCount,
      effectCount,
      workerCount,
      operationBundleHash: hashStableJson(operationBundle),
      promptDirtyDomains: operationBundle.promptDirtyDomains || []
    });
    const lensResult = input.flushLens === true
      ? await maybeFlushLens(lens, {
        transactionId,
        promptDirtyDomains: operationBundle.promptDirtyDomains || [],
        idempotencyKey,
        binding: input.binding || {},
        campaignContext: input.campaignContext || {},
        sourceFrame: input.sourceFrame || null,
        cacheInputs: input.cacheInputs || operationBundle.recallRevisions || {}
      })
      : null;
    const result = {
      status: hasEffects ? 'internalSettled' : 'internalNoChange',
      applied: hasEffects,
      providerCallAttempted: false,
      providerOwner: input.providerOwner || 'forge-internal',
      internalOwner: input.internalOwner || input.workerId || null,
      transactionId,
      batchId: operationBundle.batchId,
      operationBundleHash: hashStableJson(operationBundle),
      operationCount,
      effectCount,
      workerCount,
      promptDirtyDomains: cloneJson(operationBundle.promptDirtyDomains || []),
      background,
      diagnostic,
      lensResult
    };
    handled.set(handledKey, result);
    return result;
  }

  async function settleScenePhaseSeal(input = {}) {
    const workerResult = createScenePhaseSealWorkerResult({
      ...input,
      seal: {
        ...(input.seal || {}),
        campaignId: input.campaignId || input.sourceFrameRef?.campaignId || input.sourceFrame?.campaignId || input.seal?.campaignId,
        saveId: input.saveId || input.sourceFrameRef?.saveId || input.sourceFrame?.saveId || input.seal?.saveId,
        transactionId: input.transactionId || input.seal?.transactionId,
        outcomeId: input.outcomeId || input.seal?.outcomeId,
        sourceFrameRef: input.sourceFrameRef || input.sourceFrame || input.seal?.sourceFrameRef
      }
    });
    return settleAcceptedBatch({
      ...input,
      batchId: input.batchId || `scene-phase-seal:${workerResult.seal.id}`,
      idempotencyKey: input.idempotencyKey || `scene-phase-seal:${input.transactionId || 'no-transaction'}:${workerResult.seal.sealHash}`,
      providerOwner: input.providerOwner || 'forge',
      promptDirtyDomains: input.promptDirtyDomains || workerResult.promptDirtyDomains,
      workerResults: [workerResult],
      flushLens: input.flushLens === true,
      phaseAfter: input.phaseAfter || 'backgroundSettling'
    });
  }

  async function settlePressureArcDigest(input = {}) {
    const workerResult = createPressureArcDigestWorkerResult({
      ...input,
      digest: {
        ...(input.digest || {}),
        campaignId: input.campaignId || input.sourceFrameRef?.campaignId || input.sourceFrame?.campaignId || input.digest?.campaignId,
        saveId: input.saveId || input.sourceFrameRef?.saveId || input.sourceFrame?.saveId || input.digest?.saveId,
        transactionId: input.transactionId || input.digest?.transactionId,
        outcomeId: input.outcomeId || input.digest?.outcomeId,
        sourceFrameRef: input.sourceFrameRef || input.sourceFrame || input.digest?.sourceFrameRef
      }
    });
    return settleAcceptedBatch({
      ...input,
      batchId: input.batchId || `pressure-arc-digest:${workerResult.digest.id}`,
      idempotencyKey: input.idempotencyKey || `pressure-arc-digest:${input.transactionId || 'no-transaction'}:${workerResult.digest.digestHash}`,
      providerOwner: input.providerOwner || 'forge',
      promptDirtyDomains: input.promptDirtyDomains || workerResult.promptDirtyDomains,
      workerResults: [workerResult],
      flushLens: input.flushLens === true,
      phaseAfter: input.phaseAfter || 'backgroundSettling'
    });
  }

  async function settleOpenWorldBoundary(input = {}) {
    const workerResult = createOpenWorldBoundarySettlementWorkerResult({
      ...input,
      settlement: {
        ...(input.settlement || {}),
        campaignId: input.campaignId || input.sourceFrameRef?.campaignId || input.sourceFrame?.campaignId || input.settlement?.campaignId,
        saveId: input.saveId || input.sourceFrameRef?.saveId || input.sourceFrame?.saveId || input.settlement?.saveId,
        transactionId: input.transactionId || input.settlement?.transactionId,
        outcomeId: input.outcomeId || input.settlement?.outcomeId,
        sourceFrameRef: input.sourceFrameRef || input.sourceFrame || input.settlement?.sourceFrameRef,
        reducerRef: input.reducerRef || input.settlement?.reducerRef,
        reducerBundle: input.reducerBundle || input.settlement?.reducerBundle,
        boundaryType: input.boundaryType || input.settlement?.boundaryType,
        turnId: input.turnId || input.settlement?.turnId,
        sceneId: input.sceneId || input.settlement?.sceneId,
        phaseId: input.phaseId || input.settlement?.phaseId,
        locationId: input.locationId || input.settlement?.locationId,
        tags: input.tags || input.settlement?.tags,
        keywords: input.keywords || input.settlement?.keywords
      }
    });
    return settleAcceptedBatch({
      ...input,
      batchId: input.batchId || `open-world-boundary:${workerResult.settlement.id}`,
      idempotencyKey: input.idempotencyKey || `open-world-boundary:${input.transactionId || 'no-transaction'}:${workerResult.settlement.settlementHash}`,
      providerOwner: input.providerOwner || 'forge',
      promptDirtyDomains: input.promptDirtyDomains || workerResult.promptDirtyDomains,
      workerResults: [workerResult],
      flushLens: input.flushLens === true,
      phaseAfter: input.phaseAfter || 'backgroundSettling'
    });
  }

  async function flushAcceptedBatchPrompt(input = {}) {
    const idempotencyKey = input.promptSyncIdempotencyKey || input.idempotencyKey;
    if (!idempotencyKey) return null;
    if (typeof acceptedBatchPromptFlusher !== 'function') return null;
    return acceptedBatchPromptFlusher({
      ...input,
      idempotencyKey,
      promptSyncIdempotencyKey: idempotencyKey,
      transactionId: input.transactionId || null,
      promptDirtyDomains: cloneJson(input.promptDirtyDomains || []),
      binding: cloneJson(input.binding || {}),
      campaignContext: cloneJson(input.campaignContext || {}),
      sourceFrameRef: cloneJson(input.sourceFrameRef || null),
      sourceFrame: cloneJson(input.sourceFrame || input.sourceFrameRef || null),
      cacheInputs: cloneJson(input.cacheInputs || {}),
      beforeInstallPrompt: promptInstallGuardFromInput(input)
    });
  }

  async function flushCommandBearingReviewPrompt(input = {}) {
    const idempotencyKey = input.promptSyncIdempotencyKey || input.idempotencyKey;
    if (!idempotencyKey) return null;
    if (typeof commandBearingReviewPromptFlusher !== 'function') return null;
    return commandBearingReviewPromptFlusher({
      campaignState: cloneJson(input.campaignState || null),
      promptDirtyDomains: cloneJson(input.promptDirtyDomains || []),
      binding: cloneJson(input.binding || {}),
      campaignContext: cloneJson(input.campaignContext || {}),
      sourceFrameRef: cloneJson(input.sourceFrameRef || null),
      sourceFrame: cloneJson(input.sourceFrame || input.sourceFrameRef || null),
      sourceToken: input.sourceToken || input.promptFrame?.sourceToken || null,
      cacheInputs: cloneJson(input.cacheInputs || {}),
      promptFrame: cloneJson(input.promptFrame || {}),
      idempotencyKey,
      promptSyncIdempotencyKey: idempotencyKey,
      transactionId: input.transactionId || null,
      workerKey: input.workerKey || input.promptFrame?.workerKey || 'commandBearing',
      commandBearingReview: input.commandBearingReview === true || input.promptFrame?.commandBearingReview === true,
      commitRuntimeState: input.commitRuntimeState !== false,
      beforeInstallPrompt: promptInstallGuardFromInput(input),
      activityReporter: input.activityReporter || null,
      activitySource: input.activitySource || null,
      activityMode: input.activityMode || null,
      activityContext: cloneJson(input.activityContext || {})
    });
  }

  return {
    run,
    runProviderBatch,
    prepareAcceptedBatch,
    settleAcceptedBatch,
    flushAcceptedBatchPrompt,
    flushCommandBearingReviewPrompt,
    settleInternalBackgroundBatch,
    settleScenePhaseSeal,
    settlePressureArcDigest,
    settleOpenWorldBoundary
  };
}
