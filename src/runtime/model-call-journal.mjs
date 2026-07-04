import {
  initializeCampaignRuntimeTracking
} from './state-delta-gateway.mjs';
import { readRuntimeCoreProjections } from './runtime-ledger-view.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestampFromNow(now) {
  if (typeof now === 'function') return now();
  if (typeof now === 'string' && now.trim()) return now;
  return new Date().toISOString();
}

function modelCallSequenceFromId(id) {
  const match = /^model-call:(\d+):/.exec(String(id || ''));
  const sequence = match ? Number(match[1]) : 0;
  return Number.isFinite(sequence) ? sequence : 0;
}

export function maxModelCallEventSequence(state = null) {
  const resumeSequence = Number(state?.runtimeResume?.modelCallEventSequence || 0);
  const journal = modelCallDiagnosticsFromCoreProjections(state);
  if (!journal.length) return Number.isFinite(resumeSequence) ? resumeSequence : 0;
  return journal.reduce((max, entry) => {
    const sequence = modelCallSequenceFromId(entry?.id);
    return sequence > max ? sequence : max;
  }, Number.isFinite(resumeSequence) ? resumeSequence : 0);
}

function modelCallDiagnosticsFromCoreProjections(state = null) {
  const projections = readRuntimeCoreProjections(state || {});
  return Array.isArray(projections.modelCallDiagnostics) ? projections.modelCallDiagnostics : [];
}

function modelCallIdsForDedupe(state = null) {
  return new Set([
    ...modelCallDiagnosticsFromCoreProjections(state).map((entry) => entry?.id || entry?.modelCallId)
  ].filter(Boolean));
}

export function gameplayStateFingerprint(state) {
  const snapshot = cloneJson(state ?? null);
  if (snapshot?.runtimeTracking) {
    delete snapshot.runtimeTracking.modelCallJournal;
  }
  if (snapshot?.runtimeResume) {
    delete snapshot.runtimeResume;
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

  function coreDiagnosticTargetForEvent(modelCallEvent = {}) {
    if (typeof appendCoreDiagnostic !== 'function' || typeof resolveCoreDiagnosticTarget !== 'function') return;
    try {
      return resolveCoreDiagnosticTarget(modelCallEvent) || null;
    } catch {
      return null;
    }
  }

  function enqueueCoreDiagnostic(modelCallEvent = {}, target = null) {
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

  function recordResumeCursor(state, modelCallEvent = {}) {
    if (!state) return state;
    const next = initializeCampaignRuntimeTracking(state);
    const sequence = modelCallSequenceFromId(modelCallEvent.id);
    next.runtimeResume = {
      ...(next.runtimeResume || {}),
      kind: next.runtimeResume?.kind || 'directive.runtimeResumeCursor.v1',
      modelCallEventSequence: Math.max(
        maxModelCallEventSequence(next),
        Number.isFinite(sequence) ? sequence : 0
      )
    };
    return next;
  }

  function synchronize(state = getCampaignState()) {
    modelCallEventSequence = Math.max(modelCallEventSequence, maxModelCallEventSequence(state));
  }

  function applyPending(state) {
    if (!state || pendingModelCallEvents.length === 0) return state;
    let next = initializeCampaignRuntimeTracking(state);
    synchronize(next);
    const seen = modelCallIdsForDedupe(next);
    for (const event of pendingModelCallEvents) {
      next = recordResumeCursor(next, event);
      if (seen.has(event.id)) continue;
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
    const coreDiagnosticTarget = coreDiagnosticTargetForEvent(modelCallEvent);
    if (coreDiagnosticTarget?.transactionId) {
      modelCallEvent.coreDiagnosticPrimary = true;
    }
    pendingModelCallEvents.push(modelCallEvent);
    if (pendingModelCallEvents.length > 200) pendingModelCallEvents.shift();
    if (campaignState) {
      setCampaignState(applyPending(campaignState));
    }
    enqueueCoreDiagnostic(modelCallEvent, coreDiagnosticTarget);
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
