export const COMMAND_BEARING_TRACKS = Object.freeze(['inspiration', 'resolve']);
export const COMMAND_BEARING_OUTCOME_LADDER = Object.freeze([
  'Great Failure',
  'Failure',
  'Partial Failure',
  'Partial Success',
  'Success',
  'Great Success'
]);

const TRACKS = COMMAND_BEARING_TRACKS;
const OUTCOME_LADDER = COMMAND_BEARING_OUTCOME_LADDER;
const SPENDABLE_OUTCOMES = new Set(['Great Failure', 'Failure', 'Partial Failure', 'Partial Success']);
const EVIDENCE_STRENGTHS = new Set(['weak', 'moderate', 'strong', 'defining']);
const FIT_LABELS = new Set(['strong', 'plausible', 'thin', 'mismatch', 'notConsequential']);
const CLOSURE_TYPES = new Set(['quest', 'storyArc', 'milestone', 'thread', 'chapter', 'commandCrucible', 'scene']);
const CLOSURE_CONFIDENCE = new Set(['low', 'medium', 'high']);
const RELATIONSHIP_IMPACTS = new Set([
  'Great Strain',
  'Strain',
  'Slight Strain',
  'No Clear Change',
  'Slight Improvement',
  'Improvement',
  'Great Improvement',
  'Mixed',
  'Unclear'
]);
const HIDDEN_STATE_PATTERNS = Object.freeze([
  /\bdirector[-\s]?only\b/i,
  /\bhidden\s+(?:truth|state|score|fact|note|value|delta|memory)\b/i,
  /\bhidden\s+relationship\s+(?:score|value|delta|memory)\b/i,
  /\bunrevealed\s+(?:truth|fact|state|score|note|memory)\b/i,
  /\bsecret\s+(?:score|truth|fact|value|note|memory)\b/i,
  /\braw\s+(?:relationship|provider|model|score|value|delta|output)\b/i,
  /\bprivate\s+(?:npc|character)\s+(?:thought|thoughts|motive|motives|feeling|feelings)\b/i
]);

const DEFAULT_THRESHOLDS = Object.freeze([
  { rank: 1, title: 'Practiced', marks: 0 },
  { rank: 2, title: 'Established', marks: 2 },
  { rank: 3, title: 'Proven', marks: 5 },
  { rank: 4, title: 'Defining', marks: 9 },
  { rank: 5, title: 'Exemplary', marks: 14 }
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function compact(value = '', maxLength = 600) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function uniqueStrings(values = [], maxItems = 12, maxLength = 240) {
  const seen = new Set();
  const output = [];
  for (const value of asArray(values)) {
    const text = compact(value, maxLength);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= maxItems) break;
  }
  return output;
}

function compactId(value = '') {
  return compact(value, 160);
}

function uniqueBy(items = [], keyFn = (item) => item) {
  const seen = new Set();
  const output = [];
  for (const item of asArray(items)) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function nowTimestamp(now = null) {
  if (typeof now === 'function') return now();
  if (typeof now === 'string' && now.trim()) return now;
  return new Date().toISOString();
}

function normalizeTrack(track) {
  const key = String(track || '').trim().toLowerCase();
  if (!TRACKS.includes(key)) {
    throw new Error(`Unknown Command Bearing track "${track}"`);
  }
  return key;
}

function maybeTrack(track) {
  const key = String(track || '').trim().toLowerCase();
  return TRACKS.includes(key) ? key : null;
}

function titleForRank(thresholds, rank) {
  return thresholds.find((threshold) => threshold.rank === rank)?.title || `Rank ${rank}`;
}

function rankForMarks(thresholds, marks) {
  const ordered = [...thresholds].sort((left, right) => Number(left.marks || 0) - Number(right.marks || 0));
  let rank = 1;
  for (const threshold of ordered) {
    if (Number(marks || 0) >= Number(threshold.marks || 0)) {
      rank = Number(threshold.rank || rank);
    }
  }
  return rank;
}

function nextThresholdForRank(thresholds, rank) {
  const ordered = [...thresholds].sort((left, right) => Number(left.rank || 0) - Number(right.rank || 0));
  return ordered.find((threshold) => Number(threshold.rank || 0) > Number(rank || 1)) || null;
}

function pointCapForRank(rank) {
  return Number(rank || 1) >= 3 ? 2 : 1;
}

function normalizeThresholds(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_THRESHOLDS;
  return source
    .map((item) => ({
      rank: Math.max(1, Number(item?.rank) || 1),
      title: compact(item?.title) || `Rank ${Math.max(1, Number(item?.rank) || 1)}`,
      marks: Math.max(0, Number(item?.marks) || 0)
    }))
    .sort((left, right) => left.marks - right.marks);
}

function legacyTrackSource(input, track) {
  return input?.tracks?.[track] || input?.[track] || {};
}

function normalizeTrackState(input, track, thresholds) {
  const source = legacyTrackSource(input, track);
  const marks = Math.max(0, Number(source.marks) || 0);
  const rank = rankForMarks(thresholds, marks);
  const pointCap = pointCapForRank(rank);
  const points = Math.min(Math.max(0, Number(source.points) || 0), pointCap);
  const awardedSourceIds = uniqueStrings(source.awardedSourceIds || source.awardedDecisionIds, 500, 240);
  return {
    rank,
    rankTitle: titleForRank(thresholds, rank),
    marks,
    points,
    pointCap,
    earnedRecords: Array.isArray(source.earnedRecords) ? cloneJson(source.earnedRecords) : [],
    awardedSourceIds,
    // Transitional alias for current pre-alpha callers. Remove once every caller
    // reads commandBearing.tracks.* directly.
    awardedDecisionIds: awardedSourceIds
  };
}

function normalizeLedgerMap(value) {
  return isObject(value) ? cloneJson(value) : {};
}

function normalizeEvidenceLedger(value = {}) {
  const records = Array.isArray(value.records) ? cloneJson(value.records) : [];
  return {
    schemaVersion: 1,
    records,
    bySourceOutcomeId: normalizeLedgerMap(value.bySourceOutcomeId),
    byArcId: normalizeLedgerMap(value.byArcId),
    byThreadId: normalizeLedgerMap(value.byThreadId),
    byQuestId: normalizeLedgerMap(value.byQuestId)
  };
}

function normalizeReviewLedger(value = {}) {
  return {
    schemaVersion: 1,
    records: Array.isArray(value.records) ? cloneJson(value.records) : [],
    reviewedClosureIds: normalizeLedgerMap(value.reviewedClosureIds)
  };
}

function normalizeReadied(value = null) {
  if (!isObject(value) || !value.id) return null;
  const track = maybeTrack(value.track);
  if (!track) return null;
  return {
    id: compactId(value.id),
    track,
    status: compact(value.status) || 'readied',
    saveId: compactId(value.saveId),
    chatId: compactId(value.chatId),
    ingressId: compactId(value.ingressId),
    hostMessageId: compactId(value.hostMessageId),
    createdAt: compact(value.createdAt),
    updatedAt: compact(value.updatedAt),
    expiresOn: compact(value.expiresOn) || 'nextPlayerMessage'
  };
}

function attachLegacyTrackAliases(commandBearing) {
  commandBearing.inspiration = commandBearing.tracks.inspiration;
  commandBearing.resolve = commandBearing.tracks.resolve;
  return commandBearing;
}

function totalReservePoints(commandBearing) {
  return TRACKS.reduce((total, track) => total + Number(commandBearing?.tracks?.[track]?.points || 0), 0);
}

export function refreshCommandBearing(commandBearing) {
  const input = isObject(commandBearing) ? cloneJson(commandBearing) : {};
  const thresholds = normalizeThresholds(input.thresholds);
  const next = {
    version: 1,
    tracks: {},
    reserve: isObject(input.reserve) ? cloneJson(input.reserve) : {},
    thresholds,
    awardedSources: normalizeLedgerMap(input.awardedSources),
    spendLedger: normalizeLedgerMap(input.spendLedger),
    recoveryLedger: normalizeLedgerMap(input.recoveryLedger),
    evidenceLedger: normalizeEvidenceLedger(input.evidenceLedger),
    reviewLedger: normalizeReviewLedger(input.reviewLedger),
    readied: normalizeReadied(input.readied),
    noMoralityScore: true
  };

  for (const track of TRACKS) {
    next.tracks[track] = normalizeTrackState(input, track, thresholds);
  }

  next.reserve.absoluteCapacity = Number(next.reserve.absoluteCapacity || 2);
  next.reserve.capacity = Math.min(
    next.reserve.absoluteCapacity,
    TRACKS.some((track) => Number(next.tracks[track].rank || 1) >= 3) ? 2 : 1
  );
  next.reserve.lastRecoveryId = compactId(next.reserve.lastRecoveryId);

  return attachLegacyTrackAliases(next);
}

export function migrateCommandBearingState(campaignState = {}) {
  const source = campaignState.commandBearing || {};
  return refreshCommandBearing(source);
}

export function applyCommandMarkAwards(commandBearing, earnedRecords = []) {
  const next = refreshCommandBearing(commandBearing);
  for (const record of earnedRecords || []) {
    const track = normalizeTrack(record.track);
    const sourceId = compactId(record.decisionId || record.sourceId || record.closureId || record.id);
    const sourceKey = sourceId ? `${sourceId}:${track}` : null;
    if (!sourceKey || next.awardedSources[sourceKey]) {
      continue;
    }
    const stored = {
      ...cloneJson(record),
      track,
      sourceId,
      decisionId: compactId(record.decisionId || sourceId),
      summary: compact(record.summary || record.awardSummary || record.playerFacingSummary)
    };
    next.tracks[track].earnedRecords = [
      ...(next.tracks[track].earnedRecords || []),
      stored
    ];
    next.tracks[track].marks = Number(next.tracks[track].marks || 0) + 1;
    next.tracks[track].awardedSourceIds = uniqueStrings([
      ...(next.tracks[track].awardedSourceIds || []),
      sourceId
    ], 500, 240);
    next.tracks[track].awardedDecisionIds = next.tracks[track].awardedSourceIds;
    next.awardedSources[sourceKey] = {
      sourceId,
      track,
      awardedAtOutcomeId: record.outcomeId || record.sourceOutcomeId || null,
      summary: stored.summary
    };
  }
  return refreshCommandBearing(next);
}

export function recoverCommandBearing(commandBearing, {
  recoveryId,
  track
}) {
  const id = compactId(recoveryId);
  if (!id) {
    throw new Error('recoveryId is required');
  }
  const key = normalizeTrack(track);
  const next = refreshCommandBearing(commandBearing);
  if (next.recoveryLedger[id]) {
    return {
      applied: false,
      reason: 'Recovery already applied.',
      commandBearing: next
    };
  }
  const reserveFull = totalReservePoints(next) >= Number(next.reserve.capacity || 0);
  const trackFull = Number(next.tracks[key].points || 0) >= Number(next.tracks[key].pointCap || 0);
  const applied = !reserveFull && !trackFull;
  if (applied) {
    next.tracks[key].points = Number(next.tracks[key].points || 0) + 1;
  }
  next.reserve.lastRecoveryId = id;
  next.recoveryLedger[id] = {
    track: key,
    applied,
    reason: applied ? 'Recovered one Command Bearing point.' : 'Recovery produced no point because reserve or track cap was full.'
  };
  const refreshed = refreshCommandBearing(next);
  return {
    applied,
    reason: refreshed.recoveryLedger[id].reason,
    commandBearing: refreshed
  };
}

export function improveOutcomeByCommandPoint(resultBand) {
  const index = OUTCOME_LADDER.indexOf(resultBand);
  if (index < 0) {
    throw new Error(`Unknown result band "${resultBand}"`);
  }
  return OUTCOME_LADDER[Math.min(index + 2, OUTCOME_LADDER.length - 1)];
}

export function evaluateCommandBearingSpend(commandBearing, {
  outcomeId,
  resultBand,
  eligibleTracks = [],
  rationale = {}
}) {
  const id = compactId(outcomeId);
  if (!id) {
    throw new Error('outcomeId is required');
  }
  const next = refreshCommandBearing(commandBearing);
  if (!SPENDABLE_OUTCOMES.has(resultBand)) {
    return {
      eligible: false,
      reason: 'Command Bearing points cannot improve Success or Great Success.',
      options: []
    };
  }
  if (next.spendLedger[id]) {
    return {
      eligible: false,
      reason: 'A Command Bearing point has already been spent on this outcome.',
      options: []
    };
  }
  const allowed = new Set((eligibleTracks || []).map(normalizeTrack));
  const options = TRACKS
    .filter((track) => allowed.has(track))
    .filter((track) => Number(next.tracks[track].points || 0) > 0)
    .map((track) => ({
      track,
      label: track === 'inspiration' ? 'Use Inspiration' : 'Use Resolve',
      from: resultBand,
      to: improveOutcomeByCommandPoint(resultBand),
      rationale: rationale[track] || ''
    }));
  return {
    eligible: options.length > 0,
    reason: options.length > 0 ? 'Command Bearing point available.' : 'No eligible Command Bearing point is available.',
    options
  };
}

export function spendCommandBearingPoint(commandBearing, {
  outcomeId,
  track,
  resultBand,
  eligibleTracks = [],
  rationale = '',
  readiedId = null,
  ingressId = null,
  hostMessageId = null
}) {
  const key = normalizeTrack(track);
  const next = refreshCommandBearing(commandBearing);
  const eligibility = evaluateCommandBearingSpend(next, {
    outcomeId,
    resultBand,
    eligibleTracks,
    rationale: { [key]: rationale }
  });
  const option = eligibility.options.find((item) => item.track === key);
  if (!option) {
    return {
      applied: false,
      reason: eligibility.reason,
      commandBearing: next
    };
  }
  next.tracks[key].points = Number(next.tracks[key].points || 0) - 1;
  next.spendLedger[outcomeId] = {
    outcomeId,
    ingressId: compactId(ingressId),
    hostMessageId: compactId(hostMessageId),
    readiedId: compactId(readiedId),
    track: key,
    from: option.from,
    to: option.to,
    rationale: compact(rationale)
  };
  next.readied = null;
  const refreshed = refreshCommandBearing(next);
  return {
    applied: true,
    from: option.from,
    to: option.to,
    commandBearing: refreshed
  };
}

export function createCommandBearingInterventionPrompt(commandBearing, options) {
  const eligibility = evaluateCommandBearingSpend(commandBearing, options);
  return {
    kind: 'directive.commandBearingInterventionPrompt',
    outcomeId: options.outcomeId,
    resultBand: options.resultBand,
    eligible: eligibility.eligible,
    reason: eligibility.reason,
    actions: [
      ...eligibility.options,
      {
        track: null,
        label: 'Accept Outcome',
        from: options.resultBand,
        to: options.resultBand
      }
    ]
  };
}

export function readyCommandBearingPoint(commandBearing, {
  readiedId,
  track,
  saveId = '',
  chatId = '',
  createdAt = null
}) {
  const key = normalizeTrack(track);
  const id = compactId(readiedId);
  if (!id) throw new Error('readiedId is required');
  const next = refreshCommandBearing(commandBearing);
  if (Number(next.tracks[key].points || 0) <= 0) {
    return {
      applied: false,
      reason: `No ${key === 'inspiration' ? 'Inspiration' : 'Resolve'} points are available.`,
      commandBearing: next
    };
  }
  next.readied = {
    id,
    track: key,
    status: 'readied',
    saveId: compactId(saveId),
    chatId: compactId(chatId),
    ingressId: '',
    hostMessageId: '',
    createdAt: nowTimestamp(createdAt),
    updatedAt: nowTimestamp(createdAt),
    expiresOn: 'nextPlayerMessage'
  };
  return {
    applied: true,
    reason: `${key === 'inspiration' ? 'Inspiration' : 'Resolve'} readied for your next sent message.`,
    commandBearing: refreshCommandBearing(next)
  };
}

export function cancelReadiedCommandBearingPoint(commandBearing, {
  readiedId = null,
  reason = 'Readied point canceled.'
} = {}) {
  const next = refreshCommandBearing(commandBearing);
  if (!next.readied) {
    return { applied: false, reason: 'No Command Bearing point is readied.', commandBearing: next };
  }
  if (readiedId && next.readied.id !== readiedId) {
    return { applied: false, reason: 'Readied point did not match.', commandBearing: next };
  }
  next.readied = null;
  return { applied: true, reason, commandBearing: refreshCommandBearing(next) };
}

export function attachReadiedCommandBearingPoint(commandBearing, {
  readiedId,
  ingressId,
  hostMessageId = '',
  chatId = ''
}) {
  const next = refreshCommandBearing(commandBearing);
  if (!next.readied) {
    return { applied: false, reason: 'No Command Bearing point is readied.', commandBearing: next, readied: null };
  }
  if (readiedId && next.readied.id !== readiedId) {
    return { applied: false, reason: 'Readied point did not match.', commandBearing: next, readied: null };
  }
  if (chatId && next.readied.chatId && next.readied.chatId !== chatId) {
    return { applied: false, reason: 'Readied point belongs to a different chat.', commandBearing: next, readied: null };
  }
  const id = compactId(ingressId);
  if (!id) throw new Error('ingressId is required');
  next.readied = {
    ...next.readied,
    status: 'attached',
    ingressId: id,
    hostMessageId: compactId(hostMessageId),
    updatedAt: nowTimestamp()
  };
  return { applied: true, reason: 'Readied point attached to player message.', commandBearing: refreshCommandBearing(next), readied: cloneJson(next.readied) };
}

export function returnReadiedCommandBearingPoint(commandBearing, {
  readiedId = null,
  reason = 'Readied point returned.'
} = {}) {
  return cancelReadiedCommandBearingPoint(commandBearing, { readiedId, reason });
}

function validationResult({ accepted, records = [], rejections = [], sanitizedDiagnostics = {}, touchedPaths = [], idempotencyKeys = [] }) {
  return {
    accepted: accepted === true && rejections.length === 0,
    records: cloneJson(records),
    rejections: cloneJson(rejections),
    sanitizedDiagnostics: cloneJson(sanitizedDiagnostics),
    touchedPaths: uniqueStrings(touchedPaths, 100, 240),
    idempotencyKeys: uniqueStrings(idempotencyKeys, 100, 240)
  };
}

function rejection(code, message, path = '$') {
  return { code, message, path };
}

function textContainsHiddenLeak(value) {
  const text = compact(value, 1200);
  return Boolean(text) && HIDDEN_STATE_PATTERNS.some((pattern) => pattern.test(text));
}

function objectContainsHiddenLeak(value) {
  const queue = [value];
  while (queue.length) {
    const current = queue.shift();
    if (typeof current === 'string' && textContainsHiddenLeak(current)) return true;
    if (Array.isArray(current)) queue.push(...current);
    else if (isObject(current)) queue.push(...Object.values(current));
  }
  return false;
}

export function validateCommandBearingClosureSignal(proposal, {
  roleId = 'utilityTurnClassifier'
} = {}) {
  const rejections = [];
  if (roleId !== 'utilityTurnClassifier') {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_ROLE_FORBIDDEN', 'Closure signals must come from the Utility classifier.', '$.roleId'));
  }
  const signal = isObject(proposal?.closureSignals) ? proposal.closureSignals : (isObject(proposal) ? proposal : null);
  if (!signal) {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CLOSURE_SIGNAL_REQUIRED', 'Closure signal must be an object.'));
    return validationResult({ accepted: false, rejections });
  }
  if (typeof signal.possibleClosure !== 'boolean') {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CLOSURE_BOOLEAN_REQUIRED', 'possibleClosure must be boolean.', '$.possibleClosure'));
  }
  if (!CLOSURE_CONFIDENCE.has(signal.confidence)) {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CLOSURE_CONFIDENCE_INVALID', 'confidence must be low, medium, or high.', '$.confidence'));
  }
  const closureTypes = uniqueStrings(signal.closureTypes, 8, 80);
  for (const type of closureTypes) {
    if (!CLOSURE_TYPES.has(type)) {
      rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CLOSURE_TYPE_INVALID', `Unknown closure type "${type}".`, '$.closureTypes'));
    }
  }
  if (textContainsHiddenLeak(signal.playerFacingReason)) {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_HIDDEN_LEAK', 'Closure signal contains hidden-state language.', '$.playerFacingReason'));
  }
  const record = {
    possibleClosure: signal.possibleClosure === true,
    confidence: signal.confidence,
    closureTypes,
    playerFacingReason: compact(signal.playerFacingReason, 300)
  };
  return validationResult({
    accepted: rejections.length === 0,
    records: rejections.length ? [] : [record],
    rejections,
    sanitizedDiagnostics: { roleId, signalAccepted: rejections.length === 0 },
    touchedPaths: [],
    idempotencyKeys: []
  });
}

export function validateCommandBearingClosureCandidate(candidate, {
  existingReviewLedger = null
} = {}) {
  const rejections = [];
  const closureId = compactId(candidate?.closureId);
  const closureType = compact(candidate?.closureType, 80);
  if (!closureId) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CLOSURE_ID_REQUIRED', 'closureId is required.', '$.closureId'));
  if (!CLOSURE_TYPES.has(closureType)) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CLOSURE_TYPE_INVALID', 'closureType is invalid.', '$.closureType'));
  if (candidate?.source === 'utilityClosureSignal') {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_UTILITY_NOT_AUTHORITATIVE', 'Utility signal cannot prove closure.', '$.source'));
  }
  if (!Array.isArray(candidate?.proof) || candidate.proof.length === 0) {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CLOSURE_PROOF_REQUIRED', 'Closure proof is required.', '$.proof'));
  }
  if (existingReviewLedger?.reviewedClosureIds?.[closureId]) {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CLOSURE_DUPLICATE', 'Closure was already reviewed.', '$.closureId'));
  }
  if (objectContainsHiddenLeak(candidate)) {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_HIDDEN_LEAK', 'Closure candidate contains hidden-state language.'));
  }
  const record = {
    closureId,
    closureType,
    source: compact(candidate?.source || 'committedState', 80),
    proof: uniqueStrings(candidate?.proof, 8, 240),
    utilitySuggested: candidate?.utilitySuggested === true,
    reviewEligible: candidate?.reviewEligible === true && rejections.length === 0,
    evidenceIds: uniqueStrings(candidate?.evidenceIds, 50, 160)
  };
  return validationResult({
    accepted: rejections.length === 0,
    records: rejections.length ? [] : [record],
    rejections,
    sanitizedDiagnostics: { closureId, closureType },
    touchedPaths: ['commandBearing.reviewLedger'],
    idempotencyKeys: closureId ? [`closure:${closureId}`] : []
  });
}

export function validateCommandBearingEvidenceProposal(proposal, {
  sourceOutcomeId = null,
  sourceTurnId = null,
  suppliedQuestIds = [],
  suppliedThreadIds = [],
  suppliedArcIds = []
} = {}) {
  const rejections = [];
  const records = [];
  const allowedQuestIds = new Set(uniqueStrings(suppliedQuestIds, 100, 160));
  const allowedThreadIds = new Set(uniqueStrings(suppliedThreadIds, 100, 160));
  const allowedArcIds = new Set(uniqueStrings(suppliedArcIds, 100, 160));
  const evidence = asArray(proposal?.evidence);
  if (!Array.isArray(proposal?.evidence)) {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_EVIDENCE_ARRAY_REQUIRED', 'evidence must be an array.', '$.evidence'));
  }
  if ('markAwarded' in (proposal || {}) || 'awardedTrack' in (proposal || {})) {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_EVIDENCE_CANNOT_AWARD', 'Evidence proposal cannot award Marks.'));
  }
  for (const [index, item] of evidence.entries()) {
    const path = `$.evidence[${index}]`;
    const primarySignal = maybeTrack(item?.primarySignal);
    const trackSignals = uniqueStrings(item?.trackSignals, 4, 80).map(maybeTrack).filter(Boolean);
    const strength = compact(item?.strength, 80);
    const criteria = item?.criteria || {};
    const recordSourceOutcomeId = compactId(item?.sourceOutcomeId || sourceOutcomeId);
    const recordSourceTurnId = compactId(item?.sourceTurnId || sourceTurnId);
    const itemErrors = [];
    if (!primarySignal) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_TRACK_INVALID', 'primarySignal must be inspiration or resolve.', `${path}.primarySignal`));
    if (trackSignals.length === 0) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_TRACK_SIGNAL_REQUIRED', 'At least one track signal is required.', `${path}.trackSignals`));
    if (!EVIDENCE_STRENGTHS.has(strength)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_STRENGTH_INVALID', 'strength is invalid.', `${path}.strength`));
    if (!recordSourceOutcomeId) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_SOURCE_REQUIRED', 'sourceOutcomeId is required.', `${path}.sourceOutcomeId`));
    if (sourceOutcomeId && recordSourceOutcomeId !== sourceOutcomeId) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_SOURCE_MISMATCH', 'sourceOutcomeId must match supplied outcome.', `${path}.sourceOutcomeId`));
    for (const key of ['agency', 'commitment', 'causality']) {
      if (typeof criteria[key] !== 'boolean') itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_CRITERIA_REQUIRED', `${key} must be boolean.`, `${path}.criteria.${key}`));
    }
    if (!compact(item?.actionSummary)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_SUMMARY_REQUIRED', 'actionSummary is required.', `${path}.actionSummary`));
    if (!compact(item?.playerFacingSummary)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_SUMMARY_REQUIRED', 'playerFacingSummary is required.', `${path}.playerFacingSummary`));
    if (objectContainsHiddenLeak(item)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_HIDDEN_LEAK', 'Evidence contains hidden-state language.', path));
    const questId = compactId(item?.questId);
    const threadId = compactId(item?.threadId);
    const arcId = compactId(item?.arcId);
    const chapterId = compactId(item?.chapterId);
    const commandCrucibleId = compactId(item?.commandCrucibleId);
    if (questId && allowedQuestIds.size > 0 && !allowedQuestIds.has(questId)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_SOURCE_UNKNOWN', `Unknown quest "${questId}".`, `${path}.questId`));
    if (threadId && allowedThreadIds.size > 0 && !allowedThreadIds.has(threadId)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_SOURCE_UNKNOWN', `Unknown thread "${threadId}".`, `${path}.threadId`));
    if (arcId && allowedArcIds.size > 0 && !allowedArcIds.has(arcId)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_SOURCE_UNKNOWN', `Unknown arc "${arcId}".`, `${path}.arcId`));
    rejections.push(...itemErrors);
    if (itemErrors.length === 0) {
      const id = compactId(item.id) || `bearing-evidence.${recordSourceOutcomeId}.${primarySignal}`;
      records.push({
        id,
        sourceTurnId: recordSourceTurnId,
        sourceOutcomeId: recordSourceOutcomeId,
        questId,
        threadId,
        arcId,
        chapterId,
        commandCrucibleId,
        primarySignal,
        trackSignals: [...new Set(trackSignals)],
        strength,
        criteria: {
          agency: criteria.agency === true,
          commitment: criteria.commitment === true,
          causality: criteria.causality === true
        },
        actionSummary: compact(item.actionSummary, 300),
        consequenceSummary: compact(item.consequenceSummary, 300),
        playerFacingSummary: compact(item.playerFacingSummary, 420),
        relationshipPerceptionIds: uniqueStrings(item.relationshipPerceptionIds, 20, 160),
        visible: item.visible !== false,
        status: compact(item.status || 'open', 80)
      });
    }
  }
  return validationResult({
    accepted: rejections.length === 0,
    records: rejections.length ? [] : records,
    rejections,
    sanitizedDiagnostics: { proposedCount: evidence.length, acceptedCount: rejections.length ? 0 : records.length },
    touchedPaths: records.length ? ['commandBearing.evidenceLedger'] : [],
    idempotencyKeys: records.map((record) => `evidence:${record.sourceOutcomeId}:${record.primarySignal}`)
  });
}

export function validateCommandBearingRelationshipPerceptionProposal(proposal, {
  suppliedCrewIds = [],
  sourceOutcomeId = null
} = {}) {
  const rejections = [];
  const records = [];
  const allowedCrewIds = new Set(uniqueStrings(suppliedCrewIds, 100, 160));
  const perceptions = asArray(proposal?.playerPerceptions);
  if (!Array.isArray(proposal?.playerPerceptions)) {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_PERCEPTIONS_ARRAY_REQUIRED', 'playerPerceptions must be an array.', '$.playerPerceptions'));
  }
  for (const [index, item] of perceptions.entries()) {
    const path = `$.playerPerceptions[${index}]`;
    const crewId = compactId(item?.crewId);
    const impact = compact(item?.playerFacingImpact, 80);
    const perceived = item?.perceivedByCharacter || {};
    const recordSourceOutcomeId = compactId(item?.sourceOutcomeId || sourceOutcomeId);
    const itemErrors = [];
    if (!crewId) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_CREW_ID_REQUIRED', 'crewId is required.', `${path}.crewId`));
    if (crewId && allowedCrewIds.size > 0 && !allowedCrewIds.has(crewId)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_CREW_ID_UNKNOWN', `Unknown crew id "${crewId}".`, `${path}.crewId`));
    if (!RELATIONSHIP_IMPACTS.has(impact)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_IMPACT_INVALID', 'playerFacingImpact is invalid.', `${path}.playerFacingImpact`));
    if (!recordSourceOutcomeId) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_SOURCE_REQUIRED', 'sourceOutcomeId is required.', `${path}.sourceOutcomeId`));
    if (sourceOutcomeId && recordSourceOutcomeId !== sourceOutcomeId) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_SOURCE_MISMATCH', 'sourceOutcomeId must match supplied outcome.', `${path}.sourceOutcomeId`));
    if (!compact(perceived.cue)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_PERCEPTION_CUE_REQUIRED', 'perceivedByCharacter.cue is required.', `${path}.perceivedByCharacter.cue`));
    if (!compact(perceived.summary)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_PERCEPTION_SUMMARY_REQUIRED', 'perceivedByCharacter.summary is required.', `${path}.perceivedByCharacter.summary`));
    if (objectContainsHiddenLeak(item)) itemErrors.push(rejection('DIRECTIVE_COMMAND_BEARING_HIDDEN_LEAK', 'Perception contains hidden-state language.', path));
    rejections.push(...itemErrors);
    if (itemErrors.length === 0) {
      const id = compactId(item.id) || `relationship-perception.${recordSourceOutcomeId}.${crewId}.${records.length + 1}`;
      records.push({
        id,
        crewId,
        dimension: compact(item.dimension || 'professional_confidence', 120),
        playerFacingImpact: impact,
        perceivedByCharacter: {
          clarity: compact(perceived.clarity || 'subtle', 80),
          cue: compact(perceived.cue, 300),
          summary: compact(perceived.summary, 420)
        },
        sourceOutcomeId: recordSourceOutcomeId,
        visible: item.visible !== false
      });
    }
  }
  return validationResult({
    accepted: rejections.length === 0,
    records: rejections.length ? [] : records,
    rejections,
    sanitizedDiagnostics: { proposedCount: perceptions.length, acceptedCount: rejections.length ? 0 : records.length },
    touchedPaths: records.length ? ['relationships.perceptionLedger'] : [],
    idempotencyKeys: records.map((record) => `relationship-perception:${record.sourceOutcomeId}:${record.crewId}:${record.dimension}`)
  });
}

export function validateCommandBearingReviewProposal(proposal, {
  closureId,
  suppliedEvidenceIds = [],
  commandBearing = null
} = {}) {
  const rejections = [];
  const id = compactId(proposal?.closureId || closureId);
  const expectedClosureId = compactId(closureId);
  const supplied = new Set(uniqueStrings(suppliedEvidenceIds, 200, 160));
  const existing = refreshCommandBearing(commandBearing || {});
  if (!id) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CLOSURE_ID_REQUIRED', 'closureId is required.', '$.closureId'));
  if (expectedClosureId && id !== expectedClosureId) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CLOSURE_ID_MISMATCH', 'closureId must match supplied closure.', '$.closureId'));
  if (existing.reviewLedger.reviewedClosureIds[id]) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_REVIEW_DUPLICATE', 'Closure was already reviewed.', '$.closureId'));
  const evidenceIds = uniqueStrings(proposal?.evidenceIds, 100, 160);
  if (evidenceIds.length === 0) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_EVIDENCE_REQUIRED', 'At least one evidence id is required.', '$.evidenceIds'));
  for (const evidenceId of evidenceIds) {
    if (supplied.size > 0 && !supplied.has(evidenceId)) {
      rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_EVIDENCE_UNKNOWN', `Evidence "${evidenceId}" was not supplied.`, '$.evidenceIds'));
    }
  }
  const markAwarded = proposal?.markAwarded === true;
  const awardedTrack = proposal?.awardedTrack === null || proposal?.awardedTrack === undefined ? null : maybeTrack(proposal.awardedTrack);
  const criteria = proposal?.criteriaSatisfied || {};
  for (const key of ['agency', 'commitment', 'causality']) {
    if (typeof criteria[key] !== 'boolean') rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CRITERIA_REQUIRED', `${key} must be boolean.`, `$.criteriaSatisfied.${key}`));
  }
  if (markAwarded) {
    if (!awardedTrack) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_TRACK_INVALID', 'awardedTrack must be inspiration or resolve.', '$.awardedTrack'));
    if (!(criteria.agency && criteria.commitment && criteria.causality)) {
      rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CRITERIA_NOT_SATISFIED', 'Award requires Agency, Commitment, and Causality.', '$.criteriaSatisfied'));
    }
    if (!compact(proposal?.awardSummary)) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_AWARD_SUMMARY_REQUIRED', 'awardSummary is required for awards.', '$.awardSummary'));
  } else if (!compact(proposal?.noAwardReason)) {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_NO_AWARD_REASON_REQUIRED', 'noAwardReason is required when no Mark is awarded.', '$.noAwardReason'));
  }
  if (objectContainsHiddenLeak(proposal)) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_HIDDEN_LEAK', 'Review contains hidden-state language.'));
  const record = {
    id: compactId(proposal?.id) || `bearing-review.${id}`,
    closureId: id,
    markAwarded,
    awardedTrack: markAwarded ? awardedTrack : null,
    criteriaSatisfied: {
      agency: criteria.agency === true,
      commitment: criteria.commitment === true,
      causality: criteria.causality === true
    },
    evidenceIds,
    awardSummary: compact(proposal?.awardSummary, 420),
    noAwardReason: compact(proposal?.noAwardReason, 420)
  };
  return validationResult({
    accepted: rejections.length === 0,
    records: rejections.length ? [] : [record],
    rejections,
    sanitizedDiagnostics: { closureId: id, markAwarded, awardedTrack },
    touchedPaths: ['commandBearing.reviewLedger', ...(markAwarded ? ['commandBearing.tracks', 'commandBearing.awardedSources'] : [])],
    idempotencyKeys: id ? [`review:${id}`, ...(markAwarded ? [`award:${id}:${awardedTrack}`] : [])] : []
  });
}

function sourceOutcomeIdsFromClosureRecord(record = {}) {
  const ids = [
    record.sourceOutcomeId,
    record.outcomeId,
    record.sourceTurnId,
    record.turnId,
    ...asArray(record.sourceOutcomeIds)
  ];
  for (const eventId of asArray(record.sourceEventIds)) {
    const id = compactId(eventId);
    if (id.startsWith('event.outcome.')) ids.push(id.slice('event.'.length));
    else if (id.startsWith('outcome.')) ids.push(id);
  }
  return uniqueStrings(ids, 12, 160);
}

function sourceOutcomeMatchesClosure(record, descriptor) {
  if (descriptor.closureType === 'scene') return false;
  const hasExplicitRoot = [
    record?.threadId,
    record?.questId,
    record?.arcId,
    record?.chapterId,
    record?.commandCrucibleId
  ].some((value) => compactId(value));
  if (hasExplicitRoot) return false;
  const evidenceSourceIds = uniqueStrings([
    record?.sourceOutcomeId,
    record?.outcomeId,
    record?.sourceTurnId,
    record?.turnId
  ], 20, 160);
  if (evidenceSourceIds.length === 0) return false;
  const closureSourceIds = new Set(uniqueStrings(descriptor?.sourceOutcomeIds, 20, 160));
  return evidenceSourceIds.some((id) => closureSourceIds.has(id));
}

function openEvidenceForClosure(bearing, descriptor) {
  const records = bearing.evidenceLedger.records || [];
  return records.filter((record) => {
    if (record?.visible === false) return false;
    if (compact(record?.status || 'open', 80) !== 'open') return false;
    if (sourceOutcomeMatchesClosure(record, descriptor)) return true;
    if (descriptor.closureType === 'thread') return compactId(record.threadId) === descriptor.entityId;
    if (descriptor.closureType === 'quest') return compactId(record.questId) === descriptor.entityId;
    if (descriptor.closureType === 'storyArc' || descriptor.closureType === 'milestone') return compactId(record.arcId) === descriptor.entityId;
    if (descriptor.closureType === 'chapter') return compactId(record.chapterId) === descriptor.entityId;
    if (descriptor.closureType === 'commandCrucible') return compactId(record.commandCrucibleId) === descriptor.entityId;
    return false;
  });
}

function threadClosureDescriptor(review = {}, index = 0) {
  const threadId = compactId(review.threadId);
  if (!threadId) return null;
  const closureId = compactId(review.commandBearingClosureId || review.closureId || review.id)
    || `closure.thread.${threadId}.${index + 1}`;
  const status = compact(review.status || 'resolved', 80);
  return {
    closureId,
    closureType: 'thread',
    entityId: threadId,
    source: 'threadLedger',
    summary: compact(review.summary || 'The thread reached a causally supported stopping point.', 420),
    sourceOutcomeIds: sourceOutcomeIdsFromClosureRecord(review),
    proof: [
      `Thread ${threadId} reached ${status}.`,
      review.sourceOutcomeId ? `Source outcome ${compactId(review.sourceOutcomeId)} committed the closure.` : null,
      review.summary ? `Closure summary: ${compact(review.summary, 220)}` : null
    ].filter(Boolean)
  };
}

function genericClosureDescriptor(review = {}, closureType, index = 0) {
  const entityKeys = {
    quest: ['questId', 'id'],
    storyArc: ['arcId', 'storyArcId', 'id'],
    milestone: ['arcId', 'storyArcId', 'id'],
    chapter: ['chapterId', 'questId', 'id'],
    commandCrucible: ['commandCrucibleId', 'id'],
    scene: ['sceneId', 'id']
  }[closureType] || ['id'];
  const entityId = compactId(entityKeys.map((key) => review[key]).find(Boolean));
  if (!entityId) return null;
  const closureId = compactId(review.commandBearingClosureId || review.closureId)
    || `closure.${closureType}.${entityId}.${index + 1}`;
  const status = compact(review.status || review.toStatus || 'resolved', 80);
  const sourceOutcomeId = compactId(review.sourceOutcomeId || review.outcomeId);
  const sourceOutcomeIds = sourceOutcomeIdsFromClosureRecord(review);
  const summary = compact(
    review.summary
    || review.playerFacingSummary
    || `${closureType} ${entityId} reached ${status}.`,
    420
  );
  return {
    closureId,
    closureType,
    entityId,
    source: compact(review.source || `${closureType}Ledger`, 80),
    summary,
    sourceOutcomeIds,
    proof: [
      `${closureType} ${entityId} reached ${status}.`,
      sourceOutcomeId ? `Source outcome ${sourceOutcomeId} committed the closure.` : null,
      sourceOutcomeIds.length > 0 && !sourceOutcomeId ? `Source outcome/event ${sourceOutcomeIds[0]} committed the closure.` : null,
      summary ? `Closure summary: ${compact(summary, 220)}` : null
    ].filter(Boolean)
  };
}

function terminalQuestClosureType(quest = {}) {
  const id = compactId(quest.id || quest.templateId);
  const kind = compact(quest.kind, 80).toLowerCase();
  if (kind === 'chapter' || /^chapter[-.]/i.test(id) || /^chapter[-.]/i.test(compactId(quest.templateId))) return 'chapter';
  return 'quest';
}

function questClosureDescriptors(previousState = {}, currentState = {}) {
  const previous = new Map(asArray(previousState?.questLedger?.instances).map((quest) => [compactId(quest.id), quest]));
  return asArray(currentState?.questLedger?.instances)
    .filter((quest) => ['resolved', 'failed', 'abandoned', 'expired', 'transformed'].includes(compact(quest.status, 80)))
    .filter((quest) => compact(previous.get(compactId(quest.id))?.status, 80) !== compact(quest.status, 80))
    .map((quest, index) => genericClosureDescriptor({
      id: quest.id,
      questId: quest.id,
      chapterId: quest.id,
      status: quest.status,
      outcomeId: quest.outcomeId,
      source: 'questLedger',
      summary: `${quest.title || quest.id} reached ${quest.status}.`
    }, terminalQuestClosureType(quest), index))
    .filter(Boolean);
}

function milestoneRecords(ledger = {}) {
  const direct = asArray(ledger.milestones);
  if (direct.length > 0) return direct;
  return asArray(ledger.arcs).flatMap((arc) => asArray(arc.milestoneStates).map((milestone) => ({
    ...milestone,
    arcId: milestone.arcId || arc.id
  })));
}

function storyClosureDescriptors(previousState = {}, currentState = {}) {
  const descriptors = [];
  const previousArcs = new Map(asArray(previousState?.storyArcLedger?.arcs).map((arc) => [compactId(arc.id), arc]));
  for (const [index, arc] of asArray(currentState?.storyArcLedger?.arcs).entries()) {
    const status = compact(arc.status, 80);
    if (status !== 'complete') continue;
    const previousStatus = compact(previousArcs.get(compactId(arc.id))?.status, 80);
    if (previousStatus === 'complete') continue;
    const descriptor = genericClosureDescriptor({
      id: arc.id,
      arcId: arc.id,
      status,
      source: 'storyArcLedger',
      summary: `${arc.id} reached complete.`
    }, 'storyArc', index);
    if (descriptor) descriptors.push(descriptor);
  }
  const previousMilestones = new Map(milestoneRecords(previousState?.storyArcLedger).map((milestone) => [compactId(milestone.id), milestone]));
  for (const [index, milestone] of milestoneRecords(currentState?.storyArcLedger).entries()) {
    const status = compact(milestone.status, 80);
    if (status !== 'complete') continue;
    const previousStatus = compact(previousMilestones.get(compactId(milestone.id))?.status, 80);
    if (previousStatus === 'complete') continue;
    const descriptor = genericClosureDescriptor({
      id: milestone.id,
      arcId: milestone.arcId,
      closureId: `closure.milestone.${milestone.id}.${index + 1}`,
      status,
      source: 'storyArcLedger',
      sourceEventIds: milestone.sourceEventIds,
      outcomeId: milestone.outcomeId,
      summary: `${milestone.id} completed in ${milestone.arcId || 'the active story arc'}.`
    }, 'milestone', index);
    if (descriptor) descriptors.push(descriptor);
  }
  return descriptors;
}

function sourceMatchedClosureDescriptors(currentState = {}, sourceOutcomeIds = []) {
  const wanted = new Set(uniqueStrings(sourceOutcomeIds, 50, 160));
  if (wanted.size === 0) return [];
  const matches = (record) => sourceOutcomeIdsFromClosureRecord(record).some((id) => wanted.has(id));
  const descriptors = [];
  for (const [index, review] of asArray(currentState?.threadLedger?.closureReviews).entries()) {
    if (!matches(review)) continue;
    const descriptor = threadClosureDescriptor(review, index);
    if (descriptor) descriptors.push(descriptor);
  }
  for (const [index, quest] of asArray(currentState?.questLedger?.instances).entries()) {
    if (!['resolved', 'failed', 'abandoned', 'expired', 'transformed'].includes(compact(quest.status, 80))) continue;
    if (!matches(quest)) continue;
    const descriptor = genericClosureDescriptor({
      id: quest.id,
      questId: quest.id,
      chapterId: quest.id,
      status: quest.status,
      outcomeId: quest.outcomeId,
      sourceEventIds: quest.sourceEventIds,
      source: 'questLedger',
      summary: `${quest.title || quest.id} reached ${quest.status}.`
    }, terminalQuestClosureType(quest), index);
    if (descriptor) descriptors.push(descriptor);
  }
  for (const [index, milestone] of milestoneRecords(currentState?.storyArcLedger).entries()) {
    if (compact(milestone.status, 80) !== 'complete') continue;
    if (!matches(milestone)) continue;
    const descriptor = genericClosureDescriptor({
      id: milestone.id,
      arcId: milestone.arcId,
      closureId: `closure.milestone.${milestone.id}.${index + 1}`,
      status: milestone.status,
      sourceEventIds: milestone.sourceEventIds,
      outcomeId: milestone.outcomeId,
      source: 'storyArcLedger',
      summary: `${milestone.id} completed in ${milestone.arcId || 'the active story arc'}.`
    }, 'milestone', index);
    if (descriptor) descriptors.push(descriptor);
  }
  return descriptors;
}

function explicitClosureDescriptors({
  questClosureReviews = [],
  storyArcClosureReviews = [],
  milestoneClosureReviews = [],
  chapterClosureReviews = [],
  commandCrucibleClosureReviews = [],
  sceneClosureReviews = []
} = {}) {
  return [
    ...asArray(questClosureReviews).map((review, index) => genericClosureDescriptor(review, 'quest', index)),
    ...asArray(storyArcClosureReviews).map((review, index) => genericClosureDescriptor(review, 'storyArc', index)),
    ...asArray(milestoneClosureReviews).map((review, index) => genericClosureDescriptor(review, 'milestone', index)),
    ...asArray(chapterClosureReviews).map((review, index) => genericClosureDescriptor(review, 'chapter', index)),
    ...asArray(commandCrucibleClosureReviews).map((review, index) => genericClosureDescriptor(review, 'commandCrucible', index)),
    ...asArray(sceneClosureReviews).map((review, index) => genericClosureDescriptor(review, 'scene', index))
  ].filter(Boolean);
}

export function planCommandBearingClosureReviews({
  commandBearing = null,
  closureDescriptors = [],
  threadClosureReviews = [],
  questClosureReviews = [],
  storyArcClosureReviews = [],
  milestoneClosureReviews = [],
  chapterClosureReviews = [],
  commandCrucibleClosureReviews = [],
  sceneClosureReviews = [],
  closureSignals = null,
  maxCandidates = 12
} = {}) {
  const bearing = refreshCommandBearing(commandBearing || {});
  const diagnostics = [];
  const closureCandidates = [];
  const reviewQueue = [];
  const utilitySuggestedTypes = new Set(
    closureSignals?.possibleClosure === true
      ? uniqueStrings(closureSignals.closureTypes, 8, 80)
      : []
  );
  const descriptors = [
    ...asArray(closureDescriptors),
    ...asArray(threadClosureReviews).map((review, index) => threadClosureDescriptor(review, index)),
    ...explicitClosureDescriptors({
      questClosureReviews,
      storyArcClosureReviews,
      milestoneClosureReviews,
      chapterClosureReviews,
      commandCrucibleClosureReviews,
      sceneClosureReviews
    })
  ]
    .filter(Boolean)
    .slice(0, Math.max(1, Number(maxCandidates) || 12));

  for (const descriptor of descriptors) {
    const evidence = openEvidenceForClosure(bearing, descriptor);
    const evidenceIds = uniqueStrings(evidence.map((record) => record.id), 100, 160);
    const candidate = {
      closureId: descriptor.closureId,
      closureType: descriptor.closureType,
      source: descriptor.source,
      proof: descriptor.proof,
      utilitySuggested: utilitySuggestedTypes.has(descriptor.closureType),
      reviewEligible: evidenceIds.length > 0,
      evidenceIds
    };
    const validation = validateCommandBearingClosureCandidate(candidate, {
      existingReviewLedger: bearing.reviewLedger
    });
    diagnostics.push({
      closureId: descriptor.closureId,
      closureType: descriptor.closureType,
      source: descriptor.source,
      evidenceCount: evidenceIds.length,
      accepted: validation.accepted,
      reviewEligible: validation.records[0]?.reviewEligible === true,
      rejectionCodes: validation.rejections.map((item) => item.code)
    });
    if (!validation.accepted) continue;
    const record = validation.records[0];
    closureCandidates.push(record);
    if (record.reviewEligible) {
      reviewQueue.push({
        closureId: record.closureId,
        closureType: record.closureType,
        source: record.source,
        evidenceIds: record.evidenceIds,
        closureSummary: descriptor.summary,
        utilitySuggested: record.utilitySuggested === true
      });
    }
  }

  return {
    closureCandidates,
    reviewQueue,
    diagnostics
  };
}

export function planCommandBearingStateClosureReviews({
  commandBearing = null,
  previousState = {},
  currentState = {},
  closureSignals = null,
  sourceOutcomeIds = [],
  maxCandidates = 12
} = {}) {
  const stateDescriptors = uniqueBy([
    ...questClosureDescriptors(previousState, currentState),
    ...storyClosureDescriptors(previousState, currentState),
    ...sourceMatchedClosureDescriptors(currentState, sourceOutcomeIds)
  ], (descriptor) => descriptor.closureId);
  return planCommandBearingClosureReviews({
    commandBearing: commandBearing || currentState?.commandBearing,
    closureDescriptors: stateDescriptors,
    closureSignals,
    maxCandidates
  });
}

export function validateCommandBearingSpendCommit(proposal, {
  commandBearing = null,
  readied = null,
  ingressId = null,
  chatId = null,
  outcomeId = null
} = {}) {
  const rejections = [];
  const bearing = refreshCommandBearing(commandBearing || {});
  const expectedReadied = readied || bearing.readied;
  const record = isObject(proposal) ? proposal : {};
  const track = maybeTrack(record.track);
  const from = compact(record.from || record.baseResultBand || record.resultBand, 80);
  const to = compact(record.to || record.finalResultBand, 80);
  const expectedTo = OUTCOME_LADDER.includes(from) ? improveOutcomeByCommandPoint(from) : null;
  if (!expectedReadied) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_READIED_REQUIRED', 'A readied point is required.', '$.readiedId'));
  if (expectedReadied && compactId(record.readiedId) !== expectedReadied.id) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_READIED_MISMATCH', 'readiedId does not match attached readied point.', '$.readiedId'));
  if (expectedReadied && track !== expectedReadied.track) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_TRACK_MISMATCH', 'track does not match readied point.', '$.track'));
  if (ingressId && compactId(record.ingressId) !== compactId(ingressId)) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_INGRESS_MISMATCH', 'ingressId does not match.', '$.ingressId'));
  if (chatId && expectedReadied?.chatId && expectedReadied.chatId !== compactId(chatId)) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_CHAT_MISMATCH', 'chatId does not match readied point.', '$.chatId'));
  if (outcomeId && compactId(record.outcomeId) !== compactId(outcomeId)) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_OUTCOME_MISMATCH', 'outcomeId does not match.', '$.outcomeId'));
  if (!SPENDABLE_OUTCOMES.has(from)) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_OUTCOME_NOT_SPENDABLE', 'Base outcome is not spendable.', '$.from'));
  if (expectedTo && to !== expectedTo) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_OUTCOME_BUMP_INVALID', 'Readied spend must improve exactly two bands.', '$.to'));
  if (track && Number(bearing.tracks[track]?.points || 0) <= 0) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_NO_POINTS', 'No points available for track.', '$.track'));
  if (objectContainsHiddenLeak(record)) rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_HIDDEN_LEAK', 'Spend commit contains hidden-state language.'));
  return validationResult({
    accepted: rejections.length === 0,
    records: rejections.length ? [] : [{
      outcomeId: compactId(record.outcomeId || outcomeId),
      ingressId: compactId(record.ingressId || ingressId),
      readiedId: compactId(record.readiedId),
      track,
      from,
      to,
      fit: compact(record.fit, 80),
      causalBasis: uniqueStrings(record.causalBasis, 8, 240)
    }],
    rejections,
    sanitizedDiagnostics: { track, from, to },
    touchedPaths: ['commandBearing.spendLedger', 'commandBearing.tracks', 'commandBearing.readied'],
    idempotencyKeys: record.outcomeId && track ? [`spend:${record.outcomeId}:${track}`] : []
  });
}

export function validateCommandBearingProjection(projection) {
  const rejections = [];
  if (objectContainsHiddenLeak(projection)) {
    rejections.push(rejection('DIRECTIVE_COMMAND_BEARING_HIDDEN_LEAK', 'Projection contains hidden-state language.'));
  }
  return validationResult({
    accepted: rejections.length === 0,
    records: rejections.length ? [] : [cloneJson(projection || {})],
    rejections,
    sanitizedDiagnostics: { projectionAccepted: rejections.length === 0 },
    touchedPaths: [],
    idempotencyKeys: []
  });
}

export function projectCommandBearingForPlayer(commandBearing = {}) {
  const bearing = refreshCommandBearing(commandBearing);
  const tracks = {};
  for (const track of TRACKS) {
    const state = bearing.tracks[track];
    const nextThreshold = nextThresholdForRank(bearing.thresholds, state.rank);
    tracks[track] = {
      track,
      label: track === 'inspiration' ? 'Inspiration' : 'Resolve',
      rank: state.rank,
      rankTitle: state.rankTitle,
      marks: state.marks,
      nextRankMarks: nextThreshold?.marks ?? null,
      points: state.points,
      pointCap: state.pointCap
    };
  }
  const projection = {
    schemaVersion: 1,
    tracks,
    reserve: {
      capacity: bearing.reserve.capacity,
      absoluteCapacity: bearing.reserve.absoluteCapacity,
      current: totalReservePoints(bearing),
      lastRecoveryId: bearing.reserve.lastRecoveryId || null
    },
    readied: bearing.readied ? {
      id: bearing.readied.id,
      track: bearing.readied.track,
      status: bearing.readied.status,
      expiresOn: bearing.readied.expiresOn
    } : null,
    evidence: (bearing.evidenceLedger.records || [])
      .filter((record) => record.visible !== false)
      .map((record) => ({
        id: record.id,
        primarySignal: record.primarySignal,
        trackSignals: uniqueStrings(record.trackSignals, 4, 80),
        strength: record.strength,
        status: record.status || 'open',
        actionSummary: compact(record.actionSummary, 300),
        consequenceSummary: compact(record.consequenceSummary, 300),
        playerFacingSummary: compact(record.playerFacingSummary, 420),
        sourceOutcomeId: compactId(record.sourceOutcomeId)
      })),
    reviews: (bearing.reviewLedger.records || []).map((record) => ({
      id: record.id,
      closureId: record.closureId,
      markAwarded: record.markAwarded === true,
      awardedTrack: record.awardedTrack || null,
      evidenceIds: uniqueStrings(record.evidenceIds, 100, 160),
      awardSummary: compact(record.awardSummary, 420),
      noAwardReason: compact(record.noAwardReason, 420)
    })),
    spendHistory: Object.values(bearing.spendLedger || {}).map((record) => ({
      outcomeId: compactId(record.outcomeId),
      track: maybeTrack(record.track),
      from: compact(record.from, 80),
      to: compact(record.to, 80),
      rationale: compact(record.rationale, 300)
    })),
    recoveryHistory: Object.entries(bearing.recoveryLedger || {}).map(([id, record]) => ({
      id,
      track: maybeTrack(record.track),
      applied: record.applied === true,
      reason: compact(record.reason, 300)
    })),
    guards: {
      rawValuesHidden: true,
      modelDiagnosticsHidden: true
    }
  };
  const validation = validateCommandBearingProjection(projection);
  return validation.accepted ? projection : {
    schemaVersion: 1,
    tracks,
    reserve: projection.reserve,
    readied: projection.readied,
    evidence: [],
    reviews: [],
    spendHistory: [],
    recoveryHistory: [],
    guards: {
      rawValuesHidden: true,
      modelDiagnosticsHidden: true,
      projectionRejected: true
    }
  };
}
