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

function operationDomain(operation = {}) {
  const path = asString(operation.path);
  if (path) return path.split('.')[0];
  return asString(operation.domain || operation.root);
}

function providerOperations(providerResult = {}) {
  const operations = providerResult?.operations || providerResult?.settlement?.operations || [];
  return Array.isArray(operations) ? cloneJson(operations) : [];
}

function operationDomains(operations = []) {
  return uniqueStrings((Array.isArray(operations) ? operations : []).map(operationDomain));
}

function redacted(payload = {}) {
  const redactions = [];
  const redactedPayload = redactExternalDiagnostic(payload, redactions);
  return { redactedPayload, redactions };
}

function normalizeOperations(operations = []) {
  return (Array.isArray(operations) ? operations : []).slice(0, 24).map((operation) => compactObject({
    domain: operationDomain(operation),
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

const DEFAULT_LATEST_PAIR_PROVIDER = async () => ({ operations: [] });
const DEFAULT_RANGE_PROVIDER = async () => ({ operations: [] });
const DEFAULT_APPLY_SETTLEMENT = async () => ({ ok: true });
const PREFLIGHT_DIAGNOSTIC_WAIT_MS = 500;

export function createSourceSettlementService({
  coreStore = null,
  clock = () => new Date().toISOString(),
  runLatestPairProvider = DEFAULT_LATEST_PAIR_PROVIDER,
  runRangeProvider = DEFAULT_RANGE_PROVIDER,
  validateBeforeApply = async () => ({ ok: true }),
  applySettlement = DEFAULT_APPLY_SETTLEMENT,
  rangeSettlementEnabled = null
} = {}) {
  const handled = new Map();
  const terminalRangeSettlementEnabled = rangeSettlementEnabled === null
    ? (runRangeProvider !== DEFAULT_RANGE_PROVIDER && applySettlement !== DEFAULT_APPLY_SETTLEMENT)
    : rangeSettlementEnabled === true;

  async function appendDiagnostic(transactionId, payload = {}) {
    if (!transactionId || typeof coreStore?.appendDiagnostics !== 'function') return null;
    const { redactedPayload } = redacted({
      type: 'sourceSettlement',
      ...payload
    });
    return coreStore.appendDiagnostics(transactionId, redactedPayload);
  }

  async function appendPreflightDiagnostic(transactionId, payload = {}) {
    let timeoutId = null;
    const deferredDiagnostic = () => ({
      status: 'queued',
      reason: 'source-settlement-preflight-diagnostic-deferred',
      diagnosticOnly: payload.diagnosticOnly === true
    });
    let pending = null;
    try {
      pending = appendDiagnostic(transactionId, payload);
    } catch {
      return deferredDiagnostic();
    }
    if (!pending || typeof pending.then !== 'function') return pending;
    const safePending = pending.catch(() => deferredDiagnostic());
    try {
      return await Promise.race([
        safePending,
        new Promise((resolve) => {
          timeoutId = setTimeout(() => {
            resolve(deferredDiagnostic());
          }, PREFLIGHT_DIAGNOSTIC_WAIT_MS);
        })
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      pending.catch?.(() => null);
    }
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
    let providerResult = null;
    try {
      providerResult = await provider({
        ...input,
        mode,
        rangeFrame,
        observedAt
      });
    } catch (error) {
      const decision = createSourceSettlementDecision({
        ...input,
        mode,
        rangeFrame,
        status: 'repairRequired',
        providerCalled: true,
        applied: false,
        reasons: ['source-settlement-provider-threw'],
        observedAt
      });
      decision.diagnostic = await appendDiagnostic(transactionId, {
        status: decision.status,
        severity: 'warning',
        decision,
        error: {
          code: error?.code || 'DIRECTIVE_SOURCE_SETTLEMENT_PROVIDER_THROW',
          message: asString(error?.message || String(error))
        }
      });
      handled.set(idempotencyKey, decision);
      return cloneJson(decision);
    }
    let beforeApply = null;
    try {
      beforeApply = await validateBeforeApply({
        ...input,
        mode,
        rangeFrame,
        providerResult
      });
    } catch (error) {
      beforeApply = {
        ok: false,
        reasons: ['source-settlement-validate-threw'],
        error
      };
    }
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

    const rawOperations = providerOperations(providerResult);
    const operations = normalizeOperations(rawOperations);
    const dirtyDomains = operationDomains(rawOperations);
    if (operations.length && applySettlement === DEFAULT_APPLY_SETTLEMENT) {
      const decision = createSourceSettlementDecision({
        ...input,
        mode,
        rangeFrame,
        status: 'repairRequired',
        providerCalled: true,
        applied: false,
        reasons: ['source-settlement-apply-owner-missing'],
        operations,
        promptDirtyDomains: dirtyDomains,
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
    let applyResult = { ok: true, applied: false };
    try {
      applyResult = (operations.length || applySettlement !== DEFAULT_APPLY_SETTLEMENT)
        ? await applySettlement({
          ...input,
          mode,
          rangeFrame,
          operations: rawOperations,
          decisionOperations: operations,
          providerResult
        })
        : { ok: true, applied: false };
    } catch (error) {
      applyResult = {
        ok: false,
        reasons: ['source-settlement-apply-threw'],
        error
      };
    }
    if (applyResult?.ok === false) {
      const decision = createSourceSettlementDecision({
        ...input,
        mode,
        rangeFrame,
        status: 'repairRequired',
        providerCalled: true,
        applied: false,
        reasons: uniqueStrings(applyResult.reasons || applyResult.reason || 'source-settlement-apply-failed'),
        operations,
        promptDirtyDomains: dirtyDomains,
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

    const decision = createSourceSettlementDecision({
      ...input,
      mode,
      rangeFrame,
      status: operations.length ? 'accepted' : 'noChange',
      providerCalled: true,
      applied: operations.length > 0 && applyResult?.ok !== false,
      operations,
      promptDirtyDomains: dirtyDomains,
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
    decision.diagnostic = await appendPreflightDiagnostic(transactionId, {
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
    ...(terminalRangeSettlementEnabled
      ? { reconcileRange: (input = {}) => evaluate({ ...input, mode: 'explicitRange' }) }
      : {}),
    repairSettlement: (input = {}) => evaluate({ ...input, mode: 'recoveryRepair' })
  };
}
