import {
  authorityForRole
} from '../../../src/generation/model-call-authority-matrix.mjs';

const SAFE_MODEL_CALL_FALLBACKS = new Set([
  'deterministic',
  'last-good-then-deterministic',
  'local-fallback',
  'skip',
  'defer',
  'journal-only'
]);

const BLOCKING_MODEL_CALL_FALLBACKS = new Set([
  'fail-closed',
  'fail-retryable'
]);

const FAIL_CLOSED_NO_MUTATION_FALLBACK_ROLES = new Set([
  'sourceSettlementLatestPair'
]);

function compactText(value = '', max = 160) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

export function chatCampaignSummaryFromSmokeSummary(smokeSummary = null) {
  return smokeSummary?.browser?.chatCampaign
    || smokeSummary?.browser?.chatCampaignFlow?.chatCampaign
    || smokeSummary?.chatCampaign
    || null;
}

export function modelCallFailed(call = {}) {
  return call?.status === 'failed' || Boolean(call?.error);
}

export function compactModelCallMetadata(metadata = null) {
  if (!metadata || typeof metadata !== 'object') return null;
  const safeKeys = [
    'coreDiagnosticTarget',
    'fallbackAdvisoryHash',
    'fallbackHash',
    'fallbackUsed',
    'deterministicFallbackHash',
    'lastGoodProjectionHash',
    'sourceHash',
    'requestHash',
    'candidateFactCount'
  ];
  const result = {};
  for (const key of safeKeys) {
    if (metadata[key] === undefined || metadata[key] === null) continue;
    const value = metadata[key];
    result[key] = typeof value === 'string' ? compactText(value, 96) : value;
  }
  return Object.keys(result).length ? result : null;
}

export function compactModelCall(call = {}, fallbackMetadata = null) {
  const metadata = compactModelCallMetadata(fallbackMetadata || call.metadata || null);
  return {
    id: call.id || null,
    roleId: call.roleId || call.role || null,
    providerKind: call.providerKind || null,
    status: call.status || null,
    ok: call.ok ?? null,
    latencyMs: Number.isFinite(Number(call.latencyMs)) ? Number(call.latencyMs) : null,
    errorCode: call.error?.code || call.errorCode || null,
    requestHash: call.requestHash || metadata?.requestHash || null,
    metadata
  };
}

export function walkModelCalls(value, visitor, pathParts = []) {
  if (!value || typeof value !== 'object') return;
  if (
    (value.id && String(value.id).includes('model-call'))
    || value.roleId
    || value.role
  ) {
    visitor(value, pathParts);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkModelCalls(entry, visitor, pathParts.concat(`[${index}]`)));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    walkModelCalls(entry, visitor, pathParts.concat(key));
  }
}

export function collectFallbackMetadataById(smokeReport = null) {
  const byId = new Map();
  walkModelCalls(smokeReport, (call, pathParts) => {
    const id = call?.id || null;
    if (!id || !modelCallFailed(call)) return;
    const metadata = compactModelCallMetadata(call.metadata || null);
    if (!metadata) return;
    const existing = byId.get(id);
    if (!existing || Object.keys(metadata).length > Object.keys(existing.metadata || {}).length) {
      byId.set(id, {
        metadata,
        path: pathParts.join('.')
      });
    }
  });
  return byId;
}

export function uniqueFailedModelCallsFromSmokeReport(smokeReport = null) {
  const finalCalls = smokeReport?.browser?.chatCampaignFlow?.final?.modelCalls;
  const sourceCalls = Array.isArray(finalCalls) ? finalCalls : [];
  const fallbackById = collectFallbackMetadataById(smokeReport);
  const calls = [];
  const seen = new Set();
  for (const call of sourceCalls) {
    if (!modelCallFailed(call)) continue;
    const key = call.id || `${call.roleId || call.role || 'unknown'}:${calls.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fallback = call.id ? fallbackById.get(call.id) : null;
    calls.push({
      ...compactModelCall(call, fallback?.metadata || null),
      evidencePath: fallback?.path || 'browser.chatCampaignFlow.final.modelCalls'
    });
  }
  return calls;
}

export function classifyFailedModelCall(call = {}) {
  const roleId = call.roleId || null;
  if (!roleId) {
    return {
      ...call,
      classification: 'release-blocking-missing-role',
      releaseBlocking: true,
      unresolved: false,
      reason: 'Failed model-call evidence is missing a role id.'
    };
  }
  if (!call.status) {
    return {
      ...call,
      classification: 'release-blocking-missing-status',
      releaseBlocking: true,
      unresolved: false,
      reason: `Failed model-call evidence for ${roleId} is missing status.`
    };
  }
  if (!call.errorCode) {
    return {
      ...call,
      classification: 'release-blocking-missing-error-code',
      releaseBlocking: true,
      unresolved: false,
      reason: `Failed model-call evidence for ${roleId} is missing a sanitized error code.`
    };
  }
  if (!call.requestHash) {
    return {
      ...call,
      classification: 'release-blocking-missing-request-hash',
      releaseBlocking: true,
      unresolved: false,
      reason: `Failed model-call evidence for ${roleId} is missing a sanitized request hash.`
    };
  }
  let authority = null;
  try {
    authority = authorityForRole(roleId);
  } catch (error) {
    return {
      ...call,
      classification: 'release-blocking-unknown-role',
      releaseBlocking: true,
      unresolved: false,
      reason: `Unknown model-call role "${roleId}".`
    };
  }
  const fallback = authority.fallback || null;
  if (
    fallback === 'fail-closed'
    && FAIL_CLOSED_NO_MUTATION_FALLBACK_ROLES.has(roleId)
    && authority.mayProposeState !== true
    && authority.mayInjectPrompt !== true
  ) {
    return {
      ...call,
      classification: 'fallback-handled-fail-closed-no-mutation',
      releaseBlocking: false,
      unresolved: false,
      authority: {
        blocking: authority.blocking === true,
        fallback,
        mayProposeState: authority.mayProposeState === true,
        mayInjectPrompt: authority.mayInjectPrompt === true
      },
      reason: `Role ${roleId} failed closed without prompt or state authority.`
    };
  }
  if (BLOCKING_MODEL_CALL_FALLBACKS.has(fallback)) {
    return {
      ...call,
      classification: 'release-blocking-authoritative-failure',
      releaseBlocking: true,
      unresolved: false,
      authority: {
        blocking: authority.blocking === true,
        fallback,
        mayProposeState: authority.mayProposeState === true,
        mayInjectPrompt: authority.mayInjectPrompt === true
      },
      reason: `Role ${roleId} has ${fallback} fallback policy.`
    };
  }
  if (SAFE_MODEL_CALL_FALLBACKS.has(fallback)) {
    const explicitFallbackEvidence = Boolean(
      call.metadata?.fallbackAdvisoryHash
      || call.metadata?.fallbackHash
      || call.metadata?.fallbackUsed
      || call.metadata?.deterministicFallbackHash
      || call.metadata?.lastGoodProjectionHash
      || fallback === 'deterministic'
      || fallback === 'last-good-then-deterministic'
      || fallback === 'local-fallback'
      || fallback === 'skip'
      || fallback === 'defer'
      || fallback === 'journal-only'
    );
    return {
      ...call,
      classification: explicitFallbackEvidence
        ? 'fallback-handled'
        : 'fallback-policy-known',
      releaseBlocking: false,
      unresolved: false,
      authority: {
        blocking: authority.blocking === true,
        fallback,
        mayProposeState: authority.mayProposeState === true,
        mayInjectPrompt: authority.mayInjectPrompt === true
      },
      reason: `Role ${roleId} has ${fallback} fallback policy.`
    };
  }
  return {
    ...call,
    classification: 'release-blocking-unrecognized-fallback-policy',
    releaseBlocking: true,
    unresolved: false,
    authority: {
      blocking: authority.blocking === true,
      fallback,
      mayProposeState: authority.mayProposeState === true,
      mayInjectPrompt: authority.mayInjectPrompt === true
    },
    reason: `Role ${roleId} has no recognized release fallback policy.`
  };
}

export function summarizeModelCallFailurePolicy({
  smokeReport = null,
  smokeSummary = null,
  chatCampaignSummary = null
} = {}) {
  const summary = chatCampaignSummary || chatCampaignSummaryFromSmokeSummary(smokeSummary);
  const failedCount = Number(summary?.failedModelCallCount || 0);
  const failedCalls = uniqueFailedModelCallsFromSmokeReport(smokeReport);
  if (!failedCount && !failedCalls.length) {
    return {
      status: 'pass',
      summary: 'No failed model calls are recorded in smoke summaries.',
      evidenceSource: 'smoke-summary',
      authoritySource: 'src/generation/model-call-authority-matrix.mjs',
      severityPolicy: 'release-blocking roles, unknown roles, missing sanitized error/request evidence, and fail-closed/fail-retryable fallbacks block certification.',
      failedModelCallCount: 0,
      retainedModelCallCount: Number(summary?.retainedModelCallCount || 0),
      modelCallCount: Number(summary?.modelCallCount || 0),
      calls: [],
      releaseBlockingCalls: [],
      unresolvedCalls: [],
      fallbackHandledCalls: []
    };
  }
  if (failedCount > 0 && !failedCalls.length) {
    return {
      status: 'fail',
      summary: `${failedCount} failed model call(s) are counted, but the full smoke report lacks retained role evidence for release classification.`,
      evidenceSource: 'missing-retained-model-call-evidence',
      authoritySource: 'src/generation/model-call-authority-matrix.mjs',
      severityPolicy: 'release-blocking roles, unknown roles, missing sanitized error/request evidence, and fail-closed/fail-retryable fallbacks block certification.',
      failedModelCallCount: failedCount,
      retainedModelCallCount: Number(summary?.retainedModelCallCount || 0),
      modelCallCount: Number(summary?.modelCallCount || 0),
      calls: [],
      releaseBlockingCalls: [{
        classification: 'release-blocking-missing-retained-evidence',
        failedModelCallCount: failedCount
      }],
      unresolvedCalls: [],
      fallbackHandledCalls: []
    };
  }
  const classified = failedCalls.map(classifyFailedModelCall);
  const releaseBlockingCalls = classified.filter((call) => call.releaseBlocking);
  const unresolvedCalls = classified.filter((call) => call.unresolved);
  const fallbackHandledCalls = classified.filter((call) => !call.releaseBlocking && !call.unresolved);
  return {
    status: releaseBlockingCalls.length ? 'fail' : unresolvedCalls.length ? 'warning' : 'pass',
    summary: releaseBlockingCalls.length
      ? `${releaseBlockingCalls.length} failed model call(s) have release-blocking authority policy.`
      : unresolvedCalls.length
        ? `${unresolvedCalls.length} failed model call(s) lack enough release-policy evidence.`
        : `${fallbackHandledCalls.length} failed model call(s) are covered by known fallback policy.`,
    evidenceSource: 'retained-smoke-model-calls',
    authoritySource: 'src/generation/model-call-authority-matrix.mjs',
    severityPolicy: 'release-blocking roles, unknown roles, missing sanitized error/request evidence, and fail-closed/fail-retryable fallbacks block certification.',
    failedModelCallCount: Math.max(failedCount, classified.length),
    retainedModelCallCount: Number(summary?.retainedModelCallCount || 0),
    modelCallCount: Number(summary?.modelCallCount || 0),
    calls: classified,
    releaseBlockingCalls,
    unresolvedCalls,
    fallbackHandledCalls
  };
}
