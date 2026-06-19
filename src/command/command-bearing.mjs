const TRACKS = ['inspiration', 'resolve'];
const OUTCOME_LADDER = [
  'Great Failure',
  'Failure',
  'Partial Failure',
  'Partial Success',
  'Success',
  'Great Success'
];
const SPENDABLE_OUTCOMES = new Set(['Great Failure', 'Failure', 'Partial Failure', 'Partial Success']);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeTrack(track) {
  const key = String(track || '').trim().toLowerCase();
  if (!TRACKS.includes(key)) {
    throw new Error(`Unknown Command Bearing track "${track}"`);
  }
  return key;
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

function pointCapForRank(rank) {
  return Number(rank || 1) >= 3 ? 2 : 1;
}

function totalReservePoints(commandStyle) {
  return TRACKS.reduce((total, track) => total + Number(commandStyle?.[track]?.points || 0), 0);
}

export function refreshCommandBearing(commandStyle) {
  const next = cloneJson(commandStyle || {});
  next.thresholds = Array.isArray(next.thresholds) && next.thresholds.length > 0
    ? next.thresholds
    : [
      { rank: 1, title: 'Practiced', marks: 0 },
      { rank: 2, title: 'Established', marks: 2 },
      { rank: 3, title: 'Proven', marks: 5 },
      { rank: 4, title: 'Defining', marks: 9 },
      { rank: 5, title: 'Exemplary', marks: 14 }
    ];

  for (const track of TRACKS) {
    next[track] = next[track] || {};
    const rank = rankForMarks(next.thresholds, next[track].marks || 0);
    next[track].rank = rank;
    next[track].rankTitle = titleForRank(next.thresholds, rank);
    next[track].pointCap = pointCapForRank(rank);
    next[track].points = Math.min(Number(next[track].points || 0), next[track].pointCap);
    next[track].earnedRecords = Array.isArray(next[track].earnedRecords) ? next[track].earnedRecords : [];
    next[track].awardedDecisionIds = Array.isArray(next[track].awardedDecisionIds) ? next[track].awardedDecisionIds : [];
  }

  next.reserve = next.reserve || {};
  next.reserve.absoluteCapacity = Number(next.reserve.absoluteCapacity || 2);
  next.reserve.capacity = Math.min(
    next.reserve.absoluteCapacity,
    TRACKS.some((track) => Number(next[track].rank || 1) >= 3) ? 2 : 1
  );
  next.awardedSources = next.awardedSources || {};
  next.spendLedger = next.spendLedger || {};
  next.recoveryLedger = next.recoveryLedger || {};
  next.noMoralityScore = true;
  return next;
}

export function applyCommandMarkAwards(commandStyle, earnedRecords = []) {
  const next = refreshCommandBearing(commandStyle);
  for (const record of earnedRecords || []) {
    const track = normalizeTrack(record.track);
    const sourceId = record.decisionId || record.sourceId || record.id;
    const sourceKey = sourceId ? `${sourceId}:${track}` : null;
    if (!sourceKey || next.awardedSources[sourceKey]) {
      continue;
    }
    next[track].marks = Number(next[track].marks || 0) + 1;
    next.awardedSources[sourceKey] = {
      sourceId,
      track,
      awardedAtOutcomeId: record.outcomeId || null,
      summary: record.summary || ''
    };
  }
  return refreshCommandBearing(next);
}

export function recoverCommandBearing(commandStyle, {
  recoveryId,
  track
}) {
  const id = String(recoveryId || '').trim();
  if (!id) {
    throw new Error('recoveryId is required');
  }
  const key = normalizeTrack(track);
  const next = refreshCommandBearing(commandStyle);
  if (next.recoveryLedger[id]) {
    return {
      applied: false,
      reason: 'Recovery already applied.',
      commandStyle: next
    };
  }
  const reserveFull = totalReservePoints(next) >= Number(next.reserve.capacity || 0);
  const trackFull = Number(next[key].points || 0) >= Number(next[key].pointCap || 0);
  const applied = !reserveFull && !trackFull;
  if (applied) {
    next[key].points = Number(next[key].points || 0) + 1;
  }
  next.reserve.lastRecoveryId = id;
  next.recoveryLedger[id] = {
    track: key,
    applied,
    reason: applied ? 'Recovered one Command Bearing point.' : 'Recovery produced no point because reserve or track cap was full.'
  };
  return {
    applied,
    reason: next.recoveryLedger[id].reason,
    commandStyle: refreshCommandBearing(next)
  };
}

export function improveOutcomeByCommandPoint(resultBand) {
  const index = OUTCOME_LADDER.indexOf(resultBand);
  if (index < 0) {
    throw new Error(`Unknown result band "${resultBand}"`);
  }
  return OUTCOME_LADDER[Math.min(index + 2, OUTCOME_LADDER.length - 1)];
}

export function evaluateCommandBearingSpend(commandStyle, {
  outcomeId,
  resultBand,
  eligibleTracks = [],
  rationale = {}
}) {
  const id = String(outcomeId || '').trim();
  if (!id) {
    throw new Error('outcomeId is required');
  }
  const next = refreshCommandBearing(commandStyle);
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
    .filter((track) => Number(next[track].points || 0) > 0)
    .map((track) => ({
      track,
      label: track === 'inspiration' ? 'Invoke Inspiration' : 'Invoke Resolve',
      from: resultBand,
      to: improveOutcomeByCommandPoint(resultBand),
      rationale: rationale[track] || ''
    }));
  return {
    eligible: options.length > 0,
    reason: options.length > 0 ? 'Command Bearing intervention available.' : 'No eligible Command Bearing point is available.',
    options
  };
}

export function spendCommandBearingPoint(commandStyle, {
  outcomeId,
  track,
  resultBand,
  eligibleTracks = [],
  rationale = ''
}) {
  const key = normalizeTrack(track);
  const next = refreshCommandBearing(commandStyle);
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
      commandStyle: next
    };
  }
  next[key].points = Number(next[key].points || 0) - 1;
  next.spendLedger[outcomeId] = {
    track: key,
    from: option.from,
    to: option.to,
    rationale
  };
  return {
    applied: true,
    from: option.from,
    to: option.to,
    commandStyle: refreshCommandBearing(next)
  };
}

export function createCommandBearingInterventionPrompt(commandStyle, options) {
  const eligibility = evaluateCommandBearingSpend(commandStyle, options);
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
