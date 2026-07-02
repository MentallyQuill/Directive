import {
  hashStableJson
} from './architecture-redesign-contracts.mjs';
import { createSourceReconciliationEngine } from './source-reconciliation-engine.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim();
}

function compactText(value = '', maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function validIsoTimestamp(value) {
  if (typeof value !== 'string') return null;
  const text = compactText(value, 80);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/.exec(text);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, millis = '000'] = match;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  const roundTrip = `${parsed.getUTCFullYear().toString().padStart(4, '0')}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}T${String(parsed.getUTCHours()).padStart(2, '0')}:${String(parsed.getUTCMinutes()).padStart(2, '0')}:${String(parsed.getUTCSeconds()).padStart(2, '0')}.${String(parsed.getUTCMilliseconds()).padStart(3, '0')}Z`;
  const normalizedInput = `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z`;
  return roundTrip === normalizedInput ? text : null;
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function safeErrorCode(value, fallbackCode = 'DIRECTIVE_ERROR') {
  const code = compactText(value, 120);
  return /^DIRECTIVE_[A-Z0-9_:-]{1,110}$/.test(code) ? code : fallbackCode;
}

function compactErrorRef(error, fallbackCode = 'DIRECTIVE_ERROR') {
  const message = String(error?.message || error || '');
  const truncated = message.slice(0, 900);
  const rawCode = String(error?.code || '');
  const code = safeErrorCode(rawCode, fallbackCode);
  return {
    code,
    codeHash: rawCode && rawCode !== code ? hashStableJson({ code: rawCode.slice(0, 240) }) : undefined,
    messageLength: message.length,
    messageHash: hashStableJson({ message: truncated })
  };
}

function hostMessageText(message = {}) {
  return compact(message.text || message.mes || message.content || '');
}

function hostMessageTextHash(message = {}, text = null) {
  const sourceText = text === null || text === undefined ? hostMessageText(message) : compact(text);
  if (sourceText) return hashStableJson({ text: sourceText });
  const existing = compact(message?.textHash);
  return existing || null;
}

function hostNativeReviewSourceMatchRef({
  responseId = null,
  ingressId = null,
  outcomeId = null,
  turnId = null,
  hostMessageId = null,
  textHash = null,
  observedTextHash = null,
  observedMessage = null
} = {}) {
  const observedText = hostMessageText(observedMessage || {});
  const observedHash = (observedText ? hashStableJson({ text: observedText }) : null)
    || compact(observedTextHash)
    || compact(textHash)
    || compact(observedMessage?.textHash);
  return {
    responseId: responseId || null,
    ingressId: ingressId || null,
    outcomeId: outcomeId || null,
    turnId: turnId || null,
    hostMessageId: hostMessageId || observedMessage?.hostMessageId || observedMessage?.id || null,
    textHash: observedHash
  };
}

function providedHostNativeReviewMatchesSourceRef(review = null, source = null, observedTextHash = null) {
  if (!review || typeof review !== 'object') return false;
  const reviewSource = review?.sreReview?.source;
  if (!reviewSource || typeof reviewSource !== 'object') return false;
  const expected = hostNativeReviewSourceMatchRef(source || {});
  const requiredKeys = ['responseId', 'ingressId', 'hostMessageId']
    .filter((key) => compact(expected[key]));
  if (!requiredKeys.length) return false;
  const sourceMatches = requiredKeys.every((key) => compact(reviewSource[key]) === compact(expected[key]));
  if (!sourceMatches) return false;
  const reviewTextHash = compact(
    reviewSource.textHash
    || review.observedTextHash
    || review.sourceTextHash
    || null
  );
  const expectedTextHash = compact(observedTextHash) || compact(expected.textHash);
  return Boolean(reviewTextHash && expectedTextHash && reviewTextHash === expectedTextHash);
}

function hostNativeReviewSourceRef({
  responseId = null,
  ingressId = null,
  outcomeId = null,
  turnId = null,
  hostMessageId = null,
  textHash = null,
  observedTextHash = null,
  observedMessage = null
} = {}) {
  const source = hostNativeReviewSourceMatchRef({
    responseId,
    ingressId,
    outcomeId,
    turnId,
    hostMessageId,
    textHash,
    observedTextHash,
    observedMessage
  });
  return {
    responseId: source.responseId,
    ingressId: source.ingressId,
    outcomeId: source.outcomeId,
    turnId: source.turnId,
    hostMessageId: source.hostMessageId,
    textHash: source.textHash
  };
}

function sanitizeHostNativeReviewFinding(finding = {}) {
  const summary = compact(finding?.summary || finding?.reason || '');
  return {
    kind: compactText(finding?.kind, 120) || null,
    factId: compactText(finding?.factId, 180) || null,
    severity: compactText(finding?.severity, 60) || null,
    ...(summary ? {
      summaryLength: summary.length,
      summaryHash: hashStableJson({ summary })
    } : {})
  };
}

function sanitizeSreReviewRef(ref = null, source = null) {
  if (!ref || typeof ref !== 'object') return null;
  const refSource = ref.source && typeof ref.source === 'object' && !Array.isArray(ref.source)
    ? ref.source
    : {};
  const trustedSource = hostNativeReviewSourceRef(source || {});
  const sreSource = hostNativeReviewSourceRef(refSource);
  return {
    kind: compactText(ref.kind || 'directive.sreHostNativeContinuityReview.v1', 120),
    mode: compactText(ref.mode || 'hostNativeCompletion', 80),
    reviewer: compactText(ref.reviewer || 'sourceReconciliationEngine', 120),
    status: compactText(ref.status || '', 80) || null,
    reviewedAt: validIsoTimestamp(ref.reviewedAt),
    source: {
      ...trustedSource,
      hostMessageId: trustedSource.hostMessageId || sreSource.hostMessageId || null
    }
  };
}

function sanitizeHostNativeContinuityReview(review = null, source = null) {
  if (!review || typeof review !== 'object' || typeof review.ok !== 'boolean') {
    return null;
  }
  return {
    kind: compactText(review.kind || 'directive.sreHostNativeContinuityReview.v1', 120),
    ok: review.ok === true,
    findings: (Array.isArray(review.findings) ? review.findings : [])
      .slice(0, 24)
      .map(sanitizeHostNativeReviewFinding),
    checkedFactCount: Number.isFinite(Number(review.checkedFactCount)) ? Number(review.checkedFactCount) : 0,
    reviewer: compactText(review.reviewer, 120) || undefined,
    mode: compactText(review.mode, 80) || undefined,
    error: review.error ? compactErrorRef(review.error, 'DIRECTIVE_SRE_HOST_NATIVE_REVIEW_FAILED') : undefined,
    sreReview: sanitizeSreReviewRef(review.sreReview || {
      kind: 'directive.sreHostNativeContinuityReview.v1',
      mode: review.mode || 'hostNativeCompletion',
      reviewer: review.reviewer || 'sourceReconciliationEngine',
      status: review.ok === true ? 'accepted' : 'rejected',
      reviewedAt: review.reviewedAt || null,
      source
    }, source)
  };
}

function failedHostNativeContinuityReview(error, source = null, now = null) {
  const summary = 'SRE host-native source review failed; recovery is required before accepting the assistant row.';
  return {
    kind: 'directive.sreHostNativeContinuityReview.v1',
    ok: false,
    findings: [{
      kind: 'source-review-unavailable',
      factId: null,
      severity: 'blocker',
      summaryLength: summary.length,
      summaryHash: hashStableJson({ summary })
    }],
    checkedFactCount: 0,
    error: compactErrorRef(error, 'DIRECTIVE_SRE_HOST_NATIVE_REVIEW_FAILED'),
    sreReview: {
      kind: 'directive.sreHostNativeContinuityReview.v1',
      mode: source?.mode || 'hostNativeCompletion',
      reviewer: 'sourceReconciliationEngine',
      status: 'failed',
      reviewedAt: timestamp(now),
      source: hostNativeReviewSourceRef(source || {})
    }
  };
}

export const __sourceReviewWorkerTestHooks = Object.freeze({
  providedHostNativeReviewMatchesSource: providedHostNativeReviewMatchesSourceRef,
  sanitizeHostNativeContinuityReview
});

export function createSourceReviewWorker({
  sourceReconciliationEngine = null,
  now = null
} = {}) {
  const sre = sourceReconciliationEngine || createSourceReconciliationEngine({ now });

  async function reviewHostNativeContinuity({
    mode = 'hostNativeCompletion',
    text = '',
    campaignState = null,
    packageData = null,
    crewDataset = null,
    shipDataset = null,
    campaignProjection = null,
    responseId = null,
    ingressId = null,
    outcomeId = null,
    turnId = null,
    observedMessage = null,
    observedTextHash = null,
    continuityReview = undefined
  } = {}) {
    const observedText = compact(text);
    if (!observedText) return null;
    const source = {
      mode,
      responseId,
      ingressId,
      outcomeId,
      turnId,
      observedTextHash: compact(observedTextHash) || hostMessageTextHash(observedMessage || {}, observedText),
      observedMessage
    };
    const providedReview = providedHostNativeReviewMatchesSourceRef(continuityReview, source, source.observedTextHash)
      ? sanitizeHostNativeContinuityReview(continuityReview, source)
      : null;
    if (providedReview) return cloneJson(providedReview);
    if (typeof sre?.reviewHostNativeContinuity === 'function') {
      try {
        const review = await sre.reviewHostNativeContinuity({
          mode,
          text: observedText,
          campaignState,
          packageData,
          crewDataset,
          shipDataset,
          campaignProjection,
          responseId,
          ingressId,
          outcomeId,
          turnId,
          observedMessage
        });
        return sanitizeHostNativeContinuityReview(review, source)
          || failedHostNativeContinuityReview({ code: 'DIRECTIVE_SRE_HOST_NATIVE_REVIEW_MALFORMED' }, source, now);
      } catch (error) {
        return failedHostNativeContinuityReview(error, source, now);
      }
    }
    return failedHostNativeContinuityReview({ code: 'DIRECTIVE_SRE_HOST_NATIVE_REVIEW_UNAVAILABLE' }, source, now);
  }

  return {
    kind: 'directive.sourceReviewWorker.v1',
    reviewHostNativeContinuity
  };
}
