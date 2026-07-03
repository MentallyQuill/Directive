import { isDirectiveOwnedGeneration } from '../hosts/sillytavern/generation-client.mjs';
import {
  initializeCampaignRuntimeTracking,
  recordPendingInteraction,
  resolveRecoveryEvent,
  resolvePendingInteraction,
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
import { timeAdvanceBoundary } from '../directors/director-coordinator.mjs';
import {
  compactOpenWorldReducerBundleRef
} from '../directors/open-world-event-reducers.mjs';
import {
  adjudicateTimeAdvance,
  findTimeBoundaryForPlayerMessage
} from '../time/time-advance-adjudicator.mjs';
import {
  attachReadiedCommandBearingPoint,
  returnReadiedCommandBearingPoint
} from '../command/command-bearing.mjs';
import { validateCommandBearingReadiedSpendFit } from '../command/command-bearing-fit.mjs';
import {
  createLatestPairSourceSettlementProvider,
  settleLatestPairSource
} from './source-settlement-latest-pair.mjs';
import {
  createTurnSourceFrame,
  createTurnSourceFrameRef
} from './frame-contracts.mjs';
import {
  hashStableJson,
  normalizeHostMessageVisibility
} from './architecture-redesign-contracts.mjs';
import { createRepairCommandBoundary } from './repair-command-boundary.mjs';
import { createSourceSettlementService } from './source-settlement-service.mjs';
import {
  createRuntimeLedgerView,
  createRuntimeLedgerViewAsync
} from './runtime-ledger-view.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
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

const TIME_BOUNDARY_DOMAINS = Object.freeze([
  'campaign',
  'worldState',
  'timeLedger',
  'eventLedger',
  'storyArcLedger',
  'questLedger',
  'dynamicQuestCatalog',
  'attentionState',
  'mission',
  'threadLedger',
  'runtimeTracking'
]);

function isRetryableIngressStatus(status) {
  return RETRYABLE_INGRESS_STATUSES.has(String(status || ''));
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

function compactPostCommitConversationError(error = null, fallbackCode = 'DIRECTIVE_POST_COMMIT_CONVERSATION_FAILED') {
  const rawMessage = compact(error?.message || error || '');
  const message = rawMessage.slice(0, 900);
  return compactObject({
    code: compact(error?.code) || fallbackCode,
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
      visibility: cloneJson(payload.visibility || null),
      metadata: cloneJson(payload.metadata || null),
      raw: cloneJson(payload.raw || null)
    };
  }
  if (payload?.message && typeof payload.message === 'object') {
    return host.chat.normalizeMessagePayload?.(payload) || null;
  }
  if (payload && typeof payload === 'object' && (
    payload.mes !== undefined
    || payload.content !== undefined
    || payload.is_user !== undefined
    || payload.role !== undefined
  )) {
    return host.chat.normalizeMessagePayload?.(payload) || null;
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

function localRoutineNarration() {
  return 'The order is acknowledged and folded into the working rhythm. The relevant officers carry it forward while the log records the procedure.';
}

const LOCATION_TRANSITION_DEFAULT_MINUTES = 2;

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

const TERMINAL_OUTCOME_ACTION_LABELS = Object.freeze({
  replayFromCheckpoint: 'Replay from checkpoint',
  pushOn: 'Push On',
  keepEnding: 'Keep this ending',
  saveTerminalBranch: 'Save as branch'
});

const DEFAULT_TERMINAL_OUTCOME_ACTIONS = Object.freeze([
  'replayFromCheckpoint',
  'pushOn',
  'keepEnding',
  'saveTerminalBranch'
]);

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

function commandBearingText(preview) {
  const prompt = preview?.commandBearingPrompt || {};
  const actions = (prompt.actions || [])
    .filter((action) => action.track)
    .map((action) => `${action.label || action.track}: ${action.from ?? '?'} to ${action.to ?? '?'}`);
  return [
    'This is an eligible Command Bearing moment. The outcome is ready, but narration has not finalized.',
    actions.length ? `Available interventions: ${actions.join('; ')}.` : '',
    'Accept the outcome or choose an intervention in Directive.'
  ].filter(Boolean).join(' ');
}

function commandBearingRoot(state) {
  return state?.commandBearing || {};
}

function activeReadiedCommandBearing(state, chatId = '') {
  const readied = commandBearingRoot(state)?.readied || null;
  if (!readied || readied.status !== 'readied') return null;
  const expectedChatId = compact(readied.chatId);
  const actualChatId = compact(chatId);
  if (expectedChatId && actualChatId && expectedChatId !== actualChatId) return null;
  return readied;
}

function commandBearingActionForTrack(preview, track) {
  const key = compact(track).toLowerCase();
  return (preview?.commandBearingPrompt?.actions || []).find((action) => (
    compact(action?.track).toLowerCase() === key
  )) || null;
}

function commandBearingValidationContext({ state, preview, action, decision }) {
  const safe = createPlayerSafeCampaignProjection({ campaignState: state }) || {};
  return {
    player: safe.player || null,
    mission: safe.mission || null,
    ship: safe.ship || null,
    commandBearingAction: {
      track: action?.track || null,
      from: action?.from || null,
      to: action?.to || null,
      rationale: action?.rationale || ''
    },
    outcome: {
      outcomeId: preview?.turnPacket?.outcomePacket?.id || null,
      resultBand: preview?.turnPacket?.outcomePacket?.resultBand || preview?.provisionalOutcome?.resultBand || null,
      summary: preview?.turnPacket?.outcomePacket?.summary || preview?.provisionalOutcome?.summary || ''
    },
    turnClassification: {
      classification: decision?.classification || null,
      responseStrategy: decision?.responseStrategy || null,
      workerPlan: decision?.workerPlan || {}
    }
  };
}

function readiedSpendRequest({ readied, action, ingressId, message, chatId, fitValidation = null }) {
  const label = readied.track === 'inspiration' ? 'Inspiration' : 'Resolve';
  const rationale = compact(action?.rationale || `${label} was eligible for this committed action.`);
  const hostMessageId = compact(message?.hostMessageId || message?.id || String(message?.index ?? ''));
  const causalBasis = Array.isArray(fitValidation?.causalBasis) && fitValidation.causalBasis.length
    ? fitValidation.causalBasis
    : [fitValidation?.summary || rationale];
  return {
    ...cloneJson(readied),
    status: 'attached',
    track: readied.track,
    ingressId,
    hostMessageId,
    chatId: compact(chatId || readied.chatId || message.chatId || ''),
    rationale,
    fit: fitValidation?.fit || 'strong',
    causalBasis
  };
}

function advisoryPrompt(state, playerText, decision = {}) {
  const safe = createPlayerSafeCampaignProjection({ campaignState: state }) || {};
  const crewIds = (state?.crew?.seniorCrewIds || []).filter(Boolean);
  return [
    'Create a player-safe advisory record for Directive UI surfaces, not a chat response.',
    'Do not write narration, dialogue, officer speech, Markdown, headings, or in-character prose.',
    'Do not answer as the Captain, narrator, Mission Director, or any other character.',
    'Use only player-visible facts. Do not expose hidden values or Director-only facts.',
    'If useful, name involved crew by id from knownCrewIds. Leave crewNotes empty when no specific officer is implicated.',
    'Return one compact JSON object only with this shape:',
    '{"kind":"directive.playerSafeAdvisory","subject":"","missionBrief":"","logSummary":"","involvedCrewIds":[],"crewNotes":[{"crewId":"","summary":""}],"considerations":[],"options":[]}',
    '',
    `Player request: ${playerText}`,
    `Turn classification: ${JSON.stringify({
      classification: decision?.classification || 'counselRequest',
      domainSignals: decision?.domainSignals || [],
      workerPlan: decision?.workerPlan || {}
    })}`,
    `Known crew ids: ${JSON.stringify(crewIds)}`,
    `Player-safe campaign context: ${JSON.stringify({ mission: safe.mission, ship: safe.ship, crew: safe.crew, pressures: safe.pressures, directives: safe.directives })}`
  ].join('\n');
}

function normalizeGeneratedBlock(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function parseJsonObjectText(value) {
  const input = normalizeGeneratedBlock(value)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!input.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeText(value, maxLength = 280) {
  const text = compact(typeof value === 'string'
    ? value
    : value?.summary || value?.label || value?.title || value?.text || value?.id);
  if (!text) return '';
  const legacyReportLabels = [
    ['Confirmed', 'Facts'],
    ['Uncertainty'],
    ['Likely', 'Consequences'],
    ['Viable', 'Options']
  ].map((parts) => parts.join('\\s+')).join('|');
  const legacyReportLabelPattern = new RegExp(`\\b(?:${legacyReportLabels})\\s*:\\s*`, 'gi');
  const stripped = text
    .replace(/\*\*/g, '')
    .replace(legacyReportLabelPattern, '')
    .trim();
  return stripped.length <= maxLength ? stripped : `${stripped.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function safeTextList(value, limit = 4) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  const seen = new Set();
  const output = [];
  for (const item of values) {
    const text = safeText(item, 220);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
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

function inferAdvisorySubject(playerText = '') {
  const lower = compact(playerText).toLowerCase();
  if (/(?:starfleet|protocol|procedure|policy|classified|need-to-know|orders?)/i.test(lower)) return 'Procedure and disclosure advisory';
  if (/(?:option|recommend|advise|assessment|read|what would you do)/i.test(lower)) return 'Decision support advisory';
  if (/(?:risk|danger|casualt|injur|medical|safety)/i.test(lower)) return 'Risk advisory';
  return 'Command advisory';
}

function fallbackAdvisoryRecord({ state, ingressId, message, nowValue }) {
  const playerText = compact(message?.text || '');
  const subject = inferAdvisorySubject(playerText);
  const involvedCrewIds = inferCrewIdsFromText(state, playerText);
  const logSummary = `Advisory requested: ${safeText(playerText, 220) || subject}.`;
  return {
    id: `advisory:${ingressId}`,
    type: 'advisoryNote',
    source: 'chatCounsel',
    sourceIngressId: ingressId,
    sourceMessageId: compact(message?.hostMessageId || message?.id || String(message?.index ?? '')),
    activeMissionId: state?.mission?.activeMissionId || null,
    activePhaseId: state?.mission?.activePhaseId || state?.mission?.phase || null,
    createdAt: nowValue,
    subject,
    missionBrief: 'Directive recorded this as player-safe decision support; no campaign outcome was committed.',
    logSummary,
    involvedCrewIds,
    crewNotes: involvedCrewIds.map((crewId) => ({
      crewId,
      summary: 'This advisory request involves the officer as current command context.'
    })),
    considerations: [],
    options: [],
    playerVisible: true
  };
}

function normalizeCrewNotes(state, notes = [], playerText = '') {
  const validIds = new Set(campaignCrewIds(state));
  const output = [];
  for (const note of Array.isArray(notes) ? notes : []) {
    const crewId = compact(note?.crewId || note?.id);
    if (!crewId || (validIds.size && !validIds.has(crewId))) continue;
    const summary = safeText(note?.summary || note?.note || note?.text, 220);
    if (!summary) continue;
    output.push({ crewId, summary });
  }
  const existing = new Set(output.map((note) => note.crewId));
  for (const crewId of inferCrewIdsFromText(state, playerText)) {
    if (!existing.has(crewId)) {
      output.push({
        crewId,
        summary: 'This advisory request involves the officer as current command context.'
      });
    }
  }
  return output.slice(0, 6);
}

function normalizeAdvisoryRecord(value, { state, ingressId, message, nowValue }) {
  const fallback = fallbackAdvisoryRecord({ state, ingressId, message, nowValue });
  const parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!parsed) return fallback;
  const subject = safeText(parsed.subject || parsed.title, 96) || fallback.subject;
  const missionBrief = safeText(parsed.missionBrief || parsed.summary || parsed.brief, 260) || fallback.missionBrief;
  const logSummary = safeText(parsed.logSummary || parsed.record || parsed.summary, 260) || fallback.logSummary;
  const crewNotes = normalizeCrewNotes(state, parsed.crewNotes, message?.text || '');
  const involvedCrewIds = [...new Set([
    ...safeTextList(parsed.involvedCrewIds, 8),
    ...crewNotes.map((note) => note.crewId),
    ...fallback.involvedCrewIds
  ])].filter((id) => !campaignCrewIds(state).length || campaignCrewIds(state).includes(id)).slice(0, 8);
  return {
    ...fallback,
    subject,
    missionBrief,
    logSummary,
    involvedCrewIds,
    crewNotes,
    considerations: safeTextList(parsed.considerations || parsed.context || parsed.notes, 4),
    options: safeTextList(parsed.options || parsed.nextSteps || parsed.paths, 4)
  };
}

export function createChatTurnOrchestrator({
  host,
  classify,
  generationRouter = null,
  responseDispatcher,
  turnCommitCoordinator = null,
  sidecarScheduler = null,
  forgeCoordinator = null,
  messageReconciler = null,
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
  postTerminalOutcomeCheckpoint = null,
  resolveTerminalOutcomeDecision = null,
  recordTerminalCheckpointSettlement = null,
  discardProvisionalDirectorTurn = null,
  scheduleCommandLogSummaryForCommittedTurn = null,
  schedulePostCommitConversationProcessor = null,
  scheduleAdvisoryEnrichmentProcessor = null,
  postCommitConversationProcessor = null,
  runLatestPairSettlementProvider = null,
  validateLatestPairSettlementBeforeApply = null,
  rewriteCampaignIntro = null,
  clearDirectivePrompt = null,
  suspendDirectivePrompt = null,
  reportTurnActivity = null,
  now = null
} = {}) {
  if (!host?.chat) throw new Error('ChatTurnOrchestrator requires host.chat.');
  if (typeof classify !== 'function') throw new Error('ChatTurnOrchestrator requires classify().');
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
  const repair = repairRuntime || createRepairCommandBoundary({ coreTurnStore, now });
  const sourceSettlement = createSourceSettlementService({
    coreStore: coreTurnStore,
    clock: () => timestamp(now)
  });
  const defaultLatestPairSettlementProvider = typeof runLatestPairSettlementProvider === 'function'
    ? runLatestPairSettlementProvider
    : (typeof generationRouter?.generate === 'function'
      ? createLatestPairSourceSettlementProvider({ generationRouter, now })
      : null);

  function currentChatId() {
    return host.chat.getCurrentChatId?.() || host.chat.getCurrentBinding?.()?.chatId || null;
  }

  function currentChatBinding() {
    return host.chat.getCurrentBinding?.() || host.chat.getCurrentChatIdentity?.() || null;
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
      activityContext: {
        classification: activityContext.classification || null,
        ingressId: activityContext.ingressId || null,
        turnId: activityContext.turnId || null,
        outcomeId: activityContext.outcomeId || null,
        source: activityContext.source || null
      }
    });
    if (next && next !== state) {
      await persistState(next, summary);
      return next;
    }
    return getCampaignState() || state;
  }

  async function preflightSceneHandshakeSource(state, message, chatId, ingressId, activityReporter = null) {
    const tracked = initializeCampaignRuntimeTracking(state);
    const ingress = findIngress(tracked, ingressId);
    const sourceFrame = ingress?.sourceFrame || null;
    const transactionId = ingress?.coreTransactionId || null;
    if (!sourceFrame || !transactionId) return null;
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
      const decision = await sourceSettlement.preflightLatestPair({
        transactionId,
        sourceFrame,
        expected,
        idempotencyKey: `sre:scene-handshake-preflight:${transactionId}:${sourceFrame.sourceHash || sourceFrame.id}`,
        reasons: ['scene-handshake-diagnostic-preflight'],
        observedAt: timestamp(now)
      });
      reportActivity(activityReporter, {
        phase: 'sreSceneHandshakePreflight',
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
        phase: 'sreSceneHandshakePreflightFailed',
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
      return null;
    }
  }

  async function settleSceneHandshake(state, message, chatId, ingressId, activityReporter = null) {
    const recentMessages = host.chat.getRecentMessages?.({ limit: 12, playerSafeOnly: false }) || [];
    const tracked = initializeCampaignRuntimeTracking(state);
    const ingress = findIngress(tracked, ingressId);
    let packageData = null;
    try {
      packageData = typeof getPackageData === 'function' ? getPackageData() : null;
    } catch {
      packageData = null;
    }
    reportActivity(activityReporter, {
      phase: 'settlingSceneHandshake',
      mode: 'blocking',
      source: 'sceneHandshake',
      ingressId
    });
    const sourcePreflight = await preflightSceneHandshakeSource(state, message, chatId, ingressId, activityReporter);
    if (sourcePreflight && sourcePreflight.status !== 'preflightClean') {
      reportActivity(activityReporter, {
        phase: 'sceneHandshakeSourceBlocked',
        mode: 'blocking',
        source: 'sre',
        ingressId,
        status: sourcePreflight.status || null,
        reasons: cloneJson(sourcePreflight.reasons || []),
        providerCalled: sourcePreflight.providerCalled === true,
        applied: sourcePreflight.applied === true
      });
      return state;
    }
    let result = null;
    try {
      result = await settleLatestPairSource({
        campaignState: state,
        currentPlayerMessage: message,
        recentMessages,
        chatId,
        ingressId,
        generationRouter,
        stateDeltaGateway,
        runLatestPairSettlementProvider: defaultLatestPairSettlementProvider,
        validateLatestPairSettlementBeforeApply: async (payload = {}) => {
          const latestState = initializeCampaignRuntimeTracking(getCampaignState() || state);
          const latestIngress = findIngress(latestState, ingressId);
          const expectedFrameId = payload.sourceFrame?.id || ingress?.sourceFrame?.id || null;
          const currentFrameId = latestIngress?.sourceFrame?.id || null;
          if (expectedFrameId && currentFrameId && expectedFrameId !== currentFrameId) {
            return { ok: false, reasons: ['scene-handshake-source-frame-stale'] };
          }
          if (typeof validateLatestPairSettlementBeforeApply === 'function') {
            return validateLatestPairSettlementBeforeApply({
              ...payload,
              ingress: cloneJson(latestIngress || null),
              currentCampaignState: latestState
            });
          }
          return { ok: true };
        },
        latestPairSourceFrame: ingress?.sourceFrame || null,
        packageData,
        coreStore: coreTurnStore,
        now
      });
    } catch (error) {
      reportActivity(activityReporter, {
        phase: 'sceneHandshakeDeferred',
        mode: 'diagnostic',
        source: 'sre',
        ingressId,
        transactionId: ingress?.coreTransactionId || null,
        sourceFrameId: ingress?.sourceFrame?.id || null,
        reasons: ['source-settlement-provider-failed-deferred'],
        error: {
          code: error?.code || null,
          message: error?.message || String(error)
        }
      });
      return state;
    }
    let next = result?.campaignState || state;
    if (!result?.attempted && !result?.deduplicated) return next;
    reportActivity(activityReporter, {
      phase: 'sceneHandshakeSettled',
      mode: 'blocking',
      source: 'sceneHandshake',
      ingressId,
      disposition: result.disposition || result.record?.disposition || null,
      reasons: cloneJson(result.sourceSettlement?.reasons || result.record?.reasons || []),
      committedRoots: result.committedRoots || result.record?.committedRoots || [],
      operationCount: result.operationCount || result.record?.operationCount || 0
    });
    if (result.promptDirty) {
      reportActivity(activityReporter, {
        phase: 'syncingPrompt',
        mode: 'blocking',
        ingressId,
        source: 'sceneHandshake'
      });
      next = await syncPrompt(
        next,
        'Prompt context synchronized after Scene Handshake settlement.',
        promptFrameForMessage(next, message, { classification: 'sceneHandshake' }, {
          acceptedAssistantVariant: cloneJson(result.selectedAssistantVariant || result.record?.selectedAssistantVariant || null)
        }),
        activityReporter,
        {
          source: 'sceneHandshake',
          classification: 'sceneHandshake',
          ingressId
        }
      );
    }
    return next;
  }

  function packageDataForTimeBoundary() {
    try {
      return typeof getPackageData === 'function' ? getPackageData() : null;
    } catch {
      return null;
    }
  }

  async function commitAdjudicatedTimeBoundary(state, {
    ingressId = null,
    turnId = null,
    outcomeId = null,
    playerMessage = null,
    previousAssistantText = '',
    outcomeText = '',
    sourceKind = 'runtimeTurn',
    reason = 'Runtime time boundary adjudicated.'
  } = {}, activityReporter = null) {
    const packageData = packageDataForTimeBoundary();
    if (!state || !packageData?.world || !stateDeltaGateway?.commit) return state;
    const currentPlayerHostMessageId = playerMessage?.hostMessageId || playerMessage?.id || null;
    const existingBoundary = findTimeBoundaryForPlayerMessage(state, currentPlayerHostMessageId);
    if (existingBoundary) {
      reportActivity(activityReporter, {
        phase: 'timeBoundaryAlreadyCommitted',
        mode: 'blocking',
        source: sourceKind,
        ingressId,
        turnId,
        outcomeId,
        currentPlayerHostMessageId,
        existingSource: existingBoundary.sourceAnchorRange?.kind || null,
        elapsedMinutes: existingBoundary.elapsedMinutes || 0
      });
      return state;
    }
    const sourceAnchorRange = {
      kind: sourceKind,
      ingressId,
      turnId,
      outcomeId,
      currentPlayerHostMessageId,
      rangeHash: fnv1a([
        sourceKind,
        ingressId,
        turnId,
        outcomeId,
        currentPlayerHostMessageId || '',
        playerMessage?.text || '',
        previousAssistantText || '',
        outcomeText || ''
      ].join('\n'))
    };
    const proposal = await adjudicateTimeAdvance({
      campaignState: state,
      packageData,
      generationRouter,
      acceptedPreviousResponse: true,
      previousAssistantText,
      currentPlayerText: playerMessage?.text || '',
      outcomeText,
      currentPlayerHostMessageId: playerMessage?.hostMessageId || playerMessage?.id || null,
      outcomeHostMessageId: outcomeId,
      sourceAnchorRange
    });
    if (!proposal?.elapsedMinutes || proposal.elapsedMinutes <= 0) return state;
    reportActivity(activityReporter, {
      phase: 'committingTimeBoundary',
      mode: 'blocking',
      source: sourceKind,
      ingressId,
      turnId,
      outcomeId,
      elapsedMinutes: proposal.elapsedMinutes,
      reason: proposal.reason
    });
    const boundary = timeAdvanceBoundary({
      state,
      packageData,
      minutes: proposal.elapsedMinutes,
      reason: proposal.reason || 'runtime-time-advance',
      sourceAnchorRange,
      adjudication: {
        ...proposal,
        runtimePath: sourceKind
      },
      now
    });
    const committed = await stateDeltaGateway.commit(boundary.state, {
      id: `${sourceKind}:${ingressId || turnId || outcomeId || 'turn'}:time`,
      source: 'timeAdvanceAdjudicator',
      reason,
      summary: `Advanced campaign time by ${proposal.elapsedMinutes} minutes.`,
      domains: TIME_BOUNDARY_DOMAINS,
      ingressId,
      turnId,
      outcomeId,
      sourceAnchorRange,
      stable: true,
      metadata: {
        timeAdvance: cloneJson(proposal),
        boundaryEventId: boundary.event?.id || null
      }
    });
    setCampaignState(committed);
    return committed;
  }

  async function commitDefaultLocationTransitionBoundary(state, {
    ingressId = null,
    playerMessage = null,
    outcomeText = ''
  } = {}, activityReporter = null) {
    const packageData = packageDataForTimeBoundary();
    if (!state || !packageData?.world || !stateDeltaGateway?.commit) return state;
    const currentPlayerHostMessageId = playerMessage?.hostMessageId || playerMessage?.id || null;
    const existingBoundary = findTimeBoundaryForPlayerMessage(state, currentPlayerHostMessageId);
    if (existingBoundary) {
      reportActivity(activityReporter, {
        phase: 'timeBoundaryAlreadyCommitted',
        mode: 'blocking',
        source: 'locationTransition',
        ingressId,
        currentPlayerHostMessageId,
        existingSource: existingBoundary.sourceAnchorRange?.kind || null,
        elapsedMinutes: existingBoundary.elapsedMinutes || 0
      });
      return state;
    }
    const sourceAnchorRange = {
      kind: 'locationTransition',
      ingressId,
      currentPlayerHostMessageId,
      rangeHash: fnv1a([
        'locationTransition',
        ingressId,
        currentPlayerHostMessageId || '',
        playerMessage?.text || '',
        outcomeText || ''
      ].join('\n'))
    };
    reportActivity(activityReporter, {
      phase: 'committingTimeBoundary',
      mode: 'blocking',
      source: 'locationTransition',
      ingressId,
      elapsedMinutes: LOCATION_TRANSITION_DEFAULT_MINUTES,
      reason: 'Physical location transition consumes scene time.'
    });
    const boundary = timeAdvanceBoundary({
      state,
      packageData,
      minutes: LOCATION_TRANSITION_DEFAULT_MINUTES,
      reason: 'physical-location-transition',
      sourceAnchorRange,
      adjudication: {
        elapsedMinutes: LOCATION_TRANSITION_DEFAULT_MINUTES,
        reason: 'Physical location transition consumes scene time.',
        runtimePath: 'locationTransition',
        defaulted: true
      },
      now
    });
    const committed = await stateDeltaGateway.commit(boundary.state, {
      id: `locationTransition:${ingressId || currentPlayerHostMessageId || 'turn'}:time`,
      source: 'locationTransitionPacing',
      reason: 'Recorded default scene time for a physical location transition.',
      summary: `Advanced campaign time by ${LOCATION_TRANSITION_DEFAULT_MINUTES} minutes for location transition pacing.`,
      domains: TIME_BOUNDARY_DOMAINS,
      ingressId,
      sourceAnchorRange,
      stable: true,
      metadata: {
        timeAdvance: {
          elapsedMinutes: LOCATION_TRANSITION_DEFAULT_MINUTES,
          reason: 'Physical location transition consumes scene time.',
          runtimePath: 'locationTransition',
          defaulted: true
        },
        boundaryEventId: boundary.event?.id || null
      }
    });
    setCampaignState(committed);
    return committed;
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

  function scheduleTurnSidecars(decision, turnContext = {}, activityReporter = null) {
    if (!sidecarScheduler?.schedule) return null;
    return sidecarScheduler.schedule({
      workerPlan: decision?.workerPlan || {},
      turnContext,
      activityReporter: typeof activityReporter === 'function'
        ? (event) => reportActivity(activityReporter, event)
        : null
    });
  }

  function scenePhaseSealPayloadForCommittedTurn({
    state,
    ingressId,
    decision = {},
    committed = {},
    turnId = null,
    outcomeId = null,
    playerMessage = null,
    assistantMessageId = null,
    assistantText = ''
  } = {}) {
    const tracked = initializeCampaignRuntimeTracking(state || getCampaignState());
    const ingress = findIngress(tracked, ingressId);
    const transactionId = compact(ingress?.coreTransactionId || '');
    const sourceFrame = ingress?.sourceFrame || null;
    const sourceFrameRef = createTurnSourceFrameRef(sourceFrame || {
      id: ingress?.sourceFrameId || null,
      campaignId: tracked?.campaign?.id || tracked?.campaignChatBinding?.campaignId || null,
      saveId: tracked?.campaignChatBinding?.saveId || null,
      chatId: ingress?.chatId || tracked?.campaignChatBinding?.chatId || null,
      hostMessageId: ingress?.hostMessageId || null,
      textHash: ingress?.textHash || null
    });
    if (!transactionId || !sourceFrameRef || !outcomeId) return null;

    const turnPacket = committed?.turnPacket || {};
    const missionDelta = turnPacket.stateDelta?.mission || turnPacket.missionDelta || {};
    const phaseAdvance = missionDelta.phaseAdvance || null;
    const graphTransition = missionDelta.graphTransition || null;
    const sceneSnapshot = turnPacket.sceneSnapshot || turnPacket.scene || {};
    const hasSealSignal = Boolean(
      phaseAdvance
      || graphTransition
      || sceneSnapshot.sceneId
      || sceneSnapshot.activePhaseId
      || sceneSnapshot.phaseId
      || sceneSnapshot.locationId
      || sceneSnapshot.currentLocationId
    );
    if (!hasSealSignal) return null;

    const attentionScene = tracked?.attentionState?.scene || {};
    const phaseId = compact(
      phaseAdvance?.to
      || graphTransition?.to
      || sceneSnapshot.activePhaseId
      || sceneSnapshot.phaseId
      || tracked?.mission?.activePhaseId
      || tracked?.mission?.phase
      || attentionScene.phaseId
    );
    const locationId = compact(
      sceneSnapshot.locationId
      || sceneSnapshot.currentLocationId
      || attentionScene.locationId
      || tracked?.worldState?.currentLocationId
    );
    const sceneId = compact(
      sceneSnapshot.sceneId
      || sceneSnapshot.id
      || attentionScene.sceneId
      || attentionScene.id
      || (phaseId || locationId ? `scene:${phaseId || 'phase'}:${locationId || 'location'}` : '')
    );
    const summarySource = compact(
      turnPacket.outcomePacket?.summary
      || turnPacket.outcomePacket?.title
      || turnPacket.commandLogPacket?.summary
      || assistantText
      || decision.action
      || decision.classification
    );
    const boundaryKey = [
      phaseAdvance?.from || graphTransition?.from || phaseId || 'phase',
      phaseAdvance?.to || graphTransition?.to || phaseId || 'phase',
      locationId || 'no-location'
    ].join('->');
    return {
      transactionId,
      sourceToken: compact(sourceFrame?.sourceToken || `turnSourceFrame:${sourceFrameRef.id || sourceFrameRef.dedupeKey || transactionId}`),
      sourceFrame,
      sourceFrameRef,
      outcomeId,
      flushLens: true,
      batchId: `scene-phase-seal:${outcomeId}:${boundaryKey}`,
      idempotencyKey: `scene-phase-seal:${transactionId}:${outcomeId}:${boundaryKey}:${sourceFrameRef.dedupeKey || sourceFrameRef.id || 'source'}`,
      seal: {
        id: `scene-seal:${outcomeId}:${boundaryKey}`,
        campaignId: tracked?.campaign?.id || tracked?.campaignChatBinding?.campaignId || sourceFrameRef.campaignId || null,
        saveId: tracked?.campaignChatBinding?.saveId || sourceFrameRef.saveId || null,
        branchId: tracked?.campaignChatBinding?.branchId || 'main',
        transactionId,
        outcomeId,
        sourceFrameRef,
        chapterId: compact(tracked?.mission?.activeMissionGraphId || tracked?.mission?.activeMissionId || ''),
        phaseId,
        sceneId,
        locationId,
        actorIds: [
          ...(Array.isArray(sceneSnapshot.presentCharacters) ? sceneSnapshot.presentCharacters : []),
          ...(Array.isArray(sceneSnapshot.presentActorIds) ? sceneSnapshot.presentActorIds : []),
          ...(Array.isArray(sceneSnapshot.relevantCrewIds) ? sceneSnapshot.relevantCrewIds : [])
        ],
        subjectIds: [
          ...(Array.isArray(decision.domainSignals) ? decision.domainSignals : []),
          ...(Array.isArray(decision.riskSignals) ? decision.riskSignals : [])
        ],
        threadIds: [
          tracked?.attentionState?.foregroundThreadId || null,
          tracked?.threadLedger?.foregroundThreadId || null
        ],
        missionIds: [
          tracked?.mission?.activeMissionId || null,
          tracked?.attentionState?.foregroundQuestId || null
        ],
        tags: [
          'runtime-committed-turn',
          phaseAdvance ? 'phase-advance' : null,
          graphTransition ? 'graph-transition' : null,
          decision.classification || null
        ],
        keywords: [
          phaseId,
          locationId,
          decision.classification || null
        ],
        summaryDigest: summarySource ? {
          hash: `fnv1a:${fnv1a(summarySource)}`,
          length: summarySource.length
        } : null,
        eventRefs: [{
          kind: 'directive.coreCommittedTurnRef.v1',
          id: turnId || outcomeId,
          transactionId,
          outcomeId,
          assistantHostMessageId: assistantMessageId || null,
          playerHostMessageId: messageHostMessageId(playerMessage) || ingress?.hostMessageId || null,
          sourceFrameId: sourceFrameRef.id || null
        }]
      }
    };
  }

  function uniqueCompactStrings(values = []) {
    const seen = new Set();
    const out = [];
    for (const value of Array.isArray(values) ? values : [values]) {
      const text = compact(value);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
    return out;
  }

  function boundedRefs(values = [], mapper = (value) => value, limit = 8) {
    return (Array.isArray(values) ? values : [])
      .map(mapper)
      .filter(Boolean)
      .slice(0, limit);
  }

  function pressureArcDigestPayloadForCommittedTurn({
    state,
    ingressId,
    decision = {},
    committed = {},
    turnId = null,
    outcomeId = null,
    playerMessage = null,
    assistantMessageId = null
  } = {}) {
    const tracked = initializeCampaignRuntimeTracking(state || getCampaignState());
    const ingress = findIngress(tracked, ingressId);
    const transactionId = compact(ingress?.coreTransactionId || '');
    const sourceFrame = ingress?.sourceFrame || null;
    const sourceFrameRef = createTurnSourceFrameRef(sourceFrame || {
      id: ingress?.sourceFrameId || null,
      campaignId: tracked?.campaign?.id || tracked?.campaignChatBinding?.campaignId || null,
      saveId: tracked?.campaignChatBinding?.saveId || null,
      chatId: ingress?.chatId || tracked?.campaignChatBinding?.chatId || null,
      hostMessageId: ingress?.hostMessageId || null,
      textHash: ingress?.textHash || null
    });
    if (!transactionId || !sourceFrameRef || !outcomeId) return null;

    const turnPacket = committed?.turnPacket || {};
    const outcomePacket = turnPacket.outcomePacket || {};
    const commandLogPacket = turnPacket.commandLogPacket || {};
    const sceneSnapshot = turnPacket.sceneSnapshot || turnPacket.scene || {};
    const attentionState = tracked?.attentionState || {};
    const pressureRecords = Array.isArray(tracked?.pressureLedger?.records) ? tracked.pressureLedger.records : [];
    const storyArcs = Array.isArray(tracked?.storyArcLedger?.arcs)
      ? tracked.storyArcLedger.arcs
      : (Array.isArray(tracked?.storyArcLedger?.records) ? tracked.storyArcLedger.records : []);
    const commandSpend = tracked?.commandBearing?.spendLedger?.[outcomeId] || null;
    const visibleConsequences = [
      ...(Array.isArray(outcomePacket.visibleConsequences) ? outcomePacket.visibleConsequences : []),
      ...(Array.isArray(commandLogPacket.visibleConsequences) ? commandLogPacket.visibleConsequences : [])
    ];
    const pressureIds = uniqueCompactStrings([
      ...(Array.isArray(turnPacket.pressureIds) ? turnPacket.pressureIds : []),
      ...pressureRecords.map((record) => record?.id),
      ...(Array.isArray(decision.pressureIds) ? decision.pressureIds : [])
    ]);
    const arcIds = uniqueCompactStrings([
      ...(Array.isArray(turnPacket.arcIds) ? turnPacket.arcIds : []),
      ...storyArcs.map((arc) => arc?.id || arc?.arcId),
      ...(Array.isArray(decision.arcIds) ? decision.arcIds : [])
    ]);
    const threadIds = uniqueCompactStrings([
      ...(Array.isArray(turnPacket.threadIds) ? turnPacket.threadIds : []),
      attentionState.foregroundThreadId,
      tracked?.threadLedger?.foregroundThreadId,
      ...(Array.isArray(decision.threadIds) ? decision.threadIds : [])
    ]);
    const missionIds = uniqueCompactStrings([
      ...(Array.isArray(turnPacket.missionIds) ? turnPacket.missionIds : []),
      tracked?.mission?.activeMissionId,
      attentionState.foregroundQuestId,
      ...(Array.isArray(decision.missionIds) ? decision.missionIds : [])
    ]);
    const hasDigestSignal = Boolean(
      pressureIds.length
      || arcIds.length
      || threadIds.length
      || missionIds.length
      || visibleConsequences.length
      || commandSpend
      || decision.classification === 'consequentialCommand'
    );
    if (!hasDigestSignal) return null;

    const phaseId = compact(
      sceneSnapshot.activePhaseId
      || sceneSnapshot.phaseId
      || tracked?.mission?.activePhaseId
      || tracked?.mission?.phase
      || attentionState.scene?.phaseId
    );
    const locationId = compact(
      sceneSnapshot.locationId
      || sceneSnapshot.currentLocationId
      || attentionState.scene?.locationId
      || tracked?.worldState?.currentLocationId
    );
    const sceneId = compact(
      sceneSnapshot.sceneId
      || sceneSnapshot.id
      || attentionState.scene?.sceneId
      || attentionState.scene?.id
      || (phaseId || locationId ? `scene:${phaseId || 'phase'}:${locationId || 'location'}` : '')
    );
    const summarySource = compact(
      outcomePacket.summary
      || commandLogPacket.summary
      || visibleConsequences.join(' ')
      || decision.action
      || decision.classification
    );
    const boundaryKey = [
      phaseId || 'phase',
      locationId || 'location',
      pressureIds[0] || arcIds[0] || threadIds[0] || missionIds[0] || 'pressure'
    ].join(':');
    return {
      transactionId,
      sourceToken: compact(sourceFrame?.sourceToken || `turnSourceFrame:${sourceFrameRef.id || sourceFrameRef.dedupeKey || transactionId}`),
      sourceFrame,
      sourceFrameRef,
      outcomeId,
      flushLens: true,
      batchId: `pressure-arc-digest:${outcomeId}:${boundaryKey}`,
      idempotencyKey: `pressure-arc-digest:${transactionId}:${outcomeId}:${boundaryKey}:${sourceFrameRef.dedupeKey || sourceFrameRef.id || 'source'}`,
      digest: {
        id: `pressure-arc-digest:${outcomeId}:${boundaryKey}`,
        campaignId: tracked?.campaign?.id || tracked?.campaignChatBinding?.campaignId || sourceFrameRef.campaignId || null,
        saveId: tracked?.campaignChatBinding?.saveId || sourceFrameRef.saveId || null,
        branchId: tracked?.campaignChatBinding?.branchId || 'main',
        transactionId,
        outcomeId,
        sourceFrameRef,
        chapterId: compact(tracked?.mission?.activeMissionGraphId || tracked?.mission?.activeMissionId || ''),
        phaseId,
        sceneId,
        locationId,
        pressureIds,
        arcIds,
        threadIds,
        missionIds,
        actorIds: [
          ...(Array.isArray(sceneSnapshot.presentCharacters) ? sceneSnapshot.presentCharacters : []),
          ...(Array.isArray(sceneSnapshot.presentActorIds) ? sceneSnapshot.presentActorIds : []),
          ...(Array.isArray(sceneSnapshot.relevantCrewIds) ? sceneSnapshot.relevantCrewIds : [])
        ],
        subjectIds: uniqueCompactStrings([
          ...(Array.isArray(decision.domainSignals) ? decision.domainSignals : []),
          ...(Array.isArray(decision.riskSignals) ? decision.riskSignals : []),
          outcomePacket.resultBand || null
        ]),
        tags: [
          'runtime-committed-turn',
          'pressure-arc-digest',
          commandSpend ? 'command-bearing-spend' : null,
          decision.classification || null
        ],
        keywords: [
          phaseId,
          locationId,
          decision.classification || null,
          outcomePacket.resultBand || null
        ],
        summaryDigest: summarySource ? {
          hash: `fnv1a:${fnv1a(summarySource)}`,
          length: summarySource.length
        } : null,
        pressureRefs: boundedRefs(pressureRecords, (record) => ({
          kind: 'directive.pressureRef.v1',
          id: record?.id || null,
          status: record?.status || null,
          hash: record?.hash || (record?.id ? `fnv1a:${fnv1a(JSON.stringify({
            id: record.id,
            status: record.status || null,
            phaseId: record.phaseId || null
          }))}` : null)
        })),
        arcRefs: boundedRefs(storyArcs, (arc) => ({
          kind: 'directive.storyArcRef.v1',
          id: arc?.id || arc?.arcId || null,
          status: arc?.status || null,
          hash: arc?.hash || (arc?.id || arc?.arcId ? `fnv1a:${fnv1a(JSON.stringify({
            id: arc.id || arc.arcId,
            status: arc.status || null,
            stageId: arc.stageId || null
          }))}` : null)
        })),
        openThreadRefs: boundedRefs(threadIds, (id) => ({
          kind: 'directive.openThreadRef.v1',
          id,
          status: 'open'
        })),
        callbackRefs: [{
          kind: 'directive.coreCommittedTurnRef.v1',
          id: turnId || outcomeId,
          transactionId,
          outcomeId,
          assistantHostMessageId: assistantMessageId || null,
          playerHostMessageId: messageHostMessageId(playerMessage) || ingress?.hostMessageId || null,
          sourceFrameId: sourceFrameRef.id || null
        }]
      }
    };
  }

  function openWorldBoundaryPayloadForCommittedTurn({
    state,
    ingressId,
    decision = {},
    committed = {},
    turnId = null,
    outcomeId = null
  } = {}) {
    const tracked = initializeCampaignRuntimeTracking(state || getCampaignState());
    const ingress = findIngress(tracked, ingressId);
    const transactionId = compact(ingress?.coreTransactionId || '');
    const sourceFrame = ingress?.sourceFrame || null;
    const sourceFrameRef = createTurnSourceFrameRef(sourceFrame || {
      id: ingress?.sourceFrameId || null,
      campaignId: tracked?.campaign?.id || tracked?.campaignChatBinding?.campaignId || null,
      saveId: tracked?.campaignChatBinding?.saveId || null,
      chatId: ingress?.chatId || tracked?.campaignChatBinding?.chatId || null,
      hostMessageId: ingress?.hostMessageId || null,
      textHash: ingress?.textHash || null
    });
    if (!transactionId || !sourceFrameRef || !outcomeId) return null;

    const turnPacket = committed?.turnPacket || {};
    const reducerBundle = turnPacket.stateDelta?.openWorld?.reducerBundle
      || turnPacket.openWorld?.reducerBundle
      || turnPacket.openWorldReducerBundle
      || null;
    if (reducerBundle?.kind !== 'directive.openWorldReducerBundle.v1') return null;

    let reducerRef = null;
    try {
      reducerRef = compactOpenWorldReducerBundleRef(reducerBundle, { outcomeId });
    } catch {
      return null;
    }
    const sceneSnapshot = turnPacket.sceneSnapshot || turnPacket.scene || {};
    const phaseId = compact(
      sceneSnapshot.activePhaseId
      || sceneSnapshot.phaseId
      || tracked?.mission?.activePhaseId
      || tracked?.mission?.phase
      || tracked?.attentionState?.scene?.phaseId
    );
    const locationId = compact(
      sceneSnapshot.locationId
      || sceneSnapshot.currentLocationId
      || tracked?.attentionState?.scene?.locationId
      || tracked?.worldState?.currentLocationId
    );
    const sceneId = compact(
      sceneSnapshot.sceneId
      || sceneSnapshot.id
      || tracked?.attentionState?.scene?.sceneId
      || tracked?.attentionState?.scene?.id
      || (phaseId || locationId ? `scene:${phaseId || 'phase'}:${locationId || 'location'}` : '')
    );
    const boundaryType = compact(reducerRef.diagnostics?.boundaryType || reducerBundle.diagnostics?.boundaryType || 'openWorld');
    const boundaryKey = [
      boundaryType || 'openWorld',
      reducerRef.sourceHash ? reducerRef.sourceHash.slice(0, 16) : reducerRef.factHash?.slice(0, 16) || 'no-reducer-hash'
    ].join(':');
    return {
      transactionId,
      sourceToken: compact(sourceFrame?.sourceToken || `turnSourceFrame:${sourceFrameRef.id || sourceFrameRef.dedupeKey || transactionId}`),
      sourceFrame,
      sourceFrameRef,
      outcomeId,
      flushLens: true,
      batchId: `open-world-boundary:${outcomeId}:${boundaryKey}`,
      idempotencyKey: `open-world-boundary:${transactionId}:${outcomeId}:${boundaryKey}:${sourceFrameRef.dedupeKey || sourceFrameRef.id || 'source'}`,
      reducerRef,
      boundaryType,
      turnId,
      sceneId,
      phaseId,
      locationId,
      tags: [
        'runtime-committed-turn',
        'open-world-boundary',
        boundaryType,
        decision.classification || null
      ],
      keywords: [
        phaseId,
        locationId,
        decision.classification || null,
        ...(Array.isArray(reducerRef.changedRoots) ? reducerRef.changedRoots : [])
      ]
    };
  }

  function scheduleScenePhaseSealForCommittedTurn(input = {}, activityReporter = null) {
    if (typeof forgeCoordinator?.settleScenePhaseSeal !== 'function') return null;
    const payload = scenePhaseSealPayloadForCommittedTurn(input);
    if (!payload) return null;
    reportActivity(activityReporter, {
      phase: 'scenePhaseSealQueued',
      mode: 'background',
      source: 'forge',
      ingressId: input.ingressId || null,
      turnId: input.turnId || null,
      outcomeId: input.outcomeId || null,
      transactionId: payload.transactionId,
      sourceFrameId: payload.sourceFrameRef?.id || null
    });
    try {
      const settlement = Promise.resolve(forgeCoordinator.settleScenePhaseSeal(payload));
      settlement.then((result) => {
        reportActivity(activityReporter, {
          phase: 'scenePhaseSealSettled',
          mode: 'background',
          source: 'forge',
          ingressId: input.ingressId || null,
          turnId: input.turnId || null,
          outcomeId: input.outcomeId || null,
          transactionId: payload.transactionId,
          status: result?.status || null,
          applied: result?.applied === true
        }, {
          missingCoreWriteMode: 'reject'
        });
      }).catch((error) => {
        reportActivity(activityReporter, {
          phase: 'scenePhaseSealFailed',
          mode: 'background',
          source: 'forge',
          ingressId: input.ingressId || null,
          turnId: input.turnId || null,
          outcomeId: input.outcomeId || null,
          transactionId: payload.transactionId,
          error: {
            code: error?.code || null,
            message: error?.message || String(error)
          }
        }, {
          missingCoreWriteMode: 'reject'
        });
      }, {
        missingCoreWriteMode: 'reject'
      });
      return settlement;
    } catch (error) {
      reportActivity(activityReporter, {
        phase: 'scenePhaseSealFailed',
        mode: 'background',
        source: 'forge',
        ingressId: input.ingressId || null,
        turnId: input.turnId || null,
        outcomeId: input.outcomeId || null,
        transactionId: payload.transactionId,
        error: {
          code: error?.code || null,
          message: error?.message || String(error)
        }
      });
      return null;
    }
  }

  function schedulePressureArcDigestForCommittedTurn(input = {}, activityReporter = null) {
    if (typeof forgeCoordinator?.settlePressureArcDigest !== 'function') return null;
    const payload = pressureArcDigestPayloadForCommittedTurn(input);
    if (!payload) return null;
    reportActivity(activityReporter, {
      phase: 'pressureArcDigestQueued',
      mode: 'background',
      source: 'forge',
      ingressId: input.ingressId || null,
      turnId: input.turnId || null,
      outcomeId: input.outcomeId || null,
      transactionId: payload.transactionId,
      sourceFrameId: payload.sourceFrameRef?.id || null
    }, {
      missingCoreWriteMode: 'reject'
    });
    try {
      const settlement = Promise.resolve(forgeCoordinator.settlePressureArcDigest(payload));
      settlement.then((result) => {
        reportActivity(activityReporter, {
          phase: 'pressureArcDigestSettled',
          mode: 'background',
          source: 'forge',
          ingressId: input.ingressId || null,
          turnId: input.turnId || null,
          outcomeId: input.outcomeId || null,
          transactionId: payload.transactionId,
          status: result?.status || null,
          applied: result?.applied === true
        });
      }).catch((error) => {
        reportActivity(activityReporter, {
          phase: 'pressureArcDigestFailed',
          mode: 'background',
          source: 'forge',
          ingressId: input.ingressId || null,
          turnId: input.turnId || null,
          outcomeId: input.outcomeId || null,
          transactionId: payload.transactionId,
          error: {
            code: error?.code || null,
            message: error?.message || String(error)
          }
        });
      });
      return settlement;
    } catch (error) {
      reportActivity(activityReporter, {
        phase: 'pressureArcDigestFailed',
        mode: 'background',
        source: 'forge',
        ingressId: input.ingressId || null,
        turnId: input.turnId || null,
        outcomeId: input.outcomeId || null,
        transactionId: payload.transactionId,
        error: {
          code: error?.code || null,
          message: error?.message || String(error)
        }
      });
      return null;
    }
  }

  function scheduleOpenWorldBoundaryForCommittedTurn(input = {}, activityReporter = null) {
    if (typeof forgeCoordinator?.settleOpenWorldBoundary !== 'function') return null;
    const payload = openWorldBoundaryPayloadForCommittedTurn(input);
    if (!payload) return null;
    reportActivity(activityReporter, {
      phase: 'openWorldBoundaryQueued',
      mode: 'background',
      source: 'forge',
      ingressId: input.ingressId || null,
      turnId: input.turnId || null,
      outcomeId: input.outcomeId || null,
      transactionId: payload.transactionId,
      sourceFrameId: payload.sourceFrameRef?.id || null
    });
    try {
      const settlement = Promise.resolve(forgeCoordinator.settleOpenWorldBoundary(payload));
      settlement.then((result) => {
        reportActivity(activityReporter, {
          phase: 'openWorldBoundarySettled',
          mode: 'background',
          source: 'forge',
          ingressId: input.ingressId || null,
          turnId: input.turnId || null,
          outcomeId: input.outcomeId || null,
          transactionId: payload.transactionId,
          status: result?.status || null,
          applied: result?.applied === true
        });
      }).catch((error) => {
        reportActivity(activityReporter, {
          phase: 'openWorldBoundaryFailed',
          mode: 'background',
          source: 'forge',
          ingressId: input.ingressId || null,
          turnId: input.turnId || null,
          outcomeId: input.outcomeId || null,
          transactionId: payload.transactionId,
          error: {
            code: error?.code || null,
            message: error?.message || String(error)
          }
        });
      });
      return settlement;
    } catch (error) {
      reportActivity(activityReporter, {
        phase: 'openWorldBoundaryFailed',
        mode: 'background',
        source: 'forge',
        ingressId: input.ingressId || null,
        turnId: input.turnId || null,
        outcomeId: input.outcomeId || null,
        transactionId: payload.transactionId,
        error: {
          code: error?.code || null,
          message: error?.message || String(error)
        }
      });
      return null;
    }
  }

  async function recordTerminalCheckpointSettlementEvent(event = {}) {
    if (typeof recordTerminalCheckpointSettlement !== 'function') return null;
    try {
      return cloneJson(await recordTerminalCheckpointSettlement(cloneJson(event)));
    } catch {
      return null;
    }
  }

  async function commitAdvisoryRecord({
    state,
    advisory,
    ingressId,
    source = 'chatCounsel',
    reason = 'Player-safe advisory note recorded for Mission, Log, and Crew surfaces.',
    summary = null,
    stable = true
  } = {}) {
    const nextCandidate = cloneJson(state);
    nextCandidate.commandCompetence = nextCandidate.commandCompetence || {};
    nextCandidate.commandCompetence.counselRequestLedger = nextCandidate.commandCompetence.counselRequestLedger || [];
    const ledger = nextCandidate.commandCompetence.counselRequestLedger;
    const index = ledger.findIndex((entry) => entry.id === advisory.id);
    if (index >= 0) ledger[index] = { ...ledger[index], ...cloneJson(advisory) };
    else ledger.push(cloneJson(advisory));
    return stateDeltaGateway.commit(nextCandidate, {
      source,
      reason,
      summary: summary || advisory.logSummary || advisory.subject,
      domains: ['commandCompetence'],
      ingressId,
      stable
    });
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
    const transaction = await observeSource.call(coreTurnStore, sourceFrame, {
      transactionId,
      ingressId,
      chatId,
      idempotencyKey: `begin:${ingressId}`
    });
    if (
      sourceReobserveDecision?.action === 'restartLatestSource'
      && priorIngressForRecovery?.coreTransactionId
      && transaction?.id
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
    return (createRuntimeLedgerView(state || {}, { coreTurnStore }).ingressLedger || []).find((entry) => entry.id === ingressId) || null;
  }

  async function appendPostCommitConversationFailureDiagnostic(state, {
    ingressId = null,
    outcomeId = null,
    turnId = null,
    pendingInteractionId = null,
    resolutionIngressId = null,
    error = null
  } = {}) {
    const tracked = initializeCampaignRuntimeTracking(state);
    const ingress = findIngress(tracked, ingressId);
    const transactionId = compact(ingress?.coreTransactionId || '');
    const appendDiagnostics = coreTurnStore?.appendDiagnostics || coreTurnStore?.appendDiagnostic;
    if (!transactionId || typeof appendDiagnostics !== 'function') return null;
    const diagnostic = {
      type: 'sidecar',
      worker: 'narrativeThreadDirector',
      sidecarType: 'narrativeThreadExtraction',
      eventType: 'postCommitConversationFailed',
      status: 'failed',
      severity: 'warning',
      reason: 'blocking-post-commit-conversation-failed',
      ingressId: ingress?.id || ingressId || null,
      outcomeId: outcomeId || ingress?.outcomeId || null,
      turnId: turnId || ingress?.turnId || null,
      pendingInteractionId: pendingInteractionId || null,
      resolutionIngressId: resolutionIngressId || null,
      hostMessageId: ingress?.hostMessageId || null,
      sourceFrameId: ingress?.sourceFrameId || ingress?.sourceFrame?.id || null,
      coreTransactionId: transactionId,
      error: compactPostCommitConversationError(error),
      observedAt: timestamp(now)
    };
    try {
      await appendDiagnostics.call(coreTurnStore, transactionId, diagnostic);
      return diagnostic;
    } catch {
      return null;
    }
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
    const ingress = findIngress(initializeCampaignRuntimeTracking(state), ingressId);
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
    const ingress = findIngress(tracked, payload.ingressId);
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
    const ingress = findIngress(tracked, ingressId);
    const transactionId = compact(ingress?.coreTransactionId || '');
    if (!transactionId || typeof coreTurnStore?.markRecoveryRequired !== 'function') return null;
    const sourceFrameRef = ingress?.sourceFrame
      ? createTurnSourceFrameRef(ingress.sourceFrame)
      : (ingress?.sourceFrameId ? { id: ingress.sourceFrameId } : null);
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
        errorCode: failure?.code || null,
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
        errorCode: failure?.code || null
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
    const recoveryView = await createRuntimeLedgerViewAsync(state, {
      coreTurnStore,
      legacyFallback: false
    });
    const compatibilityView = await createRuntimeLedgerViewAsync(state, { coreTurnStore });
    const recoveryRows = recoveryView.recoveryJournal || [];
    const responseRows = compatibilityView.responseLedger || [];
    const ingressRows = compatibilityView.ingressLedger || [];
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
      const response = responseRows.find((entry) => (
        (row.dependentResponseId && compact(entry.id) === compact(row.dependentResponseId))
        || (rowRecoveryId && compact(entry.recoveryId) === rowRecoveryId)
        || (transactionId && compact(entry.coreTransactionId || entry.coreRelease?.transactionId || entry.providerFallback?.coreTransactionId) === transactionId)
      )) || null;
      if (!response && eventType === 'providerFailureAfterMechanicsCommit') continue;
      const ingress = ingressRows.find((entry) => (
        (repairDecision.ingressId && entry.id === repairDecision.ingressId)
        || (transactionId && compact(entry.coreTransactionId) === transactionId)
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
          responseId: row.dependentResponseId || null,
          responseIdempotencyKey: row.dependentResponseId
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

  function postCommitConversationPayloadForCommittedTurn({
    ingressId = null,
    turnId = null,
    outcomeId = null,
    committed = null,
    playerMessage = null,
    assistantMessageId = null,
    assistantText = '',
    sourceIngress = null,
    resolutionMessage = null,
    resolutionIngressId = null,
    pendingInteractionId = null
  } = {}) {
    const sourceMessageId = playerMessage?.hostMessageId
      || playerMessage?.id
      || sourceIngress?.hostMessageId
      || `${ingressId}:player`;
    const sourceText = playerMessage?.text
      || hostMessageText(sourceIngress?.hostMessageId || sourceMessageId, sourceIngress?.textPreview || '');
    return {
      ingressId,
      resolutionIngressId: resolutionIngressId || null,
      resolutionMessageId: resolutionMessage ? messageHostMessageId(resolutionMessage) : null,
      resolutionTextHash: resolutionMessage?.text ? fnv1a(resolutionMessage.text) : null,
      pendingInteractionId: pendingInteractionId || null,
      turnId,
      outcomeId,
      resultBand: committed?.turnPacket?.outcomePacket?.resultBand || null,
      committed: true,
      boundaryType: 'scene',
      presentCharacterIds: committed?.turnPacket?.sceneSnapshot?.presentCharacters || [],
      sourceAnchorRange: committed?.turnPacket?.provenance?.sourceAnchorRange || committed?.turnPacket?.sceneSnapshot?.sourceAnchorRange || null,
      reconciliationRunId: committed?.turnPacket?.provenance?.reconciliationRunId || null,
      outcomePacket: cloneJson(committed?.turnPacket?.outcomePacket || null),
      commandLogPacket: cloneJson(committed?.turnPacket?.commandLogPacket || null),
      commandBearingReviewPlan: cloneJson(committed?.turnPacket?.commandBearingReviewPlan || null),
      continuityProjection: cloneJson(committed?.turnPacket?.provenance?.continuityProjection || null),
      messages: [
        {
          id: sourceMessageId,
          role: 'user',
          text: sourceText || ''
        },
        {
          id: assistantMessageId || `${ingressId}:directive-response`,
          role: 'assistant',
          text: assistantText || ''
        }
      ]
    };
  }

  function ingressAliasRecentlyObserved(entry = {}, nowIso = '') {
    const receivedAt = Date.parse(entry.receivedAt || '');
    const current = Date.parse(nowIso || '');
    if (!Number.isFinite(receivedAt) || !Number.isFinite(current)) return true;
    return Math.abs(current - receivedAt) <= INGRESS_ALIAS_DEDUPE_WINDOW_MS;
  }

  function findIngressAlias(state, message = {}, chatId = '', nowIso = '') {
    const tracking = initializeCampaignRuntimeTracking(state).runtimeTracking || {};
    const ingressLedger = createRuntimeLedgerView({ ...state, runtimeTracking: tracking }, { coreTurnStore }).ingressLedger || [];
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

  function findIngressByHostMessageId(state, hostMessageId, chatId = '') {
    const expectedHostMessageId = compact(hostMessageId || '');
    if (!expectedHostMessageId) return null;
    const tracking = initializeCampaignRuntimeTracking(state).runtimeTracking || {};
    const ingressLedger = createRuntimeLedgerView({ ...state, runtimeTracking: tracking }, { coreTurnStore }).ingressLedger || [];
    return [...ingressLedger].reverse().find((entry) => (
      entry
      && compact(entry.hostMessageId || '') === expectedHostMessageId
      && (!chatId || !entry.chatId || entry.chatId === chatId)
    )) || null;
  }

  function findOpenNoOutcomeRecovery(state, ingress = null) {
    if (!ingress || ingress.outcomeId) return null;
    const recoveryRows = createRuntimeLedgerView(state, { coreTurnStore }).recoveryJournal || [];
    return [...recoveryRows].reverse().find((entry) => (
      shouldResolveNoOutcomeRecoveryOnReobserve(ingress, entry)
    )) || null;
  }

  function ingressHasDependentResponse(state, ingress = null) {
    if (!ingress) return false;
    if (ingress.outcomeId || ingress.responseMessageId) return true;
    const responseLedger = createRuntimeLedgerView(state || {}, { coreTurnStore }).responseLedger || [];
    return responseLedger.some((entry) => (
      entry?.ingressId === ingress.id
      || (ingress.outcomeId && entry?.outcomeId === ingress.outcomeId)
      || (ingress.hostMessageId && entry?.ingressHostMessageId === ingress.hostMessageId)
    ));
  }

  function latestSourceRestartDecision(state, ingress, message, stage) {
    if (!ingress || ingressHasDependentResponse(state, ingress)) return null;
    const priorRecovery = findOpenNoOutcomeRecovery(state, ingress);
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

  function staleIngressResult(state, ingressId, message, stage) {
    const current = state ? findIngress(initializeCampaignRuntimeTracking(state), ingressId) : null;
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

  function pendingSourceStaleResult(state, pending = null, stage = 'before-pending-interaction-resolution') {
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
    const sourceIngress = findIngress(state, pending.ingressId);
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

  function stateForIngressCheck(ingressId, fallbackState = null) {
    const current = getCampaignState();
    if (current && findIngress(initializeCampaignRuntimeTracking(current), ingressId)) return current;
    if (fallbackState && findIngress(initializeCampaignRuntimeTracking(fallbackState), ingressId)) return fallbackState;
    return current || fallbackState;
  }

  function stateWithIngressFromFallback(candidateState, fallbackState, ingressId) {
    let next = initializeCampaignRuntimeTracking(candidateState || fallbackState || getCampaignState());
    if (!ingressId) return next;
    const existing = findIngress(next, ingressId);
    const fallback = fallbackState ? initializeCampaignRuntimeTracking(fallbackState) : null;
    const fallbackStateIngress = fallback ? findIngress(fallback, ingressId) : null;
    const observedIngress = observedIngressRecords.get(ingressId) || null;
    const fallbackIngress = fallbackStateIngress || observedIngress
      ? {
          ...(observedIngress ? cloneJson(observedIngress) : {}),
          ...(fallbackStateIngress ? cloneJson(fallbackStateIngress) : {}),
          playerSubmittedAt: fallbackStateIngress?.playerSubmittedAt || observedIngress?.playerSubmittedAt || null,
          receivedAt: fallbackStateIngress?.receivedAt || observedIngress?.receivedAt || null,
          sourceFrameId: fallbackStateIngress?.sourceFrameId || observedIngress?.sourceFrameId || null,
          sourceFrame: fallbackStateIngress?.sourceFrame || observedIngress?.sourceFrame || null,
          coreTransactionId: fallbackStateIngress?.coreTransactionId || observedIngress?.coreTransactionId || null
        }
      : null;
    const fallbackHasCoreEvidence = Boolean(
      fallbackIngress?.coreTransactionId
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

  function currentSourceStaleResult(ingressId, message, stage, fallbackState = null) {
    return staleIngressResult(stateForIngressCheck(ingressId, fallbackState), ingressId, message, stage);
  }

  function activePendingInteraction(state, interactionId = null) {
    return (state.runtimeTracking?.pendingInteractions || []).find((entry) => (
      entry.status === 'pending'
      && (!interactionId || entry.id === interactionId)
    )) || ledgerTerminalInteraction(state, interactionId);
  }

  function activeTerminalInteractionId(state) {
    const interaction = (state?.runtimeTracking?.pendingInteractions || []).find((entry) => (
      entry?.status === 'pending'
      && entry?.kind === 'terminalOutcomeDecision'
    ));
    return interaction?.id || ledgerTerminalInteraction(state)?.id || null;
  }

  function terminalOptionsFromDecision(decision = {}) {
    const actions = Array.isArray(decision?.condition?.resolutionPolicy?.actions)
      && decision.condition.resolutionPolicy.actions.length
      ? decision.condition.resolutionPolicy.actions
      : DEFAULT_TERMINAL_OUTCOME_ACTIONS;
    return actions.map((action) => ({
      id: action,
      action,
      label: TERMINAL_OUTCOME_ACTION_LABELS[action] || action
    }));
  }

  function ledgerTerminalInteraction(state, interactionId = null) {
    const ledger = state?.runtimeTracking?.endConditionLedger || {};
    const decisions = Array.isArray(ledger.decisions) ? ledger.decisions : [];
    const decision = decisions.find((entry) => (
      entry?.status === 'pending'
      && (
        (interactionId && entry.id === interactionId)
        || (!interactionId && entry.id === ledger.activeDecisionId)
      )
    )) || decisions.find((entry) => entry?.status === 'pending' && !interactionId);
    if (!decision) return null;
    return {
      id: decision.id,
      kind: 'terminalOutcomeDecision',
      status: 'pending',
      ingressId: decision.ingressId || null,
      turnId: decision.turnId || null,
      outcomeId: decision.outcomeId || null,
      prompt: 'Directive Checkpoint',
      options: terminalOptionsFromDecision(decision),
      metadata: {
        decisionId: decision.id,
        terminalOutcomeId: decision.conditionId || decision.condition?.id || null,
        terminalOutcomeBand: decision.terminalOutcomeBand || null,
        finalCampaignBandCandidate: decision.finalCampaignBand || null,
        reason: decision.playerFacingSummary || decision.finalCampaignBandSummary || null
      }
    };
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
          ...(target.raw?.extra?.runtimeMetadata || {}),
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
    const priorIngress = findIngress(state, ingressId);
    const receivedAt = timestamp(now);
    const sourceFrame = buildTurnSourceFrame(state, message, chatId, ingressId, receivedAt);
    const coreTransaction = await beginCoreTurnForIngress(sourceFrame, {
      ingressId,
      chatId,
      sourceReobserveDecision,
      priorIngressForRecovery
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
    if (recoverySourceIngress && !recoverySourceIngress.outcomeId) {
      const hostMessageId = message.hostMessageId || message.id || String(message.index ?? '');
      for (const recovery of createRuntimeLedgerView(next).recoveryJournal || []) {
        if (shouldResolveNoOutcomeRecoveryOnReobserve(recoverySourceIngress, recovery)) {
          next = resolveRecoveryEvent(next, recovery.id, {
            status: 'resolved',
            resolvedAt: timestamp(now),
            reason: sourceReobserveDecision?.recoveryResolution?.reason || 'message-reobserved',
            hostMessageId,
            restartIngressId: sourceRestart?.priorIngressId ? ingressId : null,
            repairDecision: sourceReobserveDecision ? cloneJson(sourceReobserveDecision) : null
          });
        }
      }
    }
    await persistState(next, `Captured campaign-chat player message ${message.hostMessageId || message.index || ingressId}.`);
    return next;
  }

  async function recordTurnProcessingFailure(state, ingressId, message, error, stage, decision = null) {
    const failure = {
      code: error?.code || 'DIRECTIVE_CHAT_TURN_PROCESSING_FAILED',
      message: error?.message || String(error)
    };
    const recoveryId = `recovery:chat-turn:${stage || 'processing'}:${ingressId || messageHostMessageId(message) || 'turn'}`;
    let next = initializeCampaignRuntimeTracking(stateForIngressCheck(ingressId, state));
    const existing = findIngress(next, ingressId);
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
    const base = stateWithIngressFromFallback(state, state, ingressId);
    const existing = findIngress(initializeCampaignRuntimeTracking(base), ingressId);
    const existingHasCoreMirror = Boolean(
      existing?.compatibilityMirror
      && existing?.authority === 'compatibilityProjection'
      && existing?.projectionSource === 'coreStoreV2'
    );
    if (
      !patch?.coreTransactionId
      && !patch?.coreProjection
      && !patch?.coreRecovery
      && !existing?.coreTransactionId
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
    const updated = findIngress(initializeCampaignRuntimeTracking(next), ingressId);
    if (updated) observedIngressRecords.set(ingressId, cloneJson(updated));
    await persistState(next, summary);
    return next;
  }

  async function attachReadiedPointToIngress(state, ingressId, message, chatId, readied) {
    const attached = attachReadiedCommandBearingPoint(commandBearingRoot(state), {
      readiedId: readied?.id || null,
      ingressId,
      hostMessageId: messageHostMessageId(message),
      chatId
    });
    if (!attached.applied) {
      return {
        state,
        readied: null,
        reason: attached.reason || 'Readied Command Bearing point could not attach.'
      };
    }
    const next = {
      ...cloneJson(state),
      commandBearing: attached.commandBearing
    };
    await persistState(next, attached.reason || 'Readied Command Bearing point attached to player message.');
    return {
      state: next,
      readied: cloneJson(attached.readied),
      reason: attached.reason
    };
  }

  async function returnReadiedPointForTurn(state, readied, reason) {
    if (!readied?.id) return { state, applied: false, reason: 'No Command Bearing point is readied.' };
    const returned = returnReadiedCommandBearingPoint(commandBearingRoot(state), {
      readiedId: readied.id,
      reason
    });
    if (!returned.applied) {
      return {
        state,
        applied: false,
        reason: returned.reason || reason
      };
    }
    const next = {
      ...cloneJson(state),
      commandBearing: returned.commandBearing
    };
    await persistState(next, returned.reason || reason);
    return {
      state: next,
      applied: true,
      reason: returned.reason || reason
    };
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
    const dispatchState = stateWithIngressFromFallback(state, state, ingressId);
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
      let next = stateWithIngressFromFallback(result?.campaignState || dispatchState, dispatchState, ingressId);
      const hostMessageId = result?.response?.hostMessageId
        || result?.posted?.hostMessageId
        || result?.entry?.hostMessageId
        || null;
      if (
        outcomeId
        && strategy !== 'injectAndContinue'
        && turnCommitCoordinator?.markResponse
        && next.runtimeTracking?.lastCommittedTurn?.outcomeId === outcomeId
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
        && failed.runtimeTracking?.lastCommittedTurn?.outcomeId === outcomeId
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
        const ingress = findIngress(failed, ingressId);
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
    const staleBeforeTime = currentSourceStaleResult(ingressId, message, 'before-scene-time-boundary', next);
    if (staleBeforeTime) return staleBeforeTime;
    const beforeTimeFingerprint = JSON.stringify({
      worldElapsedMinutes: next?.worldState?.elapsedMinutes ?? null,
      worldElapsedHours: next?.worldState?.elapsedHours ?? null,
      ledgerElapsedMinutes: next?.timeLedger?.elapsedMinutes ?? null,
      ledgerEntryCount: Array.isArray(next?.timeLedger?.entries) ? next.timeLedger.entries.length : null
    });
    next = await commitAdjudicatedTimeBoundary(next, {
      ingressId,
      playerMessage: message,
      sourceKind: 'sceneContinuation',
      reason: 'Scene continuation time boundary adjudicated.'
    }, activityReporter);
    const afterTimeFingerprint = JSON.stringify({
      worldElapsedMinutes: next?.worldState?.elapsedMinutes ?? null,
      worldElapsedHours: next?.worldState?.elapsedHours ?? null,
      ledgerElapsedMinutes: next?.timeLedger?.elapsedMinutes ?? null,
      ledgerEntryCount: Array.isArray(next?.timeLedger?.entries) ? next.timeLedger.entries.length : null
    });
    const timeChanged = beforeTimeFingerprint !== afterTimeFingerprint;
    if (decision.workerPlan?.promptUpdate || timeChanged) {
      reportActivity(activityReporter, {
        phase: 'syncingPrompt',
        mode: 'blocking',
        classification: decision.classification,
        ingressId,
        timeChanged
      });
      next = await syncPrompt(next, 'Prompt context synchronized.', promptFrameForMessage(next, message, decision), activityReporter, {
        source: 'chatTurn',
        classification: decision.classification,
        ingressId
      });
    }
    const stale = currentSourceStaleResult(ingressId, message, 'before-no-change-dispatch', next);
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
      completedAt: timestamp(now)
    }, `Completed ${decision.classification} utility turn.`);
    scheduleTurnSidecars(decision, {
      ingressId,
      classification: decision.classification,
      playerText: message.text
    }, activityReporter);
    return {
      handled: true,
      responseStrategy: 'injectAndContinue',
      abortDefaultGeneration: false,
      decision,
      campaignState: cloneJson(next)
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
    const staleBeforeTime = currentSourceStaleResult(ingressId, message, 'before-location-transition-time-boundary', next);
    if (staleBeforeTime) return staleBeforeTime;
    next = await commitDefaultLocationTransitionBoundary(next, {
      ingressId,
      playerMessage: message,
      outcomeText: text
    }, activityReporter);
    if (decision.workerPlan?.promptUpdate) {
      reportActivity(activityReporter, {
        phase: 'syncingPrompt',
        mode: 'blocking',
        classification: decision.classification,
        ingressId,
        timeChanged: true
      });
      next = await syncPrompt(next, 'Prompt context synchronized for location transition pacing.', promptFrameForMessage(next, message, decision), activityReporter, {
        source: 'locationTransition',
        classification: decision.classification,
        ingressId
      });
    }
    const stale = currentSourceStaleResult(ingressId, message, 'before-location-transition-dispatch', next);
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
    scheduleTurnSidecars(decision, {
      ingressId,
      classification: decision.classification,
      playerText: message.text,
      responseText: text,
      sceneBoundary: cloneJson(decision.sceneBoundary || null)
    }, activityReporter);
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
    const stale = currentSourceStaleResult(ingressId, message, 'before-routine-commit', state);
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
    next = await commitAdjudicatedTimeBoundary(next, {
      ingressId,
      turnId: routineId,
      playerMessage: message,
      sourceKind: 'routineCommand',
      reason: 'Routine command time boundary adjudicated.'
    }, activityReporter);
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
      text: directiveOwned ? localRoutineNarration() : null,
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
    scheduleTurnSidecars(decision, {
      ingressId,
      turnId: routineId,
      classification: decision.classification,
      playerText: message.text
    }, activityReporter);
    return {
      handled: true,
      responseStrategy: directiveOwned ? 'directivePosted' : 'injectAndContinue',
      abortDefaultGeneration: directiveOwned,
      decision,
      campaignState: cloneJson(next)
    };
  }

  async function continueClassifiedTurn(state, ingressId, decision, message, activityReporter = null) {
    const consequentialClassification = ['consequentialCommand', 'riskConfirmationNeeded'].includes(decision.classification);
    if (!consequentialClassification) {
      const readied = activeReadiedCommandBearing(state, message.chatId || currentChatId());
      if (readied) {
        const returned = await returnReadiedPointForTurn(
          state,
          readied,
          'Readied Command Bearing point returned because the next message did not create a consequential outcome.'
        );
        state = returned.state;
        setCampaignState(state);
      }
    }
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
      return handleCounsel(state, ingressId, decision, message, activityReporter);
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
      ? currentSourceStaleResult(ingressId, details.message, `before-${details.kind || decision.classification}-pause`, state)
      : null;
    if (staleBeforePause) return staleBeforePause;
    let next = recordPendingInteraction(state, {
      id: `interaction:${ingressId}`,
      kind: details.kind || decision.classification,
      status: 'pending',
      ingressId,
      turnId: details.turnId || null,
      outcomeId: details.outcomeId || null,
      prompt: text,
      options: details.options || [],
      createdAt: timestamp(now)
    });
    await persistState(next, `Recorded pending ${decision.classification} interaction.`);
    const staleBeforeDispatch = details.message
      ? currentSourceStaleResult(ingressId, details.message, `before-${details.kind || decision.classification}-pause-dispatch`, next)
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

  async function handleCounsel(state, ingressId, decision, message, activityReporter = null) {
    const recordedAt = timestamp(now);
    const advisory = fallbackAdvisoryRecord({ state, ingressId, message, nowValue: recordedAt });
    reportActivity(activityReporter, {
      phase: 'counsel',
      mode: 'blocking',
      classification: decision.classification,
      ingressId
    });
    const stale = currentSourceStaleResult(ingressId, message, 'before-counsel-release', state);
    if (stale) return stale;
    const dispatched = await dispatchAndRecord({
      state,
      ingressId,
      decision,
      strategy: 'injectAndContinue',
      responseKind: 'hostGeneration',
      activityReporter
    });
    const recoveryResult = recoveryRequiredDispatchResult(dispatched, decision, {
      advisory: cloneJson(advisory)
    });
    if (recoveryResult) return recoveryResult;
    let next = await updateIngressState(dispatched.state, ingressId, {
      status: 'complete',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: 'injectAndContinue',
      responseMessageId: null,
      advisoryId: advisory.id,
      completedAt: timestamp(now)
    }, 'Counsel host generation released; fallback advisory ready for background enrichment.');
    next = await commitAdvisoryRecord({
      state: next,
      advisory,
      ingressId,
      source: 'chatCounsel',
      reason: 'Deterministic player-safe advisory note recorded after host generation release.',
      summary: advisory.logSummary || advisory.subject,
      stable: true
    });
    reportActivity(activityReporter, {
      phase: 'syncingPrompt',
      mode: 'blocking',
      classification: decision.classification,
      ingressId
    });
    next = await syncPrompt(next, 'Prompt context synchronized.', promptFrameForMessage(next, message, decision), activityReporter, {
      source: 'counselRequest',
      classification: decision.classification,
      ingressId
    });
    scheduleTurnSidecars(decision, {
      ingressId,
      classification: decision.classification,
      playerText: message.text,
      advisoryId: advisory.id
    }, activityReporter);
    const advisoryEnrichment = typeof scheduleAdvisoryEnrichmentProcessor === 'function'
      ? scheduleAdvisoryEnrichmentProcessor({
          ingressId,
          advisoryId: advisory.id,
          sourceMessageId: messageHostMessageId(message),
          playerTextHash: fnv1a(message.text || ''),
          fallbackAdvisoryHash: fnv1a(JSON.stringify(advisory)),
          run: async ({ isSourceCurrent = null } = {}) => {
            const sourceCurrent = () => (typeof isSourceCurrent === 'function' ? isSourceCurrent() !== false : true);
            if (!sourceCurrent()) {
              return {
                kind: 'directive.advisoryEnrichmentResult',
                ok: false,
                scheduled: true,
                status: 'stale',
                applied: false,
                reason: 'source-stale-before-provider',
                advisoryId: advisory.id,
                ingressId
              };
            }
            const generated = generationRouter?.generate
              ? await generationRouter.generate('missionDirectorAdvisor', {
                  systemPrompt: 'Create a player-safe Directive UI advisory record as compact JSON. Do not write chat prose, narration, dialogue, Markdown, or hidden facts.',
                  prompt: advisoryPrompt(state, message.text, decision),
                  maxTokens: 650,
                  metadata: {
                    coreDiagnosticTarget: 'advisoryEnrichment',
                    ingressId,
                    advisoryId: advisory.id,
                    sourceMessageId: messageHostMessageId(message),
                    playerTextHash: fnv1a(message.text || ''),
                    fallbackAdvisoryHash: fnv1a(JSON.stringify(advisory))
                  }
                })
              : null;
            if (!sourceCurrent()) {
              return {
                kind: 'directive.advisoryEnrichmentResult',
                ok: false,
                scheduled: true,
                status: 'stale',
                applied: false,
                reason: 'source-stale-after-provider',
                advisoryId: advisory.id,
                ingressId
              };
            }
            const candidate = generated?.ok
              ? normalizeGeneratedBlock(generated.response?.text || generated.response?.content || '')
              : '';
            const parsed = parseJsonObjectText(candidate);
            if (!parsed) {
              return {
                kind: 'directive.advisoryEnrichmentResult',
                ok: generated?.ok !== false,
                scheduled: true,
                status: generated?.ok === false ? 'failed' : 'noChange',
                applied: false,
                reason: generated?.ok === false ? 'provider-failed' : 'no-valid-advisory-json',
                advisoryId: advisory.id,
                ingressId,
                error: generated?.ok === false ? cloneJson(generated.error || null) : null
              };
            }
            const enriched = {
              ...normalizeAdvisoryRecord(parsed, { state: getCampaignState() || state, ingressId, message, nowValue: recordedAt }),
              id: advisory.id,
              source: 'chatCounsel.enriched',
              sourceIngressId: ingressId,
              sourceMessageId: advisory.sourceMessageId,
              enrichedAt: timestamp(now),
              fallbackHash: fnv1a(JSON.stringify(advisory))
            };
            const current = initializeCampaignRuntimeTracking(getCampaignState() || next);
            const staleBeforeApply = currentSourceStaleResult(ingressId, message, 'before-counsel-enrichment-apply', current);
            if (staleBeforeApply || !sourceCurrent()) {
              return {
                kind: 'directive.advisoryEnrichmentResult',
                ok: false,
                scheduled: true,
                status: 'stale',
                applied: false,
                reason: 'source-stale-before-apply',
                advisoryId: advisory.id,
                ingressId
              };
            }
            let committed = await commitAdvisoryRecord({
              state: current,
              advisory: enriched,
              ingressId,
              source: 'chatCounsel.enrichment',
              reason: 'Player-safe advisory note enriched in background after host generation release.',
              summary: enriched.logSummary || enriched.subject,
              stable: true
            });
            committed = await syncPrompt(committed, 'Prompt context synchronized after advisory enrichment.', promptFrameForMessage(committed, message, decision), activityReporter, {
              source: 'counselRequestEnrichment',
              classification: decision.classification,
              ingressId,
              activityMode: 'background'
            });
            return {
              kind: 'directive.advisoryEnrichmentResult',
              ok: true,
              scheduled: true,
              status: 'applied',
              applied: true,
              advisoryId: advisory.id,
              ingressId,
              advisoryHash: fnv1a(JSON.stringify(enriched)),
              campaignState: cloneJson(committed)
            };
          }
        })
      : null;
    return {
      handled: true,
      responseStrategy: 'injectAndContinue',
      abortDefaultGeneration: false,
      decision,
      campaignState: cloneJson(next),
      advisory: cloneJson(advisory),
      advisoryEnrichment: cloneJson(advisoryEnrichment || null),
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
      playerInput: message.text
    });
    const stale = currentSourceStaleResult(ingressId, message, 'before-consequential-commit', state);
    if (stale) return stale;
    const turnId = preview?.turnPacket?.turnId || preview?.turnPacket?.id || `chat-turn:${ingressId}`;
    const provisionalOutcomeId = preview?.turnPacket?.outcomePacket?.id || null;
    const warning = preview?.warningConfirmation || preview?.turnPacket?.warningConfirmation || {};
    if (warning.required === true || decision.classification === 'riskConfirmationNeeded') {
      const readied = activeReadiedCommandBearing(state, message.chatId || currentChatId());
      if (readied) {
        const returned = await returnReadiedPointForTurn(
          state,
          readied,
          'Readied Command Bearing point returned because this order requires confirmation before mechanics commit.'
        );
        state = returned.state;
        setCampaignState(state);
      }
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
    const readied = activeReadiedCommandBearing(state, message.chatId || currentChatId());
    let readiedCommandBearing = null;
    if (readied) {
      const action = commandBearingActionForTrack(preview, readied.track);
      if (action) {
        const fitValidation = await validateCommandBearingReadiedSpendFit({
          track: readied.track,
          inputText: message.text,
          context: commandBearingValidationContext({
            state,
            preview,
            action,
            decision
          }),
          generationRouter
        });
        if (fitValidation.valid !== true) {
          const returned = await returnReadiedPointForTurn(
            state,
            readied,
            `Readied Command Bearing point returned because the sent message did not fit ${readied.track === 'inspiration' ? 'Inspiration' : 'Resolve'}: ${fitValidation.summary || fitValidation.fit || 'not valid'}.`
          );
          state = returned.state;
          setCampaignState(state);
        } else {
          const attached = await attachReadiedPointToIngress(
            state,
            ingressId,
            message,
            message.chatId || currentChatId(),
            readied
          );
          state = attached.state;
          setCampaignState(state);
          if (attached.readied) {
            readiedCommandBearing = readiedSpendRequest({
              readied: attached.readied,
              action,
              ingressId,
              message,
              chatId: message.chatId || currentChatId(),
              fitValidation
            });
          }
        }
      } else {
        const returned = await returnReadiedPointForTurn(
          state,
          readied,
          'Readied Command Bearing point returned because this outcome was not eligible for that track.'
        );
        state = returned.state;
        setCampaignState(state);
      }
      const staleAfterReadied = currentSourceStaleResult(ingressId, message, 'before-consequential-readied-commit', state);
      if (staleAfterReadied) return staleAfterReadied;
    }

    let committed;
    try {
      reportActivity(activityReporter, {
        phase: 'committingOutcome',
        mode: 'blocking',
        classification: decision.classification,
        ingressId,
        turnId,
        outcomeId: provisionalOutcomeId
      });
      committed = await commitProvisionalDirectorTurn({
        readiedCommandBearing,
        generateNarration: true,
        generateCommandLogSummary: true,
        deferCommandLogSummary: true
      });
    } catch (error) {
      if (readiedCommandBearing?.readiedId || readiedCommandBearing?.id) {
        const latest = initializeCampaignRuntimeTracking(getCampaignState() || state);
        await returnReadiedPointForTurn(
          latest,
          readiedCommandBearing,
          'Readied Command Bearing point returned because the committed turn did not complete.'
        );
      }
      throw error;
    }
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
    next = await commitAdjudicatedTimeBoundary(next, {
      ingressId,
      turnId,
      outcomeId,
      playerMessage: message,
      outcomeText: text,
      sourceKind: 'committedOutcome',
      reason: 'Committed outcome time boundary adjudicated.'
    }, activityReporter);
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
    let terminalCheckpoint = null;
    let terminalCheckpointSettlement = null;
    const terminalInteractionId = committed?.terminalDecision?.pendingInteraction?.id
      || committed?.terminalDecision?.detection?.decisionId
      || activeTerminalInteractionId(next)
      || null;
    if (terminalInteractionId && typeof postTerminalOutcomeCheckpoint === 'function') {
      terminalCheckpoint = await postTerminalOutcomeCheckpoint({ interactionId: terminalInteractionId });
      next = initializeCampaignRuntimeTracking(terminalCheckpoint?.campaignState || getCampaignState() || next);
      setCampaignState(next);
      terminalCheckpointSettlement = terminalCheckpoint?.terminalCheckpointSettlement || await recordTerminalCheckpointSettlementEvent({
        kind: 'terminalOutcomeCheckpointPosted',
        ingressId,
        turnId,
        outcomeId,
        interactionId: terminalInteractionId,
        checkpointHostMessageId: terminalCheckpoint?.posted?.hostMessageId || terminalCheckpoint?.posted?.id || null,
        status: terminalCheckpoint?.ok === false ? 'failed' : (terminalCheckpoint?.duplicate ? 'duplicate' : 'posted'),
        reason: terminalCheckpoint?.reason || null
      });
    }
    if (!committed?.narrationResult?.ok) {
      const recoveryId = providerFailureRecoveryId;
      const fallbackResponseRef = dispatched.result?.entry || dispatched.result?.response || null;
      const coreResponseRecovery = providerFailureCoreRecovery;
      const fallbackResponseId = compact(fallbackResponseRef?.id || fallbackResponseRef?.responseId);
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
            coreTransactionId: coreResponseRecovery?.transactionId || findIngress(next, ingressId)?.coreTransactionId || null,
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
    let postCommitConversation = null;
    const postCommitConversationPayload = postCommitConversationPayloadForCommittedTurn({
      ingressId,
      turnId,
      outcomeId,
      committed,
      playerMessage: message,
      assistantMessageId: dispatched.result.response?.hostMessageId || null,
      assistantText: text
    });
    if (typeof schedulePostCommitConversationProcessor !== 'function' && typeof postCommitConversationProcessor === 'function') {
      try {
        reportActivity(activityReporter, {
          phase: 'postCommitConversation',
          mode: 'blocking',
          classification: decision.classification,
          ingressId,
          turnId,
          outcomeId
        });
        postCommitConversation = await postCommitConversationProcessor(postCommitConversationPayload);
        if (postCommitConversation?.campaignState) {
          next = initializeCampaignRuntimeTracking(postCommitConversation.campaignState);
          setCampaignState(next);
        }
      } catch (error) {
        next = initializeCampaignRuntimeTracking(getCampaignState() || next);
        const postCommitConversationDiagnostic = await appendPostCommitConversationFailureDiagnostic(next, {
          ingressId,
          outcomeId,
          turnId,
          error
        });
      }
    }
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
    scheduleTurnSidecars(decision, {
      ingressId,
      classification: decision.classification,
      playerText: message.text,
      turnId,
      outcomeId,
      resultBand: committed?.turnPacket?.outcomePacket?.resultBand || null,
      continuityProjection: cloneJson(committed?.turnPacket?.provenance?.continuityProjection || null),
      directorPackets: cloneJson(committed?.turnPacket?.directorPackets || null),
      visibleConsequences: committed?.turnPacket?.commandLogPacket?.visibleConsequences || []
    }, activityReporter);
    scheduleScenePhaseSealForCommittedTurn({
      state: next,
      ingressId,
      decision,
      committed,
      turnId,
      outcomeId,
      playerMessage: message,
      assistantMessageId: dispatched.result.response?.hostMessageId || null,
      assistantText: text
    }, activityReporter);
    schedulePressureArcDigestForCommittedTurn({
      state: next,
      ingressId,
      decision,
      committed,
      turnId,
      outcomeId,
      playerMessage: message,
      assistantMessageId: dispatched.result.response?.hostMessageId || null
    }, activityReporter);
    scheduleOpenWorldBoundaryForCommittedTurn({
      state: next,
      ingressId,
      decision,
      committed,
      turnId,
      outcomeId
    }, activityReporter);
    const commandLogSummaryResult = typeof scheduleCommandLogSummaryForCommittedTurn === 'function'
      ? scheduleCommandLogSummaryForCommittedTurn({
          turnPacket: committed?.turnPacket || null,
          ingressId,
          turnId,
          outcomeId,
          reason: 'postVisibleResponse'
        })
      : null;
    if (typeof schedulePostCommitConversationProcessor === 'function') {
      reportActivity(activityReporter, {
        phase: 'postCommitConversation',
        mode: 'background',
        status: 'queued',
        classification: decision.classification,
        ingressId,
        turnId,
        outcomeId
      });
      postCommitConversation = schedulePostCommitConversationProcessor(postCommitConversationPayload);
    }
    return {
      handled: true,
      responseStrategy: 'directivePosted',
      abortDefaultGeneration: true,
      decision,
      campaignState: cloneJson(next),
      response: cloneJson(dispatched.result.response),
      commandLogSummaryResult: cloneJson(commandLogSummaryResult),
      terminalCheckpoint: cloneJson(terminalCheckpoint || null),
      terminalCheckpointSettlement: cloneJson(terminalCheckpointSettlement || null),
      postCommitConversation: cloneJson(postCommitConversation || null),
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
        const next = resolvePendingInteraction(state, pending.id, {
          status: 'superseded',
          action: action || 'ambiguous-answer',
          resolutionIngressId: ingressId,
          resolvedAt: timestamp(now)
        });
        await persistState(next, `Superseded pending clarification ${pending.id} with a new clarification prompt.`);
        const stale = currentSourceStaleResult(ingressId, message, 'before-superseded-clarification-continue', next);
        if (stale) return stale;
        return continueClassifiedTurn(next, ingressId, decisionWithoutPendingResolution(decision), message, activityReporter);
      }
      let next = resolvePendingInteraction(state, pending.id, {
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
      const stale = currentSourceStaleResult(ingressId, message, 'before-clarification-answer-continue', next);
      if (stale) return stale;
      return continueClassifiedTurn(next, ingressId, decisionWithoutPendingResolution(decision), message, activityReporter);
    }
    const staleBeforeResolution = currentSourceStaleResult(ingressId, message, 'before-pending-interaction-resolution', state);
    if (staleBeforeResolution) return staleBeforeResolution;
    if (pending.kind === 'terminalOutcomeDecision') {
      if (typeof resolveTerminalOutcomeDecision !== 'function') {
        return { ok: false, reason: 'terminal-outcome-resolution-unavailable' };
      }
      const resolvedTerminal = await resolveTerminalOutcomeDecision({
        interactionId: pending.id,
        action: resolution.action || 'replayFromCheckpoint',
        resolutionIngressId: ingressId,
        resolutionHostMessageId: messageHostMessageId(message),
        playerArgument: message.text || null
      });
      const terminalCheckpointSettlement = resolvedTerminal?.terminalCheckpointSettlement || await recordTerminalCheckpointSettlementEvent({
        kind: 'terminalOutcomeCheckpointResolved',
        ingressId,
        interactionId: pending.id,
        action: resolution.action || 'replayFromCheckpoint',
        resolutionHostMessageId: messageHostMessageId(message),
        status: resolvedTerminal?.ok === false ? 'failed' : 'resolved',
        reason: resolvedTerminal?.reason || null
      });
      let next = initializeCampaignRuntimeTracking(resolvedTerminal?.campaignState || getCampaignState() || state);
      const ingressPatch = {
        status: resolvedTerminal.ok ? 'complete' : 'recoveryRequired',
        classification: cloneJson(decision),
        workerPlan: cloneJson(decision.workerPlan),
        responseStrategy: 'directivePosted',
        pendingInteractionId: pending.id,
        completedAt: timestamp(now)
      };
      if (findIngress(next, ingressId)) {
        next = await updateIngressState(next, ingressId, ingressPatch, `Resolved terminal outcome decision ${pending.id} from chat.`);
      } else {
        return {
          handled: true,
          responseStrategy: 'directivePosted',
          abortDefaultGeneration: true,
          decision,
          resolvedPendingInteraction: false,
          pendingInteractionId: pending.id,
          terminalOutcomeDecision: cloneJson(resolvedTerminal),
          terminalCheckpointSettlement: cloneJson(terminalCheckpointSettlement || null),
          reason: 'terminal-resolution-ingress-core-projection-required',
          campaignState: cloneJson(next)
        };
      }
      return {
        handled: true,
        responseStrategy: 'directivePosted',
        abortDefaultGeneration: true,
        decision,
        resolvedPendingInteraction: resolvedTerminal.ok === true,
        pendingInteractionId: pending.id,
        terminalOutcomeDecision: cloneJson(resolvedTerminal),
        terminalCheckpointSettlement: cloneJson(terminalCheckpointSettlement || null),
        campaignState: cloneJson(next)
      };
    }
    const stalePendingSource = pendingSourceStaleResult(state, pending, 'before-pending-interaction-source-resolution');
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
      commandLogSummaryResult: cloneJson(resolved.commandLogSummaryResult || null),
      postCommitConversation: cloneJson(resolved.postCommitConversation || null),
      terminalCheckpoint: cloneJson(resolved.terminalCheckpoint || null),
      terminalCheckpointSettlement: cloneJson(resolved.terminalCheckpointSettlement || null),
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
    let state = initializeCampaignRuntimeTracking(getCampaignState());
    const interaction = (state.runtimeTracking.pendingInteractions || []).find((entry) => (
      entry.status === 'pending' && (!interactionId || entry.id === interactionId)
    ));
    if (!interaction) return { ok: false, reason: 'pending-interaction-not-found' };

    const normalizedAction = compact(action || 'accept').toLowerCase();
    const stalePendingSource = ['revise', 'cancel', 'dismiss'].includes(normalizedAction)
      ? null
      : pendingSourceStaleResult(state, interaction, 'before-pending-interaction-direct-resolution');
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
      state = initializeCampaignRuntimeTracking(getCampaignState() || state);
      state = resolvePendingInteraction(state, interaction.id, {
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
    state = stateWithIngressFromFallback(state, preCommitResolutionState, resolutionIngressId);
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
    let terminalCheckpoint = null;
    let terminalCheckpointSettlement = null;
    const terminalInteractionId = committed?.terminalDecision?.pendingInteraction?.id
      || committed?.terminalDecision?.detection?.decisionId
      || activeTerminalInteractionId(state)
      || null;
    if (terminalInteractionId && typeof postTerminalOutcomeCheckpoint === 'function') {
      terminalCheckpoint = await postTerminalOutcomeCheckpoint({ interactionId: terminalInteractionId });
      state = initializeCampaignRuntimeTracking(terminalCheckpoint?.campaignState || getCampaignState() || state);
      setCampaignState(state);
      terminalCheckpointSettlement = terminalCheckpoint?.terminalCheckpointSettlement || await recordTerminalCheckpointSettlementEvent({
        kind: 'terminalOutcomeCheckpointPosted',
        ingressId: interaction.ingressId,
        resolutionIngressId: syntheticResolutionIngressId,
        pendingInteractionId: interaction.id,
        turnId,
        outcomeId,
        interactionId: terminalInteractionId,
        checkpointHostMessageId: terminalCheckpoint?.posted?.hostMessageId || terminalCheckpoint?.posted?.id || null,
        status: terminalCheckpoint?.ok === false ? 'failed' : (terminalCheckpoint?.duplicate ? 'duplicate' : 'posted'),
        reason: terminalCheckpoint?.reason || null
      });
    }
    state = resolvePendingInteraction(state, interaction.id, {
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
            coreTransactionId: coreResponseRecovery?.transactionId || findIngress(state, interaction.ingressId)?.coreTransactionId || null,
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
          ingress: findIngress(state, interaction.ingressId),
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
    scheduleTurnSidecars({
      classification: interaction.kind,
      workerPlan: { missionDirector: true, relationship: true, crew: true, ship: true, commandBearing: true, continuity: true, promptUpdate: true }
    }, {
      ingressId: interaction.ingressId,
      classification: interaction.kind,
      turnId,
      outcomeId,
      resultBand: committed?.turnPacket?.outcomePacket?.resultBand || null,
      continuityProjection: cloneJson(committed?.turnPacket?.provenance?.continuityProjection || null),
      directorPackets: cloneJson(committed?.turnPacket?.directorPackets || null),
      visibleConsequences: committed?.turnPacket?.commandLogPacket?.visibleConsequences || []
    }, activityReporter);
    const commandLogSummaryResult = typeof scheduleCommandLogSummaryForCommittedTurn === 'function'
      ? scheduleCommandLogSummaryForCommittedTurn({
          turnPacket: committed?.turnPacket || null,
          ingressId: interaction.ingressId,
          turnId,
          outcomeId,
          reason: 'postVisibleResponse'
        })
      : null;
    let postCommitConversation = null;
    const postCommitConversationPayload = postCommitConversationPayloadForCommittedTurn({
      ingressId: interaction.ingressId,
      resolutionIngressId: syntheticResolutionIngressId,
      pendingInteractionId: interaction.id,
      turnId,
      outcomeId,
      committed,
      resolutionMessage,
      playerMessage: null,
      assistantMessageId: dispatched.result.response?.hostMessageId || dispatched.result.entry?.hostMessageId || null,
      assistantText: text,
      sourceIngress: findIngress(state, interaction.ingressId)
    });
    if (typeof schedulePostCommitConversationProcessor !== 'function' && typeof postCommitConversationProcessor === 'function') {
      try {
        reportActivity(activityReporter, {
          phase: 'postCommitConversation',
          mode: 'blocking',
          classification: interaction.kind,
          ingressId: interaction.ingressId,
          turnId,
          outcomeId,
          pendingInteractionId: interaction.id,
          resolutionIngressId: syntheticResolutionIngressId
        });
        postCommitConversation = await postCommitConversationProcessor(postCommitConversationPayload);
        if (postCommitConversation?.campaignState) {
          state = initializeCampaignRuntimeTracking(postCommitConversation.campaignState);
          setCampaignState(state);
        }
      } catch (error) {
        state = initializeCampaignRuntimeTracking(getCampaignState() || state);
        const postCommitConversationDiagnostic = await appendPostCommitConversationFailureDiagnostic(state, {
          ingressId: interaction.ingressId,
          outcomeId,
          turnId,
          pendingInteractionId: interaction.id,
          resolutionIngressId: syntheticResolutionIngressId,
          error
        });
      }
    }
    if (typeof schedulePostCommitConversationProcessor === 'function') {
      reportActivity(activityReporter, {
        phase: 'postCommitConversation',
        mode: 'background',
        status: 'queued',
        classification: interaction.kind,
        ingressId: interaction.ingressId,
        turnId,
        outcomeId,
        pendingInteractionId: interaction.id,
        resolutionIngressId: syntheticResolutionIngressId
      });
      postCommitConversation = schedulePostCommitConversationProcessor(postCommitConversationPayload);
    }
    return {
      ok: true,
      action: normalizedAction,
      outcomeId,
      commandLogSummaryResult: cloneJson(commandLogSummaryResult),
      postCommitConversation: cloneJson(postCommitConversation || null),
      terminalCheckpoint: cloneJson(terminalCheckpoint || null),
      terminalCheckpointSettlement: cloneJson(terminalCheckpointSettlement || null),
      response: cloneJson(dispatched.result.response || dispatched.result.entry || null),
      campaignState: cloneJson(state)
    };
  }

  async function retryCommittedResponse({ recoveryId = null } = {}) {
    let state = initializeCampaignRuntimeTracking(getCampaignState());
    const recovery = await findOpenResponseRetryRecovery(state, { recoveryId });
    if (!recovery) return { ok: false, reason: 'response-recovery-not-found' };
    const details = recovery.details || {};
    const ingress = recovery.ingressId ? findIngress(state, recovery.ingressId) : null;
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
    if ((createRuntimeLedgerView(state).recoveryJournal || []).some((entry) => entry.id === recovery.id)) {
      state = resolveRecoveryEvent(state, recovery.id, {
        status: 'resolved',
        hostMessageId: dispatched.result?.entry?.hostMessageId || dispatched.result?.response?.hostMessageId || null,
        resolvedAt: timestamp(now)
      });
    }
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
    const responseEntry = (details.responseId || details.responseIdempotencyKey)
      ? (createRuntimeLedgerView(state || {}, { coreTurnStore }).responseLedger || []).find((entry) => (
        compact(entry.id) === compact(details.responseId || details.responseIdempotencyKey)
      )) || responseEntryForMessage(state, target)
      : responseEntryForMessage(state, target);
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
    const targetResponseId = compact(targetMetadata.idempotencyKey || target?.raw?.metadata?.idempotencyKey || '');
    if (
      !responseEntry
      || (details.responseId && compact(responseEntry.id) !== compact(details.responseId))
      || (targetResponseId && compact(responseEntry.id) !== targetResponseId)
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
            ...runtimeMetadata,
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
        authority: 'compatibilityProjection',
        projectionSource: 'coreStoreV2',
        coreProjection: responseRetryCompatibilityProjection({
          coreResponseRecovery: details.coreRecovery || null,
          responseId: sourceResponseId,
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
      authority: 'compatibilityProjection',
      projectionSource: 'coreStoreV2',
      coreProjection: responseRetryCompatibilityProjection({
        coreResponseRecovery: details.coreRecovery || null,
        coreCompletion,
        responseId: sourceResponseId,
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
    if ((createRuntimeLedgerView(next).recoveryJournal || []).some((entry) => entry.id === recovery.id)) {
      next = resolveRecoveryEvent(next, recovery.id, {
        status: 'resolved',
        reason: 'directive-response-retry-posted',
        hostMessageId: swipe.hostMessageId || targetHostMessageId,
        swipeIndex: Number.isInteger(swipe.swipeIndex) ? swipe.swipeIndex : null,
        swipeCount: Number.isInteger(swipe.swipeCount) ? swipe.swipeCount : null,
        responseRevisionId: revisionId,
        coreCompletion: coreCompletion ? {
          transactionId: coreCompletion.id || ingress?.coreTransactionId || null,
          phase: coreCompletion.phase || null
        } : null
      });
    }
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
    let existing = findIngress(state, ingressId);
    if (!existing) {
      const alias = findIngressAlias(state, message, chatId, timestamp(now));
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
      existing = findIngress(state, existing.id);
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
    let existingByHostMessage = findIngressByHostMessageId(state, hostMessageId, chatId);
    if (
      existingByHostMessage
      && existingByHostMessage.id !== existing?.id
      && existingByHostMessage.textHash === observedTextHash
      && !ingressHasDependentResponse(state, existingByHostMessage)
    ) {
      ingressId = existingByHostMessage.id;
      existing = existingByHostMessage;
    }
    if (
      existingByHostMessage
      && existingByHostMessage.id !== existing?.id
      && ingressHasDependentResponse(state, existingByHostMessage)
    ) {
      return dependentSourceRecoveryResult(state, existingByHostMessage, message, 'before-reobserve-dependent-source');
    }

    const restartCandidate = existingByHostMessage && existingByHostMessage.id !== existing?.id
      ? existingByHostMessage
      : existing;
    const sourceRestart = latestSourceRestartDecision(state, restartCandidate, message, 'before-latest-boundary-restart');
    if (sourceRestart) {
      ingressId = restartIngressIdFor(ingressId, sourceRestart.priorIngress, message);
      existing = findIngress(state, ingressId);
      existingByHostMessage = findIngressByHostMessageId(state, hostMessageId, chatId);
      if (
        existingByHostMessage
        && existingByHostMessage.id !== sourceRestart.priorIngress.id
        && existingByHostMessage.textHash === observedTextHash
        && !ingressHasDependentResponse(state, existingByHostMessage)
      ) {
        ingressId = existingByHostMessage.id;
        existing = existingByHostMessage;
      }
    }

    state = await createIngress(state, message, chatId, ingressId, {
      sourceReobserveDecision: sourceRestart?.repairDecision || null,
      priorIngressForRecovery: sourceRestart?.priorIngress || null
    });
    let decision = null;
    let stage = 'classification';
    try {
      stage = 'sceneHandshake';
      state = await settleSceneHandshake(state, message, chatId, ingressId, activityReporter);
      stage = 'classification';
      reportActivity(activityReporter, {
        phase: 'classifying',
        mode: 'blocking',
        ingressId
      });
      decision = await classify({
        text: message.text,
        context: {
          recentChat: displaySafeRecentChat(host.chat.getRecentMessages?.({ limit: 12, playerSafeOnly: true }) || []),
          activeMissionId: state.mission?.activeMissionId,
          activePhaseId: state.mission?.activePhaseId,
          knownFacts: createPlayerSafeCampaignProjection({ campaignState: state })?.mission?.knownFacts || [],
          formalObjectives: createPlayerSafeCampaignProjection({ campaignState: state })?.mission?.formalObjectives || [],
          activeDecisionPointCount: (
            state.mission?.activeDecisionPoints
            || state.mission?.availableDecisionPointIds
            || []
          ).length,
          commandAuthority: state.player?.authority || state.player?.billet,
          pendingInteraction: playerSafePendingInteraction(state)
        }
      });
      const staleAfterClassify = currentSourceStaleResult(ingressId, message, 'after-classify', state);
      if (staleAfterClassify) return staleAfterClassify;
      state = await updateIngressState(stateForIngressCheck(ingressId, state), ingressId, {
        status: 'classified',
        classification: cloneJson(decision),
        workerPlan: cloneJson(decision.workerPlan),
        responseStrategy: decision.responseStrategy,
        classifiedAt: timestamp(now)
      }, `Utility pass classified ${decision.classification}.`);
      reportActivity(activityReporter, {
        phase: 'classified',
        mode: 'blocking',
        classification: decision.classification,
        responseStrategy: decision.responseStrategy,
        ingressId
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
      const failed = await recordTurnProcessingFailure(stateForIngressCheck(ingressId, state), ingressId, message, error, stage, decision);
      return {
        handled: true,
        recoveryRequired: true,
        responseStrategy: decision?.responseStrategy || 'injectAndContinue',
        abortDefaultGeneration: ['directivePosted', 'pause'].includes(decision?.responseStrategy),
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
        const alias = latest ? findIngressAlias(latest, message, chatId, timestamp(now)) : null;
        if (!alias || alias.hostMessageId) return result;
        const next = await updateIngressState(latest, alias.id, {
          hostMessageId,
          canonicalizedAt: timestamp(now),
          canonicalizationReason: 'joined-in-flight-idless-observation'
        }, `Canonicalized campaign-chat player message ${hostMessageId}.`);
        const record = findIngress(next, alias.id);
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

  async function handleMessageEdited(payload = {}) {
    if (!messageReconciler) return { handled: false, reason: 'reconciler-unavailable' };
    const hostMessageId = eventMessageId(payload);
    const replacementText = eventReplacementText(payload)
      || (hostMessageId && typeof host?.chat?.getMessage === 'function'
        ? host.chat.getMessage(hostMessageId)?.text
        : null);
    const result = await messageReconciler.reconcileEdited({
      hostMessageId,
      ingressId: payload.ingressId || payload.ingress_id || null,
      responseId: payload.responseId || payload.response_id || null,
      replacementText,
      message: payload.message || (hostMessageId && typeof host?.chat?.getMessage === 'function'
        ? host.chat.getMessage(hostMessageId)
        : null),
      index: payload.index || payload.message?.index || null,
      chatMetadata: payload.chatMetadata || payload.chat_metadata || null,
      visibilityMap: payload.visibilityMap || null,
      autoRollback: payload?.autoRollback === true
    });
    return { handled: result.matched === true, ...result };
  }

  async function handleMessageDeleted(payload = {}) {
    if (!messageReconciler) return { handled: false, reason: 'reconciler-unavailable' };
    const result = await messageReconciler.reconcileDeleted({
      hostMessageId: eventMessageId(payload),
      ingressId: payload.ingressId || payload.ingress_id || null,
      responseId: payload.responseId || payload.response_id || null,
      message: payload.message || null,
      index: payload.index || payload.message?.index || null,
      chatMetadata: payload.chatMetadata || payload.chat_metadata || null,
      visibilityMap: payload.visibilityMap || null,
      autoRollback: payload?.autoRollback === true
    });
    return { handled: result.matched === true, ...result };
  }

  async function handleMessageVisibilityChanged(payload = {}) {
    if (!messageReconciler?.reconcileVisibilityChanged) return { handled: false, reason: 'reconciler-unavailable' };
    const hostMessageId = eventMessageId(payload);
    const visibilityInput = {
      index: payload.index ?? null,
      chatMetadata: payload.chatMetadata || payload.chat_metadata || null,
      visibilityMap: payload.visibilityMap || payload.visibility_map || null
    };
    const wrapperCarriesVisibilityEvidence = carriesVisibilityEvidence(payload, visibilityInput);
    const payloadMessage = payload.message
      ? (wrapperCarriesVisibilityEvidence ? mergeVisibilityPayloadMessage(payload.message, payload) : payload.message)
      : (wrapperCarriesVisibilityEvidence ? payload : null);
    const hostMessage = payloadMessage
      || (hostMessageId && typeof host?.chat?.getMessage === 'function'
        ? await host.chat.getMessage(hostMessageId)
        : null)
      || payload;
    const result = await messageReconciler.reconcileVisibilityChanged({
      hostMessageId,
      message: hostMessage,
      index: payload.index ?? payload.message?.index ?? hostMessage?.index ?? null,
      chatMetadata: payload.chatMetadata || payload.chat_metadata || null,
      visibilityMap: payload.visibilityMap || payload.visibility_map || null
    });
    return { handled: result.matched === true, ...result };
  }

  async function handleMessageSelectedSwipeChanged(payload = {}) {
    if (!messageReconciler?.reconcileSelectedSwipeChanged) return { handled: false, reason: 'reconciler-unavailable' };
    const hostMessageId = eventMessageId(payload);
    const result = await messageReconciler.reconcileSelectedSwipeChanged({
      hostMessageId,
      selectedSwipe: eventSelectedSwipe(payload),
      message: payload.message || (hostMessageId && typeof host?.chat?.getMessage === 'function'
        ? host.chat.getMessage(hostMessageId)
        : null),
      index: payload.index || payload.message?.index || null,
      chatMetadata: payload.chatMetadata || payload.chat_metadata || null,
      visibilityMap: payload.visibilityMap || payload.visibility_map || null
    });
    return { handled: result.matched === true, ...result };
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
    handleMessageEdited,
    handleMessageDeleted,
    handleMessageVisibilityChanged,
    handleMessageSelectedSwipeChanged,
    handleChatChanged,
    resolveInteraction,
    retryCommittedResponse,
    pendingCount: () => inFlight.size
  };
}

export const __chatTurnOrchestratorTestHooks = Object.freeze({
  fnv1a,
  isQuietGeneration,
  localOutcomeNarration,
  warningText,
  commandBearingText
});
