export const V1_COMMAND_BEARING_KIND = 'directive.commandBearing.v1';
export const V1_COMMAND_BEARING_PLAYER_PROJECTION_KIND = 'directive.commandBearingPlayerProjection.v1';

const ALLOWED_EFFECTS = new Set(['narrativeEdge', 'cohesionRelief']);
const PENDING_STATUSES = new Set(['reserved', 'armed']);
const SPEND_STATUSES = new Set(['reserved', 'armed', 'committed', 'refunded']);
const COMMAND_BEARING_FIELDS = new Set(['kind', 'version', 'balance', 'capacity', 'awards', 'spends']);
const AWARD_FIELDS = new Set(['id', 'sourceId', 'reason', 'credited', 'recordedAt']);
const SPEND_FIELDS = new Set([
  'id', 'effect', 'reason', 'status', 'reservedAt',
  'armedByPlayerMessageId', 'armedAt',
  'assistantMessageId', 'assistantTextHash', 'acceptedByPlayerMessageId', 'committedAt',
  'refundReason', 'refundedAt', 'targetIssueId', 'cohesion'
]);

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

function unsupportedFields(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).filter((key) => !allowed.has(key))
    : [];
}

function pendingRecord(commandBearing) {
  return Object.values(commandBearing?.spends || {})
    .find((record) => PENDING_STATUSES.has(record?.status)) || null;
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
  for (const field of unsupportedFields(value, COMMAND_BEARING_FIELDS)) {
    errors.push(`Command Bearing contains unsupported field ${field}`);
  }
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
    for (const field of unsupportedFields(record, AWARD_FIELDS)) {
      errors.push(`award ${id} contains unsupported field ${field}`);
    }
    if (compact(record?.id) !== id) errors.push(`award ${id} id mismatch`);
    if (!compact(record?.sourceId)) errors.push(`award ${id} sourceId is required`);
    if (!compact(record?.reason)) errors.push(`award ${id} reason is required`);
    if (typeof record?.credited !== 'boolean') errors.push(`award ${id} credited must be boolean`);
    if (!compact(record?.recordedAt)) errors.push(`award ${id} recordedAt is required`);
  }
  for (const [id, record] of Object.entries(value?.spends || {})) {
    for (const field of unsupportedFields(record, SPEND_FIELDS)) {
      errors.push(`spend ${id} contains unsupported field ${field}`);
    }
    if (compact(record?.id) !== id) errors.push(`spend ${id} id mismatch`);
    if (!ALLOWED_EFFECTS.has(record?.effect)) errors.push(`spend ${id} effect is not allowed`);
    if (!compact(record?.reason)) errors.push(`spend ${id} reason is required`);
    if (record?.effect === 'cohesionRelief') {
      if (!compact(record?.targetIssueId, 180)) errors.push(`spend ${id} targetIssueId is required`);
      if (!Number.isInteger(record?.cohesion) || record.cohesion < 1 || record.cohesion > 20) {
        errors.push(`spend ${id} cohesion must be an integer from 1 through 20`);
      }
    }
    if (!SPEND_STATUSES.has(record?.status)) errors.push(`spend ${id} status is invalid`);
    if (!compact(record?.reservedAt)) errors.push(`spend ${id} reservedAt is required`);
    if (new Set(['armed', 'committed']).has(record?.status)) {
      if (!compact(record?.armedByPlayerMessageId)) errors.push(`spend ${id} armedByPlayerMessageId is required`);
      if (!compact(record?.armedAt)) errors.push(`spend ${id} armedAt is required`);
    }
    if (record?.status === 'committed') {
      if (!compact(record?.assistantMessageId)) errors.push(`spend ${id} assistantMessageId is required`);
      if (!compact(record?.assistantTextHash)) errors.push(`spend ${id} assistantTextHash is required`);
      if (!compact(record?.acceptedByPlayerMessageId)) errors.push(`spend ${id} acceptedByPlayerMessageId is required`);
      if (!compact(record?.committedAt)) errors.push(`spend ${id} committedAt is required`);
    }
    if (record?.status === 'refunded') {
      if (!compact(record?.refundReason)) errors.push(`spend ${id} refundReason is required`);
      if (!compact(record?.refundedAt)) errors.push(`spend ${id} refundedAt is required`);
    }
  }
  if (Object.values(value?.spends || {}).filter((record) => PENDING_STATUSES.has(record?.status)).length > 1) {
    errors.push('only one Command Bearing edge may be pending');
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

export function reserveV1CommandBearingEdge(commandBearing, {
  spendId,
  reason,
  now = null
} = {}) {
  const next = requireValid(commandBearing);
  const id = compact(spendId, 160);
  const explanation = compact(reason);
  if (!id || !explanation) {
    throw new TypeError('spendId and reason are required');
  }
  if (next.spends[id]) {
    return { applied: false, reasonCode: 'already-spent', commandBearing: next };
  }
  if (pendingRecord(next)) {
    return { applied: false, reasonCode: 'edge-already-pending', commandBearing: next };
  }
  if (next.balance < 1) {
    return { applied: false, reasonCode: 'reserve-empty', commandBearing: next };
  }
  next.balance -= 1;
  next.spends[id] = {
    id,
    effect: 'narrativeEdge',
    reason: explanation,
    status: 'reserved',
    reservedAt: timestamp(now)
  };
  return { applied: true, reasonCode: null, commandBearing: next };
}

export function reserveV1CohesionRelief(commandBearing, {
  spendId,
  targetIssueId,
  cohesion = 20,
  reason,
  now = null
} = {}) {
  const next = requireValid(commandBearing);
  const id = compact(spendId, 160);
  const target = compact(targetIssueId, 180);
  const explanation = compact(reason);
  if (!id || !target || !explanation) {
    throw new TypeError('spendId, targetIssueId, and reason are required');
  }
  if (!Number.isInteger(cohesion) || cohesion < 1 || cohesion > 20) {
    throw new TypeError('cohesion relief must be an integer from 1 through 20');
  }
  if (next.spends[id]) return { applied: false, reasonCode: 'already-spent', commandBearing: next };
  if (pendingRecord(next)) return { applied: false, reasonCode: 'edge-already-pending', commandBearing: next };
  if (next.balance < 1) return { applied: false, reasonCode: 'reserve-empty', commandBearing: next };
  next.balance -= 1;
  next.spends[id] = {
    id,
    effect: 'cohesionRelief',
    targetIssueId: target,
    cohesion,
    reason: explanation,
    status: 'reserved',
    reservedAt: timestamp(now)
  };
  return { applied: true, reasonCode: null, commandBearing: next };
}

export function armV1CommandBearingEdge(commandBearing, {
  spendId,
  playerMessageId,
  now = null
} = {}) {
  const next = requireValid(commandBearing);
  const id = compact(spendId, 160);
  const playerId = compact(playerMessageId, 180);
  if (!id || !playerId) throw new TypeError('spendId and playerMessageId are required');
  const spend = next.spends[id];
  if (!spend) return { applied: false, reasonCode: 'spend-not-found', commandBearing: next };
  if (spend.status === 'armed') {
    return { applied: false, reasonCode: 'already-armed', commandBearing: next };
  }
  if (spend.status !== 'reserved') {
    return { applied: false, reasonCode: 'edge-not-reserved', commandBearing: next };
  }
  spend.status = 'armed';
  spend.armedByPlayerMessageId = playerId;
  spend.armedAt = timestamp(now);
  return { applied: true, reasonCode: null, commandBearing: next };
}

export function commitV1CommandBearingEdge(commandBearing, {
  spendId,
  assistantMessageId,
  assistantTextHash,
  acceptedByPlayerMessageId,
  now = null
} = {}) {
  const next = requireValid(commandBearing);
  const id = compact(spendId, 160);
  const assistantId = compact(assistantMessageId, 180);
  const textHash = compact(assistantTextHash, 80);
  const playerId = compact(acceptedByPlayerMessageId, 180);
  if (!id || !assistantId || !textHash || !playerId) {
    throw new TypeError('spendId, assistantMessageId, assistantTextHash, and acceptedByPlayerMessageId are required');
  }
  const spend = next.spends[id];
  if (!spend) return { applied: false, reasonCode: 'spend-not-found', commandBearing: next };
  if (spend.status === 'committed') {
    return { applied: false, reasonCode: 'already-committed', commandBearing: next };
  }
  if (spend.status !== 'armed') {
    return { applied: false, reasonCode: 'edge-not-armed', commandBearing: next };
  }
  spend.status = 'committed';
  spend.assistantMessageId = assistantId;
  spend.assistantTextHash = textHash;
  spend.acceptedByPlayerMessageId = playerId;
  spend.committedAt = timestamp(now);
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
  const pendingEdge = [...spends].reverse().find((record) => PENDING_STATUSES.has(record.status) && record.effect === 'narrativeEdge') || null;
  const pendingCohesionRelief = [...spends].reverse().find((record) => PENDING_STATUSES.has(record.status) && record.effect === 'cohesionRelief') || null;
  const latestSpend = [...spends].reverse().find((record) => new Set(['committed', 'refunded']).has(record.status)) || null;
  return {
    kind: V1_COMMAND_BEARING_PLAYER_PROJECTION_KIND,
    balance: bearing.balance,
    capacity: bearing.capacity,
    latestAwardReason: latestAward?.reason || null,
    pendingEdge: pendingEdge ? {
      id: pendingEdge.id,
      status: pendingEdge.status,
      reason: pendingEdge.reason
    } : null,
    pendingCohesionRelief: pendingCohesionRelief ? {
      id: pendingCohesionRelief.id,
      status: pendingCohesionRelief.status,
      reason: pendingCohesionRelief.reason,
      targetIssueId: pendingCohesionRelief.targetIssueId,
      cohesion: pendingCohesionRelief.cohesion,
    } : null,
    latestSpend: latestSpend ? {
      id: latestSpend.id,
      effect: latestSpend.effect,
      status: latestSpend.status,
      reason: latestSpend.reason
    } : null
  };
}

export function pendingV1CommandBearingEdge(commandBearing) {
  const bearing = requireValid(commandBearing);
  return cloneJson(pendingRecord(bearing));
}

function lineageMessageMap(messages = []) {
  return new Map((Array.isArray(messages) ? messages : []).map((message) => {
    const id = compact(message?.hostMessageId ?? message?.id, 180);
    const text = String(message?.text ?? message?.mes ?? message?.content ?? '');
    const textHash = compact(message?.textHash, 80) || (() => {
      let high = 0x811c9dc5;
      let low = 0x01000193;
      const stable = JSON.stringify({ text });
      const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(stable) : Buffer.from(stable, 'utf8');
      for (const byte of bytes) {
        high = Math.imul(high ^ byte, 0x01000193);
        low = Math.imul(low ^ byte, 0x85ebca6b);
      }
      return `${(high >>> 0).toString(16).padStart(8, '0')}${(low >>> 0).toString(16).padStart(8, '0')}`;
    })();
    return [id, { id, textHash }];
  }).filter(([id]) => id));
}

export function rebuildV1CommandBearingForLineage(commandBearing, {
  retainedMessages = [],
  completedObjectiveIds = [],
  now = null
} = {}) {
  const source = requireValid(commandBearing);
  const retained = lineageMessageMap(retainedMessages);
  const completed = new Set((Array.isArray(completedObjectiveIds) ? completedObjectiveIds : []).map((id) => compact(id, 160)));
  const rebuilt = createV1CommandBearing({ capacity: source.capacity });
  rebuilt.awards = Object.fromEntries(Object.entries(source.awards).filter(([, award]) => completed.has(award.sourceId)));
  rebuilt.spends = cloneJson(source.spends);
  const rebuiltAt = timestamp(now);

  for (const spend of Object.values(rebuilt.spends)) {
    let survives = spend.status === 'refunded';
    if (spend.status === 'armed') {
      survives = retained.has(compact(spend.armedByPlayerMessageId, 180));
    } else if (spend.status === 'committed') {
      const assistant = retained.get(compact(spend.assistantMessageId, 180));
      survives = retained.has(compact(spend.armedByPlayerMessageId, 180))
        && retained.has(compact(spend.acceptedByPlayerMessageId, 180))
        && Boolean(assistant)
        && assistant.textHash === compact(spend.assistantTextHash, 80);
    }
    if (spend.status === 'reserved' || !survives) {
      spend.status = 'refunded';
      spend.refundReason = 'The Command Bearing source is not part of the retained timeline.';
      spend.refundedAt = rebuiltAt;
    }
  }

  const events = [];
  for (const award of Object.values(rebuilt.awards)) {
    events.push({ at: award.recordedAt, order: 1, type: 'award', record: award });
  }
  for (const spend of Object.values(rebuilt.spends)) {
    events.push({ at: spend.reservedAt, order: 2, type: 'reserve', record: spend });
    if (spend.status === 'refunded') {
      events.push({ at: spend.refundedAt, order: 3, type: 'refund', record: spend });
    }
  }
  events.sort((left, right) => String(left.at).localeCompare(String(right.at)) || left.order - right.order || left.record.id.localeCompare(right.record.id));
  let balance = 0;
  for (const event of events) {
    if (event.type === 'award') {
      event.record.credited = balance < rebuilt.capacity;
      if (event.record.credited) balance += 1;
    } else if (event.type === 'reserve') {
      balance = Math.max(0, balance - 1);
    } else {
      balance = Math.min(rebuilt.capacity, balance + 1);
    }
  }
  rebuilt.balance = balance;
  return requireValid(rebuilt);
}
