import {
  commitTrackedCampaignState,
  initializeCampaignRuntimeTracking
} from './state-delta-gateway.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

const MECHANICS_DOMAINS = Object.freeze([
  'campaign', 'crew', 'ship', 'mission', 'worldState', 'storyArcLedger',
  'questLedger', 'dynamicQuestCatalog', 'knowledgeLedger', 'threadLedger',
  'eventLedger', 'attentionState', 'pressureLedger',
  'relationships', 'commandCulture', 'commandStyle', 'commandCompetence', 'values',
  'directives', 'campaignTracks', 'campaignAssets', 'turnLedger', 'commandLog',
  'captainState'
]);

export function createTurnCommitCoordinator({ persist, now = null } = {}) {
  if (typeof persist !== 'function') {
    throw new Error('TurnCommitCoordinator requires persist(campaignState, summary).');
  }

  async function checkpointMechanics({
    beforeCampaignState,
    campaignState,
    turnPacket,
    ingressId = null
  } = {}) {
    const before = initializeCampaignRuntimeTracking(beforeCampaignState || campaignState);
    const after = initializeCampaignRuntimeTracking(campaignState);
    const outcomeId = turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id;
    if (!outcomeId) throw new Error('Committed turn packet is missing outcome id.');
    const committedAt = timestamp(now);
    after.runtimeTracking.lastCommittedTurn = {
      turnId: turnPacket?.turnId || turnPacket?.id || null,
      outcomeId,
      resultBand: turnPacket?.outcomePacket?.resultBand || turnPacket?.finalOutcome?.resultBand || null,
      narrationStatus: 'pending',
      responseStatus: 'pending',
      committedAt
    };
    const tracked = commitTrackedCampaignState({
      campaignState: before,
      nextCampaignState: after,
      delta: {
        source: 'missionDirector',
        reason: `Deterministic mechanics committed for ${outcomeId}.`,
        summary: 'Mechanics checkpoint committed for the latest campaign turn.',
        domains: MECHANICS_DOMAINS,
        ingressId,
        turnId: turnPacket?.turnId || turnPacket?.id || null,
        outcomeId,
        stable: true
      },
      now
    });
    const save = await persist(tracked, 'Committed mechanics checkpoint for the latest campaign turn.');
    return { campaignState: tracked, save: cloneJson(save), outcomeId };
  }

  async function markNarration({ campaignState, outcomeId, status, error = null } = {}) {
    const next = initializeCampaignRuntimeTracking(campaignState);
    if (next.runtimeTracking.lastCommittedTurn?.outcomeId === outcomeId) {
      next.runtimeTracking.lastCommittedTurn = {
        ...next.runtimeTracking.lastCommittedTurn,
        narrationStatus: status,
        narrationError: error ? cloneJson(error) : null,
        narrationUpdatedAt: timestamp(now)
      };
    }
    const save = await persist(next, `Narration ${status === 'complete' ? 'completed' : status} for the latest committed turn.`);
    return { campaignState: next, save: cloneJson(save) };
  }

  async function markResponse({ campaignState, outcomeId, status, hostMessageId = null, error = null } = {}) {
    const next = initializeCampaignRuntimeTracking(campaignState);
    if (next.runtimeTracking.lastCommittedTurn?.outcomeId === outcomeId) {
      next.runtimeTracking.lastCommittedTurn = {
        ...next.runtimeTracking.lastCommittedTurn,
        responseStatus: status,
        hostMessageId,
        responseError: error ? cloneJson(error) : null,
        responseUpdatedAt: timestamp(now)
      };
    }
    const save = await persist(next, `Campaign response ${status} for the latest committed turn.`);
    return { campaignState: next, save: cloneJson(save) };
  }

  return { checkpointMechanics, markNarration, markResponse };
}
