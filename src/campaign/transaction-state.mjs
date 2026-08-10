const DEFAULT_TURN_HISTORY_LIMIT = 8;
const MIN_TURN_HISTORY_LIMIT = 2;
const MAX_TURN_HISTORY_LIMIT = 20;
const V1_NARRATION_TURN_KIND = 'directive.v1NarrationTurn';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value ?? '').trim();
}

function historyLimit(value, fallback = DEFAULT_TURN_HISTORY_LIMIT) {
  const numeric = Math.round(Number(value));
  const fallbackNumeric = Math.round(Number(fallback));
  const candidate = value !== null && value !== undefined && value !== '' && Number.isFinite(numeric)
    ? numeric
    : (Number.isFinite(fallbackNumeric) ? fallbackNumeric : DEFAULT_TURN_HISTORY_LIMIT);
  return Math.max(
    MIN_TURN_HISTORY_LIMIT,
    Math.min(MAX_TURN_HISTORY_LIMIT, candidate),
  );
}

function requireTurnLedger(campaignState) {
  if (!campaignState || typeof campaignState !== 'object' || Array.isArray(campaignState)) {
    throw new TypeError('campaignState must be an object');
  }
  const ledger = campaignState.turnLedger;
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger) || !Array.isArray(ledger.entries)) {
    const error = new Error('V1 narration custody requires a turnLedger with an entries array.');
    error.code = 'DIRECTIVE_V1_TURN_LEDGER_REQUIRED';
    throw error;
  }
  return ledger;
}

function entryForTurn(nextState, turnId) {
  const entry = nextState.turnLedger.entries.find((candidate) => candidate.turnId === turnId);
  if (!entry) {
    const error = new Error(`Unknown V1 narration turn "${turnId}".`);
    error.code = 'DIRECTIVE_V1_NARRATION_TURN_UNKNOWN';
    throw error;
  }
  return entry;
}

export function pruneTurnSaveHistory(campaignState, value = null) {
  const next = cloneJson(campaignState);
  const ledger = requireTurnLedger(next);
  const limit = historyLimit(value, next.settings?.maxTurnSaveHistory);
  ledger.entries = ledger.entries.slice(-limit);
  ledger.historyLimit = limit;
  return next;
}

export function createV1DirectorCustodyTurnPacket(turnPacket) {
  if (!turnPacket || typeof turnPacket !== 'object' || Array.isArray(turnPacket)) {
    throw new TypeError('turnPacket must be an object');
  }
  if (turnPacket.kind !== V1_NARRATION_TURN_KIND
    || !compact(turnPacket.turnId)
    || turnPacket.semanticAuthority !== 'acceptedPairSettlement'
    || turnPacket.semanticStateDeltaApplied !== false
    || turnPacket.narratorPacket?.sourceTurnId !== turnPacket.turnId) {
    const error = new Error('Director custody accepts only an exact V1 narration turn packet.');
    error.code = 'DIRECTIVE_V1_NARRATION_PACKET_REQUIRED';
    throw error;
  }
  for (const forbidden of [
    'outcomePacket',
    'stateDelta',
    'commandLogPacket',
    'provisionalOutcome',
    'finalOutcome',
    'commandBearingPrompt',
    'competencePacket',
  ]) {
    if (Object.hasOwn(turnPacket, forbidden)) {
      const error = new Error(`V1 narration turn contains retired semantic field "${forbidden}".`);
      error.code = 'DIRECTIVE_V1_NARRATION_PACKET_FORBIDDEN_FIELD';
      throw error;
    }
  }
  return cloneJson(turnPacket);
}

export function commitV1DirectorCustodyTurn(campaignState, custodyTurnPacket) {
  const turnPacket = createV1DirectorCustodyTurnPacket(custodyTurnPacket);
  const next = cloneJson(campaignState);
  const ledger = requireTurnLedger(next);
  const existing = ledger.entries.find((entry) => entry.turnId === turnPacket.turnId);
  if (!existing) {
    ledger.entries.push({
      turnId: turnPacket.turnId,
      semanticAuthority: 'acceptedPairSettlement',
      semanticStateDeltaApplied: false,
      narrationStatus: 'pending',
      narration: null,
      narrationFailures: [],
    });
  }
  ledger.lastCommittedTurnId = turnPacket.turnId;
  return pruneTurnSaveHistory(next);
}

export function recordNarrationSuccess(campaignState, turnId, narrationResult) {
  const id = compact(turnId);
  const next = cloneJson(campaignState);
  requireTurnLedger(next);
  const entry = entryForTurn(next, id);
  entry.narrationStatus = 'complete';
  entry.narration = cloneJson(narrationResult);
  entry.narrationFailures = Array.isArray(entry.narrationFailures) ? entry.narrationFailures : [];
  next.turnLedger.lastNarratedTurnId = id;
  if (next.turnLedger.pendingNarrationRecovery?.turnId === id) {
    next.turnLedger.pendingNarrationRecovery = null;
  }
  return next;
}

export function recordNarrationFailure(campaignState, turnId, failure) {
  const id = compact(turnId);
  const next = cloneJson(campaignState);
  requireTurnLedger(next);
  const entry = entryForTurn(next, id);
  const failureRecord = {
    turnId: id,
    failedAt: failure?.failedAt || new Date().toISOString(),
    directiveGenerationStartedAt: failure?.directiveGenerationStartedAt || failure?.generationStartedAt || null,
    generationStartedAt: failure?.generationStartedAt || failure?.directiveGenerationStartedAt || null,
    providerId: failure?.providerId || null,
    message: failure?.message || String(failure || 'Narration failed.'),
    retryable: failure?.retryable !== false,
  };
  if (entry.narrationStatus !== 'complete') entry.narrationStatus = 'failed';
  entry.narrationFailures = [...(entry.narrationFailures || []), failureRecord];
  next.turnLedger.pendingNarrationRecovery = failureRecord;
  return next;
}
