import {
  initializeCampaignRuntimeTracking,
  recordModelCallEvent
} from './state-delta-gateway.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestampFromNow(now) {
  if (typeof now === 'function') return now();
  if (typeof now === 'string' && now.trim()) return now;
  return new Date().toISOString();
}

export function maxModelCallEventSequence(state = null) {
  const resumeSequence = Number(state?.runtimeResume?.modelCallEventSequence || 0);
  const journal = state?.runtimeTracking?.modelCallJournal;
  if (!Array.isArray(journal)) return Number.isFinite(resumeSequence) ? resumeSequence : 0;
  return journal.reduce((max, entry) => {
    const match = /^model-call:(\d+):/.exec(String(entry?.id || ''));
    const sequence = match ? Number(match[1]) : 0;
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, Number.isFinite(resumeSequence) ? resumeSequence : 0);
}

export function gameplayStateFingerprint(state) {
  const snapshot = cloneJson(state ?? null);
  if (snapshot?.runtimeTracking) {
    delete snapshot.runtimeTracking.modelCallJournal;
  }
  return JSON.stringify(snapshot);
}

export function createRuntimeModelCallJournal({
  now = null,
  getCampaignState = () => null,
  setCampaignState = () => {},
  resolveCoreDiagnosticTarget = null,
  appendCoreDiagnostic = null
} = {}) {
  let modelCallEventSequence = 0;
  const pendingModelCallEvents = [];
  let coreDiagnosticQueue = Promise.resolve();

  function enqueueCoreDiagnostic(modelCallEvent = {}) {
    if (typeof appendCoreDiagnostic !== 'function' || typeof resolveCoreDiagnosticTarget !== 'function') return;
    let target = null;
    try {
      target = resolveCoreDiagnosticTarget(modelCallEvent);
    } catch {
      target = null;
    }
    if (!target?.transactionId) return;
    const diagnosticEvent = {
      type: 'modelCall',
      id: `core-diagnostic:${modelCallEvent.id}`,
      modelCallId: modelCallEvent.id,
      roleId: modelCallEvent.roleId || null,
      providerKind: modelCallEvent.providerKind || null,
      status: modelCallEvent.status || null,
      providerId: modelCallEvent.providerId || null,
      model: modelCallEvent.model || null,
      requestHash: modelCallEvent.requestHash || null,
      parseStatus: modelCallEvent.parseStatus || null,
      validationStatus: modelCallEvent.validationStatus || null,
      appliedStatus: modelCallEvent.appliedStatus || null,
      latencyMs: modelCallEvent.latencyMs ?? null,
      retryable: modelCallEvent.retryable === true,
      errorCode: modelCallEvent.errorCode || null,
      recordedAt: modelCallEvent.recordedAt || timestampFromNow(now),
      ingressId: target.ingressId || null,
      sourceFrameId: target.sourceFrameId || null,
      hostMessageId: target.hostMessageId || null
    };
    coreDiagnosticQueue = coreDiagnosticQueue
      .then(() => appendCoreDiagnostic(target.transactionId, diagnosticEvent))
      .catch(() => null);
  }

  function synchronize(state = getCampaignState()) {
    modelCallEventSequence = Math.max(modelCallEventSequence, maxModelCallEventSequence(state));
  }

  function applyPending(state) {
    if (!state || pendingModelCallEvents.length === 0) return state;
    let next = initializeCampaignRuntimeTracking(state);
    synchronize(next);
    const seen = new Set((next.runtimeTracking.modelCallJournal || []).map((entry) => entry.id));
    for (const event of pendingModelCallEvents) {
      if (seen.has(event.id)) continue;
      next = recordModelCallEvent(next, event);
      seen.add(event.id);
    }
    return next;
  }

  function record(event = {}) {
    const campaignState = getCampaignState();
    synchronize(campaignState);
    const modelCallEvent = {
      id: `model-call:${++modelCallEventSequence}:${event.roleId || 'unknown'}`,
      ...cloneJson(event),
      campaignRevision: campaignState?.runtimeTracking?.revision || 0,
      recordedAt: timestampFromNow(now)
    };
    pendingModelCallEvents.push(modelCallEvent);
    if (pendingModelCallEvents.length > 200) pendingModelCallEvents.shift();
    if (campaignState) {
      setCampaignState(applyPending(campaignState));
    }
    enqueueCoreDiagnostic(modelCallEvent);
    return cloneJson(modelCallEvent);
  }

  async function flushCoreDiagnostics() {
    await coreDiagnosticQueue;
  }

  return Object.freeze({
    applyPending,
    flushCoreDiagnostics,
    record,
    synchronize
  });
}
