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

function verdictFromValue(value = '') {
  const verdict = compactText(value, 60);
  return ['supported', 'contradicted', 'unsupported', 'ambiguous', 'external-only'].includes(verdict)
    ? verdict
    : 'ambiguous';
}

function sanitizeCorrectAsSwipeFinding(finding = {}) {
  return sanitizeHostNativeReviewFinding(finding);
}

function sanitizeCorrectAsSwipeEvidenceVerdict(verdict = null, source = null) {
  if (!verdict || typeof verdict !== 'object') return null;
  const cleanVerdict = verdictFromValue(verdict.verdict || verdict.status);
  const sourceRef = source && typeof source === 'object' ? source : {};
  const rawEvidenceRefs = Array.isArray(verdict.evidenceRefIds)
    ? verdict.evidenceRefIds
    : (Array.isArray(verdict.refs) ? verdict.refs : []);
  const evidenceRefIds = rawEvidenceRefs
    .map((entry) => compactText(typeof entry === 'object' ? entry.id || entry.refId || entry.sourceId : entry, 180))
    .filter(Boolean)
    .slice(0, 12);
  return {
    kind: compactText(verdict.kind || 'directive.sreCorrectAsSwipeEvidenceVerdict.v1', 120),
    verdict: cleanVerdict,
    status: cleanVerdict,
    checkedFactCount: Number.isFinite(Number(verdict.checkedFactCount)) ? Number(verdict.checkedFactCount) : 0,
    findings: (Array.isArray(verdict.findings) ? verdict.findings : [])
      .slice(0, 24)
      .map(sanitizeCorrectAsSwipeFinding),
    evidenceRefIds,
    evidenceHash: compactText(verdict.evidenceHash, 120) || hashStableJson({
      verdict: cleanVerdict,
      evidenceRefIds,
      checkedFactCount: Number(verdict.checkedFactCount || 0)
    }),
    reviewedAt: validIsoTimestamp(verdict.reviewedAt) || timestamp(null),
    source: {
      responseId: compactText(verdict.source?.responseId || sourceRef.responseId, 180) || null,
      outcomeId: compactText(verdict.source?.outcomeId || sourceRef.outcomeId, 180) || null,
      turnId: compactText(verdict.source?.turnId || sourceRef.turnId, 180) || null,
      hostMessageId: compactText(verdict.source?.hostMessageId || sourceRef.hostMessageId, 180) || null,
      textHash: compactText(verdict.source?.textHash || sourceRef.textHash, 180) || null
    },
    providerOutputHash: compactText(verdict.providerOutputHash, 180) || undefined,
    error: verdict.error ? compactErrorRef(verdict.error, 'DIRECTIVE_SRE_CORRECT_AS_SWIPE_REVIEW_FAILED') : undefined
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
  sanitizeHostNativeContinuityReview,
  sanitizeCorrectAsSwipeEvidenceVerdict
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

  async function reviewCorrectAsSwipeEvidence({
    text = '',
    campaignState = null,
    packageData = null,
    crewDataset = null,
    shipDataset = null,
    campaignProjection = null,
    responseId = null,
    outcomeId = null,
    turnId = null,
    hostMessageId = null,
    selectedTextHash = null,
    evidenceRefIds = [],
    externalContextOnly = false
  } = {}) {
    const selectedText = compact(text);
    const source = {
      responseId,
      outcomeId,
      turnId,
      hostMessageId,
      textHash: compact(selectedTextHash) || (selectedText ? hashStableJson({ text: selectedText }) : null)
    };
    if (typeof sre?.reviewCorrectAsSwipeEvidence === 'function') {
      try {
        const verdict = await sre.reviewCorrectAsSwipeEvidence({
          text: selectedText,
          campaignState,
          packageData,
          crewDataset,
          shipDataset,
          campaignProjection,
          responseId,
          outcomeId,
          turnId,
          hostMessageId,
          selectedTextHash: source.textHash,
          evidenceRefIds,
          externalContextOnly
        });
        return sanitizeCorrectAsSwipeEvidenceVerdict(verdict, source)
          || sanitizeCorrectAsSwipeEvidenceVerdict({
            verdict: 'ambiguous',
            error: { code: 'DIRECTIVE_SRE_CORRECT_AS_SWIPE_REVIEW_MALFORMED' }
          }, source);
      } catch (error) {
        return sanitizeCorrectAsSwipeEvidenceVerdict({
          verdict: 'ambiguous',
          error
        }, source);
      }
    }
    return sanitizeCorrectAsSwipeEvidenceVerdict({
      verdict: 'ambiguous',
      error: { code: 'DIRECTIVE_SRE_CORRECT_AS_SWIPE_REVIEW_UNAVAILABLE' }
    }, source);
  }

  return {
    kind: 'directive.sourceReviewWorker.v1',
    reviewHostNativeContinuity,
    reviewCorrectAsSwipeEvidence
  };
}
