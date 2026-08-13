import { formatShipTimeFooter } from '../time/ship-time.mjs';

const DAY_SECONDS = 86400;
const LEDGER_LIMIT = 128;
const MAX_TIME_ADVANCE_SECONDS = 31 * DAY_SECONDS;

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

function existingDecision(state, anchor) {
  return (state?.timeLedger?.decisions || []).find((entry) => sameAnchor(entry.sourceAnchorRange, anchor)) || null;
}

function boundaryAnchor(boundary = {}) {
  return boundary?.sourceAnchorRange
    || boundary?.adjudication?.sourceAnchorRange
    || boundary?.metadata?.sourceAnchorRange
    || null;
}

function timeBoundaries(campaignState = {}) {
  const ledger = campaignState?.timeLedger || {};
  return [
    ...(Array.isArray(ledger.entries) ? ledger.entries : []),
    ledger.lastBoundary
  ].filter((boundary) => boundary && boundaryElapsedSeconds(boundary) > 0);
}

function boundaryElapsedSeconds(boundary = {}) {
  const seconds = Number(boundary?.elapsedSeconds);
  if (Number.isInteger(seconds) && seconds >= 0) return seconds;
  const minutes = Number(boundary?.elapsedMinutes);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes * 60) : 0;
}

function ledgerElapsedSeconds(ledger = {}) {
  const seconds = Number(ledger?.elapsedSeconds);
  if (Number.isInteger(seconds) && seconds >= 0) return seconds;
  const minutes = Number(ledger?.elapsedMinutes);
  return Number.isInteger(minutes) && minutes >= 0 ? minutes * 60 : 0;
}

function retainedBoundarySeconds(ledger = {}) {
  return (Array.isArray(ledger.entries) ? ledger.entries : [])
    .reduce((total, entry) => total + boundaryElapsedSeconds(entry), 0);
}

function prunedElapsedSeconds(ledger = {}) {
  const explicit = Number(ledger.prunedElapsedSeconds);
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;
  return Math.max(0, ledgerElapsedSeconds(ledger) - retainedBoundarySeconds(ledger));
}

export function findTimeBoundaryForSourceAnchorRange(campaignState = {}, sourceAnchorRange = null) {
  if (!sourceAnchorRange) return null;
  return timeBoundaries(campaignState).find((boundary) => {
    const anchor = boundaryAnchor(boundary);
    return Boolean(
      anchor
      && compact(anchor.previousAssistantHostMessageId) === compact(sourceAnchorRange.previousAssistantHostMessageId)
      && compact(anchor.currentPlayerHostMessageId) === compact(sourceAnchorRange.currentPlayerHostMessageId)
      && compact(anchor.rangeHash) === compact(sourceAnchorRange.rangeHash)
    );
  }) || null;
}

export function findTimeBoundaryForPlayerMessage(campaignState = {}, hostMessageId = null) {
  const id = compact(hostMessageId);
  if (!id) return null;
  return timeBoundaries(campaignState).find((boundary) => (
    compact(boundaryAnchor(boundary)?.currentPlayerHostMessageId) === id
  )) || null;
}

function safeProposal(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const decision = compact(value.decision);
  const elapsedSeconds = Number(value.elapsedSeconds);
  const validAdvance = decision === 'advance'
    && Number.isInteger(elapsedSeconds)
    && elapsedSeconds > 0
    && elapsedSeconds <= MAX_TIME_ADVANCE_SECONDS;
  const validZero = new Set(['unchanged', 'indeterminate']).has(decision)
    && elapsedSeconds === 0;
  return {
    valid: validAdvance || validZero,
    decision: validAdvance ? 'advance' : (decision === 'unchanged' ? 'unchanged' : 'indeterminate'),
    elapsedSeconds: validAdvance ? elapsedSeconds : 0,
    reason: compact(value.reason).slice(0, 180) || 'accepted-scene-time',
    confidence: Number.isFinite(Number(value.confidence))
      ? Math.max(0, Math.min(1, Number(value.confidence)))
      : null,
    source: 'acceptedPairMissionEvidence'
  };
}

function formatShipTime(secondOfDay) {
  const second = ((Math.round(secondOfDay) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  const hour = Math.floor(second / 3600);
  const minute = Math.floor((second % 3600) / 60);
  const remainder = second % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(remainder).padStart(2, '0')} hours`;
}

function unavailable(campaignState, reasonCode) {
  return { ok: false, status: 'unavailable', reasonCode, campaignState, proposal: null, boundary: null };
}

export function prepareV1AcceptedPairTimeAdvance({
  campaignState = null,
  snapshot = null,
  packageData = null,
  timeDecision = null,
  now = null
} = {}) {
  if (!campaignState
    || campaignState.worldState?.kind !== 'directive.worldState.v1'
    || campaignState.timeLedger?.kind !== 'directive.timeLedger.v1'
    || !snapshot
    || !packageData?.world) {
    return unavailable(campaignState, 'time-custody-unavailable');
  }
  const anchor = sourceAnchorRange(snapshot);
  if (!anchor.previousAssistantHostMessageId || !anchor.currentPlayerHostMessageId || !anchor.rangeHash) {
    return unavailable(campaignState, 'source-anchor-incomplete');
  }
  const committedDecision = existingDecision(campaignState, anchor);
  const committedBoundary = existingBoundary(campaignState, anchor);
  if (committedDecision || committedBoundary) {
    return {
      ok: true,
      status: 'already-committed',
      reasonCode: null,
      campaignState,
      proposal: committedDecision ? {
        decision: committedDecision.decision,
        elapsedSeconds: committedDecision.elapsedSeconds,
        reason: committedDecision.reason,
        confidence: committedDecision.confidence,
        source: committedDecision.source
      } : null,
      boundary: clone(committedBoundary),
      decision: clone(committedDecision),
      patch: null,
      domains: []
    };
  }

  const proposal = safeProposal(timeDecision);
  if (!proposal.valid) {
    return {
      ok: true,
      status: 'no-change',
      reasonCode: null,
      campaignState,
      proposal,
      boundary: null,
      decision: null,
      patch: null,
      domains: []
    };
  }

  const previousElapsedSeconds = ledgerElapsedSeconds(campaignState.timeLedger);
  const nextElapsedSeconds = previousElapsedSeconds + proposal.elapsedSeconds;
  const nextElapsedMinutes = Math.floor(nextElapsedSeconds / 60);
  const openingMinute = Number(campaignState.timeLedger.openingMinuteOfDay || 0);
  const openingSecond = openingMinute * 60;
  const previousSecond = ((openingSecond + previousElapsedSeconds) % DAY_SECONDS + DAY_SECONDS) % DAY_SECONDS;
  const nextSecond = ((openingSecond + nextElapsedSeconds) % DAY_SECONDS + DAY_SECONDS) % DAY_SECONDS;
  const previousMinute = Math.floor(previousSecond / 60);
  const nextMinute = Math.floor(nextSecond / 60);
  const previousStardate = Number(campaignState.worldState.currentStardate);
  const openingStardate = Number(campaignState.campaign.openingStardate);
  const stardatePerDay = Number(packageData.world?.layout?.stardatePerDay ?? 1);
  const nextStardate = Number((openingStardate + (nextElapsedSeconds / DAY_SECONDS) * stardatePerDay).toFixed(6));
  const boundaryId = `v1-time.${stableHash(`${anchor.previousAssistantHostMessageId}|${anchor.currentPlayerHostMessageId}|${anchor.rangeHash}`)}`;
  const decisionId = `v1-time-decision.${stableHash(`${anchor.previousAssistantHostMessageId}|${anchor.currentPlayerHostMessageId}|${anchor.rangeHash}`)}`;
  const timestamp = typeof now === 'function' ? now() : (now || new Date().toISOString());
  const boundary = proposal.elapsedSeconds > 0 ? {
    id: boundaryId,
    kind: 'directive.timeBoundary.v1',
    elapsedSeconds: proposal.elapsedSeconds,
    elapsedMinutes: proposal.elapsedSeconds / 60,
    reason: proposal.reason,
    confidence: proposal.confidence,
    source: proposal.source,
    previousStardate,
    currentStardate: nextStardate,
    previousShipSecond: previousSecond,
    currentShipSecond: nextSecond,
    previousShipMinute: previousMinute,
    currentShipMinute: nextMinute,
    previousHeader: formatShipTimeFooter({ stardate: previousStardate, secondOfDay: previousSecond }),
    currentHeader: formatShipTimeFooter({ stardate: nextStardate, secondOfDay: nextSecond }),
    sourceAnchorRange: anchor,
    evidenceMessageIds: [anchor.previousAssistantHostMessageId, anchor.currentPlayerHostMessageId],
    committedAt: timestamp
  } : null;
  const decision = {
    id: decisionId,
    kind: 'directive.timeDecision.v1',
    decision: proposal.decision,
    elapsedSeconds: proposal.elapsedSeconds,
    reason: proposal.reason,
    confidence: proposal.confidence,
    source: proposal.source,
    boundaryId: boundary?.id || null,
    sourceAnchorRange: anchor,
    evidenceMessageIds: [anchor.previousAssistantHostMessageId, anchor.currentPlayerHostMessageId],
    committedAt: timestamp
  };
  const next = clone(campaignState);
  next.campaign.currentStardate = nextStardate;
  next.worldState = {
    ...next.worldState,
    currentStardate: nextStardate,
    elapsedSeconds: nextElapsedSeconds,
    elapsedMinutes: nextElapsedMinutes
  };
  const previousEntries = [...(next.timeLedger.entries || [])];
  const candidateEntries = boundary ? [...previousEntries, boundary] : previousEntries;
  const retainedEntries = candidateEntries.slice(-LEDGER_LIMIT);
  const droppedEntries = candidateEntries.slice(0, candidateEntries.length - retainedEntries.length);
  const nextPrunedElapsedSeconds = prunedElapsedSeconds(next.timeLedger)
    + droppedEntries.reduce((total, entry) => total + boundaryElapsedSeconds(entry), 0);
  next.timeLedger = {
    ...next.timeLedger,
    openingMinuteOfDay: openingMinute,
    elapsedSeconds: nextElapsedSeconds,
    elapsedMinutes: nextElapsedMinutes,
    stardate: nextStardate,
    shipClock: { secondOfDay: nextSecond, minuteOfDay: nextMinute, display: formatShipTime(nextSecond) },
    entries: retainedEntries,
    decisions: [...(next.timeLedger.decisions || []), decision].slice(-LEDGER_LIMIT),
    prunedElapsedSeconds: nextPrunedElapsedSeconds,
    lastBoundary: boundary || next.timeLedger.lastBoundary || null,
    updatedAt: timestamp
  };
  return {
    ok: true,
    status: boundary ? 'planned' : 'recorded',
    reasonCode: null,
    campaignState: clone(campaignState),
    proposal,
    boundary: clone(boundary),
    decision: clone(decision),
    patch: {
      campaign: clone(next.campaign),
      worldState: clone(next.worldState),
      timeLedger: clone(next.timeLedger)
    },
    domains: ['campaign', 'worldState', 'timeLedger'],
    commitId: `${decisionId}:commit`,
    sourceAnchorRange: anchor
  };
}

export async function commitV1AcceptedPairTimeAdvance({
  campaignState = null,
  snapshot = null,
  packageData = null,
  timeDecision = null,
  stateDeltaGateway = null,
  ingressId = null,
  now = null
} = {}) {
  if (typeof stateDeltaGateway?.commit !== 'function') {
    return unavailable(campaignState, 'time-custody-unavailable');
  }
  const prepared = prepareV1AcceptedPairTimeAdvance({
    campaignState,
    snapshot,
    packageData,
    timeDecision,
    now
  });
  if (!prepared.ok || !prepared.patch) return prepared;
  const next = {
    ...clone(campaignState),
    ...clone(prepared.patch)
  };
  const committed = await stateDeltaGateway.commit(next, {
    id: prepared.commitId,
    source: 'v1AcceptedPairTimeCustody',
    domains: prepared.domains,
    ingressId,
    sourceAnchorRange: prepared.sourceAnchorRange
  });
  return {
    ...prepared,
    status: prepared.boundary ? 'committed' : 'recorded',
    campaignState: committed,
    patch: null,
    domains: prepared.domains
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
  const decisions = campaignState.timeLedger.decisions || [];
  const retained = entries.filter((entry) => !(entry.evidenceMessageIds || []).some((id) => ids.has(compact(id))));
  const retainedDecisions = decisions.filter((entry) => !(entry.evidenceMessageIds || []).some((id) => ids.has(compact(id))));
  if (retained.length === entries.length && retainedDecisions.length === decisions.length) {
    return { ok: true, status: 'no-change', invalidatedBoundaryCount: 0, campaignState };
  }
  const elapsedSeconds = prunedElapsedSeconds(campaignState.timeLedger)
    + retained.reduce((total, entry) => total + boundaryElapsedSeconds(entry), 0);
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const openingMinute = Number(campaignState.timeLedger.openingMinuteOfDay || 0);
  const secondOfDay = (((openingMinute * 60) + elapsedSeconds) % DAY_SECONDS + DAY_SECONDS) % DAY_SECONDS;
  const minuteOfDay = Math.floor(secondOfDay / 60);
  const openingStardate = Number(campaignState.campaign.openingStardate);
  const stardatePerDay = Number(packageData?.world?.layout?.stardatePerDay ?? 1);
  const stardate = Number((openingStardate + (elapsedSeconds / DAY_SECONDS) * stardatePerDay).toFixed(6));
  const timestamp = typeof now === 'function' ? now() : (now || new Date().toISOString());
  const next = clone(campaignState);
  next.campaign.currentStardate = stardate;
  next.worldState = { ...next.worldState, currentStardate: stardate, elapsedSeconds, elapsedMinutes };
  next.timeLedger = {
    ...next.timeLedger,
    elapsedSeconds,
    elapsedMinutes,
    stardate,
    shipClock: { secondOfDay, minuteOfDay, display: formatShipTime(secondOfDay) },
    entries: retained,
    decisions: retainedDecisions,
    prunedElapsedSeconds: prunedElapsedSeconds(campaignState.timeLedger),
    lastBoundary: retained.at(-1) || null,
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
    invalidatedDecisionCount: decisions.length - retainedDecisions.length,
    campaignState: committed
  };
}
