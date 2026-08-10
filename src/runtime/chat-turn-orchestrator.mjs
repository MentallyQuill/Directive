import { isDirectiveOwnedGeneration } from '../hosts/sillytavern/generation-client.mjs';
import {
  initializeCampaignRuntimeTracking,
  isPendingInteractionProjectionRow,
  recordTurnIngress,
  updateTurnIngress,
  updateDirectiveResponse
} from './state-delta-gateway.mjs';
import { composePauseResponse } from './response-dispatcher.mjs';
import { createPlayerSafeCampaignProjection } from '../generation/player-safe-prompt-context-builder.mjs';
import {
  prefixCampaignReplyHeader,
  stripCampaignReplyHeader
} from '../time/campaign-time-header.mjs';
import { prepareV1AcceptedPairSnapshot } from './v1-accepted-pair-source.mjs';
import {
  assertFrameCleanForSettlement,
  createSourceToken,
  createTurnSourceFrame,
  createTurnSourceFrameRef
} from './frame-contracts.mjs';
import {
  hashStableJson,
  normalizeHostMessageVisibility
} from './architecture-redesign-contracts.mjs';
import { createRepairCommandBoundary } from './repair-command-boundary.mjs';
import {
  createRuntimeLedgerView,
  createRuntimeLedgerViewAsync
} from './runtime-ledger-view.mjs';
import { validateEpisodeHardBoundary } from '../story/episode-boundary.mjs';
import { withoutProvisionalDutyReportManifest } from '../mission/v1/duty-report-delivery.mjs';
import { commitV1AcceptedPairTimeAdvance } from './v1-accepted-pair-time.mjs';

const CHAT_TURN_ORCHESTRATOR_DEBUG_REVISION = 'chat-turn-orchestrator-hotpath-core-begin-timeout-2026-07-04';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function promptRevisionOf(state = {}) {
  return Math.max(
    0,
    Number(state?.campaignChatBinding?.promptContextRevision) || 0,
    Number(state?.runtimeResume?.promptContextRevision) || 0
  );
}

function preferPromptAdvancedIngressState(currentState, fallbackState, currentIngress = null, fallbackIngress = null) {
  if (!currentIngress || !fallbackIngress) return currentIngress ? currentState : fallbackState;
  const currentPromptRevision = promptRevisionOf(currentState);
  const fallbackPromptRevision = promptRevisionOf(fallbackState);
  return fallbackPromptRevision > currentPromptRevision ? fallbackState : currentState;
}

function timeoutError(code, message, timeoutMs) {
  const error = new Error(message);
  error.code = code;
  error.timeoutMs = timeoutMs;
  return error;
}

async function withTimeout(promise, timeoutMs, errorFactory) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeoutId = null;
  const pending = Promise.resolve(promise);
  try {
    return await Promise.race([
      pending,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(errorFactory()), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    pending.catch?.(() => null);
  }
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function sentenceCase(value) {
  const text = compact(value);
  if (!text) return '';
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function ensureSentence(value) {
  const text = sentenceCase(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function fallbackOutcomeLead(resultBand = '') {
  const normalized = compact(resultBand).toLowerCase();
  if (normalized.includes('failure')) {
    return 'The bridge absorbs the setback and keeps the next decision in view.';
  }
  if (normalized.includes('partial')) {
    return 'The bridge moves forward, but the cost stays visible in the room.';
  }
  return 'The bridge folds the decision into the working rhythm.';
}

function fallbackVisibleConsequenceSentence(value) {
  const text = compact(typeof value === 'string' ? value : value?.summary || value?.label);
  if (!text) return '';
  const lower = text.toLowerCase();
  if (lower === 'formal inspection deferred until after handoff') {
    return 'The formal inspection stays deferred until after the handoff.';
  }
  if (lower === 'the player accepts that first impressions come through working process rather than ceremony') {
    return 'First impressions will be made through the work itself rather than ceremony.';
  }
  const demechanized = text
    .replace(/^the player accepts that\s+/i, '')
    .replace(/^formal inspection deferred\b/i, 'The formal inspection stays deferred');
  return ensureSentence(demechanized);
}

function displaySafeOutcomeSummary(value) {
  const text = compact(value);
  if (!text) return '';
  if (/\b(?:the player|result band|outcome packet|command log|directive)\b/i.test(text)) return '';
  return ensureSentence(text);
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isQuietGeneration(type) {
  const value = String(type || '').toLowerCase();
  return ['quiet', 'impersonate'].some((token) => value.includes(token));
}

function isSwipeGeneration(type) {
  const value = String(type || '').toLowerCase();
  return value === 'swipe' || value.includes('swipe');
}

function isDirectiveAssistantMessage(message) {
  return Boolean(
    message
    && message.isUser !== true
    && message.role !== 'user'
    && (
      message.isDirectiveOwned === true
      || message.directiveOwned === true
      || message.metadata?.idempotencyKey
      || message.raw?.extra?.directive
      || message.raw?.metadata?.directive
    )
  );
}

const RETRYABLE_INGRESS_STATUSES = new Set([
  'invalidated',
  'edited',
  'deleted',
  'recoveryRequired',
  'classifying',
  'classified'
]);

const INGRESS_ALIAS_DEDUPE_WINDOW_MS = 2 * 60 * 1000;

const NO_OUTCOME_RECOVERY_TYPES = new Set([
  'playerMessageDeleted',
  'playerMessageEdited',
  'chatTurnProcessingFailure'
]);

const RESPONSE_RETRY_RECOVERY_TYPES = new Set([
  'hostResponsePostFailure',
  'providerFailureAfterMechanicsCommit'
]);

function isRetryableIngressStatus(status) {
  return RETRYABLE_INGRESS_STATUSES.has(String(status || ''));
}

function isHistoricalReplayObservation(message = {}) {
  const reason = compact(message.fallbackReason || message.source || '');
  return reason === 'chat-changed'
    || reason === 'chat-poll'
    || reason === 'chat-dom-mutation'
    || reason === 'sillytavern-chat-fallback-observer'
    || reason === 'programmatic-campaign-chat-open'
    || reason === 'programmatic-open-syncs-prompt';
}

function safeV1SettlementCode(value, fallback = null) {
  const text = String(value || '').trim().slice(0, 120);
  return /^[a-z0-9][a-z0-9._:-]*$/i.test(text) ? text : fallback;
}

function sanitizedEpisodeReviewToken(value = null) {
  if (value?.kind !== 'directive.episodeReviewToken.v1') return null;
  const exactId = (candidate) => {
    const text = String(candidate || '').trim();
    return text.length > 0 && text.length <= 300 && /^[a-z0-9][a-z0-9._:-]*$/.test(text) ? text : null;
  };
  const branchId = exactId(value.branchId);
  const episodeId = exactId(value.episodeId);
  if (!branchId
    || !episodeId
    || !Number.isInteger(value.episodeRevision)
    || value.episodeRevision < 0
    || !Number.isInteger(value.checkpointSequence)
    || value.checkpointSequence < 1) {
    return null;
  }
  return {
    kind: 'directive.episodeReviewToken.v1',
    branchId,
    episodeId,
    episodeRevision: value.episodeRevision,
    checkpointSequence: value.checkpointSequence
  };
}

function sanitizedV1SettlementResult(result = {}) {
  const diagnostics = result?.diagnostics || {};
  const count = (value) => Number.isInteger(value) && value >= 0 ? value : 0;
  return {
    ok: result?.ok === true,
    attempted: result?.attempted === true,
    status: safeV1SettlementCode(result?.status, result?.ok === true ? 'settled' : 'unavailable'),
    reasonCode: safeV1SettlementCode(result?.reasonCode, null),
    definitionId: safeV1SettlementCode(result?.definitionId, null),
    definitionVersion: safeV1SettlementCode(result?.definitionVersion, null),
    committedRoots: [...new Set((Array.isArray(result?.committedRoots) ? result.committedRoots : [])
      .filter((root) => ['mission', 'storySettlement'].includes(root)))],
    noChange: result?.noChange === true,
    transitionCommitted: result?.transitionCommitted === true,
    reviewToken: sanitizedEpisodeReviewToken(result?.reviewToken),
    diagnostics: {
      candidateCount: count(diagnostics.candidateCount),
      selectedClaimCount: count(diagnostics.selectedClaimCount),
      acceptedClaimCount: count(diagnostics.acceptedClaimCount),
      rejectedClaimCount: count(diagnostics.rejectedClaimCount),
      discardedAssistantClaimCount: count(diagnostics.discardedAssistantClaimCount),
      latencyMs: Number.isFinite(diagnostics.latencyMs) && diagnostics.latencyMs >= 0
        ? diagnostics.latencyMs
        : null
    }
  };
}

function skippedV1SettlementResult(reasonCode, reasons = []) {
  return {
    ok: false,
    attempted: false,
    status: 'skipped',
    reasonCode,
    definitionId: null,
    definitionVersion: null,
    committedRoots: [],
    noChange: true,
    transitionCommitted: false,
    reviewToken: null,
    reasons: (Array.isArray(reasons) ? reasons : [reasons])
      .map((reason) => safeV1SettlementCode(reason, null))
      .filter(Boolean)
      .slice(0, 8),
    diagnostics: {
      candidateCount: 0,
      selectedClaimCount: 0,
      acceptedClaimCount: 0,
      rejectedClaimCount: 0,
      discardedAssistantClaimCount: 0,
      latencyMs: null
    }
  };
}

export async function runV1MissionSettlement({
  enabled = false,
  campaignState = null,
  snapshot = null,
  message = null,
  runtimeAssets = null,
  hardBoundary = null,
  settleV1MissionAcceptedPair = null,
  preflight = null,
  getCampaignState = null,
  timeoutMs = 10000
} = {}) {
  if (enabled !== true) {
    return { campaignState, result: skippedV1SettlementResult('v1-disabled') };
  }
  if (!snapshot) {
    return { campaignState, result: skippedV1SettlementResult('snapshot-unavailable') };
  }
  if (isHistoricalReplayObservation(message)) {
    return { campaignState, result: skippedV1SettlementResult('historical-replay') };
  }
  if (message?.isDirectiveOwned === true || message?.directiveOwned === true) {
    return { campaignState, result: skippedV1SettlementResult('directive-owned-source') };
  }
  if (typeof settleV1MissionAcceptedPair !== 'function') {
    return { campaignState, result: skippedV1SettlementResult('v1-handler-unavailable') };
  }
  if (hardBoundary !== null) {
    const boundaryResult = validateEpisodeHardBoundary(hardBoundary, {
      branchId: snapshot?.envelope?.saveId || null
    });
    if (!boundaryResult.ok) {
      return { campaignState, result: skippedV1SettlementResult('hard-boundary-invalid') };
    }
  }
  if (typeof preflight === 'function') {
    let sourceDecision = null;
    try {
      sourceDecision = await preflight();
    } catch {
      return { campaignState, result: skippedV1SettlementResult('source-preflight-failed') };
    }
    if (sourceDecision && sourceDecision.status !== 'preflightClean') {
      return {
        campaignState,
        result: skippedV1SettlementResult('source-preflight-blocked', sourceDecision.reasons || [])
      };
    }
  }
  try {
    const result = await withTimeout(
      Promise.resolve().then(() => settleV1MissionAcceptedPair({ runtimeAssets, snapshot, hardBoundary })),
      Number(timeoutMs),
      () => timeoutError(
        'DIRECTIVE_V1_MISSION_SETTLEMENT_TIMEOUT',
        'V1 mission interpretation timed out.',
        Number(timeoutMs)
      )
    );
    const sanitized = sanitizedV1SettlementResult(result);
    const refreshed = sanitized.ok && typeof getCampaignState === 'function'
      ? getCampaignState()
      : null;
    return {
      campaignState: refreshed || campaignState,
      result: sanitized
    };
  } catch (error) {
    const reasonCode = error?.code === 'DIRECTIVE_V1_MISSION_SETTLEMENT_TIMEOUT'
      ? 'v1-timeout'
      : 'v1-threw';
    return {
      campaignState,
      result: {
        ...skippedV1SettlementResult(reasonCode),
        attempted: true,
        status: 'unavailable'
      }
    };
  }
}

export async function runAcceptedPairSettlementSequence({
  campaignState = null,
  authority = { mode: 'blocked', reasonCode: 'v1-authority-unavailable' },
  prepareV1 = null,
  settleV1 = null
} = {}) {
  if (authority?.mode !== 'authoritative') {
    const v1 = {
      campaignState,
      result: skippedV1SettlementResult(safeV1SettlementCode(authority?.reasonCode, 'v1-authority-blocked'))
    };
    return {
      authority: cloneJson(authority),
      campaignState,
      snapshot: null,
      hardBoundary: null,
      v1
    };
  }
  const prepared = typeof prepareV1 === 'function'
    ? await prepareV1(campaignState)
    : { campaignState, snapshot: null, hardBoundary: null };
  const preparedBundle = prepared && Object.hasOwn(prepared, 'campaignState')
    ? prepared
    : { campaignState: prepared || campaignState, snapshot: null, hardBoundary: null };
  let v1 = {
    campaignState: preparedBundle.campaignState,
    result: skippedV1SettlementResult('v1-handler-unavailable')
  };
  if (typeof settleV1 === 'function') {
    try {
      v1 = await settleV1({
        campaignState: preparedBundle.campaignState,
        snapshot: preparedBundle.snapshot || null,
        hardBoundary: preparedBundle.hardBoundary || null
      }) || v1;
    } catch {
      v1 = {
        campaignState: preparedBundle.campaignState,
        result: {
          ...skippedV1SettlementResult('v1-threw'),
          attempted: true,
          status: 'unavailable'
        }
      };
    }
  }
  return {
    authority: cloneJson(authority),
    campaignState: v1.campaignState || preparedBundle.campaignState,
    snapshot: preparedBundle.snapshot || null,
    hardBoundary: preparedBundle.hardBoundary || null,
    v1
  };
}

function shouldResolveNoOutcomeRecoveryOnReobserve(priorIngress, recovery) {
  if (!priorIngress || priorIngress.outcomeId) return false;
  if (recovery?.ingressId !== priorIngress.id) return false;
  if (!NO_OUTCOME_RECOVERY_TYPES.has(recovery.type)) return false;
  return !['resolved', 'applied'].includes(recovery.status);
}

function responseMetadata(message = {}) {
  return message.metadata
    || message.raw?.extra?.directive
    || message.raw?.metadata?.directive
    || null;
}

function generatedText(result) {
  return compact(
    result?.response?.text
    || result?.response?.content
    || result?.text
    || result?.content
    || result?.message
    || ''
  );
}

function compactProviderFailureError(error = null) {
  if (!error) return null;
  const rawMessage = compact(error?.message || error?.reason || '');
  const rawProviderOutput = compact(error?.providerOutput || error?.rawResponse || error?.text || '');
  const message = rawMessage.slice(0, 900);
  const providerOutput = rawProviderOutput.slice(0, 900);
  return {
    code: compact(error?.code) || 'PROVIDER_FAILURE',
    directiveGenerationStartedAt: error?.directiveGenerationStartedAt || null,
    generationStartedAt: error?.generationStartedAt || null,
    messageLength: rawMessage.length,
    providerOutputLength: rawProviderOutput.length,
    messageHash: message ? hashStableJson({ message }) : null,
    providerOutputHash: providerOutput ? hashStableJson({ providerOutput }) : null,
    errorHash: hashStableJson({
      code: error?.code || null,
      message,
      providerOutput,
      directiveGenerationStartedAt: error?.directiveGenerationStartedAt || null,
      generationStartedAt: error?.generationStartedAt || null
    })
  };
}

function compactTurnProcessingFailureError(error = null) {
  const rawMessage = compact(error?.message || '');
  const message = rawMessage.slice(0, 900);
  return compactObject({
    code: compact(error?.code) || 'DIRECTIVE_TURN_PROCESSING_FAILED',
    summary: 'Turn processing failed before Directive could complete the response path.',
    messageLength: rawMessage.length,
    messageHash: message ? hashStableJson({ message }) : null
  });
}

function displaySafeChatText(value) {
  return stripCampaignReplyHeader(value || '').trim();
}

function boundedJson(value, maxLength = 4000) {
  const text = JSON.stringify(value || {}, null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...[truncated]` : text;
}

function displaySafeRecentChat(messages = []) {
  return (Array.isArray(messages) ? messages : []).map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const next = { ...entry };
    if (typeof next.text === 'string') next.text = displaySafeChatText(next.text);
    if (typeof next.mes === 'string') next.mes = displaySafeChatText(next.mes);
    if (typeof next.content === 'string') next.content = displaySafeChatText(next.content);
    return next;
  });
}

function normalizeMessage(host, payload = null, chat = null) {
  if (payload && typeof payload === 'object' && typeof payload.text === 'string' && (
    payload.hostMessageId !== undefined
    || payload.id !== undefined
    || payload.isUser !== undefined
    || payload.isDirectiveOwned !== undefined
  )) {
    return {
      id: payload.id || payload.hostMessageId || null,
      hostMessageId: payload.hostMessageId || payload.id || null,
      index: Number.isInteger(payload.index) ? payload.index : null,
      chatId: payload.chatId || host.chat.getCurrentChatId?.() || null,
      text: payload.text,
      isUser: payload.isUser !== false,
      isDirectiveOwned: payload.isDirectiveOwned === true || payload.directiveOwned === true,
      directiveOwned: payload.isDirectiveOwned === true || payload.directiveOwned === true,
      playerSubmittedAt: payload.playerSubmittedAt || payload.submittedAt || payload.createdAt || null,
      fallbackReason: payload.fallbackReason || null,
      source: payload.source || null,
      visibility: cloneJson(payload.visibility || null),
      metadata: cloneJson(payload.metadata || null),
      raw: cloneJson(payload.raw || null)
    };
  }
  if (payload?.message && typeof payload.message === 'object') {
    const normalized = host.chat.normalizeMessagePayload?.(payload) || null;
    return normalized ? {
      ...normalized,
      fallbackReason: payload.fallbackReason || normalized.fallbackReason || null,
      source: payload.source || normalized.source || null
    } : null;
  }
  if (payload && typeof payload === 'object' && (
    payload.mes !== undefined
    || payload.content !== undefined
    || payload.is_user !== undefined
    || payload.role !== undefined
  )) {
    const normalized = host.chat.normalizeMessagePayload?.(payload) || null;
    return normalized ? {
      ...normalized,
      fallbackReason: payload.fallbackReason || normalized.fallbackReason || null,
      source: payload.source || normalized.source || null
    } : null;
  }
  if (payload && typeof payload === 'object' && (
    payload.hostMessageId !== undefined
    || payload.messageId !== undefined
    || payload.message_id !== undefined
    || payload.id !== undefined
    || payload.index !== undefined
  )) {
    return host.chat.normalizeMessagePayload?.(payload) || null;
  }
  if (Array.isArray(chat)) {
    for (let index = chat.length - 1; index >= 0; index -= 1) {
      const message = chat[index];
      if (message?.is_user === true || message?.role === 'user') {
        const hostIndex = Number.isInteger(message?.index) ? message.index : index;
        return host.chat.normalizeMessagePayload?.({ message, index: hostIndex }) || null;
      }
    }
  }
  return host.chat.getLatestPlayerMessage?.() || null;
}


function eventMessageId(payload) {
  if (typeof payload === 'string' || typeof payload === 'number') {
    return String(payload).trim() || null;
  }
  return payload?.hostMessageId
    || payload?.messageId
    || payload?.message_id
    || payload?.id
    || payload?.index
    || payload?.message?.id
    || payload?.message?.messageId
    || payload?.message?.message_id
    || null;
}

function carriesVisibilityEvidence(message = null, input = {}) {
  if (!message || typeof message !== 'object') return false;
  const visibility = normalizeHostMessageVisibility(message, input);
  return Boolean(
    visibility.hiddenByHost
    || visibility.hiddenByExternal
    || visibility.summaryceptionSummarized
    || visibility.memoryBooksVisibilityMutation
    || visibility.sourceMutation
  );
}

function mergeVisibilityPayloadMessage(message = null, payload = null) {
  if (!message || typeof message !== 'object' || !payload || typeof payload !== 'object') return message;
  const merged = { ...message };
  const extra = {
    ...(message.extra && typeof message.extra === 'object' ? message.extra : {}),
    ...(payload.extra && typeof payload.extra === 'object' ? payload.extra : {})
  };
  if (Object.keys(extra).length) merged.extra = extra;
  for (const key of ['deleted', 'is_deleted', 'hidden', 'is_hidden']) {
    if (payload[key] !== undefined) merged[key] = payload[key];
  }
  return merged;
}

function eventReplacementText(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.text
    || payload.mes
    || payload.content
    || payload.message?.text
    || payload.message?.mes
    || payload.message?.content
    || null;
}

function eventNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function eventSelectedSwipe(payload = {}) {
  if (!payload || typeof payload !== 'object') return null;
  const selectedSwipeIndex = payload.selectedSwipeIndex
    ?? payload.swipeIndex
    ?? payload.swipe_id
    ?? payload.message?.selectedSwipeIndex
    ?? payload.message?.swipeIndex
    ?? payload.message?.swipe_id
    ?? payload.message?.raw?.swipe_id
    ?? null;
  const swipeCount = payload.swipeCount
    ?? payload.message?.swipeCount
    ?? payload.message?.raw?.swipeCount
    ?? (Array.isArray(payload.swipes)
      ? payload.swipes.length
      : (Array.isArray(payload.message?.swipes)
        ? payload.message.swipes.length
        : (Array.isArray(payload.message?.raw?.swipes) ? payload.message.raw.swipes.length : null)));
  return {
    selectedSwipeIndex: eventNonNegativeInteger(selectedSwipeIndex),
    swipeCount: eventNonNegativeInteger(swipeCount),
    selectedAssistantVariantHash: payload.selectedAssistantVariantHash
      || payload.selectedTextHash
      || payload.message?.selectedAssistantVariantHash
      || payload.message?.metadata?.selectedAssistantVariantHash
      || null
  };
}

function narrationText(result) {
  return compact(
    result?.narrationResult?.narration?.text
    || result?.narrationResult?.narration?.content
    || result?.narrationResult?.narration
    || ''
  );
}

function narrationGenerationStartedAt(result) {
  return compact(
    result?.narrationResult?.directiveGenerationStartedAt
    || result?.narrationResult?.narration?.directiveGenerationStartedAt
    || result?.narrationResult?.narration?.generatedAt
    || result?.narrationResult?.error?.directiveGenerationStartedAt
    || result?.narrationResult?.error?.generationStartedAt
    || ''
  ) || null;
}

function localOutcomeNarration(result) {
  const packet = result?.turnPacket || {};
  const outcome = packet.outcomePacket || {};
  const summary = displaySafeOutcomeSummary(outcome.summary);
  if (summary) return summary;
  const visible = packet.commandLogPacket?.visibleConsequences
    || outcome.visibleConsequences
    || outcome.costs
    || [];
  const details = (Array.isArray(visible) ? visible : [visible])
    .map(fallbackVisibleConsequenceSentence)
    .filter(Boolean)
    .join(' ');
  return [fallbackOutcomeLead(outcome.resultBand), details || 'The bridge turns to the next decision.'].filter(Boolean).join(' ');
}

function localRoutineNarration(message = null) {
  const text = compact(message?.text || message?.mes || message?.content || '');
  const lower = text.toLowerCase();
  if (/\bamend\b|\bcorrection\b|\bcorrects?\b|\breconcile\b|\bstale wording\b/.test(lower)) {
    return [
      'Nayar acknowledges the correction and keeps the amended wording tied to the active watch log.',
      'Bronn flags the old phrasing as stale before any station treats it as authority.',
      'The bridge holds execution until the current order chain is clear.'
    ].join(' ');
  }
  if (/\bwithdraws?\b|\bcancel\b|\bdelete\b|\bdeleted\b|\bobsolete\b/.test(lower)) {
    return [
      'Nayar marks the withdrawn instruction as inactive while preserving the audit trail.',
      'Bronn keeps the dependent reports under review instead of letting stale orders carry forward.',
      'The bridge waits for a current, lawful instruction before anyone acts.'
    ].join(' ');
  }
  if (/\brecalculate\b|\bbranch\b|\bpreview\b/.test(lower)) {
    return [
      'Nayar keeps the recalculation separate from the active watch log and labels it as comparison evidence.',
      'The branch candidate remains advisory until Arlen or Captain Whitaker explicitly loads it.',
      'Current assignments continue from the standing record.'
    ].join(' ');
  }
  return 'The order is acknowledged and folded into the working rhythm. The relevant officers carry it forward while the log records the procedure.';
}

const GUIDE_ACTOR_LABELS = Object.freeze({
  'hadrik-bronn': 'Bronn',
  'mara-whitaker': 'Whitaker',
  'imani-cross': 'Cross',
  'miriam-sato': 'Sato',
  'rowan-saye': 'Saye',
  'priya-nayar': 'Nayar',
  'kieran-vale': 'Vale'
});

function readableLocationLabel(value = '') {
  const compacted = compact(value);
  if (!compacted) return '';
  return compacted
    .replace(/^intrepid[.-]/i, '')
    .replace(/^breckenridge[.-]/i, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function readableOriginLocationLabel(value = '') {
  const label = readableLocationLabel(value);
  if (/^In Transit$/i.test(label)) return 'The previous stretch of corridor';
  return label;
}

function localLocationTransitionNarration(campaignState = {}, decision = {}) {
  const boundary = decision.sceneBoundary || {};
  const destination = compact(boundary.destinationLabel || readableLocationLabel(boundary.destinationId));
  const guide = compact(GUIDE_ACTOR_LABELS[boundary.guideActorId] || '');
  const target = destination || 'the next part of the ship';
  const origin = compact(
    campaignState.worldState?.currentLocationLabel
    || campaignState.worldState?.currentLocationName
    || readableOriginLocationLabel(campaignState.worldState?.currentLocationId)
  );
  const lead = guide
    ? `${guide} gives a short nod and starts toward ${target}.`
    : `The move toward ${target} begins without skipping the walk itself.`;
  const departure = origin
    ? `${origin} falls behind by ordinary increments: deck noise, corridor turns, and the pause of shipboard movement.`
    : 'The previous room falls behind by ordinary increments: deck noise, corridor turns, and the pause of shipboard movement.';
  const arrival = destination
    ? `When ${destination} comes into view, the moment holds at the threshold rather than rushing through the visit.`
    : 'Before the next room can become a finished visit, the moment holds in the passage.';
  const handoff = guide
    ? `${guide} glances back, leaving you the first read of the place and the first word.`
    : 'The nearest officer waits, leaving you the first read of the place and the first word.';
  return `${lead} ${departure} ${arrival} ${handoff}`;
}

const MODEL_BACKED_RETRY_RESPONSE_KINDS = new Set([
  'committedOutcome',
  'directiveNarration',
  'narration'
]);

function localDirectiveResponseVariant(responseKind) {
  if (responseKind === 'clarificationNeeded') return composePauseResponse('clarificationNeeded');
  if (responseKind === 'riskConfirmationNeeded') return composePauseResponse('riskConfirmationNeeded');
  if (responseKind === 'routineCommand') return localRoutineNarration();
  return 'The response is restated without changing the committed campaign state. The bridge holds to the same outcome and waits for your next order.';
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (item === null || item === undefined || item === '') return false;
    if (Array.isArray(item) && item.length === 0) return false;
    if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) return false;
    return true;
  }));
}

function compactRetryWorkerPlan(workerPlan = {}) {
  const source = workerPlan && typeof workerPlan === 'object' ? workerPlan : {};
  return compactObject({
    promptUpdate: source.promptUpdate === true ? true : undefined
  });
}

function responseRetryGenerationPlanForDecision({ decision = {}, strategy = null, responseKind = null } = {}) {
  const classification = compact(decision?.classification);
  const kind = compact(responseKind);
  const plan = {
    kind: 'directive.responseRetryGenerationPlan.v1',
    schemaVersion: 1,
    strategy: compact(strategy) || null,
    responseKind: kind || null,
    classification: classification || null
  };
  const workerPlan = compactRetryWorkerPlan(decision?.workerPlan || {});
  if (Object.keys(workerPlan).length > 0) plan.workerPlan = workerPlan;
  if (classification === 'locationTransition' || kind === 'locationTransition') {
    const boundary = decision?.sceneBoundary || {};
    const destinationId = compact(boundary.destinationId || decision?.target);
    const destinationLabel = compact(boundary.destinationLabel || readableLocationLabel(destinationId));
    plan.locationTransition = compactObject({
      destinationId,
      destinationLabel,
      guideActorId: compact(boundary.guideActorId),
      stopPolicy: compact(boundary.stopPolicy || 'stopOnArrival')
    });
  } else if (
    MODEL_BACKED_RETRY_RESPONSE_KINDS.has(kind)
    || ['consequentialCommand', 'directorResponseNeeded'].includes(classification)
  ) {
    plan.modelBacked = {
      role: 'narration',
      mechanics: 'alreadyCommitted',
      rerunMechanics: false
    };
  }
  return compactObject(plan);
}

function retryDecisionFromGenerationPlan(plan = {}, details = {}) {
  const classification = compact(plan.classification || details.classification || 'directorResponseNeeded');
  const decision = {
    classification,
    workerPlan: cloneJson(plan.workerPlan || details.workerPlan || {})
  };
  if (classification === 'locationTransition' || compact(plan.responseKind || details.responseKind) === 'locationTransition') {
    const locationTransition = plan.locationTransition || {};
    decision.sceneBoundary = compactObject({
      kind: 'locationTransition',
      destinationId: compact(locationTransition.destinationId),
      destinationLabel: compact(locationTransition.destinationLabel),
      guideActorId: compact(locationTransition.guideActorId),
      stopPolicy: compact(locationTransition.stopPolicy || 'stopOnArrival')
    });
  }
  return decision;
}

function committedOutcomeRetryContext(state = {}, details = {}) {
  const outcomeId = compact(details.outcomeId || details.repairDecision?.outcomeId || '');
  const turnId = compact(details.turnId || details.repairDecision?.turnId || '');
  const ledger = (state.turnLedger?.entries || []).find((entry) => (
    (outcomeId && entry.outcomeId === outcomeId)
    || (turnId && entry.turnId === turnId)
  )) || null;
  const commandLog = (state.commandLog?.entries || []).find((entry) => (
    outcomeId && entry.sourceOutcomeId === outcomeId
  )) || null;
  const ingress = details.ingressId
    ? (createRuntimeLedgerView(state || {}).ingressLedger || []).find((entry) => entry.id === details.ingressId) || null
    : null;
  return compactObject({
    outcomeId: outcomeId || ledger?.outcomeId || null,
    turnId: turnId || ledger?.turnId || null,
    resultBand: ledger?.resultBand || null,
    playerTextPreview: displaySafeChatText(ingress?.textPreview || ''),
    visibleConsequences: Array.isArray(commandLog?.visibleConsequences)
      ? commandLog.visibleConsequences.slice(0, 8)
      : [],
    commandLogSummaryInputs: Array.isArray(commandLog?.summaryInputs)
      ? commandLog.summaryInputs.slice(0, 6)
      : [],
    competenceStatus: ledger?.competencePacket?.status || ledger?.competencePacket?.result || null
  });
}

function hasCommittedTurnLedgerOutcome(state = {}, outcomeId = null) {
  const id = compact(outcomeId);
  if (!id) return false;
  return (state.turnLedger?.entries || []).some((entry) => entry?.outcomeId === id);
}

function responseRetryNarrationRequest({ state = {}, details = {}, plan = {}, responseKind = null, classification = null } = {}) {
  const safe = createPlayerSafeCampaignProjection({ campaignState: state }) || {};
  const outcome = committedOutcomeRetryContext(state, {
    ...details,
    outcomeId: details.outcomeId,
    turnId: details.turnId
  });
  const system = [
    'Rewrite a Directive-owned assistant response for an already committed campaign turn.',
    'Do not rerun mechanics, change state, add new outcomes, expose hidden facts, or mention recovery internals.',
    'Use only player-visible campaign context and committed outcome evidence.',
    'Write only the replacement assistant message text.'
  ].join('\n');
  const user = [
    `Response kind: ${responseKind || 'committedOutcome'}`,
    `Turn classification: ${classification || 'directorResponseNeeded'}`,
    `Retry strategy: ${compact(plan.strategy || details.strategy || 'directivePosted')}`,
    '',
    'Committed outcome evidence:',
    boundedJson(outcome, 2200),
    '',
    'Player-safe campaign context:',
    boundedJson({ mission: safe.mission, ship: safe.ship, crew: safe.crew, pressures: safe.pressures }, 3600),
    '',
    'Write fresh prose for the same committed result. Keep it concise enough for chat play.'
  ].join('\n');
  return {
    systemPrompt: system,
    prompt: `${system}\n\n${user}`,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    metadata: {
      source: 'directive-response-retry-regeneration',
      responseKind: responseKind || null,
      classification: classification || null,
      outcomeId: outcome.outcomeId || details.outcomeId || null,
      turnId: outcome.turnId || details.turnId || null,
      rerunMechanics: false
    }
  };
}

async function regenerateResponseRetryText({ state = {}, details = {}, generationRouter = null } = {}) {
  const plan = details.responseRetryPlan || {};
  const responseKind = compact(plan.responseKind || details.responseKind);
  const classification = compact(plan.classification || details.classification);
  if (responseKind === 'locationTransition' || classification === 'locationTransition') {
    const decision = retryDecisionFromGenerationPlan({
      ...cloneJson(plan || {}),
      responseKind: responseKind || 'locationTransition',
      classification: classification || 'locationTransition'
    }, details);
    return {
      ok: true,
      text: localLocationTransitionNarration(state, decision),
      decision,
      strategy: compact(plan.strategy || details.strategy || 'directivePosted'),
      responseKind: 'locationTransition'
    };
  }
  if (
    MODEL_BACKED_RETRY_RESPONSE_KINDS.has(responseKind)
    || plan.modelBacked?.role === 'narration'
    || ['consequentialCommand', 'directorResponseNeeded'].includes(classification)
  ) {
    if (typeof generationRouter?.generate !== 'function') {
      return {
        ok: false,
        reason: 'response-retry-model-unavailable'
      };
    }
    const request = responseRetryNarrationRequest({
      state,
      details,
      plan,
      responseKind: responseKind || 'committedOutcome',
      classification: classification || 'directorResponseNeeded'
    });
    const generated = await generationRouter.generate('narration', request);
    const text = generatedText(generated);
    if (!compact(text)) {
      return {
        ok: false,
        reason: generated?.ok === false ? 'response-retry-generation-failed' : 'response-retry-generation-empty',
        generation: generated?.ok === false ? cloneJson(generated.error || null) : null
      };
    }
    return {
      ok: true,
      text,
      decision: retryDecisionFromGenerationPlan(plan, details),
      strategy: compact(plan.strategy || details.strategy || 'directivePosted'),
      responseKind: responseKind || 'committedOutcome',
      generationSource: 'generation-router'
    };
  }
  return {
    ok: false,
    reason: 'response-retry-text-unavailable'
  };
}

function warningText(preview) {
  const confirmation = preview?.warningConfirmation || preview?.turnPacket?.warningConfirmation || {};
  const warnings = [
    confirmation.playerFacingWarning,
    confirmation.message,
    ...(preview?.turnPacket?.competencePacket?.proceduralWarnings || []).map((entry) => entry.playerFacingWarning || entry.message)
  ].map(compact).filter(Boolean);
  return composePauseResponse('riskConfirmationNeeded', { warnings });
}


function campaignCrewIds(state) {
  return [...new Set((state?.crew?.seniorCrewIds || []).map((id) => compact(id)).filter(Boolean))];
}

function inferCrewIdsFromText(state, text = '') {
  const lower = compact(text).toLowerCase();
  const ids = campaignCrewIds(state);
  const matched = new Set();
  for (const id of ids) {
    const tokens = id.split(/[-_\s]+/).filter((token) => token.length >= 3);
    if (tokens.some((token) => lower.includes(token.toLowerCase()))) matched.add(id);
  }
  if ((lower.includes('captain') || lower.includes('commanding officer')) && ids.includes('mara-whitaker')) {
    matched.add('mara-whitaker');
  }
  return [...matched];
}


export function createChatTurnOrchestrator({
  host,
  classify,
  arbitrate = null,
  generationRouter = null,
  responseDispatcher,
  turnCommitCoordinator = null,
  repairRuntime = null,
  coreTurnStore = null,
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext,
  getPackageData = null,
  getCrewDataset = null,
  getShipDataset = null,
  previewDirectorTurn,
  commitProvisionalDirectorTurn,
  discardProvisionalDirectorTurn = null,
  settleV1MissionAcceptedPair = null,
  resolveV1SemanticAuthority = null,
  getRuntimeAssets = null,
  v1MissionSettlementTimeoutMs = 10000,
  ingressPersistTimeoutMs = 750,
  coreProjectionReadTimeoutMs = 750,
  coreBeginTurnTimeoutMs = 750,
  rewriteCampaignIntro = null,
  clearDirectivePrompt = null,
  suspendDirectivePrompt = null,
  reportTurnActivity = null,
  now = null
} = {}) {
  if (!host?.chat) throw new Error('ChatTurnOrchestrator requires host.chat.');
  if (typeof classify !== 'function') throw new Error('ChatTurnOrchestrator requires classify().');
  if (arbitrate !== null && typeof arbitrate !== 'function') throw new Error('ChatTurnOrchestrator requires arbitrate() to be a function when provided.');
  if (!responseDispatcher?.dispatch) throw new Error('ChatTurnOrchestrator requires responseDispatcher.dispatch().');
  if (!stateDeltaGateway?.commit) throw new Error('ChatTurnOrchestrator requires stateDeltaGateway.commit().');
  if (typeof getCampaignState !== 'function' || typeof setCampaignState !== 'function') {
    throw new Error('ChatTurnOrchestrator requires campaign state callbacks.');
  }
  if (typeof persistCampaignState !== 'function') throw new Error('ChatTurnOrchestrator requires persistCampaignState().');
  if (typeof previewDirectorTurn !== 'function' || typeof commitProvisionalDirectorTurn !== 'function') {
    throw new Error('ChatTurnOrchestrator requires Director callbacks.');
  }

  const inFlight = new Map();
  const queues = new Map();
  const observedIngressRecords = new Map();
  const debugState = {
    stage: 'idle',
    updatedAt: new Date().toISOString(),
    details: {}
  };
  const repair = repairRuntime || createRepairCommandBoundary({ coreTurnStore, now });
  function markDebugStage(stage, details = {}) {
    debugState.stage = compact(stage) || 'unknown';
    debugState.updatedAt = new Date().toISOString();
    debugState.details = cloneJson(details || {});
  }

  function currentChatId() {
    return host.chat.getCurrentChatId?.() || host.chat.getCurrentBinding?.()?.chatId || null;
  }

  function currentChatBinding() {
    return host.chat.getCurrentBinding?.() || host.chat.getCurrentChatIdentity?.() || null;
  }

  function corePendingInteractionRows(state = null) {
    const projections = state?.directiveRuntimeEvidence?.coreStoreReadProjections || {};
    return Array.isArray(projections.pendingInteractions)
      ? projections.pendingInteractions.filter(isPendingInteractionProjectionRow)
      : [];
  }

  function pendingInteractionRows(state = null) {
    return cloneJson(corePendingInteractionRows(state));
  }

  function mergeProjectionRows(existingRows = [], freshRows = [], keyFields = ['id']) {
    const merged = Array.isArray(existingRows) ? cloneJson(existingRows) : [];
    for (const fresh of Array.isArray(freshRows) ? freshRows : []) {
      const matchIndex = merged.findIndex((entry) => keyFields.some((key) => (
        compact(entry?.[key]) && compact(entry?.[key]) === compact(fresh?.[key])
      )));
      if (matchIndex >= 0) merged[matchIndex] = { ...merged[matchIndex], ...cloneJson(fresh) };
      else merged.push(cloneJson(fresh));
    }
    return merged;
  }

  function responseProjectionRows(projections = {}) {
    return Array.isArray(projections?.responses)
      ? projections.responses
      : (Array.isArray(projections?.responseLedger) ? projections.responseLedger : []);
  }

  function mergeCoreStoreReadProjections(existing = {}, fresh = {}) {
    const merged = {
      ...cloneJson(existing || {}),
      ...cloneJson(fresh || {}),
      ingressLedger: mergeProjectionRows(existing?.ingressLedger, fresh?.ingressLedger, ['id', 'ingressId', 'transactionId', 'coreTransactionId']),
      responses: mergeProjectionRows(responseProjectionRows(existing), responseProjectionRows(fresh), ['id', 'responseId', 'transactionId', 'coreTransactionId']),
      recoveryJournal: mergeProjectionRows(existing?.recoveryJournal, fresh?.recoveryJournal, ['id', 'recoveryId', 'transactionId', 'coreTransactionId']),
      pendingInteractions: mergeProjectionRows(existing?.pendingInteractions, fresh?.pendingInteractions, ['id', 'interactionId'])
    };
    delete merged.responseLedger;
    return merged;
  }

  async function stateWithCorePendingProjections(state = null) {
    const fallback = initializeCampaignRuntimeTracking(state);
    if (typeof coreTurnStore?.readProjections !== 'function') return fallback;
    let projections = null;
    try {
      projections = await withTimeout(
        coreTurnStore.readProjections(),
        coreProjectionReadTimeoutMs,
        () => timeoutError(
          'DIRECTIVE_CORE_PROJECTION_READ_TIMEOUT',
          'CORE projection read timed out while hydrating pending interactions.',
          coreProjectionReadTimeoutMs
        )
      );
    } catch {
      return fallback;
    }
    if (!projections || typeof projections !== 'object' || Array.isArray(projections)) return fallback;
    const next = cloneJson(state || {});
    const existing = next.directiveRuntimeEvidence?.coreStoreReadProjections || {};
    next.directiveRuntimeEvidence = {
      ...(next.directiveRuntimeEvidence || {}),
      coreStoreReadProjections: mergeCoreStoreReadProjections(existing, projections)
    };
    return initializeCampaignRuntimeTracking(next);
  }

  function activeBoundState(chatId = currentChatId()) {
    const state = getCampaignState();
    if (!state || state.campaign?.status !== 'active') return null;
    if (!state.campaignChatBinding?.chatId) return null;
    const observedChatId = compact(chatId || '');
    if (compact(state.campaignChatBinding.chatId) !== observedChatId) return null;
    const binding = currentChatBinding();
    const bindingChatId = compact(binding?.chatId || '');
    if (bindingChatId && bindingChatId === observedChatId) {
      const boundCampaignId = compact(state.campaignChatBinding.campaignId || state.campaign?.id || '');
      const bindingCampaignId = compact(binding?.campaignId || '');
      if (boundCampaignId && bindingCampaignId && boundCampaignId !== bindingCampaignId) return null;
      const boundSaveId = compact(state.campaignChatBinding.saveId || '');
      const bindingSaveId = compact(binding?.saveId || '');
      if (boundSaveId && bindingSaveId && boundSaveId !== bindingSaveId) return null;
    }
    return initializeCampaignRuntimeTracking(state);
  }

  function enqueue(campaignId, task) {
    const prior = queues.get(campaignId) || Promise.resolve();
    const next = prior.then(task, task);
    const tracked = next.finally(() => {
      if (queues.get(campaignId) === tracked) queues.delete(campaignId);
    });
    queues.set(campaignId, tracked);
    return tracked;
  }

  async function persistState(state, summary) {
    setCampaignState(state);
    await persistCampaignState(state, summary);
    return state;
  }

  function persistStateInBackground(state, summary, activityReporter = null) {
    setCampaignState(state);
    reportActivity(activityReporter, {
      phase: 'ingressPersistScheduled',
      mode: 'diagnostic',
      source: 'storage',
      summary: compact(summary).slice(0, 180)
    });
    Promise.resolve()
      .then(() => persistCampaignState(state, summary))
      .then(() => {
        reportActivity(activityReporter, {
          phase: 'ingressPersistSettled',
          mode: 'diagnostic',
          source: 'storage',
          summary: compact(summary).slice(0, 180)
        });
      })
      .catch((error) => {
        reportActivity(activityReporter, {
          phase: 'runtimePersistDeferred',
          mode: 'diagnostic',
          source: 'storage',
          error: {
            code: error?.code || null,
            message: error?.message || String(error)
          }
        });
      });
    return state;
  }

  function promptFrameForMessage(state, message = null, decision = null, extra = {}) {
    const playerText = compact(message?.text || '');
    const inferredCrewIds = inferCrewIdsFromText(state, playerText);
    const recentChatMessages = host.chat.getRecentMessages?.({ limit: 12, playerSafeOnly: false }) || [];
    const { scene: extraScene = {}, ...rest } = extra || {};
    return {
      playerText,
      recentChatMessages,
      scene: {
        activePhaseId: state?.mission?.activePhaseId || state?.mission?.phase || state?.attentionState?.scene?.activePhaseId || null,
        presentActorIds: inferredCrewIds,
        relevantCrewIds: inferredCrewIds,
        currentQuestion: decision?.action || decision?.target || null,
        ...extraScene
      },
      ...rest
    };
  }

  async function syncPrompt(state, summary = 'Prompt context synchronized.', promptFrame = null, activityReporter = null, activityContext = {}) {
    if (typeof syncPromptContext !== 'function') return state;
    const next = await syncPromptContext(state, promptFrame, {
      activityReporter,
      activitySource: activityContext.activitySource || activityContext.source || 'chatTurnPromptSync',
      forceRebuild: activityContext.forcePromptRebuild === true || activityContext.forceRebuild === true,
      activityContext: {
        classification: activityContext.classification || null,
        ingressId: activityContext.ingressId || null,
        turnId: activityContext.turnId || null,
        outcomeId: activityContext.outcomeId || null,
        source: activityContext.source || null,
        forcePromptRebuild: activityContext.forcePromptRebuild === true || activityContext.forceRebuild === true,
        promptDirtyDomains: cloneJson(activityContext.promptDirtyDomains || [])
      }
    });
    if (next && next !== state) {
      await persistState(next, summary);
      return next;
    }
    return getCampaignState() || state;
  }

  async function preflightAcceptedPairSource(state, message, chatId, ingressId, activityReporter = null) {
    const tracked = initializeCampaignRuntimeTracking(state);
    const ingress = await findIngressFresh(tracked, ingressId);
    const sourceFrame = ingress?.sourceFrame || null;
    const transactionId = ingress?.coreTransactionId || null;
    if (!sourceFrame || !transactionId) {
      const decision = {
        kind: 'directive.acceptedPairSourceDecision.v1',
        status: 'hardSkipped',
        transactionId: transactionId || null,
        providerCalled: false,
        applied: false,
        reasons: ['accepted-pair-source-core-ingress-missing'],
        observedAt: timestamp(now)
      };
      reportActivity(activityReporter, {
        phase: 'v1AcceptedPairSourceBlocked',
        mode: 'blocking',
        source: 'sre',
        ingressId,
        status: decision.status,
        reasons: cloneJson(decision.reasons),
        providerCalled: false,
        applied: false
      });
      return decision;
    }
    const freshPreviousAssistant = selectedAssistantVariantRef(previousAssistantForFrame(message));
    const expected = {
      campaignId: state.campaign?.id || null,
      saveId: state.campaignChatBinding?.saveId || null,
      chatId
    };
    const expectedSelectedAssistantVariantHash = freshPreviousAssistant?.selectedTextHash
      || freshPreviousAssistant?.selectedAssistantVariantHash
      || sourceFrame.previousAssistant?.selectedAssistantVariantHash
      || null;
    if (expectedSelectedAssistantVariantHash) {
      expected.selectedAssistantVariantHash = expectedSelectedAssistantVariantHash;
    }
    try {
      const clean = assertFrameCleanForSettlement(sourceFrame, expected);
      const decision = {
        kind: 'directive.acceptedPairSourceDecision.v1',
        status: 'preflightClean',
        transactionId,
        sourceFrameId: clean.sourceFrameId,
        sourceToken: clean.sourceToken,
        providerCalled: false,
        applied: false,
        reasons: [],
        observedAt: timestamp(now)
      };
      reportActivity(activityReporter, {
        phase: 'v1AcceptedPairSourcePreflight',
        mode: 'diagnostic',
        source: 'sre',
        ingressId,
        transactionId,
        sourceFrameId: sourceFrame.id || null,
        status: decision.status || null,
        providerCalled: decision.providerCalled === true,
        applied: decision.applied === true,
        reasons: cloneJson(decision.reasons || [])
      });
      return decision;
    } catch (error) {
      reportActivity(activityReporter, {
        phase: 'v1AcceptedPairSourcePreflightFailed',
        mode: 'diagnostic',
        source: 'sre',
        ingressId,
        transactionId,
        sourceFrameId: sourceFrame.id || null,
        error: {
          code: error?.code || null,
          message: error?.message || String(error)
        }
      });
      return {
        kind: 'directive.acceptedPairSourceDecision.v1',
        status: 'hardSkipped',
        transactionId,
        sourceFrameId: sourceFrame.id || null,
        providerCalled: false,
        applied: false,
        reasons: cloneJson(error?.reasons || ['accepted-pair-source-not-clean']),
        observedAt: timestamp(now)
      };
    }
  }


  function runtimeAssetsForV1Settlement() {
    let runtimeAssets = null;
    try {
      runtimeAssets = typeof getRuntimeAssets === 'function' ? getRuntimeAssets() : null;
    } catch {
      runtimeAssets = null;
    }
    return runtimeAssets;
  }

  function acceptedPairSemanticAuthority(state) {
    const runtimeAssets = runtimeAssetsForV1Settlement();
    if (typeof resolveV1SemanticAuthority !== 'function') {
      return { ok: false, mode: 'blocked', reasonCode: 'authority-resolver-unavailable', runtimeAssets };
    }
    try {
      const authority = resolveV1SemanticAuthority({ campaignState: state, runtimeAssets });
      if (!['authoritative', 'blocked'].includes(authority?.mode)) {
        return { ok: false, mode: 'blocked', reasonCode: 'authority-resolution-invalid', runtimeAssets };
      }
      return { ...authority, runtimeAssets };
    } catch {
      return { ok: false, mode: 'blocked', reasonCode: 'authority-resolution-failed', runtimeAssets };
    }
  }

  async function prepareV1AcceptedPair(
    state,
    message,
    chatId,
    ingressId,
    runtimeAssets,
    activityReporter = null
  ) {
    const recentMessages = host.chat.getRecentMessages?.({ limit: 12, playerSafeOnly: false }) || [];
    const prepared = prepareV1AcceptedPairSnapshot({
      campaignState: state,
      currentPlayerMessage: message,
      recentMessages,
      chatId,
      ingressId
    });
    if (!prepared.ok) {
      reportActivity(activityReporter, {
        phase: 'v1AcceptedPairSkipped',
        mode: 'diagnostic',
        source: 'v1MissionSettlement',
        ingressId,
        reason: prepared.reason || 'accepted-pair-snapshot-unavailable'
      });
      return { campaignState: state, snapshot: null, hardBoundary: null };
    }
    const sourcePreflight = await preflightAcceptedPairSource(
      state,
      message,
      chatId,
      ingressId,
      activityReporter
    );
    if (sourcePreflight && sourcePreflight.status !== 'preflightClean') {
      reportActivity(activityReporter, {
        phase: 'v1AcceptedPairSourceBlocked',
        mode: 'blocking',
        source: 'sre',
        ingressId,
        status: sourcePreflight.status || null,
        reasons: cloneJson(sourcePreflight.reasons || [])
      });
      return { campaignState: state, snapshot: null, hardBoundary: null };
    }
    const timeCustody = await commitV1AcceptedPairTimeAdvance({
      campaignState: state,
      snapshot: prepared.snapshot,
      packageData: runtimeAssets?.packageData || null,
      generationRouter,
      stateDeltaGateway,
      ingressId,
      now
    });
    reportActivity(activityReporter, {
      phase: 'v1AcceptedPairTimeCustody',
      mode: 'diagnostic',
      source: 'v1AcceptedPairTimeCustody',
      ingressId,
      status: timeCustody.status,
      reasonCode: timeCustody.reasonCode || null,
      boundaryId: timeCustody.boundary?.id || null,
      elapsedMinutes: timeCustody.proposal?.elapsedMinutes || timeCustody.boundary?.elapsedMinutes || 0
    });
    return {
      campaignState: timeCustody.campaignState || state,
      snapshot: prepared.snapshot,
      hardBoundary: null
    };
  }

  async function settleV1MissionAcceptedPairForState(
    state,
    snapshot,
    hardBoundary,
    message,
    chatId,
    ingressId,
    runtimeAssets,
    activityReporter = null
  ) {
    const timeoutMs = Math.min(
      Number.isFinite(Number(v1MissionSettlementTimeoutMs)) && Number(v1MissionSettlementTimeoutMs) > 0
        ? Number(v1MissionSettlementTimeoutMs)
        : 10000,
      10000
    );
    reportActivity(activityReporter, {
      phase: 'settlingV1Mission',
      mode: 'blocking',
      source: 'v1MissionSettlement',
      ingressId,
      sourceRangeHash: snapshot?.source?.sourceRangeHash || null
    });
    const outcome = await runV1MissionSettlement({
      enabled: true,
      campaignState: state,
      snapshot,
      message,
      runtimeAssets,
      hardBoundary,
      settleV1MissionAcceptedPair,
      preflight: null,
      getCampaignState,
      timeoutMs
    });
    reportActivity(activityReporter, {
      phase: outcome.result.ok ? 'v1MissionSettled' : 'v1MissionSkipped',
      mode: 'diagnostic',
      source: 'v1MissionSettlement',
      ingressId,
      sourceRangeHash: snapshot?.source?.sourceRangeHash || null,
      status: outcome.result.status,
      reasonCode: outcome.result.reasonCode,
      definitionId: outcome.result.definitionId,
      definitionVersion: outcome.result.definitionVersion,
      committedRoots: cloneJson(outcome.result.committedRoots),
      noChange: outcome.result.noChange,
      transitionCommitted: outcome.result.transitionCommitted,
      diagnostics: cloneJson(outcome.result.diagnostics)
    });
    return outcome;
  }

  function reportActivity(activityReporter, event = {}) {
    const reporter = typeof activityReporter === 'function' ? activityReporter : reportTurnActivity;
    if (typeof reporter !== 'function') return;
    try {
      reporter({
        kind: 'directive.turnActivity',
        source: 'chatTurnOrchestrator',
        recordedAt: timestamp(now),
        ...event
      });
    } catch (error) {
      console.warn('[Directive] Failed to report chat turn activity:', error);
    }
  }


  function ingressIdFor(state, message, chatId) {
    const messageId = message.hostMessageId || message.id || message.index || 'message';
    return `ingress:${state.campaign?.id}:${chatId}:${messageId}:${fnv1a(message.text)}`;
  }

  function restartIngressIdFor(baseIngressId, priorIngress = null, message = {}) {
    const base = compact(baseIngressId);
    if (!base) return base;
    if (!priorIngress?.id) return base;
    const seed = [
      priorIngress.id,
      priorIngress.recoveryId || '',
      priorIngress.invalidatedAt || '',
      priorIngress.failedAt || '',
      priorIngress.status || '',
      fnv1a(message?.text || '')
    ].join('|');
    return `${base}:restart:${fnv1a(seed)}`;
  }

  function ingressTextKeyFor(state, message, chatId) {
    return `ingress-text:${state.campaign?.id}:${chatId}:${fnv1a(message?.text || '')}`;
  }

  function unknownExternalPromptEnvironment(observedAt) {
    return {
      kind: 'directive.externalPromptEnvironment.v1',
      schemaVersion: 1,
      host: 'sillytavern',
      status: 'unknown',
      observedAt,
      worldInfo: {},
      memoryBooks: {},
      summaryception: {},
      vectFox: {},
      knownExternalPromptKeys: [],
      unknownSignals: ['external-context-not-inspected-fast-gate'],
      redactions: []
    };
  }

  function selectedAssistantVariantHash(message = {}) {
    const raw = message.raw || {};
    return message.selectedAssistantVariantHash
      || message.acceptedAssistantVariantHash
      || message.metadata?.selectedAssistantVariantHash
      || message.metadata?.acceptedAssistantVariantHash
      || raw.extra?.directive?.selectedAssistantVariantHash
      || raw.extra?.directive?.acceptedAssistantVariantHash
      || null;
  }

  function messageText(message = {}) {
    const raw = message.raw || {};
    return displaySafeChatText(message.text || raw.text || raw.mes || raw.content || '');
  }

  function integerValue(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isInteger(number)) return number;
    }
    return null;
  }

  function selectedAssistantVariantRef(message = null) {
    if (!message) return null;
    const raw = message.raw || {};
    const swipes = Array.isArray(message.swipes)
      ? message.swipes
      : (Array.isArray(raw.swipes) ? raw.swipes : []);
    const selectedSwipeIndex = integerValue(
      message.selectedSwipeIndex,
      message.swipe_id,
      message.metadata?.selectedSwipeIndex,
      raw.selectedSwipeIndex,
      raw.swipe_id,
      raw.metadata?.selectedSwipeIndex
    );
    const hasSelectedSwipe = swipes.length
      && Number.isInteger(selectedSwipeIndex)
      && selectedSwipeIndex >= 0
      && selectedSwipeIndex < swipes.length;
    const visibleText = messageText(message);
    const selectedText = hasSelectedSwipe ? displaySafeChatText(swipes[selectedSwipeIndex] || '') : visibleText;
    const selectedTextHash = fnv1a(selectedText);
    const visibleTextHash = fnv1a(visibleText);
    let sourceIntegrity = 'clean';
    if (swipes.length && !hasSelectedSwipe) sourceIntegrity = 'stale';
    if (hasSelectedSwipe && visibleText && selectedTextHash !== visibleTextHash) sourceIntegrity = 'mismatch';
    return {
      hostMessageId: message.hostMessageId || message.id || raw.hostMessageId || raw.id || null,
      chatId: message.chatId || raw.chatId || null,
      role: 'assistant',
      selectedTextHash,
      selectedAssistantVariantHash: selectedTextHash,
      visibleTextHash,
      selectedSwipeIndex: hasSelectedSwipe ? selectedSwipeIndex : null,
      swipeCount: swipes.length || null,
      sourceIntegrity
    };
  }

  function previousAssistantForFrame(currentPlayerMessage = null) {
    const recent = host.chat.getRecentMessages?.({ limit: 12, playerSafeOnly: false }) || [];
    const currentId = String(currentPlayerMessage?.hostMessageId || currentPlayerMessage?.id || '');
    const currentIndex = recent.findIndex((entry) => String(entry.hostMessageId || entry.id || '') === currentId);
    const candidates = currentIndex >= 0 ? recent.slice(0, currentIndex) : recent;
    return [...candidates].reverse().find((entry) => (
      !entry.isUser
      && entry.isSystem !== true
      && entry.role !== 'user'
      && entry.role !== 'system'
      && entry.raw?.isSystem !== true
      && entry.raw?.is_system !== true
      && entry.raw?.role !== 'system'
      && entry.isDirectiveOwned !== true
      && entry.directiveOwned !== true
    )) || null;
  }

  function buildTurnSourceFrame(state, message, chatId, ingressId, observedAt) {
    const previousAssistant = selectedAssistantVariantRef(previousAssistantForFrame(message));
    const priorSelectedHash = previousAssistant?.selectedTextHash || null;
    const explicitSelectedHash = selectedAssistantVariantHash(message);
    return createTurnSourceFrame({
      id: `frame:${ingressId}`,
      campaignId: state.campaign?.id || null,
      saveId: state.campaignChatBinding?.saveId || null,
      chatId,
      hostMessageId: message.hostMessageId || message.id || String(message.index ?? ''),
      textHash: fnv1a(message.text),
      selectedAssistantVariantHash: explicitSelectedHash || priorSelectedHash,
      sourceIntegrity: previousAssistant?.sourceIntegrity || undefined,
      sourceRevision: state.runtimeTracking?.revision || 0,
      externalPromptEnvironment: unknownExternalPromptEnvironment(observedAt),
      visibility: message.visibility || null,
      previousAssistant,
      currentPlayer: {
        hostMessageId: message.hostMessageId || message.id || String(message.index ?? ''),
        role: 'player',
        textHash: fnv1a(message.text)
      },
      createdAt: observedAt
    });
  }

  async function beginCoreTurnForIngress(sourceFrame, {
    ingressId,
    chatId,
    sourceReobserveDecision = null,
    priorIngressForRecovery = null
  } = {}) {
    const transactionId = `txn:${sourceFrame.id}`;
    const observeSource = coreTurnStore?.observeSource || coreTurnStore?.beginTurn;
    if (typeof observeSource !== 'function') {
      const error = new Error('CORE turn source observation is required before recording chat ingress.');
      error.code = 'DIRECTIVE_CORE_INGRESS_REQUIRED';
      error.ingressId = ingressId || null;
      error.sourceFrameId = sourceFrame?.id || null;
      throw error;
    }
    markDebugStage('beginCoreTurn:start', { ingressId, chatId, transactionId });
    const observePromise = Promise.resolve(observeSource.call(coreTurnStore, sourceFrame, {
      transactionId,
      ingressId,
      chatId,
      idempotencyKey: `begin:${ingressId}`
    }));
    observePromise.catch?.(() => null);
    let transaction = null;
    try {
      transaction = await withTimeout(
        observePromise,
        Number(coreBeginTurnTimeoutMs),
        () => timeoutError(
          'DIRECTIVE_CORE_BEGIN_TURN_TIMEOUT',
          'CORE turn source observation timed out on the chat-turn hot path.',
          Number(coreBeginTurnTimeoutMs)
        )
      );
      markDebugStage('beginCoreTurn:settled', { ingressId, chatId, transactionId });
    } catch (error) {
      if (error?.code !== 'DIRECTIVE_CORE_BEGIN_TURN_TIMEOUT') throw error;
      markDebugStage('beginCoreTurn:timeoutFallback', { ingressId, chatId, transactionId });
      transaction = {
        id: transactionId,
        phase: 'observed',
        sourceFrameId: sourceFrame.id || null,
        campaignId: sourceFrame.campaignId || null,
        saveId: sourceFrame.saveId || null,
        chatId,
        ingressId,
        pendingCoreWrite: true
      };
    }
    if (
      sourceReobserveDecision?.action === 'restartLatestSource'
      && priorIngressForRecovery?.coreTransactionId
      && transaction?.id
      && transaction.pendingCoreWrite !== true
      && typeof coreTurnStore?.supersedeLatestSourceTransaction === 'function'
    ) {
      const priorRecoveryId = sourceReobserveDecision.recoveryResolution?.priorRecoveryId
        || priorIngressForRecovery.recoveryId
        || null;
      const restart = await coreTurnStore.supersedeLatestSourceTransaction(priorIngressForRecovery.coreTransactionId, transaction.id, {
        reason: sourceReobserveDecision.recoveryResolution?.reason || 'latest-source-reobserved',
        priorRecoveryId,
        repairDecision: cloneJson(sourceReobserveDecision),
        observedTextHash: sourceReobserveDecision.observedTextHash || sourceFrame.textHash || null,
        sourceMutation: {
          kind: 'directive.sourceMutation.v1',
          sourceKind: 'playerIngress',
          eventType: 'playerMessageReobserved',
          hostMessageId: sourceFrame.hostMessageId || null,
          ingressId: priorIngressForRecovery.id || null,
          sourceFrameId: priorIngressForRecovery.sourceFrameId || null,
          replacementIngressId: ingressId,
          replacementSourceFrameId: sourceFrame.id,
          replacementTextHash: sourceReobserveDecision.observedTextHash || sourceFrame.textHash || null,
          replacementTextPresent: Boolean(sourceReobserveDecision.observedTextHash || sourceFrame.textHash)
        },
        idempotencyKey: `restart:${priorIngressForRecovery.coreTransactionId}:${transaction.id}:${sourceFrame.textHash || 'source'}`
      });
      const restarted = restart?.transaction || restart || null;
      if (!restarted?.id) {
        const error = new Error('CORE latest-source restart did not return a transaction id.');
        error.code = 'DIRECTIVE_CORE_INGRESS_TRANSACTION_REQUIRED';
        error.ingressId = ingressId || null;
        error.sourceFrameId = sourceFrame?.id || null;
        throw error;
      }
      return restarted;
    }
    if (!transaction?.id) {
      const error = new Error('CORE turn source observation did not return a transaction id.');
      error.code = 'DIRECTIVE_CORE_INGRESS_TRANSACTION_REQUIRED';
      error.ingressId = ingressId || null;
      error.sourceFrameId = sourceFrame?.id || null;
      throw error;
    }
    return transaction;
  }

  function findIngress(state, ingressId) {
    if (!ingressId) return null;
    return (createRuntimeLedgerView(state || {}).ingressLedger || []).find((entry) => entry.id === ingressId) || null;
  }

  async function runtimeLedgerViewFresh(state, options = {}) {
    const fastLedger = createRuntimeLedgerView(state || {}, { coreTurnStore, ...options });
    const hasFastProjection = ['ingressLedger', 'responseLedger', 'recoveryJournal']
      .some((key) => Array.isArray(fastLedger[key]) && fastLedger[key].length > 0);
    if (hasFastProjection) return fastLedger;
    try {
      return await withTimeout(
        createRuntimeLedgerViewAsync(state || {}, { coreTurnStore, ...options }),
        Number(coreProjectionReadTimeoutMs),
        () => timeoutError(
          'DIRECTIVE_CORE_PROJECTION_READ_TIMEOUT',
          'CORE projection read timed out on the chat-turn hot path.',
          Number(coreProjectionReadTimeoutMs)
        )
      );
    } catch {
      return fastLedger;
    }
  }

  async function findIngressFresh(state, ingressId, options = {}) {
    if (!ingressId) return null;
    const ledger = await runtimeLedgerViewFresh(state, options);
    return (ledger.ingressLedger || []).find((entry) => entry.id === ingressId) || null;
  }

  async function markCoreResponseRetryRequired(state, {
    ingressId = null,
    outcomeId = null,
    turnId = null,
    recoveryId = null,
    reason = 'host-response-post-failure',
    error = null,
    responseRetryPlan = null
  } = {}) {
    const ingress = await findIngressFresh(initializeCampaignRuntimeTracking(state), ingressId);
    const handleResponseFailure = repair.handleResponseFailure || repair.recordResponseRecovery;
    return handleResponseFailure.call(repair, {
      eventType: reason === 'provider-failure-after-mechanics-commit'
        ? 'providerFailureAfterMechanicsCommit'
        : 'hostResponsePostFailure',
      reason,
      ingress,
      ingressId,
      outcomeId,
      turnId,
      sourceFrameId: ingress?.sourceFrameId || null,
      recoveryId: recoveryId || `recovery:response:${ingressId || outcomeId || turnId || 'turn'}`,
      error,
      responseRetryPlan
    });
  }

  function responseRetryRecoveryCoreError({
    ingress = null,
    result = null,
    originalError = null,
    recoveryId = null,
    reason = null,
    outcomeId = null,
    turnId = null
  } = {}) {
    const coreTransactionId = compact(
      ingress?.coreTransactionId
      || result?.transactionId
      || result?.decision?.transactionId
      || ''
    ) || null;
    const error = new Error(
      originalError?.message
        ? `CORE response recovery failed: ${originalError.message}`
        : `CORE response recovery was not recorded for ${coreTransactionId || recoveryId || outcomeId || turnId || 'turn'}.`
    );
    error.code = 'DIRECTIVE_CORE_RESPONSE_RECOVERY_NOT_RECORDED';
    error.details = {
      ingressId: ingress?.id || null,
      coreTransactionId,
      recoveryId: recoveryId || null,
      outcomeId: outcomeId || null,
      turnId: turnId || null,
      status: result?.status || null,
      reason: result?.reason || reason || null
    };
    if (originalError) error.cause = originalError;
    return error;
  }

  async function markCoreResponseRetryRequiredForBridge(state, payload = {}) {
    const tracked = initializeCampaignRuntimeTracking(state);
    const ingress = await findIngressFresh(tracked, payload.ingressId);
    try {
      const result = await markCoreResponseRetryRequired(tracked, payload);
      if (ingress?.coreTransactionId && result?.status !== 'recorded') {
        throw responseRetryRecoveryCoreError({
          ingress,
          result,
          recoveryId: payload.recoveryId,
          reason: payload.reason,
          outcomeId: payload.outcomeId,
          turnId: payload.turnId
        });
      }
      return result;
    } catch (error) {
      if (ingress?.coreTransactionId && error?.code !== 'DIRECTIVE_CORE_RESPONSE_RECOVERY_NOT_RECORDED') {
        throw responseRetryRecoveryCoreError({
          ingress,
          originalError: error,
          recoveryId: payload.recoveryId,
          reason: payload.reason,
          outcomeId: payload.outcomeId,
          turnId: payload.turnId
        });
      }
      if (ingress?.coreTransactionId) throw error;
      return {
        status: 'notRecorded',
        reason: 'no-core-transaction',
        transactionId: null,
        decision: null
      };
    }
  }

  async function markCoreTurnProcessingFailureForBridge(state, {
    ingressId = null,
    recoveryId = null,
    stage = 'processing',
    failure = null,
    decision = null,
    message = null
  } = {}) {
    const tracked = initializeCampaignRuntimeTracking(state);
    const ingress = await findIngressFresh(tracked, ingressId);
    const transactionId = compact(ingress?.coreTransactionId || '');
    if (!transactionId || typeof coreTurnStore?.markRecoveryRequired !== 'function') return null;
    const sourceFrameRef = ingress?.sourceFrame
      ? createTurnSourceFrameRef(ingress.sourceFrame)
      : (ingress?.sourceFrameId ? { id: ingress.sourceFrameId } : null);
    const failureDiagnostic = compactTurnProcessingFailureError(failure);
    const recoveryCase = await coreTurnStore.markRecoveryRequired(transactionId, {
      id: recoveryId || `recovery:chat-turn:${stage || 'processing'}:${ingressId || messageHostMessageId(message) || 'turn'}`,
      phaseAfter: 'recoveryRequired',
      status: 'required',
      reason: 'chatTurnProcessingFailure',
      idempotencyKey: `chat-turn-processing-failure:${recoveryId || ingressId || messageHostMessageId(message) || transactionId}`,
      sourceMutation: {
        kind: 'directive.sourceMutation.v1',
        eventType: 'chatTurnProcessingFailure',
        sourceKind: 'playerIngress',
        hostMessageId: messageHostMessageId(message) || ingress?.hostMessageId || null,
        ingressId: ingress?.id || ingressId || null,
        sourceFrameId: ingress?.sourceFrameId || null,
        sourceFrameRef,
        textHash: ingress?.textHash || null,
        errorCode: failureDiagnostic?.code || null,
        errorSummary: failureDiagnostic?.summary || null,
        errorMessageHash: failureDiagnostic?.messageHash || null,
        errorMessageLength: failureDiagnostic?.messageLength ?? null,
        stage: stage || 'processing'
      },
      repairDecision: {
        kind: 'directive.repairDecision.v1',
        eventType: 'chatTurnProcessingFailure',
        sourceKind: 'playerIngress',
        transactionId,
        sourceFrameId: ingress?.sourceFrameId || null,
        normalTurnAllowed: false,
        action: 'reviewTurnProcessingFailure',
        stage: stage || 'processing',
        classification: decision?.classification || null,
        errorCode: failureDiagnostic?.code || null,
        errorSummary: failureDiagnostic?.summary || null,
        errorMessageHash: failureDiagnostic?.messageHash || null,
        errorMessageLength: failureDiagnostic?.messageLength ?? null
      },
      allowedActions: ['reviewTurnProcessingFailure', 'retryTurnFromSource']
    });
    return {
      transactionId,
      recoveryCase: cloneJson(recoveryCase),
      reason: 'chatTurnProcessingFailure'
    };
  }

  function responseRetryCoreProjection(coreResponseRecovery = null) {
    if (!coreResponseRecovery) return null;
    return {
      status: coreResponseRecovery.status || null,
      transactionId: coreResponseRecovery.transactionId || null,
      recoveryCaseId: coreResponseRecovery.recoveryCaseId || null,
      phase: coreResponseRecovery.phase || null,
      reason: coreResponseRecovery.reason || coreResponseRecovery.decision?.reason || null
    };
  }

  function responseRetryCompatibilityProjection({
    coreResponseRecovery = null,
    coreCompletion = null,
    responseId = null,
    recoveryId = null,
    eventType = 'providerFailureAfterMechanicsCommit',
    status = null
  } = {}) {
    const transactionId = compact(
      coreCompletion?.id
      || coreResponseRecovery?.transactionId
      || coreResponseRecovery?.coreTransactionId
    );
    const recoveryCaseId = compact(
      recoveryId
      || coreResponseRecovery?.recoveryCaseId
      || coreResponseRecovery?.id
      || coreResponseRecovery?.recoveryId
    );
    if (!transactionId && !recoveryCaseId) return null;
    return {
      kind: 'directive.coreResponseRetryProjectionRef.v1',
      transactionId: transactionId || null,
      responseId: compact(responseId) || null,
      recoveryCaseId: recoveryCaseId || null,
      status: compact(status || coreCompletion?.phase || coreResponseRecovery?.phase || coreResponseRecovery?.status) || null,
      eventType: compact(eventType) || null,
      sourceKind: 'directiveResponse'
    };
  }

  function ingressRecoveryCompatibilityProjection({
    coreRecovery = null,
    ingress = null,
    recoveryId = null,
    eventType = null,
    status = null
  } = {}) {
    const transactionId = compact(coreRecovery?.transactionId || ingress?.coreTransactionId || '');
    const recoveryCase = coreRecovery?.recoveryCase || {};
    const recoveryCaseId = compact(
      recoveryId
      || recoveryCase.id
      || coreRecovery?.recoveryCaseId
      || coreRecovery?.id
      || coreRecovery?.recoveryId
      || ''
    );
    if (!transactionId && !recoveryCaseId) return null;
    return {
      kind: 'directive.coreIngressRecoveryProjectionRef.v1',
      transactionId: transactionId || null,
      ingressId: compact(ingress?.id || ingress?.ingressId || '') || null,
      recoveryCaseId: recoveryCaseId || null,
      status: compact(status || recoveryCase.status || coreRecovery?.status || '') || null,
      phase: compact(recoveryCase.phase || coreRecovery?.phase || '') || null,
      eventType: compact(eventType) || null,
      sourceKind: 'playerIngress',
      reason: compact(coreRecovery?.reason || recoveryCase.reason || '') || null
    };
  }

  function ingressResponseRetryCompatibilityProjection({
    coreResponseRecovery = null,
    ingress = null,
    recoveryId = null,
    eventType = null,
    status = null
  } = {}) {
    const transactionId = compact(
      coreResponseRecovery?.transactionId
      || coreResponseRecovery?.coreTransactionId
      || ingress?.coreTransactionId
      || ''
    );
    const recoveryCaseId = compact(
      recoveryId
      || coreResponseRecovery?.recoveryCaseId
      || coreResponseRecovery?.id
      || coreResponseRecovery?.recoveryId
      || ''
    );
    if (!transactionId && !recoveryCaseId) return null;
    return {
      kind: 'directive.coreIngressResponseRetryProjectionRef.v1',
      transactionId: transactionId || null,
      ingressId: compact(ingress?.id || ingress?.ingressId || '') || null,
      recoveryCaseId: recoveryCaseId || null,
      status: compact(status || coreResponseRecovery?.phase || coreResponseRecovery?.status || '') || null,
      eventType: compact(eventType) || null,
      sourceKind: 'playerIngress',
      responseRecoveryReason: compact(coreResponseRecovery?.reason || coreResponseRecovery?.decision?.reason || '') || null
    };
  }

  function ingressSourceRestartCompatibilityProjection({
    sourceRestart = null,
    priorIngress = null,
    replacementIngressId = null,
    replacementTransactionId = null,
    replacementSourceFrameId = null,
    status = 'restartSuperseded'
  } = {}) {
    const priorTransactionId = compact(
      sourceRestart?.priorTransactionId
      || sourceRestart?.oldTransactionId
      || priorIngress?.coreTransactionId
      || ''
    );
    const newTransactionId = compact(
      sourceRestart?.newTransactionId
      || sourceRestart?.replacementTransactionId
      || replacementTransactionId
      || ''
    );
    const priorIngressId = compact(sourceRestart?.priorIngressId || priorIngress?.id || priorIngress?.ingressId || '');
    const nextIngressId = compact(sourceRestart?.replacementIngressId || replacementIngressId || '');
    if (!priorTransactionId && !newTransactionId && !priorIngressId && !nextIngressId) return null;
    return {
      kind: 'directive.coreIngressSourceRestartProjectionRef.v1',
      priorTransactionId: priorTransactionId || null,
      replacementTransactionId: newTransactionId || null,
      priorIngressId: priorIngressId || null,
      replacementIngressId: nextIngressId || null,
      priorSourceFrameId: compact(sourceRestart?.priorSourceFrameId || priorIngress?.sourceFrameId || '') || null,
      replacementSourceFrameId: compact(sourceRestart?.replacementSourceFrameId || replacementSourceFrameId || '') || null,
      recoveryCaseId: compact(sourceRestart?.priorRecoveryId || sourceRestart?.recoveryId || priorIngress?.recoveryId || '') || null,
      status: compact(status) || null,
      eventType: 'playerMessageReobserved',
      sourceKind: 'playerIngress',
      reason: compact(sourceRestart?.reason || '') || null
    };
  }

  async function responseRetryRecoveryFromCoreProjection(state = {}, {
    recoveryId = null
  } = {}) {
    const recoveryView = await runtimeLedgerViewFresh(state);
    const recoveryRows = recoveryView.recoveryJournal || [];
    const responseRows = recoveryView.responseLedger || [];
    const providerFallbackResponseTargets = responseRows.filter((entry) => (
      compact(entry?.authority) === 'compatibilityProjection'
      && compact(entry?.projectionSource) === 'coreStoreV2'
      && entry?.providerFallback
      && ['responseRetryRequired', 'coreClosureFailed'].includes(compact(entry?.coreProjection?.status))
    ));
    const ingressRows = recoveryView.ingressLedger || [];
    const targetRecoveryId = compact(recoveryId || '');
    const closedRecoveryIds = new Set(recoveryRows
      .filter((row) => ['resolved', 'applied'].includes(compact(row?.status)))
      .map((row) => compact(row?.id || row?.recoveryId || ''))
      .filter(Boolean));
    for (const row of [...recoveryRows].reverse()) {
      const repairDecision = row?.repairDecision || {};
      const eventType = compact(repairDecision.eventType || row.reason || '');
      if (!RESPONSE_RETRY_RECOVERY_TYPES.has(eventType)) continue;
      const rowRecoveryId = compact(row.id || row.recoveryId || '');
      if (['resolved', 'applied'].includes(compact(row.status))) continue;
      if (rowRecoveryId && closedRecoveryIds.has(rowRecoveryId)) continue;
      const transactionId = compact(row.transactionId || row.coreTransactionId || repairDecision.transactionId || '');
      if (targetRecoveryId && rowRecoveryId !== targetRecoveryId) continue;
      const response = [
        ...providerFallbackResponseTargets,
        ...responseRows
      ].find((entry) => (
        (row.dependentResponseId && compact(entry.id) === compact(row.dependentResponseId))
        || (rowRecoveryId && compact(entry.recoveryId) === rowRecoveryId)
        || (transactionId && compact(entry.coreTransactionId || entry.transactionId || entry.coreRelease?.transactionId || entry.providerFallback?.coreTransactionId) === transactionId)
      )) || null;
      if (!response && eventType === 'providerFailureAfterMechanicsCommit') continue;
      const ingress = ingressRows.find((entry) => (
        (repairDecision.ingressId && entry.id === repairDecision.ingressId)
        || (transactionId && compact(entry.coreTransactionId || entry.transactionId) === transactionId)
      )) || null;
      return {
        id: rowRecoveryId || response?.recoveryId || null,
        type: eventType,
        status: 'open',
        ingressId: repairDecision.ingressId || ingress?.id || response?.ingressId || null,
        outcomeId: row.dependentOutcomeId || repairDecision.outcomeId || response?.outcomeId || ingress?.outcomeId || null,
        details: {
          turnId: repairDecision.turnId || response?.turnId || null,
          strategy: response?.strategy || 'directivePosted',
          responseKind: response?.responseKind || 'committedOutcome',
          responseId: row.dependentResponseId || response?.id || response?.responseId || null,
          responseIdempotencyKey: row.dependentResponseId
            || response?.id
            || response?.responseId
            || (rowRecoveryId ? `directive-response-retry:${rowRecoveryId}` : null)
            || (transactionId ? `directive-response-retry:${transactionId}` : null),
          hostMessageId: response?.hostMessageId || null,
          responseRetryPlan: cloneJson(row.responseRetryPlan || repairDecision.responseRetryPlan || null),
          coreTransactionId: transactionId || null,
          coreRecovery: {
            status: 'recorded',
            transactionId: transactionId || null,
            recoveryCaseId: rowRecoveryId || null,
            phase: row.phase || null,
            reason: row.reason || repairDecision.reason || null
          },
          repairDecision: cloneJson(repairDecision || null),
          fallbackResponsePosted: response?.providerFallback ? true : undefined,
          responseRetryPath: response?.providerFallback?.retryPath || undefined
        }
      };
    }
    return null;
  }

  async function findOpenResponseRetryRecovery(state = {}, {
    recoveryId = null
  } = {}) {
    return responseRetryRecoveryFromCoreProjection(state, { recoveryId });
  }

  function messageHostMessageId(message = {}) {
    return compact(message.hostMessageId || message.id || String(message.index ?? ''));
  }

  function hostMessageText(hostMessageId = null, fallbackText = '') {
    const id = compact(hostMessageId);
    if (id && typeof host.chat.getMessage === 'function') {
      const fetched = host.chat.getMessage(id);
      return compact(fetched?.text || fetched?.mes || fetched?.content || fallbackText);
    }
    return compact(fallbackText);
  }

  function ingressAliasRecentlyObserved(entry = {}, nowIso = '') {
    const receivedAt = Date.parse(entry.receivedAt || '');
    const current = Date.parse(nowIso || '');
    if (!Number.isFinite(receivedAt) || !Number.isFinite(current)) return true;
    return Math.abs(current - receivedAt) <= INGRESS_ALIAS_DEDUPE_WINDOW_MS;
  }

  async function findIngressAlias(state, message = {}, chatId = '', nowIso = '') {
    const tracking = initializeCampaignRuntimeTracking(state).runtimeTracking || {};
    const ingressLedger = (await runtimeLedgerViewFresh({ ...state, runtimeTracking: tracking })).ingressLedger || [];
    const expectedHostMessageId = messageHostMessageId(message);
    const expectedTextHash = fnv1a(message?.text || '');
    if (!expectedTextHash) return null;
    return [...ingressLedger].reverse().find((entry) => {
      if (!entry || entry.chatId !== chatId || entry.textHash !== expectedTextHash) return false;
      if (entry.hostMessageId && expectedHostMessageId && entry.hostMessageId === expectedHostMessageId) return true;
      if (!ingressAliasRecentlyObserved(entry, nowIso)) return false;
      return !entry.hostMessageId || !expectedHostMessageId;
    }) || null;
  }

  async function findIngressByHostMessageId(state, hostMessageId, chatId = '') {
    const expectedHostMessageId = compact(hostMessageId || '');
    if (!expectedHostMessageId) return null;
    const tracking = initializeCampaignRuntimeTracking(state).runtimeTracking || {};
    const ingressLedger = (await runtimeLedgerViewFresh({ ...state, runtimeTracking: tracking })).ingressLedger || [];
    return [...ingressLedger].reverse().find((entry) => (
      entry
      && compact(entry.hostMessageId || '') === expectedHostMessageId
      && (!chatId || !entry.chatId || entry.chatId === chatId)
    )) || null;
  }

  async function findOpenNoOutcomeRecovery(state, ingress = null) {
    if (!ingress || ingress.outcomeId) return null;
    const recoveryRows = (await runtimeLedgerViewFresh(state)).recoveryJournal || [];
    return [...recoveryRows].reverse().find((entry) => (
      shouldResolveNoOutcomeRecoveryOnReobserve(ingress, entry)
    )) || null;
  }

  async function ingressHasDependentResponse(state, ingress = null) {
    if (!ingress) return false;
    if (ingress.outcomeId || ingress.responseMessageId) return true;
    const projectionResponses = state?.directiveRuntimeEvidence?.coreStoreReadProjections?.responses;
    const projectionResponseLedger = state?.directiveRuntimeEvidence?.coreStoreReadProjections?.responseLedger;
    const responseLedger = [
      ...((await runtimeLedgerViewFresh(state || {})).responseLedger || []),
      ...(Array.isArray(projectionResponses) ? projectionResponses : []),
      ...(Array.isArray(projectionResponseLedger) ? projectionResponseLedger : [])
    ];
    return responseLedger.some((entry) => (
      entry?.ingressId === ingress.id
      || (ingress.outcomeId && entry?.outcomeId === ingress.outcomeId)
      || (ingress.hostMessageId && entry?.ingressHostMessageId === ingress.hostMessageId)
    ));
  }

  async function findHistoricalIngressByTextWithDependentResponse(state, message = {}, chatId = '') {
    const expectedTextHash = fnv1a(message?.text || '');
    if (!expectedTextHash) return null;
    const tracking = initializeCampaignRuntimeTracking(state).runtimeTracking || {};
    const projectionIngress = state?.directiveRuntimeEvidence?.coreStoreReadProjections?.ingressLedger;
    const ingressLedger = [
      ...((await runtimeLedgerViewFresh({ ...state, runtimeTracking: tracking })).ingressLedger || []),
      ...(Array.isArray(projectionIngress) ? projectionIngress : [])
    ];
    for (const entry of [...ingressLedger].reverse()) {
      if (!entry || entry.chatId !== chatId || entry.textHash !== expectedTextHash) continue;
      if (await ingressHasDependentResponse(state, entry)) return entry;
    }
    return null;
  }

  async function historicalIngressDeduplicatedResult(state, ingress, message, reason = 'historical-ingress-deduplicated') {
    let next = state;
    const hostMessageId = messageHostMessageId(message);
    if (ingress?.id && hostMessageId && ingress.hostMessageId !== hostMessageId) {
      try {
        next = await updateIngressState(state, ingress.id, {
          hostMessageId,
          canonicalizedAt: timestamp(now),
          canonicalizationReason: 'matched-historical-text-hash-after-chat-open'
        }, `Canonicalized historical campaign-chat player message ${hostMessageId}.`);
        ingress = await findIngressFresh(next, ingress.id) || ingress;
      } catch {
        next = state;
      }
    }
    return {
      handled: true,
      deduplicated: true,
      historical: true,
      responseStrategy: ingress?.responseStrategy || 'injectAndContinue',
      abortDefaultGeneration: ['directivePosted', 'pause'].includes(ingress?.responseStrategy),
      reason,
      decision: cloneJson(ingress?.classification || null),
      record: cloneJson(ingress || null),
      campaignState: cloneJson(next || getCampaignState() || null)
    };
  }

  async function latestSourceRestartDecision(state, ingress, message, stage) {
    if (!ingress || await ingressHasDependentResponse(state, ingress)) return null;
    const priorRecovery = await findOpenNoOutcomeRecovery(state, ingress);
    const repairDecision = repair.evaluateSourceReobserve({
      eventType: 'playerMessageReobserved',
      stage,
      ingress,
      hasDependentResponse: false,
      hasDependentAssistant: false,
      hasCommittedOutcome: false,
      isLatestActionablePlayerRow: true,
      priorRecovery,
      observedHostMessageId: messageHostMessageId(message),
      observedTextHash: fnv1a(message?.text || '')
    });
    return repairDecision.action === 'restartLatestSource'
      ? {
          repairDecision,
          priorRecovery,
          priorIngress: ingress
        }
      : null;
  }

  async function staleIngressResult(state, ingressId, message, stage) {
    const current = state ? await findIngressFresh(initializeCampaignRuntimeTracking(state), ingressId) : null;
    const expectedHostMessageId = messageHostMessageId(message);
    const expectedTextHash = fnv1a(message?.text || '');
    const repairDecision = repair.evaluateSourceReobserve({
      eventType: 'playerMessageReobserved',
      stage,
      ingress: current,
      hasDependentResponse: false,
      observedHostMessageId: expectedHostMessageId,
      observedTextHash: expectedTextHash
    });
    if (repairDecision.normalTurnAllowed) return null;
    return {
      handled: true,
      stale: true,
      responseStrategy: 'staleSource',
      abortDefaultGeneration: true,
      reason: 'source-ingress-stale',
      stage,
      staleReasons: repairDecision.reasons || [],
      repairDecision: cloneJson(repairDecision),
      record: cloneJson(current),
      campaignState: cloneJson(state || getCampaignState() || null)
    };
  }

  async function pendingSourceStaleResult(state, pending = null, stage = 'before-pending-interaction-resolution') {
    if (!pending?.ingressId) {
      return {
        handled: true,
        stale: true,
        responseStrategy: 'staleSource',
        abortDefaultGeneration: true,
        reason: 'source-ingress-stale',
        stage,
        staleReasons: ['missing-pending-ingress'],
        record: null,
        campaignState: cloneJson(state || getCampaignState() || null)
      };
    }
    const sourceIngress = await findIngressFresh(state, pending.ingressId);
    const sourceMessage = {
      hostMessageId: sourceIngress?.hostMessageId || null,
      id: sourceIngress?.hostMessageId || pending.ingressId,
      text: hostMessageText(sourceIngress?.hostMessageId, sourceIngress?.textPreview || '')
    };
    return staleIngressResult(state, pending.ingressId, sourceMessage, stage);
  }

  function dependentSourceRecoveryResult(state, ingress, message, stage) {
    const expectedHostMessageId = messageHostMessageId(message);
    const expectedTextHash = fnv1a(message?.text || '');
    const repairDecision = repair.evaluateSourceReobserve({
      eventType: 'playerMessageReobserved',
      stage,
      ingress,
      hasDependentResponse: true,
      hasDependentAssistant: true,
      hasCommittedOutcome: Boolean(ingress?.outcomeId),
      isLatestActionablePlayerRow: true,
      observedHostMessageId: expectedHostMessageId,
      observedTextHash: expectedTextHash
    });
    return {
      handled: true,
      stale: true,
      responseStrategy: 'staleSource',
      abortDefaultGeneration: true,
      reason: 'source-ingress-stale',
      stage,
      staleReasons: repairDecision.reasons || [],
      repairDecision: cloneJson(repairDecision),
      record: cloneJson(ingress || null),
      campaignState: cloneJson(state || getCampaignState() || null)
    };
  }

  async function stateForIngressCheck(ingressId, fallbackState = null) {
    const current = getCampaignState();
    const currentIngress = current
      ? await findIngressFresh(initializeCampaignRuntimeTracking(current), ingressId)
      : null;
    const fallbackIngress = fallbackState
      ? await findIngressFresh(initializeCampaignRuntimeTracking(fallbackState), ingressId)
      : null;
    if (currentIngress && fallbackIngress) {
      return preferPromptAdvancedIngressState(current, fallbackState, currentIngress, fallbackIngress);
    }
    if (currentIngress) return current;
    if (fallbackIngress) return fallbackState;
    return current || fallbackState;
  }

  async function stateWithIngressFromFallback(candidateState, fallbackState, ingressId) {
    let next = initializeCampaignRuntimeTracking(candidateState || fallbackState || getCampaignState());
    if (!ingressId) return next;
    const existing = await findIngressFresh(next, ingressId);
    const fallback = fallbackState ? initializeCampaignRuntimeTracking(fallbackState) : null;
    const fallbackStateIngress = fallback ? await findIngressFresh(fallback, ingressId) : null;
    const observedIngress = observedIngressRecords.get(ingressId) || null;
    const fallbackIngress = fallbackStateIngress || observedIngress
      ? {
          ...(observedIngress ? cloneJson(observedIngress) : {}),
          ...(fallbackStateIngress ? cloneJson(fallbackStateIngress) : {}),
          playerSubmittedAt: fallbackStateIngress?.playerSubmittedAt || observedIngress?.playerSubmittedAt || null,
          receivedAt: fallbackStateIngress?.receivedAt || observedIngress?.receivedAt || null,
          sourceFrameId: fallbackStateIngress?.sourceFrameId || observedIngress?.sourceFrameId || null,
          sourceFrame: fallbackStateIngress?.sourceFrame || observedIngress?.sourceFrame || null,
          transactionId: fallbackStateIngress?.transactionId || observedIngress?.transactionId || null,
          coreTransactionId: fallbackStateIngress?.coreTransactionId
            || observedIngress?.coreTransactionId
            || fallbackStateIngress?.transactionId
            || observedIngress?.transactionId
            || null
        }
      : null;
    const fallbackHasCoreEvidence = Boolean(
      fallbackIngress?.coreTransactionId
      || fallbackIngress?.transactionId
      || fallbackIngress?.coreProjection
      || fallbackIngress?.coreRecovery
      || (
        fallbackIngress?.authority === 'compatibilityProjection'
        && fallbackIngress?.projectionSource === 'coreStoreV2'
        && fallbackIngress?.compatibilityMirror
      )
    );
    if (existing) {
      if (!fallbackIngress) return next;
      const patch = {};
      for (const key of [
        'playerSubmittedAt',
        'receivedAt',
        'hostMessageId',
        'chatId',
        'campaignId',
        'textHash',
        'sourceFrameId',
        'sourceFrame',
        'transactionId',
        'coreTransactionId'
      ]) {
        if ((existing[key] === null || existing[key] === undefined || existing[key] === '') && fallbackIngress[key] !== undefined) {
          patch[key] = cloneJson(fallbackIngress[key]);
        }
      }
      if (!Object.keys(patch).length) return next;
      if (!fallbackHasCoreEvidence) return next;
      return updateTurnIngress(next, ingressId, patch, {
        missingCoreWriteMode: 'reject'
      });
    }
    if (!fallbackIngress) return next;
    if (!fallbackHasCoreEvidence) return next;
    return recordTurnIngress(next, fallbackIngress, {
      missingCoreWriteMode: 'reject'
    });
  }

  async function currentSourceStaleResult(ingressId, message, stage, fallbackState = null) {
    return staleIngressResult(await stateForIngressCheck(ingressId, fallbackState), ingressId, message, stage);
  }

  function activePendingInteraction(state, interactionId = null) {
    return pendingInteractionRows(state).find((entry) => (
      entry.status === 'pending'
      && (!interactionId || entry.id === interactionId)
    )) || null;
  }

  async function pendingInteractionAuthorityForIngress(state, ingressId, interactionId) {
    const authorityState = await stateWithIngressFromFallback(state, state, ingressId);
    const authoritativeLedger = await runtimeLedgerViewFresh(authorityState);
    const ingress = (authoritativeLedger.ingressLedger || []).find((entry) => entry.id === ingressId)
      || await findIngressFresh(authorityState, ingressId)
      || {};
    const transactionId = compact(
      ingress.coreTransactionId
      || ingress.transactionId
      || ingress.coreProjection?.transactionId
      || ingress.coreProjection?.coreTransactionId
      || ingress.compatibilityMirror?.transactionId
    );
    if (!transactionId) return {};
    return {
      authority: 'corePendingInteractionProjection',
      projectionSource: 'coreStoreV2',
      coreTransactionId: transactionId,
      coreProjection: {
        kind: 'directive.corePendingInteractionProjectionRef.v1',
        interactionId,
        ingressId,
        transactionId,
        sourceFrameId: ingress.sourceFrameId || ingress.sourceFrame?.id || null,
        status: 'pending'
      }
    };
  }

  async function recordCorePendingInteraction(state, interaction = {}) {
    const transactionId = compact(
      interaction.coreTransactionId
      || interaction.coreProjection?.transactionId
      || interaction.coreProjection?.coreTransactionId
      || interaction.compatibilityMirror?.transactionId
    );
    if (!transactionId || typeof coreTurnStore?.recordPendingInteraction !== 'function') {
      const error = new Error('CORE pending interaction projection writer unavailable.');
      error.code = 'DIRECTIVE_CORE_PENDING_INTERACTION_PROJECTION_REQUIRED';
      error.details = {
        interactionId: interaction.id || null,
        ingressId: interaction.ingressId || null,
        transactionId: transactionId || null
      };
      throw error;
    }
    await coreTurnStore.recordPendingInteraction(transactionId, {
      ...cloneJson(interaction),
      idempotencyKey: `pending-interaction:${interaction.id || transactionId}`
    });
    return stateWithCorePendingProjections(state);
  }

  async function resolveCorePendingInteraction(state, interaction = {}, resolution = {}) {
    const transactionId = compact(
      interaction.coreTransactionId
      || interaction.coreProjection?.transactionId
      || interaction.coreProjection?.coreTransactionId
      || interaction.compatibilityMirror?.transactionId
    );
    if (!transactionId || typeof coreTurnStore?.resolvePendingInteraction !== 'function') {
      const error = new Error('CORE pending interaction resolution writer unavailable.');
      error.code = 'DIRECTIVE_CORE_PENDING_INTERACTION_RESOLUTION_REQUIRED';
      error.details = {
        interactionId: interaction.id || null,
        ingressId: interaction.ingressId || null,
        transactionId: transactionId || null
      };
      throw error;
    }
    await coreTurnStore.resolvePendingInteraction(transactionId, interaction.id, {
      ...cloneJson(resolution),
      idempotencyKey: `pending-interaction-resolved:${interaction.id}:${resolution.status || resolution.action || 'resolved'}`
    });
    return stateWithCorePendingProjections(state);
  }

  function playerSafePendingInteraction(state) {
    const interaction = activePendingInteraction(state);
    if (!interaction) return null;
    return {
      id: interaction.id,
      kind: interaction.kind,
      turnId: interaction.turnId || null,
      outcomeId: interaction.outcomeId || null,
      options: cloneJson(interaction.options || [])
    };
  }

  function resolutionAction(decision = {}) {
    return compact(decision.pendingInteractionResolution?.action).toLowerCase();
  }

  function decisionWithoutPendingResolution(decision = {}) {
    return {
      ...cloneJson(decision),
      pendingInteractionResolution: null
    };
  }

  function responseEntryForMessage(state, message) {
    const metadata = responseMetadata(message) || {};
    const hostMessageId = compact(message?.hostMessageId || message?.id);
    const idempotencyKey = compact(metadata.idempotencyKey);
    const responseRows = createRuntimeLedgerView(state || {}).responseLedger || [];
    return [...responseRows].reverse().find((entry) => (
      (hostMessageId && String(entry.hostMessageId || '') === hostMessageId)
      || (idempotencyKey && String(entry.id || '') === idempotencyKey)
    )) || null;
  }

  async function latestDirectiveResponseSwipeTarget() {
    const recent = await host.chat.getRecentMessages?.({ limit: 500, playerSafeOnly: false });
    const messages = Array.isArray(recent) ? recent.filter(Boolean) : [];
    const target = messages.at(-1) || null;
    if (!isDirectiveAssistantMessage(target)) return null;
    const priorPlayer = [...messages.slice(0, -1)].reverse().find((entry) => (
      entry?.isUser === true || entry?.role === 'user'
    )) || null;
    return { target, priorPlayer, recent: messages };
  }

  function directiveResponseSwipeRequest({
    state,
    target,
    priorPlayer,
    responseEntry,
    responseKind,
    revisionId = null,
    recentMessages = []
  }) {
    const safe = createPlayerSafeCampaignProjection({ campaignState: state }) || {};
    const recent = (Array.isArray(recentMessages) ? recentMessages.slice(-8) : [])
      .map((entry) => ({
        role: entry.isUser === true || entry.role === 'user' ? 'user' : 'assistant',
        directiveOwned: entry.isDirectiveOwned === true || entry.directiveOwned === true,
        responseKind: responseMetadata(entry)?.responseKind || null,
        text: compact(displaySafeChatText(entry.text || '')).slice(0, 900)
      }));
    const system = [
      'You are rewriting one Directive-owned assistant response as an alternate assistant response variant.',
      'Preserve committed campaign mechanics and hidden state. Do not invent new mechanical outcomes, spend resources, resolve pending interactions, or expose Director-only information.',
      'Use the live chat transcript as the prose source of truth. If the player edited the assistant response, treat the edited text as the current selected variant.',
      'Write only the replacement assistant message text.'
    ].join('\n');
    const user = [
      `Response kind: ${responseKind || 'narration'}`,
      `Response ledger id: ${responseEntry?.id || 'unrecorded'}`,
      '',
      'Prior player message currently in chat:',
      displaySafeChatText(priorPlayer?.text || '').slice(0, 900) || '(none)',
      '',
      'Current selected assistant response in chat:',
      displaySafeChatText(target?.text || '').slice(0, 900),
      '',
      'Player-safe campaign context:',
      boundedJson({ mission: safe.mission, ship: safe.ship, crew: safe.crew }, 4000),
      '',
      'Recent selected transcript:',
      JSON.stringify(recent, null, 2),
      '',
      revisionId ? `Variant seed: ${revisionId}` : '',
      revisionId ? 'Use the seed only to vary prose choices. Preserve the same committed mechanics, response kind, and player-facing decision point.' : '',
      revisionId ? '' : '',
      'Create a distinct alternate response for the same moment. Keep it concise enough for chat play.'
    ].filter((line, index, array) => line || (index > 0 && array[index - 1])).join('\n');
    return {
      prompt: `${system}\n\n${user}`,
      systemPrompt: system,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      metadata: {
        source: 'directive-response-swipe',
        responseKind: responseKind || null,
        hostMessageId: target?.hostMessageId || target?.id || null,
        priorPlayerMessageId: priorPlayer?.hostMessageId || priorPlayer?.id || null,
        responseVariantSeed: revisionId || null
      }
    };
  }

  async function generateDirectiveResponseSwipeText({
    state,
    target,
    priorPlayer,
    responseEntry,
    responseKind,
    revisionId = null,
    recentMessages = []
  }) {
    if (generationRouter?.generate) {
      const generated = await generationRouter.generate('narration', directiveResponseSwipeRequest({
        state,
        target,
        priorPlayer,
        responseEntry,
        responseKind,
        revisionId,
        recentMessages
      }));
      const text = generatedText(generated);
      if (text) return { text, source: 'generation-router', generation: generated };
    }
    return {
      text: localDirectiveResponseVariant(responseKind),
      source: 'local-fallback',
      generation: null
    };
  }

  async function handleCampaignIntroSwipe({ state, target, abort = null } = {}) {
    const hostMessageId = compact(target?.hostMessageId || target?.id);
    if (typeof rewriteCampaignIntro !== 'function') {
      if (typeof abort === 'function') abort(true);
      return {
        handled: true,
        responseStrategy: 'campaignIntroRewrite',
        abortDefaultGeneration: true,
        abortedHostGeneration: true,
        responseKind: 'campaignIntro',
        reason: 'campaign-intro-rewrite-unavailable',
        campaignState: cloneJson(state)
      };
    }
    try {
      if (typeof abort === 'function') abort(true);
      const rewrite = await rewriteCampaignIntro({
        campaignState: state,
        hostMessageId,
        message: cloneJson(target),
        reason: 'native-swipe-reroll'
      });
      const result = rewrite?.result && typeof rewrite.result === 'object' ? rewrite.result : rewrite;
      return {
        handled: true,
        responseStrategy: 'campaignIntroRewrite',
        abortDefaultGeneration: true,
        abortedHostGeneration: true,
        responseKind: 'campaignIntro',
        reason: result?.ok === false ? (result.reason || result.summary || 'campaign-intro-rewrite-failed') : undefined,
        rewrite: cloneJson(result || null),
        campaignState: cloneJson(result?.campaignState || rewrite?.campaignState || state)
      };
    } catch (error) {
      if (typeof abort === 'function') abort(true);
      return {
        handled: true,
        responseStrategy: 'campaignIntroRewrite',
        abortDefaultGeneration: true,
        abortedHostGeneration: true,
        responseKind: 'campaignIntro',
        reason: 'campaign-intro-rewrite-failed',
        error: {
          code: error?.code || 'DIRECTIVE_CAMPAIGN_INTRO_REWRITE_FAILED',
          message: error?.message || String(error)
        },
        campaignState: cloneJson(state)
      };
    }
  }

  async function handleDirectiveResponseSwipe({ abort = null } = {}) {
    const state = activeBoundState();
    if (!state) return { handled: false, reason: 'inactive-or-unbound' };
    if (typeof host.chat.appendAssistantMessageSwipe !== 'function') {
      return { handled: false, reason: 'assistant-swipes-unavailable' };
    }
    const targetInfo = await latestDirectiveResponseSwipeTarget();
    if (!targetInfo?.target) return { handled: false, reason: 'latest-message-not-directive-response' };
    const { target, priorPlayer, recent } = targetInfo;
    const metadata = responseMetadata(target) || {};
    const responseKind = compact(metadata.responseKind) || 'narration';
    if (responseKind === 'campaignIntro') {
      return handleCampaignIntroSwipe({ state, target, abort });
    }
    const responseEntry = responseEntryForMessage(state, target);
    const sourceResponseId = responseEntry?.id || metadata.idempotencyKey || `response:${target.hostMessageId || target.id || 'message'}`;
    const revisionIndex = Math.max(1, Number(target.raw?.swipes?.length || metadata.swipeCount || 1));
    const revisionId = `${sourceResponseId}:swipe:${revisionIndex}`;
    const generated = await generateDirectiveResponseSwipeText({
      state,
      target,
      priorPlayer,
      responseEntry,
      responseKind,
      revisionId,
      recentMessages: recent
    });
    const swipe = await host.chat.appendAssistantMessageSwipe({
      hostMessageId: target.hostMessageId || target.id,
      text: prefixCampaignReplyHeader(generated.text, state),
      campaignId: state.campaign?.id || null,
      responseKind,
      extra: {
        runtimeMetadata: {
          ...withoutProvisionalDutyReportManifest(target.raw?.extra?.runtimeMetadata || {}),
          responseSwipe: true,
          responseSwipeRevisionId: revisionId,
          responseSwipeSource: generated.source,
          sourceResponseId,
          priorPlayerMessageId: priorPlayer?.hostMessageId || priorPlayer?.id || null
        },
        directive: {
          responseKind,
          responseSwipeRevisionId: revisionId,
          selectedResponseRevisionId: revisionId,
          responseSwipeReason: 'native-swipe-reroll',
          sourceResponseId
        }
      }
    });
    if (typeof abort === 'function') abort(true);
    return {
      handled: true,
      responseStrategy: 'directiveSwipe',
      abortDefaultGeneration: true,
      abortedHostGeneration: true,
      responseKind,
      revisionId,
      swipe: cloneJson(swipe),
      campaignState: cloneJson(state)
    };
  }

  async function createIngress(state, message, chatId, ingressId, {
    sourceReobserveDecision = null,
    priorIngressForRecovery = null
  } = {}) {
    const priorIngress = await findIngressFresh(state, ingressId);
    const receivedAt = timestamp(now);
    const sourceFrame = buildTurnSourceFrame(state, message, chatId, ingressId, receivedAt);
    markDebugStage('createIngress:beforeCoreBegin', { ingressId, chatId });
    const coreTransaction = await beginCoreTurnForIngress(sourceFrame, {
      ingressId,
      chatId,
      sourceReobserveDecision,
      priorIngressForRecovery
    });
    markDebugStage('createIngress:afterCoreBegin', {
      ingressId,
      chatId,
      transactionId: coreTransaction?.id || null,
      pendingCoreWrite: coreTransaction?.pendingCoreWrite === true
    });
    const sourceRestart = sourceReobserveDecision?.action === 'restartLatestSource'
      ? {
          action: 'restartLatestSource',
          reason: sourceReobserveDecision.recoveryResolution?.reason || 'latest-source-reobserved',
          priorIngressId: priorIngressForRecovery?.id || sourceReobserveDecision.ingressId || null,
          priorSourceFrameId: priorIngressForRecovery?.sourceFrameId || sourceReobserveDecision.sourceFrameId || null,
          priorTransactionId: priorIngressForRecovery?.coreTransactionId || sourceReobserveDecision.transactionId || null,
          priorRecoveryId: sourceReobserveDecision.recoveryResolution?.priorRecoveryId
            || priorIngressForRecovery?.recoveryId
            || null,
          observedTextHash: sourceReobserveDecision.observedTextHash || null
        }
      : null;
    const ingressRecord = {
      id: ingressId,
      hostMessageId: message.hostMessageId || message.id || String(message.index ?? ''),
      chatId,
      campaignId: state.campaign?.id,
      textHash: fnv1a(message.text),
      playerSubmittedAt: message.playerSubmittedAt || receivedAt,
      textPreview: message.text,
      receivedAt,
      stateRevision: state.runtimeTracking?.revision || 0,
      sourceFrameId: sourceFrame.id,
      sourceFrame,
      coreTransactionId: coreTransaction?.id || null,
      repairDecision: sourceReobserveDecision ? cloneJson(sourceReobserveDecision) : null,
      sourceRestart,
      status: 'classifying'
    };
    observedIngressRecords.set(ingressId, cloneJson(ingressRecord));
    let next = recordTurnIngress(state, ingressRecord, {
      missingCoreWriteMode: 'reject'
    });
    const recoverySourceIngress = priorIngressForRecovery || priorIngress;
    if (
      sourceRestart
      && recoverySourceIngress?.id
      && recoverySourceIngress.id !== ingressId
    ) {
      next = updateTurnIngress(next, recoverySourceIngress.id, {
        status: 'restartSuperseded',
        restartedAt: receivedAt,
        restartedByIngressId: ingressId,
        restartReason: sourceRestart.reason,
        restartCoreTransactionId: coreTransaction?.id || null,
        restartSourceFrameId: sourceFrame.id,
        restartRepairDecision: cloneJson(sourceReobserveDecision),
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        coreProjection: ingressSourceRestartCompatibilityProjection({
          sourceRestart,
          priorIngress: recoverySourceIngress,
          replacementIngressId: ingressId,
          replacementTransactionId: coreTransaction?.id || null,
          replacementSourceFrameId: sourceFrame.id
        })
      }, {
        missingCoreWriteMode: 'reject'
      });
    }
    return persistStateInBackground(
      next,
      `Captured campaign-chat player message ${message.hostMessageId || message.index || ingressId}.`
    );
  }

  async function recordTurnProcessingFailure(state, ingressId, message, error, stage, decision = null) {
    const failure = {
      code: error?.code || 'DIRECTIVE_CHAT_TURN_PROCESSING_FAILED',
      message: error?.message || String(error)
    };
    const recoveryId = `recovery:chat-turn:${stage || 'processing'}:${ingressId || messageHostMessageId(message) || 'turn'}`;
    let next = initializeCampaignRuntimeTracking(await stateForIngressCheck(ingressId, state));
    const existing = await findIngressFresh(next, ingressId);
    if (existing && existing.status === 'recoveryRequired' && existing.recoveryId) {
      setCampaignState(next);
      return next;
    }
    const coreRecovery = await markCoreTurnProcessingFailureForBridge(next, {
      ingressId,
      recoveryId,
      stage,
      failure,
      decision,
      message
    });
    if (ingressId) {
      next = updateTurnIngress(next, ingressId, {
        status: 'recoveryRequired',
        classification: decision ? cloneJson(decision) : existing?.classification || null,
        workerPlan: decision?.workerPlan ? cloneJson(decision.workerPlan) : existing?.workerPlan || null,
        responseStrategy: decision?.responseStrategy || existing?.responseStrategy || null,
        recoveryId,
        coreRecovery: coreRecovery ? cloneJson(coreRecovery) : null,
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        coreProjection: ingressRecoveryCompatibilityProjection({
          coreRecovery,
          ingress: existing,
          recoveryId,
          eventType: 'chatTurnProcessingFailure',
          status: 'recoveryRequired'
        }),
        error: failure,
        failedAt: timestamp(now)
      }, {
        missingCoreWriteMode: 'reject'
      });
    }
    await persistState(next, `Recorded recoverable chat turn processing failure for ${ingressId || messageHostMessageId(message) || 'turn'}.`);
    setCampaignState(next);
    return next;
  }

  async function updateIngressState(state, ingressId, patch, summary) {
    const base = await stateWithIngressFromFallback(state, state, ingressId);
    const existing = await findIngressFresh(initializeCampaignRuntimeTracking(base), ingressId);
    const existingHasCoreMirror = Boolean(
      (
        existing?.compatibilityMirror
        && existing?.authority === 'compatibilityProjection'
        && existing?.projectionSource === 'coreStoreV2'
      )
      || existing?.authority === 'coreIngressProjection'
    );
    const existingTransactionId = existing?.coreTransactionId || existing?.transactionId || null;
    if (
      !patch?.coreTransactionId
      && !patch?.transactionId
      && !patch?.coreProjection
      && !patch?.coreRecovery
      && !existingTransactionId
      && !existing?.coreProjection
      && !existing?.coreRecovery
      && !existingHasCoreMirror
    ) {
      const error = new Error(`Ingress update ${ingressId || 'unknown'} requires CORE projection evidence.`);
      error.code = 'DIRECTIVE_CORE_INGRESS_UPDATE_REQUIRED';
      error.details = { ingressId: ingressId || null };
      throw error;
    }
    const next = updateTurnIngress(base, ingressId, patch, {
      missingCoreWriteMode: 'reject'
    });
    const updated = await findIngressFresh(initializeCampaignRuntimeTracking(next), ingressId);
    if (updated) observedIngressRecords.set(ingressId, cloneJson(updated));
    await persistState(next, summary);
    return next;
  }

  async function dispatchAndRecord({
    state,
    ingressId,
    decision,
    strategy,
    text = null,
    turnId = null,
    outcomeId = null,
    responseKind,
    idempotencyKey = null,
    timing = null,
    metadata = {},
    activityReporter = null
  }) {
    const dispatchState = await stateWithIngressFromFallback(state, state, ingressId);
    setCampaignState(dispatchState);
    try {
      reportActivity(activityReporter, {
        phase: strategy === 'injectAndContinue' ? 'delegatingHostGeneration' : 'writingResponse',
        mode: 'blocking',
        classification: decision?.classification || null,
        responseStrategy: strategy,
        ingressId,
        turnId,
        outcomeId
      });
      const result = await responseDispatcher.dispatch({
        campaignState: dispatchState,
        ingressId,
        strategy,
        text,
        turnId,
        outcomeId,
        responseKind,
        idempotencyKey,
        campaignId: dispatchState.campaign?.id,
        packageData: typeof getPackageData === 'function' ? getPackageData() : null,
        crewDataset: typeof getCrewDataset === 'function' ? getCrewDataset() : null,
        shipDataset: typeof getShipDataset === 'function' ? getShipDataset() : null,
        metadata: {
          classification: decision.classification,
          workerPlan: cloneJson(decision.workerPlan || {}),
          ...cloneJson(metadata || {}),
          ...(timing?.directiveGenerationStartedAt ? {
            directiveGenerationStartedAt: timing.directiveGenerationStartedAt
          } : {})
        }
      });
      let next = await stateWithIngressFromFallback(result?.campaignState || dispatchState, dispatchState, ingressId);
      const hostMessageId = result?.response?.hostMessageId
        || result?.posted?.hostMessageId
        || result?.entry?.hostMessageId
        || null;
      if (
        outcomeId
        && strategy !== 'injectAndContinue'
        && turnCommitCoordinator?.markResponse
        && hasCommittedTurnLedgerOutcome(next, outcomeId)
      ) {
        const marked = await turnCommitCoordinator.markResponse({
          campaignState: next,
          outcomeId,
          status: 'complete',
          hostMessageId
        });
        next = marked.campaignState;
      } else {
        await persistCampaignState(next, strategy === 'injectAndContinue'
          ? 'Recorded host-generation response delegation.'
          : 'Recorded Directive-owned campaign chat response.');
      }
      setCampaignState(next);
      return {
        result,
        state: next
      };
    } catch (error) {
      let failed = initializeCampaignRuntimeTracking(getCampaignState() || state);
      const failure = {
        code: error?.code || 'DIRECTIVE_CHAT_RESPONSE_FAILED',
        message: error?.message || String(error)
      };
      if (
        outcomeId
        && strategy !== 'injectAndContinue'
        && turnCommitCoordinator?.markResponse
        && hasCommittedTurnLedgerOutcome(failed, outcomeId)
      ) {
        const marked = await turnCommitCoordinator.markResponse({
          campaignState: failed,
          outcomeId,
          status: 'failed',
          error: failure
        });
        failed = marked.campaignState;
      }
      const recoveryId = `recovery:response:${ingressId || outcomeId || turnId || 'turn'}`;
      const responseRetryPlan = responseRetryGenerationPlanForDecision({
        decision,
        strategy,
        responseKind
      });
      const coreResponseRecovery = await markCoreResponseRetryRequiredForBridge(failed, {
        ingressId,
        outcomeId,
        turnId,
        recoveryId,
        reason: 'host-response-post-failure',
        error: failure,
        responseRetryPlan
      });
      if (ingressId) {
        const ingress = await findIngressFresh(failed, ingressId);
        const coreProjection = ingressResponseRetryCompatibilityProjection({
          coreResponseRecovery,
          ingress,
          recoveryId,
          eventType: 'hostResponsePostFailure',
          status: 'responseRetryRequired'
        });
        failed = updateTurnIngress(failed, ingressId, {
          status: 'recoveryRequired',
          responseStrategy: strategy,
          turnId,
          outcomeId,
          recoveryId,
          lastError: failure,
          ...(coreProjection ? {
            authority: 'compatibilityProjection',
            projectionSource: 'coreStoreV2',
            coreProjection
          } : {})
        }, {
          missingCoreWriteMode: 'reject'
        });
      }
      await persistState(failed, `Recorded recoverable campaign chat response failure for ${ingressId || outcomeId || turnId || 'turn'}.`);
      error.code = error.code || failure.code;
      error.campaignState = cloneJson(failed);
      throw error;
    }
  }

  function recoveryRequiredDispatchResult(dispatched, decision, extra = {}) {
    if (!dispatched?.result?.recoveryRequired) return null;
    return {
      handled: true,
      responseStrategy: 'injectAndContinue',
      abortDefaultGeneration: false,
      recoveryRequired: true,
      recoveryId: dispatched.result.recoveryId || null,
      decision,
      campaignState: cloneJson(dispatched.state),
      ...extra
    };
  }

  async function handleNoChange(state, ingressId, decision, message, activityReporter = null) {
    let next = state;
    reportActivity(activityReporter, {
      phase: 'scene',
      mode: 'blocking',
      classification: decision.classification,
      ingressId
    });
    const staleBeforePrompt = await currentSourceStaleResult(ingressId, message, 'before-scene-prompt-sync', next);
    if (staleBeforePrompt) return staleBeforePrompt;
    if (decision.workerPlan?.promptUpdate) {
      reportActivity(activityReporter, {
        phase: 'syncingPrompt',
        mode: 'blocking',
        classification: decision.classification,
        ingressId
      });
      next = await syncPrompt(next, 'Prompt context synchronized.', promptFrameForMessage(next, message, decision), activityReporter, {
        source: 'chatTurn',
        classification: decision.classification,
        ingressId
      });
    }
    const stale = await currentSourceStaleResult(ingressId, message, 'before-no-change-dispatch', next);
    if (stale) return stale;
    const dispatched = await dispatchAndRecord({
      state: next,
      ingressId,
      decision,
      strategy: 'injectAndContinue',
      responseKind: 'hostGeneration',
      activityReporter
    });
    const recoveryResult = recoveryRequiredDispatchResult(dispatched, decision);
    if (recoveryResult) return recoveryResult;
    next = await updateIngressState(dispatched.state, ingressId, {
      status: 'complete',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: 'injectAndContinue',
      responseMessageId: null,
      ...(decision.arbiterPlan ? { arbiterPlan: cloneJson(decision.arbiterPlan) } : {}),
      completedAt: timestamp(now)
    }, `Completed ${decision.classification} utility turn.`);
    return {
      handled: true,
      responseStrategy: 'injectAndContinue',
      abortDefaultGeneration: false,
      decision,
      campaignState: cloneJson(next)
    };
  }

  function arbiterPlanToDecision(arbiterPlan = {}) {
    const route = arbiterPlan.route || 'pause';
    const speechAct = String(arbiterPlan.playerIntent?.speechAct || '').trim();
    const classificationByRoute = {
      hostContinue: speechAct === 'routine-command'
        ? 'routineCommand'
        : (speechAct === 'counsel-request'
          ? 'counselRequest'
          : (speechAct === 'scene-navigation' ? 'sceneNavigation' : 'sceneColor')),
      directiveOutcome: speechAct === 'routine-command' && arbiterPlan.statePlan?.commitOutcome !== true
        ? 'routineCommand'
        : 'consequentialCommand',
      localPacing: 'locationTransition',
      pause: 'clarificationNeeded',
      recovery: 'recovery'
    };
    const responseStrategyByRoute = {
      hostContinue: 'injectAndContinue',
      directiveOutcome: 'directivePosted',
      localPacing: 'directivePosted',
      pause: 'pause',
      recovery: 'injectAndContinue'
    };
    return {
      kind: 'directive.turnIntentClassification',
      classification: classificationByRoute[route] || 'clarificationNeeded',
      responseStrategy: responseStrategyByRoute[route] || 'pause',
      confidence: Number.isFinite(Number(arbiterPlan.confidence)) ? Number(arbiterPlan.confidence) : 0,
      ambiguity: arbiterPlan.ambiguity || 'unknown',
      speechAct: arbiterPlan.playerIntent?.speechAct || '',
      action: arbiterPlan.playerIntent?.action || arbiterPlan.responsePlan?.guidance || '',
      target: arbiterPlan.playerIntent?.target || '',
      domainSignals: cloneJson(arbiterPlan.playerIntent?.domainSignals || []),
      riskSignals: cloneJson(arbiterPlan.playerIntent?.riskSignals || []),
      missingInformation: [],
      mixedIntent: false,
      workerPlan: {
        promptUpdate: true,
        narrator: route === 'directiveOutcome' && arbiterPlan.statePlan?.commitOutcome === true,
        mission: route === 'directiveOutcome' && arbiterPlan.statePlan?.commitOutcome === true,
        continuity: route === 'directiveOutcome' && arbiterPlan.statePlan?.commitOutcome === true,
        ship: route === 'directiveOutcome' && arbiterPlan.statePlan?.commitOutcome === true,
        commandBearing: route === 'directiveOutcome' && arbiterPlan.statePlan?.commitOutcome === true,
        arbiterRoute: route
      },
      ...(route === 'localPacing' ? {
        sceneBoundary: {
          kind: 'locationTransition',
          destinationId: arbiterPlan.playerIntent?.target || '',
          destinationLabel: arbiterPlan.playerIntent?.target || arbiterPlan.playerIntent?.directObject || '',
          stopPolicy: 'stopOnArrival'
        }
      } : {}),
      reasons: cloneJson(arbiterPlan.risk?.reasons || []),
      arbiterPlan: cloneJson(arbiterPlan)
    };
  }

  async function handleArbiterHostContinue(state, ingressId, arbiterPlan, message, activityReporter = null) {
    const decision = arbiterPlanToDecision(arbiterPlan);
    reportActivity(activityReporter, {
      phase: 'hostContinuation',
      mode: 'blocking',
      classification: 'hostContinue',
      ingressId
    });
    const next = await syncPrompt(
      state,
      'Prompt context synchronized for Arbiter host continuation.',
      promptFrameForMessage(state, message, decision),
      activityReporter,
      {
        source: 'utilityTurnArbiter',
        classification: 'hostContinue',
        ingressId,
        arbiterPlan: cloneJson(arbiterPlan)
      }
    );
    const dispatched = await dispatchAndRecord({
      state: next,
      ingressId,
      decision,
      strategy: 'injectAndContinue',
      text: null,
      responseKind: 'hostGeneration',
      metadata: {
        arbiterPlan: cloneJson(arbiterPlan)
      },
      activityReporter
    });
    const recoveryResult = recoveryRequiredDispatchResult(dispatched, decision);
    if (recoveryResult) return recoveryResult;
    const completed = await updateIngressState(dispatched.state, ingressId, {
      status: 'complete',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: 'injectAndContinue',
      responseMessageId: null,
      arbiterPlan: cloneJson(arbiterPlan),
      completedAt: timestamp(now)
    }, 'Completed Utility Arbiter host continuation.');
    return {
      handled: true,
      responseStrategy: 'injectAndContinue',
      abortDefaultGeneration: false,
      decision,
      campaignState: cloneJson(completed)
    };
  }

  async function handleLocationTransition(state, ingressId, decision, message, activityReporter = null) {
    let next = state;
    const text = localLocationTransitionNarration(next, decision);
    reportActivity(activityReporter, {
      phase: 'locationTransition',
      mode: 'blocking',
      classification: decision.classification,
      ingressId
    });
    const staleBeforePrompt = await currentSourceStaleResult(ingressId, message, 'before-location-transition-prompt-sync', next);
    if (staleBeforePrompt) return staleBeforePrompt;
    if (decision.workerPlan?.promptUpdate) {
      reportActivity(activityReporter, {
        phase: 'syncingPrompt',
        mode: 'blocking',
        classification: decision.classification,
        ingressId
      });
      next = await syncPrompt(next, 'Prompt context synchronized for location transition pacing.', promptFrameForMessage(next, message, decision), activityReporter, {
        source: 'locationTransition',
        classification: decision.classification,
        ingressId
      });
    }
    const stale = await currentSourceStaleResult(ingressId, message, 'before-location-transition-dispatch', next);
    if (stale) return stale;
    const dispatched = await dispatchAndRecord({
      state: next,
      ingressId,
      decision,
      strategy: 'directivePosted',
      text,
      responseKind: 'locationTransition',
      activityReporter
    });
    const recoveryResult = recoveryRequiredDispatchResult(dispatched, decision, {
      responseStrategy: 'directivePosted',
      abortDefaultGeneration: true
    });
    if (recoveryResult) return recoveryResult;
    next = await updateIngressState(dispatched.state, ingressId, {
      status: 'committed',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: 'directivePosted',
      responseMessageId: dispatched.result.response?.hostMessageId || dispatched.result.posted?.hostMessageId || null,
      completedAt: timestamp(now)
    }, `Location transition ${ingressId} paced and posted.`);
    return {
      handled: true,
      responseStrategy: 'directivePosted',
      abortDefaultGeneration: true,
      decision,
      campaignState: cloneJson(next)
    };
  }

  async function handleRoutine(state, ingressId, decision, message, activityReporter = null) {
    reportActivity(activityReporter, {
      phase: 'routine',
      mode: 'blocking',
      classification: decision.classification,
      ingressId
    });
    const stale = await currentSourceStaleResult(ingressId, message, 'before-routine-commit', state);
    if (stale) return stale;
    const routineId = `routine:${ingressId}`;
    const nextCandidate = cloneJson(state);
    nextCandidate.commandCompetence = nextCandidate.commandCompetence || {};
    nextCandidate.commandCompetence.assumedActionsLedger = nextCandidate.commandCompetence.assumedActionsLedger || [];
    if (!nextCandidate.commandCompetence.assumedActionsLedger.some((entry) => entry.id === routineId)) {
      nextCandidate.commandCompetence.assumedActionsLedger.push({
        id: routineId,
        sourceMessageId: message.hostMessageId || message.id || null,
        input: message.text,
        assumedProfessionalProcedure: true,
        reversible: true,
        committedAt: timestamp(now)
      });
    }
    nextCandidate.commandLog = nextCandidate.commandLog || { entries: [] };
    nextCandidate.commandLog.entries = nextCandidate.commandLog.entries || [];
    if (!nextCandidate.commandLog.entries.some((entry) => entry.id === routineId)) {
      nextCandidate.commandLog.entries.push({
        id: routineId,
        type: 'routineCommand',
        stardate: nextCandidate.campaign?.currentStardate,
        source: 'chatUtilityPass',
        summaryInputs: [message.text],
        visibleConsequences: ['Routine professional procedure completed and logged.']
      });
    }
    const committed = await stateDeltaGateway.commit(nextCandidate, {
      source: 'chatUtilityPass',
      reason: 'Routine Command Competence action committed.',
      summary: `Routine action: ${compact(message.text).slice(0, 120)}`,
      domains: ['commandCompetence', 'commandLog'],
      ingressId,
      stable: true
    });
    let next = committed;
    reportActivity(activityReporter, {
      phase: 'syncingPrompt',
      mode: 'blocking',
      classification: decision.classification,
      ingressId,
      turnId: routineId
    });
    next = await syncPrompt(next, 'Prompt context synchronized.', promptFrameForMessage(next, message, decision), activityReporter, {
      source: 'routineCommand',
      classification: decision.classification,
      ingressId,
      turnId: routineId
    });
    const directiveOwned = decision.responseStrategy === 'directivePosted';
    const dispatched = await dispatchAndRecord({
      state: next,
      ingressId,
      decision,
      strategy: directiveOwned ? 'directivePosted' : 'injectAndContinue',
      text: directiveOwned ? localRoutineNarration(message) : null,
      turnId: routineId,
      responseKind: directiveOwned ? 'routineCommand' : 'hostGeneration',
      activityReporter
    });
    const recoveryResult = recoveryRequiredDispatchResult(dispatched, decision);
    if (recoveryResult) return recoveryResult;
    next = await updateIngressState(dispatched.state, ingressId, {
      status: 'committed',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: directiveOwned ? 'directivePosted' : 'injectAndContinue',
      turnId: routineId,
      responseMessageId: dispatched.result.response?.hostMessageId || null,
      completedAt: timestamp(now)
    }, `Routine command ${routineId} completed.`);
    return {
      handled: true,
      responseStrategy: directiveOwned ? 'directivePosted' : 'injectAndContinue',
      abortDefaultGeneration: directiveOwned,
      decision,
      campaignState: cloneJson(next)
    };
  }

  async function continueClassifiedTurn(state, ingressId, decision, message, activityReporter = null) {
    if (decision.pendingInteractionResolution?.action) {
      return handlePendingInteractionResolution(state, ingressId, decision, message, activityReporter);
    }
    if (['sceneColor', 'sceneNavigation', 'noDirectiveAction'].includes(decision.classification)) {
      return handleNoChange(state, ingressId, decision, message, activityReporter);
    }
    if (decision.classification === 'locationTransition') {
      return handleLocationTransition(state, ingressId, decision, message, activityReporter);
    }
    if (decision.classification === 'routineCommand') {
      return handleRoutine(state, ingressId, decision, message, activityReporter);
    }
    if (decision.classification === 'counselRequest') {
      return handleNoChange(state, ingressId, decision, message, activityReporter);
    }
    if (decision.classification === 'clarificationNeeded') {
      return postPause(state, ingressId, decision, composePauseResponse('clarificationNeeded'), {
        kind: 'clarificationNeeded',
        message
      }, activityReporter);
    }
    if (decision.classification === 'riskConfirmationNeeded') {
      return handleConsequential(state, ingressId, decision, message, activityReporter);
    }
    return handleConsequential(state, ingressId, decision, message, activityReporter);
  }

  async function postPause(state, ingressId, decision, text, details = {}, activityReporter = null) {
    reportActivity(activityReporter, {
      phase: 'pause',
      mode: 'blocking',
      classification: details.kind || decision.classification,
      ingressId,
      turnId: details.turnId || null,
      outcomeId: details.outcomeId || null
    });
    const staleBeforePause = details.message
      ? await currentSourceStaleResult(ingressId, details.message, `before-${details.kind || decision.classification}-pause`, state)
      : null;
    if (staleBeforePause) return staleBeforePause;
    const interactionId = `interaction:${ingressId}`;
    let next = await recordCorePendingInteraction(state, {
      id: interactionId,
      kind: details.kind || decision.classification,
      status: 'pending',
      ingressId,
      turnId: details.turnId || null,
      outcomeId: details.outcomeId || null,
      prompt: text,
      options: details.options || [],
      createdAt: timestamp(now),
      ...(await pendingInteractionAuthorityForIngress(state, ingressId, interactionId))
    });
    setCampaignState(next);
    const staleBeforeDispatch = details.message
      ? await currentSourceStaleResult(ingressId, details.message, `before-${details.kind || decision.classification}-pause-dispatch`, next)
      : null;
    if (staleBeforeDispatch) return staleBeforeDispatch;
    const dispatched = await dispatchAndRecord({
      state: next,
      ingressId,
      decision,
      strategy: 'pause',
      text,
      turnId: details.turnId || null,
      // The pause is tied to a provisional outcome in runtime state, but it is
      // not itself the committed outcome response. Keep host message metadata
      // free of the provisional outcome id so recovery and audit views cannot
      // mistake a warning/clarification for final narration.
      outcomeId: null,
      responseKind: details.kind || decision.classification,
      activityReporter
    });
    next = await updateIngressState(dispatched.state, ingressId, {
      status: 'paused',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: 'pause',
      turnId: details.turnId || null,
      outcomeId: details.outcomeId || null,
      responseMessageId: dispatched.result.response?.hostMessageId || null,
      completedAt: timestamp(now)
    }, `Paused chat turn for ${decision.classification}.`);
    reportActivity(activityReporter, {
      phase: 'syncingPrompt',
      mode: 'blocking',
      classification: details.kind || decision.classification,
      ingressId,
      turnId: details.turnId || null,
      outcomeId: details.outcomeId || null
    });
    next = await syncPrompt(next, 'Prompt context synchronized.', promptFrameForMessage(next, details.message, decision), activityReporter, {
      source: details.kind || decision.classification,
      classification: details.kind || decision.classification,
      ingressId,
      turnId: details.turnId || null,
      outcomeId: details.outcomeId || null
    });
    return {
      handled: true,
      responseStrategy: 'pause',
      abortDefaultGeneration: true,
      decision,
      campaignState: cloneJson(next),
      response: cloneJson(dispatched.result.response)
    };
  }


  async function handleConsequential(state, ingressId, decision, message, activityReporter = null) {
    state = initializeCampaignRuntimeTracking(state);
    state.runtimeTracking.activeIngressId = ingressId;
    setCampaignState(state);
    reportActivity(activityReporter, {
      phase: 'directorReview',
      mode: 'blocking',
      classification: decision.classification,
      ingressId
    });
    const preview = await previewDirectorTurn({
      turnId: `chat-turn:${ingressId}`,
      playerInput: message.text,
      generationRouter,
      arbiterPlan: cloneJson(decision.arbiterPlan || null),
      message: cloneJson(message),
      recentTranscript: displaySafeRecentChat(host.chat.getRecentMessages?.({ limit: 12, playerSafeOnly: true }) || []),
      sourceFrameRef: cloneJson((await findIngressFresh(state, ingressId))?.sourceFrame || decision.sourceFrameRef || null)
    });
    const stale = await currentSourceStaleResult(ingressId, message, 'before-consequential-commit', state);
    if (stale) return stale;
    const turnId = preview?.turnPacket?.turnId || preview?.turnPacket?.id || `chat-turn:${ingressId}`;
    const provisionalOutcomeId = preview?.turnPacket?.outcomePacket?.id || null;
    const warning = preview?.warningConfirmation || preview?.turnPacket?.warningConfirmation || {};
    if (warning.required === true || decision.classification === 'riskConfirmationNeeded') {
      const pauseText = warning.required === true
        ? warningText(preview)
        : composePauseResponse('riskConfirmationNeeded');
      return postPause(state, ingressId, {
        ...decision,
        classification: 'riskConfirmationNeeded'
      }, pauseText, {
        kind: 'riskConfirmationNeeded',
        message,
        turnId,
        outcomeId: provisionalOutcomeId,
        options: [
          { id: 'confirm', label: 'Confirm the order' },
          { id: 'revise', label: 'Revise the order' }
        ]
      }, activityReporter);
    }
    let committed;
    reportActivity(activityReporter, {
      phase: 'committingOutcome',
      mode: 'blocking',
      classification: decision.classification,
      ingressId,
      turnId,
      outcomeId: provisionalOutcomeId
    });
    committed = await commitProvisionalDirectorTurn({
      generateNarration: true,
      arbiterPlan: cloneJson(decision.arbiterPlan || null)
    });
    let next = initializeCampaignRuntimeTracking(committed?.campaignState || getCampaignState());
    setCampaignState(next);
    const outcomeId = committed?.turnPacket?.outcomePacket?.id || provisionalOutcomeId;
    const generatedText = narrationText(committed);
    const directiveGenerationStartedAt = narrationGenerationStartedAt(committed);
    const text = generatedText || localOutcomeNarration(committed);
    const providerFailureRecoveryId = committed?.narrationResult?.ok === false
      ? `recovery:narration:${outcomeId}`
      : null;
    const providerFailureCoreRecovery = providerFailureRecoveryId
      ? await markCoreResponseRetryRequiredForBridge(next, {
        ingressId,
        outcomeId,
        turnId,
        recoveryId: providerFailureRecoveryId,
        reason: 'provider-failure-after-mechanics-commit',
        error: compactProviderFailureError(committed?.narrationResult?.error || null)
      })
      : null;
    const dispatched = await dispatchAndRecord({
      state: next,
      ingressId,
      decision,
      strategy: 'directivePosted',
      text,
      turnId,
      outcomeId,
      responseKind: 'committedOutcome',
      timing: { directiveGenerationStartedAt },
      metadata: committed?.narrationResult?.ok === false ? {
        providerFailureAfterMechanicsCommit: true,
        fallbackResponsePosted: true,
        providerFailureErrorCode: committed?.narrationResult?.error?.code || null,
        providerFailureRecoveryId,
        providerFailureCoreRecovery: responseRetryCoreProjection(providerFailureCoreRecovery)
      } : {},
      activityReporter
    });
    next = dispatched.state;
    if (!committed?.narrationResult?.ok) {
      const recoveryId = providerFailureRecoveryId;
      const fallbackResponseRef = dispatched.result?.entry || dispatched.result?.response || null;
      const coreResponseRecovery = providerFailureCoreRecovery;
      const fallbackResponseId = compact(fallbackResponseRef?.id || fallbackResponseRef?.responseId);
      const providerFailureIngress = await findIngressFresh(next, ingressId);
      if (fallbackResponseId) {
        next = updateDirectiveResponse(next, fallbackResponseId, {
          status: 'responseRetryRequired',
          recoveryId,
          authority: 'compatibilityProjection',
          projectionSource: 'coreStoreV2',
          coreProjection: responseRetryCompatibilityProjection({
            coreResponseRecovery,
            responseId: fallbackResponseRef.id || null,
            recoveryId,
            status: 'responseRetryRequired'
          }),
          providerFallback: {
            kind: 'directive.providerFailureFallback.v1',
            reason: 'provider-failure-after-mechanics-commit',
            coreTransactionId: coreResponseRecovery?.transactionId || providerFailureIngress?.coreTransactionId || null,
            retryPath: 'assistantSwipe'
          }
        }, {
          missingCoreWriteMode: 'reject'
        });
      }
      await persistState(next, `Recorded narration recovery issue for ${outcomeId}.`);
    }
    next = await updateIngressState(next, ingressId, {
      status: committed?.narrationResult?.ok === false ? 'responseRetryRequired' : 'committed',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: 'directivePosted',
      turnId,
      outcomeId,
      responseMessageId: dispatched.result.response?.hostMessageId || null,
      narrationFallbackUsed: !generatedText,
      recoveryId: committed?.narrationResult?.ok === false ? `recovery:narration:${outcomeId}` : null,
      completedAt: timestamp(now)
    }, `Completed consequential chat turn ${turnId}.`);
    reportActivity(activityReporter, {
      phase: 'syncingPrompt',
      mode: 'blocking',
      classification: decision.classification,
      ingressId,
      turnId,
      outcomeId
    });
    next = await syncPrompt(next, 'Prompt context synchronized.', promptFrameForMessage(next, message, decision, {
      scene: {
        presentActorIds: committed?.turnPacket?.sceneSnapshot?.presentCharacters || []
      },
      recallRefs: committed?.turnPacket?.directorPackets?.narrator?.recallRefs || []
    }), activityReporter, {
      source: 'committedOutcome',
      classification: decision.classification,
      ingressId,
      turnId,
      outcomeId
    });
    return {
      handled: true,
      responseStrategy: 'directivePosted',
      abortDefaultGeneration: true,
      decision,
      campaignState: cloneJson(next),
      response: cloneJson(dispatched.result.response),
      committed: true
    };
  }

  async function handlePendingInteractionResolution(state, ingressId, decision, message, activityReporter = null) {
    reportActivity(activityReporter, {
      phase: 'pause',
      mode: 'blocking',
      classification: decision.classification,
      ingressId
    });
    state = await stateWithCorePendingProjections(state);
    const resolution = decision.pendingInteractionResolution || {};
    const pending = activePendingInteraction(state, resolution.interactionId || null);
    if (!pending) {
      return postPause(state, ingressId, {
        ...decision,
        classification: 'clarificationNeeded',
        responseStrategy: 'pause'
      }, composePauseResponse('clarificationNeeded'), {
        kind: 'clarificationNeeded',
        message
      }, activityReporter);
    }
    const action = resolutionAction(decision);
    if (
      pending.kind === 'clarificationNeeded'
      && !pending.turnId
      && !pending.outcomeId
      && !['revise', 'cancel', 'dismiss'].includes(action)
    ) {
      if (decision.classification === 'clarificationNeeded') {
        const next = await resolveCorePendingInteraction(state, pending, {
          status: 'superseded',
          action: action || 'ambiguous-answer',
          resolutionIngressId: ingressId,
          resolvedAt: timestamp(now)
        });
        setCampaignState(next);
        const stale = await currentSourceStaleResult(ingressId, message, 'before-superseded-clarification-continue', next);
        if (stale) return stale;
        return continueClassifiedTurn(next, ingressId, decisionWithoutPendingResolution(decision), message, activityReporter);
      }
      let next = await resolveCorePendingInteraction(state, pending, {
        status: 'resolved',
        action: action || 'accept',
        resolutionIngressId: ingressId,
        resolvedClassification: decision.classification,
        resolvedAt: timestamp(now)
      });
      next = updateTurnIngress(next, pending.ingressId, {
        status: 'resolved',
        pendingInteractionId: pending.id,
        resolutionIngressId: ingressId,
        resolvedAt: timestamp(now)
      }, {
        missingCoreWriteMode: 'reject'
      });
      await persistState(next, `Resolved pending clarification ${pending.id} from player reply.`);
      const stale = await currentSourceStaleResult(ingressId, message, 'before-clarification-answer-continue', next);
      if (stale) return stale;
      return continueClassifiedTurn(next, ingressId, decisionWithoutPendingResolution(decision), message, activityReporter);
    }
    const staleBeforeResolution = await currentSourceStaleResult(ingressId, message, 'before-pending-interaction-resolution', state);
    if (staleBeforeResolution) return staleBeforeResolution;
    const stalePendingSource = await pendingSourceStaleResult(state, pending, 'before-pending-interaction-source-resolution');
    if (stalePendingSource) return stalePendingSource;
    const resolved = await resolveInteraction({
      interactionId: pending.id,
      action: resolution.action || 'accept',
      resolutionMessage: message,
      resolutionIngressId: ingressId,
      activityReporter
    });
    let next = initializeCampaignRuntimeTracking(getCampaignState() || state);
    if (!resolved.ok) {
      next = await updateIngressState(next, ingressId, {
        status: 'recoveryRequired',
        classification: cloneJson(decision),
        workerPlan: cloneJson(decision.workerPlan),
        responseStrategy: 'pause',
        pendingInteractionId: pending.id,
        lastError: {
          code: 'DIRECTIVE_PENDING_INTERACTION_RESOLUTION_FAILED',
          message: resolved.reason || 'Pending interaction could not be resolved.'
        },
        completedAt: timestamp(now)
      }, `Pending interaction ${pending.id} resolution failed.`);
      return {
        handled: true,
        responseStrategy: 'pause',
        abortDefaultGeneration: true,
        decision,
        resolvedPendingInteraction: false,
        error: cloneJson(resolved),
        campaignState: cloneJson(next)
      };
    }
    next = await updateIngressState(next, ingressId, {
      status: resolved.outcomeId ? 'committed' : 'complete',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: decision.responseStrategy,
      pendingInteractionId: pending.id,
      outcomeId: resolved.outcomeId || null,
      responseMessageId: resolved.response?.hostMessageId || null,
      completedAt: timestamp(now)
    }, `Resolved pending interaction ${pending.id} from chat.`);
    return {
      handled: true,
      responseStrategy: decision.responseStrategy,
      abortDefaultGeneration: true,
      decision,
      resolvedPendingInteraction: true,
      pendingInteractionId: pending.id,
      campaignState: cloneJson(next),
      response: cloneJson(resolved.response || null)
    };
  }

  async function resolveInteraction({
    interactionId = null,
    action = 'accept',
    resolutionMessage = null,
    resolutionIngressId = null,
    activityReporter = null
  } = {}) {
    let state = await stateWithCorePendingProjections(initializeCampaignRuntimeTracking(getCampaignState()));
    const interaction = pendingInteractionRows(state).find((entry) => (
      entry.status === 'pending' && (!interactionId || entry.id === interactionId)
    ));
    if (!interaction) return { ok: false, reason: 'pending-interaction-not-found' };

    const normalizedAction = compact(action || 'accept').toLowerCase();
    const stalePendingSource = ['revise', 'cancel', 'dismiss'].includes(normalizedAction)
      ? null
      : await pendingSourceStaleResult(state, interaction, 'before-pending-interaction-direct-resolution');
    if (stalePendingSource) {
      return {
        ok: false,
        stale: true,
        reason: 'source-ingress-stale',
        staleResult: cloneJson(stalePendingSource),
        campaignState: cloneJson(state)
      };
    }
    if (['revise', 'cancel', 'dismiss'].includes(normalizedAction)) {
      await discardProvisionalDirectorTurn?.();
      state = await stateWithCorePendingProjections(initializeCampaignRuntimeTracking(getCampaignState() || state));
      state = await resolveCorePendingInteraction(state, interaction, {
        status: normalizedAction === 'revise' ? 'revisionRequested' : 'canceled',
        action: normalizedAction,
        resolvedAt: timestamp(now)
      });
      state = updateTurnIngress(state, interaction.ingressId, {
        status: normalizedAction === 'revise' ? 'awaitingRevision' : 'canceled',
        pendingInteractionId: interaction.id,
        resolvedAt: timestamp(now)
      }, {
        missingCoreWriteMode: 'reject'
      });
      await persistState(state, `Pending ${interaction.kind} interaction ${normalizedAction}.`);
      reportActivity(activityReporter, {
        phase: 'syncingPrompt',
        mode: 'blocking',
        classification: interaction.kind,
        ingressId: interaction.ingressId
      });
      state = await syncPrompt(state, 'Prompt context synchronized.', null, activityReporter, {
        source: `pendingInteraction:${normalizedAction}`,
        classification: interaction.kind,
        ingressId: interaction.ingressId
      });
      return { ok: true, action: normalizedAction, campaignState: cloneJson(state) };
    }

    reportActivity(activityReporter, {
      phase: 'committingOutcome',
      mode: 'blocking',
      classification: interaction.kind,
      ingressId: interaction.ingressId,
      turnId: interaction.turnId || null,
      outcomeId: interaction.outcomeId || null
    });
    const preCommitResolutionState = state;
    const committed = await commitProvisionalDirectorTurn({
      confirmWarnings: interaction.kind === 'riskConfirmationNeeded' || normalizedAction === 'confirm',
      confirmedWarningIds: [],
      generateNarration: true,
      generateCommandLogSummary: true,
      deferCommandLogSummary: true
    });
    state = initializeCampaignRuntimeTracking(committed?.campaignState || getCampaignState() || state);
    state = await stateWithIngressFromFallback(state, preCommitResolutionState, resolutionIngressId);
    setCampaignState(state);
    const outcomeId = committed?.turnPacket?.outcomePacket?.id || interaction.outcomeId || null;
    const turnId = committed?.turnPacket?.turnId || committed?.turnPacket?.id || interaction.turnId || null;
    const generatedText = narrationText(committed);
    const directiveGenerationStartedAt = narrationGenerationStartedAt(committed);
    const text = generatedText || localOutcomeNarration(committed);
    const syntheticResolutionIngressId = `${interaction.ingressId}:resolution:${interaction.id}`;
    const providerFailureRecoveryId = committed?.narrationResult?.ok === false
      ? `recovery:narration:${outcomeId}`
      : null;
    const providerFailureCoreRecovery = providerFailureRecoveryId
      ? await markCoreResponseRetryRequiredForBridge(state, {
        ingressId: interaction.ingressId,
        outcomeId,
        turnId,
        recoveryId: providerFailureRecoveryId,
        reason: 'provider-failure-after-mechanics-commit',
        error: compactProviderFailureError(committed?.narrationResult?.error || null)
      })
      : null;
    const dispatched = await dispatchAndRecord({
      state,
      ingressId: resolutionIngressId || interaction.ingressId,
      decision: {
        classification: interaction.kind,
        workerPlan: {}
      },
      strategy: 'directivePosted',
      text,
      turnId,
      outcomeId,
      responseKind: 'committedOutcome',
      timing: { directiveGenerationStartedAt },
      metadata: committed?.narrationResult?.ok === false ? {
        providerFailureAfterMechanicsCommit: true,
        fallbackResponsePosted: true,
        providerFailureErrorCode: committed?.narrationResult?.error?.code || null,
        providerFailureRecoveryId,
        providerFailureCoreRecovery: responseRetryCoreProjection(providerFailureCoreRecovery)
      } : {},
      activityReporter
    });
    state = initializeCampaignRuntimeTracking(dispatched.state);
    state = await resolveCorePendingInteraction(state, interaction, {
      status: 'resolved',
      action: normalizedAction,
      outcomeId,
      responseMessageId: dispatched.result.response?.hostMessageId || dispatched.result.entry?.hostMessageId || null,
      resolvedAt: timestamp(now)
    });
    state = updateTurnIngress(state, interaction.ingressId, {
      status: 'committed',
      outcomeId,
      turnId,
      pendingInteractionId: interaction.id,
      responseStrategy: 'directivePosted',
      responseMessageId: dispatched.result.response?.hostMessageId || dispatched.result.entry?.hostMessageId || null,
      completedAt: timestamp(now)
    }, {
      missingCoreWriteMode: 'reject'
    });
    if (!committed?.narrationResult?.ok) {
      const recoveryId = providerFailureRecoveryId;
      const fallbackResponseRef = dispatched.result?.entry || dispatched.result?.response || null;
      const coreResponseRecovery = providerFailureCoreRecovery;
      const fallbackResponseId = compact(fallbackResponseRef?.id || fallbackResponseRef?.responseId);
      const providerFailureIngress = await findIngressFresh(state, interaction.ingressId);
      if (fallbackResponseId) {
        state = updateDirectiveResponse(state, fallbackResponseId, {
          status: 'responseRetryRequired',
          recoveryId,
          authority: 'compatibilityProjection',
          projectionSource: 'coreStoreV2',
          coreProjection: responseRetryCompatibilityProjection({
            coreResponseRecovery,
            responseId: fallbackResponseRef.id || null,
            recoveryId,
            status: 'responseRetryRequired'
          }),
          providerFallback: {
            kind: 'directive.providerFailureFallback.v1',
            reason: 'provider-failure-after-mechanics-commit',
            coreTransactionId: coreResponseRecovery?.transactionId || providerFailureIngress?.coreTransactionId || null,
            retryPath: 'assistantSwipe'
          }
        }, {
          missingCoreWriteMode: 'reject'
        });
      }
      state = updateTurnIngress(state, interaction.ingressId, {
        status: 'responseRetryRequired',
        recoveryId,
        lastError: compactProviderFailureError(committed?.narrationResult?.error || null),
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        coreProjection: ingressResponseRetryCompatibilityProjection({
          coreResponseRecovery: providerFailureCoreRecovery,
          ingress: providerFailureIngress,
          recoveryId,
          eventType: 'providerFailureAfterMechanicsCommit',
          status: 'responseRetryRequired'
        })
      }, {
        missingCoreWriteMode: 'reject'
      });
    }
    await persistState(state, `Resolved pending ${interaction.kind} interaction.`);
    reportActivity(activityReporter, {
      phase: 'syncingPrompt',
      mode: 'blocking',
      classification: interaction.kind,
      ingressId: interaction.ingressId,
      turnId,
      outcomeId
    });
    state = await syncPrompt(state, 'Prompt context synchronized.', null, activityReporter, {
      source: 'pendingInteractionResolution',
      classification: interaction.kind,
      ingressId: interaction.ingressId,
      turnId,
      outcomeId
    });
    return {
      ok: true,
      action: normalizedAction,
      outcomeId,
      response: cloneJson(dispatched.result.response || dispatched.result.entry || null),
      campaignState: cloneJson(state)
    };
  }

  async function retryCommittedResponse({ recoveryId = null } = {}) {
    let state = initializeCampaignRuntimeTracking(getCampaignState());
    const recovery = await findOpenResponseRetryRecovery(state, { recoveryId });
    if (!recovery) return { ok: false, reason: 'response-recovery-not-found' };
    const details = recovery.details || {};
    const ingress = recovery.ingressId ? await findIngressFresh(state, recovery.ingressId) : null;
    let coreTransaction = null;
    if (ingress?.coreTransactionId && typeof coreTurnStore?.getTransaction === 'function') {
      try {
        coreTransaction = await coreTurnStore.getTransaction(ingress.coreTransactionId);
      } catch {
        coreTransaction = null;
      }
    }
    const authorizeRetry = repair.authorizeRetry || repair.evaluateResponseRetryActuation;
    const retryActuationDecision = authorizeRetry.call(repair, {
      recovery,
      recoveryDecision: details.repairDecision || null,
      transaction: coreTransaction,
      transactionId: ingress?.coreTransactionId || details.coreTransactionId || null,
      responseId: details.responseId || details.responseIdempotencyKey || null,
      outcomeId: recovery.outcomeId || null,
      turnId: details.turnId || null,
      sourceFrameId: ingress?.sourceFrameId || details.sourceFrameId || null,
      eventTime: timestamp(now)
    });
    if (retryActuationDecision.authorized !== true) {
      return {
        ok: false,
        reason: 'response-retry-not-authorized',
        decision: cloneJson(retryActuationDecision)
      };
    }
    if (recovery.type === 'providerFailureAfterMechanicsCommit') {
      return retryProviderFailureResponse({
        state,
        recovery,
        details,
        ingress,
        coreTransaction,
        retryActuationDecision
      });
    }
    let retryText = null;
    let decision = {
      classification: details.classification || 'directorResponseNeeded',
      workerPlan: cloneJson(details.workerPlan || {})
    };
    let retryStrategy = details.strategy || 'directivePosted';
    let retryResponseKind = details.responseKind || 'committedOutcome';
    if (!compact(retryText)) {
      const regenerated = await regenerateResponseRetryText({
        state,
        details: {
          ...details,
          ingressId: recovery.ingressId || details.ingressId || null,
          outcomeId: recovery.outcomeId || details.outcomeId || null
        },
        generationRouter
      });
      if (regenerated.ok !== true || !compact(regenerated.text)) {
        return {
          ok: false,
          reason: regenerated.reason || 'response-retry-text-unavailable',
          decision: cloneJson(retryActuationDecision)
        };
      }
      retryText = regenerated.text;
      decision = regenerated.decision || decision;
      retryStrategy = regenerated.strategy || retryStrategy;
      retryResponseKind = regenerated.responseKind || retryResponseKind;
    }
    const dispatched = await dispatchAndRecord({
      state,
      ingressId: recovery.ingressId,
      decision,
      strategy: retryStrategy,
      text: retryText,
      turnId: details.turnId || null,
      outcomeId: recovery.outcomeId || null,
      responseKind: retryResponseKind,
      idempotencyKey: details.responseIdempotencyKey || `directive-response-retry:${recovery.id}`,
      metadata: {
        repairResponseRetryActuationDecision: retryActuationDecision
      }
    });
    state = initializeCampaignRuntimeTracking(dispatched.state);
    if (recovery.ingressId) {
      state = updateTurnIngress(state, recovery.ingressId, {
        status: recovery.outcomeId ? 'committed' : 'complete',
        responseMessageId: dispatched.result?.entry?.hostMessageId || dispatched.result?.response?.hostMessageId || null,
        recoveryId: null,
        lastError: null,
        completedAt: timestamp(now)
      }, {
        missingCoreWriteMode: 'reject'
      });
    }
    await persistState(state, `Recovered campaign chat response for ${recovery.ingressId || recovery.outcomeId || recovery.id}.`);
    state = await syncPrompt(state);
    return {
      ok: true,
      recoveryId: recovery.id,
      duplicate: dispatched.result?.duplicate === true,
      response: cloneJson(dispatched.result?.response || dispatched.result?.entry || null),
      campaignState: cloneJson(state)
    };
  }

  async function retryProviderFailureResponse({
    state,
    recovery,
    details = {},
    ingress = null,
    coreTransaction = null,
    retryActuationDecision = null
  } = {}) {
    if (typeof host.chat.appendAssistantMessageSwipe !== 'function') {
      return {
        ok: false,
        reason: 'assistant-swipes-unavailable',
        decision: cloneJson(retryActuationDecision)
      };
    }
    if (ingress?.coreTransactionId && typeof coreTurnStore?.recordVisibleResponse !== 'function') {
      return {
        ok: false,
        reason: 'core-visible-response-writer-unavailable',
        decision: cloneJson(retryActuationDecision)
      };
    }
    const targetHostMessageId = compact(details.hostMessageId || details.responseHostMessageId || '');
    if (!targetHostMessageId) {
      return {
        ok: false,
        reason: 'provider-failure-response-target-missing',
        decision: cloneJson(retryActuationDecision)
      };
    }
    const recent = typeof host.chat.getRecentMessages === 'function'
      ? await host.chat.getRecentMessages({ limit: 500, playerSafeOnly: false })
      : [];
    const messages = Array.isArray(recent) ? recent.filter(Boolean) : [];
    const recentTargetIndex = messages.findIndex((message, index) => (
      compact(message?.hostMessageId || message?.id || String(index)) === targetHostMessageId
    ));
    if (recentTargetIndex < 0) {
      return {
        ok: false,
        reason: 'provider-failure-response-target-not-current',
        decision: cloneJson(retryActuationDecision)
      };
    }
    const target = host.chat.getMessage?.(targetHostMessageId)
      || (recentTargetIndex >= 0 ? messages[recentTargetIndex] : null);
    if (!isDirectiveAssistantMessage(target)) {
      return {
        ok: false,
        reason: 'provider-failure-response-target-not-directive-owned',
        decision: cloneJson(retryActuationDecision)
      };
    }
    const laterSourceMessage = messages.slice(recentTargetIndex + 1).find((entry) => (
      entry?.isUser === true
      || entry?.role === 'user'
      || (
        entry?.isSystem !== true
        && entry?.role !== 'system'
        && (
          entry?.role === 'assistant'
          || entry?.isUser === false
          || isDirectiveAssistantMessage(entry)
        )
      )
    ));
    if (laterSourceMessage) {
      return {
        ok: false,
        reason: 'provider-failure-response-target-not-latest',
        decision: cloneJson(retryActuationDecision)
      };
    }
    const priorPlayer = recentTargetIndex >= 0
      ? [...messages.slice(0, recentTargetIndex)].reverse().find((entry) => (
        entry?.isUser === true || entry?.role === 'user'
      )) || null
      : null;
    const targetMetadata = responseMetadata(target) || {};
    const responseKind = compact(details.responseKind || targetMetadata.responseKind || 'committedOutcome');
    const runtimeLedgerView = await runtimeLedgerViewFresh(state || {});
    const responseRows = runtimeLedgerView.responseLedger || [];
    const providerFallbackResponseTargets = responseRows.filter((entry) => (
      compact(entry?.authority) === 'compatibilityProjection'
      && compact(entry?.projectionSource) === 'coreStoreV2'
      && entry?.providerFallback
      && ['responseRetryRequired', 'coreClosureFailed'].includes(compact(entry?.coreProjection?.status))
    ));
    const retryResponseRows = [
      ...providerFallbackResponseTargets,
      ...responseRows
    ];
    const targetResponseId = compact(targetMetadata.idempotencyKey || target?.raw?.metadata?.idempotencyKey || '');
    const targetResponseLookupId = compact(details.responseId || details.responseIdempotencyKey || targetResponseId || '');
    const responseEntry = retryResponseRows.find((entry) => (
      (targetResponseLookupId && compact(entry.id) === targetResponseLookupId)
      || (targetHostMessageId && compact(entry.hostMessageId) === targetHostMessageId)
    )) || responseEntryForMessage(state, target);
    const sourceResponseId = compact(
      responseEntry?.id
      || details.responseId
      || details.responseIdempotencyKey
      || targetMetadata.idempotencyKey
      || `response:${targetHostMessageId}`
    );
    const campaignId = compact(state.campaign?.id || '');
    const targetCampaignId = compact(targetMetadata.campaignId || target?.raw?.metadata?.campaignId || '');
    const targetOutcomeId = compact(targetMetadata.outcomeId || target?.raw?.metadata?.outcomeId || '');
    const responseEntryMatchesTargetResponse = !targetResponseId || [
      responseEntry?.id,
      responseEntry?.coreProjection?.responseId,
      responseEntry?.coreResponse?.responseId,
      responseEntry?.coreRelease?.responseId,
      responseEntry?.providerFallback?.responseId
    ].some((id) => compact(id) === targetResponseId);
    if (
      !responseEntry
      || (details.responseId && compact(responseEntry.id) !== compact(details.responseId))
      || !responseEntryMatchesTargetResponse
      || (responseEntry.hostMessageId && compact(responseEntry.hostMessageId) !== targetHostMessageId)
      || (recovery.outcomeId && compact(responseEntry.outcomeId) !== compact(recovery.outcomeId))
      || (targetOutcomeId && recovery.outcomeId && targetOutcomeId !== compact(recovery.outcomeId))
      || (targetCampaignId && campaignId && targetCampaignId !== campaignId)
    ) {
      return {
        ok: false,
        reason: 'provider-failure-response-target-mismatch',
        decision: cloneJson(retryActuationDecision)
      };
    }
    const runtimeMetadata = target?.raw?.extra?.runtimeMetadata || target?.extra?.runtimeMetadata || {};
    const selectedRetryRecoveryId = compact(
      targetMetadata.responseRetryRecoveryId
      || runtimeMetadata.responseRetryRecoveryId
      || ''
    );
    const priorRetry = responseEntry?.responseRetry || null;
    if (priorRetry?.recoveryId === recovery.id && selectedRetryRecoveryId !== recovery.id) {
      return {
        ok: false,
        reason: 'provider-failure-response-retry-not-selected',
        decision: cloneJson(retryActuationDecision)
      };
    }
    const revisionId = compact(
      targetMetadata.responseRetryRevisionId
      || runtimeMetadata.responseRetryRevisionId
      || `${sourceResponseId}:retry:${recovery.id}`
    );
    let generated = null;
    let retryText = '';
    let swipe = null;
    if (selectedRetryRecoveryId === recovery.id) {
      retryText = target?.text || target?.mes || target?.content || target?.raw?.text || target?.raw?.mes || '';
      if (!compact(retryText)) {
        return {
          ok: false,
          reason: 'provider-failure-existing-retry-text-missing',
          decision: cloneJson(retryActuationDecision)
        };
      }
      const selectedRetryTextHash = hashStableJson({ text: retryText });
      if (priorRetry?.textHash && priorRetry.textHash !== selectedRetryTextHash) {
        return {
          ok: false,
          reason: 'provider-failure-response-retry-not-selected',
          decision: cloneJson(retryActuationDecision)
        };
      }
      swipe = {
        hostMessageId: targetHostMessageId,
        index: Number.isInteger(target.index) ? target.index : recentTargetIndex,
        swipeIndex: Number.isInteger(targetMetadata.selectedSwipeIndex) ? targetMetadata.selectedSwipeIndex : null,
        swipeCount: Number.isInteger(targetMetadata.swipeCount) ? targetMetadata.swipeCount : null,
        duplicate: true
      };
      generated = { source: 'existing-provider-failure-retry-swipe' };
    } else {
      generated = await generateDirectiveResponseSwipeText({
        state,
        target,
        priorPlayer,
        responseEntry,
        responseKind,
        revisionId,
        recentMessages: messages
      });
      retryText = prefixCampaignReplyHeader(generated.text, state);
      swipe = await host.chat.appendAssistantMessageSwipe({
        hostMessageId: targetHostMessageId,
        text: retryText,
        campaignId: state.campaign?.id || null,
        responseKind,
        extra: {
          runtimeMetadata: {
            ...withoutProvisionalDutyReportManifest(runtimeMetadata),
            responseRetry: true,
            responseRetryReason: 'provider-failure-after-mechanics-commit',
            responseRetryRecoveryId: recovery.id,
            responseRetryRevisionId: revisionId,
            responseRetrySource: generated.source,
            repairResponseRetryActuationDecision: cloneJson(retryActuationDecision)
          },
          directive: {
            responseKind,
            responseRetryRecoveryId: recovery.id,
            responseRetryReason: 'provider-failure-after-mechanics-commit',
            responseRetryRevisionId: revisionId,
            responseSwipeRevisionId: revisionId,
            selectedResponseRevisionId: revisionId,
            sourceResponseId
          }
        }
      });
    }
    const textHash = hashStableJson({ text: retryText });
    const eventTime = timestamp(now);
    let coreCompletion = null;
    try {
      if (ingress?.coreTransactionId && typeof coreTurnStore?.recordVisibleResponse === 'function') {
        coreCompletion = await coreTurnStore.recordVisibleResponse(ingress.coreTransactionId, {
          kind: responseKind,
          responseId: sourceResponseId,
          hostMessageId: swipe.hostMessageId || targetHostMessageId,
          outcomeId: recovery.outcomeId || null,
          postedAt: eventTime,
          generationStartedAt: eventTime,
          textHash,
          repairDecision: retryActuationDecision,
          idempotencyKey: `provider-failure-response-retry:${recovery.id}:${revisionId}`
        });
      }
    } catch (error) {
      const coreCompletionError = {
        code: error?.code || 'DIRECTIVE_CORE_PROVIDER_FAILURE_RETRY_CLOSURE_FAILED',
        message: error?.message || String(error)
      };
      let failed = updateDirectiveResponse(state, sourceResponseId, {
        hostMessageId: swipe.hostMessageId || targetHostMessageId,
        ingressId: responseEntry?.ingressId || recovery.ingressId || ingress?.id || null,
        outcomeId: responseEntry?.outcomeId || recovery.outcomeId || null,
        strategy: responseEntry?.strategy || 'directivePosted',
        responseKind,
        coreTransactionId: responseEntry?.coreTransactionId || ingress?.coreTransactionId || null,
        providerFallback: cloneJson(responseEntry?.providerFallback || null),
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        coreProjection: responseRetryCompatibilityProjection({
          coreResponseRecovery: details.coreRecovery || null,
          responseId: responseEntry?.coreProjection?.responseId || targetResponseId || sourceResponseId,
          recoveryId: recovery.id,
          status: 'coreClosureFailed'
        }),
        responseRetry: {
          kind: 'directive.responseRetry.v1',
          status: 'coreClosureFailed',
          recoveryId: recovery.id,
          reason: 'provider-failure-after-mechanics-commit',
          hostMessageId: swipe.hostMessageId || targetHostMessageId,
          swipeIndex: Number.isInteger(swipe.swipeIndex) ? swipe.swipeIndex : null,
          swipeCount: Number.isInteger(swipe.swipeCount) ? swipe.swipeCount : null,
          responseRevisionId: revisionId,
          textHash,
          coreCompletionError
        }
      }, {
        missingCoreWriteMode: 'reject'
      });
      await persistState(failed, `Recorded provider-failure response retry CORE closure failure for ${recovery.id}.`);
      return {
        ok: false,
        reason: 'core-response-retry-closure-failed',
        error: coreCompletionError,
        decision: cloneJson(retryActuationDecision),
        campaignState: cloneJson(failed)
      };
    }
    let next = updateDirectiveResponse(state, sourceResponseId, {
      status: 'posted',
      hostMessageId: swipe.hostMessageId || targetHostMessageId,
      ingressId: responseEntry?.ingressId || recovery.ingressId || ingress?.id || null,
      outcomeId: responseEntry?.outcomeId || recovery.outcomeId || null,
      strategy: responseEntry?.strategy || 'directivePosted',
      responseKind,
      coreTransactionId: responseEntry?.coreTransactionId || ingress?.coreTransactionId || null,
      providerFallback: cloneJson(responseEntry?.providerFallback || null),
      authority: 'compatibilityProjection',
      projectionSource: 'coreStoreV2',
      coreProjection: responseRetryCompatibilityProjection({
        coreResponseRecovery: details.coreRecovery || null,
        coreCompletion,
        responseId: responseEntry?.coreProjection?.responseId || targetResponseId || sourceResponseId,
        recoveryId: recovery.id,
        status: 'posted'
      }),
      responseRetry: {
        kind: 'directive.responseRetry.v1',
        status: 'complete',
        recoveryId: recovery.id,
        reason: 'directive-response-retry-posted',
        source: 'providerFailureAfterMechanicsCommit',
        hostMessageId: swipe.hostMessageId || targetHostMessageId,
        swipeIndex: Number.isInteger(swipe.swipeIndex) ? swipe.swipeIndex : null,
        swipeCount: Number.isInteger(swipe.swipeCount) ? swipe.swipeCount : null,
        responseRevisionId: revisionId,
        sourceResponseId,
        textHash,
        generationSource: generated.source,
        coreCompletion: coreCompletion ? {
          transactionId: coreCompletion.id || ingress?.coreTransactionId || null,
          phase: coreCompletion.phase || null,
          route: coreCompletion.route || null
        } : null
      }
    }, {
      missingCoreWriteMode: 'reject'
    });
    if (recovery.ingressId) {
      next = updateTurnIngress(next, recovery.ingressId, {
        status: recovery.outcomeId ? 'committed' : 'complete',
        responseMessageId: swipe.hostMessageId || targetHostMessageId,
        recoveryId: null,
        lastError: null,
        completedAt: eventTime
      }, {
        missingCoreWriteMode: 'reject'
      });
    }
    await persistState(next, `Retried provider-failed response for ${recovery.ingressId || recovery.outcomeId || recovery.id}.`);
    const synced = await syncPrompt(next);
    return {
      ok: true,
      responseStrategy: 'directiveSwipe',
      recoveryId: recovery.id,
      responseRevisionId: revisionId,
      response: {
        hostMessageId: swipe.hostMessageId || targetHostMessageId,
        index: Number.isInteger(swipe.index) ? swipe.index : null,
        swipeIndex: Number.isInteger(swipe.swipeIndex) ? swipe.swipeIndex : null,
        swipeCount: Number.isInteger(swipe.swipeCount) ? swipe.swipeCount : null,
        duplicate: swipe.duplicate === true
      },
      decision: cloneJson(retryActuationDecision),
      campaignState: cloneJson(synced)
    };
  }

  async function processMessage(message, chatId, activityReporter = null) {
    reportActivity(activityReporter, {
      phase: 'reading',
      mode: 'blocking',
      chatId
    });
    let state = activeBoundState(chatId);
    if (!state || !message?.text || message.isDirectiveOwned || message.directiveOwned) {
      return {
        handled: false,
        responseStrategy: 'injectAndContinue',
        abortDefaultGeneration: false,
        reason: 'inactive-unbound-or-owned'
      };
    }
    let ingressId = ingressIdFor(state, message, chatId);
    let existing = await findIngressFresh(state, ingressId);
    if (!existing) {
      const alias = await findIngressAlias(state, message, chatId, timestamp(now));
      if (alias) {
        ingressId = alias.id;
        existing = alias;
      }
    }
    const hostMessageId = messageHostMessageId(message);
    const observedTextHash = fnv1a(message.text || '');
    if (existing && hostMessageId && !existing.hostMessageId) {
      state = await updateIngressState(state, existing.id, {
        hostMessageId,
        canonicalizedAt: timestamp(now),
        canonicalizationReason: 'matched-host-message-id-after-idless-observation'
      }, `Canonicalized campaign-chat player message ${hostMessageId}.`);
      existing = await findIngressFresh(state, existing.id);
    }
    if (existing && !isRetryableIngressStatus(existing.status)) {
      return {
        handled: true,
        deduplicated: true,
        responseStrategy: existing.responseStrategy || 'injectAndContinue',
        abortDefaultGeneration: ['directivePosted', 'pause'].includes(existing.responseStrategy),
        decision: cloneJson(existing.classification),
        record: cloneJson(existing)
      };
    }
    let existingByHostMessage = await findIngressByHostMessageId(state, hostMessageId, chatId);
    if (
      existingByHostMessage
      && existingByHostMessage.id !== existing?.id
      && existingByHostMessage.textHash === observedTextHash
      && !(await ingressHasDependentResponse(state, existingByHostMessage))
    ) {
      ingressId = existingByHostMessage.id;
      existing = existingByHostMessage;
    }
    if (
      existingByHostMessage
      && existingByHostMessage.id !== existing?.id
      && await ingressHasDependentResponse(state, existingByHostMessage)
    ) {
      return dependentSourceRecoveryResult(state, existingByHostMessage, message, 'before-reobserve-dependent-source');
    }

    if (!existing && isHistoricalReplayObservation(message)) {
      const historicalIngress = await findHistoricalIngressByTextWithDependentResponse(state, message, chatId);
      if (historicalIngress) {
        return historicalIngressDeduplicatedResult(state, historicalIngress, message);
      }
    }

    const restartCandidate = existingByHostMessage && existingByHostMessage.id !== existing?.id
      ? existingByHostMessage
      : existing;
    const sourceRestart = await latestSourceRestartDecision(state, restartCandidate, message, 'before-latest-boundary-restart');
    if (sourceRestart) {
      ingressId = restartIngressIdFor(ingressId, sourceRestart.priorIngress, message);
      existing = await findIngressFresh(state, ingressId);
      existingByHostMessage = await findIngressByHostMessageId(state, hostMessageId, chatId);
      if (
        existingByHostMessage
        && existingByHostMessage.id !== sourceRestart.priorIngress.id
        && existingByHostMessage.textHash === observedTextHash
        && !(await ingressHasDependentResponse(state, existingByHostMessage))
      ) {
        ingressId = existingByHostMessage.id;
        existing = existingByHostMessage;
      }
    }

    state = await createIngress(state, message, chatId, ingressId, {
      sourceReobserveDecision: sourceRestart?.repairDecision || null,
      priorIngressForRecovery: sourceRestart?.priorIngress || null
    });
    state = await stateWithCorePendingProjections(state);
    markDebugStage('processMessage:ingressCreated', { ingressId, chatId });
    let decision = null;
    let stage = 'classification';
    try {
      stage = 'acceptedPairSettlement';
      const acceptedPairAuthority = acceptedPairSemanticAuthority(state);
      const acceptedPairSettlement = await runAcceptedPairSettlementSequence({
        campaignState: state,
        authority: acceptedPairAuthority,
        prepareV1: () => prepareV1AcceptedPair(
          state,
          message,
          chatId,
          ingressId,
          acceptedPairAuthority.runtimeAssets,
          activityReporter
        ),
        settleV1: ({ campaignState: preparedState, snapshot, hardBoundary }) => settleV1MissionAcceptedPairForState(
          preparedState,
          snapshot,
          hardBoundary,
          message,
          chatId,
          ingressId,
          acceptedPairAuthority.runtimeAssets,
          activityReporter
        )
      });
      state = acceptedPairSettlement.campaignState;
      stage = 'classification';
      reportActivity(activityReporter, {
        phase: 'classifying',
        mode: 'blocking',
        ingressId
      });
      markDebugStage('processMessage:classifying', { ingressId, chatId });
      const playerSafeProjection = createPlayerSafeCampaignProjection({ campaignState: state }) || {};
      const routingContext = {
        recentChat: displaySafeRecentChat(host.chat.getRecentMessages?.({ limit: 12, playerSafeOnly: true }) || []),
        recentTranscript: displaySafeRecentChat(host.chat.getRecentMessages?.({ limit: 12, playerSafeOnly: true }) || []),
        campaignId: state.campaign?.id,
        saveId: state.saveId || state.campaign?.saveId,
        chatId,
        currentMission: {
          activeMissionId: state.mission?.activeMissionId,
          activePhaseId: state.mission?.activePhaseId,
          knownFacts: playerSafeProjection?.mission?.knownFacts || [],
          formalObjectives: playerSafeProjection?.mission?.formalObjectives || [],
          activeDecisionPointCount: (
            state.mission?.activeDecisionPoints
            || state.mission?.availableDecisionPointIds
            || []
          ).length
        },
        activeMissionId: state.mission?.activeMissionId,
        activePhaseId: state.mission?.activePhaseId,
        knownFacts: playerSafeProjection?.mission?.knownFacts || [],
        formalObjectives: playerSafeProjection?.mission?.formalObjectives || [],
        activeDecisionPointCount: (
          state.mission?.activeDecisionPoints
          || state.mission?.availableDecisionPointIds
          || []
        ).length,
        commandAuthority: state.player?.authority || state.player?.billet,
        pendingInteraction: playerSafePendingInteraction(state),
        sourceClean: true,
        ordinaryDialogueLikely: true
      };
      if (typeof arbitrate === 'function') {
        const arbiterPlan = await arbitrate({
          message: {
            ...message,
            chatId,
            hostMessageId: messageHostMessageId(message)
          },
          context: routingContext
        });
        decision = arbiterPlanToDecision(arbiterPlan);
      } else {
        decision = await classify({
          text: message.text,
          context: routingContext
        });
      }
      const staleAfterClassify = await currentSourceStaleResult(ingressId, message, 'after-classify', state);
      if (staleAfterClassify) return staleAfterClassify;
      state = await updateIngressState(await stateForIngressCheck(ingressId, state), ingressId, {
        status: 'classified',
        classification: cloneJson(decision),
        workerPlan: cloneJson(decision.workerPlan),
        responseStrategy: decision.responseStrategy,
        ...(decision.arbiterPlan ? { arbiterPlan: cloneJson(decision.arbiterPlan) } : {}),
        classifiedAt: timestamp(now)
      }, `Utility pass classified ${decision.classification}.`);
      reportActivity(activityReporter, {
        phase: 'classified',
        mode: 'blocking',
        classification: decision.classification,
        responseStrategy: decision.responseStrategy,
        ingressId
      });
      markDebugStage('processMessage:classified', {
        ingressId,
        chatId,
        classification: decision.classification,
        responseStrategy: decision.responseStrategy
      });

      stage = 'continuation';
      reportActivity(activityReporter, {
        phase: 'routing',
        mode: 'blocking',
        classification: decision.classification,
        responseStrategy: decision.responseStrategy,
        ingressId
      });
      return await continueClassifiedTurn(state, ingressId, decision, message, activityReporter);
    } catch (error) {
      reportActivity(activityReporter, {
        phase: 'recovery',
        mode: 'review',
        classification: decision?.classification || null,
        ingressId,
        label: 'Directive needs review before this turn is fully settled.'
      });
      const failed = await recordTurnProcessingFailure(await stateForIngressCheck(ingressId, state), ingressId, message, error, stage, decision);
      markDebugStage('processMessage:recovery', {
        ingressId,
        chatId,
        stage,
        errorCode: error?.code || null
      });
      const failureIngress = ingressId ? await findIngressFresh(failed, ingressId) : null;
      const visibleResponseRecorded = Boolean(failureIngress?.responseMessageId || failureIngress?.responseId);
      const originalStrategy = decision?.responseStrategy || 'injectAndContinue';
      return {
        handled: true,
        recoveryRequired: true,
        responseStrategy: visibleResponseRecorded ? originalStrategy : 'injectAndContinue',
        abortDefaultGeneration: visibleResponseRecorded && ['directivePosted', 'pause'].includes(originalStrategy),
        decision: decision ? cloneJson(decision) : null,
        error: {
          code: error?.code || 'DIRECTIVE_CHAT_TURN_PROCESSING_FAILED',
          message: error?.message || String(error)
        },
        campaignState: cloneJson(failed)
      };
    }
  }

  function observePlayerMessage(payload = {}) {
    const chatId = payload.chatId || currentChatId();
    const state = activeBoundState(chatId);
    if (!state) {
      return Promise.resolve({
        handled: false,
        responseStrategy: 'injectAndContinue',
        abortDefaultGeneration: false,
        reason: 'inactive-or-unbound'
      });
    }
    const message = normalizeMessage(host, payload, payload.chat);
    if (!message?.text || message.isUser === false) {
      return Promise.resolve({
        handled: false,
        responseStrategy: 'injectAndContinue',
        abortDefaultGeneration: false,
        reason: 'no-player-message'
      });
    }
    const key = ingressIdFor(state, message, chatId);
    const textKey = ingressTextKeyFor(state, message, chatId);
    const activityReporter = typeof payload.turnActivityReporter === 'function' ? payload.turnActivityReporter : null;
    if (inFlight.has(key)) return inFlight.get(key);
    if (inFlight.has(textKey)) {
      const existingPromise = inFlight.get(textKey);
      const hostMessageId = messageHostMessageId(message);
      if (!hostMessageId) return existingPromise;
      return existingPromise.then(async (result) => {
        const latest = activeBoundState(chatId) || getCampaignState();
        const alias = latest ? await findIngressAlias(latest, message, chatId, timestamp(now)) : null;
        if (!alias || alias.hostMessageId) return result;
        const next = await updateIngressState(latest, alias.id, {
          hostMessageId,
          canonicalizedAt: timestamp(now),
          canonicalizationReason: 'joined-in-flight-idless-observation'
        }, `Canonicalized campaign-chat player message ${hostMessageId}.`);
        const record = await findIngressFresh(next, alias.id);
        return {
          ...result,
          record: cloneJson(record || result.record || null),
          campaignState: cloneJson(next)
        };
      });
    }
    const promise = enqueue(state.campaign?.id || 'campaign', () => processMessage(message, chatId, activityReporter))
      .finally(() => {
        inFlight.delete(key);
        inFlight.delete(textKey);
      });
    inFlight.set(key, promise);
    inFlight.set(textKey, promise);
    return promise;
  }

  async function interceptGeneration({ chat, abort, type } = {}) {
    if (isQuietGeneration(type)) return { handled: false, reason: 'quiet-generation' };
    if (isSwipeGeneration(type)) {
      const directiveSwipe = await enqueue(
        activeBoundState()?.campaign?.id || 'campaign',
        () => handleDirectiveResponseSwipe({ abort })
      );
      if (directiveSwipe.handled) return directiveSwipe;
    }
    if (isDirectiveOwnedGeneration() && !Array.isArray(chat)) return { handled: false, reason: 'directive-owned-generation' };
    const state = activeBoundState();
    if (!state) return { handled: false, reason: 'inactive-or-unbound' };
    const message = normalizeMessage(host, null, chat);
    if (!message?.text) return { handled: false, reason: 'no-player-message' };
    // Reuse the authoritative normalized message identity. Re-normalizing a cloned
    // raw message can lose the host adapter's index-based message id and defeat ingress
    // deduplication between MESSAGE_SENT and the generation interceptor.
    const outcome = await observePlayerMessage({
      ...message,
      chatId: message.chatId || currentChatId()
    });
    if (outcome.abortDefaultGeneration && typeof abort === 'function') abort(true);
    return {
      ...outcome,
      preemptedHostGeneration: false,
      abortedHostGeneration: outcome.abortDefaultGeneration === true
    };
  }

  async function handleChatChanged() {
    const state = getCampaignState();
    if (!state?.campaignChatBinding) {
      const result = typeof clearDirectivePrompt === 'function'
        ? await clearDirectivePrompt({ reason: 'no-active-campaign' })
        : await host.prompt?.clear?.({ reason: 'no-active-campaign' });
      return { active: false, promptClear: cloneJson(result || null) };
    }
    const active = String(currentChatId() || '') === String(state.campaignChatBinding.chatId || '');
    if (active) {
      const next = await syncPrompt(initializeCampaignRuntimeTracking(state), 'Prompt context rebuilt after chat change.');
      return { active: true, campaignState: cloneJson(next) };
    }
    const result = typeof suspendDirectivePrompt === 'function'
      ? await suspendDirectivePrompt({ reason: 'unbound-chat' })
      : await host.prompt?.clear?.({ reason: 'unbound-chat', preservePacket: true });
    return { active: false, suspended: true, promptSuspension: cloneJson(result || null) };
  }

  return {
    observePlayerMessage,
    interceptGeneration,
    handleChatChanged,
    resolveInteraction,
    retryCommittedResponse,
    pendingCount: () => inFlight.size,
    debugSnapshot: () => ({
      revision: CHAT_TURN_ORCHESTRATOR_DEBUG_REVISION,
      stage: debugState.stage,
      updatedAt: debugState.updatedAt,
      details: cloneJson(debugState.details),
      inFlightKeys: [...inFlight.keys()],
      queueKeys: [...queues.keys()]
    })
  };
}

export const __chatTurnOrchestratorTestHooks = Object.freeze({
  CHAT_TURN_ORCHESTRATOR_DEBUG_REVISION,
  promptRevisionOf,
  preferPromptAdvancedIngressState,
  fnv1a,
  isQuietGeneration,
  localOutcomeNarration,
  warningText,
});
