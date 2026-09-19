import { assertGenerationActive, generationAbortedError } from '../runtime/generation-cancellation.mjs';

function exhausted() {
  const error = new Error('character_turn_attempt_limit');
  error.code = 'DIRECTIVE_TURN_ATTEMPT_LIMIT';
  throw error;
}

/** One object per turn. Claims are synchronous so concurrent roles cannot race. */
export function createTurnAttemptBudget({ limit = 10, signal } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError('turn-attempt-limit-invalid');
  assertGenerationActive(signal);
  let used = 0;
  let closed = false;
  const assertActive = () => { assertGenerationActive(signal); if (closed) throw generationAbortedError(); };
  const reservations = new Map();
  const onAbort = () => reservations.clear();
  signal?.addEventListener('abort', onAbort, { once: true });
  const reserved = () => [...reservations.values()].reduce((sum, entry) => sum + entry.remaining, 0);
  return Object.freeze({
    reserve(owner, count) {
      assertActive();
      if (typeof owner !== 'string' || !owner || !Number.isSafeInteger(count) || count < 1) throw new TypeError('turn-attempt-reservation-invalid');
      if ([...reservations.values()].some(entry => entry.owner === owner) || used + reserved() + count > limit) exhausted();
      const token = Object.freeze({ owner });
      reservations.set(token, { owner, remaining: count });
      return token;
    },
    claim({ reservation = null } = {}) {
      assertActive();
      if (reservation !== null) {
        const entry = reservations.get(reservation);
        if (!entry || entry.remaining < 1) exhausted();
        entry.remaining--;
        if (entry.remaining === 0) reservations.delete(reservation);
      } else if (used + reserved() >= limit) exhausted();
      used++;
      return used;
    },
    release(reservation) {
      const released = reservations.get(reservation)?.remaining ?? 0;
      reservations.delete(reservation);
      return released;
    },
    dispose() {
      closed = true;
      reservations.clear();
      signal?.removeEventListener('abort', onAbort);
    },
    get used() { return used; },
    get remaining() { return limit - used; },
    get available() { return limit - used - reserved(); },
  });
}
