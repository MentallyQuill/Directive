function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compactText(value, maxLength = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function sourceFor(summary, revision) {
  const campaign = summary?.campaignState || {};
  return {
    kind: 'lumiverseRuntimeSummary',
    id: campaign.id || summary?.activeSaveId || 'directive-runtime',
    revision: Number.isFinite(Number(revision)) ? Number(revision) : null
  };
}

function summarizeOutcome(outcome) {
  if (!isObject(outcome)) {
    return null;
  }
  return {
    resultBand: outcome.resultBand || null,
    summary: compactText(outcome.summary || ''),
    warningCount: Number(outcome.warningCount || 0)
  };
}

function recentCommandLogEntries(summary, limit = 3) {
  const entries = summary?.campaignState?.commandLog?.entries;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.slice(-limit).map((entry) => ({
    type: entry.type || null,
    stardate: entry.stardate || null,
    summary: compactText(entry.summary || ''),
    visibleConsequences: (entry.visibleConsequences || []).map((item) => compactText(item, 220)).slice(0, 4)
  }));
}

function createActiveSituationBlock(summary, revision) {
  const campaign = summary?.campaignState || {};
  return {
    id: 'lumiverse-active-situation',
    title: 'Active Situation',
    audience: 'playerSafe',
    priority: 10,
    source: sourceFor(summary, revision),
    content: {
      campaignTitle: campaign.title || null,
      playerName: campaign.playerName || null,
      shipName: campaign.shipName || null,
      stardate: campaign.stardate || null,
      activeMissionGraphId: campaign.activeMissionGraphId || null,
      activePhaseId: campaign.activePhaseId || null,
      simulationMode: campaign.simulationMode || null,
      activeSaveId: summary.activeSaveId || null,
      commandLogCount: Number(campaign.commandLog?.count || 0),
      visiblePressureCount: Number(campaign.visiblePressureCount || 0),
      pendingOutcome: summarizeOutcome(summary.pendingOutcome),
      lastOutcome: summarizeOutcome(summary.lastOutcome),
      narrationStatus: summary.lastNarration?.ok
        ? 'last narration generated'
        : summary.lastNarration?.error
          ? 'last narration failed'
          : 'no narration yet'
    },
    safety: {
      rawHiddenValuesExposed: false,
      directorOnlyDataIncluded: false,
      playerVisible: true
    }
  };
}

function createCommandLogBlock(summary, revision) {
  const entries = recentCommandLogEntries(summary);
  if (entries.length === 0) {
    return null;
  }
  return {
    id: 'lumiverse-command-log-continuity',
    title: 'Command Log Continuity',
    audience: 'narratorSafe',
    priority: 20,
    source: sourceFor(summary, revision),
    content: {
      recentEntries: entries
    },
    safety: {
      rawHiddenValuesExposed: false,
      directorOnlyDataIncluded: false,
      playerVisible: true
    }
  };
}

function createCrewAndShipBlock(summary, revision) {
  return {
    id: 'lumiverse-crew-and-ship',
    title: 'Crew And Ship Context',
    audience: 'playerSafe',
    priority: 30,
    source: sourceFor(summary, revision),
    content: {
      ship: {
        name: summary.ship?.name || null,
        class: summary.ship?.class || null,
        registry: summary.ship?.registry || null,
        condition: summary.ship?.condition || null,
        activeRestrictions: cloneJson(summary.ship?.activeRestrictions || []),
        technicalDebt: cloneJson(summary.ship?.technicalDebt || [])
      },
      crew: {
        seniorCount: Number(summary.crew?.seniorCount || 0),
        seniorCrew: (summary.crew?.seniorCrew || []).map((crew) => ({
          name: crew.name || crew.id || null,
          rank: crew.rank || null,
          billet: crew.billet || null,
          role: crew.role || null,
          continuity: crew.continuity || null
        })),
        relationshipValues: 'not included'
      }
    },
    safety: {
      rawHiddenValuesExposed: false,
      directorOnlyDataIncluded: false,
      playerVisible: true
    }
  };
}

export function createLumiversePromptBlocksFromRuntimeSummary(summary, {
  revision = null
} = {}) {
  if (!isObject(summary) || summary.initialized !== true || !isObject(summary.campaignState)) {
    return [];
  }
  return [
    createActiveSituationBlock(summary, revision),
    createCommandLogBlock(summary, revision),
    createCrewAndShipBlock(summary, revision)
  ].filter(Boolean);
}
