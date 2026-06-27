import {
  formatShipTime,
  resolveCampaignMinuteOfDay,
  resolveCampaignStardate
} from './campaign-time-header.mjs';

const DAY_MINUTES = 1440;
const DEFAULT_LEDGER_LIMIT = 200;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeMinuteOfDay(value) {
  const numeric = numberOrNull(value);
  if (numeric === null) return null;
  const minutes = Math.round(numeric);
  return ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

function compact(value) {
  return String(value ?? '').trim();
}

function minuteFromDisplay(value) {
  const text = compact(value).toLowerCase();
  if (!text) return null;
  const match = text.match(/^(\d{1,2})(?::?([0-5]\d))\s*(?:hours?)?$/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23) return null;
  return hour * 60 + minute;
}

function minuteFromClock(value) {
  if (!value || typeof value !== 'object') return null;
  const direct = normalizeMinuteOfDay(
    value.minuteOfDay
      ?? value.shipMinuteOfDay
      ?? value.currentMinuteOfDay
      ?? value.minutesSinceMidnight
  );
  if (direct !== null) return direct;
  const display = minuteFromDisplay(value.display ?? value.shipTime ?? value.time ?? value.label);
  if (display !== null) return display;
  const hour = numberOrNull(value.hour ?? value.hours);
  const minute = numberOrNull(value.minute ?? value.minutes);
  if (hour !== null && minute !== null && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
    return Math.round(hour) * 60 + Math.round(minute);
  }
  return null;
}

function firstMinute(values = []) {
  for (const value of values) {
    const minute = typeof value === 'object'
      ? minuteFromClock(value)
      : (typeof value === 'number'
        ? normalizeMinuteOfDay(value)
        : (minuteFromDisplay(value) ?? normalizeMinuteOfDay(value)));
    if (minute !== null) return minute;
  }
  return null;
}

function firstNumber(values = []) {
  for (const value of values) {
    const numeric = numberOrNull(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function bounded(values = [], limit = DEFAULT_LEDGER_LIMIT) {
  const source = Array.isArray(values) ? values : [];
  return source.slice(Math.max(0, source.length - Math.max(1, limit)));
}

function timestamp(now = null) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function stableToken(value) {
  return compact(value)
    .replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function sourceOpeningMinute(projection = null) {
  return firstMinute([
    projection?.initialState?.campaignTime?.openingMinuteOfDay,
    projection?.initialState?.worldState?.openingMinuteOfDay,
    projection?.initialState?.campaign?.openingMinuteOfDay,
    projection?.campaign?.openingMinuteOfDay,
    projection?.openingMinuteOfDay
  ]);
}

export function resolveOpeningMinuteOfDay(campaignState = {}, { projection = null } = {}) {
  return firstMinute([
    campaignState?.campaignTime?.openingShipClock,
    campaignState?.campaignTime?.openingShipTime,
    campaignState?.campaignTime?.openingMinuteOfDay,
    campaignState?.timeLedger?.openingShipClock,
    campaignState?.timeLedger?.openingShipTime,
    campaignState?.timeLedger?.openingMinuteOfDay,
    campaignState?.worldState?.openingShipClock,
    campaignState?.worldState?.openingShipTime,
    campaignState?.worldState?.openingMinuteOfDay,
    campaignState?.campaign?.openingShipClock,
    campaignState?.campaign?.openingShipTime,
    campaignState?.campaign?.openingMinuteOfDay,
    sourceOpeningMinute(projection)
  ]);
}

export function resolveElapsedMinutes(campaignState = {}) {
  return Math.max(0, Math.round(firstNumber([
    campaignState?.campaignTime?.absoluteMinute,
    campaignState?.campaignTime?.elapsedMinutes,
    campaignState?.worldState?.elapsedMinutes,
    numberOrNull(campaignState?.worldState?.elapsedHours) === null
      ? null
      : Number(campaignState.worldState.elapsedHours) * 60,
    campaignState?.timeLedger?.absoluteMinute,
    campaignState?.timeLedger?.elapsedMinutes,
    numberOrNull(campaignState?.campaign?.elapsedHours) === null
      ? null
      : Number(campaignState.campaign.elapsedHours) * 60
  ]) ?? 0));
}

function normalizeLedger(next, {
  openingMinute,
  elapsedMinutes,
  currentStardate,
  currentMinute,
  now = null
} = {}) {
  const ledger = isObject(next.timeLedger) ? cloneJson(next.timeLedger) : {};
  const entries = bounded(ledger.entries || ledger.boundaries || []);
  return {
    ...ledger,
    schemaVersion: 1,
    openingMinuteOfDay: openingMinute,
    elapsedMinutes,
    stardate: currentStardate ?? null,
    shipClock: {
      minuteOfDay: currentMinute,
      display: formatShipTime(currentMinute)
    },
    entries,
    updatedAt: ledger.updatedAt || timestamp(now)
  };
}

export function normalizeCampaignTimeState(campaignState = null, {
  projection = null,
  now = null,
  reason = 'campaign-time-normalization'
} = {}) {
  if (!campaignState || typeof campaignState !== 'object') {
    return { campaignState, changed: false, repairs: [] };
  }
  const next = cloneJson(campaignState);
  const repairs = [];
  const openingMinute = resolveOpeningMinuteOfDay(next, { projection });
  const elapsedMinutes = resolveElapsedMinutes(next);
  const currentMinute = openingMinute === null
    ? resolveCampaignMinuteOfDay(next)
    : normalizeMinuteOfDay(openingMinute + elapsedMinutes);
  const currentStardate = numberOrNull(
    next.worldState?.currentStardate
      ?? next.campaign?.currentStardate
      ?? next.campaign?.openingStardate
      ?? projection?.initialState?.worldState?.currentStardate
      ?? projection?.initialState?.campaign?.currentStardate
  );

  if (openingMinute !== null) {
    next.campaign = isObject(next.campaign) ? { ...next.campaign } : {};
    next.worldState = isObject(next.worldState) ? { ...next.worldState } : {};
    if (next.campaign.openingMinuteOfDay !== openingMinute) {
      next.campaign.openingMinuteOfDay = openingMinute;
      repairs.push('campaign.openingMinuteOfDay');
    }
    if (next.worldState.openingMinuteOfDay !== openingMinute) {
      next.worldState.openingMinuteOfDay = openingMinute;
      repairs.push('worldState.openingMinuteOfDay');
    }
  }

  if (isObject(next.worldState)) {
    if (next.worldState.elapsedMinutes !== elapsedMinutes) {
      next.worldState.elapsedMinutes = elapsedMinutes;
      repairs.push('worldState.elapsedMinutes');
    }
    const elapsedHours = Number((elapsedMinutes / 60).toFixed(4));
    if (numberOrNull(next.worldState.elapsedHours) !== elapsedHours) {
      next.worldState.elapsedHours = elapsedHours;
      repairs.push('worldState.elapsedHours');
    }
    if (currentStardate !== null && numberOrNull(next.worldState.currentStardate) !== currentStardate) {
      next.worldState.currentStardate = currentStardate;
      repairs.push('worldState.currentStardate');
    }
  }

  if (isObject(next.campaign) && currentStardate !== null && numberOrNull(next.campaign.currentStardate) !== currentStardate) {
    next.campaign.currentStardate = currentStardate;
    repairs.push('campaign.currentStardate');
  }

  if (openingMinute !== null && currentMinute !== null) {
    const previousLedger = JSON.stringify(next.timeLedger || null);
    next.timeLedger = normalizeLedger(next, {
      openingMinute,
      elapsedMinutes,
      currentStardate,
      currentMinute,
      now
    });
    if (JSON.stringify(next.timeLedger || null) !== previousLedger) repairs.push('timeLedger');
  }

  if (repairs.length) {
    next.runtimeTracking = isObject(next.runtimeTracking) ? { ...next.runtimeTracking } : {};
    next.runtimeTracking.timeNormalization = {
      reason,
      repairs,
      normalizedAt: timestamp(now)
    };
  }

  return {
    campaignState: next,
    changed: repairs.length > 0,
    repairs
  };
}

export function appendCampaignTimeLedgerEntry(campaignState = {}, entry = {}, {
  now = null,
  limit = DEFAULT_LEDGER_LIMIT
} = {}) {
  const next = cloneJson(campaignState || {});
  const openingMinute = resolveOpeningMinuteOfDay(next) ?? 0;
  const elapsedMinutes = resolveElapsedMinutes(next);
  const currentMinute = resolveCampaignMinuteOfDay(next);
  const currentStardate = numberOrNull(
    next.worldState?.currentStardate
      ?? next.campaign?.currentStardate
      ?? resolveCampaignStardate(next)
  );
  const recordedAt = timestamp(now);
  const elapsed = Math.max(0, Math.round(numberOrNull(entry.elapsedMinutes) ?? 0));
  const id = compact(entry.id)
    || `time:${stableToken(entry.reason || entry.type || 'advance')}:${stableToken(entry.sourceAnchorRange?.rangeHash || entry.sourceEventId || recordedAt)}`;
  const record = {
    id,
    kind: 'directive.timeBoundary.v1',
    type: compact(entry.type) || 'time-advance',
    reason: compact(entry.reason) || 'time-advance',
    elapsedMinutes: elapsed,
    previousStardate: numberOrNull(entry.previousStardate),
    currentStardate,
    previousShipMinute: normalizeMinuteOfDay(entry.previousShipMinute),
    currentShipMinute: currentMinute,
    previousHeader: entry.previousHeader || null,
    currentHeader: entry.currentHeader || null,
    confidence: numberOrNull(entry.confidence),
    source: compact(entry.source) || 'runtime',
    sourceAnchorRange: cloneJson(entry.sourceAnchorRange || null),
    evidenceMessageIds: Array.isArray(entry.evidenceMessageIds)
      ? entry.evidenceMessageIds.map((value) => compact(value)).filter(Boolean)
      : [],
    adjudication: cloneJson(entry.adjudication || null),
    consequences: cloneJson(entry.consequences || null),
    committedAt: recordedAt
  };
  const ledger = isObject(next.timeLedger) ? cloneJson(next.timeLedger) : {};
  const entries = bounded([...(ledger.entries || []), record], limit)
    .filter((item, index, values) => values.findIndex((candidate) => candidate.id === item.id) === index);
  next.timeLedger = {
    ...ledger,
    schemaVersion: 1,
    openingMinuteOfDay: openingMinute,
    elapsedMinutes,
    stardate: currentStardate,
    shipClock: {
      minuteOfDay: currentMinute,
      display: formatShipTime(currentMinute)
    },
    entries,
    lastBoundary: record,
    updatedAt: recordedAt
  };
  return next;
}
