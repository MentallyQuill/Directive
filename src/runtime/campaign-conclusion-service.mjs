import { createPlayerSafeCampaignProjection } from '../generation/player-safe-prompt-context-builder.mjs';
import { commitTrackedCampaignState } from './state-delta-gateway.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function localConclusion({ campaignState, reason }) {
  const player = campaignState.player || {};
  const ship = campaignState.ship || {};
  const recent = array(campaignState.commandLog?.entries)
    .filter((entry) => entry?.visibility !== 'hidden' && entry?.playerVisible !== false)
    .slice(-5)
    .map((entry) => compact(
      entry.assistedSummary?.text || entry.summary || entry.summaryInputs?.join(' ') || entry.type
    ))
    .filter(Boolean);
  return [
    `${ship.name || 'The ship'} settles into the quiet that follows a completed assignment. The immediate crisis is over, and the consequences of the command decisions made along the way are now part of the record.`,
    '',
    `${player.rank || 'Commander'} ${player.name || ''} closes the final watch as ${player.billet || 'Executive Officer'}. ${compact(reason || 'The campaign has reached its authored conclusion.')}`,
    '',
    recent.length ? `The command log preserves the final through-line: ${recent.join(' ')}` : '',
    '',
    'For this campaign, the story is complete.'
  ].filter(Boolean).join('\n').trim();
}

async function generateConclusion({ campaignState, reason, generationRouter }) {
  const fallback = localConclusion({ campaignState, reason });
  if (!generationRouter?.generate) return fallback;
  const safe = createPlayerSafeCampaignProjection({ campaignState }) || {};
  const result = await generationRouter.generate('campaignConclusion', {
    messages: [
      {
        role: 'system',
        content: 'Write a concise final scene and campaign closure for a Starfleet command story. Do not reveal concealed mechanics.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          reason,
          campaignTitle: safe.campaign?.title || campaignState.campaign?.title || campaignState.campaign?.packageTitle,
          player: safe.player || null,
          ship: safe.ship || null,
          commandBearing: safe.player?.commandBearing || null,
          recentCommandLog: safe.commandLog || []
        })
      }
    ],
    parameters: {
      max_tokens: 1600,
      temperature: 0.7
    }
  });
  return result?.ok && compact(result.response?.text)
    ? result.response.text.trim()
    : fallback;
}

export function createCampaignConclusionService({
  host,
  generationRouter = null,
  getCampaignState,
  setCampaignState,
  persist = null,
  now = null
} = {}) {
  if (typeof getCampaignState !== 'function') throw new Error('getCampaignState must be a function');
  if (typeof setCampaignState !== 'function') throw new Error('setCampaignState must be a function');

  async function persistState(state, summary) {
    setCampaignState(state);
    if (typeof persist === 'function') await persist(state, summary);
    return state;
  }

  function commitConclusionUpdate(current, next, {
    reason,
    summary,
    domains,
    stable = true
  }) {
    return commitTrackedCampaignState({
      campaignState: current,
      nextCampaignState: next,
      delta: {
        source: 'campaignConclusion',
        reason: compact(reason),
        summary,
        domains,
        stable
      },
      now
    });
  }

  async function ensureConclusionMechanics(current, { reason, type, terminalOutcome = null }) {
    const campaignId = current.campaign?.id || 'campaign';
    const conclusionId = current.conclusion?.id || `conclusion:${campaignId}`;
    const completedAt = current.conclusion?.completedAt
      || current.campaign?.completedAt
      || timestamp(now);
    const normalizedReason = compact(current.conclusion?.reason || reason);
    const completionType = current.conclusion?.type || current.campaign?.completionType || type;
    const alreadyCommitted = ['concluding', 'complete'].includes(current.campaign?.status)
      && current.conclusion?.id === conclusionId;
    if (alreadyCommitted) return cloneJson(current);

    const next = cloneJson(current);
    next.campaign = {
      ...next.campaign,
      status: 'concluding',
      conclusionStartedAt: completedAt,
      completionType,
      completionReason: normalizedReason
    };
    next.pressureLedger = {
      ...(next.pressureLedger || {}),
      records: (next.pressureLedger?.records || []).map((record) => (
        record?.status === 'resolved' || record?.status === 'settledAtConclusion'
      )
        ? record
        : {
            ...record,
            status: 'settledAtConclusion',
            settledAt: completedAt
          })
    };
    next.commandLog = next.commandLog || { entries: [] };
    if (!(next.commandLog.entries || []).some((entry) => entry?.id === conclusionId)) {
      next.commandLog.entries = [
        ...(next.commandLog.entries || []),
        {
          id: conclusionId,
          type: 'campaignConclusion',
          stardate: next.campaign.currentStardate,
          summary: normalizedReason,
          summaryInputs: [normalizedReason],
          visibleConsequences: [
            'The campaign closing record is committed.',
            'The final campaign scene and recap are being delivered.'
          ],
          playerVisible: true
        }
      ];
    }
    next.conclusion = {
      ...cloneJson(next.conclusion || {}),
      id: conclusionId,
      type: completionType,
      reason: normalizedReason,
      completedAt,
      recapStatus: next.conclusion?.recapStatus || 'pending',
      recapText: next.conclusion?.recapText || null,
      finalMessageId: next.conclusion?.finalMessageId || null,
      terminalOutcome: terminalOutcome ? cloneJson(terminalOutcome) : cloneJson(next.conclusion?.terminalOutcome || null),
      lastError: null
    };
    if (terminalOutcome?.finalCampaignBand) {
      next.campaign.finalCampaignBand = terminalOutcome.finalCampaignBand;
    }

    const committed = commitConclusionUpdate(current, next, {
      reason: normalizedReason,
      summary: 'Campaign conclusion mechanics committed.',
      domains: ['campaign', 'pressureLedger', 'commandLog', 'conclusion'],
      stable: true
    });
    return persistState(committed, 'Campaign conclusion mechanics committed before final narration.');
  }

  async function ensurePromptCleared(current, reason) {
    if (current.conclusion?.promptClearedAt) return cloneJson(current);
    try {
      await host?.prompt?.clear?.({ reason: 'campaign-complete' });
    } catch (error) {
      const failed = cloneJson(current);
      failed.conclusion = {
        ...failed.conclusion,
        promptClearError: error?.message || String(error),
        promptClearFailedAt: timestamp(now)
      };
      const tracked = commitConclusionUpdate(current, failed, {
        reason,
        summary: 'Campaign completed, but active prompt cleanup failed and remains recoverable.',
        domains: ['conclusion'],
        stable: true
      });
      return persistState(tracked, 'Campaign prompt cleanup failure recorded.');
    }

    const next = cloneJson(current);
    next.conclusion = {
      ...next.conclusion,
      promptClearedAt: timestamp(now),
      promptClearError: null,
      promptClearFailedAt: null
    };
    const tracked = commitConclusionUpdate(current, next, {
      reason,
      summary: 'Active campaign prompt injection cleared at conclusion.',
      domains: ['conclusion'],
      stable: true
    });
    return persistState(tracked, 'Active campaign prompt injection cleared.');
  }

  async function conclude({
    reason = 'The campaign reached its authored endpoint.',
    type = 'authoredCompletion',
    terminalOutcome = null
  } = {}) {
    const initial = getCampaignState();
    if (!initial) throw new Error('No active campaign state is available.');
    if (initial.campaign?.status === 'complete' && initial.conclusion?.recapStatus === 'complete') {
      const cleaned = await ensurePromptCleared(
        initial,
        initial.conclusion?.reason || initial.campaign?.completionReason || compact(reason)
      );
      return {
        ok: true,
        duplicate: true,
        text: cleaned.conclusion?.recapText || null,
        campaignState: cloneJson(cleaned)
      };
    }

    let committed = await ensureConclusionMechanics(initial, { reason, type, terminalOutcome });
    const conclusionId = committed.conclusion?.id || `conclusion:${committed.campaign?.id || 'campaign'}`;
    const normalizedReason = committed.conclusion?.reason || compact(reason);
    let text = compact(committed.conclusion?.recapText) || null;

    try {
      if (!text) {
        text = await generateConclusion({
          campaignState: committed,
          reason: normalizedReason,
          generationRouter
        });
        const withRecap = cloneJson(committed);
        withRecap.conclusion = {
          ...withRecap.conclusion,
          recapStatus: 'readyToPost',
          recapText: text,
          lastError: null
        };
        committed = commitConclusionUpdate(committed, withRecap, {
          reason: normalizedReason,
          summary: 'Campaign conclusion narration generated and awaits posting.',
          domains: ['conclusion'],
          stable: true
        });
        await persistState(committed, 'Campaign conclusion narration checkpoint saved before chat posting.');
      }

      if (typeof host?.chat?.postAssistantMessage !== 'function') {
        throw new Error('The host chat adapter cannot post the campaign conclusion message.');
      }
      const posted = await host.chat.postAssistantMessage({
        text,
        campaignId: committed.campaign?.id,
        responseKind: 'campaignConclusion',
        idempotencyKey: `${conclusionId}:message`
      });
      const finalized = cloneJson(committed);
      finalized.conclusion = {
        ...finalized.conclusion,
        recapStatus: 'complete',
        recapText: text,
        finalMessageId: posted?.hostMessageId || finalized.conclusion?.finalMessageId || null,
        lastError: null,
        finalizedAt: timestamp(now)
      };
      finalized.campaign = {
        ...finalized.campaign,
        status: 'complete',
        completedAt: finalized.conclusion.finalizedAt,
        conclusionStartedAt: finalized.campaign?.conclusionStartedAt || committed.conclusion?.completedAt || finalized.conclusion.finalizedAt
      };
      committed = commitConclusionUpdate(committed, finalized, {
        reason: normalizedReason,
        summary: 'Campaign conclusion message posted and final record completed.',
        domains: ['campaign', 'conclusion'],
        stable: true
      });
      await persistState(committed, 'Campaign conclusion and recap saved.');
      committed = await ensurePromptCleared(committed, normalizedReason);
      return {
        ok: true,
        duplicate: posted?.duplicate === true,
        text,
        posted: cloneJson(posted || null),
        promptCleared: Boolean(committed.conclusion?.promptClearedAt),
        campaignState: cloneJson(committed)
      };
    } catch (error) {
      const failed = cloneJson(committed);
      failed.conclusion = {
        ...failed.conclusion,
        recapStatus: 'failed',
        recapText: text || failed.conclusion?.recapText || null,
        lastError: error?.message || String(error),
        failedAt: timestamp(now)
      };
      const failedState = commitConclusionUpdate(committed, failed, {
        reason: normalizedReason,
        summary: 'Campaign conclusion narration or posting failed after mechanics committed.',
        domains: ['conclusion'],
        stable: true
      });
      await persistState(failedState, 'Campaign conclusion failure checkpoint saved; retry will reuse committed mechanics.');
      error.campaignState = cloneJson(failedState);
      error.code = error.code || 'DIRECTIVE_CONCLUSION_FINALIZATION_FAILED';
      throw error;
    }
  }

  return {
    conclude
  };
}

export const __campaignConclusionServiceTestHooks = Object.freeze({
  localConclusion,
  generateConclusion
});
