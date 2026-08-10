import {
  adjudicateTimeAdvance,
  findTimeBoundaryForPlayerMessage,
  findTimeBoundaryForSourceAnchorRange
} from '../time/time-advance-adjudicator.mjs';
import {
  buildCampaignReplyHeader,
  resolveCampaignMinuteOfDay
} from '../time/campaign-time-header.mjs';
import { appendCampaignTimeLedgerEntry } from '../time/campaign-time-state.mjs';
import { advanceWorldTime } from '../world/world-director.mjs';

function cloneJson(value) {
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

function existingBoundary(campaignState, anchor) {
  return findTimeBoundaryForPlayerMessage(campaignState, anchor.currentPlayerHostMessageId)
    || findTimeBoundaryForSourceAnchorRange(campaignState, anchor)
    || null;
}

function safeProposal(proposal = {}) {
  const elapsedMinutes = Number(proposal?.elapsedMinutes);
  return {
    elapsedMinutes: Number.isFinite(elapsedMinutes) ? Math.max(0, Math.round(elapsedMinutes)) : 0,
    reason: compact(proposal?.reason).slice(0, 180) || 'accepted-scene-time',
    confidence: Number.isFinite(Number(proposal?.confidence))
      ? Math.max(0, Math.min(1, Number(proposal.confidence)))
      : null,
    source: compact(proposal?.source).slice(0, 120) || 'timeAdvanceAdjudicator'
  };
}

function unavailable(campaignState, reasonCode) {
  return {
    ok: false,
    status: 'unavailable',
    reasonCode,
    campaignState,
    proposal: null,
    boundary: null
  };
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
  if (!campaignState || !snapshot || !packageData?.world || typeof stateDeltaGateway?.commit !== 'function') {
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
      boundary: cloneJson(committedBoundary)
    };
  }

  let rawProposal;
  try {
    rawProposal = await adjudicate({
      campaignState,
      packageData,
      generationRouter,
      acceptedPreviousResponse: true,
      playerReplyRelation: null,
      previousAssistantText: String(snapshot.source.previousAssistant.text || ''),
      currentPlayerText: String(snapshot.source.currentPlayer.text || ''),
      previousAssistantHostMessageId: anchor.previousAssistantHostMessageId,
      currentPlayerHostMessageId: anchor.currentPlayerHostMessageId,
      sourceAnchorRange: anchor
    });
  } catch {
    return unavailable(campaignState, 'time-adjudication-failed');
  }
  const proposal = safeProposal(rawProposal);
  if (proposal.elapsedMinutes <= 0) {
    return {
      ok: true,
      status: 'no-change',
      reasonCode: null,
      campaignState,
      proposal,
      boundary: null
    };
  }

  const previousStardate = Number(
    campaignState?.worldState?.currentStardate
    ?? campaignState?.campaign?.currentStardate
    ?? 0
  );
  const previousShipMinute = resolveCampaignMinuteOfDay(campaignState);
  const previousHeader = buildCampaignReplyHeader(campaignState);
  const advanced = advanceWorldTime({
    world: packageData.world,
    worldState: campaignState.worldState,
    minutes: proposal.elapsedMinutes,
    reason: proposal.reason,
    now
  });
  let next = cloneJson(campaignState);
  next.worldState = advanced.worldState;
  next.campaign = {
    ...(next.campaign || {}),
    currentStardate: advanced.worldState.currentStardate
  };
  const boundaryId = `v1-time.${stableHash([
    anchor.previousAssistantHostMessageId,
    anchor.currentPlayerHostMessageId,
    anchor.rangeHash
  ].join('|'))}`;
  next = appendCampaignTimeLedgerEntry(next, {
    id: boundaryId,
    type: 'time-advance',
    reason: proposal.reason,
    elapsedMinutes: proposal.elapsedMinutes,
    previousStardate,
    previousShipMinute,
    previousHeader,
    currentHeader: buildCampaignReplyHeader(next),
    confidence: proposal.confidence,
    source: proposal.source,
    sourceAnchorRange: anchor,
    evidenceMessageIds: [anchor.previousAssistantHostMessageId, anchor.currentPlayerHostMessageId],
    adjudication: proposal,
    sourceEventId: advanced.event.id
  }, { now });
  const committed = await stateDeltaGateway.commit(next, {
    id: `${boundaryId}:commit`,
    source: 'v1AcceptedPairTimeCustody',
    reason: `Accepted scene advanced campaign time by ${proposal.elapsedMinutes} minutes.`,
    summary: `Accepted scene advanced campaign time by ${proposal.elapsedMinutes} minutes.`,
    domains: ['campaign', 'worldState', 'timeLedger'],
    ingressId,
    sourceAnchorRange: anchor,
    stable: true,
    metadata: {
      boundaryId,
      elapsedMinutes: proposal.elapsedMinutes,
      sourceRangeHash: anchor.rangeHash
    }
  });
  const boundary = committed?.timeLedger?.lastBoundary || next.timeLedger.lastBoundary;
  return {
    ok: true,
    status: 'committed',
    reasonCode: null,
    campaignState: committed || next,
    proposal,
    boundary: cloneJson(boundary)
  };
}
