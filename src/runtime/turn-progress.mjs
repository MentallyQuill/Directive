export const TURN_PROGRESS_STAGES = Object.freeze([
  'reviewing-events',
  'directing-story',
  'reviewing-episode',
  'updating-characters',
  'saving',
  'activating-preset',
  'building-context',
  'assembling-prompt',
  'installing-prompt',
]);

const STAGES = new Set(TURN_PROGRESS_STAGES);
const PHASES = new Set(['waiting-model', 'validating-response']);
const CANCELED_REASON_CODES = new Set([
  'provider-aborted',
  'director-aborted',
  'aborted',
  'canceled',
  'cancelled',
  'generation-aborted',
]);

function defaultClock() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function canceledResult(result) {
  return result?.status === 'canceled'
    || result?.status === 'cancelled'
    || CANCELED_REASON_CODES.has(String(result?.reasonCode || '').toLowerCase());
}

function canceledError(error) {
  return error?.name === 'AbortError'
    || error?.code === 'ABORT_ERR'
    || error?.code === 'DIRECTIVE_GENERATION_ABORTED';
}

export function createTurnProgressReporter({
  clock = defaultClock,
  idFactory = (sequence) => `directive-operation-${sequence}`,
} = {}) {
  const listeners = new Set();
  const active = new Map();
  let epoch = 0;
  let sequence = 0;

  function readClock(fallback = null) {
    try {
      const value = Number(clock());
      return Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function publish(event) {
    for (const listener of listeners) {
      try {
        const pending = listener({ ...event });
        Promise.resolve(pending).catch(() => null);
      } catch {
        // Progress is presentation-only. Subscriber failures never affect work.
      }
    }
  }

  function createScope() {
    return Object.freeze({ epoch });
  }

  function scopeIsCurrent(scope) {
    return scope?.epoch === epoch;
  }

  function subscribeTurnProgress(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    for (const operation of active.values()) {
      try {
        const pending = listener({ ...operation });
        Promise.resolve(pending).catch(() => null);
      } catch {
        // Replay has the same isolation guarantee as live events.
      }
    }
    return () => listeners.delete(listener);
  }

  function resetTurnProgress() {
    epoch += 1;
    active.clear();
    publish({ type: 'reset', startedAt: readClock(0) });
  }

  async function run(stage, task, { scope = createScope() } = {}) {
    if (typeof task !== 'function') throw new TypeError('turn progress operation requires a task');
    if (!STAGES.has(stage) || !scopeIsCurrent(scope)) {
      return task({ onAttempt() {}, onPhase() {} });
    }

    let operationId;
    let startedAt;
    try {
      sequence += 1;
      operationId = String(idFactory(sequence));
      startedAt = readClock();
      if (!operationId || !Number.isFinite(startedAt)) throw new Error('invalid progress identity');
    } catch {
      return task({ onAttempt() {}, onPhase() {} });
    }

    const operation = { type: 'start', operationId, stage, startedAt };
    active.set(operationId, operation);
    publish(operation);

    const onAttempt = (attempt) => {
      if (!scopeIsCurrent(scope) || active.get(operationId) !== operation) return;
      if (!Number.isInteger(attempt) || attempt < 1 || attempt <= (operation.attempt || 0)) return;
      operation.attempt = attempt;
      operation.phase = 'waiting-model';
      operation.phaseStartedAt = readClock(startedAt);
      publish({
        type: 'update', operationId, stage, startedAt,
        phase: operation.phase, phaseStartedAt: operation.phaseStartedAt, attempt,
      });
    };

    const onPhase = (phase) => {
      if (!scopeIsCurrent(scope) || active.get(operationId) !== operation) return;
      if (!PHASES.has(phase) || phase !== 'validating-response') return;
      operation.phase = phase;
      operation.phaseStartedAt = readClock(startedAt);
      publish({
        type: 'update', operationId, stage, startedAt,
        phase, phaseStartedAt: operation.phaseStartedAt,
        ...(operation.attempt ? { attempt: operation.attempt } : {}),
      });
    };

    try {
      const result = await task({ onAttempt, onPhase });
      if (scopeIsCurrent(scope) && active.get(operationId) === operation) {
        active.delete(operationId);
        publish({
          type: 'finish',
          operationId,
          stage,
          startedAt,
          endedAt: readClock(startedAt),
          outcome: result?.ok === false
            ? (canceledResult(result) ? 'canceled' : 'failed')
            : 'complete',
        });
      }
      return result;
    } catch (error) {
      if (scopeIsCurrent(scope) && active.get(operationId) === operation) {
        active.delete(operationId);
        publish({
          type: 'finish',
          operationId,
          stage,
          startedAt,
          endedAt: readClock(startedAt),
          outcome: canceledError(error) ? 'canceled' : 'failed',
        });
      }
      throw error;
    }
  }

  return Object.freeze({
    createScope,
    run,
    subscribeTurnProgress,
    resetTurnProgress,
  });
}
