import { isDirectiveOwnedGeneration } from '../hosts/sillytavern/generation-client.mjs';
import { shouldPreemptHostGenerationForTurn } from '../adjudication/utility-turn-classifier.mjs';
import {
  initializeCampaignRuntimeTracking,
  recordPendingInteraction,
  recordRecoveryEvent,
  resolveRecoveryEvent,
  resolvePendingInteraction,
  recordTurnIngress,
  updateTurnIngress
} from './state-delta-gateway.mjs';
import { composePauseResponse } from './response-dispatcher.mjs';
import { createPlayerSafeCampaignProjection } from '../generation/player-safe-prompt-context-builder.mjs';
import {
  attachReadiedCommandBearingPoint,
  returnReadiedCommandBearingPoint
} from '../command/command-bearing.mjs';
import { validateCommandBearingReadiedSpendFit } from '../command/command-bearing-fit.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
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

function shouldPreemptHostGeneration(message = {}, state = null) {
  return shouldPreemptHostGenerationForTurn(message.text || '', {
    activeMissionId: state?.mission?.activeMissionId,
    activePhaseId: state?.mission?.activePhaseId,
    activeDecisionPointCount: (
      state?.mission?.activeDecisionPoints
      || state?.mission?.availableDecisionPointIds
      || []
    ).length,
    commandAuthority: state?.player?.authority || state?.player?.billet
  });
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

const NO_OUTCOME_RECOVERY_TYPES = new Set([
  'playerMessageDeleted',
  'playerMessageEdited',
  'chatTurnProcessingFailure'
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

function narrationText(result) {
  return compact(
    result?.narrationResult?.narration?.text
    || result?.narrationResult?.narration?.content
    || result?.narrationResult?.narration
    || ''
  );
}

function localOutcomeNarration(result) {
  const packet = result?.turnPacket || {};
  const outcome = packet.outcomePacket || {};
  const visible = packet.commandLogPacket?.visibleConsequences
    || outcome.visibleConsequences
    || outcome.costs
    || [];
  const details = (Array.isArray(visible) ? visible : [visible])
    .map((entry) => compact(typeof entry === 'string' ? entry : entry?.summary || entry?.label))
    .filter(Boolean)
    .join(' ');
  return `The attempt resolves as ${compact(outcome.resultBand || 'resolved')}. ${details || 'The bridge records the outcome and turns to the next decision.'}`;
}

function localRoutineNarration() {
  return 'The order is acknowledged and folded into the working rhythm. The relevant officers carry it forward while the log records the procedure.';
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

function localDirectiveResponseVariant(responseKind) {
  if (responseKind === 'clarificationNeeded') return composePauseResponse('clarificationNeeded');
  if (responseKind === 'riskConfirmationNeeded') return composePauseResponse('riskConfirmationNeeded');
  if (responseKind === 'routineCommand') return localRoutineNarration();
  return 'The response is restated without changing the committed campaign state. The bridge holds to the same outcome and waits for your next order.';
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
  return state?.commandBearing || state?.commandStyle || {};
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
  messageReconciler = null,
  stateDeltaGateway,
  getCampaignState,
  setCampaignState,
  persistCampaignState,
  syncPromptContext,
  previewDirectorTurn,
  commitProvisionalDirectorTurn,
  postTerminalOutcomeCheckpoint = null,
  resolveTerminalOutcomeDecision = null,
  discardProvisionalDirectorTurn = null,
  postCommitConversationProcessor = null,
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

  function currentChatId() {
    return host.chat.getCurrentChatId?.() || host.chat.getCurrentBinding?.()?.chatId || null;
  }

  function activeBoundState(chatId = currentChatId()) {
    const state = getCampaignState();
    if (!state || state.campaign?.status !== 'active') return null;
    if (!state.campaignChatBinding?.chatId) return null;
    if (String(state.campaignChatBinding.chatId) !== String(chatId || '')) return null;
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

  async function syncPrompt(state, summary = 'Prompt context synchronized.') {
    if (typeof syncPromptContext !== 'function') return state;
    const next = await syncPromptContext(state);
    if (next && next !== state) {
      await persistState(next, summary);
      return next;
    }
    return getCampaignState() || state;
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

  function ingressIdFor(state, message, chatId) {
    const messageId = message.hostMessageId || message.id || message.index || 'message';
    return `ingress:${state.campaign?.id}:${chatId}:${messageId}:${fnv1a(message.text)}`;
  }

  function findIngress(state, ingressId) {
    return (state.runtimeTracking?.ingressLedger || []).find((entry) => entry.id === ingressId) || null;
  }

  function messageHostMessageId(message = {}) {
    return compact(message.hostMessageId || message.id || String(message.index ?? ''));
  }

  function staleIngressResult(state, ingressId, message, stage) {
    const current = state ? findIngress(initializeCampaignRuntimeTracking(state), ingressId) : null;
    const expectedHostMessageId = messageHostMessageId(message);
    const expectedTextHash = fnv1a(message?.text || '');
    const staleStatuses = new Set(['invalidated', 'edited', 'deleted', 'recoveryRequired']);
    const reasons = [];
    if (!current) reasons.push('missing-ingress');
    if (current && staleStatuses.has(current.status)) reasons.push(`status:${current.status}`);
    if (current?.invalidatedAt || current?.invalidationType) reasons.push('invalidated');
    if (current && expectedHostMessageId && current.hostMessageId !== expectedHostMessageId) reasons.push('host-message-changed');
    if (current && expectedTextHash && current.textHash !== expectedTextHash) reasons.push('text-hash-changed');
    if (!reasons.length) return null;
    return {
      handled: true,
      stale: true,
      responseStrategy: 'staleSource',
      abortDefaultGeneration: true,
      reason: 'source-ingress-stale',
      stage,
      staleReasons: reasons,
      record: cloneJson(current),
      campaignState: cloneJson(state || getCampaignState() || null)
    };
  }

  function currentSourceStaleResult(ingressId, message, stage, fallbackState = null) {
    return staleIngressResult(getCampaignState() || fallbackState, ingressId, message, stage);
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
    return [...(state.runtimeTracking?.responseLedger || [])].reverse().find((entry) => (
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
    recentMessages = []
  }) {
    const safe = createPlayerSafeCampaignProjection({ campaignState: state }) || {};
    const recent = (Array.isArray(recentMessages) ? recentMessages.slice(-8) : [])
      .map((entry) => ({
        role: entry.isUser === true || entry.role === 'user' ? 'user' : 'assistant',
        directiveOwned: entry.isDirectiveOwned === true || entry.directiveOwned === true,
        responseKind: responseMetadata(entry)?.responseKind || null,
        text: compact(entry.text || '').slice(0, 900)
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
      priorPlayer?.text || '(none)',
      '',
      'Current selected assistant response in chat:',
      target?.text || '',
      '',
      'Player-safe campaign context:',
      JSON.stringify({ mission: safe.mission, ship: safe.ship, crew: safe.crew }, null, 2),
      '',
      'Recent selected transcript:',
      JSON.stringify(recent, null, 2),
      '',
      'Create a distinct alternate response for the same moment. Keep it concise enough for chat play.'
    ].join('\n');
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
        priorPlayerMessageId: priorPlayer?.hostMessageId || priorPlayer?.id || null
      }
    };
  }

  async function generateDirectiveResponseSwipeText({
    state,
    target,
    priorPlayer,
    responseEntry,
    responseKind,
    recentMessages = []
  }) {
    if (generationRouter?.generate) {
      const generated = await generationRouter.generate('narration', directiveResponseSwipeRequest({
        state,
        target,
        priorPlayer,
        responseEntry,
        responseKind,
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
      return { handled: false, reason: 'campaign-intro-uses-intro-rewrite' };
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
      recentMessages: recent
    });
    const swipe = await host.chat.appendAssistantMessageSwipe({
      hostMessageId: target.hostMessageId || target.id,
      text: generated.text,
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

  async function createIngress(state, message, chatId, ingressId) {
    const priorIngress = findIngress(state, ingressId);
    let next = recordTurnIngress(state, {
      id: ingressId,
      hostMessageId: message.hostMessageId || message.id || String(message.index ?? ''),
      chatId,
      campaignId: state.campaign?.id,
      textHash: fnv1a(message.text),
      textPreview: message.text,
      receivedAt: timestamp(now),
      stateRevision: state.runtimeTracking?.revision || 0,
      status: 'classifying'
    });
    if (priorIngress && !priorIngress.outcomeId) {
      const hostMessageId = message.hostMessageId || message.id || String(message.index ?? '');
      for (const recovery of next.runtimeTracking?.recoveryJournal || []) {
        if (shouldResolveNoOutcomeRecoveryOnReobserve(priorIngress, recovery)) {
          next = resolveRecoveryEvent(next, recovery.id, {
            status: 'resolved',
            resolvedAt: timestamp(now),
            reason: 'message-reobserved',
            hostMessageId
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
    let next = initializeCampaignRuntimeTracking(getCampaignState() || state);
    const existing = findIngress(next, ingressId);
    if (existing && existing.status === 'recoveryRequired' && existing.recoveryId) {
      setCampaignState(next);
      return next;
    }
    next = recordRecoveryEvent(next, {
      id: recoveryId,
      type: 'chatTurnProcessingFailure',
      status: 'open',
      hostMessageId: messageHostMessageId(message),
      ingressId,
      outcomeId: decision?.outcomeId || null,
      recordedAt: timestamp(now),
      details: {
        stage: stage || 'processing',
        classification: cloneJson(decision || null),
        error: failure
      }
    });
    if (ingressId) {
      next = updateTurnIngress(next, ingressId, {
        status: 'recoveryRequired',
        classification: decision ? cloneJson(decision) : existing?.classification || null,
        workerPlan: decision?.workerPlan ? cloneJson(decision.workerPlan) : existing?.workerPlan || null,
        responseStrategy: decision?.responseStrategy || existing?.responseStrategy || null,
        recoveryId,
        error: failure,
        failedAt: timestamp(now)
      });
    }
    await persistState(next, `Recorded recoverable chat turn processing failure for ${ingressId || messageHostMessageId(message) || 'turn'}.`);
    setCampaignState(next);
    return next;
  }

  async function updateIngressState(state, ingressId, patch, summary) {
    const next = updateTurnIngress(state, ingressId, patch);
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
      commandBearing: attached.commandBearing,
      commandStyle: attached.commandBearing
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
      commandBearing: returned.commandBearing,
      commandStyle: returned.commandBearing
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
    activityReporter = null
  }) {
    setCampaignState(state);
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
        campaignState: state,
        ingressId,
        strategy,
        text,
        turnId,
        outcomeId,
        responseKind,
        campaignId: state.campaign?.id,
        metadata: {
          classification: decision.classification,
          workerPlan: cloneJson(decision.workerPlan || {})
        }
      });
      let next = result?.campaignState || state;
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
      failed = recordRecoveryEvent(failed, {
        id: recoveryId,
        type: 'hostResponsePostFailure',
        status: 'open',
        ingressId,
        outcomeId,
        recordedAt: timestamp(now),
        details: {
          strategy,
          text,
          turnId,
          responseKind,
          classification: decision.classification,
          workerPlan: cloneJson(decision.workerPlan || {}),
          error: failure
        }
      });
      if (ingressId) {
        failed = updateTurnIngress(failed, ingressId, {
          status: 'recoveryRequired',
          responseStrategy: strategy,
          turnId,
          outcomeId,
          recoveryId,
          lastError: failure
        });
      }
      await persistState(failed, `Recorded recoverable campaign chat response failure for ${ingressId || outcomeId || turnId || 'turn'}.`);
      error.code = error.code || failure.code;
      error.campaignState = cloneJson(failed);
      throw error;
    }
  }

  async function handleNoChange(state, ingressId, decision, message, activityReporter = null) {
    let next = state;
    reportActivity(activityReporter, {
      phase: 'scene',
      mode: 'blocking',
      classification: decision.classification,
      ingressId
    });
    if (decision.workerPlan?.promptUpdate) {
      reportActivity(activityReporter, {
        phase: 'syncingPrompt',
        mode: 'blocking',
        classification: decision.classification,
        ingressId
      });
      next = await syncPrompt(next);
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
    reportActivity(activityReporter, {
      phase: 'syncingPrompt',
      mode: 'blocking',
      classification: decision.classification,
      ingressId,
      turnId: routineId
    });
    next = await syncPrompt(next);
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
    next = await syncPrompt(next);
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
    let advisory = fallbackAdvisoryRecord({ state, ingressId, message, nowValue: recordedAt });
    reportActivity(activityReporter, {
      phase: 'counsel',
      mode: 'blocking',
      classification: decision.classification,
      ingressId
    });
    if (generationRouter?.generate) {
      const generated = await generationRouter.generate('missionDirectorAdvisor', {
        systemPrompt: 'Create a player-safe Directive UI advisory record as compact JSON. Do not write chat prose, narration, dialogue, Markdown, or hidden facts.',
        prompt: advisoryPrompt(state, message.text, decision),
        maxTokens: 650
      });
      const candidate = generated?.ok
        ? normalizeGeneratedBlock(generated.response?.text || generated.response?.content || '')
        : '';
      const parsed = parseJsonObjectText(candidate);
      if (parsed) advisory = normalizeAdvisoryRecord(parsed, { state, ingressId, message, nowValue: recordedAt });
    }
    const stale = currentSourceStaleResult(ingressId, message, 'before-counsel-record', state);
    if (stale) return stale;
    const nextCandidate = cloneJson(state);
    nextCandidate.commandCompetence = nextCandidate.commandCompetence || {};
    nextCandidate.commandCompetence.counselRequestLedger = nextCandidate.commandCompetence.counselRequestLedger || [];
    if (!nextCandidate.commandCompetence.counselRequestLedger.some((entry) => entry.id === advisory.id)) {
      nextCandidate.commandCompetence.counselRequestLedger.push(advisory);
    }
    let next = await stateDeltaGateway.commit(nextCandidate, {
      source: 'chatCounsel',
      reason: 'Player-safe advisory note recorded for Mission, Log, and Crew surfaces.',
      summary: advisory.logSummary || advisory.subject,
      domains: ['commandCompetence'],
      ingressId,
      stable: true
    });
    reportActivity(activityReporter, {
      phase: 'syncingPrompt',
      mode: 'blocking',
      classification: decision.classification,
      ingressId
    });
    next = await syncPrompt(next);
    const dispatched = await dispatchAndRecord({
      state: next,
      ingressId,
      decision,
      strategy: 'injectAndContinue',
      responseKind: 'hostGeneration',
      activityReporter
    });
    next = await updateIngressState(dispatched.state, ingressId, {
      status: 'complete',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: 'injectAndContinue',
      responseMessageId: null,
      advisoryId: advisory.id,
      completedAt: timestamp(now)
    }, 'Counsel advisory recorded and delegated to host generation.');
    scheduleTurnSidecars(decision, {
      ingressId,
      classification: decision.classification,
      playerText: message.text,
      advisoryId: advisory.id
    }, activityReporter);
    return {
      handled: true,
      responseStrategy: 'injectAndContinue',
      abortDefaultGeneration: false,
      decision,
      campaignState: cloneJson(next),
      advisory: cloneJson(advisory),
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
        generateCommandLogSummary: true
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
    const text = generatedText || localOutcomeNarration(committed);
    const dispatched = await dispatchAndRecord({
      state: next,
      ingressId,
      decision,
      strategy: 'directivePosted',
      text,
      turnId,
      outcomeId,
      responseKind: 'committedOutcome',
      activityReporter
    });
    next = dispatched.state;
    let terminalCheckpoint = null;
    const terminalInteractionId = committed?.terminalDecision?.pendingInteraction?.id
      || committed?.terminalDecision?.detection?.decisionId
      || activeTerminalInteractionId(next)
      || null;
    if (terminalInteractionId && typeof postTerminalOutcomeCheckpoint === 'function') {
      terminalCheckpoint = await postTerminalOutcomeCheckpoint({ interactionId: terminalInteractionId });
      next = initializeCampaignRuntimeTracking(terminalCheckpoint?.campaignState || getCampaignState() || next);
      setCampaignState(next);
    }
    if (!committed?.narrationResult?.ok) {
      next = recordRecoveryEvent(next, {
        id: `recovery:narration:${outcomeId}`,
        type: 'providerFailureAfterMechanicsCommit',
        status: 'open',
        ingressId,
        outcomeId,
        recordedAt: timestamp(now),
        details: {
          turnId,
          error: cloneJson(committed?.narrationResult?.error || null),
          fallbackResponsePosted: true
        }
      });
      await persistState(next, `Recorded narration recovery issue for ${outcomeId}.`);
    }
    next = await updateIngressState(next, ingressId, {
      status: 'committed',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: 'directivePosted',
      turnId,
      outcomeId,
      responseMessageId: dispatched.result.response?.hostMessageId || null,
      narrationFallbackUsed: !generatedText,
      completedAt: timestamp(now)
    }, `Completed consequential chat turn ${turnId}.`);
    let postCommitConversation = null;
    if (typeof postCommitConversationProcessor === 'function') {
      try {
        reportActivity(activityReporter, {
          phase: 'postCommitConversation',
          mode: 'blocking',
          classification: decision.classification,
          ingressId,
          turnId,
          outcomeId
        });
        postCommitConversation = await postCommitConversationProcessor({
          ingressId,
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
          messages: [
            {
              id: message.hostMessageId || message.id || `${ingressId}:player`,
              role: 'user',
              text: message.text || ''
            },
            {
              id: dispatched.result.response?.hostMessageId || `${ingressId}:directive-response`,
              role: 'assistant',
              text
            }
          ]
        });
        if (postCommitConversation?.campaignState) {
          next = initializeCampaignRuntimeTracking(postCommitConversation.campaignState);
          setCampaignState(next);
        }
      } catch (error) {
        next = recordRecoveryEvent(initializeCampaignRuntimeTracking(getCampaignState() || next), {
          id: `recovery:post-commit-conversation:${outcomeId}`,
          type: 'postCommitConversationFailed',
          status: 'open',
          ingressId,
          outcomeId,
          recordedAt: timestamp(now),
          details: {
            turnId,
            error: { message: error?.message || String(error) }
          }
        });
        await persistState(next, `Recorded post-commit conversation recovery issue for ${outcomeId}.`);
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
    next = await syncPrompt(next);
    scheduleTurnSidecars(decision, {
      ingressId,
      classification: decision.classification,
      playerText: message.text,
      turnId,
      outcomeId,
      resultBand: committed?.turnPacket?.outcomePacket?.resultBand || null,
      visibleConsequences: committed?.turnPacket?.commandLogPacket?.visibleConsequences || []
    }, activityReporter);
    return {
      handled: true,
      responseStrategy: 'directivePosted',
      abortDefaultGeneration: true,
      decision,
      campaignState: cloneJson(next),
      response: cloneJson(dispatched.result.response),
      terminalCheckpoint: cloneJson(terminalCheckpoint || null),
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
        playerArgument: message.text || null
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
        next = recordTurnIngress(next, {
          id: ingressId,
          hostMessageId: messageHostMessageId(message),
          chatId: message.chatId || currentChatId(),
          campaignId: next.campaign?.id || state.campaign?.id,
          textHash: fnv1a(message.text),
          textPreview: message.text,
          receivedAt: timestamp(now),
          stateRevision: next.runtimeTracking?.revision || 0,
          ...ingressPatch
        });
        await persistState(next, `Resolved terminal outcome decision ${pending.id} from chat.`);
      }
      return {
        handled: true,
        responseStrategy: 'directivePosted',
        abortDefaultGeneration: true,
        decision,
        resolvedPendingInteraction: resolvedTerminal.ok === true,
        pendingInteractionId: pending.id,
        terminalOutcomeDecision: cloneJson(resolvedTerminal),
        campaignState: cloneJson(next)
      };
    }
    const resolved = await resolveInteraction({
      interactionId: pending.id,
      action: resolution.action || 'accept',
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
    activityReporter = null
  } = {}) {
    let state = initializeCampaignRuntimeTracking(getCampaignState());
    const interaction = (state.runtimeTracking.pendingInteractions || []).find((entry) => (
      entry.status === 'pending' && (!interactionId || entry.id === interactionId)
    ));
    if (!interaction) return { ok: false, reason: 'pending-interaction-not-found' };

    const normalizedAction = compact(action || 'accept').toLowerCase();
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
      });
      await persistState(state, `Pending ${interaction.kind} interaction ${normalizedAction}.`);
      reportActivity(activityReporter, {
        phase: 'syncingPrompt',
        mode: 'blocking',
        classification: interaction.kind,
        ingressId: interaction.ingressId
      });
      state = await syncPrompt(state);
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
    const committed = await commitProvisionalDirectorTurn({
      confirmWarnings: interaction.kind === 'riskConfirmationNeeded' || normalizedAction === 'confirm',
      confirmedWarningIds: [],
      generateNarration: true,
      generateCommandLogSummary: true
    });
    state = initializeCampaignRuntimeTracking(committed?.campaignState || getCampaignState() || state);
    setCampaignState(state);
    const outcomeId = committed?.turnPacket?.outcomePacket?.id || interaction.outcomeId || null;
    const turnId = committed?.turnPacket?.turnId || committed?.turnPacket?.id || interaction.turnId || null;
    const generatedText = narrationText(committed);
    const text = generatedText || localOutcomeNarration(committed);
    const resolutionIngressId = `${interaction.ingressId}:resolution:${interaction.id}`;
    const dispatched = await dispatchAndRecord({
      state,
      ingressId: resolutionIngressId,
      decision: {
        classification: interaction.kind,
        workerPlan: {}
      },
      strategy: 'directivePosted',
      text,
      turnId,
      outcomeId,
      responseKind: 'committedOutcome',
      activityReporter
    });
    state = initializeCampaignRuntimeTracking(dispatched.state);
    let terminalCheckpoint = null;
    const terminalInteractionId = committed?.terminalDecision?.pendingInteraction?.id
      || committed?.terminalDecision?.detection?.decisionId
      || activeTerminalInteractionId(state)
      || null;
    if (terminalInteractionId && typeof postTerminalOutcomeCheckpoint === 'function') {
      terminalCheckpoint = await postTerminalOutcomeCheckpoint({ interactionId: terminalInteractionId });
      state = initializeCampaignRuntimeTracking(terminalCheckpoint?.campaignState || getCampaignState() || state);
      setCampaignState(state);
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
    });
    if (!committed?.narrationResult?.ok) {
      state = recordRecoveryEvent(state, {
        id: `recovery:narration:${outcomeId}`,
        type: 'providerFailureAfterMechanicsCommit',
        status: 'open',
        ingressId: interaction.ingressId,
        outcomeId,
        recordedAt: timestamp(now),
        details: {
          turnId,
          error: cloneJson(committed?.narrationResult?.error || null),
          fallbackResponsePosted: true
        }
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
    state = await syncPrompt(state);
    scheduleTurnSidecars({
      classification: interaction.kind,
      workerPlan: { missionDirector: true, relationship: true, crew: true, ship: true, commandBearing: true, continuity: true, promptUpdate: true }
    }, {
      ingressId: interaction.ingressId,
      classification: interaction.kind,
      turnId,
      outcomeId,
      resultBand: committed?.turnPacket?.outcomePacket?.resultBand || null,
      visibleConsequences: committed?.turnPacket?.commandLogPacket?.visibleConsequences || []
    }, activityReporter);
    return {
      ok: true,
      action: normalizedAction,
      outcomeId,
      terminalCheckpoint: cloneJson(terminalCheckpoint || null),
      response: cloneJson(dispatched.result.response || dispatched.result.entry || null),
      campaignState: cloneJson(state)
    };
  }

  async function retryCommittedResponse({ recoveryId = null } = {}) {
    let state = initializeCampaignRuntimeTracking(getCampaignState());
    const recoveries = state.runtimeTracking.recoveryJournal || [];
    const recovery = [...recoveries].reverse().find((entry) => (
      entry.type === 'hostResponsePostFailure'
      && entry.status === 'open'
      && (!recoveryId || entry.id === recoveryId)
    ));
    if (!recovery) return { ok: false, reason: 'response-recovery-not-found' };
    const details = recovery.details || {};
    const decision = {
      classification: details.classification || 'directorResponseNeeded',
      workerPlan: cloneJson(details.workerPlan || {})
    };
    const dispatched = await dispatchAndRecord({
      state,
      ingressId: recovery.ingressId,
      decision,
      strategy: details.strategy || 'directivePosted',
      text: details.text,
      turnId: details.turnId || null,
      outcomeId: recovery.outcomeId || null,
      responseKind: details.responseKind || 'committedOutcome'
    });
    state = initializeCampaignRuntimeTracking(dispatched.state);
    state = resolveRecoveryEvent(state, recovery.id, {
      status: 'resolved',
      hostMessageId: dispatched.result?.entry?.hostMessageId || dispatched.result?.response?.hostMessageId || null,
      resolvedAt: timestamp(now)
    });
    if (recovery.ingressId) {
      state = updateTurnIngress(state, recovery.ingressId, {
        status: recovery.outcomeId ? 'committed' : 'complete',
        responseMessageId: dispatched.result?.entry?.hostMessageId || dispatched.result?.response?.hostMessageId || null,
        recoveryId: null,
        lastError: null,
        completedAt: timestamp(now)
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
    const ingressId = ingressIdFor(state, message, chatId);
    const existing = findIngress(state, ingressId);
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

    state = await createIngress(state, message, chatId, ingressId);
    let decision = null;
    let stage = 'classification';
    try {
      reportActivity(activityReporter, {
        phase: 'classifying',
        mode: 'blocking',
        ingressId
      });
      decision = await classify({
        text: message.text,
        context: {
          recentChat: host.chat.getRecentMessages?.({ limit: 12, playerSafeOnly: true }) || [],
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
      state = await updateIngressState(getCampaignState() || state, ingressId, {
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
      const failed = await recordTurnProcessingFailure(getCampaignState() || state, ingressId, message, error, stage, decision);
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
    const activityReporter = typeof payload.turnActivityReporter === 'function' ? payload.turnActivityReporter : null;
    if (inFlight.has(key)) return inFlight.get(key);
    const promise = enqueue(state.campaign?.id || 'campaign', () => processMessage(message, chatId, activityReporter))
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
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
    const preemptHostGeneration = shouldPreemptHostGeneration(message, state);
    if (preemptHostGeneration && typeof abort === 'function') abort(true);
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
      preemptedHostGeneration: preemptHostGeneration,
      abortedHostGeneration: preemptHostGeneration || outcome.abortDefaultGeneration === true
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
      replacementText,
      autoRollback: payload?.autoRollback === true
    });
    return { handled: result.matched === true, ...result };
  }

  async function handleMessageDeleted(payload = {}) {
    if (!messageReconciler) return { handled: false, reason: 'reconciler-unavailable' };
    const result = await messageReconciler.reconcileDeleted({
      hostMessageId: eventMessageId(payload),
      autoRollback: payload?.autoRollback === true
    });
    return { handled: result.matched === true, ...result };
  }

  async function handleChatChanged() {
    const state = getCampaignState();
    if (!state?.campaignChatBinding) {
      await host.prompt?.clear?.({ reason: 'no-active-campaign' });
      return { active: false };
    }
    const active = String(currentChatId() || '') === String(state.campaignChatBinding.chatId || '');
    if (active) {
      const next = await syncPrompt(initializeCampaignRuntimeTracking(state), 'Prompt context rebuilt after chat change.');
      return { active: true, campaignState: cloneJson(next) };
    }
    await host.prompt?.clear?.({ reason: 'unbound-chat', preservePacket: true });
    return { active: false, suspended: true };
  }

  return {
    observePlayerMessage,
    interceptGeneration,
    handleMessageEdited,
    handleMessageDeleted,
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
