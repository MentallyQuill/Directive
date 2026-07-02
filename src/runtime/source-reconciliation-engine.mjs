import { reviewContinuityContradictions } from '../continuity/contradiction-guard.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim();
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

export function createSourceReconciliationEngine({ now = null } = {}) {
  function reviewHostNativeContinuity({
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
    observedMessage = null
  } = {}) {
    const observedText = compact(text);
    if (!observedText) {
      return {
        kind: 'directive.sreHostNativeContinuityReview.v1',
        mode,
        ok: true,
        findings: [],
        checkedFactCount: 0,
        reviewer: 'sourceReconciliationEngine',
        reviewedAt: timestamp(now),
        source: {
          responseId: responseId || null,
          ingressId: ingressId || null,
          outcomeId: outcomeId || null,
          turnId: turnId || null,
          hostMessageId: observedMessage?.hostMessageId || observedMessage?.id || null
        }
      };
    }
    const review = reviewContinuityContradictions({
      text: observedText,
      campaignState,
      packageData,
      crewDataset,
      shipDataset,
      campaignProjection
    });
    return {
      ...cloneJson(review),
      sreReview: {
        kind: 'directive.sreHostNativeContinuityReview.v1',
        mode,
        reviewer: 'sourceReconciliationEngine',
        reviewedAt: timestamp(now),
        source: {
          responseId: responseId || null,
          ingressId: ingressId || null,
          outcomeId: outcomeId || null,
          turnId: turnId || null,
          hostMessageId: observedMessage?.hostMessageId || observedMessage?.id || null
        }
      }
    };
  }

  function reviewCorrectAsSwipeEvidence({
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
    const reviewedAt = timestamp(now);
    if (externalContextOnly === true) {
      return {
        kind: 'directive.sreCorrectAsSwipeEvidenceVerdict.v1',
        verdict: 'external-only',
        status: 'external-only',
        checkedFactCount: 0,
        findings: [],
        evidenceRefIds: Array.isArray(evidenceRefIds) ? evidenceRefIds : [],
        reviewedAt,
        source: {
          responseId: responseId || null,
          outcomeId: outcomeId || null,
          turnId: turnId || null,
          hostMessageId: hostMessageId || null,
          textHash: selectedTextHash || null
        }
      };
    }
    if (!selectedText) {
      return {
        kind: 'directive.sreCorrectAsSwipeEvidenceVerdict.v1',
        verdict: 'ambiguous',
        status: 'ambiguous',
        checkedFactCount: 0,
        findings: [],
        evidenceRefIds: Array.isArray(evidenceRefIds) ? evidenceRefIds : [],
        reviewedAt,
        source: {
          responseId: responseId || null,
          outcomeId: outcomeId || null,
          turnId: turnId || null,
          hostMessageId: hostMessageId || null,
          textHash: selectedTextHash || null
        }
      };
    }
    const continuityReview = reviewContinuityContradictions({
      text: selectedText,
      campaignState,
      packageData,
      crewDataset,
      shipDataset,
      campaignProjection
    });
    const checkedFactCount = Number(continuityReview?.checkedFactCount || 0);
    const verdict = continuityReview?.ok === false
      ? 'contradicted'
      : (checkedFactCount > 0 ? 'supported' : 'unsupported');
    return {
      kind: 'directive.sreCorrectAsSwipeEvidenceVerdict.v1',
      verdict,
      status: verdict,
      checkedFactCount,
      findings: Array.isArray(continuityReview?.findings) ? continuityReview.findings : [],
      evidenceRefIds: Array.isArray(evidenceRefIds) ? evidenceRefIds : [],
      reviewedAt,
      source: {
        responseId: responseId || null,
        outcomeId: outcomeId || null,
        turnId: turnId || null,
        hostMessageId: hostMessageId || null,
        textHash: selectedTextHash || null
      }
    };
  }

  return {
    kind: 'directive.sourceReconciliationEngine.v1',
    reviewHostNativeContinuity,
    reviewCorrectAsSwipeEvidence
  };
}
