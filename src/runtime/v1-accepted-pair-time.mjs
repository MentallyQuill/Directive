import { adjudicateTimeAdvance } from '../time/time-advance-adjudicator.mjs';

const DAY_MINUTES = 1440;
const LEDGER_LIMIT = 128;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value ?? '').trim();
}

function stableHash(value = '') {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sourceAnchorRange(snapshot = {}) {
  return {
    kind: 'acceptedPair',
    previousAssistantHostMessageId: compact(snapshot?.source?.previousAssistant?.hostMessageId) || null,
    currentPlayerHostMessageId: compact(snapshot?.source?.currentPlayer?.hostMessageId) || null,
    rangeHash: compact(snapshot?.source?.sourceRangeHash) || null
  };
}

function sameAnchor(left = {}, right = {}) {
  return Boolean(
    left.rangeHash && left.rangeHash === right.rangeHash
    && left.previousAssistantHostMessageId === right.previousAssistantHostMessageId
    && left.currentPlayerHostMessageId === right.currentPlayerHostMessageId
  );
}

function existingBoundary(state, anchor) {
  return (state?.timeLedger?.entries || []).find((entry) => sameAnchor(entry.sourceAnchorRange, anchor)) || null;
}

function safeProposal(value = {}) {
  const elapsedMinutes = Number(value.elapsedMinutes);
  return {
    elapsedMinutes: Number.isFinite(elapsedMinutes) ? Math.max(0, Math.round(elapsedMinutes)) : 0,
    reason: compact(value.reason).slice(0, 180) || 'accepted-scene-time',
    confidence: Number.isFinite(Number(value.confidence))
      ? Math.max(0, Math.min(1, Number(value.confidence)))
      : null,
    source: compact(value.source).slice(0, 120) || 'timeAdvanceAdjudicator'
  };
}

function formatShipTime(minuteOfDay) {
  const minute = ((Math.round(minuteOfDay) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}${String(minute % 60).padStart(2, '0')} hours`;
}

function formatStardate(value) {
  return Number(value).toFixed(1).padStart(7, '0');
}

function header(stardate, minuteOfDay) {
  return `*Stardate ${formatStardate(stardate)} | ${formatShipTime(minuteOfDay)}*`;
}

function unavailable(campaignState, reasonCode) {
  return { ok: false, status: 'unavailable', reasonCode, campaignState, proposal: null, boundary: null };
}

export async function commitV1AcceptedPairTimeAdvance({
  campaignState = null,
  snapshot = null,
  packageData = null,
  generationRouter = null,
  stateDeltaGateway = null,
  adjudicate = adjudicateTimeAdvance,
  ingressId = null,
  now = null
} = {}) {
  if (!campaignState
    || campaignState.worldState?.kind !== 'directive.worldState.v1'
    || campaignState.timeLedger?.kind !== 'directive.timeLedger.v1'
    || !snapshot
    || !packageData?.world
    || typeof stateDeltaGateway?.commit !== 'function') {
    return unavailable(campaignState, 'time-custody-unavailable');
  }
  const anchor = sourceAnchorRange(snapshot);
  if (!anchor.previousAssistantHostMessageId || !anchor.currentPlayerHostMessageId || !anchor.rangeHash) {
    return unavailable(campaignState, 'source-anchor-incomplete');
  }
  const committedBoundary = existingBoundary(campaignState, anchor);
  if (committedBoundary) {
    return {
      ok: true,
      status: 'already-committed',
      reasonCode: null,
      campaignState,
      proposal: null,
      boundary: clone(committedBoundary)
    };
  }

  let proposed;
  try {
    proposed = await adjudicate({
      campaignState,
      packageData,
      generationRouter,
      acceptedPreviousResponse: true,
      previousAssistantText: String(snapshot.source.previousAssistant.text || ''),
      currentPlayerText: String(snapshot.source.currentPlayer.text || ''),
      previousAssistantHostMessageId: anchor.previousAssistantHostMessageId,
      currentPlayerHostMessageId: anchor.currentPlayerHostMessageId,
      sourceAnchorRange: anchor
    });
  } catch {
    return unavailable(campaignState, 'time-adjudication-failed');
  }
  const proposal = safeProposal(proposed);
  if (proposal.elapsedMinutes <= 0) {
    return { ok: true, status: 'no-change', reasonCode: null, campaignState, proposal, boundary: null };
  }

  const previousElapsed = Number(campaignState.timeLedger.elapsedMinutes || 0);
  const nextElapsed = previousElapsed + proposal.elapsedMinutes;
  const openingMinute = Number(campaignState.timeLedger.openingMinuteOfDay || 0);
  const previousMinute = ((openingMinute + previousElapsed) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES;
  const nextMinute = ((openingMinute + nextElapsed) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES;
  const previousStardate = Number(campaignState.worldState.currentStardate);
  const stardatePerDay = Number(packageData.world?.layout?.stardatePerDay ?? 1);
  const nextStardate = Number((previousStardate + (proposal.elapsedMinutes / DAY_MINUTES) * stardatePerDay).toFixed(3));
  const boundaryId = `v1-time.${stableHash(`${anchor.previousAssistantHostMessageId}|${anchor.currentPlayerHostMessageId}|${anchor.rangeHash}`)}`;
  const timestamp = typeof now === 'function' ? now() : (now || new Date().toISOString());
  const boundary = {
    id: boundaryId,
    kind: 'directive.timeBoundary.v1',
    elapsedMinutes: proposal.elapsedMinutes,
    reason: proposal.reason,
    confidence: proposal.confidence,
    source: proposal.source,
    previousStardate,
    currentStardate: nextStardate,
    previousShipMinute: previousMinute,
    currentShipMinute: nextMinute,
    previousHeader: header(previousStardate, previousMinute),
    currentHeader: header(nextStardate, nextMinute),
    sourceAnchorRange: anchor,
    evidenceMessageIds: [anchor.previousAssistantHostMessageId, anchor.currentPlayerHostMessageId],
    committedAt: timestamp
  };
  const next = clone(campaignState);
  next.campaign.currentStardate = nextStardate;
  next.worldState = {
    ...next.worldState,
    currentStardate: nextStardate,
    elapsedMinutes: nextElapsed
  };
  next.timeLedger = {
    kind: 'directive.timeLedger.v1',
    version: 1,
    openingMinuteOfDay: openingMinute,
    elapsedMinutes: nextElapsed,
    stardate: nextStardate,
    shipClock: { minuteOfDay: nextMinute, display: formatShipTime(nextMinute) },
    entries: [...(next.timeLedger.entries || []), boundary].slice(-LEDGER_LIMIT),
    updatedAt: timestamp
  };
  const committed = await stateDeltaGateway.commit(next, {
    id: `${boundaryId}:commit`,
    source: 'v1AcceptedPairTimeCustody',
    domains: ['campaign', 'worldState', 'timeLedger'],
    ingressId,
    sourceAnchorRange: anchor
  });
  return {
    ok: true,
    status: 'committed',
    reasonCode: null,
    campaignState: committed,
    proposal,
    boundary: clone(boundary)
  };
}

export async function invalidateV1AcceptedPairTimeByHostMessage({
  campaignState,
  hostMessageId,
  packageData,
  stateDeltaGateway,
  now = null,
  eventType = 'source-invalidated'
} = {}) {
  return invalidateV1AcceptedPairTimeByHostMessages({
    campaignState,
    hostMessageIds: [hostMessageId],
    packageData,
    stateDeltaGateway,
    now,
    eventType
  });
}

export async function invalidateV1AcceptedPairTimeByHostMessages({
  campaignState,
  hostMessageIds = [],
  packageData,
  stateDeltaGateway,
  now = null,
  eventType = 'source-invalidated'
} = {}) {
  const ids = new Set((Array.isArray(hostMessageIds) ? hostMessageIds : []).map(compact).filter(Boolean));
  if (ids.size === 0
    || campaignState?.timeLedger?.kind !== 'directive.timeLedger.v1'
    || typeof stateDeltaGateway?.commit !== 'function') {
    return { ok: false, status: 'unavailable', reasonCode: 'time-invalidation-unavailable' };
  }
  const entries = campaignState.timeLedger.entries || [];
  const retained = entries.filter((entry) => !(entry.evidenceMessageIds || []).some((id) => ids.has(compact(id))));
  if (retained.length === entries.length) {
    return { ok: true, status: 'no-change', invalidatedBoundaryCount: 0, campaignState };
  }
  const elapsedMinutes = retained.reduce((total, entry) => total + Math.max(0, Number(entry.elapsedMinutes) || 0), 0);
  const openingMinute = Number(campaignState.timeLedger.openingMinuteOfDay || 0);
  const minuteOfDay = ((openingMinute + elapsedMinutes) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES;
  const openingStardate = Number(campaignState.campaign.openingStardate);
  const stardatePerDay = Number(packageData?.world?.layout?.stardatePerDay ?? 1);
  const stardate = Number((openingStardate + (elapsedMinutes / DAY_MINUTES) * stardatePerDay).toFixed(3));
  const timestamp = typeof now === 'function' ? now() : (now || new Date().toISOString());
  const next = clone(campaignState);
  next.campaign.currentStardate = stardate;
  next.worldState = { ...next.worldState, currentStardate: stardate, elapsedMinutes };
  next.timeLedger = {
    ...next.timeLedger,
    elapsedMinutes,
    stardate,
    shipClock: { minuteOfDay, display: formatShipTime(minuteOfDay) },
    entries: retained,
    updatedAt: timestamp
  };
  const committed = await stateDeltaGateway.commit(next, {
    id: `v1-time-invalidate.${stableHash(`${[...ids].sort().join('|')}|${eventType}|${entries.length}`)}`,
    source: 'v1AcceptedPairTimeCustody',
    domains: ['campaign', 'worldState', 'timeLedger']
  });
  return {
    ok: true,
    status: 'invalidated',
    invalidatedBoundaryCount: entries.length - retained.length,
    campaignState: committed
  };
}
