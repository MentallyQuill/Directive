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
  const journal = state?.runtimeTracking?.modelCallJournal;
  if (!Array.isArray(journal)) return 0;
  return journal.reduce((max, entry) => {
    const match = /^model-call:(\d+):/.exec(String(entry?.id || ''));
    const sequence = match ? Number(match[1]) : 0;
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);
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
  setCampaignState = () => {}
} = {}) {
  let modelCallEventSequence = 0;
  const pendingModelCallEvents = [];

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
    return cloneJson(modelCallEvent);
  }

  return Object.freeze({
    applyPending,
    record,
    synchronize
  });
}
