export const V1_ACCEPTED_PAIR_RECOVERY_KIND = 'directive.acceptedPairRecovery.v1';

const MODES = new Set(['none', 'pair-retry', 'reconcile-required']);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function compact(value) {
  return String(value ?? '').trim();
}

function recoveryError(message) {
  const error = new Error(message);
  error.code = 'DIRECTIVE_ACCEPTED_PAIR_RECOVERY_INVALID';
  return error;
}

export function acceptedPairFingerprint(snapshot) {
  return compact(snapshot?.source?.sourceRangeHash) || null;
}

export function noAcceptedPairRecovery() {
  return {
    kind: V1_ACCEPTED_PAIR_RECOVERY_KIND,
    mode: 'none',
    reasonCode: null,
    pair: null,
  };
}

export function pairRetryRecovery({ snapshot, ingressId = null, reasonCode, persistenceAttempts = 0 } = {}) {
  const fingerprint = acceptedPairFingerprint(snapshot);
  if (!fingerprint) throw recoveryError('Pair retry recovery requires an accepted-pair fingerprint.');
  return {
    kind: V1_ACCEPTED_PAIR_RECOVERY_KIND,
    mode: 'pair-retry',
    reasonCode: compact(reasonCode) || 'accepted-pair-retry-required',
    pair: {
      fingerprint,
      snapshot: clone(snapshot),
      ingressId: compact(ingressId) || null,
      persistenceAttempts: Number.isInteger(persistenceAttempts) && persistenceAttempts >= 0
        ? persistenceAttempts
        : 0,
    },
  };
}

export function reconcileRequiredRecovery(reasonCode = 'source-reconciliation-required') {
  return {
    kind: V1_ACCEPTED_PAIR_RECOVERY_KIND,
    mode: 'reconcile-required',
    reasonCode: compact(reasonCode) || 'source-reconciliation-required',
    pair: null,
  };
}

export function assertAcceptedPairRecovery(value) {
  if (!value || value.kind !== V1_ACCEPTED_PAIR_RECOVERY_KIND || !MODES.has(value.mode)) {
    throw recoveryError('Accepted-pair recovery state is invalid.');
  }
  if (value.mode === 'pair-retry') {
    if (!value.pair || !compact(value.pair.fingerprint) || !value.pair.snapshot) {
      throw recoveryError('Pair retry recovery is missing its exact pair.');
    }
  } else if (value.pair !== null) {
    throw recoveryError('Only pair retry recovery may retain a pair.');
  }
  return value;
}

export function createAcceptedPairCallBudget({ maxAutomatic = 1, maxManual = 1 } = {}) {
  const limits = { automatic: maxAutomatic, manual: maxManual };
  if (!Object.values(limits).every((value) => Number.isInteger(value) && value >= 0)) {
    throw recoveryError('Accepted-pair call-budget limits must be nonnegative integers.');
  }
  const usage = new Map();
  function entry(fingerprint) {
    const key = compact(fingerprint);
    if (!key) throw recoveryError('Accepted-pair call budget requires a fingerprint.');
    if (!usage.has(key)) usage.set(key, { automatic: 0, manual: 0 });
    return { key, counts: usage.get(key) };
  }
  return Object.freeze({
    reserve(fingerprint, attemptKind = 'automatic') {
      if (!Object.hasOwn(limits, attemptKind)) return false;
      const { counts } = entry(fingerprint);
      if (counts[attemptKind] >= limits[attemptKind]) return false;
      counts[attemptKind] += 1;
      return true;
    },
    release(fingerprint, attemptKind = 'automatic') {
      if (!Object.hasOwn(limits, attemptKind)) return;
      const { counts } = entry(fingerprint);
      counts[attemptKind] = Math.max(0, counts[attemptKind] - 1);
    },
    inspect(fingerprint) {
      const { counts } = entry(fingerprint);
      return clone(counts);
    },
    clear(fingerprint) {
      const key = compact(fingerprint);
      if (key) usage.delete(key);
    },
  });
}
