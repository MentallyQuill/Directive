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

  function activePendingInteraction(state, interactionId = null) {
    return (state.runtimeTracking?.pendingInteractions || []).find((entry) => (
      entry.status === 'pending'
      && (!interactionId || entry.id === interactionId)
    )) || null;
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

  async function createIngress(state, message, chatId, ingressId) {
    const next = recordTurnIngress(state, {
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

  async function postPause(state, ingressId, decision, text, details = {}) {
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
      committed: true
    };
  }

  async function handlePendingInteractionResolution(state, ingressId, decision) {
    const resolution = decision.pendingInteractionResolution || {};
    const pending = activePendingInteraction(state, resolution.interactionId || null);
    if (!pending) {
      return postPause(state, ingressId, {
        ...decision,
        classification: 'clarificationNeeded',
        responseStrategy: 'pause'
      }, composePauseResponse('clarificationNeeded'), {
        kind: 'clarificationNeeded'
      });
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
    state = await updateIngressState(getCampaignState() || state, ingressId, {
      status: 'classified',
      classification: cloneJson(decision),
      workerPlan: cloneJson(decision.workerPlan),
      responseStrategy: decision.responseStrategy,
      classifiedAt: timestamp(now)
    }, `Utility pass classified ${decision.classification}.`);

    if (decision.pendingInteractionResolution?.action) {
      return handlePendingInteractionResolution(state, ingressId, decision);
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
        kind: 'clarificationNeeded'
      });
    }
    if (decision.classification === 'riskConfirmationNeeded') {
      return handleConsequential(state, ingressId, decision, message);
    }
    return handleConsequential(state, ingressId, decision, message);
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
