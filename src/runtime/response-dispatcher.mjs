import {
  initializeCampaignRuntimeTracking,
  recordDirectiveResponse
} from './state-delta-gateway.mjs';
import { prefixCampaignReplyHeader } from '../time/campaign-time-header.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim();
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

export function composePauseResponse(type, context = {}) {
  if (type === 'clarificationNeeded') {
    return context.question || 'The officer at the relevant station pauses. "I can carry that out, Commander, but I need the target and the intended method before I proceed."';
  }
  if (type === 'riskConfirmationNeeded') {
    const warnings = (context.warnings || []).filter(Boolean);
    return warnings.length
      ? `A department head raises an immediate concern. ${warnings.join(' ')} "Do you still want us to proceed?"`
      : 'A department head flags a serious foreseeable risk before the order is carried out. "Do you still want us to proceed, Commander?"';
  }
  if (type === 'commandBearing') {
    return context.text || 'The moment hangs before the order becomes final. Directive has identified an eligible Command Bearing intervention; accept the result or choose the available intervention.';
  }
  if (type === 'counselRequest') {
    return 'Directive files a player-safe advisory note for Mission, Log, and Crew context, then hands the scene back to chat.';
  }
  return context.text || 'The bridge waits for the missing decision before the scene can proceed.';
}

export function createResponseDispatcher({
  host,
  getCampaignState = null,
  setCampaignState = null,
  persist = null,
  now = null
} = {}) {
  if (!host?.chat?.postAssistantMessage) {
    throw new Error('ResponseDispatcher requires host.chat.postAssistantMessage.');
  }

  function resolveState(campaignState) {
    const source = campaignState || getCampaignState?.();
    if (!source) throw new Error('ResponseDispatcher requires campaign state.');
    return initializeCampaignRuntimeTracking(source);
  }

  function findExisting(campaignState, idempotencyKey) {
    const state = initializeCampaignRuntimeTracking(campaignState);
    return (state.runtimeTracking.responseLedger || []).find((entry) => (
      idempotencyKey && entry.id === idempotencyKey
    )) || null;
  }

  async function acceptState(next, summary) {
    setCampaignState?.(next);
    if (typeof persist === 'function') await persist(next, summary);
    return next;
  }

  async function delegate({
    campaignState = null,
    ingressId,
    turnId = null,
    outcomeId = null,
    responseType = 'hostGeneration',
    idempotencyKey = null
  } = {}) {
    const state = resolveState(campaignState);
    const key = idempotencyKey || `directive-response:${state.campaign?.id || 'campaign'}:${ingressId || turnId || 'turn'}:host`;
    const existing = findExisting(state, key);
    if (existing) return { ok: true, duplicate: true, entry: cloneJson(existing), campaignState: state };
    let hostContinuation = null;
    if (responseType === 'hostGeneration' && typeof host.chat.continueHostGeneration === 'function') {
      hostContinuation = await host.chat.continueHostGeneration({
        ingressId,
        turnId,
        outcomeId,
        reason: 'directive-inject-and-continue'
      });
    }
    const entry = {
      id: key,
      ingressId,
      turnId,
      outcomeId,
      strategy: 'injectAndContinue',
      responseKind: responseType,
      postedAt: timestamp(now),
      status: 'delegated',
      hostContinuation: cloneJson(hostContinuation)
    };
    const next = recordDirectiveResponse(state, entry);
    await acceptState(next, `Delegated response for ${ingressId || turnId || 'campaign turn'} to host generation.`);
    return {
      ok: true,
      duplicate: false,
      entry: cloneJson(entry),
      hostContinuation: cloneJson(hostContinuation),
      campaignState: cloneJson(next)
    };
  }

  async function post({
    campaignState = null,
    text,
    ingressId = null,
    turnId = null,
    outcomeId = null,
    responseType = 'narration',
    strategy = 'directivePosted',
    idempotencyKey = null,
    metadata = {}
  } = {}) {
    const state = resolveState(campaignState);
    const responseText = compact(prefixCampaignReplyHeader(text, state));
    if (!responseText) {
      const error = new Error('Directive-posted response requires non-empty text.');
      error.code = 'DIRECTIVE_RESPONSE_TEXT_REQUIRED';
      throw error;
    }
    const key = idempotencyKey || `directive-response:${state.campaign?.id || 'campaign'}:${ingressId || outcomeId || turnId || 'turn'}:${responseType}`;
    const existing = findExisting(state, key);
    if (existing) {
      return { ok: true, duplicate: true, entry: cloneJson(existing), campaignState: state };
    }
    const posted = await host.chat.postAssistantMessage({
      text: responseText,
      campaignId: state.campaign?.id || null,
      turnId,
      outcomeId,
      responseKind: responseType,
      idempotencyKey: key,
      extra: { runtimeMetadata: cloneJson(metadata) }
    });
    const entry = {
      id: key,
      ingressId,
      turnId,
      outcomeId,
      hostMessageId: posted?.hostMessageId || posted?.message?.id || null,
      strategy: strategy === 'pause' ? 'pause' : 'directivePosted',
      responseKind: responseType,
      postedAt: timestamp(now),
      status: posted?.duplicate ? 'alreadyPosted' : 'posted'
    };
    const next = recordDirectiveResponse(state, entry);
    await acceptState(next, `Posted Directive ${responseType} response for ${ingressId || outcomeId || turnId || 'campaign turn'}.`);
    return {
      ok: true,
      duplicate: posted?.duplicate === true,
      posted: cloneJson(posted),
      response: cloneJson(posted),
      entry: cloneJson(entry),
      campaignState: cloneJson(next)
    };
  }

  async function dispatch(options = {}) {
    return options.strategy === 'injectAndContinue'
      ? delegate(options)
      : post({ ...options, responseType: options.responseKind || options.responseType });
  }

  return { post, delegate, dispatch };
}
