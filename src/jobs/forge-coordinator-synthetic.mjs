import {
  hashStableJson,
  redactExternalDiagnostic
} from '../runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const text = asString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function rootOf(path = '') {
  return String(path || '').split('.')[0] || null;
}

function sourceCheckResult(value) {
  if (value === false) return { ok: false, reason: 'source-token-stale' };
  if (value && typeof value === 'object') return { ok: value.ok !== false, reason: value.reason || null };
  return { ok: true, reason: null };
}

function normalizeOperation(operation = {}, worker = {}) {
  const path = asString(operation.path);
  const domain = asString(operation.domain || rootOf(path));
  const op = asString(operation.op || operation.operation);
  if (!path || !domain || !op) return null;
  const allowedRoots = Array.isArray(worker.allowedRoots) ? worker.allowedRoots : [];
  if (allowedRoots.length && !allowedRoots.includes(domain)) {
    return {
      rejected: true,
      reason: 'forbidden-root',
      path,
      domain,
      workerId: worker.id || worker.workerId || null
    };
  }
  return compact({
    domain,
    op,
    path,
    summary: operation.summary || null,
    value: operation.value,
    valueHash: operation.value === undefined ? operation.valueHash || null : hashStableJson(operation.value),
    workerId: worker.id || worker.workerId || null
  });
}

function normalizeWorkerResult(worker = {}, result = {}) {
  const operations = [];
  const rejected = [];
  for (const operation of Array.isArray(result.operations) ? result.operations : []) {
    const normalized = normalizeOperation(operation, worker);
    if (!normalized) continue;
    if (normalized.rejected) rejected.push(normalized);
    else operations.push(normalized);
  }
  return {
    workerId: worker.id || worker.workerId,
    status: rejected.length ? 'partial' : 'accepted',
    operations,
    rejectedOperations: rejected,
    promptDirtyDomains: uniqueStrings(result.promptDirtyDomains || operations.map((operation) => operation.domain)),
    diagnostics: cloneJson(result.diagnostics || {}),
    rawPrompt: result.rawPrompt,
    rawResponse: result.rawResponse
  };
}

function firstPathConflict(results = []) {
  const seen = new Map();
  for (const result of results) {
    for (const operation of result.operations || []) {
      const path = operation.path;
      if (!path) continue;
      if (seen.has(path)) {
        return {
          path,
          firstWorkerId: seen.get(path),
          secondWorkerId: result.workerId
        };
      }
      seen.set(path, result.workerId);
    }
  }
  return null;
}

function redacted(payload = {}) {
  const redactions = [];
  const redactedPayload = redactExternalDiagnostic(payload, redactions);
  return { redactedPayload, redactions };
}

export function createSyntheticForgeCoordinator({
  coreStore,
  lens = null,
  clock = () => new Date().toISOString(),
  isSourceCurrent = () => true
} = {}) {
  if (!coreStore?.commitBackgroundBatch || !coreStore?.appendDiagnostics) {
    throw new Error('createSyntheticForgeCoordinator requires a CORE Store instance');
  }

  const handled = new Set();

  async function appendForgeDiagnostics(transactionId, payload = {}) {
    return coreStore.appendDiagnostics(transactionId, {
      type: 'forge',
      ...payload
    });
  }

  async function run(input = {}) {
    const transactionId = asString(input.transactionId);
    const idempotencyKey = input.idempotencyKey || `forge:${transactionId}:${input.sourceToken || 'source'}`;
    if (handled.has(idempotencyKey)) {
      return {
        status: 'replayed',
        replayed: true,
        transactionId
      };
    }
    const sourceToken = asString(input.sourceToken);
    const workers = Array.isArray(input.workers) ? input.workers : [];
    const observedAt = input.observedAt || clock();
    const preflight = sourceCheckResult(await isSourceCurrent({
      phase: 'preflight',
      transactionId,
      sourceToken,
      sourceFrame: cloneJson(input.sourceFrame || null)
    }));
    if (input.signal?.aborted) {
      const diagnostic = await appendForgeDiagnostics(transactionId, {
        status: 'canceledBeforeProvider',
        severity: 'warning',
        observedAt,
        sourceToken,
        reason: 'abort-signal',
        providerCallAttempted: false,
        workerCount: workers.length
      });
      handled.add(idempotencyKey);
      return {
        status: 'canceled',
        providerCallAttempted: false,
        applied: false,
        diagnostic
      };
    }
    if (!preflight.ok) {
      const diagnostic = await appendForgeDiagnostics(transactionId, {
        status: 'staleBeforeProvider',
        severity: 'warning',
        observedAt,
        sourceToken,
        reason: preflight.reason || 'source-token-stale',
        providerCallAttempted: false,
        workerCount: workers.length
      });
      handled.add(idempotencyKey);
      return {
        status: 'staleBeforeProvider',
        providerCallAttempted: false,
        applied: false,
        reason: preflight.reason,
        diagnostic
      };
    }

    const workerPayloads = await Promise.all(workers.map(async (worker) => {
      const result = await worker.run({
        transactionId,
        sourceToken,
        sourceFrame: cloneJson(input.sourceFrame || null),
        committedOutcomeId: input.committedOutcomeId || null,
        materializedHead: cloneJson(input.materializedHead || null),
        cpmDigest: cloneJson(input.cpmDigest || null),
        requestedEffects: cloneJson(input.requestedEffects || {}),
        signal: input.signal || null
      });
      return normalizeWorkerResult(worker, result || {});
    }));

    const recheck = sourceCheckResult(await isSourceCurrent({
      phase: 'beforeApply',
      transactionId,
      sourceToken,
      sourceFrame: cloneJson(input.sourceFrame || null),
      workerResults: cloneJson(workerPayloads)
    }));
    if (!recheck.ok || input.signal?.aborted) {
      const { redactedPayload } = redacted({
        status: input.signal?.aborted ? 'canceledAfterProvider' : 'staleAfterProvider',
        severity: 'warning',
        observedAt: clock(),
        sourceToken,
        reason: input.signal?.aborted ? 'abort-signal' : (recheck.reason || 'source-token-stale-before-apply'),
        providerCallAttempted: true,
        workerResults: workerPayloads,
        externalContextOutputs: input.externalContextOutputs
      });
      const diagnostic = await appendForgeDiagnostics(transactionId, redactedPayload);
      handled.add(idempotencyKey);
      return {
        status: redactedPayload.status,
        providerCallAttempted: true,
        applied: false,
        workerResults: workerPayloads,
        diagnostic
      };
    }

    const conflict = firstPathConflict(workerPayloads);
    if (conflict) {
      const diagnostic = await appendForgeDiagnostics(transactionId, {
        status: 'rejected',
        severity: 'warning',
        observedAt: clock(),
        sourceToken,
        reason: 'path-conflict',
        conflict,
        providerCallAttempted: true,
        workerResults: workerPayloads
      });
      handled.add(idempotencyKey);
      return {
        status: 'rejected',
        providerCallAttempted: true,
        applied: false,
        conflict,
        workerResults: workerPayloads,
        diagnostic
      };
    }

    const operations = workerPayloads.flatMap((result) => result.operations || []);
    const promptDirtyDomains = uniqueStrings(workerPayloads.flatMap((result) => result.promptDirtyDomains || []));
    const background = operations.length
      ? await coreStore.commitBackgroundBatch(transactionId, {
        baseMechanicsRevision: input.baseRevisions?.mechanics,
        idempotencyKey,
        batchId: input.batchId || `forge:${transactionId}`,
        phaseAfter: input.phaseAfter || 'backgroundSettling',
        promptDirtyDomains,
        operations,
        workers: workerPayloads.map((result) => ({
          workerId: result.workerId,
          status: result.status,
          operationCount: result.operations.length,
          rejectedOperationCount: result.rejectedOperations.length
        }))
      })
      : null;
    const { redactedPayload } = redacted({
      status: operations.length ? 'applied' : 'noChange',
      severity: 'info',
      observedAt: clock(),
      sourceToken,
      providerCallAttempted: true,
      operationCount: operations.length,
      operationBundleHash: hashStableJson(operations),
      promptDirtyDomains,
      workerResults: workerPayloads,
      externalContextOutputs: input.externalContextOutputs
    });
    const diagnostic = await appendForgeDiagnostics(transactionId, redactedPayload);
    let lensResult = null;
    if (operations.length && lens && promptDirtyDomains.length) {
      lens.enqueueDirty({
        lane: 'background',
        source: 'forge',
        dirtyDomains: promptDirtyDomains,
        idempotencyKey: `forge-dirty:${idempotencyKey}`
      });
      lensResult = await lens.flush({
        transactionId,
        lane: 'background',
        binding: input.binding || {},
        campaignContext: {
          ...(input.campaignContext || {}),
          mechanicsRevision: input.baseRevisions?.mechanics ?? null,
          cpmSourceHash: input.cpmDigest?.sourceHash || input.cpmDigest?.hash || null
        },
        promptFrame: {
          turnSourceHash: input.sourceFrame?.textHash || input.sourceFrame?.id || null
        },
        reason: 'forge-background-batch',
        idempotencyKey: `forge-lens:${idempotencyKey}`
      });
    }
    handled.add(idempotencyKey);
    return {
      status: operations.length ? 'applied' : 'noChange',
      providerCallAttempted: true,
      applied: operations.length > 0,
      transactionId,
      background,
      diagnostic,
      lensResult,
      workerResults: workerPayloads,
      operationCount: operations.length,
      promptDirtyDomains
    };
  }

  return {
    run
  };
}
