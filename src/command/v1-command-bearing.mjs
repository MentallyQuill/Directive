export const V1_COMMAND_BEARING_KIND = 'directive.commandBearing.v1';
export const V1_COMMAND_BEARING_PLAYER_PROJECTION_KIND = 'directive.commandBearingPlayerProjection.v1';

const ALLOWED_EFFECTS = new Set(['narrativeEdge']);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value, maxLength = 360) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength).trim();
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Math.round(Number(value));
  return Math.max(minimum, Math.min(maximum, Number.isFinite(numeric) ? numeric : fallback));
}

function timestamp(now = null) {
  if (typeof now === 'function') return now();
  if (typeof now === 'string' && now.trim()) return now.trim();
  return new Date().toISOString();
}

function ownRecordMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? cloneJson(value) : {};
}

export function createV1CommandBearing({ capacity = 3 } = {}) {
  return {
    kind: V1_COMMAND_BEARING_KIND,
    version: 1,
    balance: 0,
    capacity: boundedInteger(capacity, 3, 1, 5),
    awards: {},
    spends: {}
  };
}

export function validateV1CommandBearing(value) {
  const errors = [];
  if (value?.kind !== V1_COMMAND_BEARING_KIND) errors.push('kind must be directive.commandBearing.v1');
  if (value?.version !== 1) errors.push('version must be 1');
  if (!Number.isInteger(value?.capacity) || value.capacity < 1 || value.capacity > 5) {
    errors.push('capacity must be an integer from 1 through 5');
  }
  if (!Number.isInteger(value?.balance) || value.balance < 0 || value.balance > value.capacity) {
    errors.push('balance must be an integer within capacity');
  }
  if (!value?.awards || typeof value.awards !== 'object' || Array.isArray(value.awards)) {
    errors.push('awards must be a record map');
  }
  if (!value?.spends || typeof value.spends !== 'object' || Array.isArray(value.spends)) {
    errors.push('spends must be a record map');
  }
  for (const [id, record] of Object.entries(value?.awards || {})) {
    if (compact(record?.id) !== id) errors.push(`award ${id} id mismatch`);
    if (!compact(record?.sourceId)) errors.push(`award ${id} sourceId is required`);
    if (!compact(record?.reason)) errors.push(`award ${id} reason is required`);
    if (typeof record?.credited !== 'boolean') errors.push(`award ${id} credited must be boolean`);
  }
  for (const [id, record] of Object.entries(value?.spends || {})) {
    if (compact(record?.id) !== id) errors.push(`spend ${id} id mismatch`);
    if (!ALLOWED_EFFECTS.has(record?.effect)) errors.push(`spend ${id} effect is not allowed`);
    if (!new Set(['committed', 'refunded']).has(record?.status)) errors.push(`spend ${id} status is invalid`);
  }
  return { ok: errors.length === 0, errors };
}

function requireValid(value) {
  const validation = validateV1CommandBearing(value);
  if (!validation.ok) {
    const error = new Error(`Invalid V1 Command Bearing state: ${validation.errors.join('; ')}`);
    error.code = 'DIRECTIVE_V1_COMMAND_BEARING_INVALID';
    error.details = validation.errors;
    throw error;
  }
  return cloneJson(value);
}

export function awardV1CommandBearing(commandBearing, {
  awardId,
  sourceId,
  reason,
  now = null
} = {}) {
  const next = requireValid(commandBearing);
  const id = compact(awardId, 160);
  const source = compact(sourceId, 160);
  const explanation = compact(reason);
  if (!id || !source || !explanation) {
    throw new TypeError('awardId, sourceId, and reason are required');
  }
  if (next.awards[id]) {
    return { applied: false, reasonCode: 'already-awarded', commandBearing: next };
  }
  const credited = next.balance < next.capacity;
  next.awards[id] = {
    id,
    sourceId: source,
    reason: explanation,
    credited,
    recordedAt: timestamp(now)
  };
  if (credited) next.balance += 1;
  return {
    applied: credited,
    reasonCode: credited ? null : 'reserve-full',
    commandBearing: next
  };
}

export function spendV1CommandBearing(commandBearing, {
  spendId,
  sourceId,
  effect,
  reason,
  now = null
} = {}) {
  const next = requireValid(commandBearing);
  const id = compact(spendId, 160);
  const source = compact(sourceId, 160);
  const explanation = compact(reason);
  const normalizedEffect = compact(effect, 80);
  if (!id || !source || !explanation || !ALLOWED_EFFECTS.has(normalizedEffect)) {
    throw new TypeError('spendId, sourceId, an allowed effect, and reason are required');
  }
  if (next.spends[id]) {
    return { applied: false, reasonCode: 'already-spent', commandBearing: next };
  }
  if (next.balance < 1) {
    return { applied: false, reasonCode: 'reserve-empty', commandBearing: next };
  }
  next.balance -= 1;
  next.spends[id] = {
    id,
    sourceId: source,
    effect: normalizedEffect,
    reason: explanation,
    status: 'committed',
    committedAt: timestamp(now)
  };
  return { applied: true, reasonCode: null, commandBearing: next };
}

export function refundV1CommandBearingSpend(commandBearing, {
  spendId,
  reason,
  now = null
} = {}) {
  const next = requireValid(commandBearing);
  const id = compact(spendId, 160);
  const explanation = compact(reason);
  const spend = next.spends[id];
  if (!id || !explanation) throw new TypeError('spendId and reason are required');
  if (!spend) return { applied: false, reasonCode: 'spend-not-found', commandBearing: next };
  if (spend.status === 'refunded') {
    return { applied: false, reasonCode: 'already-refunded', commandBearing: next };
  }
  spend.status = 'refunded';
  spend.refundReason = explanation;
  spend.refundedAt = timestamp(now);
  next.balance = Math.min(next.capacity, next.balance + 1);
  return { applied: true, reasonCode: null, commandBearing: next };
}

export function projectV1CommandBearing(commandBearing) {
  const bearing = requireValid(commandBearing);
  const awards = Object.values(ownRecordMap(bearing.awards));
  const spends = Object.values(ownRecordMap(bearing.spends));
  const latestAward = [...awards].reverse().find((record) => record.credited === true) || null;
  const latestSpend = spends.at(-1) || null;
  return {
    kind: V1_COMMAND_BEARING_PLAYER_PROJECTION_KIND,
    balance: bearing.balance,
    capacity: bearing.capacity,
    latestAwardReason: latestAward?.reason || null,
    latestSpend: latestSpend ? {
      id: latestSpend.id,
      effect: latestSpend.effect,
      status: latestSpend.status,
      reason: latestSpend.reason
    } : null
  };
}
