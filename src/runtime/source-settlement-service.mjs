import {
  assertFrameCleanForSettlement,
  createRangeSourceFrame,
  derivePromptFrame
} from './frame-contracts.mjs';
import {
  hashStableJson,
  redactExternalDiagnostic
} from './architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactObject(value = {}) {
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

function redacted(payload = {}) {
  const redactions = [];
  const redactedPayload = redactExternalDiagnostic(payload, redactions);
  return { redactedPayload, redactions };
}

function normalizeOperations(operations = []) {
  return (Array.isArray(operations) ? operations : []).slice(0, 24).map((operation) => compactObject({
    domain: asString(operation.domain || operation.root),
    op: asString(operation.op || operation.operation),
    path: asString(operation.path),
    summary: asString(operation.summary),
    valueHash: operation.value === undefined ? asString(operation.valueHash) : hashStableJson(operation.value)
  })).filter((operation) => operation.domain && operation.op);
}

function settlementFrameFor(input = {}, rangeFrame = null) {
  return input.sourceFrame || rangeFrame || {};
}

export function createSourceSettlementDecision(input = {}) {
  const operations = normalizeOperations(input.operations);
  return compactObject({
    kind: 'directive.sourceSettlementDecision.v1',
    schemaVersion: 1,
    mode: asString(input.mode, 'latestPair'),
    status: asString(input.status, operations.length ? 'accepted' : 'noChange'),
    transactionId: asString(input.transactionId),
    sourceFrameId: asString(input.sourceFrame?.id || input.sourceFrameId),
    rangeFrameId: asString(input.rangeFrame?.id || input.rangeFrameId),
    rangeHash: asString(input.rangeFrame?.rangeHash || input.rangeHash),
    sourceToken: asString(input.sourceFrame?.sourceToken || input.sourceToken),
    providerCalled: input.providerCalled === true,
    applied: input.applied === true,
    reasons: uniqueStrings(input.reasons),
    operations,
    operationBundleHash: hashStableJson(operations),
    promptDirtyDomains: uniqueStrings(input.promptDirtyDomains || operations.map((operation) => operation.domain)),
    promptFrame: input.sourceFrame ? derivePromptFrame(input.sourceFrame) : undefined,
    observedAt: asString(input.observedAt)
  });
}

export function createSourceSettlementService({
  coreStore = null,
  clock = () => new Date().toISOString(),
  runLatestPairProvider = async () => ({ operations: [] }),
  runRangeProvider = async () => ({ operations: [] }),
  validateBeforeApply = async () => ({ ok: true }),
  applySettlement = async () => ({ ok: true })
} = {}) {
  const handled = new Map();

  async function appendDiagnostic(transactionId, payload = {}) {
    if (!transactionId || typeof coreStore?.appendDiagnostics !== 'function') return null;
    const { redactedPayload } = redacted({
      type: 'sourceSettlement',
      ...payload
    });
    return coreStore.appendDiagnostics(transactionId, redactedPayload);
  }

  async function evaluate(input = {}) {
    const mode = asString(input.mode, 'latestPair');
    const transactionId = asString(input.transactionId);
    const rangeFrame = input.rangeFrame || (mode === 'explicitRange'
      ? createRangeSourceFrame(input.messages || [], {
        campaignId: input.sourceFrame?.campaignId || input.campaignId,
        saveId: input.sourceFrame?.saveId || input.saveId,
        chatId: input.sourceFrame?.chatId || input.chatId,
        branchId: input.sourceFrame?.branchId || input.branchId
      })
      : null);
    const idempotencyKey = input.idempotencyKey
      || `sre:${transactionId}:${mode}:${rangeFrame?.rangeHash || input.sourceFrame?.sourceHash || input.sourceFrame?.id || 'source'}`;
    if (handled.has(idempotencyKey)) return cloneJson(handled.get(idempotencyKey));
    const observedAt = input.observedAt || clock();

    try {
      assertFrameCleanForSettlement(settlementFrameFor(input, rangeFrame), input.expected || {});
    } catch (error) {
      const decision = createSourceSettlementDecision({
        ...input,
        mode,
        rangeFrame,
        status: error.reasons?.includes('source-mutation-owned-by-repair') ? 'repairRequired' : 'hardSkipped',
        providerCalled: false,
        applied: false,
        reasons: error.reasons || ['source-not-clean'],
        observedAt
      });
      decision.diagnostic = await appendDiagnostic(transactionId, {
        status: decision.status,
        severity: 'warning',
        decision
      });
      handled.set(idempotencyKey, decision);
      return cloneJson(decision);
    }

    const provider = mode === 'explicitRange' ? runRangeProvider : runLatestPairProvider;
    const providerResult = await provider({
      ...input,
      mode,
      rangeFrame,
      observedAt
    });
    const beforeApply = await validateBeforeApply({
      ...input,
      mode,
      rangeFrame,
      providerResult
    });
    if (beforeApply?.ok === false) {
      const decision = createSourceSettlementDecision({
        ...input,
        mode,
        rangeFrame,
        status: 'staleBeforeApply',
        providerCalled: true,
        applied: false,
        reasons: uniqueStrings(beforeApply.reasons || beforeApply.reason || 'source-stale-before-apply'),
        observedAt
      });
      decision.diagnostic = await appendDiagnostic(transactionId, {
        status: decision.status,
        severity: 'warning',
        decision,
        rawPrompt: providerResult?.rawPrompt,
        rawResponse: providerResult?.rawResponse
      });
      handled.set(idempotencyKey, decision);
      return cloneJson(decision);
    }

    const operations = normalizeOperations(providerResult?.operations || providerResult?.settlement?.operations || []);
    const applyResult = operations.length
      ? await applySettlement({
        ...input,
        mode,
        rangeFrame,
        operations,
        providerResult
      })
      : { ok: true, applied: false };
    const decision = createSourceSettlementDecision({
      ...input,
      mode,
      rangeFrame,
      status: operations.length ? 'accepted' : 'noChange',
      providerCalled: true,
      applied: operations.length > 0 && applyResult?.ok !== false,
      operations,
      promptDirtyDomains: providerResult?.promptDirtyDomains || operations.map((operation) => operation.domain),
      observedAt
    });
    decision.diagnostic = await appendDiagnostic(transactionId, {
      status: decision.status,
      severity: 'info',
      decision,
      rawPrompt: providerResult?.rawPrompt,
      rawResponse: providerResult?.rawResponse
    });
    handled.set(idempotencyKey, decision);
    return cloneJson(decision);
  }

  async function preflight(input = {}) {
    const mode = asString(input.mode, 'latestPair');
    const transactionId = asString(input.transactionId);
    const rangeFrame = input.rangeFrame || (mode === 'explicitRange'
      ? createRangeSourceFrame(input.messages || [], {
        campaignId: input.sourceFrame?.campaignId || input.campaignId,
        saveId: input.sourceFrame?.saveId || input.saveId,
        chatId: input.sourceFrame?.chatId || input.chatId,
        branchId: input.sourceFrame?.branchId || input.branchId
      })
      : null);
    const idempotencyKey = input.idempotencyKey
      || `sre-preflight:${transactionId}:${mode}:${rangeFrame?.rangeHash || input.sourceFrame?.sourceHash || input.sourceFrame?.id || 'source'}`;
    if (handled.has(idempotencyKey)) return cloneJson(handled.get(idempotencyKey));
    const observedAt = input.observedAt || clock();

    let status = 'preflightClean';
    let reasons = uniqueStrings(input.reasons || ['source-preflight-clean']);
    try {
      assertFrameCleanForSettlement(settlementFrameFor(input, rangeFrame), input.expected || {});
    } catch (error) {
      status = error.reasons?.includes('source-mutation-owned-by-repair') ? 'repairRequired' : 'hardSkipped';
      reasons = error.reasons || ['source-not-clean'];
    }
    const decision = createSourceSettlementDecision({
      ...input,
      mode,
      rangeFrame,
      status,
      providerCalled: false,
      applied: false,
      reasons,
      observedAt
    });
    decision.diagnostic = await appendDiagnostic(transactionId, {
      status: decision.status,
      severity: decision.status === 'preflightClean' ? 'info' : 'warning',
      diagnosticOnly: true,
      decision
    });
    handled.set(idempotencyKey, decision);
    return cloneJson(decision);
  }

  return {
    preflight,
    preflightLatestPair: (input = {}) => preflight({ ...input, mode: 'latestPair' }),
    preflightRange: (input = {}) => preflight({ ...input, mode: 'explicitRange' }),
    evaluate,
    settleLatestPair: (input = {}) => evaluate({ ...input, mode: 'latestPair' }),
    reconcileRange: (input = {}) => evaluate({ ...input, mode: 'explicitRange' }),
    repairSettlement: (input = {}) => evaluate({ ...input, mode: 'recoveryRepair' })
  };
}
