import { parseCommandBearingReviewProposalOutput } from '../jobs/sidecar-output-contracts.mjs';
import { refreshCommandBearing } from './command-bearing.mjs';

export const COMMAND_BEARING_REVIEW_ROLE_ID = 'commandBearingEvaluator';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compact(value = '', maxLength = 700) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function evidenceForQueueItem(commandBearing, queueItem) {
  const wanted = new Set(asArray(queueItem?.evidenceIds).map((id) => compact(id, 160)).filter(Boolean));
  return asArray(commandBearing?.evidenceLedger?.records)
    .filter((record) => wanted.has(compact(record?.id, 160)))
    .map((record) => ({
      id: compact(record.id, 160),
      primarySignal: record.primarySignal,
      trackSignals: asArray(record.trackSignals),
      strength: record.strength,
      criteria: cloneJson(record.criteria || {}),
      actionSummary: compact(record.actionSummary, 300),
      consequenceSummary: compact(record.consequenceSummary, 300),
      playerFacingSummary: compact(record.playerFacingSummary, 420),
      sourceOutcomeId: compact(record.sourceOutcomeId, 160),
      sourceTurnId: compact(record.sourceTurnId, 160),
      questId: compact(record.questId, 160),
      threadId: compact(record.threadId, 160),
      arcId: compact(record.arcId, 160)
    }));
}

export function commandBearingReviewPrompt({
  campaignState = {},
  reviewQueueItem = {}
} = {}) {
  const commandBearing = refreshCommandBearing(campaignState.commandBearing || campaignState.commandStyle || {});
  const evidence = evidenceForQueueItem(commandBearing, reviewQueueItem);
  const request = {
    contract: 'directive.commandBearing.reviewProposal.v1',
    closure: {
      closureId: compact(reviewQueueItem.closureId, 160),
      closureType: compact(reviewQueueItem.closureType, 80),
      source: compact(reviewQueueItem.source, 80),
      summary: compact(reviewQueueItem.closureSummary, 420),
      utilitySuggested: reviewQueueItem.utilitySuggested === true
    },
    tracks: {
      inspiration: {
        currentMarks: commandBearing.tracks.inspiration.marks,
        currentRank: commandBearing.tracks.inspiration.rank,
        definition: 'Inspiration is leadership through trust, shared purpose, transparency, dignity, mentorship, and voluntary cooperation.'
      },
      resolve: {
        currentMarks: commandBearing.tracks.resolve.marks,
        currentRank: commandBearing.tracks.resolve.rank,
        definition: 'Resolve is leadership through lawful authority, preparation, credible boundaries, discipline, and accepted responsibility.'
      }
    },
    awardRules: [
      'Review the supplied player-visible evidence for this closure only.',
      'A Mark can be awarded only when Agency, Commitment, and Causality are all satisfied by the evidence.',
      'Agency means the player character made a meaningful choice or took a deliberate action.',
      'Commitment means the action accepted a real constraint, cost, risk, duty, or follow-through burden.',
      'Causality means the action plausibly changed the outcome or relationship to the closure.',
      'Award at most one Mark. Choose Inspiration or Resolve only when that track is clearly the best fit.',
      'If the evidence is thin, mixed, or merely competent routine procedure, do not award a Mark.',
      'Do not infer private thoughts, hidden scores, or director-only facts.'
    ],
    evidence,
    requiredOutput: {
      closureId: reviewQueueItem.closureId,
      markAwarded: 'boolean',
      awardedTrack: 'inspiration | resolve | null',
      criteriaSatisfied: { agency: 'boolean', commitment: 'boolean', causality: 'boolean' },
      evidenceIds: evidence.map((record) => record.id),
      awardSummary: 'required when markAwarded is true; player-facing and non-omniscient',
      noAwardReason: 'required when markAwarded is false; player-facing and non-omniscient'
    }
  };
  return [
    'You are Directive Command Bearing Evaluator.',
    'Return one strict JSON object only. Do not narrate. Do not expose hidden reasoning.',
    'Your output is a proposal, not an award. Deterministic validators will reject unsupported claims.',
    '',
    JSON.stringify(request, null, 2)
  ].join('\n');
}

export async function runCommandBearingClosureReview({
  generationRouter,
  campaignState = {},
  reviewQueueItem = {},
  maxTokens = 1200
} = {}) {
  const commandBearing = refreshCommandBearing(campaignState.commandBearing || campaignState.commandStyle || {});
  const evidence = evidenceForQueueItem(commandBearing, reviewQueueItem);
  const closureId = compact(reviewQueueItem.closureId, 160);
  if (!closureId || evidence.length === 0) {
    return {
      ok: false,
      status: 'skipped',
      closureId,
      reviewRecord: null,
      diagnostics: {
        reason: !closureId ? 'missing-closure-id' : 'missing-evidence'
      }
    };
  }
  if (typeof generationRouter?.generate !== 'function') {
    return {
      ok: false,
      status: 'failedClosed',
      closureId,
      reviewRecord: null,
      diagnostics: {
        reason: 'provider-unavailable',
        roleId: COMMAND_BEARING_REVIEW_ROLE_ID
      }
    };
  }

  const request = {
    systemPrompt: [
      'You are Directive Command Bearing Evaluator.',
      'Return one strict JSON object matching directive.commandBearing.reviewProposal.v1.',
      'Do not reveal hidden state, private NPC thoughts, raw scores, or director-only facts.'
    ].join('\n'),
    prompt: commandBearingReviewPrompt({ campaignState, reviewQueueItem }),
    maxTokens,
    structuredOutput: true
  };

  let response;
  try {
    response = await generationRouter.generate(COMMAND_BEARING_REVIEW_ROLE_ID, request);
  } catch (error) {
    return {
      ok: false,
      status: 'failedClosed',
      closureId,
      reviewRecord: null,
      diagnostics: {
        reason: 'provider-threw',
        roleId: COMMAND_BEARING_REVIEW_ROLE_ID,
        error: { message: error?.message || String(error) }
      }
    };
  }
  if (!response?.ok) {
    return {
      ok: false,
      status: 'failedClosed',
      closureId,
      reviewRecord: null,
      diagnostics: {
        reason: 'provider-failed',
        roleId: COMMAND_BEARING_REVIEW_ROLE_ID,
        provider: cloneJson(response?.diagnostics || null),
        error: cloneJson(response?.error || null)
      }
    };
  }

  const parsed = parseCommandBearingReviewProposalOutput(
    response.response?.text ?? response.response?.content ?? response.response,
    {
      closureId,
      suppliedEvidenceIds: evidence.map((record) => record.id),
      commandBearing
    }
  );
  if (!parsed.ok) {
    return {
      ok: false,
      status: 'rejected',
      closureId,
      reviewRecord: null,
      diagnostics: {
        reason: 'proposal-invalid',
        roleId: COMMAND_BEARING_REVIEW_ROLE_ID,
        parser: cloneJson(parsed.diagnostics || null),
        error: cloneJson(parsed.error || null)
      }
    };
  }

  return {
    ok: true,
    status: 'accepted',
    closureId,
    reviewRecord: cloneJson(parsed.value[0]),
    diagnostics: {
      roleId: COMMAND_BEARING_REVIEW_ROLE_ID,
      evidenceCount: evidence.length,
      provider: cloneJson(response.diagnostics || null),
      parser: cloneJson(parsed.diagnostics || null)
    }
  };
}

export async function runCommandBearingClosureReviews({
  generationRouter,
  campaignState = {},
  reviewQueue = [],
  maxReviews = 3
} = {}) {
  const results = [];
  const acceptedRecords = [];
  const queued = asArray(reviewQueue).slice(0, Math.max(1, Number(maxReviews) || 3));
  let reviewState = cloneJson(campaignState);
  for (const reviewQueueItem of queued) {
    const result = await runCommandBearingClosureReview({
      generationRouter,
      campaignState: reviewState,
      reviewQueueItem
    });
    results.push(result);
    if (result.ok && result.reviewRecord) {
      acceptedRecords.push(result.reviewRecord);
      reviewState = {
        ...reviewState,
        commandBearing: {
          ...(reviewState.commandBearing || reviewState.commandStyle || {}),
          reviewLedger: {
            ...((reviewState.commandBearing || reviewState.commandStyle || {}).reviewLedger || {}),
            reviewedClosureIds: {
              ...((reviewState.commandBearing || reviewState.commandStyle || {}).reviewLedger?.reviewedClosureIds || {}),
              [result.reviewRecord.closureId]: true
            }
          }
        }
      };
      reviewState.commandStyle = reviewState.commandBearing;
    }
  }
  return {
    ok: results.every((result) => result.ok || result.status === 'skipped' || result.status === 'failedClosed' || result.status === 'rejected'),
    records: acceptedRecords,
    results
  };
}
