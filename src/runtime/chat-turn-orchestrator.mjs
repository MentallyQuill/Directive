import { isDirectiveOwnedGeneration } from '../hosts/sillytavern/generation-client.mjs';
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
  return `The order is carried out. The result is ${compact(outcome.resultBand || 'resolved')}. ${details || 'The bridge records the outcome and turns to the next decision.'}`;
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

function counselPrompt(state, playerText) {
  const safe = createPlayerSafeCampaignProjection({ campaignState: state }) || {};
  return [
    'Give the player officer concise in-character professional counsel.',
    'Separate confirmed facts, uncertainty, likely consequences, and two to four viable options.',
    'Do not expose hidden values or Director-only facts.',
    '',
    `Player request: ${playerText}`,
    `Player-safe campaign context: ${JSON.stringify({ mission: safe.mission, ship: safe.ship })}`
  ].join('\n');
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
    if (priorIngress?.invalidationType && !priorIngress.outcomeId) {
      const hostMessageId = message.hostMessageId || message.id || String(message.index ?? '');
      for (const recovery of next.runtimeTracking?.recoveryJournal || []) {
        if (
          recovery?.ingressId === priorIngress.id
          && !recovery.outcomeId
          && ['playerMessageDeleted', 'playerMessageEdited'].includes(recovery.type)
          && !['resolved', 'applied'].includes(recovery.status)
        ) {
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

  async function updateIngressState(state, ingressId, patch, summary) {
    const next = updateTurnIngress(state, ingressId, patch);
    await persistState(next, summary);
    return next;
  }

  async function dispatchAndRecord({ state, ingressId, decision, strategy, text = null, turnId = null, outcomeId = null, responseKind }) {
    setCampaignState(state);
    try {
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

  async function handleNoChange(state, ingressId, decision, message) {
    let next = state;
    if (decision.workerPlan?.promptUpdate) next = await syncPrompt(next);
    const stale = currentSourceStaleResult(ingressId, message, 'before-no-change-dispatch', next);
    if (stale) return stale;
    const dispatched = await dispatchAndRecord({
      state: next,
      ingressId,
      decision,
      strategy: 'injectAndContinue',
      responseKind: 'hostGeneration'
    });
    next = await updateIngressState(dispatched.state, ingressId, {
      status: 'complete',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: 'injectAndContinue',
      responseMessageId: null,
      completedAt: timestamp(now)
    }, `Completed ${decision.classification} utility turn.`);
    sidecarScheduler?.schedule?.({
      workerPlan: decision.workerPlan,
      turnContext: {
        ingressId,
        classification: decision.classification,
        playerText: message.text
      }
    });
    return {
      handled: true,
      responseStrategy: 'injectAndContinue',
      abortDefaultGeneration: false,
      decision,
      campaignState: cloneJson(next)
    };
  }

  async function handleRoutine(state, ingressId, decision, message) {
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
    next = await syncPrompt(next);
    const directiveOwned = decision.responseStrategy === 'directivePosted';
    const dispatched = await dispatchAndRecord({
      state: next,
      ingressId,
      decision,
      strategy: directiveOwned ? 'directivePosted' : 'injectAndContinue',
      text: directiveOwned ? localRoutineNarration() : null,
      turnId: routineId,
      responseKind: directiveOwned ? 'routineCommand' : 'hostGeneration'
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
    sidecarScheduler?.schedule?.({
      workerPlan: decision.workerPlan,
      turnContext: {
        ingressId,
        turnId: routineId,
        classification: decision.classification,
        playerText: message.text
      }
    });
    return {
      handled: true,
      responseStrategy: directiveOwned ? 'directivePosted' : 'injectAndContinue',
      abortDefaultGeneration: directiveOwned,
      decision,
      campaignState: cloneJson(next)
    };
  }

  async function continueClassifiedTurn(state, ingressId, decision, message) {
    if (decision.pendingInteractionResolution?.action) {
      return handlePendingInteractionResolution(state, ingressId, decision, message);
    }
    if (['sceneColor', 'noDirectiveAction'].includes(decision.classification)) {
      return handleNoChange(state, ingressId, decision, message);
    }
    if (decision.classification === 'routineCommand') {
      return handleRoutine(state, ingressId, decision, message);
    }
    if (decision.classification === 'counselRequest') {
      return handleCounsel(state, ingressId, decision, message);
    }
    if (decision.classification === 'clarificationNeeded') {
      return postPause(state, ingressId, decision, composePauseResponse('clarificationNeeded'), {
        kind: 'clarificationNeeded',
        message
      });
    }
    if (decision.classification === 'riskConfirmationNeeded') {
      return handleConsequential(state, ingressId, decision, message);
    }
    return handleConsequential(state, ingressId, decision, message);
  }

  async function postPause(state, ingressId, decision, text, details = {}) {
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
      responseKind: details.kind || decision.classification
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

  async function handleCounsel(state, ingressId, decision, message) {
    let text = composePauseResponse('counselRequest');
    if (generationRouter?.generate) {
      const generated = await generationRouter.generate('missionDirectorAdvisor', {
        systemPrompt: 'Respond as the relevant senior officer with concise, player-safe professional counsel.',
        prompt: counselPrompt(state, message.text),
        maxTokens: 900
      });
      const candidate = generated?.ok
        ? compact(generated.response?.text || generated.response?.content || '')
        : '';
      if (candidate) text = candidate;
    }
    const stale = currentSourceStaleResult(ingressId, message, 'before-counsel-dispatch', state);
    if (stale) return stale;
    const dispatched = await dispatchAndRecord({
      state,
      ingressId,
      decision,
      strategy: 'directivePosted',
      text,
      responseKind: 'counsel'
    });
    let next = await updateIngressState(dispatched.state, ingressId, {
      status: 'complete',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: 'directivePosted',
      responseMessageId: dispatched.result.response?.hostMessageId || null,
      completedAt: timestamp(now)
    }, 'Counsel response posted.');
    next = await syncPrompt(next);
    sidecarScheduler?.schedule?.({
      workerPlan: decision.workerPlan,
      turnContext: {
        ingressId,
        classification: decision.classification,
        playerText: message.text
      }
    });
    return {
      handled: true,
      responseStrategy: 'directivePosted',
      abortDefaultGeneration: true,
      decision,
      campaignState: cloneJson(next),
      response: cloneJson(dispatched.result.response)
    };
  }

  async function handleConsequential(state, ingressId, decision, message) {
    state = initializeCampaignRuntimeTracking(state);
    state.runtimeTracking.activeIngressId = ingressId;
    setCampaignState(state);
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
      });
    }
    if (preview?.commandBearingPrompt?.eligible === true) {
      return postPause(state, ingressId, decision, commandBearingText(preview), {
        kind: 'commandBearing',
        message,
        turnId,
        outcomeId: provisionalOutcomeId,
        options: cloneJson(preview.commandBearingPrompt.actions || [])
      });
    }

    const committed = await commitProvisionalDirectorTurn({
      generateNarration: true,
      generateCommandLogSummary: true
    });
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
      responseKind: 'committedOutcome'
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
    next = await syncPrompt(next);
    sidecarScheduler?.schedule?.({
      workerPlan: decision.workerPlan,
      turnContext: {
        ingressId,
        classification: decision.classification,
        playerText: message.text,
        turnId,
        outcomeId,
        resultBand: committed?.turnPacket?.outcomePacket?.resultBand || null,
        visibleConsequences: committed?.turnPacket?.commandLogPacket?.visibleConsequences || []
      }
    });
    return {
      handled: true,
      responseStrategy: 'directivePosted',
      abortDefaultGeneration: true,
      decision,
      campaignState: cloneJson(next),
      response: cloneJson(dispatched.result.response),
      terminalCheckpoint: cloneJson(terminalCheckpoint || null),
      committed: true
    };
  }

  async function handlePendingInteractionResolution(state, ingressId, decision, message) {
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
      });
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
        return continueClassifiedTurn(next, ingressId, decisionWithoutPendingResolution(decision), message);
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
      return continueClassifiedTurn(next, ingressId, decisionWithoutPendingResolution(decision), message);
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
      action: resolution.action || 'accept'
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
    spendTrack = null
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
      state = await syncPrompt(state);
      return { ok: true, action: normalizedAction, campaignState: cloneJson(state) };
    }

    const committed = await commitProvisionalDirectorTurn({
      spendTrack: spendTrack || (['inspiration', 'resolve'].includes(normalizedAction) ? normalizedAction : null),
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
      responseKind: 'committedOutcome'
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
      spendTrack: spendTrack || (['inspiration', 'resolve'].includes(normalizedAction) ? normalizedAction : null),
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
    state = await syncPrompt(state);
    sidecarScheduler?.schedule?.({
      workerPlan: { missionDirector: true, relationship: true, crew: true, ship: true, commandBearing: true, continuity: true, promptUpdate: true },
      turnContext: {
        ingressId: interaction.ingressId,
        classification: interaction.kind,
        turnId,
        outcomeId,
        resultBand: committed?.turnPacket?.outcomePacket?.resultBand || null,
        visibleConsequences: committed?.turnPacket?.commandLogPacket?.visibleConsequences || []
      }
    });
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

  async function processMessage(message, chatId) {
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
    if (existing && !['invalidated', 'edited', 'deleted', 'recoveryRequired'].includes(existing.status)) {
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
    const decision = await classify({
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

    return continueClassifiedTurn(state, ingressId, decision, message);
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
    if (inFlight.has(key)) return inFlight.get(key);
    const promise = enqueue(state.campaign?.id || 'campaign', () => processMessage(message, chatId))
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
      abortedHostGeneration: outcome.abortDefaultGeneration === true
    };
  }

  async function handleMessageEdited(payload = {}) {
    if (!messageReconciler) return { handled: false, reason: 'reconciler-unavailable' };
    const result = await messageReconciler.reconcileEdited({
      hostMessageId: eventMessageId(payload),
      replacementText: eventReplacementText(payload),
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
