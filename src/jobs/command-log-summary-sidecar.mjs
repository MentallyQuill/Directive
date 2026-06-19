import { runHostSidecarJobs } from './host-sidecar-orchestrator.mjs';

export const COMMAND_LOG_SUMMARY_SIDECAR_TYPE = 'commandLogSummary';
export const COMMAND_LOG_SUMMARY_ROLE_ID = 'commandLogSummarizer';

const LOW_COST_SUMMARY_PARAMETERS = Object.freeze({
  temperature: 0.2,
  max_tokens: 220
});

const SUMMARY_MODEL_PREFERENCES = Object.freeze({
  cost: 'low',
  latency: 'fast',
  capability: 'utility'
});

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function compactText(value, maxLength = 700) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function compactList(values = [], maxItems = 6, maxLength = 240) {
  return (Array.isArray(values) ? values : [])
    .map((value) => compactText(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function latestCommandLogEntryForOutcome(campaignState, outcomeId) {
  const entries = Array.isArray(campaignState?.commandLog?.entries)
    ? campaignState.commandLog.entries
    : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.sourceOutcomeId === outcomeId) {
      return entries[index];
    }
  }
  return null;
}

function commandLogEntryIndexForOutcome(campaignState, outcomeId) {
  const entries = Array.isArray(campaignState?.commandLog?.entries)
    ? campaignState.commandLog.entries
    : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.sourceOutcomeId === outcomeId) {
      return index;
    }
  }
  return -1;
}

function createPlayerSafeSnapshot({ campaignState, turnPacket }) {
  const outcome = turnPacket?.outcomePacket || {};
  const entry = latestCommandLogEntryForOutcome(campaignState, outcome.id)
    || turnPacket?.commandLogPacket
    || {};
  return {
    campaign: {
      id: campaignState?.campaign?.id || null,
      title: campaignState?.campaign?.title || null,
      stardate: campaignState?.campaign?.currentStardate
        ?? campaignState?.campaign?.openingStardate
        ?? null,
      simulationMode: campaignState?.settings?.simulationMode || null
    },
    mission: {
      activeMissionId: campaignState?.mission?.activeMissionId || null,
      activeMissionGraphId: campaignState?.mission?.activeMissionGraphId || null,
      activePhaseId: campaignState?.mission?.activePhaseId || null
    },
    outcome: {
      id: outcome.id || null,
      turnId: turnPacket?.turnId || null,
      resultBand: outcome.resultBand || null,
      summary: compactText(outcome.summary || '')
    },
    commandLogEntry: {
      sourceOutcomeId: entry.sourceOutcomeId || outcome.id || null,
      summaryInputs: compactList(entry.summaryInputs || []),
      visibleConsequences: compactList(entry.visibleConsequences || [], 8)
    },
    safety: {
      playerVisibleOnly: true,
      generatedFromCommittedStateOnly: true,
      hiddenStateIncluded: false,
      mayProposeState: false
    }
  };
}

function createSummaryPrompt(snapshot) {
  return [
    'You are Directive\'s Command Log summarizer sidecar.',
    'Use only the player-visible committed turn snapshot below.',
    'Do not infer hidden facts, director-only causes, raw relationship values, or future unrevealed answers.',
    'Do not propose or mutate game state.',
    'Return JSON only with this shape:',
    '{"sourceOutcomeId":"...","title":"short label","summary":"1-2 concise player-facing sentences","highlights":["optional concise bullet"]}',
    '',
    JSON.stringify(snapshot, null, 2)
  ].join('\n');
}

function createSource({ hostId, campaignState, turnPacket, saveId = null, revision = null }) {
  const outcomeId = requireNonEmptyString(turnPacket?.outcomePacket?.id, 'turnPacket.outcomePacket.id');
  return {
    hostId: hostId || 'directive',
    campaignId: campaignState?.campaign?.id || campaignState?.campaign?.templateCampaignId || null,
    saveId,
    turnId: turnPacket?.turnId || outcomeId,
    outcomeId,
    revision: revision ?? (Array.isArray(campaignState?.turnLedger?.entries)
      ? campaignState.turnLedger.entries.length
      : null)
  };
}

export function buildCommandLogSummarySidecarJob({
  hostId = null,
  campaignState,
  turnPacket,
  saveId = null,
  revision = null
} = {}) {
  requireObject(campaignState, 'campaignState');
  requireObject(turnPacket, 'turnPacket');
  const source = createSource({
    hostId,
    campaignState,
    turnPacket,
    saveId,
    revision
  });
  const snapshot = createPlayerSafeSnapshot({
    campaignState,
    turnPacket
  });
  return {
    id: `command-log-summary-${source.outcomeId}`,
    type: COMMAND_LOG_SUMMARY_SIDECAR_TYPE,
    roleId: COMMAND_LOG_SUMMARY_ROLE_ID,
    source,
    snapshot,
    request: {
      prompt: createSummaryPrompt(snapshot),
      messages: [
        {
          role: 'system',
          content: 'Return compact player-facing JSON for a Command Log entry. Use only supplied visible committed-state inputs.'
        },
        {
          role: 'user',
          content: createSummaryPrompt(snapshot)
        }
      ],
      parameters: cloneJson(LOW_COST_SUMMARY_PARAMETERS),
      modelPreferences: cloneJson(SUMMARY_MODEL_PREFERENCES)
    },
    policy: {
      blocking: false,
      timeoutMs: 8000,
      cancelOnChatSwitch: true,
      mayProposeState: false,
      mayInjectPrompt: false
    }
  };
}

function parsePacket(packet) {
  if (typeof packet === 'string') {
    const text = packet.trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {
        summary: text
      };
    }
  }
  return isObject(packet) ? cloneJson(packet) : {};
}

function normalizeHighlights(values = []) {
  return compactList(values, 4, 180);
}

function normalizeGeneratedSummary({
  result,
  outcomeId,
  now = null
}) {
  const packet = parsePacket(result.packet);
  const generatedOutcomeId = packet.sourceOutcomeId || outcomeId;
  if (generatedOutcomeId !== outcomeId) {
    return {
      kind: 'directive.commandLogAssistedSummary',
      status: 'failed',
      attemptedAt: timestamp(now),
      sourceOutcomeId: outcomeId,
      roleId: result.roleId || COMMAND_LOG_SUMMARY_ROLE_ID,
      error: {
        code: 'DIRECTIVE_COMMAND_LOG_SUMMARY_SOURCE_MISMATCH',
        message: `Generated summary source "${generatedOutcomeId}" does not match outcome "${outcomeId}".`
      },
      diagnostics: cloneJson(result.diagnostics || {})
    };
  }

  const summary = compactText(packet.summary || packet.text || packet.playerVisibleSummary || result.playerVisibleSummary || '');
  if (!summary) {
    return {
      kind: 'directive.commandLogAssistedSummary',
      status: 'failed',
      attemptedAt: timestamp(now),
      sourceOutcomeId: outcomeId,
      roleId: result.roleId || COMMAND_LOG_SUMMARY_ROLE_ID,
      error: {
        code: 'DIRECTIVE_COMMAND_LOG_SUMMARY_EMPTY',
        message: 'Command Log summary sidecar returned no summary text.'
      },
      diagnostics: cloneJson(result.diagnostics || {})
    };
  }

  return {
    kind: 'directive.commandLogAssistedSummary',
    status: 'complete',
    sourceOutcomeId: outcomeId,
    generatedAt: timestamp(now),
    roleId: result.roleId || COMMAND_LOG_SUMMARY_ROLE_ID,
    providerId: result.diagnostics?.providerId || null,
    model: result.diagnostics?.model || null,
    title: compactText(packet.title || 'Command Log Summary', 80),
    summary,
    highlights: normalizeHighlights(packet.highlights || packet.visibleConsequences || []),
    safety: {
      generatedFromCommittedStateOnly: true,
      hiddenStateIncluded: false,
      mayProposeState: false
    },
    diagnostics: cloneJson({
      latencyMs: result.diagnostics?.latencyMs ?? null,
      usage: result.diagnostics?.usage || null
    })
  };
}

function failedAssistedSummary({ result, outcomeId, now = null }) {
  return {
    kind: 'directive.commandLogAssistedSummary',
    status: result.status || 'failed',
    sourceOutcomeId: outcomeId,
    attemptedAt: timestamp(now),
    roleId: result.roleId || COMMAND_LOG_SUMMARY_ROLE_ID,
    error: result.error ? cloneJson(result.error) : {
      code: 'DIRECTIVE_COMMAND_LOG_SUMMARY_FAILED',
      message: 'Command Log summary sidecar failed.'
    },
    diagnostics: cloneJson(result.diagnostics || {})
  };
}

export function applyCommandLogSummarySidecarResult({
  campaignState,
  result,
  now = null
} = {}) {
  requireObject(campaignState, 'campaignState');
  requireObject(result, 'result');
  const outcomeId = requireNonEmptyString(result.source?.outcomeId || result.source?.turnId, 'result.source.outcomeId');
  const index = commandLogEntryIndexForOutcome(campaignState, outcomeId);
  if (index < 0) {
    return {
      applied: false,
      reason: `No Command Log entry found for outcome "${outcomeId}".`,
      campaignState: cloneJson(campaignState)
    };
  }
  if (result.status === 'stale') {
    return {
      applied: false,
      reason: 'Command Log summary sidecar result is stale.',
      campaignState: cloneJson(campaignState)
    };
  }

  const nextState = cloneJson(campaignState);
  const entry = nextState.commandLog.entries[index];
  entry.assistedSummary = result.status === 'complete'
    ? normalizeGeneratedSummary({
        result,
        outcomeId,
        now
      })
    : failedAssistedSummary({
        result,
        outcomeId,
        now
      });
  nextState.commandLog.summariesGeneratedFromCommittedStateOnly = true;
  return {
    applied: true,
    assistedSummary: cloneJson(entry.assistedSummary),
    campaignState: nextState
  };
}

export async function runCommandLogSummarySidecar({
  host,
  campaignState,
  turnPacket,
  saveId = null,
  revision = null,
  now = null,
  onProgress = null
} = {}) {
  requireObject(host, 'host');
  const job = buildCommandLogSummarySidecarJob({
    hostId: host.id,
    campaignState,
    turnPacket,
    saveId,
    revision
  });
  const batchResult = await runHostSidecarJobs({
    host,
    jobs: [job],
    current: job.source,
    now,
    onProgress
  });
  const sidecarResult = batchResult.results[0];
  const applied = applyCommandLogSummarySidecarResult({
    campaignState,
    result: sidecarResult,
    now
  });
  return {
    kind: 'directive.commandLogSummarySidecarResult',
    batchResult,
    sidecarResult,
    applied: applied.applied,
    reason: applied.reason || null,
    assistedSummary: cloneJson(applied.assistedSummary || null),
    campaignState: cloneJson(applied.campaignState)
  };
}
